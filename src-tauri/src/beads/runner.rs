//! bd CLI runner.
//!
//! Spawns the `bd` binary as a child process, applies a 10s timeout,
//! and returns the parsed output. JSON envelopes (with `schema_version`)
//! and legacy JSON (bare object/array) both land in `BdOutput::Json`;
//! everything else in `BdOutput::Text`. All errors map to a variant of
//! `BdError` so the frontend can branch on the error type rather than
//! parsing free-form strings.

use std::path::{Path, PathBuf};
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use crate::beads::{envelope, BdError, BdResult};

/// Resolve the absolute path to the `bd` binary on disk.
///
/// Tauri's spawned child processes inherit a sparse PATH from
/// `launchd` on macOS (typically `/usr/bin:/bin:/usr/sbin:/sbin` only)
/// and from systemd on Linux, so a bare `Command::new("bd")` won't
/// find user-installed binaries in Homebrew prefixes, `~/.local/bin`,
/// `~/.cargo/bin`, or `~/.bun/bin`. We probe the common install
/// locations explicitly so the GUI can find `bd` regardless of the
/// user's shell PATH. The returned absolute path is passed to
/// `Command::new(<path>)` in `build_bd_command`, so PATH lookup is
/// bypassed entirely (and so the binary is locked to that exact
/// install for the lifetime of the child).
///
/// Returns `None` if no `bd` is found in any probed location; the
/// caller surfaces a `BdError::NotFound` with an actionable hint.
fn resolve_bd_path() -> Option<PathBuf> {
    use std::process::Command as StdCommand;

    // 1) Honor the user's explicit override if they set it.
    if let Ok(custom) = std::env::var("COLLIER_BD_PATH") {
        let p = PathBuf::from(&custom);
        if p.is_file() {
            return Some(p);
        }
    }

    // 2) Ask the parent shell (which has the user's full PATH) what
    //    `which bd` says. This is the most portable fallback because
    //    it respects whatever the user has configured (asdf, nix,
    //    fnm, mise, custom $PATH, etc.). We do this once per resolve
    //    call -- it's a single fork+exec, cheap.
    if let Ok(out) = StdCommand::new("/bin/sh")
        .arg("-lc")
        .arg("command -v bd 2>/dev/null || which bd 2>/dev/null")
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                let p = PathBuf::from(&s);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }

    // 3) Probe the well-known absolute paths across macOS + Linux.
    //    Order matters: Homebrew on Apple Silicon (arm64) lives in
    //    /opt/homebrew; Homebrew on Intel macs lives in /usr/local;
    //    Linux user-local installs live in ~/.local/bin.
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates: Vec<PathBuf> = {
        let mut v = vec![];
        if !home.is_empty() {
            v.push(PathBuf::from(&home).join(".local/bin/bd"));
            v.push(PathBuf::from(&home).join(".cargo/bin/bd"));
            v.push(PathBuf::from(&home).join(".bun/bin/bd"));
            v.push(PathBuf::from(&home).join("go/bin/bd"));
        }
        // Homebrew (macOS)
        v.push(PathBuf::from("/opt/homebrew/bin/bd"));
        v.push(PathBuf::from("/usr/local/bin/bd"));
        // Linux distro packages (apt, dnf, pacman)
        v.push(PathBuf::from("/usr/bin/bd"));
        v.push(PathBuf::from("/snap/bin/bd"));
        v
    };
    candidates.into_iter().find(|p| p.is_file())
}

/// Hard ceiling on every `bd` invocation. Chosen to be large enough
/// for cold `bd list` on a large repo, small enough that a hung CLI
/// fails fast in the UI.
/// `bd list --json` on a fresh fixture pays the Dolt cold-start
/// cost (~10-30s on a fresh CI runner); 10s was too tight and
/// surfaced as a flaky E2E smoke test (see t_f449df3e in the kanban
/// board). 120s is the wdio-side session-creation budget divided
/// by 5 -- the bd subprocess is owned by the Tauri command, not
/// the test runner, so a generous ceiling here is cheap.
const BD_TIMEOUT_SECS: u64 = 120;

/// Output of a `bd` invocation. The JSON variant covers both the
/// `{ schema_version, data }` envelope (default for `bd >= 1.0.5`
/// with `BD_JSON_ENVELOPE=1`) and bare legacy JSON (pre-envelope CLI
/// behavior). The Text variant is the fallback for human-readable
/// commands like `bd --version`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BdOutput {
    Json { value: Value },
    Text { value: String },
}

/// Build the `tokio::process::Command` for a `bd` invocation with the
/// canonical env (envelope mode, piped stdio). `stdin` controls
/// whether the child has a writable stdin pipe; we close it explicitly
/// after writing the caller-supplied bytes so `bd` doesn't block on
/// EOF. `kill_on_drop(true)` ensures that if the runner hits the
/// 10s timeout, the child is reaped instead of leaking as a zombie
/// — critical for the test suite (a hanging `sleep 999` would keep
/// the test binary alive past the timeout) and for production
/// (a stuck `bd` must not outlive the UI call that started it).
fn build_bd_command(args: &[&str], cwd: &Path, stdin: bool) -> Command {
    // Resolve to an absolute path. On macOS, Tauri-spawned children
    // do NOT inherit the user's shell PATH (only the launchd PATH),
    // so a bare `Command::new("bd")` fails on any Homebrew or
    // user-local install. `resolve_bd_path` probes the well-known
    // locations + the user's login shell PATH as a fallback.
    let bd_bin = resolve_bd_path().unwrap_or_else(|| PathBuf::from("bd"));
    let mut cmd = Command::new(&bd_bin);
    cmd.args(args)
        .current_dir(cwd)
        .env("BD_JSON_ENVELOPE", "1")
        .stdin(if stdin {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    // Suppress the inherited RUST_LOG noise in the child; `bd` is a
    // Go binary, so this is a no-op there but keeps the contract
    // explicit for any future Rust-based subcommand.
    cmd.env_remove("RUST_LOG");
    cmd
}

/// Run a fully-built `Command` under a `timeout_secs` deadline, then
/// classify the result. Exposed `pub(crate)` so the timeout test can
/// drive a `sleep 999` invocation through the same wrapper as real
/// `bd` calls — the production code path is identical.
///
/// `Command::spawn()` itself is synchronous in current tokio (it
/// returns `io::Result<Child>`), so we wrap the *wait* in
/// `tokio::time::timeout`. `cmd.spawn()` failing is not subject to
/// the timeout (it's bounded by the OS fork/exec speed).
pub(crate) async fn spawn_and_collect(
    cmd: &mut Command,
    timeout_secs: u64,
    stdin_data: Option<&[u8]>,
) -> BdResult<BdOutput> {
    let mut child = cmd.spawn().map_err(|e| {
        // `NotFound` is the OS-level errno when the binary is missing
        // from PATH entirely. Surface this as `BdNotInPath` (a dedicated
        // tuple variant in `BdError`) so the frontend can show the
        // "install beads" recovery modal instead of a generic
        // "failed to spawn bd" message. `BdError::NotFound` is a struct
        // variant with an `id` field for issue-not-found errors --
        // semantically wrong here, hence the dedicated variant.
        if e.kind() == std::io::ErrorKind::NotFound {
            BdError::BdNotInPath
        } else {
            BdError::IoError {
                message: format!("failed to spawn bd: {e}"),
            }
        }
    })?;

    if let (Some(data), Some(mut pipe)) = (stdin_data, child.stdin.take()) {
        pipe.write_all(data).await.map_err(|e| BdError::IoError {
            message: format!("failed to write to bd stdin: {e}"),
        })?;
        // Drop closes the pipe; required so `bd` sees EOF and proceeds.
        drop(pipe);
    }

    let output = match timeout(Duration::from_secs(timeout_secs), child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            return Err(BdError::IoError {
                message: format!("failed to wait for bd: {e}"),
            });
        }
        Err(_) => {
            return Err(BdError::Timeout {
                seconds: timeout_secs,
            });
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        return Err(BdError::NonZeroExit {
            code,
            stdout,
            stderr,
        });
    }

    // Try JSON first; any failure means `bd` returned human-readable
    // text (e.g. `bd version 1.0.5 (Homebrew)`).
    match serde_json::from_str::<Value>(&stdout) {
        Ok(value) => Ok(BdOutput::Json { value }),
        Err(_) => Ok(BdOutput::Text { value: stdout }),
    }
}

/// Spawn `bd <args>` in `cwd` with the standard timeout and return
/// the parsed output. The `which("bd")` pre-check fails fast with
/// `BdError::BdNotInPath` so the frontend can show a clear "install
/// beads" error instead of a confusing "no such file or directory"
/// from the spawn.
pub async fn run_bd(args: &[&str], cwd: &Path) -> BdResult<BdOutput> {
    which::which("bd").map_err(|_| BdError::BdNotInPath)?;
    let mut cmd = build_bd_command(args, cwd, false);
    spawn_and_collect(&mut cmd, BD_TIMEOUT_SECS, None).await
}

/// Run `bd <args>` in `cwd`, classify the output as a JSON envelope,
/// and deserialise the `data` field into `T`. Folds the pipeline
/// shared by every list-style `bd` command (`bd list`, `bd ready`,
/// `bd blocked`, `bd search`, `bd query`) so the per-command files
/// stay focused on argv construction and any post-filter.
///
/// Sequence:
///   1. `runner::run_bd(args, cwd)` — spawn + classify
///      (`BdOutput::Json { value }` on success, `BdOutput::Text`
///      on human-readable output like `bd --version`).
///   2. Reject `Text` as a `ParseError` — the list-style commands
///      all append `--json` and expect an envelope; anything else
///      is a CLI drift we want to surface loudly.
///   3. `envelope::extract::<T>(value)` — pull `data` and parse into
///      `T`. Pinning `T` to `Vec<Issue>` keeps the show/history/
///      comments path on `show_history::extract_data_vec<T>`, which
///      needs a friendly empty-array error after deserialise.
///
/// New callers should reach for this rather than hand-rolling the
/// `run_bd` + `match BdOutput` + `extract` triple.
pub async fn run_bd_envelope<T>(args: &[&str], cwd: &Path) -> BdResult<T>
where
    T: serde::de::DeserializeOwned,
{
    let output = run_bd(args, cwd).await?;
    let value = match output {
        BdOutput::Json { value } => value,
        BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    envelope::extract(value)
}
// run_bd_with_input was reserved for `bd init` (which T43 never
// actually needed; we go through the argv-only path). v1 doesn't
// surface this — when v1.1 needs stdin-driven commands, re-add
// with a real test. The function stays `pub` so a future caller
// can wire it without touching the lib's public surface.
#[allow(dead_code)]
pub async fn run_bd_with_input(args: &[&str], cwd: &Path, input: &str) -> BdResult<BdOutput> {
    which::which("bd").map_err(|_| BdError::BdNotInPath)?;
    let mut cmd = build_bd_command(args, cwd, true);
    spawn_and_collect(&mut cmd, BD_TIMEOUT_SECS, Some(input.as_bytes())).await
}

/// Parse the `bd --version` output. Real output is e.g.
/// `bd version 1.0.5 (Homebrew)` — we only care about the first three
/// numeric components. Anchored regex: any trailing suffix (build
/// metadata, distro tag) is ignored.
pub async fn check_bd_version() -> BdResult<(u32, u32, u32)> {
    let cwd = std::env::current_dir().map_err(|e| BdError::IoError {
        message: format!("could not resolve cwd for `bd --version`: {e}"),
    })?;
    let output = run_bd(&["--version"], &cwd).await?;
    let stdout = match output {
        BdOutput::Text { value } => value,
        BdOutput::Json { value } => value.to_string(),
    };
    parse_version_string(&stdout)
}

fn parse_version_string(s: &str) -> BdResult<(u32, u32, u32)> {
    let re = Regex::new(r"^bd version (\d+)\.(\d+)\.(\d+)").expect("static regex is valid");
    let caps = re.captures(s.trim()).ok_or_else(|| BdError::ParseError {
        message: format!("could not parse version from {s:?}"),
    })?;
    let major = caps[1].parse::<u32>().map_err(|e| BdError::ParseError {
        message: format!("major version is not u32: {e}"),
    })?;
    let minor = caps[2].parse::<u32>().map_err(|e| BdError::ParseError {
        message: format!("minor version is not u32: {e}"),
    })?;
    let patch = caps[3].parse::<u32>().map_err(|e| BdError::ParseError {
        message: format!("patch version is not u32: {e}"),
    })?;
    Ok((major, minor, patch))
}

/// Run `bd list --limit 1 --json` in `cwd` and return the
/// `schema_version` field from the JSON envelope. Legacy output
/// (no envelope) is reported as `BdError::SchemaMismatch` so the
/// frontend can prompt the user to upgrade `bd` rather than silently
/// treating it as compatible.
pub async fn check_schema_version(cwd: &Path) -> BdResult<u32> {
    let output = run_bd(&["list", "--limit", "1", "--json"], cwd).await?;
    let value = match output {
        BdOutput::Json { value } => value,
        BdOutput::Text { value } => {
            return Err(BdError::SchemaMismatch {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    let schema_version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .ok_or_else(|| BdError::SchemaMismatch {
            message: format!("no schema_version field in envelope: {value}"),
        })?;
    u32::try_from(schema_version).map_err(|e| BdError::SchemaMismatch {
        message: format!("schema_version {schema_version} out of u32 range: {e}"),
    })
}

// ============================================================================
// Locked runner
// ============================================================================

/// Run `bd <args>` in `cwd` while holding the per-repo write lock.
///
/// Acquires `write_lock`'s per-repo mutex (default 2s timeout) before
/// invoking `bd`; the guard is held for the duration of the call and
/// released on Drop. Two concurrent `bd` writes to the same repo
/// therefore serialize, while writes to *different* repos never block
/// each other.
///
/// All `bd_*` mutation commands route through this helper. The
/// previous `try_write_lock_cmd` IPC acquired the lock and immediately
/// released it on IPC return, so it provided no actual concurrency
/// control — see `beads::lock` for the move-lock-into-command fix.
pub async fn run_bd_locked(
    write_lock: &crate::beads::lock::WriteLock,
    args: &[&str],
    cwd: &Path,
) -> BdResult<BdOutput> {
    let _guard = write_lock
        .try_acquire_write(cwd, crate::beads::lock::DEFAULT_WRITE_LOCK_TIMEOUT)
        .await?;
    run_bd(args, cwd).await
}

// ============================================================================
// Tauri command wrappers
// ============================================================================
/// `#[tauri::command]` wrapper for `run_bd`. Takes the args and cwd
/// over the bridge as owned `String`s because the tauri-specta IPC
/// layer requires owned types; we borrow back to `&str` for the
/// runner.
#[tauri::command]
#[specta::specta]
pub async fn run_bd_command(args: Vec<String>, cwd: String) -> Result<BdOutput, BdError> {
    let path = std::path::PathBuf::from(&cwd);
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_bd(&arg_refs, &path).await
}

/// `#[tauri::command]` wrapper for `check_bd_version`. Returns the
/// version as a `"major.minor.patch"` string so the frontend can
/// display it directly without reformatting.
#[tauri::command]
#[specta::specta]
pub async fn check_bd_version_cmd() -> Result<String, BdError> {
    let (major, minor, patch) = check_bd_version().await?;
    Ok(format!("{major}.{minor}.{patch}"))
}

/// `#[tauri::command]` wrapper for `check_schema_version`.
#[tauri::command]
#[specta::specta]
pub async fn check_schema_version_cmd(cwd: String) -> Result<u32, BdError> {
    let path = std::path::PathBuf::from(&cwd);
    check_schema_version(&path).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command as StdCommand;
    use std::time::Instant;
    use tempfile::TempDir;

    /// Skip a test if `bd` is not on PATH. Lets the test suite stay
    /// green on machines (e.g. CI) that don't have the CLI installed;
    /// the `test_bd_not_in_path` test covers the negative case
    /// explicitly by overriding PATH.
    fn skip_if_no_bd() -> bool {
        if which::which("bd").is_err() {
            eprintln!("SKIP: bd not in PATH");
            true
        } else {
            false
        }
    }

    /// Initialize a git repo + beads workspace in a fresh temp dir.
    /// `bd init` is non-interactive in this version (we pipe `y\n`
    /// just in case a future version starts prompting).
    async fn init_bd_workspace(tmp: &TempDir) {
        let cwd = tmp.path();
        StdCommand::new("git")
            .args(["init", "-q"])
            .current_dir(cwd)
            .output()
            .expect("git init");
        run_bd_with_input(&["init"], cwd, "y\n")
            .await
            .expect("bd init");
    }

    #[tokio::test]
    async fn test_run_bd_with_version() {
        if skip_if_no_bd() {
            return;
        }
        let cwd = std::env::current_dir().unwrap();
        let output = run_bd(&["--version"], &cwd).await.expect("bd --version");
        // `bd --version` is human-readable text, not JSON.
        let stdout = match output {
            BdOutput::Text { value } => value,
            BdOutput::Json { value } => panic!("expected text output, got JSON {value}"),
        };
        assert!(
            stdout.starts_with("bd version "),
            "expected `bd version ...` prefix, got {stdout:?}"
        );
    }

    #[tokio::test]
    async fn test_bd_not_in_path() {
        // Save the real PATH so we can restore it; the runner reads
        // PATH via `which::which` which is a process-level lookup.
        let saved = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", "/dev/null");
        let result = run_bd(&["--version"], Path::new("/tmp")).await;
        std::env::set_var("PATH", saved);
        assert!(
            matches!(result, Err(BdError::BdNotInPath)),
            "expected BdNotInPath, got {result:?}"
        );
    }

    #[tokio::test]
    async fn test_timeout() {
        // `sleep 999` simulates a hung CLI. We use the internal
        // `spawn_and_collect` helper so the test exercises the same
        // timeout machinery as production `bd` calls. Budget is 2s
        // timeout + 1.5s slack = elapsed well under the 10.5s
        // production budget. `kill_on_drop(true)` is required here:
        // without it, the orphan `sleep` process would keep the
        // tokio runtime's process driver alive past test exit and
        // hang `cargo test` indefinitely.
        let mut cmd = Command::new("sleep");
        cmd.arg("999").kill_on_drop(true);
        let started = Instant::now();
        let result = spawn_and_collect(&mut cmd, 2, None).await;
        let elapsed = started.elapsed();
        assert!(
            matches!(result, Err(BdError::Timeout { seconds: 2 })),
            "expected Timeout {{ seconds: 2 }}, got {result:?}"
        );
        assert!(
            elapsed < Duration::from_millis(3500),
            "timeout fired late after {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn test_non_zero_exit() {
        if skip_if_no_bd() {
            return;
        }
        // `bd` with an unknown subcommand exits non-zero with a
        // usage error on stderr.
        let result = run_bd(
            &["definitely-not-a-real-subcommand-xyz"],
            &std::env::current_dir().unwrap(),
        )
        .await;
        match result {
            Err(BdError::NonZeroExit { code, stderr, .. }) => {
                assert_ne!(code, 0, "non-zero exit should have non-zero code");
                assert!(!stderr.is_empty(), "stderr should be captured");
            }
            other => panic!("expected NonZeroExit, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_schema_version_eq_1() {
        if skip_if_no_bd() {
            return;
        }
        let tmp = TempDir::new().expect("create tempdir");
        init_bd_workspace(&tmp).await;
        let version = check_schema_version(tmp.path())
            .await
            .expect("schema_version");
        assert_eq!(version, 1, "expected schema_version == 1, got {version}");
    }

    #[tokio::test]
    async fn test_run_bd_with_input_pipes_stdin() {
        if skip_if_no_bd() {
            return;
        }
        // The wrapper must accept a `Vec<u8>` stdin buffer and write
        // it to the child. We use `bd --version` (which never reads
        // stdin) just to verify the wrapper does not error out from
        // the stdin path itself; a more rigorous end-to-end test of
        // `bd init` is `test_schema_version_eq_1` above.
        let cwd = std::env::current_dir().unwrap();
        let result = run_bd_with_input(&["--version"], &cwd, "y\n").await;
        assert!(result.is_ok(), "expected ok, got {result:?}");
    }

    #[test]
    fn test_parse_version_string_accepts_homebrew_suffix() {
        let (major, minor, patch) =
            parse_version_string("bd version 1.0.5 (Homebrew)").expect("parse 1.0.5");
        assert_eq!((major, minor, patch), (1, 0, 5));
    }

    #[test]
    fn test_parse_version_string_rejects_garbage() {
        let result = parse_version_string("not a version string");
        assert!(
            matches!(result, Err(BdError::ParseError { .. })),
            "expected ParseError, got {result:?}"
        );
    }

    #[test]
    fn test_parse_version_string_rejects_two_components() {
        // 1.0 with no patch is not enough — the regex requires three
        // numeric components.
        let result = parse_version_string("bd version 1.0");
        assert!(
            matches!(result, Err(BdError::ParseError { .. })),
            "expected ParseError, got {result:?}"
        );
    }

    #[tokio::test]
    async fn test_run_bd_command_wrapper_contract() {
        // Confirms the `&[&str]` / `&Path` argument contract holds
        // for the public API: the runner must accept borrowed
        // arguments and return a typed `BdOutput`.
        if skip_if_no_bd() {
            return;
        }
        let args: Vec<&str> = vec!["--version"];
        let cwd = std::env::current_dir().unwrap();
        let result = run_bd(&args, &cwd).await;
        assert!(matches!(result, Ok(BdOutput::Text { .. })));
    }

    #[test]
    fn test_build_bd_command_sets_envelope_env() {
        // Snapshot-style: the command we hand to tokio must include
        // `BD_JSON_ENVELOPE=1` (envelope mode) and the caller's args.
        let cmd = build_bd_command(&["list"], Path::new("/tmp"), false);
        let debug = format!("{cmd:?}");
        assert!(
            debug.contains("BD_JSON_ENVELOPE"),
            "expected BD_JSON_ENVELOPE in command, got {debug}"
        );
        assert!(
            debug.contains("list"),
            "expected arg `list` in command, got {debug}"
        );
    }

    /// Used by `test_run_bd_command_wrapper_contract` to silence
    /// the unused-import warning on PathBuf in this module.
    #[allow(dead_code)]
    fn _path_buf_marker() -> PathBuf {
        PathBuf::new()
    }
}
