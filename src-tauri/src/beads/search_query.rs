//! `bd search` and `bd query` commands.
//!
//! Thin wrappers over `runner::run_bd` that invoke `bd search <q> --json` and
//! `bd query <q> --json`, then extract the `data` vector from the JSON envelope
//! `{ schema_version: number, data: Issue[] }` via
//! `beads::envelope::extract_issues`.

use crate::beads::{envelope, runner, BdError, BdResult, Issue};

/// Run `bd search <query> --json` in `cwd` and return matching issues.
#[tauri::command]
#[specta::specta]
pub async fn bd_search(cwd: String, query: String) -> BdResult<Vec<Issue>> {
    let path = std::path::PathBuf::from(&cwd);
    let output = runner::run_bd(&["search", &query, "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    envelope::extract_issues(value)
}

/// Run `bd query <query> --json` in `cwd` and return matching issues.
#[tauri::command]
#[specta::specta]
pub async fn bd_query(cwd: String, query: String) -> BdResult<Vec<Issue>> {
    let path = std::path::PathBuf::from(&cwd);
    let output = runner::run_bd(&["query", &query, "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    envelope::extract_issues(value)
}

#[cfg(test)]
mod tests {
    use super::*;

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
