# 1회차 요약 — 025 cliche-use

점수 93 · P0 1 · 객관 게이트 통과(테스트 1,889) · 판정 FAIL. 기록: `verify-1.md`.

## 감점

| 기준 | 점수 | 이유 |
|---|---|---|
| 3 테스트 | 8/10 | 평가자가 K5(반복·실제 대사 경고) 사례를 줄 단위로 확인하지 못함 |
| 4 저장소 규칙 | 8/10 | 도구 설명 길이, 표지 셋, README 도구 개수를 평가자가 재지 않음 |
| 7 깨기 시도 | 2/5 | P0 한 건, P2 네 건 |

## P0

`storyboard_apply`의 `globals.CLICHES`로 추천 유형 보드에 "적용" 기록을 직접 쓸 수 있었다. 검사는 `writeStoryCliches`에만 있었고, 읽기와 보드 요약은 그런 기록을 말없이 받아들였다.

## 2회차에서 한 일 (평가자의 Fix Directives 순서)

1. **우회로 차단.** `applyPatch`가 `globals.CLICHES`를 바꾸는 패치를 `cliche_record`로 거부한다. 기록을 쓰는 곳은 `story_cliche`뿐이다(내부 호출만 통과). 블록을 그대로 실어 보낸 패치는 키 순서가 달라도 통과한다. 파일을 손으로 고친 경우는 막을 수 없으므로 보고한다. `cliches.js`의 `reading()`이 추천 유형에서 사용자 선택 없이 이야기에 들어간 항목을 `unpicked`로 돌려주고, `story_cliche`는 `cliche_unpicked` 경고를, 보드 요약은 한 줄을 낸다.
2. **이름 입력.** 이름이 `#5`처럼 번호뿐이면 스키마가 받지 않는다(번호는 `id`에 적는다). `writeStoryCliches`가 인자를 직접 파싱하므로 도구를 거치지 않은 호출도 공백뿐인 이름을 받지 않는다.
3. **검토 화면.** 보드에 없는 장면 번호에 「보드에 없음」 표시를 붙인다. 근거가 기록되지 않은 항목은 「근거 미기록」으로 보여 주고 「기본 적용」을 지어내지 않는다.
4. **경고에 코드 부여.** `cliche_undecided`, `cliche_unpicked`, `cliche_caution`, `cliche_quote`, `cliche_practice`, `cliche_repeat`, `cliche_scene_missing`, `cliche_not_recorded`. 테스트는 문구 대신 코드를 확인한다.
5. **문서.** `cliche-use.md` §7, `scenes-schema.md`, `CLAUDE.md`, 도구 설명에 기록 소유(`cliche_record`)와 `cliche_unpicked`를 적었다. `CLAUDE.md`의 「새 보드」를 「새 에피소드 보드」로 바로잡았다.

## 고친 파일

`server/src/storyboard.ts`, `server/src/tools.ts`, `server/dist/**`, `server/test/{storyboard,cliches,storyboard-html}.test.mjs`, `skills/storyboard/references/{cliches.js,cliche-use.md,scenes-schema.md,storyboard-html-template.html}`, `CLAUDE.md`.

## 다음 평가자에게 알릴 확인 지점

- K5 테스트: `server/test/storyboard.test.mjs`의 「warns about caution entries, quoted lines and a repeat on the channel…」 사례가 `cliche_caution`, `cliche_quote`, `cliche_repeat` 코드를 확인한다.
- `story_cliche` 설명은 1,800자대이고 Use it, Do NOT, Returns 표지가 있다. 서버 도구는 157개이고 README도 157로 적혀 있다(`skill-lint.js`가 대조).
- 유형을 드라마에서 추천 유형으로 바꾼 뒤 남은 기본 적용 기록은 거부하지 않고 `cliche_unpicked`로 보고한다. 기록을 지우거나 바꾸면 이야기와 기록이 어긋나기 때문이다.
