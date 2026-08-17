---
name: publish
description: >
  This skill should be used when the user asks to "게시해", "올려줘", "SNS 게시",
  "publish to social", "스레드/인스타/페북/유튜브에 올려", or after production is
  complete. Takes the finished per-platform content under data/<channel>/episodes/<topic>/output/
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
6. **Threads 는 링크를 자기 답글로, FB 는 첫 댓글** — Threads 영상 회차는 반말
   구어체 본문(링크 없음)을 먼저 게시하고, 영상 링크(IG 릴스 permalink)는
   `sns_comment_reply` 자기 답글로 단다. 커버 이미지 첨부 없음.
   (2026-08-15 — 2026-08-14 "본문 링크 한 건" 지시의 **철회**다. 그 방식 첫 2건이
   9·21조회로 같은 날 링크 없는 글의 1/10 이었고, 답글 링크 방식 2건은 257·623
   이었다. 도달 분배가 본문 링크에서 눌리는 실측이라 되돌린다.)
   FB 는 종전대로 본문 링크 금지 → `facebook_comment` 첫 댓글이며
   **그 댓글까지 게시돼야 FB 게시가 완료된 것이다.**
9. **YouTube 는 쇼츠 세로 첫 화면까지 지정해야 게시가 끝난다** — `thumbnailFilePath`
   가 바꾸는 것은 가로 표면뿐이다. 쇼츠 피드·채널 쇼츠 탭이 실제로 보여 주는 세로
   프레임(`oar*`)을 지정하지 않으면 **영상 중간의 임의 프레임이 첫 화면에 걸린다** —
   우리 커버가 아니라 대사 중간의 표정이 노출된다. 절차는 §3-1 과
   `references/shorts-surface-adb.md`, 판정은 `oardefault.jpg` **HTTP 200 + 내려받아
   커버 화면인지 눈으로 확인**이다. **이 단계를 건너뛰고 "게시 완료"를 보고하지 않는다.**
   에뮬레이터 로그인처럼 사용자 개입이 필요하면 그 자리에서 요청한다 — 미결로 미루지 않는다.
8. **영상과 자막은 따로 올린다** — 자막 파일을 받는 플랫폼(YouTube·Facebook)에는
   자막 없는 클린 마스터(`video.mp4`)와 `subs.srt` 를 함께 준다. 번인본
   (`video-sub.mp4`)은 **Instagram 에만** 쓴다 — IG 는 자막 파일을 받는 경로가 없어
   화면에 태우는 것 말고 방법이 없다. 플랫폼마다 어느 파일이 가는지는 §2 표가 정본이며,
   섞이면 YouTube 에 자막이 두 겹으로 박히거나 IG 에서 자막이 사라진다.

## 절차

### 0. 사전 점검 (세션당 1회)

- `output/` 산출물 존재 + `storyboard.md` `status: produced` 확인 — 아니면
  `/social-flow:produce` 부터 안내. 영상은 **세 파일이 다 있어야 한다** —
  `output/video/video.mp4`(클린) · `video-sub.mp4`(번인) · `subs.srt`. 번인본이나
  자막 파일이 없으면 옛 빌드다. `SUB`/`BURN` 을 끄고 만든 게 아닌지 확인하고,
  아니면 `/social-flow:produce` 로 되돌려 다시 빌드한다(자막 없이 게시하지 않는다).
- `sns_account_check` 를 **`channel: <채널slug>` 로 호출**해 이 채널의 플랫폼별
  토큰 상태를 점검 — **게시 계정이 어디인지 이 결과로 확인·보고한다**(계정은
  설정이 아니라 그 채널 토큰의 /me 로 결정). 점검 결과의 계정명이 채널 브랜드와
  다르면 게시를 중단하고 사용자에게 확인한다. 무효 플랫폼은 대상에서 제외하고
  사유를 보고. 게시 툴이 ListTools 에 아예 없으면 토큰 파일 미설정이다 —
  `references/token-setup.md` 의 채널 디렉토리(`~/.config/social-flow/<채널slug>/`)
  절차를 안내한다. Meta 계열 토큰은 60일 갱신형 — 파일 나이 45일 초과 시 갱신을
  권고한다.

### 1. HITL 승인 게이트 (호스팅보다 먼저 — 미승인 콘텐츠를 공개 URL 에 올리지 않는다)

승인 전에 문체 검사기를 표면별로 한 번 돌린다(Bash, LLM 콜 아님) — 게시 후에는
IG 이미지·영상을 바꿀 수 없어 여기가 마지막 기회다.

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
python3 "$CS" --selftest >/dev/null 2>&1 \
  || echo "gate_exit=3 (검사기 없음·손상·규칙 레드 — 아래 결과는 전부 미검증)"
for P in threads:output/threads/post.md ig:output/instagram/caption.md \
         fb:output/facebook/post.md yt:output/youtube/meta.md; do
  python3 $CS --surface ${P%%:*} ${P#*:}; echo "[${P%%:*}] gate_exit=$?"
done
# 출력을 줄이려고 | head 를 붙이지 않는다 — $? 가 그 명령의 것이 되어 FAIL 이 0 으로 보인다
```

exit 2(S1)면 게이트에 올리지 말고 `/social-flow:produce` 로 되돌려 고친다 — 여기서
즉석으로 문장을 고치면 규칙 4에 걸린다. exit 1(경고)은 게이트 제시문에 그대로 적어
사용자가 판단하게 한다. **출력 머리줄에 `인용면제 N` 이 있으면 그 N건을 제시문에
따로 적는다** — 검사기가 출처의 진위를 모르는 채 판정에서 빼준 위반이다. 진짜 원문
인용이면 그대로 게시하고, 우리가 쓴 문장에 따옴표만 씌운 것이면 produce 로 되돌린다. exit 3 은 게이트가 안 돈 것이다 — 경로를 고쳐 다시 돌리고,
못 돌리면 "문체 미검증"을 제시문에 명시한다. 검사기 파일 자체가 없으면 python 이
2를 내므로 위 존재 확인 줄로 구분한다.

AskUserQuestion 으로 플랫폼별 최종본을 제시한다 — 본문/캡션 전문, 미디어 **로컬
경로**(플랫폼마다 다르다: YT·FB 는 `video.mp4`+`subs.srt`, IG 는 `video-sub.mp4`,
Threads 는 미디어 없는 본문 + 링크 답글 문안), 자막 큐 수, 해시태그, FB 첫 댓글 문안까지 전부,
게시 예정 계정(계정 점검 결과), 문체 검사 결과(표면별 exit·점수, 인용 면제 건수). 선택지: [전체 게시 / 일부 플랫폼만 / 수정 후
재제시 / 중단]. **이 게이트 통과가 곧 실게시 승인이다.** 수정 요청이면 반영 후
다시 게이트.

Threads 링크 답글의 링크 자리는 이 시점에 아직 `<IG_REELS_URL>` 자리표시자다
(IG 를 먼저 게시해야 permalink 가 나온다). 제시문에 "이 자리에 IG 릴스
permalink 가 들어간다"고 적어 두면, §3 에서 그 자리만 채우는 것은 승인 범위
안이다 — 문장을 고치는 게 아니라서 규칙 4의 재승인 대상이 아니다.

### 2. 미디어 공개 URL 확보 (IG 필수 · FB 이미지/영상 — Threads 는 해당 없음)

게시 툴의 `imageUrl`/`videoUrl` 은 **공개 접근 가능한 HTTPS URL** 이어야 한다 —
플랫폼이 크롤하며 로컬 경로·인증 URL 불가 (YouTube 만 로컬 파일 업로드라 호스팅
불요). **자막 파일은 어느 플랫폼이든 로컬 경로 그대로 넘긴다** — 호스팅 대상이 아니다.

플랫폼별로 올리는 파일이 다르다. 이 표가 정본이다.

| 플랫폼 | 영상 | 자막 | 왜 |
| --- | --- | --- | --- |
| YouTube | `video.mp4` (로컬 경로) | `captionFilePath: subs.srt` | `captions.insert` 로 트랙 별도 업로드 — 게시 후 교체 가능, 자동 번역 원본 |
| Facebook | `video.mp4` (공개 URL) | `captionFilePath: subs.srt` | `/{video_id}/captions` 엣지 |
| Instagram | **`video-sub.mp4`** (공개 URL) | 없음 — 화면에 태워 나간다 | 컨테이너에 자막 파라미터가 없다 |
| Threads | 없음 — 호스팅 대상이 아니다 | 해당 없음 | 본문은 링크 없는 반말 글, IG 릴스 링크는 자기 답글로. 첨부 미디어가 없어 업로드할 파일도 없다 |

호스팅 디렉토리에는 **IG 용 번인본과 FB 용 클린본이 둘 다** 필요하다. 파일명이 서로
달라 한 디렉토리에 같이 두면 되고, 각각 `curl -sI` 로 200 을 확인한다.

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

경성 순서 제약은 하나다 — **IG 릴스가 Threads 보다 먼저** (Threads 본문에 넣을
영상 링크가 IG permalink 라서). IG 게시가 실패하면 Threads 는 보류하고
링크 대체(YouTube permalink 등)를 사용자에게 묻는다. 나머지 플랫폼 순서는 자유.

1. **YouTube**: `youtube_publish` — `output/youtube/meta.md` 의 title/description,
   `videoFilePath`=output/video/**video.mp4**(클린본), **`thumbnailFilePath`=cover.jpg 필수**
   (미지정 시 임의 프레임이 썸네일이 된다), **`captionFilePath`=output/video/subs.srt 필수**.
   `thumbnailWarning`·`captionWarning` 이 오면 게시는 성공 — 경고 내용을 보고한다.
   자막 업로드는 **`youtube.force-ssl` 스코프**가 필요하다(게시용 `youtube.upload` 로는
   거부된다). 게시만 하던 토큰이면 첫 호출에서 스코프 에러가 정상이며, 그때는 영상이
   이미 올라간 상태이므로 **재게시하지 말고** 토큰을 재발급해 자막만 따로 올린다
   (`references/token-setup.md`). 쿼터도 다르다 — 업로드는 1유닛인데 자막은 400유닛이라
   회차당 한 번만 부른다.
   **`containsSyntheticMedia` 는 지정하지 않는다**(기본 true). 이 파이프라인은 Veo
   영상·Lyria 음악을 쓰므로 AI 고지 대상이고, YouTube 는 고지가 노출·수익 자격에
   영향을 주지 않는다고 명시한 반면 상습 미고지에는 라벨 강제·삭제·YPP 정지를
   예고한다. 끄려면 사용자가 면제 사유를 확인해야 한다(면제 목록: 대본·제목·썸네일·
   자막·아이디어 생성, 자기 목소리 복제, 사실적이지 않은 애니메이션, 색보정·필터).
   **게시 성공 후 쇼츠 세로 첫 화면 지정까지가 YouTube 게시다(절대 규칙 9 — 생략 불가).**
   `thumbnailFilePath` 가 바꾸는 것은 가로 표면(검색결과·공유 미리보기·임베드)뿐이고,
   쇼츠 피드·채널 쇼츠 탭이 쓰는 세로 프레임(`oar*`)은 YouTube 네이티브 앱의 프레임
   선택으로만 바뀐다(API·웹 불가 — 실측 2026-08-13·08-14). 미지정이면 영상 중간의
   임의 프레임이 쇼츠 첫 화면에 걸린다. 절차는 `references/shorts-surface-adb.md`
   (채널 전용 AVD + adb, 영상당 ~60초).

   **목표 프레임은 커버가 완성된 시각**이다 — `produce` 가 `cover.jpg` 를 뽑은 그
   시각을 쓴다(`build-report.txt` 의 커버 전환 완료 시각, 이 파이프라인은 6초 안팎).
   프레임 피커 첫 칸(t=0)에는 히어로 수치가 아직 안 떠 있다.

   **판정은 두 가지를 다 본다** — ① `i.ytimg.com/vi/<videoId>/oardefault.jpg` 가
   **HTTP 200** ② 그 파일을 내려받아 **커버 화면인지 눈으로 확인**(200 은 "어떤" 세로
   프레임이 걸렸다는 뜻이지 "맞는" 프레임이라는 뜻이 아니다). 둘 다 통과해야
   `publish-log.md` 에 게시 완료로 적는다.

   에뮬레이터가 없거나 로그인이 필요하면 **그 자리에서 사용자에게 요청한다** — 미결
   사항으로 미루고 완료 보고하지 않는다. 사용자가 명시적으로 나중에 하겠다고 하면
   그때만 videoId 와 함께 미결로 적는다.
2. **Instagram**: `instagram_publish` — `videoUrl` 은 **번인본(video-sub.mp4)의 공개
   URL** + caption. 여기만 자막이 화면에 박힌 영상이다.
3. **Threads**: `threads_publish` — 승인분 본문(링크 없음)을 `caption` 으로
   게시하고(`linkUrl`·`imageUrl` 없음), 게시 성공 후 `sns_comment_reply` 로
   2번에서 받은 IG permalink 를 **자기 답글**로 단다("풀영상은 여기 →" 한 줄 +
   링크). 답글까지 달려야 Threads 게시가 완료된 것이다. (2026-08-15 — 본문 링크
   방식 철회, 규칙 6 근거 참조. 본문에 링크를 넣으면 도달 분배가 눌린다는 실측.)
4. **Facebook**: `facebook_publish` — `videoUrl` 은 **클린본(video.mp4)의 공개 URL**,
   `captionFilePath`=output/video/subs.srt(로컬 경로) + 본문 → 응답 postId 로
   `facebook_comment` **첫 댓글(원문/관련 링크) 즉시 게시**. `captionWarning` 이 오면
   게시는 유효하다 — FB 는 영상을 비동기로 처리하므로 처리 중 상태에 걸렸을 수 있다.
   **재게시하지 말고** 잠시 뒤 자막만 다시 올린다(응답의 postId 가 곧 video_id 다).

실패 처리: 에러를 그대로 보고하고 **같은 호출을 맹목 재시도하지 않는다**(게시
API 비멱등 — 타임아웃 후에는 permalink/최근 미디어 조회로 중복 여부 먼저 확인).
FB 첫 댓글만 실패하면 댓글 호출만 재시도, 끝내 실패하면 postId 와 사유를 적어 두고
수동 처리를 안내한다. Threads 는 한 번의 호출이라 부분 실패가 없다 — 실패했으면
게시 자체가 안 된 것이므로 permalink 조회로 확인한 뒤에만 다시 부른다.

### 4. 기록·마무리

게시 후 댓글에 답할 때(`sns_comment_reply`)도 문안을 먼저 검사한다. 답글은 사람 대
사람의 대화라 AI 티가 가장 빨리 들킨다 — 골든타임 응대라고 검사를 건너뛰지 않는다.

```bash
printf '%s\n' "$답글문안" | \
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py --surface reply -
```

검사기를 통과한 문안은 growth-post-reviewer 에이전트에 위임한다(`inbox_reply`
표면, 원 댓글과 우리 게시물 본문 동봉) — **score ≥95 이고 p0=0 인 문안만
게시한다.** 미달이면 교정 지시대로 빼기만 해서 고치고 최대 3라운드, 그래도
미달이면 보내지 않고 사유를 publish-log 에 적는다.

- `data/<채널>/episodes/<주제>/output/publish-log.md` 에 기록: 일시·플랫폼·게시 id·
  permalink·캡션 요약·승인자 결정 표.
- `storyboard.md` `status: published` 갱신.
- 임시 터널을 썼으면 §1 철거 검증 후, 플랫폼·permalink 표로 최종 보고한다.

## Additional Resources

### Reference Files

- **`references/token-setup.md`** — 플랫폼별 자격증명 발급·파일 규약·갱신 절차 (Threads/IG 60일 · FB 무기한 · YouTube OAuth)
- **`references/shorts-surface-adb.md`** — YouTube 쇼츠 세로 표면(`oar*`) 프레임 지정: 채널 전용 AVD + adb 절차·함정·oardefault 판정
