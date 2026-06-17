//! Recent-repositories list management commands.
//!
//! The bootstrap flow uses `recent_repos` to populate the "recent
//! repositories" list in `RepoSelection`. The list is persisted inside
//! `AppPreferences` (see `crate::types::AppPreferences`) and capped at
//! 10 entries — most-recent first.

use tauri::AppHandle;

use crate::commands::preferences::{
    get_preferences_path, load_preferences_inner, save_preferences_inner,
};
use crate::types::AppPreferences;

/// Maximum number of entries kept in `recent_repos`. Older entries are
/// dropped when this cap is exceeded.
const MAX_RECENT_REPOS: usize = 10;

/// Adds a path to the recent-repositories list and persists preferences.
///
/// Dedup: if `path` is already present, it is moved to the top (most
/// recent) instead of being appended. After dedup, the list is capped at
/// [`MAX_RECENT_REPOS`].
#[tauri::command]
#[specta::specta]
pub async fn add_recent_repo(app: AppHandle, path: String) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("path cannot be empty".to_string());
    }

    let prefs_path = get_preferences_path(&app)?;
    let mut prefs: AppPreferences = load_preferences_inner(&prefs_path)?;

    // Remove existing entry (if any) so the new entry lands at the top.
    prefs.recent_repos.retain(|p| p != &path);
    prefs.recent_repos.insert(0, path);

    // Prune to the cap.
    if prefs.recent_repos.len() > MAX_RECENT_REPOS {
        prefs.recent_repos.truncate(MAX_RECENT_REPOS);
    }

    save_preferences_inner(&prefs_path, &prefs)?;
    log::info!(
        "Updated recent_repos ({} entries)",
        prefs.recent_repos.len()
    );
    Ok(())
}

/// Returns the current working directory as a UTF-8 string.
///
/// Tauri 2.11's `PathResolver` does not expose a `current_dir()` method
/// (unlike the JS-side `@tauri-apps/api/path`), so we wrap
/// `std::env::current_dir()` in a tauri command. Used by the bootstrap
/// screen's "Use CWD" link.
#[tauri::command]
#[specta::specta]
pub fn get_current_dir(_app: AppHandle) -> Result<String, String> {
    std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {e}"))?
        .to_str()
        .map(String::from)
        .ok_or_else(|| "Current directory path is not valid UTF-8".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::AppPreferences;
    use std::fs;
    use tempfile::TempDir;

    fn write_prefs(dir: &TempDir, prefs: &AppPreferences) -> std::path::PathBuf {
        let path = dir.path().join("preferences.json");
        fs::write(&path, serde_json::to_string_pretty(prefs).unwrap()).unwrap();
        path
    }

    fn read_prefs(path: &std::path::Path) -> AppPreferences {
        let raw = fs::read_to_string(path).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    /// In-process dedup logic mirror — exercises the same algorithm
    /// the command uses, without needing a Tauri AppHandle. The
    /// command itself is a thin shell over this logic.
    fn apply_add(recent: &mut Vec<String>, path: String) {
        recent.retain(|p| p != &path);
        recent.insert(0, path);
        if recent.len() > MAX_RECENT_REPOS {
            recent.truncate(MAX_RECENT_REPOS);
        }
    }

    #[test]
    fn add_new_path_goes_to_top() {
        let mut recent = vec!["/a".to_string(), "/b".to_string()];
        apply_add(&mut recent, "/c".to_string());
        assert_eq!(recent, vec!["/c", "/a", "/b"]);
    }

    #[test]
    fn add_existing_path_moves_to_top() {
        let mut recent = vec!["/a".to_string(), "/b".to_string(), "/c".to_string()];
        apply_add(&mut recent, "/b".to_string());
        assert_eq!(recent, vec!["/b", "/a", "/c"]);
    }

    #[test]
    fn add_existing_path_does_not_duplicate() {
        let mut recent = vec!["/a".to_string(), "/b".to_string()];
        apply_add(&mut recent, "/a".to_string());
        assert_eq!(recent, vec!["/a", "/b"]);
        assert_eq!(recent.iter().filter(|p| *p == "/a").count(), 1);
    }

    #[test]
    fn add_caps_at_max_recent_repos() {
        let mut recent: Vec<String> = (0..MAX_RECENT_REPOS).map(|i| format!("/p{i}")).collect();
        apply_add(&mut recent, "/new".to_string());
        assert_eq!(recent.len(), MAX_RECENT_REPOS);
        assert_eq!(recent[0], "/new");
        // The oldest entry (was at the tail) is now gone.
        assert!(!recent.contains(&"/p9".to_string()));
    }

    #[test]
    fn add_empty_path_is_rejected() {
        let result = validate_add_input("");
        assert!(result.is_err());
    }

    #[test]
    fn add_whitespace_path_is_rejected() {
        let result = validate_add_input("   ");
        assert!(result.is_err());
    }

    fn validate_add_input(path: &str) -> Result<(), String> {
        let path = path.trim();
        if path.is_empty() {
            return Err("path cannot be empty".to_string());
        }
        Ok(())
    }

    #[test]
    fn empty_recent_repos_round_trips_via_serde() {
        let prefs = AppPreferences::default();
        assert_eq!(prefs.recent_repos, Vec::<String>::new());
        let json = serde_json::to_string(&prefs).unwrap();
        let back: AppPreferences = serde_json::from_str(&json).unwrap();
        assert_eq!(back.recent_repos, Vec::<String>::new());
    }

    #[test]
    fn old_preferences_json_without_recent_repos_still_deserializes() {
        // Simulate a `preferences.json` written before T9 added the field.
        let old_json = r#"{
            "theme": "dark",
            "quick_pane_shortcut": null,
            "language": null
        }"#;
        let prefs: AppPreferences = serde_json::from_str(old_json)
            .expect("old preferences.json must still parse via #[serde(default)]");
        assert_eq!(prefs.recent_repos, Vec::<String>::new());
    }

    #[test]
    fn recent_repos_persists_round_trip_through_disk() {
        let dir = TempDir::new().unwrap();
        let mut prefs = AppPreferences::default();
        apply_add(&mut prefs.recent_repos, "/repo1".to_string());
        apply_add(&mut prefs.recent_repos, "/repo2".to_string());
        let path = write_prefs(&dir, &prefs);

        let loaded = read_prefs(&path);
        assert_eq!(
            loaded.recent_repos,
            vec!["/repo2".to_string(), "/repo1".to_string()]
        );
    }
}
