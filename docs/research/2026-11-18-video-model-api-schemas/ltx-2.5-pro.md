# LTX-2.5 Pro 공식 API 스키마

기준일: 2026-11-18. 공식 문서와 OpenAPI 3.1 명세([OAS])를 이날 내려받아 읽었다. 유료 API는 호출하지 않았다.

## 요약

- 공식 호스팅 API(`https://api.ltx.io`)는 **비동기 V2 작업 API 하나**다. 생성 요청은 `202`와 작업 `id`를 돌려주고
  `GET /v2/{endpoint}/{id}`를 폴링해 `result.video_url`을 받는다. 웹훅과 멱등 키는 명세에 없다. 동기 V1 생성
  엔드포인트는 2026-10-26에 종료됐다. 업로드만 `POST /v1/upload`로 유지된다.
- LTX-2.5(`ltx-2-5-fast`, `ltx-2-5-pro`)가 받는 생성 엔드포인트는 `text-to-video`, `image-to-video`,
  `audio-to-video` 세 개다. `retake`, `extend`는 `ltx-2-3-pro` 전용이다. keyframes(중간 프레임), references,
  ingredients 엔드포인트는 없다. 첫·끝 프레임(`last_frame_uri`)이 유일한 프레임 조건이다.
- 요청 필드는 10종(`prompt`, `model`, `duration`, `resolution`, `fps`, `generate_audio`, `camera_motion`,
  `image_uri`, `last_frame_uri`, `audio_uri`)으로 10-17 감사 때와 같다. `seed`, `negative_prompt`, guidance,
  steps는 OpenAPI 명세 전체에서 한 번도 나오지 않는다.
- Pro는 6·8·10초 세 길이만 받는다. 20초까지는 Fast의 720p/1080p, 24/25fps 조합뿐이다.
  해상도는 고정 목록이며 2.5는 16:9, 9:16, 1:1, 3:2, 2:3을 720p~4K로 받는다.
- 가격은 출력 1초당 Pro $0.12(720p)·$0.17(1080p)·$0.25(1440p)·$0.39(4K), Fast $0.09·$0.13·$0.19·$0.30이다.
  `audio-to-video`만 입력 오디오 길이로 과금한다.
- **음성 참조 입력은 없다.** 공식 문서가 주장하는 목소리 일관성은 *한 번의 생성 안에서 여러 컷을 잇는* 멀티샷에
  한정된다. 별도 생성 사이의 목소리 고정은 어디에도 주장하지 않는다. social-flow 기준으로 `audio-to-video`는
  `supplied` 레인을 채울 수 있고 `reference` 레인은 채울 수 없다.

이전 조사: [LTX-2.5 API와 ASTRA 도구 옵션 대조 (2026-10-17)](../2026-10-17-ltx-2.5-api-audit/README.md).
자체 운영 ASTRA 서버와의 필드 대조는 그 문서에 있고 여기서는 반복하지 않는다.

표기: **공식** = docs.ltx.io·ltx.io·OpenAPI 명세, **2차** = 제3자 호스트, **미확인** = 근거를 찾지 못함.
구분 열이 없는 표는 제목이나 출처 열에 적은 공식 문서를 근거로 한다.

## 10-17 감사 이후 바뀐 것

| 날짜 | 변경 | 구분 |
|---|---|---|
| 2026-10-26 | `/v1/text-to-video`, `/v1/image-to-video`, `/v1/audio-to-video`, `/v1/retake`, `/v1/extend` 종료. 호출하면 오류 ([CL-1028], [MIG]) | 공식 |
| 2026-10-29 | `video-to-video-hdr`에 HLG MP4 출력 추가, 입력 길이 상향 ([CL-1029]) | 공식 |
| 2026-11-05 | `video-to-video-hdr`에 `output_colorspace` 추가 ([CL-1105]) | 공식 |
| 2026-11-10 | 새 엔드포인트 `video-alpha-gen`, `video-upscale` ([CL-1110]) | 공식 |

생성 3종의 요청 필드와 2.5의 모델·길이·가격은 감사 이후 바뀌지 않았다. 감사가 다루지 않은 기존 사항도 있다.
2.5의 1:1, 3:2, 2:3 비율은 2026-10-12에 추가됐고([CL-1012]) 25/50fps도 지원표에 있다([M25]).
`video-to-video-reframe`(2026-07-07)도 감사 범위 밖이었다.

## 공통 사항

| 항목 | 내용 | 구분·출처 |
|---|---|---|
| 서버 | `https://api.ltx.io`. 옛 도메인 `https://api.ltx.video`도 계속 동작한다고 2026-07-21에 공지 | 공식 [OAS], [CL-0721] |
| 인증 | `Authorization: Bearer <API_KEY>`. 키는 개발자 콘솔에서 발급 | 공식 [AUTH] |
| 본문 | `Content-Type: application/json`, 전체 본문 최대 32MB(초과 시 `413 request_too_large_error`) | 공식 [OAS], [IN] |
| 방식 | 전부 비동기. 제출 `POST /v2/{endpoint}` → `202 {id, created_at}` | 공식 [JOBS] |
| 폴링 | `GET /v2/{endpoint}/{id}`. 5초 이상 간격에 무작위 지연 권장 | 공식 [JOBS], [STATUS] |
| 웹훅·콜백 | 명세에 없음(`webhooks` 키 없음, callback 필드 없음) | 공식(부재 확인) [OAS] |
| 멱등 키 | 명세에 없음. 실패한 작업은 재개할 수 없고 다시 제출해야 함 | 공식(부재 확인) [OAS], [ERR] |
| 프롬프트 | `maxLength: 5000` | 공식 [OAS] |

### 작업 상태 응답

`status`가 판별자인 `oneOf`다([OAS] `V2JobStatusResponse`).

| `status` | 필드 | 의미 |
|---|---|---|
| `pending` | `id`, `created_at` | 대기. 동시 실행 한도에 걸린 작업도 여기서 기다림 |
| `processing` | `id`, `created_at` | 생성 중 |
| `completed` | `id`, `created_at`, `completed_at`, `result` | `result`는 라벨→URL 맵. 생성 3종은 `video_url` |
| `failed` | `id`, `created_at`, `completed_at`, `error{type,message}` | 폴링 자체는 `200` |

- 작업 상태는 종료 후 **최대 24시간** 조회되며 더 일찍 지워질 수 있다. 지워지면 `404`. ([JOBS]) 공식
- 출력 URL은 상태 보존과 별개로 만료된다. 만료 시간은 적혀 있지 않다. ([JOBS]) 만료 시점은 **미확인**
- 예시 출력 URL은 `storage.googleapis.com` 도메인이다. ([JOBS]) 공식(예시)

### 출력 형식

MP4, H.264, 8-bit 4:2:0, BT.709 SDR limited range, 고정 품질(비트레이트 지정 없음), AAC 스테레오.
코덱·비트 깊이·비트레이트 선택 옵션은 없다. ([OUT]) 공식

생성 영상과 음성에는 보이지 않는 워터마크(영상 PixelSeal, 음성 AudioSeal)가 들어간다. 검출기는 공개돼 있다. ([EU]) 공식

## 생성 엔드포인트

### `POST /v2/text-to-video` ([T2V], [OAS])

| 필드 | 형 | 필수 | 기본값 | 허용 값·범위 | 구분 |
|---|---|---|---|---|---|
| `prompt` | string | 예 | — | 최대 5,000자 | 공식 |
| `model` | enum | 예 | — | `ltx-2-3-fast`, `ltx-2-3-pro`, `ltx-2-5-fast`, `ltx-2-5-pro` | 공식 |
| `duration` | integer \| null | 예 | — | 아래 길이 표. `null`은 2.5 전용 자동 길이. 필드를 빼면 `duration is required` | 공식 [M25] |
| `resolution` | string | 예 | — | `WIDTHxHEIGHT`, 아래 해상도 표의 값만 | 공식 |
| `fps` | integer | 아니오 | `24` | 24, 25, 48, 50 중 모델·해상도 조합이 허용하는 값 | 공식 |
| `generate_audio` | boolean | 아니오 | `true` | `false`면 무음 영상 | 공식 |
| `camera_motion` | enum | 아니오 | 없음 | `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`, `jib_up`, `jib_down`, `static`, `focus_shift` | 공식 |

과금: 생성된 영상 초 단위. ([PRICE]) 공식

### `POST /v2/image-to-video` ([I2V], [OAS])

text-to-video의 7개 필드에 아래 두 필드가 붙는다. 필수는 `image_uri`, `prompt`, `model`, `duration`, `resolution`.

| 필드 | 형 | 필수 | 설명 | 구분 |
|---|---|---|---|---|
| `image_uri` | string | 예 | 첫 프레임 이미지. 업로드 URI, HTTPS URL, data URI | 공식 |
| `last_frame_uri` | string | 아니오 | 끝 프레임. 지정하면 두 이미지 사이를 보간. `duration: null`과 함께 쓸 수 없음 | 공식 [M25] |

입력 이미지와 `resolution`의 비율이 다를 때 잘라내는지 늘리는지는 문서에 없다. **미확인**

### `POST /v2/audio-to-video` ([A2V], [OAS])

| 필드 | 형 | 필수 | 기본값 | 허용 값·범위 | 구분 |
|---|---|---|---|---|---|
| `audio_uri` | string | 예 | — | 최소 2초, 최대는 아래 표. 오디오 길이가 영상 길이를 정함 | 공식 |
| `image_uri` | string | 조건부 | — | 첫 프레임. `prompt`가 없으면 필수 | 공식 |
| `prompt` | string | 조건부 | — | 최대 5,000자. `image_uri`가 없으면 필수, 있으면 빈 문자열 허용 | 공식 |
| `resolution` | string | 아니오 | 이미지 방향에 따라 `1080x1920` 또는 `1920x1080`, 이미지 없으면 `1920x1080` | 2.5는 720p~4K, 2.5 해상도 표 | 공식 |
| `model` | enum | 아니오 | **`ltx-2-3-pro`** | `ltx-2-3-pro`, `ltx-2-5-fast`, `ltx-2-5-pro` | 공식 |
| `fps` | integer | 아니오 | `24` | 모델·해상도별 | 공식 |
| `last_frame_uri` | string | 아니오 | — | `image_uri`가 있어야 함 | 공식 |
| `camera_motion` | enum | 아니오 | — | text-to-video와 같은 8개 | 공식 |

`duration`, `generate_audio` 필드는 없다. `model`을 빼면 2.3 Pro로 돈다는 점에 주의해야 한다.

| 모델 | 해상도 | 오디오 최대 길이 |
|---|---|---|
| `ltx-2-5-fast` | 720p, 1080p | 20초 |
| `ltx-2-5-fast` | 1440p, 4K | 10초 |
| `ltx-2-5-pro` | 720p~4K | 10초 |
| `ltx-2-3-pro` | 720p, 1080p | 20초 |
| `ltx-2-3-pro` | 1440p, 4K | 10초 |

과금: **입력 오디오** 초 단위. ([A2V], [PRICE]) 공식

### `POST /v2/retake` — `ltx-2-3-pro` 전용 ([OAS] `EditVideoRequest`)

| 필드 | 형 | 필수 | 기본값 | 범위 |
|---|---|---|---|---|
| `video_uri` | string | 예 | — | 최대 3840×2160, 최소 73프레임 |
| `prompt` | string | 아니오 | — | 최대 5,000자. 바꿀 구간에서 일어날 일 |
| `start_time` | number | 예 | — | ≥ 0. 뒤에 2초 이상 남아야 함 |
| `duration` | number | 예 | — | ≥ 2, 입력 fps 기준 최대 505프레임(24fps에서 약 21초). 영상 밖으로 나가면 잘림 |
| `mode` | enum | 아니오 | `replace_audio_and_video` | `replace_audio`, `replace_video`, `replace_audio_and_video` |
| `resolution` | enum | 아니오 | 입력 방향 기준 | `1920x1080`, `1080x1920`. 입력은 가운데를 잘라 맞춤 |
| `model` | enum | 아니오 | `ltx-2-3-pro` | `ltx-2-3-pro`만 |

과금: 입력 영상 길이 기준 초당 $0.10. ([PRICE]) 공식

### `POST /v2/extend` — `ltx-2-3-pro` 전용 ([OAS] `ExtendVideoRequest`)

| 필드 | 형 | 필수 | 기본값 | 범위 |
|---|---|---|---|---|
| `video_uri` | string | 예 | — | 최대 3840×2160, 최소 73프레임, 최대 100MB |
| `prompt` | string | 아니오 | — | 최대 5,000자 |
| `duration` | number | 예 | — | 2~20초 |
| `mode` | enum | 아니오 | `end` | `start`, `end` |
| `context` | number | 아니오 | 505프레임 안에서 최대 | 1~20초. `context + duration` ≤ 505프레임 |
| `model` | enum | 아니오 | `ltx-2-3-pro` | `ltx-2-3-pro`만 |

출력은 세로 입력이면 `1080x1920`, 아니면 `1920x1080`이고 다른 비율은 가운데를 잘라 맞춘다. 과금은 확장 구간과
문맥 프레임을 더한 길이(최대 505프레임)에 초당 $0.10. ([OAS], [PRICE]) 공식

### 영상 후처리 엔드포인트

모두 `video_uri`를 받고 비동기 작업이다. 모델 필드는 없다. ([OAS], [PRICE]) 공식

| 엔드포인트 | 주요 필드 | 결과 키 | 가격(초당, 입력 영상 기준) |
|---|---|---|---|
| `video-to-video-hdr` | `output_colorspace`(`acescg` 기본, `acescct`, `srgb_linear`, `aces2065-1`) | `exr_frames_url`, `video_url`(HEVC Main10 HLG, 무음) | ≤1080p $0.20, ≤1440p $0.40, ≤4K $0.80. 2027-01-01부터 두 배 |
| `video-to-video-reframe` | `resolution`(1:1, 4:5, 5:4, 9:16, 16:9의 720·1080 계열 10종, 필수), `placement`(anchor 또는 사각형) | `video_url`(원본 오디오 복사) | 720p $0.10, 1080p $0.20 |
| `video-alpha-gen` | 없음 | `matte_video_url`, `cutout_video_url`(ProRes 4444) | 짧은 변 ≤1080 $0.10, ≤1440 $0.25, ≤2160 $1.00 |
| `video-upscale` | `resolution`(`1080p`, `4k`, `8k`, 필수). H.264/HEVC 입력만 | `video_url` | 1080p $0.08, 4K $0.30, 8K $1.20 |

## 모델별 지원 범위

### 엔드포인트 지원 ([MODELS])

| 엔드포인트 | 2-5-fast | 2-5-pro | 2-3-fast | 2-3-pro |
|---|---|---|---|---|
| text-to-video | ✓ | ✓ | ✓ | ✓ |
| image-to-video | ✓ | ✓ | ✓ | ✓ |
| audio-to-video | ✓ | ✓ | — | ✓ |
| retake | — | — | — | ✓ |
| extend | — | — | — | ✓ |

### LTX-2.5 길이·fps ([M25])

`duration`은 text-to-video와 image-to-video에만 적용된다.

| 모델 | 해상도 | fps | 길이(초) |
|---|---|---|---|
| `ltx-2-5-fast` | 720p, 1080p | 24, 25 | 6, 8, 10, 12, 14, 16, 18, 20 |
| `ltx-2-5-fast` | 720p, 1080p | 48, 50 | 6, 8, 10 |
| `ltx-2-5-fast` | 1440p, 4K | 24, 25, 48, 50 | 6, 8, 10 |
| `ltx-2-5-pro` | 720p~4K | 24, 25, 48, 50 | 6, 8, 10 |

`ltx-2-3-fast`와 `ltx-2-3-pro`의 길이·fps 표는 위와 같은 모양이다([M23]).

### LTX-2.5 해상도 ([M25])

| 등급 | 16:9 | 9:16 | 1:1 | 3:2 | 2:3 |
|---|---|---|---|---|---|
| 720p | `1280x720` | `720x1280` | `720x720` | `1080x720` | `720x1080` |
| 1080p | `1920x1080` | `1080x1920` | `1080x1080` | `1620x1080` | `1080x1620` |
| 1440p | `2560x1440` | `1440x2560` | `1440x1440` | `2160x1440` | `1440x2160` |
| 4K | `3840x2160` | `2160x3840` | `2160x2160` | `3240x2160` | `2160x3240` |

LTX-2.3은 16:9와 9:16 두 비율만 받는다([M23]).

### 자동 길이 (`duration: null`) ([M25])

- 2.5의 text-to-video와 image-to-video에서만 쓴다. 모델이 프롬프트의 행동량을 보고 길이를 고른다.
- 결과는 해당 해상도·fps의 최대 길이를 넘지 않는다.
- 실제 생성 길이만 청구된다. 선불 계정은 최대 길이(Fast 20초, Pro 10초)만큼 크레딧을 잡아 두고 끝나면 풀어 준다.
  잔액이 최대 길이를 감당하지 못하면 6초짜리 결과가 나올 요청도 거절된다.
- `last_frame_uri`와 함께 쓸 수 없다.

### Pro와 Fast의 차이

| 항목 | `ltx-2-5-fast` | `ltx-2-5-pro` | 출처 |
|---|---|---|---|
| 지향점 | 속도와 낮은 비용 | 높은 충실도 | [M25] |
| 최대 길이(T2V/I2V) | 720p·1080p, 24/25fps에서 20초. 그 외 10초 | 언제나 10초 | [M25] |
| A2V 오디오 최대 | 720p·1080p 20초, 1440p·4K 10초 | 10초 | [A2V] |
| 초당 가격 720p/1080p/1440p/4K | $0.09 / $0.13 / $0.19 / $0.30 | $0.12 / $0.17 / $0.25 / $0.39 | [PRICE] |
| 요청 필드 | 같음 | 같음 | [OAS] |

필드 구성은 두 모델이 똑같다. 차이는 허용 조합과 가격뿐이다. 품질 차이를 수치로 밝힌 공식 자료는 찾지 못했다.

### LTX-2.3과 2.5의 스키마 차이

| 항목 | LTX-2.3 | LTX-2.5 | 출처 |
|---|---|---|---|
| 비율 | 16:9, 9:16 | 16:9, 9:16, 1:1, 3:2, 2:3 | [M23], [M25] |
| `duration: null` | 불가 | 가능 | [OAS] |
| `retake`, `extend` | `ltx-2-3-pro`만 | 불가 | [MODELS] |
| A2V | `ltx-2-3-pro`만, 기본 모델 | Fast·Pro 모두 | [OAS] |
| 멀티샷 | 주장 없음 | 한 생성 안에서 여러 컷 | [M25] |
| T2V/I2V 가격(720p/1080p) | Fast $0.03/$0.06, Pro $0.04/$0.08 | Fast $0.09/$0.13, Pro $0.12/$0.17 | [PRICE] |
| A2V 가격(720p/1080p/1440p/4K) | Pro $0.06/$0.10/$0.18/$0.34(T2V보다 비쌈) | T2V·I2V와 같음 | [PRICE] |

## 입력 미디어 ([IN])

| 방식 | 이미지 | 영상 | 오디오 | 비고 |
|---|---|---|---|---|
| 업로드(`ltx://…`) | 업로드 한도 200MB, 사용 시 15MB 제한 | 대부분 32MB, extend 100MB, 후처리 4종 200MB | 32MB(미확인, 아래) | 24시간 보관 |
| HTTPS URL | 15MB | 32MB(엔드포인트별 상향) | 32MB | 30초 타임아웃, 도메인만(IP 불가), 공개, 리다이렉트 불가, 정확한 `Content-Type` 필요 |
| data URI | 7MB | 15MB | 15MB | base64로 약 33% 커짐. 본문 32MB 합계 주의 |

- 이미지: PNG, JPEG, WEBP. `image/jpg`, `application/octet-stream`은 거부.
- 영상: MP4, MOV, MKV(H.264, H.265).
- 오디오: WAV(PCM 16/24-bit, 32-bit float 등), MP3, M4A(AAC), OGG(Opus, Vorbis). 32-bit 정수·8-bit PCM 불가.
- 이미지 개수: 첫 프레임 1장, 끝 프레임 1장이 전부다. 여러 장의 참조 이미지를 받는 필드는 없다. ([OAS])

**업로드** `POST /v1/upload`: 요청 본문 없음. 응답은 `upload_url`(PUT, 1시간 유효), `storage_uri`(24시간),
`expires_at`, `required_headers`(그대로 붙여야 함). 덮어쓰기 불가. 크레딧이 모자라면 `402 insufficient_funds_error`.
([UP], [ERR]) 공식. 업로드 문서는 `storage_uri`를 `image_uri`, `video_uri`에 쓰라고만 적었고 입력 형식 문서는
`audio_uri`도 세 방식을 받는다고 적었다. 오디오 업로드 크기 한도는 따로 적혀 있지 않다. **미확인**

## 오디오와 목소리

| 질문 | 답 | 구분·출처 |
|---|---|---|
| 네이티브 오디오 생성 | T2V·I2V의 `generate_audio`(기본 `true`)가 장면에 맞는 음성·효과음·음악을 함께 생성 | 공식 [OAS] |
| 대사 지정 방법 | 프롬프트에 따옴표로 대사를 적고 언어·억양을 명시. 별도 대사·화자 필드 없음 | 공식 [PG] |
| 오디오 입력 | A2V의 `audio_uri`. 대사·음악·환경음에 맞춰 영상을 생성하고 길이도 오디오가 정함 | 공식 [A2V] |
| A2V 출력 음성이 입력 그대로인가 | 호스팅 API 문서에는 언급 없음. 오픈 웨이트 A2V 워크플로는 "오디오를 고정한 채 영상을 생성"한다고 적음 | API는 **미확인**, 오픈소스는 공식 [OSO] |
| 음성 참조(목소리 샘플) 입력 | 없음. 어떤 엔드포인트에도 voice/speaker/reference 필드가 없음 | 공식(부재 확인) [OAS] |
| 컷 사이 목소리 일관성 | "한 번의 생성이 여러 컷을 만들며 인물·장면·조명·스타일·**목소리**를 컷 사이에 유지"한다고 주장 | 공식 [M25], [OSO] |
| 별도 생성 사이 목소리 일관성 | 주장한 문서를 찾지 못함 | 미확인 |
| ID-LoRA(약 5초 음성 + 첫 프레임으로 목소리·얼굴 고정) | 오픈소스 연구 프로젝트. LTX-2·2.3 기반이고 공식 블로그가 "2.5에서는 검증되지 않았으니 2.3에서 쓰라"고 안내. 호스팅 API에는 없음 | 공식 [IDLORA] |
| Dub-It(대사 교체) | 오픈소스 2.3 IC-LoRA 베타, 단일 화자. 호스팅 API에는 없음 | 공식 [PG], [COMPAT] |

멀티샷 지침은 한 생성에 2~4컷을 권하고 컷마다 전환·인물 재식별·오디오 연속 여부를 문장으로 쓰라고 한다.
대사 립싱크를 한 구도에서 유지해야 하면 단일 컷을 권한다. image-to-video도 첫 프레임에서 벗어나는 컷을 의도하지 않으면
단일 컷이 낫다고 한다. ([PG]) 공식

자막 억제용 필드(`negative_prompt` 등)는 여전히 없다. 프롬프트로만 지시할 수 있다. ([OAS]) 공식(부재 확인)

## 가격과 과금

- 생성 3종은 초당 과금이다. T2V·I2V는 출력 초, A2V는 입력 오디오 초를 센다. ([PRICE]) 공식
- 2.5는 T2V·I2V·A2V의 초당 단가가 모두 같다. 2.3 Pro는 A2V가 T2V보다 비싸다. ([PRICE]) 공식
- 비율이 달라도 짧은 변이 같으면 같은 가격이다(1:1·3:2·2:3은 같은 등급의 16:9 가격). ([CL-1012]) 공식
- 가격표에 fps 구분이 없다. 48/50fps가 같은 가격인지 명시한 문장은 없다. **미확인**
- 예시: Pro 1080p 8초는 8 × $0.17 = $1.36, Fast 1080p 8초는 $1.04, Pro 1080p A2V 5초 오디오는 $0.85.
- 엔터프라이즈 가격은 영업 문의다. ([PRICE]) 공식

## 한도·오류·정책

**동시성** ([RATE]) 공식

- 조직 단위로 모든 키가 공유한다. 기본 동시 실행 2개이며 초과분은 `pending`으로 대기한다.
- `pending` 대기열은 100개까지다. 넘으면 `429 rate_limit_error`. 더 높은 동시성은 영업 문의.
- 폴링 GET 요청 자체의 속도 제한은 적혀 있지 않다. **미확인**

**HTTP 오류** ([ERR]) 공식. 형식은 `{"type":"error","error":{"type":…, "message":…}}`.

| 상태 | `error.type` | 재시도 |
|---|---|---|
| 400 | `invalid_request_error` | 아니오 |
| 401 | `authentication_error` | 아니오 |
| 402 | `insufficient_funds_error`(업로드 URL 요청 시) | 아니오 |
| 404 | `not_found_error`(작업 없음·만료) | 아니오 |
| 413 | `request_too_large_error` | 아니오 |
| 429 | `rate_limit_error` | 예. `Retry-After`가 있으면 따름 |
| 500 | `api_error` | 예 |

**작업 실패** (`status: failed`): `invalid_request_error`(디코딩 실패·한도 초과), `insufficient_funds_error`,
`content_filtered_error`, `api_error`, `service_unavailable_error`(업로드 파일을 못 읽음), `overloaded_error`,
`request_timeout_error`. 뒤의 네 개는 재시도 대상이다. 지수 백오프에 최대 50% 지터를 권한다. ([ERR]) 공식

**콘텐츠 정책**: 정책 위반은 제출 시점이 아니라 작업 실패(`content_filtered_error`)로 돌아온다([OAS]).
허용·금지 항목을 적은 Acceptable Use Policy 본문은 읽지 못했다. 도움말 센터가 자동 접근을 막았다. **미확인**

## 제3자 호스트 (2차)

fal.ai의 `lightricks/ltx-2.5/*/pro`는 공식 API의 일부만 노출한다. ([FAL-I2V], [FAL-A2V]) 2차

| 항목 | fal.ai | 공식 |
|---|---|---|
| 인증 | `Authorization: Key …` | `Bearer` |
| 해상도 | `720p`, `1080p` + `aspect_ratio`(`auto`, `16:9`, `9:16`) | 픽셀 문자열, 4K·1:1·3:2·2:3 포함 |
| `duration` | 6, 8, 10, `"auto"`(기본 `auto`) | 정수 또는 `null`, 필수 |
| `fps` | 24, 25, 50(기본 25) | 24, 25, 48, 50(기본 24) |
| 끝 프레임 | `end_image_url` | `last_frame_uri` |
| 추가 필드 | A2V의 `enable_safety_checker` | 없음 |
| 가격(Pro) | 720p $0.12, 1080p $0.17, A2V 1080p $0.17 | 같음 |

fal도 seed, negative prompt, 음성 참조를 받지 않는다. 다른 호스트(Replicate, WaveSpeed, Runware)는 읽지 않았다.

## social-flow 어댑터 관점

플러그인은 지금 공식 LTX API를 호출하는 어댑터가 없다. LTX 계열은 자체 ASTRA·GenAI 게이트웨이와 로컬 MLX를 쓴다
([video-registry.ts](../../../server/src/video-registry.ts)). 공식 API를 붙인다면 레인은 이렇게 정해진다.

| 공식 엔드포인트 | 들어갈 레인 | 근거 |
|---|---|---|
| `audio-to-video` | `supplied` | 고정 TTS 트랙이 클립을 구동한다. `entry()`가 `operation: 'audio'`를 `supplied`로 매기는 규칙과 같다 |
| `text-to-video`, `image-to-video` | `none` | 네이티브 음성은 나오지만 목소리를 고정할 입력이 없다. `video_plan`이 화면 속 대사 컷을 `voice_lane_required`로 거부해야 한다 |
| (없음) | `reference` | 음성 샘플 필드도 여러 인물 참조 이미지도 없다. MSR·Seedance 참조·FastH3를 대신할 수 없다 |

멀티샷의 목소리 유지는 한 클립 안의 이야기다. 샷마다 따로 생성하는 우리 단위와 맞지 않으므로 `reference` 근거가 되지 못한다.

현재 어댑터와 비교한 공백:

- **해상도 고정 목록.** 프로젝트 기본값 `1792x1024`(9:16은 `1024x1792`)는 목록에 없다. 16:9는 `1920x1080` 또는
  `1280x720`으로 바꿔야 한다.
- **최소 6초, 2초 간격.** T2V·I2V는 `none` 레인이라 대사 없는 컷에만 쓰인다. 2~4초짜리 무음·내레이션 컷도
  6초 이상 생성·과금된다. 공식적인 길이 맞춤 수단은 `duration: null`(자동 길이)뿐이고 그 하한은 문서에 없다.
  A2V는 오디오가 길이를 정한다(Pro 2~10초). 2초 미만 대사는 거부되므로 앞뒤에 무음을 붙여야 한다.
- **seed 없음.** 같은 요청을 재현할 수 없다.
- **negative prompt 없음.** PR #620이 GenAI v2 도구에 넣은 `negativePrompt`를 공식 API에는 보낼 수 없다.
- **멀티 참조 없음.** 첫·끝 프레임 두 장이 전부다. MSR처럼 인물 패널을 따로 넣을 수 없다.
- **멱등 키·웹훅 없음.** 제출 응답을 못 받은 요청은 중복 과금 위험이 있다. 재제출 전에 확인할 수단이 없으므로
  작업 `id`를 영수증에 바로 적고 불확실한 제출은 재시도하지 않아야 한다.
- **보존 기간.** 상태 24시간, 출력 URL 만료 미상. 완료 즉시 내려받아야 한다.
- **동시성 기본 2.** 한 에피소드의 샷을 한꺼번에 내면 나머지는 `pending`으로 기다린다.
- **A2V 기본 모델이 2.3 Pro.** 어댑터가 `model`을 늘 명시해야 한다.
- **이미지 15MB(URL)·7MB(data URI) 한도.** 큰 PNG 시작 이미지는 업로드 경로를 써야 한다.

## 확인하지 못한 것

- 출력 URL의 만료 시간.
- 호스팅 A2V가 입력 오디오를 바이트 그대로 돌려주는지 다시 생성하거나 섞는지.
- 자동 길이(`duration: null`)가 고를 수 있는 최소 길이.
- 48/50fps의 가격이 24/25fps와 같은지.
- I2V에서 입력 이미지 비율과 `resolution`이 다를 때의 처리(자르기·늘이기·거부), 입력 이미지의 최소·최대 픽셀.
- 오디오를 업로드했을 때의 크기 한도.
- 명세에 없는 필드(`seed` 등)를 보내면 400으로 거부하는지 무시하는지. 실제 호출 없이 확인할 방법이 없었다.
- 네이티브 음성이 지원하는 언어 목록과 한국어 대사 품질.
- 별도 생성 사이의 목소리 일관성. 공식 주장도 측정 자료도 찾지 못했다.
- Acceptable Use Policy 본문과 금지 항목.
- 폴링 GET의 속도 제한, `429`에 `Retry-After`가 실제로 붙는지.
- Pro와 Fast의 품질 차이를 수치로 밝힌 공식 자료.

## 출처

모두 2026-11-18에 열람했다.

[OAS]: https://docs.ltx.io/openapi.json
[T2V]: https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-text-to-video
[I2V]: https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-image-to-video
[A2V]: https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video
[STATUS]: https://docs.ltx.io/api-documentation/api-reference/async-video-generation/get-job-status
[UP]: https://docs.ltx.io/api-documentation/api-reference/upload/create-upload
[MODELS]: https://docs.ltx.io/models
[M25]: https://docs.ltx.io/models/ltx-2-5
[M23]: https://docs.ltx.io/models/ltx-2-3
[IN]: https://docs.ltx.io/input-formats
[OUT]: https://docs.ltx.io/output-formats
[JOBS]: https://docs.ltx.io/async-jobs
[RATE]: https://docs.ltx.io/rate-limits
[ERR]: https://docs.ltx.io/errors
[PRICE]: https://docs.ltx.io/pricing
[AUTH]: https://docs.ltx.io/authentication
[MIG]: https://docs.ltx.io/migrate-v1-to-v2
[EU]: https://docs.ltx.io/api-documentation/transparency/eu-ai-act
[PG]: https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide
[OSO]: https://docs.ltx.io/open-source-model/getting-started/overview
[COMPAT]: https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility
[IDLORA]: https://ltx.io/blog/what-is-id-lora
[CL-0721]: https://docs.ltx.io/changelog/2026/7/21
[CL-1012]: https://docs.ltx.io/changelog/2026/10/12
[CL-1028]: https://docs.ltx.io/changelog/2026/10/28
[CL-1029]: https://docs.ltx.io/changelog/2026/10/29
[CL-1105]: https://docs.ltx.io/changelog/2026/11/5
[CL-1110]: https://docs.ltx.io/changelog/2026/11/10
[FAL-I2V]: https://fal.ai/models/lightricks/ltx-2.5/image-to-video/pro/llms.txt
[FAL-A2V]: https://fal.ai/models/lightricks/ltx-2.5/audio-to-video/pro/llms.txt

| 라벨 | 문서 |
|---|---|
| [OAS] | OpenAPI 3.1 명세 |
| [T2V] [I2V] [A2V] | 생성 엔드포인트 참조 |
| [STATUS] [UP] | 작업 상태, 업로드 참조 |
| [MODELS] [M25] [M23] | 지원 모델, LTX-2.5, LTX-2.3 |
| [IN] [OUT] | 입력·출력 형식 |
| [JOBS] [RATE] [ERR] | 비동기 작업, 동시성, 오류 |
| [PRICE] [AUTH] [MIG] [EU] | 가격, 인증, V1→V2 이전, EU AI Act 표시 |
| [PG] | 프롬프트 가이드 |
| [OSO] [COMPAT] | 오픈소스 개요, 워크플로 호환표 |
| [IDLORA] | ID-LoRA 블로그(2026-10-01) |
| [CL-0721] [CL-1012] [CL-1028] [CL-1029] [CL-1105] [CL-1110] | API 변경 기록 |
| [FAL-I2V] [FAL-A2V] | fal.ai 모델 문서(2차) |
