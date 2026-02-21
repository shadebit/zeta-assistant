# Zeta Assistant

A locally running AI operator controlled via WhatsApp Web. Send a message from your phone and Zeta plans, validates, and executes tasks autonomously — all from your terminal.

> **Status:** Phase 2 complete — AI agent loop with o3-mini, command execution, and WhatsApp replies working.

---

## How It Works

```
You (WhatsApp) → Message → Zeta (terminal) → o3-mini plans commands → Executes on your machine → Replies on WhatsApp
```

1. Run `OPEN_AI_API_KEY=sk-... npx zeta-assistant` in your terminal
2. Scan the QR code with WhatsApp on your phone
3. Send yourself a message (to your own number) — Zeta picks it up
4. The AI planner (o3-mini) decides what shell commands to run
5. Commands execute in parallel on your machine
6. Zeta summarises the results and replies on WhatsApp

The assistant runs **only while the terminal is open**. No cloud, no webhooks, no public exposure. Only messages you send to yourself are processed — messages from others are ignored.

---

## Prerequisites

- **Node.js** >= 20.0.0
- A **WhatsApp** account

---

## Quick Start

### Option 1: npx (recommended)

```bash
OPEN_AI_API_KEY=sk-... npx zeta-assistant
```

Or with the flag:

```bash
npx zeta-assistant --OPEN_AI_API_KEY=sk-...
```

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
OPEN_AI_API_KEY=sk-... npm start
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
| `--OPEN_AI_API_KEY=<key>` | OpenAI API key **(required)**. Also reads `OPEN_AI_API_KEY` env var. |
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
| **AI** | [OpenAI o3-mini](https://platform.openai.com/) | Planner — batches shell commands from natural language |
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
| **Database** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 4 | Task queue, session messages (SQLite) |
| **Screenshot** | [Puppeteer](https://pptr.dev/) (direct) | 3 | `take_screenshot` tool |

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
│   ├── config/
│   │   └── config-loader.ts          # Directory setup (~/.zeta)
│   ├── whatsapp/
│   │   └── whatsapp-client.ts        # whatsapp-web.js wrapper
│   ├── logger/
│   │   ├── logger.ts                 # Logger interface (swap implementations easily)
│   │   └── winston-logger.ts         # Winston impl: colored stderr + JSON lines to file
│   ├── types/
│   │   ├── index.ts                  # Shared interfaces (ZetaConfig, CliArgs, PlannerOutput)
│   │   └── qrcode-terminal.d.ts      # Type declarations for untyped package
│   └── utils/
│       └── cli-parser.ts             # Minimal process.argv parser
├── tests/
│   └── unit/                         # Mirrors src/ structure
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
├── scripts/              # Reusable scripts (Phase 7)
├── sessions.db           # SQLite task queue (Phase 4)
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

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1 | WhatsApp connection, QR login, message reception | ✅ Done |
| 2 | AI agent loop (o3-mini), command execution, reply to messages | ✅ Done |
| 3 | Screenshot tool, media attachments | ⬜ |
| 4 | SQLite task queue, FIFO processing | ⬜ |
| 5 | Governor + Decision Engine, confirmation flow | ⬜ |
| 6 | Script registry (create, reuse, update) | ⬜ |
| 7 | Full JSONL structured logging | ⬜ |
| 8 | Global context persistence | ⬜ |

> Full product requirements and technical specification: [`docs/prd.md`](docs/prd.md)

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for coding standards, naming conventions, testing requirements, and best practices.

---

## License

MIT
