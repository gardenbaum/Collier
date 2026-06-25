//! `bd gate list --json` + per-gate detail commands.
//!
//! Beads represents async workflow gates as issues of type `gate`
//! (see `IssueType::Gate`). The `bd gate list` subcommand is the
//! canonical read surface — it returns open gates by default and
//! accepts `--all` for the closed-half view. Per-gate detail
//! (`bd gate show <id>`) is essentially `bd show <id>` with a type
//! guard; we delegate to `bd_show` so the GUI reuses the existing
//! detail payload rather than parsing a second format.
//!
//! M6 surfaces gates as a dedicated view in the workspace shell:
//! the operator can see every open gate, the issue it's blocking
//! (via the `blocks` dependency), and jump into the detail drawer
//! for the gate or its dependent. Writes (`bd gate resolve`) are
//! out of scope for this card — read-only surfacing is enough to
//! answer "what is blocking my workflow right now".

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::beads::{issue_status_is_closed, runner, BdError, BdResult, Issue};

/// One row of the `bd gate list --json` response.
///
/// The CLI (1.0.5) emits the same `{ id, title, status, priority,
/// issue_type, ... }` shape that `bd list --json` uses, just
/// filtered to `issue_type == "gate"`. We accept the full Issue
/// schema so the gates view can render every column the issue
/// list exposes (title, status pill, priority dot, age) without a
/// second IPC round-trip.
///
/// `is_closed` is derived on the Rust side from the status string
/// (via [`crate::beads::issue_status_is_closed`]) so the
/// frontend's open/closed toggle (a future follow-up) can branch
/// on a single boolean instead of string-matching `"closed"`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GateEntry {
    pub issue: Issue,
    pub is_closed: bool,
}

/// Run `bd gate list [--all] --json` in `cwd` and return the parsed
/// entries. Default scope is open gates (matching the CLI's own
/// default); pass `include_closed: true` to opt into the full
/// history view.
#[tauri::command]
#[specta::specta]
pub async fn bd_gate_list(cwd: String, include_closed: Option<bool>) -> BdResult<Vec<GateEntry>> {
    let path = PathBuf::from(&cwd);
    let mut argv: Vec<&str> = vec!["gate", "list"];
    if include_closed.unwrap_or(false) {
        argv.push("--all");
    }
    argv.push("--json");
    let output = runner::run_bd(&argv, &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    parse_gate_list(value)
}

/// Parse the `bd gate list --json` response into [`GateEntry`] rows.
///
/// The CLI returns a flat array (no `data` envelope wrapper — same
/// as `bd label list-all`). Each element is the full Issue object
/// for the gate. We map each into a [`GateEntry`] with the
/// `is_closed` flag precomputed so the frontend doesn't have to
/// import the `IssueStatus` enum just to filter on it.
pub fn parse_gate_list(value: serde_json::Value) -> BdResult<Vec<GateEntry>> {
    if let Some(data) = value.get("data") {
        // Defensive: future CLI builds might wrap in a `{ data }`
        // envelope. Extract the inner array and parse it.
        let issues: Vec<Issue> =
            serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
                message: format!("bd gate list: failed to parse data array: {e}"),
            })?;
        return Ok(issues.into_iter().map(gate_entry_from_issue).collect());
    }
    let issues: Vec<Issue> = serde_json::from_value(value).map_err(|e| BdError::ParseError {
        message: format!("bd gate list: failed to parse array: {e}"),
    })?;
    Ok(issues.into_iter().map(gate_entry_from_issue).collect())
}

/// Build a [`GateEntry`] from a parsed [`Issue`], deriving
/// `is_closed` from the status. Centralised so the GUI's "open vs.
/// all" toggle and any future filtering keep the same definition
/// of "closed" — the canonical `closed` value only.
fn gate_entry_from_issue(issue: Issue) -> GateEntry {
    let is_closed = issue_status_is_closed(&issue.status);
    GateEntry { issue, is_closed }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::{
        Issue, IssuePriority, IssueStatus, IssueType, ISSUE_STATUS_BLOCKED, ISSUE_STATUS_CLOSED,
        ISSUE_STATUS_DEFERRED, ISSUE_STATUS_IN_PROGRESS, ISSUE_STATUS_OPEN,
    };
    use chrono::Utc;
    use serde_json::json;

    fn base_issue(status: IssueStatus) -> Issue {
        Issue {
            id: "bd-gate-1".to_string(),
            title: "Wait for CI".to_string(),
            status,
            priority: IssuePriority::P2,
            issue_type: IssueType::Gate,
            created_at: Utc::now(),
            updated_at: None,
            closed_at: None,
            description: None,
            owner: None,
            labels: Vec::new(),
            dependencies: Vec::new(),
            dependents: Vec::new(),
            dependency_count: 0,
            dependent_count: 0,
            comment_count: 0,
            parent: None,
            acceptance_criteria: None,
            external_ref: None,
        }
    }

    /// Bare-array CLI response (the 1.0.5 contract) parses into
    /// one entry per issue with `is_closed` derived from status.
    #[test]
    fn parses_bare_array() {
        let value = json!([
            {
                "id": "bd-gate-1",
                "title": "Wait for CI",
                "status": "open",
                "priority": 2,
                "issue_type": "gate",
                "created_at": "2026-06-25T00:00:00Z"
            },
            {
                "id": "bd-gate-2",
                "title": "Manual review",
                "status": "closed",
                "priority": 1,
                "issue_type": "gate",
                "created_at": "2026-06-25T00:00:00Z",
                "closed_at": "2026-06-25T01:00:00Z"
            }
        ]);
        let entries = parse_gate_list(value).expect("parses");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].issue.id, "bd-gate-1");
        assert!(!entries[0].is_closed);
        assert_eq!(entries[1].issue.id, "bd-gate-2");
        assert!(entries[1].is_closed);
    }

    /// Some CLI builds wrap in `{ data: [...] }`. The mapper
    /// unwraps it so both shapes are accepted.
    #[test]
    fn parses_wrapped_envelope() {
        let value = json!({
            "schema_version": 1,
            "data": [
                {
                    "id": "bd-gate-1",
                    "title": "Wait for CI",
                    "status": "open",
                    "priority": 2,
                    "issue_type": "gate",
                    "created_at": "2026-06-25T00:00:00Z"
                }
            ]
        });
        let entries = parse_gate_list(value).expect("parses");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].issue.id, "bd-gate-1");
    }

    /// `is_closed` derives from the canonical `closed` value only —
    /// `deferred`, `blocked`, `in_progress`, `open`, `pinned`,
    /// `hooked` (and any custom status) all count as "still open".
    /// This guards against the gates view accidentally hiding a
    /// `deferred` gate from the operator.
    #[test]
    fn is_closed_only_for_closed_status() {
        for (status, expected) in [
            (ISSUE_STATUS_OPEN.to_string(), false),
            (ISSUE_STATUS_IN_PROGRESS.to_string(), false),
            (ISSUE_STATUS_BLOCKED.to_string(), false),
            (ISSUE_STATUS_DEFERRED.to_string(), false),
            (ISSUE_STATUS_CLOSED.to_string(), true),
        ] {
            let entry = gate_entry_from_issue(base_issue(status.clone()));
            assert_eq!(entry.is_closed, expected, "status={status:?}");
        }
    }

    /// Empty array (no gates) is a valid response — the parser
    /// returns an empty Vec, not an error.
    #[test]
    fn empty_array_is_empty_vec() {
        let entries = parse_gate_list(json!([])).expect("parses");
        assert!(entries.is_empty());
    }

    /// Malformed shape (object that isn't the wrapped envelope)
    /// surfaces as a typed ParseError.
    #[test]
    fn malformed_shape_is_parse_error() {
        let value = json!({"oops": "wrong shape"});
        assert!(parse_gate_list(value).is_err());
    }
}
