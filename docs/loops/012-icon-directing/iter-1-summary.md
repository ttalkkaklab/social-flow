# 1회차 요약

- 점수: 98/100, P0 0건. 통합 전 트리를 채점했으므로 루프는 2회차로 넘어간다.
- 객관 게이트: build·`npm test`(2630)·assembler selftest 모두 exit 0.

## 다른 세션과의 조율

- moonfish 세션(브랜치 `storyboard-template-adversarial-eval`)이 같은 함수를 고치고 있었다. `writeShotIcons`·`writeShotPrompt`·템플릿 이동 칩·`shot_prompt` 설명이 겹쳤다. `git merge-tree`로 미리 합쳐 보니 소스 4곳과 dist에서 충돌이 났다.
- 메시지로 합의한 내용:
  - moonfish가 먼저 dev에 머지한다(PR #537, d6cd3e0b).
  - 이 루프는 그쪽 구조 위에 기능을 얹는다. 구조는 `notes: Finding[]`, `sentence()`, `Audio: … no music`, `promptBasis`다.
  - `promptBasis`의 camera에 `cam.end`를, focus에 from→to를 더한다. 이 확장은 이 루프의 커밋에서 한다.
- 통합 절차:
  1. 메인 체크아웃의 `.worktree/tropicbird-integrate`에서 moonfish 최신 커밋(2597cca6) 위에 변경을 얹어 충돌을 풀었다. 테스트 2635개와 CI 전 단계가 통과했다.
  2. moonfish 머지를 확인한 뒤 tropicbird를 origin/dev로 빨리감기하고 통합 diff를 적용했다. 파일 25개가 통합본과 같았다.

## 1회차 지적 반영

- 끝 구도(`camera.end`)는 카메라 문장과 떼어 `Closing frame: …` 한 문장으로 쓴다.
- `move.target`은 이동이 겨누는 대상이라는 한 뜻으로 정리하고 도구 설명을 고쳤다.
- `shot_icons`가 영상 컷의 `target`과 `focus.from`·`to`에 들어온 한국어를 필드 이름과 함께 거부한다. `shot_prompt`도 어느 필드인지 밝힌다.
- 테스트를 더했다.
  - 앵글 7종의 아이콘과 한국어 이름
  - 핸들러의 세로 안내 출력
  - 한국어 `depthTitle`
  - 리뷰 세트 스틸 레인의 `hold`
  - 문장으로 쓴 끝 구도
  - 한국어 입력 거부
- 스틸 `tilt`와 `ground`의 효과 문구를 앞뒤 컷 조건으로 바꿨다.
- 카드 설명은 "use·avoid·specify는 모두, pair·vertical은 있는 경우에만"으로 고쳤다.
- assembler selftest에 크기 낱말의 원문 기대값 하나를 되살렸다.
- `animation-review-contract.cjs` 스틸 레인에 `hold`를 넣었다.
- moonfish verify-5의 P2 1번도 처리했다. 스틸 컷에 focus 기법을 주면 스틸 효과로 고르라고 알려 주며 거부한다.

## 남긴 항목

- `ground`와 얼굴 크기의 조합 경고는 넣지 않았다. 2026-10-31 지침이 품질 검사를 걷어 냈기 때문이다. 카드의 avoid가 이 조합을 안내한다.
- `mount()`의 `maxZoom` 계산은 브라우저 캔버스가 있어야 해서 단위 테스트가 없다. `state()`의 상한 동작은 테스트한다.

## 환경 메모

`~/.config/social-flow/disabled-tools.json`(2026-10-31 15:19 생성)이 레거시 `astra_*` 도구를 끈다. 그래서 로컬 `npm test`에서 `astra-video-client` 20건이 실패한다. 이 루프의 객관 게이트는 CI와 같게 `HOME`을 빈 폴더로 두고 돌린다.
