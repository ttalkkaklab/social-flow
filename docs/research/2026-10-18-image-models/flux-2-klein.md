# FLUX.2 klein: 4B·9B·Base·KV 조사

확인일: 2026-10-18. 공식 BFL API 문서, Hugging Face 모델 카드, mflux와 mlx-serve 원문을 읽었다. 모델 다운로드·생성·속도 측정은 하지 않았다. 아래 요청은 모두 미실행 예시다.

FLUX.2 klein은 생성과 참조 이미지 편집을 함께 지원한다. **1024×1024 고정은 모델 자체 제약이 아니다.** social-flow에는 BFL API 전용 어댑터가 없으며 현재 연결 경로는 MLX Core의 `mlx_image_generate`와 `mlx_image_edit`다. mflux CLI의 FLUX.2 지원도 social-flow의 Z-Image 전용 `image_local_generate`와 구분해야 한다.

## 모델과 라이선스

| 변형 | 공식 Hugging Face ID (`black-forest-labs/` 아래) | 용도·기본 출발점 | 가중치 라이선스 |
| --- | --- | --- | --- |
| 4B distilled | `FLUX.2-klein-4B` | 빠른 생성·편집, 4 steps / guidance 1.0 | Apache 2.0 |
| 9B distilled | `FLUX.2-klein-9B` | 더 큰 생성·편집 모델, 4 steps | FLUX Non-Commercial |
| 4B Base | `FLUX.2-klein-base-4B` | 비증류 모델, 미세 조정·실험, 공식 예시 50 steps | Apache 2.0 |
| 9B Base | `FLUX.2-klein-base-9B` | 비증류 모델, 미세 조정·실험, 공식 예시 50 steps | FLUX Non-Commercial |
| 9B KV | `FLUX.2-klein-9b-kv` | 참조 이미지 attention KV를 재사용하는 편집 변형 | FLUX Non-Commercial |
| 9B KV FP8 | `FLUX.2-klein-9b-kv-fp8` | 공식 FP8 체크포인트 | FLUX Non-Commercial |

출처: [4B 카드](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [9B 카드](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B), [4B Base](https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B), [9B Base](https://huggingface.co/black-forest-labs/FLUX.2-klein-base-9B), [KV](https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-kv), [KV FP8](https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-kv-fp8).

9B의 무료 가중치 사용 범위와 출력물 이용 범위는 별개다. 현재 [9B 라이선스 v2.1](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/blob/main/LICENSE.md)은 비상업·비프로덕션 모델 사용을 허용하며 상업적 모델 운용에는 별도 허락을 요구한다. §2(d)는 조건에 따른 출력물의 상업적 이용을 허용하지만 이것이 유료 서비스용 추론 허가를 뜻하지 않는다. 경쟁 모델 학습용 출력 사용 제한도 있다. 상업적 로컬 운용은 [BFL 라이선스 안내](https://bfl.ai/licensing)의 해당 계약을 확인한다.

공식 4B 카드의 약 13GB VRAM 수치는 특정 추론 구성의 안내다. Mac 통합 메모리의 최소 용량이나 양자화 팩의 실제 점유량으로 그대로 환산하지 않는다. 같은 seed라도 엔진·양자화·정밀도가 바뀌면 동일 픽셀을 보장할 수 없다.

## BFL 공식 API

| 항목 | 확인 내용 |
| --- | --- |
| 주소 | `https://api.bfl.ai/v1/flux-2-klein-4b`, `/v1/flux-2-klein-9b` |
| 인증 | `x-key` 헤더 |
| 요청 | JSON `prompt`, `width`, `height`, `seed`, `output_format` |
| 참조 | `input_image`, `input_image_2`~`input_image_4`; 총 4장 |
| 결과 | 비동기 `id`, `polling_url`; 응답에 비용·입출력 MP가 포함될 수 있음 |
| 포맷 | `jpeg` 기본값, `png`, `webp` |
| 크기 | 공식 사용 가이드: 최소 64×64, 각 변 16배수, 최대 4MP |
| 추론 제어 | 공개 klein 요청 스키마에 steps·guidance·quantization 필드 없음 |
| 자동 프롬프트 확장 | klein은 지원하지 않음 |

근거: [4B OpenAPI 문서](https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bklein%5D-4b.md), [9B OpenAPI 문서](https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bklein%5D-9b.md), [공식 사용 가이드](https://help.bfl.ai/articles/7592221790-how-do-i-generate-quickly-with-flux-2-klein). `docs.bfl.ai/llms.txt`가 현재 `docs.bfl.ml` 문서를 가리킨다. 웹 도구에서 API Markdown 열기가 실패해 원문 HTTP GET으로 스키마를 확인했다.

공식 문서에는 `/v1/flux-2-klein-9b-preview`도 있다. 품질·속도 변경을 먼저 적용하는 경로이므로 고정된 제작 흐름은 stable endpoint를 기준으로 기록한다. [preview 문서](https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bklein%5D-9b-preview.md)

다음은 4B 생성 요청 본문 예시다. API 키를 넣어 보내지 않았으며 결과도 없다.

```json
{
  "prompt": "A small ceramic cup on a pale oak table. Soft morning light enters from the left. Eye-level product photograph, warm neutral colors, uncluttered background.",
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "output_format": "png"
}
```

참조 이미지의 URL·인코딩 형식은 [FLUX.2 편집 문서](https://docs.bfl.ml/flux_2/flux2_image_editing.md)를 따른다. 로컬 파일 경로 문자열을 원격 API가 직접 읽을 수 있다고 가정하지 않는다. API가 돌려준 `polling_url`을 사용하며 MLX의 동기 base64 응답과 혼용하지 않는다.

## 가격

조회 당시 BFL 가격표의 USD 금액이다. 세금·환율·계약 할인은 포함하지 않았다.

| API 모델 | 출력 첫 MP | 추가 출력 MP당 | 입력 참조 MP당 |
| --- | ---: | ---: | ---: |
| klein 4B | $0.014 | $0.001 | $0.001 |
| klein 9B | $0.015 | $0.002 | $0.002 |

공식 비용 안내는 MP 올림을 설명하며 1920×1080을 3MP로 계산한다. 따라서 폭·높이만 보고 기본 요금으로 고정하지 않는다. 요청별 `cost`와 실제 청구 내역을 함께 기록한다. [BFL 가격표](https://bfl.ai/pricing?category=flux.2), [MP 계산 안내](https://help.bfl.ai/articles/7986977817-what-are-the-costs-associated-with-using-your-models)

로컬 추론에는 위 API 건당 요금이 붙지 않는다. 장비·전기·저장 공간·실행 시간과 9B 상업 라이선스 비용은 별도다. 플러그인의 로컬 비용 `$0` 기록은 총소유비용이 0이라는 뜻이 아니다.

## mflux와 MLX Core의 실제 경로

mflux는 `mflux-generate-flux2`와 `mflux-generate-flux2-edit`를 제공한다. distilled 4B·9B·9B KV와 Base 변형을 문서화하며 `--steps`, `--seed`, 크기, 양자화를 지원한다. Base는 일반 편집에서 더 느리고 결과가 나쁠 수 있다는 프로젝트 안내가 있다. KV 캐시는 참조 이미지를 준 편집에서 작동한다. negative prompt는 지원하지 않는다. [mflux FLUX.2 구현 문서](https://github.com/mflux-community/mflux/blob/aebe26153d4b5c532d26658f2b7d7fe2ee744ef9/src/mflux/models/flux2/README.md)

아래 CLI는 사용법 참고용이며 **현재 플러그인의 내장 호출 명령이 아니다.** 설치된 mflux 버전과 모델 경로를 확인한 뒤 사용한다. 미보유 가중치는 CLI 실행 시 다운로드할 수 있다.

```bash
mflux-generate-flux2 \
  --model flux2-klein-4b \
  --prompt "A ceramic cup on an oak table, soft side lighting, eye-level product photograph." \
  --steps 4 --seed 42 --width 1024 --height 560 --quantize 8
```

양자화 값은 모델 로드 설정이다. social-flow의 `mlx_image_generate`·`mlx_image_edit`에는 요청별 quantization 인자가 없으므로 설치한 팩의 정밀도를 모델 ID와 함께 기록한다. BFL의 FP8 가중치와 MLX affine 8bit 변환은 같은 파일 형식이나 실행 경로가 아니다.

MLX Core는 기본 `http://localhost:11234`에서 `/v1/models`, `/v1/load-model`, `/v1/images/generations`, `/v1/images/edits`를 제공한다. 최신 서버는 OpenAI SDK multipart 편집도 지원하지만 social-flow는 생성·편집 모두 `/v1/images/generations`에 JSON을 보낸다. [mlx-serve API](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/docs/api.md), [앱 문서](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/docs/app.md)

현재 어댑터의 편집 본문은 `mode:"edit"`, 원본 `image`, 추가 `ref_images`, 선택적 `size`·`steps`·`seed`다. 모델 ID는 `/v1/models`에서 확인한 실제 ID를 쓴다. 원본과 추가 참조의 순서를 프롬프트에서도 일치시킨다. 최신 upstream 테스트는 원본 외 추가 참조 3장까지를 확인하며 4장을 추가하면 400을 기대한다. [플러그인 어댑터](../../../server/src/mlx-serve-client.ts), [upstream 편집 테스트](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/tests/test_image_gen.sh)

### 1024 고정 안내는 갱신 대상

`server/src/mlx-serve-client.ts`의 크기 검증 오류 문구는 FLUX.2-klein을 1024×1024 고정이라고 설명한다. 그러나 BFL API는 최대 4MP를 안내하고 mflux 공식 예시는 1024×560이다. 최신 mlx-serve의 `generateFromCondWithOpts`도 `height / 16`, `width / 16`으로 latent 격자를 계산한다. 따라서 모델 전체의 한계로 설명하면 틀린다. [mlx-serve FLUX 구현](https://github.com/ddalcu/mlx-serve/blob/64b6e53567ffd8b9c2f71bf752409242b572d34f/src/flux.zig)

확인한 upstream은 `64b6e53567ffd8b9c2f71bf752409242b572d34f`다. 사용자의 설치 버전에서 비정사각 출력을 실행하지는 않았으므로 구버전 backend 호환성까지 확인했다고 볼 수 없다. 오류 문구를 고칠 때 모델 제약과 설치 backend 제약을 분리하고 실제 출력 크기를 검증하는 편이 맞다. 이번 조사에서는 코드를 수정하지 않았다.

## 제작 팁과 미확인 항목

- 프롬프트는 주체·행동·배경·조명·카메라 위치를 자연문으로 쓴다. klein API에는 자동 확장이 없으므로 짧은 키워드만 주면 누락한 조건을 모델이 추측한다. 색상은 hex 코드로 지정할 수 있다. [BFL 가이드](https://help.bfl.ai/articles/7592221790-how-do-i-generate-quickly-with-flux-2-klein)
- 편집은 바꿀 요소와 유지할 얼굴·구도·조명을 구체적으로 적는다. 예: “첫 이미지의 컵 색을 두 번째 이미지의 청록색으로 바꾼다. 컵 모양, 카메라 위치, 그림자는 유지한다.” 이는 실행 결과가 없는 작성 예시다.
- distilled는 4 steps를 출발점으로 삼고 Base에 같은 설정을 복사하지 않는다. 더 많은 steps가 언제나 더 좋은 결과를 준다고 가정하지 않는다.
- 공식 카드는 글자가 왜곡될 수 있다고 명시한다. 한글 정확도, 캐릭터 일관성, 4B 대비 9B 품질 우위, Mac 실제 처리 시간은 이 조사에서 비교 실험하지 않았다. [4B 한계](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
- 최신 mflux에는 별도 계열인 FLUX 3 Image Klein도 등장한다. FLUX.2 모델 ID를 자동 교체할 근거는 아니며 social-flow와 설치된 MLX Core의 호환성은 별도 확인 대상이다. [mflux 모델 목록](https://github.com/mflux-community/mflux/blob/aebe26153d4b5c532d26658f2b7d7fe2ee744ef9/README.md)
