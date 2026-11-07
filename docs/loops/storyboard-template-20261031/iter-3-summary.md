# 3회차 요약 — 94점, P0 1

## 4회차에 고친 지시(verify-3.md 순서)
1. P0 `shot_icons`: 다른 이동 기법은 이전 기법의 `speed`·`target`을 지우고 새 기법의 값만 쓴다. 같은 기법을 다시 주면 적지 않은 값은 그대로 둔다. 스틸 컷의 `target`도 같은 규칙이다. 회귀 케이스: whip-pan(target) → dolly-in이면 `visual.camera`가 `{movement:"dolly in"}`이다.
2. 테스트 보강: `structure-contract.test.mjs`에 `promptDrift`·`videoLines`·`storyboard_read` 행(`title`·`summary`·`locationId`) 케이스, 종료 이미지가 없을 때 "End props" 줄이 없음, MLX Qwen-Image-2.1이 5장을 받음.
3. P2 크기를 바꾸며 `why`를 안 주면 이전 `why`를 지운다.
4. P2 캐스트에서 빠진 인물의 캐릭터 참조를 `visual.references`에서 뺀다(`characters/<id>/` 경로 기준).
5. P2 `storyboard_apply`로 영상 프롬프트를 고치면 `promptBasis`를 지운다(단계 도구 쓰기는 제외).
6. P2 대사(보이스오버 제외, `structure-contract.js videoLines`)를 계획 `contextRevision`과 승인 `shown.lines`에 넣었다. 승인 뒤 대사가 바뀌면 배지가 "다시 승인 필요"를 그리고, 계획 뒤 대사가 바뀌면 `video_approve`가 `video_plan_stale`로 거부한다.
7. P2 MSR 칩 툴팁·참조 칸 안내를 "최대 4장(한 명이면 3장)"으로 고쳤다. `shot_image.location` 설명에 종료 이미지 거부를 적었다.
8. 이번에 하지 않은 것: 그림 route가 아닌 경로로 바꿀 때 이미지 정리(다시 돌아오면 쓰인다), 없는 장면의 `payoff` 경고.

## 확인
- `npm test` 2627개 통과, CI 셀프테스트 17개 통과, D8 0건.
- 검증 에이전트의 재현 스크립트 r6·r7에서 P0·P1이 재현되지 않는다.
