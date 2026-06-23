//! `bd list --json` with structured filters.
//!
//! Wraps `runner::run_bd` to invoke `bd list <flags> --json` based on the
//! frontend's `ListFilters` struct, then extracts the issue array from the
//! `{ schema_version, data }` envelope. Shares the envelope-extraction
//! helper with `search_query` (T15 is the third caller — extraction
//! justified per the T19 follow-up in the notepad).

use crate::beads::{runner, search_query, BdError, BdResult, Issue};
use crate::bindings::types::ListFilters;

/// Run `bd list <filters> --json` in `cwd` and return the matching issues.
///
/// `ListFilters::to_args` produces the flag argv; the runner's envelope
/// parsing kicks in because we append `--json`. The envelope's `data`
/// field is decoded into `Vec<Issue>` by `search_query::extract_data`
/// (made `pub(super)` for this caller).
#[tauri::command]
#[specta::specta]
pub async fn bd_list(cwd: String, filters: ListFilters) -> BdResult<Vec<Issue>> {
    let path = std::path::PathBuf::from(&cwd);
    // ponytail: pass `--all` so `bd list` returns every issue including
    // closed ones. Without it, `bd list` hides status=closed by default
    // (the Beads CLI's "active only" filter), which silently shrinks the
    // list the user sees and breaks any spec/caller that assumes a
    // known total (e.g. the M1 e2e specs that wait for the full
    // 25-issue fixture). The frontend's status filter is the surface for
    // "hide closed" — the app should never hide them by default.
    let mut argv: Vec<String> = Vec::with_capacity(filters.to_args().len() + 3);
    argv.push("list".to_string());
    argv.push("--all".to_string());
    argv.extend(filters.to_args());
    argv.push("--json".to_string());
    let arg_refs: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = runner::run_bd(&arg_refs, &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    search_query::extract_data(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::{IssuePriority, IssueStatus, IssueType};

    /// The contract: empty `ListFilters` -> no extra CLI args between
    /// `list` and `--json`. Guards against accidental `--search ""` or
    /// similar no-op flags being added by future filter dimensions.
    #[test]
    fn test_to_args_with_empty_filters_returns_no_filter_args() {
        let filters = ListFilters::default();
        assert!(filters.to_args().is_empty());
    }

    /// Each value produces its own flag. Priority uses the bare integer
    /// form (`IssuePriority` is `#[repr(u8)] Serialize_repr`).
    #[test]
    fn test_to_args_with_status_and_priority() {
        let filters = ListFilters {
            status: Some(vec![IssueStatus::Open, IssueStatus::Closed]),
            priority: Some(vec![IssuePriority::P0, IssuePriority::P2]),
            ..Default::default()
        };
        let args = filters.to_args();
        assert_eq!(
            args,
            vec![
                "--status",
                "open",
                "--status",
                "closed",
                "--priority",
                "0",
                "--priority",
                "2",
            ]
        );
    }

    /// `search` and `limit` are single-value flags (not repeatable).
    #[test]
    fn test_to_args_with_search_and_limit() {
        let filters = ListFilters {
            search: Some("foo".to_string()),
            limit: Some(10),
            ..Default::default()
        };
        let args = filters.to_args();
        assert_eq!(args, vec!["--search", "foo", "--limit", "10"]);
    }

    /// Verifies the list envelope shape parses through the shared
    /// `search_query::extract_data` helper — confirms T15's cross-module
    /// use works end-to-end.
    #[test]
    fn test_extract_data_parses_valid_list_envelope() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": [
                {
                    "id": "beads-list-1",
                    "title": "List envelope issue",
                    "status": "in_progress",
                    "priority": 1,
                    "issue_type": "task",
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
        let issues = search_query::extract_data(envelope).expect("should parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "beads-list-1");
        assert_eq!(issues[0].status, IssueStatus::InProgress);
        assert_eq!(issues[0].priority, IssuePriority::P1);
        assert_eq!(issues[0].issue_type, IssueType::Task);
    }
}
