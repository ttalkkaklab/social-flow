# 이미지 생성 모델 API·문서·사용 팁

기준일: **2026-10-18 KST**. social-flow가 직접 노출하는 GPT Image 4종과 Z-Image Turbo, MLX로 실행하는 모델, Codex·Grok 내장 이미지 도구를 조사했다. 조사는 모델별 독립 작업으로 서브에이전트에 맡겼고 이 문서는 결과를 통합한다.

공식 문서의 지원 범위와 플러그인의 실제 입력 스키마는 다르다. 특히 GPT Image 2의 투명 배경 preview, 새 GPT Image 2.5 모델, MLX의 스트림·LoRA·투명 출력은 현재 코드에 모두 반영돼 있지 않다. 이번 작업은 문서 조사이며 실행 코드와 저장된 모델 선택은 변경하지 않았다.

## 읽는 순서와 조사 범위

| 모델·경로 | 상세 문서 | 플러그인 연결 |
|---|---|---|
| GPT Image 2 | [API·가격·편집·팁](gpt-image-2.md) | OpenAI API 기본 모델 |
| GPT Image 1.5 | [API·가격·편집·팁](gpt-image-1.5.md) | 명시적으로 선택 가능 |
| GPT Image 1 | [API·가격·편집·팁](gpt-image-1.md) | 명시적으로 선택 가능 |
| GPT Image 1 mini | [API·가격·편집·팁](gpt-image-1-mini.md) | 명시적으로 선택 가능 |
| Z-Image Turbo | [mflux·설정·팁](z-image-turbo.md) | 고정 로컬 모델 |
| FLUX.2 klein | [4B·9B와 편집](flux-2-klein.md) | MLX 서버의 설치 모델에 의존 |
| Krea-2 | [모델·설정·팁](krea-2.md) | MLX 서버의 설치 모델에 의존 |
| Mage-Flow | [Turbo·Edit와 참조](mage-flow.md) | MLX 서버의 설치 모델에 의존 |
| Qwen-Image-2.1 | [생성·편집·RGBA](qwen-image-2.1.md) | 최신 MLX 서버 문서에서 확인한 확장 후보 |
| Codex·Grok 호스트 | [내장 도구와 공개 API의 차이](host-image-tools.md) | 호스트가 실제 모델을 관리 |
| MLX 공통 연결 | [API·플러그인 지원 범위](mlx-integration.md) | 로컬 서버 어댑터 |

MLX는 모델 ID를 고정 enum으로 제한하지 않는다. 따라서 위 목록은 저장소가 언급한 모델과 최신 연결 문서에서 확인한 주요 모델을 다룬다. 사용자의 장비에 설치 가능한 모든 가중치나 제삼자 API 전체를 뜻하지 않는다. GPT Image 2.5 두 모델은 공식 대체 안내에 등장하지만 현재 OpenAI enum에는 없어 기존 지원 모델과 구분했다. [플러그인 모델 목록](../../../server/src/image-client.ts), [MLX 선택 로직](../../../server/src/mlx-serve-client.ts), [공식 대체 안내](https://developers.openai.com/api/docs/deprecations)

## 지금 코드와 다른 핵심 사항

| 항목 | 확인 결과 | 문서·구현에 미치는 영향 |
|---|---|---|
| GPT Image 2 투명 배경 | 공식 문서는 preview 지원 명시 | 현재 `validateBackground()`의 무조건 거절과 충돌 |
| GPT Image 1 종료 | 2026-10-23 예정 | 신규 기본값으로 선택하기 전에 이전 계획 검토 |
| GPT Image 1.5·mini 종료 | 2026-12-01 예정 | 기존 작업의 대체 모델 평가 필요 |
| GPT Image 2.5 | Sunburst·Flare가 공식 대체 목록에 있음 | ‘종료 후 2만 존재’ 주석 갱신 대상 |
| GPT Image mini 입력 보존 | 공식 편집 계약은 `input_fidelity:low` 허용 | 현재 스키마는 low도 거절하므로 도구 호출에서는 생략 |
| OpenAI 비용 기록 | 클라이언트가 원본 `usage`를 반환하지 않음 | 출력 단가표만으로 실제 청구액을 복원할 수 없음 |
| FLUX.2 해상도 | 최신 서버·공식 API는 가변 크기 지원 | 오류 메시지의 1024 정사각 고정 설명 갱신 대상 |
| Krea Raw 스텝 | 공식 예시 52스텝 | 현재 MLX 스키마 최대 50으로 그대로 표현 불가 |
| Mage-Flow 편집 크기 | 서버 테스트는 size를 픽셀 예산으로 해석 | 플러그인의 반환 크기와 실제 PNG 치수가 다를 수 있음 |
| Z-Image 기능 | 최신 mflux는 img2img·LoRA 등도 제공 | 플러그인은 텍스트 생성만 노출 |
| Qwen-Image-2.1 | 참조 10장·RGBA·Turbo 고정 schedule 지원 | 현재 어댑터는 원본 포함 4장·투명도 미전달·요청 steps 기록 |
| MLX 기능 | 서버는 스트림·LoRA·일부 모델 투명 출력 제공 | 플러그인 스키마에 없는 옵션은 호출 불가 |
| 설정 파일 | 이미지 모델·품질을 비어 있지 않은 문자열로 검사 | 잘못된 값이 저장된 뒤 생성 단계에서 거절될 수 있음 |

외부 사실 근거: [mini 편집 계약](https://developers.openai.com/api/reference/resources/images/methods/edit), [GPT Image 2 투명 배경](https://developers.openai.com/api/docs/guides/image-prompting#model-parameters), [종료 일정](https://developers.openai.com/api/docs/deprecations), [MLX API](https://github.com/ddalcu/mlx-serve/blob/main/docs/api.md). 모델별 추가 근거: [FLUX.2 대조](flux-2-klein.md), [Krea 대조](krea-2.md), [Mage 대조](mage-flow.md), [Z-Image 대조](z-image-turbo.md), [Qwen 대조](qwen-image-2.1.md). 코드 근거: [OpenAI 클라이언트](../../../server/src/image-client.ts), [모델 설정 검사](../../../skills/_shared/model-settings.js). 위 항목은 후속 변경 후보이며 이번 조사에서 수정하거나 실호출로 검증한 기능은 아니다.

## 가격을 읽는 방법

OpenAI 가격은 **텍스트 입력 + 참조 이미지 입력 + 이미지 출력**을 합산한다. 상세 문서의 장당 표는 출력비만 나타낸다. 재시도와 버린 결과도 비용에 포함된다. `auto` 설정은 고정 단가 비교에 적합하지 않으므로 비교 실험에서는 크기와 품질을 명시한다. [공식 비용 계산](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)

가격 페이지의 Standard와 Batch는 별도 요율이다. 접힌 HTML 표가 누락될 수 있어 원문 제목과 모델별 페이지를 교차 확인했다. 현재 social-flow는 직접 Images API를 호출하며 Batch나 Responses 이미지 캐시 할인을 자동으로 적용하지 않는다. [공식 가격 원문](https://developers.openai.com/api/docs/pricing.md), [클라이언트](../../../server/src/image-client.ts)

로컬 도구의 API 호출료 $0와 총 운영비 $0는 다르다. 장비·메모리·전력·다운로드·처리 시간을 따로 계산한다. 호스트 도구의 `image.host` $0도 플러그인의 장부 규칙이며 구독료와 사용 한도가 없다는 뜻은 아니다. [이미지 생성 장부 규칙](../../../skills/produce/references/still-generation.md)

## 공통 제작 팁

- 프롬프트는 대상·행동·구도·시점·조명·재질을 구체적으로 적는다. 참조마다 얼굴, 의상, 배경 등 역할을 붙인다.
- 편집에서는 바꿀 것과 유지할 것을 함께 쓴다. 이미지 변형 강도를 조절하는 기능과 지시 기반 편집을 구분한다.
- 글자를 넣으면 정확한 문구를 따옴표로 적고 위치와 대비를 지정한다. 한글 철자와 작은 글자의 가독성은 실제 결과로 확인한다.
- 투명 출력은 PNG/WebP와 알파 채널을 확인한다. 배경에 그려진 체크무늬를 투명도로 판단하지 않는다.
- 비교할 때 같은 프롬프트·참조·크기·품질을 쓰고 공급자·모델 ID·버전·양자화·seed·소요 시간·사용량을 기록한다. 같은 seed만으로 서로 다른 버전의 재현성을 보장하지 않는다.

앞의 네 항목은 [공식 이미지 프롬프트 가이드](https://developers.openai.com/api/docs/guides/image-prompting)를 적용한 제안이다. 마지막 항목은 조사 결과를 비교할 때 쓸 실험 기록 제안이다. 특정 모델의 품질 우열을 측정한 결과는 아니다.

## 선택 우선순위

프로젝트의 `.social-flow/models.json` 선택과 에피소드 스냅샷을 우선한다. 저장된 API·로컬 선택은 호스트 도구 감지로 덮어쓰지 않는다. 초기 설정의 host-first 권장과 이미 저장된 선택을 구분하고 실패했다고 다른 유료 API로 자동 전환하지 않는다. [선택 규칙](../../../skills/_shared/model-settings.md)

## 검증 한계

공식 웹 문서와 공개 소스는 조사일에 열람했다. 예시는 문서용이며 생성 API를 호출하지 않았다. 계정별 권한·실제 청구·지연·한글 정확도·캐릭터 일관성은 측정하지 않았다. 문서끼리 다른 설명이 있으면 상세 파일에 차이를 적었다. 모델별 최신 지원 여부는 링크의 현재 내용과 계정 제한을 함께 확인한다.

## 문서 검증

저장소의 `npm run check`는 빌드와 계약 테스트 2,330개를 통과했다. `skill-lint.js`도 21개 스킬의 16개 규칙을 통과했다. 이 검사는 외부 모델의 실제 생성 성공이나 문서 예제의 실호출을 검증한 결과는 아니다.
