# Z-Image Turbo: 최신 문서와 플러그인 연결 상태

확인일: 2026-10-18. 공식 문서와 저장소 코드를 대조했다. 모델 다운로드, 설치, 이미지 생성, 속도 재측정은 하지 않았다. 웹 문서의 `main`은 바뀔 수 있으며 문서에 표시된 기능이 현재 설치본에 있다는 뜻은 아니다.

Z-Image Turbo는 플러그인에서 **로컬 텍스트 이미지 생성 전용**이다. 최신 mflux는 같은 모델의 img2img·LoRA도 제공하지만 플러그인은 해당 입력을 받지 않는다. [플러그인 구현](../../../server/src/zimage-client.ts), [mflux Z-Image 문서](https://github.com/mflux-community/mflux/blob/main/src/mflux/models/z_image/README.md)

## 모델과 실행 환경

| 항목 | 공식 문서에서 확인한 내용 |
| --- | --- |
| 모델 ID | `Tongyi-MAI/Z-Image-Turbo` |
| 구조 | 6B 파라미터, 증류 모델 |
| 기본 생성 | 8 NFE. Diffusers 예제는 `num_inference_steps=9`로 8회 DiT 계산 |
| CFG | Turbo 예제는 `guidance_scale=0.0` |
| 텍스트 강점 | 제작사는 영어·중국어 렌더링을 강조. 한국어 품질 보장은 확인하지 못함 |
| 라이선스 표시 | Hugging Face 모델카드의 `apache-2.0` |

출처: [공식 모델카드](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo). 공식 모델군에는 생성용 Base와 편집용 Edit도 있지만 Turbo와 다른 체크포인트다. 조사 시점 카드의 Edit 배포 칸은 `To be released`였다. [Tongyi 공식 저장소](https://github.com/Tongyi-MAI/Z-Image)

mflux의 현재 `main` 패키지 파일은 버전 `0.23.0`, Python `>=3.10`을 적고 있다. macOS의 MLX와 Linux의 CUDA 13 MLX 의존성도 구분한다. 따라서 플러그인 설치 오류문의 “Apple Silicon only”를 최신 mflux 전체의 제약으로 인용하면 부정확하다. 이 플러그인의 Linux 동작은 이번 조사에서 검증하지 않았다. [공식 패키지 설정](https://raw.githubusercontent.com/mflux-community/mflux/main/pyproject.toml), [플러그인 설치 안내](../../../server/src/zimage-client.ts)

## API·CLI와 미실행 예시

이 플러그인은 외부 HTTP API 대신 `mflux-generate-z-image-turbo`를 자식 프로세스로 실행한다. 실행 파일 기본 경로는 `~/.local/bin/mflux-generate-z-image-turbo`이며 `MFLUX_ZIMAGE_BIN`으로 바꾼다. [실행 파일 설정](../../../server/src/config.ts)

공식 설치 안내는 `uv tool install --upgrade mflux`다. 최초 생성은 가중치를 다운로드한다. 아래 명령은 문서 예시이며 실행하지 않았다. 설치 버전은 먼저 기록하고 업그레이드 전후 결과를 비교한다. [mflux 설치 안내](https://github.com/mflux-community/mflux#-installation)

```bash
uv tool install --upgrade mflux
mflux-generate-z-image-turbo \
  --prompt "A quiet workshop, wooden desk, soft morning light, no text" \
  --width 1024 --height 1024 --steps 9 --seed 42 -q 8 \
  --output workshop.png
```

공식 Python API는 모델을 한 번 로드한 뒤 `generate_image()`를 호출할 수 있다. 아래 예시 역시 미실행이다. [mflux Python API](https://github.com/mflux-community/mflux#-installation)

```python
from mflux.models.z_image import ZImageTurbo

model = ZImageTurbo(quantize=8)
image = model.generate_image(
    prompt="A quiet workshop, wooden desk, soft morning light, no text",
    seed=42, num_inference_steps=9, width=1024, height=1024,
)
image.save("workshop.png")
```

NVIDIA 환경의 별도 경로로 공식 모델카드는 Diffusers `ZImagePipeline`, `torch.bfloat16`, CUDA, 1024×1024, 9스텝을 예시한다. 플러그인은 이 경로를 호출하지 않는다. 카드에는 소스 설치 안내와 일반 설치 안내가 함께 있어 최소 Diffusers 버전은 여기서 확정하지 않았다. [Diffusers 공식 모델 예시](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo#-quick-start)

## 플러그인이 실제 받는 값

| 입력 | 플러그인 계약 | 사용 시 의미 |
| --- | --- | --- |
| `prompt` | 1~32,000자 | 별도 negative prompt 필드 없음 |
| `width`, `height` | 각 256~2048, 16의 배수, 기본 1024 | 플러그인 제한이며 모델의 전체 지원 범위는 아님 |
| `steps` | 1~50, 기본 9 | 허용 범위와 권장값을 구분 |
| `quantize` | 4·6·8, 기본 8 | 최신 mflux 공통 옵션 전체를 노출하지 않음 |
| `seed` | 선택, 0 이상 정수 | 생략하면 응답에도 실제 생성 seed를 확정해 주지 않음 |
| `outputPath`, `filename` | 선택 | 기본 파일명은 타임스탬프 기반 PNG |

출처: [요청 스키마·CLI 인자·응답](../../../server/src/zimage-client.ts).

플러그인은 이미지·마스크·LoRA·ControlNet·모델 ID·정밀도 선택을 전달하지 않는다. 최신 mflux 공통 문서는 3·4·5·6·8비트 양자화, 메타데이터 재사용, 캐시 설정 등을 설명한다. 플러그인의 양자화 범위를 늘리려면 실제 설치본과 계약 테스트를 먼저 맞춰야 한다. [mflux 공통 옵션](https://github.com/mflux-community/mflux/blob/main/src/mflux/models/common/README.md)

## 최근 변경과 실용적인 팁

- **버전과 seed를 함께 기록한다.** 최신 mflux Z-Image 문서는 0.20 이전의 float32에서 bfloat16으로 바뀌었다고 설명한다. 같은 seed라도 결과가 달라질 수 있다. 과거 결과 재현 옵션은 `--float32`지만 플러그인은 이를 노출하지 않는다.
- **Turbo 기본값은 9스텝에서 시작한다.** ControlNet Union 2.1은 별도 명령이며 문서는 약 20스텝을 안내한다. 그 수치를 일반 Turbo 생성에 그대로 적용하지 않는다.
- **img2img와 편집 전용 모델을 구분한다.** mflux의 img2img·LoRA 지원이 플러그인의 편집 지원을 뜻하지 않는다. ControlNet도 별도 체크포인트와 입력이 필요하다.

위 세 항목의 근거: [mflux Z-Image 모델 문서](https://github.com/mflux-community/mflux/blob/main/src/mflux/models/z_image/README.md).

다음은 현재 코드에서 도출한 운용 제안이다.

- **정확한 9:16은 720×1280 또는 1008×1792로 요청한다.** 둘 다 16의 배수다. 기존 코드 주석의 1088×1920은 17:30으로 9:16의 근사치다. 1080은 16의 배수가 아니므로 현재 스키마가 거절한다.
- **한글은 별도 조판을 우선 검토한다.** 과거 저장소 실험은 `딸깍연구소`가 `달닥연구소`로 나온 사례를 기록했다. 이 한 건을 모든 한국어 출력의 실패율로 일반화하지 않는다.
- **캐시가 있다는 이유만으로 다운로드가 끝났다고 판단하지 않는다.** 구현은 모델 캐시 디렉터리의 존재만 검사한다. 부분 다운로드나 다른 캐시 배치에서는 최초 실행 시간 여유가 충분하지 않을 수 있다.
- **배치 생성의 로드 비용을 측정한다.** 매번 자식 프로세스를 띄우므로 모델 로드 비용을 반복해서 낸다. 상주 워커로 바꾸기 전 메모리 점유와 동시 요청 조건을 비교한다.

근거: [플러그인 구현](../../../server/src/zimage-client.ts), [2026-08-12 현장 기록](../2026-08-12-local-image-generation/index.html).

## 비용·속도·라이선스

로컬 생성 경로에는 건별 API 호출료가 없다. 장비·전력·디스크·다운로드 비용까지 0이라는 뜻은 아니다. 구현은 원본 가중치 약 31GB 다운로드를 안내하고 캐시가 없으면 기본 타임아웃에 60분을 더한다. 생성 타임아웃은 픽셀 수와 스텝 수에 따라 늘어나며 최대 30분이다. [플러그인 비용·타임아웃 구현](../../../server/src/zimage-client.ts)

아래는 **2026-08-12 저장소 기록**이다. M4 Max 128GB, 8비트, 9스텝 조건이며 당시 다른 세션의 높은 부하가 있었다. 2026-10-18에 새로 측정한 값이 아니다.

| 크기 | 확산 시간 | 로드 포함 전체 시간 | 피크 메모리 |
| --- | --- | --- | --- |
| 1024×1024, 1차 | 116초 | 149초 | 31.9GB |
| 1024×1024, 2차 | 197초 | 210초 | 31.9GB |
| 1088×1920 | 443초 | 462초 | 38.9GB |

출처: [당시 실측 보고서](../2026-08-12-local-image-generation/index.html#bench). 최신 mflux나 다른 양자화를 사용하고 부하를 낮췄을 때의 속도는 측정하지 않았다. 공식 모델카드의 H800 1초 미만 추론 주장은 다른 장비의 제작사 수치이므로 이 표와 직접 비교하지 않는다. [공식 성능 설명](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)

모델카드는 Apache-2.0을 표시한다. 배포·수정 시에는 실제 LICENSE와 NOTICE 조건을 확인한다. 모델 라이선스만으로 특정 인물·상표·입력 자료의 사용 권한까지 확보되지는 않는다. 별도 LoRA를 쓰면 해당 배포물의 라이선스도 확인한다. [Tongyi 라이선스 원문](https://github.com/Tongyi-MAI/Z-Image/blob/main/LICENSE)

## 후속 검증 항목

현재 설치된 mflux 버전, 0.23.0 배포 패키지와 `main`의 일치 여부, Linux 실행, 양자화별 한국어 품질, 최신 버전의 처리량·메모리, 최대 해상도는 검증하지 않았다. 이 문서는 코드 수정이나 기본 모델 변경을 제안하는 근거이며 변경 자체를 적용하지는 않았다.
