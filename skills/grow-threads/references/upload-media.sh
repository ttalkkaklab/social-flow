#!/usr/bin/env bash
# 미디어 호스팅 업로드 — 성공 시 공개 URL 한 줄만 stdout 에 출력한다.
#
# SNS 게시 툴은 이미지·영상을 공개 URL 로 받는다. 이 스크립트는 그 URL 을 만드는
# 자리이며, 아래 계약을 만족하는 호스팅이면 무엇이든 붙는다. 쓰는 사람이 자기
# 엔드포인트를 MEDIA_UPLOAD_URL 로 지정한다 — 기본값은 없다.
#
#   사용:  upload-media.sh <미디어파일>        # jpg/png/webp/gif ≤10MB, mp4 ≤50MB
#   필요:  MEDIA_UPLOAD_URL       업로드 엔드포인트 (예: https://<내 도메인>/api/media)
#          MEDIA_UPLOAD_API_KEY   그 엔드포인트의 API 키 (값은 파일에 적지 않는다)
#   선택:  MEDIA_UPLOAD_TIMEOUT 초 (기본 60 — 수십 MB 영상이면 300 권장)
#          옛 이름 MELEON_MEDIA_URL·MELEON_MEDIA_API_KEY·MELEON_UPLOAD_TIMEOUT 도 읽는다
#
# 엔드포인트가 만족해야 하는 계약:
#   POST <MEDIA_UPLOAD_URL>  x-api-key 헤더 + raw 바이트 본문 → 201 {data:{url}}
#   응답의 url 은 무인증 공개 GET 이어야 한다 — 플랫폼 크롤러가 가져가야 하므로
#   업로드 후 왕복 검증까지 여기서 한다. 검증 안 된 URL 은 게시 툴에 넘기지 않는다.
#
# exit: 0 성공 / 65 파일 문제(크기·타입) / 69 서비스 미가동(404 미배포·503 키
#       미설정) / 75 일시적(429 상한 — 다음 틱에 재시도) / 77 키 문제 / 70 왕복
#       검증 실패 / 78 클라이언트 설정 미비
set -euo pipefail

FILE=${1:?사용법: upload-media.sh <미디어파일>}

API=${MEDIA_UPLOAD_URL:-${MELEON_MEDIA_URL:-}}
KEY=${MEDIA_UPLOAD_API_KEY:-${MELEON_MEDIA_API_KEY:-}}
TIMEOUT=${MEDIA_UPLOAD_TIMEOUT:-${MELEON_UPLOAD_TIMEOUT:-60}}

[ -n "$API" ] || {
  echo "MEDIA_UPLOAD_URL 미설정 — 미디어 호스팅 엔드포인트가 없어 이미지 단계를 끈다" >&2; exit 78; }
[ -n "$KEY" ] || {
  echo "MEDIA_UPLOAD_API_KEY 미설정 — 이미지 단계를 끈다" >&2; exit 78; }
[ -f "$FILE" ] || { echo "파일 없음: $FILE" >&2; exit 66; }

RES=$(curl -sS --max-time "$TIMEOUT" -w '\n%{http_code}' -X POST "$API" \
  -H "x-api-key: $KEY" \
  --data-binary @"$FILE")
CODE=${RES##*$'\n'}
BODY=${RES%$'\n'*}

case "$CODE" in
  201) ;;
  401) echo "401 — API 키 불일치 (호스팅 서버에 설정된 키와 다름)" >&2; exit 77 ;;
  404) echo "404 — 엔드포인트 없음 (MEDIA_UPLOAD_URL 경로·배포 상태 확인)" >&2; exit 69 ;;
  413) echo "413 — 상한 초과 (이미지 10MB · 영상 50MB). 줄여서 다시" >&2; exit 65 ;;
  415) echo "415 — jpg/png/webp/gif/mp4 아님 (바이트 앞머리 판정)" >&2; exit 65 ;;
  429) echo "429 — 업로드 상한(10분 60건). 다음 틱에" >&2; exit 75 ;;
  503) echo "503 — 호스팅 서버에 API 키 미설정 (배포 시크릿 확인)" >&2; exit 69 ;;
  *)   echo "HTTP $CODE — ${BODY:0:300}" >&2; exit 1 ;;
esac

URL=$(printf '%s' "$BODY" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["url"])') || {
  echo "201 인데 응답 파싱 실패 — ${BODY:0:300}" >&2; exit 1; }

# 왕복 검증 — 플랫폼 크롤러가 가져갈 수 있어야 게시가 성립한다
GET_CODE=$(curl -sSo /dev/null --max-time 30 -w '%{http_code}' "$URL")
[ "$GET_CODE" = 200 ] || {
  echo "업로드는 됐지만 GET $URL 이 $GET_CODE — 이 URL 로 게시 금지" >&2; exit 70; }

echo "$URL"
