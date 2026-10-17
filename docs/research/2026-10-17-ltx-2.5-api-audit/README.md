# LTX-2.5 API와 ASTRA 도구 옵션 대조

기준일: 2026-10-17 KST

코드 기준: `b25423285988bfdf775ee7ea3f9e3d2f8bed050c`

현재 도구는 가능한 옵션을 모두 반영하지 않는다. 실서버는 **7개 모드**를 안내하지만
`astra_*` 생성 도구는 **6개 모드**만 지원한다. `ingredients` 모드와 `references` 입력이
빠졌고 기존 이미지 도구에도 `negativePrompt`, `numInferenceSteps`, `autoDuration`이 없다.
`hdr`는 서버가 허용하지만 클라이언트가 의도적으로 전송하지 않는다.

기존 6개 모드의 허용 필드 목록은 실서버 응답과 일치한다. 서버 계약을 잘못 옮긴 문제와
도구가 일부 옵션을 노출하지 않는 문제를 구분해야 한다. 필드 허용 여부는 확인했지만
`ingredients`의 참조 입력 형식이나 각 옵션의 렌더 품질까지 검증한 것은 아니다.

## API 범위

| 구분 | 인터페이스 | 대조 범위 |
|---|---|---|
| 공식 호스팅 LTX API | `https://api.ltx.io/v2/` | 공개 LTX-2.5 요청 필드와 모델별 지원 범위 |
| 자체 운영 ASTRA API | `https://video.astravision.co.kr/v1/jobs` | 현재 `astra_*` 도구가 호출하는 실제 서버 |
| 네이티브 LTX Python | `ltx-pipelines` | 서버를 확장할 때 참고할 별도 모델 실행 인터페이스 |

ASTRA의 `default`, `guided`, `fast`는 파이프라인 선택이다. 공식 API의
`ltx-2-5-fast`, `ltx-2-5-pro`와 대응한다고 볼 근거는 없다. `ASTRA_VIDEO_URL`도 같은 계약의
다른 서버 주소를 지정하는 설정이므로 공식 LTX 주소만 넣어서는 공급자를 바꿀 수 없다.
[설정 코드](../../../server/src/config.ts#L421)

로컬 `mlx_video_generate`는 또 다른 서버 계약을 쓴다. 설치와 제한값은
[MLX LTX 2.5 실행 문서](../../mlx-ltx-2.5.md)를 따른다.

## 실서버의 모드와 도구 지원

존재하지 않는 모드로 보낸 요청은 HTTP 400과 함께 아래 7개 이름을 반환했다.
각 모드에 알 수 없는 필드를 넣은 요청도 HTTP 400으로 거부되면서 허용 필드 전체를 안내했다.
[모드와 필드 검증 응답](evidence/live-contract.json)

| 실서버 모드 | 현재 도구 | 상태 |
|---|---|---|
| `generate` | `astra_text2video`, `astra_img2video`의 `tier: default` | 지원 |
| `guided` | 위 두 도구의 `tier: guided` | 이미지 도구의 옵션 일부 누락 |
| `guided_fast` | `astra_text2video`의 `tier: fast` | 텍스트 도구만 노출 |
| `keyframe` | `astra_keyframe_video` | 지원 |
| `audio2video` | `astra_audio2video` | 지원 |
| `ingredients` | 없음 | 모드와 `references` 입력 모두 누락 |
| `retake` | `astra_video_retake` | 지원 |

기존 [클라이언트의 모드 목록](../../../server/src/astra-video-client.ts#L69)에는
`ingredients`가 없다. 실서버가 안내한 이 모드의 필드는 다음과 같다.

```text
frame_rate, hdr, height, images, mode, num_frames,
prompt, references, seed, width
```

`references`의 원소 형식, 지원 참조 유형, 개수 제한은 아직 확인되지 않았다. 표준 문서 경로인
`/openapi.json`, `/v1/openapi.json`, `/docs`는 인증된 GET 요청에서도 404를 반환했다.
빈 프롬프트로 보낸 참조 형식 검증 요청은 프롬프트 검사에서 거부돼 참조의 내부 형식까지
판별할 수 없었다. 새 도구를 설계할 때는 서버의 입력 계약부터 확보해야 한다.

## 확인된 옵션 누락

| 옵션 | ASTRA 계약 | 현재 도구와 전송 코드 | 보완 조건 |
|---|---|---|---|
| `references` | `ingredients`가 허용 | 도구, 핸들러, 모드별 목록과 직렬화 경로 없음 | 참조 입력 계약 확보 후 모드와 전용 도구 추가 |
| `negative_prompt` | `guided`가 허용 | `astra_img2video`에 `negativePrompt` 없음 | `guided`에서만 허용하도록 입력과 검증 추가 |
| `num_inference_steps` | `guided`가 허용 | `astra_img2video`에 `numInferenceSteps` 없음 | 모드별 검증과 전송 추가 |
| `auto_duration` | 이미지에 쓰는 `generate`, `guided`가 허용 | 텍스트 도구만 `autoDuration` 노출 | 이미지 도구의 길이 선택과 끝 프레임 충돌 규칙 확인 |
| `hdr` | 7개 모드 모두 필드를 허용 | 기존 생성 도구 모두 입력이 없고 본문 조립 코드도 전송하지 않음 | 서버가 기대하는 자료형, 색 공간과 실제 HDR 출력 확인 |

근거는 [이미지 도구 스키마](../../../server/src/astra-video-client.ts#L352),
[MCP 입력 정의](../../../server/src/tools.ts#L2129),
[본문 조립 코드](../../../server/src/astra-video-client.ts#L590)와 실서버 검증 응답이다.

`hdr` 제외는 의도된 동작이다. 코드 주석과
[계약 검사](../../../server/test/astra-video-client.test.mjs#L111)가 이를 고정한다.
허용 필드 목록에 이름이 있다는 사실만으로 `hdr: true`가 올바른 요청이라고 가정하거나
현재 출력이 HDR이라고 주장해서는 안 된다.

이미지별 옵션에도 차이가 있다. 키프레임 도구는 이미지마다 `strength`, `crf`를 받지만
일반 이미지 도구는 첫 프레임과 끝 프레임이 하나의 `strength`를 공유하고 `crf`를 받지 않는다.
오디오 도구도 시작 이미지 한 장의 `strength`만 노출한다.
[이미지와 키프레임 처리](../../../server/src/astra-video-client.ts#L958),
[오디오 조건 이미지 처리](../../../server/src/astra-video-client.ts#L981)

## ASTRA 필드 전체의 노출 상태

아래 표는 7개 모드의 최상위 필드 전체와 이미지 내부 필드를 함께 대조한다.
모드별 정확한 허용 목록은 [JSON 근거](evidence/live-contract.json)에 있다.

| 서버 필드 | 도구의 대응 |
|---|---|
| `mode` | `tier`나 도구 이름으로 결정. `ingredients` 선택 경로 없음 |
| `prompt` | 기존 생성 도구 모두 노출 |
| `seed` | 기존 생성 도구 모두 노출 |
| `width`, `height` | `retake`를 제외한 기존 생성 도구에서 노출. `retake`는 원본 크기 사용 |
| `num_frames` | `numFrames`로 노출. 모드별 상한 적용 |
| `frame_rate` | `frameRate`로 노출. `retake`는 원본 시간축 사용 |
| `images` | 이미지 도구의 첫·끝 이미지, 키프레임 도구의 2~8장, 오디오 도구의 시작 이미지 |
| `references` | `ingredients`와 함께 누락 |
| `hdr` | 전송하지 않도록 고정 |
| `lora` | 텍스트·이미지의 `default`에서 두 서버 프리셋만 노출 |
| `auto_duration` | 텍스트 도구만 노출 |
| `num_generated_keyframes` | 텍스트·이미지 도구에 `numGeneratedKeyframes` 노출 |
| `negative_prompt` | 텍스트 `guided/fast`, 키프레임, 오디오 도구에서 노출. 이미지 `guided`에 누락 |
| `num_inference_steps` | 위와 동일하게 이미지 `guided`에 누락 |
| `audio_upload_id` | 오디오 파일 자동 업로드 또는 기존 `audioUploadId` 사용 |
| `audio_start_time`, `audio_max_duration` | `audioStartTime`, `audioMaxDuration`으로 노출 |
| `video_upload_id` | `sourceVideoPath`를 자동 업로드해 생성 |
| `start_time`, `end_time` | `retake`의 `startTime`, `endTime`으로 노출 |
| `images[].upload_id`, `images[].frame_idx` | 도구가 업로드와 인덱스를 구성. 키프레임 도구는 인덱스를 직접 받음 |
| `images[].strength` | 이미지 도구는 공통값, 키프레임은 이미지별 값, 오디오는 시작 이미지 값 |
| `images[].crf` | 키프레임 도구만 노출 |

`ingredients`의 공통 필드도 해당 모드를 호출하는 도구가 없으므로 사용할 수 없다.
다른 모드에 같은 이름의 필드가 노출돼 있다는 사실이 새 모드 지원을 뜻하지는 않는다.

## 공식 LTX-2.5 REST API와의 차이

공식 [텍스트 API](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-text-to-video),
[이미지 API](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-image-to-video),
[오디오 API](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video)에
문서화된 요청 필드는 합쳐서 10종이다. ASTRA에 없는 공식 필드를 현재 본문에 그대로 추가하면
서버가 거부한다. 이 차이를 해소하려면 ASTRA 서버를 확장하거나 공식 API용 클라이언트를 별도로 구현해야 한다.

| 공식 필드 | 현재 ASTRA 도구의 대응 |
|---|---|
| `prompt` | 지원. ASTRA는 2,000자 제한. 공식 텍스트·오디오 API는 5,000자 제한을 명시 |
| `model` | 공식 Fast/Pro 선택 없음. ASTRA의 `tier`와 별개 |
| `duration` | `numFrames`로 명시. 텍스트에는 범위형 자동 길이가 있지만 이미지에는 누락 |
| `resolution` | `width/height`로 명시하되 ASTRA의 픽셀 격자와 면적 제한 적용 |
| `fps` | `frameRate`로 지원. 공식 모델의 FPS 조합과는 다른 계약 |
| `generate_audio` | 공식 텍스트·이미지 API에 존재. ASTRA는 이 필드를 받지 않음 |
| `camera_motion` | ASTRA에 해당 필드 없음. 현재는 프롬프트로 지시 |
| `image_uri` | 로컬 이미지 파일을 ASTRA에 업로드하는 방식으로 대응 |
| `last_frame_uri` | 이미지 도구는 끝 이미지 지원. 오디오 도구는 시작 이미지만 받음 |
| `audio_uri` | 로컬 오디오 업로드 또는 기존 업로드 ID로 대응 |

공식 `camera_motion`은 `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`,
`jib_up`, `jib_down`, `static`, `focus_shift`의 8개 값을 받는다.
공식 자동 길이는 텍스트·이미지에서 `duration: null`로 요청하며 이미지의 끝 프레임과는 함께 쓸 수 없다.
[이미지 API 요청 필드](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-image-to-video)

공식 2.5 API는 모델과 해상도에 따라 최대 4K와 20초를 지원한다. 현재 ASTRA 클라이언트의
193프레임, 2,064,384픽셀 상한은 LTX-2.5 모델 전체의 한계와 구분해야 한다.
클라이언트의 숫자만 올려도 서버가 처리한다고 볼 근거는 없다.
[공식 모델별 지원표](https://docs.ltx.io/models/ltx-2-5/),
[ASTRA 클라이언트 제한값](../../../server/src/astra-video-client.ts#L78)

공식 호스팅 2.5는 `extend`, `retake`를 미지원으로 표시한다. ASTRA에는 `retake`가 있으므로
호스팅 API의 기능표만으로 자체 운영 모델의 기능을 판단할 수 없다. 네이티브 Python은
영상·음성별 guidance와 별도 파이프라인을 제공하며 호환되는 모델과 서버 구현이 필요하다.
[네이티브 Python API](https://docs.ltx.io/open-source-model/integration-tools/pytorch-api),
[워크플로와 모델 호환표](https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility)

## 자막 발생 원인으로 단정할 수 있는 범위

현재 ASTRA `generate`는 `negative_prompt`를 받지 않는다. `guided`는 받지만 이미지 도구가
이를 노출하지 않는다. 공식 호스팅 2.5의 세 생성 API에도 전용 자막 끄기 옵션이나
`negative_prompt`는 문서화돼 있지 않다.

따라서 이미지 `guided`의 옵션 누락을 고칠 이유는 충분하지만 그 누락이 자막의 원인이라거나
옵션을 추가하면 자막이 사라진다고 단정할 수는 없다. `generate`에 같은 인자를 추가하는
수정도 현재 ASTRA 계약과 맞지 않는다.

대사를 따옴표로 적고 언어를 지정하는 방식은
[공식 프롬프트 가이드](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide/)가
안내한다. 대사 표기 자체를 오류로 볼 수 없다. 로마자 대사와 영문 뜻을 함께 넣은 재시도도
자막을 억제하지 못했으며 시드와 길이까지 바뀌었으므로 원인을 분리한 비교 실험이 아니다.

자막 억제 효과는 같은 이미지, 대사, 시드, 크기와 길이를 유지하고 제어 조건만 바꿔 비교해야 한다.
크롭이나 자막 영역의 흐림 보정은 후처리 결과이며 모델이 자막 없이 생성했다는 증거가 아니다.

## 검증 결과와 한계

- 실서버 검증 요청 10개가 모두 HTTP 400으로 거부됐다. 새 영상 작업은 접수되지 않았다.
- 기존 6개 모드의 필드 목록은 저장소와 일치했다. 추가 `ingredients` 모드의 10개 필드도 확인했다.
- 설치된 플러그인의 `astra-video-client.js`, `tools.js`는 검토한 저장소의 dist 파일과 바이트가 같았다.
- 실제 핸들러는 미지원 최상위 인자를 오류로 거부한다. Zod 스키마만 따로 호출했을 때의
  미지원 값 제거 동작을 실제 도구의 동작으로 해석하면 안 된다.
  [핸들러 검증](../../../server/src/handlers.ts#L163)
- 아래 범위의 계약 검사 92개가 통과했다. 모의 생성 호출 묶음은 제외했다.

```sh
cd server
node --test --test-skip-pattern='mocked tool calls' --test-reporter=tap test/astra-video-client.test.mjs
```

기존 테스트의 `every mode the server has is in the allow-list table`은 6개 이름을 정답으로
고정한다. 검사 통과는 새 `ingredients` 모드 누락을 잡았다는 뜻이 아니다.
[기존 테스트](../../../server/test/astra-video-client.test.mjs#L62)

`ingredients` 참조의 내부 형식, `hdr` 자료형과 출력 색 공간, 보수적으로 제한한 이미지 모드,
더 큰 해상도와 프레임 수의 실제 렌더링은 추가 검증 대상이다.
[검토한 도구 입력과 핸들러 응답](evidence/tool-surface.json)

## 수정 순서

1. 서버의 `ingredients/references` 입력 계약을 확보하고 모드 목록, 클라이언트, 전용 도구와
   계약 검사를 추가한다. 참조 형식을 추측해 구현하지 않는다.
2. `astra_img2video`에 `negativePrompt`, `numInferenceSteps`를 추가하되 `guided`에서만 허용한다.
3. 이미지용 `autoDuration`을 추가하고 프레임 격자, 상한과 끝 프레임의 충돌을 검증한다.
4. `hdr`는 입력 형식과 출력 검증을 마친 뒤 노출 여부를 정한다.
5. `generate_audio`, `camera_motion`, 공식 Fast/Pro 선택은 ASTRA 서버 확장과 공식 API용
   별도 클라이언트 중 어느 계약을 구현할지 정한 뒤 추가한다.
6. 실서버의 모드와 옵션을 갱신하는 절차를 마련한다. 미지원 인자를 거부하는 기존 핸들러 검증은 유지한다.

## 근거 파일

| 파일 | 내용 |
|---|---|
| [live-contract.json](evidence/live-contract.json) | 실서버의 모드 열거, 7개 모드의 허용 필드, 참조 형식 검증의 한계 |
| [tool-surface.json](evidence/tool-surface.json) | 도구별 노출 필드, 코드 대조, 핸들러의 미지원 인자 거부, 계약 검사 결과 |

인증 헤더, 키, 업로드 ID, 개인 영상 경로와 생성 프롬프트는 근거 파일에 포함하지 않았다.
