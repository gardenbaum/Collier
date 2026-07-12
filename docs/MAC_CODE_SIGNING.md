# macOS Code-Signing Setup

This document explains how to set up a self-signed code-signing certificate so the
GitHub Actions `build.yml` workflow produces macOS artifacts that Gatekeeper
accepts without the "unidentified developer" warning.

This is **NOT a notarized Developer ID**. For distribution to other users, you'll
still need an Apple Developer Program membership ($99/year). For personal use
(signing your own builds), a self-signed cert is enough.

## What This Gets You

| Setup | First launch on your Mac |
|---|---|
| Unsigned build (current) | Gatekeeper blocks; you must run `xattr -d com.apple.quarantine Collier.app` or right-click -> Open -> Open anyway |
| Self-signed build (this guide) | Cert prompt -> Always Open -> app launches without warnings forever |
| Apple Developer ID | No prompt, instant launch |

## Setup (5 minutes, one-time)

### 1. Generate the certificate

On your Mac, generate a passphrase for the .p12 file. Use any random 32-character
string. The simplest way:

1. Generate it with openssl in a terminal and copy the output.
2. Or use any password manager's "generate random password" feature.

Then export it before running the setup script:

```bash
# Use any 32-character random string.
# Or generate one with any cryptographically secure random source
# Set env var to a 32-char random string. Do NOT use this literal value.
export COLLIER_CERT_PASSWORD=[your-32-char-random-string]
```

Then run the setup script (it will read the passphrase from the env var):

```bash
chmod +x scripts/macos-self-sign-setup.sh
./macos-self-sign-setup.sh
```

The script will:

1. Generate a 4096-bit RSA private key + self-signed certificate (`Collier Dev ID`)
2. Pack them into a `.p12` file (PKCS#12 format) protected by the passphrase
3. Base64-encode the `.p12` (required because GitHub Secrets don't accept binary)
4. Optionally import the cert into your macOS Keychain

All outputs go to `~/collier-cert-output/`.

### 2. Add GitHub Secrets

In the GitHub repository, go to **Settings -> Secrets and variables -> Actions** and create three new repository secrets:

| Secret name | Value |
|---|---|
| `MAC_SIGN_P12_BASE64` | Paste the entire contents of `~/collier-cert-output/collier-dev.p12.base64` |
| `MAC_SIGN_PASSWORD` | The passphrase from your shell env (or recreate it -- you saved it somewhere safe, right?) |
| `MAC_SIGN_IDENTITY` | `Collier Dev ID` (or whatever you set `CERT_NAME` to in the script) |

### 3. Trust the cert locally (recommended)

On your Mac:

1. Double-click `~/collier-cert-output/collier-dev.p12` to import it into the login keychain (if the setup script didn't already do this)
2. Open **Keychain Access.app**
3. Search for `Collier Dev ID`
4. Double-click the cert, expand the **Trust** section
5. Set **Code Signing** to **Always Trust**
6. Close the window (changes are saved automatically)

### 4. Verify

Run the workflow manually:

```bash
gh workflow run build.yml --repo gardenbaum/Collier --ref main
gh run watch
```

After the macOS job finishes, download the `.app` from the workflow artifacts. Verify the signature:

```bash
codesign -dv --verbose=4 Collier.app
```

You should see `Authority=Collier Dev ID` and `Signature=adhoc` or similar.

### 5. Install on your Mac

Copy the `.app` to `/Applications` and launch it. On first launch:

- macOS shows "Collier Dev ID" cannot be opened
- Click **Open** (NOT "Move to Trash")
- macOS shows a second confirmation: "Are you sure?"
- Click **Open**
- Tick the box **Always Open These Types of Files** if available

Subsequent launches are warning-free.

## Cleaning Up

After entering the secrets in GitHub, the passphrase you used is only stored in
GitHub Secrets (encrypted). If you want to keep a local backup, save it in your
password manager. Don't commit it anywhere.

## Rotating the Cert

If the cert expires (10 years from creation) or you want to rotate for security
reasons, re-run the setup script. The new `.p12` and passphrase overwrite the
old GitHub Secrets on next push.

## Why not Apple Developer ID?

| | Self-signed | Apple Developer ID |
|---|---|---|
| Cost | Free | $99/year |
| Notarization | No | Required for distribution |
| Gatekeeper on **your** Mac | Trust once, then warning-free | Warning-free |
| Gatekeeper on **other** Macs | Warning (other users can't trust your cert) | Warning-free |
| CI setup complexity | Low | Medium (need notarization step) |
| Auto-updates (Tauri updater) | Works (uses minisign pubkey, separate concern) | Works |

Pick self-signed if you're the only user. Pick Developer ID if you distribute
builds to other people.
