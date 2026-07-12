#!/usr/bin/env bash
# macos-self-sign-setup.sh
#
# Erstellt ein selbst-signiertes Code-Signing-Zertifikat fuer Collier auf
# deinem Mac. Resultat: collier-dev.p12 (Cert + Key) plus collier-dev.p12.base64
# (fuer GitHub Secret MAC_SIGN_P12_BASE64).
#
# Verwendung:
#   1. Skript auf den Mac kopieren
#   2. chmod +x macos-self-sign-setup.sh && ./macos-self-sign-setup.sh
#   3. Output in GitHub eintragen: Settings, Secrets and variables, Actions
#      - MAC_SIGN_P12_BASE64 = Inhalt von collier-dev.p12.base64
#      - MAC_SIGN_PASSWORD  = aus SECRETS.txt
#      - MAC_SIGN_IDENTITY   = Collier Dev ID
#   4. Optional: Cert in Keychain Access auf Always Trust setzen
#
# Voraussetzungen: macOS mit installiertem openssl, security und einer
# entsperrten login keychain.

set -euo pipefail

CERT_NAME="Collier Dev ID"
CERT_EMAIL="${USER_EMAIL:-collier-dev@local}"
TMPDIR="$(mktemp -d)"
trap "rm -rf $TMPDIR" EXIT

echo "=== Collier: Self-Signed Code-Signing Cert erstellen ==="
echo
echo "Cert-Name:   $CERT_NAME"
echo "Cert-Email:  $CERT_EMAIL"
echo "Temp-Dir:    $TMPDIR"
echo

# Passphrase generieren, falls nicht via env uebergeben
# Note: openssl rand -base64 24 liefert 32 base64-chars, davon strippen wir
# die URL-unsafe + und / raus.
if [ -z "${COLLIER_CERT_PASSWORD:-}" ]; then
  echo "ERROR: COLLIER_CERT_PASSWORD env var is required." >&2
  echo "Generate one with: openssl rand -base64 24 | tr -d '/+=' | head -c 32" >&2
  exit 1
else
  echo "Using COLLIER_CERT_PASSWORD from env var."
fi
echo

# Schritt 1: RSA-4096 Private Key
echo "[1/5] Erstelle RSA-4096 Private Key..."
openssl genrsa -out "$TMPDIR/collier-dev.key" 4096 2>/dev/null
echo "    OK"

# Schritt 2: Self-Signed Cert, 10 Jahre gueltig
echo "[2/5] Erstelle Self-Signed Cert, 10 Jahre gueltig..."
openssl req -new -x509 \
  -key "$TMPDIR/collier-dev.key" \
  -out "$TMPDIR/collier-dev.crt" \
  -days 3650 \
  -subj "/CN=${CERT_NAME}/O=Collier Dev/C=DE/emailAddress=${CERT_EMAIL}" \
  -addext "keyUsage=digitalSignature" \
  -addext "extendedKeyUsage=codeSigning" \
  2>/dev/null
echo "    OK"

# Schritt 3: PKCS#12 packen (Format fuer macOS Keychain und CI security import)
echo "[3/5] Packe Cert plus Key in PKCS#12 .p12..."
openssl pkcs12 -export \
  -inkey "$TMPDIR/collier-dev.key" \
  -in "$TMPDIR/collier-dev.crt" \
  -out "$TMPDIR/collier-dev.p12" \
  -name "$CERT_NAME" \
  -password "pass:${COLLIER_CERT_PASSWORD}" \
  2>/dev/null
echo "    OK"

# Schritt 4: Base64-encode fuer GH Secret (binary geht nicht in env vars)
echo "[4/5] Base64-encode .p12 fuer GH Secret..."
base64 -i "$TMPDIR/collier-dev.p12" -o "$TMPDIR/collier-dev.p12.b64"
echo "    OK"

# Schritt 5: Optional Cert in lokale Keychain importieren
echo
echo "[5/5] Cert in lokale Keychain importieren?"
echo "  Damit kannst du es in Keychain Access auf Always Trust setzen."
echo
read -r -p "Importieren? [y/N] " IMPORT_CHOICE
if [[ "$IMPORT_CHOICE" =~ ^[Yy]$ ]]; then
  security import "$TMPDIR/collier-dev.p12" \
    -k "${SECURITY_KEYCHAIN:-login.keychain-db}" \
    -P "$COLLIER_CERT_PASSWORD" \
    -T /usr/bin/codesign \
    -T /usr/bin/security
  echo
  echo "Cert importiert. Jetzt in Keychain Access:"
  echo "  1. Suche nach: $CERT_NAME"
  echo "  2. Doppelklick darauf"
  echo "  3. Trust-Section ausklappen"
  echo "  4. Code Signing auf Always Trust setzen"
  echo "  5. Fenster schliessen, Aenderungen werden automatisch gespeichert"
fi

# Artefakte sammeln
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/collier-cert-output}"
mkdir -p "$OUTPUT_DIR"
cp "$TMPDIR/collier-dev.p12" "$OUTPUT_DIR/collier-dev.p12"
cp "$TMPDIR/collier-dev.p12.b64" "$OUTPUT_DIR/collier-dev.p12.base64"
cp "$TMPDIR/collier-dev.crt" "$OUTPUT_DIR/collier-dev.crt"

# Credentials-File lokal. Heredoc mit eindeutigem Marker.
cat > "$OUTPUT_DIR/SECRETS.txt" <<SECRETS_EOF
# Collier Code-Signing Cert - Secrets fuer GitHub
# Diese Datei LOKAL loeschen sobald du sie in GitHub eingetragen hast!

GH_SECRET_MAC_SIGN_P12_BASE64=Inhalt der Datei collier-dev.p12.base64
GH_SECRET_MAC_SIGN_PASSWORD=aus SECRETS.txt Zeile darueber
GH_SECRET_MAC_SIGN_IDENTITY=Collier Dev ID
SECRETS_EOF
# Now overwrite with the ACTUAL secret values
printf "MAC_SIGN_PASSWORD=%s\nMAC_SIGN_IDENTITY=%s\n" "$COLLIER_CERT_PASSWORD" "$CERT_NAME" >> "$OUTPUT_DIR/SECRETS.txt"

echo
echo "=== Fertig ==="
echo
echo "Output-Dateien in: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"
echo
echo "Naechste Schritte:"
echo
echo "1. Trage in GitHub ein: Repo Settings, Secrets and variables, Actions"
echo "   - MAC_SIGN_P12_BASE64  = Inhalt von collier-dev.p12.base64"
echo "   - MAC_SIGN_PASSWORD   = steht in SECRETS.txt"
echo "   - MAC_SIGN_IDENTITY    = $CERT_NAME"
echo
echo "2. Optional, lokal: Cert auf Always Trust setzen in Keychain Access"
echo "   damit Gatekeeper Collier-Apps dauerhaft akzeptiert."
echo
echo "3. Loesche SECRETS.txt nach dem Eintragen in GitHub."
