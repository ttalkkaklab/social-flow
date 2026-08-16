# growth-plan.md 템플릿 + state.json 스키마 (Instagram)

init 이 HITL 로 작성한다. `status: approved` 가 아니면 grow-instagram 은 게시하지
않는다. 경로는 `data/<채널>/growth/instagram/` — 성장 스킬은 플랫폼별로 분리되므로
플랫폼마다 자기 하위 디렉토리를 쓴다.
플랜 수정 후에는 사용자 승인을 다시 받아 approved 로 되돌린다.

```markdown
---
channel: ttalkkak-lab
status: approved            # draft | approved — approved 만 자율 게시 허용
approved_at: 2026-08-11
tone: 존댓말                # 댓글 응대 말투 (profile.md 상속)
slots: ["09:00", "21:00"]   # 게시 슬롯 1~3개 (현지 시각, 타깃 활동 시간대)
daily_caps:
  publishes: 2              # = slots 수 (상한 3)
weekly_target: 4            # 주간 게시 목표 3~5 (Buffer 실측 균형점 — 상한이 아니라 목표)
queue_rule: "status: produced|published + queue_instagram: ready + 공개 URL 해석 가능"
media_hosting: base_url     # base_url | staged | off — off 면 루프가 게시하지 않는다
media_base_url: "https://cdn.example.com/social-flow"
account_status_check: weekly   # 앱의 계정 상태 점검 주기 (API 없음 — 사람이 확인)
autoproduce:                # 대기열이 마르면 루프가 직접 저작한다 (기본 꺼짐)
  enabled: false            # true 로 켜는 순간 루프의 권한이 게시 → 저작까지 넓어진다
  topic_source: pool        # pool(승인 목록에서) | keywords(지식iN 질문에서 발굴)
  min_queue: 1              # ready 잔량이 이 수 미만일 때만 저작
  daily_produce_cap: 1      # 이 플랜의 하루 저작 편수 (성공·실패 합산, 상한 2 — 플랫폼별 하드캡)
  duplicate_threshold: 0.5  # 중복 판정 임계 (check-duplicate.py) — 시리즈물 채널만 올린다
  max_cost_per_video: 0.30  # USD — lite 승급은 통과, fast·표준은 막힌다
  daily_cost_cap: 0.60      # USD
  weekly_cap: 2.00          # USD
  mark_queues: ["instagram"]  # 저작 성공 시 찍을 큐 — 승인된 성장 플랜이 있는 플랫폼만
---

# <채널명> Instagram 성장 플랜

## 미디어 호스팅 (게시의 전제)

`instagram_publish` 의 `videoUrl` 은 **공개 접근 가능한 HTTPS URL** 이어야 한다.
플랫폼이 직접 크롤하므로 로컬 경로·인증 URL 이 안 된다. 루프는 이 URL 을 스스로
만들어내지 못하므로 셋 중 하나를 고른다.

**올리는 파일은 자막 번인본(`video-sub.mp4`)이다.** 다른 플랫폼은 자막을 파일로
따로 받지만 IG 컨테이너에는 자막 파라미터가 없어서, 클린 마스터(`video.mp4`)를
올리면 자막이 통째로 사라진다. 빌더가 같은 원본에서 두 벌을 뽑아 두므로
호스팅에 올릴 것만 고르면 된다.

- **`base_url`** — 안정 호스팅이 있다. URL 은 `<media_base_url>/<주제 slug>/video-sub.mp4`
  로 결정적으로 만든다. 파일을 그 자리에 올려두는 것은 사람 몫이다.
- **`staged`** — 사람이 큐에 넣을 때 storyboard.md frontmatter 에 `video_url:` 을
  직접 적는다. 주제마다 URL 이 달라도 되지만 **번인본을 가리켜야 한다**.
- **`off`** — 안정 호스팅이 없다(임시 터널 등). **루프는 게시하지 않고** 인박스 응대와
  지표 관찰만 하며, 대기열 잔량을 틱 보고에 싣는다. 게시는 사람이
  `/social-flow:publish` 로 한다.

> 루프가 스스로 터널을 띄우는 일은 없다. 임시 터널은 publish 스킬의 철거 검증
> 절차(서빙 종료 확인)와 짝을 이루는데, 자율 루프에는 그 절차를 지킬 사람이 없다.

## 게시 대기열 규칙

`data/<채널>/<주제>/storyboard/storyboard.md` frontmatter 의 `status` 가
`produced` **또는** `published` 이면서 `queue_instagram: ready` 인 주제만 자율 게시
대상이다. `published` 를 빼면 안 된다 — `status` 는 플랫폼 구분이 없는 한 칸이라,
같은 주제를 YouTube 에도 큐잉했을 때 그쪽이 먼저 나가면 `published` 로 바뀌고
인스타 쪽 후보에서 조용히 사라진다.

큐에 넣는 방법 — storyboard.md frontmatter 에 추가한다.

```yaml
queue_instagram: ready
queue_at: 2026-08-11        # 여럿일 때 오래된 것부터 나간다 (생략 시 파일 mtime)
video_url: https://…/video-sub.mp4   # media_hosting: staged 일 때만 (자막 번인본)
```

**마커가 `queue:` 가 아니라 `queue_instagram:` 인 이유** — `queue:` 는 grow-youtube 가
쓰는 마커다. 둘이 같은 키를 보면 먼저 도는 루프가 `queue: done` 으로 바꿔 다른 쪽이
영영 게시하지 못한다. 같은 이유로 grow-instagram 은 **게시 결과로** `status:` 를
건드리지 않는다(`status: published` 로 바꾸면 YouTube 대기열 자격이 사라진다).
인스타 게시 사실은 `queue_instagram: done` 과 publish-log.md 에만 적힌다.
자동 저작이 없던 주제를 만들며 `status: produced` 를 쓰는 것은 제작 단계의 일이라
예외다 — `produced` 는 두 루프의 대기열 자격을 모두 만족시킨다.

## 자동 저작 (autoproduce)

`enabled: false` 면 이 절은 없는 것과 같다 — 대기열은 사람만 채운다.
**`media_hosting: off` 여도 돌지 않는다** — 나갈 길이 없는 영상을 돈 들여 만들지
않는다.

**주제는 여기서만 나온다.** `topic_source: pool` 이면 아래 목록의 미사용 항목을
오래된 순서로 쓰고, **비면 저작을 멈추고 보고한다 — 주제를 지어내지 않는다.**
`keywords` 는 지식iN 질문에서 소재를 발굴하는 모드라 소재 위험이 커진다.

```yaml
topic_pool:
  - "베트남 임시거주 신고 절차"
  - "비자 수수료 인상 시점"
topic_keywords: ["베트남 비자", "주재원 행정"]   # topic_source: keywords 일 때만
```

- **비용** — 편당 상한 `max_cost_per_video`, 일·주 누적은 채널 공용
  `data/<채널>/growth/autoproduce.json` 에 쌓인다. 사다리와 승급 조건은
  `skills/autoproduce/references/cost-tiers.md` 가 정본이며, 인스타의 승급
  트리거는 최근 3편 `reels_skip_rate` 평균 55 초과다(백분율 단위).
- **품질** — 기계 게이트(사실 검증·문체·스토리보드 리뷰 문안·이미지·빌드 리포트·content-reviewer P0·비용)를
  다 통과한 편만 `queue_instagram: ready` 가 되고, 하나라도 떨어지면 `hold` 다.
- **중복** — 저작 전에 `check-duplicate.py` 가 후보를 채널의 기존 주제 전부와
  비교한다. slug 이 달라도 말만 바꾼 같은 이야기면 후보를 버린다(임계
  `duplicate_threshold`, 기본 0.5). 재탕은 IG 원본성 판정도 깎는다.
- **편수** — 이 플랜의 하루 저작은 **최대 2편**(플랫폼별 하드캡, 성공·실패
  포함). `daily_produce_cap` 은 그 안에서만 내릴 수 있다. 유튜브 플랜은 자기
  캡을 따로 가지므로, 둘 다 켜면 채널에서 하루 최대 4편이 만들어질 수 있다 —
  비용 상한(`daily_cost_cap`)은 채널 합산이라 그쪽이 총량을 조인다.
- **저작 ≠ 게시 준비 완료** — 릴스는 공개 HTTPS URL 이 있어야 나가는데 루프는
  파일을 호스팅에 올리지 못한다. 자동 저작이 끝나도 사람이 업로드하기 전까지는
  게시되지 않으며, 루프는 틱 보고로 그 사실을 알린다.
- **함께 찍을 큐** — `mark_queues`. 영상 한 편이 두 플랫폼에 다 나가므로 여기에
  `youtube` 를 넣으면 유튜브 루프가 같은 편을 게시한다(그쪽은 로컬 파일을 직접
  업로드해서 호스팅이 필요 없다). **그 플랫폼의 growth-plan.md 가 approved 일
  때만 넣는다.**

## 댓글 응대 범위

- 답한다: 질문, 소감, 정보 보탬, 오류 지적
- 답하지 않는다(보고만): 스팸·광고, 혐오·비하, 시비조 도발, 개인정보 노출
- 판단이 서지 않으면 답하지 않고 다음 틱 요약에 올린다

## 금지 소재 (플랜 갱신 없이는 절대 게시 금지)

- 정치·종교·특정 국적 비하
- 미검증 제도 정보 (시행일·금액은 storyboard 파이프라인의 검증을 거친 것만)

## 원본성 (계정 자격을 지키는 선)

게시 대상은 **우리 파이프라인 산출물**(`output/video/video-sub.mp4`)뿐이다. 외부에서
받아온 영상, 타 플랫폼 워터마크가 남은 파일, 속도만 바꾼 재편집은 대기열에 넣지
않는다 — 원본성 판정에서 떨어지면 게시물 하나가 아니라 계정 전체가 비팔로워 추천에서
빠진다(플레이북 §자격을 잃는 길).

## 계정 상태 점검

앱의 **계정 상태(Account Status)** 는 API 가 없어 루프가 읽지 못한다. 주 1회 사람이
확인하고, 도달이 급락하면 편집보다 먼저 본다. 확인 결과는 여기 한 줄로 적는다.

| 확인일 | 추천 자격 | 메모 |
| --- | --- | --- |
| 2026-08-11 | 적격 | — |
```

## state.json — 틱 간 이월 상태

이중 게시 방지의 근거가 이 파일이다. 틱마다 읽고 끝에 저장한다.
날짜 키가 오늘이 아니면 그 버킷은 리셋한다. API 응답 원문은 저장하지 않는다.

```json
{
  "channel": "ttalkkak-lab",
  "lastTickAt": "2026-08-11T09:30:00+09:00",
  "filledSlots": { "2026-08-11": ["09:00"] },
  "publishedTopics": ["20260811-visa-fee"],
  "lastAccountStatusPrompt": "2026-08-10",
  "lastInsights": {
    "capturedAt": "2026-08-11T09:30:00+09:00",
    "followersCount": 412,
    "reach7d": 9100,
    "views7d": 18400,
    "profileViews7d": 260,
    "topReel": {
      "mediaId": "18012...",
      "views": 8200,
      "reelsSkipRate": 41.0,
      "avgWatchTimeMs": 7300,
      "shares": 12
    }
  }
}
```

- `filledSlots` — 게시 성공 시에만 기록. 실패 슬롯은 다음 틱이 재시도한다.
- `publishedTopics` — 게시한 주제 slug. **같은 릴스 재업로드를 막는 최후 방어선**이다.
  frontmatter 의 `queue_instagram: done` 과 이중으로 둔 이유는 파일 쓰기가 실패해도
  state 가 남으면 중복이 안 나가기 때문이다. 최근 200개만 유지한다.
- `lastAccountStatusPrompt` — 계정 상태 확인을 마지막으로 요청한 날. 플랜의
  `account_status_check` 주기가 지나면 틱 보고에 다시 싣는다.
- `lastInsights` — 다음 틱의 증감 비교 기준. `followersCount` 는 인사이트가 아닌
  프로필 필드값이다(인사이트의 follower_count 는 팔로워 100 미만에서 빈 값).

## autoproduce.json — 채널 공용 저작 예산·이력

`data/<채널>/growth/autoproduce.json` 은 플랫폼별이 아닌 **채널 공용**이다 —
영상 한 편이 두 플랫폼에 다 나가기 때문이다. 스키마와 락 규약은
`skills/autoproduce/SKILL.md` §0 이 정본이다 — 여기 복사하지 않는다.
두 성장 루프가 같은 파일을 쓰므로, 읽기→저작→쓰기를 전부 락 안에서 한다.

## growth-log.md — 관찰 원장 (append only)

```markdown
# <채널명> Instagram 성장 로그

| 시각 | 답글 | 저작 | 게시 | 팔로워 | 이탈률 | 평균 시청 | 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 08-11 09:30 | 3 | - | 1(09:00) | 412(+7) | 0.41 | 7.3초 | 비자 수수료 편 도달 상위 |
| 08-11 10:30 | 0 | 1($0.05 경제) | 0 | - | - | - | 대기열 0 → 자동 저작 · 업로드 대기 |
| 08-11 11:30 | 0 | - | 0 | - | - | - | 관찰만 |
```

주 1회(월요일 첫 틱) 요약 줄을 추가한다: 주간 4지표(`reels_skip_rate`·
`ig_reels_avg_watch_time`·도달당 공유·계정 `profile_views`) + 도달 상위 릴스 유형 한 줄
+ 이번 주 게시 수와 목표(주 3~5) 대비.
