# Krea 2·Krea 2 Turbo: 공식 모델과 MLX 경로

확인일: 2026-10-18. 공식 Krea 문서, Hugging Face 모델카드, mlx-serve 문서·소스와 플러그인 코드를 읽었다. 모델 다운로드·생성·유료 API 호출은 하지 않았다.

플러그인에서 Krea는 **mlx-serve의 로컬 이미지 모델**이다. Krea 공식 클라우드 API와는 요청 형식·가격·해상도 계약이 다르다. 현재 클라이언트는 Krea 전용 어댑터 없이 이미지 모델 ID를 서버에 전달한다. [플러그인 구현](../../../server/src/mlx-serve-client.ts)

## 정확한 모델과 배포 상태

| 이름·ID | 확인된 역할 | 기본 사용 기준 |
| --- | --- | --- |
| `krea/Krea-2-Raw` | 공식 비증류 체크포인트, 접근 동의 필요 | 파인튜닝·후속 학습용. 공식 예시 52스텝, CFG 3.5, 1024² |
| `krea/Krea-2-Turbo` | 공식 증류 체크포인트, 접근 동의 필요 | 일반 생성용. 공식 예시 8스텝, CFG 0, `mu=1.15`, 최대 2048² |
| `ddalcu/Krea-2-Turbo-MLX-Serve-mixed-4-8` | 독립 개발자의 비공식 MLX 변환 팩 | mlx-serve용 mixed 4/8비트 Transformer·8비트 텍스트 인코더·bf16 VAE |

근거: [Raw 모델카드](https://huggingface.co/krea/Krea-2-Raw), [Turbo 모델카드](https://huggingface.co/krea/Krea-2-Turbo), [공식 실행 지침](https://github.com/krea-ai/krea-2), [MLX 변환 팩](https://huggingface.co/ddalcu/Krea-2-Turbo-MLX-Serve-mixed-4-8).

공식 카드가 적은 버전은 v1.0, 공개일은 2026-06-22다. 카드 본문은 12B 구조로 설명하며 Hugging Face 파일 요약은 13B로 반올림해 표시한다. 이 숫자 차이를 별도 모델의 증거로 해석하지 않는다. [Turbo 모델카드](https://huggingface.co/krea/Krea-2-Turbo)

MLX 팩은 약 15GB 전체 크기와 256~2048 범위의 16픽셀 단위 크기를 안내한다. 512²·8스텝에서 기준 구현과 픽셀 cosine 0.9996이라는 설명도 있지만 **변환 팩 제작자의 검증 주장**이다. Krea 공식 품질 보증이나 이번 조사 실측이 아니다. 디스크 크기를 최소 RAM과 같다고 판단해서도 안 된다. [변환 팩 카드](https://huggingface.co/ddalcu/Krea-2-Turbo-MLX-Serve-mixed-4-8)

## 생성·변형·지시 편집의 차이

mlx-serve 앱 문서는 Krea를 포함한 이미지 모델에 원본 이미지와 `strength`를 넣는 변형 기능을 안내한다. 특정 요소만 바꾸는 지시 편집은 FLUX.2-klein·Mage-Flow Edit로 설명한다. 따라서 Krea의 img2img를 인물·구도 보존형 편집 지원으로 소개하면 범위를 과장한다. [mlx-serve 앱 문서](https://github.com/ddalcu/mlx-serve/blob/main/docs/app.md)

실제 Krea 엔진의 `GenOpts`에는 `init_image`와 `start_step`이 있다. 소스 주석과 구현은 입력 이미지를 VAE로 인코딩한 뒤 시작 시점의 노이즈와 섞는 경로를 보여 준다. 출력 크기는 엔진에서 16의 배수로 올림한다. 이 동작은 지시문과 참조 이미지를 별도 조건으로 처리하는 편집 계약과 다르다. [mlx-serve Krea 엔진](https://github.com/ddalcu/mlx-serve/blob/main/src/krea.zig)

현재 플러그인에서 Krea 변형은 `mlx_image_generate`의 `imagePath`·`strength`를 쓰는 경로다. `mlx_image_edit`는 `mode:"edit"`와 참조 목록을 보내지만 선택 모델의 편집 가능 여부를 검증하지 않는다. Krea를 여기에 넣었을 때의 서버 응답은 이번에 실행 검증하지 않았다. [생성·편집 요청 구현](../../../server/src/mlx-serve-client.ts)

## 공식 클라우드 API

Krea는 `POST https://api.krea.ai/generate/image/krea/krea-2/medium-turbo`를 제공한다. Bearer 인증과 JSON 요청을 쓰며 `prompt`, `aspect_ratio`, `resolution`이 필수다. 조사 시점 Turbo 스키마의 해상도는 **`1K`만** 명시돼 있다. 공개 가중치의 2K 예시와 혼용하지 않는다. [공식 Turbo API](https://www.krea.ai/docs/api-reference/krea/krea-2-turbo)

| 항목 | 공식 API 계약 |
| --- | --- |
| 화면비 | 1:1·4:3·3:2·16:9·2.35:1·4:5·3:4·2:3·9:16 |
| 변형 | `image_url` + `strength` 0~1, 기본 0.99 |
| 스타일 | `styles`, `image_style_references` 최대 10개, `moodboards` 최대 1개 |
| 프롬프트 확장 | `creativity`: raw·low·medium·high, 기본 low |
| 응답 | 즉시 이미지가 아닌 작업 데이터. `job_id`로 `/jobs/{id}` 조회 |
| 고정 USD 가격 표시 | 텍스트 생성 $0.015, 스타일 참조 $0.0175, 무드보드 $0.02 |

가격·계약 출처: [공식 Turbo API](https://www.krea.ai/docs/api-reference/krea/krea-2-turbo). `strength=0`은 입력을 유지하고 1은 입력을 무시한다. 위 금액을 로컬 생성료나 Raw 가중치 라이선스 요금으로 적용하지 않는다. 이 플러그인에는 해당 클라우드 API 연결이 없다.

## 로컬 API 예시와 플러그인 제약

mlx-serve 현재 문서의 기본 주소는 `http://localhost:11234`다. MLX 팩 카드의 예전 예시는 8080을 사용하므로 실행 중인 서버 주소에 맞춘다. 모델 ID는 `/v1/models` 응답으로 확인한다. [서버 API](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md), [변환 팩 예시](https://huggingface.co/ddalcu/Krea-2-Turbo-MLX-Serve-mixed-4-8)

아래는 이미 서버와 모델이 준비됐다는 전제의 **미실행 예시**다. 설치·다운로드를 포함하지 않는다.

```bash
curl http://localhost:11234/v1/models
curl http://localhost:11234/v1/images/generations \
  -H 'Content-Type: application/json' \
  -d '{"model":"Krea-2-Turbo-MLX-Serve-mixed-4-8","prompt":"A small ceramic bird on a pale green table, soft side light, editorial still life","size":"1024x1024","steps":8,"seed":42}'
```

플러그인 도구 요청 예시도 미실행이다. `model`에는 실제 서버가 돌려준 ID를 넣는다.

```json
{
  "model": "Krea-2-Turbo-MLX-Serve-mixed-4-8",
  "prompt": "A small ceramic bird on a pale green table, soft side light",
  "width": 1024,
  "height": 1024,
  "steps": 8,
  "seed": 42,
  "filename": "krea-bird.png"
}
```

| 현재 클라이언트 | 영향 |
| --- | --- |
| 각 변 256~2048, 16의 배수 | 모델별 범위를 독립 검증하지 않음 |
| 스텝 1~50 | Raw 공식 52스텝 예시를 표현할 수 없음 |
| `imagePath`가 있을 때만 `strength` 전달 | 텍스트 생성에서 strength만 넣어도 효과 없음 |
| seed·steps 선택 | 생략하면 서버 기본값을 따르며 실제 적용값 확인이 부족함 |
| 이미지 타임아웃 15분 | 고해상도·메모리 부하 상황의 실제 완료 시간은 미확인 |
| 생성·편집 모두 `/v1/images/generations` | 편집은 JSON `mode:"edit"`; 최신 multipart `/v1/images/edits`와 다름 |
| 모델 자동 선택은 image capability 기준 | Krea를 원하면 모델 ID를 명시하는 편이 분명함 |

근거: [플러그인 스키마·모델 선택·요청 코드](../../../server/src/mlx-serve-client.ts). 현재 클라이언트는 LoRA, CFG, `mu`, Krea 클라우드의 스타일·무드보드·프롬프트 확장 옵션을 노출하지 않는다. 최신 mlx-serve 자체의 LoRA 입력과 플러그인 제공 범위를 구분한다. [mlx-serve API 옵션](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md)

## 프롬프트·운용 팁

공식 가이드는 자연어 프롬프트를 권하며 긴 세부 묘사가 좋은 결과를 낼 수 있다고 설명한다. 넣을 글자는 따옴표로 감싼다. 스타일·구도·질감·조명을 구체적으로 쓰되 한국어 글자 정확도는 별도로 확인한다. 이번 조사에서는 한글 품질을 측정하지 않았다. [공식 프롬프트 가이드](https://github.com/krea-ai/krea-2/blob/main/docs/prompting.md)

일반 생성은 Turbo의 8스텝에서 시작한다. Raw는 학습 목적에 맞으며 공식 팀은 Raw에서 LoRA를 학습하고 Turbo에 적용하는 흐름을 권한다. 플러그인이 모델명 문자열을 받아도 Raw 실행 호환성까지 보장하지는 않는다. [공식 모델 사용 지침](https://github.com/krea-ai/krea-2), [Raw 모델카드](https://huggingface.co/krea/Krea-2-Raw)

현재 코드에 근거한 운용 제안은 다음과 같다.

- 프롬프트 비교 시 모델 팩 버전·양자화·해상도·seed·steps를 함께 기록한다. 클라우드와 로컬이 같은 seed로 같은 결과를 낸다고 가정하지 않는다.
- 변형은 원본 보존이 필요한 영역을 직접 확인한다. strength 수치만으로 인물 동일성이나 특정 부분의 보존을 보장할 수 없다.
- 처음에는 1024²로 메모리와 시간을 측정한 뒤 크기를 늘린다. 로컬 경로에 API 호출료는 없지만 장비·전력·저장 비용과 작업 시간이 든다.
- 정확한 9:16이 필요하면 플러그인 그리드에 맞는 1008×1792 등을 쓴다. 코드 메시지의 1088×1920은 근사 비율이다.

## 라이선스와 미확인 항목

공식 코드 저장소의 Apache-2.0 표기와 **모델 가중치의 Krea 2 Community License**를 구분한다. 모델 계약은 최근 12개월간 전체 매출을 기준으로 같은 지배·소유 아래 계열사를 포함해 연매출이 미화 100만 달러 미만일 때 상업 사용을 허용한다. 기준 이상이면 별도 Enterprise License가 필요하다. 계약에는 배포 시 라이선스·고지 제공, 파생 모델 이름의 Krea 접두어, 적절한 콘텐츠 필터 또는 검토 절차 등도 있다. 원문을 우선한다. [공식 라이선스 §§2~4](https://www.krea.ai/krea-2-licensing)

현재 설치본 버전, 모델별 실제 RAM·속도, 한국어 품질, Raw의 mlx-serve 실행, Krea에 `mode:"edit"`를 보낸 응답, 클라우드의 실청구 내역은 확인하지 않았다. 비공식 팩의 수치와 공식 모델의 기능을 분리해서 기록했으며 코드·기본 모델·저장 설정은 변경하지 않았다.
