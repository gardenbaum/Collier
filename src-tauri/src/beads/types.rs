use chrono::{DateTime, Utc};
use serde::de::{self, Deserializer, Visitor};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use specta::Type;
use std::fmt;

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

/// A label attached to an issue. Beads v1 has no colour metadata
/// for labels, but the v1 `bd list --json` output may emit labels
/// as either a bare string (`"security"`) or a `{name, color}`
/// object depending on the CLI build. Both shapes are accepted by
/// the custom `Deserialize` impl below; serialization is unchanged
/// (the `Label { name, color }` shape). The frontend bindings
/// (specta-generated `bindings.ts`) keep the `Label` name.
#[derive(Debug, Clone, Serialize, Type)]
pub struct Label {
    pub name: String,
    pub color: Option<String>,
}

impl<'de> Deserialize<'de> for Label {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct LabelVisitor;

        impl<'de> Visitor<'de> for LabelVisitor {
            type Value = Label;

            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a label string or a {name, color} object")
            }

            fn visit_str<E>(self, s: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(Label {
                    name: s.to_string(),
                    color: None,
                })
            }

            fn visit_string<E>(self, s: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(Label {
                    name: s,
                    color: None,
                })
            }

            fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
            where
                M: de::MapAccess<'de>,
            {
                #[derive(Deserialize)]
                struct Raw {
                    #[serde(default)]
                    name: String,
                    #[serde(default)]
                    color: Option<String>,
                }
                let raw: Raw =
                    Deserialize::deserialize(de::value::MapAccessDeserializer::new(&mut map))?;
                Ok(Label {
                    name: raw.name,
                    color: raw.color,
                })
            }
        }

        deserializer.deserialize_any(LabelVisitor)
    }
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

// Molecule, Worktree, SyncStatus were forward-declared for a v2
// roadmap that was deprioritized. Deleting now — re-add when a
// command actually returns one of these.

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

    /// Regression: `bd list --json` emits labels as bare strings
    /// (`["security", "auth"]`), not as `{name, color}` objects.
    /// The default `#[derive(Deserialize)]` for `Label` rejects the
    /// bare-string shape, which surfaced in the M0 E2E smoke test
    /// as a `Failed to load: ... invalid type: string "security",
    /// expected struct Label` parse error from the Tauri command.
    /// The custom deserializer on `Label` accepts both.
    #[test]
    fn test_label_deserializes_bare_string_and_object_shapes() {
        let from_str: Label = serde_json::from_str("\"security\"").unwrap();
        assert_eq!(from_str.name, "security");
        assert_eq!(from_str.color, None);

        let from_obj: Label = serde_json::from_str(r##"{"name":"auth","color":"#abc"}"##).unwrap();
        assert_eq!(from_obj.name, "auth");
        assert_eq!(from_obj.color.as_deref(), Some("#abc"));

        // Object with no color field -- also valid.
        let from_obj_no_color: Label = serde_json::from_str(r#"{"name":"perf"}"#).unwrap();
        assert_eq!(from_obj_no_color.name, "perf");
        assert_eq!(from_obj_no_color.color, None);

        // Serialization is unchanged -- still emits the object shape.
        let serialized = serde_json::to_string(&Label {
            name: "x".to_string(),
            color: None,
        })
        .unwrap();
        assert_eq!(serialized, r#"{"name":"x","color":null}"#);
    }

    /// Regression: an `Issue` with labels-as-strings (the shape bd
    /// actually emits) parses through the same `Vec<Label>` field
    /// that previously rejected it.
    #[test]
    fn test_issue_with_string_labels_parses() {
        let json = r#"{
            "id": "beads-1",
            "title": "x",
            "status": "open",
            "priority": 1,
            "issue_type": "task",
            "created_at": "2026-04-20T12:00:00Z",
            "updated_at": null,
            "closed_at": null,
            "description": null,
            "owner": null,
            "labels": ["security", "auth"],
            "dependencies": [],
            "dependency_count": 0,
            "dependent_count": 0,
            "comment_count": 0,
            "parent": null,
            "acceptance_criteria": null,
            "external_ref": null
        }"#;
        let issue: Issue = serde_json::from_str(json).expect("string labels should parse");
        assert_eq!(issue.labels.len(), 2);
        assert_eq!(issue.labels[0].name, "security");
        assert_eq!(issue.labels[1].name, "auth");
        assert!(issue.labels.iter().all(|l| l.color.is_none()));
    }

    /// Regression: a `bd list --json` envelope captured from a real
    /// `scripts/make-fixture.sh` workspace (bd v1.0.4, with
    /// `BD_JSON_ENVELOPE=1` set by `runner::build_bd_command`).
    /// Captured via:
    ///
    ///   bash scripts/make-fixture.sh /tmp/fx
    ///   (cd /tmp/fx && BD_JSON_ENVELOPE=1 bd list --json)
    ///
    /// bd emits each issue's labels as bare strings (e.g.
    /// `"labels": ["security"]`). The `Issue` struct's `labels:
    /// Vec<Label>` field used to reject this with
    /// `invalid type: string "security", expected struct Label`,
    /// which surfaced in the M0 E2E smoke test as
    /// `Failed to load: ... invalid type: string "security", expected struct Label`.
    /// `bd` doesn't always emit every Issue field (notably
    /// `dependencies`, `closed_at`, `description`, `parent`,
    /// `acceptance_criteria`, `external_ref` are missing in the
    /// captured payload); we pad them to `null` / `[]` before
    /// deserialising so this test pins down the *label* regression
    /// specifically, not the broader schema-drift question.
    /// Touching the broader schema is a separate card.
    #[test]
    fn test_real_bd_list_envelope_with_string_labels_parses() {
        // Real envelope captured from `bd list --json` against the
        // fixture at /tmp/fx on bd v1.0.4. Two issues covering the
        // open and in_progress statuses; both carry a single bare-
        // string label.
        let envelope_json = r#"{
  "schema_version": 1,
  "data": [
    {
      "id": "fx-de2",
      "title": "Security audit",
      "status": "open",
      "priority": 1,
      "issue_type": "task",
      "owner": "fabian.baumgartner@dynasoft.ch",
      "created_at": "2026-06-23T19:36:22Z",
      "created_by": "Hermes Worker",
      "updated_at": "2026-06-23T19:36:22Z",
      "labels": ["security"],
      "dependency_count": 0,
      "dependent_count": 0,
      "comment_count": 0
    },
    {
      "id": "fx-si4",
      "title": "Write integration tests",
      "status": "in_progress",
      "priority": 1,
      "issue_type": "task",
      "owner": "fabian.baumgartner@dynasoft.ch",
      "created_at": "2026-06-23T19:36:21Z",
      "created_by": "Hermes Worker",
      "updated_at": "2026-06-23T19:36:30Z",
      "started_at": "2026-06-23T19:36:30Z",
      "labels": ["testing"],
      "dependency_count": 0,
      "dependent_count": 0,
      "comment_count": 0
    }
  ]
}"#;

        // Step 1: the envelope must parse as a Value with a `data`
        // array — this is the same shape the runner hands to
        // `extract_data`.
        let envelope: serde_json::Value =
            serde_json::from_str(envelope_json).expect("envelope is valid JSON");
        let data = envelope
            .get("data")
            .and_then(|v| v.as_array())
            .expect("envelope has a data array");
        assert_eq!(data.len(), 2);

        // Step 2: the precise production regression — `Vec<Label>`
        // parses a bare-string labels array from the real payload.
        // Before the fix this returned
        // `Err("invalid type: string \"security\", expected struct Label")`.
        let labels_from_issue_0: Vec<Label> =
            serde_json::from_value(data[0].get("labels").cloned().expect("issue has labels"))
                .expect("real bd labels-as-strings should parse as Vec<Label>");
        assert_eq!(labels_from_issue_0.len(), 1);
        assert_eq!(labels_from_issue_0[0].name, "security");
        assert_eq!(labels_from_issue_0[0].color, None);

        let labels_from_issue_1: Vec<Label> =
            serde_json::from_value(data[1].get("labels").cloned().expect("issue has labels"))
                .expect("real bd labels-as-strings should parse as Vec<Label>");
        assert_eq!(labels_from_issue_1[0].name, "testing");

        // Step 3: pad the missing Issue fields bd didn't emit and
        // confirm the full Issue struct parses end-to-end with the
        // bare-string labels. Pins down: the label regression is
        // the ONLY blocker on this payload — if a future bd version
        // drops another field we don't tolerate, this test fails
        // loudly and we can address the broader schema drift in
        // one place.
        let mut padded: Vec<serde_json::Value> = Vec::with_capacity(data.len());
        for issue in data {
            let mut obj = issue.as_object().cloned().expect("issue is an object");
            obj.entry("closed_at".to_string())
                .or_insert(serde_json::Value::Null);
            obj.entry("description".to_string())
                .or_insert(serde_json::Value::Null);
            obj.entry("dependencies".to_string())
                .or_insert(serde_json::Value::Array(Vec::new()));
            obj.entry("parent".to_string())
                .or_insert(serde_json::Value::Null);
            obj.entry("acceptance_criteria".to_string())
                .or_insert(serde_json::Value::Null);
            obj.entry("external_ref".to_string())
                .or_insert(serde_json::Value::Null);
            padded.push(serde_json::Value::Object(obj));
        }
        let issues: Vec<Issue> = serde_json::from_value(serde_json::Value::Array(padded))
            .expect("real bd issues with padded defaults should parse end-to-end");
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].id, "fx-de2");
        assert_eq!(issues[0].labels.len(), 1);
        assert_eq!(issues[0].labels[0].name, "security");
        assert_eq!(issues[1].id, "fx-si4");
        assert_eq!(issues[1].labels[0].name, "testing");
    }
}
