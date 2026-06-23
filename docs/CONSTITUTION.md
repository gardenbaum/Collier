# Collier Constitution

Project-wide, non-negotiable principles. **Every kanban card must obey this file.**
Collier is a production-ready, performant Tauri desktop GUI for the **Beads** issue
tracker (`bd`), built as a replacement for the unmaintained **Beadbox**. Scope:
Beadbox feature parity **+** Collier's existing extras.

## 1. Architecture invariants

- **`bd` is the single source of truth.** All _mutations_ go through the `bd` CLI
  (matches Beadbox; avoids schema drift). Reads MAY use direct `.beads/` JSONL for
  speed, but results must reconcile with `bd` output. **Never write `.beads/` files directly.**
- **Type-safe bridge:** Rust↔TS via tauri-specta; keep `bindings.rs`/generated TS in sync. No hand-rolled IPC types.
- **State:** server state via TanStack Query; UI state via Zustand. No prop-drilling of server state; no duplicate sources of truth.
- **Performance is a feature.** Any list/tree that can exceed ~200 rows MUST be virtualized (`@tanstack/react-virtual`). Watcher events must trigger _targeted_ store updates, never full-list re-renders. Debounce file-watcher → store.
- **Real-time:** Rust file-watcher → Tauri events → targeted React store updates (~1s end-to-end).
- **UI:** shadcn/ui + Tailwind v4 + Lucide; follow existing component patterns in `src/components`. All user-facing strings via i18n (RTL-safe). Errors surface via existing toast/ErrorBoundary — never swallowed.

## 2. Quality gate (hard, enforced by CI)

- `bun run check:all` MUST exit 0: typecheck, eslint `--max-warnings 0`, ast-grep, prettier, rustfmt, clippy `-D warnings`, vitest, cargo test.
- **Pre-empt these eslint rules** (do not generate violations): no non-null assertions (`!`), no empty functions (`() => {}` → `() => undefined`), `interface` not `type` alias, `T[]` not `Array<T>`, type-only imports use `import type`.
- **Test contract per feature:** add/extend a Vitest unit/integration test **and** an Xvfb E2E test. Coverage thresholds (≥60% branches, in `vitest.config.ts`) must never regress.
- **Do not weaken** configs, thresholds, or rules to pass. Fix the code. If a test is genuinely wrong, fix it and justify in the commit body.

## 3. Beads data-model invariants

- Issue IDs are hash-based (`bd-a1b2`); **never fabricate or guess IDs** — always use IDs returned by `bd`.
- Statuses: `open, in_progress, blocked, deferred, closed` (+ user-defined custom statuses — never hardcode the list; read it from bd).
- Dependency types: `blocks, parent-child, related, discovered-from` (+ tracks, supersedes, …). Respect `bd`'s cycle checks; never create cycles.
- `bd ready` = work with no _open_ blockers (NOT the same as `status=open`). Epics = parent-child trees; epic progress = closed children / total children.
- Always call `bd` with `--json` for programmatic use; parse defensively (schema may evolve — `check_schema_version` exists).

## 4. Process

- Specs in `docs/specs/<milestone>.md` are **authoritative**; each card cites the requirement(s) it implements.
- **One bounded concern per card.** If a card can't finish within budget, **split it** — never weaken acceptance criteria to "finish".
- Conventional Commits (English), small logical commits, push to the milestone branch. Only the milestone's _finalize_ card opens the PR.
- Tooling: use absolute `/cli/bin/gh` for GitHub; `bd` for all Beads operations; `bun` for JS; wrapper `cargo`/`clippy` for Rust.
- Build foundation before layers (topological): a feature card may assume its declared dependency cards are merged on the milestone branch.
