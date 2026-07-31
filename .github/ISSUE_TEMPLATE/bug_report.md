---
name: Bug Report
about: Something Collier does is broken, wrong, or unexpected
title: "bug: "
labels: ["bug"]
---

## Summary

A clear, one-sentence description of the bug.

## Steps to Reproduce

1.
2.
3.

The smallest reproducer wins. If it requires a specific Beads state, say so and include the relevant commands (`bd init`, `bd create ...`, etc.).

## Expected Behaviour

What you expected to happen.

## Actual Behaviour

What actually happened. Include the exact text of any error message, toast, or console output.

## Environment

| | |
| --- | --- |
| Collier version | (from the About dialog, or `git rev-parse HEAD`) |
| Beads (`bd`) version | output of `bd --version` |
| OS | (e.g. macOS 15.2, Ubuntu 24.04, Windows 11 23H2) |
| Tauri / webview | (e.g. WebKit 618, Edge 131) — visible in dev tools |
| Install method | (release DMG/MSI/AppImage, `bun run tauri:dev`, packaged build) |
| Beads repo state | (clean init, existing project, monorepo, etc.) |

## Logs / Screenshots

- DevTools console: enable via the in-app toggle (or `Ctrl+Shift+I` / `Cmd+Opt+I`) before reproducing
- Rust-side logs: stdout / stderr from `bun run tauri:dev`
- `~/.local/share/com.dynasoft.collier/logs/` (Linux) / `~/Library/Logs/com.dynasoft.collier/` (macOS) / `%APPDATA%\com.dynasoft.collier\logs\` (Windows)

Attach anything that helps: screenshots, screen recordings, log files.

## Notes

Anything else that might be relevant — first occurrence vs. intermittent, related issues, workarounds you've found.