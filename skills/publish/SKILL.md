---
name: publish
description: >
  This skill should be used when the user asks to "게시해", "올려줘", "SNS 게시",
  "publish to social", "스레드/인스타/페북/유튜브에 올려", or after production is
  complete. Takes the finished per-platform content under data/<channel>/<topic>/output/
  through account checks, public media hosting, a mandatory HITL approval gate, and
  publishes via the social-flow MCP platform tools (threads/instagram/facebook/
  youtube_publish — immediate public post), then records permalinks in publish-log.md.
argument-hint: "<채널> <주제> [플랫폼CSV|auto]"
# 의도적으로 *_publish/facebook_comment 를 사전 승인하지 않는다 — 비가역 게시 호출마다
# 네이티브 권한 프롬프트가 HITL 승인 게이트와 별개의 2차 방어선으로 작동해야 한다.
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# 플랫폼 게시 — HITL 승인 후 즉시 공개

`output/` 의 완성 산출물을 플랫폼별 게시 툴로 게시한다. **게시 툴은 검토 게이트가
없어 호출 = 즉시 외부 공개**다 — 이 스킬의 승인 게이트(§2)와, 게시 툴 호출 시마다
뜨는 네이티브 권한 프롬프트(사전 승인하지 않음)가 이중 방어선이다. 권한 프롬프트를
"항상 허용"으로 승격하도록 유도하지 않는다.

## 절대 규칙 (위반 시 즉시 중단)

1. **게시 전 사용자 승인 필수 (HITL)** — 호출 전 반드시 AskUserQuestion 으로
   플랫폼별 최종본 전문을 제시하고 명시 승인을 받는다. IG 는 게시 후 이미지 교체
   불가, 전 플랫폼 브랜드 계정에 박제된다(비가역).
2. **크로스포스팅 복붙 금지** — 같은 문장이 두 플랫폼에 그대로 들어가면 안 된다.
3. **토큰 평문 노출 금지** — 토큰은 `~/.config/social-flow/<채널slug>/` 파일로만
   다룬다. curl 디버깅 시에도 `$(cat …)` 인라인 참조만, 토큰 값·access_token
   필드를 대화에 출력하지 않는다.
7. **모든 게시·댓글 툴 호출에 `channel: <채널slug>` 를 지정한다** — 이 스킬의
   1번째 인자(data/<채널slug>)를 그대로 쓴다. 채널 지정 시 그 채널 토큰만 쓰며
   기본 토큰으로 폴백하지 않는다(오계정 게시 방지 — 서버 계약). 채널 토큰이 없다는
   에러가 오면 `references/token-setup.md` 의 채널 디렉토리 절차를 안내한다.
4. **사실 왜곡 금지** — 승인된 산출물 범위 안에서만 게시. 캡션을 즉석에서 고쳐야
   하면 수정본으로 승인 게이트를 다시 거친다.
5. **한도 존중** — Threads 250건/24h, IG 100건/24h, YouTube 업로드 일 100회
   (videos.insert 전용 Video Uploads 버킷·호출당 1유닛 — 회차 게시를 아낄 이유 없음).
6. **링크는 본문이 아니라 댓글/답글로** — Threads 는 게시 성공 직후 응답 postId 를
   `replyToId` 로 넣은 링크 답글, FB 는 `facebook_comment` 첫 댓글.
   **링크 댓글까지 게시돼야 그 플랫폼의 게시가 완료된 것이다.**

## 절차

### 0. 사전 점검 (세션당 1회)

- `output/` 산출물 존재 + `storyboard.md` `status: produced` 확인 — 아니면
  `/social-flow:produce` 부터 안내.
- `sns_account_check` 를 **`channel: <채널slug>` 로 호출**해 이 채널의 플랫폼별
  토큰 상태를 점검 — **게시 계정이 어디인지 이 결과로 확인·보고한다**(계정은
  설정이 아니라 그 채널 토큰의 /me 로 결정). 점검 결과의 계정명이 채널 브랜드와
  다르면 게시를 중단하고 사용자에게 확인한다. 무효 플랫폼은 대상에서 제외하고
  사유를 보고. 게시 툴이 ListTools 에 아예 없으면 토큰 파일 미설정이다 —
  `references/token-setup.md` 의 채널 디렉토리(`~/.config/social-flow/<채널slug>/`)
  절차를 안내한다. Meta 계열 토큰은 60일 갱신형 — 파일 나이 45일 초과 시 갱신을
  권고한다.

### 1. HITL 승인 게이트 (호스팅보다 먼저 — 미승인 콘텐츠를 공개 URL 에 올리지 않는다)

AskUserQuestion 으로 플랫폼별 최종본을 제시한다 — 본문/캡션 전문, 미디어 **로컬
경로**(cover.jpg·video.mp4), 해시태그, Threads 답글·FB 첫 댓글 문안까지 전부,
게시 예정 계정(계정 점검 결과). 선택지: [전체 게시 / 일부 플랫폼만 / 수정 후
재제시 / 중단]. **이 게이트 통과가 곧 실게시 승인이다.** 수정 요청이면 반영 후
다시 게이트.

### 2. 미디어 공개 URL 확보 (IG 필수 · Threads 이미지 · FB 이미지/영상)

게시 툴의 `imageUrl`/`videoUrl` 은 **공개 접근 가능한 HTTPS URL** 이어야 한다 —
플랫폼이 크롤하며 로컬 경로·인증 URL 불가 (YouTube 만 로컬 파일 업로드라 호스팅
불요).

- 호스팅은 profile.md §4 에 지정된 방법을 쓴다. **미정이면 게시를 보류하고
  사용자에게 호스팅 방법을 묻는다.**
- 임시 터널(`python3 -m http.server` + `cloudflared tunnel`)을 쓴 경우:
  ① 서빙 디렉토리는 게시 파일만 담은 전용 디렉토리로 ② 게시 완료 후 두 프로세스를
  죽이고 `pgrep -fl "cloudflared|http.server"` **빈 출력 확인 후에만** 완료 보고
  ③ 작업 시작 시에도 같은 명령으로 이전 세션 잔존 터널을 점검한다.
- 게시 전 `curl -sI <URL>` 로 200·MIME 확인.
- **§1 에서 승인받은 파일과 호스팅된 파일이 다르거나, 승인 후 URL 이 바뀌면
  (터널 재시작 등) §1 게이트를 다시 거친다.**

### 3. 게시 (승인된 플랫폼만)

아래 모든 게시·댓글 툴 호출에 `channel: <채널slug>` 를 넣는다(규칙 7).

경성 순서 제약은 하나다 — **IG 릴스가 Threads 보다 먼저** (Threads 답글의
"풀영상" 링크가 IG permalink 라서). IG 게시가 실패하면 Threads 는 보류하고
링크 대체(YouTube permalink 등)를 사용자에게 묻는다. 나머지 플랫폼 순서는 자유.

1. **YouTube**: `youtube_publish` — `output/youtube/meta.md` 의 title/description,
   `videoFilePath`=output/video/video.mp4, **`thumbnailFilePath`=cover.jpg 필수**
   (미지정 시 임의 프레임이 썸네일이 된다). `thumbnailWarning` 이 오면 게시는
   성공 — 경고 내용을 보고한다.
2. **Instagram**: `instagram_publish` — `videoUrl`(공개 URL) + caption.
3. **Threads**: `threads_publish` — 커버 이미지 본문 게시 → 응답 postId 를
   `replyToId` 로 **링크 답글 즉시 게시** (승인분 문안 그대로).
4. **Facebook**: `facebook_publish`(videoUrl + 본문) → 응답 postId 로
   `facebook_comment` **첫 댓글(원문/관련 링크) 즉시 게시**.

실패 처리: 에러를 그대로 보고하고 **같은 호출을 맹목 재시도하지 않는다**(게시
API 비멱등 — 타임아웃 후에는 permalink/최근 미디어 조회로 중복 여부 먼저 확인).
링크 댓글만 실패하면 댓글 호출만 재시도, 끝내 실패하면 postId 와 사유를 남기고
수동 처리를 안내한다.

### 4. 기록·마무리

- `data/<채널>/<주제>/output/publish-log.md` 에 기록: 일시·플랫폼·게시 id·
  permalink·캡션 요약·승인자 결정 표.
- `storyboard.md` `status: published` 갱신.
- 임시 터널을 썼으면 §1 철거 검증 후, 플랫폼·permalink 표로 최종 보고한다.

## Additional Resources

### Reference Files

- **`references/token-setup.md`** — 플랫폼별 자격증명 발급·파일 규약·갱신 절차 (Threads/IG 60일 · FB 무기한 · YouTube OAuth)
