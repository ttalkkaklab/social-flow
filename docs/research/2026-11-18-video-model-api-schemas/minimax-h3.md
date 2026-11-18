# MiniMax H3 (Hailuo 03) 공개 API 스키마

기준일: **2026-11-18**. MiniMax Open Platform 글로벌 문서(`platform.minimax.io`)의 OpenAPI 원문(`.md`)을 직접 내려받아 읽었다. 유료 호출이나 자격 증명 사용은 하지 않았다. 각 항목 끝의 표시는 다음 뜻이다.

- **공식**: MiniMax가 운영하는 문서·가격표·모델 카드·라이선스에서 확인
- **2차**: fal, kie.ai, reAPI, Pixazo, 커뮤니티 글 등 제3자 자료
- **미확인**: 어느 자료에서도 확정하지 못함

출처 키는 문서 끝 [출처](#출처) 표에 모았다.

## 결론

1. **엔드포인트는 하나다.** `POST https://api.minimax.io/v2/video_generation` 한 곳에 `content[]` 배열을 보내고 `role`로 텍스트→영상, 첫·끝 프레임, 참조 생성을 구분한다. 비동기 작업이며 `task_id`로 조회하거나 `callback_url`을 받는다. [C] 공식
2. **모델 ID는 네 개다.** `MiniMax-H3`, `MiniMax-H3-Highspeed`, `MiniMax-H3-Lite`, `MiniMax-H3-Max`. 2K는 `MiniMax-H3`만 지원한다. 지난 10월 조사([2026-10-18 비교](../2026-10-18-video-model-api-pricing/README.md))에는 Highspeed와 Lite가 없었다. [C] 공식
3. **공식 단가**: H3는 768P 초당 $0.08, 2K 초당 $0.13. H3 Max는 768P $0.08, 480P $0.05. 참조 오디오는 무료이고 참조 영상은 입력 길이만큼 과금한다. 이미지는 H3 계열이 5장, Max가 2장까지 무료다. 시중의 $0.04는 재판매 할인가, $0.09는 출시 직후 2차 자료의 수치다. [P] 공식
4. **목소리 참조는 된다.** `reference_audio`를 넣고 프롬프트에 "Voice timbre follows reference audio 1"처럼 적는다. 공식 예시가 이 형태다. social-flow 분류로는 `reference` 레인에 해당한다. 다만 같은 목소리가 여러 생성에서 유지된다는 공식 주장은 없다. [C][PG] 공식
5. **어댑터에서 가장 큰 제약**: 첫 프레임 고정(`first_frame`)과 참조(`reference_*`)를 한 요청에 섞을 수 없다. 시작 이미지를 고정한 채 목소리 샘플을 함께 보내는 MSR식 호출이 공식 스키마로는 불가능하다. [C] 공식
6. **2차 자료에 나오지만 공식 스키마에 없는 것**: `seed`, fps 지정, 오디오 끄기, 1080p, `@Image1` 문법, extend 엔드포인트. 출력은 24fps·32kHz 스테레오로 고정이다. [C][HF] 공식
7. **오픈 웨이트는 대한민국을 배제한다.** MiniMax H3 Community License의 Excluded Territories는 EU·영국·대한민국·미국이다. API는 전 세계에서 쓸 수 있다고 MiniMax가 밝혔다. [LIC][LQA] 공식

## 1. 접속 정보

| 항목 | 값 | 출처 | 표시 |
|---|---|---|---|
| 글로벌 Base URL | `https://api.minimax.io` | [C] | 공식 |
| 중국 Base URL | `https://api.minimaxi.com` (문서 `platform.minimaxi.com`) | [HF][CN] | 공식 |
| 인증 | `Authorization: Bearer <API_KEY>` | [C] | 공식 |
| 요청 헤더 | `Content-Type: application/json` 필수 | [C] | 공식 |
| 요금제 조건 | H3 계열은 Pay-as-you-go API에서만 사용 | [C][G] | 공식 |
| 구독 패키지 | H3는 영상 구독 패키지 미지원 | [hfblog] | 2차 |
| OpenAPI 제목 | "MiniMax video generation V2 (Hailuo-03) API" | [C] | 공식 |

## 2. 엔드포인트 전체

| 용도 | 메서드·경로 | 출처 | 표시 |
|---|---|---|---|
| 생성 작업 만들기 (T2V·I2V·FL2V·R2V) | `POST /v2/video_generation` | [C] | 공식 |
| 작업 조회 | `GET /v2/query/video_generation/{task_id}` | [Q] | 공식 |
| 작업 목록 | `GET /v2/query/video_generation?page_num&page_size&filter.*` | [L] | 공식 |
| 취소·삭제 | `DELETE /v2/video_generation/{task_id}` | [D] | 공식 |
| 프롬프트 강화 (H3-Context-IR) | `POST /v2/h3_context_ir` | [IR] | 공식 |
| 768P→2K 재생성 | `POST /v2/video_regeneration` | [R] | 공식 |
| 입력 파일 업로드 | `POST /v1/files/upload` (`purpose=video_generation_input`) | [U] | 공식 |
| 파일 정보·다운로드 | `GET /v1/files/retrieve`, `GET /v1/files/retrieve_content` | [U] | 공식 |
| extend(영상 이어 만들기) | 공식 엔드포인트 없음. 참조 모드의 프롬프트 과제 유형 `video continuation`으로만 기술됨 | [PG] | 공식(엔드포인트 부재) |
| extend·lipsync 전용 엔드포인트 | Pixazo가 H3 Max 기반 `extend-video`, `lip-sync`를 별도 제공 | [pixazo] | 2차 |

V1 `Hailuo-02`/`Hailuo-2.3` 생성 API는 별개 계열이라 이 문서에서 다루지 않는다.

## 3. 모델 ID와 사양

| 모델 | 해상도 | 길이(초, 정수) | 모드 | 비율 `adaptive` | 출처 | 표시 |
|---|---|---|---|---|---|---|
| `MiniMax-H3` | `768P`, `2K` | 4–15 | T2V, I2V(첫·끝), R2V | 가능 | [C] | 공식 |
| `MiniMax-H3-Highspeed` | `480P`, `768P` | 4–15 | T2V, I2V, R2V | 가능 | [C] | 공식 |
| `MiniMax-H3-Lite` | `480P`, `768P` | 4–15 | T2V, I2V, R2V | **R2V에서 불가**, 구체 비율 필수 | [C] | 공식 |
| `MiniMax-H3-Max` | `480P`, `768P` | **5–15** (4초 불가) | T2V, I2V, R2V | 가능 | [C] | 공식 |

출력 고정값 (모델 카드 기준):

| 항목 | 값 | 출처 | 표시 |
|---|---|---|---|
| 프레임레이트 | 24 FPS. 요청 필드 없음 | [HF] | 공식 |
| 오디오 | 32 kHz 스테레오, 영상과 함께 생성 | [HF][B] | 공식 |
| 768P 실제 크기 | 짧은 변 768px 기본. 재생성 입력 규격은 가로·세로 32 배수, 면적 768×768–768×1344, 107–362프레임(17 단위) | [HF][R] | 공식 |
| 2K 실제 크기 | 공식 수치 없음. "짧은 변 1440px"는 커뮤니티 글 | [hfblog] | 2차 |
| 대사 언어 | 11개 언어 안정 지원: 아랍어, 중국어, 영어, 프랑스어, 독일어, 이탈리아어, 일본어, **한국어**, 포르투갈어, 러시아어, 스페인어 | [HF] | 공식 |
| 2K 생성 방식 | 내부적으로 768P 결과를 원래 컨텍스트와 함께 다시 넣는 H3-Regenerate-2K | [HF] | 공식 |

### H3 Max의 정체

MiniMax 문서는 `MiniMax-H3-Max`를 "fast generation variant"로만 소개하고 출처를 밝히지 않는다. 릴리스 노트에도 날짜가 붙은 항목이 없다. [C][N] 공식

fal은 2026-08-27 글에서 H3 Max를 "fal Research가 MiniMax H3를 post-training한 모델"로 소개했다. 5초 영상을 약 3초에 만든다고 했고 가중치는 공개하지 않았다. [fal-blog][orca] 2차

MiniMax API의 `MiniMax-H3-Max`가 fal의 그 모델과 같은 것인지는 공식 자료로 확인하지 못했다. 미확인

## 4. 생성 요청 `POST /v2/video_generation`

### 4.1 최상위 필드

| 필드 | 타입 | 필수 | 기본값 | 허용 값·범위 | 출처 | 표시 |
|---|---|---|---|---|---|---|
| `model` | string | 예 | 없음 | 위 네 ID | [C] | 공식 |
| `content` | ContentItem[] | 예 | 없음 | 비어 있지 않은 `text` 항목 1개 필수 | [C] | 공식 |
| `resolution` | string | 예 | 없음 | `480P`, `768P`, `2K` (모델별 제한) | [C] | 공식 |
| `duration` | integer | 예 | 없음 | 4–15 정수 전부. Max는 5–15 | [C] | 공식 |
| `ratio` | string | 아니오 | `adaptive` | `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16` | [C] | 공식 |
| `extra` | object | 아니오 | `{"prompt_expansion_mode":"balanced"}` | **H3-Max 전용**. `prompt_expansion_mode`: `disabled` / `balanced` / `quality`. 다른 키 금지(`additionalProperties:false`) | [C] | 공식 |
| `callback_url` | string | 아니오 | 없음 | 상태 변경 시 POST | [C] | 공식 |
| `response_format` | string | 아니오 | `task` | `task`(중첩) / `flat`(최상위 평탄화) | [C] | 공식 |
| `seed` | — | — | — | **스키마에 없음** | [C] | 공식(부재) |
| fps | — | — | — | **스키마에 없음**, 24fps 고정 | [C][HF] | 공식(부재) |
| 오디오 생성 끄기 | — | — | — | **스키마에 없음**. kie는 "끌 수 없다"고 적음 | [C][kie] | 공식(부재)/2차 |
| `aigc_watermark` | — | — | — | 생성 요청에는 없음. 재생성 요청에만 있음 | [C][R] | 공식 |
| 네거티브 프롬프트 | — | — | — | **스키마에 없음** | [C] | 공식(부재) |

`ratio` 규칙 [C] 공식:

- T2V(텍스트만): 필수이며 `adaptive` 불가.
- I2V(첫·끝 프레임): 입력 이미지가 비율을 정한다. 다른 값을 보내도 오류 없이 무시한다.
- R2V(참조): 선택. 기본 `adaptive`. `MiniMax-H3-Lite`는 `adaptive`를 아직 지원하지 않는다.

### 4.2 `content[]` 항목

| 필드 | 타입 | 설명 | 출처 | 표시 |
|---|---|---|---|---|
| `type` | enum | `text`, `image_url`, `video_url`, `audio_url` | [C] | 공식 |
| `text` | string | 프롬프트. 항목당 최대 **7,000자** | [C] | 공식 |
| `image_url.url` | string | 공개 URL, `mm_file://{file_id}`, `data:image/<소문자 형식>;base64,...` | [C] | 공식 |
| `video_url.url` | string | 공개 URL, `mm_file://`, `data:video/mp4;base64,...` | [C] | 공식 |
| `audio_url.url` | string | 공개 URL, `mm_file://`, `data:audio/<소문자 형식>;base64,...` | [C] | 공식 |
| `role` | enum | `first_frame`, `last_frame`, `reference_image`, `reference_video`, `reference_audio` | [C] | 공식 |

`role` 규칙 [C] 공식:

- 이미지 한 장에 `role`이 없으면 `first_frame`.
- `last_frame`은 단독 또는 `first_frame`과 짝.
- `video_url`은 `reference_video`만, `audio_url`은 `reference_audio`만 가능.
- **I2V와 R2V는 섞을 수 없다.** `reference_*`가 하나라도 있으면 `first_frame`/`last_frame`을 넣을 수 없고 반대도 같다.

### 4.3 모드별 조합

| 모드 | `content` 구성 | 출처 | 표시 |
|---|---|---|---|
| T2V | `text` 1개 | [C] | 공식 |
| I2V 첫 프레임 | `text` + `image_url`(`first_frame` 또는 무역할) | [C] | 공식 |
| I2V 끝 프레임 | `text` + `image_url`(`last_frame`) | [C] | 공식 |
| FL2V | `text` + `first_frame` + `last_frame` | [C] | 공식 |
| R2V | `text` + `reference_image`/`reference_video`/`reference_audio` 아무 조합 | [C] | 공식 |
| 중간 키프레임 | 공식 없음. fal H3 Max에 `middle_image_url`이 있음 | [fal-api] | 2차 |

### 4.4 입력 미디어 제한

| 종류 | 형식 | 파일 크기 | 개수 | 길이 | 크기·비율·fps | 출처 | 표시 |
|---|---|---|---|---|---|---|---|
| 이미지 | JPG, JPEG, PNG, WEBP, HEIC, HEIF | ≤ 30 MB | 첫 1, 끝 1, 참조 ≤ 9 | — | 256–5760px, 가로/세로 0.4–2.5 | [C] | 공식 |
| 참조 영상 | MP4, MOV / H.264, H.265 / 음성 AAC, MP3 | ≤ 50 MB | ≤ 3 | 클립당 2–15초, 합계 ≤ 15초 | 256–5760px, 0.4–2.5, 23.976–60fps | [C] | 공식 |
| 참조 오디오 | WAV, MP3 | ≤ 15 MB | ≤ 3 | 클립당 2–15초, 합계 ≤ 15초 | — | [C] | 공식 |
| 합계 | — | 요청 본문 ≤ 64 MB (Base64는 약 33% 증가) | 전체 ≤ **12개** | — | — | [C][G] | 공식 |

**"오디오만 단독으로는 안 된다"는 규칙**은 공식 API 문서([C][G][CN])에 없다. 공식 문서는 "any combination"이라고만 적는다. reAPI·kie·HF 커뮤니티 글은 "오디오는 이미지나 영상과 함께 와야 한다"고 적었다. [reapi][kie][hfblog] 2차. 오픈 웨이트 쪽 FastVideo의 Ref2VA 검증기는 시각 참조가 없는 요청을 거부한다고 이 저장소의 [docs/fasth3-omni.md](../../fasth3-omni.md)에 기록돼 있다. 호스팅 API의 동작은 미확인.

### 4.5 업로드 (`mm_file://`)

| 항목 | 값 | 출처 | 표시 |
|---|---|---|---|
| 경로 | `POST /v1/files/upload`, `multipart/form-data`, 필드 `purpose`, `file` | [U] | 공식 |
| `purpose` | `video_generation_input` (첫 프레임·참조 이미지·참조 영상·참조 오디오) | [U] | 공식 |
| 유효기간 | 7일. 만료 후 생성 요청은 file expired 오류 | [U] | 공식 |
| 검증 시점 | 업로드 시 규격 검사. 실패하면 400, 파일을 보관하지 않음 | [U] | 공식 |
| 업로드 형식 | 이미지 jpg/jpeg/png/webp/heic/heif 30 MB, 영상 mp4/mov 50 MB, 오디오 wav/mp3 15 MB | [U] | 공식 |
| 이전 출력의 file_id 재사용 | `content.url` 설명에 "previous output's file_id"가 있으나 V2 조회 응답에는 `file_id` 필드가 없음 | [C][Q] | 미확인 |

### 4.6 프롬프트에서 참조를 지정하는 방법

| 방식 | 내용 | 출처 | 표시 |
|---|---|---|---|
| 공식 API 예시 | 평문 서수. "Voice timbre follows reference audio 1", "following the motion in reference video 1; the character's appearance follows reference images 1 and 2" | [C][G] | 공식 |
| 번호 규칙 | 종류별로 따로 매긴다. `<Video N>`과 `<Audio N>` 번호는 서로 짝을 뜻하지 않는다 | [PG] | 공식 |
| 구조화 라벨 | `<Subject N>`, `<Picture N>`, `<Video N>`, `<Audio N>`; 화자 ID `(S1)`; 대사 `<d>[Korean] …</d>` | [PG][PGB] | 공식(Context-IR 출력·오픈 웨이트 형식) |
| `@Image1` 형식 | 공식 문서에 없음. fal 문서도 "Image 1"처럼 띄어 쓴 평문 | [C][fal-api] | 공식(부재)/2차 |

구조화 라벨은 H3-Context-IR가 내놓는 "rewrite output" 형식을 설명하는 가이드에 있다. 호스팅 `/v2/video_generation`이 이 라벨을 그대로 받아 더 잘 따르는지는 문서에 없다. 미확인

## 5. 오디오

| 항목 | 내용 | 출처 | 표시 |
|---|---|---|---|
| 네이티브 오디오 | 목소리·효과음·음악을 분리하지 않고 함께 모델링한 스테레오 | [B][HF] | 공식 |
| 참조 오디오 용도 | 신호 복사, 배경음악 스타일, **화자 음색과 전달 방식**, 원본의 대사·가사·효과음 재사용, 박자·리듬·연속성 | [PG] | 공식 |
| 복사와 참조의 구분 | `fully_copy`(원본을 최종 오디오 트랙으로 1:1 사용), `partially_copy`, `reference`(음색·리듬만), `weak_reference` | [PG] | 공식 |
| 화자 바인딩 | `<Audio 1> is the voice-timbre reference for <Subject 1> (S1).` | [PG] | 공식 |
| 음색만 참조할 때 | 참조 오디오의 원래 대사는 결과로 옮기지 않는다 | [PG] | 공식 |
| 보이스오버 | "says in an off-screen voiceover" 뒤에 입이 닫혀 있다고 명시 | [PGB] | 공식 |
| 립싱크 정확도 | 수치나 보증 없음 | — | 미확인 |
| 여러 생성 사이 목소리 일관성 | 공식 주장 없음. reAPI도 "증명된 능력 없음"이라고 적음 | [reapi] | 미확인 |
| 지정 사운드트랙 고정 | 공식 API에는 별도 필드 없음. fal H3 Max에 `target_audio_url`(참조 오디오와 병용 불가, 영상 길이에 맞춰 자르거나 채움)이 있음 | [fal-api] | 2차 |
| 한국어 대사 | 모델 카드가 안정 지원 11개 언어에 한국어를 포함. HF 메타데이터 `language` 태그에는 ko가 없음 | [HF] | 공식 |
| 참조 오디오 과금 | 무료. 조회 응답 `usage.input_audio_seconds`에 길이만 기록 | [P][Q] | 공식 |

## 6. 작업 수명주기와 응답

### 6.1 생성 응답

```json
{ "task_id": "424010985738629" }
```

[C] 공식

### 6.2 조회 응답 `VideoTask`

| 필드 | 타입 | 설명 | 출처 | 표시 |
|---|---|---|---|---|
| `id` | string | 작업 ID | [Q] | 공식 |
| `model` | string | 모델 이름 | [Q] | 공식 |
| `status` | enum | `queued`, `running`, `succeeded`, `failed`, `cancelled` | [Q] | 공식 |
| `error` | object | 실패 시 `code`(string), `message` | [Q] | 공식 |
| `created_at`, `updated_at` | integer | Unix 초 | [Q] | 공식 |
| `content.url` | string | 시간 제한 다운로드 URL. 만료 후 다시 조회하면 새 URL | [Q] | 공식 |
| `content.prompt` | string | Context-IR 작업일 때만 강화 프롬프트 | [Q] | 공식 |
| `resolution`, `duration`, `ratio` | — | 실제 출력값. `ratio`는 빈 문자열일 수 있음 | [Q] | 공식 |
| `task_type` | enum | `generation`, `h3_context_ir`, `regeneration` | [Q] | 공식 |
| `modality` | enum | `video` 또는 `text` | [Q] | 공식 |
| `usage.total_seconds` | integer | 입력 초 + 출력 초 | [Q] | 공식 |
| `usage.input_seconds` | integer | 참조 영상 초 | [Q] | 공식 |
| `usage.output_seconds` | integer | 출력 영상 초 | [Q] | 공식 |
| `usage.input_image_count` | integer | 첫 + 끝 + 참조 이미지 합계 | [Q] | 공식 |
| `usage.input_audio_seconds` | integer | 참조 오디오 초 합계(반올림). 없으면 생략 | [Q] | 공식 |
| `usage.total_tokens` / `prompt_tokens` / `completion_tokens` | integer | 영상 작업은 초·장 수를 환산한 값 | [Q] | 공식 |

성공 예시 [C] 공식:

```json
{
  "task": {
    "id": "424010985738629",
    "model": "MiniMax-H3",
    "status": "succeeded",
    "created_at": 1785125529,
    "updated_at": 1785125946,
    "content": { "url": "https://your-cdn.example.com/output.mp4" },
    "resolution": "2K",
    "duration": 5,
    "usage": { "total_seconds": 5, "input_seconds": 0, "output_seconds": 5, "input_image_count": 0 },
    "ratio": "16:9",
    "task_type": "generation",
    "modality": "video"
  }
}
```

### 6.3 조회·목록·취소 규칙

| 항목 | 내용 | 출처 | 표시 |
|---|---|---|---|
| 조회 기간 | 최근 7일 `[T-7d, T)`. 밖이면 `invalid task_id` | [Q] | 공식 |
| 권장 폴링 간격 | 10초 | [G] | 공식 |
| 다운로드 URL 만료 시간 | 수치 없음 | [Q] | 미확인 |
| 목록 필터 | `filter.status`, `filter.task_ids`(복수), `filter.model`, `filter.task_type`; 응답 `items[]`, `total` | [L] | 공식 |
| 취소·삭제 | `queued`면 취소(`action:"cancelled"`), `succeeded`/`failed`면 기록 삭제(`"deleted"`), `running`/`cancelled`면 오류 | [D] | 공식 |
| 실행 중 작업 취소 | 불가 | [D] | 공식 |

### 6.4 콜백

`callback_url`을 주면 먼저 `challenge` 필드가 담긴 검증 요청이 온다. 3초 안에 같은 값을 돌려줘야 한다. 이후 상태가 바뀔 때마다 조회 응답과 같은 본문을 POST한다. [C] 공식

### 6.5 오류

본문은 OpenAI 형식이다. `message` 끝 괄호에 내부 코드가 붙는다. [C] 공식

```json
{ "type": "error",
  "error": { "type": "bad_request_error", "message": "invalid params, content must include a non-empty text item (prompt is required) (2013)", "http_code": "400" },
  "request_id": "021785229015510a2c883cf675b9804d" }
```

| HTTP | `error.type` | 대표 코드 | 출처 | 표시 |
|---|---|---|---|---|
| 400 | `bad_request_error` | 2013 잘못된 파라미터 | [C][E] | 공식 |
| 401 | `authorized_error` | 1004 | [C][E] | 공식 |
| 402 | `insufficient_balance_error` | 1008 | [C][E] | 공식 |
| 422 | `unprocessable_entity_error` | 1026 입력 민감 콘텐츠 | [C][E] | 공식 |
| 429 | `rate_limit_error` | 1002 | [C][E] | 공식 |
| 500 | `server_error` | 1000 | [C][E] | 공식 |
| 529 | `overloaded_error` | — | [C] | 공식 |

영상에 해당할 만한 전역 코드: 1027 출력 민감 콘텐츠, 1040 입력 오디오 민감, 1045 동시 작업 한도 초과, 1046 신원 정책으로 프롬프트 거부, 2064 클러스터 고부하. [E] 공식. 이 코드들이 V2 영상 API에서 실제로 나오는지는 문서마다 따로 적혀 있지 않다. 미확인

## 7. 부가 엔드포인트

### 7.1 H3-Context-IR `POST /v2/h3_context_ir`

입력을 해석해 구조화된 강화 프롬프트만 돌려준다. 영상은 만들지 않는다. 구현은 공개하지 않았다. [IR][HF] 공식

| 필드 | 필수 | 내용 | 출처 | 표시 |
|---|---|---|---|---|
| `model` | 예 | `MiniMax-H3`만 | [IR] | 공식 |
| `content` | 예 | 생성 요청과 같은 규칙·제한 | [IR] | 공식 |
| `duration` | 예 | 4–15 | [IR] | 공식 |
| `ratio` | 아니오 | 생성 요청과 같은 규칙 | [IR] | 공식 |
| `callback_url` | 아니오 | 같은 콜백 규칙 | [IR] | 공식 |

결과는 `content.prompt`에 들어온다. 참조 예시에서는 `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music` 순서다. 모델 카드는 "최종 품질에 결정적이니 파이프라인에 넣기를 강하게 권한다"고 적었다. [HF][PG] 공식

호스팅 `/v2/video_generation`이 내부에서 Context-IR를 자동으로 돌리는지는 문서에 없다. 정황은 두 가지다. 재생성 요청은 "Context-IR 이전 원문이 아니라 모델에 실제로 보낸 최종 프롬프트"를 요구하고 그 `text` 한도가 40,000자다. 생성 요청의 한도는 7,000자다. 미확인

### 7.2 재생성 `POST /v2/video_regeneration`

768P H3 결과를 2K로 다시 만든다. `MiniMax-H3`만 지원한다. 입력 방식은 둘 중 정확히 하나다. [R] 공식

| 필드 | 필수 | 내용 | 출처 | 표시 |
|---|---|---|---|---|
| `model` | 예 | `MiniMax-H3` | [R] | 공식 |
| `resolution` | 예 | `2K`만 | [R] | 공식 |
| `source_task_id` | 방식 A | 7일 안의 본인 소유 성공 작업. **화이트리스트 필요** | [R] | 공식 |
| `content` | 방식 B | 원래 입력 전부 + `video_url`·`role:"base_video"` 정확히 1개. `text`는 최대 40,000자 | [R] | 공식 |
| `callback_url` | 아니오 | 같은 콜백 규칙 | [R] | 공식 |
| `aigc_watermark` | 아니오 | 기본 `false` | [R] | 공식 |

`base_video` 규격: 오디오 트랙 필수, 24fps, 가로·세로 32 배수, 면적 589,824–1,032,192px, 107–362프레임(17 단위). [R] 공식

## 8. 가격 (공식 가격표 [P])

### 8.1 초당 단가 (USD)

| 모델 | 출력 해상도 | 출력 영상/초 | 입력 영상/초 | 추가 이미지/장 | 무료 이미지 | 표시 |
|---|---|---:|---:|---:|---:|---|
| `MiniMax-H3` | 2K | 0.13 | 0.13 | 0.04 | 5 | 공식 |
| `MiniMax-H3` | 768P | 0.08 | 0.08 | 0.04 | 5 | 공식 |
| `MiniMax-H3-Highspeed` | 768P | 0.06 | 0.06 | 0.03 | 5 | 공식 |
| `MiniMax-H3-Highspeed` | 480P | 0.04 | 0.04 | 0.03 | 5 | 공식 |
| `MiniMax-H3-Lite` | 768P | 0.04 | 0.04 | 0.02 | 5 | 공식 |
| `MiniMax-H3-Lite` | 480P | 0.025 | 0.025 | 0.02 | 5 | 공식 |
| `MiniMax-H3-Max` | 768P | 0.08 | **0.143** | **0.074** | **2** | 공식 |
| `MiniMax-H3-Max` | 480P | 0.05 | 0.0553 | 0.074 | 2 | 공식 |
| `MiniMax-H3-Regeneration` | 768P→2K | 0.05 | 0.05 | 0.025 | 5 | 공식 |
| `MiniMax-H3-Context-IR` | — | 입력 $0.90/백만 토큰 | 출력 $3.60/백만 토큰 | — | — | 공식 |

과금 규칙 [P] 공식:

- 같은 모델·해상도면 T2V·I2V·FL2V·참조 모두 같은 단가.
- 이미지 단가는 이미지 해상도나 출력 해상도와 무관.
- 입력 영상은 입력 길이에 선택한 출력 해상도 단가를 곱한다.
- 오디오 입력은 무료.
- 재생성은 원래 작업과 별도로 과금하고 원래 입력 소재도 다시 과금한다.

### 8.2 계산 예

| 경우 | 계산 | 금액 |
|---|---|---:|
| H3 768P 8초, 참조 이미지 4장 + 오디오 1개 | 8 × 0.08 | $0.64 |
| H3 Max 768P 8초, 같은 입력 | 8 × 0.08 + (4−2) × 0.074 | $0.788 |
| H3 768P 8초 + 참조 영상 5초 | (8+5) × 0.08 | $1.04 |
| H3 768P 5초 생성 후 2K 재생성 | 5 × 0.08 + 5 × 0.05 | $0.65 |
| Context-IR 참조 예시 1회 (입력 33,323 / 출력 5,976 토큰, [HF] 예시) | 0.0333 × 0.90 + 0.0060 × 3.60 | 약 $0.05 |

### 8.3 서로 다른 가격 수치의 출처

| 수치 | 출처와 맥락 | 표시 |
|---|---|---|
| 768P $0.08, 2K $0.13 | 현재 공식 가격표 | 공식 [P] |
| 768P $0.09 | 출시 다음 날(2026-08-01) 커뮤니티 글·reAPI 글. 커뮤니티 글은 "768p closed beta"라고 적음 | 2차 [hfblog][reapi] |
| 768P $0.04, 2K $0.065 | kie.ai 크레딧 가격. "공식가의 50%"라고 표기 | 2차 [kie] |
| 768P $0.04, 480P $0.025 | fal H3 Max 출시 할인가(2026-09-01까지) | 2차 [orca] |
| Pixazo R2V 768P $0.12, 1080P $0.20 | Pixazo 자체 H3 Max 게이트웨이 가격 | 2차 [pixazo] |
| $0.113/초 | 이번 조사 자료 어디에서도 찾지 못함 | 미확인 |

## 9. 사용 한도

| 항목 | 값 | 출처 | 표시 |
|---|---|---|---|
| Video Generation V2 `MiniMax-H3` | 300 RPM, 동시 실행 30건 | [RL] | 공식 |
| Highspeed·Lite·Max 한도 | 표에 따로 없음 | [RL] | 미확인 |
| 동시 실행 초과 오류 | 1045 `rate limit exceeded(task concurrency)` | [E] | 공식 |
| 한도 상향 | `api@minimax.io` 문의 | [RL] | 공식 |
| 생성 소요 시간 | 공식 수치 없음. 공식 예시는 2K 5초가 약 7분(`created_at`→`updated_at` 417초) | [C] | 공식(예시값) |

## 10. 콘텐츠 정책

| 항목 | 내용 | 출처 | 표시 |
|---|---|---|---|
| 자동 검열 | 텍스트·이미지·영상 입력과 강화 프롬프트를 자동 검사. 불법·음란·제3자 권리 침해 의심 콘텐츠 차단 | [HF] | 공식 |
| 실존 인물 얼굴 | Seedance처럼 "실존 인물 얼굴 거부"를 명시한 문구는 없음. 1046 "identity policy" 오류는 프롬프트의 신원 주장을 거부 | [E] | 미확인 |
| 사칭 | 라이선스 AUP 13: 동의 없는 사칭 금지 | [LIC] | 공식 |
| AI 생성 표시 | AUP 12: 공개 환경에 게시할 때 기계 생성임을 명확히 밝힐 것 | [LIC] | 공식 |
| 미성년자 | AUP 6 금지. API 쪽 미성년자 보호 장치를 운영한다고 밝힘 | [LIC][LQA] | 공식 |
| 목소리 복제 동의 | 공식 문구 없음. 커뮤니티 글이 동의를 권고 | [hfblog] | 2차 |

AUP는 오픈 웨이트 라이선스의 부속서다. "Output"을 Hosted Services 결과까지 포함해 정의하지만 API 이용 약관 자체는 이번에 읽지 않았다. 미확인

## 11. 오픈 웨이트와 라이선스

| 항목 | 내용 | 출처 | 표시 |
|---|---|---|---|
| 저장소 | `huggingface.co/MiniMaxAI/MiniMax-H3` (gated 아님, 2026-11-09 갱신) | [HF] | 공식 |
| 공개 범위 | H3-Base 두 체크포인트: `FL2VA`(T2VA·첫·끝 프레임), `Ref2VA`(참조). CFG 증류 BF16 | [HF] | 공식 |
| 비공개 | H3-Context-IR(호스팅 전용), H3-Regenerate-2K(준비되면 공개 예정), sparse attention 구현 | [HF] | 공식 |
| 구조 | 33B dense single-stream Omni Transformer(약 13B가 AdaLN 분기). 텍스트 인코더는 Qwen3-VL-32B 50번째 층 | [HF] | 공식 |
| 서빙 | SGLang, vLLM, diffusers, ComfyUI 레시피. 예시는 GPU 4장 | [HF] | 공식 |
| 라이선스 | MiniMax H3 Community License Agreement, 라이선스 일자 2026-08-02. OSI 오픈소스 아님 | [LIC] | 공식 |
| 지역 제한 | Excluded Territories: **EU, 영국, 대한민국, 미국**. 이 지역에서는 사용·복제·배포·출력 사용이 라이선스 밖 | [LIC] | 공식 |
| 제한 지역 예외 | 별도 신청서로 허가를 받을 수 있음 | [LQA][HF] | 공식 |
| 상업 조건 | 연매출 2천만 달러 초과 시 사전 서면 승인. 상업 UI에 "MiniMax H3" 표시. 출력으로 다른 AI 모델 개선 금지 | [LIC] | 공식 |
| API와의 관계 | API는 전 세계 제공, 오픈 웨이트만 일시 제한 | [LQA] | 공식 |

이 저장소의 로컬 어댑터 `fasth3_omni_reference`는 같은 라이선스를 따르는 FastH3 Omni 변환본을 쓴다고 [docs/fasth3-omni.md](../../fasth3-omni.md)에 적혀 있다. 국내 사용이 지역 조항과 맞는지 검토가 필요하다. 법률 판단은 이 문서의 범위 밖이다.

## 12. social-flow 어댑터 관점

### 들어갈 레인

`reference` 레인이다. 공식 API에서 목소리는 `reference_audio` 샘플과 프롬프트 문장으로 정한다. TTS 트랙을 그대로 영상의 소리로 쓰는 `supplied` 레인은 공식 필드가 없다. 참조 가이드의 `fully_copy`(참조 오디오를 최종 트랙으로 1:1 사용)를 프롬프트로 요청하면 비슷한 효과가 날 수 있지만 검증한 자료가 없다. 미확인

### Seedance 참조 어댑터와 대응

`seedanceReferenceSchema`(`server/src/seedance-client.ts`)의 필드를 그대로 옮기면 다음과 같다.

| social-flow 입력 | H3 `content[]` | 비고 |
|---|---|---|
| `prompt` | `{type:"text", text}` | 7,000자 한도 |
| `referenceImagePaths[]` | `{type:"image_url", role:"reference_image"}` × ≤ 9 | 로컬 파일은 업로드 후 `mm_file://` 또는 data URI |
| `referenceVideoPaths[]`/`Urls[]` | `{type:"video_url", role:"reference_video"}` × ≤ 3 | 합계 15초, 입력 초만큼 과금 |
| `referenceAudioPaths[]` | `{type:"audio_url", role:"reference_audio"}` × ≤ 3 | 클립당 2초 이상, 합계 15초 |
| `ratio` | `ratio` | `adaptive` 기본. Lite는 구체 비율 필수 |
| `resolution`/`duration` | 같은 이름 | `duration`은 정수 |
| 화자 바인딩 | 별도 필드 없음 | Seedance의 `Image N`/`Audio N`처럼 프롬프트 문장으로만 묶음 |

MSR 기본 참조(한 캐릭터당 얼굴·앞·뒤 패널 3장)는 H3에서 무료 이미지 5장 안에 들어간다. 두 캐릭터면 얼굴·앞 4장이라 역시 무료다. Max는 2장 초과분마다 $0.074가 붙는다.

### 맞지 않는 곳

1. **시작 이미지와 목소리 샘플을 함께 보낼 수 없다.** `first_frame`과 `reference_*`는 상호 배타다. MSR은 시작 이미지를 배경 슬롯에 싣고 목소리 샘플을 함께 보낸다. H3에서는 시작 이미지를 `reference_image`로 넣고 프롬프트에 "the shot begins from Picture N"처럼 적어야 한다. 첫 프레임 일치를 보장하지 않는다. [C][PG]
2. **최소 길이가 4초(Max 5초)다.** 짧은 대사 한 줄짜리 컷은 영상이 대사보다 길어진다. CLAUDE.md의 "Silence around native lines" 방향과 부딪히고 `speechFit` 경고가 자주 날 것이다.
3. **목소리 샘플은 클립당 2초 이상, 합계 15초 이하, 최대 3개다.** 세 인물의 샘플을 각 5초씩 넣으면 한도가 찬다.
4. **프롬프트 언어 규칙과 충돌한다.** H3 가이드는 대사를 `<d>[Korean] …</d>`로 감싼다. 플러그인의 `video_prompt_language`는 따옴표 밖의 비라틴 문자를 거부한다. 대사를 따옴표로 쓰거나 검사기가 `<d>` 블록을 인정해야 한다.
5. **`seed`가 없다.** 같은 계획 재실행의 재현성을 기대할 수 없다.
6. **로컬 경로를 그대로 보낼 수 없다.** 업로드(`/v1/files/upload`, 7일 유효) 또는 data URI(본문 64 MB 한도)가 필요하다. 업로드 결과의 7일 만료를 영수증에 남겨야 재시도 때 재업로드 여부를 판단할 수 있다.
7. **재제출 위험.** 실행 중인 작업은 취소할 수 없다. 조회 기간이 7일이라 그 뒤에는 작업 상태를 확인할 길이 없다. `task_id`를 제출 직후 원장에 적어 두어야 한다.
8. **Context-IR 여부를 정해야 한다.** 별도 호출이면 작업 하나가 늘고 토큰 비용이 붙는다. 호스팅 생성이 내부에서 돌리는지 확인 전까지는 선택 옵션으로 두는 편이 안전하다.
9. **2K는 H3 본 모델만 가능하다.** Max·Highspeed·Lite는 768P가 상한이다. 플러그인 LTX 기본(1792×1024)과 같은 크기는 없다.

## 확인하지 못한 것

- 호스팅 `/v2/video_generation`이 Context-IR를 내부에서 자동 적용하는지
- `<Subject N>`, `<Audio N>`, `(S1)`, `<d>[Korean]` 라벨을 생성 API 프롬프트에 직접 넣었을 때 효과
- 오디오만 단독 참조로 보낸 요청이 공식 API에서 거부되는지
- 같은 `reference_audio`로 여러 번 생성할 때 목소리가 얼마나 일관된지, 립싱크 정확도
- 한국어 대사의 실제 품질 (모델 카드의 "안정 지원" 외 근거 없음)
- `fully_copy` 방식으로 공급한 TTS 트랙이 그대로 보존되는지
- `MiniMax-H3-Max`와 fal의 "H3 Max by fal"이 같은 가중치인지, Max의 공식 출시일
- Highspeed·Lite·Max의 사용 한도(RPM, 동시 실행)
- 다운로드 URL 만료 시간
- 2K 출력의 실제 픽셀 크기
- 이전 출력의 `file_id`를 `mm_file://`로 재사용하는 방법 (V2 응답에 `file_id` 없음)
- 실존 인물 얼굴에 대한 명시적 정책, 1027·1040·1046 코드가 V2 영상에서 실제로 나오는지
- MiniMax API 이용 약관(오픈 웨이트 라이선스와 별개)의 지역·사용 조건
- 2차 자료에 나온 $0.113/초의 출처
- 중국 플랫폼(`api.minimaxi.com`) 가격표 (위안화 표기 여부 포함)

## 출처

열람일은 모두 2026-11-18이다.

| 키 | URL | 구분 |
|---|---|---|
| [C] | https://platform.minimax.io/docs/api-reference/video-generation-v2-create | 공식 |
| [Q] | https://platform.minimax.io/docs/api-reference/video-generation-v2-query | 공식 |
| [L] | https://platform.minimax.io/docs/api-reference/video-generation-v2-list | 공식 |
| [D] | https://platform.minimax.io/docs/api-reference/video-generation-v2-delete | 공식 |
| [IR] | https://platform.minimax.io/docs/api-reference/video-generation-v2-h3-context-ir | 공식 |
| [R] | https://platform.minimax.io/docs/api-reference/video-generation-v2-regeneration | 공식 |
| [U] | https://platform.minimax.io/docs/api-reference/file-management-upload | 공식 |
| [G] | https://platform.minimax.io/docs/guides/video-generation | 공식 |
| [P] | https://platform.minimax.io/docs/pricing/overview | 공식 |
| [RL] | https://platform.minimax.io/docs/guides/rate-limits | 공식 |
| [E] | https://platform.minimax.io/docs/api-reference/errorcode | 공식 |
| [N] | https://platform.minimax.io/docs/release-notes/models | 공식 |
| [CN] | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create | 공식 |
| [B] | https://www.minimax.io/blog/minimax-h3 | 공식 |
| [HF] | https://huggingface.co/MiniMaxAI/MiniMax-H3 | 공식 |
| [LIC] | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE | 공식 |
| [LQA] | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/QA-about-License.md | 공식 |
| [PG] | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md | 공식 |
| [PGB] | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md | 공식 |
| [fal-blog] | https://blog.fal.ai/introducing-h3-max-by-fal/ | 2차 |
| [fal-api] | https://fal.ai/models/minimax/h3-max/reference-to-video/api | 2차 |
| [orca] | https://www.orcarouter.ai/blog/h3-max-fal-speed-debut | 2차 |
| [reapi] | https://reapi.ai/blog/hailuo-h3-minimax-h3-api-guide | 2차 |
| [kie] | https://kie.ai/minimax-h3 | 2차 |
| [pixazo] | https://www.pixazo.ai/models/minimax | 2차 |
| [hfblog] | https://huggingface.co/blog/ResterChed/minimax-h3-hailuo-3-0 | 2차 (커뮤니티 글) |
