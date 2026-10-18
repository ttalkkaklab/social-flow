# 호스트 이미지 도구: Codex와 Grok

확인일: 2026-10-18. OpenAI Docs 스킬로 공식 자료를 확인하고 현재 세션의 Codex 도구 스키마와 저장소 지침을 대조했다. Grok 내장 도구는 이 세션에 노출되지 않아 현재 실행 스키마를 직접 확인하지 못했다. 이미지 생성·유료 API 호출은 하지 않았다.

**호스트 경로는 실행 환경이 제공하는 이미지 기능이다.** 설정에는 `model:"host-managed"`와 `host:"codex"` 또는 `host:"grok"`를 기록한다. 공개 API에 같은 회사의 모델이 있다는 이유로 호스트 내부 모델을 그 ID로 적지 않는다. [저장 설정 계약](../../../skills/_shared/model-settings.md)

## 공통 선택 순서와 비용 기록

기존 에피소드는 원래 스냅샷과 명시적 변경을 따르고 새 에피소드는 작업 디렉터리의 저장된 선택을 따른다. 호스트 우선은 최초 선택의 권장사항이다. 저장된 API·로컬 선택을 덮어쓰거나 실패 후 다른 엔진으로 자동 전환하지 않는다. 호스트가 Codex에서 Grok으로 바뀌어도 같은 도구 이름만 보고 이어서 실행하지 않는다. [model-settings.md](../../../skills/_shared/model-settings.md), [still-generation.md](../../../skills/produce/references/still-generation.md)

장부의 `image.host` 단가 $0은 플러그인이 별도 API 비용을 합산하지 않는 관례다. 구독료가 없거나 생성 횟수가 무제한이라는 뜻이 아니다. 실제 계정의 구독·크레딧·사용량 제한은 이번에 조회하지 않았다. 재생성도 호출 횟수에 포함한다. [호스트 장부 규칙](../../../skills/produce/references/still-generation.md)

품질은 사용자가 정한 “사용 가능한 최저 품질”을 요청한다. 도구가 품질 인자를 제공하면 지원값을 쓰고 인자가 없으면 프롬프트 선호로 전달한다. 후자의 경우 실제 `low` 등급·비용 절감·지연 감소를 보장하지 않는다. 승인된 장면 프롬프트는 유지하며 품질 지시는 별도 문장으로 덧붙인다. [호스트 품질 선호](../../../skills/produce/references/still-generation.md)

## 1. Codex 내장 `image_gen`

### 이번 세션에서 확인한 계약

현재 노출된 함수는 `image_gen__imagegen`이며 아래 입력만 받는다. 이 표는 2026-10-18 세션 도구 선언을 직접 읽은 기록이다. 모든 Codex 설치본의 고정 계약으로 보지 않는다.

| 입력 | 현재 의미 |
| --- | --- |
| `prompt` | 생성·편집 설명 |
| `transparent_background` | 투명 배경 요청 여부 |
| `referenced_image_paths` | 편집에 쓸 로컬 이미지 경로 목록 |
| `num_last_images_to_include` | 로컬 경로가 없는 대화 이미지 참조, 최대 최근 5장 |

`model`, `quality`, `size`, `seed`, `n`, `output_format` 인자는 없다. 프롬프트에 픽셀 크기나 품질을 써도 도구 스키마의 강제 제약으로 바뀌지 않는다. 크기·투명도·글자는 결과 파일로 확인한다. 공개 Images API의 인자를 이 함수에 그대로 넣지 않는다.

새 이미지에는 두 참조 입력을 모두 생략한다. 편집 대상 전부에 로컬 경로가 있으면 `referenced_image_paths`를 쓰고 처음 보는 이미지는 먼저 `view_image`로 읽는다. 경로가 없는 대상이 있으면 필요한 대화 이미지를 포함하는 최소 개수를 지정한다. 두 참조 입력을 동시에 쓰지 않는다. 이는 현재 도구의 사용 지침이다.

미실행 생성 예시:

```json
{
  "prompt": "A blue ceramic bird on a pale oak desk, soft window light, centered composition. Use the lowest available generation quality. Preserve the requested dimensions, composition, subject identity and required readable details.",
  "transparent_background": false
}
```

미실행 편집 예시. 경로는 설명용이며 실제 파일이 아니다.

```json
{
  "prompt": "Change only the bird's color to sage green. Preserve its shape, camera angle and lighting.",
  "referenced_image_paths": ["/absolute/path/to/source.png"],
  "transparent_background": false
}
```

저장소는 `$CODEX_HOME/generated_images/`에서 선택 파일을 에피소드로 복사하는 흐름을 설명한다. 다만 현재 함수 선언은 반환값을 `unknown`으로 제공하므로 실제 반환 경로·파일 존재를 먼저 확인해야 한다. 고정 경로를 추측해 산출물을 찾았다고 보고하지 않는다. [저장소 Codex 처리 지침](../../../skills/produce/references/still-generation.md)

### 공개 OpenAI API와 구분할 점

공식 Responses API의 `image_generation` 도구는 이미지 모델을 선택하고 base64 이미지 결과를 받는 API 기능이다. 공식 문서에 GPT Image 모델 목록이 공개돼 있어도 현재 Codex 내장 `imagegen`이 어떤 모델을 사용하는지 증명하지는 않는다. 이 조사에서 호스트의 내부 모델 ID·스냅샷·실제 품질 등급은 확정하지 못했다. [공식 OpenAI 이미지 도구 문서](https://developers.openai.com/api/docs/guides/tools-image-generation)

운용 시 참조 파일의 역할을 분명히 적는다. 얼굴·몸·배경을 서로 다른 참조로 전달하고 편집에서 바꿀 부분과 보존할 부분을 구체적으로 설명한다. 결과는 장면 내용, 구도, 인물, 글자 순서로 확인한다. “API 모델의 한글 성능이 좋다”는 사실만으로 이 호스트 호출의 한글 결과를 통과시키지 않는다. [플러그인 참조·이미지 검사 지침](../../../skills/produce/references/still-generation.md)

## 2. Grok 내장 `image_gen`·`image_edit`

저장소는 새 이미지에 `image_gen`과 `aspect_ratio`를 사용하고 참조가 있는 작업에는 `image_edit`의 절대 경로 `image`를 사용하도록 적고 있다. 결과 경로를 받아 에피소드의 이미지 폴더로 복사한다. **이번 세션에서는 Grok 도구가 없으므로 이 인자·출력 계약은 저장소 지침 수준의 확인이다.** 실행 직전 실제 호스트 스키마를 다시 읽어야 한다. [Grok 처리 지침](../../../skills/produce/references/still-generation.md)

| 항목 | 이번 조사 결론 |
| --- | --- |
| 내부 모델 ID·스냅샷 | 미확인, `host-managed` 사용 |
| 생성·참조 편집 | 저장소는 두 도구로 구분 |
| quality 인자 | 현재 Grok 스키마 미확인. 존재 여부를 추측하지 않음 |
| 투명 배경·마스크·참조 최대 개수 | 호스트 지원 범위 미확인 |
| 한글 품질 | 저장소도 미측정으로 표시 |
| 호출료·한도 | 계정별 실청구·구독 한도 미확인 |

한글이 들어간 결과는 실제 글자를 읽는다. 실패해도 GPT Image API 전환은 저장된 선택과 사용자의 예외 허용 범위를 먼저 따른다. 오래된 지침의 대체 경로 설명을 새 과금 허가로 해석하지 않는다. [선택 우선순위](../../../skills/_shared/model-settings.md)

### 별도 참고: xAI 공개 이미지 API

아래는 **xAI 공개 API 조사**다. Grok 내장 도구의 실제 모델은 미확인이다. 생성은 `POST /v1/images/generations`, 편집은 `POST /v1/images/edits`다. API 키의 Bearer 인증을 사용한다. 생성 기본 응답은 임시 URL이며 `response_format:"b64_json"`으로 받을 수도 있다. [xAI 생성 문서](https://docs.x.ai/developers/model-capabilities/images/generation)

편집 API는 JSON의 `image` 객체에 `url`·`type:"image_url"`을 넣는다. 원본은 공개 URL·base64 data URI·Files API의 file ID로 제공할 수 있다. 공식 문서는 multipart를 보내는 OpenAI SDK `images.edit()`를 그대로 쓰지 말라고 명시한다. [xAI 편집 문서](https://docs.x.ai/developers/model-capabilities/images/editing)

| 공개 모델 ID | 조사 시점 이미지 입력료 | 출력료 |
| --- | --- | --- |
| `grok-imagine-image` | $0.002/입력 이미지 | 1K·2K $0.02/이미지 |
| `grok-imagine-image-2.0` | $0.01/입력 이미지 | low: 1K $0.04, 1.5K $0.05, 2K $0.06 / medium: 각각 $0.06·$0.07·$0.08 |
| `grok-imagine-image-quality` | $0.01/입력 이미지 | 1K $0.05, 1.5K $0.06, 2K $0.07 |

가격 출처: [xAI 공식 요금표, 페이지 갱신 2026-10-10](https://docs.x.ai/developers/pricing). 입력 이미지가 있는 편집은 출력료만으로 비용을 계산하지 않는다. 이 표를 호스트 구독의 호출당 가격으로 사용하지 않는다.

`grok-imagine-image-2.0`만 `quality: low|medium|auto`를 지원한다. 문서는 auto가 현재 생성에는 low, 편집에는 medium을 선택한다고 설명한다. 생성 요청의 `n`은 1~10이다. 해상도 안내는 `1k`·`2k`를 나열하지만 요금표에는 1.5K 행도 있어 **요금표만 보고 `resolution:"1.5k"` 요청이 유효하다고 확정하지 않았다.** [생성 옵션 문서](https://docs.x.ai/developers/model-capabilities/images/generation), [요금표](https://docs.x.ai/developers/pricing)

`grok-imagine-image-quality`는 2026-11-02에 종료 예정이며 이후 같은 slug 요청은 `grok-imagine-image-2.0`의 low로 연결된다고 공지돼 있다. 조사일에는 미래 일정이다. `grok-imagine-image` 1.0은 이 변경 대상이 아니다. [공식 종료·전환 공지](https://docs.x.ai/developers/migration/imagine-image-quality-nov-2)

미실행 xAI API 요청 본문 예시. 이 객체를 Grok 내장 도구에 직접 보내지 않는다.

```json
{
  "model": "grok-imagine-image-2.0",
  "prompt": "A sage green ceramic bird on an oak desk, soft window light",
  "aspect_ratio": "3:2",
  "resolution": "1k",
  "quality": "low",
  "response_format": "b64_json",
  "n": 1
}
```

### 프롬프트 팁과 확인 범위

xAI 공식 가이드는 주제·형태·받침·장소를 먼저 쓰고 재질·개수·시점·조명·구도를 구체화하라고 권한다. 긴 금지 목록보다 원하는 물체의 형태와 재료를 직접 묘사한다. 원본의 주제와 구도가 맞으면 편집으로 수정하고 시리즈의 화면비를 유지한다. 이 조언은 공개 API용이며 호스트 도구에 적용한 효과는 별도 측정하지 않았다. [xAI 프롬프트 가이드](https://docs.x.ai/developers/model-capabilities/images/prompting-guide)

호스트 두 경로 모두 실제 내부 모델, 계정 한도, 속도, 한글 정확도, 청구 내역을 이번에 확인하지 않았다. 후속 검증에서는 도구 스키마와 실제 결과를 기록하되 공개 API의 모델명·요금을 호스트 실행 기록에 대신 넣지 않는다.
