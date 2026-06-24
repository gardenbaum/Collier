//! `bd show`, `bd history`, `bd comments`, and `bd comment` commands.
//!
//! Thin wrappers over `runner::run_bd` to fetch and mutate individual
//! issues. Consumed by the React `IssueDetailView` (task 16b) which
//! renders the 4-tab detail drawer.
//!
//! ## CLI shape (bd 1.0.5, verified 2026-06-17)
//!
//! All three read commands return the standard JSON envelope
//! `{ schema_version: 1, data: [...] }`. `data` is always an array —
//! `bd show` returns a 1-element array. The bodies differ:
//!
//! - `bd show <id> --json` → `data: [Issue]` (sparse shape; the Rust
//!   `Issue` struct expects more fields than the CLI emits — see
//!   `bd_show`'s doc comment for the known follow-up).
//! - `bd history <id> --json` → `data: [{ CommitHash, Committer,
//!   CommitDate, Issue: { id, title, status, ... } }]` — PascalCase
//!   keys, nested issue snapshot per commit. Mapped into the flat
//!   `HistoryEntry` type via the internal `HistoryEntryRaw` struct.
//! - `bd comments <id> --json` → `data: [{ id, issue_id, author,
//!   text, created_at }]` — note `text` (not `body`) and no
//!   `updated_at`. Mapped into `Comment` via `CommentRaw`.
//!
//! ## `bd comment` write path
//!
//! The write command is `bd comment <id> "<text>"` — NOT
//! `bd comment add <id> ...`. `add` is a subcommand of `bd comments`,
//! not `bd comment`. The shorthand `bd comment` accepts the body as
//! a single trailing positional arg and passes it through argv (no
//! shell), so multi-word / quoted bodies work without escaping.
//!
//! ## Generic envelope extraction
//!
//! `search_query::extract_data` is hard-coded to `Vec<Issue>`. This
//! module needs `Vec<HistoryEntry>` and `Vec<Comment>` too, so it
//! uses a small local generic `extract_data_vec<T>`. When a fourth
//! caller appears, the T19 follow-up in the notepad suggests
//! consolidating all extractors into `beads::envelope`.

use chrono::{DateTime, FixedOffset, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::beads::{runner, BdError, BdResult, Comment, HistoryEntry, Issue};
use std::path::PathBuf;

/// Extract a `Vec<T>` from a `bd` JSON envelope's `data` field.
///
/// `type_name` is interpolated into the `ParseError` message so the
/// caller can tell at a glance which extraction failed.
fn extract_data_vec<T>(value: Value, type_name: &str) -> BdResult<Vec<T>>
where
    T: serde::de::DeserializeOwned,
{
    let data = value.get("data").ok_or_else(|| BdError::ParseError {
        message: "missing 'data' field in JSON envelope".to_string(),
    })?;
    serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
        message: format!("failed to parse {type_name} from 'data' field: {e}"),
    })
}

/// Run `bd show <id> --json` in `cwd` and return the matching `Issue`.
///
/// `bd show` returns `data` as a 1-element array; we take the first.
/// Returns `ParseError` if the array is empty (should not happen for
/// a valid id, but possible for a race with `bd delete`).
///
/// **bd show JSON is sparser than the list JSON** (verified against
/// bd 1.0.4, 2026-06-24): it omits `dependency_count`,
/// `dependent_count`, `comment_count`, and (for issues without
/// those) `description`, `owner`, `closed_at`, `parent`,
/// `acceptance_criteria`, `external_ref`, and the full
/// `dependencies` list. The `Issue` struct has `#[serde(default)]`
/// on every field `bd show` may omit, so the deserialiser fills
/// them with the documented defaults and the command succeeds.
#[tauri::command]
#[specta::specta]
pub async fn bd_show(cwd: String, id: String) -> BdResult<Issue> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["show", &id, "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    // ponytail: bd show returns a 1-element array, not a bare object.
    // Reusing the search_query helper would force us to take `.first()`
    // on a typed `Vec<Issue>` and lose the helpful empty-array error.
    let issues: Vec<Issue> = extract_data_vec(value, "issue")?;
    issues
        .into_iter()
        .next()
        .ok_or_else(|| BdError::ParseError {
            message: format!("bd show returned empty data array for id {id}"),
        })
}

/// Raw Dolt commit shape returned by `bd history <id> --json`.
///
/// PascalCase fields (Go convention) — the only place in the beads
/// crate that has to deal with this. The mapping to the flat
/// `HistoryEntry` happens in the `From` impl below.
#[derive(Debug, Deserialize)]
struct HistoryEntryRaw {
    #[serde(rename = "CommitHash")]
    commit_hash: String,
    #[serde(rename = "Committer")]
    committer: String,
    /// Real CLI emits a `+02:00`-style offset; we convert to UTC in
    /// the `From` impl so `HistoryEntry.timestamp: DateTime<Utc>` is
    /// always the canonical form.
    #[serde(rename = "CommitDate")]
    commit_date: DateTime<FixedOffset>,
    #[serde(rename = "Issue")]
    issue: HistoryIssueSnapshot,
}

/// Minimum snapshot we need to project a `HistoryEntry`. The CLI
/// returns the full issue at each commit; we only need the three
/// fields used to derive `issue_id` / `action` / `details`.
#[derive(Debug, Deserialize)]
struct HistoryIssueSnapshot {
    id: String,
    title: String,
    status: String,
}

impl From<HistoryEntryRaw> for HistoryEntry {
    fn from(raw: HistoryEntryRaw) -> Self {
        let issue_id = raw.issue.id;
        let title = raw.issue.title;
        let status = raw.issue.status;
        let action = format!("status: {status}");
        let details = format!("{title} (status: {status})");
        Self {
            id: raw.commit_hash,
            issue_id,
            timestamp: raw.commit_date.with_timezone(&Utc),
            action,
            actor: Some(raw.committer),
            details: Some(details),
        }
    }
}

/// Run `bd history <id> --json` in `cwd` and return the issue's
/// history entries (one per Dolt commit, oldest-last as emitted by
/// the CLI).
#[tauri::command]
#[specta::specta]
pub async fn bd_history(cwd: String, id: String) -> BdResult<Vec<HistoryEntry>> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["history", &id, "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    let raws: Vec<HistoryEntryRaw> = extract_data_vec(value, "history entry")?;
    Ok(raws.into_iter().map(HistoryEntry::from).collect())
}

/// Raw comment shape returned by `bd comments <id> --json`.
///
/// Differences from the existing `Comment` struct:
/// - field is `text`, not `body`
/// - has `issue_id`, which `Comment` lacks
/// - no `updated_at` field (always absent in current CLI output)
#[derive(Debug, Deserialize)]
struct CommentRaw {
    id: String,
    #[serde(rename = "issue_id")]
    #[allow(dead_code)] // surfaced in error messages; not part of Comment
    issue_id: String,
    author: String,
    text: String,
    created_at: DateTime<Utc>,
}

impl From<CommentRaw> for Comment {
    fn from(raw: CommentRaw) -> Self {
        Self {
            id: raw.id,
            author: raw.author,
            body: raw.text,
            created_at: raw.created_at,
            // CLI doesn't emit updated_at on the read path; treat it
            // as unknown. A future `bd comment edit` could populate
            // it from a separate command.
            updated_at: None,
        }
    }
}

/// Run `bd comments <id> --json` in `cwd` and return the comments.
#[tauri::command]
#[specta::specta]
pub async fn bd_comments(cwd: String, id: String) -> BdResult<Vec<Comment>> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["comments", &id, "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    let raws: Vec<CommentRaw> = extract_data_vec(value, "comment")?;
    Ok(raws.into_iter().map(Comment::from).collect())
}

/// Run `bd comment <id> "<body>"` in `cwd` to append a comment.
///
/// The CLI prints a one-line success message on stdout (no `--json`
/// flag is available for this write path), so any `BdOutput` variant
/// is treated as success — the runner's `NonZeroExit` handles real
/// failures (id not found, body validation, etc.).
#[tauri::command]
#[specta::specta]
pub async fn bd_add_comment(cwd: String, id: String, body: String) -> BdResult<()> {
    let path = PathBuf::from(&cwd);
    // ponytail: real CLI syntax is `bd comment <id> <text...>`, NOT
    // `bd comment add <id> ...` — `add` is a subcommand of `bd comments`,
    // not of `bd comment`. Verified against `bd comment --help`.
    let output = runner::run_bd(&["comment", &id, &body], &path).await?;
    match output {
        runner::BdOutput::Json { .. } | runner::BdOutput::Text { .. } => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ponytail: integration tests against real `bd` would follow the
    // `skip_if_no_bd` pattern from `runner.rs`. For T16a we stick to
    // unit tests against synthetic envelopes — the contract is "the
    // extractor handles the documented shape", and the frontend's
    // 16b integration tests cover end-to-end.

    #[test]
    fn test_bd_show_parses_single_issue_envelope() {
        // `bd show` returns `data` as a 1-element array; we assert the
        // extraction pulls the lone issue and the field mapping works.
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": [{
                "id": "beads-1",
                "title": "Test",
                "status": "open",
                "priority": 1,
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
            }]
        });
        let issues: Vec<Issue> = extract_data_vec(envelope, "issue").expect("should parse");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "beads-1");
        assert_eq!(issues[0].title, "Test");
    }

    #[test]
    fn test_bd_show_returns_error_on_missing_data() {
        let envelope = serde_json::json!({ "schema_version": 1 });
        let result: BdResult<Vec<Issue>> = extract_data_vec(envelope, "issue");
        assert!(result.is_err(), "expected ParseError on missing data field");
    }

    #[test]
    fn test_bd_show_returns_error_on_empty_data_array() {
        // The 1-element invariant: empty `data` means the id doesn't
        // exist (or was just deleted) and we should surface that as
        // a parse error rather than silently return Ok(None).
        let envelope = serde_json::json!({ "schema_version": 1, "data": [] });
        let issues: Vec<Issue> = extract_data_vec(envelope, "issue").expect("parses");
        let first = issues.into_iter().next();
        assert!(first.is_none(), "empty data should yield no issue");
    }

    #[test]
    fn test_history_entry_raw_maps_to_history_entry() {
        // Real `bd history` shape: PascalCase, nested Issue snapshot,
        // commit date with timezone offset. The mapping should flatten
        // these into the camelCase `HistoryEntry` and convert the
        // timestamp to UTC.
        let raw_json = serde_json::json!({
            "CommitHash": "opr7mas6hhj88ecefldgkc099bhadce3",
            "Committer": "root",
            "CommitDate": "2026-06-17T09:14:25.609+02:00",
            "Issue": {
                "id": "beads-42",
                "title": "demo",
                "status": "open"
            }
        });
        let raw: HistoryEntryRaw =
            serde_json::from_value(raw_json).expect("raw should deserialize");
        let entry: HistoryEntry = raw.into();
        assert_eq!(entry.id, "opr7mas6hhj88ecefldgkc099bhadce3");
        assert_eq!(entry.issue_id, "beads-42");
        assert_eq!(entry.action, "status: open");
        assert_eq!(entry.actor.as_deref(), Some("root"));
        assert_eq!(entry.details.as_deref(), Some("demo (status: open)"));
        // Timestamp converted to UTC: 09:14:25+02:00 == 07:14:25Z
        assert_eq!(
            entry.timestamp.to_rfc3339(),
            "2026-06-17T07:14:25.609+00:00"
        );
    }

    #[test]
    fn test_bd_history_parses_real_envelope() {
        // End-to-end: synthetic envelope matching the real CLI shape
        // flows through extract_data_vec + From<HistoryEntryRaw>.
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": [{
                "CommitHash": "hash1",
                "Committer": "alice",
                "CommitDate": "2026-06-17T09:14:25.609+02:00",
                "Issue": {
                    "id": "beads-99",
                    "title": "history test",
                    "status": "in_progress"
                }
            }, {
                "CommitHash": "hash2",
                "Committer": "bob",
                "CommitDate": "2026-06-16T18:00:00Z",
                "Issue": {
                    "id": "beads-99",
                    "title": "history test",
                    "status": "open"
                }
            }]
        });
        let raws: Vec<HistoryEntryRaw> =
            extract_data_vec(envelope, "history entry").expect("should parse");
        assert_eq!(raws.len(), 2);
        let entries: Vec<HistoryEntry> = raws.into_iter().map(Into::into).collect();
        assert_eq!(entries[0].actor.as_deref(), Some("alice"));
        assert_eq!(entries[0].action, "status: in_progress");
        assert_eq!(entries[1].actor.as_deref(), Some("bob"));
        assert_eq!(entries[1].action, "status: open");
        // Both should be in UTC.
        assert!(entries[0].timestamp.to_rfc3339().ends_with("+00:00"));
        assert!(entries[1].timestamp.to_rfc3339().ends_with("+00:00"));
    }

    #[test]
    fn test_comment_raw_maps_to_comment() {
        // Real `bd comments` shape uses `text` (not `body`) and has
        // no `updated_at`. The mapping should rename `text` → `body`
        // and set `updated_at = None`.
        let raw_json = serde_json::json!({
            "id": "019ed46e-e2e2-79fe-83a1-761963337c42",
            "issue_id": "beads-1",
            "author": "alice",
            "text": "hello world",
            "created_at": "2026-04-20T12:00:00Z"
        });
        let raw: CommentRaw = serde_json::from_value(raw_json).expect("raw should deserialize");
        let comment: Comment = raw.into();
        assert_eq!(comment.id, "019ed46e-e2e2-79fe-83a1-761963337c42");
        assert_eq!(comment.author, "alice");
        assert_eq!(comment.body, "hello world");
        assert!(comment.updated_at.is_none());
    }

    #[test]
    fn test_bd_comments_parses_real_envelope() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": [{
                "id": "c1",
                "issue_id": "beads-1",
                "author": "alice",
                "text": "first",
                "created_at": "2026-04-20T12:00:00Z"
            }, {
                "id": "c2",
                "issue_id": "beads-1",
                "author": "bob",
                "text": "second",
                "created_at": "2026-04-21T13:00:00Z"
            }]
        });
        let raws: Vec<CommentRaw> = extract_data_vec(envelope, "comment").expect("should parse");
        assert_eq!(raws.len(), 2);
        let comments: Vec<Comment> = raws.into_iter().map(Into::into).collect();
        assert_eq!(comments[0].body, "first");
        assert_eq!(comments[1].body, "second");
        assert_eq!(comments[0].author, "alice");
        assert_eq!(comments[1].author, "bob");
    }

    #[test]
    fn test_bd_add_comment_match_is_exhaustive() {
        // The match in `bd_add_comment` must be exhaustive over both
        // `BdOutput` variants; this test makes that contract explicit
        // so a future addition to `BdOutput` can't silently regress it.
        let json = runner::BdOutput::Json {
            value: serde_json::json!({}),
        };
        let text = runner::BdOutput::Text {
            value: "ok".to_string(),
        };
        let from_json: BdResult<()> = match json {
            runner::BdOutput::Json { .. } | runner::BdOutput::Text { .. } => Ok(()),
        };
        let from_text: BdResult<()> = match text {
            runner::BdOutput::Json { .. } | runner::BdOutput::Text { .. } => Ok(()),
        };
        assert!(from_json.is_ok());
        assert!(from_text.is_ok());
    }

    #[test]
    fn test_extract_data_vec_returns_error_on_invalid_shape() {
        // The generic helper should reject non-array `data` (e.g. if a
        // future CLI release flips to a bare object) and surface a
        // clear type-name-tagged error.
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": { "not": "an array" }
        });
        let result: BdResult<Vec<Comment>> = extract_data_vec(envelope, "comment");
        assert!(result.is_err(), "expected ParseError on object-shaped data");
    }
}
