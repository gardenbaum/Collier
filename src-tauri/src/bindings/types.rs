//! Frontend-facing structs that cross the tauri-specta bridge.
//!
//! Kept separate from `beads::types` (which holds the domain types) so that
//! the IPC layer can evolve without touching the domain model. Today the
//! only inhabitant is `ListFilters`, used by `bd_list` to receive structured
//! filter arguments from the React IssueListView.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::beads::{IssuePriority, IssueStatus, IssueType};

/// Filter struct for `bd list --json`.
///
/// Every field is optional; an empty struct produces no filter arguments, and
/// the frontend can pass only the dimensions it actively filters by. Each
/// `Option<Vec<_>>` is repeatable on the CLI (`--status open --status closed`),
/// so passing multiple values is the natural shape.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListFilters {
    /// Filter by lifecycle status. Maps to `bd list --status` (repeatable).
    #[serde(default)]
    pub status: Option<Vec<IssueStatus>>,
    /// Filter by priority. Maps to `bd list --priority` (repeatable,
    /// bare integer 0..4 — `IssuePriority` uses `Serialize_repr`).
    #[serde(default)]
    pub priority: Option<Vec<IssuePriority>>,
    /// Filter by issue type. Maps to `bd list --type` (repeatable).
    #[serde(default)]
    pub issue_type: Option<Vec<IssueType>>,
    /// Filter by label name. Maps to `bd list --label` (repeatable).
    #[serde(default)]
    pub labels: Option<Vec<String>>,
    /// Filter by assignee/owner. Maps to `bd list --assignee` (repeatable).
    #[serde(default)]
    pub assignees: Option<Vec<String>>,
    /// Free-text search. Maps to `bd list --search` (single).
    /// Empty string is treated as "not set" so the frontend can pass `""`
    /// without producing a no-op `--search ""` flag.
    #[serde(default)]
    pub search: Option<String>,
    /// Maximum number of issues to return. Maps to `bd list --limit` (single).
    #[serde(default)]
    pub limit: Option<u32>,
}

impl ListFilters {
    /// Convert the filter struct into the `bd list` CLI argv (no leading
    /// subcommand, no trailing `--json` — the caller is responsible for
    /// adding both).
    pub fn to_args(&self) -> Vec<String> {
        let mut args: Vec<String> = Vec::new();

        if let Some(statuses) = &self.status {
            for s in statuses {
                args.push("--status".to_string());
                // ponytail: `serde_json::to_string` yields the snake_case form
                // per `#[serde(rename_all = "snake_case")]` (e.g. "in_progress").
                // `unwrap_or_default` is unreachable in practice (serde on
                // a unit enum never fails); the trim strips the wrapping quotes.
                args.push(
                    serde_json::to_string(s)
                        .unwrap_or_default()
                        .trim_matches('"')
                        .to_string(),
                );
            }
        }

        if let Some(priorities) = &self.priority {
            for p in priorities {
                args.push("--priority".to_string());
                // ponytail: `IssuePriority` is `#[repr(u8)] Serialize_repr`,
                // so it serializes as a bare integer 0..4 — the form `bd` expects.
                args.push((*p as u8).to_string());
            }
        }

        if let Some(types) = &self.issue_type {
            for t in types {
                args.push("--type".to_string());
                args.push(
                    serde_json::to_string(t)
                        .unwrap_or_default()
                        .trim_matches('"')
                        .to_string(),
                );
            }
        }

        if let Some(labels) = &self.labels {
            for l in labels {
                args.push("--label".to_string());
                args.push(l.clone());
            }
        }

        if let Some(assignees) = &self.assignees {
            for a in assignees {
                args.push("--assignee".to_string());
                args.push(a.clone());
            }
        }

        if let Some(q) = &self.search {
            if !q.is_empty() {
                args.push("--search".to_string());
                args.push(q.clone());
            }
        }

        if let Some(n) = self.limit {
            args.push("--limit".to_string());
            args.push(n.to_string());
        }

        args
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::{ISSUE_STATUS_IN_PROGRESS, ISSUE_STATUS_OPEN};

    #[test]
    fn test_to_args_with_empty_filters_returns_no_filter_args() {
        let filters = ListFilters::default();
        assert!(
            filters.to_args().is_empty(),
            "empty ListFilters must produce no CLI args"
        );
    }

    #[test]
    fn test_to_args_with_status_and_priority() {
        let filters = ListFilters {
            status: Some(vec![
                ISSUE_STATUS_OPEN.to_string(),
                ISSUE_STATUS_IN_PROGRESS.to_string(),
            ]),
            priority: Some(vec![IssuePriority::P0, IssuePriority::P2]),
            ..Default::default()
        };
        let args = filters.to_args();
        // Each flag is repeated per value; bare integer for priority.
        assert_eq!(
            args,
            vec![
                "--status",
                "open",
                "--status",
                "in_progress",
                "--priority",
                "0",
                "--priority",
                "2",
            ]
        );
    }

    #[test]
    fn test_to_args_with_search_and_limit() {
        let filters = ListFilters {
            search: Some("hello world".to_string()),
            limit: Some(10),
            ..Default::default()
        };
        let args = filters.to_args();
        assert_eq!(args, vec!["--search", "hello world", "--limit", "10"]);
    }

    #[test]
    fn test_to_args_with_labels_and_assignees_and_type() {
        let filters = ListFilters {
            issue_type: Some(vec![IssueType::Bug, IssueType::Feature]),
            labels: Some(vec!["urgent".to_string(), "frontend".to_string()]),
            assignees: Some(vec!["alice".to_string()]),
            ..Default::default()
        };
        let args = filters.to_args();
        assert_eq!(
            args,
            vec![
                "--type",
                "bug",
                "--type",
                "feature",
                "--label",
                "urgent",
                "--label",
                "frontend",
                "--assignee",
                "alice",
            ]
        );
    }

    #[test]
    fn test_to_args_with_empty_search_string_skips_flag() {
        let filters = ListFilters {
            search: Some(String::new()),
            ..Default::default()
        };
        assert!(
            filters.to_args().is_empty(),
            "empty search string must not produce a --search flag"
        );
    }

    #[test]
    fn test_to_args_combined_all_dimensions() {
        let filters = ListFilters {
            status: Some(vec![ISSUE_STATUS_OPEN.to_string()]),
            priority: Some(vec![IssuePriority::P1]),
            issue_type: Some(vec![IssueType::Task]),
            labels: Some(vec!["x".to_string()]),
            assignees: Some(vec!["bob".to_string()]),
            search: Some("query".to_string()),
            limit: Some(50),
        };
        let args = filters.to_args();
        assert_eq!(
            args,
            vec![
                "--status",
                "open",
                "--priority",
                "1",
                "--type",
                "task",
                "--label",
                "x",
                "--assignee",
                "bob",
                "--search",
                "query",
                "--limit",
                "50",
            ]
        );
    }
}

// ============================================================================
// CreateInput (task 21)
// ============================================================================

/// Input struct for `bd create --json`.
///
/// Every field except `title` is optional; an empty `CreateInput`
/// (with a title) produces a minimal-issue create. Empty strings on
/// optional `String` fields are treated as "not set" so the frontend
/// can pass `""` without producing a no-op `--description ""` flag.
/// Each `Option<Vec<_>>` is repeatable on the CLI (`--label x --label y`).
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateInput {
    /// Required title. Maps to `bd create --title`.
    pub title: String,
    /// Optional description. Maps to `bd create --description`. Empty
    /// string is treated as "not set" to avoid emitting `--description ""`.
    #[serde(default)]
    pub description: Option<String>,
    /// Optional issue type. Maps to `bd create --type` (bare enum name,
    /// e.g. `"bug"`, `"feature"`). If `None`, the CLI defaults to `"task"`.
    #[serde(default)]
    pub issue_type: Option<IssueType>,
    /// Optional priority. Maps to `bd create --priority` as a bare
    /// integer 0..4 (`IssuePriority` is `#[repr(u8)] Serialize_repr`).
    /// If `None`, the CLI defaults to `2` (P2).
    #[serde(default)]
    pub priority: Option<IssuePriority>,
    /// Optional assignee / owner. Maps to `bd create --assignee`.
    /// Empty string is treated as "not set".
    #[serde(default)]
    pub assignee: Option<String>,
    /// Optional labels. Maps to `bd create --label` (repeatable, one
    /// `--label` flag per element).
    #[serde(default)]
    pub labels: Option<Vec<String>>,
    /// Optional external reference (e.g. GitHub issue id). Maps to
    /// `bd create --external-ref`. Empty string is treated as "not set".
    #[serde(default)]
    pub external_ref: Option<String>,
}

impl CreateInput {
    /// Convert the input struct into the `bd create` CLI argv (no
    /// leading subcommand, no trailing `--json` — the caller is
    /// responsible for adding both).
    pub fn to_args(&self) -> Vec<String> {
        let mut args: Vec<String> = Vec::new();

        // `bd create` requires --title; the frontend validates this
        // before calling, but emit unconditionally so the contract is
        // total even if a future caller forgets the check.
        args.push("--title".to_string());
        args.push(self.title.clone());

        if let Some(d) = &self.description {
            // ponytail: empty string is a no-op — the CLI would happily
            // accept `--description ""` but it would be noise. Skip it
            // so the call site is forced to think about presence.
            if !d.is_empty() {
                args.push("--description".to_string());
                args.push(d.clone());
            }
        }

        if let Some(t) = &self.issue_type {
            args.push("--type".to_string());
            // `IssueType` is `#[serde(rename_all = "snake_case")]` so it
            // serializes to the bare lowercase form the CLI expects.
            // ponytail: `unwrap_or_default` is unreachable in practice
            // (unit-enum serde never fails); `.trim_matches('"')` strips
            // the wrapping JSON quotes. Same dance as `ListFilters`.
            args.push(
                serde_json::to_string(t)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
            );
        }

        if let Some(p) = &self.priority {
            args.push("--priority".to_string());
            // ponytail: `IssuePriority` is `#[repr(u8)] Serialize_repr`,
            // so it serializes as a bare integer 0..4 — the form `bd` expects.
            args.push((*p as u8).to_string());
        }

        if let Some(a) = &self.assignee {
            if !a.is_empty() {
                args.push("--assignee".to_string());
                args.push(a.clone());
            }
        }

        if let Some(labels) = &self.labels {
            // Repeatable: one `--label` flag per element.
            for l in labels {
                args.push("--label".to_string());
                args.push(l.clone());
            }
        }

        if let Some(e) = &self.external_ref {
            if !e.is_empty() {
                args.push("--external-ref".to_string());
                args.push(e.clone());
            }
        }

        args
    }
}

#[cfg(test)]
mod create_input_tests {
    use super::*;

    /// Minimal case: only `title` set. Confirms no extra flags leak
    /// through when the frontend passes a default-constructed struct
    /// with just a title.
    #[test]
    fn test_to_args_with_minimal_title_only() {
        let input = CreateInput {
            title: "Ship T21".to_string(),
            ..Default::default()
        };
        let args = input.to_args();
        assert_eq!(args, vec!["--title", "Ship T21"]);
    }

    /// All fields populated. Confirms every flag is emitted in the
    /// expected order, with priority as a bare integer and labels
    /// repeated per element.
    #[test]
    fn test_to_args_with_all_fields() {
        let input = CreateInput {
            title: "Ship T21".to_string(),
            description: Some("Build the create form".to_string()),
            issue_type: Some(IssueType::Bug),
            priority: Some(IssuePriority::P1),
            assignee: Some("alice".to_string()),
            labels: Some(vec!["urgent".to_string(), "frontend".to_string()]),
            external_ref: Some("JIRA-42".to_string()),
        };
        let args = input.to_args();
        assert_eq!(
            args,
            vec![
                "--title",
                "Ship T21",
                "--description",
                "Build the create form",
                "--type",
                "bug",
                "--priority",
                "1",
                "--assignee",
                "alice",
                "--label",
                "urgent",
                "--label",
                "frontend",
                "--external-ref",
                "JIRA-42",
            ]
        );
    }

    /// Empty `Option<String>` values for `description`, `assignee`, and
    /// `external_ref` must NOT emit a no-op flag. Also confirms `None`
    /// (the default) skips everything else.
    #[test]
    fn test_to_args_skips_empty_strings_and_none() {
        let input = CreateInput {
            title: "x".to_string(),
            description: Some(String::new()),
            issue_type: None,
            priority: None,
            assignee: Some(String::new()),
            labels: None,
            external_ref: Some(String::new()),
        };
        let args = input.to_args();
        assert_eq!(args, vec!["--title", "x"]);
    }
}

// ============================================================================
// UpdateInput (task 22)
// ============================================================================

/// Input struct for `bd update <id> <flags> --json`.
///
/// Every field is `Option<T>`. The semantics: a `None` field is "don't
/// change" (the CLI is not invoked with that flag at all); a
/// `Some(value)` field is "set to this value". This matches the
/// dirty-detection contract on the React side: the panel only sends
/// fields the user actually edited.
///
/// **Label semantics (v1 simplification)**: the real `bd update` (1.0.5)
/// uses `--add-label` (repeatable) and `--remove-label` for label
/// edits — there is no "set the new full list" flag. The v1 frontend
/// does not expose label editing from this panel; the label field is
/// omitted from `UpdateInput` entirely. T34-T36 will add a dedicated
/// label-edit flow that computes the add/remove diff and calls the
/// right flags.
///
/// **Empty-string handling**: same as `CreateInput` — `Some("")` for
/// `description` / `assignee` / `external_ref` is treated as "not set"
/// so the frontend can pass the empty string from a cleared input
/// without emitting a no-op `--description ""` flag.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    /// New title. Maps to `bd update --title`.
    #[serde(default)]
    pub title: Option<String>,
    /// New description. Maps to `bd update --description`. Empty
    /// string is treated as "not set" (same as `CreateInput`).
    #[serde(default)]
    pub description: Option<String>,
    /// New issue type. Maps to `bd update --type` (bare enum name,
    /// e.g. `"bug"`). `serde(rename_all = "snake_case")` produces the
    /// form the CLI expects.
    #[serde(default)]
    pub issue_type: Option<IssueType>,
    /// New priority. Maps to `bd update --priority` as a bare integer
    /// 0..4 (`IssuePriority` is `#[repr(u8)] Serialize_repr`).
    #[serde(default)]
    pub priority: Option<IssuePriority>,
    /// New lifecycle status. Maps to `bd update --status` (bare enum
    /// name, e.g. `"in_progress"`).
    #[serde(default)]
    pub status: Option<IssueStatus>,
    /// New assignee. Maps to `bd update --assignee` (the CLI uses
    /// `--assignee`, not `--owner`, even though the Rust `Issue` struct
    /// exposes the field as `owner` — the JSON keys differ, the
    /// flag-vs-attribute mismatch is intentional in the CLI). Empty
    /// string is treated as "not set".
    #[serde(default)]
    pub assignee: Option<String>,
    /// New external reference. Maps to `bd update --external-ref`.
    /// Empty string is treated as "not set".
    #[serde(default)]
    pub external_ref: Option<String>,
}

impl UpdateInput {
    /// Convert the input struct into the `bd update` CLI argv (no
    /// leading subcommand, no positional `<id>`, no trailing `--json`
    /// — the caller is responsible for adding all three).
    pub fn to_args(&self) -> Vec<String> {
        let mut args: Vec<String> = Vec::new();

        if let Some(t) = &self.title {
            args.push("--title".to_string());
            args.push(t.clone());
        }

        if let Some(d) = &self.description {
            // ponytail: empty string is a no-op (same as `CreateInput`).
            if !d.is_empty() {
                args.push("--description".to_string());
                args.push(d.clone());
            }
        }

        if let Some(t) = &self.issue_type {
            args.push("--type".to_string());
            // ponytail: same `serde_json::to_string` + `trim_matches('"')`
            // dance as `ListFilters` / `CreateInput`. `unwrap_or_default`
            // is unreachable in practice (unit-enum serde never fails).
            args.push(
                serde_json::to_string(t)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
            );
        }

        if let Some(p) = &self.priority {
            args.push("--priority".to_string());
            // ponytail: `IssuePriority` is `#[repr(u8)] Serialize_repr`,
            // so the form is a bare integer 0..4 — what `bd` expects.
            args.push((*p as u8).to_string());
        }

        if let Some(s) = &self.status {
            args.push("--status".to_string());
            args.push(
                serde_json::to_string(s)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
            );
        }

        if let Some(a) = &self.assignee {
            if !a.is_empty() {
                args.push("--assignee".to_string());
                args.push(a.clone());
            }
        }

        if let Some(e) = &self.external_ref {
            if !e.is_empty() {
                args.push("--external-ref".to_string());
                args.push(e.clone());
            }
        }

        args
    }
}

#[cfg(test)]
mod update_input_tests {
    use super::*;
    use crate::beads::{ISSUE_STATUS_BLOCKED, ISSUE_STATUS_IN_PROGRESS};

    /// `UpdateInput::default()` produces no CLI args at all. The caller
    /// still appends the positional `<id>` and `--json` — but the
    /// input itself must not contribute anything when nothing was
    /// changed. Catches a regression where a future field defaults to
    /// "send this flag even on None".
    #[test]
    fn test_to_args_with_no_changes_returns_no_args() {
        let input = UpdateInput::default();
        assert!(
            input.to_args().is_empty(),
            "default UpdateInput must produce no CLI args"
        );
    }

    /// A single-field edit (title only) emits exactly that one flag.
    /// This is the dirty-detection contract: the panel only sends
    /// what the user actually edited, so an "only title changed" save
    /// produces a minimal `bd update` call.
    #[test]
    fn test_to_args_with_title_only() {
        let input = UpdateInput {
            title: Some("Renamed".to_string()),
            ..Default::default()
        };
        let args = input.to_args();
        assert_eq!(args, vec!["--title", "Renamed"]);
    }

    /// Multi-field edit: priority emits a bare integer, status and
    /// type emit their snake_case names. Confirms the three enum
    /// fields use the same serialization dance as `CreateInput`.
    #[test]
    fn test_to_args_with_priority_and_status() {
        let input = UpdateInput {
            priority: Some(IssuePriority::P1),
            status: Some(ISSUE_STATUS_IN_PROGRESS.to_string()),
            ..Default::default()
        };
        let args = input.to_args();
        assert_eq!(args, vec!["--priority", "1", "--status", "in_progress"]);
    }

    /// Empty `Some("")` for the three text fields must be skipped
    /// (no-op flag suppression, same as `CreateInput`).
    #[test]
    fn test_to_args_skips_empty_string_text_fields() {
        let input = UpdateInput {
            description: Some(String::new()),
            assignee: Some(String::new()),
            external_ref: Some(String::new()),
            ..Default::default()
        };
        assert!(
            input.to_args().is_empty(),
            "empty Some(\"\") on text fields must not emit a flag"
        );
    }

    /// All fields populated. Confirms the full flag set and the
    /// expected ordering (matches the field declaration order in
    /// `UpdateInput`).
    #[test]
    fn test_to_args_with_all_fields() {
        let input = UpdateInput {
            title: Some("New title".to_string()),
            description: Some("New body".to_string()),
            issue_type: Some(IssueType::Feature),
            priority: Some(IssuePriority::P2),
            status: Some(ISSUE_STATUS_BLOCKED.to_string()),
            assignee: Some("bob".to_string()),
            external_ref: Some("JIRA-7".to_string()),
        };
        let args = input.to_args();
        assert_eq!(
            args,
            vec![
                "--title",
                "New title",
                "--description",
                "New body",
                "--type",
                "feature",
                "--priority",
                "2",
                "--status",
                "blocked",
                "--assignee",
                "bob",
                "--external-ref",
                "JIRA-7",
            ]
        );
    }
}
