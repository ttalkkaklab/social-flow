# 4회차 요약 — 84점, P0 1

## 5회차에 고친 지시(verify-4.md 순서)
1. P0 `shot_icons`의 같은 이동 판정: 그 기법이 `shot.techniques`에 있거나, 이동 기법이 하나도 기록되지 않았을 때 손으로 쓴 `visual.camera.movement`가 그 기법의 이동으로 시작하면 같은 이동이다. 같은 이동은 `speed`·`target`을 그대로 둔다. 회귀 케이스: `storyboard_apply`로 쓴 `{movement:"dolly in", speed:"slow", target:"her eyes"}`에 `camera.dolly-in`을 주어도 세 값이 그대로다.
2. D8: `verify-3.md` 세 줄을 고쳤다. 이번부터 보고서를 저장한 뒤 루프 문서 전체와 `f6af2705` 이후 추가 줄을 스캔한다.
3. P1 `shot_icons`: 시작 이미지가 있는 샷에서 크기·앵글·심도나 시작 이미지 프롬프트에 쓰이는 기법(framing·초점·시점·앵글)이 바뀌면 "remake it with shot_image" 경고. 설명에 한 문장, 테스트 한 개.
4. 테스트: 스틸 효과는 같은 효과일 때만 target을 유지, `video_approve {auto:true}` 뒤 승인 보기의 `auto`, 템플릿의 "Approved with every shot".
5. P2 `story_sequence`가 시퀀스 밖 장면을 가리키는 `payoff`를 경고한다. 캐스트 순서만 바꾸면 시작 이미지 경고를 내지 않는다.
6. 이번에 하지 않은 것: 그림 route가 아닌 경로의 이미지 정리, 변경 전 승인의 보기 재생성, 제목이 같은 시퀀스의 조회.

## 확인
- `npm test` 2627개 통과, D8 0건(루프 문서 포함).
- 검증 에이전트의 재현 스크립트 x1(B2)·x3(#2)에서 P0·P1이 재현되지 않는다.

## 다음
- 최신 dev(#535 출연진 카드, #536 음악 큐)를 합친 뒤 마지막 검증을 돌린다. 충돌은 템플릿 장면 띠 한 곳(dev의 `musicLane`과 이 루프의 `sceneOutHtml`)이다.
