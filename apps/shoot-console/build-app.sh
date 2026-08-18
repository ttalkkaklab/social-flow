#!/usr/bin/env bash
# build-app.sh — assembles the SwiftPM executable into a .app bundle and signs it.
#
#   ./build-app.sh          # build + sign
#   ./build-app.sh --run    # build, then run it
#
# Signing uses an Apple Development certificate if there is one, and falls back
# to ad-hoc (-) if not. Signed with a certificate, macOS recognizes a rebuild as
# the same app and screen-recording and microphone permissions survive. Ad-hoc
# has to be approved again on every build.
set -euo pipefail

cd "$(dirname "$0")"
APP_NAME="ShootConsole"
BUILD_DIR="build"
APP="${BUILD_DIR}/${APP_NAME}.app"

echo "==> Compiling"
swift build -c release --product "$APP_NAME"
BIN="$(swift build -c release --product "$APP_NAME" --show-bin-path)/${APP_NAME}"

echo "==> Assembling the bundle"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$APP_NAME"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# The recording is run by the ingest skill's record.sh as-is — give the app its
# own implementation and the .pid convention or the wait for the mov to finalize
# splits in two, which breaks ingest. Copy it into the bundle so the app runs on
# its own outside the repo (edit it and you have to rebuild).
REC_SRC="../../skills/ingest/references/record.sh"
[ -f "$REC_SRC" ] || { echo "ERROR: can't find record.sh: $REC_SRC" >&2; exit 1; }
cp "$REC_SRC" "$APP/Contents/Resources/record.sh"
chmod +x "$APP/Contents/Resources/record.sh"

echo "==> Signing"
IDENTITY="$(security find-identity -p codesigning -v 2>/dev/null \
  | awk -F'"' '/Apple Development|Developer ID Application/ {print $2; exit}')"
if [ -n "$IDENTITY" ]; then
  echo "    certificate: $IDENTITY"
else
  IDENTITY="-"
  echo "    no certificate — ad-hoc signing (permissions need approving again on every build)"
fi
codesign --force --sign "$IDENTITY" --timestamp=none "$APP" >/dev/null
codesign --verify --verbose=1 "$APP" 2>&1 | sed 's/^/    /'

echo "==> Done: $(cd "$BUILD_DIR" && pwd)/${APP_NAME}.app"
if [ "${1:-}" = "--run" ]; then
  # Always launch with open — running the binary straight from a terminal
  # inherits the terminal's screen-recording and microphone permissions, which
  # makes it look like the app doesn't need its own.
  pkill -x "$APP_NAME" 2>/dev/null || true
  open "$APP"
fi
