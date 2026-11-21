#!/usr/bin/env bash
# Creates the private signing key used for every Barrelstorm release and prints the four values to store as
# GitHub repository secrets. Run it once, on your own computer, and keep the generated files private.
# Requires: keytool (JDK) and base64. Optional: the GitHub CLI (gh), which can store the secrets for you.
set -euo pipefail

OUT="${1:-barrelstorm-release.jks}"
ALIAS="barrelstorm"
PASS="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"

if [ -e "$OUT" ]; then echo "$OUT already exists, refusing to overwrite it." >&2; exit 1; fi

keytool -genkeypair -noprompt -keystore "$OUT" -storetype PKCS12 -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 36500 -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=Barrelstorm, O=Barrelstorm"

B64="$(base64 < "$OUT" | tr -d '\n')"
echo
echo "Created $OUT. Back it up somewhere safe: if you lose it, installed copies can never be updated."
if command -v gh >/dev/null 2>&1; then
  REPO="${REPO:-jt-coder321/barrelstorm}"
  printf '%s' "$B64"  | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
  printf '%s' "$PASS" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
  printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS --repo "$REPO"
  echo "Stored the secrets in $REPO."
else
  echo "Add these as repository secrets (Settings > Secrets and variables > Actions):"
  echo "  ANDROID_KEYSTORE_BASE64   = $B64"
  echo "  ANDROID_KEYSTORE_PASSWORD = $PASS"
  echo "  ANDROID_KEY_ALIAS         = $ALIAS"
fi
