# LTX 2.5 MSR와 Social Flow 영상 경로 점검

2026년 11월 22일 KST. **가장 먼저 고칠 곳은 결과 파일의 완료 판정과 장면 렌더러의 인물 번호다.** 음성 없는 1프레임 MP4가 대사를 담아야 할 MSR 결과로 통과했다. 배경을 먼저 넣은 장면에서는 프롬프트가 가리키는 얼굴과 모델에 연결한 얼굴도 달랐다. 두 문제 모두 GPU 추론 없이 재현했다.

## 어떤 버전을 확인했나

| 대상 | 확인 결과 |
|---|---|
| Social Flow 작업 트리와 설치본 | 작업 트리는 `f0dbd286`, 설치본은 `0.125.1`이다. 장면, 영상 라우팅, 이미지, 음성을 담당하는 배포 모듈 6개의 내용이 설치 캐시와 같았다. 전체 서버 번들 해시는 달랐다. 실행 중인 MCP의 `video_catalog`에서도 기본 MSR과 I2V의 `frameAccurateCuts`가 모두 `false`였다. |
| 사용자가 지정한 게이트웨이 | 조사 중 기본 체크아웃과 `origin/main`이 `b0bd32d`에서 `adf3f5c`로 바뀌었다. 마지막 버전에서 슬롯 순서와 첫 화면 문제를 다시 재현했다. 운영 API의 응답도 별도로 조회했다. |
| 운영 영상 게이트웨이 | 기본 MSR의 조회값은 이미지와 음성 참조 지원, 프롬프트 2,000자, 피사체 참조 강도 1이었다. 별도 `GET /v1/ltx/v2/scene-to-video/capabilities`는 `execution=per_shot`, `hard_cut`, `scene_audio=native`, `native_line_onset=shot_start`를 반환했다. 운영 OpenAPI에도 장면 생성 경로가 있었다. |
| 작업 중인 연동 | Social Flow의 `scene-level-video-generation` 워크트리에 장면 API의 기능 조회·검증·제출·복구를 연결하는 변경이 있었다. 게이트웨이 `adf3f5c`는 화면 밖 화자 지시와 샷별 네거티브 프롬프트를 추가했다. 11시 47분 운영 OpenAPI의 샷 스키마에는 새 네거티브 필드가 없었다. |

## 모델이 받는 입력

LTX 2.5는 한 번의 추론으로 여러 샷을 만들 수 있다. Lightricks는 컷마다 바뀌는 구도와 이어지는 소리를 프롬프트에 쓰도록 안내한다. Licon MSR V2는 여기에 인물·의상·소품·배경의 외형과 화자 음색을 참조할 수 있게 해 주는 LoRA다. 개별 참조 이미지에는 출력 시점과 별개의 번호를 붙인다. 따라서 **인물 참조, 특정 프레임의 이미지, 그 프레임에서 일어나는 편집 컷**은 서로 다른 입력이다. [Lightricks 프롬프트 가이드](https://ltx.io/blog/ltx-2-5-prompt-guide) · [MSR 논문](https://arxiv.org/abs/2609.18393)

Licon의 공식 노드는 피사체 이미지 1~4개와 선택적 배경 1개를 받는다. 음성은 첫 두 피사체에만 연결한다. 첫 음성이 비어 있어도 둘째 음성은 둘째 인물에 붙는다. 이미지 참조 길이 25·33프레임은 참조를 인코딩할 때 쓰는 값이다. 공개 V2 가중치 헤더에서도 음성 슬롯 5초, 슬롯 사이 여유 0.04초, 긴 음성의 뒷부분 절단을 확인했다. 이 입력 구조와 게이트웨이의 기본 슬롯 수는 일치한다. [공식 노드 v1.2.2](https://github.com/liconstudio/ComfyUI-LTX2.5-MSR/blob/03061c18f8a79d26f3c63931dd8e28f5e5d872a6/README.md) · [공개 V2 가중치](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference/blob/main/LTX-2.5-Licon-MSR-V2.safetensors)

## 수정 우선순위

### 1. 대사가 있는 결과도 무음 한 프레임이면 완료된다

게이트웨이의 일반 MSR 결과 처리기에 121프레임·24fps 요청과 64×64 무음 1프레임 MP4를 넣었다. 실제 FFmpeg 후처리와 크기 검사를 거쳐 `succeeded, 200`을 기록했다. 플러그인의 실제 다운로드 처리기도 같은 파일을 `completed`로 저장했다. 다운로드와 DB 기록은 테스트 대역으로 대체했다. 이때 `review=not_reviewed`여도 다음 단계는 이미 이 파일을 생성 결과로 쓸 수 있다. 별도 장면 조립 경로에는 프레임 수·FPS·오디오 검사가 있다. [일반 결과 처리](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/b0bd32db7567ae027871c229dacb52d027117955/gateway/services/video.py#L549) · [장면 조립 결과 검사](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/30f1136523d09d641f8fe994a63b5be60786c1d9/gateway/services/scene_video.py#L234) · [플러그인 다운로드](../../../server/src/astra-genai-video.ts#L390)

**수정** — 게이트웨이는 요청에서 약속한 최종 프레임 수·FPS·화면 크기와 오디오 스트림 유무를 대조한다. 플러그인은 기대값을 제출 영수증에 기록하고 다운로드·복구 때 같은 조건을 검사한다. 명시적으로 음성을 끈 I2V는 오디오 없는 파일을 허용한다. 트랙 존재와 실제 대사·환경음의 품질은 각각 검증한다.

### 2. 배경 위치에 따라 장면 속 화자의 이미지 번호가 바뀐다

`adf3f5c`의 장면 변환기에 참조를 **배경, Anna 얼굴, Ben 얼굴** 순으로 넣었다. 프롬프트는 Anna를 `Image 2`로 지칭했다. 실제 전송기는 배경을 끝으로 옮겨 Anna를 `pic1`, Ben을 `pic2`에 배치했다. Anna의 음성 파일은 올바른 얼굴인 `pic1`에 붙지만 대사 지시는 Ben의 슬롯을 가리킨다. 같은 입력에서 Ben에게 음성을 붙이면 모델이 받을 수 있는 둘째 화자인데도 셋째 슬롯으로 계산해 422를 반환했다. [장면의 이미지·화자 번호 계산](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/adf3f5ce6bbfa833590916b992066114e47b8f18/gateway/schemas/scene.py#L138) · [실제 전송 순서](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/30f1136523d09d641f8fe994a63b5be60786c1d9/gateway/adapters/video_local.py#L1240)

**수정** — 게이트웨이가 피사체 순서를 유지하고 배경을 마지막으로 정렬한 뒤 하나의 슬롯 표에서 프롬프트, 시작 위치, 음성, 실제 전송 배열을 만든다. 회귀 사례는 배경을 첫째와 가운데에 두고 둘째 인물에게만 음성을 주면 된다.

### 3. 첫 대사를 맞추는 과정에서 고정한 첫 화면을 잘라낸다

장면 렌더러는 샷 시작에 맞춰야 하는 대사가 있으면 음성 활동 감지기로 발화 시작점을 찾고 그 이전의 영상과 음성을 함께 자른다. 24fps에서 빨간색으로 시작해 12프레임 뒤 파란색이 되는 클립을 만들었다. 감지 시작점을 0.5초로 두고 실제 조립기를 실행하자 완성본의 첫 픽셀이 빨간색 `[254,0,0]`에서 파란색 `[0,0,255]`로 바뀌었다. 전체 길이 검사는 통과했다. 이 실험은 조립 동작을 검증했다. 음성 감지기의 정확도는 측정하지 않았다. [발화 감지](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/30f1136523d09d641f8fe994a63b5be60786c1d9/gateway/services/scene_video.py#L139) · [영상과 음성의 절단 위치](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/adf3f5ce6bbfa833590916b992066114e47b8f18/gateway/services/scene_video.py#L190)

**수정** — 첫 프레임 보존과 첫 음절 정렬을 독립 조건으로 취급한다. 현 방식으로 두 조건을 함께 만족시킬 수 없으면 플러그인에 어느 샷의 어떤 조건이 충돌하는지 돌려준다. 샷 시작에 음성 활동이 있었다는 사실만으로 의도한 대사·화자가 맞았다고 판정할 수도 없다.

### 4. 설치 플러그인은 운영 게이트웨이의 샷별 장면 렌더러를 선택할 수 없다

기본 I2V의 `shots[]`는 구도와 전환 문장을 합성한다. 현재 플러그인은 정확한 컷이 있는 시간표를 이 경로에서 거절한다. 42·52프레임 컷 사례에서 실행 가능한 계획이 나오지 않는 것을 확인했다. 운영 게이트웨이의 별도 장면 경로는 각 샷을 생성하고 경계에서 조립한다. 두 경로 모두 게이트웨이 `main`에 있다. [플러그인 입력 판정](../../../server/src/scene-video.ts#L141) · [42·52프레임 테스트](../../../server/test/scene-video.test.mjs#L45) · [게이트웨이 장면 API](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/30f1136523d09d641f8fe994a63b5be60786c1d9/gateway/ltx.py#L214)

**수정** — 기존 연동 작업을 이어서 사용자가 샷별 렌더링을 선택한 장면을 새 API로 보낸다. 기본 MSR의 정확한 컷 지원값은 계속 `false`여야 한다. 운영 장면 렌더러는 각 샷이 생성한 소리를 이어 붙인다. 운영 OpenAPI에는 음악·녹음 원본 한 파일을 장면 전체에 공급하는 필드가 없다. 지정한 트랙이 여러 컷을 지나야 한다면 게이트웨이의 입력·조립 계약도 확장해야 한다.

### 5. 스토리보드의 참조 강도와 대사 연기가 전송 중 사라진다

- 얼굴 참조 강도를 `0.25`로 지정한 단일 샷을 실제 `planVideo`와 I2V 본문 생성기로 변환했다. 장면 기록에는 `0.25`가 있었지만 HTTP 참조 항목에는 `image_uri`와 `background`만 있었다. 전체 참조 강도도 생략돼 게이트웨이 기본값 1이 적용된다. 현재 운영 MSR이 허용하는 전체 강도 역시 1이다. 플러그인이 지원할 수 없는 **개별 피사체** 강도를 입력한 샷과 인물을 표시해야 한다. 시간축 이미지의 강도는 별도의 지원 기능이다. [시간표 스키마](../../../server/src/msr-opening.ts#L18) · [장면 입력 변환](../../../server/src/scene-video.ts#L167) · [게이트웨이 참조 정의](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/b0bd32db7567ae027871c229dacb52d027117955/gateway/schemas/video.py#L247)
- 같은 대사에 속삭임을 지정하자 샷 경로는 지시를 전송했고 장면 경로는 대사만 전송했다. 샷 프롬프트에 자동으로 붙는 자막 금지 문구 역시 기본 장면 프롬프트에서 빠졌다. 실제 자막 발생률은 측정하지 않았다. 장면의 각 대사에 발성 지시를 연결하고 화면 문구 정책은 두 경로가 함께 쓰도록 고치는 편이 좋다. 게이트웨이의 화면 밖 화자 처리는 `adf3f5c`에서 이미 고쳤다. 같은 대사를 `off_screen`으로 바꾸자 화면 밖에서 말하라는 지시가 추가됐다. [플러그인 대사 변환](../../../server/src/video-voice.ts#L326) · [장면 프롬프트](../../../server/src/video-prompt.ts#L105) · [샷의 화면 문구 정책](../../../skills/_shared/scene-acting.js#L194) · [게이트웨이 대사 변환](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/adf3f5ce6bbfa833590916b992066114e47b8f18/gateway/schemas/scene.py#L186)

### 6. 배포 기능과 입력 검사를 맞춰야 할 두 곳

- 운영 게이트웨이의 문법 검증 API는 참조 강도 `0.5`를 `schema_valid:true`로 응답했다. 문법상 올바른 응답이다. 같은 배포의 MSR 카탈로그가 허용하는 범위는 `1..1`이다. 플러그인의 기본 MSR 사전 검사도 이 값으로 통과했다. 이때 카탈로그 조회는 0번이었다. 계획을 실행 가능하다고 표시하기 전에 선택한 백엔드의 실제 범위와 대조해야 한다. [플러그인 사전 검사](../../../server/src/astra-genai-video.ts#L489) · [게이트웨이 운영 제한](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/b0bd32db7567ae027871c229dacb52d027117955/gateway/services/video.py#L74)
- 선택형 ComfyUI 브리지는 NAG 노드만 조회하고 음성 참조와 이미지 결합을 항상 지원한다고 응답한다. 구형 노드나 음성 임베딩이 없는 LoRA를 설치한 경우에도 결과가 같다. 운영 Python 경로에는 LoRA 헤더 검사 코드가 이미 있다. 브리지도 선택된 모델·노드로 확인한 기능과 조회 불가 상태를 구분해야 한다. [브리지 카탈로그](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/b0bd32db7567ae027871c229dacb52d027117955/gateway/comfyui_msr_server.py#L445) · [운영 LoRA 검사](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/b0bd32db7567ae027871c229dacb52d027117955/integrations/ltx_production/msr_contract.py) · [Licon의 음성 노드 요건](https://github.com/liconstudio/ComfyUI-LTX2.5-MSR/blob/03061c18f8a79d26f3c63931dd8e28f5e5d872a6/README.md)

## 참조 이미지 전처리와 현장음

같은 1024×700 이미지를 512×320 출력에 쓸 때 플러그인은 로컬 참조를 468×320으로 축소하고 HTTPS 참조는 주소 그대로 보냈다. 원본을 제공하는 HTTPS 서버라면 모델 쪽에서 받는 크기가 달라진다. Licon 노드는 같은 화면비 계열의 큰 피사체 사진은 가운데를 자르고 작은 사진은 전체를 보존해 여백을 채운다. 최종 해상도 단계에서는 두 전달 방식이 다른 구도를 만들 수 있다. 전송 방식에 따라 피사체 입력이 달라지는 문제는 원본을 청크로 보내거나 같은 전처리를 한 곳에서 적용하면 해결할 수 있다. 실제 얼굴 유사도 차이는 측정하지 않았다. [전송 전 축소](../../../server/src/astra-genai-video.ts#L425) · [공식 이미지 맞춤 규칙](https://github.com/liconstudio/ComfyUI-LTX2.5-MSR/blob/03061c18f8a79d26f3c63931dd8e28f5e5d872a6/nodes.py#L1023)

V2 모델 카드는 음악 없는 음성 참조를 쓰면 환경음이 제대로 생성되지 않을 수 있다고 밝힌다. 플러그인 문서에는 참조에 섞인 음악이 장면 전체로 번진 기존 관찰도 적혀 있다. 이번 조사에서 음성 샘플에 음악을 추가하거나 별도 효과음을 합성하도록 기본값을 바꿀 근거는 찾지 못했다. 현장음 전달 여부는 트랙 존재 검사 이후 실제 청취로 판단할 항목이다. [V2 모델 카드](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference) · [프로젝트의 음성·환경음 기록](../../../skills/_shared/astra-genai.md#L240)

## 검증 범위

| 검사 | 결과 |
|---|---|
| 플러그인 `scene-video`, `video-routing`, `astra-genai-video`, `video-voice` | `f0dbd286`에서 99개 통과 |
| 게이트웨이 MSR, ComfyUI, 멀티샷, 음성·모델 계약 테스트 5개 파일 | 최종 기본 체크아웃 `adf3f5c`에서 139개 통과. LTX 코어 수치 검증 환경이 필요한 5개는 건너뛰었다. 격리한 UTF-8 PostgreSQL 사용 |
| 운영 서비스 | 기능 조회·OpenAPI·I2V 문법 검증만 호출. 영상 생성이나 에피소드 업로드는 하지 않음 |
| 독립 반례 | 음성 없는 1프레임 MP4, 배경 위치와 둘째 화자, 발화 정렬 시 첫 픽셀, 참조 강도, 대사 지시, 로컬·URL의 이미지 크기를 각각 확인 |

수정 순서는 **잘못된 완료 판정 → 인물·목소리 슬롯과 첫 화면 → 설치 플러그인의 장면 연동**이다. 이 순서면 새 렌더링 경로를 연결하기 전에 그 경로가 반환하는 파일과 입력 매핑을 검사할 수 있다.
