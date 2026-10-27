# Mage-Flow Turbo / Edit Turbo 조사

조사일: 2026-10-18. Microsoft의 원본 모델과 ddalcu의 MLX 변환팩, mlx-serve의 HTTP 구현을 구분했다. 모델 다운로드·생성·편집은 실행하지 않았다.

## 판단과 모델 ID

Mage-Flow는 4B급 이미지 모델이며 Turbo는 4스텝 생성·편집에 맞춘 변형이다. 플러그인에서는 **생성용과 편집용 모델을 명시해서 선택하는 편이 안전하다.** 공통 `image` 기능만으로 모델을 고르면 편집에 필요한 체크포인트를 선택한다고 보장할 수 없다. [Microsoft 프로젝트](https://microsoft.github.io/Mage/flow/), [플러그인 모델 선택](../../../server/src/mlx-serve-client.ts)

| 구분 | 정확한 저장소 ID | 역할 |
| --- | --- | --- |
| Microsoft 원본 | `microsoft/Mage-Flow-Turbo` | 텍스트→이미지 |
| Microsoft 원본 | `microsoft/Mage-Flow-Edit-Turbo` | 이미지·지시문으로 편집 |
| ddalcu 변환팩 | `ddalcu/Mage-Flow-Turbo-MLX-Serve-8bit` | mlx-serve용 생성 팩 |
| ddalcu 변환팩 | `ddalcu/Mage-Flow-Edit-Turbo-MLX-Serve-8bit` | mlx-serve용 편집 팩 |

원본 ID는 [Microsoft의 모델 목록](https://github.com/microsoft/Mage/blob/main/mage_flow/README.md#-model-zoo), 변환팩 ID는 [생성 팩](https://huggingface.co/ddalcu/Mage-Flow-Turbo-MLX-Serve-8bit)과 [편집 팩](https://huggingface.co/ddalcu/Mage-Flow-Edit-Turbo-MLX-Serve-8bit)에서 확인했다. 실제 HTTP `model` 값은 설치한 서버의 `/v1/models`가 반환하는 ID를 사용한다.

원본 Hugging Face 카드의 검색 결과는 확인했지만 본문과 raw README 요청은 401을 반환했다. 따라서 세부 조건은 실제 열람한 Microsoft GitHub README와 프로젝트 페이지로 교차 확인했다. 원본 가중치의 현재 다운로드 가능 여부는 검증하지 않았다. [원본 생성 카드](https://huggingface.co/microsoft/Mage-Flow-Turbo), [원본 편집 카드](https://huggingface.co/microsoft/Mage-Flow-Edit-Turbo)

## 원본 모델의 기능과 권장 설정

| 항목 | Microsoft 문서 기준 |
| --- | --- |
| 기본 구조 | Mage-VAE와 Native-Resolution MMDiT, 4B급 |
| Turbo 설정 | `steps=4`, `cfg=1.0` |
| 해상도 | 각 변 512~2048, 16픽셀 배수; 2048×512 같은 4:1 예시 포함 |
| 편집 입력 | 이미지 하나 또는 프롬프트별 이미지 목록; 다중 참조 합성 예시 제공 |
| 출력 | Python API의 `list[PIL.Image]` |
| 편집 크기 | `max_size`로 긴 변 지정; `heights`·`widths`로 출력 크기 지정 가능 |
| 참조 전처리 | `vl_cond_long_edge=384`는 VL 인코더 입력 조건. 최종 출력이 384픽셀이라는 뜻은 아님 |
| 시드 | 기본 42, 원본 Python API의 -1은 무작위 |
| negative prompt | `cfg > 1`일 때 적용; Turbo 기본 CFG 1과 혼동하지 않음 |

근거: [Microsoft Python API와 인자 표](https://github.com/microsoft/Mage/blob/main/mage_flow/README.md#python-api). Base·RL의 20~30스텝 설정을 Turbo에 그대로 복사하지 않는다. 공식 샘플에도 서로 다른 체크포인트의 예제가 함께 있으므로 모델 ID와 스텝을 같이 확인한다.

공식 성능 수치는 A100 한 대, 1024×1024에서 생성 0.59초·편집 1.02초, 최대 메모리 약 18~20GB다. 이는 Microsoft의 보고값이며 Apple Silicon의 8비트 MLX 팩 실측으로 옮겨 적을 수 없다. 영어·중국어 글자 예시는 있지만 한국어 정확도는 이번 조사에서 확인하지 못했다. [공식 성능·예시](https://microsoft.github.io/Mage/flow/)

## MLX 변환팩과 로컬 HTTP API

ddalcu 팩은 Microsoft 공식 배포본 자체가 아니다. DiT·텍스트 인코더의 일부 선형 계층을 8비트, 그룹 크기 64로 변환한다. VAE와 임베딩 등은 원래 정밀도로 유지하며 생성 전용 팩은 참조 이미지용 비전 계층도 제거한다. 팩 제작자의 품질 비교 문구는 독립 검증 결과가 아니다. [변환 스크립트](https://github.com/ddalcu/mlx-serve/blob/main/tests/convert_mageflow_weights.py)

Hugging Face 카드가 적은 가중치 크기는 생성 9.2GB·편집 9.7GB다. mlx-serve README는 8.5GB·9.1GB라고 적어 문서 사이에 차이가 있다. 다운로드 예상치는 실제 파일 목록을 기준으로 잡고 실행 메모리를 가중치 파일 크기와 동일하게 계산하지 않는다. [생성 팩](https://huggingface.co/ddalcu/Mage-Flow-Turbo-MLX-Serve-8bit), [편집 팩](https://huggingface.co/ddalcu/Mage-Flow-Edit-Turbo-MLX-Serve-8bit), [mlx-serve README](https://github.com/ddalcu/mlx-serve)

로컬 서버 기본 주소는 `http://localhost:11234`다. 생성은 `/v1/images/generations`로 요청한다. 편집은 같은 경로에 `mode:"edit"`를 지정하거나 `/v1/images/edits`에 OpenAI 형태 multipart를 보낸다. 다중 참조는 JSON의 `image`·`ref_images` 또는 multipart의 반복 `image[]`로 보낸다. [서버 API](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md), [Mage 편집 테스트](https://github.com/ddalcu/mlx-serve/blob/main/tests/test_mageflow_edit.sh)

서버 테스트에서 확인한 동작은 다음과 같다. 테스트 파일을 읽었으며 실제 서버에서 실행한 것은 아니다. [상류 테스트 코드](https://github.com/ddalcu/mlx-serve/blob/main/tests/test_mageflow_edit.sh)

- 편집 모델도 텍스트 생성 요청을 처리한다.
- 편집에서 크기를 생략하면 원본 크기를 따르며 2048 제한을 넘는 이미지는 비율을 유지해 줄인다.
- 편집의 명시적 `size`는 **픽셀 예산**으로 해석한다. 원본 비율을 유지하므로 요청 문자열과 결과 크기가 달라질 수 있다.
- 추가 참조를 받으며 잘못된 이미지 데이터에는 400을 반환한다.
- `image`와 `strength`로 만드는 variation 방식과 LoRA는 Mage 경로에서 400을 반환하도록 검사한다.

투명 PNG는 mlx-serve가 Qwen-Image-2.1용 `transparent:true`로 별도 제공한다. 같은 옵션을 다른 이미지 백엔드에 보내면 400이라는 문서가 있으므로 Mage의 PNG 출력을 알파 지원으로 해석하지 않는다. [투명 출력 API](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md#qwen-image-transparent-png-output)

## 라이선스·비용·호스팅

Microsoft 저장소와 ddalcu 모델 카드는 MIT로 표기한다. Microsoft LICENSE에는 복사본에 저작권·허가 고지를 포함하는 조건이 있다. 실제 배포 시에는 선택한 팩에 동봉된 라이선스도 함께 확인한다. [Microsoft LICENSE](https://github.com/microsoft/Mage/blob/main/LICENSE), [변환팩 라이선스 표기](https://huggingface.co/ddalcu/Mage-Flow-Edit-Turbo-MLX-Serve-8bit)

로컬 실행에는 외부 이미지 API의 장당 호출료가 없지만 장비·전력·저장 공간·처리 시간 비용은 든다. 이번 조사에서는 Microsoft가 제공하는 상용 Mage-Flow 호스팅 API의 엔드포인트·가격표를 확인하지 못했다. 생성용 ddalcu 카드도 Inference Provider 미배포로 표시한다. 연구 데모와 프로덕션 API 계약은 구별해야 한다. [Microsoft 프로젝트](https://microsoft.github.io/Mage/flow/), [생성 팩 제공 상태](https://huggingface.co/ddalcu/Mage-Flow-Turbo-MLX-Serve-8bit)

## 플러그인과 상류 구현의 차이

| 항목 | 현재 social-flow | 영향 |
| --- | --- | --- |
| 크기 검증 | 256~2048, 16픽셀 배수 | Microsoft가 설명하는 512~2048보다 하한이 낮음. 256의 품질 지원 근거로 사용하면 안 됨 |
| 편집 참조 | 원본 1장 + 추가 최대 3장 | 모델의 이론적 최대 참조 수를 뜻하지 않음 |
| 인자 | steps·seed 노출, CFG·negative prompt·VL 전처리 미노출 | 원본 Python API를 전부 제어할 수 없음 |
| variation | 공통 생성 도구가 imagePath·strength를 받음 | Mage에서는 상류가 거절하므로 편집 도구를 선택 |
| 모델 선택 | ready 상태의 image 모델 우선 | Edit 팩인지 별도 검사하지 않음 |
| 반환 크기 | 요청 width·height 기록 | 원본 비율을 유지하는 편집 결과와 불일치 가능. 실제 PNG 크기 확인 권고 |
| seed | 0 이상 | 원본 Python API의 -1을 보낼 수 없음 |

근거: [현재 플러그인](../../../server/src/mlx-serve-client.ts), [Microsoft 인자 표](https://github.com/microsoft/Mage/blob/main/mage_flow/README.md#python-api), [상류 편집 테스트](https://github.com/ddalcu/mlx-serve/blob/main/tests/test_mageflow_edit.sh). 이 문서는 차이를 기록하며 코드를 수정하지 않는다.

## 실전 팁과 실행하지 않은 요청 예시

첫 비교는 1024×1024·4스텝·같은 seed로 시작한다. 이는 공식 Turbo 설정을 바탕으로 한 비교 방법 제안이다. 큰 캔버스와 많은 참조를 동시에 바꾸면 메모리·품질 변화의 원인을 찾기 어렵다.

편집 프롬프트에는 참조 순서를 적는다. 예를 들어 “1번 이미지의 공간을 유지하고 2번 이미지의 컵만 테이블 중앙에 놓는다. 조명 방향과 카메라 위치를 유지한다”처럼 합성 대상과 보존 조건을 구체적으로 지정한다. 이는 공식 다중 참조 예제를 적용한 작성 제안이며 얼굴·로고의 완전한 보존을 보장하지 않는다. [공식 다중 참조 예시](https://github.com/microsoft/Mage/blob/main/mage_flow/README.md#python-api)

아래는 플러그인 `mlx_image_generate`의 요청 예시다. 모델은 설치 후 `/v1/models`에 같은 ID가 있을 때만 선택한다.

```json
{
  "model": "ddalcu/Mage-Flow-Turbo-MLX-Serve-8bit",
  "prompt": "A blue ceramic cup on a wooden table, soft window light from the left, centered composition, no text.",
  "width": 1024,
  "height": 1024,
  "steps": 4,
  "seed": 42,
  "filename": "mage-cup.png"
}
```

아래는 `mlx_image_edit` 예시다. 경로는 설명용이며 실제 파일이 있어야 한다. 크기를 생략해 원본 비율을 따르도록 했다.

```json
{
  "model": "ddalcu/Mage-Flow-Edit-Turbo-MLX-Serve-8bit",
  "imagePath": "/absolute/path/scene.png",
  "refImagePaths": ["/absolute/path/cup.png"],
  "prompt": "Place the cup from image 2 on the center of the table in image 1. Preserve the room, camera position, and lighting of image 1.",
  "steps": 4,
  "seed": 42,
  "filename": "mage-cup-edit.png"
}
```

예시는 [플러그인 스키마](../../../server/src/mlx-serve-client.ts)와 대조했으며 모델 설치·호출은 실행하지 않았다.
