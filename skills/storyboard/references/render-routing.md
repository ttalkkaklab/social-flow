# 컷마다 제작 방식 고르기

## Contents

- [판단 순서](#판단-순서)
- [제작 방식](#제작-방식)
- [선택 기록과 검사](#선택-기록과-검사)
- [제작기 연결](#제작기-연결)
- [그래프와 영상의 제한](#그래프와-영상의-제한)

## 판단 순서

내레이션을 읽고 시청자가 이 컷에서 알아야 할 한 가지를 먼저 적는다. 등장하는 명사나
사용 가능한 API부터 고르지 않는다. 다음 질문에 답하고 `shot.render`를 작성한다.

1. 핵심이 크기·비율·추세·분포의 비교인가? 수치·그래프 HTML을 쓴다.
2. 사람이 하는 순서나 사물과의 상호작용을 설명하는가? 3D 캐릭터 HTML을 쓴다.
3. 부품의 결합·힘의 전달·물리적 상태 변화를 설명하는가? 3D 사물 HTML을 쓴다.
4. 설명보다 자연스러운 연속 동작 자체를 보여줘야 하는가? 정지 이미지로 부족한 이유를
   적고 영상 생성을 검토한다. 복잡한 표정·옷감·군중의 연속 동작 등이 해당한다.
5. 인물의 정체·분위기·장소·단서가 핵심인가? 정지 이미지와 목적에 맞는 카메라 무빙을 쓴다.

두 가지가 동시에 핵심이면 컷을 나눈다. 한 가지가 보조 정보라면 핵심에 맞는 방식 하나를
고른다. 예를 들어 ‘16개와 32개의 톱니가 맞물린다’는 작동 설명이므로 사물 HTML이고
‘두 제품의 판매량을 비교한다’는 수치 그래프다. 인물이 언급돼도 소개만 하면 정지 이미지다.
직접 기록한 증거와 사용자 제공 영상은 기존 소스를 보존하며 생성 분류에서 제외한다.

## 제작 방식

| 핵심 목적 | `purpose` | `mode` | 선택 예시 |
|---|---|---|---|
| 인물 소개·분위기·장소·단서 | `portrait`, `atmosphere`, `place`, `detail` | `still_camera` | 발명가 소개는 얼굴로 접근하고 작업실 소개는 공간을 드러낸다. |
| 사람이 수행하는 과정 | `human_process` | `character_html` | 직원이 물건을 분류하거나 짐을 싣는 행동을 직접 보여준다. |
| 사물의 작동·물리적 변화 | `mechanism`, `physical_state` | `object_html` | 기어 맞물림, 경첩 회전, 밸브 개폐를 보여준다. |
| 수치 관계·시간 순서 | `comparison`, `trend`, `share`, `distribution`, `timeline` | `data_graph` | 판매량 비교, 시간별 변화, 구성비를 비교한다. 연표에는 날짜를 쓴다. |
| 짧은 근거 인용·결론 | `evidence_quote`, `verdict` | `editorial_html` | 인용은 원문과 출처를 적고 결론은 짧게 보여준다. |
| 자연스러운 연속 동작 | `live_action` | `editorial_html` | `kind:"diagram"`, `motion:true`, `treatment:"editorial"`, `subject.kind:"type"`로 짧은 인용·결론을 만든다. |
| `generated_video` | 바람에 흔들리는 옷과 인물의 동작이 장면의 의미일 때 쓴다. |

정지 이미지에도 `camera.effect`, `target`, `reason`을 적는다. 인물 소개에는 포커스 인,
단서 강조에는 접근, 시선의 전환에는 초점 이동, 장소 설명에는 후퇴가 어울린다.
매 컷에 같은 효과를 반복하지 않는다. 전경 등장·깊이별 이동은 필요한 레이어를 준비한다.
자세한 자산 조건은 [illustrated-scenes.md](illustrated-scenes.md)를 따른다.

캐릭터는 손과 발을 움직여 실제 과정을 보여준다. 단순한 고개 끄덕임이나 부채 흔들기만으로
설명 동작을 대신하지 않는다. 캐릭터 컷의 설명 표식은 기본적으로 끄고 사물 컷의 부품 표식도
필요한 순간에 하나씩만 보여준다. 사용자가 좋다고 평가한 모형과 동작은 표식 수정 중에 바꾸지 않는다.

## 선택 기록과 검사

```js
shot: {
  infoType: 'principle',
  render: {
    mode: 'character_html',
    purpose: 'human_process',
    reason: '사람이 짐을 싣고 출발하는 순서를 보여준다.',
    actors: ['운반 담당자'],
    action: '포대를 수레에 올린 뒤 손잡이를 잡고 출발한다.'
  }
}
```

[visual-direction.md](visual-direction.md)의 반복 제한과 장면별 검토 기준을 적용한다.
같은 선택 이유를 세 컷 이상 복사하면 검사에서 막는다. 글자 중심 화면은 숏폼에서 최대 두 컷이고
롱폼에서는 생성 컷 길이의 20%까지다. 한 컷은 8초 이하다. `motionBeats`로 이 제한을 피할 수 없다.
`evidence_quote`는 `evidence:{source,quote}`를 적는다. 문서 자체를 보여주려면 사진 카메라 컷을 쓴다.

모든 생성 대상 컷에 `mode`, `purpose`, `reason`이 필요하다. 기록 영상과 공통 아웃트로는
예외다. 캐릭터에는 `actors`와 `action`, 사물에는 `action`을 적는다. 영상 생성에는
`motionEssential:true`, `action`, `whyNotStill`이 추가로 필요하다. 수치에는
`data:{chart,source,unit,values:[{label,value}],baseline}`을 적는다. 연표는 `value` 대신
`date`를 쓰고 구성비에는 전체 값인 `total`을 적는다.
차트의 문장별 강조 대상은 `data.beats`에 적는다. [chart-design.md](chart-design.md)의
차트 선택과 공통 SVG 템플릿을 사용한다. 숫자만 크게 등장시키는 화면으로 대신하지 않는다.

[render-routing.js](render-routing.js)가 목적과 방식의 대응, 필요한 근거와 자산 연결을
검사한다. `check-scenes.js --draft`에서도 선택 누락과 의미 충돌을 막는다. 제작 단계에서는
선택한 방식과 `visual`의 실제 전달 경로도 비교한다. 검토 화면에는 방식과 선택 이유가 표시된다.
원문을 해석하는 일은 스토리보드 작성자가 맡는다. 검사기는 기록된 의도가 실제 문장과 같은지
판단할 수 없으므로 승인 전에는 내레이션과 선택 이유를 한 번 더 대조한다.

## 제작기 연결

| 방식 | 기존 제작 경로와의 연결 |
|---|---|
| `still_camera` | `visual.bg`와 `visual.camera`를 이미지 카메라 경로에 전달한다. 초점·레이어 효과는 `visual.slide.kind:"camera"`로 작성한다. |
| `character_html` | `visual.slide`의 `kind:"diagram"`, `motion:true`, `treatment:"editorial"`, `subject.kind:"object"`, `object.renderer:"mesh"`를 사용한다. 배우와 접촉 동작을 모델 계획에 연결한다. |
| `object_html` | 같은 메시 경로를 사용하되 설명에 필요 없는 캐릭터를 넣지 않는다. |
| `data_graph` | `subject.kind:"data"`로 수치와 관계를 움직인다. 그래프를 장식용 3D 물체로 바꾸지 않는다. |
| `editorial_html` | `kind:"diagram"`, `motion:true`, `treatment:"editorial"`, `subject.kind:"type"`로 짧은 인용·결론을 만든다. |
| `generated_video` | `visual.video` 또는 영상 컷으로 전달하고 `visual.why`에 선택 이유를 적는다. 기존 엔진·비용·참조 이미지 규칙을 적용한다. |

카메라 HTML은 [camera-slide-template.html](camera-slide-template.html)을 복사하고
`SLIDE_SHOT`만 해당 컷 번호로 바꾼다. [still-camera.js](still-camera.js)를
`slides/assets/`에 복사한다. 초점 영역과 레이어는 `shot.render.camera`의 `focusFrom`,
`focusTo`, `layers`에서 읽는다. 초점 영역은 `[x,y,rx,ry]`의 정규화 좌표다.
이미지는 선택한 호스트의 이미지 도구로 먼저 준비한다. HTML 파일이 있다는 이유로
`visual.bg` 생성을 건너뛰지 않는다. HTML로 포장했어도 정지 이미지 카메라 컷이며
실제 사물 동작 비율에는 포함하지 않는다.

생성 전에 `check-scenes.js`를 실행한다. 자산이 없거나 엔진이 준비되지 않았다고 다른
방식으로 조용히 바꾸지 않는다. 선택 이유를 다시 검토하고 계획을 수정한 뒤 검사한다.
이미 승인된 문장이나 게시물은 이 규칙을 적용하려고 임의로 다시 만들지 않는다.

## 그래프와 영상의 제한

차트는 데이터 형식과 보여줄 관계에 맞춰 고른다. 이는 영국 통계청의
[차트 선택 지침](https://service-manual.ons.gov.uk/data-visualisation/chart-types/choosing-a-chart-type)을
따른다. 범주 비교에는 막대·점, 시간별 추세에는 선, 구성비에는 누적 막대, 분포에는 히스토그램을
기본으로 한다. 출처·단위·값을 기록하고 막대처럼 길이로 비교하는 차트는 0을 기준으로 그린다.
없는 값을 만들거나 데이터를 애니메이션 편의에 맞게 바꾸지 않는다.

영상 생성 수는 상한으로만 사용한다. 첫 컷도 같은 선택 절차를 거치며 `hook_video`의
기본값은 꺼짐이다. 채널에서 명시적으로 켰다면 그 제약을 지키면서 연속 동작이 필요한
오프닝을 설계한다. 모든 영상 생성 컷은 정지 이미지나 제어 가능한 HTML 동작으로 부족한
이유가 있어야 한다. 예산이나 실제 동작 비율을 맞추려고 무관한 캐릭터·그래프·영상을 넣지 않는다.
