# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | ✅        |
| < 1.0   | ❌        |

## Reporting a Vulnerability

Do not report security vulnerabilities through public GitHub issues.

**Contact**: fabian.baumgartner@dynasoft.ch

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fixes (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: Timeline depends on severity
- **Disclosure**: After fix is available

## Security Measures

This app uses Tauri's security model:

- **Permissions**: Minimal system permissions via `capabilities/`
- **IPC**: Type-safe commands via tauri-specta
- **File Access**: Scoped to app directories by default
- **CSP**: Configured in `tauri.conf.json` (strict — see below)

## For Developers

### File Operations

```rust
// ✅ Validate paths - prevent traversal attacks
if filename.contains("..") {
    return Err("Invalid filename".into());
}

// ❌ Never trust raw user input for paths
std::fs::write(user_input, data)
```

### Secrets

- Never commit secrets to version control
- Use `.env.local` (gitignored) for local secrets
- Use GitHub Secrets for CI/CD

### Dependency Audits

```bash
bun audit                      # JS deps (resolves with package.json overrides)
cargo audit --manifest-path src-tauri/Cargo.toml   # Rust deps
```

The CI workflow runs both on every push and PR. Currently:

- **`bun audit`** reports zero advisories. The `jsdom -> undici` chain is
  pinned to `^7.28.0` via the `overrides` block in `package.json` to pick up
  the upstream fix for the TLS-validation-bypass (GHSA-vmh5-mc38-953g) and
  related advisories. New advisories fail CI.

- **`cargo audit`** reports zero vulnerabilities. The 19 informational
  warnings it WOULD emit (all `unmaintained`/`unsound` on transitive
  Tauri/gtk-rs deps like `atk`, `gtk`, `glib`, `bincode 1.3.3`,
  `proc-macro-error`, `paste`, and `unic-*`) are explicitly enumerated and
  justified in `src-tauri/.cargo/audit.toml`. The full rationale for each
  ignored ID is reproduced below; re-evaluate whenever any of these crates
  is updated upstream or replaced.

### Acknowledged transitive `cargo audit` advisories

| ID                | Crate                    | Category     | Reason                                                                                                                 |
| ----------------- | ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| RUSTSEC-2024-0411 | gdkwayland-sys 0.18.2    | unmaintained | gtk-rs GTK3 bindings, transitive via muda -> gtk (Tauri 2 Linux dialog backend). Replace is an upstream Tauri concern. |
| RUSTSEC-2024-0412 | gdk 0.18.2               | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0413 | atk 0.18.2               | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0414 | gdkx11-sys 0.18.2        | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0415 | gtk 0.18.2               | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0416 | atk-sys 0.18.2           | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0417 | gdkx11 0.18.2            | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0418 | gdk-sys 0.18.2           | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0419 | gtk3-macros 0.18.2       | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0420 | gtk-sys 0.18.2           | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2024-0429 | glib 0.18.5              | unsound      | `VariantStrIter` Iterator/DoubleEndedIterator unsoundness. Collier never iterates a glib::Variant as a string.         |
| RUSTSEC-2025-0141 | bincode 1.3.3            | unmaintained | Pulled in by Tauri internals; Collier does not use bincode directly. Track upstream Tauri migration to bincode 2.      |
| RUSTSEC-2024-0370 | proc-macro-error 1.0.4   | unmaintained | Build-time only; transitive via the Tauri proc-macro stack.                                                            |
| RUSTSEC-2024-0436 | paste 1.0.15             | unmaintained | Procedural-macro token-pasting helper used by Tauri internals. Build-time only.                                        |
| RUSTSEC-2025-0075 | unic-char-range 0.9.0    | unmaintained | Static Unicode tables via the url stack on Linux. No security impact.                                                  |
| RUSTSEC-2025-0080 | unic-common 0.9.0        | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2025-0081 | unic-char-property 0.9.0 | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2025-0098 | unic-ucd-version 0.9.0   | unmaintained | Same as above.                                                                                                         |
| RUSTSEC-2025-0100 | unic-ucd-ident 0.9.0     | unmaintained | Same as above.                                                                                                         |

If `cargo audit` reports a NEW advisory ID that is not in this table,
investigate before ignoring. Adding to `audit.toml` without justification
will be flagged in review.

### Tauri capability surface (least-privilege)

Capabilities live in `src-tauri/capabilities/*.json` and grant IPC
permissions to specific webview windows. Tauri only enforces capabilities
on calls from the **webview** to Rust — Rust-side plugin usage
(e.g. `tauri_plugin_notification::NotificationExt`,
`tauri_plugin_global_shortcut::GlobalShortcutExt`) bypasses the
permission gate, so the corresponding `:default` permission is only
required when the webview actually invokes that plugin.

Reviewing each entry against the call sites in `src/` and `src-tauri/src/`
yielded this set of permissions that can be safely removed because **no
code path invokes them from the webview**:

| Removed from                   | Permission                                                                    | Why it's unused                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `capabilities/default.json`    | `fs:default`                                                                  | No `@tauri-apps/plugin-fs` import anywhere; Rust uses `std::fs` directly.                                                                                                                        |
| `capabilities/default.json`    | `fs:scope` (`$APPLOCALDATA/**`, `.beads/*.jsonl`)                             | Was provisioned for the fs plugin, which the webview never imports.                                                                                                                              |
| `capabilities/default.json`    | `log:default`                                                                 | Rust uses `tauri_plugin_log` directly; webview never calls `log()`.                                                                                                                              |
| `capabilities/default.json`    | `notification:default`                                                        | Rust `send_notification` command uses `NotificationExt` directly; webview never sends notifications.                                                                                             |
| `capabilities/default.json`    | `global-shortcut:default`                                                     | Rust registers shortcuts in `setup()`; webview never registers.                                                                                                                                  |
| `capabilities/desktop.json`    | `window-state:default`                                                        | `tauri_plugin_window_state` is server-side (auto restore); no IPC commands invoked from JS.                                                                                                      |
| `capabilities/quick-pane.json` | `core:window:allow-show`, `allow-hide`, `allow-set-focus`, `allow-is-visible` | All driven from Rust via custom `show_quick_pane` / `dismiss_quick_pane` / `is_quick_pane_visible` commands; the quick-pane webview only emits `quick-pane-submit` and listens for theme events. |

If any of these plugins are ever wired into the webview, the
corresponding capability must be re-added with the same justification
process as a new ignored advisory.

### Content Security Policy

Defined in `src-tauri/tauri.conf.json` under `app.security.csp`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' tauri: ipc: http://ipc.localhost
```

Justification for each directive:

- `default-src 'self'` — base policy. Only same-origin resources by
  default.
- `script-src 'self'` — strict; no `unsafe-inline`, no `unsafe-eval`.
  The app is built with Vite and emits hashed module scripts, so
  inline scripts are not needed. The `withGlobalTauri: true` setting
  injects `__TAURI__` via a same-origin script.
- `style-src 'self' 'unsafe-inline'` — `'unsafe-inline'` is required
  because React components (~210 inline `style={{ ... }}` props across
  the codebase, plus theme attributes set on `<html>` and `<body>`)
  apply inline styles at runtime, and Tailwind v4 ships with a runtime
  stylesheet that injects inline CSS variables. Removing this token
  breaks the UI. Hash/nonce-based inline styles would require a
  significant refactor; track that as a follow-up.
- `img-src 'self' data:` — no remote images are loaded; data URIs are
  needed for inline SVG icons. (Previously `https:` was also allowed
  here but was removed after auditing every `<img>`, `backgroundImage`,
  and `background: url(...)` — none reference external hosts.)
- `font-src 'self' data:` — the app uses system fonts (`-apple-system`,
  `SF Pro Display`, `Segoe UI`, `Roboto`) and never loaded Google
  Fonts in practice. The Google Fonts `<link>` tags in `index.html`
  were removed because the CSP above already blocks them.
- `connect-src 'self' tauri: ipc: http://ipc.localhost` — required by
  Tauri 2 IPC: `tauri:` for the `invoke()` channel, `ipc:` /
  `http://ipc.localhost` for the postMessage-style IPC bridge used by
  the auto-updater and child windows. No `https:` here means the app
  cannot fetch arbitrary remote URLs from the renderer — the updater
  (the only outbound HTTPS request) lives in Rust.

## Resources

- [Tauri Security Guide](https://tauri.app/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
