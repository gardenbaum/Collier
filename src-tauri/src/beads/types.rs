use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use specta::Type;

// ============================================================================
// Issue Status & Priority & Type
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum IssueStatus {
    Open,
    InProgress,
    Blocked,
    Closed,
    Deferred,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr, Type)]
#[repr(u8)]
pub enum IssuePriority {
    P0 = 0,
    P1 = 1,
    P2 = 2,
    P3 = 3,
    P4 = 4,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum IssueType {
    Bug,
    Feature,
    Task,
    Epic,
    Chore,
    Decision,
    Gate,
}

// ============================================================================
// Dependency
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DependencyType {
    Blocks,
    ParentChild,
    ConditionalBlocks,
    WaitsFor,
    Related,
    Tracks,
    DiscoveredFrom,
    CausedBy,
    Validates,
    Supersedes,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Dependency {
    pub dependency_id: String,
    pub dependency_type: DependencyType,
    pub blocked_by: Option<bool>,
}

// ============================================================================
// Label & Comment
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Label {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// One row of `bd label list-all --json`.
///
/// The real CLI (1.0.5, 2026-06-17) emits a list of
/// `[{ label: "<name>", count: <u32> }, ...]` — no `data`
/// envelope wrapper, just a bare array. `count` is the number of
/// issues carrying the label, which is the v1 source of truth for
/// the "usage count" the frontend renders next to each label.
///
/// ponytail: I chose to model `count` as `u32` (the CLI's native
/// type) rather than a `Label` wrapper struct, because (a) the
/// CLI doesn't carry label colours (Beads labels are plain text —
/// see AGENTS.md / AC-12), so reusing the existing `Label { name,
/// color: Option<String> }` struct would force a `color: None`
/// everywhere, and (b) the `count` is a sibling of `label`, not a
/// derived field. A flat `LabelWithCount { label, count }` is the
/// honest shape; any future "label has metadata" expansion
/// becomes a new struct, not a v1 break.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LabelWithCount {
    pub label: String,
    pub count: u32,
}

/// Result of `bd label propagate <parent> <label> --json`.
///
/// The real CLI (1.0.5, 2026-06-17) returns a flat array of
/// per-child entries `[{ issue_id, label, status }, ...]`, where
/// `status` is `"added"` or `"skipped"` (children that already
/// carry the label are reported as `skipped`). The Rust command
/// flattens that array into a `PropagationReport { added, skipped,
/// errors }` summary — the frontend doesn't need the per-child
/// rows, just the totals for the toast message.
///
/// `errors` collects any non-`added`/`skipped` statuses (or
/// unexpected shapes) as their stringified representation. The
/// `added` + `skipped` counts cover the happy path; a non-empty
/// `errors` vec tells the frontend the propagate was partial.
///
/// ponytail: `Default` is kept on the struct (so the mapper can
/// `PropagationReport::default()` for the empty-array CLI case) but
/// the fields are NOT decorated with `#[serde(default)]`. All three
/// are always populated by the Rust mapper before crossing the
/// bridge, so the TS type keeps them as required fields
/// (`{ added, skipped, errors }`, not `{ added?, skipped?, errors? }`)
/// — the v1 contract is "always present".
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PropagationReport {
    pub added: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

// ============================================================================
// History Entry
// ============================================================================

/// One entry from an issue's version history.
///
/// Sourced from `bd history <id> --json`. The CLI returns one entry per
/// commit on the issue's Dolt history; each commit captures a snapshot of
/// the issue at that point in time. The fields exposed here are the
/// frontend-friendly projection of that snapshot — the raw Dolt fields
/// (`CommitHash` / `Committer` / `CommitDate` / nested `Issue` snapshot)
/// are mapped in `show_history::bd_history` via an internal `Raw` struct
/// so the public type stays clean.
///
/// `action` is derived from the snapshot's `status` (e.g. `"status: open"`)
/// because the real `bd history` JSON does not carry a discrete action
/// code — it gives you the state at each commit, not the transition. The
/// 16b `IssueDetailView` History tab can use `details` for the title/role
/// context.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    /// Commit hash from Dolt. Acts as the unique row id.
    pub id: String,
    /// Issue id this entry belongs to.
    pub issue_id: String,
    /// When the commit was authored (UTC).
    pub timestamp: DateTime<Utc>,
    /// Derived: the issue's status at this commit (e.g. `"status: open"`).
    pub action: String,
    /// Dolt committer name. The CLI reports it for every entry, so the
    /// field stays `Option` to keep room for future CLI variants that
    /// might omit it.
    pub actor: Option<String>,
    /// Free-form context: the issue title at the time of the commit, plus
    /// the status. Helps the History tab render a useful one-liner.
    #[serde(default)]
    pub details: Option<String>,
}

// ============================================================================
// Molecule & Worktree
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Molecule {
    pub id: String,
    pub title: String,
    pub issue_ids: Vec<String>,
    pub status: IssueStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Worktree {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

// ============================================================================
// Sync Status
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SyncStatus {
    pub ahead: u32,
    pub behind: u32,
    pub dirty: bool,
    pub last_sync: Option<DateTime<Utc>>,
}

// ============================================================================
// Issue (main entity)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Issue {
    pub id: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub issue_type: IssueType,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub description: Option<String>,
    pub owner: Option<String>,
    pub labels: Vec<Label>,
    pub dependencies: Vec<Dependency>,
    pub dependency_count: u32,
    pub dependent_count: u32,
    pub comment_count: u32,
    pub parent: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub external_ref: Option<String>,
}

// ============================================================================
// BdError & BdResult
// ============================================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum BdError {
    NotFound {
        id: String,
    },
    SchemaMismatch {
        message: String,
    },
    BdNotInPath,
    Timeout {
        seconds: u64,
    },
    NonZeroExit {
        code: i32,
        stdout: String,
        stderr: String,
    },
    PermissionDenied {
        path: String,
    },
    DoltOnly {
        message: String,
    },
    ParseError {
        message: String,
    },
    IoError {
        message: String,
    },
    AlreadyLocked {
        repo_path: String,
    },
    NotARepo {
        path: String,
    },
}

pub type BdResult<T> = Result<T, BdError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_status_exhaustive_match() {
        match IssueStatus::Open {
            IssueStatus::Open
            | IssueStatus::InProgress
            | IssueStatus::Blocked
            | IssueStatus::Closed
            | IssueStatus::Deferred => {}
        }
    }

    #[test]
    fn issue_priority_exhaustive_match() {
        match IssuePriority::P0 {
            IssuePriority::P0
            | IssuePriority::P1
            | IssuePriority::P2
            | IssuePriority::P3
            | IssuePriority::P4 => {}
        }
    }

    #[test]
    fn issue_type_exhaustive_match() {
        match IssueType::Bug {
            IssueType::Bug
            | IssueType::Feature
            | IssueType::Task
            | IssueType::Epic
            | IssueType::Chore
            | IssueType::Decision
            | IssueType::Gate => {}
        }
    }

    #[test]
    fn dependency_type_exhaustive_match() {
        match DependencyType::Blocks {
            DependencyType::Blocks
            | DependencyType::ParentChild
            | DependencyType::ConditionalBlocks
            | DependencyType::WaitsFor
            | DependencyType::Related
            | DependencyType::Tracks
            | DependencyType::DiscoveredFrom
            | DependencyType::CausedBy
            | DependencyType::Validates
            | DependencyType::Supersedes => {}
        }
    }

    #[test]
    fn bd_error_exhaustive_match() {
        let sample = BdError::NotFound {
            id: "test".to_string(),
        };
        match sample {
            BdError::NotFound { .. }
            | BdError::SchemaMismatch { .. }
            | BdError::BdNotInPath
            | BdError::Timeout { .. }
            | BdError::NonZeroExit { .. }
            | BdError::PermissionDenied { .. }
            | BdError::DoltOnly { .. }
            | BdError::ParseError { .. }
            | BdError::IoError { .. }
            | BdError::AlreadyLocked { .. }
            | BdError::NotARepo { .. } => {}
        }
    }

    #[test]
    fn test_issue_status_serde_roundtrip() {
        let statuses = [
            IssueStatus::Open,
            IssueStatus::InProgress,
            IssueStatus::Blocked,
            IssueStatus::Closed,
            IssueStatus::Deferred,
        ];
        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            let back: IssueStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(status, back);
        }
    }

    #[test]
    fn test_issue_priority_serde_roundtrip() {
        let priorities = [
            IssuePriority::P0,
            IssuePriority::P1,
            IssuePriority::P2,
            IssuePriority::P3,
            IssuePriority::P4,
        ];
        for priority in priorities {
            let json = serde_json::to_string(&priority).unwrap();
            let back: IssuePriority = serde_json::from_str(&json).unwrap();
            assert_eq!(priority, back);
        }
    }

    #[test]
    fn test_issue_type_serde_roundtrip() {
        let types = [
            IssueType::Bug,
            IssueType::Feature,
            IssueType::Task,
            IssueType::Epic,
            IssueType::Chore,
            IssueType::Decision,
            IssueType::Gate,
        ];
        for issue_type in types {
            let json = serde_json::to_string(&issue_type).unwrap();
            let back: IssueType = serde_json::from_str(&json).unwrap();
            assert_eq!(issue_type, back);
        }
    }

    #[test]
    fn test_dependency_type_serde_roundtrip() {
        let deps = [
            DependencyType::Blocks,
            DependencyType::ParentChild,
            DependencyType::ConditionalBlocks,
            DependencyType::WaitsFor,
            DependencyType::Related,
            DependencyType::Tracks,
            DependencyType::DiscoveredFrom,
            DependencyType::CausedBy,
            DependencyType::Validates,
            DependencyType::Supersedes,
        ];
        for dep in deps {
            let json = serde_json::to_string(&dep).unwrap();
            let back: DependencyType = serde_json::from_str(&json).unwrap();
            assert_eq!(dep, back);
        }
    }

    #[test]
    fn test_bd_error_serde_roundtrip() {
        let errors = [
            BdError::NotFound {
                id: "beads-123".to_string(),
            },
            BdError::SchemaMismatch {
                message: "version mismatch".to_string(),
            },
            BdError::BdNotInPath,
            BdError::Timeout { seconds: 30 },
            BdError::NonZeroExit {
                code: 1,
                stdout: String::new(),
                stderr: "error".to_string(),
            },
            BdError::PermissionDenied {
                path: "/foo".to_string(),
            },
            BdError::DoltOnly {
                message: "needs dolt".to_string(),
            },
            BdError::ParseError {
                message: "bad json".to_string(),
            },
            BdError::IoError {
                message: "read failed".to_string(),
            },
            BdError::AlreadyLocked {
                repo_path: "/repo".to_string(),
            },
            BdError::NotARepo {
                path: "/tmp".to_string(),
            },
        ];
        for error in errors {
            let json = serde_json::to_string(&error).unwrap();
            let back: BdError = serde_json::from_str(&json).unwrap();
            assert_eq!(error, back);
        }
    }

    #[test]
    fn test_issue_serde_roundtrip() {
        let issue = Issue {
            id: "beads-abc".to_string(),
            title: "Fix the thing".to_string(),
            status: IssueStatus::Open,
            priority: IssuePriority::P2,
            issue_type: IssueType::Bug,
            created_at: DateTime::parse_from_rfc3339("2026-04-20T12:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            updated_at: Some(
                DateTime::parse_from_rfc3339("2026-04-21T14:30:00Z")
                    .unwrap()
                    .with_timezone(&Utc),
            ),
            closed_at: None,
            description: Some("Description here".to_string()),
            owner: Some("fabric".to_string()),
            labels: vec![Label {
                name: "bug".to_string(),
                color: Some("#ff0000".to_string()),
            }],
            dependencies: vec![Dependency {
                dependency_id: "beads-xyz".to_string(),
                dependency_type: DependencyType::Blocks,
                blocked_by: Some(true),
            }],
            dependency_count: 1,
            dependent_count: 0,
            comment_count: 2,
            parent: None,
            acceptance_criteria: Some("All tests pass".to_string()),
            external_ref: Some("JIRA-123".to_string()),
        };

        let json = serde_json::to_string(&issue).unwrap();
        let back: Issue = serde_json::from_str(&json).unwrap();
        assert_eq!(issue.id, back.id);
        assert_eq!(issue.title, back.title);
        assert_eq!(issue.status, back.status);
        assert_eq!(issue.priority, back.priority);
        assert_eq!(issue.issue_type, back.issue_type);
        assert_eq!(issue.labels.len(), back.labels.len());
        assert_eq!(issue.dependencies.len(), back.dependencies.len());
    }
}
