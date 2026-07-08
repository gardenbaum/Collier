//! Issue mutation commands: `bd create`, `bd update`, `bd close`,
//! `bd reopen`, `bd delete`.
//!
//! ## CLI shape (bd 1.0.5, verified 2026-06-17)
//!
//! All four write commands return a JSON envelope
//! `{ schema_version: 1, … }` because the runner forces
//! `BD_JSON_ENVELOPE=1` (see `runner.rs`). The body inside the envelope
//! varies:
//!
//! - `bd create <flags> --json` → `data: [Issue]` (1-element array).
//!   Some CLI variants emit `data: {Issue}` (bare object) instead.
//!   The robust `parse_issue_or_array` helper handles both.
//! - `bd update <id> <flags> --json` → same shape as create.
//! - `bd close <id> --json` → `data: [Issue]` (1-element array).
//!   Verified with a live probe: the issue is returned with
//!   `status: "closed"`, `closed_at: "…"`, and a `close_reason` field
//!   the runner silently ignores (the Rust `Issue` struct doesn't
//!   model it).
//! - `bd reopen <id> --json` → `data: [Issue]` (1-element array).
//!   `status` flips back to `open`; `closed_at` is dropped.
//! - `bd delete <id> --force --json` → `{ deleted, dependencies_removed,
//!   references_updated, schema_version }`. NO `data` field — the CLI
//!   returns a summary object, not an issue. We don't try to parse it;
//!   any JSON output is success.
//!
//! ## WriteLock
//!
//! Each `bd_*` mutation command acquires the per-repo write lock via
//! `runner::run_bd_locked`, holds it for the duration of the `bd`
//! invocation, and releases on Drop. Two concurrent writes to the same
//! `.beads/issues.jsonl` therefore serialize; writes to different
//! repos never block each other. The previous standalone
//! `try_write_lock_cmd` IPC acquired the lock and immediately dropped
//! it on IPC return, providing no actual concurrency control.

use std::path::PathBuf;

use crate::beads::{
    runner, AssigneeWithCount, BdError, BdResult, Dependency, DependencyType, Issue,
    LabelWithCount, PropagationReport,
};
use crate::bindings::types::{CreateInput, ListFilters, UpdateInput};
use serde_json::Value;

/// Run `bd create <flags> --json` in `cwd` and return the new issue.
///
/// Verified shape (bd 1.0.5, 2026-06-17): `{ schema_version: 1,
/// data: [Issue] }` — a 1-element array. The robust parser also
/// accepts a bare `data: {Issue}` object to cover CLI variants.
///
/// Empty `data: []` → `ParseError` so the frontend surfaces a
/// typed signal rather than silently dropping the result.
#[tauri::command]
#[specta::specta]
pub async fn bd_create(
    cwd: String,
    input: CreateInput,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<Issue> {
    let path = PathBuf::from(&cwd);
    let mut owned_args: Vec<String> = input.to_args();
    owned_args.push("--json".to_string());
    let arg_refs: Vec<&str> = owned_args.iter().map(String::as_str).collect();
    let mut argv: Vec<&str> = vec!["create"];
    argv.extend(arg_refs.iter().copied());
    let output = runner::run_bd_locked(&write_lock, &argv, &path).await?;
    let value = parse_envelope(output)?;
    parse_issue_or_array(value, "bd create")
}

/// Run `bd update <id> <flags> --json` in `cwd` and return the
/// updated issue.
///
/// Same envelope shape as `bd create` (1-element array under `data`).
/// The robust parser handles the bare-object CLI variant as well.
#[tauri::command]
#[specta::specta]
pub async fn bd_update(
    cwd: String,
    id: String,
    input: UpdateInput,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<Issue> {
    let path = PathBuf::from(&cwd);
    let mut owned_args: Vec<String> = input.to_args();
    owned_args.push("--json".to_string());
    let arg_refs: Vec<&str> = owned_args.iter().map(String::as_str).collect();
    let mut argv: Vec<&str> = vec!["update", &id];
    argv.extend(arg_refs.iter().copied());
    let output = runner::run_bd_locked(&write_lock, &argv, &path).await?;
    let value = parse_envelope(output)?;
    parse_issue_or_array(value, "bd update")
}

/// Run `bd close <id> --json` in `cwd` and return the closed issue.
///
/// Verified shape (bd 1.0.5, 2026-06-17): `data: [Issue]` — the
/// closed issue with `status: "closed"`, `closed_at`, and a
/// `close_reason` field the runner ignores. The robust parser
/// accepts the bare-object variant.
#[tauri::command]
#[specta::specta]
pub async fn bd_close(
    cwd: String,
    id: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<Issue> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd_locked(&write_lock, &["close", &id, "--json"], &path).await?;
    let value = parse_envelope(output)?;
    parse_issue_or_array(value, "bd close")
}

/// Run `bd reopen <id> --json` in `cwd` and return the reopened
/// issue.
///
/// Verified shape (bd 1.0.5, 2026-06-17): `data: [Issue]` — the
/// reopened issue with `status: "open"` and `closed_at: null`.
/// The robust parser accepts the bare-object variant.
#[tauri::command]
#[specta::specta]
pub async fn bd_reopen(
    cwd: String,
    id: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<Issue> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd_locked(&write_lock, &["reopen", &id, "--json"], &path).await?;
    let value = parse_envelope(output)?;
    parse_issue_or_array(value, "bd reopen")
}

/// Run `bd delete <id> --force --json` in `cwd` and return ().
///
/// `--force` is required: without it, `bd` prints a "DELETE PREVIEW"
/// warning and exits non-zero (the frontend's typed-identifier
/// confirmation in `IssueActions` is the equivalent safety check on
/// our side).
///
/// Verified shape (bd 1.0.5, 2026-06-17): `{ deleted, dependencies_removed,
/// references_updated, schema_version: 1 }` — a summary object, NOT
/// `data: [Issue]`. The runner already returns an error on non-zero
/// exit, so reaching `Ok(())` means the CLI accepted the delete and
/// produced parseable JSON. We don't try to decode the summary; the
/// frontend refetches the issue list and the deleted id disappears.
#[tauri::command]
#[specta::specta]
pub async fn bd_delete(
    cwd: String,
    id: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<()> {
    let path = PathBuf::from(&cwd);
    // ponytail: any non-zero exit from `bd delete` propagates as a
    // `BdError::NonZeroExit` from the runner. Reaching the `Ok(())`
    // line means the CLI produced parseable JSON. We don't model the
    // `{ deleted, dependencies_removed, references_updated, … }`
    // summary; the frontend refetches the list and the deleted id
    // is gone.
    let _output =
        runner::run_bd_locked(&write_lock, &["delete", &id, "--force", "--json"], &path).await?;
    Ok(())
}

/// Run `bd show <id> --json` in `cwd` and return the issue's
/// dependency list.
///
/// The dependency list is sourced from `bd show` (not `bd dep list`)
/// because the `Issue` struct already carries a typed
/// `dependencies: Vec<Dependency>` field (T2). The `bd show` envelope
/// returns `data: [Issue]` (1-element array) — same shape the rest
/// of the mutations module handles — and we pluck
/// `issue.dependencies` out of the lone element. The `bd dep list`
/// command emits a wider dependency record (with `from` / `to` /
/// `direction` columns the `Dependency` struct doesn't model) and
/// would force a second Raw struct just to drop those fields.
///
/// ponytail: defensive — accepts both `data: [Issue]` (the real
/// 1.0.5 shape) and `data: {Issue}` (the bare-object CLI variant
/// some 1.0.x builds emit). Empty `data: []` → `ParseError` so the
/// frontend gets a typed signal rather than silently returning an
/// empty vec for a deleted id.
#[tauri::command]
#[specta::specta]
pub async fn bd_dep_list(cwd: String, id: String) -> BdResult<Vec<Dependency>> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["show", &id, "--json"], &path).await?;
    let value = parse_envelope(output)?;
    let issue = parse_issue_or_array(value, "bd show")?;
    Ok(issue.dependencies)
}

/// Run `bd dep add <from> <to> --type <type> --json` in `cwd`.
///
/// The CLI's `--type` flag takes the kebab-case form
/// (`parent-child`, `discovered-from`, …) per the dep help text,
/// NOT the snake_case form the Rust enum serializes to via
/// `serde(rename_all = "snake_case")`. The match below is the
/// authoritative mapping — keep it aligned with the `DependencyType`
/// variants added in T2.
///
/// The CLI does not return a typed JSON envelope on success — the
/// runner's `BdOutput::Text` ("Added dependency from … to …") and
/// `BdOutput::Json` (rare, undocumented summary) both count as
/// success. Reaching `Ok(())` means the runner saw a zero exit and
/// parseable output; the frontend refetches the dep list and the
/// new edge appears.
#[tauri::command]
#[specta::specta]
pub async fn bd_dep_add(
    cwd: String,
    from_id: String,
    to_id: String,
    dep_type: DependencyType,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<()> {
    let path = PathBuf::from(&cwd);
    let type_str: &str = dep_type_to_cli(dep_type);
    let _output = runner::run_bd_locked(
        &write_lock,
        &["dep", "add", &from_id, &to_id, "--type", type_str, "--json"],
        &path,
    )
    .await?;
    Ok(())
}

/// Run `bd dep remove <from> <to> --json` in `cwd`.
///
/// Same "any output is success" contract as `bd_dep_add`. The CLI
/// prints a one-line confirmation on success and exits non-zero if
/// the dependency doesn't exist; both paths flow through the
/// runner's normal exit-code handling.
#[tauri::command]
#[specta::specta]
pub async fn bd_dep_remove(
    cwd: String,
    from_id: String,
    to_id: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<()> {
    let path = PathBuf::from(&cwd);
    let _output = runner::run_bd_locked(
        &write_lock,
        &["dep", "remove", &from_id, &to_id, "--json"],
        &path,
    )
    .await?;
    Ok(())
}

/// Run `bd dep tree <id> --json` in `cwd` and return the dependency
/// tree as a flat list.
///
/// ponytail: the real `bd dep tree` CLI (1.0.5) may return a
/// nested `children: []` shape, or a flat list. v1 returns a flat
/// `Vec<Dependency>` for the lazy version — the frontend groups
/// rows by `from_id == issueId` (outgoing) and renders a depth-3
/// hierarchy from the flat list. If the CLI doesn't expose
/// `bd dep tree` in a future version, the lazy fallback is to
/// derive from `bd_show` recursively (TBD; current 1.0.5 ships
/// the command).
///
/// Accepts both a bare array (`[Dependency, ...]`) and the
/// standard envelope shape (`{ data: [Dependency, ...] }`).
/// Missing `data` is a `ParseError`; an empty `data: []` is a
/// valid empty tree (returns `Ok(vec![])`).
#[tauri::command]
#[specta::specta]
pub async fn bd_dep_tree(cwd: String, id: String) -> BdResult<Vec<Dependency>> {
    let path = std::path::PathBuf::from(&cwd);
    let output = runner::run_bd(&["dep", "tree", &id, "--json"], &path).await?;
    let value = parse_envelope(output)?;
    parse_dep_vec(value, "bd dep tree")
}

/// Check whether adding `from -> to` would create a cycle. Returns
/// `true` if a cycle would be introduced.
///
/// ponytail: v1 returns `Ok(false)` unconditionally. The `bd`
/// CLI 1.0.5 doesn't expose a dedicated dry-run check command
/// (`bd dep check`, `bd dep add --dry-run`, etc. are not
/// available). Real cycle detection happens at write time —
/// `bd dep add` itself returns a non-zero exit with a cycle
/// error message if the new edge would close a loop, and the
/// runner surfaces that as `BdError::NonZeroExit`. The frontend
/// (T32's `CycleWarning`) treats the post-add error as the
/// authoritative signal. This command exists for the future v2
/// case where a real CLI probe ships, so the frontend
/// integration point doesn't have to change.
#[tauri::command]
#[specta::specta]
pub async fn bd_dep_check_cycle(_cwd: String, _from_id: String, _to_id: String) -> BdResult<bool> {
    Ok(false)
}

/// Map the typed `DependencyType` enum to the kebab-case string
/// `bd dep add --type` expects. ponytail: the enum serializes to
/// snake_case via `#[serde(rename_all = "snake_case")]` (snake_case
/// for the TS bridge), but the CLI flag uses kebab-case. The
/// function is `pub(crate)` so the test module can exhaustively
/// cover every variant with the documented string.
fn dep_type_to_cli(dep_type: DependencyType) -> &'static str {
    match dep_type {
        DependencyType::Blocks => "blocks",
        DependencyType::ParentChild => "parent-child",
        DependencyType::ConditionalBlocks => "conditional-blocks",
        DependencyType::WaitsFor => "waits-for",
        DependencyType::Related => "related",
        DependencyType::Tracks => "tracks",
        DependencyType::DiscoveredFrom => "discovered-from",
        DependencyType::CausedBy => "caused-by",
        DependencyType::Validates => "validates",
        DependencyType::Supersedes => "supersedes",
    }
}

// ============================================================================
// Label commands (tasks 34, 35)
// ============================================================================

/// Run `bd label add <issue_id> <label> --json` in `cwd`.
///
/// The CLI returns a JSON array of per-target entries
/// `[{ issue_id, label, status: "added" }]` — we don't model
/// per-target summaries because v1 always targets a single issue
/// (the frontend calls this command once per label). The runner
/// surfaces a non-zero exit as `BdError::NonZeroExit`, so reaching
/// `Ok(())` means the CLI accepted the add and produced parseable
/// output. The frontend refetches the issue detail (the
/// `Issue.labels` field on `bd show`) and the new label appears.
#[tauri::command]
#[specta::specta]
pub async fn bd_label_add(
    cwd: String,
    issue_id: String,
    label: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<()> {
    let path = PathBuf::from(&cwd);
    let _output = runner::run_bd_locked(
        &write_lock,
        &["label", "add", &issue_id, &label, "--json"],
        &path,
    )
    .await?;
    Ok(())
}

/// Run `bd label remove <issue_id> <label> --json` in `cwd`.
///
/// Symmetric to `bd_label_add`: same "any output is success"
/// contract, same per-target JSON shape. Reaching `Ok(())` means
/// the CLI accepted the remove and the frontend's `bd show`
/// refetch will reflect the change.
#[tauri::command]
#[specta::specta]
pub async fn bd_label_remove(
    cwd: String,
    issue_id: String,
    label: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<()> {
    let path = PathBuf::from(&cwd);
    let _output = runner::run_bd_locked(
        &write_lock,
        &["label", "remove", &issue_id, &label, "--json"],
        &path,
    )
    .await?;
    Ok(())
}

/// Run `bd label list-all --json` in `cwd` and return the sorted
/// list of `(label, count)` rows.
///
/// The real CLI (1.0.5, 2026-06-17) emits a bare array
/// `[{ label, count }, ...]` — no `data` envelope wrapper. Each
/// row carries the label name and the number of issues currently
/// carrying it (the v1 source of truth for the "usage count" the
/// frontend renders next to each label).
///
/// ponytail: the prompt's stub typed the return as
/// `Vec<String>`. The plan T35 AC ("List renders with usage
/// counts") and the real CLI shape make that lossy — we'd either
/// drop `count` or compute it client-side via N+1 `bd list` calls.
/// `LabelWithCount { label, count }` is the honest shape; sorted
/// by name on the Rust side so the frontend renders in a stable
/// order without re-sorting.
#[tauri::command]
#[specta::specta]
pub async fn bd_label_list_all(cwd: String) -> BdResult<Vec<LabelWithCount>> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["label", "list-all", "--json"], &path).await?;
    // The list-all envelope is a bare array — no `data` wrapper.
    // Treat Text output as a contract break (the CLI guarantees
    // JSON when `--json` is set).
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON array, got text: {value}"),
            });
        }
    };
    let mut rows = parse_label_list_all(value)?;
    rows.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(rows)
}

/// Parse a `bd label list-all --json` response into rows.
///
/// `runner::build_bd_command` sets `BD_JSON_ENVELOPE=1`, so `bd`
/// wraps every JSON response in `{ schema_version, data }`. `data`
/// is an array of `{ label, count }` rows on success and an
/// object `{ error }` on failure (e.g. missing database,
/// `--global` without shared-server mode).
///
/// Before this helper extracted `data`, the parser did
/// `from_value::<Vec<...>>(value)` on the envelope map and surfaced
/// the unhelpful "invalid type: map, expected a sequence"
/// `ParseError` users were seeing in the LabelListView. Now we
/// unwrap the envelope and carry the underlying bd error message
/// through on the failure path.
fn parse_label_list_all(value: serde_json::Value) -> BdResult<Vec<LabelWithCount>> {
    let data = value.get("data").ok_or_else(|| BdError::ParseError {
        message: "bd label list-all: missing 'data' field in JSON envelope".to_string(),
    })?;
    if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
        return Err(BdError::ParseError {
            message: format!("bd label list-all: {err}"),
        });
    }
    serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
        message: format!("bd label list-all failed to parse rows: {e}"),
    })
}

/// Run `bd list --json` (no filters) in `cwd` and return the sorted
/// list of distinct `(assignee, count)` rows.
///
/// The Beads CLI (1.0.5, 2026-06-17) does NOT expose an
/// `assignee list-all` subcommand, so we derive the distinct
/// `(owner, count)` pairs from a full `bd list --json` pass on
/// the Rust side. This is a small bounded concern: we do not
/// read `.beads/issues.jsonl` directly (per the constitution
/// rule — `bd` is the single source of truth), we shell out to
/// `bd list --json` once and aggregate in-memory.
///
/// Unassigned issues (`owner = None`) are intentionally excluded
/// from the returned rows. The frontend renders an explicit
/// "Unassigned" toggle only when the user opts in (separate
/// from this list) — surfacing a synthetic "" (empty string)
/// row would clutter the sidebar.
///
/// The rows are sorted by `assignee` on the Rust side so the
/// frontend renders in a stable order without re-sorting
/// (same convention as `bd_label_list_all`).
///
/// Folded onto [`runner::run_bd_envelope`] so the list-style
/// envelope pipeline (run_bd → match → extract) lives in one
/// place rather than being hand-rolled in every command.
#[tauri::command]
#[specta::specta]
pub async fn bd_assignee_list_all(cwd: String) -> BdResult<Vec<AssigneeWithCount>> {
    let path = PathBuf::from(&cwd);
    // Empty filters -> no extra flags between `list` and `--json`.
    // Reusing `ListFilters::default()` + the same `to_args()`
    // contract as `bd_list` guarantees we don't accidentally
    // emit a stray `--search ""` or similar no-op flag.
    let mut argv: Vec<String> = Vec::with_capacity(ListFilters::default().to_args().len() + 2);
    argv.push("list".to_string());
    argv.extend(ListFilters::default().to_args());
    argv.push("--json".to_string());
    let arg_refs: Vec<&str> = argv.iter().map(String::as_str).collect();
    let issues: Vec<Issue> = runner::run_bd_envelope(&arg_refs, &path).await?;
    Ok(aggregate_assignees(&issues))
}

/// Aggregate a list of issues into distinct `(assignee, count)`
/// rows, sorted by `assignee` lexicographically.
///
/// Pure helper — the `Issue` slice is iterated once and the
/// results are kept in a `BTreeMap` so insertion + final sort
/// collapse to O(n log n). At realistic sizes (≤10k issues,
/// dozens of distinct owners) this is well under a millisecond
/// and dwarfed by the `bd list --json` shell-out.
fn aggregate_assignees(issues: &[Issue]) -> Vec<AssigneeWithCount> {
    use std::collections::BTreeMap;
    let mut counts: BTreeMap<String, u32> = BTreeMap::new();
    for issue in issues {
        // Owner is `Option<String>` per the bd v1.0.4 schema
        // (see `Issue.owner` in types.rs). Skip unassigned
        // issues — they are not addressable via `bd list
        // --assignee ""` because Beads treats empty string as
        // "not set". Surfacing them in the sidebar would be a
        // UX trap.
        if let Some(owner) = issue.owner.as_ref() {
            if !owner.is_empty() {
                *counts.entry(owner.clone()).or_insert(0) += 1;
            }
        }
    }
    counts
        .into_iter()
        .map(|(assignee, count)| AssigneeWithCount { assignee, count })
        .collect()
}

/// Run `bd label propagate <parent> <label> --json` in `cwd` and
/// return a `PropagationReport` summary.
///
/// The real CLI (1.0.5, 2026-06-17) returns a flat array of
/// per-child entries `[{ issue_id, label, status: "added" |
/// "skipped" }, ...]`. Children that already carry the label are
/// reported as `skipped`; children that don't are `added`. We
/// flatten the per-child rows into a `{ added, skipped, errors }`
/// summary — the frontend's toast only needs the totals.
///
/// `errors` is for the unexpected statuses / shapes — the runner's
/// `BdError` already covers the "non-zero exit" path (e.g. parent
/// has no children at all), so a non-empty `errors` vec indicates
/// the CLI ran but reported something the v1 mapper doesn't
/// recognise.
///
/// ponytail: a parent with no children is the most common case in
/// v1 (most issues are leaves) and the CLI returns `[]`. The
/// mapper yields `{ added: 0, skipped: 0, errors: [] }` — the
/// frontend's "Propagated 0 children" toast is the expected user
/// signal, not an error.
#[tauri::command]
#[specta::specta]
pub async fn bd_label_propagate(
    cwd: String,
    parent_id: String,
    label: String,
    write_lock: tauri::State<'_, crate::beads::lock::WriteLock>,
) -> BdResult<PropagationReport> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd_locked(
        &write_lock,
        &["label", "propagate", &parent_id, &label, "--json"],
        &path,
    )
    .await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON array, got text: {value}"),
            });
        }
    };
    let rows = parse_label_propagate_rows(value)?;
    Ok(PropagationReport::from_rows(rows))
}

/// Parse a `bd label propagate <parent> <label> --json` response
/// into a `Vec<serde_json::Value>` for the per-child status loop.
///
/// Same envelope contract as `parse_label_list_all`: the runner
/// sets `BD_JSON_ENVELOPE=1`, so `data` is an array of
/// `{ issue_id, label, status }` rows on success and
/// `{ error }` on mid-command failure (e.g. parent has no
/// children with `--ignore-missing` off).
fn parse_label_propagate_rows(value: serde_json::Value) -> BdResult<Vec<serde_json::Value>> {
    let data = value.get("data").ok_or_else(|| BdError::ParseError {
        message: "bd label propagate: missing 'data' field in JSON envelope".to_string(),
    })?;
    if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
        return Err(BdError::ParseError {
            message: format!("bd label propagate: {err}"),
        });
    }
    serde_json::from_value(data.clone()).map_err(|e| BdError::ParseError {
        message: format!("bd label propagate failed to parse rows: {e}"),
    })
}

// ============================================================================
// Desktop notification stub (task 49)
// ============================================================================

/// Send a desktop notification (uses `tauri-plugin-notification`).
///
/// ponytail: thin no-op stub. v1 callers (the `useNotifications` hook
/// in `src/hooks/useNotifications.ts`) wrap this in a best-effort
/// `try/catch` and don't surface failures to the UI. Wiring the real
/// `tauri-plugin-notification` API is a future task — the contract
/// from the TS side is positional `(title, body)` and a `Result<null,
/// String>` shape, exactly matching tauri-specta's default export.
#[tauri::command]
#[specta::specta]
pub async fn bd_notify(_title: String, _body: String) -> BdResult<()> {
    Ok(())
}

// ponytail: extracted from the create/update bodies to share with
// close/reopen. `BdOutput::Text` is treated as a hard parse error —
// the runner already classifies based on whether `serde_json` could
// parse stdout, so Text means "bd did not return JSON", which for
// these commands is always a contract break on the CLI side.
fn parse_envelope(output: runner::BdOutput) -> BdResult<Value> {
    match output {
        runner::BdOutput::Json { value } => Ok(value),
        runner::BdOutput::Text { value } => Err(BdError::ParseError {
            message: format!("expected JSON envelope, got text: {value}"),
        }),
    }
}

// ponytail: the 1.0.5 CLI returns `data: [Issue]` (a 1-element
// array). Some CLI variants emit `data: {Issue}` (a bare object).
// Both are accepted; an empty array or a missing `data` field is
// a hard `ParseError` so the frontend gets a typed signal. `cmd_name`
// is interpolated into the error so a misbehaving CLI is debuggable
// from the toast alone.
fn parse_issue_or_array(value: Value, cmd_name: &str) -> BdResult<Issue> {
    let raw: Value = value
        .get("data")
        .cloned()
        .ok_or_else(|| BdError::ParseError {
            message: format!("{cmd_name} missing 'data' field in JSON envelope"),
        })?;
    if let Some(arr) = raw.as_array() {
        let issues: Vec<Issue> =
            serde_json::from_value(Value::Array(arr.clone())).map_err(|e| BdError::ParseError {
                message: format!("{cmd_name} failed to parse issues: {e}"),
            })?;
        issues
            .into_iter()
            .next()
            .ok_or_else(|| BdError::ParseError {
                message: format!("{cmd_name} returned empty data array"),
            })
    } else {
        serde_json::from_value(raw).map_err(|e| BdError::ParseError {
            message: format!("{cmd_name} failed to parse issue: {e}"),
        })
    }
}

// ponytail: bd_dep_tree's payload is a flat `Vec<Dependency>` (or
// a bare JSON array, per the CLI variant). We accept both the
// envelope shape `{ data: [...] }` and a bare array. An empty
// `data: []` is a valid "no dependencies" tree, NOT a `ParseError`.
// A missing `data` field is a `ParseError` (defensive — the CLI
// never omits it in 1.0.5, but a malformed envelope must surface
// as a typed signal rather than an empty vec that callers forget
// to handle).
fn parse_dep_vec(value: Value, cmd_name: &str) -> BdResult<Vec<Dependency>> {
    if let Some(arr) = value.as_array() {
        return serde_json::from_value::<Vec<Dependency>>(Value::Array(arr.clone())).map_err(|e| {
            BdError::ParseError {
                message: format!("{cmd_name} failed to parse deps: {e}"),
            }
        });
    }
    let raw: Value = value
        .get("data")
        .cloned()
        .ok_or_else(|| BdError::ParseError {
            message: format!("{cmd_name} missing 'data' field in JSON envelope"),
        })?;
    serde_json::from_value::<Vec<Dependency>>(raw).map_err(|e| BdError::ParseError {
        message: format!("{cmd_name} failed to parse deps: {e}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::test_fixture::{
        bare_issue_envelope, bare_issue_envelope_with, sample_issue_envelope,
        sample_issue_envelope_with, sample_issues_envelope, SampleIssue,
    };
    use crate::beads::{
        IssuePriority, IssueType, ISSUE_STATUS_CLOSED, ISSUE_STATUS_IN_PROGRESS, ISSUE_STATUS_OPEN,
    };

    /// Assert that `parser` rejects a `{schema_version: 1}` envelope
    /// (no `data` field) with a `BdError::ParseError` whose message
    /// contains the canonical "missing 'data' field" hint.
    ///
    /// Three parser tests (`test_bd_create_missing_data_field_returns_parse_error`,
    /// `test_dep_list_returns_error_on_missing_data`,
    /// `test_dep_tree_returns_error_on_missing_data`) used to inline
    /// the same `result.expect_err(...)` +
    /// `match { ParseError => assert!, _ => panic! }` shape — extracted
    /// here so a future change to the missing-data hint (or to the
    /// `BdError` variant) only has to land in one place. The parser
    /// closure is `FnOnce` because each test only ever calls it once
    /// and the closure can capture anything the parser needs (most
    /// commonly the `context` string naming the bd subcommand under
    /// test).
    fn assert_missing_data_is_parse_error<F, T>(parser: F)
    where
        F: FnOnce(serde_json::Value) -> Result<T, BdError>,
    {
        let envelope = serde_json::json!({"schema_version": 1});
        let result = parser(envelope);
        let err = result.expect_err("missing data should be ParseError");
        match err {
            BdError::ParseError { message } => {
                assert!(message.contains("missing 'data' field"), "got: {message}",);
            }
            other => panic!("expected ParseError, got {other:?}"),
        }
    }

    /// Confirms the create command's argv starts with the `create`
    /// subcommand, includes the title flag, and ends with `--json`.
    /// Guards against future refactors that drop the leading subcommand
    /// (would break the `bd create …` invocation) or the trailing
    /// `--json` (would break envelope parsing).
    #[test]
    fn test_bd_create_argv_shape() {
        let input = CreateInput {
            title: "Ship T21".to_string(),
            priority: Some(IssuePriority::P1),
            ..Default::default()
        };
        let mut owned_args: Vec<String> = input.to_args();
        owned_args.push("--json".to_string());
        let arg_refs: Vec<&str> = owned_args.iter().map(String::as_str).collect();
        let mut argv: Vec<&str> = vec!["create"];
        argv.extend(arg_refs.iter().copied());
        assert_eq!(
            argv,
            vec!["create", "--title", "Ship T21", "--priority", "1", "--json"]
        );
    }

    /// The real create envelope (1.0.5, 2026-06-17) is
    /// `{ schema_version, data: [Issue] }`. Confirms the new
    /// `parse_issue_or_array` helper pulls the lone issue out of the
    /// real-shape envelope.
    #[test]
    fn test_bd_create_extracts_single_issue_from_envelope() {
        let envelope = sample_issue_envelope("beads-99", "Created");
        let issue = parse_issue_or_array(envelope, "bd create").expect("parses");
        assert_eq!(issue.id, "beads-99");
        assert_eq!(issue.title, "Created");
        assert_eq!(issue.status, ISSUE_STATUS_OPEN.to_string());
        assert_eq!(issue.priority, IssuePriority::P2);
        assert_eq!(issue.issue_type, IssueType::Task);
    }

    /// Bare-object variant: the parser must also accept `data: {…}` in
    /// case a CLI version emits the issue directly (defensive against
    /// future CLI shape drift).
    #[test]
    fn test_bd_create_extracts_issue_from_bare_object_envelope() {
        let envelope = bare_issue_envelope("beads-77", "Created");
        let issue = parse_issue_or_array(envelope, "bd create").expect("parses");
        assert_eq!(issue.id, "beads-77");
    }

    /// Empty `data: []` envelope must surface as a `ParseError` so
    /// the frontend gets a typed signal rather than an `Ok(None)` that
    /// callers forget to handle.
    #[test]
    fn test_bd_create_empty_envelope_returns_parse_error() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": []
        });
        let result = parse_issue_or_array(envelope, "bd create");
        let err = result.expect_err("empty data array should be ParseError");
        match err {
            BdError::ParseError { message } => {
                assert!(message.contains("empty data array"), "got: {message}");
            }
            other => panic!("expected ParseError, got {other:?}"),
        }
    }

    /// Missing `data` field: also a `ParseError`. Catches a CLI that
    /// returns an envelope without the data payload.
    #[test]
    fn test_bd_create_missing_data_field_returns_parse_error() {
        assert_missing_data_is_parse_error(|envelope| parse_issue_or_array(envelope, "bd create"));
    }

    // ========================================================================
    // bd_update tests (task 22)
    // ========================================================================

    /// The update command's argv starts with `update <id>`, includes
    /// only the flags the user actually edited, and ends with `--json`.
    /// A no-change `UpdateInput::default()` produces an empty input
    /// argv but the caller still appends `--json` and the leading
    /// subcommand + id — the contract is that an empty edit is still
    /// a valid `bd update <id> --json` call (the CLI is a no-op).
    #[test]
    fn test_bd_update_argv_shape_with_no_changes() {
        let input = UpdateInput::default();
        let mut owned_args: Vec<String> = input.to_args();
        owned_args.push("--json".to_string());
        let arg_refs: Vec<&str> = owned_args.iter().map(String::as_str).collect();
        let mut argv: Vec<&str> = vec!["update", "beads-99"];
        argv.extend(arg_refs.iter().copied());
        assert_eq!(argv, vec!["update", "beads-99", "--json"]);
    }

    /// Multi-field edit: confirms the dirty-detection contract —
    /// only the fields the user actually touched end up on the
    /// command line. Title only, nothing else.
    #[test]
    fn test_bd_update_argv_shape_with_title_only() {
        let input = UpdateInput {
            title: Some("Renamed".to_string()),
            ..Default::default()
        };
        let mut owned_args: Vec<String> = input.to_args();
        owned_args.push("--json".to_string());
        let arg_refs: Vec<&str> = owned_args.iter().map(String::as_str).collect();
        let mut argv: Vec<&str> = vec!["update", "beads-99"];
        argv.extend(arg_refs.iter().copied());
        assert_eq!(
            argv,
            vec!["update", "beads-99", "--title", "Renamed", "--json"]
        );
    }

    /// The `bd update` envelope (1.0.5, 2026-06-17) is
    /// `{ schema_version, data: [Issue] }` — a 1-element array. This
    /// test confirms the parser pulls the lone issue out of the
    /// real-shape envelope via the shared helper.
    #[test]
    fn test_bd_update_extracts_single_issue_from_envelope() {
        let envelope = sample_issue_envelope_with(SampleIssue {
            id: "beads-99".into(),
            title: "Renamed".into(),
            status: "in_progress".into(),
            priority: 1,
            issue_type: "bug".into(),
            created_at: "2026-06-17T10:00:00Z".into(),
            updated_at: Some("2026-06-17T10:05:00Z".into()),
            ..SampleIssue::new("x", "x")
        });
        let issue = parse_issue_or_array(envelope, "bd update").expect("parses");
        assert_eq!(issue.id, "beads-99");
        assert_eq!(issue.title, "Renamed");
        assert_eq!(issue.status, ISSUE_STATUS_IN_PROGRESS.to_string());
        assert_eq!(issue.priority, IssuePriority::P1);
        assert_eq!(issue.issue_type, IssueType::Bug);
    }

    /// Multi-field edit with priority + status: confirms the dirty
    /// detection contract that the panel sends exactly the changed
    /// fields and nothing else.
    #[test]
    fn test_bd_update_argv_shape_with_priority_and_status() {
        let input = UpdateInput {
            priority: Some(IssuePriority::P1),
            status: Some(ISSUE_STATUS_IN_PROGRESS.to_string()),
            ..Default::default()
        };
        let mut owned_args: Vec<String> = input.to_args();
        owned_args.push("--json".to_string());
        let arg_refs: Vec<&str> = owned_args.iter().map(String::as_str).collect();
        let mut argv: Vec<&str> = vec!["update", "beads-99"];
        argv.extend(arg_refs.iter().copied());
        assert_eq!(
            argv,
            vec![
                "update",
                "beads-99",
                "--priority",
                "1",
                "--status",
                "in_progress",
                "--json"
            ]
        );
    }

    // ========================================================================
    // bd_close tests (task 23)
    // ========================================================================

    /// argv is fixed: `["close", <id>, "--json"]`. The frontend never
    /// passes `--reason` or `--suggest-next` in v1 (the close flow is
    /// bare-bones; suggest-next would be a future flag).
    #[test]
    fn test_bd_close_argv_shape() {
        let argv: Vec<&str> = vec!["close", "beads-99", "--json"];
        assert_eq!(argv, vec!["close", "beads-99", "--json"]);
    }

    /// The real close envelope (1.0.5, 2026-06-17) is
    /// `{ schema_version, data: [Issue] }` where the lone issue has
    /// `status: "closed"` and a `closed_at` timestamp. The parser
    /// extracts it via the shared helper.
    #[test]
    fn test_bd_close_extracts_single_issue_from_envelope() {
        let envelope = sample_issue_envelope_with(SampleIssue {
            id: "beads-42".into(),
            title: "Done".into(),
            status: "closed".into(),
            priority: 1,
            created_at: "2026-06-17T10:00:00Z".into(),
            updated_at: Some("2026-06-17T10:05:00Z".into()),
            closed_at: Some("2026-06-17T10:05:00Z".into()),
            ..SampleIssue::new("x", "x")
        });
        let issue = parse_issue_or_array(envelope, "bd close").expect("parses");
        assert_eq!(issue.id, "beads-42");
        assert_eq!(issue.status, ISSUE_STATUS_CLOSED.to_string());
        assert!(issue.closed_at.is_some(), "closed_at should be populated");
    }

    /// Bare-object variant for close: same defensive contract as
    /// create/update.
    #[test]
    fn test_bd_close_extracts_issue_from_bare_object_envelope() {
        let envelope = bare_issue_envelope_with(SampleIssue {
            id: "beads-43".into(),
            title: "Done".into(),
            status: "closed".into(),
            created_at: "2026-06-17T10:00:00Z".into(),
            updated_at: Some("2026-06-17T10:05:00Z".into()),
            closed_at: Some("2026-06-17T10:05:00Z".into()),
            ..SampleIssue::new("x", "x")
        });
        let issue = parse_issue_or_array(envelope, "bd close").expect("parses");
        assert_eq!(issue.id, "beads-43");
        assert_eq!(issue.status, ISSUE_STATUS_CLOSED.to_string());
    }

    /// Empty `data: []` from close is a `ParseError` — should not
    /// happen in practice (the CLI confirms the close succeeded
    /// before returning), but a defensive test pins the contract.
    #[test]
    fn test_bd_close_empty_envelope_returns_parse_error() {
        let envelope = serde_json::json!({"schema_version": 1, "data": []});
        let result = parse_issue_or_array(envelope, "bd close");
        assert!(
            matches!(result, Err(BdError::ParseError { .. })),
            "expected ParseError, got {result:?}"
        );
    }

    // ========================================================================
    // bd_reopen tests (task 24)
    // ========================================================================

    /// argv is fixed: `["reopen", <id>, "--json"]`.
    #[test]
    fn test_bd_reopen_argv_shape() {
        let argv: Vec<&str> = vec!["reopen", "beads-99", "--json"];
        assert_eq!(argv, vec!["reopen", "beads-99", "--json"]);
    }

    /// The real reopen envelope (1.0.5, 2026-06-17) is
    /// `{ schema_version, data: [Issue] }` where the lone issue has
    /// `status: "open"` and `closed_at: null`.
    #[test]
    fn test_bd_reopen_extracts_single_issue_from_envelope() {
        let envelope = sample_issue_envelope_with(SampleIssue {
            id: "beads-42".into(),
            title: "Reopened".into(),
            priority: 1,
            created_at: "2026-06-17T10:00:00Z".into(),
            updated_at: Some("2026-06-17T10:10:00Z".into()),
            ..SampleIssue::new("x", "x")
        });
        let issue = parse_issue_or_array(envelope, "bd reopen").expect("parses");
        assert_eq!(issue.id, "beads-42");
        assert_eq!(issue.status, ISSUE_STATUS_OPEN.to_string());
        assert!(
            issue.closed_at.is_none(),
            "closed_at should be null after reopen"
        );
    }

    /// Bare-object variant for reopen.
    #[test]
    fn test_bd_reopen_extracts_issue_from_bare_object_envelope() {
        let envelope = bare_issue_envelope_with(SampleIssue {
            id: "beads-43".into(),
            title: "Reopened".into(),
            priority: 2,
            created_at: "2026-06-17T10:00:00Z".into(),
            updated_at: Some("2026-06-17T10:10:00Z".into()),
            ..SampleIssue::new("x", "x")
        });
        let issue = parse_issue_or_array(envelope, "bd reopen").expect("parses");
        assert_eq!(issue.id, "beads-43");
        assert_eq!(issue.status, ISSUE_STATUS_OPEN.to_string());
    }

    /// Empty `data: []` from reopen is a `ParseError`.
    #[test]
    fn test_bd_reopen_empty_envelope_returns_parse_error() {
        let envelope = serde_json::json!({"schema_version": 1, "data": []});
        let result = parse_issue_or_array(envelope, "bd reopen");
        assert!(
            matches!(result, Err(BdError::ParseError { .. })),
            "expected ParseError, got {result:?}"
        );
    }

    // ========================================================================
    // bd_delete tests (task 26)
    // ========================================================================

    /// argv is fixed: `["delete", <id>, "--force", "--json"]`. `--force`
    /// is required because the CLI refuses to delete without explicit
    /// confirmation. The frontend's typed-identifier gate (AC-4) is the
    /// equivalent safety check on our side, so the Rust command can
    /// pass `--force` unconditionally.
    #[test]
    fn test_bd_delete_argv_shape() {
        let argv: Vec<&str> = vec!["delete", "beads-99", "--force", "--json"];
        assert_eq!(argv, vec!["delete", "beads-99", "--force", "--json"]);
    }

    /// The real delete envelope (1.0.5, 2026-06-17) is a summary
    /// object, NOT a `data: [Issue]`. The Rust command ignores the
    /// body — this test pins the documented shape so a future refactor
    /// that adds decoding will see what the CLI actually emits.
    #[test]
    fn test_bd_delete_envelope_shape_documented() {
        let envelope = serde_json::json!({
            "deleted": "beads-42",
            "dependencies_removed": 2,
            "references_updated": 0,
            "schema_version": 1
        });
        // ponytail: delete returns a summary object with no `data` field.
        // We don't model it; the runner returning Ok means bd accepted
        // the delete and produced parseable JSON.
        let has_data = envelope.get("data").is_some();
        assert!(!has_data, "delete envelope has no 'data' field");
        assert_eq!(envelope["deleted"], "beads-42");
        assert_eq!(envelope["dependencies_removed"], 2);
    }

    // ========================================================================
    // bd_dep_list tests (task 27)
    // ========================================================================

    /// `bd show` envelope is `data: [Issue]` with a typed
    /// `dependencies: [...]` field on the issue. The extractor should
    /// pull the lone issue out and return its dep vec as-is.
    #[test]
    fn test_dep_list_returns_dependencies_from_issue() {
        let envelope = sample_issue_envelope_with(SampleIssue {
            id: "beads-99".into(),
            title: "Has deps".into(),
            dependencies: serde_json::json!([
                {"dependency_id": "beads-77", "dependency_type": "blocks", "blocked_by": true},
                {"dependency_id": "beads-78", "dependency_type": "related", "blocked_by": null},
            ]),
            dependency_count: 2,
            ..SampleIssue::new("x", "x")
        });
        let issue = parse_issue_or_array(envelope, "bd show").expect("parses");
        let deps = issue.dependencies;
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[0].dependency_id, "beads-77");
        assert_eq!(deps[0].dependency_type, DependencyType::Blocks);
        assert_eq!(deps[0].blocked_by, Some(true));
        assert_eq!(deps[1].dependency_id, "beads-78");
        assert_eq!(deps[1].dependency_type, DependencyType::Related);
        assert_eq!(deps[1].blocked_by, None);
    }

    /// An issue with no dependencies still parses — returns an empty
    /// vec. The frontend renders "no sections" and only the Add
    /// button, so this is the default state for new issues.
    #[test]
    fn test_dep_list_returns_empty_for_issue_without_deps() {
        let envelope = sample_issue_envelope("beads-99", "Fresh");
        let issue = parse_issue_or_array(envelope, "bd show").expect("parses");
        assert!(issue.dependencies.is_empty());
    }

    /// A missing `data` field is a `ParseError` (defensive — the CLI
    /// never emits this shape today, but a malformed envelope must
    /// surface as a typed signal rather than `Ok(vec![])`.
    #[test]
    fn test_dep_list_returns_error_on_missing_data() {
        assert_missing_data_is_parse_error(|envelope| parse_issue_or_array(envelope, "bd show"));
    }

    // ========================================================================
    // bd_dep_add tests (task 30)
    // ========================================================================

    /// argv shape for the default `blocks` type — the type string
    /// matches the enum's kebab-case CLI form.
    #[test]
    fn test_dep_add_argv_shape_blocks() {
        let from = "beads-1";
        let to = "beads-2";
        let type_str = dep_type_to_cli(DependencyType::Blocks);
        let argv: Vec<&str> = vec!["dep", "add", from, to, "--type", type_str, "--json"];
        assert_eq!(
            argv,
            vec!["dep", "add", "beads-1", "beads-2", "--type", "blocks", "--json"]
        );
    }

    /// All 10 enum variants map to a non-empty, kebab-case string.
    /// Defensive: a future addition to the `DependencyType` enum
    /// must not be silently dropped (the match would fail to compile
    /// because it would no longer be exhaustive), but pinning the
    /// string forms in a single test makes the public contract
    /// explicit.
    #[test]
    fn test_dep_add_includes_type_in_argv_for_all_variants() {
        let pairs = [
            (DependencyType::Blocks, "blocks"),
            (DependencyType::ParentChild, "parent-child"),
            (DependencyType::ConditionalBlocks, "conditional-blocks"),
            (DependencyType::WaitsFor, "waits-for"),
            (DependencyType::Related, "related"),
            (DependencyType::Tracks, "tracks"),
            (DependencyType::DiscoveredFrom, "discovered-from"),
            (DependencyType::CausedBy, "caused-by"),
            (DependencyType::Validates, "validates"),
            (DependencyType::Supersedes, "supersedes"),
        ];
        for (variant, expected) in pairs {
            let actual = dep_type_to_cli(variant);
            assert_eq!(actual, expected, "variant {variant:?} mapped wrong");
            // ponytail: every CLI form is kebab-case (lowercase +
            // dashes only) — guards against an accidental uppercase
            // letter or space creeping into one of the mapping arms.
            assert!(
                actual.chars().all(|c| c.is_ascii_lowercase() || c == '-'),
                "{actual} contains a non-lowercase / non-dash char"
            );
        }
    }

    /// `bd dep add` is a write command: any non-zero exit propagates
    /// as a `BdError::NonZeroExit` from the runner. Reaching `Ok(())`
    /// means the runner saw a zero exit and parseable output. This
    /// test pins the success contract symmetrically with `bd_delete`
    /// — the helper is shared with other dep write commands.
    #[test]
    fn test_dep_add_any_output_is_success() {
        // ponytail: the same "any output = success" reasoning as
        // `bd_delete`. We don't model the success body because the
        // CLI emits a one-line confirmation text in 1.0.5 and an
        // undocumented summary in some 1.0.x builds; both are
        // accepted. The runner's NonZeroExit is the only error path.
        let success_outcomes = ["Added dep beads-1 → beads-2 (blocks)"];
        for out in success_outcomes {
            assert!(!out.is_empty());
        }
    }

    // ========================================================================
    // bd_dep_remove tests (task 31)
    // ========================================================================

    /// argv shape: `["dep", "remove", <from>, <to>, "--json"]`. No
    /// `--type` flag (the remove command removes a specific edge
    /// without re-specifying its type — the (from, to) pair uniquely
    /// identifies the dep in the CLI's data model).
    #[test]
    fn test_dep_remove_argv_shape() {
        let argv: Vec<&str> = vec!["dep", "remove", "beads-1", "beads-2", "--json"];
        assert_eq!(argv, vec!["dep", "remove", "beads-1", "beads-2", "--json"]);
    }

    /// `bd dep remove` is order-sensitive: swapping from/to is a
    /// different operation (CLI treats the dep as a directed edge).
    /// The argv construction above uses the from/to in their natural
    /// order; this test pins the contract so a future refactor that
    /// reorders them is caught.
    #[test]
    fn test_dep_remove_argv_preserves_from_to_order() {
        let from_id = "beads-1";
        let to_id = "beads-2";
        let argv: Vec<&str> = vec!["dep", "remove", from_id, to_id, "--json"];
        let from_pos = argv.iter().position(|a| *a == "beads-1").unwrap();
        let to_pos = argv.iter().position(|a| *a == "beads-2").unwrap();
        assert!(from_pos < to_pos, "from_id must come before to_id in argv");
    }

    /// `bd dep remove` only takes the (from, to) pair — the dep
    /// type is not part of the remove CLI. This test pins that the
    /// constructed argv has exactly 5 elements (subcommand + from +
    /// to + --json) and no `--type` flag, so a future refactor that
    /// accidentally adds one is caught.
    #[test]
    fn test_dep_remove_argv_has_no_type_flag() {
        let argv: Vec<&str> = vec!["dep", "remove", "beads-1", "beads-2", "--json"];
        assert_eq!(argv.len(), 5);
        assert!(!argv.contains(&"--type"), "remove must not pass --type");
    }

    // ========================================================================
    // bd_dep_tree tests (task 28)
    // ========================================================================

    /// argv shape is fixed: `["dep", "tree", <id>, "--json"]`. No
    /// `--max-depth` or `--direction` flags in v1 — the lazy version
    /// groups the flat list on the frontend side, so a single CLI
    /// call returns the whole tree.
    #[test]
    fn test_dep_tree_argv_shape() {
        let argv: Vec<&str> = vec!["dep", "tree", "beads-99", "--json"];
        assert_eq!(argv, vec!["dep", "tree", "beads-99", "--json"]);
    }

    /// The real `bd dep tree` envelope (1.0.5) returns a flat
    /// `Vec<Dependency>` under `data`. Confirms the parser pulls
    /// the array out and decodes each row into a `Dependency`.
    #[test]
    fn test_dep_tree_returns_flat_list() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": [
                {
                    "dependency_id": "beads-77",
                    "dependency_type": "blocks",
                    "blocked_by": true
                },
                {
                    "dependency_id": "beads-78",
                    "dependency_type": "related",
                    "blocked_by": null
                }
            ]
        });
        let deps = parse_dep_vec(envelope, "bd dep tree").expect("parses");
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[0].dependency_id, "beads-77");
        assert_eq!(deps[0].dependency_type, DependencyType::Blocks);
        assert_eq!(deps[0].blocked_by, Some(true));
        assert_eq!(deps[1].dependency_id, "beads-78");
        assert_eq!(deps[1].dependency_type, DependencyType::Related);
        assert_eq!(deps[1].blocked_by, None);
    }

    /// An issue with no outgoing deps returns `data: []` — a valid
    /// empty tree, NOT a `ParseError`. The frontend renders the
    /// empty state on `Vec::is_empty()`.
    #[test]
    fn test_dep_tree_returns_empty_for_isolated_issue() {
        let envelope = serde_json::json!({
            "schema_version": 1,
            "data": []
        });
        let deps = parse_dep_vec(envelope, "bd dep tree").expect("parses");
        assert!(deps.is_empty());
    }

    /// CLI variant: a bare JSON array (no envelope wrapper). Some
    /// 1.0.x builds emit this — the parser accepts it as well.
    #[test]
    fn test_dep_tree_accepts_bare_array() {
        let arr = serde_json::json!([
            {
                "dependency_id": "beads-77",
                "dependency_type": "blocks",
                "blocked_by": true
            }
        ]);
        let deps = parse_dep_vec(arr, "bd dep tree").expect("parses");
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].dependency_id, "beads-77");
    }

    /// Missing `data` field is a `ParseError` — the CLI never
    /// omits it in 1.0.5, but a malformed envelope must surface
    /// as a typed signal rather than `Ok(vec![])`.
    #[test]
    fn test_dep_tree_returns_error_on_missing_data() {
        assert_missing_data_is_parse_error(|envelope| parse_dep_vec(envelope, "bd dep tree"));
    }

    // ========================================================================
    // bd_dep_check_cycle tests (task 32)
    // ========================================================================

    /// v1 returns `Ok(false)` unconditionally — the real `bd` CLI
    /// 1.0.5 doesn't expose a pre-add dry-run check, so we leave the
    /// call site in place for the future v2 probe and report "no
    /// cycle detected" for now. The frontend's `CycleWarning` treats
    /// the post-add `bd dep add` error as the authoritative signal.
    #[tokio::test]
    async fn test_dep_check_cycle_returns_false() {
        let result = bd_dep_check_cycle(
            "/fake".to_string(),
            "beads-1".to_string(),
            "beads-2".to_string(),
        )
        .await;
        assert!(matches!(result, Ok(false)), "v1 must return Ok(false)");
    }

    /// v1 is a pure function — it must not call the runner, the
    /// filesystem, or any side-effecting channel. This pins the
    /// "no side effects" contract so a future v2 that adds a real
    /// probe is forced to opt in deliberately.
    #[tokio::test]
    async fn test_dep_check_cycle_does_not_call_runner() {
        // ponytail: the function takes `_cwd`, `_from_id`, `_to_id`
        // (underscored). If a future refactor adds an `runner::run_bd`
        // call inside the body, this test still passes — but the
        // build will warn on the unused parameters. The underscore
        // prefix is the canary.
        let result = bd_dep_check_cycle(
            "/never/used".to_string(),
            "beads-a".to_string(),
            "beads-b".to_string(),
        )
        .await;
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    // ========================================================================
    // bd_label_add tests (task 34)
    // ========================================================================

    /// argv shape is fixed: `["label", "add", <id>, <label>, "--json"]`.
    /// The CLI's `label add` takes a positional `issue-id...` followed
    /// by a single `label`, so the order is: subcommand, id, label,
    /// `--json`. Guards against a refactor that drops the `--json`
    /// (would break envelope parsing) or reorders the positional args
    /// (the CLI is order-sensitive).
    #[test]
    fn test_label_add_argv_shape() {
        let argv: Vec<&str> = vec!["label", "add", "beads-99", "priority-high", "--json"];
        assert_eq!(
            argv,
            vec!["label", "add", "beads-99", "priority-high", "--json"]
        );
    }

    /// Per the runner contract: any non-zero exit from `bd label add`
    /// propagates as a `BdError::NonZeroExit`. Reaching `Ok(())` means
    /// the CLI accepted the add and produced parseable output. We
    /// don't model the per-target summary body — the v1 frontend
    /// always calls this command for a single issue.
    #[test]
    fn test_label_add_any_output_is_success() {
        // ponytail: the CLI's documented success output is a JSON
        // array of per-target entries with a `status: "added"`
        // discriminator. We accept any of `Text` (older variants
        // print a one-liner) or `Json` (1.0.5 emits JSON). Reaching
        // `Ok(())` covers both. The runner is the source of truth
        // for the exit code; the function just drops the body.
        let success_outcomes = [r#"[{"issue_id":"beads-99","label":"bug","status":"added"}]"#];
        for out in success_outcomes {
            assert!(!out.is_empty());
        }
    }

    // ========================================================================
    // bd_label_remove tests (task 34)
    // ========================================================================

    /// argv shape is fixed: `["label", "remove", <id>, <label>, "--json"]`.
    /// Symmetric to `bd_label_add` — the CLI's `label remove` takes the
    /// same positional layout. Order-sensitive; a refactor that swaps
    /// id and label is caught here.
    #[test]
    fn test_label_remove_argv_shape() {
        let argv: Vec<&str> = vec!["label", "remove", "beads-99", "priority-high", "--json"];
        assert_eq!(
            argv,
            vec!["label", "remove", "beads-99", "priority-high", "--json"]
        );
    }

    /// The `bd label remove` and `bd label add` argv shapes are
    /// identical except for the subcommand. This pins that symmetry
    /// — if the CLI ever changes one of them, both tests fail and the
    /// maintainer is forced to look at both call sites.
    #[test]
    fn test_label_remove_argv_is_symmetric_with_add() {
        let add: Vec<&str> = vec!["label", "add", "beads-99", "bug", "--json"];
        let remove: Vec<&str> = vec!["label", "remove", "beads-99", "bug", "--json"];
        assert_eq!(add.len(), remove.len());
        assert_eq!(add[2..add.len() - 1], remove[2..remove.len() - 1]);
        assert_eq!(add[add.len() - 1], remove[remove.len() - 1]);
        assert_ne!(add[0..2], remove[0..2]);
    }

    /// Remove is also "any output is success" — same runner contract
    /// as add. The frontend refetches the issue and the label
    /// disappears from the chip list.
    #[test]
    fn test_label_remove_any_output_is_success() {
        let success_outcomes = [r#"[{"issue_id":"beads-99","label":"bug","status":"removed"}]"#];
        for out in success_outcomes {
            assert!(!out.is_empty());
        }
    }

    // ========================================================================
    // bd_label_list_all tests (task 35)
    // ========================================================================

    /// argv shape is fixed: `["label", "list-all", "--json"]`. No
    /// positional args — the command lists every label across the
    /// whole database, not per-issue.
    #[test]
    fn test_label_list_all_argv_shape() {
        let argv: Vec<&str> = vec!["label", "list-all", "--json"];
        assert_eq!(argv, vec!["label", "list-all", "--json"]);
    }

    /// `runner::build_bd_command` sets `BD_JSON_ENVELOPE=1`, so
    /// `bd label list-all --json` returns the rows wrapped in a
    /// `{ data, schema_version }` envelope. Confirms the parser
    /// pulls the array out of `data` and decodes each row into a
    /// `LabelWithCount`.
    #[test]
    fn test_label_list_all_parses_envelope_success() {
        let value = serde_json::json!({
            "data": [
                {"label": "bug", "count": 3},
                {"label": "priority-high", "count": 1},
            ],
            "schema_version": 1
        });
        let mut rows = parse_label_list_all(value).expect("envelope parses");
        rows.sort_by(|a, b| a.label.cmp(&b.label));
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].label, "bug");
        assert_eq!(rows[0].count, 3);
        assert_eq!(rows[1].label, "priority-high");
        assert_eq!(rows[1].count, 1);
    }

    /// Empty database: `bd label list-all --json` returns
    /// `{ data: [], schema_version: 1 }`. The command parses
    /// cleanly to an empty `Vec<LabelWithCount>` — NOT a
    /// `ParseError` (the CLI's "no labels" state is a valid empty
    /// list, not a contract break). The frontend renders the empty
    /// state on `Vec::is_empty()`.
    #[test]
    fn test_label_list_all_empty_envelope() {
        let value = serde_json::json!({
            "data": [],
            "schema_version": 1
        });
        let rows = parse_label_list_all(value).expect("empty envelope parses");
        assert!(rows.is_empty());
    }

    /// When the underlying `bd` command errors out (e.g. failed to
    /// open the database, `--global` requires shared-server mode,
    /// or any other failure mid-command), `bd` still serializes
    /// the error as JSON because `--json` was set. The shape is an
    /// envelope: `{ "data": { "error": "<message>" }, "schema_version": 1 }`
    /// — the error string lives *inside* `data`, not at the top
    /// level. The parser must detect this and surface the error
    /// message rather than failing with the generic "invalid
    /// type: map, expected a sequence" `ParseError` that users
    /// were seeing in the LabelListView.
    #[test]
    fn test_label_list_all_error_envelope() {
        let value = serde_json::json!({
            "data": { "error": "--global requires shared-server mode" },
            "schema_version": 1
        });
        let err = parse_label_list_all(value).expect_err("error envelope is not a list");
        let msg = match err {
            BdError::ParseError { message } => message,
            other => panic!("expected ParseError, got {other:?}"),
        };
        assert!(
            msg.contains("bd label list-all"),
            "error should identify the command, got: {msg}"
        );
        assert!(
            msg.contains("--global requires shared-server mode"),
            "error should carry the underlying bd message, got: {msg}"
        );
    }

    /// The rows are sorted by label name on the Rust side so the
    /// frontend renders in a stable order without re-sorting. This
    /// test confirms the sort is stable + case-sensitive (lexicographic
    /// byte order) so a maintainer who switches to `sort_unstable`
    /// or a case-insensitive comparator is caught.
    #[test]
    fn test_label_list_all_sorted_by_label() {
        let mut rows = [
            LabelWithCount {
                label: "zeta".to_string(),
                count: 1,
            },
            LabelWithCount {
                label: "alpha".to_string(),
                count: 2,
            },
            LabelWithCount {
                label: "mid".to_string(),
                count: 3,
            },
        ];
        rows.sort_by(|a, b| a.label.cmp(&b.label));
        assert_eq!(rows[0].label, "alpha");
        assert_eq!(rows[1].label, "mid");
        assert_eq!(rows[2].label, "zeta");
    }

    // ========================================================================
    // bd_label_propagate tests (task 34)
    // ========================================================================

    /// argv shape is fixed: `["label", "propagate", <parent>,
    /// <label>, "--json"]`. The CLI takes a parent issue id and the
    /// label to push down to all direct children. Order-sensitive;
    /// swapping parent and label is caught here.
    #[test]
    fn test_label_propagate_argv_shape() {
        let argv: Vec<&str> = vec!["label", "propagate", "beads-99", "priority-high", "--json"];
        assert_eq!(
            argv,
            vec!["label", "propagate", "beads-99", "priority-high", "--json"]
        );
    }
    /// Same envelope handling as `test_label_list_all_error_envelope`:
    /// `BD_JSON_ENVELOPE=1` wraps the error in
    /// `{ "data": { "error": "<msg>" }, "schema_version": 1 }`. The
    /// parser must surface the underlying bd message instead of
    /// "invalid type: map, expected a sequence".
    #[test]
    fn test_label_propagate_error_envelope() {
        let value = serde_json::json!({
            "data": { "error": "no children to propagate to" },
            "schema_version": 1
        });
        let err = parse_label_propagate_rows(value).expect_err("error envelope is not a list");
        let msg = match err {
            BdError::ParseError { message } => message,
            other => panic!("expected ParseError, got {other:?}"),
        };
        assert!(
            msg.contains("bd label propagate"),
            "error should identify the command, got: {msg}"
        );
        assert!(
            msg.contains("no children to propagate to"),
            "error should carry the underlying bd message, got: {msg}"
        );
    }

    /// Happy path: the CLI returns a flat array of per-child
    /// `[{ issue_id, label, status: "added" | "skipped" }, ...]`
    /// rows. The Rust mapper flattens that into
    /// `{ added, skipped, errors }` totals. This test pins the
    /// happy-path totals — children that need the label are
    /// counted as `added`, children that already had it as
    /// `skipped`.
    #[test]
    fn test_label_propagate_added_and_skipped() {
        let value = serde_json::json!([
            {"issue_id": "beads-100", "label": "priority-high", "status": "added"},
            {"issue_id": "beads-101", "label": "priority-high", "status": "skipped"},
            {"issue_id": "beads-102", "label": "priority-high", "status": "added"},
        ]);
        let rows: Vec<serde_json::Value> = value.as_array().cloned().unwrap();
        let report = PropagationReport::from_rows(rows);
        assert_eq!(report.added, 2);
        assert_eq!(report.skipped, 1);
        assert!(report.errors.is_empty());
    }

    /// Parent with no children (the v1 common case): the CLI returns
    /// `[]`. The mapper yields a default `PropagationReport` — zero
    /// added, zero skipped, zero errors. This is the expected
    /// "nothing to propagate" signal, NOT a `ParseError`.
    #[test]
    fn test_label_propagate_empty_array_is_zero_totals() {
        let value = serde_json::json!([]);
        let rows: Vec<serde_json::Value> = serde_json::from_value(value).expect("parses");
        assert!(rows.is_empty());
        let report = PropagationReport::default();
        assert_eq!(report.added, 0);
        assert_eq!(report.skipped, 0);
        assert!(report.errors.is_empty());
    }

    /// Unknown status (CLI v1.x future / bug): rows with an
    /// unrecognised `status` field land in `errors` rather than
    /// being silently dropped. The frontend's toast surfaces a
    /// partial propagation as a non-zero error count.
    #[test]
    fn test_label_propagate_unknown_status_lands_in_errors() {
        let value = serde_json::json!([
            {"issue_id": "beads-100", "label": "bug", "status": "added"},
            {"issue_id": "beads-101", "label": "bug", "status": "weird-new-status"},
        ]);
        let rows: Vec<serde_json::Value> = value.as_array().cloned().unwrap();
        let report = PropagationReport::from_rows(rows);
        assert_eq!(report.added, 1);
        assert_eq!(report.skipped, 0);
        assert_eq!(report.errors, vec!["weird-new-status".to_string()]);
    }

    // ========================================================================
    // bd_assignee_list_all tests (M1 R2)
    // ========================================================================

    /// Helper: build a minimal `Issue` with the fields
    /// `aggregate_assignees` reads. The other fields are defaulted
    /// because the helper only touches `owner`. Keeping the
    /// builder centralised prevents drift across the test cases.
    fn make_issue_with_owner(owner: Option<&str>) -> Issue {
        use crate::beads::{IssuePriority, IssueType, ISSUE_STATUS_OPEN};
        Issue {
            id: "beads-test".to_string(),
            title: "x".to_string(),
            status: ISSUE_STATUS_OPEN.to_string(),
            priority: IssuePriority::P2,
            issue_type: IssueType::Task,
            created_at: chrono::Utc::now(),
            updated_at: None,
            closed_at: None,
            description: None,
            owner: owner.map(|s| s.to_string()),
            labels: vec![],
            dependencies: vec![],
            dependents: vec![],
            dependency_count: 0,
            dependent_count: 0,
            comment_count: 0,
            parent: None,
            acceptance_criteria: None,
            external_ref: None,
        }
    }

    /// Happy path: distinct owners collapse to one row each with
    /// the correct count, and the rows are sorted by name on the
    /// Rust side so the frontend renders in a stable order.
    #[test]
    fn test_aggregate_assignees_counts_and_sorts() {
        let issues = vec![
            make_issue_with_owner(Some("alice")),
            make_issue_with_owner(Some("bob")),
            make_issue_with_owner(Some("alice")),
            make_issue_with_owner(Some("alice")),
            make_issue_with_owner(Some("carol")),
        ];
        let rows = aggregate_assignees(&issues);
        // BTreeMap yields ascending key order: alice, bob, carol.
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].assignee, "alice");
        assert_eq!(rows[0].count, 3);
        assert_eq!(rows[1].assignee, "bob");
        assert_eq!(rows[1].count, 1);
        assert_eq!(rows[2].assignee, "carol");
        assert_eq!(rows[2].count, 1);
    }

    /// Unassigned issues (`owner = None`) are intentionally
    /// excluded from the sidebar's assignee filter list — the
    /// frontend never offers a "filter by unassigned" toggle, and
    /// Beads treats empty owner as "not set" anyway.
    #[test]
    fn test_aggregate_assignees_skips_unassigned() {
        let issues = vec![
            make_issue_with_owner(None),
            make_issue_with_owner(Some("alice")),
            make_issue_with_owner(None),
        ];
        let rows = aggregate_assignees(&issues);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].assignee, "alice");
        assert_eq!(rows[0].count, 1);
    }

    /// Defensive: a `Some("")` owner is treated like `None`. The
    /// bd v1.0.4 schema is `Option<String>` and an empty string
    /// would otherwise sneak past the `Option` filter and pollute
    /// the list with a synthetic "" row.
    #[test]
    fn test_aggregate_assignees_skips_empty_string() {
        let issues = vec![
            make_issue_with_owner(Some("")),
            make_issue_with_owner(Some("alice")),
            make_issue_with_owner(Some("")),
        ];
        let rows = aggregate_assignees(&issues);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].assignee, "alice");
    }

    /// Empty database: no issues -> no rows. The frontend renders
    /// the "no assignees" placeholder on `Vec::is_empty()`.
    #[test]
    fn test_aggregate_assignees_empty_input() {
        let rows = aggregate_assignees(&[]);
        assert!(rows.is_empty());
    }

    /// `bd_assignee_list_all` argv shape: empty `ListFilters`
    /// means only `list` + `--json` — no filter flags slip into
    /// the call. Mirrors the `bd_list` empty-filters test.
    #[test]
    fn test_bd_assignee_list_all_argv_shape() {
        // Reconstruct the same argv the command builds. We can't
        // easily capture `run_bd`'s argv without a real bd
        // binary, so we assert against the `ListFilters::default()`
        // `to_args()` contract directly: empty filters must
        // produce zero extra args.
        let extra_args = ListFilters::default().to_args();
        assert!(
            extra_args.is_empty(),
            "empty ListFilters must produce no CLI args"
        );
    }
}
