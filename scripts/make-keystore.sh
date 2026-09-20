#!/bin/sh
# Creates a fresh release signing key for the Aether APK.
#   sh scripts/make-keystore.sh
# Writes android/app/aether.keystore and android/keystore.properties (both git-ignored).
# Back both files up somewhere private: losing them means you can't update the installed app.
set -eu
cd "$(dirname "$0")/../android"

if [ -e app/aether.keystore ] || [ -e keystore.properties ]; then
  echo "A keystore already exists here; refusing to overwrite it." >&2
  exit 1
fi

KS_PASS="$(openssl rand -base64 33 | tr -d '/+=\n' | cut -c1-32)"
export KS_PASS

keytool -genkeypair -keystore app/aether.keystore -alias aether \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass:env KS_PASS -keypass:env KS_PASS \
  -dname "CN=Aether, O=Personal"

umask 077
cat > keystore.properties <<PROPS
storeFile=aether.keystore
storePassword=$KS_PASS
keyAlias=aether
keyPassword=$KS_PASS
PROPS

echo "Created android/app/aether.keystore and android/keystore.properties."
echo "Back them up privately; never commit or share them."
