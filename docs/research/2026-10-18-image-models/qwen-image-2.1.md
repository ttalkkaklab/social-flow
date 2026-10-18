# Qwen-Image-2.1: 원본·Turbo·호스팅 API

확인일: 2026-10-18. 공식 Qwen 문서와 모델 카드, Alibaba Cloud 문서, mlx-serve 소스를 대조했다. 모델 다운로드·생성·성능 측정은 하지 않았다. 예시는 모두 미실행이다.

**Qwen-Image-2.1은 최신 mlx-serve에서 생성·편집·RGBA 출력을 지원하지만 social-flow 연결은 조건부다.** 설치된 서버와 변환 팩의 호환성을 확인해야 하며 현재 플러그인은 `transparent`를 전달하지 않는다. 공개 가중치 라이선스도 Apache 2.0이 아닌 **Qwen Research License**이므로 상업적 로컬 제작 기본값으로 바로 배정할 수 없다.

## 모델 식별과 최신 변경

| 구분 | 정확한 ID | 확인한 기능·변경 |
| --- | --- | --- |
| 공개 원본 | `Qwen/Qwen-Image-2.1` | 2026-09-20 공개. 생성·편집, native RGBA, 참조 최대 10장 |
| 공개 Turbo | `Qwen/Qwen-Image-2.1-Turbo` | 2026-10-09 공개. 저장된 8-step schedule로 생성·편집 |
| 공식 호스팅 Pro | `qwen-image-2.1-pro` | Alibaba Cloud Model Studio API |
| 공식 호스팅 Turbo | `qwen-image-2.1-turbo` | Alibaba Cloud Model Studio API |

시각 생성부는 7B지만 전체 추론 구성이 7B로 끝나지는 않는다. 공식 아키텍처 설명은 Qwen3-VL 8B 인코더와 RGBA VAE도 포함한다. 따라서 “7B라서 작은 Mac에 들어간다”는 계산은 부정확하다. [Qwen 공식 저장소](https://github.com/QwenLM/Qwen-Image-2.1/blob/ab96caa944157ca28a4f36b695c3047549f48f98/README.md)

공개 체크포인트 이름을 호스팅 Pro의 별칭으로 사용하지 않는다. 모델 버전·추론 설정·요금은 경로마다 기록한다.

## 공개 모델의 생성 계약

공식 Diffusers 진입점은 `QwenImage21Pipeline`이다. 텍스트 생성과 `image`를 넣는 편집을 같은 pipeline으로 처리하며 다중 참조는 이미지 배열로 전달한다. 원본의 공식 기본값은 40 steps, 2048×2048이다. CPU offload 예시가 있지만 실제 Mac 최소 메모리나 소요 시간은 이번에 확인하지 않았다. [원본 모델 카드](https://huggingface.co/Qwen/Qwen-Image-2.1)

| 비율 | 공식 권장 크기 |
| --- | --- |
| 1:1 | 2048×2048 |
| 4:3 / 3:4 | 2400×1792 / 1792×2400 |
| 3:2 / 2:3 | 2528×1696 / 1696×2528 |
| 16:9 / 9:16 | 2752×1536 / 1536×2752 |

이 표는 권장 프리셋이며 모델의 절대 최대 크기 표가 아니다. [공식 비율 안내](https://huggingface.co/Qwen/Qwen-Image-2.1#supported-aspect-ratios)

Turbo는 체크포인트의 sampling sigmas를 자동 로드하며 기본 CFG는 1이다. **`num_inference_steps`만 바꿔서는 저장된 8-step schedule을 덮어쓰지 못한다.** 직접 `sigmas`를 넘기는 실험 경로는 있지만 공식 카드는 다른 schedule을 평가하지 않았다고 밝힌다. 최신 Diffusers의 pipeline-configured sampling sigmas 지원이 필요하다. [Turbo 모델 카드](https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo)

seed는 재현 실험의 입력이다. 모델 revision·엔진·정밀도·양자화·크기·참조 순서도 함께 기록해야 하며 서로 다른 실행 환경의 픽셀 일치까지 보장하지 않는다.

## 라이선스와 비용

원본과 Turbo의 가중치는 **Qwen Research License Agreement**를 따른다. `Non-Commercial`을 연구·평가 목적으로 정의하며 상업적 사용에는 별도 라이선스를 요구한다. 공식 연락처는 `model-business@notice.qwencloud.com`이다. 예전 Qwen 모델이나 실행 코드의 라이선스를 2.1 가중치에 대신 적용하면 안 된다. [원본 LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE), [Turbo LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo/blob/main/LICENSE)

로컬 실행에는 API 건당 요금이 없지만 장비·전기·저장 공간·시간과 별도 상업 라이선스 비용은 별개다. 호스팅은 서비스 약관과 계정 계약을 따르며 아래는 조회 당시 공식 USD 정가다. 세금·환율·프로모션은 제외했다.

| API | 싱가포르 International | 베이징·버지니아·프랑크푸르트·도쿄·홍콩 표기 가격 | 문서상 RPM |
| --- | ---: | ---: | ---: |
| Pro | $0.04/장 | $0.035333/장 | 20 |
| Turbo | $0.016/장 | $0.014133/장 | 120 |

근거: [Pro 모델 정보, 2026-10-14 갱신](https://www.alibabacloud.com/help/en/model-studio/qwen-image-2-1-pro), [Turbo 모델 정보, 2026-10-09 갱신](https://www.alibabacloud.com/help/en/model-studio/qwen-image-2-1-turbo). 계정별 한도와 실제 사용 가능한 리전은 호출 전에 다시 확인한다.

## 공식 호스팅 API와 로컬 HTTP 구분

공식 Model Studio 편집 가이드는 `input.messages` 안에 `role:"user"`, `content`의 이미지와 텍스트를 넣는 구조를 사용한다. 2.1 Pro·Turbo는 입력 최대 10장, 프롬프트에 따른 투명 출력, `negative_prompt` 미지원으로 명시돼 있다. 지역별 API 키와 workspace endpoint를 사용한다. [최신 편집 가이드](https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide)

현재 문서의 싱가포르 주소 형식은 다음과 같다.

```text
POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
Authorization: Bearer <DASHSCOPE_API_KEY>
```

공식 [Edit API reference](https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-api)는 열람 시 일부 표와 예시가 2.0 기준이었다. 그 문서의 1~3장 제한이나 `negative_prompt` 지원을 2.1에 옮기지 않았다. 2.1 전용 세부 크기·출력 개수·매개변수 조합은 실제 호출로 검증하지 않았다. 이 플러그인에는 Model Studio용 이미지 어댑터가 없으므로 API 키나 모델명만 설정해서 이 경로로 전환할 수 없다.

로컬 mlx-serve는 기본 `http://localhost:11234/v1/images/generations`를 사용한다. 생성은 `prompt`, `model`, `size`, `steps`, `seed`를 받고 편집은 `mode:"edit"`, `image`, `ref_images`를 더한다. 모델 ID는 `/v1/models`에서 실제 설치 팩의 ID를 확인한다. 공개 Hugging Face ID가 변환 팩 ID와 같다고 가정하지 않는다. [mlx-serve API](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/docs/api.md)

## MLX backend와 플러그인 사이의 차이

| 기능 | 최신 mlx-serve | 현재 social-flow |
| --- | --- | --- |
| Qwen 모델 로드 | 전용 Qwen-Image-2.1 엔진 | 범용 image 모델 선택; 설치 팩·서버에 의존 |
| 생성·편집 | 둘 다 구현 | 공통 JSON을 전달하지만 Qwen 실호출 미검증 |
| RGBA | `transparent:true`에서 VAE alpha 보존; 기본 false는 RGB | 옵션을 노출·전달하지 않음 |
| Turbo steps | 체크포인트 `sample_sigmas`를 우선 | 요청 steps를 전달하고 결과에 요청값을 기록 |
| 해상도 | Qwen의 가변 크기 처리 | 각 변 256~2048, 16배수; 생성 기본 1024×1024 |
| 양자화 | 설치·변환 팩과 backend가 결정 | 요청별 선택 인자 없음 |
| 참조 이미지 | 원본 포함 최대 10장, 서버 테스트 확인 | 추가 참조 최대 3장; 원본 포함 4장으로 제한 |
| mask·로컬 편집 제어 | 공식 모델의 표현 능력과 backend 요청 계약 확인 필요 | 별도 mask 필드 없음 |

근거: [Qwen 엔진](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/src/qwen_image.zig), [backend 테스트](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/tests/test_qwen_image_gen.sh), [플러그인 어댑터](../../../server/src/mlx-serve-client.ts).

원본 2K 정사각형은 플러그인 범위에 들어가지만 2752×1536 같은 공식 프리셋은 현재 스키마가 거절한다. 생성 기본값 1024도 모델 공식 기본값 2048과 다르다. Turbo에서 요청한 steps와 실제 실행한 steps가 다를 수 있으므로 로그와 서버 응답에 따른 기록이 필요하다.

RGBA 문제는 프롬프트만으로 해결되지 않는다. 현재 어댑터에는 `transparent`가 없고 최신 backend는 기본값에서 alpha를 버린다. 옵션을 노출한 뒤 PNG color type과 실제 alpha 분포를 검증해야 플러그인의 투명 이미지 지원을 확정할 수 있다. 이번 조사에서는 코드를 고치지 않았다.

## 미실행 예시와 제작 팁

다음은 **최신 mlx-serve에 직접 보낼 JSON 본문** 예시다. 현재 social-flow 도구에 그대로 넣는 예시가 아니다. `model`은 설치된 Qwen 팩의 실제 ID로 교체한다.

```json
{
  "model": "REPLACE_WITH_INSTALLED_QWEN_PACK_ID",
  "prompt": "This is an RGBA image with transparency. A small orange ceramic fox figurine. The image has alpha channel and the background is transparent.",
  "size": "1024x1024",
  "steps": 40,
  "seed": 42,
  "transparent": true
}
```

투명 프롬프트 형식은 [공식 RGBA 안내](https://github.com/QwenLM/Qwen-Image-2.1#transparent-image-generation-rgba)를 따랐다. Turbo 팩을 선택하면 저장된 8-step schedule을 사용하므로 위 `steps:40`이 실제 40회 실행을 뜻하지 않는다.

- 여러 참조를 넣을 때 인물·제품·배경의 역할을 번호와 함께 적는다. 이미지를 배열에 넣는 순서도 고정한다.
- 공식 모델이 참조 10장을 지원하더라도 높은 해상도에서 전부 처리할 메모리가 있다는 뜻은 아니다. 최신 backend 테스트도 과도한 참조·크기의 메모리 요청을 거절하는 경우를 다룬다. [Qwen backend 테스트](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/tests/test_qwen_image_gen.sh)
- 원본과 Turbo를 비교할 때 같은 steps 숫자를 강제하지 않는다. 각 체크포인트 권장 schedule에서 품질·시간·메모리를 함께 비교한다.
- 모델 카드의 한글 품질·인물 일관성·제품 보존 홍보를 실측 결과로 쓰지 않는다. 이번 조사에는 같은 입력의 비교 이미지나 성능 수치가 없다.
- 공개 모델의 prompt enhancer는 별도 구성이다. 설치·사용을 확인하지 않은 상태에서 플러그인이 프롬프트를 자동 확장한다고 설명하지 않는다. [공식 prompt rewrite 코드](https://github.com/QwenLM/Qwen-Image-2.1/tree/main/prompt_rewrite)

확인한 mlx-serve 소스는 `64b6e53567ffd8b9c2f71bf752409242b572d34f`다. 설치 버전·변환 팩 ID·공식 가중치 revision을 맞춘 후에만 해당 환경의 지원 여부를 확정할 수 있다.
