# Contributing

Thanks for your interest in contributing to Collier.

## Project Overview

Collier is a cross-platform desktop GUI for [Beads](https://github.com/beads-dev/beads) — a git-backed issue tracker for agentic workflows. It wraps the `bd` CLI in a native window so you can browse, triage, and update issues without leaving the keyboard.

The stack:

- **Tauri v2** — native shell, IPC, and bundling
- **React 19** + **TypeScript** — UI
- **Rust** (stable) — backend commands, file I/O, subprocess handling
- **Bun** — package manager and script runner
- **TanStack Query**, **Zustand**, **React Router** — state / data / routing
- **tauri-specta** — end-to-end typed bindings between Rust and TypeScript
- **Vitest** + **ast-grep** + **ESLint** + **Prettier** — tests and static analysis

The full architecture lives in `docs/developer/architecture-guide.md`.

## Prerequisites

- **Bun** ≥ 1.x — [install](https://bun.sh)
- **Rust** stable ≥ 1.82 — [rustup](https://rustup.rs) (the repo pins `stable` via `rust-toolchain.toml`)
- **Tauri v2** system dependencies for your OS — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- **Beads (`bd`)** — only required for end-to-end development against a real repo; the app shell launches without it

Node.js is **not** required. Everything runs through Bun.

## Setup

```bash
git clone https://github.com/gardenbaum/Collier.git
cd Collier
bun install
bun run dev          # Vite dev server (browser only)
bun run tauri:dev    # full desktop app in dev mode
```

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server (web only) |
| `bun run build` | Type-check + production web build |
| `bun run test` | Vitest in watch mode |
| `bun run test:run` | Vitest, single run (CI mode) |
| `bun run test:coverage` | Vitest with coverage report |
| `bun run check:all` | Full quality gate (see below) |
| `bun run fix:all` | Auto-fix lint, format, and rust clippy |
| `bun run tauri:dev` | Native window with hot reload |
| `bun run tauri:build` | Production desktop bundle |

### `check:all` — the PR gate

`bun run check:all` runs, in order:

1. `tsc --noEmit` — TypeScript type-check
2. `eslint . --max-warnings 0` — ESLint (no warnings allowed)
3. `ast:lint` — ast-grep architectural rules
4. `prettier --check .` — formatter
5. `cargo fmt --check` — Rust formatter
6. `cargo clippy -- -D warnings` — Rust lints, warnings are errors
7. `vitest run` — JS/TS test suite
8. `cargo test` — Rust test suite

A PR is mergeable only when this is green from a clean checkout.

## Branch Naming

`<type>/<scope>-<short-desc>`

Where `type` is one of:

- `feat` — new user-facing capability
- `fix` — bug fix
- `chore` — tooling, deps, housekeeping
- `test` — tests only
- `refactor` — internal restructuring with no behaviour change
- `docs` — documentation only

Examples:

```
feat/issue-detail-drawer-comments
fix/tauri-clippy-warning-on-windows
chore/renovate-cargo-auto-approval
test/useBeadsRealtimeSync-cache-guards
refactor/store-split-ui-and-domain
docs/developer-architecture-guide-2
```

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The header is:

```
<type>(<scope>): <description>
```

- Imperative mood ("add", not "added"), no trailing period
- Scope is the module or area (`ui`, `store`, `tauri`, `beads`, `ci`, `docs`)
- Body explains *why*, not *what* — the diff already shows *what*
- Footer references issues (`Closes #123`) and notes breaking changes (`BREAKING CHANGE:`)

Examples:

```
feat(issue-list): add vim-style j/k navigation
fix(tauri): handle bd subprocess exit when cwd is null
chore(deps): bump tauri to 2.4
test(useBeadsRealtimeSync): cover setQueriesData no-cache prev=undefined
```

## Pull Requests

- **One logical change per PR.** If your branch touches an unrelated file, split the commit out.
- **Pass `bun run check:all` locally** before requesting review. CI runs the same command.
- **Write tests for new behaviour.** Coverage targets: ≥ 97 % lines, ≥ 95 % branches. If you cannot hit those targets, justify the gap in the PR description.
- **Update `docs/developer/`** when you introduce or change an architecture pattern.
- **Reference an issue.** If none exists, the PR description must explain the motivation.
- **Keep the diff small.** PRs over ~600 lines of meaningful change are typically split.

Reviewers will check the [PR template](.github/PULL_REQUEST_TEMPLATE.md) checklist before approving.

## Working with Beads (`bd`)

Beads is the issue tracker this app wraps. Collier talks to it via the `bd` CLI.

**Don't manually edit Beads state.** `.beads/`, `.dolt/`, the JSONL issue store, and the Dolt database are managed by the `bd` CLI. If you need to mutate state (create / close / reopen / comment), use `bd`. If you only need to inspect state, read the JSONL or call `bd show`.

**Don't bypass the CLI from the app.** All Rust commands that touch Beads go through a single subprocess wrapper. If you find yourself shelling out to `git`, `dolt`, or writing JSONL by hand, stop and use `bd` instead.

**Versioning.** When filing bugs against Collier, include `bd --version` so we can reproduce against the exact CLI behaviour.

## Working with AI Agents

AI coding agents (Claude Code, Codex, Cursor, Hermes, etc.) must read [`AGENTS.md`](AGENTS.md) before making changes. The file pins the non-obvious rules:

- Bun, not npm
- React Compiler handles memoisation — no manual `useMemo` / `useCallback`
- Zustand selectors only, never destructure the whole store
- Tauri v2 docs only (not v1)
- `format!("{variable}")`, not positional args
- Run `bun run check:all` after non-trivial changes

Human contributors should treat the same rules as binding.

## Reporting Bugs and Requesting Features

Use the GitHub issue templates:

- [Bug report](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature request](.github/ISSUE_TEMPLATE/feature_request.md)

Security issues: **do not** file a public issue. See [`docs/SECURITY.md`](docs/SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the MIT License — see [`LICENSE.md`](LICENSE.md).