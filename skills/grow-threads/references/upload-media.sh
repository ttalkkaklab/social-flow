#!/usr/bin/env bash
# Media hosting upload — on success prints exactly one line, the public URL, to stdout.
#
# The SNS publish tools take images and videos as public URLs. This script is where
# that URL gets made, and any hosting that satisfies the contract below plugs in.
# The operator points MEDIA_UPLOAD_URL at their own endpoint — there is no default.
#
#   Usage: upload-media.sh <media-file>        # jpg/png/webp/gif ≤10MB, mp4 ≤50MB
#   Needs: MEDIA_UPLOAD_URL       upload endpoint (e.g. https://<my-domain>/api/media)
#          MEDIA_UPLOAD_API_KEY   that endpoint's API key (never write the value in a file)
#   Optional: MEDIA_UPLOAD_TIMEOUT seconds (default 60 — for videos of tens of MB, 300 recommended)
#          the old names MELEON_MEDIA_URL · MELEON_MEDIA_API_KEY · MELEON_UPLOAD_TIMEOUT are also read
#
# Contract the endpoint must satisfy:
#   POST <MEDIA_UPLOAD_URL>  x-api-key header + raw byte body → 201 {data:{url}}
#   The url in the response must be an unauthenticated public GET — platform
#   crawlers have to fetch it, so the round-trip check happens right here after
#   the upload. An unverified URL never goes to a publish tool.
#
# exit: 0 success / 65 file problem (size · type) / 69 service down (404 not
#       deployed · 503 key unset) / 75 transient (429 cap — retry next tick) /
#       77 key problem / 70 round-trip check failed / 78 client config missing
set -euo pipefail

FILE=${1:?usage: upload-media.sh <media-file>}

API=${MEDIA_UPLOAD_URL:-${MELEON_MEDIA_URL:-}}
KEY=${MEDIA_UPLOAD_API_KEY:-${MELEON_MEDIA_API_KEY:-}}
TIMEOUT=${MEDIA_UPLOAD_TIMEOUT:-${MELEON_UPLOAD_TIMEOUT:-60}}

[ -n "$API" ] || {
  echo "MEDIA_UPLOAD_URL unset — no media hosting endpoint, turning the image stage off" >&2; exit 78; }
[ -n "$KEY" ] || {
  echo "MEDIA_UPLOAD_API_KEY unset — turning the image stage off" >&2; exit 78; }
[ -f "$FILE" ] || { echo "file not found: $FILE" >&2; exit 66; }

RES=$(curl -sS --max-time "$TIMEOUT" -w '\n%{http_code}' -X POST "$API" \
  -H "x-api-key: $KEY" \
  --data-binary @"$FILE")
CODE=${RES##*$'\n'}
BODY=${RES%$'\n'*}

case "$CODE" in
  201) ;;
  401) echo "401 — API key mismatch (differs from the key set on the hosting server)" >&2; exit 77 ;;
  404) echo "404 — endpoint missing (check the MEDIA_UPLOAD_URL path and deploy state)" >&2; exit 69 ;;
  413) echo "413 — over the cap (images 10MB · video 50MB). Shrink and retry" >&2; exit 65 ;;
  415) echo "415 — not jpg/png/webp/gif/mp4 (judged from the leading bytes)" >&2; exit 65 ;;
  429) echo "429 — upload cap (60 per 10 minutes). Next tick" >&2; exit 75 ;;
  503) echo "503 — API key unset on the hosting server (check the deploy secret)" >&2; exit 69 ;;
  *)   echo "HTTP $CODE — ${BODY:0:300}" >&2; exit 1 ;;
esac

URL=$(printf '%s' "$BODY" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["url"])') || {
  echo "201 but response parsing failed — ${BODY:0:300}" >&2; exit 1; }

# Round-trip check — publishing only works if platform crawlers can fetch it
GET_CODE=$(curl -sSo /dev/null --max-time 30 -w '%{http_code}' "$URL")
[ "$GET_CODE" = 200 ] || {
  echo "upload succeeded but GET $URL returned $GET_CODE — do not publish with this URL" >&2; exit 70; }

echo "$URL"
