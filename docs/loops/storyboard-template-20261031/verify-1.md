# 검증 1회차 — 56/100, P0 1, FAIL

loop-verifier 보고서(요약 없이 옮김). 재현 스크립트는 세션 scratchpad의 `h/{e1,e2,e4,e5,render3}.mjs`.

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 템플릿↔도구 필드 계약 | 15/30 | (a) 얼굴 행이 `typeof id === "string"`로 걸러 `shot_characters`가 보존하는 `{id,scope}` 항목을 버린다(template 얼굴 행). (b) `shot_icons`가 필수로 받는 move/focus `reason`(`techniques[].reason`)을 칩이 그리지 않는다. (c) 필수 `frames.reason`은 어디에도 그려지지 않는다. −5×3 |
| 2 단계 도구 정확성 | 0/20 | D1 story-first 보드에서 `shot_characters` 재배정이 `written:false`(structure-contract.js executionCheck가 bad). D2 route를 generated_video→still_camera로 바꾸면 `techniques`·`visual.camera.movement`가 그대로 있다. D3 `frames.mode`가 first_last에서 바뀌어도 `frames.end`·`endState`·`references.use`가 그대로라 `video_plan`이 `image_plan_invalid`. D4 `story_shot` 삽입이 `eyeline.matchShot`을 다시 매기지 않는다. D5 `IMAGE_INPUTS.mlx.max=10`인데 비-Qwen 팩은 참조 3장(image-models.ts). D6 gpt-image `sourceMimeType`을 첫 입력 확장자로만 정해 PNG+JPEG 혼합이 `image_mime_mismatch`. |
| 3 스킬 문서↔도구 | 9/15 | S1 SKILL.md "캐릭터를 바꾸면 경고" — 실제는 거부(D1). S2 production-workflow.md "프롬프트·이미지·모델이 바뀌면 페이지가 표시" — `shown`은 prompt·start·end만. −3×2 |
| 4 객관 게이트 | 15/15 | `npm test` exit 0(2624 pass), dist는 재빌드와 동일(심볼릭 링크 경로 주석만 다름). |
| 5 바뀐 동작의 테스트 | 7/10 | 10개 중 7개 검증. "Start image prompt" 라벨 분기, 시작 이미지 warn, on-screen warn의 실제 결과(`written`)가 빠졌다. |
| 6 범위·D8 | 10/10 | 변경 15개 파일 모두 범위 안, 변경 파일 D8 0건. |

## P0
1. 얼굴 행이 `{id,scope}` 항목을 버려 화면의 인물을 가린다.

## P1/P2
1. P1 `storyboard_read` outline·scenes·shots 수준이 샷 `summary`·`title`을 돌려주지 않는다(structure-contract.js `shotRow`).
2. P2 `approveVideo`가 승인한 계획이 아니라 라이브 보드에서 `shown`을 읽는다.
3. P2 `shown`이 없는 이전 승인은 "승인 뒤 바뀜"으로 보인다.
4. P2 `visual.reuse` 샷이 "영상 승인 대기"로 보인다.
5. P2 종료 프레임 기록이 `location`·`props` 인자를 무시한다.
6. P2 템플릿은 시퀀스 `payoff`를 읽지만 `story_sequence`가 받지 않는다.
7. P2 `shot_image`가 그림 route가 없는 샷을 막지 않는다. `Mina says: "Wait.".` 마침표 중복.

## Fix Directives(영향 순)
1. 얼굴 행 입력을 `charsOf(s)`로. 테스트 한 케이스.
2. 빠진 화자의 `on_screen` 줄을 `off_screen`으로 바꿔 쓰고 warn. `written` 단언, 시작 이미지 warn 단언. SKILL.md·tools.ts 설명 맞춤.
3. `render.mode`가 바뀌면 이전 route의 카메라 데이터를 지운다.
4. `frames.mode`가 first_last에서 바뀌면 end·endState·endPrompt를 지우고 warn. reference 전환 시 character 참조 `use`를 맞춘다.
5. `story_shot`이 순서를 바꾸면 `eyeline.matchShot`을 다시 매긴다.
6. mlx 참조 한도를 모델 계열로(qwen-2.1은 10, 그 외 4).
7. gpt-image 입력 형식 혼합을 계획 전에 거부.
8. 칩 툴팁에 `techniques[].reason`(스틸은 `render.camera.reason`·`target`), 프레임 플래그에 `frames.reason`.
9. production-workflow.md 과장 수정, `shown`을 계획에서 읽기.
10. 테스트 보강.
11. `shotRow`에 `summary`·`title`.

ASTRA_LOOP_RESULT: score=56 verdict=FAIL p0=1 iter=1
