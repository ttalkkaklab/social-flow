# MLX Core 연결과 플러그인 지원 범위

조사일: 2026-10-18 KST. MLX Core는 로컬 모델을 실행하는 앱이다. 이 문서는 공식 mlx-serve 문서와 social-flow 클라이언트를 대조했다. 모델 다운로드나 생성은 실행하지 않았다.

## API와 실제 전달값

서버 기본 주소는 `http://localhost:11234`다. `GET /health`, `GET /v1/models`로 상태와 모델 정보를 읽는다. 공식 서버는 `POST /v1/images/generations`와 OpenAI SDK 호환 multipart `POST /v1/images/edits`를 제공한다. [공식 HTTP API](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md)

social-flow는 생성과 편집 모두 `/v1/images/generations`에 JSON을 보낸다. 편집은 `mode:"edit"`, base64 `image`, 추가 `ref_images`를 사용한다. 생성에는 `imagePath`와 `strength`를 전달할 수 있다. 소스 경로는 플러그인이 읽어 base64로 변환한다. 모델을 지정하지 않으면 `image` capability가 있는 준비된 모델을 우선 선택한다. 앱을 자동으로 실행하지는 않는다. [클라이언트](../../../server/src/mlx-serve-client.ts)

플러그인 도구 호출 예시이며 실행하지 않은 요청이다. `model`에는 실제 `/v1/models`에서 확인한 ID를 넣는다.

```json
{
  "model": "MODEL_ID_FROM_V1_MODELS",
  "prompt": "Keep the person's face, pose and camera angle. Change only the jacket to dark green.",
  "imagePath": "/absolute/path/source.png",
  "refImagePaths": ["/absolute/path/jacket-reference.png"],
  "outputPath": "/absolute/path/output"
}
```

위 예시는 `mlx_image_edit` 인자다. HTTP API에 `imagePath`를 그대로 전송하는 예시가 아니다.

## 서버와 플러그인의 차이

| 기능 | 공식 서버 문서 | social-flow 클라이언트 |
|---|---|---|
| 모델 지정 | 설치한 모델 선택 | 임의 문자열 허용. 실행 시 조회·로드 |
| 이미지 편집 | multipart edits, 모델별 편집 기능 | generations JSON으로 편집 요청 |
| 추가 참조 | 모델별로 확인 | 추가 이미지 최대 3장 |
| 크기 | 모델별로 확인 | 각 변 256~2048, 16픽셀 배수 |
| 진행 스트림 | `stream:true` SSE | 공개 도구 인자 없음 |
| LoRA | `lora_paths`, `lora_scales`, 최대 8개 | 공개 도구 인자 없음 |
| Qwen-Image-2.1 투명도 | `transparent:true` | 공개 도구 인자 없음 |

서버 기능 출처: [공식 API](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md), [앱의 미디어 안내](https://github.com/ddalcu/mlx-serve/blob/main/docs/app.md). 플러그인 제한 출처: [스키마와 요청 생성 코드](../../../server/src/mlx-serve-client.ts).

Qwen의 투명도 옵션은 RGBA 프롬프트와 함께 사용한다. 현재 플러그인에는 옵션이 없으므로 서버의 지원 사실만으로 투명 PNG를 요청할 수 있다고 안내하면 안 된다. 공식 앱 문서는 FLUX.2-klein과 Mage-Flow Edit의 지시 기반 편집, Krea-2를 포함한 이미지 변형을 설명한다. 앱 안내의 포괄적인 지원 문구와 모델별 서버 검증이 다를 수 있으므로 각 모델 문서의 소스 대조 결과를 먼저 따른다. 범용 `image` capability만으로 모든 모델이 같은 편집 동작을 지원한다고 판단할 수 없다. [서버의 투명 PNG 계약](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md#qwen-image-transparent-png-output), [편집 안내](https://github.com/ddalcu/mlx-serve/blob/main/docs/app.md#image--video--music--speech--3d-generation)

## 사용 팁과 확인 순서

1. 모델 ID와 서버 버전을 기록한다. UI의 모델 표시명만 저장하지 않는다.
2. 단일 소스 편집을 먼저 확인한 뒤 추가 참조를 붙인다. 장면 변경 지시와 보존 지시를 분리한다.
3. 크기는 플러그인 스키마와 모델 제한을 모두 만족해야 한다. FLUX 전용 제한을 Krea나 Mage에 그대로 적용하지 않는다.
4. 로컬 추론에는 공급자 API 호출료가 없지만 다운로드, 메모리, 전력, 실행 시간이 필요하다. 장비·양자화·크기·스텝이 다른 속도 수치를 직접 비교하지 않는다.
5. 설정에서 선택한 모델이 실패하면 오류를 기록하고 대안을 선택한다. 다른 모델로 자동 교체하지 않는다.

1~3은 연결 구조에서 도출한 운용 제안이다. 4는 비용 분류 원칙이며 속도 실측을 뜻하지 않는다. 5는 [프로젝트 모델 선택 규칙](../../../skills/_shared/model-settings.md)이다.

## 조사 범위

이 폴더의 모델 문서는 저장소가 이름으로 언급한 FLUX.2-klein, Krea-2, Mage-Flow와 최신 서버 문서에서 확인한 Qwen-Image-2.1을 다룬다. 이는 설치된 모델의 완전한 목록이 아니다. 로컬 서버의 실제 모델 목록과 생성 성공 여부는 이번 조사에서 검증하지 않았다.
