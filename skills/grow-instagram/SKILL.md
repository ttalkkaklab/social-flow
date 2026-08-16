---
name: grow-instagram
description: >
  This skill should be used when the user asks to "인스타 키워", "릴스 성장 루프",
  "인스타그램 성장 틱", "grow the Instagram account", or wants the autonomous
  Instagram growth loop. Runs ONE growth tick for a channel — replies to inbox
  comments (golden hour first), snapshots account/reel insights (skip rate and
  average watch time), refills the publish queue by authoring a new reel
  end-to-end when it runs dry (autoproduce), and publishes queue-marked reels in
  plan-defined slots — fully autonomously within the standing authorization of
  data/<channel>/growth/instagram/growth-plan.md. Recur with /loop <interval>
  /social-flow:grow-instagram <channel>. First run:
  /social-flow:grow-instagram <channel> init.
argument-hint: "<채널> [init|tick|status]"
# ⚠️ 의도적 사전 승인 — 이 스킬은 플러그인의 "게시 툴 사전 승인 금지" 계약의
# **명시적 예외**다(grow-threads·grow-youtube 와 같은 근거). init 에서 HITL 로
# 확정한 growth-plan.md 가 게시별 승인을 대신하는 상시 승인서이며, 그 승인서는
# **저작까지 포함한다** — 플랜의 `autoproduce.enabled: true` 면 루프가 주제를
# 골라 릴스를 만들고 큐 마커까지 찍는다(꺼져 있으면 사람이 찍은 것만 나간다).
# 플랜 없이 게시 툴을 호출하는 것은 금지다(§절대 규칙 1).
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "WebSearch", "WebFetch",
  "mcp__social-flow__sns_account_check", "mcp__social-flow__sns_comment_inbox",
  "mcp__social-flow__instagram_insights", "mcp__social-flow__instagram_publish",
  "mcp__social-flow__sns_comment_reply",
  "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate",
  "mcp__social-flow__tts_list_voices",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip"]
---

# Instagram 성장 루프 — 자율 1틱

성장 스킬은 **플랫폼별로 분리**한다(grow-threads·grow-youtube 와 같은 골격:
플랜=상시 승인서 · 틱 ≠ 게시 · state 멱등). 상태 경로는 `growth/instagram/` 로
스코프된다.

```
/social-flow:grow-instagram <채널> init      # 최초 1회 — 플랜 확정 (HITL)
/loop 1h /social-flow:grow-instagram <채널>  # 1시간 주기 자율 루프
```

**Threads 와 다른 점 둘이 이 스킬의 구조를 정한다.**

첫째, 릴스는 영상이다. 한 편에 조사·저작·이미지·음성·빌드가 다 필요하다.
그래서 게시는 **대기열에서만** 나가고, 대기열을 채우는 길이 둘이다. 사람이
`/social-flow:storyboard → produce` 로 만들어 `queue_instagram: ready` 를 찍는
길, 그리고 플랜 `autoproduce.enabled: true` 일 때 대기열이 마르는 순간 틱이 직접
한 편을 만들어 마커까지 찍는 길이다(§2.5, grow-youtube 와 같다).

둘째, **남의 대화에 참여하는 단계가 없다.** Threads 는 키워드 검색으로 참여할 글을
찾지만 이 파이프라인이 쓰는 Instagram Login API 에는 공개 게시물 검색이 없다.
없는 기능을 흉내 내지 않는다.

전술 근거는 `references/growth-playbook.md` 가 정본이다(작성 전 반드시 로드).
그 문서는 **검증을 통과한 주장만** 담고, 시중에 도는 통설 중 기각된 것은 인용 금지
목록으로 따로 적어 뒀다.

## 절대 규칙 (위반 시 즉시 중단)

1. **플랜 없이 게시 금지** — `data/<채널>/growth/instagram/growth-plan.md` 가 없거나
   frontmatter `status: approved` 가 아니면 어떤 게시 툴도 호출하지 않는다.
   플랜이 상시 승인서다 — 범위 밖 게시가 필요하면 사용자에게 플랜 갱신을 요청한다.
2. **`queue_instagram: ready` 없는 릴스 게시 금지** — 대기열 자격은 storyboard.md
   frontmatter 의 `status` 가 `produced` **또는** `published` 이면서
   `queue_instagram: ready` 인 주제뿐이다. produced 는 "제작이 끝났다"일 뿐 "올려도
   된다"가 아니다 — 나갈지 말지를 정하는 건 `queue_instagram` 마커다.
   `published` 를 자격에 넣는 이유는 §3 에 적었다(다른 플랫폼이 먼저 게시하면
   status 가 바뀐다). 마커는 사람이 찍거나 §2.5 의 자동 저작이 찍는다. 자동
   저작은 기계 게이트를 다 통과한 편에만 `ready` 를, 하나라도 떨어지면 `hold` 를
   찍는다. 자동 저작 자체는 플랜 `autoproduce.enabled` 가 켠 경우만 돈다.
3. **게시 결과로 `status:` 를 바꾸지 않는다** — 게시에 성공해도 이 루프가 갱신하는
   것은 `queue_instagram` 뿐이다. `status: published` 로 바꾸면 grow-youtube 의
   대기열 자격(`status: produced`)이 사라져 같은 주제가 YouTube 에 영영 안
   올라간다. 두 루프는 같은 파일을 본다.
   **예외는 §2.5 의 자동 저작이 만든 새 주제뿐이다** — 없던 파일을 만들며
   `status: produced` 를 쓰는 것은 게시 결과 기록이 아닌 제작 단계의 일이다.
   `produced` 는 두 루프의 대기열 자격을 모두 만족시킨다.
4. **호스팅을 루프가 만들지 않는다** — `videoUrl` 은 공개 HTTPS URL 이어야 한다.
   임시 터널을 자율 루프가 띄우는 건 금지다(철거 검증을 할 사람이 없다). 플랜
   `media_hosting: off` 면 게시 단계를 통째로 건너뛰고 대기열 잔량만 보고한다.
   **저작 단계(§2.5)도 함께 끈다** — 나갈 길이 없는 영상을 돈 들여 만들지 않는다.
5. **비멱등 게시 재시도 금지** — instagram_publish 실패 시 같은 호출을 맹목
   재시도하지 않는다. 릴스 중복 게시는 두 개가 서로 도달을 잠식하고, 삭제해도
   지표는 그대로 있다. 타임아웃이면 다음 틱에 `instagram_insights` 의 최근 미디어
   목록으로 **게시 여부를 먼저 확인**한다.
6. **원본성 선을 넘지 않는다** — 게시 대상은 우리 파이프라인 산출물뿐이다. 워터마크가
   남은 타 플랫폼 파일, 속도만 바꾼 재편집은 게시하지 않는다. 원본성 판정에서
   떨어지면 게시물 하나로 끝나지 않는다 — **계정 전체**가 비팔로워 추천에서 빠진다.
7. **토큰 평문 노출 금지** — 토큰은 `~/.config/social-flow/<채널slug>/` 파일로만.
   state.json·growth-log.md 에 API 응답을 통째로 저장하지 않는다(필요 필드만).
8. **하드 캡** — 게시는 플랜 슬롯 수까지(일 최대 3), 자동 저작은
   `daily_produce_cap`(기본 1)과 비용 상한까지 — 이 플랜 기준 **하루 최대
   2편**(autoproduce 절대 규칙 7)을 넘지 못한다. 인박스 답글만 상한이 없다.
9. **모든 툴 호출에 `channel: <채널slug>` 지정** — 채널 토큰만 쓰며 기본 토큰
   폴백 없음(오계정 게시 방지).

## 의도적으로 하지 않는 것

- **남의 게시물에 댓글 달기.** API 에 공개 검색이 없어 대상을 찾을 방법도 없고,
  브랜드 계정이 모르는 게시물에 다는 댓글은 스팸 인접 행동이라 계정 신호를 깎는다.
- **댓글 숨김.** `sns_comment_moderate` 가 Instagram 을 지원하지만 숨김 판단은
  자율 범위 밖이다 — 스팸은 보고만 하고 사용자가 결정한다.
- **계정 상태(Account Status) 자동 확인.** API 가 없다 — 루프는 리마인드까지만 한다
  (grow-youtube 의 Related video 와 같은 패턴).
- **해시태그 개수 최적화.** 1차 근거가 없는 영역이라 플레이북이 숫자를 제시하지
  않는다. 캡션에 주제 표시로 넣는 것까지가 근거 있는 실행이다.

## 파일 배치 (전부 로컬 — data/ 는 커밋 대상 아님)

```
data/<채널 slug>/growth/
├── instagram/
│   ├── growth-plan.md   # 상시 승인서 (init 이 HITL 로 작성, status: approved)
│   ├── state.json       # 틱 간 이월 상태 (이중 게시 방지의 근거)
│   └── growth-log.md    # 틱별 한 줄 기록 + 지표 증감 (관찰 원장)
├── autoproduce.json     # 채널 공용 — 자동 저작 예산·이력 (YouTube 루프와 공유)
└── .autoproduce.lock/   # 채널 공용 락 — 두 루프가 동시에 저작하는 것을 막는다
```

**뒤 둘은 채널 공용**이다(플랫폼별로 나누지 않는다). 영상 한 편이 두 플랫폼에 다 나가므로
예산과 락도 채널 단위여야 한다 — 플랫폼마다 따로 세면 상한이 두 배로 새고,
플랫폼마다 따로 잠그면 락이 아무것도 막지 못한다.

템플릿과 state 스키마는 `references/growth-plan-template.md` 를 쓴다.

## init — 플랜 확정 (최초 1회, HITL)

1. `data/<채널>/profile.md` 로드 — 없으면 `/social-flow:channel add` 부터 안내하고
   중단. 톤·타깃·금기 소재를 플랜의 기본값으로 상속하고, **§4 미디어 공개 호스팅**을
   읽어 `media_hosting` 기본값을 정한다(미정이면 `off`).
2. `sns_account_check(channel)` 로 INSTAGRAM 토큰 확인 →
   `instagram_insights(channel, days: 7, mediaLimit: 3)` 1회로 **스코프 검증**.
   `sns_comment_inbox(channel, platforms: ["INSTAGRAM"], postLimit: 3)` 도 1회
   검증한다(댓글 스코프는 별개다).

   **이 단계에서 스코프 에러가 나는 것이 정상이다** — 게시용으로 발급한 기존 토큰에는
   `instagram_business_manage_insights` 가 없을 수 있다. 에러에 실린 재발급
   안내(token-setup.md)를 사용자에게 전하고 **중단한다**. 인사이트 없이 루프를
   시작하지 않는다(성과 관찰이 루프의 눈이다).
3. AskUserQuestion 으로 플랜 항목을 확정한다: 게시 슬롯 1~3개(타깃 활동 시간대),
   주간 게시 목표(기본 4 — 플레이북 §리듬의 주 3~5회 균형점), 미디어 호스팅
   방식(`base_url` / `staged` / `off`), 댓글 응대 톤(프로파일 상속이 기본),
   응대 제외 기준(스팸·시비조), 계정 상태 점검 주기(기본 주 1회).

   **자동 저작은 따로 묻는다** — 루프의 권한이 게시에서 저작까지 넓어지는
   지점이라 기본값으로 켜지 않는다. 끌지 켤지, 주제를 어디서 가져올지
   (`pool` 기본 / `keywords`), 주제 풀 항목, 편당 비용 상한(기본 $0.30),
   일·주 비용 상한, 하루 저작 횟수(기본 1 — 이 플랫폼 하드캡 2 이내),
   대기열 최소 잔량(기본 1),
   저작 성공 시 함께 찍을 플랫폼 큐(`mark_queues` — 승인된 성장 플랜이 있는
   플랫폼만 제시). 호스팅이 `off` 면 자동 저작도 돌지 않는다는 것을 그 자리에서
   알린다. profile §2 의 TTS 엔진이 `gemini` 면 회차마다 음성 비용이 붙는다는
   것도 함께 알린다(400자 기준 약 $0.015 — 로컬 전환은 목소리가 바뀐다).
4. `growth-plan.md` 를 템플릿대로 작성하고 **전문을 보여준 뒤 명시 승인**을 받아
   `status: approved` 로 저장한다. 이때 반드시 고지한다: *"이 플랜이 상시
   승인서입니다 — 루프는 `queue_instagram: ready` 를 찍은 릴스를 슬롯에서 게시별
   승인 없이 즉시 공개 게시하고, 받은 댓글에 자율로 답합니다. 게시는 플랜에 적힌
   공개 URL 규칙으로만 나가며, 호스팅이 `off` 면 게시하지 않습니다. 중단은 /loop
   중지, 범위 변경은 플랜 수정으로 합니다."* 자동 저작을 켰으면 한 줄 더
   고지한다: *"대기열이 비면 루프가 스스로 주제를 골라 릴스를 만들고, 기계 검증을
   통과하면 사람이 보기 전에 게시됩니다. 하루 최대 N편·편당 $X 안에서 돕니다."*
5. `state.json` 초기화, growth-log.md 헤더 작성.

## tick — 자율 사이클 (기본 모드)

### 0. 로드·게이트

`growth-plan.md`(approved 확인)·`state.json`·`references/growth-playbook.md` 로드.
state 의 날짜 버킷이 오늘이 아니면 일 카운터를 리셋한다.

### 1. 인박스 답글 (최우선 — 골든아워)

`sns_comment_inbox(channel, platforms: ["INSTAGRAM"], sinceHours: 48)` →
`summary.withinGoldenHour` 가 0 이 아니면 그 댓글부터. 답글 문안은 플레이북
§답글 규칙으로 작성해 `sns_comment_reply(platform: "INSTAGRAM")` 로 단다.

**인스타 답글은 최상위 댓글에만 붙는다** — 대댓글에 답하려면 인박스 응답의
`parentCommentId` 를 commentId 로 넘긴다. 중복 방지는 인박스의 `answeredByUs`
필터가 보장한다(최상위 댓글의 자식 중 우리 것이 있으면 응대 완료).

**문안은 보내기 전에 문체 게이트를 통과시킨다** — 답글은 사람 대 사람의 대화라
AI 티가 가장 빨리 들킨다.

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
printf '%s\n' "$답글문안" | python3 $CS --surface reply -; echo "gate_exit=$?"
```

exit 2(S1)면 고쳐서 보낸다. 규칙은 platform-guide `references/korean-style.md`.

**exit 0 이어도 탐지 목록을 읽는다** — S2 는 점수만 깎고 통과시키므로 "초록이면
보낸다"로 쓰면 게이트가 죽는다. **C7(장문 부재)이 뜨면 그대로 보내지 않는다**:
짧은 문장만 이어진 글이라 한 문장을 길게 붙이거나 소재·훅을 다시 잡는다.

**기계 게이트를 통과한 문안은 growth-post-reviewer 에이전트에 위임해 적대적
검증을 받는다** — 틱의 답글 문안을 한 번에 묶어 위임하고(`inbox_reply` 표면),
문안마다 원 댓글과 그 댓글이 달린 우리 게시물 캡션을 동봉한다(이것 없이는 맥락
축이 0점이다). `growth-plan.md`·`profile.md` 경로와 자가 검사 exit code 도 싣는다.
**score ≥95 이고 p0=0 인 문안만 보낸다.** FAIL 은 교정 지시대로 빼기만 해서
고친다 — 없던 비유·상투구를 새로 심으면 그게 새 AI 티다. 최대 3라운드, 미달이면
그 답글은 보내지 않고 growth-log 에 `스킵(게이트 NN점)` 으로 적는다.

스팸·혐오 댓글은 답하지 않고 다음 틱 요약에 보고만 한다(숨김은 자율 범위 밖).

### 2. 인사이트 스냅샷 (관찰)

`instagram_insights(channel, days: 7, mediaLimit: 10)` → `state.lastInsights` 와
비교해 팔로워 증감·도달 추이를 growth-log 에 한 줄 적고 state 를 갱신한다.

팔로워 수는 `account.followersCount` 를 쓴다 — 인사이트의 `follower_count` 는
팔로워 100 미만 계정에서 빈 값이라 신규 채널에서 못 쓴다.

**릴스(`mediaProductType: "REELS"`)에서 두 지표를 읽는다.** `reels_skip_rate` 가
훅 판정이고 `ig_reels_avg_watch_time`(ms)이 유지 판정이다 — 랭킹 모델이 "3초 미만
시청 확률"과 "같은 길이 시청자의 95%보다 오래 볼 확률"을 직접 예측하므로 이 둘이
가장 가까운 관측값이다. 이미지·캐러셀에는 이 지표가 없다(플랫폼 미지원).

도달 상위 릴스의 유형(소재·길이·형식)을 읽어 관찰 결과를 사용자에게 보고한다 —
이 학습 루프가 없으면 자동화는 같은 영상만 반복한다. 기획 반영은 storyboard
파이프라인에서 사람이 한다.

**릴스별 팔로우 전환은 못 읽는다.** `follows`·`profile_visits` 는 FEED(이미지·
캐러셀) 전용이고 릴스에 요청하면 400 이 나면서 **그 미디어 지표가 통째로 빈다**
(실측 2026-08-15). 계정 쪽 `follows_and_unfollows` 도 신규 채널에서는 빈 값이라
(`follower_count` 와 같은 패턴) 대신 계정 `profile_views` 증감과
`account.followersCount` 로 판단한다.

**도달이 급락했으면 편집부터 의심하지 않는다.** 진단 순서는 ① 계정 상태 확인
② 최근 30일 오리지널 비중 ③ 콘텐츠다(플레이북 §진단 순서). ①은 API 가 없으므로
틱 보고에 확인 요청을 싣는다.

### 2.5 대기열 보충 — 자동 저작 (플랜이 켠 경우만)

플랜 `autoproduce.enabled: true` 가 아니면 이 단계를 통째로 건너뛴다.
**`media_hosting: off` 여도 건너뛴다** — 나갈 길이 없는 영상을 돈 들여 만들지
않는다. 호스팅이 없는 채널에서 저작이 필요하면 사람이
`/social-flow:autoproduce` 를 직접 부른다.

**대기열이 마를 때만 만든다.** `queue_instagram: ready` 인 미게시 주제 수가
플랜 `autoproduce.min_queue`(기본 1) 미만일 때만 저작한다. 쌓아 두려고 미리
만들지 않는다 — 재고는 돈이고, 시효성 있는 소재는 묵으면 틀린 정보가 된다.

저작 전 확인 순서 (하나라도 걸리면 저작하지 않고 사유만 보고한다):

1. 대기열 `ready` 잔량 < `min_queue`
2. `autoproduce.json` 의 오늘·이번 주 누적이 `daily_cost_cap`·`weekly_cap` 이내
3. 오늘 **이 플랜의** 저작 편수(성공·실패 포함, autoproduce.json 의
   `counts.<플랫폼>`)가 **min(`daily_produce_cap`, 2)** 미만 — 2 는 플랫폼별
   하드캡이다(autoproduce 절대 규칙 7). 다른 플랫폼 루프의 저작은 여기 세지
   않는다
4. 채널 락(`data/<채널>/growth/.autoproduce.lock`)을 잡을 수 있음 —
   못 잡으면 YouTube 루프가 저작 중이라는 뜻이므로 그냥 넘어간다

통과하면 `${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/SKILL.md` 를 Read 하고
**무인 모드 절차를 그대로 수행**한다. §2 에서 읽은 지표를 티어 판정 인자로
넘긴다 — 판정은 절대 임계가 아니라 **추세**다(최근 3편 평균 `reels_skip_rate` 가
직전 3편 평균보다 5%p 이상 상승, 백분율 단위). 게시 이력 6편 미만이거나 훅 계약
개정 후 새 기준선이 안 쌓였으면 승급하지 않는다
(정본: autoproduce `references/cost-tiers.md`).

**저작 성공 시 플랜 `autoproduce.mark_queues` 에 적힌 플랫폼 큐를 전부 찍는다.**
한 번 만든 9:16 마스터가 두 플랫폼에 다 나가므로 플랫폼마다 따로 만들면 비용이
두 배가 된다. 다만 **승인된 플랫폼만** 찍는다(그 플랫폼의 `growth-plan.md` 가
`status: approved`).

**호스팅 URL 은 루프가 만들지 못한다**(규칙 4). `media_hosting: base_url` 이면
저작 결과의 공개 URL 은 `<media_base_url>/<주제 slug>/video-sub.mp4` 로 결정되지만
**파일을 그 자리에 올리는 것은 사람 몫**이다. 그래서 자동 저작 직후 §3 이
곧바로 게시에 성공하는 일은 드물다 — URL 확인(§3-4)에서 막히면 그것이 정상이고,
틱 보고에 "저작 완료 · 업로드 대기" 를 실어 사람이 파일을 올리게 한다.

실패했을 때는 어디서 떨어졌느냐에 따라 다르다. 조사 게이트에서 떨어졌으면 그 주제를
버리고 다음 후보로 가되 두 번 버리면 이번 틱의 저작을 포기한다. 영상까지 만들어
놓고 품질 게이트에서 떨어졌으면 `queue_instagram: hold` 로 남기고 **같은 주제를
다시 만들지 않는다**. 어느 경로로 끝나든 **그때까지 쓴 비용을
`autoproduce.json` 에 기록한다** — 실패분을 빼고 세면 예산이 무한해진다.

### 3. 슬롯 게시 (대기열 소진)

플랜 `media_hosting: off` 면 이 단계를 건너뛰고 대기열 잔량만 보고한다.

오늘 슬롯 중 **시각이 이미 지났고 · 경과 3시간 이내이며 · `filledSlots[오늘]`
에 없는** 슬롯이 있을 때만(여럿이면 가장 이른 것 하나) 대기열을 훑는다.
3시간이 지난 슬롯은 건너뛴다(루프가 꺼져 있다가 밤에 아침 슬롯을 몰아 게시하는
사고 방지).

대기열 후보는 `data/<채널>/*/storyboard/storyboard.md` 중 frontmatter 의 `status` 가
`produced` **또는** `published` 이면서 `queue_instagram: ready` 이고,
`state.publishedTopics` 에 없는 주제다. 여럿이면 `queue_at`(없으면 파일 mtime) 이
가장 오래된 것 하나.

**`published` 를 제외하지 않는 것이 중요하다.** `status` 는 플랫폼 구분이 없는
한 칸짜리 값인데 grow-youtube 는 게시에 성공하면 이 값을 `published` 로 바꾼다.
`produced` 만 받으면, 같은 주제를 두 플랫폼에 큐잉했을 때 YouTube 가 먼저 나간
순간 인스타 쪽은 **에러 없이 조용히 제외된다** — 사람은 큐에 넣었다고 믿는 채로.
중복 게시를 막는 건 `status` 가 아닌 `queue_instagram` 마커와
`state.publishedTopics` 다.

게시 전 확인:

1. **`output/publish-log.md` 에 INSTAGRAM 행이 이미 있는지 본다.** 있으면 publish
   스킬로 이미 나간 주제이므로 게시하지 않고 `queue_instagram: done` 으로 정리한
   뒤 보고한다(게이트를 `published` 까지 넓힌 대가로 생기는 틈을 여기서 막는다).
2. `output/instagram/caption.md` 존재 — 캡션 본문을 여기서 읽는다.
3. 영상 공개 URL 해석 — `media_hosting: base_url` 이면
   `<media_base_url>/<주제 slug>/**video-sub.mp4**`, `staged` 면 frontmatter
   `video_url`. **IG 는 자막 번인본을 올린다** — 다른 플랫폼은 자막 파일을 따로
   받지만 IG 컨테이너에는 자막 파라미터가 없어, 클린본(`video.mp4`)을 올리면
   자막이 통째로 사라진다(publish 스킬 규칙 8). `staged` 경로의 `video_url` 도
   번인본을 가리켜야 하며 파일명이 `video.mp4` 로 끝나면 사람에게 확인한다.
4. `curl -sI <URL>` 로 **200 과 video MIME 확인**. 실패하면 게시하지 않고 사유를
   보고한다(호스팅에 파일이 아직 안 올라간 상태다 — 사람이 처리한다).

`instagram_publish(channel, videoUrl, caption)`. 성공하면:

- storyboard.md frontmatter 를 `queue_instagram: done` 으로 갱신 (**`status:` 는
  그대로 둔다** — 규칙 3)
- `output/publish-log.md` 에 permalink 기록 (publish 스킬과 같은 형식)
- state 의 `filledSlots`·`publishedTopics` 에 기록

실패 시에는 filledSlots 에 기록하지 않되 **이번 틱 안에서 재시도도 하지
않는다**(다음 틱이 같은 슬롯을 다시 시도). 실패 사유는 growth-log 에 적는다.

### 4. 저장·보고

`state.json` 저장(lastTickAt 갱신) → growth-log.md 에 틱 요약 한 줄 append →
사용자 보고 한 줄:
`[틱 hh:mm] 답글 n · 저작 n($x, 티어) · 게시 n(슬롯) · 팔로워 ±n · 이탈률 0.nn · 평균 시청 n.n초`.
아무 액션이 없던 틱은 "관찰만" 으로 적는다 — 조용한 틱이 정상이다.

플랜의 `account_status_check` 주기가 지났으면(`state.lastAccountStatusPrompt` 기준)
보고에 한 줄 덧붙인다: "앱 > 설정 > 계정 상태에서 추천 자격 확인 필요".

## status — 상태 보고

state.json + growth-log.md 최근 20줄 + `instagram_insights` 1회로 현황을 요약한다:
팔로워·도달 추이, 최근 7일 게시 수와 주간 목표(3~5) 대비, 도달 상위 릴스 3개와
이탈률·평균 시청 시간, 대기열에 남은 주제 수, 다음 슬롯, 계정 상태 마지막 확인일.
게시 없음.
자동 저작을 켰으면 `autoproduce.json` 에서 오늘·이번 주 누적 비용과 상한 대비
잔량, 주제 풀 잔량, `queue_instagram: hold` 로 멈춰 있는 주제와 **저작은 끝났는데
호스팅에 아직 안 올라간 주제**를 함께 보고한다 — 둘 다 사람이 손대지 않으면
영원히 게시되지 않는다.

## 에러 대응 (루프는 계속 돈다)

- **스코프 에러**(재발급 안내 포함) → 그 단계만 건너뛰고 틱 요약에 안내를 실어
  보고한다. 다음 틱에도 반복되면 루프 중지를 권한다. 인사이트 스코프와 댓글
  스코프는 별개라 한쪽만 막힐 수 있다.
- **게시 쿼터 초과** — 24시간 이동 구간당 100건. 이 루프의 상한(일 3)으로는 닿지
  않으므로, 걸렸다면 다른 경로(publish 스킬·수동 게시)와 합산된 것이다.
- **컨테이너 처리 실패** — 릴스는 업로드 후 인코딩을 거친다. 서버가 폴링하다 실패로
  끝나면 URL 접근성이나 코덱 문제이므로 재시도하지 않고 사유를 보고한다.
- **토큰 만료**(Meta 60일) → 게시가 전부 막히므로 루프 중지를 권하고
  token-setup.md 갱신 절차를 안내한다.
