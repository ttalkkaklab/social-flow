# HeyGen Video 1 (`heygen-video-1`) API 스키마 조사

조사일 2026-11-18. 유료 API는 호출하지 않았고 자격 증명도 쓰지 않았다.
표시: **공식** = developers.heygen.com·help.heygen.com·heygen.com, **2차** = 재판매·호스팅 업체(Runware, OpenRouter, AI/ML API, OrcaRouter 등), **미확인** = 근거를 찾지 못했거나 출처끼리 어긋나서 결론을 내지 못한 항목.

## 결론

- 엔드포인트는 하나다. `POST https://api.heygen.com/v3/models/videos`에 `mode`(`text_to_video` · `image_to_video` · `reference_to_video`)를 실어 보내고 `GET /v3/models/videos/{video_id}`로 상태를 확인한다. 인증은 `x-api-key` 헤더를 쓴다. 생성 요청은 `202`와 `video_id`를 돌려준다. **공식** ([모델 문서](https://developers.heygen.com/docs/models/heygen-video), [OpenAPI](https://developers.heygen.com/reference/create-heygen-video.md))
- 2차 자료에 흔한 "5–15초, 768p 상한"은 옛 값이다. 지금 길이는 **5–30초 정수 또는 `"auto"`**이고(10월·11월 변경) 해상도는 **480p·768p·1080p·2k** 넷이다(10월 추가). **공식** ([changelog](https://developers.heygen.com/changelog))
- 키프레임 전용 모드는 없다. 대신 `image_to_video`가 선택 필드 `end_image`(마지막 프레임 유도)를 받는다. **공식** (OpenAPI)
- 가격(help center, 2026-11-09 갱신): 50% 출시 프로모션이 **2026-11-30까지** 이어진다. 768p T2V/I2V는 지금 $0.018/s이고 12월 1일부터 표준가 $0.03/s다. 480p는 $0.01 → $0.02, Ref2V 768p는 $0.05 → $0.06이다. "$0.02 vs $0.03" 논란은 이렇게 풀린다. $0.02는 **480p** 표준가이고 768p 표준가는 $0.03이다. 프로모션이 10월 말에 끝난다는 서술은 옛 정보다. **공식** ([help 17272995](https://help.heygen.com/en/articles/17272995-introducing-heygen-video-generate-cinematic-clips-from-a-prompt))
- 목소리: 공식 API 스키마에는 `voice_id` 같은 필드가 없고 스키마가 strict라서 HeyGen 보이스 클론 ID를 넣을 수 없다. **공식**. `reference_audio`(최대 3개)는 있지만 그 오디오가 무엇을 조종하는지 공식 개발 문서에는 설명이 없다. Runware 가이드에 따르면 프롬프트 문구에 따라 두 가지 역할을 한다. "in the voice of `<Audio 1>`"이라고 쓰면 음색만 빌리고 "his speech is `<Audio 1>`, word for word"라고 쓰면 녹음을 그대로 깔고 입을 맞춘다. **2차**
- social-flow 관점에서 Video 1은 `reference` 레인 후보다. 시작 프레임 고정(`image`)과 음성 샘플을 한 요청에 함께 넣을 수 없어서 샷 시작 이미지는 `<Picture 1>` 참조로만 들어간다. 한국어 대사 지원은 확인하지 못했다.

## 1. 기본 정보

| 항목 | 값 | 출처 | 표시 |
| - | - | - | - |
| 모델 | `heygen-video-1`, MiniMax H3를 HeyGen이 post-train | [모델 문서](https://developers.heygen.com/docs/models/heygen-video) | 공식 |
| 공개 | API reference 등재 2026-09(changelog "Added - September 2026"), 출시일 9월 30일 | [changelog](https://developers.heygen.com/changelog), [OrcaRouter](https://www.orcarouter.ai/blog/heygen-video-1-launch) | 공식(월) / 2차(일) |
| Base URL | `https://api.heygen.com` | OpenAPI `servers` | 공식 |
| 인증 | `x-api-key: <key>`. OpenAPI에는 `BearerAuth`(OAuth2 bearer)도 함께 있다 | OpenAPI `securitySchemes` | 공식 |
| 스코프 | 생성 `videos:write`, 조회 `videos:read`, 참조 업로드 `assets:write` | 모델 문서 | 공식 |
| 계정 조건 | "This route runs on paid API keys." 구독 없이 API 크레딧(종량제, 12개월 만료)만 사면 쓸 수 있다. 2026년 2월부터 무료 API 크레딧은 없다 | 모델 문서, [help 10060327](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-subscriptions-explained) | 공식 |
| MCP | OAuth로 웹 구독 크레딧에서 빠진다. MCP는 `auto` 15초 상한 | [llms.txt](https://developers.heygen.com/llms.txt), 모델 문서 | 공식 |

## 2. 엔드포인트

| 용도 | 메서드·경로 | 비고 | 표시 |
| - | - | - | - |
| 생성(세 모드 공통) | `POST /v3/models/videos` | `mode` 값에 따라 본문 스키마가 달라진다(OpenAPI discriminator). 별칭 `t2v`·`i2v`·`ref2va`도 받는다 | 공식 |
| 상태·결과 | `GET /v3/models/videos/{video_id}` | `pending` → `processing` → `completed`·`failed`·`cancelled`. 제출된 작업은 끝까지 돈다 | 공식 |
| 같은 작업 다른 경로 | `GET /v3/videos/{video_id}` | `video_page_url`, 프롬프트 앞 64자로 만든 `title`이 붙는다 | 공식 |
| 참조 업로드 | `POST /v3/assets`(multipart, 영상·오디오 50 MB, 이미지 32 MB), `POST /v3/assets/direct-uploads`(최대 200 MB) | 결과 `asset_id`는 같은 워크스페이스에서 재사용된다 | 공식 ([Assets](https://developers.heygen.com/assets.md)) |
| 아바타 배역 + Video 1 | `POST /v3/videos` + `type:"cinematic_avatar"`, `model:"heygen_video_1"` | 별도 제품. 4절 참고 | 공식 |

출처: [모델 문서](https://developers.heygen.com/docs/models/heygen-video), [Create](https://developers.heygen.com/reference/create-heygen-video.md), [Get](https://developers.heygen.com/reference/get-heygen-video.md).

### 비동기·재시도·웹훅

- `Idempotency-Key` 헤더(선택, `^[A-Za-z0-9_\-:.]{1,255}$`): 24시간 안에 같은 키로 다시 보내면 원래 응답을 돌려준다. 원 요청이 아직 처리 중이면 `409 request_in_progress`를 받는다. 키 없이 다시 보내면 생성이 하나 더 생기고 비용도 다시 든다. **공식** (OpenAPI)
- `callback_url`(HTTPS)과 `callback_id`(≤256자): 종료 시 `avatar_video.success` 또는 `avatar_video.fail` 이벤트가 **한 번만** 간다. 문서는 폴링을 기본 경로로 두라고 권한다. `callback_id`만 보내면 워크스페이스에 등록된 웹훅 엔드포인트로 간다. **공식** (모델 문서)
- 웹훅 서명: 원본 본문을 엔드포인트 secret으로 HMAC-SHA256한 hex 값이 `signature` 헤더에 담긴다. **공식** ([Webhooks](https://developers.heygen.com/docs/webhooks.md))
- `avatar_video.success` payload: `video_id`, `url`, `gif_download_url`, `video_page_url`, `video_share_page_url`, `folder_id`, `callback_id`. Video 1 작업에서 모든 필드가 채워지는지는 문서에 없다. **공식**(필드 목록) / **미확인**(Video 1에서 채워지는 필드) ([Webhook events](https://developers.heygen.com/docs/webhook-events.md))

## 3. 요청 필드

OpenAPI 세 스키마 모두 `additionalProperties: false`다. 모르는 필드는 거부된다. 다른 모드의 필드에 값이 있으면 `400`을 받는다(빈 배열과 `null`은 통과). **공식**

### 3.1 공통 필드

| 필드 | 타입 | 필수 | 기본값 | 허용 값·범위 | 표시 |
| - | - | - | - | - | - |
| `model` | string const | 예 | — | `heygen-video-1`만 | 공식 |
| `mode` | string const | 예(OpenAPI) | — | `text_to_video` · `image_to_video` · `reference_to_video` | 공식, 충돌은 3.5 |
| `prompt` | string | 예 | — | 1–16,000 Unicode 자(OpenAPI) | 공식, 충돌은 3.5 |
| `prompt_enhancement` | enum | 아니오 | `quality` | `turbo` · `quality` · `ultraquality` · `disabled` | 공식 |
| `resolution` | enum | 아니오 | `768p` | `480p` · `768p` · `1080p` · `2k`. T2V·Ref2V에서 1080p·2k는 `aspect_ratio` `16:9`·`9:16`만 된다 | 공식 |
| `duration` | int 또는 `"auto"` | 아니오 | `5` | 정수 5–30. 15초 초과는 `turbo`·`quality`일 때만 된다. `ultraquality`·`disabled`는 5–15 | 공식 |
| `seed` | uint32 또는 null | 아니오 | null(무작위) | 0–4294967295. 같은 seed와 같은 프롬프트면 같은 파일이 나온다(같은 배포 안에서) | 공식 |
| `callback_url` | string 또는 null | 아니오 | null | HTTPS | 공식 |
| `callback_id` | string 또는 null | 아니오 | null | ≤256자 | 공식 |
| `end_user_id` | string 또는 null | 아니오 | null | 1–128자, 공백 없음, 개인정보 없음. 과금·권한·레이트에 영향 없음 | 공식 |

`duration: "auto"`: 프롬프트의 큰따옴표(곧은 따옴표·굽은 따옴표) 안 단어 수를 초당 2.5단어로 나눈 뒤 1초 lead-in을 더하고 올림한다. 최소 8초, 최대는 설정에 따라 다르다(T2V·I2V 30, Ref2V·`ultraquality`·`disabled`·MCP 15). 따옴표 대사가 없으면 8초다. 완료 레코드의 `duration`이 실제 과금 길이다. **공식** (모델 문서 "Auto duration"). 단어 수 기준이라 한국어 대사에 어떻게 적용되는지는 **미확인**.

### 3.2 `text_to_video`

| 필드 | 타입 | 필수 | 기본값 | 허용 값 | 표시 |
| - | - | - | - | - | - |
| `aspect_ratio` | enum | 아니오 | `16:9` | `21:9` · `16:9` · `4:3` · `1:1` · `3:4` · `9:16`(`adaptive` 없음) | 공식 |

### 3.3 `image_to_video`

| 필드 | 타입 | 필수 | 기본값 | 설명 | 표시 |
| - | - | - | - | - | - |
| `image` | Asset(`url` · `asset_id` · `base64`) | 예 | — | 결과의 **첫 프레임 그대로**. EXIF 방향까지 따른다 | 공식 |
| `end_image` | Asset 또는 null | 아니오 | null | 마지막 프레임 유도. 비율은 여전히 `image`를 따른다 | 공식 |
| `aspect_ratio` | enum 또는 null | 아니오 | null | 받기는 하지만 무시한다. 모든 해상도에서 이미지 비율을 따른다 | 공식 |

### 3.4 `reference_to_video`

| 필드 | 타입 | 필수 | 기본값 | 설명 | 표시 |
| - | - | - | - | - | - |
| `reference_images` | Asset[] | 조건부 | [] | 최대 9 | 공식 |
| `reference_videos` | Asset[] | 조건부 | [] | 최대 3, 합계 15초 입력 예산. 비율 1:4–4:1 | 공식 |
| `reference_audio` | Asset[] | 아니오 | [] | 최대 3 | 공식 |
| `aspect_ratio` | enum | 아니오 | `adaptive` | 6개 비율 + `adaptive`(첫 참조 이미지, 이미지가 없으면 첫 참조 영상의 비율. 오디오만 있으면 16:9). 1080p·2k에서는 `16:9`·`9:16`을 명시해야 한다 | 공식 |

- 이미지 또는 영상 참조가 적어도 하나 필요하다. 오디오만으로는 안 된다. **공식**(모델 문서) / **2차**(Runware도 같은 내용). 다만 OpenAPI 400 예시 문구("Provide at least one reference image, video, or audio recording")와 `aspect_ratio` 설명("audio-only references use 16:9")은 오디오만 있는 요청이 허용되는 것처럼 읽힌다. **미확인**(3.5).
- 프롬프트 라벨: 리스트 순서가 곧 라벨이다. `<Picture 1>`, `<Picture 2>`, `<Video 1>` 식으로 종류마다 따로 번호를 매긴다. API는 라벨을 바꾸지 않지만 prompt enhancement가 나머지 문장을 고쳐 쓸 수 있어서 원문을 지키려면 `disabled`를 쓴다. **공식**. 오디오 라벨 `<Audio 1>`은 공식 문서에 표기가 없고 Runware 가이드에서만 확인했다. **2차**. ComfyUI 한국어 노드 문서는 `@Image1` · `@Video1` · `@Audio1` 표기를 쓴다(ComfyUI 노드 방식으로 보인다). **2차**([docs.comfy.org](https://docs.comfy.org/ko/built-in-nodes/HeyGenReferenceToVideoNode))
- 참조 영상 15초 예산: 합이 15초 안이면 전부 쓴다. 넘으면 각 영상 앞 5초를 먼저 보장하고 남은 시간을 남은 영상들에 똑같이 나눈다. 영상은 앞에서부터 잘린다(예: 10+10 → 7.5+7.5, 3+10+10 → 3+6+6). 응답의 `input_video_duration`이 과금용 합계다. **공식**

### 3.5 Asset 입력과 크기 제한

```json
{ "type": "url",      "url": "https://example.com/photo.jpg" }
{ "type": "asset_id", "asset_id": "ASSET_ID" }
{ "type": "base64",   "media_type": "image/jpeg", "data": "<base64>" }
```

| 입력 | 이미지 | 영상·오디오 | 표시 |
| - | - | - | - |
| `url` | 16 MB | 32 MB | 공식 |
| `base64`(디코딩 기준) | 5 MB | 16 MB | 공식 |
| `asset_id`(simple upload) | 32 MB | 50 MB | 공식 |
| `asset_id`(direct upload) | 200 MB | 200 MB(오디오 1.5 GB) | 공식 |

URL은 HTTPS여야 한다. 서버가 SSRF 검사를 거쳐 가져오고 리다이렉트는 따라가지 않는다. 그래서 문서는 직접 통제하지 않는 파일을 `POST /v3/assets`로 올린 뒤 `asset_id`로 넘기라고 권한다. **공식** ([모델 문서](https://developers.heygen.com/docs/models/heygen-video), [Assets](https://developers.heygen.com/assets.md)). `/v3/models/videos`가 받는 참조 파일 형식(이미지 확장자, 오디오 코덱, 오디오 최대 길이)은 따로 적혀 있지 않다. **미확인**. `/v3/videos`(아바타)의 입력 표(JPG·PNG, MP4·WebM, WAV·MP3)가 이 엔드포인트에도 적용되는지는 알 수 없다.

### 3.6 공식 문서끼리 어긋나는 값

| 항목 | OpenAPI(구속력 있는 스키마로 본다) | 다른 공식 문서 |
| - | - | - |
| `prompt` 최대 길이 | 16,000자 | 모델 문서 32,000자, 9월 changelog 5,000자 |
| 참조 총합 상한 | 개별 상한만 있다(9/3/3). 설명문은 "up to fifteen references" | 모델 문서 15. 9월 changelog와 Cinematic Avatar 문서 12(Runware 2차도 12) |
| 크레딧 부족 | `402 insufficient_credit` | 모델 문서 "Insufficient credits return `400`" |
| `mode` | 필수 | 모델 문서는 "`reference_to_video` is the default" |
| 오디오만 있는 참조 | 400 예시·`aspect_ratio` 설명은 허용처럼 읽힌다 | 모델 문서는 이미지나 영상이 필요하다고 적는다 |

어댑터를 만든다면 보수적으로 잡는 편이 안전하다. `mode`는 항상 보낸다. 프롬프트는 16,000자 이하, 참조는 12개 이하로 잡고 오디오에는 이미지를 반드시 함께 넣는다.

## 4. 응답

### 생성 `202`

```json
{ "data": { "video_id": "…", "status": "pending", "input_video_duration": 0 } }
```

`input_video_duration`은 0–15 또는 null이다. **공식** (OpenAPI `CreateModelVideoResponse`)

### 조회 `200` — `ModelVideoResponse`(`data` 아래)

| 필드 | 타입 | 설명 | 표시 |
| - | - | - | - |
| `video_id` | string | | 공식 |
| `status` | enum | `pending` · `processing` · `completed` · `failed` · `cancelled` | 공식 |
| `model` | enum | `heygen-video-1` | 공식 |
| `created_at` | int | Unix 초 | 공식 |
| `video_url` | string 또는 null | 완료 시. **서명 URL**이며 만료되면 다시 폴링해 새 URL을 받는다 | 공식 |
| `duration` | int 또는 null | 실제 길이(초) | 공식 |
| `input_video_duration` | number 또는 null | 참조 영상 과금 초 | 공식 |
| `aspect_ratio` | string 또는 null | adaptive일 때 약분한 실제 비율(예 `23:15`) | 공식 |
| `width` · `height` | int 또는 null | 실제 픽셀 | 공식 |
| `seed` | int 또는 null | 실제로 쓴 seed | 공식 |
| `timings.inference` | number | DiT 실행 초(큐·인코딩 제외) | 공식 |
| `failure_code` | enum 또는 null | `generation_failed` · `generation_cancelled` · `usage_limit_reached` | 공식 |
| `failure_message` | string 또는 null | | 공식 |

`video_url` 만료 시간 값은 문서에 없다. **미확인**. 다른 워크스페이스의 ID나 없는 ID는 `404 resource_not_found`를 받는다. **공식**

### 출력 미디어

| 항목 | 값 | 표시 |
| - | - | - |
| 컨테이너 | MP4, H.264 | 공식 |
| 프레임레이트 | 24 fps, 다음 정수 프레임으로 올림(7초 요청 → 175프레임) | 공식 |
| 오디오 | AAC, 32 kHz 스테레오, 생성된 대사와 효과음 | 공식 |

해상도 표(명시한 `aspect_ratio` 기준, **공식**):

| `aspect_ratio` | `2k` | `1080p` | `768p` | `480p` |
| - | - | - | - | - |
| `21:9` | | | 1536×672 | 960×416 |
| `16:9` | 2688×1536 | 1890×1080 | **1344×768** | 832×480 |
| `4:3` | | | 1024×768 | 640×480 |
| `1:1` | | | 768×768 | 480×480 |
| `3:4` | | | 768×1024 | 480×640 |
| `9:16` | 1536×2688 | 1080×1890 | **768×1344** | 480×832 |

adaptive는 원본 비율을 해상도의 짧은 변에 맞추고 각 변을 32의 배수로 반올림한다(1280×852 참조, 480p → 736×480). 1080p는 정확히 1920×1080이 아니라 1890×1080이므로 social-flow 최종 캔버스(1080p)에 넣으려면 스케일이나 크롭이 필요하다. **공식**

## 5. 오디오와 목소리

| 질문 | 답 | 출처 | 표시 |
| - | - | - | - |
| 생성 오디오에 무엇이 들어가나 | 대사, 앰비언스, 효과음을 그림과 한 번에 만든다. 별도 음성·립싱크 단계가 없다. 대사를 요청하지 않으면 대사가 나오지 않는다. 음악을 원하지 않으면 `no music`이라고 써야 한다 | [모델 문서](https://developers.heygen.com/docs/models/heygen-video) | 공식 |
| 오디오를 끄는 플래그 | 스키마에 `generate_audio` 같은 토글이 없다. strict 스키마라 넣으면 거부된다. 무음은 프롬프트로 요청하거나 후처리로 지워야 한다 | OpenAPI | 공식(필드 부재) |
| 대사 속도 | 약 2.5단어/초 | 모델 문서 | 공식 |
| `reference_audio`가 조종하는 것 | 공식 개발 문서에는 "Reference audio recordings. At most three."뿐이다. Ref2V 이미지·오디오 참조는 과금되지 않는다(help) | OpenAPI, [help 17272995](https://help.heygen.com/en/articles/17272995-introducing-heygen-video-generate-cinematic-clips-from-a-prompt) | 공식 |
| 같은 질문, 2차 설명 | 프롬프트가 역할을 정한다. ① "speaks … in the voice of `<Audio 1>`": 녹음의 단어는 무시하고 음높이와 음색만 가져온다 ② "his speech is `<Audio 1>`, word for word, with his lips in sync": 녹음 자체를 트랙으로 쓰고 입을 맞춘다 ③ "the soundtrack is `<Audio 1>`": 음악 트랙에 동작을 맞춘다. 두 화자에게 각기 다른 음성을 붙이는 예시도 있다. 오디오 참조는 `frameImages`(첫 프레임)와 함께 쓸 수 없다고 적혀 있다 | [Runware audio references](https://runware.ai/docs/models/heygen-video-1-0/guides/audio-references) | 2차 |
| 여러 클립에서 목소리 일관성 | Runware: 참조가 없으면 생성마다 목소리가 바뀔 수 있고 참조를 주면 파일이 목소리를 고정한다. HeyGen 블로그(마케팅 글, 2026-11-03 갱신, WebFetch 요약으로 확인): "Attach a few seconds of the character's voice as an audio reference" in HeyGen Video 1이라고 권하지만 일관성을 보장한다는 말은 없다 | Runware, [HeyGen blog](https://www.heygen.com/blog/how-to-keep-characters-consistent-ai-video) | 2차 / 공식(마케팅) |
| ②의 트랙이 원본 그대로인가 | Runware는 "The clip carries the recording itself"라고 쓴다. 재인코딩(AAC 32 kHz)만 하는지 모델이 다시 합성하는지는 알 수 없다 | Runware | 미확인 |
| HeyGen 보이스 ID·클론을 넣을 수 있나 | `/v3/models/videos`에는 `voice_id` 필드가 없다. 우회로는 두 가지다. (a) HeyGen Voice TTS(`POST /v3/models/audio/tts`)나 instant clone으로 만든 WAV를 `reference_audio`로 넣기. 동작은 미확인이다 (b) Cinematic Avatar(`POST /v3/videos`, `type:"cinematic_avatar"`, `model:"heygen_video_1"`): 아바타 look에 연결된 목소리가 그 배역의 목소리로 따라온다 | OpenAPI, [Cinematic Avatar](https://developers.heygen.com/cinematic-avatar.md), changelog 11월 | 공식(b) / 미확인(a) |
| 대사 언어·한국어 | 공식 Video 1 문서에는 언어 목록이 없다. Runware는 따옴표 안에 해당 언어로 쓰고 언어를 지시하는 방법을 영어·스페인어 예시로 보여 준다. 한국어 예시나 지원 언급은 찾지 못했다(공식 문서의 한국어 언급은 TTS·번역 기능 쪽) | [Runware dialogue](https://runware.ai/docs/models/heygen-video-1-0/guides/dialogue-and-sound) | 미확인 |

### Cinematic Avatar 경로(Video 1을 쓰는 별도 제품)

- `POST /v3/videos`, `type:"cinematic_avatar"`, `model:"heygen_video_1"`, `avatar_id`는 look ID 배열 1–3개, `prompt` 1–10,000자, `references`(url · asset_id · base64). **공식** ([Cinematic Avatar](https://developers.heygen.com/cinematic-avatar.md))
- Video 1로 렌더할 때: 16:9·9:16, **720p만**, 5–15초, `auto_duration:true`면 10초. 참조는 영상 3·이미지 9·오디오 3, 아바타와 그 목소리를 포함해 총 12개. 영상이 있는 아바타 look은 15초 예산 중 3초를 쓴다. **공식**
- `callback_url`을 넣으면 `400`이다. 등록된 웹훅이나 `GET /v3/videos/{id}` 폴링을 써야 한다. 과금 방식은 Cinematic Avatar 원판(6월)의 "Billed per video"가 Video 1 모델에도 적용되는지 알 수 없다. **미확인**
- 아바타 look을 만들려면 HeyGen의 동의(consent) 절차를 거쳐야 하고 목소리도 HeyGen 쪽 자산이 된다. 2D 캐릭터 시트를 쓰는 social-flow 흐름과는 맞지 않는다.

## 6. 가격

HeyGen help center 표, "Last Updated: November 9, 2026". 출력 1초당 가격이다. **공식** ([help 17272995](https://help.heygen.com/en/articles/17272995-introducing-heygen-video-generate-cinematic-clips-from-a-prompt); 크레딧 환산은 [help 10060327](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-subscriptions-explained), 1 크레딧 = $0.05)

| 모드 | 해상도 | 프로모션(~2026-11-30) | 표준(2026-12-01~) | 크레딧/초(현재) |
| - | - | - | - | - |
| T2V · I2V | 480p | $0.01 | $0.02 | 0.2 |
| T2V · I2V | 768p | $0.018 | **$0.03** | 0.36 |
| T2V · I2V | 1080p | $0.04 | — | 0.8 |
| T2V · I2V | 2K | $0.05 | — | 1 |
| T2V · I2V, 15초 초과 | 480p | $0.045 | — | 0.9 |
| T2V · I2V, 15초 초과 | 768p | $0.075 | — | 1.5 |
| T2V · I2V, 15초 초과 | 1080p · 2K | $0.105 | — | 2.1 |
| Ref2V | 480p | $0.035 | $0.04 | 0.7 |
| Ref2V | 768p | $0.05 | $0.06 | 1 |
| Ref2V | 1080p · 2K | $0.09 | — | 1.8 |

- Ref2V는 **참조 영상 입력 초 + 출력 초**를 과금한다. 이미지·오디오 참조는 무료다. **공식**. 입력 초에 출력과 같은 단가를 쓰는지는 표에 없다. **미확인**
- 15초를 넘는 Ref2V: OpenAPI 설명에 "every output second uses the long-video rate; reference input charges stay at the base rate"라고 적혀 있지만 help 표에는 Ref2V 장편 단가 행이 없다. **미확인**
- 1080p·2K: changelog는 "3× the 768p rate"라고 하는데 표의 값($0.04·$0.05, Ref2V $0.09)은 768p 프로모션가 $0.018의 3배($0.054)와 맞지 않는다. 표준가 칸은 "—"이고 1080p·2K 12월 이후 가격은 알 수 없다. **충돌·미확인**
- "50%" 프로모션이라는데 768p는 $0.018/$0.03 = 60%이고 Ref2V는 83%다. 수치를 그대로 옮긴다.
- 다른 공식 표기: heygen.com 모델 페이지는 "API $0.02 per second"([heygen.com/models/heygen-video-1](https://www.heygen.com/models/heygen-video-1)), heygen.com llms.txt는 "from $0.01/sec"다. 둘 다 해상도를 밝히지 않는다. **공식(불완전)**
- 2차 참고값: AI/ML API Ref2V $0.035/s(2026-11-12 확인), OpenRouter "from $0.01/second", OrcaRouter는 표준가를 "$0.02–0.03 사이"로 미정 처리, Segmind·cut.pro 등은 훨씬 높은 재판매가를 붙인다. **2차** ([AI/ML API](https://aimlapi.com/models/heygen-video-1-reference-to-video), [OpenRouter](https://openrouter.ai/heygen/heygen-video-1), [OrcaRouter](https://www.orcarouter.ai/blog/heygen-video-1-launch))
- `platform.heygen.com/pricing`(가격 권위 페이지)는 로그인 뒤에서만 보여 확인하지 못했다. **미확인**

## 7. 레이트 리밋·동시성·오류·콘텐츠 정책

### 레이트·동시성(공식, [Usage limits](https://developers.heygen.com/docs/usage-limits.md))

| 종류 | 종량제·구독 | Enterprise |
| - | - | - |
| 동시 작업 | 10 | 20(+burst 최대 50, 1.5× 과금) |
| Write | 10/초 | 30/초 |
| Status polling | 500/분, IP당 600/분 | 1,500/분, IP당 1,800/분 |
| Heavy(`POST /v3/assets`) | 30/분 | 120/분 |

문서의 예시 엔드포인트는 `POST /v3/videos`와 `GET /v3/videos/{id}`다. `/v3/models/videos`가 같은 등급과 같은 동시성 풀에 속하는지는 명시가 없어 추정이다. **미확인**. ID가 들어간 경로는 ID마다 따로 센다. 한도를 넘으면 `429 rate_limit_exceeded`, `Retry-After`, `X-RateLimit-Limit/Remaining/Reset/Scope`가 온다. **공식**

### 오류(공식, OpenAPI·[error codes](https://developers.heygen.com/docs/error-codes.md))

| HTTP | `code` | 상황 |
| - | - | - |
| 400 | `invalid_parameter`(`param`에 필드명) | 검증 실패, 다른 모드의 필드 포함 |
| 400 | `content_policy_violation` | 프롬프트 모더레이션 거부(enforcement가 켜져 있을 때). 꺼져 있으면 기록만 하고 생성한다. 모더레이션 오류나 타임아웃이면 어느 모드든 생성을 진행한다 |
| 401 | `unauthorized` | 키 오류 |
| 402 | `insufficient_credit` | 크레딧 부족(모델 문서는 400이라고 씀) |
| 404 | `asset_not_found` · `resource_not_found` | 자산 없음 · 작업 없음 |
| 409 | `request_in_progress` | 같은 Idempotency-Key가 아직 처리 중 |
| 429 | `rate_limit_exceeded` | |
| 503 | `resource_not_ready` | 자산 수집 일시 불가. 같은 Idempotency-Key로 재시도하면 안전하다 |
| (작업) | `failure_code` `generation_failed` · `generation_cancelled` · `usage_limit_reached` | 폴링 결과 |

오류 본문은 `{ "error": { code, message, param, doc_url, errors[], request_id } }`이고 `X-HeyGen-Request-Id` 헤더가 함께 온다. **공식**

### 실존 인물 얼굴

- `realistic_human_reference_not_allowed`(422)는 "Avatar model API reference video"에 적용된다. Video 1 엔드포인트에 같은 제한이 있다는 문구는 찾지 못했다. **미확인**
- Runware 가이드는 실사 인물 초상 이미지를 참조로 넣어 신원을 유지하는 예시를 여럿 싣는다. 2차 경로에서는 실사 얼굴 참조가 동작하는 것으로 보인다. **2차**
- 업로드 자산이 모더레이션에 걸리면 `content_policy_violation`이 난다. 정책 원문은 [heygen.com/policy](https://www.heygen.com/policy). **공식**

## 8. 2차 호스트 스키마 비교(참고)

| 호스트 | 엔드포인트 | 필드 이름 | 표시 |
| - | - | - | - |
| OpenRouter | `POST /api/v1/videos`, 결과 `/api/v1/videos/{id}/content` | `frame_images[{frame_type:"first_frame"}]`, `input_references[{type:"image_url"·"video_url"·"audio_url"}]`, `duration` 5–30, `resolution`, `aspect_ratio`, `seed`, `callback_url` | 2차 |
| Runware | `POST https://api.runware.ai/v1`, `taskType:"videoInference"`, `model:"heygen:video@1.0"` | `positivePrompt`, `inputs.referenceImages/referenceVideos/referenceAudios/frameImages`, `width`/`height`, `settings.promptEnhancement`. "15초 초과는 참조 없이만"이라고 적혀 있는데 HeyGen 11월 changelog(Ref2V 30초)보다 늦게 반영된 내용으로 보인다 | 2차 |
| AI/ML API | `POST /v2/video/generations`, `model:"heygen/video-1-reference-to-video"` | `image_urls`(≤9). 오디오 참조 언급 없음 | 2차 |

## 9. social-flow 어댑터 관점

`server/src/video-registry.ts`의 분류로 보면 다음과 같다.

- **`reference` 레인(유력)**: Ref2V에 캐릭터 시트 패널(얼굴·정면·후면)을 `reference_images`로, 고정 음성 샘플을 `reference_audio`로 넣고 프롬프트에 `in the voice of <Audio N>`과 따옴표 대사를 쓰는 구조다. Seedance `seedance_reference`(`referenceImagePaths`/`referenceAudioPaths`/`referenceVideoPaths` + `Image N`/`Audio N` 바인딩)와 같은 모양이다. 화자 두 명에게 각각 샘플을 붙일 수도 있다(Runware 예시). 다만 음색 차용은 2차 문서에만 근거가 있어서 `videoVoiceCapabilities`의 `voiceReference`는 MSR처럼 `backend_dependent`로 두는 편이 정직하다.
- **`supplied` 레인(가능성만 있음)**: "his speech is `<Audio 1>`, word for word"로 고정 TTS 트랙을 그대로 쓰게 할 수 있다는 2차 설명이 있다. 원본 보존 여부와 타이밍 정확도는 확인하지 못했다. `exactAudioPreservation:false`를 유지해야 한다. 한 어댑터가 프롬프트 문구 하나로 두 레인을 오가는 구조라서 등록 방식을 따로 정해야 한다.
- **`none` 레인**: T2V·I2V는 음성 참조를 받지 않는다. 모델이 생성마다 목소리를 새로 고르므로 화면 속 인물이 말하는 컷에는 쓸 수 없다(`voice_lane_required`). 대사 없는 컷이나 내레이션 컷에는 쓸 수 있다.

**빈틈**

1. **시작 이미지와 음성을 함께 쓸 수 없다.** `reference_audio`는 Ref2V에만 있고 `image`(첫 프레임 고정)는 I2V에만 있다. `shot_image`로 만든 시작 프레임은 Ref2V에서 `<Picture N>` 참조로만 들어가고 첫 프레임이 그대로 재현되지는 않는다. `first_last`(`end_image`)도 I2V 전용이라 음성과 함께 쓸 수 없다.
2. **해상도·비율**: 1080p가 1890×1080, 9:16이 1080×1890이라 최종 캔버스와 30px 차이가 난다. 1080p·2k는 16:9·9:16만 된다. 768p 1344×768은 기존 `1792x1024` LTX 프리셋과 비율이 같다(7:4).
3. **오디오 토글 없음**: `generateAudio:false` 같은 필드가 없어서 "MSR 사운드트랙을 끄고 TTS를 깐다" 같은 흐름은 프롬프트(`No dialogue, no music`)와 후처리에 기대야 한다.
4. **한국어 대사**: 근거 없음. 실제 한국어 대사 샘플로 시험해 봐야 판단할 수 있다. `video_prompt_language` 규칙(영어 프롬프트 + 따옴표 안 한국어 대사)과 형식은 맞는다.
5. **`duration:"auto"`**는 영어 단어 수 기준이라 `storyboard_read`의 음절 기반 타이밍과 다르다. 명시적 정수 길이를 보내야 한다.
6. **실사 얼굴**: Seedance와 달리 Video 1 엔드포인트에 실사 얼굴 거부 규칙이 명시되어 있지 않다(미확인). photoreal 캐릭터 레인 후보가 될 수 있다.
7. **과금 기록**: 응답에 비용 필드가 없다. 원장에는 `duration` × 단가 + `input_video_duration` × 단가로 직접 계산해 넣어야 하고 12월 1일 가격 전환과 장편 단가를 반영해야 한다.
8. **재제출 방지**: `Idempotency-Key`를 플랜 ID에 묶으면 "uncertain call은 재시도 전에 점검"이라는 기존 원칙을 API 수준에서 지킬 수 있다.
9. 현재 `videoCatalog().unimplemented`에 `minimax-h3-api`가 있다. Video 1은 H3 파생 모델이지만 엔드포인트와 과금이 따로라서 별도 어댑터가 된다.

## 10. 확인하지 못한 것

- `reference_audio`의 공식 의미(음색 차용인지, 원본 재생+립싱크인지, 둘 다인지)와 `<Audio N>` 라벨이 공식 문법인지. 공식 개발 문서에는 설명이 없다.
- 참조 오디오를 "word for word"로 쓸 때 출력 트랙이 원본을 보존하는지 다시 합성하는지.
- 여러 클립에서 같은 샘플로 같은 목소리가 유지되는 정도. 측정값이 없다.
- 한국어(그리고 영어 외 언어) 대사 품질과 지원 여부.
- `reference_audio` 형식·길이 제한(WAV/MP3 여부, 최대 초).
- `video_url` 서명 URL의 만료 시간.
- `prompt` 최대 길이(16,000 / 32,000 / 5,000)와 참조 총합(12 / 15) 중 실제 서버 값.
- 오디오만 있는 Ref2V 요청이 허용되는지.
- 크레딧 부족 HTTP 코드(400 / 402).
- 12월 1일 이후 1080p·2K·15초 초과·Ref2V 장편의 표준가, 참조 영상 입력 초 단가, `platform.heygen.com/pricing` 원표(로그인 필요).
- `/v3/models/videos`의 레이트 등급과 동시성 풀 소속.
- Video 1 엔드포인트의 실사 얼굴 제한과 모더레이션 enforcement 기본값.
- Cinematic Avatar + `heygen_video_1`의 과금 방식(영상당인지 초당인지).
- HeyGen 웹훅 payload가 Video 1 작업에서 채우는 필드.
