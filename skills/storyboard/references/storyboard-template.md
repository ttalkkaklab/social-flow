# storyboard.md / research.md 표준 구조

## storyboard.md

사람이 검토·승인하는 문서. 씬별 표와 생성 이미지를 임베드해 **이 문서만 보고
최종 영상을 상상할 수 있어야** 한다.

```markdown
---
channel: <채널 slug>
topic: <주제 slug>
status: draft            # draft | approved | produced | published
created: <YYYY-MM-DD>
---

# <주제 표시명> — 스토리보드

- **채널**: <표시명> (`data/<slug>/profile.md`)
- **예상 총길이**: <NN>초 (본편 <N>씬 + 아웃트로)
- **핵심 메시지**: <이 영상이 남기는 한 문장>
- **커버 훅**: "<커버 title>" — 히어로 수치 <stat>

## 씬 1 — cover

![scene-1](images/scene-1.png)

| 항목 | 내용 |
|---|---|
| 길이 목표 | ~<N>초 |
| kicker | <값> |
| title | <값> (자수: N) |
| stat / statLabel | <값> / <값> |
| 나레이션 ① | tts: "<발음 표기>" · sub: "<원표기>" |
| 나레이션 ② | tts: "…" · sub: "…" |
| 비주얼 | 생성 배경 + veo 모션 "<motion>" |
| 배경 프롬프트 | <bgPrompt 요약> |

## 씬 2 — points
(같은 형식 — bullets 표, reveal 순서 명시)

…씬 반복…

## 출처 (research.md 요약)

| 주장 | 출처 | 확인일 | 상태 |
|---|---|---|---|
| <핵심 수치> | [<매체>](<URL>) | <날짜> | ✅ 2개 교차 |

## 플랫폼 계획

| 플랫폼 | 형태 | 비고 |
|---|---|---|
| instagram | 릴스 | |
| youtube | 쇼츠 | 제목 키워드: <…> |
| threads | 커버 이미지 + 링크 답글 | |
| facebook | 영상 게시 | |
```

## research.md

조사·검증의 원장. 스토리보드에 실리는 **모든 사실 주장**이 여기 항목과 1:1 로
연결돼야 한다.

```markdown
# <주제> — 조사·검증 기록 (<YYYY-MM-DD>)

## 검증 통과

| # | 주장 | 출처 1 | 출처 2 | 도구 | 비고 |
|---|---|---|---|---|---|
| 1 | <수치·기한·시행일> | <URL> | <URL> | naver_search | 원문 발췌: "…" |

## 검증 실패 → 제외

| 주장 | 사유 |
|---|---|
| <주장> | 출처 상충 — 본문에서 제외 |

## 검색 이력

| 도구 | 쿼리 | 결과 요지 |
|---|---|---|
| naver_search(news) | "<쿼리>" | … |
| WebSearch | "<쿼리>" | … |
```

## 상태 전이

`draft` → (HITL 승인) → `approved` → (produce 완료) → `produced` → (publish 완료) → `published`

각 스킬이 자기 단계 완료 시 storyboard.md frontmatter 의 `status` 를 갱신한다 —
디렉토리만 봐도 파이프라인 진행 상태를 알 수 있다.
