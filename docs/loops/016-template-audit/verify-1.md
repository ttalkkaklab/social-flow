# Verify 1 — loop-verifier 보고 (요약 전사)

- 점수: 97/100 · P0 0 · verdict PASS
- 기준별: 감사 21건 43/45 · 자동 검사 20/20 · 오크 실렌더 15/15 · 회귀 테스트 10/10 · 새 모순·문체 4/5 · 범위 5/5

## 자동 검사 (검증자가 직접 실행)

- `HOME=$(mktemp -d) npm test` → pass 1605 · fail 0
- `format-lint.js` → `137 mirrors match`, exit 0
- `storyboard-html.js <orc 사본> --check` → PASS
- `check-scenes.js --selftest` → OK

## 오크 실렌더

bad 55 / warn 257. 남은 두 종류는 보드 데이터로 판정했다.

- 제목 28건: 예전 `story_shot` 입력이 쓴 `title`(`scenes.js:322`, `:334`, `:346` …). `story_shot`은 더 이상 `title`을 받지 않고, `storyboard.ts`에 다른 작성 경로가 없다.
- 영상 프롬프트 27건: 아직 `shot_prompt` 단계에 이르지 않은 샷.

레거시 비교: gateglass bad 226 → 221, meleon 131 → 103. 새 bad 종류는 없다.

## 회귀 테스트

- H1 `server/test/storyboard.test.mjs:515-528`: 수정 전 `applyPatch`는 `transition`·`edit`를 그대로 두므로 실패한다.
- H6 `server/test/storyboard.test.mjs:505-514`: 수정 전에는 `{id, panels}`만 썼으므로 실패한다.

## P2 지적

1. H1 경계: `patch.set`으로 순서를 바꾼 전체 목록을 넘기면, 작성자가 같은 값으로 다시 적은 전환도 직전 샷이 바뀌었다는 이유로 지워진다(warn만 하나 나온다). `story_shot`도 내부에서 `set`을 쓰므로 `set`을 통째로 제외할 수는 없다.
2. id 없는 레거시 보드에서는 낡은 전환이 그대로 있다. 해는 없다.
3. `scenario-craft.md:347`이 `craft.holds`·`craft.burst`의 근거로 "storyboard SKILL §6"을 가리킨다(루프 종료 후 `legacy-authoring §6`으로 고침).
4. 템플릿 머리의 "storyboard skill §6"은 §6 "Validate and deliver"를 가리키므로 타당하다.
5. 레거시 보드의 제목 bad(gateglass 95건)는 데이터이고 배점 대상이 아니다.

ASTRA_LOOP_RESULT: score=97 verdict=PASS p0=0 iter=1
