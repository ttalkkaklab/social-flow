# 검증 3회차 — 94/100, P0 1, FAIL

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 템플릿↔도구 필드 계약 | 30/30 | 단계 도구로 만든 보드를 Chrome headless로 렌더해 낡은 프롬프트 표시, 승인 배지 3종, 장면 마지막 말, 칩 툴팁의 목적·이유, 종료 소품을 확인했다. 어긋난 필드가 없다. |
| 2 단계 도구 정확성 | 15/20 | P0 1건: `shot_icons`로 이동 기법을 바꿔도 이전 기법의 `speed`·`target`이 그대로라(`camera.whip-pan` → `camera.dolly-in`) `shot_prompt`가 "Camera: fast dolly in toward the door"를 쓴다. HEAD부터 있던 결함이다. |
| 3 스킬 문서↔도구 | 15/15 | 틀린 서술 없음. |
| 4 객관 게이트 | 15/15 | 재빌드 뒤 dist 93개 파일 변화 없음, `npm test` 2625개 통과. |
| 5 바뀐 동작의 테스트 | 9/10 | `storyboard_read` 행의 `visual.locationId`, 종료 이미지가 없을 때 "End props" 줄이 없음, Qwen-2.1 한도 10의 단언이 없다. |
| 6 범위·D8 | 10/10 | 범위 안, D8 0건. |

## P1/P2
1. P1 이동 기법을 바꾸며 `target`을 안 적으면 이전 target이 그대로 있다. 스틸 컷도 같다.
2. P2 크기를 바꿔도 이전 크기의 `why`가 그대로 있다.
3. P2 캐스트를 바꾼 뒤 `visual.references`가 옛 캐스트 패널을 가진다.
4. P2 `storyboard_apply`로 프롬프트를 고쳐도 `promptBasis`가 그대로여서 낡음 표시가 안 사라진다.
5. P2 대사가 `contextRevision`에 없어 MSR 대사를 고쳐도 배지가 "승인됨"이다(`video_execute`는 거부한다).
6. P2 `motion_html` 같은 경로로 바꿔도 시작 이미지·참조를 그대로 둔다.
7. P2 MSR 칩 툴팁 "캐릭터 이미지 4장" — 한 명이면 3장이다.
8. P2 `shot_image.location` 설명이 종료 이미지의 거부를 말하지 않는다.
9. P2 없는 장면을 가리키는 `payoff`를 받는다.
10. P2 `promptDrift` 단언이 `structure-contract.test.mjs`가 아니라 `storyboard.test.mjs`에 있다.

## Fix Directives
1. 이동 기법을 바꾸면 이전 `speed`·`target`을 빼고 새 기법의 값만 얹는다(스틸 분기도). 회귀 케이스 한 개.
2. `references.location`, "End props" 줄 조건, Qwen-2.1 한도를 한 줄씩 단언한다.
3. (점수 밖) 크기 변경 시 `why`, 캐스트 변경 시 떠난 인물의 참조, `storyboard_apply`로 고친 프롬프트의 `promptBasis`.

ASTRA_LOOP_RESULT: score=94 verdict=FAIL p0=1 iter=3
