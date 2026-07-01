//! Build-time app metadata command.
//!
//! Surfaces the runtime app's identity (name, version, identifier)
//! and the auto-updater configuration (endpoint, active flag,
//! pubkey fingerprint) so:
//!
//! 1. The E2E suite can assert the bundled `tauri.conf.json` is the
//!    one the release workflow expects (name / version / identifier
//!    / endpoint). A wrong endpoint (e.g. accidentally pointed at
//!    a fork's `latest.json`) would silently misroute updates, so
//!    we pin it via a test instead of trusting a code review.
//!
//! 2. The frontend can render an "About" / "Diagnostics" panel
//!    without having to parse `tauri.conf.json` itself. The same
//!    surface is useful for the auto-update settings UI.
//!
//! Read-only: takes no arguments, returns a struct, never mutates
//! state. The pubkey is returned as a fingerprint (first 16 hex
//! chars of the SHA-256 of the base64 string) so the E2E suite can
//! assert "a pubkey is configured" without ever echoing the raw
//! signing key into test logs or DOM dumps.
//!
//! Spec: docs/specs/m6-comments-gates-statuses.md (release-hardening sub-section).
//! Contract: docs/developer/releases.md → "Auto-update system".

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::utils::config::Config as TauriConfig;
use tauri::AppHandle;

/// Subset of the build-time Tauri config we expose to the renderer.
///
/// `pubkey_fingerprint` is a SHA-256 hex prefix of the configured
/// `tauri.conf.json::plugins.updater.pubkey` so the E2E suite can
/// verify a key is set without ever returning the raw signing
/// material to the webview (where test logs could capture it).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppMetadata {
    /// `productName` from `tauri.conf.json` (e.g. "Collier").
    pub name: String,
    /// `version` from `tauri.conf.json` (semver, e.g. "0.1.0").
    pub version: String,
    /// `identifier` from `tauri.conf.json` (reverse-DNS bundle id).
    pub identifier: String,
    /// First endpoint listed in `plugins.updater.endpoints`, or
    /// `None` when no updater endpoint is configured.
    pub updater_endpoint: Option<String>,
    /// `plugins.updater.active` (or `false` when the updater
    /// section is absent). When `false`, the auto-update flow is
    /// inert even if `check()` succeeds at runtime.
    pub updater_active: bool,
    /// SHA-256 hex prefix of the configured updater pubkey
    /// (first 16 chars). `None` when no pubkey is configured.
    pub pubkey_fingerprint: Option<String>,
    /// GitHub Actions build number when available, else `None`.
    /// Pulled from the `GITHUB_RUN_NUMBER` env var so CI-built
    /// bundles can be cross-referenced with the workflow run.
    pub build_run_number: Option<String>,
}

/// Return the build-time app metadata for diagnostics + E2E.
///
/// `tauri::generate_context!()` reads `tauri.conf.json` at compile
/// time, so the values returned here reflect exactly what was
/// baked into the binary — not what's on disk at runtime.
#[tauri::command]
#[specta::specta]
pub fn get_app_metadata(app: AppHandle) -> Result<AppMetadata, String> {
    let config: &TauriConfig = app.config();
    let package_info = app.package_info();

    let name = config
        .product_name
        .clone()
        .or_else(|| Some(package_info.name.clone()))
        .unwrap_or_else(|| "Collier".to_string());

    let version = config
        .version
        .clone()
        .or_else(|| Some(package_info.version.to_string()))
        .unwrap_or_else(|| "0.0.0".to_string());

    let identifier = config.identifier.clone();

    let updater = read_updater_config(config);
    let updater_endpoint = updater.endpoint.clone();
    let updater_active = updater.active;
    let pubkey_fingerprint = updater.pubkey_fingerprint;

    let build_run_number = std::env::var("GITHUB_RUN_NUMBER")
        .ok()
        .filter(|v| !v.is_empty());

    Ok(AppMetadata {
        name,
        version,
        identifier,
        updater_endpoint,
        updater_active,
        pubkey_fingerprint,
        build_run_number,
    })
}

/// Pulled-updater-config view. Extracted from
/// `config.plugins.0.get("updater")` so the command stays
/// testable without spinning up a Tauri app.
struct UpdaterView {
    endpoint: Option<String>,
    active: bool,
    pubkey_fingerprint: Option<String>,
}

/// Read the updater block out of the compiled-in Tauri config.
///
/// Tauri stores plugin config under `config.plugins` as a
/// `HashMap<String, serde_json::Value>` (see
/// `tauri_utils::config::PluginConfig`). The updater plugin's own
/// shape is typed, but to avoid taking a dependency on
/// `tauri-plugin-updater`'s `Config` type from this module we
/// parse the four fields we care about directly from the JSON
/// value. The parser is forgiving: missing sections → `false` /
/// `None`, malformed values fall back to `None` rather than
/// failing the whole command.
fn read_updater_config(config: &TauriConfig) -> UpdaterView {
    let Some(value) = config.plugins.0.get("updater") else {
        return UpdaterView {
            endpoint: None,
            active: false,
            pubkey_fingerprint: None,
        };
    };

    let active = value
        .get("active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let endpoint = value
        .get("endpoints")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(String::from);

    let pubkey = value
        .get("pubkey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let pubkey_fingerprint = pubkey.map(fingerprint_hex);

    UpdaterView {
        endpoint,
        active,
        pubkey_fingerprint,
    }
}

/// First 16 hex chars of the SHA-256 of the supplied pubkey string.
///
/// This is NOT a security primitive — it's a stable identifier
/// for "which key is configured" so the E2E suite can detect
/// config drift (a different key in `tauri.conf.json` than what
/// the release workflow uses to sign artifacts) without ever
/// returning the raw signing material to the renderer.
fn fingerprint_hex(pubkey: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(pubkey.as_bytes());
    let hex = format!("{digest:x}");
    hex.chars().take(16).collect()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Building the metadata directly from a config shape lets the
    /// unit tests assert the updater block parsing without going
    /// through Tauri's runtime (which would need a real AppHandle
    /// in a test context).
    fn build_minimal_config_json(updater: Option<serde_json::Value>) -> serde_json::Value {
        let mut cfg = serde_json::json!({
            "productName": "Collier",
            "version": "0.1.0",
            "identifier": "com.gardenbaum.collier",
        });
        if let Some(u) = updater {
            cfg.as_object_mut()
                .expect("object")
                .insert("plugins".to_string(), serde_json::json!({ "updater": u }));
        }
        cfg
    }

    #[test]
    fn read_updater_returns_disabled_when_absent() {
        let cfg: TauriConfig =
            serde_json::from_value(build_minimal_config_json(None)).expect("config deserialises");
        let view = read_updater_config(&cfg);
        assert!(!view.active);
        assert!(view.endpoint.is_none());
        assert!(view.pubkey_fingerprint.is_none());
    }

    #[test]
    fn read_updater_extracts_endpoint_and_fingerprint_when_present() {
        let updater = serde_json::json!({
            "active": true,
            "endpoints": [
                "https://github.com/gardenbaum/Collier/releases/latest/download/latest.json"
            ],
            "pubkey": "dW5pdC10ZXN0LXB1YmtleS1iYXNlNjQ=",
        });
        let cfg: TauriConfig = serde_json::from_value(build_minimal_config_json(Some(updater)))
            .expect("config deserialises");
        let view = read_updater_config(&cfg);
        assert!(view.active);
        assert_eq!(
            view.endpoint.as_deref(),
            Some("https://github.com/gardenbaum/Collier/releases/latest/download/latest.json")
        );
        // 16 hex chars — exact value depends on the input key, so
        // we just assert length and shape.
        let fp = view.pubkey_fingerprint.expect("fingerprint");
        assert_eq!(fp.len(), 16);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn read_updater_treats_empty_pubkey_as_unset() {
        let updater = serde_json::json!({
            "active": true,
            "endpoints": ["https://example.com/latest.json"],
            "pubkey": "  ",
        });
        let cfg: TauriConfig = serde_json::from_value(build_minimal_config_json(Some(updater)))
            .expect("config deserialises");
        let view = read_updater_config(&cfg);
        // Whitespace-only pubkey is treated as "not configured" —
        // we'd rather fail loud at runtime check() than ship a
        // silent signature-mismatch path.
        assert!(view.pubkey_fingerprint.is_none());
    }

    #[test]
    fn read_updater_falls_back_to_safe_defaults_on_malformed_payload() {
        let updater = serde_json::json!({
            "active": "not a bool",
            "endpoints": "not an array",
        });
        let cfg: TauriConfig = serde_json::from_value(build_minimal_config_json(Some(updater)))
            .expect("config deserialises");
        let view = read_updater_config(&cfg);
        assert!(!view.active);
        assert!(view.endpoint.is_none());
        assert!(view.pubkey_fingerprint.is_none());
    }

    #[test]
    fn fingerprint_is_stable_across_calls() {
        let a = fingerprint_hex("dW5pdC10ZXN0LXB1YmtleS1iYXNlNjQ=");
        let b = fingerprint_hex("dW5pdC10ZXN0LXB1YmtleS1iYXNlNjQ=");
        assert_eq!(a, b);
    }

    #[test]
    fn fingerprint_changes_when_key_changes() {
        let a = fingerprint_hex("key-one");
        let b = fingerprint_hex("key-two");
        assert_ne!(a, b);
    }
}
