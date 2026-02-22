# Zeta Assistant – Product Requirements Document

> This document contains the full product specification, technical architecture,
> and implementation roadmap. For a quick overview, see [`README.md`](../README.md).

---

## 1. Vision

Zeta Assistant is a locally running AI operator controlled via WhatsApp Web.

The user interacts with their computer through voice messages and text as if they were sitting in front of it. Zeta interprets the intent, plans and executes shell commands, and replies with the results — including files, screenshots, and media.

In future phases, Zeta will also control the mouse, keyboard, and GUI applications, making it a full remote operator for the machine.

It must:

- Run only while the terminal is open (`npx @shadebit/zeta-assistant`)
- Use WhatsApp Web via QR login (no Twilio, no ngrok)
- Accept text and audio messages as input
- Transcribe audio to text using OpenAI Whisper
- Persist session locally
- Use o3-mini as the reasoning/planning model
- Execute shell commands in parallel when possible
- Maintain a sequential task queue (SQLite)
- Pass context from the previous task to the next
- Send files and media as WhatsApp attachments
- Detect and skip binary output to protect token limits
- Log all decisions (file + terminal)
- Persist scripts for reuse (future)

---

## 2. Core Principles

1. The user talks to Zeta as if they were in front of the computer
2. Conservative by design — prefer read-only commands unless explicitly asked to change
3. Full observability — logs always on (terminal + file)
4. One task at a time — sequential queue, FIFO
5. Batch commands — prefer fewer, broader commands over many narrow ones
6. No unnecessary complexity — no versioning, no retry limits
7. No conversations — Zeta is a task executor, not a chatbot

---

## 3. Functional Requirements

### 3.1 WhatsApp Integration ✅

- QR appears on first run
- Session persisted in `~/.zeta/whatsapp-session/`
- `--reset-whatsapp` forces new QR
- Only messages from the owner's own number are processed
- Bot replies prefixed with `Zeta:` to prevent infinite loops
- Stale browser locks cleaned up on startup
- Orphaned Chrome processes killed on startup

### 3.2 Audio Input ✅

- Voice notes (`ptt`) and audio messages detected automatically
- Audio downloaded from WhatsApp and sent to OpenAI Whisper for transcription
- Transcribed text enters the same task queue as text messages
- Temporary audio files cleaned up after transcription

### 3.3 Task Queue ✅

- Each valid message (text or transcribed audio) creates a new task
- Tasks stored in SQLite (`~/.zeta/tasks.db`)
- Tasks execute sequentially (FIFO)
- Context resolved at processing time (not enqueue time) to avoid stale context
- Previous task result passed as context to the next task
- Stuck tasks (`running` status) recovered to `pending` on startup
- States:
  - `pending`
  - `running`
  - `done`
  - `failed`

### 3.4 Agent Loop ✅

Each task:

1. **Planner** (o3-mini) — receives user message + previous context, returns commands + reasoning
2. **Command Executor** — executes all commands in parallel via `/bin/bash`
3. **Summariser** (o3-mini) — receives command results, returns final reply + file attachments

Features:
- Commands batched in a single planner call
- Binary output detected and skipped (`(binary output detected — skipped)`)
- Output truncated to 4000 characters to protect token limits
- File attachments returned via `files` array in planner response
- `soul.md` defines the assistant's personality and rules

### 3.5 File Handling ✅

- Planner instructed to never `cat` binary files
- Files sent as WhatsApp media attachments via `MessageMedia.fromFilePath()`
- `files` array supported in both `plan()` and `summarise()` responses
- Files from both planning and summarisation steps are merged and sent

### 3.6 Logging ✅

Always enabled.

- JSON lines to `~/.zeta/logs/zeta.log` (file transport)
- Colored human-readable output to terminal (stderr)
- Logger interface (`Logger`) with swappable implementations
- `WinstonLogger` as default implementation
- Log levels: debug, info, warn, error

### 3.7 CLI ✅

| Flag | Description |
|---|---|
| `--OPEN_AI_API_KEY=<key>` | OpenAI API key (required). Also reads `OPEN_AI_API_KEY` env var |
| `--reset-whatsapp` | Clear session, force new QR scan |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

### 3.8 Dedicated Browser ✅

- Chromium downloaded automatically via Puppeteer
- Completely isolated from the user's personal browser
- User logs into sites inside the Zeta browser to grant access
- Sites not logged into are inaccessible to Zeta

---

## 4. Input Philosophy

The user should interact with Zeta as if they were **sitting in front of the computer**. Messages (text or audio) are natural language commands:

- "List the files on my Desktop"
- "Show me the latest screenshot"
- "Create a file called notes.txt with today's date"
- "How much free memory do I have?"
- "Open the project in /Dev/projects/foo and show me the git status"

In future phases, this extends to GUI control:

- "Open Chrome and go to instagram.com"
- "Click the upload button"
- "Move the mouse to the search bar and type 'hello'"
- "Take a screenshot of the current screen"

The voice/text input is the user's way of controlling the machine remotely. Zeta is the hands and eyes.

---

## 5. Non-Goals

- SaaS
- Multi-machine sync
- Enterprise-grade infra
- Webhooks or public exposure
- Chatbot conversations — Zeta executes tasks, it doesn't chat

---

## 6. Runtime Architecture

```
Terminal
  ↓
Node Process
  ↓
WhatsApp Web (whatsapp-web.js)
  ↓
Message Listener (text + audio)
  ↓
Audio? → Whisper Transcription → Text
  ↓
Task Queue (SQLite — ~/.zeta/tasks.db)
  ↓
Agent Loop (plan → execute → summarise)
  ↓
WhatsApp sendMessage() / sendMedia()
```

---

## 7. Data Directory

```
~/.zeta/
├── whatsapp-session/     # Persisted WhatsApp login (LocalAuth)
├── logs/
│   └── zeta.log          # JSON lines log file
├── tasks.db              # SQLite task queue
├── scripts/              # Reusable scripts (Phase 7)
└── global_context.json   # Cross-task memory (Phase 9)
```

---

## 8. SQLite Schema

**tasks**

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `sender` | TEXT | WhatsApp sender ID |
| `message` | TEXT | Original user message (or transcribed audio) |
| `status` | TEXT | `pending` / `running` / `done` / `failed` |
| `previous_context` | TEXT | Result of the previous task (resolved at processing time) |
| `result` | TEXT | Task result (reply sent to user) |
| `created_at` | TEXT | Timestamp (datetime) |

---

## 9. Planner Contract

**Input:** User message + previous context + soul.md system prompt

**Output (JSON):**

```json
{
  "commands": ["cmd1", "cmd2"],
  "reasoning": "why these commands answer the request",
  "files": ["/absolute/path/to/file.png"],
  "reply": "final answer to the user"
}
```

Rules:
- `commands` empty + `reply` filled = no execution needed
- `commands` filled + `reply` empty = execute first, summarise after
- `files` = absolute paths to send as WhatsApp media attachments

---

## 10. Implementation Roadmap

### Phase 1 – WhatsApp Connection ✅

- CLI entry point with arg parsing
- WhatsApp Web login with QR code
- Session persistence in `~/.zeta/whatsapp-session/`
- Message reception from owner's own number
- Graceful shutdown (SIGINT/SIGTERM)
- Stale lock cleanup and orphaned Chrome process cleanup

### Phase 2 – AI Agent Loop ✅

- o3-mini as planner model
- `soul.md` system prompt with environment variables
- Shell command execution via `/bin/bash`
- Parallel command execution
- Command output truncation (4000 chars)
- Binary output detection and skipping
- Summarisation step with file attachments
- WhatsApp reply with `Zeta:` prefix
- Bot loop prevention (sentByBot tracking)

### Phase 3 – Audio Input + Task Queue ✅

- Audio message detection (ptt/audio types)
- OpenAI Whisper transcription
- SQLite task queue with FIFO processing
- Context from previous task passed to planner
- Context resolved at processing time (not enqueue time)
- Crash recovery (stuck tasks reset to pending)
- Processor drain on registration

### Phase 4 – File Attachments ✅

- `files` array in planner and summariser responses
- `MessageMedia.fromFilePath()` for WhatsApp media
- Files merged from both plan and summarise steps
- Binary output detection prevents token overflow

### Phase 5 – GUI Control (Mouse, Keyboard, Apps)

- Puppeteer-based screen control
- Mouse movement and clicks
- Keyboard input
- Screenshot capture and send
- App launching via shell + GUI interaction

### Phase 6 – Governor + Decision Engine

- Second LLM call to classify risk/impact
- Confirmation flow for systemic/high-risk actions
- `CONFIRMAR` / `CANCELAR` via WhatsApp

### Phase 7 – Script Registry

- `~/.zeta/scripts/` directory
- `list_scripts`, `create_script`, `execute_script`, `update_script`
- Reuse by exact name
- Scripts receive only explicit arguments

### Phase 8 – Structured Logging

- JSONL log files per task
- Event types: `task_started`, `planner_output`, `execution_result`, etc.

### Phase 9 – Global Context

- `~/.zeta/global_context.json`
- Lightweight persistent state across tasks
- Planner receives global context

---

## 11. CI/CD ✅

- **PR checks:** lint + build on every pull request
- **Release:** automated on merge to `main`
  - Version bump (minor)
  - CHANGELOG.md generated from commits
  - Git tag created
  - Published to npmjs.org as `@shadebit/zeta-assistant`
  - GitHub Release with changelog body + comparison link
- **Branch protection:** require PR, require status checks, block force push
- **Conventional commits** enforced via Husky pre-commit hooks
- **Branch naming** validated on push

---

## 12. Test Checklist

### Phase 1 ✅

- [x] QR appears
- [x] WhatsApp connects
- [x] Message received in terminal
- [x] Session persisted across restarts

### Phase 2 ✅

- [x] Only owner messages processed
- [x] Planner returns structured JSON
- [x] Shell commands execute
- [x] Assistant replies via WhatsApp
- [x] Bot loop prevented

### Phase 3 ✅

- [x] Audio messages transcribed
- [x] Tasks queued in SQLite
- [x] Tasks execute sequentially
- [x] Context passed between tasks
- [x] Stuck tasks recovered on restart

### Phase 4 ✅

- [x] Files sent as WhatsApp media
- [x] Binary output detected and skipped
- [x] Output truncated to 4000 chars

### Phase 5

- [ ] Screenshot captured and sent
- [ ] Mouse moved to coordinates
- [ ] Keyboard input sent
- [ ] App opened via GUI

### Phase 6

- [ ] Systemic action requires confirmation
- [ ] Complex action requires confirmation
- [ ] `CANCELAR` aborts task

### Phase 7

- [ ] Script created in `~/.zeta/scripts`
- [ ] Script reused by exact name
- [ ] `update_script` overwrites file

### Phase 8

- [ ] JSONL log file created per task
- [ ] All event types logged

### Phase 9

- [ ] Global context persists between tasks
- [ ] Planner receives global context

