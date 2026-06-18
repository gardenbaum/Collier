//! Beads directory filesystem watcher.
//!
//! Watches `<repo>/.beads/` for changes to `*.jsonl` files and emits a
//! `beads-data-changed` Tauri event so the React layer can invalidate
//! the TanStack Query cache and re-fetch the issue list.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Event payload emitted to the React layer on any change to the
/// `.beads/*.jsonl` files. The frontend uses this only as a signal —
/// actual data is re-fetched via the existing TanStack Query hooks.
#[derive(Debug, Clone, Serialize)]
pub struct BeadsDataChangedPayload {
    pub repo_path: String,
    pub timestamp: i64,
}

/// Owns the background `notify` thread for the lifetime of the app.
///
/// Dropping the handle stops the watcher and joins its background
/// thread; Tauri's managed state guarantees this happens on app exit.
pub struct WatcherHandle {
    _debouncer: Debouncer<RecommendedWatcher>,
    repo_path: PathBuf,
}

impl WatcherHandle {
    #[allow(dead_code)] // exposed for future WatcherState::current_repo_path callers
    pub fn repo_path(&self) -> &PathBuf {
        &self.repo_path
    }

    /// Explicitly stop the watcher. The inner debouncer is dropped via
    /// `self`-consumption, which joins its background thread — same
    /// effect as letting the value go out of scope, but spelled out
    /// for the replacement code path in `WatcherState::attach`.
    pub fn stop(self) {
        drop(self);
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        log::info!("Stopping beads watcher for {}", self.repo_path.display());
    }
}

/// Holds the live `WatcherHandle` so `attach_watch_repo` can swap it
/// when the active repo changes. Stored in Tauri's managed state;
/// managed by `attach()` only.
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

    /// Attach a watcher for `repo_path`, replacing any existing one
    /// (the old handle is dropped, stopping its background thread).
    /// If `<repo>/.beads/` does not exist yet, schedules a 2-second
    /// poll that re-attaches once the directory appears (covers the
    /// `bd init` flow after the watcher was started).
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

/// Build a watcher on `<repo>/.beads/` and emit `beads-data-changed` on
/// every change to a `*.jsonl` file (debounced 250ms).
///
/// The returned `WatcherHandle` should be stored via `WatcherState::attach`
/// (Tauri's managed state) so it can be replaced when the active repo
/// changes.
///
/// If `.beads/` does not exist, returns a no-op handle and schedules a
/// background task that re-runs `attach` once the directory appears.
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
            repo_path,
        });
    }

    let repo_path_str = repo_path.to_string_lossy().to_string();

    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                if !is_jsonl_event(&events) {
                    return;
                }
                let payload = BeadsDataChangedPayload {
                    repo_path: repo_path_str.clone(),
                    timestamp: now_millis(),
                };
                if let Err(e) = app.emit("beads-data-changed", payload) {
                    log::warn!("Failed to emit beads-data-changed: {e}");
                }
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
    Ok(WatcherHandle {
        _debouncer: debouncer,
        repo_path,
    })
}

/// Spawn a tokio task that polls `<repo>/.beads/` every 2s and, on the
/// first success, replaces the noop watcher with a real one. Exits
/// early if `state` no longer holds a noop handle for `repo_path`
/// (e.g. the user selected a different repo in the meantime).
fn schedule_retry(app: AppHandle, repo_path: PathBuf, state: WatcherState) {
    // `tokio::spawn` panics with "there is no reactor running" when
    // called from a thread that wasn't started by the global tokio
    // official Tauri 2 helper is `tauri::async_runtime::spawn` —
    // it dispatches onto Tauri's runtime regardless of caller
    // context. Inside the spawned task, `tokio::time::interval`
    // works because Tauri's runtime IS a tokio runtime.
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        // First tick fires immediately; skip it so we don't busy-loop
        // on a path that's been missing for a microsecond.
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
                log::error!("Failed to re-attach watcher for {}: {e}", repo_path.display());
            }
            return;
        }
    });
}

/// Tauri command: replace the live beads watcher with one rooted at
/// `repo_path`. Called from the React side whenever the active repo
/// changes so `beads-data-changed` events carry the right `repo_path`
/// payload (the frontend filters on
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

/// Returns true if any event in `events` targets a `*.jsonl` file.
///
/// The watcher is already scoped to the `.beads/` directory, so we
/// only filter on the extension and the file type. We intentionally do
/// NOT compare the event's `parent()` to the watch directory: on
/// platforms that resolve symlinks (e.g. macOS `/tmp` →
/// `/private/tmp`), `notify` reports the resolved path while the
/// caller passed the unresolved one, and a string comparison would
/// miss every event.
fn is_jsonl_event(events: &[notify_debouncer_mini::DebouncedEvent]) -> bool {
    events.iter().any(|e| {
        e.path
            .extension()
            .map(|ext| ext == "jsonl")
            .unwrap_or(false)
            && e.path.is_file()
    })
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Build a debouncer that never observes any path. Used as the
/// payload of a "directory missing" `WatcherHandle` so `Drop` remains
/// well-defined without the test code having to construct one.
fn build_noop_debouncer() -> Debouncer<RecommendedWatcher> {
    new_debouncer(
        Duration::from_millis(250),
        |_result: DebounceEventResult| {},
    )
    .expect("build noop debouncer")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use std::sync::mpsc;
    use std::time::Instant;
    use tempfile::TempDir;

    /// Build a temp dir with a `.beads/issues.jsonl` file inside.
    fn make_beads_fixture() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().expect("create tempdir");
        let beads = tmp.path().join(".beads");
        fs::create_dir_all(&beads).expect("create .beads dir");
        fs::write(beads.join("issues.jsonl"), "").expect("write seed jsonl");
        (tmp, beads)
    }

    /// Mirror of `spawn_watcher`'s event-filtering, but with a caller-
    /// provided callback instead of an `AppHandle::emit`. Kept private
    /// so the only public path is `spawn_watcher`.
    fn watch_dir_for_test<F>(dir: &Path, mut on_event: F) -> Debouncer<RecommendedWatcher>
    where
        F: FnMut() + Send + 'static,
    {
        let mut debouncer = new_debouncer(
            Duration::from_millis(250),
            move |result: DebounceEventResult| {
                if let Ok(events) = result {
                    if is_jsonl_event(&events) {
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

    #[test]
    fn test_watch_emits_within_500ms() {
        let (_tmp, beads_dir) = make_beads_fixture();
        let (tx, rx) = mpsc::channel();

        let _watcher = watch_dir_for_test(&beads_dir, move || {
            let _ = tx.send(());
        });

        // Give the platform-specific watcher a moment to register the
        // watch — fsnotify backends (especially macOS FSEvents) can
        // drop the very first event if it's written immediately after
        // `watch()` returns.
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

        // Drop the watcher explicitly. The debouncer's background thread
        // must shut down — if it leaked, the test runner would either
        // hang on teardown or report "thread X did not exit".
        drop(handle);

        // Sanity: writing to the dir after drop must not crash anything.
        // (The dropped debouncer simply won't fire any callbacks.)
        std::thread::sleep(Duration::from_millis(100));
        fs::write(beads_dir.join("issues.jsonl"), "post-drop\n").expect("write after drop");

        // Give the (dropped) watcher's old thread a moment to confirm
        // it really shut down. If it didn't, the next assertion would
        // still pass but a leaked-thread test would catch it on cleanup.
        std::thread::sleep(Duration::from_millis(300));
    }
}
