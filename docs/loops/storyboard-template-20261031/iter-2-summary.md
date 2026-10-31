# 2회차 요약 — 76점, P0 0

## 3회차에 고친 지시(verify-2.md 순서)
1. 낡은 영상 프롬프트: `shot_prompt`가 프롬프트의 근거(`visual.video.promptBasis` — 프레임 계획, 캐스트, 화면 속 대사, 카메라 이동, 초점 기법, MSR이면 크기·앵글·심도)를 함께 쓴다. 공용 `structure-contract.js promptDrift`가 지금 샷과 비교한다. `shot_characters`·`shot_dialogue`·`shot_icons`는 바뀐 부분을 이름으로 경고하고, 템플릿은 장면 머리와 프롬프트 탭에 "영상 프롬프트를 쓴 뒤 바뀜"을 그린다(`storyboard_apply`로 바꾼 것도 페이지가 잡는다).
2. 시작 이미지 교체 시 `frames.endProps`도 지운다. 종료 소품 줄은 종료 이미지가 있을 때만 그린다.
3. 렌더 칩 툴팁에 `render.purpose`를 `reason` 앞에(`renderTip`).
4. `shot_icons` 설명: still_camera로 가면 카메라 기법과 이동, still_camera에서 오면 스틸 효과를 지운다고 고쳤다. 낡은 프롬프트 경고도 적었다. `shot_prompt` 설명에 `promptBasis`.
5. `payoff` 테스트, MSR 칩 조건을 `msrLane`으로 빼서 테스트.
6. 점수 밖: 장면 `out`을 장면 띠에 "마지막 말"로 그린다(`sceneOutHtml`). ffmpeg가 없으면 `image_inputs_mixed_format`. 입력 바이트는 GPT Image에서만 읽는다. 같은 인물이 다시 들어왔는데 `off_screen` 줄이 있으면 경고한다.
7. 이번에 하지 않은 것: 이전 승인 뷰 재생성(오늘 들어온 기능이라 기존 승인이 거의 없다), 장면 전 `payoff` 경고, 비-MSR 참조 숨김(설계).

## 확인
- `npm test` 2625개 통과, CI 셀프테스트 17개 통과, D8 0건.

## 바뀐 파일(2회차 대비 추가)
skills/storyboard/references/structure-contract.js(promptBasis·promptDrift), server/src/{storyboard,tools}.ts, 템플릿, 테스트 2개, skills/generate-cut-videos/SKILL.md, skills/_shared/production-workflow.md
