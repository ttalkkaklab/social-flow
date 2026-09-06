# 스토리보드 화풍 선택

새 에피소드는 스토리보드와 이미지를 작성하기 전에 HITL로 화풍을 묻는다.
제작 방식(혼합 제작·전체 영상)과 화풍은 별도 선택이다. 두 질문을 한 번에 보여줘도 된다.
제작 방식 질문에는 production-mode.md의 최초 비용·재시도 비용·예산 상한을 함께 보여준다.
화풍만으로 API 단가가 달라진다고 말하지 않는다. 모델·길이·해상도·재시도 횟수로 계산한다.

> 어떤 화풍으로 만들까요?
> - 시네마틱 미니어처 디오라마: 배정자 편처럼 작은 모형과 인형의 질감, 영화 같은 조명으로 만듭니다.
> - 완전 실사풍: 실제 배우와 장소를 카메라로 촬영한 듯한 이미지와 영상으로 만듭니다.
> - 웹툰풍: 또렷한 선과 셀 채색으로 인물과 배경을 그립니다.

사용자가 직접 다른 화풍을 제안하면 표현 규칙을 구체화하고 지원할 프리셋을 추가한 뒤 진행한다.
선택이 없으면 스토리보드 작성을 기다린다. 추천 항목이나 무응답을 선택으로 기록하지 않는다.
같은 에피소드에서 이미 고른 화풍은 다시 묻지 않는다. 배정자 편의 기존 선택은 유지한다.
자동 실행도 서면 계획에 화풍이 명시되어 있어야 한다. 없으면 질문을 대기 상태로 둔다.

## 선택 저장과 이미지 작성

`window.PRODUCTION.style`에 다음 필드를 저장한다. `selection.reference`에는 실제 답변이나
해당 화풍을 허용한 서면 계획을 적는다. 예시를 승인 기록으로 복사하지 않는다.

```js
style: {
  preset: 'webtoon', // cinematic-miniature | photoreal | webtoon
  selection: { kind: 'user', reference: 'ACTUAL_USER_CHOICE' },
  reference: 'Korean webtoon illustration',
  world: 'A period office with a consistent desk and doorway.',
  materials: 'Drawn fabric and wood with clean cel shading.',
  palette: 'Muted ochre and blue.',
  lighting: 'Consistent illustrated window light.',
  camera: 'Readable medium shots and deliberate close-ups.'
}
```

- `cinematic-miniature`: `look`은 miniature 또는 architectural. 묶음 참조
  `tactile-miniature-v1`을 쓰고 내용에 맞는 `visual.styleRole`을 선택한다.
- `photoreal`: `look`은 realistic. 실제 크기의 인체 비례와 피부·옷감·렌즈 표현을 쓴다.
  미니어처 참조 이미지와 `referencePack`, 이전 `visual.stylePack`을 제거한다.
- `webtoon`: `look`은 webtoon. 선 굵기·얼굴 비례·셀 채색·배경 묘사를 통일한다.
  미니어처 참조 이미지와 `referencePack`, 이전 `visual.stylePack`을 제거한다.

각 컷은 먼저 내레이션의 인물·행동·피해 대상과 시작·끝 상태를 정한다. 화풍이 내용을 대신하지 않는다.
모든 새 이미지에 선택한 화풍을 적용한다. 혼합 제작의 이미지 카메라 무빙 컷도 동일하다.
HTML 설명 컷은 같은 팔레트와 사물 표현을 쓰되 글자와 수치를 읽기 쉽게 만든다.
실제 기록 사진과 사용자 촬영본은 원본 표현을 보존한다.

혼합 제작과 전체 영상 모두 `spatial-prompts.js`로 이미지 프롬프트를 작성할 수 있다.
이미지만 쓰는 컷도 `shot.videoDesign`의 look·before·action·after·camera·continuity와
`visual.camera.framing`을 제공한다. 이 메타데이터 때문에 제작 방식을 영상으로 바꾸지 않는다.
반환된 `sourcePrompt`를 실제 이미지 생성에 사용하고 결과를 스토리보드 HTML에 연결한다.
미니어처는 함께 반환된 `sourceImageArgs`로 묶음 참조 이미지를 실제로 첨부한다.
실사풍·웹툰풍은 각 프리셋의 설명으로 첫 이미지를 만들고 승인된 인물 이미지를 후속 컷에 참조한다.

끝 이미지가 필요한 컷은 시작 이미지를 첨부해 `endFramePrompt`로 수정한다.
시작·끝 이미지 모두 같은 화풍과 인물·의상·공간을 유지한다. 영상은 `motionPrompt`를 사용한다.
생성 후 이미지를 직접 열어 내용과 화풍을 따로 검토한다. 실사풍의 인형 질감이나 웹툰풍의
사진 피부처럼 선택과 어긋난 컷은 다시 만든다. 메타데이터 통과를 육안 검토로 대신하지 않는다.

스토리보드 HTML의 `SB_DOC` 설명에는 선택한 화풍 이름과 표현 규칙을 적는다.
화풍을 바꾸면 해당 이미지와 시작·끝 쌍, 영상 프롬프트를 다시 검토하고 견적을 갱신한다.
기존 결과를 새 화풍의 결과로 표시하지 않는다. 유료 생성 전에는 변경한 계획의 승인을 받는다.

Full-video character scenes use articulated action in every style. Preserve face, costume and
materials while changing pose and position as planned. A miniature style reference supplies
the look, not a frozen pose. Apply the subject-motion contract in
[full-video.md](../../produce/references/full-video.md) before generating either frame.
