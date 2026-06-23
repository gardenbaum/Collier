# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-23

First public release of Collier, a cross-platform desktop GUI for
[Beads](https://github.com/steveyegge/beads).

### Added

- Cross-platform desktop app (macOS / Windows / Linux) built with
  Tauri v2, React 19 and TypeScript.
- Beads issue tracker UI: issue list with filtering, drawer-based
  detail view, label management, ready/closed/blocked views.
- `bd` CLI integration via a Tokio-backed Rust runner with a 10 s
  per-invocation timeout, write-locked per repo path, and a
  structured `BdError` envelope surfaced to the renderer.
- Live `.beads/` file-system watcher that pushes invalidation events
  to the React tree via Tauri events.
- Three-layer state management (`useState` → Zustand → TanStack Query)
  with ast-grep rules enforcing the pattern.
- Type-safe Rust ⇄ TypeScript command bridge via tauri-specta
  (`export_bindings` test target).
- Command palette (`Cmd+K`), platform-aware keyboard shortcuts,
  native menus (File / Edit / View) with i18n strings.
- Quick pane floating window with global shortcut and macOS NSPanel
  fullscreen overlay behavior.
- Preferences dialog with Rust-side persistence, icon-strip navigation,
  backdrop-blur surfaces, and a new section header.
- Collapsible left/right sidebars with resizable panels and state
  persistence.
- Light/dark theme system with OS preference detection, synced across
  windows.
- Toast notifications via Sonner plus native OS notifications.
- Auto-updater wired through the Tauri updater plugin and GitHub
  Releases (`latest.json` + `.sig`).
- Internationalization with English / German / French / Arabic and RTL
  support; CI asserts 4-locale parity.
- Static-analysis toolchain: ESLint (`--max-warnings 0`), Prettier,
  ast-grep (architecture rules), knip (unused code), jscpd
  (duplication), React Compiler, Rust clippy (`-D warnings`),
  rustfmt, Vitest with coverage thresholds.
- Single quality gate `bun run check:all` covering typecheck, lint,
  ast-grep, format, rustfmt, clippy, vitest, and `cargo test`.
- GitHub Actions CI running `bun run check:all` on every PR and push
  to `main`.
- GitHub Actions release workflow gated on `bun run check:all`,
  building Tauri bundles for macOS (`.dmg`), Windows (`.msi`) and
  Linux (`.AppImage`), and publishing a draft GitHub Release.

### Security

- Strict Content-Security-Policy in `tauri.conf.json` (no remote
  scripts, no `https:` in `img-src`, no Google Fonts preload).
- Least-privilege Tauri capabilities: `fs`, `log`, `notification`,
  `global-shortcut`, `mcp-bridge` and `window-state` removed from the
  capability surface because the webview never invokes them; quick-pane
  window show/hide/focus driven exclusively from Rust.
- JS dependency audit: zero advisories; `undici` overridden to
  `^7.28.0` to pick up the upstream fix for GHSA-vmh5-mc38-953g.
- Rust dependency audit: zero vulnerabilities; 19 documented
  transitive exceptions (gtk-rs, glib, bincode 1.3.3,
  proc-macro-error, paste and the unic family) recorded in
  `src-tauri/.cargo/audit.toml` and `docs/SECURITY.md`.

[Unreleased]: https://github.com/gardenbaum/Collier/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gardenbaum/Collier/releases/tag/v0.1.0
