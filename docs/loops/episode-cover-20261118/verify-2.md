# Verify 2 — 86/100, P0 0, FAIL

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 설계 충족 | 20/25 | `set` 반환에 결정 해시가 없다(설계 5.3) |
| 2 정확성 | 20/25 | `shortsLandscapeCrop:'9:16'` 일 때 문구는 1:1 띠로 가는데 `landscape-16x9` 미리보기는 옛 띠로 잘라 문구가 잘린다(`cover.ts:521`) |
| 3 렌더 결과 | 15/15 | 기본 설정 커버에서 □·잘림·띠 이탈 없음 |
| 4 문서↔코드 | 10/10 | 도구 설명·README·SKILL·publish 절차 일치, Test & Compare 서술이 조사 보고서와 같다 |
| 5 객관 게이트 | 10/10 | tsc, npm test 1887 통과, check:dist, skill-lint, format-lint |
| 6 테스트 규칙 | 6/10 | 롱폼 렌더(변형·배지) 케이스 없음, 결정 스키마 거부와 레이아웃 미완료 거부 케이스 없음 |
| 7 범위·문체 | 5/5 | 범위 안, D8 0건 |

1회차 P0 두 건은 재현으로 해결을 확인했다. 실행한 공격 22건 가운데 2회차 수정을 겨냥한 것이 9건이고, 결함은 미리보기 띠 한 건이다.

## P1/P2
- P1: `set` 반환에 결정 해시가 없다.
- P2: 파싱은 되지만 `sources`·`warnings` 가 없는 render.json 에서 `readCover` 가 TypeError 를 낸다.
- P2: 폰트 파일이 바뀌어도 stale 로 보지 않는다.
- P2: 깨진 cover.json 에서 `read` 가 상태 대신 예외를 던진다.

ASTRA_LOOP_RESULT: score=86 verdict=FAIL p0=0 iter=2
