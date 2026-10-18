# GPT Image 2 조사

확인일: 2026-10-18. 공식 문서와 저장소 코드를 대조했다. API 호출이나 유료 생성은 하지 않았다.

**GPT Image 2는 계속 사용할 수 있으며 투명 배경도 preview로 지원한다. 현재 플러그인의 투명 배경 차단은 공식 문서와 맞지 않는다.** [GPT Image 2 설정](https://developers.openai.com/api/docs/guides/image-prompting#model-parameters)

## 모델 상태와 요청 계약

공식 ID는 `gpt-image-2`, 고정 버전은 `gpt-image-2-2026-04-21`이다. 텍스트·이미지를 입력받고 이미지를 출력한다. 무료 티어는 지원하지 않으며 공개 모델 페이지의 Build/Launch/Grow 한도는 각각 20/150/250 IPM이다. 실제 계정 권한은 이번 조사에서 확인하지 않았다. [모델 페이지](https://developers.openai.com/api/docs/models/gpt-image-2)

확인한 종료 공지에는 이 모델의 종료일이 없다. 최신 권장 모델은 `gpt-image-2.5-sunburst`와 `gpt-image-2.5-flare`로 이동했다. 따라서 저장소의 “newest” 주석은 갱신 대상이다. [종료 공지](https://developers.openai.com/api/docs/deprecations), [현재 모델 선택 안내](https://developers.openai.com/api/docs/guides/image-prompting#choose-a-model)

| 항목 | 현재 계약 |
| --- | --- |
| 생성·편집 | `POST /v1/images/generations`, `POST /v1/images/edits` |
| 품질 | `low`, `medium`, `high`, `auto` |
| 출력 | PNG·JPEG·WebP. JPEG/WebP만 `output_compression` 사용 |
| 참조 보존 | 항상 high fidelity. `input_fidelity`를 보내지 않는다 |
| 투명 배경 | preview. `background: "transparent"`와 PNG/WebP 조합 |

출력 설정 근거: [GPT Image 2 reference](https://developers.openai.com/api/docs/guides/image-prompting#model-parameters). API 경로 근거: [이미지 생성 안내](https://developers.openai.com/api/docs/guides/image-generation).

크기는 `auto` 또는 `WIDTHxHEIGHT`다. 양쪽 변은 16의 배수, 종횡비는 1:3~3:1, 최대 변은 3,840px, 총 픽셀은 655,360~8,294,400이다. 2560×1440보다 큰 해상도는 실험 단계다. 예를 들어 세로 영상 소스에는 1088×1920을 요청할 수 있다. 1080×1920은 16의 배수 조건에 맞지 않는다. [크기 규칙](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality)

편집은 참조 최대 16장과 마스크를 받는다. 최신 JSON 계약은 `images` 배열 안에 `file_id` 또는 `image_url`을 받으며 multipart 예제는 `image[]` 파일을 사용한다. 프롬프트 한도는 32,000자다. [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit)

## 요청 예시

아래는 문서용 예제다. 실행하지 않았다. SDK는 `OPENAI_API_KEY`를 환경에서 읽는다. 첫 호출은 생성 endpoint, 둘째는 편집 endpoint를 사용한다. [공식 SDK 사용 예제](https://developers.openai.com/api/docs/guides/image-prompting#run-a-complete-example)

```python
from pathlib import Path
from openai import OpenAI

client = OpenAI()
generated = client.images.generate(
    model="gpt-image-2",
    prompt="낮은 목재 탁자 위의 파란 도자기 찻잔. 부드러운 창가 빛. 글자 없음.",
    size="1024x1024",
    quality="low",
    output_format="png",
)

edited = client.images.edit(
    model="gpt-image-2",
    image=[Path("cup.png")],
    prompt="찻잔 색만 짙은 초록으로 바꿔라. 형태, 손잡이, 조명과 구도는 유지하라.",
    size="1024x1024",
    quality="medium",
    output_format="png",
)
# generated.data[0].b64_json / edited.data[0].b64_json을 디코딩한다.
```

## 가격과 비용 계산

USD, 100만 토큰 기준이다. 가격 페이지의 HTML 추출에는 접힌 Standard 행이 빠질 수 있어 공식 Markdown 원문의 Standard/Batch 제목과 행을 함께 확인했다. [가격 원문](https://developers.openai.com/api/docs/pricing.md)

| 토큰 종류 | Standard | Batch |
| --- | ---: | ---: |
| 텍스트 입력 | $5.00 | $2.50 |
| 텍스트 캐시 입력 | $1.25 | $0.625 |
| 이미지 입력 | $8.00 | $4.00 |
| 이미지 캐시 입력 | $2.00 | $1.00 |
| 이미지 출력 | $30.00 | $15.00 |

GPT Image 2의 캐시 요율은 Responses API의 이미지 생성에만 적용된다. 직접 Images API를 호출하는 플러그인에는 캐시 할인을 적용하면 안 된다. Batch도 현재 어댑터가 사용하지 않는다. [가격과 캐시 조건](https://developers.openai.com/api/docs/pricing.md)

공식 출력비 예시는 1024×1024에서 low $0.006, medium $0.053, high $0.211이다. 1024×1536과 1536×1024는 각각 $0.005/$0.041/$0.165다. 텍스트·참조 이미지 입력비는 별도다. 크기가 커져도 출력 토큰이 항상 늘지는 않으므로 면적 비례 계산은 피한다. [출력비 계산표](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)

## 프롬프트와 운영 팁

- 참조마다 역할을 적는다. 예: “1번은 얼굴, 2번은 의상, 3번은 배경”. 편집할 대상과 유지할 요소도 구체적으로 쓴다.
- 이미지 안에 넣을 글자는 따옴표로 정확히 적고 위치·서체·대비를 지정한다. 결과의 한글 철자는 직접 확인한다.
- 한 번에 작은 수정 하나를 요청하고 직전 결과를 참조로 전달한다. 캐릭터는 고정 참조 이미지를 재사용한다.
- 투명 배경은 alpha 채널을 확인한다. 체크무늬를 그린 이미지와 실제 투명 PNG를 구분한다.

이는 공식 공통 프롬프트 지침을 GPT Image 2 작업에 적용한 권장안이다. 현재 페이지의 비교 이미지는 2.5 모델 결과이며 GPT Image 2의 같은 품질을 보장하지 않는다. [프롬프트 지침](https://developers.openai.com/api/docs/guides/image-prompting)

## 플러그인과 차이

기준 파일: [server/src/image-client.ts](../../../server/src/image-client.ts).

1. `validateBackground()`는 GPT Image 2의 투명 배경을 무조건 거절한다. 공식 preview 지원을 반영할 후보지만 계정별 실제 호출은 검증하지 않았다.
2. 크기·품질·참조 16장·`input_fidelity` 생략 규칙은 현재 문서와 맞는다. 스냅샷 ID는 enum에 없어서 고정 버전을 선택할 수 없다.
3. 호출은 `n: 1` 고정이다. `output_compression`, Responses 다중 턴, Batch를 노출하지 않는다.
4. 응답 타입에는 `usage`가 없다. 실제 토큰 비용을 기록하려면 원본 사용량 보존을 검토할 수 있다.
5. “구형 모델 종료 후 GPT Image 2만 Images API에 존재”라는 주석은 2.5 출시에 맞춰 고쳐야 한다. 이번 문서는 코드나 모델 기본값을 바꾸지 않는다.

미확인: 실제 계정의 preview 권한, 생성 지연, 한글 정확도, 참조 일관성, 마스크 경계 보존, 4K 출력 품질. 문서 지원과 실측 성공을 구분한다.
