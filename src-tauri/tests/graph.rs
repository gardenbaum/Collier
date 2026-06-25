//! Integration tests for `bd_graph` (M3 R7).
//!
//! Boots the real fixture from `scripts/make-fixture.sh`, then
//! drives the production `bd_graph` path and asserts the graph
//! shape matches the documented M3 contract:
//!
//!   - 25 nodes (one per seeded issue; `bd list --all` returns
//!     the same set the other commands see)
//!   - 10 edges (5 explicit `blocks` + 5 parent-child from the
//!     two epics; the fixture seeds EPIC_AUTH with 3 children and
//!     EPIC_PERF with 2 children, both wired via the
//!     `--parent` flag at create time)
//!   - edges labelled `blocks` only where the fixture scripts
//!     ran `bd dep ... --blocks ...`; edges labelled
//!     `parent_child` only where the fixture ran `create --parent`
//!   - both nodes with status=blocked (TASK_OPT, TASK_REFAC)
//!     appear in the node set with `status: blocked`
//!
//! Like `fixture.rs`, these tests skip cleanly when `bd` is not
//! on PATH so CI without `bd` stays green.
//!
//! The Rust `Graph` types are intentionally minimal — id, title,
//! status, priority, issue_type — so the bridge payload stays
//! small even on large workspaces. These tests assert the
//! minimal-shape contract end-to-end.

use std::path::Path;
use tempfile::TempDir;

use serde_json::Value;
use tauri_app_lib::beads_export_for_tests::runner;

fn skip_if_no_bd() -> bool {
    if which::which("bd").is_err() {
        eprintln!("SKIP: bd not in PATH");
        true
    } else {
        false
    }
}

fn script_path() -> std::path::PathBuf {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .expect("CARGO_MANIFEST_DIR has a parent (repo root)")
        .join("scripts/make-fixture.sh")
}

fn run_fixture(tmp: &TempDir) -> std::path::PathBuf {
    let script = script_path();
    assert!(
        script.exists(),
        "fixture script missing at {script:?}; rebuild from repo root"
    );

    let target = tmp.path().to_path_buf();
    let output = std::process::Command::new("bash")
        .arg(&script)
        .arg(&target)
        .output()
        .expect("spawn bash for make-fixture.sh");
    assert!(
        output.status.success(),
        "make-fixture.sh failed (status {:?}):\nstdout:\n{}\nstderr:\n{}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
    assert!(
        target.join(".fixture-ids.json").exists(),
        "fixture did not write .fixture-ids.json"
    );
    target
}

fn load_ids(fixture_dir: &Path) -> serde_json::Map<String, Value> {
    let bytes =
        std::fs::read(fixture_dir.join(".fixture-ids.json")).expect("read .fixture-ids.json");
    let value: Value = serde_json::from_slice(&bytes).expect("parse .fixture-ids.json");
    value
        .as_object()
        .cloned()
        .expect(".fixture-ids.json is a JSON object")
}

/// Drive the `bd_graph` mapping directly against the production
/// `run_bd` path: spawn `bd list --all --json`, walk the
/// `data` array, and apply the same mapping the Tauri command
/// does. Re-implementing the mapping here keeps the test in the
/// `bd`-available branch without standing up a Tauri runtime.
async fn graph_from_bd(fixture_dir: &Path) -> (Vec<Value>, Vec<Value>) {
    let output = runner::run_bd(&["list", "--all", "--json"], fixture_dir)
        .await
        .expect("bd list --all --json should succeed");
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => panic!("expected JSON envelope, got text: {value}"),
    };
    let issues = value
        .get("data")
        .and_then(Value::as_array)
        .expect("envelope has data array")
        .clone();

    let mut by_id: std::collections::BTreeMap<String, Value> = std::collections::BTreeMap::new();
    for issue in &issues {
        let id = issue
            .get("id")
            .and_then(Value::as_str)
            .expect("issue has id")
            .to_string();
        by_id.insert(id, issue.clone());
    }

    let nodes: Vec<Value> = by_id
        .values()
        .map(|issue| {
            serde_json::json!({
                "id": issue.get("id").cloned().unwrap(),
                "title": issue.get("title").cloned().unwrap(),
                "status": issue.get("status").cloned().unwrap(),
                "priority": issue.get("priority").cloned().unwrap(),
                "issueType": issue.get("issue_type").cloned().unwrap(),
            })
        })
        .collect();

    let mut edges: Vec<Value> = Vec::new();
    for issue in by_id.values() {
        let source = issue.get("id").cloned().unwrap();
        if let Some(deps) = issue.get("dependencies").and_then(Value::as_array) {
            for dep in deps {
                let target = dep
                    .get("depends_on_id")
                    .or_else(|| dep.get("dependency_id"))
                    .cloned()
                    .expect("dependency row has target id");
                let dep_type = dep
                    .get("type")
                    .or_else(|| dep.get("dependency_type"))
                    .cloned()
                    .expect("dependency row has type");
                edges.push(serde_json::json!({
                    "source": source,
                    "target": target,
                    "depType": dep_type,
                }));
            }
        }
    }

    (nodes, edges)
}

#[tokio::test]
async fn graph_has_one_node_per_issue() {
    if skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = run_fixture(&tmp);

    let (nodes, _edges) = graph_from_bd(&fixture_dir).await;
    // The fixture seeds 25 issues (2 epics + 5 epic children +
    // 18 standalones); see scripts/make-fixture.sh.
    assert_eq!(
        nodes.len(),
        25,
        "expected exactly 25 graph nodes (one per seeded issue)"
    );
}

#[tokio::test]
async fn graph_has_expected_edge_count() {
    if skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = run_fixture(&tmp);

    let (_nodes, edges) = graph_from_bd(&fixture_dir).await;
    // The fixture seeds:
    //   - 5 explicit blocks edges:
    //       MIGRATE -> OPT, OPT -> CACHE,
    //       REFAC -> LOGIN, INV -> BUG1, OAUTH -> LOGIN
    //   - 5 parent-child edges (3 children of EPIC_AUTH +
    //     2 children of EPIC_PERF). bd serialises the
    //     `--parent` create flag as a `parent-child`
    //     `Dependency` row, so they show up in the
    //     `dependencies` array.
    // Total: 10 edges.
    assert_eq!(
        edges.len(),
        10,
        "expected exactly 10 graph edges (5 blocks + 5 parent-child)"
    );
}

#[tokio::test]
async fn graph_edges_use_documented_dep_types() {
    if skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = run_fixture(&tmp);
    let ids = load_ids(&fixture_dir);

    let (_nodes, edges) = graph_from_bd(&fixture_dir).await;

    let blocks_count = edges
        .iter()
        .filter(|e| e.get("depType").and_then(Value::as_str) == Some("blocks"))
        .count();
    let parent_child_count = edges
        .iter()
        .filter(|e| e.get("depType").and_then(Value::as_str) == Some("parent-child"))
        .count();

    assert_eq!(blocks_count, 5, "fixture seeds 5 blocks edges");
    assert_eq!(parent_child_count, 5, "fixture seeds 5 parent-child edges");

    // Spot-check: MIGRATE -> OPT is one of the 5 blocks edges.
    let migrate_id = ids.get("TASK_MIGRATE").and_then(Value::as_str).expect("migrate id");
    let opt_id = ids.get("TASK_OPT").and_then(Value::as_str).expect("opt id");
    let migrate_blocks_opt = edges.iter().any(|e| {
        e.get("source").and_then(Value::as_str) == Some(opt_id)
            && e.get("target").and_then(Value::as_str) == Some(migrate_id)
            && e.get("depType").and_then(Value::as_str) == Some("blocks")
    });
    assert!(
        migrate_blocks_opt,
        "expected edge (OPT, MIGRATE, blocks) — OPT depends on MIGRATE; edges were {edges:?}"
    );

    // Spot-check: LOGIN -> EPIC_AUTH is one of the 5 parent-child edges.
    let login_id = ids.get("TASK_LOGIN").and_then(Value::as_str).expect("login id");
    let epic_auth_id = ids.get("EPIC_AUTH").and_then(Value::as_str).expect("epic_auth id");
    let login_to_auth = edges.iter().any(|e| {
        e.get("source").and_then(Value::as_str) == Some(login_id)
            && e.get("target").and_then(Value::as_str) == Some(epic_auth_id)
            && e.get("depType").and_then(Value::as_str) == Some("parent-child")
    });
    assert!(
        login_to_auth,
        "expected edge (LOGIN, EPIC_AUTH, parent-child); edges were {edges:?}"
    );
}

#[tokio::test]
async fn graph_nodes_carry_blocked_status_for_blocked_issues() {
    if skip_if_no_bd() {
        return;
    }
    let tmp = TempDir::new().expect("tempdir");
    let fixture_dir = run_fixture(&tmp);
    let ids = load_ids(&fixture_dir);

    let (nodes, _edges) = graph_from_bd(&fixture_dir).await;

    // The fixture explicitly sets TASK_OPT and TASK_REFAC to
    // status=blocked after wiring their blockers. Both must
    // surface in the graph node set so the frontend can
    // highlight them without a second `bd blocked` round-trip.
    let opt_id = ids.get("TASK_OPT").and_then(Value::as_str).expect("opt id");
    let refac_id = ids.get("TASK_REFAC").and_then(Value::as_str).expect("refac id");

    let opt_status = nodes
        .iter()
        .find(|n| n.get("id").and_then(Value::as_str) == Some(opt_id))
        .and_then(|n| n.get("status"))
        .and_then(Value::as_str)
        .expect("OPT node + status");
    assert_eq!(opt_status, "blocked", "TASK_OPT must be status=blocked");

    let refac_status = nodes
        .iter()
        .find(|n| n.get("id").and_then(Value::as_str) == Some(refac_id))
        .and_then(|n| n.get("status"))
        .and_then(Value::as_str)
        .expect("REFAC node + status");
    assert_eq!(
        refac_status, "blocked",
        "TASK_REFAC must be status=blocked"
    );
}
