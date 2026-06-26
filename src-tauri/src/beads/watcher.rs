//! Beads directory filesystem watcher.
//!
//! Watches `<repo>/.beads/` for changes to `*.jsonl` files and emits
//! targeted Tauri events so the React layer can patch its TanStack
//! Query cache in-place (no broad `['beads']` invalidation, no
//! full-list re-render). See `docs/specs/m4-realtime-sync.md` (R10).
//!
//! Event surface:
//!
//! | Event                  | Payload                                | When                                |
//! | ---------------------- | -------------------------------------- | ----------------------------------- |
//! | `beads-data-changed`   | `{ repo_path, timestamp }`             | Every JSONL touch (legacy + toast). |
//! | `beads-data-reset`     | `{ repo_path, count }`                 | First time we see this repo.        |
//! | `beads-issue-created`  | `{ repo_path, issue }`                 | New ID in JSONL.                    |
//! | `beads-issue-updated`  | `{ repo_path, issue }`                 | Existing ID with a changed payload. |
//! | `beads-issue-deleted`  | `{ repo_path, issue_id }`              | ID vanished from JSONL.             |
//!
//! The first event for a given repo is always `beads-data-reset` —
//! the watcher has no baseline yet, so we can't emit per-issue
//! diffs without back-filling the React cache anyway. The React
//! side responds to `beads-data-reset` with a single broad
//! invalidation, then switches to the targeted cache patches for
//! every subsequent event.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::beads::Issue;

/// Event payload emitted to the React layer on any change to the
/// `.beads/*.jsonl` files. The frontend uses this only as a signal
/// for the "Data refreshed" toast — the actual data updates flow
/// through the targeted `beads-issue-*` events below.
#[derive(Debug, Clone, Serialize)]
pub struct BeadsDataChangedPayload {
    pub repo_path: String,
    pub timestamp: i64,
}

/// Emitted once per repo, the first time the watcher observes it
/// (no baseline yet). The React side falls back to a broad
/// `['beads']` invalidation for this single event so the existing
/// queries settle without us having to back-fill every cache
/// variant.
#[derive(Debug, Clone, Serialize)]
pub struct BeadsDataResetPayload {
    pub repo_path: String,
    pub count: usize,
}

/// Per-issue targeted event payload. `issue` carries the full
/// parsed `Issue` so the React side can populate list + show caches
/// without an extra round trip to Rust.
#[derive(Debug, Clone, Serialize)]
pub struct BeadsIssuePayload {
    pub repo_path: String,
    pub issue: Issue,
}

/// Payload for `beads-issue-deleted`. We only ship the ID because
/// the React side needs to drop the cached entry — the full Issue
/// would just be discarded.
#[derive(Debug, Clone, Serialize)]
pub struct BeadsIssueDeletedPayload {
    pub repo_path: String,
    pub issue_id: String,
}

/// One entry in the diff result computed by
/// [`diff_snapshot`] against the current `.beads/issues.jsonl`.
#[derive(Debug, Clone, PartialEq)]
pub enum IssueChange {
    /// ID present in the new read but not in the baseline.
    Created(Issue),
    /// ID present in both, but the parsed `Issue` changed.
    Updated(Issue),
    /// ID present in the baseline but absent from the new read.
    Deleted(Issue),
}

/// In-memory baseline of every issue ID the watcher has seen for
/// the active repo. Cloned cheaply via `Arc` so the watcher
/// callback can grab a handle at thread start and the debouncer
/// thread can keep diffing without holding the parent's lock.
#[derive(Debug, Clone)]
pub struct WatcherSnapshot {
    inner: Arc<Mutex<HashMap<String, Issue>>>,
}

impl WatcherSnapshot {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// True iff we have ever seeded the baseline with at least one
    /// issue. Used by the watcher to decide between the
    /// `beads-data-reset` event (no baseline) and the targeted
    /// per-issue events (baseline established).
    pub fn is_seeded(&self) -> bool {
        // Even an empty JSONL is a valid baseline — the test for
        // "have we ever diff'd this repo" is "did we ever take the
        // lock to write". An empty hashmap is still seeded.
        self.inner
            .lock()
            .map(|g| g.contains_key("__seeded__"))
            .unwrap_or(false)
    }

    /// Replace the baseline wholesale. Used by the watcher on the
    /// first observation of a repo, after computing the diff for
    /// the very first read.
    fn seed(&self, issues: &[Issue]) {
        let mut g = self.inner.lock().expect("watcher snapshot poisoned");
        g.clear();
        g.insert("__seeded__".to_string(), empty_seed_issue());
        for issue in issues {
            g.insert(issue.id.clone(), issue.clone());
        }
    }

    /// Diff `new_issues` against the baseline and update the
    /// baseline to match. Returns one [`IssueChange`] per affected
    /// ID. The caller is responsible for emitting the Tauri events.
    ///
    /// The diff is intentionally conservative: if anything in the
    /// parsed `Issue` changes (including `updated_at`, `status`,
    /// `priority`, etc.) we emit `Updated`. We do NOT try to be
    /// clever about field-level diffs — the React side replaces the
    /// whole cached row anyway.
    fn diff_and_update(&self, new_issues: &[Issue]) -> Vec<IssueChange> {
        let mut g = self.inner.lock().expect("watcher snapshot poisoned");
        let mut changes = Vec::new();

        for new_issue in new_issues {
            match g.get(&new_issue.id) {
                None => {
                    changes.push(IssueChange::Created(new_issue.clone()));
                }
                Some(old) if old != new_issue => {
                    changes.push(IssueChange::Updated(new_issue.clone()));
                }
                Some(_) => {
                    // No change.
                }
            }
        }

        // Anything in the baseline that's NOT in the new read is a
        // deletion. We snapshot the baseline first because we can't
        // mutate `g` while iterating it for the "missing" check.
        let new_ids: std::collections::HashSet<&str> =
            new_issues.iter().map(|i| i.id.as_str()).collect();
        let baseline_ids: Vec<String> = g
            .keys()
            .filter(|k| k.as_str() != "__seeded__")
            .filter(|k| !new_ids.contains(k.as_str()))
            .cloned()
            .collect();
        for id in baseline_ids {
            if let Some(old) = g.remove(&id) {
                changes.push(IssueChange::Deleted(old));
            }
        }

        // Update baseline to match the new read.
        g.retain(|k, _| k == "__seeded__");
        for issue in new_issues {
            g.insert(issue.id.clone(), issue.clone());
        }

        changes
    }

    /// Number of issues currently in the baseline (excludes the
    /// sentinel `__seeded__` entry). Used for diagnostics.
    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.inner
            .lock()
            .map(|g| g.len().saturating_sub(1))
            .unwrap_or(0)
    }
}

impl Default for WatcherSnapshot {
    fn default() -> Self {
        Self::new()
    }
}

/// Sentinel placeholder used purely so `is_seeded()` can use a
/// single `contains_key` check rather than a separate `bool`. The
/// `Issue` body is meaningless — we never compare it against
/// anything.
fn empty_seed_issue() -> Issue {
    use crate::beads::{IssuePriority, IssueType, ISSUE_STATUS_OPEN};
    Issue {
        id: "__seeded__".to_string(),
        title: String::new(),
        status: ISSUE_STATUS_OPEN.to_string(),
        priority: IssuePriority::P4,
        issue_type: IssueType::Task,
        created_at: chrono::DateTime::<chrono::Utc>::from_timestamp(0, 0)
            .unwrap_or_else(chrono::Utc::now),
        updated_at: None,
        closed_at: None,
        description: None,
        owner: None,
        labels: Vec::new(),
        dependencies: Vec::new(),
        dependents: Vec::new(),
        dependency_count: 0,
        dependent_count: 0,
        comment_count: 0,
        parent: None,
        acceptance_criteria: None,
        external_ref: None,
    }
}

/// Compute the per-issue diff between an existing baseline
/// (`baseline`) and a fresh JSONL read (`new_issues`). Pure
/// function — extracted so the bulk of the logic is unit-testable
/// without spinning up a `notify` watcher.
///
/// On the very first call (empty baseline + `seed` flag), the
/// baseline is seeded with every issue in `new_issues` and the
/// returned `Vec` is empty (the caller emits `beads-data-reset`
/// instead of per-issue events). On subsequent calls, every
/// created/updated/deleted ID is returned.
pub fn diff_snapshot(baseline: &WatcherSnapshot, new_issues: &[Issue]) -> Vec<IssueChange> {
    if !baseline.is_seeded() {
        baseline.seed(new_issues);
        return Vec::new();
    }
    baseline.diff_and_update(new_issues)
}

/// Owns the background `notify` thread for the lifetime of the app.
///
/// Dropping the handle stops the watcher and joins its background
/// thread; Tauri's managed state guarantees this happens on app
/// exit.
pub struct WatcherHandle {
    _debouncer: Debouncer<RecommendedWatcher>,
    snapshot: WatcherSnapshot,
    repo_path: PathBuf,
}

impl WatcherHandle {
    #[allow(dead_code)] // exposed for future WatcherState::current_repo_path callers
    pub fn repo_path(&self) -> &PathBuf {
        &self.repo_path
    }

    /// Snapshot accessor so tests / future commands can inspect the
    /// current baseline (e.g. "how many issues does the watcher
    /// know about?").
    #[allow(dead_code)]
    pub fn snapshot(&self) -> &WatcherSnapshot {
        &self.snapshot
    }

    /// Explicitly stop the watcher. The inner debouncer is dropped
    /// via `self`-consumption, which joins its background thread —
    /// same effect as letting the value go out of scope, but
    /// spelled out for the replacement code path in
    /// `WatcherState::attach`.
    pub fn stop(self) {
        drop(self);
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        log::info!("Stopping beads watcher for {}", self.repo_path.display());
    }
}

/// Holds the live `WatcherHandle` so `attach_watch_repo` can swap
/// it when the active repo changes. Stored in Tauri's managed
/// state; managed by `attach()` only.
#[derive(Clone)]
pub struct WatcherState {
    inner: Arc<Mutex<Option<WatcherHandle>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    /// Attach a watcher for `repo_path`, replacing any existing
    /// one (the old handle is dropped, stopping its background
    /// thread). If `<repo>/.beads/` does not exist yet, schedules
    /// a 2-second poll that re-attaches once the directory
    /// appears (covers the `bd init` flow after the watcher was
    /// started).
    pub fn attach(&self, app: AppHandle, repo_path: PathBuf) -> Result<(), String> {
        let new_handle = spawn_watcher(app, repo_path, self.clone())?;
        let mut guard = self.inner.lock().expect("watcher mutex poisoned");
        if let Some(old) = guard.take() {
            old.stop();
        }
        *guard = Some(new_handle);
        Ok(())
    }

    #[allow(dead_code)] // exposed for future use by the React attach flow
    pub fn current_repo_path(&self) -> Option<PathBuf> {
        self.inner
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|h| h.repo_path.clone()))
    }
}

impl Default for WatcherState {
    fn default() -> Self {
        Self::new()
    }
}

/// Build a watcher on `<repo>/.beads/` and emit targeted Tauri
/// events on every change to a `*.jsonl` file (debounced 250 ms).
///
/// The returned `WatcherHandle` should be stored via
/// `WatcherState::attach` (Tauri's managed state) so it can be
/// replaced when the active repo changes.
///
/// If `.beads/` does not exist, returns a no-op handle and
/// schedules a background task that re-runs `attach` once the
/// directory appears.
pub fn spawn_watcher(
    app: AppHandle,
    repo_path: PathBuf,
    state: WatcherState,
) -> Result<WatcherHandle, String> {
    let watch_dir = repo_path.join(".beads");
    if !watch_dir.exists() {
        log::warn!(
            "Beads directory does not exist, watcher not started: {}",
            watch_dir.display()
        );
        schedule_retry(app, repo_path.clone(), state);
        return Ok(WatcherHandle {
            _debouncer: build_noop_debouncer(),
            snapshot: WatcherSnapshot::new(),
            repo_path,
        });
    }

    let repo_path_str = repo_path.to_string_lossy().to_string();
    let snapshot = WatcherSnapshot::new();
    let snapshot_for_task = snapshot.clone();
    let repo_path_for_task = repo_path.clone();
    // Clone `app` once so the debouncer closure can hold its own
    // handle without moving the function parameter.
    let app_for_debouncer = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                if !is_beads_change_event(&events) {
                    return;
                }
                handle_change(
                    app_for_debouncer.clone(),
                    repo_path_for_task.clone(),
                    repo_path_str.clone(),
                    snapshot_for_task.clone(),
                );
            }
            Err(e) => log::error!("beads watcher error: {e:?}"),
        },
    )
    .map_err(|e| format!("failed to create beads watcher: {e}"))?;

    debouncer
        .watcher()
        .watch(&watch_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("failed to watch {}: {e}", watch_dir.display()))?;

    log::info!("Watching beads directory: {}", watch_dir.display());

    // Seed the snapshot asynchronously at attach time so the FIRST
    // `bd update …` after attach emits a targeted
    // `beads-issue-updated` event instead of `beads-data-reset` +
    // broad cache invalidation. Without this, the very first
    // external mutation after a workspace switch triggers a full
    // list refetch (which races the 1 s end-to-end target under
    // CI cold-start and flakes the r10 spec).
    //
    // Source of truth: `bd list --all --json`, NOT `.beads/issues.jsonl`.
    // bd 1.0.x with the Dolt backend (default since 1.0) does NOT rewrite
    // `.beads/issues.jsonl` on every update — the JSONL is exported
    // lazily (often only at `bd create` or explicit `bd export`) and
    // stays stale otherwise. We discovered this empirically while
    // debugging r10 flakiness: `bd update --status=closed` mutates the
    // Dolt store but the JSONL file's mtime and content stay frozen,
    // so `read_jsonl` returned the pre-update payload and the diff
    // against the baseline was empty. Going through `bd list` on
    // every change adds ~100 ms vs the JSONL fast path, but that's
    // well within the 1 s end-to-end budget and the diff is now
    // actually correct on Dolt workspaces. The same call is what the
    // React list query already runs, so the subprocess overhead is
    // already paid on the page (we just double as a warm-up for the
    // first user query). The diff_snapshot path is a no-op when the
    // baseline isn't seeded yet, so this is safe to do
    // unconditionally.
    let snapshot_for_seed = snapshot.clone();
    let repo_path_for_seed = repo_path.clone();
    let app_for_seed = app.clone();
    tauri::async_runtime::spawn(async move {
        let issues: Vec<Issue> = read_issues_via_bd(&repo_path_for_seed).await;
        let count = issues.len();
        let _ = diff_snapshot(&snapshot_for_seed, &issues);
        log::info!(
            "Seeded beads watcher baseline with {count} issues from {}",
            repo_path_for_seed.display()
        );
        // Drop the app handle once seeding is done so the
        // closure doesn't keep a ref-counted handle alive past
        // its useful scope.
        drop(app_for_seed);
    });

    Ok(WatcherHandle {
        _debouncer: debouncer,
        snapshot,
        repo_path,
    })
}

/// Async task spawned by the debouncer callback: re-read the
/// `.beads/*.jsonl`, diff against the baseline, and emit the
/// per-issue targeted events. Always emits `beads-data-changed`
/// for the legacy toast path.
///
/// This is split out from the debouncer callback so the sync
/// `notify` callback can fire-and-forget onto Tauri's async
/// runtime without blocking the watcher thread on a JSONL read.
fn handle_change(
    app: AppHandle,
    repo_path: PathBuf,
    repo_path_str: String,
    snapshot: WatcherSnapshot,
) {
    // Legacy event — fires for every JSONL touch so the existing
    // "Data refreshed" toast (in `useBeadsInvalidation`) keeps
    // working. The React side has been updated to no longer
    // trigger a broad query invalidation off this event.
    let legacy = BeadsDataChangedPayload {
        repo_path: repo_path_str.clone(),
        timestamp: now_millis(),
    };
    if let Err(e) = app.emit("beads-data-changed", legacy) {
        log::warn!("Failed to emit beads-data-changed: {e}");
    }

    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        // Source of truth: `bd list --all --json`. See the comment
        // in `spawn_watcher` for why we don't trust `.beads/issues.jsonl`
        // on Dolt-backed workspaces — bd 1.0.x doesn't rewrite it
        // on every update, so `read_jsonl` returns stale data and
        // the diff comes up empty. The subprocess call is the same
        // one the React list query already runs, so the OS page
        // cache is warm by the time we get here.
        let issues: Vec<Issue> = read_issues_via_bd(&repo_path).await;
        let was_seeded = snapshot.is_seeded();
        let changes = diff_snapshot(&snapshot, &issues);
        if !was_seeded {
            // First observation of this repo — let the
            // React side invalidate the broad cache once so
            // its existing queries settle. The targeted
            // events skip this tick intentionally; the
            // baseline is seeded but no per-issue events
            // fire (we just observed what's already on
            // disk).
            let reset = BeadsDataResetPayload {
                repo_path: repo_path_str.clone(),
                count: issues.len(),
            };
            if let Err(e) = app_for_task.emit("beads-data-reset", reset) {
                log::warn!("Failed to emit beads-data-reset: {e}");
            }
            return;
        }
        for change in changes {
            match change {
                IssueChange::Created(issue) => {
                    let payload = BeadsIssuePayload {
                        repo_path: repo_path_str.clone(),
                        issue,
                    };
                    if let Err(e) = app_for_task.emit("beads-issue-created", payload) {
                        log::warn!("Failed to emit beads-issue-created: {e}");
                    }
                }
                IssueChange::Updated(issue) => {
                    let payload = BeadsIssuePayload {
                        repo_path: repo_path_str.clone(),
                        issue,
                    };
                    if let Err(e) = app_for_task.emit("beads-issue-updated", payload) {
                        log::warn!("Failed to emit beads-issue-updated: {e}");
                    }
                }
                IssueChange::Deleted(issue) => {
                    let payload = BeadsIssueDeletedPayload {
                        repo_path: repo_path_str.clone(),
                        issue_id: issue.id,
                    };
                    if let Err(e) = app_for_task.emit("beads-issue-deleted", payload) {
                        log::warn!("Failed to emit beads-issue-deleted: {e}");
                    }
                }
            }
        }
    });
}

/// Read the canonical issue list for `repo_path` via `bd list --all
/// --json`. This is the source of truth for the watcher's diff
/// stage on Dolt-backed workspaces (bd 1.0.x's default since 1.0).
///
/// Why we don't trust `.beads/issues.jsonl` here: bd only rewrites
/// the JSONL export lazily — on `bd create`, on explicit `bd
/// export`, and at the end of `bd sync`. A bare `bd update
/// --status=…` mutates the Dolt store (which notify WILL detect
/// because `.beads/last-touched` + `.beads/embeddeddolt/...` are
/// touched) but the JSONL file's mtime and content stay frozen,
/// so `read_jsonl` returns the pre-update payload and the diff
/// against the baseline is empty. We discovered this empirically
/// while debugging r10 flakiness on PR #13 (e2e run 28186532811
/// reported `row e2e-workspace-5nw status never reflected external
/// bd update within 3000ms` for the very first mutation after
/// attach).
///
/// Trade-off: this costs a subprocess + ~100 ms per change tick
/// instead of an in-process file read (~10 ms). That's well within
/// the 1 s end-to-end budget, and the React list query already
/// runs the same `bd list --all --json` command when the cache is
/// stale, so the OS page cache + Dolt connection pool are warm by
/// the time the watcher fires its diff. Returns an empty `Vec` on
/// any error so the watcher still emits `beads-data-changed`
/// (legacy toast) — better a missed diff than a wedged watcher.
async fn read_issues_via_bd(repo_path: &Path) -> Vec<Issue> {
    let argv: [&str; 3] = ["list", "--all", "--json"];
    match crate::beads::runner::run_bd(&argv, repo_path).await {
        Ok(crate::beads::runner::BdOutput::Json { value }) => {
            crate::beads::search_query::extract_data(value).unwrap_or_else(|e| {
                log::warn!(
                    "read_issues_via_bd: parse failed for {}: {e:?}",
                    repo_path.display()
                );
                Vec::new()
            })
        }
        Ok(crate::beads::runner::BdOutput::Text { value }) => {
            log::warn!(
                "read_issues_via_bd: expected JSON, got text for {}: {}",
                repo_path.display(),
                value.chars().take(200).collect::<String>()
            );
            Vec::new()
        }
        Err(e) => {
            log::warn!(
                "read_issues_via_bd: bd list failed for {}: {e:?}",
                repo_path.display()
            );
            Vec::new()
        }
    }
}

/// Spawn a tokio task that polls `<repo>/.beads/` every 2 s and,
/// on the first success, replaces the noop watcher with a real
/// one. Exits early if `state` no longer holds a noop handle for
/// `repo_path` (e.g. the user selected a different repo in the
/// meantime).
fn schedule_retry(app: AppHandle, repo_path: PathBuf, state: WatcherState) {
    // `tokio::spawn` panics with "there is no reactor running"
    // when called from a thread that wasn't started by the global
    // tokio official Tauri 2 helper is `tauri::async_runtime::spawn`
    // — it dispatches onto Tauri's runtime regardless of caller
    // context. Inside the spawned task, `tokio::time::interval`
    // works because Tauri's runtime IS a tokio runtime.
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        // First tick fires immediately; skip it so we don't
        // busy-loop on a path that's been missing for a
        // microsecond.
        loop {
            interval.tick().await;
            if !repo_path.join(".beads").exists() {
                continue;
            }
            let still_ours = state
                .inner
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|h| h.repo_path == repo_path))
                .unwrap_or(false);
            if !still_ours {
                return;
            }
            log::info!(
                ".beads appeared, re-attaching watcher for {}",
                repo_path.display()
            );
            if let Err(e) = state.attach(app.clone(), repo_path.clone()) {
                log::error!(
                    "Failed to re-attach watcher for {}: {e}",
                    repo_path.display()
                );
            }
            return;
        }
    });
}

/// Tauri command: replace the live beads watcher with one rooted
/// at `repo_path`. Called from the React side whenever the active
/// repo changes so `beads-issue-*` events carry the right
/// `repo_path` payload (the frontend filters on
/// `event.payload.repo_path === activeRepoPath`).
#[tauri::command]
#[specta::specta]
pub async fn attach_watch_repo(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
    repo_path: String,
) -> Result<(), String> {
    state.attach(app, PathBuf::from(repo_path))
}

/// Returns true if any event in `events` targets a file whose
/// change is meaningful for the watcher.
///
/// The watcher's data source is `bd list --all --json`, not
/// `.beads/issues.jsonl` (see `read_issues_via_bd` for why — bd
/// 1.0.x's Dolt backend rewrites the JSONL lazily, so a bare
/// `bd update` only touches `.beads/last-touched` +
/// `.beads/embeddeddolt/...`). We DO react to events on
/// `.beads/last-touched` (the canonical "something changed"
/// marker bd updates after every command) and on any `.jsonl`
/// in `.beads/` (in case the user has a JSONL-only workspace or
/// bd eventually flushes), but we SKIP the embedded Dolt store
/// (`.beads/embeddeddolt/**`). The embedded Dolt directory is
/// chatty — Dolt touches a dozen internal files (manifest,
/// journal.idx, vvvvvvvvvvvv, temptf/...) on every commit, so
/// reacting to each one fires the watcher 5-10 times per bd
/// command, each fire triggering a `bd list` subprocess
/// (~500 ms cold). That cascading storm — observed on CI run
/// 28197764540 (`diag={"issueUpdated":3,"dataReset":1,
/// "dataChanged":0}` with the cache update landing at
/// 43321 ms instead of the 3000 ms budget) — is the exact
/// regression this filter prevents. `last-touched` is touched
/// exactly once per bd command, so it's the canonical signal.
/// The watcher is already scoped to the `.beads/` directory, so
/// we don't re-check the path prefix here — on platforms that
/// resolve symlinks (e.g. macOS `/tmp` → `/private/tmp`) `notify`
/// reports the resolved path while the caller passed the
/// unresolved one, and a string comparison would miss every
/// event.
fn is_beads_change_event(events: &[notify_debouncer_mini::DebouncedEvent]) -> bool {
    events.iter().any(|e| {
        if !e.path.is_file() {
            return false;
        }
        let name = match e.path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => return false,
        };
        // Skip the embedded Dolt store entirely — see the
        // function-level doc for why (chatty internal files
        // would otherwise cascade the watcher into a `bd list`
        // subprocess storm).
        if e.path.components().any(|c| c.as_os_str() == "embeddeddolt") {
            return false;
        }
        // Accept the canonical signal files only: the bd-touched
        // marker (`last-touched`) and any `*.jsonl` in the
        // `.beads/` root (covers both the standard
        // `issues.jsonl` export and any Dolt-disabled workspace
        // that still keeps a JSONL file).
        if name == "last-touched" {
            return true;
        }
        if name.ends_with(".jsonl") {
            return true;
        }
        // Skip editor swap/temp artefacts so saving the JSONL in
        // vim or VS Code doesn't double-fire the watcher.
        if name.ends_with(".swp")
            || name.ends_with(".swo")
            || name.ends_with('~')
            || name.ends_with(".tmp")
            || name.starts_with(".#")
        {
            return false;
        }
        false
    })
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Build a debouncer that never observes any path. Used as the
/// payload of a "directory missing" `WatcherHandle` so `Drop`
/// remains well-defined without the test code having to construct
/// one.
fn build_noop_debouncer() -> Debouncer<RecommendedWatcher> {
    new_debouncer(
        Duration::from_millis(250),
        |_result: DebounceEventResult| {},
    )
    .expect("build noop debouncer")
}

/// Ensure the diff and snapshot machinery is reachable from the
/// existing tests in `tests/` (which use the
/// `beads_export_for_tests` re-export). Currently a no-op marker
/// — kept here so future test refactors can import this module's
/// helpers without depending on private items.
#[allow(dead_code)]
fn _ensure_module_linked(_p: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::{
        Issue, IssuePriority, IssueStatus, IssueType, ISSUE_STATUS_CLOSED, ISSUE_STATUS_OPEN,
    };
    use chrono::{DateTime, Utc};
    use std::fs;
    use std::sync::mpsc;
    use std::time::Instant;
    use tempfile::TempDir;

    fn make_issue(id: &str, title: &str, status: IssueStatus) -> Issue {
        Issue {
            id: id.to_string(),
            title: title.to_string(),
            status,
            priority: IssuePriority::P2,
            issue_type: IssueType::Task,
            created_at: DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            updated_at: None,
            closed_at: None,
            description: None,
            owner: None,
            labels: vec![],
            dependencies: vec![],
            dependents: vec![],
            dependency_count: 0,
            dependent_count: 0,
            comment_count: 0,
            parent: None,
            acceptance_criteria: None,
            external_ref: None,
        }
    }

    /// Build a temp dir with a `.beads/issues.jsonl` file inside.
    fn make_beads_fixture() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().expect("create tempdir");
        let beads = tmp.path().join(".beads");
        fs::create_dir_all(&beads).expect("create .beads dir");
        fs::write(beads.join("issues.jsonl"), "").expect("write seed jsonl");
        (tmp, beads)
    }

    /// Mirror of `spawn_watcher`'s event-filtering, but with a
    /// caller-provided callback instead of an `AppHandle::emit`.
    /// Kept private so the only public path is `spawn_watcher`.
    fn watch_dir_for_test<F>(dir: &Path, mut on_event: F) -> Debouncer<RecommendedWatcher>
    where
        F: FnMut() + Send + 'static,
    {
        let mut debouncer = new_debouncer(
            Duration::from_millis(250),
            move |result: DebounceEventResult| {
                if let Ok(events) = result {
                    if is_beads_change_event(&events) {
                        on_event();
                    }
                }
            },
        )
        .expect("create debouncer");
        debouncer
            .watcher()
            .watch(dir, RecursiveMode::Recursive)
            .expect("watch dir");
        debouncer
    }

    // ================================================================
    // diff_snapshot unit tests
    // ================================================================

    #[test]
    fn diff_first_call_seeds_baseline_without_emitting_changes() {
        let baseline = WatcherSnapshot::new();
        let issues = vec![
            make_issue("beads-1", "First", ISSUE_STATUS_OPEN.to_string()),
            make_issue("beads-2", "Second", ISSUE_STATUS_CLOSED.to_string()),
        ];
        let changes = diff_snapshot(&baseline, &issues);
        assert!(
            changes.is_empty(),
            "first call must not emit per-issue changes (the baseline is freshly seeded), got: {changes:?}"
        );
        assert_eq!(baseline.len(), 2);
        assert!(baseline.is_seeded());
    }

    #[test]
    fn diff_second_call_with_no_changes_is_idempotent() {
        let baseline = WatcherSnapshot::new();
        let issues = vec![make_issue("beads-1", "Same", ISSUE_STATUS_OPEN.to_string())];
        let _ = diff_snapshot(&baseline, &issues);
        let changes = diff_snapshot(&baseline, &issues);
        assert!(
            changes.is_empty(),
            "second identical call must not emit anything (no spurious updates), got: {changes:?}"
        );
    }

    #[test]
    fn diff_emits_created_for_new_id() {
        let baseline = WatcherSnapshot::new();
        let _ = diff_snapshot(
            &baseline,
            &[make_issue(
                "beads-1",
                "Existing",
                ISSUE_STATUS_OPEN.to_string(),
            )],
        );
        let changes = diff_snapshot(
            &baseline,
            &[
                make_issue("beads-1", "Existing", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-2", "Brand new", ISSUE_STATUS_OPEN.to_string()),
            ],
        );
        assert_eq!(changes.len(), 1, "exactly one Created expected");
        match &changes[0] {
            IssueChange::Created(issue) => assert_eq!(issue.id, "beads-2"),
            other => panic!("expected Created, got {other:?}"),
        }
    }

    #[test]
    fn diff_emits_updated_when_status_changes() {
        let baseline = WatcherSnapshot::new();
        let _ = diff_snapshot(
            &baseline,
            &[make_issue(
                "beads-1",
                "Flip me",
                ISSUE_STATUS_OPEN.to_string(),
            )],
        );
        let changes = diff_snapshot(
            &baseline,
            &[make_issue(
                "beads-1",
                "Flip me",
                ISSUE_STATUS_CLOSED.to_string(),
            )],
        );
        assert_eq!(changes.len(), 1, "exactly one Updated expected");
        match &changes[0] {
            IssueChange::Updated(issue) => {
                assert_eq!(issue.id, "beads-1");
                assert_eq!(issue.status, ISSUE_STATUS_CLOSED.to_string());
            }
            other => panic!("expected Updated, got {other:?}"),
        }
    }

    #[test]
    fn diff_emits_updated_when_title_changes() {
        // Same status, different title — the React side still
        // wants to patch the row, so the diff must surface it.
        let baseline = WatcherSnapshot::new();
        let _ = diff_snapshot(
            &baseline,
            &[make_issue(
                "beads-1",
                "old title",
                ISSUE_STATUS_OPEN.to_string(),
            )],
        );
        let changes = diff_snapshot(
            &baseline,
            &[make_issue(
                "beads-1",
                "new title",
                ISSUE_STATUS_OPEN.to_string(),
            )],
        );
        assert_eq!(changes.len(), 1);
        match &changes[0] {
            IssueChange::Updated(issue) => assert_eq!(issue.title, "new title"),
            other => panic!("expected Updated, got {other:?}"),
        }
    }

    #[test]
    fn diff_emits_deleted_when_id_vanishes() {
        let baseline = WatcherSnapshot::new();
        let _ = diff_snapshot(
            &baseline,
            &[
                make_issue("beads-1", "Keep", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-2", "Delete me", ISSUE_STATUS_OPEN.to_string()),
            ],
        );
        let changes = diff_snapshot(
            &baseline,
            &[make_issue("beads-1", "Keep", ISSUE_STATUS_OPEN.to_string())],
        );
        assert_eq!(changes.len(), 1, "exactly one Deleted expected");
        match &changes[0] {
            IssueChange::Deleted(issue) => assert_eq!(issue.id, "beads-2"),
            other => panic!("expected Deleted, got {other:?}"),
        }
    }

    #[test]
    fn diff_emits_all_three_kinds_in_one_pass() {
        // Combined: one created, one updated, one deleted.
        let baseline = WatcherSnapshot::new();
        let _ = diff_snapshot(
            &baseline,
            &[
                make_issue("beads-1", "Stays the same", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-2", "Will change", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-3", "Will be deleted", ISSUE_STATUS_OPEN.to_string()),
            ],
        );
        let changes = diff_snapshot(
            &baseline,
            &[
                make_issue("beads-1", "Stays the same", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-2", "Did change", ISSUE_STATUS_CLOSED.to_string()),
                make_issue("beads-4", "Brand new", ISSUE_STATUS_OPEN.to_string()),
            ],
        );
        assert_eq!(
            changes.len(),
            3,
            "expected 1 created + 1 updated + 1 deleted, got {changes:?}"
        );

        let created = changes
            .iter()
            .filter(|c| matches!(c, IssueChange::Created(_)))
            .count();
        let updated = changes
            .iter()
            .filter(|c| matches!(c, IssueChange::Updated(_)))
            .count();
        let deleted = changes
            .iter()
            .filter(|c| matches!(c, IssueChange::Deleted(_)))
            .count();
        assert_eq!(created, 1, "1 created expected");
        assert_eq!(updated, 1, "1 updated expected");
        assert_eq!(deleted, 1, "1 deleted expected");
    }

    #[test]
    fn diff_updates_baseline_after_emit() {
        // After a diff that emits a Created, the baseline must
        // contain the new issue so a third diff doesn't re-emit it
        // as a Created again.
        let baseline = WatcherSnapshot::new();
        let _ = diff_snapshot(
            &baseline,
            &[make_issue("beads-1", "old", ISSUE_STATUS_OPEN.to_string())],
        );
        let first_changes = diff_snapshot(
            &baseline,
            &[
                make_issue("beads-1", "old", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-2", "new", ISSUE_STATUS_OPEN.to_string()),
            ],
        );
        assert_eq!(first_changes.len(), 1);
        let second_changes = diff_snapshot(
            &baseline,
            &[
                make_issue("beads-1", "old", ISSUE_STATUS_OPEN.to_string()),
                make_issue("beads-2", "new", ISSUE_STATUS_OPEN.to_string()),
            ],
        );
        assert!(
            second_changes.is_empty(),
            "third diff with identical input must be idempotent, got {second_changes:?}"
        );
    }

    #[test]
    fn diff_empty_baseline_with_empty_read_seeds_with_zero() {
        // Empty JSONL on first read: baseline is seeded with
        // nothing, no changes emitted, is_seeded() flips true.
        let baseline = WatcherSnapshot::new();
        let changes = diff_snapshot(&baseline, &[]);
        assert!(changes.is_empty());
        assert!(baseline.is_seeded());
        assert_eq!(baseline.len(), 0);
    }

    // ================================================================
    // Existing watcher integration tests (kept verbatim)
    // ================================================================

    #[test]
    fn test_watch_emits_within_500ms() {
        let (_tmp, beads_dir) = make_beads_fixture();
        let (tx, rx) = mpsc::channel();

        let _watcher = watch_dir_for_test(&beads_dir, move || {
            let _ = tx.send(());
        });

        // Give the platform-specific watcher a moment to register
        // the watch — fsnotify backends (especially macOS FSEvents)
        // can drop the very first event if it's written immediately
        // after `watch()` returns.
        std::thread::sleep(Duration::from_millis(100));

        let started = Instant::now();
        fs::write(beads_dir.join("issues.jsonl"), "id-1\n").expect("write change");

        let received = rx.recv_timeout(Duration::from_millis(500));
        let elapsed = started.elapsed();

        assert!(
            received.is_ok(),
            "expected beads-data-changed event within 500ms, got timeout after {elapsed:?}"
        );
        assert!(
            elapsed < Duration::from_millis(500),
            "event arrived in {elapsed:?}, expected < 500ms"
        );
        println!("emitted within {elapsed:?}");
    }

    #[test]
    fn test_watcher_drop() {
        let (_tmp, beads_dir) = make_beads_fixture();
        let (tx, _rx) = mpsc::channel();

        let handle = watch_dir_for_test(&beads_dir, move || {
            let _ = tx.send(());
        });

        // Drop the watcher explicitly. The debouncer's background
        // thread must shut down — if it leaked, the test runner
        // would either hang on teardown or report "thread X did
        // not exit".
        drop(handle);

        // Sanity: writing to the dir after drop must not crash
        // anything. (The dropped debouncer simply won't fire any
        // callbacks.)
        std::thread::sleep(Duration::from_millis(100));
        fs::write(beads_dir.join("issues.jsonl"), "post-drop\n").expect("write after drop");

        // Give the (dropped) watcher's old thread a moment to
        // confirm it really shut down. If it didn't, the next
        // assertion would still pass but a leaked-thread test
        // would catch it on cleanup.
        std::thread::sleep(Duration::from_millis(300));
    }
}
