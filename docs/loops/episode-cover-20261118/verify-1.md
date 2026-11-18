# Verify 1 — 71/100, P0 2, FAIL

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 설계 충족 | 10/25 | `unverified.shortsLandscapeCrop` 를 쓰지 않음, publish 에 Test & Compare 변형 절차 없음, render.json 에 판독 기준 px 없음 |
| 2 정확성 | 15/25 | 아래 P0 두 건 |
| 3 렌더 결과 | 15/15 | □·잘림·띠 이탈·외곽선 문제 없음, 미리보기 크롭 일치 |
| 4 문서↔코드 | 10/10 | 이름·인자·코드 일치 |
| 5 객관 게이트 | 10/10 | npm test 1884 통과, check:dist·skill-lint·format-lint 통과 |
| 6 테스트 규칙 | 6/10 | 용량 상한 축소·거부 케이스, frame 원본 렌더 케이스, `$` 회귀 케이스 없음 |
| 7 범위·문체 | 5/5 | 범위 안, D8 0건 |

## P0
1. `cover.ts:422` 문자열 치환이 문구 속 `$&`·`$'`·`` $` `` 를 치환 패턴으로 해석해 페이지 스크립트가 깨지고, 검은 커버가 경고 없이 `output/video/cover.jpg` 로 복사된다(시도 1). 측정값이 비어도 성공으로 받는다(`cover.ts:425-428`, `:447`).
2. `cover.ts:516-518` `readCover` 가 손으로 고친 `cover.json` 의 에피소드 밖 경로를 `inside()` 없이 해시한다(시도 14).

## 실행한 공격 21건 요약
`$` 문구(결함), `$100`(정상), `<b>`·`</script>`·강조 경계(정상), 80자 문구(경고만), 구두점·이모지(이모지는 `cover_font_missing`), 초점 경계(정상), 심볼릭 링크 탈출(거부), 길이와 같은 프레임 시각(거부), 손으로 고친 seconds(P2 문구), 깨진 JSON·버전(거부), 원본 교체(stale·거부), 두 번 렌더·파일 삭제(fresh·stale), 옛 보드 복사(복사 안 함), 경로 밖 source.path 의 read(결함), 작은 원본(경고), 변형(정상), 언어별 폰트(정상), 제목 반복(경고), Chrome 없음(추론), Facebook 썸네일(정상), publish 대응표(정상).

## P1/P2
- P1: 문구가 있는데 측정값이 없으면 `cover_chrome_failed` 로 거부해야 한다.
- P2: 손으로 고친 프레임 시각이 길이를 넘으면 오류 문구가 헷갈린다. 깨진 render.json 이 원시 JSON 오류를 낸다. 도구 설명이 Chrome 없음을 set 거부로 적었다.

ASTRA_LOOP_RESULT: score=71 verdict=FAIL p0=2 iter=1
