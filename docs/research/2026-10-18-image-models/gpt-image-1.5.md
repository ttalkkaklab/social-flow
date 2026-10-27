# GPT Image 1.5 — API·문서·제작 팁

조사 기준일: 2026-10-18. 공식 OpenAI documentation을 열어 확인하고 저장소 구현과 비교했다. API 호출과 유료 생성은 하지 않았다.

## 판단

`gpt-image-1.5`는 기존 결과를 재현하며 이전을 준비할 때 쓸 모델이다. 공식 문서는 deprecated로 표시하며 2026-12-01 API 종료를 예고한다. 권장 대체 모델은 `gpt-image-2.5-sunburst` 또는 `gpt-image-2.5-flare`다. 이 문서는 대체 모델의 품질 우열을 검증하지 않았다. [종료 일정](https://developers.openai.com/api/docs/deprecations)

별칭은 `gpt-image-1.5`, 고정 버전은 `gpt-image-1.5-2025-12-16`이다. 무료 API 등급은 지원하지 않는다. 실제 계정의 접근 권한과 한도는 이번 조사에서 확인하지 않았다. [모델 문서](https://developers.openai.com/api/docs/models/gpt-image-1.5)

## 입력과 출력

| 항목 | 공식 계약과 사용법 |
| --- | --- |
| 생성 | `POST https://api.openai.com/v1/images/generations`, 텍스트 프롬프트 최대 32,000자 |
| 크기 | `1024x1024`, `1024x1536`, `1536x1024`, `auto`; 임의 해상도는 지원 목록에 없음 |
| 품질 | `low`, `medium`, `high`, `auto` |
| 출력 | PNG·JPEG·WebP, 응답의 `data[].b64_json` 디코딩 |
| 배경 | `opaque`, `transparent`, `auto`; 투명 출력은 PNG 또는 WebP |
| 개수·압축 | API의 `n`은 1~10, JPEG·WebP의 `output_compression`은 0~100 |

근거: [생성 API](https://developers.openai.com/api/reference/resources/images/methods/generate), [모델별 크기·품질 표](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide), [이미지 생성 가이드](https://developers.openai.com/api/docs/guides/image-generation).

편집은 `POST /v1/images/edits`다. 최신 JSON 계약은 `images` 배열에 `image_url` 또는 `file_id`를 넣으며 최대 16장을 받는다. `input_fidelity`는 `low`와 `high`를 지원하고 기본값은 `low`다. 얼굴·제품의 세부 보존이 목적이면 `high`를 명시한다. `mask`도 제공하지만 모델이 결과를 픽셀 단위로 보존한다고 보장할 수는 없다. [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit)

이번에 읽은 최신 JSON 편집 계약에는 URL 필드의 길이 제한 20,971,520자가 명시돼 있다. 이를 파일당 20MB 또는 50MB 제한으로 바꿔 해석하지 않는다. multipart 업로드의 파일 크기·마스크 크기 제한과 JSON URL 길이 제한은 별도로 확인해야 한다. 과거의 ‘첫 다섯 참조를 우선 보존’ 규칙도 이번 최신 본문에서 재확인하지 못했다. [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit)

## 요청 예시

아래는 문서용 요청 본문이다. 실행하지 않았다. 인증은 `Authorization: Bearer $OPENAI_API_KEY` 헤더를 사용한다. 키 값은 파일에 쓰지 않는다.

생성: `POST /v1/images/generations`, `Content-Type: application/json`.

```json
{
  "model": "gpt-image-1.5",
  "prompt": "정면을 보는 작은 종이 로봇 한 개. 전신과 발이 화면 안에 들어온다. 완전히 투명한 배경. 글자, 로고, 바닥 그림자 없음.",
  "size": "1024x1024",
  "quality": "medium",
  "background": "transparent",
  "output_format": "png",
  "n": 1
}
```

편집: `POST /v1/images/edits`, `Content-Type: application/json`. 아래 파일 ID는 예시이며 실제 업로드 ID로 바꾼다.

```json
{
  "model": "gpt-image-1.5",
  "images": [{ "file_id": "file-REFERENCE_IMAGE_ID" }],
  "prompt": "이미지 1의 로봇에서 팔 색만 빨강으로 바꾼다. 얼굴, 실루엣, 시점, 비율, 조명과 투명 배경은 유지한다.",
  "input_fidelity": "high",
  "size": "1024x1024",
  "quality": "medium",
  "background": "transparent",
  "output_format": "png",
  "n": 1
}
```

필드 근거: [생성 API](https://developers.openai.com/api/reference/resources/images/methods/generate), [JSON 편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit). 현재 플러그인은 JSON `images` 계약 대신 SDK의 multipart `image` 업로드를 사용한다. 예시 본문을 MCP 도구 인자에 그대로 넣으면 안 된다.

## 가격

USD 기준 이미지 출력비다. 텍스트·참조 이미지 입력비는 별도다. [모델 가격표](https://developers.openai.com/api/docs/models/gpt-image-1.5)

| 품질 | 1024×1024 | 1024×1536 | 1536×1024 |
| --- | ---: | ---: | ---: |
| low | $0.009 | $0.013 | $0.013 |
| medium | $0.034 | $0.050 | $0.050 |
| high | $0.133 | $0.200 | $0.200 |

100만 토큰당 텍스트 입력 $5, 캐시 입력 $1.25, 이미지 입력 $8, 캐시 이미지 입력 $2, 이미지 출력 $32다. 캐시 가격이 있다는 사실만으로 모든 요청의 캐시 적중을 가정하면 안 된다. 모델 페이지의 텍스트 출력 가격은 이미지 출력비와 다른 항목이다. [모델 가격표](https://developers.openai.com/api/docs/models/gpt-image-1.5)

예를 들어 정사각형 `medium` 10장을 만들면 출력비는 $0.34이며 입력과 재시도 비용을 더해야 한다. 실제 호출비는 사용량으로 계산한다. [비용 계산](https://developers.openai.com/api/docs/guides/image-generation)

## 프롬프트와 운영 팁

다음은 공식 공통 프롬프트 가이드를 1.5 작업에 적용한 제안이다. 1.5만의 성능 보장은 아니다. [공식 프롬프트 가이드](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)

- 대상, 화면 배치, 시점, 조명, 재질, 제외할 요소를 구체적으로 쓴다. 인물은 전신 여부와 시선, 손이 닿는 물체까지 지정한다.
- 편집할 때 바꿀 항목 하나와 유지할 항목을 함께 적는다. 다음 수정에서도 유지 조건을 반복한다.
- 참조마다 ‘이미지 1: 제품’, ‘이미지 2: 색감’처럼 역할을 붙인다. 여러 참조를 넣는 것만으로 원하는 합성을 보장하지 못한다.
- 이미지 안의 문구는 따옴표로 묶고 위치와 서체 특성을 정한다. 작은 글자는 `medium` 또는 `high`로 시험한다. 한국어의 정확도는 별도 검수한다.
- 투명 배경은 체커보드와 단색 배경을 제외한다고 적는다. 저장 후에도 PNG·WebP의 알파 채널을 보존한다.

운영 제안: 비용 비교에서는 `auto` 대신 동일한 크기·품질로 비교한다. 글자 오류와 캐릭터 일관성은 실제 채널의 참조 이미지로 측정하고 종료일 전에 대체 모델로 같은 사례를 다시 평가한다. 이는 이번 조사자의 제안이며 실험 결과가 아니다.

## 저장소와 차이

비교 대상: [server/src/image-client.ts](../../../server/src/image-client.ts).

| 항목 | 현재 구현 | 조사 결과와 후속 판단 |
| --- | --- | --- |
| 모델 선택 | 별칭 `gpt-image-1.5`만 enum 허용 | 공식 고정 버전은 선택할 수 없음 |
| 크기·품질·투명도 | 고정 크기 3종·auto, 품질 4종, PNG·WebP 투명 출력 | 1.5 계약과 일치 |
| 참조·보존 | 최대 16장, 선택적 `inputFidelity` | 생략하면 API 기본 `low`; 높은 보존이 필요하면 명시 |
| 배경 기본값 | `opaque` | 공식 API 기본 `auto`와 다름. 플러그인 정책으로 해석 |
| 결과 개수 | 항상 `n: 1` | API의 최대 10장보다 좁게 노출 |
| 압축·스트림 | 관련 인자 미노출 | API 기능을 모두 노출하는 래퍼는 아님 |
| 사용량 | 첫 이미지와 일부 메타데이터만 반환 | 원본 `usage`를 버려 실제 요청비를 이 응답만으로 산정할 수 없음 |
| 입력 검사 | 공통 MIME·참조 개수 검사, 마스크는 PNG로 변환해 업로드 | 파일별 실제 포맷·용량·마스크 치수/알파는 이 파일에서 검사하지 않음 |
| 종료 주석 | 1.5 종료일은 정확하나 이후 2만 존재한다고 설명 | 현재 공식 대체 목록에는 2.5 두 모델이 있으므로 주석 갱신 대상 |

종료일과 대체 모델의 근거는 [공식 종료 공지](https://developers.openai.com/api/docs/deprecations)다. 이 조사에서는 코드를 수정하지 않았다.

## 확인하지 않은 것

계정 접근 권한, 실제 생성 지연, 한국어 오탈자율, 참조 일관성, 청구액은 측정하지 않았다. 모델 카드와 개별 API 계약이 기능을 다르게 표현할 때는 해당 endpoint 계약을 먼저 확인한다. 특히 스트리밍은 모델 카드가 미지원으로 표시하는 반면 공통 API는 스트림 필드를 노출하므로 1.5의 실제 동작을 이 문서가 보장하지 않는다. [모델 카드](https://developers.openai.com/api/docs/models/gpt-image-1.5), [생성 API](https://developers.openai.com/api/reference/resources/images/methods/generate)
