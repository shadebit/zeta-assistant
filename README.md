# Zeta Assistant

A locally running AI operator controlled via WhatsApp Web. Send a message from your phone and Zeta plans, validates, and executes tasks autonomously — all from your terminal.

> **Status:** Phase 4 complete — audio input (Whisper), SQLite task queue, file attachments, and context passing between tasks.

---

## How It Works

```
You (WhatsApp) → Text or Audio → Zeta (terminal) → o3-mini plans commands → Executes on your machine → Replies on WhatsApp
```

1. Run `OPENAI_API_KEY=sk-... npx @shadebit/zeta-assistant` in your terminal
2. Scan the QR code with WhatsApp on your phone
3. Send yourself a **text or audio message** (to your own number) — Zeta picks it up
4. Audio is transcribed automatically via OpenAI Whisper
5. Each message enters a **task queue** (SQLite) — executed one at a time, in order
6. The AI planner (o3-mini) decides what shell commands to run
7. Commands execute in parallel on your machine
8. Zeta summarises the results and replies on WhatsApp (including file attachments)

Talk to Zeta as if you were **sitting in front of your computer**. Send audios like "show me the files on my Desktop" or "how much free memory do I have?" — in future phases, this extends to GUI control: moving the mouse, clicking buttons, opening apps.

The assistant runs **only while the terminal is open**. No cloud, no webhooks, no public exposure. Only messages you send to yourself are processed — messages from others are ignored.

---

## Prerequisites

- **Node.js** >= 20.0.0
- A **WhatsApp** account

---

## Quick Start

### Option 1: npx (recommended)

```bash
OPENAI_API_KEY=sk-... npx @shadebit/zeta-assistant
```

> ⚠️ **Security:** Always prefer the env var method above. Passing the key via `--OPENAI_API_KEY=` flag exposes it in `ps aux` to other users on the same machine.

### Option 2: Clone and run with npm

```bash
# 1. Clone the repository
git clone https://github.com/your-org/zeta-assistant.git
cd zeta-assistant

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Run
OPENAI_API_KEY=sk-... npm start
```

On first run, a **QR code** appears in the terminal. Scan it with WhatsApp on your phone. The session is persisted in `~/.zeta/whatsapp-session/` so you only need to scan once.

---

## Dedicated Browser

Zeta downloads and manages its **own Chromium instance** — completely separate from your personal browser. This is the "Zeta browser".

**Why?** This is both a feature and a security model:

- **You control what Zeta can access.** Log into sites (Instagram, Twitter, Gmail, etc.) inside the Zeta browser and the assistant can operate them on your behalf.
- **Your personal browser is never touched.** Zeta has zero access to your personal cookies, sessions, or passwords.
- **Sites you don't log into are inaccessible.** Zeta can only control what you explicitly grant.

The Chromium binary is downloaded automatically during `npm install` via Puppeteer.

---

## CLI Usage

```bash
zeta-assistant [options]
```

| Flag | Description |
|---|---|
| `--OPENAI_API_KEY=<key>` | OpenAI API key **(required)**. Also reads `OPENAI_API_KEY` env var. |
| `--reset-whatsapp` | Clear saved session and force a new QR code scan |
| `--help`, `-h` | Show help message |
| `--version`, `-v` | Show version number |

---

## Tech Stack

### Current (Phase 1–2)

| Category | Technology | Purpose |
|---|---|---|
| **Language** | [TypeScript](https://www.typescriptlang.org/) 5.x | Strict mode, no `any`, fully typed |
| **Runtime** | [Node.js](https://nodejs.org/) >= 20 | ESM, modern APIs |
| **AI Planner** | [OpenAI o3-mini](https://platform.openai.com/) | Plans and batches shell commands from natural language |
| **AI Transcription** | [OpenAI Whisper](https://platform.openai.com/) | Audio-to-text for voice messages |
| **Database** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Task queue (SQLite, `~/.zeta/tasks.db`) |
| **WhatsApp** | [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) | WhatsApp Web client via Puppeteer |
| **Browser** | Chromium (via Puppeteer) | Dedicated browser instance, isolated from personal browser |
| **QR Display** | [qrcode-terminal](https://www.npmjs.com/package/qrcode-terminal) | QR code rendered in the terminal |
| **Logging** | [Winston](https://github.com/winstonjs/winston) | Colored console to stderr + JSON lines to file |
| **Testing** | [Jest](https://jestjs.io/) + [ts-jest](https://kulshekhar.github.io/ts-jest/) | Unit tests, ESM mode, 80%+ coverage |
| **Linting** | [ESLint](https://eslint.org/) + [@typescript-eslint](https://typescript-eslint.io/) | Strict type-checked rules |
| **Formatting** | [Prettier](https://prettier.io/) | Consistent code style |
| **Git Hooks** | [Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) | Pre-commit lint + format |

### Planned (Upcoming Phases)

| Category | Technology | Phase | Purpose |
|---|---|---|---|
| **GUI Control** | [Puppeteer](https://pptr.dev/) (direct) | 5 | Mouse, keyboard, screenshot, app control |

### Intentionally Not Used

| Technology | Reason |
|---|---|
| Twilio / ngrok | No cloud dependency. WhatsApp Web only. |
| Express / Fastify | No HTTP server. No webhooks. |
| Commander / yargs | Minimal deps. Raw `process.argv` for 3 flags. |
| dotenv | No `.env` files. API key passed via CLI flag or env var directly. |
| Prisma / TypeORM | `better-sqlite3` is simpler for a single-file embedded database. |

---

## Project Structure

```
zeta-assistant/
├── src/
│   ├── main.ts                        # CLI entry point (shebang, arg parsing, shutdown)
│   ├── index.ts                      # Library entry point (public API exports)
│   ├── agent/
│   │   ├── agent-loop.ts             # Orchestrates: message → plan → execute → reply
│   │   └── planner.ts               # o3-mini planner (batches shell commands)
│   ├── executor/
│   │   └── command-executor.ts       # Parallel shell command execution (/bin/bash)
│   ├── queue/
│   │   └── task-queue.ts             # SQLite FIFO task queue with context passing
│   ├── transcriber/
│   │   └── audio-transcriber.ts      # OpenAI Whisper audio-to-text
│   ├── config/
│   │   └── config-loader.ts          # Directory setup (~/.zeta)
│   ├── whatsapp/
│   │   └── whatsapp-client.ts        # whatsapp-web.js wrapper (text + audio)
│   ├── logger/
│   │   ├── logger.ts                 # Logger interface (swap implementations easily)
│   │   └── winston-logger.ts         # Winston impl: colored stderr + JSON lines to file
│   ├── types/
│   │   ├── index.ts                  # Shared interfaces (ZetaConfig, CliArgs, PlannerOutput)
│   │   └── qrcode-terminal.d.ts      # Type declarations for untyped package
│   └── utils/
│       └── cli-parser.ts             # Minimal process.argv parser
├── soul.md                            # Assistant personality and rules
├── docs/
│   └── prd.md                        # Product requirements & technical spec
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsconfig.test.json
├── jest.config.ts
├── eslint.config.js
├── .prettierrc
└── CONTRIBUTING.md                    # Coding standards & best practices
```

### Runtime Data (`~/.zeta/`)

```
~/.zeta/
├── whatsapp-session/     # Persisted WhatsApp login (LocalAuth)
├── logs/
│   └── zeta.log          # JSON lines log file (Winston file transport)
├── tasks.db              # SQLite task queue
├── scripts/              # Reusable scripts (Phase 7)
└── global_context.json   # Cross-task memory (Phase 9)
```

---

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Run tests with coverage report
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

---

## Releases

Releases are fully automated via GitHub Actions. When a **PR is merged into `main`**:

1. CI runs lint and build
2. Version is bumped (minor)
3. `CHANGELOG.md` is generated with all commits since the last release
4. A git tag is created (`v0.11.0`, `v0.12.0`, etc.)
5. The package is published to [npm](https://www.npmjs.com/package/@shadebit/zeta-assistant)
6. A GitHub Release is created with the changelog body and a comparison link

No manual steps required. Just merge and it ships.

### Required GitHub Secrets

| Secret | Where to get it |
|---|---|
| `NPM_TOKEN` | [npmjs.com → Access Tokens → Generate New Token (Automation)](https://www.npmjs.com/settings/~/tokens) |

---

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1 | WhatsApp connection, QR login, message reception | ✅ Done |
| 2 | AI agent loop (o3-mini), command execution, reply to messages | ✅ Done |
| 3 | Audio input (Whisper), SQLite task queue, FIFO processing | ✅ Done |
| 4 | File attachments, binary detection, media sending | ✅ Done |
| 5 | GUI control (mouse, keyboard, screenshot, apps) | ⬜ |
| 6 | Governor + Decision Engine, confirmation flow | ⬜ |
| 7 | Script registry (create, reuse, update) | ⬜ |
| 8 | Full JSONL structured logging | ⬜ |
| 9 | Global context persistence | ⬜ |

> Full product requirements and technical specification: [`docs/prd.md`](docs/prd.md)

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for coding standards, naming conventions, testing requirements, and best practices.

### How to Help

The best way to contribute is to **use Zeta Assistant and report issues through it**:

1. Run the assistant:
   ```bash
   OPENAI_API_KEY=sk-... npx @shadebit/zeta-assistant
   ```
2. Use it normally — send messages, ask it to run commands, explore its limits.
3. When something breaks or behaves unexpectedly, **send a WhatsApp audio or text message describing the problem**. This way we collect real-world issues from actual usage and can fix them for everyone at once.

The more people running Zeta in different environments and use cases, the faster we catch edge cases and improve the assistant for all users.

---

## License

MIT
