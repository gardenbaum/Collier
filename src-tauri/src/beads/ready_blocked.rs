//! `bd ready` and `bd blocked` commands.
//!
//! These are thin wrappers over `runner::run_bd_envelope` that invoke
//! `bd ready --json` and `bd blocked --json` (the latter delegating to
//! `bd list --json` + a post-filter; see `bd_blocked` for why).
//! `run_bd_envelope` folds the shared `run_bd` + `BdOutput` match +
//! `envelope::extract<T>` pipeline so each command body stays one
//! or two lines.

use crate::beads::{runner, BdResult, Issue, ISSUE_STATUS_BLOCKED};
use std::path::PathBuf;

/// Run `bd ready --json` in `cwd` and return the list of ready issues.
#[tauri::command]
#[specta::specta]
pub async fn bd_ready(cwd: String) -> BdResult<Vec<Issue>> {
    runner::run_bd_envelope(&["ready", "--json"], &PathBuf::from(&cwd)).await
}

/// Run `bd blocked --json` in `cwd` and return the list of blocked issues.
///
/// **Implementation note (M3 R8):** `bd blocked --json` returns a
/// sparser shape than `bd list --json` — it omits `dependency_count`
/// and `dependent_count`, only emitting `blocked_by_count` and
/// `blocked_by` (array of IDs). Without those counts, every row's
/// `DependencyBadge` renders with counts of 0, which silently
/// drops the "blocks N" chip for an issue that has zero incoming
/// blockers but blocks others (TASK_REFAC in the fixture is one).
/// We delegate to `bd list --json` and filter to the same set
/// `bd blocked` would have returned: issues whose status is
/// `blocked` (manually-marked) OR that have at least one open
/// blocker (`dependency_count > 0`).
#[tauri::command]
#[specta::specta]
pub async fn bd_blocked(cwd: String) -> BdResult<Vec<Issue>> {
    let issues =
        runner::run_bd_envelope::<Vec<Issue>>(&["list", "--json"], &PathBuf::from(&cwd)).await?;
    Ok(issues
        .into_iter()
        .filter(|i| i.status == ISSUE_STATUS_BLOCKED || i.dependency_count > 0)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::envelope;
    use crate::beads::test_fixture::{sample_issue_envelope, sample_issues_envelope, SampleIssue};

    // ponytail: unit test with a mocked run_bd would require a test harness.
    // Integration tests against real `bd` would follow the skip_if_no_bd pattern
    // used in runner.rs. For now, the contract is verified by the frontend
    // integration tests (ReadyView.test.tsx / BlockedView.test.tsx).

    #[test]
    fn test_extract_data_parses_valid_envelope() {
        let envelope = sample_issue_envelope("beads-1", "Test issue");
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

    #[test]
    fn test_bd_blocked_filter_keeps_status_blocked_and_open_blockers() {
        // ponytail: bd_blocked delegates to bd list + filter. The
        // filter must keep (a) issues whose status is `blocked`
        // even when they have no open blockers (TASK_REFAC in the
        // fixture), AND (b) issues with at least one open blocker
        // even when their status is open (TASK_OPT's child CACHE).
        let envelope = sample_issues_envelope(&[
            SampleIssue {
                id: "beads-status-blocked-no-deps".into(),
                title: "manually blocked".into(),
                status: "blocked".into(),
                dependent_count: 1,
                ..SampleIssue::new("x", "x")
            },
            SampleIssue {
                id: "beads-open-with-blocker".into(),
                title: "blocked by upstream".into(),
                dependency_count: 1,
                ..SampleIssue::new("x", "x")
            },
            SampleIssue {
                id: "beads-ready".into(),
                title: "ready to work".into(),
                ..SampleIssue::new("x", "x")
            },
            SampleIssue {
                id: "beads-closed".into(),
                title: "shipped".into(),
                status: "closed".into(),
                ..SampleIssue::new("x", "x")
            },
        ]);

        let issues = envelope::extract_issues(envelope).expect("should parse");
        let kept: Vec<&Issue> = issues
            .iter()
            .filter(|i| i.status == ISSUE_STATUS_BLOCKED || i.dependency_count > 0)
            .collect();
        let ids: Vec<&str> = kept.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["beads-status-blocked-no-deps", "beads-open-with-blocker"]
        );
    }
}
