//! Per-repo singleton write lock.
//!
//! Guards the `.beads/issues.jsonl` write path so two concurrent writers
//! in the same UI session (or two Tauri commands racing on a single
//! repo) cannot interleave their `bd` invocations and corrupt the
//! append-only log. The lock is per-repo, not global, so opening two
//! different repos never blocks.
//!
//! Stored in Tauri's managed state via `app.manage(WriteLock::new())`
//! and acquired from a command with `tauri::State<'_, WriteLock>`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, OwnedMutexGuard};
use tokio::time::timeout;

use crate::beads::types::BdError;

/// A guard that releases the per-repo inner mutex on `Drop`.
///
/// Holding the guard across `.await` is safe — `_inner_guard` is an
/// `OwnedMutexGuard<()>` which owns the lock and is released on drop
/// (RAII). The `locks` arc is kept so we can clean up the map entry
/// on drop (the map is shared, so the entry survives until the
/// `WriteLock` itself is dropped, but the guard's role is purely
/// "hold the inner mutex until I'm done").
pub struct WriteGuard {
    pub repo_path: PathBuf,
    // Kept for symmetry with the type signature in the plan; the
    // guard's job is to release `_inner_guard` on Drop. Holding a
    // strong ref to the map here is harmless (no cycles) and lets a
    // future "unregister idle entries" pass access the same map.
    #[allow(dead_code)]
    locks: Arc<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>>,
    _inner_guard: OwnedMutexGuard<()>,
}

impl Drop for WriteGuard {
    fn drop(&mut self) {
        log::debug!("Releasing write lock for {}", self.repo_path.display());
    }
}

/// Keyed map of per-repo inner mutexes. The outer `Mutex<HashMap>`
/// protects concurrent insertion of new entries; the inner
/// `Arc<Mutex<()>>` per path serializes writes to that specific repo.
pub struct WriteLock {
    locks: Arc<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>>,
}

impl WriteLock {
    pub fn new() -> Self {
        Self {
            locks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Try to acquire the per-repo write lock within `timeout_dur`.
    ///
    /// Returns `BdError::AlreadyLocked { repo_path }` on timeout. On
    /// success, returns a `WriteGuard` that holds the lock until
    /// dropped. The default timeout in `try_write_lock_cmd` is 2s.
    pub async fn try_acquire_write(
        &self,
        repo_path: &Path,
        timeout_dur: Duration,
    ) -> Result<WriteGuard, BdError> {
        let canonical = repo_path.to_path_buf();
        let repo_key = canonical.clone();

        // Step 1: get-or-create the per-repo inner mutex under the
        // short-lived outer map lock. We drop the outer guard before
        // awaiting on the inner lock so two writers to *different*
        // repos never serialize on the map.
        let inner = {
            let mut map = self.locks.lock().await;
            map.entry(canonical)
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };

        // Step 2: race the inner lock acquisition against the timeout.
        match timeout(timeout_dur, inner.lock_owned()).await {
            Ok(_guard) => Ok(WriteGuard {
                repo_path: repo_key,
                locks: Arc::clone(&self.locks),
                _inner_guard: _guard,
            }),
            Err(_) => Err(BdError::AlreadyLocked {
                repo_path: repo_key.to_string_lossy().into_owned(),
            }),
        }
    }
}

impl Default for WriteLock {
    fn default() -> Self {
        Self::new()
    }
}

/// Default timeout for the per-repo write lock acquired by
/// `runner::run_bd_locked` (2s). Picked to be long enough for a single
/// `bd` write under load but short enough that the UI doesn't sit on a
/// spinner forever.
pub const DEFAULT_WRITE_LOCK_TIMEOUT: Duration = Duration::from_secs(2);

#[cfg(test)]
mod tests {
    use super::*;

    /// RAII helper: acquire a lock, run `f` while holding it, then
    /// release. Lets a test hold a write for a known duration without
    /// juggling guards manually.
    async fn hold_write_for(lock: &WriteLock, path: &Path, dur: Duration) -> WriteGuard {
        let guard = lock
            .try_acquire_write(path, Duration::from_millis(500))
            .await
            .expect("first acquire should succeed");
        tokio::time::sleep(dur).await;
        guard
    }

    #[tokio::test]
    async fn test_concurrent_same_path() {
        // Two concurrent acquire attempts on the same path; the
        // second must fail with `AlreadyLocked` because the first
        // is still holding the inner mutex when the timeout fires.
        let lock = Arc::new(WriteLock::new());
        let path = PathBuf::from("/tmp/repo-same");

        // Hold the lock for 200ms from one task, then race a 50ms
        // timeout from a second task. The second should time out.
        let lock2 = Arc::clone(&lock);
        let path2 = path.clone();
        let holder = tokio::spawn(async move {
            hold_write_for(&lock2, &path2, Duration::from_millis(200)).await;
        });

        // Yield so `holder` gets the inner lock first.
        tokio::time::sleep(Duration::from_millis(20)).await;

        let result = lock
            .try_acquire_write(&path, Duration::from_millis(50))
            .await;

        holder.await.expect("holder task");

        match result {
            Err(BdError::AlreadyLocked { repo_path }) => {
                assert_eq!(repo_path, path.to_string_lossy().into_owned());
            }
            Ok(_) => panic!("expected AlreadyLocked, got Ok"),
            Err(other) => panic!("expected AlreadyLocked, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_concurrent_different_paths() {
        // Two concurrent acquires on *different* paths must both
        // succeed — the per-repo mutex map means writes to disjoint
        // repos are independent.
        let lock = WriteLock::new();
        let path_a = PathBuf::from("/tmp/repo-a");
        let path_b = PathBuf::from("/tmp/repo-b");

        let lock_a = Arc::new(lock);
        let lock_b = Arc::clone(&lock_a);
        let path_a_clone = path_a.clone();
        let path_b_clone = path_b.clone();

        let task_a = tokio::spawn(async move {
            lock_a
                .try_acquire_write(&path_a_clone, Duration::from_millis(500))
                .await
        });
        let task_b = tokio::spawn(async move {
            lock_b
                .try_acquire_write(&path_b_clone, Duration::from_millis(500))
                .await
        });

        let (res_a, res_b) = tokio::join!(task_a, task_b);
        let guard_a = res_a.expect("task a").expect("path a ok");
        let guard_b = res_b.expect("task b").expect("path b ok");

        // Both locks held simultaneously — proves the map keys are
        // distinct and the inner mutexes are per-path.
        assert_eq!(guard_a.repo_path, path_a);
        assert_eq!(guard_b.repo_path, path_b);
    }

    #[tokio::test]
    async fn test_lock_released_on_drop() {
        // After dropping the guard, a fresh acquire on the same
        // path must succeed immediately (proves RAII release).
        let lock = WriteLock::new();
        let path = PathBuf::from("/tmp/repo-drop");

        {
            let _guard = lock
                .try_acquire_write(&path, Duration::from_millis(500))
                .await
                .expect("first acquire");
        } // guard dropped here

        // Second acquire should succeed; if the inner mutex leaked,
        // this would block until the 500ms timeout.
        let started = std::time::Instant::now();
        let _guard2 = lock
            .try_acquire_write(&path, Duration::from_millis(500))
            .await
            .expect("second acquire after drop");
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_millis(100),
            "second acquire took {elapsed:?}, expected <100ms — guard was not released"
        );
    }
}
