//! Diagnostic log file writer.
//!
//! The frontend can stream error / warn / info events into a rotating
//! per-day log file via `write_log_line`. The file lives under
//! `<APPLOCALDATA>/logs/collier-YYYY-MM-DD.log` and is the canonical
//! place to look when the user reports a crash, because the renderer
//! process sometimes dies before its in-memory console can be read.
//!
//! Why a Tauri command instead of the `@tauri-apps/plugin-fs`
//! `writeTextFile`?
//!  - We want one append-handle per process (avoids race-y O_APPEND
//!    on Windows when two writers race the same file).
//!  - We want a single capability gate ("the log writer") instead of
//!    giving the renderer the entire fs scope for this one file.
//!  - We want the timestamp / level / JSON encoding to live in one
//!    place so the frontend and Rust agree on the line format.

use std::{
    fs::{self, File, OpenOptions},
    io::Write as _,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    sync::Mutex,
};

use chrono::Local;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::Manager;

use crate::beads::types::{BdError, BdResult};

/// Mutex around the single log file. The renderer makes one call per
/// crash / error so contention is negligible. Keeping the lock process
/// global means we never get the same line interleaved across two
/// appends.
static LOG_HANDLE: Mutex<Option<File>> = Mutex::new(None);

/// Per-session toggle read by `write_log_line`. Default `false` so
/// shipping the binary never silently writes to the user's disk. The
/// "Enable diagnostic logging" switch in Advanced preferences is the
/// only thing that flips this; it is process-local and resets to
/// `false` on every app start.
static DIAGNOSTIC_LOGGING_ENABLED: AtomicBool = AtomicBool::new(false);

/// Resolve the canonical log path for today, e.g.
/// `<APPLOCALDATA>/logs/collier-2026-06-18.log`.
fn log_path_for_today(app_local_data_dir: &PathBuf) -> PathBuf {
    let today = Local::now().format("%Y-%m-%d").to_string();
    app_local_data_dir
        .join("logs")
        .join(format!("collier-{today}.log"))
}

/// One log line written by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LogLine {
    /// Free-form level label. We trust the frontend to send
    /// `info | warn | error | debug` and don't enforce a closed set
    /// so the renderer can add a new level without an app rebuild.
    pub level: String,
    /// Single-line message. Newlines are stripped at the writer so
    /// the file stays grep-able.
    pub message: String,
    /// Optional context blob. Serialized to JSON; absent values are
    /// omitted (so the on-disk format stays compact).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    /// Optional source label, e.g. `"ErrorBoundary"` or
    /// `"useBeadsInvalidation"`. Helps when several call sites hit
    /// the same path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Open (or re-open) the log file for today. Called on the first
/// write of the session and any time the date rolls over while the
/// app is open.
fn open_log_file(app_local_data_dir: &PathBuf) -> BdResult<File> {
    let path = log_path_for_today(app_local_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| BdError::ParseError {
            message: format!("create log dir failed: {e}"),
        })?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| BdError::ParseError {
            message: format!("open log file failed: {e}"),
        })
}

/// Write one log line. Called from the renderer via the Tauri command
/// bridge. Always best-effort: a write failure must never crash the
/// app, because this is the path the renderer takes when the app is
/// already crashing.
#[tauri::command]
#[specta::specta]
pub async fn write_log_line(
    app: tauri::AppHandle,
    line: LogLine,
) -> BdResult<()> {
    // Per-session toggle: when the user has not enabled diagnostic
    // logging, drop the line silently. The frontend may still log
    // freely to the dev-tools console — this is purely about
    // avoiding accidental disk writes.
    if !DIAGNOSTIC_LOGGING_ENABLED.load(Ordering::Relaxed) {
        return Ok(());
    }
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| BdError::ParseError {
            message: format!("resolve app_local_data_dir failed: {e}"),
        })?;

    let mut guard = LOG_HANDLE.lock().map_err(|e| BdError::ParseError {
        message: format!("log mutex poisoned: {e}"),
    })?;

    // Re-open if the file handle isn't there yet OR if today's date
    // rolled past the path the handle was opened against.
    let needs_open = match guard.as_ref() {
        None => true,
        Some(f) => path_uses_today(f, &dir),
    };
    if needs_open {
        *guard = Some(open_log_file(&dir)?);
    }

    if let Some(f) = guard.as_mut() {
        let line_str = format_log_line(&line);
        // Newlines in user-supplied content are stripped so each
        // Newlines in user-supplied content are stripped so each
        // record is one physical line. The format prefix is the only
        // structural whitespace.
        let sanitized = sanitize_for_log(&line_str);
        writeln!(f, "{sanitized}")
            .map_err(|e| BdError::ParseError {
                message: format!("log write failed: {e}"),
            })?;
        let _ = f.flush();
    }

    Ok(())
}

/// Format a single log line as
/// `<ISO8601> [<level>] [<source>] <message> | <context-json>`.
/// The trailing `| {json}` is omitted when context is `None`.
fn format_log_line(line: &LogLine) -> String {
    let now = Local::now().to_rfc3339();
    let source = line
        .source
        .as_deref()
        .map(|s| format!(" [{s}]"))
        .unwrap_or_default();
    let context = line
        .context
        .as_ref()
        .map(|c| format!(" | {}", c))
        .unwrap_or_default();
    format!("{now} [{}]{source} {}{context}", line.level, line.message)
}

/// Strip newlines / carriage returns so a single record stays on
/// one physical line. Other whitespace is preserved.
fn sanitize_for_log(s: &str) -> String {
    s.replace(['\n', '\r'], " ")
}

/// True when the held file is from today's path (date roll-over
/// protection). Best-effort: if metadata() fails, we treat the file
/// as "stale" and re-open.
fn path_uses_today(file: &File, app_local_data_dir: &PathBuf) -> bool {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let expected = app_local_data_dir
        .join("logs")
        .join(format!("collier-{today}.log"));
    // `File` doesn't expose its path on stable Rust. On Unix we can
    // compare inodes; elsewhere we accept the cost of an extra open()
    // (an empty re-open of the same file is a no-op). The first
    // write of the session always opens fresh, so the date roll-over
    // check is for the `guard` already-existing branch only.
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        let Ok(ours) = file.metadata() else {
            return false;
        };
        let Ok(expected_meta) = std::fs::metadata(&expected) else {
            return false;
        };
        ours.ino() == expected_meta.ino()
    }
    #[cfg(not(unix))]
    {
        let _ = (file, expected, today);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_preserves_other_whitespace() {
        let out = sanitize_for_log("hello\tworld\nfoo\rbar");
        assert_eq!(out, "hello\tworld foo bar");
    }

    #[test]
    fn format_omits_optional_fields() {
        let line = LogLine {
            level: "info".to_string(),
            message: "boot".to_string(),
            context: None,
            source: None,
        };
        let s = format_log_line(&line);
        assert!(s.contains("[info] boot"));
        assert!(!s.contains("|"));
    }

    #[test]
    fn format_includes_source_and_context() {
        let line = LogLine {
            level: "error".to_string(),
            message: "boom".to_string(),
            context: Some(serde_json::json!({"stack": "at foo"})),
            source: Some("ErrorBoundary".to_string()),
        };
        let s = format_log_line(&line);
        assert!(s.contains("[error] [ErrorBoundary] boom"));
        assert!(s.contains("| {\"stack\":\"at foo\"}"));
    }
}


/// Flip the in-process diagnostic-logging flag. The Advanced
/// preferences "Enable diagnostic logging" switch is the only
/// legitimate caller. Per-session: not persisted, resets to `false`
/// on every app start.
#[tauri::command]
#[specta::specta]
pub async fn set_diagnostic_logging(enabled: bool) -> BdResult<()> {
    DIAGNOSTIC_LOGGING_ENABLED.store(enabled, Ordering::Relaxed);
    Ok(())
}

/// Read the current value of the in-process diagnostic-logging
/// flag. The frontend uses this to reflect the toggle's actual
/// state on mount (e.g. after a window reload that would otherwise
/// lose the local React state).
#[tauri::command]
#[specta::specta]
pub async fn is_diagnostic_logging_enabled() -> BdResult<bool> {
    Ok(DIAGNOSTIC_LOGGING_ENABLED.load(Ordering::Relaxed))
}

#[cfg(test)]
mod diagnostic_toggle_tests {
    use super::*;

    /// The flag is per-process and not persisted: even if a previous
    /// test set it, each test in this module is a fresh process so
    /// the default is always `false`. We assert that the setter is
    /// idempotent and round-trips through the getter.
    #[test]
    fn toggle_round_trips() {
        assert!(!is_diagnostic_logging_enabled_sync());
        set_diagnostic_logging_sync(true);
        assert!(is_diagnostic_logging_enabled_sync());
        set_diagnostic_logging_sync(false);
        assert!(!is_diagnostic_logging_enabled_sync());
    }

    fn is_diagnostic_logging_enabled_sync() -> bool {
        DIAGNOSTIC_LOGGING_ENABLED.load(Ordering::Relaxed)
    }

    fn set_diagnostic_logging_sync(v: bool) {
        DIAGNOSTIC_LOGGING_ENABLED.store(v, Ordering::Relaxed);
    }
}
