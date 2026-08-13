---
name: grow-youtube
description: >
  This skill should be used when the user asks to "유튜브 키워", "쇼츠 성장 루프",
  "유튜브 성장 틱", "grow the YouTube channel", or wants the autonomous YouTube
  growth loop. Runs ONE growth tick for a channel — replies to inbox comments
  (golden hour first), snapshots channel/video analytics, refills the publish
  queue by authoring a new short end-to-end when it runs dry (autoproduce), and
  publishes queue-marked videos in plan-defined slots — fully autonomously within
  the standing authorization of data/<channel>/growth/youtube/growth-plan.md.
  Recur with /loop <interval> /social-flow:grow-youtube <channel>. First run:
  /social-flow:grow-youtube <channel> init.
argument-hint: "<채널> [init|tick|status]"
# ⚠️ 의도적 사전 승인 — 이 스킬은 플러그인의 "게시 툴 사전 승인 금지" 계약의
# **명시적 예외**다(grow-threads 와 같은 근거). init 에서 HITL 로 확정한
# growth-plan.md 가 게시별 승인을 대신하는 상시 승인서이며, 그 승인서는
# **저작까지 포함한다** — 플랜의 `autoproduce.enabled: true` 면 루프가 주제를
# 골라 영상을 만들고 큐 마커까지 찍는다(꺼져 있으면 사람이 찍은 것만 나간다).
# 플랜 없이 게시 툴을 호출하는 것은 금지다(§절대 규칙 1).
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "WebSearch", "WebFetch",
  "mcp__social-flow__sns_account_check", "mcp__social-flow__sns_comment_inbox",
  "mcp__social-flow__youtube_insights", "mcp__social-flow__youtube_publish",
  "mcp__social-flow__sns_comment_reply",
  "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate",
  "mcp__social-flow__tts_list_voices",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip"]
---

# YouTube 성장 루프 — 자율 1틱

성장 스킬은 **플랫폼별로 분리**한다(grow-threads 와 같은 골격: 플랜=상시 승인서 ·
틱 ≠ 게시 · state 멱등). 상태 경로는 `growth/youtube/` 로 스코프된다.

```
/social-flow:grow-youtube <채널> init      # 최초 1회 — 플랜 확정 (HITL)
/loop 1h /social-flow:grow-youtube <채널>  # 1시간 주기 자율 루프
```

**Threads 와 다른 점 하나가 이 스킬의 구조를 정한다** — 쇼츠는 영상이다.
한 편을 만드는 데 조사·저작·이미지·음성·빌드가 다 필요하다. 그래서
게시는 **대기열에서만** 나가고, 대기열에 무엇이 들어가는지가 이 루프의 관건이다.
채우는 길은 둘이다.

- **사람이 채운다** — `/social-flow:storyboard → produce` 로 만들고
  storyboard.md 에 `queue: ready` 를 찍는다.
- **루프가 채운다** — 플랜 `autoproduce.enabled: true` 면 대기열이 마르는 순간
  틱이 직접 한 편을 만들어 마커까지 찍는다(§2.5). 주제·소재 범위·편당 비용
  상한이 전부 플랜에 적혀 있고, 기계 게이트를 통과한 것만 큐에 들어간다.

**1시간 주기**면 충분하다 — 슬롯 게시와 댓글 응대 모두 그 해상도로 족하고,
저작은 어차피 대기열이 빌 때만 일어난다.

전술 근거는 `references/growth-playbook.md` 가 정본이다(작성 전 반드시 로드).
그 문서는 **검증을 통과한 주장만** 담고, 시중에 도는 통설 중 기각된 것은
인용 금지 목록으로 따로 적어 뒀다.

## 절대 규칙 (위반 시 즉시 중단)

1. **플랜 없이 게시 금지** — `data/<채널>/growth/youtube/growth-plan.md` 가 없거나
   frontmatter `status: approved` 가 아니면 어떤 게시 툴도 호출하지 않는다.
   플랜이 상시 승인서다 — 범위 밖 게시가 필요하면 사용자에게 플랜 갱신을 요청한다.
2. **`queue: ready` 없는 영상 게시 금지** — 대기열 자격은 storyboard.md
   frontmatter 의 `status` 가 `produced` **또는** `published` 이면서
   `queue: ready` 인 주제뿐이다. produced 는 "제작이 끝났다"일 뿐 "올려도 된다"가
   아니다 — 나갈지 말지를 정하는 건 `queue` 마커다. `published` 를 자격에 넣는
   이유는 §3 에 적었다(다른 경로가 먼저 게시하면 status 가 바뀐다).
   마커는 사람이 찍거나 §2.5 의 자동 저작이 찍는다. **자동 저작은 기계 게이트를
   다 통과한 편에만 `ready` 를 찍고, 하나라도 떨어지면 `hold` 를 찍는다** —
   hold 는 게시되지 않으며 사람이 보고 바꿔야 나간다. 그리고 자동 저작 자체가
   플랜이 켠 것만 돈다 — `autoproduce.enabled` 가 false 거나 항목이 없으면
   §2.5 를 통째로 건너뛰고, 예산(편당·일·주)을 넘겨서도 저작하지 않는다.
3. **비멱등 게시 재시도 금지** — youtube_publish 실패 시 같은 호출을 맹목
   재시도하지 않는다. 영상 중복 업로드는 글 중복보다 회수 비용이 크다(같은 영상
   두 개가 서로 조회를 잠식하고, 삭제해도 지표는 그대로 있다). 타임아웃이면 다음 틱에
   `youtube_insights` 의 최근 업로드 목록으로 **게시 여부를 먼저 확인**한다.
4. **AI 고지를 끄지 않는다** — `containsSyntheticMedia` 는 기본 true 이고 루프는
   이 값을 내리지 않는다. 내릴 수 있는 경우는 플레이북 §AI 고지의 면제 목록에
   전부 해당할 때뿐이며, 그 판단은 사용자 몫이다(플랜에 적어 둔다).
5. **토큰 평문 노출 금지** — 토큰은 `~/.config/social-flow/<채널slug>/` 파일로만.
   state.json·growth-log.md 에 API 응답을 통째로 저장하지 않는다(필요 필드만).
6. **하드 캡** — 게시는 플랜 슬롯 수까지(일 최대 3), 자동 저작은
   `daily_produce_cap`(기본 1)과 비용 상한까지 — 이 플랜 기준 **하루 최대
   2편**(autoproduce 절대 규칙 7)을 넘지 못한다. 인박스 답글만 상한이 없다.
7. **모든 툴 호출에 `channel: <채널slug>` 지정** — 채널 토큰만 쓰며 기본 토큰
   폴백 없음(오계정 게시 방지).

## 의도적으로 하지 않는 것

- **남의 영상에 댓글 달기.** Threads 는 답글 참여가 랭킹 신호라 검색 참여가
  틱의 한 단계지만 YouTube 는 브랜드 계정이 남의 영상에 다는 댓글을 도달 신호로
  쓰지 않는다 — 스팸 인접 행동이고 계정 신호만 깎는다. search.list 는 호출당
  100유닛(일 기본 10,000)이라 비용도 맞지 않는다.
- **댓글 숨김·삭제.** `sns_comment_moderate` 는 YouTube 를 지원하지 않는다(API 가
  주는 것은 의미가 다른 검토 보류/거부뿐). 스팸은 보고만 하고 Studio 에서 처리한다.
- **Related video 자동 설정.** Data API 에 해당 필드가 없다 — 게시 후 사람이
  Studio 에서 설정해야 하며 루프는 리마인드까지만 한다(§3).

## 파일 배치 (전부 로컬 — data/ 는 커밋 대상 아님)

```
data/<채널 slug>/growth/
├── youtube/
│   ├── growth-plan.md   # 상시 승인서 (init 이 HITL 로 작성, status: approved)
│   ├── state.json       # 틱 간 이월 상태 (이중 게시 방지의 근거)
│   └── growth-log.md    # 틱별 한 줄 기록 + 지표 증감 (관찰 원장)
├── autoproduce.json     # 채널 공용 — 자동 저작 예산·이력 (Instagram 루프와 공유)
└── .autoproduce.lock/   # 채널 공용 락 — 두 루프가 동시에 저작하는 것을 막는다
```

**뒤 둘은 채널 공용**이다(플랫폼별로 나누지 않는다). 영상 한 편이 두 플랫폼에 다 나가므로
예산과 락도 채널 단위여야 한다 — 플랫폼마다 따로 세면 상한이 두 배로 새고,
플랫폼마다 따로 잠그면 락이 아무것도 막지 못한다.

템플릿과 state 스키마는 `references/growth-plan-template.md` 를 쓴다.

## init — 플랜 확정 (최초 1회, HITL)

1. `data/<채널>/profile.md` 로드 — 없으면 `/social-flow:channel add` 부터 안내하고
   중단. 톤·타깃·금기 소재를 플랜의 기본값으로 상속한다.
2. `sns_account_check(channel)` 로 YOUTUBE 토큰 확인 →
   `youtube_insights(channel, days: 7, videoLimit: 3)` 1회로 **스코프 검증**.
   `sns_comment_inbox(channel, platforms: ["YOUTUBE"], postLimit: 3)` 도 1회
   검증한다(댓글 스코프는 별개다).

   **이 단계에서 스코프 에러가 나는 것이 정상이다** — 게시용으로 발급한 기존
   토큰은 `youtube.upload` 하나뿐이라 조회·댓글 스코프가 없다. 에러에 실린 재발급
   안내(token-setup.md)를 사용자에게 전하고 **중단한다**. 인사이트 없이 루프를
   시작하지 않는다(성과 관찰이 루프의 눈이다).
3. AskUserQuestion 으로 플랜 항목을 확정한다: 게시 슬롯 1~3개(타깃 활동 시간대),
   대기열 자격(기본은 `status: produced` + `queue: ready`), 댓글 응대 톤(프로파일
   상속이 기본), 응대 제외 기준(스팸·시비조), AI 고지 정책(기본 항상 고지).

   **자동 저작은 따로 묻는다** — 루프의 권한이 게시에서 저작까지 넓어지는
   지점이라 기본값으로 켜지 않는다. 끌지 켤지, 주제를 어디서 가져올지
   (`pool` 기본 / `keywords`), 주제 풀 항목, 편당 비용 상한(기본 $0.30),
   일·주 비용 상한, 하루 저작 횟수(기본 1 — 이 플랫폼 하드캡 2 이내),
   대기열 최소 잔량(기본 1),
   저작 성공 시 함께 찍을 플랫폼 큐(`mark_queues` — 승인된 성장 플랜이 있는
   플랫폼만 제시). 채널 profile §2 의 TTS 엔진이 `gemini` 면 그 자리에서
   알린다: *"이 채널은 Gemini 엔진이라 회차마다 음성 비용이 붙습니다(400자
   기준 약 $0.015). 비용 0인 로컬로 바꾸려면 profile §2 를 고쳐야 하고,
   그러면 나레이터 목소리가 바뀝니다."*
4. `growth-plan.md` 를 템플릿대로 작성하고 **전문을 보여준 뒤 명시 승인**을 받아
   `status: approved` 로 저장한다. 이때 반드시 고지한다: *"이 플랜이 상시
   승인서입니다 — 루프는 `queue: ready` 를 찍은 영상을 슬롯에서 게시별 승인 없이
   즉시 공개 게시하고, 받은 댓글에 자율로 답합니다. 중단은 /loop 중지, 범위 변경은
   플랜 수정으로 합니다."* 자동 저작을 켰으면 한 줄 더 고지한다: *"대기열이
   비면 루프가 스스로 주제를 골라 영상을 만들고, 기계 검증을 통과하면 사람이
   보기 전에 게시됩니다. 하루 최대 N편·편당 $X 안에서 돕니다."*
5. `state.json` 초기화, growth-log.md 헤더 작성.

## tick — 자율 사이클 (기본 모드)

### 0. 로드·게이트

`growth-plan.md`(approved 확인)·`state.json`·`references/growth-playbook.md` 로드.
state 의 날짜 버킷이 오늘이 아니면 일 카운터를 리셋한다.

### 1. 인박스 답글 (최우선 — 골든아워)

`sns_comment_inbox(channel, platforms: ["YOUTUBE"], sinceHours: 48)` →
`summary.withinGoldenHour` 가 0 이 아니면 그 댓글부터. 답글 문안은 플레이북
§답글 규칙으로 작성해 `sns_comment_reply(platform: "YOUTUBE")` 로 단다.

중복 방지는 인박스의 `answeredByUs` 필터가 보장한다 — YouTube 는 스레드 안 우리
마지막 답글 시각으로 판정하므로, 우리 답글 **뒤에** 달린 새 댓글은 미응대로
남아 정상적으로 잡힌다. 대댓글 id 를 넘겨도 툴이 스레드 루트로 바꿔 단다.

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

스팸·혐오 댓글은 답하지 않고 다음 틱 요약에 보고만 한다(숨김은 자율 범위 밖 —
YouTube 는 툴 지원도 없어 Studio 에서 처리한다).

### 2. 인사이트 스냅샷 (관찰)

`youtube_insights(channel, days: 7, videoLimit: 10)` → `state.lastInsights` 와
비교해 구독자 증감·조회 추이를 growth-log 에 한 줄 적고 state 를 갱신한다.

**Analytics 는 2~3일 지연된다** — 어제·오늘 값이 비어 있는 것은 장애가 아니다.
증감은 7일 구간끼리 비교한다. 구독자 수가 비공개면(`subscriberCountHidden`)
반올림 값이라 증감 판단에 쓰지 않고 조회·시청 지표만 본다.

영상별 지표에서 **도달 상위 영상의 유형**(소재·길이·형식)과
`averageViewPercentage` 를 읽어 다음 기획에 반영한다 — 이 학습 루프가 없으면
자동화는 같은 영상만 반복한다. 관찰 결과는 사용자에게 보고하고, 기획 반영은
storyboard 파이프라인에서 사람이 한다.

스와이프 이탈률(Studio 의 "How many chose to view")은 API 에 없다 — 훅 판정은
`averageViewPercentage` 로 하고, 스와이프 지표가 필요하면 Studio 확인을 권한다.

### 2.5 대기열 보충 — 자동 저작 (플랜이 켠 경우만)

플랜 `autoproduce.enabled: true` 가 아니면 이 단계를 통째로 건너뛴다.

**대기열이 마를 때만 만든다.** `queue: ready` 인 미게시 주제 수가 플랜
`autoproduce.min_queue`(기본 1) 미만일 때만 저작하고, 그 외에는 아무것도 하지
않는다. 쌓아 두려고 미리 만들지 않는다 — 재고는 돈이고, 시효성 있는 소재는
묵으면 틀린 정보가 된다.

저작 전 확인 순서 (하나라도 걸리면 저작하지 않고 사유만 보고한다):

1. 대기열 `ready` 잔량 < `min_queue`
2. `autoproduce.json` 의 오늘·이번 주 누적이 `daily_cost_cap`·`weekly_cap` 이내
3. 오늘 **이 플랜의** 저작 편수(성공·실패 포함, autoproduce.json 의
   `counts.<플랫폼>`)가 **min(`daily_produce_cap`, 2)** 미만 — 2 는 플랫폼별
   하드캡이다(autoproduce 절대 규칙 7). 다른 플랫폼 루프의 저작은 여기 세지
   않는다
4. 채널 락(`data/<채널>/growth/.autoproduce.lock`)을 잡을 수 있음 —
   못 잡으면 다른 플랫폼 루프가 저작 중이라는 뜻이므로 그냥 넘어간다

통과하면 `${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/SKILL.md` 를 Read 하고
**무인 모드 절차를 그대로 수행**한다. 이때 §2 에서 읽은 지표를 티어 판정
인자로 넘긴다 — 최근 3편의 `averageViewPercentage` 평균이 30% 미만이면 커버
모션 승급, 게시 이력이 3편 미만이면 승급 없음(`references/cost-tiers.md`).

**저작이 성공하면 플랜 `autoproduce.mark_queues` 에 적힌 플랫폼 큐를 전부
찍는다.** 한 번 만든 9:16 마스터가 두 플랫폼에 다 나가므로, 플랫폼마다 따로
만들면 비용이 두 배가 되고 같은 채널이 플랫폼마다 다른 영상을 올리게 된다.
다만 **승인된 플랫폼만** 찍는다 — 해당 플랫폼의 `growth-plan.md` 가 있고
`status: approved` 일 때만이다. 없는 승인서를 대신 써 주지 않는다.

저작에 걸리는 시간은 몇 분이다(Veo 를 쓰면 더 길다). 그 틱이 길어지는 것은
정상이며, 저작이 끝나면 그대로 §3 으로 넘어가 **같은 틱 안에서 게시까지** 될 수
있다.

실패했을 때는 어디서 떨어졌느냐에 따라 다르다. 조사 게이트에서 떨어졌으면 그 주제를
버리고(파일도 남기지 않는다) 다음 후보로 가되, 두 번 버리면 이번 틱의 저작을
포기한다. 영상까지 만들어 놓고 품질 게이트에서 떨어졌으면 `queue: hold` 로
남기고 **같은 주제를 다시 만들지 않는다** — 반복 실패는 돈만 태운다.

**어느 경로로 끝나든 그때까지 쓴 비용을 `autoproduce.json` 에 기록한다.**
실패분을 빼고 세면 게이트에서 계속 떨어지는 채널이 예산을 무한히 쓴다.
오늘 저작 횟수도 성공·실패를 함께 센다. 사유는 growth-log 에 적고 보고한다.

### 3. 슬롯 게시 (대기열 소진)

오늘 슬롯 중 **시각이 이미 지났고 · 경과 3시간 이내이며 · `filledSlots[오늘]`
에 없는** 슬롯이 있을 때만(여럿이면 가장 이른 것 하나) 대기열을 훑는다.
3시간이 지난 슬롯은 건너뛴다(루프가 꺼져 있다가 밤에 아침 슬롯을 몰아 게시하는
사고 방지).

대기열 후보는 `data/<채널>/*/storyboard/storyboard.md` 중 frontmatter 의 `status`
가 `produced` **또는** `published` 이면서 `queue: ready` 이고,
`state.publishedTopics` 에 없는 주제다. 여럿이면 `queue_at`(없으면 파일 mtime) 이
가장 오래된 것 하나.

**`published` 를 제외하지 않는 것이 중요하다.** `status` 는 플랫폼 구분이 없는
한 칸짜리 값인데, 같은 주제를 여러 플랫폼에 큐잉했을 때 다른 경로(publish 스킬·
grow-instagram 이 마킹한 편을 사람이 게시)가 먼저 나가면 이 값이 `published` 로
바뀐다. `produced` 만 받으면 그 순간 유튜브 쪽 후보에서 **에러 없이 조용히
제외된다** — `queue: ready` 는 그대로 남은 채로. 자동 저작이 두 플랫폼 큐를 함께
찍는 것이 기본 경로가 되면서 이 상황이 흔해졌다. 중복 게시를 막는 건 `status` 가
아닌 `queue` 마커와 `state.publishedTopics`, 그리고 아래 publish-log 확인이다.

게시 전 확인 — 먼저 **`output/publish-log.md` 에 YOUTUBE 행이 이미 있는지 본다.**
있으면 publish 스킬로 이미 나간 주제이므로 게시하지 않고 `queue: done` 으로
정리한 뒤 보고한다(`state.publishedTopics` 는 이 루프가 게시한 것만 담으므로
사람이 게시한 것까지 막지 못한다). 이어서 `output/video/video.mp4`(**자막 없는 클린 마스터**) 와
`output/youtube/meta.md` 존재, `output/video/cover.jpg` 존재(없으면 임의 프레임이
썸네일이 된다 — 사용자에게 보고하고 건너뛴다), `output/video/subs.srt` 존재.
**자막 파일이 없으면 게시하지 않고 보고한다** — 자막은 영상과 따로 올리는 것이
원칙이라(publish 스킬 규칙 8), 자막 없이 나간 영상은 나중에 파일만 올려 고치려면
사람 손이 든다. 옛 빌드라면 `/social-flow:produce` 로 다시 빌드해야 한다.

`youtube_publish(channel, videoFilePath, title, caption, thumbnailFilePath, captionFilePath)` —
`captionFilePath` 는 `output/video/subs.srt` 로컬 경로다.
`containsSyntheticMedia` 는 지정하지 않는다(기본 true). 응답에 `captionWarning`
이 오면 **게시는 성공한 것이다** — 재게시하지 말고 경고를 틱 보고에 싣는다
(가장 흔한 원인은 토큰에 `youtube.force-ssl` 스코프가 없는 것이다). 성공하면:

- storyboard.md frontmatter 를 `status: published`, `queue: done` 으로 갱신
- `output/publish-log.md` 에 permalink 기록 (publish 스킬과 같은 형식)
- state 의 `filledSlots`·`publishedTopics` 에 기록
- **`pendingRelatedVideo` 에 videoId 를 넣는다** — Related video 는 API 로 설정할
  수 없다. 틱 보고에 "Studio > 콘텐츠 > 해당 Short > Related video 에서 롱폼
  연결 필요"를 실어 사람이 처리하게 한다(플레이북 §퍼널).
- **쇼츠 세로 표면 프레임을 지정한다** — `thumbnailFilePath` 는 가로 표면만 바꾸고,
  쇼츠 피드·채널 쇼츠 탭의 세로 프레임은 YouTube 앱 프레임 선택으로만 바뀐다
  (publish 스킬 `references/shorts-surface-adb.md`). 채널 전용 AVD(profile.md §4)가
  스냅샷에 로그인된 채로 있으면 틱이 직접 실행하고 `oardefault.jpg` 200 을 확인한다.
  에뮬레이터가 없거나 로그인이 풀렸으면 **루프를 세우지 말고** videoId 와 보류
  사유를 growth-log 와 틱 보고에 적어 사람이 처리하게 한다(업로드 직후 5분은
  프레임 피커가 불안정하므로 다음 틱으로 미뤄도 된다).

실패 시에는 filledSlots 에 기록하지 않되 **이번 틱 안에서 재시도도 하지
않는다**(다음 틱이 같은 슬롯을 다시 시도). 실패 사유는 growth-log 에 적는다.
`thumbnailWarning` 이 오면 게시는 성공한 것이므로 재업로드하지 않고 경고만 보고한다.

### 4. 저장·보고

`state.json` 저장(lastTickAt 갱신) → growth-log.md 에 틱 요약 한 줄 append →
사용자 보고 한 줄:
`[틱 hh:mm] 답글 n · 저작 n($x, 티어) · 게시 n(슬롯) · 구독자 ±n · Related 대기 n`.
아무 액션이 없던 틱은 "관찰만" 으로 적는다 — 조용한 틱이 정상이다.

## status — 상태 보고

state.json + growth-log.md 최근 20줄 + `youtube_insights` 1회로 현황을 요약한다:
구독자·조회 추이, 최근 7일 게시 수, 도달 상위 영상 3개와 평균 시청 비율,
대기열에 남은 주제 수, 다음 슬롯, Related video 미설정 목록. 게시 없음.
자동 저작을 켰으면 `autoproduce.json` 에서 오늘·이번 주 누적 비용과 상한 대비
잔량, 주제 풀 잔량, `queue: hold` 로 멈춰 있는 주제 목록을 함께 보고한다 —
hold 는 사람이 보기 전에는 영원히 게시되지 않으므로 여기서 상기시키지 않으면
잊힌다.

## 에러 대응 (루프는 계속 돈다)

- **스코프 에러**(재발급 안내 포함) → 그 단계만 건너뛰고 틱 요약에 안내를 실어
  보고한다. 다음 틱에도 반복되면 루프 중지를 권한다. 조회 스코프와 댓글 스코프는
  별개라 한쪽만 막힐 수 있다.
- **쿼터 초과** — Data API 일 10,000유닛, 업로드는 별도 버킷(일 100회). 인박스가
  영상 수에 비례해 유닛을 쓰므로(영상당 1~2) `postLimit` 을 줄여 재개한다.
- **댓글 사용 중지 영상** → 403 이 정상이며 `commentsError` 로만 실려 온다(무시).
- **토큰 만료·취소** → 게시가 전부 막히므로 루프 중지를 권하고 token-setup.md
  갱신 절차를 안내한다. YouTube refresh_token 은 프로덕션 게시 후 발급분이면
  반영구지만 테스트 모드에서 발급한 것은 7일 만에 만료된다.
