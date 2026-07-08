//! Shared helpers for the `src-tauri/tests/` integration-test crates.
//!
//! Cargo treats every `tests/*.rs` file as its own integration-test
//! crate, so duplicating setup between them bloats the suite and lets
//! the two copies drift silently. The four setup helpers below were
//! previously byte-identical (modulo import qualifier differences)
//! between `tests/fixture.rs` and `tests/graph.rs`; this module is
//! the canonical home so a fixture-script-path change touches one
//! file, not two.
//!
//! Each integration-test crate references this module via
//! `mod common;` after its `use` block. `bd_json_array`,
//! `fixture_envelope`, and `graph_from_bd` stay local to their
//! owning file — only the four helpers both crates need live
//! here.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use tempfile::TempDir;

/// Skip a test if `bd` is not on PATH. Lets the suite stay green on
/// machines (e.g. CI without `bd`) that don't have the CLI installed.
pub fn skip_if_no_bd() -> bool {
    if which::which("bd").is_err() {
        eprintln!("SKIP: bd not in PATH");
        true
    } else {
        false
    }
}

/// Absolute path to `scripts/make-fixture.sh` in the repo. `CARGO_MANIFEST_DIR`
/// is the `src-tauri/` dir at compile time; the script lives one level up.
pub fn script_path() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .expect("CARGO_MANIFEST_DIR has a parent (repo root)")
        .join("scripts/make-fixture.sh")
}

/// Run the fixture script in `tmp`, returning the path the fixture was
/// created at. Panics with the script's combined output if it exits non-zero.
pub fn run_fixture(tmp: &TempDir) -> PathBuf {
    let script = script_path();
    assert!(
        script.exists(),
        "fixture script missing at {script:?}; rebuild from repo root"
    );

    let target = tmp.path().to_path_buf();
    let output = Command::new("bash")
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

    // Sanity: the script must have written the ID map for downstream
    // consumers; if it didn't, the fixture didn't run.
    assert!(
        target.join(".fixture-ids.json").exists(),
        "fixture did not write .fixture-ids.json"
    );
    target
}

/// Load `.fixture-ids.json` from the fixture dir. The mapping keys are
/// stable roles (`EPIC_AUTH`, `TASK_OPT`, …) and the values are the
/// non-deterministic Beads IDs the script captured for them.
pub fn load_ids(fixture_dir: &Path) -> serde_json::Map<String, Value> {
    let bytes =
        std::fs::read(fixture_dir.join(".fixture-ids.json")).expect("read .fixture-ids.json");
    let value: Value = serde_json::from_slice(&bytes).expect("parse .fixture-ids.json");
    value
        .as_object()
        .cloned()
        .expect(".fixture-ids.json is a JSON object")
}
