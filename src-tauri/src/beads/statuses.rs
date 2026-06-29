//! `bd statuses --json` with structured output for the GUI.
//!
//! Beads supports user-defined custom statuses via
//! `bd config set status.custom "name:category,..."` (per the
//! project constitution, see `docs/CONSTITUTION.md §3`). The CLI
//! emits a `{ schema_version, built_in_statuses, custom_statuses }`
//! envelope (when `BD_JSON_ENVELOPE=1` is NOT set) or wraps it in
//! `{ schema_version, data: { ... } }` (when the runner does set
//! the env var — see `runner::build_bd_command`). Every entry
//! carries `{ name, category, [icon, description] }`. We surface
//! the merged catalog to the frontend so the sidebar filter chips,
//! the inline-edit dropdown, and the update panel all read from
//! the same authoritative set — no hardcoded 5-status arrays
//! survive past this command.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::beads::{runner, BdError, BdResult};

/// One row of the `bd statuses --json` response — built-in or custom.
///
/// The CLI (1.0.5+) emits `{ name, category, icon?, description? }`.
/// `icon` and `description` are optional because the custom-status
/// path on some CLI builds only returns `{ name, category }`. We
/// keep both as `Option<String>` so a missing field deserialises
/// cleanly without forcing the mapper to invent a value.
///
/// This is the *internal* mapper type — kept separate from
/// [`StatusMeta`] so the wire format can evolve without churning
/// the public TS contract. Frontend consumers only ever see the
/// merged [`StatusMeta`] / [`StatusCatalog`] shapes below.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct RawStatusMeta {
    name: String,
    category: String,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

/// The full `bd statuses --json` envelope.
///
/// `schema_version` is reserved for the contract-version check the
/// constitution calls for (`check_schema_version` exists for exactly
/// this); we parse it but don't gate on it yet because bd 1.0.5
/// returns `1` for every supported shape and the M6 plan doesn't
/// ship a v2 envelope yet. When a real v2 lands, the mapper can
/// branch on `schema_version`.
#[derive(Debug, Clone, Deserialize)]
struct RawStatusesEnvelope {
    #[serde(default)]
    #[allow(dead_code)] // reserved for future v2 contract-version checks
    schema_version: Option<u32>,
    #[serde(default)]
    built_in_statuses: Vec<RawStatusMeta>,
    #[serde(default)]
    custom_statuses: Vec<RawStatusMeta>,
}

/// One status the frontend renders — merged across the built-in and
/// custom halves of the catalog. `is_builtin` lets the UI render
/// built-ins with their canonical palette + i18n key while custom
/// statuses fall back to a neutral style + raw label.
///
/// `category` is the bd taxonomy (`active`, `wip`, `frozen`,
/// `done`) — surfaced verbatim to the frontend so a future
/// palette variant can key off it (e.g. tint frozen statuses with
/// a frost-blue).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StatusMeta {
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub is_builtin: bool,
}

/// The merged catalog. `builtin` keeps the CLI's lifecycle order
/// (open → in_progress → blocked → deferred → closed → pinned →
/// hooked) and `custom` is appended alphabetically by `name` so
/// the frontend renders a deterministic order without re-sorting.
///
/// `status_names` is the flat ordered list — every status the user
/// can pick from — produced by concatenating `builtin + custom`.
/// The frontend's `<select>` / sidebar chip row iterate over this
/// directly; the `KNOWN_STATUS_ORDER` arrays previously sprinkled
/// across components are replaced by reading this list.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StatusCatalog {
    pub builtin: Vec<StatusMeta>,
    pub custom: Vec<StatusMeta>,
    pub status_names: Vec<String>,
}

/// Run `bd statuses --json` in `cwd` and return the merged catalog.
///
/// Beads has no dedicated `--cwd` arg — the CLI auto-discovers
/// `.beads/` from the working directory. We hand it the repo path
/// directly (per the constitution's "bd is the single source of
/// truth" rule) so a multi-workspace switcher's `cwd` propagates
/// to the catalog query without each component re-deriving it.
#[tauri::command]
#[specta::specta]
pub async fn bd_statuses(cwd: String) -> BdResult<StatusCatalog> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["statuses", "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    parse_statuses_envelope(value)
}

/// Parse the CLI envelope into a [`StatusCatalog`].
///
/// Defensive: a missing `built_in_statuses` / `custom_statuses`
/// field is treated as an empty Vec (not a ParseError) because
/// older bd CLI builds may not emit both keys — the existing
/// `serde(default)` on the envelope keeps the parse permissive.
///
/// ## Two envelope shapes we have to accept
///
/// 1. **Wrapped** (the one the runner produces on bd >= 1.0.4):
///    `runner::build_bd_command` sets `BD_JSON_ENVELOPE=1`, so the
///    CLI returns `{ schema_version, data: { built_in_statuses,
///    custom_statuses, schema_version? } }`. Without the `data`
///    unwrap the deserialiser would read the top-level object,
///    find no `built_in_statuses` / `custom_statuses` keys, and
///    fall back to two empty Vecs — the symptom is a sidebar
///    with zero status chips even though `bd statuses --json`
///    clearly returned 7 built-ins (CI run 28218119962, 2026-06-26).
///    This is the same envelope shape `bd_list`, `bd_label_list_all`,
///    and `bd_assignee_list_all` already unwrap via
///    `search_query::extract_data` / `value.get("data")` — see
///    those commands for the analogous fixes.
/// 2. **Unwrapped** (older / envelope-disabled builds): the bare
///    `{ built_in_statuses, custom_statuses, schema_version? }`
///    object. The existing tests in this file exercise this shape
///    directly, so we must keep accepting it for unit-level
///    fidelity.
///
/// The CLI may also emit the bare-array shape on some 1.0.5 builds
/// (rare but observed). The fallback branch accepts that as a
/// list of `RawStatusMeta` and treats them as built-in for parity
/// with the existing label-list path.
pub fn parse_statuses_envelope(value: serde_json::Value) -> BdResult<StatusCatalog> {
    // ponytail: the runner sets BD_JSON_ENVELOPE=1, so the CLI
    // returns the payload wrapped in `{ schema_version, data: ... }`.
    // Peel the wrapper when present so the rest of the function can
    // operate on the unwrapped shape. A `data` field that isn't an
    // object is treated as missing (older CLI versions may have
    // emitted a different top-level shape we don't recognise).
    let value = match value.get("data") {
        Some(inner) if inner.is_object() => inner.clone(),
        _ => value,
    };

    let envelope: RawStatusesEnvelope = if value.is_object() {
        serde_json::from_value(value).map_err(|e| BdError::ParseError {
            message: format!("bd statuses envelope: {e}"),
        })?
    } else if value.is_array() {
        // Bare-array fallback — treat the array as the built-in half.
        let rows: Vec<RawStatusMeta> =
            serde_json::from_value(value).map_err(|e| BdError::ParseError {
                message: format!("bd statuses bare array: {e}"),
            })?;
        RawStatusesEnvelope {
            schema_version: None,
            built_in_statuses: rows,
            custom_statuses: Vec::new(),
        }
    } else {
        return Err(BdError::ParseError {
            message: format!("bd statuses: unexpected JSON shape: {value}"),
        });
    };

    let builtin: Vec<StatusMeta> = envelope
        .built_in_statuses
        .into_iter()
        .map(|m| StatusMeta {
            name: m.name,
            category: m.category,
            icon: m.icon,
            description: m.description,
            is_builtin: true,
        })
        .collect();

    let mut custom: Vec<StatusMeta> = envelope
        .custom_statuses
        .into_iter()
        .map(|m| StatusMeta {
            name: m.name,
            category: m.category,
            icon: m.icon,
            description: m.description,
            is_builtin: false,
        })
        .collect();

    // Defensive: deduplicate by name. A misconfigured workspace can
    // have the same status in both halves (e.g. someone re-adds a
    // built-in as a custom via `bd config set`). The catalog should
    // surface each name exactly once — keep the built-in copy (it's
    // the one with an icon + i18n key the UI knows how to style).
    let builtin_names: Vec<String> = builtin.iter().map(|b| b.name.clone()).collect();
    custom.retain(|c| !builtin_names.contains(&c.name));

    // Custom statuses appended alphabetically so the UI's render
    // order is deterministic without a client-side sort.
    custom.sort_by(|a, b| a.name.cmp(&b.name));

    let status_names: Vec<String> = builtin
        .iter()
        .chain(custom.iter())
        .map(|m| m.name.clone())
        .collect();

    Ok(StatusCatalog {
        builtin,
        custom,
        status_names,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The contract: the canonical envelope shape from `bd
    /// statuses --json` (built-ins first, customs appended) parses
    /// into a catalog where every name is preserved, the
    /// `is_builtin` flag is set correctly, and the merged
    /// `status_names` list is in CLI-emission order.
    #[test]
    fn parses_standard_envelope() {
        let value = json!({
            "schema_version": 1,
            "built_in_statuses": [
                {"name": "open", "category": "active", "icon": "○", "description": "Available"},
                {"name": "closed", "category": "done", "icon": "✓", "description": "Done"}
            ],
            "custom_statuses": [
                {"name": "review", "category": "wip"},
                {"name": "on_hold", "category": "frozen"}
            ]
        });
        let catalog = parse_statuses_envelope(value).expect("parses");
        assert_eq!(catalog.builtin.len(), 2);
        assert!(catalog.builtin.iter().all(|s| s.is_builtin));
        assert_eq!(catalog.custom.len(), 2);
        assert!(catalog.custom.iter().all(|s| !s.is_builtin));
        assert_eq!(
            catalog.status_names,
            vec!["open", "closed", "on_hold", "review"],
            "custom appended alphabetically (on_hold before review)"
        );
    }

    /// The wrapped envelope shape the runner actually produces on
    /// bd >= 1.0.4: `{ schema_version, data: { built_in_statuses,
    /// custom_statuses, schema_version? } }`. The CI e2e fixtures
    /// exercise this path (the runner sets BD_JSON_ENVELOPE=1
    /// unconditionally). Before the fix this returned a catalog
    /// with `status_names: []` because the deserialiser read the
    /// top-level object and found no built-in / custom keys,
    /// defaulting both to empty Vecs. The sidebar then rendered
    /// zero status chips and every chip-related assertion timed
    /// out. Verified against `bd 1.0.4` (ce242a879) on 2026-06-29.
    #[test]
    fn parses_wrapped_envelope_with_data_field() {
        let value = json!({
            "schema_version": 1,
            "data": {
                "built_in_statuses": [
                    {"name": "open", "category": "active", "icon": "○", "description": "Available"},
                    {"name": "in_progress", "category": "wip", "icon": "◐", "description": "WIP"},
                    {"name": "closed", "category": "done", "icon": "✓", "description": "Done"}
                ],
                "custom_statuses": [
                    {"name": "review", "category": "wip"}
                ]
            }
        });
        let catalog = parse_statuses_envelope(value).expect("parses wrapped envelope");
        assert_eq!(
            catalog.builtin.len(),
            3,
            "all built-ins parsed through the data wrapper"
        );
        assert_eq!(catalog.custom.len(), 1);
        assert!(catalog.custom.iter().all(|s| !s.is_builtin));
        assert_eq!(
            catalog.status_names,
            vec!["open", "in_progress", "closed", "review"],
            "custom appended alphabetically after built-ins"
        );
    }

    /// The exact envelope shape CI e2e fixtures produce (bd 1.0.4
    /// with BD_JSON_ENVELOPE=1). The CLI doesn't always emit a
    /// `custom_statuses` key when no customs are configured — the
    /// inner defaulting has to handle that too. The status names
    /// must surface all 7 built-ins the CLI ships.
    #[test]
    fn parses_wrapped_envelope_missing_custom_statuses_key() {
        let value = json!({
            "schema_version": 1,
            "data": {
                "built_in_statuses": [
                    {"name": "open", "category": "active"},
                    {"name": "in_progress", "category": "wip"},
                    {"name": "blocked", "category": "wip"},
                    {"name": "deferred", "category": "frozen"},
                    {"name": "closed", "category": "done"},
                    {"name": "pinned", "category": "frozen"},
                    {"name": "hooked", "category": "wip"}
                ]
            }
        });
        let catalog =
            parse_statuses_envelope(value).expect("parses wrapped envelope with no custom key");
        assert_eq!(
            catalog.builtin.len(),
            7,
            "all seven bd 1.0.4 built-ins surface"
        );
        assert_eq!(catalog.custom.len(), 0);
        assert_eq!(catalog.status_names.len(), 7);
        assert_eq!(catalog.status_names[0], "open");
        assert_eq!(catalog.status_names[6], "hooked");
    }

    /// Older CLI builds emit a bare array — treat that as the
    /// built-in half so the catalog still loads.
    #[test]
    fn parses_bare_array_as_builtin() {
        let value = json!([
            {"name": "open", "category": "active"},
            {"name": "in_progress", "category": "wip"}
        ]);
        let catalog = parse_statuses_envelope(value).expect("parses");
        assert_eq!(catalog.builtin.len(), 2);
        assert_eq!(catalog.custom.len(), 0);
        assert_eq!(catalog.status_names, vec!["open", "in_progress"]);
    }

    /// When a custom status collides with a built-in (e.g. someone
    /// re-adds "open" via `bd config set status.custom`), keep the
    /// built-in copy. The dedup guarantees the UI never renders
    /// the same chip twice.
    #[test]
    fn dedup_collisions_prefer_builtin() {
        let value = json!({
            "built_in_statuses": [
                {"name": "open", "category": "active", "icon": "○"}
            ],
            "custom_statuses": [
                {"name": "open", "category": "wip"}
            ]
        });
        let catalog = parse_statuses_envelope(value).expect("parses");
        assert_eq!(catalog.status_names, vec!["open"]);
        assert_eq!(catalog.builtin.len(), 1);
        assert_eq!(catalog.custom.len(), 0);
    }

    /// Missing `custom_statuses` key — older builds may omit it
    /// when no customs are configured. The `serde(default)` on the
    /// envelope turns that into an empty Vec without an error.
    #[test]
    fn missing_custom_field_is_empty() {
        let value = json!({
            "built_in_statuses": [
                {"name": "open", "category": "active"}
            ]
        });
        let catalog = parse_statuses_envelope(value).expect("parses");
        assert_eq!(catalog.custom.len(), 0);
        assert_eq!(catalog.status_names, vec!["open"]);
    }

    /// Empty built-in list with customs is allowed — a workspace
    /// that re-defined every status via `bd config set` should
    /// still load.
    #[test]
    fn empty_builtin_with_customs() {
        let value = json!({
            "custom_statuses": [
                {"name": "review", "category": "wip"}
            ]
        });
        let catalog = parse_statuses_envelope(value).expect("parses");
        assert_eq!(catalog.builtin.len(), 0);
        assert_eq!(catalog.custom.len(), 1);
        assert_eq!(catalog.status_names, vec!["review"]);
    }

    /// An unexpected JSON shape (string, number, null) surfaces as
    /// a typed `ParseError` so the frontend renders an explicit
    /// error state instead of an empty catalog.
    #[test]
    fn unexpected_shape_is_parse_error() {
        let value = json!("not a valid envelope");
        assert!(parse_statuses_envelope(value).is_err());
    }
}
