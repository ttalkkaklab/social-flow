# 2회차 요약 — 025 cliche-use

점수 98 · P0 0 · 객관 게이트 통과(테스트 1,889) · 판정 PASS. 기록: `verify-2.md`. 통과 기준(95점 이상, P0 0, 게이트 통과)을 넘었다.

## 감점

| 기준 | 점수 | 이유 |
|---|---|---|
| 7 깨기 시도 | 3/5 | P2 두 건으로 채점(보고서 목록에는 세 건) |

## 통과 뒤 고친 것 (평가자의 선택 지시)

1. **저장된 선택 위조.** `storyboard_apply`로 `PRODUCTION.clicheUse`를 `on`으로 써 넣으면 추천 유형에서도 선택 없이 적용할 수 있었다. 이제 `PRODUCTION`을 고치는 패치는 보드가 가진 `clicheUse` 값을 그대로 두고 `cliche_choice_kept` 경고를 낸다. 새로 만드는 보드는 받은 값을 그대로 쓴다. 채널의 선택은 `project_manage update`로만 바뀐다.
2. **`--episodes` 경로.** 디렉토리가 아니면 `cliches.js pick`이 종료 코드 2로 멈춘다. 전에는 반복 확인이 말없이 꺼졌다.
3. **코미디 장르.** 목록의 장르에는 코미디가 없다. `cliche-use.md` §2와 `cliches.js needs` 출력에 "코미디는 어느 장르의 클리셰든 가져와 마지막에 깨고, 웃음이 필요하면 `relief`로 찾는다"고 적었다.
4. **목록 두 항목.** #129의 첫 필요를 `obstacle`로 바꿨다. #89의 설명에서 제작 사정(출연진 하차 수)을 빼고 극 중 장치만 적었다.
5. **이름 입력.** 제어 문자가 든 이름과 전각 `＃５` 같은 번호뿐인 이름을 받지 않는다.

## 고친 파일

`server/src/storyboard.ts`, `server/src/tools.ts`, `server/dist/**`, `server/test/{storyboard,cliches}.test.mjs`, `skills/storyboard/references/{cliches.js,cliche-catalog.json,cliche-use.md,scenes-schema.md}`, `CLAUDE.md`.

## 3회차 평가에 알릴 것

- 통과 뒤의 수정이 새 결함을 만들지 않았는지 확인하는 회차다. 대상은 `git diff 7d9d3e95..HEAD`이다.
- 테스트는 보드의 `PRODUCTION`을 에피소드 스냅샷이 넘겨준 것처럼 파일에 직접 쓴다. `storyboard_apply`로는 `clicheUse`를 바꿀 수 없게 됐기 때문이다.
