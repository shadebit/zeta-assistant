# Zeta Assistant – AI Context Document

> **All AI assistants MUST read and follow these documents when working on this codebase.**

## Required Reading

You MUST read and follow ALL of the following files before making any changes:

| Document | Purpose |
|---|---|
| [`README.md`](README.md) | Project overview, tech stack, structure, how to run |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Coding standards, naming conventions, testing, best practices |
| [`docs/prd.md`](docs/prd.md) | Full product requirements, technical spec, roadmap |

## Key Rules (Quick Reference)

- **Language:** All code, comments, commits, and docs in English
- **TypeScript:** `strict: true`, no `any`, explicit types, `import type` for type-only imports
- **Naming:** `kebab-case` files, `PascalCase` classes/types, `camelCase` functions/vars
- **Exports:** Named only — no default exports
- **Testing:** Jest, `it` blocks, 80%+ coverage, mock external deps
- **Deps:** Minimal, pinned exact versions
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`)
- **Modules:** ESM with `.js` extensions in relative imports
- **Errors:** Never swallow silently — log or re-throw
- **Comments:** No obvious comments. Names are the documentation. Comment only non-obvious logic.
