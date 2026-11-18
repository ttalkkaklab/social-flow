# 3회차 요약 — 025 cliche-use

점수 97 · P0 0 · 객관 게이트 통과(테스트 1,889) · 판정 PASS. 기록: `verify-3.md`. 2회차 통과 뒤의 수정이 새 결함을 만들지 않았다는 것을 확인했다.

## 감점

| 기준 | 점수 | 이유 |
|---|---|---|
| 7 깨기 시도 | 2/5 | P2 세 건 |

## 통과 뒤 고친 것

1. **유형 변경 보고 (P2-A).** 평가자는 `PRODUCTION.videoType`도 `clicheUse`처럼 고정하라고 했다. 그렇게 하지 않았다. 한 에피소드의 유형을 바꾸는 것은 `model-settings.md`가 정한 절차이고(사용자 요청을 `PRODUCTION.modelSettings.overrides`에 적는다), 고정하면 그 절차가 막힌다. 대신 `PRODUCTION` 패치로 클리셰 적용 방식이 바뀌면 `storyboard_apply`가 `cliche_mode_changed` 경고를 낸다.
2. **글자 수와 보이지 않는 문자 (P2-B).** 길이 한도를 두었다: 이름 120자, 옮긴 점과 없음 사유 300자. C1 제어 문자, 폭 없는 공백, 방향 전환 문자가 든 글은 거부하고, 번호뿐인 이름 검사는 다른 문자 체계의 숫자까지 본다. 이모지 결합 문자(ZWJ)는 예외로 통과시킨다.
3. **검토 화면 장면 번호 (P2-C).** 띠에서 같은 장면 번호를 한 번만 적고, 정수가 아닌 값은 뺀다.
4. **`--genre comedy`.** 오류를 내는 대신 받아들이고, 코미디는 장르 목록에 없어서 후보가 좁혀지지 않는다고 알린다.

## 고친 파일

`server/src/storyboard.ts`, `server/src/tools.ts`, `server/dist/**`, `server/test/{storyboard,cliches,storyboard-html}.test.mjs`, `skills/storyboard/references/{cliches.js,cliche-use.md,storyboard-html-template.html}`.

## 남겨 둔 것

- 저장된 기록의 주의 경고는 `story_cliche`를 부를 때마다 다시 나온다. 보고는 기록 전체를 읽은 결과라서 그대로 두었다.
- 유형 변경이 실제 사용자 요청에서 나왔는지는 도구가 확인하지 못한다. `basis:"user"`와 마찬가지로 작성자가 지켜야 하는 규칙이고, 변경은 경고로 드러난다.
