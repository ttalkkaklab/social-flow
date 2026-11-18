# 4회차 요약 — 025 cliche-use

점수 99 · P0 0 · 객관 게이트 통과(테스트 1,889) · 판정 PASS. 기록: `verify-4.md`. 평가자는 영상 유형을 고정하지 않기로 한 결정에 동의했다.

## 감점

| 기준 | 점수 | 이유 |
|---|---|---|
| 7 깨기 시도 | 4/5 | P2 한 건: 보이지 않는 문자 목록이 불완전 |

## 통과 뒤 고친 것 (모두 선택 지시)

1. **보이지 않는 문자.** 문자 범위를 나열하던 규칙을 유니코드 속성으로 바꿨다. 제어 문자, 짝 없는 서로게이트, 줄·문단 구분자, 형식 문자(방향 표시, 폭 없는 공백, 소프트 하이픈, 태그 문자)와 빈칸으로 보이는 채움 문자(한글 채움, 점자 빈칸)를 거부한다. 결합자 두 개(U+200C, U+200D)는 이모지와 일부 문자 체계에 필요해서 통과시킨다. 눈에 보이는 글자가 하나도 없는 글도 거부한다.
2. **반대 사례 테스트.** 적용 방식이 그대로인 유형 변경(드라마에서 코미디)은 `cliche_mode_changed`를 내지 않는다는 사례를 넣었다.
3. **문서.** `CLAUDE.md`와 `storyboard_apply`의 `globals` 설명에 `cliche_mode_changed`를 적었다. `cliche-use.md` §1에는 유형은 보드에서 바꿀 수 있고 저장된 선택은 바꿀 수 없는 이유를, §7에는 경고와 거부 코드 전체를 적었다.
4. **검토 화면.** 띠의 장면 번호를 오름차순으로 적는다.
5. **이름으로 적은 목록 항목.** 목록 항목의 이름을 번호 없이 적으면 주의 표시와 반복 확인을 피할 수 있었다. 이제 이름이 목록 항목과 같으면 그 번호로 기록하고 `cliche_matched`로 알린다.
6. **읽지 못한 항목.** 손으로 고쳐 읽을 수 없게 된 항목은 다음 쓰기에서 사라진다. 그 수를 `cliche_unreadable`로 알린다.
7. **대소문자.** `cliches.js`가 필요·장르·층 이름을 소문자로 바꿔 받는다.

## 고친 파일

`server/src/storyboard.ts`, `server/src/tools.ts`, `server/dist/**`, `server/test/{storyboard,cliches,storyboard-html}.test.mjs`, `skills/storyboard/references/{cliches.js,cliche-use.md,storyboard-html-template.html}`, `CLAUDE.md`.
