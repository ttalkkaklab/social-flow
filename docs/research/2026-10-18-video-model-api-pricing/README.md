# 영상 생성 모델 API와 단가 비교

기준일: **2026-10-18 KST**. MiniMax H3·H3 Max, LTX 2.5, Seedance 2.5·2.0 계열, Veo 3.1의 공식 호스팅 API를 비교한다. 가격은 USD 공개 종량제이며 세금, 환전, 저장·전송, 별도 TTS와 재시도 비용은 계산에서 제외했다. 웹 서비스 구독 크레딧이나 자체 운영 GPU 비용과 혼용하지 않는다.

H3와 LTX, Veo는 초 단위로 가격을 비교할 수 있다. Seedance는 해상도·입력 영상·토큰 소비량을 함께 계산해야 한다. 특히 참조 영상을 쓰는 H3와 Seedance는 출력 길이만으로 예산을 잡으면 실제 비용을 낮게 예상할 수 있다.

공식 문서와 가격표를 이날 열람했다. 아래 요청 예시는 계약 설명용이며 유료 생성이나 계정별 접근 권한 검증은 하지 않았다. 이 자료는 조사 시점의 기록으로 보관한다.

## 공식 API 접속 정보

| 계열 | 생성 엔드포인트 | 인증 | 모델 ID |
|---|---|---|---|
| MiniMax | `POST https://api.minimax.io/v2/video_generation` | `Authorization: Bearer API_KEY` | `MiniMax-H3`, `MiniMax-H3-Max` |
| LTX | `POST https://api.ltx.io/v2/text-to-video` · `/v2/image-to-video` · `/v2/audio-to-video` | `Authorization: Bearer API_KEY` | `ltx-2-5-fast`, `ltx-2-5-pro` |
| BytePlus ModelArk | `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` | `Authorization: Bearer ARK_API_KEY` | `dreamina-seedance-2-5-260628`, `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615` |
| Gemini API | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning` | `x-goog-api-key: GEMINI_API_KEY` | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview` |

접속 정보 출처: [MiniMax 생성 API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create), [LTX 비동기 작업](https://docs.ltx.io/async-jobs), [BytePlus 시작 안내](https://docs.byteplus.com/en/docs/modelark/quick-start?redirect=1), [Veo API](https://ai.google.dev/gemini-api/docs/veo).

## 초당 단가와 8초 생성 비용

8초는 아래 모델이 공통으로 지원하는 비교 길이다. 참조 영상과 유료 추가 이미지가 없는 일반 생성 기준이다. LTX는 텍스트·이미지 입력의 출력 길이, 오디오 입력의 입력 음성 길이에 이 단가를 적용한다. Veo 가격에는 생성 음성이 포함된다.

| 모델 | 해상도 | USD/초 | 8초 비용 USD | 출처 |
|---|---|---:|---:|---|
| MiniMax H3 | 768P | 0.08 | 0.64 | [M](https://platform.minimax.io/docs/pricing/overview) |
| MiniMax H3 | 2K | 0.13 | 1.04 | [M](https://platform.minimax.io/docs/pricing/overview) |
| MiniMax H3 Max | 480P | 0.05 | 0.40 | [M](https://platform.minimax.io/docs/pricing/overview) |
| MiniMax H3 Max | 768P | 0.08 | 0.64 | [M](https://platform.minimax.io/docs/pricing/overview) |
| LTX 2.5 Fast | 720p | 0.09 | 0.72 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Fast | 1080p | 0.13 | 1.04 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Fast | 1440p | 0.19 | 1.52 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Fast | 4K | 0.30 | 2.40 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Pro | 720p | 0.12 | 0.96 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Pro | 1080p | 0.17 | 1.36 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Pro | 1440p | 0.25 | 2.00 | [L](https://docs.ltx.io/pricing/) |
| LTX 2.5 Pro | 4K | 0.39 | 3.12 | [L](https://docs.ltx.io/pricing/) |
| Veo 3.1 Standard | 720p·1080p | 0.40 | 3.20 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |
| Veo 3.1 Standard | 4K | 0.60 | 4.80 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |
| Veo 3.1 Fast | 720p | 0.10 | 0.80 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |
| Veo 3.1 Fast | 1080p | 0.12 | 0.96 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |
| Veo 3.1 Fast | 4K | 0.30 | 2.40 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |
| Veo 3.1 Lite | 720p | 0.05 | 0.40 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |
| Veo 3.1 Lite | 1080p | 0.08 | 0.64 | [G](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) |

8초 금액은 공개 초당 단가에 8을 곱한 계산값이다. 해상도와 입력 제어가 다르므로 같은 가격이 같은 품질이나 기능을 뜻하지는 않는다.

## Seedance 토큰 단가

BytePlus 글로벌 ModelArk의 온라인 추론 가격이다. 중국 본토 Volcengine의 RMB 가격과 구분한다. 표의 두 가격은 **요청에 참조 영상이 있는지**에 따른 요율이다.

| 모델 | 출력 해상도 | 영상 입력 없음 USD/백만 토큰 | 영상 입력 있음 USD/백만 토큰 |
|---|---|---:|---:|
| Seedance 2.5 | 480p·720p | 10.70 | 6.40 |
| Seedance 2.5 | 1080p | 11.70 | 7.00 |
| Seedance 2.0 | 480p·720p | 7.00 | 4.30 |
| Seedance 2.0 | 1080p | 7.70 | 4.70 |
| Seedance 2.0 | 4K | 4.00 | 2.40 |
| Seedance 2.0 Fast | 480p·720p | 5.60 | 3.30 |
| Seedance 2.0 Mini | 480p·720p | 3.50 | 2.10 |

추정 토큰 = `(입력 영상 초 + 출력 영상 초) × 출력 너비 × 출력 높이 × FPS ÷ 1024`.
추정 비용 = `토큰 × 백만 토큰 단가 ÷ 1,000,000`.
영상 입력에는 최소 과금 토큰도 적용된다. 최종 사용량은 응답의 `usage.completion_tokens`로 대조한다.

공식 16:9·720p·5초·영상 입력 없음 예시는 2.5 **$1.156**, 2.0 **$0.76**, Fast **$0.60**, Mini **$0.38**다. 2.5에 2~30초 참조 영상을 넣는 같은 출력 조건은 **$1.244~$4.838**다. 참조 영상 요율이 낮아도 총액이 더 비쌀 수 있다.

2.5 Draft와 최종 생성은 각각 과금한다. 위 2.x의 offline 추론은 가격표상 미지원이다. [BytePlus 공식 단가·공식 계산 예시](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-pricing)

## MiniMax H3와 H3 Max

H3는 4~15초, 768P·2K를 지원한다. H3 Max는 빠른 생성 변형으로 5~15초, 480P·768P를 지원한다. 둘 다 텍스트·첫끝 프레임·멀티모달 참조 생성이 가능하다. 첫끝 프레임 역할과 참조 역할은 한 요청에 섞을 수 없다. 텍스트만 넣을 때는 구체적인 `ratio`가 필요하다. [생성 계약](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)

본문 예시:

```json
{
  "model": "MiniMax-H3",
  "content": [{"type": "text", "text": "A small boat crosses a quiet lake at dawn."}],
  "resolution": "768P",
  "duration": 8,
  "ratio": "16:9"
}
```

생성 응답의 `task_id`로 `GET https://api.minimax.io/v2/query/video_generation/{task_id}`를 조회한다. 성공 결과의 `task.content.url`에서 파일을 받는다. 작업 조회 범위는 최근 7일이다. [조회 계약](https://platform.minimax.io/docs/api-reference/video-generation-v2-query)

추가 과금은 다음과 같다.

- H3: 이미지 5장까지 무료, 초과분 장당 $0.04. 입력 영상은 출력 해상도에 따라 초당 $0.08 또는 $0.13. 입력 음성 무료.
- H3 Max: 이미지 2장까지 무료, 초과분 장당 $0.074. 입력 영상은 480P 출력 시 초당 $0.0553, 768P 시 $0.143. 입력 음성 무료.
- H3의 768P→2K 재생성: 출력 초당 $0.05. 원래 작업의 참조 영상도 초당 $0.05로 다시 과금하며 이미지 5장 초과분은 장당 $0.025.
- H3-Context-IR: 입력 $0.90/백만 토큰, 출력 $3.60/백만 토큰. 영상 생성과 별도 작업이다.

예를 들어 H3 768P로 8초를 출력하고 5초 영상을 참조하면 이미지 추가 요금 없이 `(8+5)×0.08=$1.04`다. 같은 조건의 H3 Max는 `8×0.08+5×0.143=$1.355`다. [MiniMax 공식 가격](https://platform.minimax.io/docs/pricing/overview)

## LTX 2.5

공식 Fast·Pro는 텍스트·이미지·오디오 입력을 지원하고 최대 4K를 출력한다. 지원 비율은 16:9·9:16·1:1·3:2·2:3이다. 720p·1080p Fast의 24/25fps는 6~20초 중 짝수 길이를 선택할 수 있고 다른 조합과 Pro의 선택지는 6·8·10초다. 48/50fps도 지원하지만 길이 상한을 함께 확인해야 한다.

`generate_audio:false`로 무음을 요청할 수 있다. 이미지·오디오 입력은 `last_frame_uri`를 지원한다. 공식 2.5 호스팅은 `retake`, `extend` 미지원이다. `duration:null`은 텍스트·이미지의 자동 길이 요청이며 이미지의 끝 프레임과 동시에 사용할 수 없다. 선불 계정은 가능한 최대 길이만큼 잔액을 확보해야 한다. [모델 지원표](https://docs.ltx.io/models/ltx-2-5/)

텍스트 생성 본문 예시:

```json
{
  "model": "ltx-2-5-fast",
  "prompt": "A small boat crosses a quiet lake at dawn.",
  "duration": 8,
  "resolution": "1280x720",
  "fps": 24
}
```

비동기 생성 응답의 `id`로 `GET https://api.ltx.io/v2/text-to-video/{id}`를 조회한다. `completed`이면 `result.video_url`을 다운로드하고 `failed`이면 오류를 처리한다. 이미지·오디오는 각 작업 유형의 조회 경로를 사용한다. [비동기 작업 안내](https://docs.ltx.io/async-jobs)

오디오 입력은 `/v2/audio-to-video`의 `audio_uri`를 사용한다. 입력 음성 길이가 과금 기준이므로 TTS 비용과 분리해서 견적을 잡는다. [오디오 생성 API](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video), [가격표](https://docs.ltx.io/pricing/)

## Seedance 2.5와 2.0 계열

2.5는 최대 30초 생성, 최대 50개 참조 자산, 다회 연장과 타임스탬프 편집을 지원한다. [모델 출시 기록](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/model-release-announcement)

2.5는 480p·720p·1080p, 24fps, 4~30초와 MP4·MOV를 지원한다. 2.0 계열의 4K 지원을 2.5에 그대로 적용하면 안 된다. [모델 목록](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/model-list)

2.5는 한국어를 포함한 11개 언어를 지원하며 음성만 참조로 넣을 수 있다. 2.0·Fast·Mini의 음성 참조는 이미지 또는 영상과 함께 써야 한다. [2.5 기능 비교](https://docs.byteplus.com/th/docs/modelark/seedance-2-5?redirect=1)

생성 본문 예시:

```json
{
  "model": "dreamina-seedance-2-5-260628",
  "content": [{"type": "text", "text": "A small boat crosses a quiet lake at dawn."}],
  "resolution": "720p",
  "duration": 8,
  "ratio": "16:9",
  "generate_audio": true,
  "watermark": true
}
```

응답 `id`로 같은 작업 경로 뒤에 `/{id}`를 붙여 GET 조회한다. `succeeded`이면 `content.video_url`에서 다운로드한다. 폴링과 웹훅을 지원한다. [생성·조회 절차](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/video-generation-tutorial)

인물 자산 관리의 Advanced Creation Rights는 영상 생성 단가와 별도다. 2026-10-13 갱신 안내에는 무료 Entry와 월 $1,400·$4,200 등급이 있으며 기업 인증 등 자격 조건을 명시한다. 인물 라이브러리/API 사용을 계획할 때 적용 등급을 확인한다. [권한 상품 안내](https://console.byteplus.com/ark/region%3Aap-southeast-1/docs/seedance-2-0-purchase-guide)

## Veo 3.1

Gemini API의 Standard·Fast·Lite는 Preview 모델이다. 영상과 음성을 함께 생성하며 24fps, 16:9·9:16, 4·6·8초를 지원한다. 1080p·4K는 8초 조건을 적용한다. Lite는 4K·참조 이미지·영상 연장을 지원하지 않는다. Standard·Fast의 참조 이미지는 최대 3장이며 연장은 Veo가 생성한 영상을 입력한다. 외부 음성 파일 입력 필드는 이 API에 문서화돼 있지 않다. 생성 파일은 2일 안에 내려받아야 한다. [Veo 기능·제약](https://ai.google.dev/gemini-api/docs/veo)

`veo-3.1-fast-generate-preview:predictLongRunning` 요청 본문 예시:

```json
{
  "instances": [{"prompt": "A small boat crosses a quiet lake at dawn."}],
  "parameters": {"aspectRatio": "16:9", "durationSeconds": 8, "resolution": "720p"}
}
```

응답의 operation `name`을 `/v1beta/{name}`에서 GET 조회해 `done`을 확인한다. [REST 호출 예시](https://ai.google.dev/gemini-api/docs/veo)

무료 API 등급은 없고 성공한 생성만 과금한다. 위 가격표는 Gemini Developer API 기준이다. Vertex AI와 Flow 구독은 별도 상품이므로 이 금액을 그대로 적용하지 않는다. [Gemini 가격](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1)

## social-flow에서 적용할 때

공식 API가 제공하는 기능과 현재 플러그인이 노출하는 기능을 따로 확인한다. 특히 자체 ASTRA LTX 어댑터의 `tier`, 프레임 수, 업로드 ID는 공식 LTX 호스팅의 `model`, `duration`, URI 계약과 다르다. [기존 LTX API 조사](../2026-10-17-ltx-2.5-api-audit/README.md)

이번 자료로 선택지를 검토할 때는 다음 기준이 실용적이다.

- 외부 녹음의 타이밍을 쓰는 컷: LTX의 오디오 입력 API부터 검토한다.
- 이미지·영상·음성을 함께 참조하는 컷: H3 또는 Seedance의 참조 API를 검토하고 입력 영상 비용을 포함한다.
- 한국어 지시와 긴 단일 생성: Seedance 2.5의 문서화된 언어·30초 지원을 검토한다.
- 짧은 일반 생성의 비용 비교: Veo Lite·Fast와 LTX Fast, H3를 같은 입력·길이·해상도 조건으로 견적낸다.

이는 기능표를 근거로 한 적용 판단이다. 화질, 한국어 발음, 인물·목소리 일관성의 우열은 같은 자료로 생성한 비교 결과가 있어야 평가할 수 있다. 재시도 예산은 `컷별 1회 비용 × 허용 생성 횟수`로 따로 잡는다.
