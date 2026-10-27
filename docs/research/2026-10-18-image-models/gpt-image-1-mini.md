# GPT Image 1 Mini 조사

조사일: 2026-10-18. 공식 OpenAI documentation과 현재 플러그인 코드를 비교했다. 이미지 생성·편집 API를 호출하지 않았으며 품질·지연시간은 실측하지 않았다.

## 판단

`gpt-image-1-mini`는 비용을 낮춘 GPT Image 1 계열이다. 기존 저비용 초안에는 쓸 수 있지만 **2026-12-01 API 종료 예정**이므로 새 장기 운영의 기본값으로 권하기 어렵다. 공식 대체 모델은 `gpt-image-2.5-sunburst` 또는 `gpt-image-2.5-flare`다. 현재 플러그인의 허용 목록에는 두 대체 모델이 없다. [모델 설명](https://developers.openai.com/api/docs/models/gpt-image-1-mini), [종료 공지](https://developers.openai.com/api/docs/deprecations), [현재 코드](../../../server/src/image-client.ts)

## API와 입력·출력

| 항목 | 확인 내용 |
| --- | --- |
| 모델 ID | `gpt-image-1-mini`; 별도 날짜 스냅샷은 모델 페이지에 없음 |
| 입력·출력 | 텍스트·이미지 입력, 이미지 출력; 음성·영상은 미지원 |
| 생성 | `POST /v1/images/generations` |
| 편집 | `POST /v1/images/edits`; 참조 합성과 마스크 편집 |
| 별도 경로 | 모델 페이지는 Batch 지원, 직접 Responses 모델 호출 미지원으로 표기 |

근거: [모델 페이지](https://developers.openai.com/api/docs/models/gpt-image-1-mini).

생성 옵션은 아래와 같다. 최신 문서의 `xhigh`, `max`, 사용자 지정 4K 크기는 mini 기능이 아니다. [생성 API](https://developers.openai.com/api/reference/resources/images/methods/generate)

| 옵션 | mini에서 사용할 값 |
| --- | --- |
| `prompt` | 최대 32,000자 |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` |
| `quality` | `auto`, `low`, `medium`, `high` |
| `background` | `auto`, `opaque`, `transparent`; 투명 출력은 PNG/WebP 사용 |
| `output_format` | `png`, `jpeg`, `webp` |
| `output_compression` | JPEG/WebP에서 0~100 |
| `n` | 1~10; 플러그인은 1로 고정 |
| 반환 | `data[].b64_json`; GPT Image는 URL 반환·`response_format` 설정을 사용하지 않음 |

최신 편집 API는 참조 최대 16장을 받고 JSON의 `images`에 URL·data URL·파일 ID를 지정하는 방식도 설명한다. 플러그인은 Base64를 파일로 바꿔 SDK multipart 요청을 보낸다. **mini의 `input_fidelity`는 `low`만 지원한다.** 플러그인은 이 필드를 전부 차단하므로 현재 도구를 사용할 때는 생략한다. [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit), [현재 코드](../../../server/src/image-client.ts)

마스크에는 알파 채널이 필요하다. 공식 가이드는 원본·마스크의 형식과 크기를 맞추고 파일 크기를 50MB 미만으로 안내한다. 이 설명은 마스크 편집 조건이며 JSON data URL의 문자열 길이 제한과 같은 단위가 아니다. 마스크가 있다고 주변 영역을 픽셀 단위로 보존한다고 가정하지 않는다. [마스크 요구사항](https://developers.openai.com/api/docs/guides/image-generation#mask-requirements), [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit)

Python 편집 API 문서는 마스크를 **4MB 미만 PNG**로 제한해 가이드의 50MB 안내와 다르다. 이는 공식 문서 사이의 불일치이며 모델별 차이라고 단정할 수 없다. 이 플러그인의 파일 업로드 방식에서는 마스크를 4MB 미만으로 준비하는 보수적인 기준을 권한다. [Python 편집 API](https://developers.openai.com/api/reference/python/resources/images/methods/edit)

## 가격과 운영 한도

아래 금액은 USD이며 100만 토큰당 가격이다. `pricing.md`의 Standard·Batch 구역을 구분해서 읽고 모델 페이지와 대조했다. [가격 원문](https://developers.openai.com/api/docs/pricing.md), [모델 가격](https://developers.openai.com/api/docs/models/gpt-image-1-mini)

| 처리 방식 | 텍스트 입력 | 텍스트 캐시 입력 | 이미지 입력 | 이미지 캐시 입력 | 이미지 출력 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard | $2.00 | $0.20 | $2.50 | $0.25 | $8.00 |
| Batch | $1.00 | $0.10 | $1.25 | $0.13 | $4.00 |

아래는 Standard의 이미지 1장 **출력 비용**이다. 텍스트 프롬프트와 편집 참조 이미지의 입력 비용은 별도다. 플러그인은 Batch 요청을 구현하지 않았다. [모델 가격](https://developers.openai.com/api/docs/models/gpt-image-1-mini), [비용 계산](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs), [현재 코드](../../../server/src/image-client.ts)

| 품질 | 1024×1024 | 1024×1536 | 1536×1024 |
| --- | ---: | ---: | ---: |
| low | $0.005 | $0.006 | $0.006 |
| medium | $0.011 | $0.015 | $0.015 |
| high | $0.036 | $0.052 | $0.052 |

모델 문서의 Build 한도는 250,000 TPM·20 IPM, Launch는 3,000,000 TPM·150 IPM, Grow는 8,000,000 TPM·250 IPM이다. 이는 계정의 실제 사용 가능량을 검증한 결과가 아니다. 실행 계정의 Limits와 접근 권한을 별도로 조회해야 한다. [모델 한도](https://developers.openai.com/api/docs/models/gpt-image-1-mini)

## 실전 팁

최신 이미지 프롬프트 가이드는 GPT Image 2.5 중심이다. 아래 문장 작성법은 mini에서도 시험할 수 있는 권고이며 동일한 품질을 보장하지 않는다. [공식 이미지 프롬프트 가이드](https://developers.openai.com/api/docs/guides/image-prompting)

- 피사체, 화면 배치, 재질·빛, 금지 요소를 구체적으로 적는다. 인물 전신이 필요하면 발까지 보이도록 명시한다.
- 편집에서는 바꿀 요소와 유지할 요소를 따로 적는다. 참조마다 인물·의상·배경 등 역할을 붙인다.
- 글자는 따옴표로 감싸고 위치를 적는다. 한글·로고·작은 글씨는 결과를 직접 읽어 검수한다. mini의 한글 정확도를 수치로 입증하는 자료는 이번 조사에서 확보하지 못했다.
- 한 번에 한 가지 변경을 요청한다. 연속 편집에서 얼굴이나 제품 형태가 달라지면 원본 참조와 보존 조건을 다시 제시한다.
- 픽셀 보존이 필수인 부분은 프롬프트만 믿지 않고 승인된 편집 영역을 원본에 합성한다.

비용을 비교할 때는 `auto` 대신 같은 크기·품질을 지정하고 채택한 이미지 1장당 총비용을 계산하는 편이 낫다. 예를 들어 정사각형 low 초안 10장의 출력비는 $0.05지만 재시도·입력 비용은 더해야 한다. 이는 위 가격표로 계산한 운영 제안이며 벤치마크 결과가 아니다.

## 실행하지 않은 요청 예시

아래는 API 요청 형태만 설명한다. 환경 변수에 API 키가 있어도 이 문서 자체는 요청을 보내지 않는다.

```http
POST https://api.openai.com/v1/images/generations
Authorization: Bearer $OPENAI_API_KEY
Content-Type: application/json
```

```json
{
  "model": "gpt-image-1-mini",
  "prompt": "세로 제품 사진. 무광 파란 도자기 컵 하나를 밝은 나무 탁자 중앙에 배치한다. 왼쪽 창문에서 부드러운 자연광이 들어온다. 컵 전체가 보이고 위쪽에는 여백이 있다. 글자와 로고는 없다.",
  "size": "1024x1536",
  "quality": "low",
  "background": "opaque",
  "output_format": "png",
  "n": 1
}
```

편집을 SDK로 직접 요청할 때는 `model`, `image`, `prompt`를 지정하고 `input_fidelity: "low"`만 사용하거나 생략한다. 플러그인의 `gpt_image_img2img`에는 `sourceImagesBase64`를 전달하고 `inputFidelity`는 생략한다. 두 인터페이스의 필드명을 섞지 않는다. [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit), [플러그인 스키마](../../../server/src/image-client.ts)

## 현재 구현과 문서의 차이

| 항목 | 현재 플러그인 | 조사 결과 |
| --- | --- | --- |
| fidelity | mini에서 high·low 모두 거절 | 최신 REST 문서는 low 허용. high는 계속 차단해야 함 |
| 기본 모델 | 생략 시 `gpt-image-2` | mini 사용 시 모델을 명시해야 함 |
| 기본 배경 | `opaque` | API 기본값은 `auto` |
| 반환 정보 | 첫 이미지·요청 크기·요청 품질 중심 | API 실제 크기·품질 및 사용량을 보존하면 auto 결과와 비용을 추적하기 쉬움 |
| 옵션 노출 | `n:1`, 비스트리밍, 압축 옵션 없음 | API의 다중 출력·압축·스트리밍 기능을 모두 노출하지는 않음 |
| 종료 대응 | 2026-12-01 종료 주석 존재 | 후속 2.5 모델은 아직 허용 목록에 없음 |

이 표는 [현재 코드](../../../server/src/image-client.ts), [생성 API](https://developers.openai.com/api/reference/resources/images/methods/generate), [편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit), [종료 공지](https://developers.openai.com/api/docs/deprecations)를 비교했다. 코드 변경은 이번 조사 범위에 포함하지 않았다.
