//! Shared test fixtures for the 18-field Issue JSON envelope.
//!
//! Replaces ~180 LOC of inline `serde_json::json!({...})` envelopes
//! that recurred across 6 modules in `src-tauri/src/beads/` (the single
//! biggest rust jscpd cluster — 234 of the 448 remaining dup lines as
//! of main, before this refactor).
//!
//! The Beads CLI's `bd <cmd> --json` returns one of three envelope
//! shapes:
//!
//! - `{ schema_version: 1, data: [Issue, ...] }` — the normal list /
//!   query / search / ready / blocked / show shape (used by
//!   `list`, `search_query`, `ready_blocked`, `show_history` and by
//!   `mutations` for create / update / close / reopen / dep_list).
//! - `{ schema_version: 1, data: {Issue} }` — a defensive bare-object
//!   variant that some `bd` versions emit for single-issue commands.
//! - `{ schema_version: 1, data: [] }` — empty list (errors as
//!   `ParseError` from `envelope::extract`).
//!
//! `SampleIssue` exposes every Issue field as an overridable
//! `pub` field; `SampleIssue::new(id, title)` provides a default that
//! matches the canonical "Test issue" shape used by most fixtures
//! (status=open, priority=2, type=task, all dates null, no
//! dependencies). Tests that need overrides use struct-update syntax:
//!
//! ```ignore
//! SampleIssue {
//!     status: "closed".into(),
//!     closed_at: Some("2026-06-17T10:05:00Z".into()),
//!     ..SampleIssue::new("beads-42", "Done")
//! }
//! ```
//!
//! The helpers are gated on `#[cfg(test)]` at the `mod` declaration in
//! `beads/mod.rs` — they never reach the production binary.
//!
//! Follow-up PRs can reuse the same helpers to dedupe the same fixture
//! shape in non-beads/ modules (e.g. `gates.rs`, `jsonl.rs`,
//! `watcher.rs`).

use serde_json::{json, Value};

/// A single Issue with all 18 fields overridable. Defaults match the
/// canonical "Test issue" shape used by the bd list/search/query test
/// suite (status=open, priority=2, type=task, all dates null,
/// no dependencies).
#[derive(Debug, Clone)]
pub struct SampleIssue {
    /// Issue id (e.g. `"beads-99"`).
    pub id: String,
    /// Issue title.
    pub title: String,
    /// Status string — one of `"open"`, `"in_progress"`, `"closed"`,
    /// `"blocked"`.
    pub status: String,
    /// Priority 0-4 (P0..P4).
    pub priority: u8,
    /// Issue type — e.g. `"task"`, `"bug"`, `"epic"`, `"chore"`.
    pub issue_type: String,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
    /// ISO-8601 last-updated timestamp; `None` for never-updated issues.
    pub updated_at: Option<String>,
    /// ISO-8601 close timestamp; `None` for non-closed issues.
    pub closed_at: Option<String>,
    /// Outgoing edge count (issues this one depends on). Default 0.
    pub dependency_count: u32,
    /// Incoming edge count (issues that depend on this one). Default 0.
    pub dependent_count: u32,
    /// Full `dependencies` array. Defaults to `[]`. Set to a
    /// `serde_json::Value::Array` of dependency objects for fixtures
    /// that exercise the dep_list path.
    pub dependencies: Value,
    /// `labels` array. Defaults to `[]`. Set to a
    /// `serde_json::Value::Array` of label entries (bare strings or
    /// `{name, color}` objects) for the `types.rs` regression test
    /// that exercises the labels-as-strings parser path.
    pub labels: Value,
}

impl SampleIssue {
    /// Builds a `SampleIssue` with only `id` and `title` overridden.
    /// All other fields match the canonical "Test issue" defaults:
    /// `status=open`, `priority=2`, `type=task`, `created_at` =
    /// `2026-04-20T12:00:00Z`, `updated_at` / `closed_at` = `null`,
    /// no dependencies.
    pub fn new(id: &str, title: &str) -> Self {
        Self {
            id: id.to_string(),
            title: title.to_string(),
            status: "open".to_string(),
            priority: 2,
            issue_type: "task".to_string(),
            created_at: "2026-04-20T12:00:00Z".to_string(),
            updated_at: None,
            closed_at: None,
            dependency_count: 0,
            dependent_count: 0,
            dependencies: json!([]),
            labels: json!([]),
        }
    }

    /// Serialize to the canonical 18-field Issue JSON object that the
    /// Beads CLI emits: `id`, `title`, `status`, `priority`,
    /// `issue_type`, `created_at`, `updated_at`, `closed_at`,
    /// `description`, `owner`, `labels`, `dependencies`,
    /// `dependency_count`, `dependent_count`, `comment_count`,
    /// `parent`, `acceptance_criteria`, `external_ref`.
    pub fn to_value(&self) -> Value {
        json!({
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "priority": self.priority,
            "issue_type": self.issue_type,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "closed_at": self.closed_at,
            "description": null,
            "owner": null,
            "labels": self.labels,
            "dependencies": self.dependencies,
            "dependency_count": self.dependency_count,
            "dependent_count": self.dependent_count,
            "comment_count": 0,
            "parent": null,
            "acceptance_criteria": null,
            "external_ref": null,
        })
    }

    /// Serialize to a raw JSON string. Used by the `types.rs`
    /// regression test that parses a bare Issue (not an envelope)
    /// via `serde_json::from_str`.
    pub fn to_json_string(&self) -> String {
        serde_json::to_string(&self.to_value()).expect("SampleIssue is always valid JSON")
    }
}

/// Single-issue envelope `{"schema_version": 1, "data": [Issue]}` —
/// the shape `bd list --json`, `bd search --json`, `bd query --json`,
/// `bd ready --json`, `bd blocked --json`, `bd show --json`, and the
/// mutation commands return when they include a `data` array.
pub fn sample_issue_envelope(id: &str, title: &str) -> Value {
    sample_issues_envelope(&[SampleIssue::new(id, title)])
}

/// Multi-issue envelope `{"schema_version": 1, "data": [Issue, ...]}`.
/// Used for tests that exercise a list of issues with varying
/// statuses / dep counts (e.g. the `bd_blocked` filter test with 4
/// issues of varying statuses).
pub fn sample_issues_envelope(issues: &[SampleIssue]) -> Value {
    json!({
        "schema_version": 1,
        "data": issues.iter().map(|i| i.to_value()).collect::<Vec<_>>(),
    })
}

/// Single-issue envelope variant for fixtures that need to override
/// fields beyond `id` / `title` (e.g. the close / reopen /
/// dep_list variants that set `status=closed`, `closed_at`,
/// custom `dependencies`, etc.).
pub fn sample_issue_envelope_with(issue: SampleIssue) -> Value {
    sample_issues_envelope(&[issue])
}

/// Bare-object envelope `{"schema_version": 1, "data": {Issue}}` —
/// the shape `bd create`, `bd update`, `bd close`, `bd reopen` (and
/// friends) may defensively emit. The parser accepts both shapes.
pub fn bare_issue_envelope(id: &str, title: &str) -> Value {
    bare_issue_envelope_with(SampleIssue::new(id, title))
}

/// Bare-object envelope variant for fixtures that need to override
/// fields beyond `id` / `title` (e.g. the close / reopen variants
/// that set `status=closed`, `closed_at`, etc.).
pub fn bare_issue_envelope_with(issue: SampleIssue) -> Value {
    json!({
        "schema_version": 1,
        "data": issue.to_value(),
    })
}

/// Raw JSON string of a single Issue (no envelope wrapping). Used by
/// the `types.rs` regression test that parses a bare Issue via
/// `serde_json::from_str`.
pub fn sample_issue_json(id: &str, title: &str) -> String {
    SampleIssue::new(id, title).to_json_string()
}

/// Empty `data` array: `{"schema_version": 1, "data": []}`. Surfaces
/// as a `ParseError` from `envelope::extract` (used by the
/// "empty-data -> ParseError" tests).
pub fn empty_issues_envelope() -> Value {
    json!({ "schema_version": 1, "data": [] })
}
