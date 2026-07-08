//! Integration tests for `scripts/make-fixture.sh`.
//!
//! Runs the fixture script in a temp dir, then loads the resulting Beads
//! workspace via `runner::run_bd` and asserts the seeded shape satisfies
//! the M0 spec (R2):
//!   - >=20 issues across ALL statuses
//!   - >=2 epics with parent-child children
//!   - >=3 dependency edges incl. one blocked chain
//!   - several labels
//!   - at least one `bd ready` item and one blocked item
//!
//! **Why not go through `Issue` / `Dependency` structs?**
//! The CLI's per-dependency JSON shape (`{issue_id, depends_on_id, type,
//! metadata, ...}`) is parsed into `Vec<Issue>` via `envelope::extract_issues`
//! at the production boundary, but the Rust `Dependency` struct fields
//! (`dependency_id`, `dependency_type`, `blocked_by`) don't line up with
//! that shape. That's a pre-existing structural mismatch — out of scope
//! for the M0 fixture card. These tests walk the JSON `Value` directly so
//! they don't depend on the struct alignment, and so they keep proving
//! the fixture's correctness regardless of when the struct gets fixed.
//!
//! ID contract: see the header comment in `scripts/make-fixture.sh` —
//! Beads hashes IDs from a per-repo random component, so they are NOT
//! stable across invocations. The script writes the canonical role->ID
//! mapping to `<target>/.fixture-ids.json`; the tests load that file to
//! look up the IDs they need to assert against.

use serde_json::Value;
use tempfile::TempDir;

// Integration tests in `tests/` are their own crate; reach the lib
// via its package name (`tauri_app_lib`, see `[lib] name = ...` in
// Cargo.toml) instead of `crate::`, which would refer to the test
// crate's empty root. The lib re-exports `runner` under
// `beads_export_for_tests` so we don't have to widen `beads` from
// private to public just for tests.
use tauri_app_lib::beads_export_for_tests::runner;

// Shared setup helpers (`skip_if_no_bd`, `script_path`,
// `run_fixture`, `load_ids`) live in `tests/common` and are
// shared with `graph.rs` so the two integration-test crates
// don't drift out of sync. `bd_json_array` and
// `fixture_envelope` stay here because `graph.rs` does not
// need them.
mod common;

/// Run `bd <args> --json` against `fixture_dir` via the production
/// runner (so the test exercises the same env, envelope, and timeout
/// handling as real frontend calls). Returns the `data` array from
/// the `{schema_version, data}` envelope.
async fn bd_json_array(fixture_dir: &std::path::Path, args: &[&str]) -> Vec<Value> {
    let mut argv: Vec<&str> = args.to_vec();
    argv.push("--json");
    let output = runner::run_bd(&argv, fixture_dir)
        .await
        .expect("bd call should succeed");
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            panic!("expected JSON envelope, got text: {value}");
        }
    };
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .expect("envelope has `data` array");
    data.clone()
}

/// Walk the fixture once via `bd list --all`, returning a JSON `Value`
/// copy of the envelope so multiple assertions can re-use it without
/// re-spawning `bd`.
async fn fixture_envelope(fixture_dir: &std::path::Path) -> Value {
    let mut argv: Vec<&str> = vec!["list", "--all"];
    argv.push("--json");
    let output = runner::run_bd(&argv, fixture_dir)
        .await
        .expect("bd list --all --json");
    match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            panic!("expected JSON envelope, got text: {value}");
        }
    }
}

#[tokio::test]
async fn fixture_seeds_25_issues_with_all_statuses() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);

    let data = bd_json_array(&fixture_dir, &["list", "--all"]).await;
    assert_eq!(data.len(), 25, "fixture must seed exactly 25 issues");

    // M0 R2: must cover all 5 statuses (open/in_progress/blocked/
    // deferred/closed). Counts are documented in scripts/make-fixture.sh.
    let mut by_status = std::collections::BTreeMap::<String, usize>::new();
    for issue in &data {
        let status = issue
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("?")
            .to_string();
        *by_status.entry(status).or_insert(0) += 1;
    }
    for required in ["open", "in_progress", "blocked", "deferred", "closed"] {
        assert!(
            by_status.contains_key(required),
            "fixture missing status `{required}`; got {by_status:?}"
        );
    }
    assert_eq!(by_status["closed"], 8, "closed count per script");
    assert_eq!(by_status["in_progress"], 3, "in_progress count per script");
    assert_eq!(by_status["blocked"], 2, "blocked count per script");
    assert_eq!(by_status["deferred"], 2, "deferred count per script");
    assert_eq!(by_status["open"], 10, "open count per script");
}

#[tokio::test]
async fn fixture_has_two_epics_with_parent_child_children() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);
    let ids = common::load_ids(&fixture_dir);

    let data = bd_json_array(&fixture_dir, &["list", "--all"]).await;

    let epics: Vec<&Value> = data
        .iter()
        .filter(|i| i.get("issue_type").and_then(Value::as_str) == Some("epic"))
        .collect();
    assert_eq!(epics.len(), 2, "fixture must have exactly 2 epics");
    for epic in &epics {
        let epic_id = epic.get("id").and_then(Value::as_str).expect("epic has id");
        let children: Vec<&Value> = data
            .iter()
            .filter(|i| i.get("parent").and_then(Value::as_str) == Some(epic_id))
            .collect();
        assert!(
            !children.is_empty(),
            "epic {epic_id} has no parent-child children in the fixture"
        );
    }

    // The two epics we expected -- looked up by role, not by id.
    let epic_auth_id = ids
        .get("EPIC_AUTH")
        .and_then(Value::as_str)
        .expect("EPIC_AUTH in ids map");
    let epic_perf_id = ids
        .get("EPIC_PERF")
        .and_then(Value::as_str)
        .expect("EPIC_PERF in ids map");
    assert!(
        epics
            .iter()
            .any(|e| e.get("id").and_then(Value::as_str) == Some(epic_auth_id)),
        "EPIC_AUTH ({epic_auth_id}) missing from bd list"
    );
    assert!(
        epics
            .iter()
            .any(|e| e.get("id").and_then(Value::as_str) == Some(epic_perf_id)),
        "EPIC_PERF ({epic_perf_id}) missing from bd list"
    );

    // EPIC_AUTH must own the Login form child by parent-child.
    let login_id = ids
        .get("TASK_LOGIN")
        .and_then(Value::as_str)
        .expect("TASK_LOGIN in ids map");
    let login = data
        .iter()
        .find(|i| i.get("id").and_then(Value::as_str) == Some(login_id))
        .expect("Login form in list");
    assert_eq!(
        login.get("parent").and_then(Value::as_str),
        Some(epic_auth_id),
        "Login form must parent-child to EPIC_AUTH"
    );
}

#[tokio::test]
async fn fixture_has_blocked_chain_dependency() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);
    let ids = common::load_ids(&fixture_dir);

    // The fixture creates a 2-hop blocks chain MIGRATE -> OPT -> CACHE.
    // OPT itself is also status=blocked, so it shows up in `bd blocked`
    // AND CACHE shows up there too because OPT blocks it.
    let migrate_id = ids
        .get("TASK_MIGRATE")
        .and_then(Value::as_str)
        .expect("TASK_MIGRATE in ids map");
    let opt_id = ids
        .get("TASK_OPT")
        .and_then(Value::as_str)
        .expect("TASK_OPT in ids map");
    let cache_id = ids
        .get("TASK_CACHE")
        .and_then(Value::as_str)
        .expect("TASK_CACHE in ids map");

    let data = bd_json_array(&fixture_dir, &["list", "--all"]).await;
    let issues_by_id: std::collections::HashMap<&str, &Value> = data
        .iter()
        .filter_map(|i| i.get("id").and_then(Value::as_str).map(|s| (s, i)))
        .collect();

    // OPT must be blocked by MIGRATE.
    let opt = issues_by_id.get(opt_id).expect("OPT in list");
    let opt_blocks: Vec<&Value> = opt
        .get("dependencies")
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    let migrate_block = opt_blocks.iter().find(|d| {
        d.get("depends_on_id").and_then(Value::as_str) == Some(migrate_id)
            && d.get("type").and_then(Value::as_str) == Some("blocks")
    });
    assert!(
        migrate_block.is_some(),
        "OPT must depend on MIGRATE via `blocks`; deps were {opt_blocks:?}"
    );

    // CACHE must be blocked by OPT.
    let cache = issues_by_id.get(cache_id).expect("CACHE in list");
    let cache_blocks: Vec<&Value> = cache
        .get("dependencies")
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    let opt_block = cache_blocks.iter().find(|d| {
        d.get("depends_on_id").and_then(Value::as_str) == Some(opt_id)
            && d.get("type").and_then(Value::as_str) == Some("blocks")
    });
    assert!(
        opt_block.is_some(),
        "CACHE must depend on OPT via `blocks`; deps were {cache_blocks:?}"
    );
}

#[tokio::test]
async fn fixture_has_at_least_three_dependency_edges_total() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);
    let envelope = fixture_envelope(&fixture_dir).await;
    let data = envelope
        .get("data")
        .and_then(Value::as_array)
        .expect("data");

    let total_edges: usize = data
        .iter()
        .map(|i| {
            i.get("dependencies")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0)
        })
        .sum();
    // 5 parent-child (3 in EPIC_AUTH + 2 in EPIC_PERF) + 5 explicit
    // blocks (MIGRATE->OPT, OPT->CACHE, LOGIN->REFAC, BUG1->INV,
    // LOGIN->OAUTH) = 10 edges. Spec requires >=3; assert >=3 AND the
    // documented total so we catch silent regressions in the seed.
    assert!(
        total_edges >= 3,
        "fixture must have >=3 dependency edges, got {total_edges}"
    );
    assert_eq!(
        total_edges, 10,
        "fixture edge count changed; update this assertion (was 10)"
    );
}

#[tokio::test]
async fn fixture_has_several_labels() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);
    let data = bd_json_array(&fixture_dir, &["list", "--all"]).await;

    let mut labels = std::collections::BTreeSet::<String>::new();
    for issue in &data {
        if let Some(arr) = issue.get("labels").and_then(Value::as_array) {
            for l in arr {
                if let Some(name) = l.as_str() {
                    labels.insert(name.to_string());
                }
            }
        }
    }
    // Spec: "several labels". The fixture script sets a dozen+ distinct
    // labels (auth, backend, bug, cache, docs, epic, feature, frontend,
    // infra, investigation, perf, performance, refactor, security,
    // tech-debt, testing). Assert >=5 to be forgiving against future
    // seed tweaks while still catching "forgot to label anything".
    assert!(
        labels.len() >= 5,
        "fixture must have several labels, got {}: {labels:?}",
        labels.len()
    );
}

#[tokio::test]
async fn fixture_exposes_ready_and_blocked_items() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);

    let ready = bd_json_array(&fixture_dir, &["ready"]).await;
    let blocked = bd_json_array(&fixture_dir, &["blocked"]).await;

    assert!(
        !ready.is_empty(),
        "fixture must have at least one `bd ready` item, got none"
    );
    assert!(
        !blocked.is_empty(),
        "fixture must have at least one blocked item, got none"
    );

    // Every `ready` item must be open with no open `blocks` blockers.
    // Parent-child deps are NOT blockers (the parent epic stays
    // actionable even with open children), so a ready item may carry
    // parent-child / related / discovered-from edges. The CLI
    // enforces this contract; we re-verify the bits we can see in
    // the JSON so a future fixture change that accidentally leaves
    // a blocked item ready gets caught at test time, not by the GUI.
    for r in &ready {
        let status = r.get("status").and_then(Value::as_str).unwrap_or("?");
        assert_eq!(
            status, "open",
            "ready item must be status=open; got {status}"
        );
        let blocks_deps: Vec<&Value> = r
            .get("dependencies")
            .and_then(Value::as_array)
            .map(|a| a.iter().collect::<Vec<_>>())
            .unwrap_or_default()
            .into_iter()
            .filter(|d| d.get("type").and_then(Value::as_str) == Some("blocks"))
            .collect();
        assert!(
            blocks_deps.is_empty(),
            "ready item must have no `blocks` dependencies; got {blocks_deps:?}"
        );
    }

    // Every `blocked` item must either be status=blocked or have at
    // least one `blocks` dep whose `depends_on_id` is open (i.e. an
    // unresolved blocker). Verify both flavors exist by spot-checking
    // the script's chosen representatives: TASK_OPT (status=blocked)
    // and TASK_CACHE (open but blocked by OPT).
    let blocked_ids: std::collections::HashSet<String> = blocked
        .iter()
        .filter_map(|i| i.get("id").and_then(Value::as_str).map(String::from))
        .collect();
    let data = bd_json_array(&fixture_dir, &["list", "--all"]).await;
    let ids = common::load_ids(&fixture_dir);
    let opt_id = ids.get("TASK_OPT").and_then(Value::as_str).unwrap();
    let cache_id = ids.get("TASK_CACHE").and_then(Value::as_str).unwrap();
    assert!(
        blocked_ids.contains(opt_id),
        "OPT (status=blocked) missing from bd blocked output"
    );
    assert!(
        blocked_ids.contains(cache_id),
        "CACHE (open but blocked by OPT) missing from bd blocked output"
    );
    // Cross-check: OPT really has status=blocked in the underlying list.
    let opt_issue = data
        .iter()
        .find(|i| i.get("id").and_then(Value::as_str) == Some(opt_id))
        .expect("OPT in list");
    assert_eq!(
        opt_issue.get("status").and_then(Value::as_str),
        Some("blocked")
    );
}

#[tokio::test]
async fn fixture_ids_json_lists_every_created_role() {
    if common::skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = common::run_fixture(&tmp);
    let ids = common::load_ids(&fixture_dir);

    // The script documents exactly 27 roles (2 epics + 5 epic children
    // + 20 standalones = 27; the script's `echo` summary line says
    // 2+5+18 = 25 issues, plus the 2 epics already counted separately
    // -- so 25 issues / 27 entries if you include epics in both buckets;
    // the IDs file lists every variable the script creates, including
    // both epics). Pin the count so a seed change is caught here.
    let expected_roles = [
        "EPIC_AUTH",
        "EPIC_PERF",
        "TASK_LOGIN",
        "TASK_OAUTH",
        "TASK_PWRESET",
        "TASK_CACHE",
        "TASK_OPT",
        "TASK_MIGRATE",
        "TASK_LOG",
        "TASK_DOCS",
        "TASK_NAV",
        "TASK_TESTS",
        "TASK_DEBT",
        "TASK_REFAC",
        "TASK_AUDIT",
        "TASK_BUG1",
        "TASK_BUG2",
        "TASK_FEAT",
        "TASK_INV",
        "TASK_CI",
        "TASK_UX",
        "TASK_DARK",
        "TASK_DEPS",
        "TASK_BUILD",
        "TASK_BUG3",
    ];
    assert_eq!(
        ids.len(),
        expected_roles.len(),
        ".fixture-ids.json role count changed"
    );
    for role in expected_roles {
        let value = ids
            .get(role)
            .unwrap_or_else(|| panic!(".fixture-ids.json missing role {role}"));
        let id_str = value
            .as_str()
            .unwrap_or_else(|| panic!(".fixture-ids.json[{role}] is not a string"));
        assert!(!id_str.is_empty(), ".fixture-ids.json[{role}] is empty");
        // Beads IDs always start with the repo prefix followed by a
        // dash + hash. We don't pin the hash (it's non-deterministic)
        // but we pin the shape.
        assert!(
            id_str.contains('-'),
            ".fixture-ids.json[{role}] = {id_str:?} doesn't look like a Beads id"
        );
    }
}
