# Zeta Assistant

## PRODUCT REQUIREMENTS DOCUMENT (PRD)

### 1. Vision

Zeta Assistant is a locally running AI operator controlled via WhatsApp Web.

It must:

- Run only while the terminal is open (`npx zeta-assistant`)
- Use WhatsApp Web via QR login (no Twilio, no ngrok)
- Persist session locally
- Use GPT-4o with structured tool calling
- Execute one action per iteration
- Maintain a sequential task queue
- Persist scripts for reuse
- Log all decisions (file + terminal)
- Enforce strict execution limits
- Require confirmation for complex or systemic actions

---

### 2. Core Principles

1. Conservative by design
2. Deterministic decision enforcement
3. Full observability (logs always on)
4. One task at a time (queue)
5. One action per iteration
6. Explicit arguments to scripts (no hidden context)
7. No unnecessary complexity (no versioning, no retry limits)

---

### 3. Functional Requirements

#### 3.1 WhatsApp Integration

- QR appears first run
- Session persisted
- `--reset-whatsapp` forces new QR
- Only whitelisted number allowed

#### 3.2 Task Queue

- Each valid message creates a new task
- Tasks execute sequentially
- States:
  - `QUEUED`
  - `RUNNING`
  - `AWAITING_CONFIRMATION`
  - `COMPLETED`
  - `ABORTED`

#### 3.3 Agent Loop

Each iteration:

1. **Planner** (GPT-4o)
2. **Governor** (GPT-4o)
3. **Decision Engine** (code)
4. **Executor**

Hard limits:

| Limit | Default |
|---|---|
| `max_iterations` | 40 |
| `max_runtime_minutes` | 5 |
| `max_tokens_per_session` | 50000 |

---

#### 3.4 Script Registry

**Directory:** `~/.zeta/scripts/`

Rules:

- Reuse by exact name only
- Must check existing scripts before creating
- Creation = full implementation in one step
- `update_script` allowed (systemic impact)
- No versioning
- No retry limits
- Scripts receive only explicit arguments

---

#### 3.5 Logging

Always enabled.

- JSONL file per task
- Human-readable terminal output
- No automatic rotation

---

#### 3.6 Global Context

Lightweight persistent state.

Stored separately from session memory. Used to allow continuity across tasks.

---

### 4. Non-Goals

- SaaS
- Multi-machine sync
- Enterprise-grade infra
- Webhooks or public exposure

---

## TECHNICAL SPECIFICATION

### 1. Runtime Architecture

```
Terminal
  ↓
Node Process
  ↓
WhatsApp Web (whatsapp-web.js)
  ↓
Message Listener
  ↓
Task Queue (SQLite)
  ↓
Agent Loop
  ↓
Executor
  ↓
WhatsApp sendMessage()
```

---

### 2. Directory Structure

```
~/.zeta/
  config.json
  sessions.db
  logs/
  scripts/
  whatsapp-session/
  global_context.json
```

---

### 3. SQLite Tables

**tasks**

| Column | Description |
|---|---|
| `id` | Primary key |
| `created_at` | Timestamp |
| `status` | Task state |
| `goal_text` | Original user message |

**messages**

| Column | Description |
|---|---|
| `id` | Primary key |
| `task_id` | Foreign key → tasks |
| `role` | system / user / assistant / observation |
| `content` | Message content |

---

### 4. Agent Loop Contracts

**Planner Output:**

```json
{
  "action": { "name": "...", "arguments": {} },
  "reasoning": "...",
  "done": false
}
```

**Governor Output:**

```json
{
  "complexity": "low | high",
  "risk": "low | high",
  "impact": "local | systemic",
  "requires_confirmation": false
}
```

---

### 5. Decision Rules (Deterministic)

| Condition | Action |
|---|---|
| `impact == systemic` | Require confirmation |
| `complexity == high` | Require confirmation |
| `risk == high` | Enable recording |

---

### 6. Logging Events

Event types:

- `task_started`
- `planner_output`
- `governor_output`
- `decision`
- `execution_started`
- `execution_result`
- `execution_error`
- `confirmation_required`
- `task_completed`
- `task_aborted`
- `limit_exceeded`

---

### 7. Script Execution Model

```javascript
// ~/.zeta/scripts/example.js
module.exports = async function(args) {
  // ...
}
```

Executor loads and runs script with explicit `args` only.

---

## INCREMENTAL IMPLEMENTATION ROADMAP

### Phase 1 – Minimal WhatsApp Reception

**Goal:** Run `npx zeta-assistant` and receive a message.

Deliverables:

- CLI structure
- WhatsApp Web login with QR
- Persist session
- Print received messages to terminal

---

### Phase 2 – Respond to Message

**Goal:** Reply with simple text.

Deliverables:

- Whitelist validation
- `sendMessage()`
- Basic logging

---

### Phase 3 – Attach Media (Screenshot)

**Goal:** AI generates screenshot and sends back.

Deliverables:

- `take_screenshot` tool
- Media storage
- `sendMessage` with media

---

### Phase 4 – SQLite + Queue

**Goal:** Tasks created and queued.

Deliverables:

- `sessions.db`
- `tasks` table
- FIFO processing
- State transitions

---

### Phase 5 – Agent Loop (Planner only)

**Goal:** GPT-4o generates structured response.

Deliverables:

- Planner call
- Structured parsing
- One iteration only

---

### Phase 6 – Governor + Decision Engine

**Goal:** Enforce classification rules.

Deliverables:

- Governor call
- Confirmation flow
- Impact enforcement

---

### Phase 7 – Script Registry

**Goal:** Create and reuse scripts.

Deliverables:

- `scripts` directory
- `list_scripts`
- `create_script`
- `execute_script`
- `update_script`

---

### Phase 8 – Logging Full Coverage

**Goal:** Structured logging per iteration.

Deliverables:

- JSONL log files
- Terminal readable output

---

### Phase 9 – Global Context

**Goal:** Persist lightweight cross-task memory.

Deliverables:

- `global_context.json`
- Planner receives global context

---

## TEST CHECKLIST (STEP-BY-STEP)

### Phase 1 Tests

- [ ] QR appears
- [ ] WhatsApp connects
- [ ] Message received in terminal

### Phase 2 Tests

- [ ] Only whitelisted number accepted
- [ ] Assistant replies with text
- [ ] Logs file created

### Phase 3 Tests

- [ ] Screenshot file generated
- [ ] Screenshot sent via WhatsApp
- [ ] Media saved in `~/.zeta/media`

### Phase 4 Tests

- [ ] Multiple messages queued
- [ ] Tasks execute sequentially
- [ ] States transition correctly

### Phase 5 Tests

- [ ] Planner returns structured JSON
- [ ] One action per iteration

### Phase 6 Tests

- [ ] Systemic action requires `CONFIRMAR`
- [ ] Complex action requires `CONFIRMAR`
- [ ] `CANCELAR` aborts task

### Phase 7 Tests

- [ ] Script created in `~/.zeta/scripts`
- [ ] Script reused by exact name
- [ ] `update_script` overwrites file
- [ ] Script correction works

### Phase 8 Tests

- [ ] Log file created per task
- [ ] `planner_output` logged
- [ ] `governor_output` logged
- [ ] `decision` logged
- [ ] `execution_result` logged

### Phase 9 Tests

- [ ] Global context persists between tasks
- [ ] Planner receives global context
- [ ] Subsequent task can continue previous work
