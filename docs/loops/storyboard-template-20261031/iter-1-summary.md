# 1회차 요약 — 56점, P0 1

## 1회차 작업
- `story_shot`: 장면을 바꾼 샷을 그 장면 끝으로 옮긴다.
- `shot_image`: 시작 이미지를 다시 만들면 낡은 종료 이미지를 샷에서 떼고 경고한다.
- `shot_characters`: 빠진 화자의 화면 속 대사와 낡은 시작 이미지를 경고한다(검증에서 쓰기 거부로 드러남 → 2회차에서 고침).
- `video_approve`: `storyboard/video-approvals.js`에 샷별 승인을 쓰고, 템플릿이 승인 배지를 그린다.
- 템플릿: 종료 이미지 프롬프트, 끝 상태, 장소·소품 줄, 아직 없는 프레임 파일의 대기 표시.

## 2회차에 고친 지시(verify-1.md 순서)
1. P0 얼굴 행 → `castFacesHtml(s)`가 `charsOf`로 `{id,scope}`를 읽는다.
2. D1 `shot_characters`: 빠진 화자의 `on_screen` 줄을 `off_screen`으로 바꿔 쓰고 경고한다. 쓰기는 성공한다.
3. D2 `shot_icons`: route가 바뀌면 이전 route의 이동(techniques·visual.camera 또는 render.camera)을 지운다.
4. D3 `shot_icons`: first_last가 아닌 계획은 종료 이미지·끝 상태·종료 소품·종료 프롬프트를 떼고 경고한다. reference 전환 시 캐릭터 참조 `use`를 맞춘다.
5. D4 `story_shot`: 삽입·이동 뒤 `eyeline.matchShot`을 같은 샷으로 다시 매긴다.
6. D5 `shot_image`: MLX 입력 한도를 모델 계열로(Qwen-Image-2.1 10장, FLUX.2 klein·Mage-Flow Edit 4장, 그 외 0장).
7. D6 `shot_image`: GPT Image 입력 형식을 바이트로 판별하고, 섞이면 PNG 사본(`images/inputs/`)으로 보낸다.
8. 템플릿 칩 툴팁에 이동·초점의 이유와 대상, 프레임 계획 줄(`frames.mode`·`reason`), 종료 소품.
9. `video_approve`: 계획 뒤 샷이 바뀐 낡은 계획을 거부(`video_plan_stale`), `contextRevision`에 샷 프롬프트를 넣었다. `shown`은 계획이 쓴 값이고, 호출 프롬프트는 `callPrompt`로 표시. 이전 승인과 재사용 클립 배지 처리. 문서 과장 수정.
10. P1 `storyboard_read` 행에 `title`·`summary`·`locationId`.
11. P2: `story_sequence`가 `payoff`를 받는다. `shot_image`는 그림 route가 아닌 샷과 종료 이미지의 `location`을 거부하고, 종료 이미지는 `frames.endProps`를 기록한다. `shot_prompt`의 인용 대사 뒤 마침표 중복 제거.

## 확인
- `npm test` 2625개 통과, CI 셀프테스트 17개 통과, 변경 줄 D8 0건.
- 검증 에이전트의 재현 스크립트 e1·e2·e4·e5에서 D1~D6이 재현되지 않는다.

## 바뀐 파일
server/src/{storyboard,tools,video-routing}.ts, server/dist/{bundle,astra-shot-runtime.bundle,storyboard,tools,video-routing}.js,
server/test/{storyboard,storyboard-html,video-routing}.test.mjs, skills/storyboard/references/{storyboard-html-template.html,structure-contract.js},
skills/_shared/{video-selection.js,production-workflow.md}, skills/storyboard/SKILL.md, skills/generate-cut-{images,videos}/SKILL.md
