//! bd JSON envelope helpers.
//!
//! `bd --json` returns `{ schema_version: number, data: T }`.
//! All tauri commands that wrap a list-style `bd` command (list,
//! ready, blocked, search, query) extract `data` the same way;
//! this module owns that extraction so the per-command files
//! can stay focused on argv construction and filter semantics.

use serde_json::Value;

use crate::beads::{BdError, BdResult, Issue};

/// Extract the `data: Vec<Issue>` array from a bd JSON envelope.
///
/// `bd` returns `{ schema_version, data: [...] }` on success.
/// `data` may be missing (CLI drift, race with a delete, malformed
/// response) or not an array (a `bd` bug that returned a bare object);
/// both surface as `BdError::ParseError` with a message that
/// names the offending field.
pub(super) fn extract_issues(output: Value) -> BdResult<Vec<Issue>> {
    let data = output.get("data").ok_or_else(|| BdError::ParseError {
        message: "missing 'data' field in JSON envelope".to_string(),
    })?;
    serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
        message: format!("failed to parse issues from 'data' field: {e}"),
    })
}
