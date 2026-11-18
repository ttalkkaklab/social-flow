# Verify 3 — 91/100, P0 0, FAIL

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 설계 충족 | 20/25 | `set` 이 돌려주는 `decisionSha256` 이 render.json 의 값과 다르다. set 은 메모리 객체를, render·read 는 zod 파싱 결과를 해시해 키 순서가 바뀐다 |
| 2 정확성 | 25/25 | 실행한 공격 33건에서 재현된 결함 없음 |
| 3 렌더 결과 | 15/15 | 2줄 문구·강조어 끝 배치 시트 확인, □·잘림 없음 |
| 4 문서↔코드 | 10/10 | `unreadable`·`decisionSha256`·`font` 서술이 코드와 같다 |
| 5 객관 게이트 | 10/10 | tsc, npm test 1889 통과, check:dist, skill-lint, format-lint |
| 6 테스트 규칙 | 6/10 | 폰트 낡음 판정과 9:16 설정의 3분할 시트에 케이스가 없다 |
| 7 범위·문체 | 5/5 | 범위 안, D8 0건 |

## P2
- 변형을 지우고 다시 렌더하면 옛 변형 파일과 미리보기가 디스크에 그대로 있다(게시 대응표는 무시한다).
- 보드 형식이 바뀌어도 read 가 fresh 로 본다.
- previews 를 지워도 read 가 fresh 로 본다.

ASTRA_LOOP_RESULT: score=91 verdict=FAIL p0=0 iter=3
