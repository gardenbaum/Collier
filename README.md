# Collier

Collier is a cross-platform desktop application that provides a graphical user interface for **Beads**. Built with **Tauri v2**, **React**, and **TypeScript**, following opinionated patterns that help both human developers and AI coding agents build well-architected apps.

## Why This Template?

Most Tauri starters give you a blank canvas. This template gives you a **working application** with patterns already established:

- **Type-safe Rust-TypeScript bridge** via tauri-specta.
- **Performance patterns enforced by tooling** - all the usual linting plus ast-grep for common anti-patterns
- **Multi-window architecture** already working (quick pane with global shortcut as a demo)
- **Cross-platform ready** with platform-specific title bars, window controls, and native menu integration
- **i18n built-in** with RTL support

## Stack

| Layer    | Technologies                                    |
| -------- | ----------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 7                    |
| UI       | shadcn/ui v4, Tailwind CSS v4, Lucide React     |
| State    | Zustand v5, TanStack Query v5                   |
| Backend  | Tauri v2, Rust                                  |
| Testing  | Vitest v4, Testing Library                      |
| Quality  | ESLint, Prettier, ast-grep, knip, jscpd, clippy |

## What's Already Built

The template includes a working application with these features implemented:

### Core Features

- **Command Palette** (`Cmd+K`) - Searchable command launcher with keyboard navigation
- **Quick Pane** - Global shortcut (`Cmd+Shift+.`) opens a floating window from any app, even fullscreen. Uses native NSPanel on macOS for proper fullscreen overlay behavior.
- **Keyboard Shortcuts** - Platform-aware shortcuts with automatic menu integration
- **Native Menus** - File, Edit, View menus built from JavaScript with full i18n support
- **Preferences System** - Settings dialog with Rust-side persistence, React hooks, and type-safe access throughout
- **Collapsible Sidebars** - Empty left and right sidebars with state persistence via resizable panels
- **Theme System** - Light/dark mode with system preference detection, synced across windows
- **Notifications** - Toast notifications for in-app feedback, plus native system notifications
- **Auto-updates** - Tauri updater plugin configured with GitHub Releases integration and update checking on launch
- **Logging** - Structured logging utilities for both Rust and TypeScript with consistent formatting
- **Crash Recovery** - Emergency data persistence for recovering unsaved work after unexpected exits

### Architecture Patterns

- **Three-layer state management** - Clear decision tree: `useState` (component) → `Zustand` (global UI) → `TanStack Query` (persistent data "not owned by the app)
- **Event-driven Rust-React bridge** - Menus, shortcuts, and command palette all route through the same command system
- **React Compiler** - Automatic memoization means no manual `useMemo`/`useCallback` needed

### Cross-Platform

| Platform | Title Bar            | Window Controls | Bundle Format |
| -------- | -------------------- | --------------- | ------------- |
| macOS    | Custom with vibrancy | Traffic lights  | `.dmg`        |
| Windows  | Custom               | Right side      | `.msi`        |
| Linux    | Native + toolbar     | Native          | `.AppImage`   |

Platform detection utilities, platform-specific UI strings ("Reveal in Finder" vs "Show in Explorer"), and separate Tauri configs per platform are all set up.

### Developer Experience

- **Type-safe Tauri commands** - tauri-specta generates TypeScript bindings from Rust, with full autocomplete and compile-time checking
- **Static analysis** - ESLint, Prettier, ast-grep (architecture enforcement), knip (unused code), jscpd (duplication)
- **Single quality gate** - `bun run check:all` runs TypeScript, ESLint, Prettier, ast-grep, clippy, and all tests
- **Testing patterns** - Vitest setup with Tauri command mocking

## Tauri Plugins Included

| Plugin            | Purpose                          |
| ----------------- | -------------------------------- |
| single-instance   | Prevent multiple app instances   |
| window-state      | Remember window position/size    |
| fs                | File system access               |
| dialog            | Native open/save dialogs         |
| notification      | System notifications             |
| clipboard-manager | Clipboard access                 |
| global-shortcut   | System-wide keyboard shortcuts   |
| updater           | In-app auto-updates              |
| opener            | Open URLs/files with default app |
| tauri-nspanel     | macOS floating panel behavior    |

## AI-Ready Development

This template is designed to work well with AI coding agents like Claude Code:

- **Comprehensive documentation** in `docs/developer/` covering all patterns. Human readable but really designed to explain the "why" of certain patterns to AI agents. Not slop.
- **Claude Code integration** - Custom commands (`/check`, `/cleanup`) and a couple of specialized agents
- **Sensible file organization** - React code in `src/` with clear separation (components, hooks, stores, services), Rust in `src-tauri/src/` with modular command organization. Predictable structure for both humans and AI.

## Getting Started

### Prerequisites

- **Node.js** ≥ 20 (`node -v`) — required by the Vite/vitest toolchain
- **[Bun](https://bun.sh)** ≥ 1.2 — used for installs, scripts and the
  CI quality gate (`bun install`, `bun run ...`). This project does not
  use `npm`.
- **Rust** stable (≥ 1.82) — install via [rustup](https://rustup.rs/).
  `rust-toolchain.toml` pins the channel to `stable`.
- **Platform Tauri v2 build dependencies** — see
  <https://tauri.app/start/prerequisites/> for the current list. The CI
  workflow installs the Linux set on every run; locally you need them
  too:
  - **macOS**: `xcode-select --install`
  - **Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
    plus the WebView2 runtime
  - **Linux**: `build-essential`, `libssl-dev`, `pkg-config`,
    `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`,
    `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `librsvg2-dev`,
    `libxdo-dev`

### Quick Start

```bash
git clone https://github.com/gardenbaum/Collier.git
cd Collier
bun install
bun run dev          # starts Vite + opens Tauri dev window
```

`bun run dev` launches Vite on `http://localhost:1420` and starts the
Tauri shell. TypeScript, Rust and tauri-specta bindings are all wired
through the same command.

### Development Commands

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `bun run dev`           | Vite dev server + `tauri dev` window                             |
| `bun run build`         | Type-check + production Vite build (frontend only)               |
| `bun run tauri:dev`     | Tauri dev window (same as `bun run dev`)                         |
| `bun run tauri:build`   | Local Tauri bundle for the current platform                      |
| `bun run check:all`     | **Single quality gate** — see below                              |
| `bun run fix:all`       | Auto-fix the lintable subset (eslint, prettier, rustfmt, clippy) |
| `bun run test:run`      | Vitest unit suite                                                |
| `bun run test:coverage` | Vitest with V8 coverage report (thresholds enforced)             |
| `bun run rust:test`     | `cargo test` for the Rust crate                                  |
| `bun run knip`          | Detect unused files / exports                                    |
| `bun run jscpd`         | Detect duplicated code                                           |

The quality gate `bun run check:all` runs, in order: typecheck, ESLint
(`--max-warnings 0`), ast-grep, Prettier (`--check`), rustfmt
(`--check`), `cargo clippy -- -D warnings`, Vitest, and `cargo test`.
It MUST exit 0 on every PR and before any release; the release
workflow gates on it.

### Building a Local Bundle

```bash
bun install
bun run tauri:build
```

This produces a platform-specific bundle in `src-tauri/target/release/bundle/`:

- **macOS**: `.app` and `.dmg`
- **Windows**: `.msi`
- **Linux**: `.AppImage` (and `.deb` if `dpkg` is available)

Signing and notarization are not configured for local builds — see the
Release section below for the GitHub Actions path.

### Continuous Integration

Every PR and every push to `main` runs `.github/workflows/ci.yml`:

- **`check`** — `bun run check:all` on `ubuntu-latest` (typecheck, lint,
  format, rustfmt, clippy, vitest, cargo test).
- **`e2e`** — the shared Xvfb + tauri-driver + WebdriverIO harness
  (`.github/workflows/e2e.yml`).
- **`build-check`** — `bun run tauri:check` (full Rust compile +
  frontend bundle, but no platform installer) on `macos-latest` and
  `windows-latest`. Catches MSVC / universal-binary / webkit2gtk
  surprises before merge.
- **`build-bundles`** — full `tauri-action` matrix on push to `main`
  only (`.dmg`, `.msi`, `.AppImage`). Bundles are uploaded as
  90-day workflow artifacts (`collier-macos`, `collier-windows`,
  `collier-linux`) so maintainers can grab an internal build without
  cutting a tag. Skipped on PRs because PR builds have no signing
  keys and would waste ~30 minutes of CI per platform.

For ad-hoc cross-platform smoke tests between tags, dispatch
**`.github/workflows/build.yml`** from the Actions tab with a
`platforms` input (e.g. `macos,windows`).

### Release Process

Releases are tag-driven: pushing a `v*` tag (or running the workflow
via `workflow_dispatch`) triggers `.github/workflows/release.yml`,
which first runs `bun run check:all` and then builds per-platform
bundles with [`tauri-action`](https://github.com/tauri-apps/tauri-action),
publishing a **draft** GitHub Release.

1. **One-time repository setup** — add the secrets listed below under
   _Required GitHub Actions secrets_.
2. **Bump the version** in three places (the `release:prepare` script
   does this for you):
   - `package.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
   - `src-tauri/tauri.conf.json` → `version`
3. **Commit, tag, push**:

   ```bash
   bun run release:prepare v1.2.3   # updates versions, runs check:all
   git push origin chore/production-ready --tags   # or merge to main first
   ```

4. **Publish the draft** — once the workflow finishes, open the draft
   release on GitHub and click _Publish_. Existing users receive the
   new version via the Tauri updater on their next launch.

#### Required GitHub Actions secrets

| Secret name                          | Purpose                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `TAURI_PRIVATE_KEY`                  | Content of the signing key generated by `tauri signer generate` (see below).                  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password that protects `TAURI_PRIVATE_KEY`. Leave empty if you generated the key without one. |
| `GITHUB_TOKEN`                       | Provided automatically by GitHub Actions; used to create the Release and upload assets.       |

These are mapped to the env vars that `tauri-action` expects inside
`.github/workflows/release.yml`:

```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

#### Generating the updater key pair

The Tauri updater signs each release so that existing installations
can verify the update before applying it. The key pair is generated
once and the **private key never leaves CI**:

```bash
# Locally, with @tauri-apps/cli installed (or via `bunx`):
bunx @tauri-apps/cli signer generate -w ~/.tauri/collier.key
# → saves the private key to ~/.tauri/collier.key (or your chosen path)
# → prints the public key on stdout
```

1. Copy the entire contents of `~/.tauri/collier.key` into the
   `TAURI_PRIVATE_KEY` GitHub secret (Settings → Secrets and variables
   → Actions → _New repository secret_).
2. If you set a password during generation, store it in
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Copy the printed public key into
   `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`,
   replacing the current `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`
   placeholder. The public key is safe to commit.

The endpoint `plugins.updater.endpoints` must point at the same
GitHub Releases path the workflow uses (`includeUpdaterJson: true`
emits `latest.json` next to the platform bundles). For a fork, update
both the endpoint URL and the bundle `publisher`/`identifier` fields
to match the new repository.

#### Manual release (no `release:prepare` script)

```bash
# 1. bump versions in package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json
bun run check:all
git add .
git commit -m "chore: release v1.2.3"
git tag v1.2.3
git push origin main --tags
```

### Auto-Update System

The app checks for updates 5 seconds after launch by fetching
`latest.json` from the endpoint configured in
`tauri.conf.json` and verifying the signature against the bundled
public key. If a valid newer release is found, the user is prompted
to download and install it, then optionally restart. A manual check
is also available via the _App → Check for Updates_ menu item and the
_Check for Updates_ command in the command palette.

See [docs/developer/releases.md](docs/developer/releases.md) for the
implementation details and the upstream-updater-flow diagram.

## Documentation

- **[Developer Docs](docs/developer/)** - Architecture, patterns, and detailed guides
- **[User Guide](docs/userguide/)** - End-user documentation template
- **[Using This Template](docs/USING_THIS_TEMPLATE.md)** - Setup and workflow guide
- **[CHANGELOG.md](CHANGELOG.md)** - Release notes (Keep a Changelog format)
- **[SECURITY.md](docs/SECURITY.md)** - Vulnerability reporting and security model

## License

[MIT](LICENSE.md)

---

Built with [Tauri](https://tauri.app) | [shadcn/ui](https://ui.shadcn.com) | [React](https://react.dev)
