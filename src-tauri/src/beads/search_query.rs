//! `bd search` and `bd query` commands.
//!
//! Thin wrappers over `runner::run_bd_envelope` that invoke
//! `bd search <q> --json` and `bd query <q> --json`. The envelope
//! parsing (run_bd → match → extract) is folded into the helper,
//! so each command is a single call.

use crate::beads::{runner, BdResult, Issue};
use std::path::PathBuf;

/// Run `bd search <query> --json` in `cwd` and return matching issues.
#[tauri::command]
#[specta::specta]
pub async fn bd_search(cwd: String, query: String) -> BdResult<Vec<Issue>> {
    runner::run_bd_envelope(&["search", &query, "--json"], &PathBuf::from(&cwd)).await
}

/// Run `bd query <query> --json` in `cwd` and return matching issues.
#[tauri::command]
#[specta::specta]
pub async fn bd_query(cwd: String, query: String) -> BdResult<Vec<Issue>> {
    runner::run_bd_envelope(&["query", &query, "--json"], &PathBuf::from(&cwd)).await
}
