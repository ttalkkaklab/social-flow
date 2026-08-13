#!/usr/bin/env bash
# build-app.sh — SwiftPM 실행 파일을 .app 번들로 조립하고 서명한다.
#
#   ./build-app.sh          # 빌드 + 서명
#   ./build-app.sh --run    # 빌드 후 바로 실행
#
# 서명은 Apple Development 인증서가 있으면 그걸 쓰고, 없으면 ad-hoc(-)으로
# 넘어간다. 인증서로 서명하면 재빌드해도 macOS 가 같은 앱으로 인식해
# 화면 기록·마이크 권한이 유지된다. ad-hoc 은 빌드마다 다시 승인해야 한다.
set -euo pipefail

cd "$(dirname "$0")"
APP_NAME="ShootConsole"
BUILD_DIR="build"
APP="${BUILD_DIR}/${APP_NAME}.app"

echo "==> 컴파일"
swift build -c release --product "$APP_NAME"
BIN="$(swift build -c release --product "$APP_NAME" --show-bin-path)/${APP_NAME}"

echo "==> 번들 조립"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$APP_NAME"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# 녹화 실행부는 ingest 스킬의 record.sh 를 그대로 쓴다 — 앱이 자체 구현을
# 두면 .pid 규약이나 mov 확정 대기가 갈라져 ingest 가 깨진다. 번들에 복사해
# 앱이 저장소 밖에서도 혼자 돌게 한다(수정 시 재빌드 필요).
REC_SRC="../../skills/ingest/references/record.sh"
[ -f "$REC_SRC" ] || { echo "ERROR: record.sh 를 찾을 수 없음: $REC_SRC" >&2; exit 1; }
cp "$REC_SRC" "$APP/Contents/Resources/record.sh"
chmod +x "$APP/Contents/Resources/record.sh"

echo "==> 서명"
IDENTITY="$(security find-identity -p codesigning -v 2>/dev/null \
  | awk -F'"' '/Apple Development|Developer ID Application/ {print $2; exit}')"
if [ -n "$IDENTITY" ]; then
  echo "    인증서: $IDENTITY"
else
  IDENTITY="-"
  echo "    인증서 없음 — ad-hoc 서명 (빌드할 때마다 권한을 다시 승인해야 함)"
fi
codesign --force --sign "$IDENTITY" --timestamp=none "$APP" >/dev/null
codesign --verify --verbose=1 "$APP" 2>&1 | sed 's/^/    /'

echo "==> 완료: $(cd "$BUILD_DIR" && pwd)/${APP_NAME}.app"
if [ "${1:-}" = "--run" ]; then
  # 반드시 open 으로 띄운다 — 터미널에서 바이너리를 직접 실행하면 터미널의
  # 화면 기록·마이크 권한을 물려받아, 앱 자체 권한이 없어도 되는 것처럼 보인다.
  pkill -x "$APP_NAME" 2>/dev/null || true
  open "$APP"
fi
