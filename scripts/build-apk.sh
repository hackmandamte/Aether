#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if [ ! -f android/keystore.properties ]; then
  echo "No signing key yet. Run: sh scripts/make-keystore.sh" >&2
  exit 1
fi

export ANDROID_HOME=/tmp/android-sdk
export ANDROID_SDK_ROOT=/tmp/android-sdk
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
if [ ! -x /tmp/gradle-8.7/bin/gradle ]; then
  curl -fsSL "https://github.com/gradle/gradle-distributions/releases/download/v8.7.0/gradle-8.7-bin.zip" -o /tmp/gradle-8.7-bin.zip
  unzip -q /tmp/gradle-8.7-bin.zip -d /tmp
fi
/tmp/gradle-8.7/bin/gradle -p android assembleRelease --no-daemon
cp -f android/app/build/outputs/apk/release/app-release.apk public/aether.apk
ls -lh public/aether.apk
