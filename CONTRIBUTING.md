# Zeta Assistant – Coding Standards & Best Practices

> **All contributors and AI assistants MUST follow these standards.**
> This document governs code style, structure, naming, testing, and documentation for the entire project.

---

## 1. Language & Locale

- **All code, comments, commits, branch names, file names, documentation, and logs MUST be written in English.**
- No exceptions. Mixed-language identifiers are not allowed.

---

## 2. TypeScript Strictness

### 2.1 Strict Mode

- `strict: true` in `tsconfig.json` — always.
- Enable `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitReturns`.

### 2.2 No `any`

- **`any` is forbidden.** Use `unknown` when the type is truly unknown, then narrow it with type guards.
- If a third-party library forces `any`, wrap it in a typed adapter and isolate the `any` there with an `eslint-disable` comment explaining why.

### 2.3 Prefer Explicit Types

- Always type function parameters and return types explicitly.
- Inferred types are acceptable **only** for simple local variables (`const x = 5`).

### 2.4 Use Type-Only Imports

```typescript
import type { TaskStatus } from './types.js';
```

- Use `import type` whenever the import is only used as a type, not a value.

---

## 3. Naming Conventions

Follow standard TypeScript community conventions without exception.

| Element | Convention | Example |
|---|---|---|
| Files & directories | `kebab-case` | `task-queue.ts`, `agent-loop/` |
| Classes | `PascalCase` | `TaskQueue` |
| Interfaces | `PascalCase` (no `I` prefix) | `PlannerOutput` |
| Types | `PascalCase` | `TaskStatus` |
| Enums | `PascalCase` (members: `PascalCase`) | `TaskState.Running` |
| Functions & methods | `camelCase` | `processNextTask()` |
| Variables & parameters | `camelCase` | `currentTask` |
| Constants (module-level) | `UPPER_SNAKE_CASE` | `MAX_ITERATIONS` |
| Boolean variables | Prefix with `is`, `has`, `should`, `can` | `isRunning`, `hasCompleted` |
| Private class members | No underscore prefix; use `private` keyword | `private client: Client` |
| Acronyms in identifiers | Treat as a word | `SqliteDb`, `QrCode`, `HttpClient` |

---

## 4. Project Structure

```
zeta-assistant/
├── src/
│   ├── index.ts              # Library entry point (exports public API)
│   ├── main.ts                # CLI entry point (bin command)
│   ├── config/               # Configuration loading & defaults
│   ├── whatsapp/             # WhatsApp Web client integration
│   ├── queue/                # Task queue (SQLite)
│   ├── agent/                # Agent loop: planner, governor, decision engine
│   ├── executor/             # Script execution engine
│   ├── logger/               # Structured logging (JSONL + terminal)
│   ├── context/              # Global context persistence
│   ├── scripts/              # Built-in script utilities
│   ├── types/                # Shared type definitions
│   │   └── index.ts          # Re-exports all types
│   └── utils/                # Pure utility functions
├── tests/
│   ├── unit/                 # Unit tests (mirrors src/ structure)
│   └── helpers/              # Test utilities & mocks
├── docs/                     # Additional documentation
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── jest.config.ts
├── eslint.config.js
├── .prettierrc
└── README.md
```

### Rules

- **One responsibility per file.** If a file exceeds ~200 lines, split it.
- **One class per file.** The file name matches the class in `kebab-case` (e.g., `TaskQueue` → `task-queue.ts`).
- **Index files are for re-exports only.** No logic in `index.ts` barrel files.
- **Colocate tests.** `src/queue/task-queue.ts` → `tests/unit/queue/task-queue.test.ts`.
- **No circular imports.** Enforce with ESLint rules.

---

## 5. Module System

- Use **ESM** (`"type": "module"` in `package.json`).
- Always include `.js` extensions in relative imports (required by Node ESM resolution).
  ```typescript
  import { TaskQueue } from './queue/task-queue.js';
  ```
- Use `exports` field in `package.json` to define public API surface.

---

## 6. Code Style & Formatting

### 6.1 Tooling

- **ESLint** with `@typescript-eslint/recommended-type-checked` and `@typescript-eslint/strict-type-checked`.
- **Prettier** for formatting (single source of truth for whitespace).
- Both run on pre-commit via **lint-staged** + **husky**.

### 6.2 Rules

- Semicolons: **always**.
- Quotes: **single** (`'`).
- Trailing commas: **all** (`es5`-compatible).
- Max line length: **100** characters (Prettier `printWidth`).
- Indentation: **2 spaces**.
- Braces: **always** (even single-line `if`).
- No default exports. **Use named exports only.**
  ```typescript
  // ✅ Good
  export function processTask() {}

  // ❌ Bad
  export default function processTask() {}
  ```

---

## 7. Error Handling

- **Never swallow errors silently.** Every `catch` must log or re-throw.
- Use **custom error classes** that extend `Error` for domain errors.
  ```typescript
  export class TaskLimitExceededError extends Error {
    constructor(public readonly limit: string, public readonly value: number) {
      super(`Limit exceeded: ${limit} = ${value}`);
      this.name = 'TaskLimitExceededError';
    }
  }
  ```
- Prefer **early returns** and guard clauses over deeply nested `if/else`.
- Use `Result<T, E>` pattern for operations that can fail expectedly (no exceptions for control flow).

---

## 8. Functions & Methods

- **Small functions.** A function should do one thing. If it needs a comment to explain a section, extract that section.
- **Max 3 parameters.** Beyond that, use an options object.
  ```typescript
  // ✅ Good
  function createTask(options: CreateTaskOptions): Task {}

  // ❌ Bad
  function createTask(goal: string, status: TaskStatus, priority: number, createdAt: Date): Task {}
  ```
- **Pure functions preferred.** Isolate side effects at the edges (I/O boundaries).
- **No function overloads** unless absolutely required for public API ergonomics.

---

## 9. Testing

### 9.1 Framework

- **Jest** with `ts-jest` (ESM mode).
- Config in `jest.config.ts`.

### 9.2 Coverage Requirements

- **All files in `src/` must have corresponding unit tests** except:
  - Type-only files (`types/`)
  - Barrel re-export files (`index.ts`)
  - The CLI entry point (`main.ts`) — tested via integration tests later.
- Minimum coverage target: **80%** line coverage.

### 9.3 Test Conventions

- Test file naming: `<source-file>.test.ts` (e.g., `task-queue.test.ts`).
- Use `describe` blocks matching the class or module name.
- Use `it` (not `test`) with descriptive behavior sentences.
  ```typescript
  describe('TaskQueue', () => {
    describe('enqueue', () => {
      it('should add a task with QUEUED status', () => {});
      it('should reject tasks when queue is full', () => {});
    });
  });
  ```
- **No test interdependence.** Each test must be able to run in isolation.
- **Mock external dependencies** (file system, network, database) — never hit real services in unit tests.
- Prefer **dependency injection** over module mocking to keep tests simple.
- Use `beforeEach` for setup, avoid `beforeAll` unless initializing expensive shared read-only fixtures.

---

## 10. Documentation & Comments

### 10.1 Self-Documenting Code — No Noise

**Names are the documentation.** Function, class, method, and property names must be clear enough to understand without a comment. If a name needs a comment to explain what it does, the name is wrong — rename it.

**Do NOT add comments that restate the obvious:**

```typescript
// ❌ Bad — the name already says everything
/** Logs an informational message. */
info(message: string): void;

/** Absolute path to the logs directory. */
readonly logsDir: string;

/** Whether to reset the WhatsApp session. */
readonly resetSession: boolean;

// ✅ Good — no comment needed, the name is clear
info(message: string): void;
readonly logsDir: string;
readonly resetSession: boolean;
```

**Do NOT add JSDoc blocks on functions, classes, interfaces, or properties whose name already conveys the intent.** This includes:

- Getters/setters with obvious semantics
- Interface properties with descriptive names
- One-liner utility functions
- Constructor parameters matching field names
- `@param` / `@returns` that repeat the type signature

**When to add a comment:**

- **Non-obvious business rules** (e.g. "file transport is added only once because Winston throws on duplicates")
- **Workarounds** with a link to the issue or reason
- **Regex patterns** that are hard to read
- **Module-level doc** explaining _why_ the module exists, if the file name alone is ambiguous

```typescript
// ✅ Good — explains a non-obvious constraint
// Winston throws if you add the same transport twice, so we guard with a flag.
let fileTransportAdded = false;
```

### 10.2 README

- Keep `README.md` as the single source of truth for project overview and architecture.
- Update it when specifications change.

### 10.3 Changelog

- Maintain a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format.

---

## 11. Dependencies

- **Minimal dependencies.** Every dependency is a liability.
- Before adding a package, ask: _"Can this be done with Node.js built-in APIs in under 50 lines?"_
- Pin **exact versions** in `package.json` (no `^` or `~`).
- Keep `devDependencies` and `dependencies` strictly separated.
- Audit dependencies regularly with `npm audit`.

---

## 12. Git & Commits

- **Conventional Commits** format:
  ```
  feat(queue): add FIFO task processing
  fix(whatsapp): handle QR code timeout gracefully
  docs: update coding standards
  test(agent): add planner output parsing tests
  refactor(logger): extract JSONL formatter
  chore: update eslint config
  ```
- One logical change per commit. No "WIP" or "fix stuff" messages.
- Squash merge feature branches.

---

## 13. CLI & Package (npx) Standards

Since this project is an **npx-runnable CLI package**:

- Define `bin` field in `package.json` pointing to the compiled CLI entry.
  ```json
  {
    "bin": {
      "zeta-assistant": "./dist/cli.js"
    }
  }
  ```
- The compiled CLI entry (`dist/cli.js`) must start with the shebang:
  ```
  #!/usr/bin/env node
  ```
- Use `"files"` field in `package.json` to include only `dist/` in the published package.
- Keep startup time fast: lazy-load heavy dependencies.
- Provide `--help` and `--version` flags.
- Exit with proper codes: `0` for success, `1` for errors.
- Write user-facing messages to `stderr`; write data output to `stdout`.

---

## 14. Environment & Configuration

- Use `.env` for local secrets (e.g., `OPENAI_API_KEY`). Never commit it.
- Validate all environment variables at startup with clear error messages.
- Provide a `.env.example` with all required variables documented.
- Use the `~/.zeta/config.json` structure defined in the spec for runtime configuration.

---

## 15. Performance (When It Matters)

Performance optimization is **not a priority** unless:

- It affects user-perceived latency (e.g., CLI startup time, WhatsApp message response time).
- It causes resource exhaustion (e.g., memory leaks in a long-running session).
- It hits the defined hard limits (iterations, runtime, tokens).

When it does matter:

- **Measure before optimizing.** Use benchmarks, not assumptions.
- Prefer **streaming** over buffering for large data (logs, LLM responses).
- Use **lazy initialization** for heavy resources (SQLite connection, Puppeteer browser).
- Avoid synchronous file I/O in the main event loop.

---

## 16. Security

- Never log sensitive data (API keys, tokens, personal messages content in plain text).
- Sanitize all external input before passing to `exec`, `eval`, or script execution.
- Scripts in `~/.zeta/scripts/` run with the same permissions as the Node process — treat them as trusted but validated.
- Use `node:crypto` for any randomness needs, not `Math.random()`.

---

## 17. Summary Checklist

Before submitting any change, verify:

- [ ] All code is in English
- [ ] No `any` types
- [ ] Function parameters and return types are explicitly typed
- [ ] Named exports only (no default exports)
- [ ] File names are `kebab-case`
- [ ] No unnecessary comments — names are the documentation
- [ ] Comments only for non-obvious logic, workarounds, or regex
- [ ] Unit tests written or updated
- [ ] ESLint and Prettier pass with no warnings
- [ ] No commented-out code
- [ ] Commit message follows Conventional Commits
- [ ] Dependencies justified and pinned to exact versions

