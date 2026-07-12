//! Detect the `bd` CLI version, schema version, JSONL path, and backend
//! (JSONL vs Dolt) in a Beads workspace.
//!
//! `detect` is the single source of truth for the T10 modal that blocks
//! the UI when the user's installed `bd` is too old or uses a schema
//! this app does not understand. Returning the raw facts here keeps
//! the policy ("1.0..<2.0 only", "schema 1 only") out of the IPC
//! boundary — the frontend renders the modal based on these values.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::beads::{BdError, BdResult};

// ============================================================================
// Public types
// ============================================================================

/// Which on-disk store the workspace uses. `Unknown` means we found
/// `.beads/` (or its directory is missing) but couldn't classify it
/// — the modal layer (T10) treats this the same as "no compatible
/// workspace" and prompts the user to run `bd init`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    /// Workspace writes issues to a `.jsonl` file in `.beads/`.
    Jsonl,
    /// Workspace uses a Dolt SQL backend (no JSONL file).
    Dolt,
    /// `.beads/` exists but neither a JSONL file nor a `backend: dolt`
    /// config was found.
    Unknown,
}

/// Aggregated facts about a Beads workspace, returned by `detect`.
/// All fields are populated even on partial failure so the modal can
/// show the user the most useful information (e.g. "bd is 2.5.0 but
/// we need 1.0–2.0", "no .beads/ directory", "workspace uses Dolt").
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BdInfo {
    /// `(major, minor, patch)` from `bd --version`. `None` if `bd`
    /// is not on PATH or returned an unparseable version.
    pub version: Option<(u32, u32, u32)>,
    /// Schema version from the `bd list --json` envelope. `None` if
    /// `bd` is not installed, not initialized, or returned legacy JSON.
    pub schema_version: Option<u32>,
    /// Path to the most recently modified `.beads/*.jsonl` file, or
    /// `None` if no JSONL file exists (Dolt backend, fresh workspace,
    /// or wrong directory).
    pub jsonl_path: Option<PathBuf>,
    /// Detected on-disk store layout. See [`Backend`].
    pub backend: Backend,
}

// The version + schema predicates are exposed as public functions
// so test cases and future v2 callers can share the exact rule.

// ============================================================================
// detect()
// ============================================================================

#[allow(dead_code)] // exposed for tests + future callers; inlined in detect()
pub fn is_supported_version(version: &(u32, u32, u32)) -> bool {
    version.0 == 1
}

#[allow(dead_code)] // exposed for tests + future callers; inlined in detect()
pub fn is_supported_schema(v: u32) -> bool {
    v == 1
}
/// Run all probes against the workspace rooted at `cwd`. The function
/// is best-effort: every field is independent, so a failure in one
/// probe (e.g. `bd` not installed) does not prevent the others from
/// returning data. The frontend uses the populated fields to render
/// the most specific error possible.
///
/// Probes, in order:
/// 1. `bd --version` → `version`
/// 2. `bd list --limit 1 --json` → `schema_version`
/// 3. `.beads/*.jsonl` glob → `jsonl_path`
/// 4. `.beads/config.yaml` substring scan → `backend`
pub async fn detect(cwd: &Path) -> BdResult<BdInfo> {
    // Probe 1: version. We use the lower-level `check_bd_version` so
    // a missing `bd` binary surfaces as `None` rather than aborting
    // the rest of the detection.
    let version = crate::beads::runner::check_bd_version().await.ok();

    // Probe 2: schema. Same rationale: a fresh or Dolt-only workspace
    // returns `None` here, not a hard error.
    let schema_version = crate::beads::runner::check_schema_version(cwd).await.ok();

    // Probe 3: JSONL path. We use the glob directly (not `jsonl::read_jsonl`)
    // because `read_jsonl` reads the file — we only need the path here.
    let jsonl_path = find_jsonl_path(cwd);

    // Probe 4: backend. Read config.yaml as text and look for the
    // `backend: dolt` substring — full YAML parsing is overkill for
    // a yes/no answer, and `config.yaml` is small (a few hundred bytes).
    let backend = detect_backend(cwd, jsonl_path.is_some());

    Ok(BdInfo {
        version,
        schema_version,
        jsonl_path,
        backend,
    })
}

/// Find the most recently modified `.beads/*.jsonl` file, or `None`
/// if no JSONL file exists. Mirrors the glob in `jsonl::find_jsonl_path`
/// but returns `Option` instead of erroring when the directory is
/// missing — detection must be read-only and tolerant.
fn find_jsonl_path(cwd: &Path) -> Option<PathBuf> {
    let beads_dir = cwd.join(".beads");
    let pattern = beads_dir.join("*.jsonl");
    let pattern_str = pattern.to_string_lossy();

    let mut matches: Vec<PathBuf> = glob::glob(&pattern_str)
        .ok()?
        .filter_map(Result::ok)
        .collect();

    if matches.is_empty() {
        // Fallback: beads.jsonl in the parent of `.beads/`.
        let fallback = beads_dir.parent()?.join("beads.jsonl");
        return fallback.exists().then_some(fallback);
    }

    matches.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
    matches.pop()
}

/// Classify the workspace backend. Decision tree:
/// 1. `config.yaml` contains `backend:` and `dolt` → `Dolt`
/// 2. JSONL file exists → `Jsonl`
/// 3. neither → `Unknown`
fn detect_backend(cwd: &Path, has_jsonl: bool) -> Backend {
    let config_path = cwd.join(".beads").join("config.yaml");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if content.contains("backend:") && content.contains("dolt") {
            return Backend::Dolt;
        }
    }
    if has_jsonl {
        Backend::Jsonl
    } else {
        Backend::Unknown
    }
}

// ============================================================================
// Tauri command
// ============================================================================

/// Tauri command wrapper for `detect`. Returns the aggregated
/// `BdInfo` to the frontend; never returns `Err` for the
/// "workspace not initialized" case (that's `Backend::Unknown`).
/// `Err` is reserved for "could not even invoke `bd`", which
/// surfaces as `BdError::BdNotInPath` and triggers the
/// "install beads" message in the modal.
#[tauri::command]
#[specta::specta]
pub async fn detect_bd(cwd: String) -> Result<BdInfo, BdError> {
    let path = PathBuf::from(&cwd);
    detect(&path).await
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ----- is_supported_version -----

    #[test]
    fn test_supported_version_1_0_5() {
        assert!(is_supported_version(&(1, 0, 5)));
    }

    #[test]
    fn test_supported_version_1_99_99() {
        // 1.x.x must be accepted (only 0.x and >=2.0 are rejected).
        assert!(is_supported_version(&(1, 99, 99)));
    }

    #[test]
    fn test_unsupported_version_2_0_0() {
        // 2.0+ must be rejected (plan AC).
        assert!(!is_supported_version(&(2, 0, 0)));
    }

    #[test]
    fn test_unsupported_version_0_9_0() {
        // Pre-1.0 must be rejected — schema not stable.
        assert!(!is_supported_version(&(0, 9, 0)));
    }

    #[test]
    fn test_unsupported_version_3_5_1() {
        // Future major versions rejected too.
        assert!(!is_supported_version(&(3, 5, 1)));
    }

    // ----- is_supported_schema -----

    #[test]
    fn test_supported_schema_1() {
        assert!(is_supported_schema(1));
    }

    #[test]
    fn test_unsupported_schema_2() {
        // Plan AC: schema != 1 must be rejected.
        assert!(!is_supported_schema(2));
    }

    #[test]
    fn test_unsupported_schema_0() {
        // Pre-1.0 schema is not stable.
        assert!(!is_supported_schema(0));
    }

    // ----- Backend serde roundtrip -----

    #[test]
    fn test_backend_serde_roundtrip() {
        // Unit variants with `rename_all = "snake_case"` serialize as
        // plain strings, NOT as `{ type: "Jsonl" }` — confirms the TS
        // bridge sees `backend: "jsonl" | "dolt" | "unknown"`.
        for (variant, expected) in [
            (Backend::Jsonl, "\"jsonl\""),
            (Backend::Dolt, "\"dolt\""),
            (Backend::Unknown, "\"unknown\""),
        ] {
            let json = serde_json::to_string(&variant).expect("serialize");
            assert_eq!(json, expected, "wrong serialization for {variant:?}");
            let back: Backend = serde_json::from_str(&json).expect("deserialize");
            assert_eq!(back, variant);
        }
    }

    // ----- detect_backend (sub-function tests) -----

    #[test]
    fn test_detect_backend_dolt_from_config() {
        // A workspace with `backend: dolt` in config.yaml must be
        // classified as Dolt even if no JSONL file is present.
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let beads_dir = tmp.path().join(".beads");
        std::fs::create_dir_all(&beads_dir).expect("mkdir");
        std::fs::write(
            beads_dir.join("config.yaml"),
            "backend: dolt\ndolt_branch: main\n",
        )
        .expect("write config");
        assert_eq!(detect_backend(tmp.path(), false), Backend::Dolt);
    }

    #[test]
    fn test_detect_backend_jsonl_fallback() {
        // No config.yaml, but JSONL present → Jsonl.
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let beads_dir = tmp.path().join(".beads");
        std::fs::create_dir_all(&beads_dir).expect("mkdir");
        std::fs::write(beads_dir.join("issues.jsonl"), "").expect("write jsonl");
        assert_eq!(detect_backend(tmp.path(), true), Backend::Jsonl);
    }

    #[test]
    fn test_detect_backend_unknown() {
        // Nothing on disk → Unknown.
        let tmp = tempfile::TempDir::new().expect("tempdir");
        assert_eq!(detect_backend(tmp.path(), false), Backend::Unknown);
    }

    #[test]
    fn test_detect_backend_jsonl_backend_means_jsonl() {
        // `backend: jsonl` in config (the default) + JSONL file present
        // is still classified as Jsonl. The Dolt branch only fires on
        // `backend: dolt`.
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let beads_dir = tmp.path().join(".beads");
        std::fs::create_dir_all(&beads_dir).expect("mkdir");
        std::fs::write(
            beads_dir.join("config.yaml"),
            "backend: jsonl\nprefix: beads\n",
        )
        .expect("write config");
        assert_eq!(detect_backend(tmp.path(), true), Backend::Jsonl);
    }

    // ----- find_jsonl_path (sub-function tests) -----

    #[test]
    fn test_find_jsonl_path_no_beads_dir() {
        // No `.beads/` directory → None, not an error.
        let tmp = tempfile::TempDir::new().expect("tempdir");
        assert_eq!(find_jsonl_path(tmp.path()), None);
    }

    #[test]
    fn test_find_jsonl_path_returns_most_recent() {
        // Two JSONL files: the one with the newer mtime must be
        // returned. We touch the second file after the first to
        // guarantee ordering (mtime resolution is platform-dependent).
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let beads_dir = tmp.path().join(".beads");
        std::fs::create_dir_all(&beads_dir).expect("mkdir");
        let older = beads_dir.join("older.jsonl");
        let newer = beads_dir.join("newer.jsonl");
        std::fs::write(&older, "").expect("write older");
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::fs::write(&newer, "").expect("write newer");
        let found = find_jsonl_path(tmp.path()).expect("must find a jsonl");
        assert_eq!(found, newer, "expected newer.jsonl (mtime-ordered)");
    }

    // ----- integration test against real bd -----

    /// Skip a test if `bd` is not on PATH.
    fn skip_if_no_bd() -> bool {
        if which::which("bd").is_err() {
            eprintln!("SKIP: bd not in PATH");
            true
        } else {
            false
        }
    }

    /// Integration test: run `detect` against a real `bd init` workspace
    /// in a tempdir. Asserts:
    /// - `version` is populated
    /// - `schema_version == 1` (plan AC)
    /// - `backend == Jsonl` (default `bd init` uses the JSONL backend)
    /// - `is_supported_version` accepts the installed version
    #[tokio::test]
    async fn test_detect_real_bd() {
        if skip_if_no_bd() {
            return;
        }
        let tmp = tempfile::TempDir::new().expect("tempdir");
        let cwd = tmp.path();
        // Real `bd init` needs a git repo first.
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(cwd)
            .output()
            .expect("git init");
        // `bd init` is non-interactive in 1.0.5; pipe `y\n` defensively
        // in case a future version starts prompting.
        let init_output = std::process::Command::new(
            // Same resolution as runner::resolve_bd_path -- duplicated
            // here to avoid a cyclic dep between runner (which uses
            // detect types) and detect (which needs to spawn bd init
            // during self-test).
            std::env::var("COLLIER_BD_PATH")
                .ok()
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| "bd".to_string()),
        )
        .arg("init")
        .current_dir(cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn bd init");
        // (We don't write to stdin — 1.0.5 doesn't need it. The
        // process just runs to completion on its own.)

        let status = init_output.wait_with_output().expect("wait bd init");
        assert!(
            status.status.success(),
            "bd init failed: stderr={:?}",
            String::from_utf8_lossy(&status.stderr)
        );

        // Now run detect.
        let info = detect(cwd).await.expect("detect");
        let version = info.version.expect("version should be populated");
        assert_eq!(
            info.schema_version,
            Some(1),
            "expected schema_version == 1, got {:?}",
            info.schema_version
        );
        assert_eq!(
            info.backend,
            Backend::Jsonl,
            "expected Backend::Jsonl (default bd init backend), got {:?}",
            info.backend
        );
        assert!(
            is_supported_version(&version),
            "installed bd version {version:?} should be supported"
        );
    }
}
