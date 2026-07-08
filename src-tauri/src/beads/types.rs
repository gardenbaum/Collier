use chrono::{DateTime, Utc};
use serde::de::{self, Deserializer, Visitor};
use serde::{Deserialize, Serialize};
use serde_repr::Serialize_repr;
use specta::Type;
use std::fmt;

// ============================================================================
// Issue Status & Priority & Type
// ============================================================================

/// Status of an issue.
///
/// Beads (v1.0.4+) ships five built-in statuses — `open`,
/// `in_progress`, `blocked`, `deferred`, `closed` — plus two
/// v1.0.5 additions (`pinned`, `hooked`) — and allows users to
/// register additional *custom* statuses via
/// `bd config set status.custom "name:category,..."` (see
/// `docs/CONSTITUTION.md §3`). Because the CLI doesn't constrain
/// the on-disk `status` column to a closed set, we model the Rust
/// type as a plain `String` and accept any value bd emits. The
/// `ISSUE_STATUS_*` constants below are the *built-in*
/// convenience names; code that needs to recognise them should
/// compare against these constants (or against the canonical
/// names surfaced by the `bd_statuses` command).
///
/// The TS side mirrors this — `bindings.ts` advertises
/// `IssueStatus` as a bare `string` so any custom value the CLI
/// surfaces flows through unchanged.
pub type IssueStatus = String;

/// Canonical string for the v1 lifecycle's `open` status.
pub const ISSUE_STATUS_OPEN: &str = "open";
/// Canonical string for the v1 lifecycle's `in_progress` status.
#[allow(dead_code)] // exposed for downstream callers; not yet consumed in lib code
pub const ISSUE_STATUS_IN_PROGRESS: &str = "in_progress";
/// Canonical string for the v1 lifecycle's `blocked` status.
pub const ISSUE_STATUS_BLOCKED: &str = "blocked";
/// Canonical string for the v1 lifecycle's `deferred` status.
#[allow(dead_code)] // exposed for downstream callers; not yet consumed in lib code
pub const ISSUE_STATUS_DEFERRED: &str = "deferred";
/// Canonical string for the v1 lifecycle's `closed` status.
pub const ISSUE_STATUS_CLOSED: &str = "closed";

/// Returns true when `status` is the canonical `closed` value
/// (the only "done" category in the v1 lifecycle). Custom
/// statuses are *not* treated as closed unless the workspace's
/// catalog explicitly defines one as such — callers that need
/// that nuance should query the `bd_statuses` catalog and key
/// off `category == "done"`.
pub fn issue_status_is_closed(status: &str) -> bool {
    status == ISSUE_STATUS_CLOSED
}

// ponytail: `IssuePriority` serialises as a bare integer 0..4 (via
// `Serialize_repr`) so the on-disk JSONL `bd` produces round-trips
// 1:1 with the CLI. But the specta-generated TypeScript type
// advertises the variant-name string union `"P0"|"P1"|...|"P4"`,
// and the frontend sends that string form across the Tauri command
// bridge. `Deserialize_repr` rejects the string form with
// `invalid type: string "P1", expected u8`, which surfaces in the
// r2-filters E2E as `Failed to load: invalid args filters for command
// bd_list`. We keep the `Serialize_repr` (u8) for the wire format
// and implement `Deserialize` manually to accept BOTH the bare
// integer (what the bridge SHOULD send, and what the JSONL uses)
// and the variant-name string (what the specta-generated TS
// actually sends today). One deserialiser, two input shapes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Type)]
#[repr(u8)]
pub enum IssuePriority {
    P0 = 0,
    P1 = 1,
    P2 = 2,
    P3 = 3,
    P4 = 4,
}

impl<'de> Deserialize<'de> for IssuePriority {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct PriorityVisitor;

        impl<'de> Visitor<'de> for PriorityVisitor {
            type Value = IssuePriority;

            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("an integer 0..4 or a string \"P0\"..\"P4\"")
            }

            fn visit_u8<E>(self, v: u8) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                match v {
                    0 => Ok(IssuePriority::P0),
                    1 => Ok(IssuePriority::P1),
                    2 => Ok(IssuePriority::P2),
                    3 => Ok(IssuePriority::P3),
                    4 => Ok(IssuePriority::P4),
                    other => Err(de::Error::invalid_value(
                        de::Unexpected::Unsigned(other as u64),
                        &"an integer 0..4",
                    )),
                }
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if v > u8::MAX as u64 {
                    return Err(de::Error::invalid_value(
                        de::Unexpected::Unsigned(v),
                        &"an integer 0..4",
                    ));
                }
                self.visit_u8(v as u8)
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if v < 0 || v > u8::MAX as i64 {
                    return Err(de::Error::invalid_value(
                        de::Unexpected::Signed(v),
                        &"an integer 0..4",
                    ));
                }
                self.visit_u8(v as u8)
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                // Accept the variant-name form the specta-generated
                // TS sends ("P0".."P4"). Also accept the bare-digit
                // string form for symmetry with the integer path, so
                // a `bd list --json` piped through jq and back round
                // trips without manual coercion.
                match v {
                    "P0" | "0" => Ok(IssuePriority::P0),
                    "P1" | "1" => Ok(IssuePriority::P1),
                    "P2" | "2" => Ok(IssuePriority::P2),
                    "P3" | "3" => Ok(IssuePriority::P3),
                    "P4" | "4" => Ok(IssuePriority::P4),
                    other => Err(de::Error::unknown_variant(
                        other,
                        &["P0", "P1", "P2", "P3", "P4", "0", "1", "2", "3", "4"],
                    )),
                }
            }
        }

        deserializer.deserialize_any(PriorityVisitor)
    }
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
    /// bd v1.0.4 emits this as `parent-child` (kebab-case) instead of
    /// the snake_case the enum's `rename_all` would produce. The
    /// alias keeps bd's output deserialisable; serialization stays
    /// `parent_child` so the existing TS contract is unchanged.
    #[serde(alias = "parent-child")]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Dependency {
    /// The target issue id (the issue being depended on, i.e. the
    /// "to" side of the relationship). The field is named
    /// `dependency_id` in the Rust→TS contract (see
    /// `DependencyTreeView.tsx`) but `bd show --json` emits the
    /// nested issue object under the `id` key (the entry is a
    /// full issue, not a `{dependency_id, dependency_type}`
    /// pair), and `bd list --json` historically used
    /// `depends_on_id`. The two aliases keep all three shapes
    /// deserialisable; serialization stays `dependency_id` so the
    /// frontend contract is unchanged. The `issue_id` bd also
    /// emits is the source side — that's already on the
    /// enclosing `Issue`, so we just ignore it on deserialize
    /// (serde_json drops unknown fields).
    #[serde(alias = "depends_on_id", alias = "id")]
    pub dependency_id: String,
    /// bd emits this as `type` (a reserved Rust keyword, hence the
    /// Rust field rename). Alias keeps bd's output deserialisable;
    /// serialization stays `dependency_type`.
    #[serde(rename = "dependency_type", alias = "type")]
    pub dependency_type: DependencyType,
    /// `#[serde(default)]` because bd v1.0.4 does NOT emit a
    /// `blocked_by` flag in `bd list --json` — that direction is
    /// implicit from `type` (a `blocks` edge on a non-closed issue
    /// means the source is blocked). Default = `None`.
    #[serde(default)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
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

/// One row of `bd_assignee_list_all` — distinct owner (assignee)
/// across the whole `.beads/` database, with the count of issues
/// they own.
///
/// Mirror of `LabelWithCount`: the Beads CLI (v1.0.5) does not
/// expose an `assignee list-all` subcommand, so we derive the
/// distinct `(owner, count)` pairs from a full `bd list --json`
/// pass on the Rust side. Sorted by name so the frontend renders
/// in a stable order without re-sorting.
///
/// `count` is the number of issues currently owned by that user.
/// Unassigned issues (`owner = None`) are NOT included — the
/// frontend renders an explicit "Unassigned" affordance only when
/// the user actively opts in (separate from this list).
///
/// ponytail: the struct shape is intentionally identical to
/// `LabelWithCount { label, count }` rather than a richer
/// `Assignee { name, email, ... }`. Beads' owner model in v1 is
/// just a string with no metadata; a richer struct would force
/// `Option::None`s everywhere today and constrain a v2 metadata
/// shape prematurely. Reuse the flat shape; expand when a real
/// metadata field lands.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssigneeWithCount {
    pub assignee: String,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Issue {
    pub id: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub issue_type: IssueType,
    pub created_at: DateTime<Utc>,
    /// `#[serde(default)]` because bd v1.0.4's `bd list --json`
    /// omits `updated_at` for issues that have never been updated
    /// after creation. Default = `None`.
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    /// `#[serde(default)]` because bd only emits `closed_at` when
    /// the issue is actually closed; open / in_progress issues have
    /// no entry. Default = `None`.
    #[serde(default)]
    pub closed_at: Option<DateTime<Utc>>,
    /// `#[serde(default)]` because bd v1.0.4's list output omits
    /// `description` for issues with no description. Default = `None`.
    #[serde(default)]
    pub description: Option<String>,
    /// `#[serde(default)]` because bd v1.0.4's list output omits
    /// `owner` for unassigned issues. Default = `None`.
    #[serde(default)]
    pub owner: Option<String>,
    /// `#[serde(default)]` because bd v1.0.4's `bd list --json`
    /// output omits `labels` entirely for issues that have no
    /// labels attached (verified against `BD_JSON_ENVELOPE=1` output
    /// from the CLI). Default = empty `Vec`. The M4 R9 E2E spec's
    /// `make-second-fixture.sh` seeds five label-less issues; without
    /// this default the list view for `/tmp/e2e-workspace-b` raised
    /// "failed to parse from 'data' field: missing field
    /// `labels`" and the r10 real-time sync smoke spec timed out on
    /// the post-switch reload. Surfaced as a `ParseError` from
    /// `bd_list` (`envelope::extract` in `beads/envelope.rs`).
    #[serde(default)]
    pub labels: Vec<Label>,
    /// `#[serde(default)]` because bd v1.0.4's `bd list --json`
    /// output does NOT include a `dependencies` array — only the
    /// `dependency_count` and `dependent_count` summary fields are
    /// emitted. The full dependency list is only present in
    /// `bd show --json`. Default = empty `Vec`. Surfaced as the
    /// `missing field 'dependencies'` ParseError after the M0
    /// label regression was fixed.
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    /// Outgoing edges: issues that depend on THIS one (the
    /// "blocks N" side). `bd show --json` emits these under
    /// the `dependents` key as a list of nested issue objects
    /// (each carries `dependency_type`), while `bd list --json`
    /// omits the field entirely (the summary `dependent_count`
    /// is sufficient for the list view). The R8 E2E spec
    /// (`r8-dep-badges`) needs the detail drawer to surface
    /// the "blocks N" chip for an issue that has zero incoming
    /// blockers — TASK_REFAC is one — so the badge can render
    /// with `dependent_count` derived from this array.
    /// Default = empty `Vec`. Same `Dependency` shape as
    /// `dependencies` (uses the `id` → `dependency_id` alias).
    #[serde(default)]
    pub dependents: Vec<Dependency>,
    /// `#[serde(default)]` because bd v1.0.4's `bd show --json`
    /// output omits `dependency_count` — the field is only present
    /// in `bd list --json`. Default = `0`. The R4 E2E spec needs
    /// the drawer to mount (which fails on `bd show` ParseError
    /// without this default). The R8 E2E spec backfills this from
    /// `dependencies.len()` in `bd_show` (excluding parent-child
    /// edges, mirroring `bd list`'s own count semantics — see
    /// `show_history::bd_show`), so an issue that has no incoming
    /// blockers but blocks others still renders the right chip.
    #[serde(default)]
    pub dependency_count: u32,
    /// `#[serde(default)]` because bd v1.0.4's `bd show --json`
    /// output omits `dependent_count`. Default = `0`. Mirror of
    /// `dependency_count` above.
    #[serde(default)]
    pub dependent_count: u32,
    /// `#[serde(default)]` because bd v1.0.4's `bd show --json`
    /// output omits `comment_count`. Default = `0`. Mirror of
    /// `dependency_count` above.
    #[serde(default)]
    pub comment_count: u32,
    /// `#[serde(default)]` because bd v1.0.4's list output omits
    /// `parent` for issues that aren't children of an epic. Default
    /// = `None`.
    #[serde(default)]
    pub parent: Option<String>,
    /// `#[serde(default)]` because bd v1.0.4's list output omits
    /// `acceptance_criteria` for issues without a defined AC field.
    /// Default = `None`.
    #[serde(default)]
    pub acceptance_criteria: Option<String>,
    /// `#[serde(default)]` because bd v1.0.4's list output omits
    /// `external_ref` for issues without a linked external ticket.
    /// Default = `None`.
    #[serde(default)]
    pub external_ref: Option<String>,
}

#[cfg(test)]
impl Issue {
    /// Build a default `Issue` for unit tests with only `id`, `title`
    /// and `status` overridden. All other fields are filled with the
    /// canonical "Test issue" defaults: `priority: P2`,
    /// `issue_type: Task`, `created_at: Utc::now()`, `updated_at` /
    /// `closed_at` / `description` / `owner` / `parent` /
    /// `acceptance_criteria` / `external_ref` = `None`,
    /// `labels` / `dependencies` / `dependents` = empty, every
    /// `*_count` = 0.
    ///
    /// Replaces the 18-field `Issue { ... }` literal that recurred in
    /// the test helpers of `watcher.rs`, `jsonl.rs` and `gates.rs`
    /// (and — before PR #55 — in `mutations.rs`, `ready_blocked.rs`,
    /// `list.rs`, `search_query.rs`, `show_history.rs`). Tests that
    /// need a field set that diverges from these defaults (custom
    /// `owner`, `dependency_count` etc.) use struct-update syntax on
    /// top of `test_default(...)`:
    ///
    /// ```ignore
    /// Issue {
    ///     dependency_count: 2,
    ///     ..Issue::test_default("beads-1", "Title", ISSUE_STATUS_OPEN.to_string())
    /// }
    /// ```
    ///
    /// Gated `#[cfg(test)]` so the helper never ships in the
    /// production binary — its only purpose is to dedupe test
    /// scaffolding. The companion JSON-side helpers (`SampleIssue`
    /// + `sample_issue_envelope(...)`) live in `beads::test_fixture`;
    /// this one is the Rust-struct-side counterpart.
    pub fn test_default(id: &str, title: &str, status: IssueStatus) -> Self {
        Self {
            id: id.to_string(),
            title: title.to_string(),
            status,
            priority: IssuePriority::P2,
            issue_type: IssueType::Task,
            created_at: chrono::Utc::now(),
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

// ============================================================================
// Dependency Graph (M3 R7)
// ============================================================================
//
// One node per issue + one edge per `Dependency` row from
// `bd list --json`. Sourced from a single `bd list --all --json`
// call so the React `DepGraphView` never has to fan out N `bd show`
// requests just to render the canvas. The shape is intentionally
// minimal — anything the frontend doesn't need (description, owner,
// labels, timestamps) is dropped here so the bridge payload stays
// small even on 500-issue workspaces.
//
// Edge direction follows the bd `Dependency` semantics: each edge
// points FROM the dependent issue TO its dependency (the issue
// being depended on / the upstream blocker). E.g. for
// `MIGRATE blocks OPT`, the edge is `(OPT, MIGRATE, blocks)` —
// OPT depends on MIGRATE. The frontend reverses this for arrow
// rendering if it wants "MIGRATE -> OPT" semantics ("X blocks Y").
//
// Status is included so the frontend can highlight `blocked`
// nodes without a second `bd blocked` round-trip.

/// One node in the dependency graph. Carries just enough for the
/// frontend to render a labelled card and colour it by status /
/// type without another round-trip.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub issue_type: IssueType,
}

/// One directed edge in the dependency graph. `source` is the
/// dependent issue (the one that "needs" `target`); `target` is
/// the issue being depended on. `dep_type` is the raw bd edge
/// kind so the frontend can colour / dash it per type.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub dep_type: DependencyType,
}

/// The full graph payload. `nodes` are de-duplicated by id;
/// `edges` is the multiset of dependency rows from `bd list`
/// (with the source side filled in from the enclosing `Issue`).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beads::test_fixture::SampleIssue;

    #[test]
    fn issue_status_exhaustive_match() {
        // IssueStatus is now a String alias (custom statuses are
        // first-class), so the "exhaustive match" assertion reduces
        // to "the canonical names are distinct". Future builds
        // can add new canonical constants here as bd evolves.
        const BUILTINS: &[&str] = &[
            ISSUE_STATUS_OPEN,
            ISSUE_STATUS_IN_PROGRESS,
            ISSUE_STATUS_BLOCKED,
            ISSUE_STATUS_CLOSED,
            ISSUE_STATUS_DEFERRED,
        ];
        let mut seen = std::collections::HashSet::new();
        for s in BUILTINS {
            assert!(seen.insert(*s), "duplicate canonical name: {s}");
        }
        assert_eq!(seen.len(), 5);
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
        // The canonical v1 names round-trip through serde as bare
        // strings. Custom statuses go through the same path —
        // serialise the string, deserialise it back, get the same
        // string. The test pins the canonical names so a typo
        // here (e.g. "in-progress" vs "in_progress") surfaces
        // before the bridge export does.
        let statuses = [
            ISSUE_STATUS_OPEN,
            ISSUE_STATUS_IN_PROGRESS,
            ISSUE_STATUS_BLOCKED,
            ISSUE_STATUS_CLOSED,
            ISSUE_STATUS_DEFERRED,
        ];
        for status in statuses {
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(json, format!("\"{status}\""));
            let back: IssueStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(back, status);
        }
    }

    /// Custom statuses (anything bd accepts that's not in the
    /// built-in set) round-trip through serde as a bare string —
    /// no struct wrapper, no enum-tag wrapper. This is the
    /// contract the frontend relies on to render unknown values
    /// straight from `bd list --json`.
    #[test]
    fn test_issue_status_custom_roundtrip() {
        let custom = "review";
        let json = serde_json::to_string(custom).unwrap();
        assert_eq!(json, "\"review\"");
        let back: IssueStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, custom);
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

    /// The Tauri command bridge sends `IssuePriority` as the
    /// variant-name string ("P0".."P4") because that's what the
    /// specta-generated TS type advertises. `Deserialize_repr`
    /// rejected the string with "invalid type: string P1, expected
    /// u8" — see r2-filters E2E failure. The custom `Deserialize`
    /// must accept both shapes.
    #[test]
    fn test_issue_priority_deserializes_variant_string() {
        let cases: &[(&str, IssuePriority)] = &[
            ("\"P0\"", IssuePriority::P0),
            ("\"P1\"", IssuePriority::P1),
            ("\"P2\"", IssuePriority::P2),
            ("\"P3\"", IssuePriority::P3),
            ("\"P4\"", IssuePriority::P4),
        ];
        for (json, expected) in cases {
            let back: IssuePriority = serde_json::from_str(json).unwrap();
            assert_eq!(back, *expected, "input was {json}");
        }
    }

    /// And it must keep accepting the bare integer for the JSONL
    /// files on disk and any tests that exercise the integer path.
    #[test]
    fn test_issue_priority_deserializes_bare_integer() {
        let cases: &[(u8, IssuePriority)] = &[
            (0, IssuePriority::P0),
            (1, IssuePriority::P1),
            (2, IssuePriority::P2),
            (3, IssuePriority::P3),
            (4, IssuePriority::P4),
        ];
        for (n, expected) in cases {
            let json = n.to_string();
            let back: IssuePriority = serde_json::from_str(&json).unwrap();
            assert_eq!(back, *expected, "input was {json}");
        }
    }

    /// Out-of-range values must be rejected so a malformed
    /// frontend payload (e.g. "P7" from a future migration)
    /// surfaces as a parse error rather than silently mapping to
    /// the catch-all `Number.MAX_SAFE_INTEGER` the comparator uses
    /// for unknown buckets.
    #[test]
    fn test_issue_priority_rejects_out_of_range() {
        assert!(serde_json::from_str::<IssuePriority>("5").is_err());
        assert!(serde_json::from_str::<IssuePriority>("\"P7\"").is_err());
        assert!(serde_json::from_str::<IssuePriority>("\"banana\"").is_err());
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
            status: ISSUE_STATUS_OPEN.to_string(),
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
            dependents: vec![Dependency {
                dependency_id: "beads-pqr".to_string(),
                dependency_type: DependencyType::Blocks,
                blocked_by: Some(false),
            }],
            dependency_count: 1,
            dependent_count: 1,
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
        let json = SampleIssue {
            priority: 1,
            labels: serde_json::json!(["security", "auth"]),
            ..SampleIssue::new("beads-1", "x")
        }
        .to_json_string();
        let issue: Issue = serde_json::from_str(&json).expect("string labels should parse");
        assert_eq!(issue.labels.len(), 2);
        assert_eq!(issue.labels[0].name, "security");
        assert_eq!(issue.labels[1].name, "auth");
        assert!(issue.labels.iter().all(|l| l.color.is_none()));
    }

    /// Regression: bd v1.0.4's `bd list --json` emits each
    /// dependency entry as `{ issue_id, depends_on_id, type, ... }`,
    /// but the Rust `Dependency` struct (and the TS contract behind
    /// it — `DependencyTreeView.tsx`) uses
    /// `{ dependency_id, dependency_type, blocked_by }`. Without
    /// the field aliases + `parent-child` enum alias added in this
    /// file, parsing fails with
    /// `missing field 'dependency_id'` /
    /// `unknown variant 'parent-child', expected 'parent_child'`.
    /// This test pins both shapes so neither can regress.
    #[test]
    fn test_dependency_accepts_bd_and_rust_shapes() {
        // bd's shape: { issue_id, depends_on_id, type, created_at, ... }
        let bd_shape = r#"{
            "issue_id": "fx-qwt.2",
            "depends_on_id": "fx-fiv",
            "type": "blocks",
            "created_at": "2026-06-23T19:36:31Z",
            "created_by": "Hermes Worker",
            "metadata": "{}"
        }"#;
        let d: Dependency =
            serde_json::from_str(bd_shape).expect("bd dependency shape should parse");
        assert_eq!(d.dependency_id, "fx-fiv");
        assert_eq!(d.dependency_type, DependencyType::Blocks);
        assert_eq!(d.blocked_by, None); // default

        // bd's `parent-child` (kebab) -> Rust's ParentChild (snake).
        let bd_parent_child = r#"{
            "issue_id": "fx-qwt.2",
            "depends_on_id": "fx-qwt",
            "type": "parent-child",
            "created_at": "2026-06-23T19:36:18Z",
            "created_by": "Hermes Worker",
            "metadata": "{}"
        }"#;
        let d: Dependency =
            serde_json::from_str(bd_parent_child).expect("parent-child should parse");
        assert_eq!(d.dependency_type, DependencyType::ParentChild);

        // Rust's shape (the one the frontend sends back) still works.
        let rust_shape = r#"{
            "dependency_id": "fx-fiv",
            "dependency_type": "blocks",
            "blocked_by": true
        }"#;
        let d: Dependency =
            serde_json::from_str(rust_shape).expect("rust dependency shape should parse");
        assert_eq!(d.dependency_id, "fx-fiv");
        assert_eq!(d.dependency_type, DependencyType::Blocks);
        assert_eq!(d.blocked_by, Some(true));

        // Serialization stays in the rust/TS shape (snake_case).
        let serialized = serde_json::to_string(&Dependency {
            dependency_id: "x".to_string(),
            dependency_type: DependencyType::ParentChild,
            blocked_by: None,
        })
        .unwrap();
        assert_eq!(
            serialized,
            r#"{"dependency_id":"x","dependency_type":"parent_child","blocked_by":null}"#
        );
    }

    /// Regression: a `bd list --json` envelope captured from a real
    /// `scripts/make-fixture.sh` workspace (bd v1.0.4, with
    /// `BD_JSON_ENVELOPE=1` set by `runner::build_bd_command`).
    /// Captured via:
    ///
    ///   bash scripts/make-fixture.sh /tmp/fx
    ///   (cd /tmp/fx && BD_JSON_ENVELOPE=1 bd list --json)
    ///
    /// Pins down three real-world regressions the M0 E2E smoke
    /// surfaced and we fixed:
    ///
    /// 1. **Labels as bare strings.** bd emits
    ///    `"labels": ["security"]` instead of `[{name, color}]`.
    ///    Custom `Deserialize` on `Label` (above) accepts both.
    /// 2. **Optional Issue fields absent.** bd omits `closed_at`,
    ///    `description`, `dependencies`, `parent`,
    ///    `acceptance_criteria`, `external_ref`. `#[serde(default)]`
    ///    on those fields makes them optional.
    /// 3. **Dependency shape mismatch.** bd emits
    ///    `{ issue_id, depends_on_id, type, created_at, ... }`,
    ///    the Rust struct expects
    ///    `{ dependency_id, dependency_type, blocked_by }`. Field
    ///    aliases on `Dependency` accept both shapes.
    #[test]
    fn test_real_bd_list_envelope_with_string_labels_parses() {
        // Real envelope captured from `bd list --json` against the
        // fixture at /tmp/fx on bd v1.0.4. Three issues:
        //   - "fx-de2" / "fx-si4" / "fx-fiv" : no dependencies,
        //     exercise the label + missing-fields path.
        //   - "fx-qwt.2" (Optimize queries): has TWO real bd-shaped
        //     dependencies (one `blocks`, one `parent-child`),
        //     exercising the dependency-field aliases.
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
    },
    {
      "id": "fx-qwt.2",
      "title": "Optimize queries",
      "status": "blocked",
      "priority": 1,
      "issue_type": "task",
      "owner": "fabian.baumgartner@dynasoft.ch",
      "created_at": "2026-06-23T19:36:18Z",
      "created_by": "Hermes Worker",
      "updated_at": "2026-06-23T19:36:33Z",
      "labels": ["backend", "epic", "perf", "performance"],
      "dependencies": [
        {
          "issue_id": "fx-qwt.2",
          "depends_on_id": "fx-fiv",
          "type": "blocks",
          "created_at": "2026-06-23T19:36:31Z",
          "created_by": "Hermes Worker",
          "metadata": "{}"
        },
        {
          "issue_id": "fx-qwt.2",
          "depends_on_id": "fx-qwt",
          "type": "parent-child",
          "created_at": "2026-06-23T19:36:18Z",
          "created_by": "Hermes Worker",
          "metadata": "{}"
        }
      ],
      "dependency_count": 1,
      "dependent_count": 1,
      "comment_count": 0,
      "parent": "fx-qwt"
    }
  ]
}"#;

        // Step 1: the envelope must parse as a Value with a `data`
        // array — this is the same shape the runner hands to
        // `envelope::extract`.
        let envelope: serde_json::Value =
            serde_json::from_str(envelope_json).expect("envelope is valid JSON");
        let data = envelope
            .get("data")
            .and_then(|v| v.as_array())
            .expect("envelope has a data array");
        assert_eq!(data.len(), 3);

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

        // Step 3: the full `Vec<Issue>` parses directly from the
        // real bd payload — no padding required. `Issue`'s optional
        // / Vec fields carry `#[serde(default)]` (see the field
        // docs in this file) so bd's truncated schema (it omits
        // `closed_at`, `description`, `dependencies`, `parent`,
        // `acceptance_criteria`, `external_ref` for list output)
        // tolerates the missing fields. Before this fix, the parse
        // failed with `missing field 'dependencies'`.
        let issues: Vec<Issue> = serde_json::from_value(serde_json::Value::Array(data.to_vec()))
            .expect("real bd list payload should parse end-to-end as Vec<Issue>");
        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].id, "fx-de2");
        assert_eq!(issues[0].labels.len(), 1);
        assert_eq!(issues[0].labels[0].name, "security");
        // Defaults applied via `#[serde(default)]`:
        assert_eq!(issues[0].closed_at, None);
        assert_eq!(issues[0].description, None);
        assert!(issues[0].dependencies.is_empty());
        assert_eq!(issues[0].parent, None);
        assert_eq!(issues[0].acceptance_criteria, None);
        assert_eq!(issues[0].external_ref, None);
        assert_eq!(issues[1].id, "fx-si4");
        assert_eq!(issues[1].labels[0].name, "testing");
        assert!(issues[1].dependencies.is_empty());

        // Step 4: the issue with `dependencies` parses too, with
        // bd's `{issue_id, depends_on_id, type, ...}` shape mapped
        // onto the Rust struct's `{dependency_id, dependency_type,
        // blocked_by}` via serde aliases. Before this fix, the parse
        // failed with `missing field 'dependency_id'`.
        let opt_queries = &issues[2];
        assert_eq!(opt_queries.id, "fx-qwt.2");
        assert_eq!(opt_queries.parent.as_deref(), Some("fx-qwt"));
        assert_eq!(opt_queries.dependencies.len(), 2);
        // bd's `depends_on_id` -> Rust's `dependency_id`.
        assert_eq!(opt_queries.dependencies[0].dependency_id, "fx-fiv");
        // bd's `type: "blocks"` -> Rust's `dependency_type: Blocks`.
        assert_eq!(
            opt_queries.dependencies[0].dependency_type,
            DependencyType::Blocks
        );
        // bd omits `blocked_by` -> Rust default None.
        assert_eq!(opt_queries.dependencies[0].blocked_by, None);
        assert_eq!(opt_queries.dependencies[1].dependency_id, "fx-qwt");
        assert_eq!(
            opt_queries.dependencies[1].dependency_type,
            DependencyType::ParentChild
        );
    }

    /// `bd list --json` (with `BD_JSON_ENVELOPE=1`) OMITS the `labels`
    /// field entirely for issues that have no labels attached — it
    /// doesn't emit `"labels": []`, the key is simply absent. The M4
    /// R9 E2E spec's `make-second-fixture.sh` creates five label-less
    /// issues, so without `#[serde(default)]` on `Issue.labels` the
    /// `bd_list` command surfaced
    /// `ParseError("failed to parse from 'data' field: missing field 'labels'")`
    /// and the workspace switcher's reload timed out.
    ///
    /// Captured envelope: a single-issue fixture (M4 second
    /// workspace, bd v1.0.4) with no `labels` key on the issue.
    /// Before the fix this test failed with
    /// `Err("missing field 'labels'")`; after the fix the issue
    /// parses with `labels == Vec::new()`.
    #[test]
    fn test_real_bd_list_envelope_without_labels_field_parses() {
        // Real envelope captured from `bd list --all --json` against
        // /tmp/bd-test on bd v1.0.4 (a freshly-init'd repo with one
        // task and no `--labels` flag). The issue object has NO
        // `labels` key at all — bd's CLI never sets it for issues
        // with no label attachments.
        let envelope_json = r#"{
  "data": [
    {
      "id": "bd-test-bdz",
      "title": "no labels here",
      "status": "open",
      "priority": 2,
      "issue_type": "task",
      "owner": "fabian.baumgartner@dynasoft.ch",
      "created_at": "2026-06-25T09:06:46Z",
      "created_by": "Hermes Worker",
      "updated_at": "2026-06-25T09:06:46Z",
      "dependency_count": 0,
      "dependent_count": 0,
      "comment_count": 0
    }
  ],
  "schema_version": 1
}"#;

        // Same envelope shape the runner hands to `envelope::extract`.
        let envelope: serde_json::Value =
            serde_json::from_str(envelope_json).expect("envelope is valid JSON");
        let data = envelope
            .get("data")
            .and_then(|v| v.as_array())
            .expect("envelope has a data array");
        assert_eq!(data.len(), 1);

        // The regression: parsing the issue with `Issue`'s
        // deserialize impl used to fail with
        // `Err("missing field 'labels'")`. With `#[serde(default)]`
        // on `Issue.labels`, the issue parses and `labels` is empty.
        let issues: Vec<Issue> = serde_json::from_value(serde_json::Value::Array(data.clone()))
            .expect("bd list payload without 'labels' key should parse as Vec<Issue>");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "bd-test-bdz");
        assert_eq!(issues[0].title, "no labels here");
        assert!(
            issues[0].labels.is_empty(),
            "missing 'labels' field should default to empty Vec, got {:?}",
            issues[0].labels
        );
    }
}
