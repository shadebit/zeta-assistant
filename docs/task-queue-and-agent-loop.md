# Task Queue & Agent Loop

How messages flow from WhatsApp to execution and back.

---

## Architecture Overview

```
WhatsApp message
      │
      ▼
┌──────────┐     ┌───────────────────────────────────────────────┐
│TaskQueue │     │ AgentLoop (per task)                          │
│ (SQLite) │     │                                               │
│          │     │  ┌─────────┐   ┌──────────┐   ┌───────────┐  │
│ FIFO     ├────►│  │ Planner ├──►│ Executor ├──►│ Summarise │  │
│ one task │     │  │ (o3-mini)│   │ (shell)  │   │ (o3-mini) │  │
│ at a time│     │  └─────────┘   └──────────┘   └───────────┘  │
│          │◄────┤        result + files                         │
└──────────┘     └───────────────────────────────────────────────┘
      │
      ▼
WhatsApp reply
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

## Why It's Called an "Agent Loop"

A simple bot would: receive message → run one command → reply. That's a straight line, not a loop.

Zeta's agent loop exists because **a single user request often requires multiple LLM calls**: the planner needs to think, execute, observe the results, and sometimes the summariser produces follow-up insights or file attachments. The current flow inside `AgentLoop.run()` is:

```
User message
      │
      ▼
 ┌─────────┐
 │ Planner │──── "What commands do I need?"
 └────┬────┘
      │ returns { commands, reasoning, reply, files }
      │
      ├── commands.length === 0 ?
      │         │
      │    YES: return reply immediately (no shell needed)
      │
      │    NO:
      ▼
 ┌──────────┐
 │ Executor │──── runs all commands in parallel
 └────┬─────┘
      │ returns CommandResult[]
      │
      ▼
 ┌───────────┐
 │ Summarise │──── "Given these results, what's the final answer?"
 └────┬──────┘
      │ returns { reply, files }
      │
      ▼
 WhatsApp reply + optional file attachments
```

That's **two LLM calls** (plan + summarise) and **N shell commands** for a single user message. The name "agent loop" reflects this multi-step reasoning cycle — and in future phases, it will become a true iterative loop where the summariser can request additional commands.

---

## Multi-Command Example: "Find the largest log file and show me its last 20 lines"

This single user request needs **2 commands** to resolve. Here's the full trace:

```
User (WhatsApp): "Find the largest log file and show me its last 20 lines"
      │
      ▼
━━━ AgentLoop.run() ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─ STEP 1: Planner ──────────────────────────────────────────────────────┐
  │                                                                        │
  │  Input: "Find the largest log file and show me its last 20 lines"     │
  │                                                                        │
  │  o3-mini reasons:                                                      │
  │    "I need to find the largest log, then tail it.                      │
  │     I can do both in a pipeline, or issue two commands.                │
  │     I'll use two commands to keep it readable."                        │
  │                                                                        │
  │  Output:                                                               │
  │  {                                                                     │
  │    "commands": [                                                       │
  │      "find /var/log -name '*.log' -type f -exec ls -lS {} + | head", │
  │      "tail -20 /var/log/syslog"                                       │
  │    ],                                                                  │
  │    "reasoning": "First find the largest log, then show its tail.",    │
  │    "reply": ""                                                         │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        │  2 commands
        ▼
  ┌─ STEP 2: Executor (parallel) ─────────────────────────────────────────┐
  │                                                                        │
  │  cmd[0]: find /var/log -name '*.log' ...                              │
  │          → exit 0, stdout: "-rw-r-- 48M /var/log/syslog ..."         │
  │                                                                        │
  │  cmd[1]: tail -20 /var/log/syslog                                     │
  │          → exit 0, stdout: "Feb 22 10:03:12 kernel: ..."             │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘
        │
        │  formatted results
        ▼
  ┌─ STEP 3: Summarise ───────────────────────────────────────────────────┐
  │                                                                        │
  │  o3-mini receives the original question + command outputs              │
  │                                                                        │
  │  Output:                                                               │
  │  {                                                                     │
  │    "reply": "Zeta: The largest log is /var/log/syslog (48MB).         │
  │              Here are the last 20 lines:\n\nFeb 22 10:03:12 ...",     │
  │    "files": []                                                         │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  WhatsApp reply: "Zeta: The largest log is /var/log/syslog (48MB)..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Multi-Command Example: "Clone my repo, install dependencies, and run the tests"

Three commands, all planned at once by the LLM:

```
User (WhatsApp): "Clone my repo, install deps, and run the tests"
      │
      ▼
━━━ AgentLoop.run() ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─ STEP 1: Planner ──────────────────────────────────────────────────────┐
  │                                                                        │
  │  o3-mini reasons:                                                      │
  │    "These three steps are sequential — clone must finish before        │
  │     install, and install before test. I'll chain them."               │
  │                                                                        │
  │  Output:                                                               │
  │  {                                                                     │
  │    "commands": [                                                       │
  │      "cd /tmp && git clone https://github.com/user/repo.git",         │
  │      "cd /tmp/repo && npm install",                                   │
  │      "cd /tmp/repo && npm test"                                       │
  │    ],                                                                  │
  │    "reasoning": "Clone, install, then test. Chained sequentially.",   │
  │    "reply": ""                                                         │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        │  3 commands (executed in parallel — each uses cd so they
        │  are self-contained, but npm install may fail if clone
        │  hasn't finished yet — see "Current Limitation" below)
        ▼
  ┌─ STEP 2: Executor (parallel) ─────────────────────────────────────────┐
  │                                                                        │
  │  cmd[0]: cd /tmp && git clone ...                                     │
  │          → exit 0, "Cloning into 'repo'..."                           │
  │                                                                        │
  │  cmd[1]: cd /tmp/repo && npm install                                  │
  │          → exit 1, "/tmp/repo: No such file or directory"             │
  │          ⚠ failed because clone hadn't finished yet                    │
  │                                                                        │
  │  cmd[2]: cd /tmp/repo && npm test                                     │
  │          → exit 1, "/tmp/repo: No such file or directory"             │
  │          ⚠ same issue                                                  │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─ STEP 3: Summarise ───────────────────────────────────────────────────┐
  │                                                                        │
  │  o3-mini sees the failures and explains them clearly:                  │
  │                                                                        │
  │  Output:                                                               │
  │  {                                                                     │
  │    "reply": "Zeta: The repo was cloned successfully, but install      │
  │              and test failed because they ran before cloning           │
  │              finished. Try asking again — the repo is now available.", │
  │    "files": []                                                         │
  │  }                                                                     │
  └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  WhatsApp reply with the explanation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

> **Current limitation:** Commands are executed in parallel. The planner _should_ chain dependent commands using `&&` within a single command string (e.g., `git clone ... && cd repo && npm install && npm test`) instead of splitting them into separate entries. A smarter planner prompt or a future sequential execution mode will address this.

---

## 5 Messages in a Row: Context Chaining

Now zoom out from a single agent loop to the **queue level**. The user sends 5 messages rapidly. Messages 1 and 5 are related (both about the same file):

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
        │ AgentLoop for Task #1                                │
        │                                                      │
        │ Planner → ["echo 'hello world' > ~/notes.txt"]      │
        │ Executor → runs it → exit 0                          │
        │ Summarise → "Created ~/notes.txt with 'hello world'"│
        └──────────────────────────────────────────────────────┘

t=4s    Task #1 done. result = "Created ~/notes.txt with 'hello world'"
        processNext() picks task #2
        previous_context = result of #1

        ┌──────────────────────────────────────────────────────┐
        │ AgentLoop for Task #2                                │
        │                                                      │
        │ Planner → ["df -h"]                                  │
        │ Executor → exit 0, "120GB free..."                   │
        │ Summarise → "Zeta: You have 120GB free on disk."     │
        └──────────────────────────────────────────────────────┘

t=8s    Task #2 done. result = "You have 120GB free on disk."
        processNext() picks task #3
        previous_context = result of #2
        ...runs curl ifconfig.me...

t=11s   Task #3 done. result = "Your public IP is 203.0.113.42"
        processNext() picks task #4
        previous_context = result of #3
        ...runs docker ps...

t=15s   Task #4 done. result = "3 containers: nginx, postgres, redis"
        processNext() picks task #5
        previous_context = result of #4  ← NOT result of #1

        ┌──────────────────────────────────────────────────────────────┐
        │ AgentLoop for Task #5                                        │
        │                                                              │
        │ Input to planner:                                            │
        │ "Previous task context:                                      │
        │  3 containers: nginx, postgres, redis                        │
        │                                                              │
        │  New request: Append 'goodbye' to notes.txt and show me      │
        │  the final contents"                                         │
        │                                                              │
        │ Planner → ["echo 'goodbye' >> ~/notes.txt && cat ~/notes"]  │
        │ Executor → exit 0, "hello world\ngoodbye"                    │
        │ Summarise → "Zeta: Done. Contents of notes.txt:\n            │
        │              hello world\ngoodbye"                           │
        └──────────────────────────────────────────────────────────────┘

t=19s   Task #5 done.
```

### Final SQLite state

```
┌────┬──────────────────────────┬────────┬──────────────────────────────────┬────────────────────────────────────┐
│ id │ message                  │ status │ previous_context                 │ result                             │
├────┼──────────────────────────┼────────┼──────────────────────────────────┼────────────────────────────────────┤
│  1 │ Create notes.txt...      │ done   │ ""                               │ Created ~/notes.txt with 'hello'   │
│  2 │ How much free disk?      │ done   │ Created ~/notes.txt with 'hello' │ You have 120GB free on disk.       │
│  3 │ What's my public IP?     │ done   │ You have 120GB free on disk.     │ Your public IP is 203.0.113.42     │
│  4 │ List Docker containers   │ done   │ Your public IP is 203.0.113.42   │ 3 containers: nginx, postgres...   │
│  5 │ Append 'goodbye'...      │ done   │ 3 containers: nginx, postgres... │ hello world\ngoodbye               │
└────┴──────────────────────────┴────────┴──────────────────────────────────┴────────────────────────────────────┘
```

### Why does task #5 succeed even though its context is about Docker?

Task #5's `previous_context` is the Docker output (from task #4), not the notes.txt creation (from task #1). But it still works because:

1. The **user's message explicitly says** `notes.txt` — the planner doesn't need context to know which file.
2. The planner is a reasoning model (o3-mini) — it interprets the user's intent from the message itself.
3. `previous_context` is a **hint**, not the sole source of truth. It helps with ambiguous references like "that file" or "do the same thing again".

### When context chaining breaks

If message 5 were **"now append 'goodbye' to that file"** instead of naming `notes.txt`, the planner would see "3 containers: nginx, postgres, redis" as context and have no idea which file "that file" refers to. It would likely fail or guess wrong.

> **Future improvement (Phase 9 — Global Context Persistence):** maintain a rolling summary of all recent tasks so the planner always has full situational awareness, not just the last task's result.

---

## Summary

| Layer | Responsibility | Concurrency |
|---|---|---|
| **TaskQueue** | FIFO ordering, context chaining between tasks, crash recovery | One task at a time |
| **AgentLoop** | Plan → Execute → Summarise cycle for a single task | Commands within a task run in parallel |
| **Planner** | Decides what commands to run, and summarises results | Two LLM calls per task (plan + summarise) |
| **Executor** | Runs shell commands, captures stdout/stderr/exit code | All commands in a plan run in parallel |

