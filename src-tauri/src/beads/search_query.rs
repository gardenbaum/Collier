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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::envelope;

    // ponytail: same envelope-extraction contract as `ready_blocked.rs` —
    // the public command path is verified end-to-end by the SearchView
    // frontend tests. Here we only prove the helper handles the three
    // envelope shapes we expect to see from `bd`.

    #[test]
    fn test_extract_data_parses_valid_envelope() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": [
                {
                    "id": "beads-1",
                    "title": "Test issue",
                    "status": "open",
                    "priority": 2,
                    "issue_type": "bug",
                    "created_at": "2026-04-20T12:00:00Z",
                    "updated_at": null,
                    "closed_at": null,
                    "description": null,
                    "owner": null,
                    "labels": [],
                    "dependencies": [],
                    "dependency_count": 0,
                    "dependent_count": 0,
                    "comment_count": 0,
                    "parent": null,
                    "acceptance_criteria": null,
                    "external_ref": null
                }
            ]
        });

        let issues = envelope::extract_issues(envelope).expect("should parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "beads-1");
    }

    #[test]
    fn test_extract_data_returns_error_on_missing_data_field() {
        let envelope = serde_json::json!({
            "schema_version": 1
        });

        let result = envelope::extract_issues(envelope);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_data_returns_error_on_invalid_data_shape() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": { "not": "an array" }
        });

        let result = envelope::extract_issues(envelope);
        assert!(result.is_err());
    }
}
