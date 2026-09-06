# 플러그인으로 만드는 애니메이션 검토본

사용자가 표현 방식별 샘플을 요청하면 이 경로를 쓴다. 독립된 컷을 비교하는 검토 모음이며
게시용 에피소드의 승인·스토리·후크 검사를 대신하지 않는다. 사용자 피드백 전에는
`awaiting-user-review`로 기록한다. 세련미 점수나 완성 판정을 임의로 붙이지 않는다.

## 스토리보드

[illustrated-scenes.md](../../storyboard/references/illustrated-scenes.md)의 목적별 기준을 적용한다.
인물·분위기는 `still_camera`, 사람이 행동하는 설명은 `character_explanation`, 사물만으로
충분한 설명은 `object_explanation`이다. 설명 컷의 물리적 사물은 실제 메시로 만든다.

이미지는 호스트와 사용자가 지정한 도구로 마련한다. Codex에서는 내장 이미지 생성 도구를
사용하며 기존 승인 이미지도 입력으로 받을 수 있다. 별도 과금 API로 전환하지 않는다.

```bash
node "$PLUGIN/skills/storyboard/references/plan-animation-review.mjs" \
  --out "$EPISODE/storyboard/animation-review.json" \
  --images "$PORTRAIT_A" "$PORTRAIT_B" "$PORTRAIT_C"
```

계획기는 3개 카메라 컷, 3개 캐릭터 설명 컷, 3개 사물 설명 컷의 기본 모음을 작성한다.
생성된 JSON의 제목, 화면 문장, 의도, 길이와 이미지를 주제에 맞게 편집할 수 있다.
검사 계약은 `animation-review-contract.cjs`다. 유형에 맞지 않는 템플릿과 누락된 자산은 거부한다.

## 제작

```bash
node "$PLUGIN/skills/produce/references/build-animation-review.mjs" \
  "$EPISODE/storyboard/animation-review.json" --out "$DELIVERY" --posters
```

`$PLUGIN`은 수정 사항을 적용한 설치 경로다. 제작기는 JSON만 입력받고 포함된 템플릿으로
HTML을 생성한다. 에피소드 폴더의 별도 모델 제작 스크립트나 손으로 고친 납품 HTML을
끼워 넣지 않는다. 반복해서 보이는 결함은 플러그인 소스에서 고치고 같은 입력을 재실행한다.

- 카메라: 컷의 목적에 맞춰 포커스 인, 초점 이동, 부위 접근, 후퇴, 전경 등장, 깊이별 이동을 선택한다. 얼굴·손의 픽셀을 구부리지 않는다.
- 캐릭터: 말을 옮기기, 도장 찍기, 수레 끌기. 팔꿈치·손·발 관절을 움직이고 손의 접촉을 유지한다.
- 사물: 기어 맞물림, 고정 도르래, 공구함 경첩. 실제 형상과 부품 연결을 사용한다.
- 강조: 캐릭터 컷은 기본적으로 표식이 없다. 사물 컷은 필요한 부위 하나씩 짧게 표시한다. 밝은 선 받침과 짙은 연결선으로 배경과 구분한다.

`purpose`와 카메라 템플릿의 대응은 `introduce → focus-in`, `inspect → rack-focus`,
`detail → approach`, `context → pull`, `discovery → reveal`, `depth → parallax`다.
실제 컷의 내용과 자산을 보고 고른다. `focusFrom`, `focusTo`는 원본 그림의 정규화 좌표
`[x,y,rx,ry]`다. 초점 효과는 부드러운 영역 마스크로 모사하며 실제 깊이를 복원하지 않는다.
`reveal`, `parallax`에는 같은 크기의 투명 PNG `layers:[{image,depth}]`와 가려진 부분을
채운 배경이 필요하다. 레이어가 없으면 오류로 알리고 다른 연출로 임의 대체하지 않는다.

사물 표식은 `annotations:[{target,text,reason,start,end}]`로 적는다. `target`은 템플릿의
부위 번호 0 또는 1이며 시간은 초 단위다. 표시 구간은 겹치지 않고 각 구간은 컷 길이의
45% 이하로 제한한다. 지정하지 않으면 표시하지 않는다. 이전의 `labels`만으로 표식을
자동 생성하지 않는다.

이 템플릿은 절차적으로 구성한 3D 메시 일러스트다. 생성 GLB, 골격 리깅, 실사 모델이라고
표기하지 않는다. 큰 인물 동작이나 새로운 장치는 별도 모델 자산과 동작 계약을 추가해야 한다.
무음 검토본에 내레이션이 있다고 적지 않는다.

## 검증과 전달

제작기가 `slides/`에 캡처용 HTML과 렌더러 API를 함께 작성한다. 설치된
`render-motion-slide.mjs`로 초반·중간·후반을 캡처한다. `ego lite`로 실제 재생, 일시정지,
임의 탐색과 모바일 표시를 확인한다. 페이지 캡처는 플러그인의 headless 경로만 사용한다.
9개 개별 HTML은 자산을 포함하며 인터넷 없이 재생된다. 목록은 같은 폴더의 포스터를 참조한다.

`build-record.json`에는 실행된 설치 경로, 입력과 런타임의 SHA-256, 산출물 목록이 들어간다.
이 기록으로 제작 경로를 확인할 수 있다. 시각 품질은 별도로 판단한다. 미검증 항목은 별도로 적는다.
