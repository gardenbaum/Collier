# Releases

Release process, version management, and auto-update system.

## Overview

The release system provides:

- A tagged-release pipeline that builds cross-platform bundles
  (macOS `.dmg` + `.app`, Windows `.msi`, Linux `.AppImage`)
  with cryptographic signing.
- A reusable GitHub Actions E2E harness shared between CI and
  the release gate.
- A version-management script that keeps `package.json`,
  `Cargo.toml`, and `tauri.conf.json` in lockstep.
- An auto-updater that checks GitHub Releases on launch and
  prompts the user to install signed updates.

The contract for each piece is pinned by tests; see
`src/lib/release-pipeline.test.ts` (vitest unit) and
`tests/e2e/m6-release-hardening.spec.ts` (Xvfb E2E).

## Pipeline

The release workflow (`.github/workflows/release.yml`) is gated
on two jobs, in this order:

1. **`check-all`** — runs `bun run check:all` on `ubuntu-latest`
   (typecheck, lint, ast-grep, prettier, rustfmt, clippy
   `-D warnings`, vitest, `cargo test`).
2. **`e2e`** — `uses: ./.github/workflows/e2e.yml`, the
   reusable xvfb + tauri-driver harness shared with ci.yml.
   Builds the debug binary with `VITE_E2E=1`, seeds the Beads
   fixture, launches the app under tauri-driver, and runs the
   WebdriverIO spec suite.

Only after both gates are green does `publish-tauri` start,
which runs a 3-platform build matrix (`macos-latest`,
`windows-latest`, `ubuntu-22.04`) via `tauri-apps/tauri-action`.

A failing gate halts the entire release; the matrix's own
`fail-fast: false` is so a single platform's failure does not
hide the others in the CI log.

## Required GitHub Secrets

Configure these under **Settings → Secrets and variables →
Actions** before the first tagged release. The release workflow
maps them as follows:

| Secret name                            | Purpose                                                | Source                                                         |
| -------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `TAURI_PRIVATE_KEY`                    | Ed25519 private key used to sign release artifacts     | Contents of the file written by `tauri signer generate`        |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`   | Password that protects the private key (empty if none) | Whatever you passed to `tauri signer generate -p <password>`   |

These are mapped to the env-var names `tauri-action`
consumes (`TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) inside the `Build and
release` step. **Never commit the value of `TAURI_PRIVATE_KEY`
to the repo or paste it into a chat / issue tracker.**

`GITHUB_TOKEN` is provisioned automatically by GitHub Actions
for every workflow run; no setup is required for it.

## Initial Setup

### 1. Generate signing keys

```bash
bun install -g @tauri-apps/cli
tauri signer generate -w ~/.tauri/collier.key
# Enter a password when prompted (or leave empty for none)
# Outputs:
#   - private key  -> ~/.tauri/collier.key     (NEVER commit)
#   - public key   -> printed to stdout        (goes into tauri.conf.json)
```

### 2. Add the GitHub secret

In Settings → Secrets and variables → Actions:

- **Name:** `TAURI_PRIVATE_KEY`
- **Value:** the *entire contents* of `~/.tauri/collier.key`
  (the `-----BEGIN PRIVATE KEY-----` envelope is part of the
  payload — paste the full file).

Repeat for `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with the
password you used in step 1 (or an empty value).

### 3. Embed the matching public key

The `tauri.conf.json::plugins.updater.pubkey` value MUST be the
public-key half of the `TAURI_PRIVATE_KEY` you uploaded. If the
two do not match, every existing user gets an "Invalid
signature" error on the next update check and the auto-updater
is effectively bricked until a fixed release ships.

```bash
# Extract the public key from the keyfile and update tauri.conf.json:
PUBKEY=$(tauri signer sign --help 2>/dev/null | head -1) # placeholder
# (use whatever extraction the @tauri-apps/cli version supports;
#  the printed public key from `signer generate` is what goes
#  into the `pubkey` field)
```

Verify the pairing locally:

```bash
# Quick sanity check — the public key embedded in tauri.conf.json
# should match the one derived from the private key in
# ~/.tauri/collier.key:
grep '"pubkey"' src-tauri/tauri.conf.json
```

### 4. Pin the updater endpoint

The `plugins.updater.endpoints` array must point at the GitHub
Releases `latest.json` for *this* repo. A wrong endpoint (e.g.
a fork's `latest.json`) silently misroutes updates.

```jsonc
"plugins": {
  "updater": {
    "active": true,
    "endpoints": [
      "https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"
    ],
    "dialog": true,
    "pubkey": "<public key from step 1>"
  }
}
```

The release-hardening E2E spec asserts this endpoint is the
one bundled into the running app's `tauri.conf.json` (via
`commands.getAppMetadata()`'s `updaterEndpoint`).

## Release Process

### Simple Method

```bash
bun run release:prepare v1.0.0
```

The script (see `scripts/prepare-release.js`):

1. Verifies the working tree is clean.
2. Runs `bun run check:all` (the same gate CI runs).
3. Updates `package.json`, `Cargo.toml`, and
   `tauri.conf.json` to the requested version in lockstep
   (the version sync is the script's main contract — see
   `src/lib/release-pipeline.test.ts` for the corresponding
   vitest guard).
4. Re-runs the build to confirm `cargo check` still passes
   after the version bump.
5. Prints (and optionally executes) the `git add / commit /
   tag / push` commands.

Pushing the tag triggers `.github/workflows/release.yml`,
which runs the two gates then publishes a draft GitHub
Release. **The draft must be published manually** — the
workflow does not auto-publish.

### Manual Method

```bash
# 1. Bump versions in all three files
# 2. Run the local gates
bun run check:all
# 3. Commit, tag, push
git add .
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

## Version Strategy

Semantic versioning (`v1.0.0`):

- **Major** (1.x.x): Breaking changes
- **Minor** (x.1.x): New features, backwards compatible
- **Patch** (x.x.1): Bug fixes

All three files must carry the same version. `scripts/prepare-release.js`
enforces this when invoked; the vitest guard
(`src/lib/release-pipeline.test.ts`) fails CI on drift:

- `package.json` → `"version": "1.0.0"`
- `src-tauri/Cargo.toml` → `version = "1.0.0"`
- `src-tauri/tauri.conf.json` → `"version": "1.0.0"`

## Auto-Update System

### Behaviour

- Checks for updates 5 seconds after app launch (driven by
  `App.tsx`'s `runUpdateCheck`, scheduled once on mount).
- Shows the system confirmation dialog when an update is
  available (the updater plugin's `dialog: true` setting in
  `tauri.conf.json`).
- Downloads and installs in the background; prompts for a
  relaunch after install.
- Fails silently on network issues — a missed check is not a
  crash.

### Update Flow

```
App Launch → (5s delay) → Check GitHub → Show Dialog → Download → Install → Restart
```

### Manual Update Check

Users can manually trigger a check via:

- **Menu**: App → Check for Updates
- **Command Palette**: Cmd+K → "Check for Updates"

Both paths invoke the same `runUpdateCheck` helper in
`App.tsx`.

### Verification surface for tests

`commands.getAppMetadata()` (see
`src-tauri/src/commands/app_metadata.rs` and the
auto-generated `src/lib/bindings.ts`) surfaces the bundled
config to the renderer. Under the `VITE_E2E=1` build flag, the
result is exposed on `globalThis.__collierAppMetadata__` for
the E2E suite:

- `name` — `productName` from `tauri.conf.json`
- `version` — semver from `tauri.conf.json`
- `identifier` — reverse-DNS bundle id
- `updaterEndpoint` — first entry of `plugins.updater.endpoints`
- `updaterActive` — `plugins.updater.active`
- `pubkeyFingerprint` — first 16 hex chars of SHA-256 of the
  configured pubkey (stable across runs, never exposes the
  raw signing material)

The release-hardening E2E spec uses this surface to assert
the bundled config matches the release expectations, so a
mistakenly-pointed endpoint or a stripped pubkey fails CI
before any tag is cut.

## Release Artifacts

Each release produces:

- **macOS**: `.dmg` installer + `.app` bundle
- **Windows**: `.msi` installer
- **Linux**: `.AppImage` (single-file, runs without install)
- **Auto-updater**: `latest.json` manifest + `.sig` signature
  per platform bundle

The `AppImage` is the only Linux artifact by default. If
`.deb` / `.rpm` are needed, add the bundle name to the
`args:` line under the `ubuntu-22.04` matrix entry in
`.github/workflows/release.yml`.

## Security

- Updates are signed with Ed25519; `tauri-action` produces
  the `.sig` sidecar next to each installer, and the bundled
  pubkey in `tauri.conf.json` is used at update-check time to
  reject any tampered payload.
- The `secrets.TAURI_PRIVATE_KEY` value never leaves GitHub
  Actions. The matching pubkey is committed to the repo —
  the private key stays in GitHub's secret store.
- The `pubkeyFingerprint` exposed via `getAppMetadata()` is
  the only signing-key surface the renderer ever sees; the
  raw key bytes never reach the webview.
- `SECURITY.md` covers vulnerability reporting, not signing
  key rotation. To rotate: regenerate the key, upload the new
  private key to GitHub Secrets, replace `pubkey` in
  `tauri.conf.json`, ship a release. Existing users pick up
  the new pubkey with the next update check.

## Troubleshooting

| Issue                          | Solution                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Workflow doesn't trigger       | Ensure the tag starts with `v` and is pushed (`git push origin --tags`)                   |
| `check:all` gate fails         | Run `bun run check:all` locally and fix the reported file                                  |
| `e2e` gate times out           | The xvfb harness takes 5-10 min cold; check `tauri-driver.log` in the CI artifact         |
| `Invalid signature` on update  | `TAURI_PRIVATE_KEY` and `tauri.conf.json::pubkey` are out of sync — see step 3 above      |
| Updates not detected           | Verify `plugins.updater.endpoints` points at the right GitHub repo's `latest.json`        |
| `cargo check` fails post-bump  | A dependency changed its MSRV; investigate before re-running `prepare-release.js`         |