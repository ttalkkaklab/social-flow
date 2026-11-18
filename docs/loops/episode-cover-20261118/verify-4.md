# Verify 4 — 81/100, P0 0, FAIL

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 설계 충족 | 25/25 | set 의 결정 해시가 render.json·read 와 같다(일반·변형·NFD·무글자) |
| 2 정확성 | 10/25 | D1 실패한 재렌더가 본 파일을 이미 덮어써 output/cover 와 output/video 사본이 어긋난다. D2 정리 정규식이 도구가 쓰지 않은 같은 모양의 사용자 파일(`cover-1x1-b.jpg`, `previews/mynotes.png` 등)을 지운다. D3 1초 영상의 0.999초 프레임을 set 은 받고 render 는 뽑지 못한다 |
| 3 렌더 결과 | 15/15 | 베트남어·일본어·NFD 한글·긴 영어 단어·32:9 원본 확인, □·잘림 없음 |
| 4 문서↔코드 | 10/10 | changed 항목 서술이 코드와 같다 |
| 5 객관 게이트 | 10/10 | tsc, npm test 1890 통과, check:dist, skill-lint, format-lint |
| 6 테스트 규칙 | 6/10 | 형식 변경, 미리보기 삭제, 실패한 재렌더, 사용자 파일 보존에 케이스가 없다 |
| 7 범위·문체 | 5/5 | 범위 변화 없음 |

세 결함 모두 3회차 수정(ebb50183)이 연 경로에서 나왔다.

## P2
- 같은 에피소드를 동시에 렌더하면 `.work` 를 서로 지워 한쪽이 실패한다.
- 직접 호출로 `emphasis: undefined` 를 넘기면 set 해시와 render 해시가 다르다(MCP 입력으로는 만들 수 없다).

ASTRA_LOOP_RESULT: score=81 verdict=FAIL p0=0 iter=4
