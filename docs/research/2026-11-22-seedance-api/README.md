# Seedance 영상 생성 API 모델과 요청 스키마

> This is the 2026-11-22 research record. The current Seedance call schema, reference limits and portrait route are in the [video model call reference](../../video-models.md#seedance-byteplus-modelark).

2026년 11월 22일 KST 기준, BytePlus가 가장 최근에 발표한 모델은 **Dreamina Seedance 2.5 Flash**다. Flash는 한 번에 최대 30초, 720p까지 생성한다. 일반 2.5는 같은 길이에서 4K를 지원하며 허용하는 참조 파일도 더 많다. 아래 필드와 예시는 Social Flow가 기본값으로 쓰는 BytePlus ModelArk 싱가포르 API 기준이다. 중국 본토 Volcengine의 주소와 모델 ID도 별도로 확인했다. ttalkkakman 키로 싱가포르 모델 목록을 조회했고 2.x 다섯 모델이 모두 반환됐다. [11월 출시 공지](https://docs.byteplus.com/en/docs/modelark/model-release-announcement) · [공식 모델 목록](https://docs.byteplus.com/en/docs/ModelArk/model-list) · [Volcengine 모델 비교표](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh)

## 모델과 출력

| BytePlus 모델 ID | 출력 해상도 | 출력 길이 | 최대 참조 수 (이미지 / 영상 / 오디오) | 오디오만 입력 | 파일 형식 |
|---|---|---|---|---|---|
| `dreamina-seedance-2-5-flash-261115` | 480p, 720p | 4–30초 | 10 / 5 / 5 | 가능 | MP4, MOV |
| `dreamina-seedance-2-5-260628` | 480p, 720p, 1080p, 4K | 4–30초 | 30 / 10 / 10 | 가능 | MP4, MOV |
| `dreamina-seedance-2-0-260128` | 480p, 720p, 1080p, 4K | 4–15초 | 9 / 3 / 3 | 이미지나 영상 필요 | MP4 |
| `dreamina-seedance-2-0-fast-260128` | 480p, 720p | 4–15초 | 9 / 3 / 3 | 이미지나 영상 필요 | MP4 |
| `dreamina-seedance-2-0-mini-260615` | 480p, 720p | 4–15초 | 9 / 3 / 3 | 이미지나 영상 필요 | MP4 |

다섯 모델 모두 24fps로 출력하며 텍스트로 영상 생성, 첫 프레임, 첫·끝 프레임, 복합 참조, 동기화 음성을 지원한다. 2.0 계열도 참조 영상과 지시문으로 편집·연장을 요청할 수 있다. 아래의 작업 유형 지정 필드는 2.5 계열에 추가됐다. 2.5 계열은 한국어 프롬프트도 받는다. API에 넣는 4K 해상도 값은 소문자 `"4k"`다. [출력 사양](https://docs.byteplus.com/en/docs/ModelArk/model-list) · [모델별 기능 비교](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5#2.5_video_output_specs) · [생성 API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1)

구형 모델로는 `seedance-1-0-pro-250528`와 `seedance-1-0-pro-fast-251015`가 목록에 있다. 둘 다 2–12초, 최대 1080p이며 Pro만 첫·끝 프레임을 함께 받는다. `seedance-1-5-pro-251215`는 2026년 11월 11일 17시(UTC+8) 이후 서비스를 종료했고 자동 이전도 제공하지 않는다. [공식 모델 목록](https://docs.byteplus.com/en/docs/ModelArk/model-list) · [종료 공지](https://docs.byteplus.com/en/docs/modelark/model-deprecation-notice)

## 주소와 인증

| 서비스 | 기본 주소 | 2.5 일반 / Flash 모델 ID |
|---|---|---|
| BytePlus ModelArk, 싱가포르 | `https://ark.ap-southeast.bytepluses.com/api/v3` | `dreamina-seedance-2-5-260628` / `dreamina-seedance-2-5-flash-261115` |
| Volcengine Ark, 베이징 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seedance-2-5-260628` / `doubao-seedance-2-5-flash-261115` |

생성 경로는 두 서비스 모두 `POST /contents/generations/tasks`다. 각 서비스에서 발급한 API 키를 `Authorization: Bearer <API_KEY>` 헤더에 넣고 `Content-Type: application/json`으로 보낸다. 위 표의 2.0 세 모델도 베이징에서는 `dreamina-` 부분을 `doubao-`로 바꾼 ID를 쓴다. BytePlus의 `GET /models`는 키를 발급한 계정에 보이는 모델 버전을 반환한다. 콘솔에서 모델을 활성화해야 추론을 호출할 수 있다. [BytePlus 생성 API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1) · [계정별 모델 조회](https://docs.byteplus.com/en/docs/modelark/models-api) · [Volcengine 생성 API](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh) · [Volcengine 2.x 모델 ID](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh)

## 요청 본문

최상위 필수 필드는 `model`과 `content` 두 개다. `model`은 모델 버전 ID 또는 해당 모델에 연결한 추론 엔드포인트 ID다. `content`는 객체 배열이며 `type`이 각 항목의 구조를 결정한다. 역할을 지정하는 `role`은 `type`과 같은 깊이에 둔다. [생성 API 요청 명세](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1)

| `content[].type` | 같은 항목에 넣을 값 | `role` |
|---|---|---|
| `text` | `"text": "장면 지시"` | 생략 |
| `image_url` | `"image_url": {"url": "..."}` | `first_frame`, `last_frame`, `reference_image`. 첫 프레임 한 장만 보낼 때는 생략 가능 |
| `video_url` | `"video_url": {"url": "..."}` | `reference_video` |
| `audio_url` | `"audio_url": {"url": "..."}` | `reference_audio` |
| `draft_task` | `"draft_task": {"id": "cgt-..."}` | 생략. 일반 2.5 초안에서 최종본을 만들 때 사용 |

텍스트만으로 생성할 때는 `text` 항목이 필요하다. 미디어로 생성할 때는 지시문을 생략할 수 있다. 첫·끝 프레임을 고정하는 모드와 복합 참조 모드는 한 요청에 섞을 수 없다. 예를 들어 인물의 첫 이미지와 목소리를 함께 주려면 이미지를 `reference_image`, 목소리를 `reference_audio`로 보내고 첫 장면을 프롬프트로 지시할 수 있다. 이 방식에서 첫 프레임의 일치는 보장되지 않는다. [입력 조합과 역할](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1) · [참조 프롬프트 가이드](https://docs.byteplus.com/en/docs/modelark/seedance-2-5-prompt-guide)

### 출력 및 작업 제어 필드

| 필드 | 타입 | 2.x에서 쓰는 값과 제약 |
|---|---|---|
| `resolution` | string | 기본 `720p`. 허용값은 모델 표 참조 |
| `ratio` | string | 기본 `adaptive`. `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9`, `adaptive` 중 작업 유형에 맞는 값 |
| `duration` | integer | 2.5 계열은 기본 `-1`(자동) 또는 4–30, 2.0 계열은 기본 `5`이며 `-1` 또는 4–15. 단위는 초 |
| `omni_reference_task_type` | string | 2.5 계열 복합 참조 전용. 기본 `auto`, 명시값 `reference`, `edit`, `extend` |
| `generate_audio` | boolean | 기본 `true`. 대사·효과음·음악을 영상과 함께 생성한다. `false`는 무음 출력 |
| `watermark`, `return_last_frame` | boolean | 각각 기본 `false`. 후자를 켜면 별도 JPEG 마지막 프레임 URL을 돌려준다 |
| `output_format` | string | 2.5 계열. 기본 `mp4`, 선택값 `mov`. 2.0 계열 출력은 MP4 |
| `draft` | boolean | 2.x 중 일반 2.5만 지원. 기본 `false`. 초안은 `true`와 `resolution: "480p"`로 생성 |
| `callback_url` | string | 상태가 바뀌면 지정한 URL로 POST. 본문은 작업 단건 조회 응답과 같은 구조 |
| `execution_expires_after` | integer | 생성 시점부터 3,600–259,200초. 기본 172,800초 |
| `priority` | integer | 같은 추론 엔드포인트의 대기열 안에서 0–9. 기본 0, 큰 값부터 처리 |
| `service_tier` | string | 2.x는 `default`. `flex` 오프라인 추론은 지원 대상에서 제외 |
| `safety_identifier` | string | 선택 사항. 사용자별로 일정하고 고유한 영문 문자열, 최대 64자 |

공식 생성 명세는 `frames`, `seed`, `camera_fixed`의 지원 모델로 1.0 Pro와 1.0 Pro Fast만 열거한다. 2.x 출력에 쓰인 실제 fps는 조회 응답의 `framespersecond`에서 읽는다. [생성 필드별 지원 모델](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1) · [작업 조회 응답](https://docs.byteplus.com/en/docs/modelark/get-video-generation-task-api)

### 2.5에서 작업 유형에 따라 바뀌는 값

| 목적 | 입력과 요청 조건 |
|---|---|
| 텍스트로 새 영상 생성 | 텍스트만 넣는다. 화면비와 출력 길이를 지정할 수 있다 |
| 첫 프레임 또는 첫·끝 프레임 고정 | 첫 이미지에 `first_frame`, 끝 이미지가 있으면 `last_frame`. `ratio`는 `adaptive`만 허용한다. 화면비는 첫 이미지를 따른다 |
| 참조 자료로 새 영상 생성 | 참조 역할의 미디어를 하나 이상 넣고 `omni_reference_task_type: "reference"`. 화면비와 출력 길이를 지정할 수 있다 |
| 기존 영상 편집 | `"edit"`, `reference_video` 한 개 이상, `ratio: "adaptive"`, `duration: -1`. 편집 요청의 각 입력 영상은 4–30초다. 결과 길이는 선택한 원본에 가깝다 |
| 기존 영상 연장 | `"extend"`, `reference_video` 한 개 이상, `ratio: "adaptive"`. 출력 길이는 4–30초 또는 `-1`이다. 지시문에 이어질 방향과 동작을 쓴다 |

모델은 지시문에서도 작업 유형을 판별한다. `auto`가 고른 작업과 파라미터가 충돌하면 조회 시 `InvalidParameter.TaskTypeConstraint`로 실패할 수 있다. 유형을 명시해도 지시문이 다른 작업을 요구하면 `InvalidParameter.TaskTypeMismatch`가 발생할 수 있다. [2.5 작업별 제약과 오류](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5#2.5_error_handling)

### 참조 파일 규격

| 파일 | 입력 방법 | 형식과 한도 |
|---|---|---|
| 이미지 | 공개 URL, 이미지 Base64 데이터 URI, `asset://<ASSET_ID>` | JPEG, PNG, WebP, BMP, TIFF, GIF. 2.x는 HEIC·HEIF도 지원. 한 장 30 MB 미만 |
| 영상 | 공개 URL 또는 `asset://<ASSET_ID>` | MP4·MOV, H.264·H.265, 24–60fps, 파일당 최대 200 MB. 2.5 계열은 클립당 2–30초(편집은 4–30초), 영상 합계 30초. 2.0 계열은 클립당 2–15초, 영상 합계 15초 |
| 오디오 | 공개 URL, 오디오 Base64 데이터 URI, `asset://<ASSET_ID>` | WAV·MP3, 파일당 최대 15 MB. 2.5 계열은 클립당 2–30초, 오디오 합계 30초. 2.0 계열은 클립당 2–15초, 오디오 합계 15초 |

요청 본문 한도는 64 MB다. 이미지와 영상의 한 변은 300–6,000px, 가로/세로 비율은 0.4–2.5다. 영상의 총 픽셀 수도 제한한다. 2.5 계열은 프레임당 407,696–8,847,360픽셀, 2.0 계열은 407,696–8,295,044픽셀이다. 영상과 오디오의 시간 합계는 종류별로 계산한다. 2.x에서 실존 인물의 얼굴이 담긴 이미지·영상을 쓸 때는 승인된 인물 자산, 제공되는 디지털 캐릭터 또는 문서가 허용한 기존 모델 출력 경로를 사용한다. [미디어 입력 사양](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1) · [2.5 미디어 규격](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5) · [인물 자산 가이드](https://docs.byteplus.com/en/docs/ModelArk/seedance-portrait-asset-guide)

## 요청 예시

2.5 Flash에 세로 영상 6초를 요청하는 예시다. 키를 설정한 뒤 실행하면 생성 작업을 제출한다. [BytePlus 생성 API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1)

```bash
curl -sS --fail-with-body \
  'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks' \
  -H "Authorization: Bearer ${ARK_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "dreamina-seedance-2-5-flash-261115",
    "content": [{"type": "text", "text": "A red umbrella opens in the rain. Raindrops tap on the fabric."}],
    "ratio": "9:16",
    "resolution": "720p",
    "duration": 6,
    "generate_audio": true
  }'
```

일반 2.5로 기존 영상의 우산 색만 바꾸려면 같은 주소에 다음 JSON을 보낸다. 예시 URL 자리에 4–30초짜리 공개 영상 주소를 넣는다. [영상 편집 명세](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5#2.5_edit)

```json
{
  "model": "dreamina-seedance-2-5-260628",
  "content": [
    {"type": "text", "text": "Edit @Video 1. Change the umbrella from red to yellow."},
    {"type": "video_url", "video_url": {"url": "https://example.com/umbrella.mp4"}, "role": "reference_video"}
  ],
  "omni_reference_task_type": "edit",
  "ratio": "adaptive",
  "duration": -1,
  "resolution": "1080p",
  "output_format": "mp4"
}
```

일반 2.5에서 480p 초안을 승인한 뒤에는 같은 모델로 `content: [{"type":"draft_task","draft_task":{"id":"cgt-..."}}]`와 최종 해상도 `1080p` 또는 `4k`를 보낸다. 프롬프트·참조 파일·길이·화면비·오디오 설정은 이전 요청값을 재사용하므로 다시 보내면 오류가 난다. 초안과 최종본은 각각 과금한다. [Draft 모드](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5#2.5_draft_mode)

## 응답과 작업 수명

| 작업 | 메서드와 경로 | 반환값 또는 동작 |
|---|---|---|
| 생성 | `POST /contents/generations/tasks` | `{"id":"cgt-..."}`. 작업 접수 시점의 ID |
| 단건 조회 | `GET /contents/generations/tasks/{id}` | `status`, 출력 `content`, `usage`, 실패 시 `error` |
| 목록 조회 | `GET /contents/generations/tasks` | `items`, `total`. `page_num`, `page_size`, `filter.status`, `filter.task_ids`, `filter.model` 등으로 조회 |
| 취소·기록 삭제 | `DELETE /contents/generations/tasks/{id}` | `queued`는 취소, `running`은 취소 불가, 종료한 작업은 기록 삭제 |

조회 상태는 `queued`, `running`, `succeeded`, `failed`, `cancelled`, `expired`다. 성공한 영상 주소는 `content.video_url` 문자열이며 마지막 프레임을 요청했다면 `content.last_frame_url`도 온다. 실패 시 `error.code`와 `error.message`를 읽는다. 정산에 쓰는 값은 `usage.completion_tokens`다. 조회 응답의 `duration`은 실제 재생 길이를 정수 초로 내림하므로 프레임 단위 편집에는 파일의 실제 길이를 사용한다. [단건 조회](https://docs.byteplus.com/en/docs/modelark/get-video-generation-task-api) · [목록 조회](https://docs.byteplus.com/en/docs/modelark/list-video-generation-tasks-api?redirect=1) · [취소·삭제](https://docs.byteplus.com/en/docs/modelark/cancel-or-delete-video-generation-tasks-api)

다음은 성공 응답에서 재생에 필요한 필드만 추린 예시다. ID와 URL은 예시값이다. [조회 응답 필드](https://docs.byteplus.com/en/docs/modelark/get-video-generation-task-api)

```json
{
  "id": "cgt-example",
  "model": "dreamina-seedance-2-5-flash-261115",
  "status": "succeeded",
  "content": {"video_url": "https://example.com/result.mp4"},
  "resolution": "720p",
  "ratio": "9:16",
  "duration": 6,
  "framespersecond": 24,
  "error": null
}
```

영상 URL은 24시간 유효하다. 2.5 계열은 영상 URL과 마지막 프레임 URL을 각각 최대 100회 다운로드할 수 있다. 일반 작업 ID의 유효기간은 생성 시점부터 7일, 2026년 10월 28일 10시(UTC+8)부터 생성한 Draft ID는 14일이다. [조회 응답과 다운로드 한도](https://docs.byteplus.com/en/docs/modelark/get-video-generation-task-api) · [작업 ID 보관 기간](https://docs.byteplus.com/en/docs/modelark/list-video-generation-tasks-api?redirect=1)

## 요금과 플러그인 사용

BytePlus는 생성한 영상의 길이·해상도와 참조 영상 유무에 따라 요금을 매긴다. Flash의 480p·720p 단가는 참조 영상이 없으면 100만 토큰당 7달러, 있으면 4.30달러다. 일반 2.5의 4K 단가는 각각 4.70달러와 2.90달러다. 참조 영상이 있으면 입력과 출력 길이를 함께 계산하며 최소 청구 토큰이 적용될 수 있다. 최종 사용량은 조회 응답의 `usage.completion_tokens`에서 읽는다. [BytePlus 요금표와 계산식](https://docs.byteplus.com/en/docs/modelark/model-pricing)

플러그인에서 Flash를 쓰려면 프로젝트 영상 모델로 `{"engine":"seedance","model":"dreamina-seedance-2-5-flash-261115","resolution":"720p"}`를 저장한다. `video_plan`이 샷의 대사·참조 자료·첫 프레임을 읽어 생성 방식을 고른다. 편집이나 연장을 지정하려면 참조 영상을 넣고 `omniReferenceTaskType`에 `edit` 또는 `extend`를 쓴다. 승인과 실행은 LTX·Veo와 같은 `video_approve`, `video_execute`를 쓴다. 연결이 끊긴 뒤에는 `video_status`의 `refresh`로 기존 작업을 조회한다. 플러그인은 MP4를 저장한다. MOV 출력, 마지막 프레임 URL 반환, Draft 작업은 공식 API에서 직접 쓸 수 있다. [모델 설정](../../../skills/_shared/model-settings.md) · [영상 모델 사용법](../../../skills/produce/references/video-model-selection.md)

## 개선 전 Social Flow와 공식 API의 차이

작업 트리 `e34cb5ff8ee0`의 모델 목록·입력 검사·HTTP 요청 조립 코드를 대조했다.

| 항목 | 공식 BytePlus API | 개선 전 Social Flow |
|---|---|---|
| 모델·해상도 | Flash를 포함한 2.x 5종. 일반 2.5는 4K 가능 | 모델 4종. Flash 미등록, 일반 2.5는 1080p까지만 허용. 기본 모델은 2.0 |
| 편집·연장 | 2.5에서 작업 유형을 지정하고 편집은 `duration: -1` 사용 | 작업 유형 필드가 없고 양의 초만 허용. 항상 길이를 전송해 2.5 편집 조건을 충족할 수 없음 |
| 첫 프레임 화면비 | 2.5에서 `adaptive`만 허용 | 기본값은 `adaptive`지만 다른 비율도 로컬 입력 검사 통과 |
| 2.0 음성 참조 | 오디오와 함께 이미지 또는 영상 하나 이상 | 영상이 있어도 참조 이미지가 없으면 로컬 검사에서 거절 |
| 프롬프트·오디오 | 미디어 입력 시 텍스트 선택. 2.5 계열은 한국어 지원. 오디오 기본값 `true` | 프롬프트 필수. 지시문은 영어, 따옴표 속 대사는 작품 언어 허용. `generateAudio` 기본값 `false` |
| 추가 옵션 | 2.5 계열 MOV·마지막 프레임 URL, 일반 2.5 Draft | 세 옵션을 Seedance 도구 인자로 노출하지 않음 |

근거는 [모델 표와 입력 검사](../../../server/src/seedance-client.ts), [도구에 노출하는 필드](../../../server/src/tools.ts), [서버 기본 주소](../../../server/src/config.ts), [공식 생성 API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api?redirect=1)다.


## 캐릭터 시트의 얼굴 자산

BytePlus의 공개 인물 목록에서는 플랫폼이 제공하는 얼굴을 고른다. 개인 계정에서 직접 만든 실사풍 캐릭터를 이 목록에 올리는 방법은 공식 문서에 없다. 기업 인증 없이 새 얼굴을 여러 컷에 쓰려면 같은 ModelArk 계정의 Seedream 5.0 lite/pro/flash가 텍스트로 생성한 이미지 원본을 30일 안에 재사용할 수 있다. Seedance 2.x 영상 원본과 해당 영상의 마지막 프레임 원본도 대상이다. 외부에서 만든 이미지와 편집본에는 이 조건이 적용되지 않는다. [프리셋과 원본 재사용 조건](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/seedance-portrait-asset-guide)

얼굴과 목소리는 컷마다 같은 캐릭터 ID로 연결한다. 예를 들어 서린의 얼굴이 첫 이미지이고 선택한 WAV가 둘째 오디오라면 Seedance 2.5에 `@Image 1`은 서린의 외모, `@Audio 2`는 서린의 음색이라고 쓰고 그 컷의 한국어 대사를 붙인다. 참조 번호는 매 요청의 실제 순서에서 정한다. 2.5와 Flash는 얼굴 없이 WAV만 참조할 수도 있다. 오디오는 음색을 유도하며 모델이 새 대사를 다시 발화한다. [복합 참조 예시](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/seedance-2-5-prompt-guide)

창작 캐릭터는 비공개 가상 인물 라이브러리에 등록할 수 있다. 싱가포르 제어 API는 `https://ark.ap-southeast-1.byteplusapi.com/`이고 버전은 `2024-01-01`이다. 영상 생성용 Bearer 키와 별도로 관리용 AK/SK로 요청에 서명한다. `CreateAssetGroup`으로 AIGC 그룹을 만들고 `CreateAsset`에 `GroupId`, 외부에서 읽을 수 있는 `URL`, `AssetType: Image`를 보낸다. 응답의 `Id`를 저장하고 `GetAsset`에서 `Active`가 되면 생성 요청의 `content[].image_url.url`에 `asset://<Id>`를 넣는다. 프롬프트에서 참조하는 번호는 기존 이미지 순서를 따른다. [가상 인물 라이브러리](https://docs.byteplus.com/en/docs/modelark/private-virtual-avatar-library-guide-preview) · [자산 등록 API](https://docs.byteplus.com/en/docs/modelark/create-asset-api) · [상태 조회](https://docs.byteplus.com/en/docs/modelark/get-asset-api)

실존 인물은 본인 인증·동의로 발급받은 `LivenessFace` 그룹이 먼저 필요하다. 기업 인증을 마친 계정의 무료 Advanced Creation Rights (Entry)는 가상 인물 자산 50개와 그룹 50개까지 지원한다. 무료 Basic은 가상 인물 업로드를 지원하지 않는다. 11월 22일 루다 계정에서 IAM 서명으로 가상 인물 그룹 목록을 조회했다. 서린의 최초 그룹 생성은 `403 SubscriptionRequired`로 거절됐다. 이 시점에 발급된 자산 ID와 유료 영상 작업은 없다. [실존 인물 등록](https://docs.byteplus.com/en/docs/modelark/guide-preview) · [권한별 비교표](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/seedance-2-0-purchase-guide)
