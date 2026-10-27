# GPT Image 1 조사

조사일: 2026-10-18. OpenAI Docs의 공식 페이지와 현재 저장소를 대조했다. API 호출이나 유료 이미지는 생성하지 않았다.

`gpt-image-1`은 폐기 예정 모델이며 공식 종료일은 **2026-10-23**이다. 신규 도입보다는 기존 요청 재현과 이전 검증에 쓸 모델이다. 공식 모델별 안내는 `gpt-image-2`로 기존 작업을 검증한 뒤 이전하라고 안내한다. [공식 모델별 안내](https://developers.openai.com/api/docs/guides/image-prompting#gpt-image-1-reference)

## API와 입출력

| 항목 | 확인한 계약 |
|---|---|
| 생성 | `POST https://api.openai.com/v1/images/generations`, SDK `client.images.generate` |
| 편집 | `POST https://api.openai.com/v1/images/edits`, SDK `client.images.edit` |
| 출력 크기 | `1024x1024`, `1024x1536`, `1536x1024`, `auto` |
| 품질 | `low`, `medium`, `high`, `auto` |
| 파일 | PNG·JPEG·WebP. 응답은 base64 이미지이며 `response_format` 지정 불가 |
| 투명도 | `background: "transparent"`와 PNG 또는 WebP 조합 |
| 입력 보존 | 편집의 `input_fidelity: "low" / "high"`. 생략 시 `low` |

크기·품질·투명도는 [모델별 안내](https://developers.openai.com/api/docs/guides/image-prompting), endpoint와 응답 계약은 [생성 API](https://developers.openai.com/api/reference/python/resources/images/methods/generate)와 [편집 API](https://developers.openai.com/api/reference/python/resources/images/methods/edit)에서 확인했다.

편집 입력은 PNG·WebP·JPG 최대 16장이고 파일마다 50MB 미만이어야 한다. 프롬프트는 최대 32,000자다. 마스크는 원본과 크기가 같은 4MB 미만 PNG이며 alpha가 0인 영역을 편집 대상으로 삼는다. 여러 장을 보내면 첫 이미지에 마스크를 적용한다. [편집 API](https://developers.openai.com/api/reference/python/resources/images/methods/edit)

문서 간 마스크 용량 안내에 차이가 있다. 위 Python 편집 레퍼런스는 4MB 미만 PNG를 요구하지만 [공통 마스크 가이드](https://developers.openai.com/api/docs/guides/image-generation#mask-requirements)는 이미지·마스크를 50MB 미만으로 설명한다. 이는 모델 간 차이로 단정할 수 없으며 현재 사용 경로의 더 엄격한 조건으로 준비하는 편이 안전하다. 실호출로 허용 범위를 시험하지는 않았다.

마스크는 변경 범위를 안내하지만 픽셀 경계를 정확히 보장하지 않는다. 엄밀한 합성이 필요하면 결과를 원본과 비교해야 한다. [생성 가이드](https://developers.openai.com/api/docs/guides/image-generation)

## 요청 예시

다음 코드는 문서용이며 실행하지 않았다. 환경변수 `OPENAI_API_KEY`를 읽는 공식 Python SDK 예시다. 생성·편집 메서드와 base64 응답을 사용한다. [생성 API](https://developers.openai.com/api/reference/python/resources/images/methods/generate)

```python
import base64
from openai import OpenAI

client = OpenAI()
result = client.images.generate(
    model="gpt-image-1",
    prompt="청록색 머그잔 제품 사진. 부드러운 측면광. 글자 없이 중앙 배치.",
    size="1024x1024",
    quality="medium",
    background="transparent",
    output_format="png",
    n=1,
)
with open("mug.png", "wb") as target:
    target.write(base64.b64decode(result.data[0].b64_json))

with open("mug.png", "rb") as source:
    edited = client.images.edit(
        model="gpt-image-1",
        image=source,
        prompt="머그잔의 형태와 손잡이는 유지하고 색만 크림색으로 바꿔 주세요.",
        input_fidelity="high",
        quality="medium",
        size="1024x1024",
        output_format="png",
    )
```

## 가격과 운영 제한

아래는 USD 기준 이미지 **출력** 가격이다. 입력 텍스트와 참조 이미지 비용은 별도로 더한다. [공식 모델 가격](https://developers.openai.com/api/docs/models/gpt-image-1), [총비용 계산](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)

| 품질 | 1024×1024 | 1024×1536 | 1536×1024 |
|---|---:|---:|---:|
| low | $0.011 | $0.016 | $0.016 |
| medium | $0.042 | $0.063 | $0.063 |
| high | $0.167 | $0.250 | $0.250 |

100만 토큰당 텍스트 입력 $5, 캐시 입력 $1.25, 이미지 입력 $10, 캐시 입력 $2.50, 이미지 출력 $40이다. 캐시 요율이 있다는 이유로 매번 캐시 적중을 가정하면 안 된다. [공식 모델 가격](https://developers.openai.com/api/docs/models/gpt-image-1)

공식 모델 페이지의 제한은 Free 미지원, Build 250,000 TPM·20 IPM, Launch 3,000,000 TPM·150 IPM, Grow 8,000,000 TPM·250 IPM이다. 실제 계정 권한과 한도는 이번 조사에서 확인하지 않았다. [모델 제한](https://developers.openai.com/api/docs/models/gpt-image-1)

## 프롬프트와 비용 팁

- `quality`는 생성 품질이고 `input_fidelity`는 입력의 세부 특징 보존이다. 얼굴·제품 모양을 유지하려면 후자를 `high`로 비교하되 입력 비용 증가를 계산한다. [모델별 안내](https://developers.openai.com/api/docs/guides/image-prompting)
- 변경할 부분과 유지할 부분을 각각 적는다. 예: “색만 크림색으로 변경. 컵의 윤곽, 손잡이, 카메라 각도 유지.” 이는 공식 보존·편집 지침을 적용한 작성 예시이며 품질을 실측한 프롬프트는 아니다. [프롬프트 가이드](https://developers.openai.com/api/docs/guides/image-prompting)
- 초안은 작은 크기와 `low`로 비교하고 확정본만 높이는 방식을 검토한다. 이전 모델은 크기와 품질이 높을수록 출력 토큰과 지연이 증가한다. [생성 비용·지연](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency)
- 투명 배경은 프롬프트만 쓰지 말고 `background`도 지정한다. JPEG는 알파 채널을 보존하지 못한다. [모델별 안내](https://developers.openai.com/api/docs/guides/image-prompting)

## 저장소와 차이

[현재 어댑터](../../../server/src/image-client.ts)는 모델 ID, 종료일, 세 가지 고정 크기, 참조 16장, PNG·WebP 투명 출력, `inputFidelity` 설정을 구현한다. 기본 모델은 `gpt-image-2`이므로 이 모델을 쓰려면 명시적으로 선택해야 한다.

| 항목 | 공식 API | 플러그인 구현 |
|---|---|---|
| 출력 장수 | 요청당 1~10장 | `n: 1` 고정 |
| 압축 | JPEG·WebP `output_compression` 0~100 | 설정 미노출 |
| 배경 기본값 | `auto` | `opaque` |
| 입력 파일 검사 | 파일 크기·마스크 규격 요구 | base64 문자열 수만 검사하며 실제 크기·마스크 치수는 사전 검사하지 않음 |
| 참조 MIME | 각 파일에 맞는 형식 | 모든 참조에 하나의 `sourceMimeType` 적용 |
| 사용량 | API 응답에 사용량 제공 | `extractImage` 반환에서 사용량을 전달하지 않음 |

공식 계약 근거: [편집 API](https://developers.openai.com/api/reference/python/resources/images/methods/edit). 구현 관찰은 조사일의 `text2ImageSchema`, `img2ImgSchema`, `generateFromImage`, `extractImage` 기준이다. 차이는 수정 제안이며 이번 문서 작성에서 코드는 변경하지 않았다.

## 확인하지 않은 사항

한국어 글자 정확도, 캐릭터 일관성, 실제 처리 시간, 계정별 호출 가능 여부와 종료일 이후의 오류 형식은 실험하지 않았다. 최신 공통 프롬프트 가이드의 GPT Image 2.5 예시 품질을 GPT Image 1의 성능으로 해석하지 않았다.
