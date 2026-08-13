# growth-plan.md 템플릿 + state.json 스키마 (YouTube)

init 이 HITL 로 작성한다. `status: approved` 가 아니면 grow-youtube 는 게시하지
않는다. 경로는 `data/<채널>/growth/youtube/` — 성장 스킬은 플랫폼별로 분리되므로
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
queue_rule: "status: produced|published + queue: ready"   # 대기열 자격 (기본값)
ai_disclosure: always       # always | per-topic — always 면 루프가 고지를 끄지 않는다
autoproduce:                # 대기열이 마르면 루프가 직접 저작한다 (기본 꺼짐)
  enabled: false            # true 로 켜는 순간 루프의 권한이 게시 → 저작까지 넓어진다
  topic_source: pool        # pool(승인 목록에서) | keywords(지식iN 질문에서 발굴)
  min_queue: 1              # ready 잔량이 이 수 미만일 때만 저작
  daily_produce_cap: 1      # 이 플랜의 하루 저작 편수 (성공·실패 합산, 상한 2 — 플랫폼별 하드캡)
  duplicate_threshold: 0.5  # 중복 판정 임계 (check-duplicate.py) — 시리즈물 채널만 올린다
  max_cost_per_video: 0.30  # USD — lite 승급은 통과, fast·표준은 막힌다
  daily_cost_cap: 0.60      # USD
  weekly_cap: 2.00          # USD
  mark_queues: ["youtube"]  # 저작 성공 시 찍을 큐 — 승인된 성장 플랜이 있는 플랫폼만
---

# <채널명> YouTube 성장 플랜

## 게시 대기열 규칙

`data/<채널>/<주제>/storyboard/storyboard.md` frontmatter 의 `status` 가
`produced` **또는** `published` 이면서 `queue: ready` 인 주제만 자율 게시
대상이다. produced 만으로는 나가지 않는다 — "제작 완료"와 "올려도 된다"는 다르다.
`published` 를 빼면 안 된다 — `status` 는 플랫폼 구분이 없는 한 칸이라, 같은
주제를 인스타에도 큐잉했을 때 그쪽이 먼저 나가면 `published` 로 바뀌고 유튜브 쪽
후보에서 조용히 사라진다. 중복 게시는 `queue` 마커와 publish-log 확인이 막는다.

큐에 넣는 방법: storyboard.md frontmatter 에 두 줄을 추가한다(자동 저작을 켰으면
루프가 같은 두 줄을 직접 쓴다).

```yaml
queue: ready
queue_at: 2026-08-11        # 여럿일 때 오래된 것부터 나간다 (생략 시 파일 mtime)
```

## 자동 저작 (autoproduce)

`enabled: false` 면 이 절은 없는 것과 같다 — 대기열은 사람만 채운다.
켰다면 아래가 저작의 범위이자 한계다.

**주제는 여기서만 나온다.** `topic_source: pool` 이면 아래 목록의 미사용 항목을
오래된 순서로 쓴다. **비면 루프는 저작을 멈추고 보고한다 — 주제를 지어내지
않는다.** `keywords` 로 바꾸면 아래 키워드로 지식iN 질문을 훑어 소재를 발굴하는데,
그만큼 소재 위험이 커지므로 금지 소재 목록을 먼저 손본다.

```yaml
topic_pool:
  - "베트남 임시거주 신고 절차"
  - "비자 수수료 인상 시점"
topic_keywords: ["베트남 비자", "주재원 행정"]   # topic_source: keywords 일 때만
```

- **비용** — 편당 상한 `max_cost_per_video`, 일·주 누적 상한은 채널 공용
  `data/<채널>/growth/autoproduce.json` 에 쌓인다. 사다리와 승급 조건은
  `skills/autoproduce/references/cost-tiers.md` 가 정본이다.
- **품질** — 기계 게이트(사실 검증·문체·스토리보드 리뷰 문안·이미지·빌드 리포트·content-reviewer P0·비용)를
  다 통과한 편만 `queue: ready` 가 되고, 하나라도 떨어지면 `queue: hold` 로
  남아 사람을 기다린다.
- **중복** — 저작 전에 `check-duplicate.py` 가 후보를 채널의 기존 주제 전부와
  비교한다. slug 이 달라도 말만 바꾼 같은 이야기면 후보를 버린다(임계
  `duplicate_threshold`, 기본 0.5).
- **편수** — 이 플랜의 하루 저작은 **최대 2편**(플랫폼별 하드캡, 성공·실패
  포함). `daily_produce_cap` 은 그 안에서만 내릴 수 있다. 인스타 플랜은 자기
  캡을 따로 가지므로, 둘 다 켜면 채널에서 하루 최대 4편이 만들어질 수 있다 —
  비용 상한(`daily_cost_cap`)은 채널 합산이라 그쪽이 총량을 조인다.
- **함께 찍을 큐** — `mark_queues` 에 적힌 플랫폼. 영상 한 편이 두 플랫폼에 다
  나가므로 여기에 `instagram` 을 넣으면 인스타 루프가 같은 편을 게시한다.
  **그 플랫폼의 growth-plan.md 가 approved 일 때만 넣는다.**

## 댓글 응대 범위

- 답한다: 질문, 소감, 정보 보탬, 오류 지적
- 답하지 않는다(보고만): 스팸·광고, 혐오·비하, 시비조 도발, 개인정보 노출
- 판단이 서지 않으면 답하지 않고 다음 틱 요약에 올린다

## 금지 소재 (플랜 갱신 없이는 절대 게시 금지)

- 정치·종교·특정 국적 비하
- 미검증 제도 정보 (시행일·금액은 storyboard 파이프라인의 검증을 거친 것만)

## AI 고지 정책

기본 `always` — `containsSyntheticMedia` 를 끄지 않는다. 이 채널의 영상은 Veo·
Lyria 를 쓰므로 고지 대상이고, 고지가 노출·수익에 불이익을 주지 않는다.
면제 조건(대본·자막·자기 목소리 복제·비사실적 애니메이션만 사용)에 해당하는
주제가 생기면 그 주제만 여기 예외로 적고 사용자가 직접 판단한다.

## Related video 정책

게시 후 Studio 에서 사람이 연결한다(API 미지원). 기본 연결 대상: <롱폼 영상 또는
시리즈 대표 영상>. 연결 대상이 없으면 비워 두고 루프 리마인드를 무시해도 된다.
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
  "pendingRelatedVideo": [
    { "videoId": "abc123", "topic": "20260811-visa-fee", "publishedAt": "2026-08-11T09:02:00+09:00" }
  ],
  "lastInsights": {
    "capturedAt": "2026-08-11T09:30:00+09:00",
    "subscriberCount": 412,
    "subscriberCountHidden": false,
    "views7d": 18400,
    "engagedViews7d": 11200,
    "averageViewPercentage7d": 71.3,
    "topVideo": { "videoId": "abc123", "views": 8200, "averageViewPercentage": 88.1 }
  }
}
```

- `filledSlots` — 게시 성공 시에만 기록. 실패 슬롯은 다음 틱이 재시도한다.
- `publishedTopics` — 게시한 주제 slug. **같은 영상 재업로드를 막는 최후 방어선**이다.
  storyboard.md 의 `status: published` 와 이중으로 둔 이유는 파일 쓰기가 실패해도
  state 가 남으면 중복이 안 나가기 때문이다. 최근 200개만 유지한다.
- `pendingRelatedVideo` — Studio 에서 Related video 를 아직 연결하지 않은 영상.
  사용자가 처리했다고 알리면 제거한다. 30일이 지난 항목은 자동으로 버린다.
- `lastInsights` — 다음 틱의 증감 비교 기준. Analytics 2~3일 지연 때문에 하루
  단위 비교는 의미가 없어 7일 구간 값을 저장한다.

## autoproduce.json — 채널 공용 저작 예산·이력

`data/<채널>/growth/autoproduce.json` 은 플랫폼별이 아닌 **채널 공용**이다 —
영상 한 편이 두 플랫폼에 다 나가기 때문이다. 스키마와 락 규약은
`skills/autoproduce/SKILL.md` §0 이 정본이다 — 여기 복사하지 않는다.
두 성장 루프가 같은 파일을 쓰므로, 읽기→저작→쓰기를 전부 락 안에서 한다.

## growth-log.md — 관찰 원장 (append only)

```markdown
# <채널명> YouTube 성장 로그

| 시각 | 답글 | 저작 | 게시 | 구독자 | 평균 시청률 | 메모 |
| --- | --- | --- | --- | --- | --- | --- |
| 08-11 09:30 | 3 | - | 1(09:00) | 412(+7) | 71.3% | 비자 수수료 편 도달 상위 · Related 미연결 |
| 08-11 10:30 | 0 | 1($0.05 경제) | 0 | - | - | 대기열 0 → 자동 저작 |
| 08-11 11:30 | 0 | - | 0 | - | - | 관찰만 |
```

주 1회(월요일 첫 틱) 요약 줄을 추가한다: 주간 4지표(engagedViews·평균 시청 비율·
구독 증감·영상당 조회 분포) + 도달 상위 영상 유형 한 줄.
