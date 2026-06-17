//! Preferences management commands.
//!
//! Handles loading and saving user preferences to disk.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::types::{validate_string_input, validate_theme, AppPreferences};

/// Gets the path to the preferences file.
pub fn get_preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    // Ensure the directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;

    Ok(app_data_dir.join("preferences.json"))
}

/// Inner load helper: reads `preferences.json` from `path` and
/// deserializes it. Returns `AppPreferences::default()` when the file
/// doesn't exist yet. Exposed for sibling modules (e.g. `recent_repos`)
/// that need the same load semantics without going through a Tauri
/// command.
pub fn load_preferences_inner(path: &Path) -> Result<AppPreferences, String> {
    if !path.exists() {
        return Ok(AppPreferences::default());
    }
    let contents = std::fs::read_to_string(path).map_err(|e| {
        log::error!("Failed to read preferences file: {e}");
        format!("Failed to read preferences file: {e}")
    })?;
    serde_json::from_str(&contents).map_err(|e| {
        log::error!("Failed to parse preferences JSON: {e}");
        format!("Failed to parse preferences: {e}")
    })
}

/// Inner save helper: serializes `prefs` and writes atomically (temp
/// file + rename) to `path`. Exposed for sibling modules that need to
/// persist without going through a Tauri command.
pub fn save_preferences_inner(path: &Path, prefs: &AppPreferences) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            log::error!("Failed to create preferences directory: {e}");
            format!("Failed to create preferences directory: {e}")
        })?;
    }

    let json_content = serde_json::to_string_pretty(prefs).map_err(|e| {
        log::error!("Failed to serialize preferences: {e}");
        format!("Failed to serialize preferences: {e}")
    })?;

    let temp_path = path.with_extension("tmp");
    std::fs::write(&temp_path, json_content).map_err(|e| {
        log::error!("Failed to write preferences file: {e}");
        format!("Failed to write preferences file: {e}")
    })?;

    if let Err(rename_err) = std::fs::rename(&temp_path, path) {
        log::error!("Failed to finalize preferences file: {rename_err}");
        if let Err(remove_err) = std::fs::remove_file(&temp_path) {
            log::warn!("Failed to remove temp file after rename failure: {remove_err}");
        }
        return Err(format!("Failed to finalize preferences file: {rename_err}"));
    }
    Ok(())
}

/// Load the saved quick pane shortcut from preferences, returning None on any failure.
/// Used at startup before the full preferences system is available.
pub fn load_quick_pane_shortcut(app: &AppHandle) -> Option<String> {
    let path = get_preferences_path(app).ok()?;
    if !path.exists() {
        return None;
    }
    let contents = std::fs::read_to_string(&path)
        .inspect_err(|e| log::warn!("Failed to read preferences: {e}"))
        .ok()?;
    let prefs: AppPreferences = serde_json::from_str(&contents)
        .inspect_err(|e| log::warn!("Failed to parse preferences: {e}"))
        .ok()?;
    prefs.quick_pane_shortcut
}

/// Simple greeting command for demonstration purposes.
#[tauri::command]
#[specta::specta]
pub fn greet(name: &str) -> Result<String, String> {
    // Input validation
    validate_string_input(name, 100, "Name").map_err(|e| {
        log::warn!("Invalid greet input: {e}");
        e
    })?;

    log::info!("Greeting user: {name}");
    Ok(format!("Hello, {name}! You've been greeted from Rust!"))
}

/// Loads user preferences from disk.
/// Returns default preferences if the file doesn't exist.
#[tauri::command]
#[specta::specta]
pub async fn load_preferences(app: AppHandle) -> Result<AppPreferences, String> {
    log::debug!("Loading preferences from disk");
    let prefs_path = get_preferences_path(&app)?;
    let preferences = load_preferences_inner(&prefs_path)?;
    log::info!("Successfully loaded preferences");
    Ok(preferences)
}

/// Saves user preferences to disk.
/// Uses atomic write (temp file + rename) to prevent corruption.
#[tauri::command]
#[specta::specta]
pub async fn save_preferences(app: AppHandle, preferences: AppPreferences) -> Result<(), String> {
    // Validate theme value
    validate_theme(&preferences.theme)?;

    log::debug!("Saving preferences to disk: {preferences:?}");
    let prefs_path = get_preferences_path(&app)?;
    save_preferences_inner(&prefs_path, &preferences)?;

    log::info!("Successfully saved preferences to {prefs_path:?}");
    Ok(())
}
