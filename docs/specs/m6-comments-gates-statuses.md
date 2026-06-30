# M6 — Comments, gates, custom statuses, performance + release

**Goal:** Ship four coupled improvements on top of M5's accessibility
pass: (1) a comments thread on the issue detail drawer ordered by
`created_at` ascending, (2) a `GatesView` GUI surface plus a
type-safe migration that lets custom statuses (registered via
`bd config set status.custom`) flow through every chip and dropdown
without code changes, (3) a performance pass for large backlogs —
`IssueListView` and `EpicView` both virtualised via
`@tanstack/react-virtual`, per-issue watcher cache patches instead
of full-list re-renders, and a bundle-size budget guard — and
(4) release-pipeline hardening: a reusable Xvfb E2E workflow, a
`commands.getAppMetadata()` Tauri command that surfaces the bundled
`tauri.conf.json` to the E2E suite, and the required GitHub secrets
documented inline, in `docs/developer/releases.md`, and in
`SECURITY.md`. Each sub-area ships its own E2E spec; this milestone
spec collects their requirements under one roof so M6 stays
auditable as a unit the way M0 / M1 / M3 / M4 / M5 were.

PR #15 carried the original commit set and PR #17 landed the four
E2E follow-up fixes; the four E2E specs under `tests/e2e/` are the
source of truth for every requirement below — no item is invented
outside what those specs assert.

## Requirements

### R-Comments — Issue detail comments thread ordered by `created_at`

`<IssueDetailView>` exposes a comments tab on the issue detail
drawer. The thread renders as a chronological list of comment rows
ordered by `created_at` ascending (oldest → newest), so the freshly
posted comment is always the LAST row in the DOM regardless of the
order `bd` returns them on the wire.

- The detail drawer mounts a Comments tab
  (`data-testid="tab-comments"`) alongside the existing tabs.
- Switching to the Comments tab fires `bd comments <id>` lazily;
  the `useCommentsQuery` is gated on `activeTab === 'comments'` so
  the request doesn't fire until the user opens the tab.
- Empty state: when `bd comments <id>` returns `[]`, the panel
  shows a "No comments yet." message and the textarea +
  submit-button are still present (proves the tab mounted and the
  form is ready to post).
- New comment posting round-trip: the user types into
  `data-testid="comment-input"`, clicks
  `data-testid="comment-submit-button"`, the mutation runs
  `bd comment <id> <body>`, the comments query is invalidated and
  refetched, and a new `data-testid="comment-row"` mounts at the
  bottom of the thread.
- Sort order invariant: the newly-posted row is the last
  `data-testid="comment-row"` in the DOM. The sort is applied as
  `[...query.data].sort(byCreatedAtAsc)` inside the component, so
  the assertion is independent of `bd`'s wire order.
- Cleanup caveat (carried over to the next spec file): `bd` does
  not ship a comment-delete subcommand, so the spec can't roll the
  fixture back to its pristine state. The CI workflow regenerates
  the fixture before every e2e job (`rm -rf /tmp/e2e-workspace &&
scripts/make-fixture.sh /tmp/e2e-workspace`), so a stale comment
  from a previous run can't leak into the next run.

E2E: `tests/e2e/m6-comments.spec.ts`. Two cases — empty state on
mount, and the post-comment round-trip including the chronological-
order assertion.

### R-Gates & custom statuses — GUI surfaces the full status catalog

`docs/CONSTITUTION.md §3` forbids hardcoding the five built-in
statuses; users can register additional custom statuses via
`bd config set status.custom` (e.g. `"review:wip,on_hold:frozen"`),
and every chip + dropdown in the GUI must surface the merged
catalog instead of the closed enum. This requirement is the GUI
half of that contract; the Rust half lives in
`src-tauri/src/beads/statuses.rs` (the wire-format change that
makes the catalog parseable) and is type-safe via the tauri-specta
binding.

- `useStatusCatalog` reads from `commands.bdStatuses()` instead of
  the closed enum. The query key is `['beads', 'statuses']`; it
  carries a 5-minute `staleTime` so an extra `bd config set` from
  a sibling shell takes up to that long to surface in the
  sidebar.
- `<Sidebar>` renders a chip per status in the catalog, including
  user-defined custom statuses. Selector:
  `data-testid="sidebar-filter-status-<name>"`. Custom-status
  names render verbatim (no Title Case mapping).
- `<StatusPill>` on issue rows carries the wire status name via
  `data-status="<name>"` and `data-testid="status-pill"` so an
  operator who has configured a workflow with custom statuses sees
  those values end-to-end without a renderer change.
- `<GatesView>` is a new sidebar tab (`data-testid="sidebar-view-gates"`)
  - a `ViewsRouter` case + i18n for `en` / `de` / `fr` / `ar`. The
    view reads from `commands.bdGateList(cwd, includeClosed)` and
    renders the gate definitions + pass / fail state. Custom-status
    bug-fix follow-ups (PR #17) added the bd-1.0.4 envelope-unwrap
    helper (`parse_statuses_envelope`) and the `__collierQueryClient__`
    E2E handle so the spec can invalidate the catalog query after a
    `bd config set` lands without waiting out the 5-minute staleTime.
- Type-safe migration: the bd wire-format change is pinned via
  tauri-specta's `#[serde(rename_all = "camelCase")]` pass on the
  Rust side; the TypeScript bindings under `src/lib/bindings.ts`
  are the source of truth on the renderer side. The Rust unit
  tests (`statuses` module) cover the unwrap; the React unit tests
  (`useStatusCatalog.test.tsx`) cover the catalog consumer.

E2E: `tests/e2e/m6-custom-status.spec.ts`. Two cases — the
custom-status chip surfaces in the sidebar after a view switch
that triggers a refetch, and a `bd create` + `bd update --status`
round-trip lands the custom status on a row's `StatusPill`
(asserted via the TanStack cache, since the virtualised list never
mounts the marker row in the viewport).

### R-Performance — Large backlog stays smooth via virtualisation

`docs/CONSTITUTION.md §1` marks "Performance is a feature." Any
list / tree that can exceed ~200 rows MUST be virtualised (only
viewport nodes mount); watcher events must trigger _targeted_ store
updates, never full-list re-renders. M6's performance card asks
the app to stay smooth with a large backlog.

- New `scripts/make-large-fixture.sh` seeds 1200 Beads issues
  (120 epics + 480 epic children + 600 standalones) into
  `/tmp/e2e-workspace-large` via a single `bd import` +
  `bd dep add --file` loop. CI registers the large fixture in
  `~/.beads/registry.json` so the workspace switcher can target it.
- `<IssueListView>` is virtualised via `@tanstack/react-virtual`.
  The DOM must stay well under the 200-row ceiling (the spec asserts
  < 100 mounted rows even when the list carries 1200 issues).
- `<EpicView>` is virtualised via `@tanstack/react-virtual`. Sizing
  constants (`DEFAULT_CONTAINER_HEIGHT`, `COLLAPSED_ROW_HEIGHT`,
  `OVERSCAN`) are extracted to
  `src/components/beads/views/epicViewSizing.ts` so the
  react-refresh lint rule can keep the component file pure. The
  spec asserts < 50 mounted epic rows in the DOM.
- Virtualizer reactivity: scrolling past the first viewport slice
  mounts a different row set in the DOM (proves the virtualizer is
  reacting to scroll, not pinned to the first window). The DOM
  row count stays bounded after the scroll — no unmount / remount
  storm.
- `useBeadsRealtimeSync` patches per-issue cache entries
  (`['beads', 'list', ...]` and `['beads', 'show', cwd, id]`) on
  watcher ticks instead of triggering a broad `['beads']`
  invalidation. Unrelated rows MUST NOT re-render.
- Bundle-size guard (`scripts/check-bundle-size.js`) asserts the
  initial payload is < 600 KB gzipped and the total bundle is
  < 4 MB gzipped. Current numbers (≈257.7 / 258.8 KB initial) leave
  ~2× headroom for future feature additions.

E2E: `tests/e2e/m6-perf-large-backlog.spec.ts`. Four cases —
1200-issue footer count + DOM bounded, scroll-past-first-slice
re-mounts later rows, clicking a visible row opens the issue
detail drawer, and the Epic view keeps the tree DOM bounded at the
viewport slice.

### R-Release hardening — Pipeline contract pinned end-to-end

Until M6 the bundled `tauri.conf.json` lived only inside the
binary; a release that accidentally pointed the auto-updater at the
wrong GitHub repo, stripped the pubkey, or carried the wrong
version shipped silently. This requirement is the end-to-end
contract that closes that gap.

- New Tauri command `commands.getAppMetadata()` (see
  `src-tauri/src/commands/app_metadata.rs`) surfaces the bundled
  `tauri.conf.json` to the renderer. The VITE_E2E diagnostic
  handle `__collierAppMetadata__` (populated by `main.tsx` on the
  `__collierAppMetadataReady__` promise) exposes it on `globalThis`
  with the camelCased shape:
  `{ name, version, identifier, updaterEndpoint, updaterActive,
pubkeyFingerprint, buildRunNumber }`.
- The bundled `version` matches the committed `package.json` AND
  the committed `src-tauri/tauri.conf.json` (closes the gap where
  the vitest version-sync guard reads the source tree and the
  binary is built from that source — the E2E check reads back from
  the running app).
- The bundled `identifier` matches `tauri.conf.json::identifier`
  (`com.gardenbaum.collier`).
- The bundled `name` matches `tauri.conf.json::productName`
  (`Collier`).
- Updater is active: `metadata.updaterActive === true`,
  `metadata.updaterActive === tauriConfig.updater.active`, and
  `tauriConfig.bundle.createUpdaterArtifacts === true`.
- The updater endpoint is pinned to
  `https://github.com/gardenbaum/Collier/releases/latest/download/latest.json`
  (no fork, no staging host — a wrong endpoint silently misroutes
  user updates, so this is the most important assertion in the
  spec).
- `pubkeyFingerprint` is a non-null 16-char hex string (SHA-256
  prefix of the configured pubkey). The E2E spec accepts the
  `REPLACE_WITH_*` placeholder with a `console.warn` so the
  operational gap is visible in the CI log without blocking the
  merge (see "Operational debt" below).
- New reusable workflow `.github/workflows/e2e.yml` is the single
  source of truth for the Xvfb harness; both `ci.yml` and
  `release.yml` call it. `release.yml` is gated on `check:all` AND
  the Xvfb E2E workflow.
- Required GitHub secrets documented:
  - inline in `.github/workflows/release.yml`,
  - in `docs/developer/releases.md` (the `Initial Setup` section),
  - in `docs/SECURITY.md` (the security-policy table).
- `CHANGELOG.md` is backfilled with both the M5 entry (ARIA grid /
  tree / modal / vim-style keyboard navigation) and the M6 entry
  (comments / custom statuses / GatesView / large-backlog perf /
  release hardening).

E2E: `tests/e2e/m6-release-hardening.spec.ts`. Seven cases — the
metadata handle exposes the bundled config, the bundled version /
identifier / name all match the source-tree values, the updater is
active, the endpoint points at the configured GitHub repo, and the
pubkey is real (not the placeholder). The unit tests under
`src/lib/release-pipeline.test.ts` pin the same contract from the
source-tree side.

## Operational debt

- **`src-tauri/tauri.conf.json::plugins.updater.pubkey` still
  carries the `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`
  placeholder.** Until an operator generates a real signing key
  (the public-key half of `TAURI_PRIVATE_KEY`), the unit test in
  `src/lib/release-pipeline.test.ts` accepts the placeholder and
  emits a `console.warn`, and the matching E2E check in
  `tests/e2e/m6-release-hardening.spec.ts` accepts the same state
  with the same warning. The auto-updater at runtime will reject
  every `latest.json` signature without a real pubkey, so this is
  a **blocking item before the next tagged release**. Procedure
  documented in `docs/developer/releases.md → "Initial Setup"`.

- **Stale cross-reference to `docs/specs/m6-foundation.md`.** _(Resolved.)_
  M6 was documented here as a single spec rather than split into
  per-card specs, so the planned `m6-foundation.md` was never
  committed. Three pointers — the JSDoc preamble of
  `tests/e2e/m6-release-hardening.spec.ts`, the JSDoc "Spec:" line
  in `src/lib/release-pipeline.test.ts`, and the dangling "See
  …" link at the end of the Gates-GUI bullet in `CHANGELOG.md` —
  cited it anyway. Rewritten to point at this spec instead.

## What's NOT in M6

- **BD wire-format changes.** M6 hardens the rendering of
  user-defined statuses; it does not add new bd commands or modify
  the `.beads/issues.jsonl` schema. Future bd features land via
  their own cards.
- **Optimistic UI for external mutations beyond realtime sync.**
  M4 R10 patches the cache on `bd update` from sibling shells; M6
  does not add an "unsaved local change" warning. Out of scope;
  would belong on a separate card if a user ever asks for it.
- **Tauri-side pubkey generation / key rotation automation.** The
  unit + E2E tests assert the config state; they do not generate
  or rotate keys. Operators follow `docs/developer/releases.md`
  for key lifecycle.
- **Live-region announcements on virtualised row changes.** M5
  deferred this to a separate card (TanStack Virtual's
  rangeExtractor integration); M6 does not bring it back.
- **Custom gate evaluation / authoring in the GUI.** M6
  scaffolds the `GatesView` (renders gate definitions + pass /
  fail state from `commands.bdGateList`); authoring new gate
  definitions via the GUI is a follow-up card.
- **Per-card specs (m6-foundation, m6-comments-only, …).** All
  M6 requirements live in this single file. If the project
  later wants per-card specs, each requirement section above
  carries its own E2E pointer and can be lifted out without
  rewriting the content.
