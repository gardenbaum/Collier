//! Emergency data recovery commands.
//!
//! Provides a simple pattern for saving JSON data to disk for crash recovery
//! or session persistence.
//!
//! Error handling: all three commands (`save_emergency_data`,
//! `load_emergency_data`, `cleanup_old_recovery_files`) return
//! `BdResult<_>` — the same `BdError` discriminated union the rest of
//! the bridge uses. Migration away from the bespoke `RecoveryError`
//! enum was a v1.0 cleanup so the FE has one `unwrapResult` per call
//! site. The `RecoveryError` enum itself is still in `crate::types`
//! for any future v1.1 caller that wants richer error variants.

use serde_json::Value;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::beads::types::{BdError, BdResult};
use crate::types::{validate_filename, MAX_RECOVERY_DATA_BYTES};

/// Get the path to the recovery directory, creating it if necessary.
fn get_recovery_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app local data directory: {e}"))?;

    let recovery_dir = app_local_data_dir.join("recovery");

    std::fs::create_dir_all(&recovery_dir)
        .map_err(|e| format!("Failed to create recovery directory: {e}"))?;

    Ok(recovery_dir)
}

/// Saves emergency data to a JSON file for later recovery.
/// Validates filename and enforces a 10MB size limit.
#[tauri::command]
#[specta::specta]
pub async fn save_emergency_data(
    app: AppHandle,
    filename: String,
    data: Value,
) -> BdResult<()> {
    log::info!("Saving emergency data to file: {filename}");

    validate_filename(&filename)
        .map_err(|e| BdError::ParseError { message: e })?;

    let json_content = serde_json::to_string_pretty(&data).map_err(|e| {
        log::error!("Failed to serialize emergency data: {e}");
        BdError::ParseError {
            message: e.to_string(),
        }
    })?;

    if json_content.len() > MAX_RECOVERY_DATA_BYTES as usize {
        return Err(BdError::ParseError {
            message: format!(
                "Emergency data too large ({} bytes, max {})",
                json_content.len(),
                MAX_RECOVERY_DATA_BYTES
            ),
        });
    }

    let recovery_dir =
        get_recovery_dir(&app).map_err(|e| BdError::IoError { message: e })?;
    let file_path = recovery_dir.join(format!("{filename}.json"));

    // Write to a temporary file first, then rename (atomic operation)
    let temp_path = file_path.with_extension("tmp");

    std::fs::write(&temp_path, json_content).map_err(|e| {
        log::error!("Failed to write emergency data file: {e}");
        BdError::IoError {
            message: e.to_string(),
        }
    })?;

    if let Err(rename_err) = std::fs::rename(&temp_path, &file_path) {
        log::error!("Failed to finalize emergency data file: {rename_err}");
        if let Err(remove_err) = std::fs::remove_file(&temp_path) {
            log::warn!("Failed to remove temp file after rename failure: {remove_err}");
        }
        return Err(BdError::IoError {
            message: rename_err.to_string(),
        });
    }

    log::info!("Successfully saved emergency data to {file_path:?}");
    Ok(())
}

/// Loads emergency data from a previously saved JSON file.
/// Returns `BdError::NotFound` if the file doesn't exist.
#[tauri::command]
#[specta::specta]
pub async fn load_emergency_data(
    app: AppHandle,
    filename: String,
) -> BdResult<Value> {
    log::info!("Loading emergency data from file: {filename}");

    validate_filename(&filename)
        .map_err(|e| BdError::ParseError { message: e })?;

    let recovery_dir =
        get_recovery_dir(&app).map_err(|e| BdError::IoError { message: e })?;
    let file_path = recovery_dir.join(format!("{filename}.json"));

    if !file_path.exists() {
        log::info!("Recovery file not found: {file_path:?}");
        return Err(BdError::NotFound {
            id: filename.clone(),
        });
    }

    let contents = std::fs::read_to_string(&file_path).map_err(|e| {
        log::error!("Failed to read recovery file: {e}");
        BdError::IoError {
            message: e.to_string(),
        }
    })?;

    let data: Value = serde_json::from_str(&contents).map_err(|e| {
        log::error!("Failed to parse recovery JSON: {e}");
        BdError::ParseError {
            message: e.to_string(),
        }
    })?;

    log::info!("Successfully loaded emergency data");
    Ok(data)
}

/// Removes recovery files older than 7 days.
/// Returns the count of removed files.
#[tauri::command]
#[specta::specta]
pub async fn cleanup_old_recovery_files(app: AppHandle) -> BdResult<u32> {
    log::info!("Cleaning up old recovery files");

    let recovery_dir =
        get_recovery_dir(&app).map_err(|e| BdError::IoError { message: e })?;
    let mut removed_count = 0;

    // Calculate cutoff time (7 days ago)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| BdError::IoError {
            message: e.to_string(),
        })?
        .as_secs();
    let seven_days_ago = now - (7 * 24 * 60 * 60);

    let entries = std::fs::read_dir(&recovery_dir).map_err(|e| {
        log::error!("Failed to read recovery directory: {e}");
        BdError::IoError {
            message: e.to_string(),
        }
    })?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                log::warn!("Failed to read directory entry: {e}");
                continue;
            }
        };

        let path = entry.path();

        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                log::warn!("Failed to read file metadata: {e}");
                continue;
            }
        };

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if modified < seven_days_ago {
            if let Err(e) = std::fs::remove_file(&path) {
                log::warn!("Failed to remove old recovery file {path:?}: {e}");
            } else {
                removed_count += 1;
            }
        }
    }

    if removed_count > 0 {
        log::info!("Removed {removed_count} old recovery files");
    }

    Ok(removed_count)
}
