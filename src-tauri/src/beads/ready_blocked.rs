//! `bd ready` and `bd blocked` commands.
//!
//! These are thin wrappers over `runner::run_bd` that invoke `bd ready --json`
//! and `bd blocked --json` respectively, then extract the `data` vector from
//! the JSON envelope `{ schema_version: number, data: Issue[] }`.

use serde_json::Value;
use specta::Type;

use crate::beads::{runner, BdError, BdResult, Issue};

/// Extract the `data` field from a JSON envelope, mapping any parse errors
/// to `BdError::ParseError`.
fn extract_data(output: Value) -> BdResult<Vec<Issue>> {
    let data = output.get("data").ok_or_else(|| BdError::ParseError {
        message: "missing 'data' field in JSON envelope".to_string(),
    })?;
    let issues: Vec<Issue> =
        serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
            message: format!("failed to parse issues from 'data' field: {e}"),
        })?;
    Ok(issues)
}

/// Run `bd ready --json` in `cwd` and return the list of ready issues.
// ponytail: envelope extraction is a simple extract, no need for a separate helper lib
#[tauri::command]
#[specta::specta]
pub async fn bd_ready(cwd: String) -> BdResult<Vec<Issue>> {
    let path = std::path::PathBuf::from(&cwd);
    let output = runner::run_bd(&["ready", "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    extract_data(value)
}

/// Run `bd blocked --json` in `cwd` and return the list of blocked issues.
#[tauri::command]
#[specta::specta]
pub async fn bd_blocked(cwd: String) -> BdResult<Vec<Issue>> {
    let path = std::path::PathBuf::from(&cwd);
    let output = runner::run_bd(&["blocked", "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    extract_data(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ponytail: unit test with a mocked run_bd would require a test harness.
    // Integration tests against real `bd` would follow the skip_if_no_bd pattern
    // used in runner.rs. For now, the contract is verified by the frontend
    // integration tests (ReadyView.test.tsx / BlockedView.test.tsx).

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

        let issues = extract_data(envelope).expect("should parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "beads-1");
    }

    #[test]
    fn test_extract_data_returns_error_on_missing_data_field() {
        let envelope = serde_json::json!({
            "schema_version": 1
        });

        let result = extract_data(envelope);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_data_returns_error_on_invalid_data_shape() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": { "not": "an array" }
        });

        let result = extract_data(envelope);
        assert!(result.is_err());
    }
}
