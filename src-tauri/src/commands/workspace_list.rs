//! Multi-workspace discovery.
//!
//! The M4 dropdown in the titlebar lists every Beads workspace the
//! user has touched. Discovery pulls from two on-disk sources and
//! the active workspace:
//!
//!   1. `AppPreferences.recent_repos` — written by `add_recent_repo`
//!      every time the bootstrap flow or workspace switcher picks a
//!      repo. The bootstrap flow already populates this list, so it's
//!      always populated on day 2+.
//!
//!   2. `~/.beads/registry.json` — the canonical Beads registry that
//!      `bd init` / `cd` hooks maintain. We accept three shapes to
//!      stay forward/backward compatible:
//!        - `{ "version": 1, "workspaces": [{ "path": "...", ... }, ...] }`
//!        - `{ "workspaces": [...] }`  (no version)
//!        - `[ "...", "..." ]`         (bare array of paths)
//!
//!   3. The active workspace (`current`) — always included and always
//!      first, regardless of whether it appears in (1) or (2).
//!
//! Discovery is best-effort. A missing/malformed registry file or
//! preferences file is **not** an error — the dropdown must still
//! render whatever we can find (the active workspace at minimum).

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use crate::commands::preferences::{get_preferences_path, load_preferences_inner};
use crate::types::AppPreferences;

// ============================================================================
// Public types
// ============================================================================

/// Where a workspace entry was discovered from. Used by the frontend
/// to render the source label (e.g. italicise "registry" entries) and
/// to preserve order when merging sources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSource {
    /// The currently-active workspace. Always rendered first.
    Current,
    /// Recently opened — listed in `AppPreferences.recent_repos`.
    Recent,
    /// Listed in `~/.beads/registry.json` but not in recents.
    Registry,
}

/// A single workspace the dropdown can switch to.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    /// Absolute path to the workspace root (the directory that
    /// contains `.beads/`).
    pub path: String,
    /// Last path component — the human-readable workspace name
    /// rendered in the dropdown row.
    pub name: String,
    /// Which discovery source listed this entry.
    pub source: WorkspaceSource,
    /// `true` when the directory exists on disk **and** contains a
    /// `.beads/` subdirectory. `false` entries are still rendered
    /// (so the user sees stale paths and can clean up), but visually
    /// marked so the UI can show a "missing" badge.
    pub exists: bool,
}

// ============================================================================
// Tauri command
// ============================================================================

/// Return the merged workspace list.
///
/// `current` is the active workspace's path (passed by the frontend
/// from the `workspace-store.repoPath`); pass `null` from JS when no
/// workspace is open yet. The Rust side treats both `null` and
/// missing files as "no current workspace" and skips the
/// always-first entry.
#[tauri::command]
#[specta::specta]
pub async fn list_workspaces(
    app: AppHandle,
    current: Option<String>,
) -> Result<Vec<WorkspaceEntry>, String> {
    let prefs_path = get_preferences_path(&app)?;
    let prefs: AppPreferences = load_preferences_inner(&prefs_path).unwrap_or_default();
    let registry_paths = load_registry_paths();
    Ok(merge_entries(prefs.recent_repos, registry_paths, current))
}

// ============================================================================
// Helpers (public for tests)
// ============================================================================

/// Path to the user-level Beads registry. Defaults to
/// `$HOME/.beads/registry.json`. On Linux/macOS `HOME` is set in
/// every normal shell; on Windows it falls back to `USERPROFILE`.
/// If neither is set we return `None` and the caller treats the
/// registry as empty (no error — discovery is best-effort).
pub fn registry_path() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())?;
    Some(
        std::path::PathBuf::from(home)
            .join(".beads")
            .join("registry.json"),
    )
}

/// Read `~/.beads/registry.json` and return the listed paths.
///
/// Tolerates:
/// - missing file        → `vec![]`
/// - unreadable file     → `vec![]` (logged, not propagated)
/// - malformed JSON      → `vec![]`
/// - all three shapes:   nested `workspaces[]`, bare array, etc.
pub fn load_registry_paths() -> Vec<String> {
    let Some(path) = registry_path() else {
        return Vec::new();
    };
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    parse_registry_paths(&contents).unwrap_or_default()
}

/// Pure parser — accepts the three documented shapes and returns
/// the path list. Anything else is an error (logged upstream as
/// "registry unreadable", surfaced as an empty list to the UI).
pub fn parse_registry_paths(contents: &str) -> Result<Vec<String>, serde_json::Error> {
    // Shape 1 + 2: object with optional `version`, required `workspaces`.
    if let Ok(obj) = serde_json::from_str::<RegistryObject>(contents) {
        return Ok(obj.workspaces.into_iter().map(|w| w.path).collect());
    }
    // Shape 3: bare array of paths.
    if let Ok(paths) = serde_json::from_str::<Vec<String>>(contents) {
        return Ok(paths);
    }
    // Shape 4: bare array of objects (no wrapper). Same shape as
    // `workspaces[]` but unwrapped.
    if let Ok(entries) = serde_json::from_str::<Vec<RegistryEntry>>(contents) {
        return Ok(entries.into_iter().map(|e| e.path).collect());
    }
    // Last resort: try `workspaces` key directly without the version
    // wrapper (Shape 1 without the `version` field is actually the
    // same as Shape 2, which is already covered by RegistryObject's
    // #[serde(default)] on version — fall through here means all
    // shapes failed).
    Err(serde_json::from_str::<serde_json::Value>(contents)
        .err()
        .unwrap_or_else(|| {
            // We can't construct a useful serde_json::Error without a
            // source span, so callers will treat the empty fallback the
            // same way. Use a placeholder that preserves the caller's
            // contract: any Err here means "treat as empty".
            serde_json::Error::io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "registry.json does not match any known shape",
            ))
        }))
}

#[derive(Debug, Deserialize)]
struct RegistryObject {
    #[serde(default)]
    #[allow(dead_code)]
    version: u32,
    workspaces: Vec<RegistryEntry>,
}

#[derive(Debug, Deserialize)]
struct RegistryEntry {
    path: String,
}

/// Merge the three sources into a deduplicated, ordered list.
///
/// Order:
///   1. `current` (if non-empty)
///   2. `recent` in given order
///   3. `registry` in given order
///
/// Within each tier, the first occurrence wins for `source` — so a
/// path that's both in recents and the registry is labelled `recent`
/// (the more authoritative source). A path that appears twice in
/// `recent` is collapsed to the first occurrence.
pub fn merge_entries(
    recent: Vec<String>,
    registry: Vec<String>,
    current: Option<String>,
) -> Vec<WorkspaceEntry> {
    let mut entries: Vec<WorkspaceEntry> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    let mut push = |path: String, source: WorkspaceSource, entries: &mut Vec<WorkspaceEntry>| {
        if path.is_empty() {
            return;
        }
        if !seen.insert(path.clone()) {
            return;
        }
        let name = workspace_basename(&path);
        let exists = workspace_exists(&path);
        entries.push(WorkspaceEntry {
            path,
            name,
            source,
            exists,
        });
    };

    if let Some(cur) = current {
        push(cur, WorkspaceSource::Current, &mut entries);
    }
    for p in recent {
        push(p, WorkspaceSource::Recent, &mut entries);
    }
    for p in registry {
        push(p, WorkspaceSource::Registry, &mut entries);
    }
    entries
}

/// Last non-empty path component. Mirrors the TitleBar's
/// `repoBasename` so the dropdown row label matches the titlebar
/// badge when both are rendering the same workspace.
fn workspace_basename(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    let last = trimmed.rsplit('/').find(|s| !s.is_empty());
    last.unwrap_or(trimmed).to_string()
}

/// `true` when the path resolves to a directory that contains a
/// `.beads/` subdirectory. We don't read inside `.beads/` — a
/// present directory is the only contract `bd init` guarantees.
fn workspace_exists(path: &str) -> bool {
    let p = Path::new(path);
    if !p.is_dir() {
        return false;
    }
    p.join(".beads").is_dir()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn entries(paths: &[(&str, WorkspaceSource)]) -> Vec<WorkspaceEntry> {
        paths
            .iter()
            .map(|(p, s)| WorkspaceEntry {
                path: (*p).to_string(),
                name: workspace_basename(p),
                source: *s,
                exists: false,
            })
            .collect()
    }

    // ----- merge_entries -----

    #[test]
    fn merge_with_no_sources_returns_empty() {
        let out = merge_entries(vec![], vec![], None);
        assert!(out.is_empty());
    }

    #[test]
    fn merge_with_only_current_puts_current_first() {
        let out = merge_entries(vec![], vec![], Some("/repo".to_string()));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/repo");
        assert_eq!(out[0].source, WorkspaceSource::Current);
    }

    #[test]
    fn merge_orders_current_recent_registry() {
        let out = merge_entries(
            vec!["/recent".to_string()],
            vec!["/registry".to_string()],
            Some("/current".to_string()),
        );
        let paths: Vec<&str> = out.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["/current", "/recent", "/registry"]);
    }

    #[test]
    fn merge_dedups_path_present_in_recent_and_registry() {
        // "recents first" wins for the source label — registry path
        // is dropped entirely once seen.
        let out = merge_entries(
            vec!["/shared".to_string(), "/recent-only".to_string()],
            vec!["/shared".to_string(), "/reg-only".to_string()],
            None,
        );
        let paths: Vec<&str> = out.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["/shared", "/recent-only", "/reg-only"]);
        assert_eq!(out[0].source, WorkspaceSource::Recent);
    }

    #[test]
    fn merge_dedups_duplicate_paths_within_recent() {
        let out = merge_entries(
            vec!["/a".to_string(), "/b".to_string(), "/a".to_string()],
            vec![],
            None,
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].path, "/a");
        assert_eq!(out[1].path, "/b");
    }

    #[test]
    fn merge_skips_empty_current() {
        // The frontend may pass `Some("")` if `repoPath` is set to
        // an empty string by a buggy migration. Treat as "no current".
        let out = merge_entries(vec!["/r".to_string()], vec![], Some(String::new()));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/r");
        assert_eq!(out[0].source, WorkspaceSource::Recent);
    }

    #[test]
    fn merge_skips_empty_strings_in_recent() {
        let out = merge_entries(vec!["".to_string(), "/real".to_string()], vec![], None);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/real");
    }

    #[test]
    fn merge_sets_correct_source_labels() {
        let out = merge_entries(
            vec!["/r1".to_string()],
            vec!["/g1".to_string()],
            Some("/cur".to_string()),
        );
        let sources: Vec<WorkspaceSource> = out.iter().map(|e| e.source).collect();
        assert_eq!(
            sources,
            vec![
                WorkspaceSource::Current,
                WorkspaceSource::Recent,
                WorkspaceSource::Registry,
            ]
        );
    }

    // ----- parse_registry_paths -----

    #[test]
    fn parse_registry_object_with_version_and_workspaces() {
        let json = r#"{
            "version": 1,
            "workspaces": [
                { "path": "/repo/a", "name": "a" },
                { "path": "/repo/b" }
            ]
        }"#;
        let paths = parse_registry_paths(json).expect("parse");
        assert_eq!(paths, vec!["/repo/a", "/repo/b"]);
    }

    #[test]
    fn parse_registry_object_without_version() {
        // `#[serde(default)]` on the version field makes the wrapper
        // work with or without the version key.
        let json = r#"{ "workspaces": [{ "path": "/x" }] }"#;
        let paths = parse_registry_paths(json).expect("parse");
        assert_eq!(paths, vec!["/x"]);
    }

    #[test]
    fn parse_registry_bare_array_of_paths() {
        let json = r#"["/a", "/b", "/c"]"#;
        let paths = parse_registry_paths(json).expect("parse");
        assert_eq!(paths, vec!["/a", "/b", "/c"]);
    }

    #[test]
    fn parse_registry_bare_array_of_objects() {
        let json = r#"[{ "path": "/a", "last_accessed": "..." }]"#;
        let paths = parse_registry_paths(json).expect("parse");
        assert_eq!(paths, vec!["/a"]);
    }

    #[test]
    fn parse_registry_empty_object_returns_empty() {
        let json = r#"{ "version": 1, "workspaces": [] }"#;
        let paths = parse_registry_paths(json).expect("parse");
        assert!(paths.is_empty());
    }

    #[test]
    fn parse_registry_garbage_returns_err() {
        let json = r#"this is not JSON"#;
        assert!(parse_registry_paths(json).is_err());
    }

    // ----- workspace_basename -----

    #[test]
    fn basename_handles_trailing_slash() {
        assert_eq!(workspace_basename("/foo/bar/"), "bar");
    }

    #[test]
    fn basename_handles_no_slash() {
        assert_eq!(workspace_basename("alone"), "alone");
    }

    #[test]
    fn basename_handles_empty_string() {
        // Edge case: a degenerate `repoPath` of `""` should still
        // produce a label rather than panic.
        assert_eq!(workspace_basename(""), "");
    }

    // ----- workspace_exists -----

    #[test]
    fn exists_true_for_directory_with_beads_subdir() {
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let beads = tmp.path().join(".beads");
        fs::create_dir_all(&beads).expect("mkdir");
        assert!(workspace_exists(tmp.path().to_str().unwrap()));
    }

    #[test]
    fn exists_false_for_directory_without_beads_subdir() {
        let tmp = tempfile::TempDir::new().expect("tempdir");
        assert!(!workspace_exists(tmp.path().to_str().unwrap()));
    }

    #[test]
    fn exists_false_for_missing_path() {
        assert!(!workspace_exists("/this/path/should/not/exist/xyz"));
    }

    // ----- end-to-end: load_registry_paths against a temp file -----

    #[test]
    fn load_registry_reads_real_file() {
        // Override HOME via env, write a registry.json in the new
        // home, then verify `load_registry_paths` returns its paths.
        // SAFETY: the test is single-threaded and we restore the
        // original HOME before returning.
        let original_home = std::env::var("HOME").ok();
        let tmp = tempfile::TempDir::new().expect("tempdir");
        // SAFETY: setting an env var in a single-threaded test is
        // safe; concurrent tests in the same process would race.
        unsafe { std::env::set_var("HOME", tmp.path()) };

        let beads_home = tmp.path().join(".beads");
        fs::create_dir_all(&beads_home).expect("mkdir .beads");
        let registry = beads_home.join("registry.json");
        fs::write(
            &registry,
            r#"{ "version": 1, "workspaces": [{ "path": "/r1" }, { "path": "/r2" }] }"#,
        )
        .expect("write registry");

        let paths = load_registry_paths();
        assert_eq!(paths, vec!["/r1", "/r2"]);

        // Restore.
        match original_home {
            Some(v) => unsafe { std::env::set_var("HOME", v) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }

    #[test]
    fn load_registry_missing_file_returns_empty() {
        let original_home = std::env::var("HOME").ok();
        let tmp = tempfile::TempDir::new().expect("tempdir");
        unsafe { std::env::set_var("HOME", tmp.path()) };

        // No ~/.beads/registry.json — must not error.
        let paths = load_registry_paths();
        assert!(paths.is_empty());

        match original_home {
            Some(v) => unsafe { std::env::set_var("HOME", v) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }

    // ----- end-to-end: list_workspaces via the merge helper -----

    #[test]
    fn list_workspaces_combines_recent_and_registry_with_current_first() {
        let out = merge_entries(
            vec!["/recent-a".to_string(), "/shared".to_string()],
            vec!["/shared".to_string(), "/reg-only".to_string()],
            Some("/current".to_string()),
        );
        // Verify the full contract: order is current → recent → registry,
        // dedup collapses `/shared` to a single `Recent` entry, and
        // paths are non-empty.
        let paths: Vec<&str> = out.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["/current", "/recent-a", "/shared", "/reg-only"]);
        let sources: Vec<WorkspaceSource> = out.iter().map(|e| e.source).collect();
        assert_eq!(
            sources,
            vec![
                WorkspaceSource::Current,
                WorkspaceSource::Recent,
                WorkspaceSource::Recent, // /shared wins as Recent
                WorkspaceSource::Registry,
            ]
        );
    }

    // ----- smoke: the full module wires together without panic -----

    #[test]
    fn smoke_compile_only_check() {
        // Verifies the `entries` helper above doesn't drift; the
        // main contract is exercised by the merge tests.
        let e = entries(&[("/foo", WorkspaceSource::Current)]);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].name, "foo");
    }
}
