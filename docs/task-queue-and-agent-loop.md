# Task Queue & Agent Loop

How messages flow from WhatsApp to execution and back.

---

## Architecture Overview

```
WhatsApp message
      │
      ▼
┌──────────┐     ┌──────────────────────────────────────────────────────────┐
│TaskQueue │     │ AgentLoop (per task)                                     │
│ (SQLite) │     │                                                          │
│          │     │   ┌─────────┐    ┌────────────┐                          │
│ FIFO     ├────►│   │ Planner ├───►│ ToolRunner │  ◄── iterates            │
│ one task │     │   │ (o3-mini)│◄───┤            │      until done          │
│ at a time│     │   └─────────┘    │ ┌────────┐ │      or max iter         │
│          │◄────┤        result    │ │ shell  │ │                          │
└──────────┘     │        + files   │ │ screen │ │                          │
      │          │                  │ │ mouse  │ │                          │
      ▼          │                  │ │ keybd  │ │                          │
WhatsApp reply   │                  │ │ url    │ │                          │
                 │                  │ │ app    │ │                          │
                 │                  │ └────────┘ │                          │
                 │                  └────────────┘                          │
                 └──────────────────────────────────────────────────────────┘
```

---

## The Task Queue

Every incoming message (text or transcribed audio) becomes a row in SQLite:

```
tasks
┌────┬────────┬─────────┬─────────┬──────────────────┬────────┬────────────┐
│ id │ sender │ message │ status  │ previous_context │ result │ created_at │
└────┴────────┴─────────┴─────────┴──────────────────┴────────┴────────────┘
```

**Key rules:**

- Tasks are processed **FIFO, strictly one at a time** (`processing` flag).
- `previous_context` is resolved **at processing time** — it reads the `result` of the last `done` task. This ensures that when 5 messages arrive at once, each task sees the freshest context from the task that just finished before it.
- On crash recovery, any `running` task is reset to `pending`.

---

## The Agent Loop — A True Iterative Loop

The name "agent loop" is literal. For each task, the agent iterates: **plan one command → execute → observe the result → decide: continue or done?** The planner sees the full conversation history that grows with each iteration, so it always knows what happened before.

```
User message
      │
      ▼
 ┌─────────────────────────────────────────────────────────┐
 │                    ITERATION 1                          │
 │                                                         │
 │  messages = [system, user]                              │
 │                                                         │
 │  Planner ──► { command: "...", done: false }            │
 │       │                                                 │
 │       ▼                                                 │
 │  Executor ──► runs single command ──► result            │
 │       │                                                 │
 │       ▼                                                 │
 │  messages += [assistant(plan), user(result)]            │
 └────────────────────────┬────────────────────────────────┘
                          │
                          ▼
 ┌─────────────────────────────────────────────────────────┐
 │                    ITERATION 2                          │
 │                                                         │
 │  messages = [system, user, assistant, user(result)]     │
 │                                                         │
 │  Planner ──► { command: "...", done: false }            │
 │       │                                                 │
 │       ▼                                                 │
 │  Executor ──► runs single command ──► result            │
 │       │                                                 │
 │       ▼                                                 │
 │  messages += [assistant(plan), user(result)]            │
 └────────────────────────┬────────────────────────────────┘
                          │
                          ▼
 ┌─────────────────────────────────────────────────────────┐
 │                    ITERATION 3                          │
 │                                                         │
 │  messages = [system, user, asst, result, asst, result]  │
 │                                                         │
 │  Planner ──► { command: "", reply: "Zeta: ...",         │
 │               done: true }                              │
 │                                                         │
 │  ✅ Loop exits. Reply sent to WhatsApp.                 │
 └─────────────────────────────────────────────────────────┘
```

### Key design decisions

- **One command per iteration.** Chain dependent steps with `&&` inside the single command string (e.g., `cd /tmp/repo && npm install && npm test`). This guarantees sequential execution and avoids the old parallel-execution race condition.
- **Conversation history grows.** Each iteration appends the plan (as `assistant`) and the command result (as `user`) to the `messages[]` array. The planner always has the full context of what it already tried and what happened.
- **Max iterations cap.** Controlled by `~/.zeta/settings.json` → `maxIterations` (default: 50). If the limit is hit, the system injects a final message asking the planner to summarise what it has. The user can ask the assistant to change this value at runtime.
- **The planner decides when it's done.** It sets `"done": true` when the reply is ready. If `"done": false`, the loop executes the command and feeds the result back.

### Settings file (`~/.zeta/settings.json`)

```json
{
  "maxIterations": 50,
  "commandTimeoutMs": 30000,
  "maxOutputLength": 4000
}
```

| Setting | Default | Description |
|---|---|---|
| `maxIterations` | 50 | Max agent loop iterations per task. Prevents infinite loops. |
| `commandTimeoutMs` | 30000 | Max time (ms) for a single shell command before it's killed. |
| `maxOutputLength` | 4000 | Max characters captured from stdout/stderr per command. |

Created automatically on first run with defaults. The user can ask Zeta to adjust any value via WhatsApp (e.g., "increase command timeout to 60 seconds"). The agent reads the file fresh at the start of each task, so changes take effect on the next task.

---

## Example: "Clone my repo, install dependencies, and run the tests"

This task needs 3 sequential steps. In the old parallel model, it would fail. The iterative loop handles it naturally:

```
User (WhatsApp): "Clone my repo, install deps, and run the tests"
      │
      ▼
━━━ AgentLoop.run() ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─ ITERATION 1 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  messages: [system, user("Clone my repo, install deps, run tests")]   │
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "cd /tmp && git clone https://github.com/user/repo.git",│
  │    "reasoning": "First clone the repo. I'll install and test after.", │
  │    "done": false                                                       │
  │  }                                                                     │
  │                                                                        │
  │  Executor runs → exit 0: "Cloning into 'repo'..."                    │
  │                                                                        │
  │  messages += [assistant(plan), user("✓ git clone...\nCloning...")]    │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ ITERATION 2 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  Planner sees: clone succeeded.                                        │
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "cd /tmp/repo && npm install",                           │
  │    "reasoning": "Clone done. Now install dependencies.",              │
  │    "done": false                                                       │
  │  }                                                                     │
  │                                                                        │
  │  Executor runs → exit 0: "added 312 packages..."                      │
  │                                                                        │
  │  messages += [assistant(plan), user("✓ npm install\nadded 312...")]   │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ ITERATION 3 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  Planner sees: install succeeded.                                      │
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "cd /tmp/repo && npm test",                              │
  │    "reasoning": "Dependencies installed. Now run the tests.",          │
  │    "done": false                                                       │
  │  }                                                                     │
  │                                                                        │
  │  Executor runs → exit 0: "Tests: 42 passed, 0 failed"                │
  │                                                                        │
  │  messages += [assistant(plan), user("✓ npm test\nTests: 42...")]      │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ ITERATION 4 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  Planner sees: all three steps succeeded.                              │
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "",                                                      │
  │    "reply": "Zeta: Repo cloned, 312 packages installed, all 42       │
  │              tests passed.",                                           │
  │    "done": true                                                        │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  WhatsApp reply: "Zeta: Repo cloned, 312 packages installed,
                   all 42 tests passed."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  LLM calls: 4 (plan + observe + observe + final)
  Shell commands: 3 (clone, install, test)
  Total iterations: 4
```

---

## Example: "Find the largest log file and show me its last 20 lines"

This task needs to **discover** a file first, then read it. The planner can't know the filename in advance.

```
User (WhatsApp): "Find the largest log file and show me its last 20 lines"
      │
      ▼
━━━ AgentLoop.run() ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─ ITERATION 1 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "find /var/log -name '*.log' -type f                    │
  │                -exec ls -lS {} + 2>/dev/null | head -5",              │
  │    "reasoning": "First discover which log file is the largest.",      │
  │    "done": false                                                       │
  │  }                                                                     │
  │                                                                        │
  │  Executor → exit 0: "-rw-r-- 48M /var/log/syslog ..."                │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ ITERATION 2 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  Planner sees: /var/log/syslog is the largest at 48M.                  │
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "tail -20 /var/log/syslog",                              │
  │    "reasoning": "Now show the last 20 lines of the largest log.",     │
  │    "done": false                                                       │
  │  }                                                                     │
  │                                                                        │
  │  Executor → exit 0: "Feb 22 10:03:12 kernel: ..."                    │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ ITERATION 3 ──────────────────────────────────────────────────────────┐
  │                                                                        │
  │  Planner returns:                                                      │
  │  {                                                                     │
  │    "command": "",                                                      │
  │    "reply": "Zeta: The largest log is /var/log/syslog (48MB).         │
  │              Here are the last 20 lines:\n\nFeb 22 10:03:12 ...",     │
  │    "done": true                                                        │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  WhatsApp reply

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  LLM calls: 3
  Shell commands: 2
  Total iterations: 3
```

This example shows why the loop matters: the planner could not have known to run `tail -20 /var/log/syslog` without first discovering the filename. The iterative model lets it observe and react.

---

## Example: Command Fails → Planner Retries

```
  ┌─ ITERATION 1 ──────────────────────────────────────────────────────────┐
  │  Planner: { "command": "docker ps", "done": false }                   │
  │  Executor → exit 127: "docker: command not found"                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ ITERATION 2 ──────────────────────────────────────────────────────────┐
  │  Planner sees the error and adapts:                                    │
  │  {                                                                     │
  │    "command": "",                                                      │
  │    "reply": "Zeta: Docker is not installed on this machine.",          │
  │    "done": true                                                        │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
```

Instead of crashing or returning a raw error, the planner observes the failure, reasons about it, and gives a human-friendly reply.

---

## Max Iterations Safety Cap

If the planner keeps requesting commands without setting `done: true`, the loop enforces a hard limit:

```
  ITERATION 1 → command → result
  ITERATION 2 → command → result
  ITERATION 3 → command → result
  ITERATION 4 → command → result
  ITERATION 5 → command → result
        │
        ▼
  MAX ITERATIONS REACHED (5)
        │
        ▼
  System injects: "Max iterations reached. Summarise everything."
        │
        ▼
  Planner forced to return { done: true, reply: "Zeta: ..." }
        │
        ▼
  WhatsApp reply with partial results
```

---

## 5 Messages in a Row: Context Chaining Between Tasks

Zoom out from a single agent loop to the **queue level**. The user sends 5 messages rapidly. Messages 1 and 5 are related (both about the same file):

```
Message 1: "Create a file called notes.txt with 'hello world'"
Message 2: "How much free disk space do I have?"
Message 3: "What's my public IP?"
Message 4: "List running Docker containers"
Message 5: "Append 'goodbye' to notes.txt and show me the final contents"
```

### Timeline

```
t=0s    All 5 messages arrive almost simultaneously
        Queue state:
        ┌────┬──────────────────────────────────────┬─────────┐
        │ id │ message                              │ status  │
        ├────┼──────────────────────────────────────┼─────────┤
        │  1 │ Create notes.txt with 'hello world'  │ pending │
        │  2 │ How much free disk space?             │ pending │
        │  3 │ What's my public IP?                  │ pending │
        │  4 │ List running Docker containers        │ pending │
        │  5 │ Append 'goodbye' to notes.txt...      │ pending │
        └────┴──────────────────────────────────────┴─────────┘

t=0s    processNext() picks task #1
        previous_context = "" (no completed tasks yet)

        ┌──────────────────────────────────────────────────────┐
        │ AgentLoop for Task #1 (1 iteration)                  │
        │                                                      │
        │ iter 1: command = "echo 'hello world' > ~/notes.txt" │
        │         → exit 0                                     │
        │ iter 2: done=true, reply = "Created notes.txt"       │
        └──────────────────────────────────────────────────────┘

t=4s    Task #1 done.
        result = "User asked: Create notes.txt...\nZeta replied: ..."
        processNext() picks task #2
        previous_context = result of #1

        ┌──────────────────────────────────────────────────────┐
        │ AgentLoop for Task #2 (1 iteration)                  │
        │                                                      │
        │ iter 1: command = "df -h"                            │
        │         → exit 0, "120GB free..."                    │
        │ iter 2: done=true, reply = "Zeta: 120GB free"       │
        └──────────────────────────────────────────────────────┘

t=8s    Task #2 done. processNext() → task #3 ...
t=11s   Task #3 done. processNext() → task #4 ...
t=15s   Task #4 done. processNext() → task #5

        previous_context = result of #4 (Docker containers)

        ┌──────────────────────────────────────────────────────────────┐
        │ AgentLoop for Task #5 (1 iteration)                          │
        │                                                              │
        │ messages include: previous context from task #4              │
        │                                                              │
        │ iter 1: command = "echo 'goodbye' >> ~/notes.txt             │
        │                    && cat ~/notes.txt"                       │
        │         → exit 0, "hello world\ngoodbye"                     │
        │ iter 2: done=true, reply = "Zeta: Done. Contents:\n          │
        │                             hello world\ngoodbye"            │
        └──────────────────────────────────────────────────────────────┘

t=19s   Task #5 done.
```

### Final SQLite state

```
┌────┬──────────────────────────┬────────┬──────────────────────────────────┬──────────────────────────────────┐
│ id │ message                  │ status │ previous_context                 │ result                           │
├────┼──────────────────────────┼────────┼──────────────────────────────────┼──────────────────────────────────┤
│  1 │ Create notes.txt...      │ done   │ ""                               │ User asked: ...\nZeta replied:.. │
│  2 │ How much free disk?      │ done   │ (result of #1)                   │ User asked: ...\nZeta replied:.. │
│  3 │ What's my public IP?     │ done   │ (result of #2)                   │ User asked: ...\nZeta replied:.. │
│  4 │ List Docker containers   │ done   │ (result of #3)                   │ User asked: ...\nZeta replied:.. │
│  5 │ Append 'goodbye'...      │ done   │ (result of #4)                   │ User asked: ...\nZeta replied:.. │
└────┴──────────────────────────┴────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Why does task #5 work even though its context is about Docker?

Task #5's `previous_context` comes from task #4 (Docker). But it still works because the user explicitly says `notes.txt` — the planner infers the intent from the message itself. `previous_context` is a **hint for ambiguous references** like "that file" or "do the same thing again", not the sole source of truth.

---

## Summary

| Layer | Responsibility | Concurrency |
|---|---|---|
| **TaskQueue** | FIFO ordering, context chaining between tasks, crash recovery | One task at a time |
| **AgentLoop** | Iterative plan → execute → observe → decide loop for a single task | One command per iteration, sequential |
| **Planner** | Decides the next command and when the task is done | One LLM call per iteration |
| **Executor** | Runs a single shell command, captures stdout/stderr/exit code | One command at a time |
| **Settings** | `~/.zeta/settings.json` controls runtime limits (default: maxIterations=50, commandTimeoutMs=30000, maxOutputLength=4000) | Read at the start of each task |
