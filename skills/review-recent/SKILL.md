---
name: review-recent
description: >
  This skill should be used when the user asks to "최근 영상 피드백", "유튜브 인스타
  평가", "게시분 보고서", "지표 보고서 만들어", "review recent posts", "feedback on
  the last videos", or wants a YouTube + Instagram report on the latest published
  videos. Calls content_feedback for the last 5 posts per platform, writes a
  chart-first HTML report under data/<channel>/growth/review-recent.html, and
  opens it.
argument-hint: "<채널> [limit]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__content_feedback"]
---

# 최근 게시분 피드백 — HTML 보고서

유튜브와 인스타 최근 게시분을 **플랫폼 섹션을 나눠** 채점한다. 채점 결과는
채팅에 풀어 쓰지 않는다. 도표·퍼널·막대 차트 위주 HTML 을 쓰고 그 파일을 연다.

```
/social-flow:review-recent 재테크
/social-flow:review-recent 재테크 5
```

## 절차

1. **채널 확인** — 인자가 없으면 `data/*/profile.md` 를 찾아 채널을 고른다.
   `data/<slug>/profile.md` 가 없으면 `/social-flow:channel add` 를 안내하고 중단.
2. **툴 호출** — `mcp__social-flow__content_feedback`
   - `channel`: slug
   - `limit`: 인자 또는 5 (최대 10)
   - `days`: 28
   - `outputPath`: `data/<slug>/growth/review-recent.html` (cwd 상대)
3. **기록 사본** — 같은 폴더에 `review-recent-YYYYMMDD-HHMM.html` 로 한 번 더
   복사한다(덮어쓰기 이력).
4. **연다** — ego lite 가 있으면 `file://` 로 보고서를 연다. 없으면 경로만 보고.
5. **채팅 보고** — 경로 한 줄 + 플랫폼별로 "손대기 N · 손볼 점 N · 대기 N".
   편별 숫자는 HTML 이 정본이다. 표를 채팅에 다시 그리지 않는다.

## 지표 (툴이 정본)

비교 기준은 **이번 N편 중앙값**이다. 유튜브 30초 70% 같은 절대선은 쓰지 않는다.

| 플랫폼 | 보는 것 | 빠지면 손대는 레버 |
| --- | --- | --- |
| YouTube | 초반 통과 `engagedViews/조회` · 평균 시청 % · 조회 | 훅 · 유지 · 각도(조회만 낮고 훅·유지가 살면 제목을 문제로) |
| Instagram 릴스 | 3초 이탈 · 평균 시청 초 · 도달 대비 공유 | 훅 · 유지 · 공유 |

유튜브 클릭률·편당 구독, 인스타 릴스별 팔로우는 플랫폼이 안 주거나 불안정하다.
보고서에 그 칸은 비워 두고 없는 척하지 않는다.

토큰이 없는 플랫폼은 그 섹션만 "없음"으로 두고 나머지 플랫폼은 쓴다.
둘 다 실패하면 중단하고 setup-youtube / setup-instagram 을 안내한다.

## 규칙

- 보고서를 사람이 다시 윤문하지 않는다. 툴이 쓴 HTML 이 산출물이다.
- 성장 루프 상태(`growth-plan.md`)를 바꾸지 않는다. 관찰만 한다.
- 게시 툴을 호출하지 않는다.
