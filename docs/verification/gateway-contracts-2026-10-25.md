# 게이트웨이 연동 검증

소셜플로우의 저장된 모델 설정으로 새 게이트웨이 계약을 선택하도록 수정했다.
기존 `astra-genai` 이미지·영상 설정은 DashScope·LTX v2 경로를 유지한다.
새 설정은 아래 엔진을 사용한다.

| 구분 | 엔진 | 모델 값 |
|---|---|---|
| 이미지 | `astra-genai-native` | `/v1/images/models`의 공개 별칭 |
| 음성 | `astra-genai` | `/v1/audio/models`의 공개 별칭 |
| 영상 | `astra-genai-desktop` | `/v1/ltx/desktop/models`의 설치된 offering ID |

`ASTRA_GENAI_URL`은 `/v1` 없는 게이트웨이 루트이며 인증은
`ASTRA_GENAI_API_KEY`를 사용한다. 플러그인은 모델 런타임을 직접 호출하지 않는다.
MLX가 없는 운영 환경에서도 HTTP 계약이 같으면 같은 어댑터를 사용한다.

## 구현

- 이미지 생성과 편집을 새 `/v1/images/generations` 경로로 연결했다.
  참조 이미지는 원본 1장과 추가 9장을 순서대로 전달한다.
  LoRA는 등록된 ID와 scale만 받으며 중복 ID와 임의 경로를 거부한다.
- TTS는 모델 별칭, 등록된 voice, instructions, 출력 형식, speed와 maxTokens를
  전달한다. 캐릭터 음성 계획·오디션·생성 근거 검사에도 연결했다.
  서버가 모델별 허용 범위를 검증한다. 임의 참조 음성 업로드는 지원하지 않는다.
- Desktop의 text/image/audio-to-video, extend, retake, keyframes를 추가했다.
  로컬 입력 파일을 토큰 소유 자산으로 업로드하고 결과도 인증된 경로로 받는다.
  text/keyframes에는 공개 LoRA ref를 사용할 수 있다. 일반 I2V·A2V·편집
  스키마에는 LoRA 필드가 없으므로 플러그인도 거부한다.
- A2V의 `allowAudioTruncation` 기본값은 false다. 잘림 허용이나 음성 패딩을
  자동으로 선택하지 않는다. 키프레임은 선택한 모델과 활성 모델이 같아야 한다.
- 모델 설정, 관리형 생성, 예산 예약, 입력 파일 해시, 작업 재조회와 복구를 연결했다.
  모호한 응답을 받았을 때 재생성하지 않는다. TTS는 같은 requestId로 완료된
  음성을 재사용하며 다른 ID로 기존 파일을 덮어쓰려는 요청은 생성 전에 거부한다.
- MCP 입력 스키마는 실행용 Zod 스키마로 생성한다. 각 파라미터에 설명을 붙였고
  관련 스킬의 도구 목록과 공유 설정 문서도 갱신했다.

## 검증 근거

플러그인 전체 `npm run check`에서 2,575개 테스트가 통과했다.
스킬 검사기는 28개 스킬의 17개 규칙을 통과했다. 실제 stdio MCP 번들을
실행해 새 도구 11개의 공개 목록과 `tts_route` 기능 조회도 확인했다.
모델 설정과 실제 어댑터 선택, 참조 순서와 개수, LoRA scale 0, 인증 범위,
불확실한 제출의 재시도 거부, 음성 재사용, 결과 파일 검증을 회귀 검사에 추가했다.

별도 통합 검증은 실제 Node 어댑터 → loopback HTTP → FastAPI 인증 →
독립 PostgreSQL 스키마 → 모델 응답 fixture를 사용했다. 모델 추론은 실행하지 않았다.
다음 10개 요청 모두 완료됐고 작업 10건과 사용량 10건을 확인했다.

1. 이미지 생성
2. 참조 10장과 등록된 LoRA를 사용한 이미지 편집
3. 등록된 참조 voice와 instructions를 사용한 TTS
4. text-to-video
5. 시작·종료 이미지를 사용한 image-to-video
6. 음성과 시작 이미지를 사용한 audio-to-video
7. extend
8. retake
9. keyframes
10. 등록된 LoRA를 사용한 영상 생성

통합 검사에서 쓴 LoRA 파일은 직렬화 확인용 fixture다. 실제 가중치 호환성이나
목소리 유사도·영상 품질을 증명하지 않는다. 모델 추론 결과는 앞선 게이트웨이
검증 보고서를 참고한다. 이번 수정으로 새 운영 배포나 과금 요청은 실행하지 않았다.

재현 명령:

```sh
# social-flow 저장소
npm --prefix server run check
node skills/platform-guide/references/skill-lint.js

# genai-gateway 저장소. PostgreSQL 테스트 DB가 필요하다.
TEST_DATABASE_URL=postgresql:///genai_gateway_test \
  .venv/bin/python -m pytest -c pyproject.toml -q -s \
  ../social-flow/server/verification/test_gateway_bridge.py
```

설정 예시와 기능별 파라미터는 [게이트웨이 설정 문서](../../skills/_shared/astra-genai.md#model-bound-gateway-2026-10-25)에 있다.
설치된 MCP 프로세스가 새 빌드를 읽으려면 재연결해야 한다. 저장된 프로젝트 선택과
인증 값은 자동으로 바꾸지 않았다.
