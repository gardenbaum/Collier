---
name: Feature Request
about: Propose a new capability or change to existing behaviour
title: 'feat: '
labels: ['enhancement']
---

## Problem / Use Case

What are you trying to do? Describe the workflow, the pain point, and how often you hit it. If this solves a problem with the underlying Beads CLI rather than Collier itself, note that — Collier delegates to `bd` wherever possible.

## Proposed Behaviour

What should Collier do? Be specific:

- Where does the UI surface live? (sidebar tab, issue detail drawer, modal, settings, command palette, etc.)
- What `bd` command(s) does it wrap? (e.g. `bd ready`, `bd dep add`, `bd gate list`)
- Are there new permissions / capabilities needed in `src-tauri/capabilities/`?
- Keyboard shortcuts, labels, icons — anything user-visible

If you have a sketch, mockup, or terminal transcript, attach it.

## Alternatives Considered

What else did you look at?

- A different UI placement
- Doing it through the existing command palette
- A `bd` feature request instead (Beads is upstream — link it if so)
- An external script / shell alias

## Scope / Impact

- **Effort**: small / medium / large — your best guess
- **Surface area**: which subsystems it touches (React, Rust commands, IPC, capabilities, i18n keys, tests)
- **Breaking changes**: does it change existing behaviour, keybindings, or data shapes?
- **i18n**: does it need translations for en / de / fr / ar?
- **Tests**: which test layer covers it (unit / component / E2E / Rust)?

## Notes

Related issues, prior art in other Beads GUIs, screenshots, anything else.
