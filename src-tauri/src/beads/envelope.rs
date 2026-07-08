//! bd JSON envelope helpers.
//!
//! `bd --json` returns `{ schema_version: number, data: T }`.
//! All tauri commands that wrap a list-style `bd` command (list,
//! ready, blocked, search, query) extract `data` the same way;
//! this module owns that extraction so the per-command files
//! can stay focused on argv construction and filter semantics.

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::beads::{BdError, BdResult, Issue};

/// Extract the `data` field from a `bd` JSON envelope and deserialise
/// it into `T`.
///
/// `bd` returns `{ schema_version, data: T }` on success. `data` may
/// be missing (CLI drift, race with a delete, malformed response) or
/// not match `T`'s shape (a `bd` bug, a serde-version mismatch); both
/// surface as `BdError::ParseError` with a message that names the
/// offending field.
///
/// Used by [`runner::run_bd_envelope`](crate::beads::runner::run_bd_envelope)
/// for the list-style commands and directly by tests. The non-Issue
/// callers in `show_history.rs` continue to use their own
/// `extract_data_vec<T>` because `bd show` needs a friendlier
/// empty-array error after the generic deserialise — keeping the
/// generic here means the show-specific path can stay spelled out
/// there without ceremony.
pub(super) fn extract<T: DeserializeOwned>(output: Value) -> BdResult<T> {
    let data = output.get("data").ok_or_else(|| BdError::ParseError {
        message: "missing 'data' field in JSON envelope".to_string(),
    })?;
    serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
        message: format!("failed to parse from 'data' field: {e}"),
    })
}

/// Extract the `data: Vec<Issue>` array from a bd JSON envelope.
///
/// Thin convenience wrapper around [`extract`] that pins `T` to
/// `Vec<Issue>` so the existing test fixtures and call sites can
/// stay spelled out. New list-style commands should reach for
/// [`runner::run_bd_envelope`](crate::beads::runner::run_bd_envelope)
/// or, for raw `Value`s, [`extract::<Vec<Issue>>`](extract).
pub(super) fn extract_issues(output: Value) -> BdResult<Vec<Issue>> {
    extract(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::test_fixture::sample_issue_envelope;

    // ponytail: byte-identical tests previously lived as vestigial copies
    // in `ready_blocked.rs` (lines 54-83) and `search_query.rs` (lines
    // 35-64). Moved here so the helper's own definition site owns its
    // tests; caller modules exercise it indirectly through the public
    // `runner::run_bd_envelope` pipeline (covered by frontend e2e).

    #[test]
    fn test_extract_issues_parses_valid_envelope() {
        let envelope = sample_issue_envelope("beads-1", "Test issue");
        let issues = extract_issues(envelope).expect("should parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "beads-1");
    }

    #[test]
    fn test_extract_issues_returns_error_on_missing_data_field() {
        let envelope = serde_json::json!({
            "schema_version": 1
        });

        let result = extract_issues(envelope);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_issues_returns_error_on_invalid_data_shape() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": { "not": "an array" }
        });

        let result = extract_issues(envelope);
        assert!(result.is_err());
    }
}
