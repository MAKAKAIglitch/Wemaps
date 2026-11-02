#!/usr/bin/env sh
# Wemaps Gradle bootstrap. The distribution is verified before it is installed.
set -eu

GRADLE_VERSION="9.5.1"
GRADLE_SHA256="bafc141b619ad6350fd975fc903156dd5c151998cc8b058e8c1044ab5f7b031f"
GRADLE_HOME_DIR="${GRADLE_USER_HOME:-$HOME/.gradle}"
INSTALL_DIR="$GRADLE_HOME_DIR/wemaps/gradle-$GRADLE_VERSION"
GRADLE_BIN="$INSTALL_DIR/bin/gradle"

if [ ! -x "$GRADLE_BIN" ]; then
    command -v curl >/dev/null 2>&1 || { echo "curl is required to bootstrap Gradle." >&2; exit 1; }
    command -v unzip >/dev/null 2>&1 || { echo "unzip is required to bootstrap Gradle." >&2; exit 1; }

    mkdir -p "$(dirname "$INSTALL_DIR")"
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM
    ZIP_FILE="$TMP_DIR/gradle-$GRADLE_VERSION-bin.zip"

    echo "Downloading Gradle $GRADLE_VERSION..."
    curl --fail --location --retry 3 --retry-delay 2 \
        "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" \
        --output "$ZIP_FILE"

    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s  %s\n' "$GRADLE_SHA256" "$ZIP_FILE" | sha256sum --check --status
    elif command -v shasum >/dev/null 2>&1; then
        ACTUAL_SHA="$(shasum -a 256 "$ZIP_FILE" | awk '{print $1}')"
        [ "$ACTUAL_SHA" = "$GRADLE_SHA256" ] || { echo "Gradle archive SHA-256 mismatch." >&2; exit 1; }
    else
        echo "sha256sum or shasum is required to verify Gradle." >&2
        exit 1
    fi

    echo "Verified Gradle archive. Installing..."
    unzip -q "$ZIP_FILE" -d "$TMP_DIR"
    rm -rf "$INSTALL_DIR"
    mv "$TMP_DIR/gradle-$GRADLE_VERSION" "$INSTALL_DIR"
fi

exec "$GRADLE_BIN" "$@"
