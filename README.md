# social-flow

채널 기반 쇼트폼 콘텐츠 파이프라인 Claude Code 플러그인 —
**스토리보드(이미지 포함) → 플랫폼별 영상·텍스트 제작 → HITL 승인 게시**를
`data/[채널]/[주제]/` 디렉토리 구조로 운영한다.

**채널**은 사용자가 운영하는 콘텐츠 채널(브랜드) 단위다 — `data/` 디렉토리
하나가 채널 하나이고, 톤·보이스·테마·게시 대상을 profile.md 로 고정한다.
게시 대상 **플랫폼**: **Threads · Instagram(릴스) · Facebook 페이지 · YouTube(쇼츠)**.
영상은 9:16 쇼트폼(1080×1920/30fps) 단일 포맷으로 제작해 플랫폼별로 파생한다.
fect-persona 플러그인에서 실측 검증된 영상 파이프라인(세이프존·reveal 동기화·
자막 계약)과 SNS 게시 클라이언트를 승계·일반화했다.

## 구성

```
social-flow/
├── .claude-plugin/plugin.json   # 플러그인 매니페스트
├── .mcp.json                    # 내부 MCP 서버 등록 (social-flow)
├── server/                      # 내부 MCP 서버 (TypeScript, stdio) — 툴 24종
│   └── src/
│       ├── index.ts             # 엔트리 (플랫폼별 게시 툴 조건부 노출)
│       ├── tools.ts             # 툴 정의 (조사 4 + 공공데이터 5 + 생성 6 + 게시 5 + 댓글 3 + 점검 1)
│       ├── handlers.ts          # zod 검증 + 라우팅
│       ├── sns-client.ts        # Threads·IG·FB·YouTube 게시/댓글 (fect-persona 승계)
│       ├── serp-client.ts       # SerpApi (키 마스킹 + 응답 슬리밍)
│       ├── naver-client.ts      # Naver Open API (뉴스·블로그·웹·카페)
│       ├── datago-client.ts     # 공공데이터포털 (검색·상세·다운로드·odcloud·표준 오픈API)
│       ├── image-client.ts      # OpenAI GPT Image 이미지 생성 (fect-mcp-server 이식)
│       ├── video-client.ts      # Veo 3.1 영상 생성 — t2v·i2v·연장·참조 (fect-mcp-server 이식)
│       ├── tts-client.ts        # Gemini TTS 음성 합성 — 단일 화자·2인 대화 (fect-mcp-server 이식)
│       ├── music-client.ts      # Lyria 음악 생성 — 30초 클립(배치)·가변 길이(스트리밍) (fect-mcp-server 이식)
│       └── media-utils.ts       # 경로 검증·base64 저장·PCM→WAV 공용 유틸
├── skills/
│   ├── channel/                 # /social-flow:channel — 채널·프로파일 관리
│   ├── branding/                # /social-flow:branding — 채널 프로필 이미지 (4종 후보→HITL 선택→적대적 수렴 95점)
│   ├── intro/                   # /social-flow:intro — 채널 인트로 영상 (컨셉 4종 HITL→veo 캐릭터 연기→채널명 리빌·로고음→90점 수렴)
│   ├── datago/                  # /social-flow:datago — 공공데이터 조사→수집→시드 기록
│   ├── ingest/                  # /social-flow:ingest — 화면 녹화(+음성)→타임라인 (녹화 제어·STT·씬 경계·키프레임)
│   ├── storyboard/              # /social-flow:storyboard — 조사→씬 설계→이미지→승인
│   ├── produce/                 # /social-flow:produce — 영상 합성 + 플랫폼별 텍스트
│   │   └── references/          #   build-reel.sh·video-template.html·검수 하네스
│   ├── publish/                 # /social-flow:publish — HITL 승인 후 플랫폼 게시
│   └── platform-guide/          # 지식형 — 플랫폼 문법·영상 규격 SoT
├── agents/
│   ├── brand-reviewer.md        # 프로필 이미지·인트로 영상 적대적 평가 (95점/90점 수렴 게이트)
│   └── content-reviewer.md      # 게시 전 적대적 검증 (P0 게이트)
└── data/                        # 콘텐츠 데이터 루트 (data/README.md 참조)
```

## 파이프라인

```
/social-flow:channel add 재테크           # 1. 채널 프로파일 (1회)
/social-flow:branding 재테크              # 1.2 (선택) 채널 프로필 이미지 — 4종 후보→HITL 선택→95점 수렴
/social-flow:intro 재테크                 # 1.3 (선택) 채널 인트로 — 컨셉 4종 HITL→veo 4초 생성→90점 수렴 (본편 뒤 접합 클로징)
/social-flow:ingest 재테크 record         # 1.5 (선택) 화면+음성 녹화→타임라인 — 웹 조사 대체 소스
/social-flow:storyboard 재테크 "7월 환율 변동"   # 2. 조사(또는 타임라인)→스토리보드→[승인]
/social-flow:produce 재테크 20260729-환율       # 3. 영상+플랫폼 텍스트 제작
/social-flow:publish 재테크 20260729-환율       # 4. [승인]→게시→permalink 기록
```

각 단계는 이전 단계의 산출물을 검사한다 — 스토리보드 미승인이면 produce 가,
제작 미완이면 publish 가 중단하고 이전 단계를 안내한다.

**스토리보드 선행 촬영 흐름** (완성도 있는 시연·튜토리얼용 — 순서가 뒤집힌다):

```
/social-flow:storyboard 재테크 <주제> 촬영 대본으로   # 씬 설계+촬영 대본(script.md)→[승인]
/social-flow:ingest 재테크 record <주제>              # 대본 보며 촬영→전사·씬 정합(alignment.json)
/social-flow:produce 재테크 <주제>                    # 녹화를 잘라 9:16 편집 (육성+실화면, TTS 없음)
/social-flow:publish 재테크 <주제>                    # [승인]→게시
```

## MCP 툴 표면 (31종)

| 그룹 | 툴 | 백엔드 |
|---|---|---|
| 조사 | `naver_search` | Naver Open API (일 25,000회 무료 — 한국어 1차) |
| 조사 | `serp_web_search` / `serp_news_search` / `serp_naver_search` | SerpApi (무료 250회/월 — 정밀·해외) |
| 공공데이터 | `datago_search` / `datago_detail` / `datago_file_download` | data.go.kr (무인증 — 검색·상세·파일 원본) |
| 공공데이터 | `datago_file_fetch` / `datago_api_call` | odcloud·apis.data.go.kr (인증키 + **API 별 활용신청** 필수) |
| 이미지 생성 | `gpt_image_text2img` / `gpt_image_img2img` | OpenAI GPT Image (OPENAI_API_KEY — 텍스트 렌더링·임의 WIDTHxHEIGHT, 멀티 레퍼런스 16장·마스크 인페인팅) |
| 영상 생성 | `veo_text2video` / `veo_img2video` / `veo_extension` / `veo_reference` | Veo 3.1 (GEMINI_API_KEY — 720p~4k, 비동기 1~6분, mp4 로컬 저장) |
| 음성 생성 | `tts_generate` / `tts_multi_speaker` / `tts_list_voices` | Gemini TTS (GEMINI_API_KEY — 보이스 30종, 언어 자동 감지, wav 모노 24kHz 저장) |
| 음악 생성 | `music_generate_clip` / `music_generate` / `music_generate_advanced` / `music_list_options` | Lyria 3 Clip(30초 고정 mp3 — BGM 기본 경로) · Lyria RealTime(5~300초 가변 wav 48kHz, seed 재현) |
| 게시 | `threads_publish` / `instagram_publish` / `facebook_publish` / `facebook_comment` / `youtube_publish` | 각 플랫폼 API 직접 호출 — **자격증명 파일이 있는 플랫폼만 노출** |
| 받은 댓글 | `sns_comment_inbox` / `sns_comment_reply` / `sns_comment_moderate` | 플랫폼 횡단 정규화 인박스 · 답글 · 숨김(삭제 미제공) |
| 점검 | `sns_account_check` | 토큰 /me 일괄 점검 (토큰 값 비노출) |

게시 툴은 검토 게이트가 없어 **호출 = 즉시 공개 게시**다 — publish 스킬의 HITL
승인 게이트를 반드시 거친다.

생성 툴 13종은 `fect-mcp-server` 의 gpt-image·video·tts·music 모듈을 이식한 것으로,
**외부 MCP 서버 없이 이 플러그인 단독으로 동작한다**. 키는 이미지 = OPENAI_API_KEY,
영상·음성·음악 = GEMINI_API_KEY 로 갈린다. 4K·배너 비율·최저가 이미지가 필요한
경우에만 별도 서버 fect-mcp 의 `nanobanana_*`(Gemini)를 선택적으로 쓸 수 있다.

음성·음악 이식 시 확인한 사항:

- **BGM 기본 경로는 `music_generate_clip`**(Lyria 3, 30초 고정 · 클립당 약 $0.04).
  정확한 길이(내레이션 맞춤)나 seed 재현이 필요할 때만 `music_generate` 계열을 쓴다.
- **다중 화자(`tts_multi_speaker`)는 flash 모델에서 짧은 대화 스크립트가 자주 거절된다**
  (`Model tried to generate text…`). 서버가 3회 자동 재시도하며, 그래도 실패하면
  `model: "gemini-2.5-pro-preview-tts"` 로 바꾸면 통과한다 (실측 확인).
- Lyria 는 프롬프트 정책 필터가 예민하다 — "lo-fi/vinyl crackle" 조합이 차단된
  사례가 있으며, 악기·분위기를 평이하게 서술하면 통과한다.

## 전제 조건

- Node 20+, ffmpeg, Google Chrome (헤드리스 캡처), python3
- whisper.cpp (`brew install whisper-cpp`) + `~/.cache/whisper-cpp/ggml-large-v3-turbo.bin`
  — ingest(녹화→타임라인) 사용 시. 녹화 모드는 터미널 앱에 **화면 기록·마이크**
  권한(시스템 설정 → 개인정보 보호 및 보안) 필요
- `OPENAI_API_KEY` (platform.openai.com/api-keys) — storyboard 의 씬 이미지
  생성(내장 `gpt_image_*` 툴)에 필수
- `GEMINI_API_KEY` (aistudio.google.com/apikey) — produce 의 영상·내레이션·BGM
  생성(내장 `veo_*` / `tts_*` / `music_*` 툴)에 필수
- chrome-devtools MCP (produce §8 폰 모드 검수용 — 선택, 없으면 캡처 스크립트로 대체)
- 게시할 플랫폼의 자격증명 파일 (아래)

> **로드 방식 주의**: 스킬의 MCP 툴 참조(`mcp__social-flow__*`)는 `--plugin-dir`
> 로드 기준이다. 마켓플레이스 설치 시 서버 프리픽스가 달라질 수 있으니 로드 후
> `/mcp` 로 실제 툴 이름을 확인하라. `data/` 는 **플러그인 루트가 아니라 세션
> cwd 기준**으로 생성된다 — 이 레포를 프로젝트 루트로 열고 쓰는 구성이 기본이다.

## 설치

```bash
cd server && npm install && npm run build
```

`npm run check` 는 빌드 + 툴 계약 테스트(`server/test/`)를 함께 돌린다. 이 테스트는
외부 API 를 부르지 않고 툴 표면만 검증한다 — 스키마 유효성, 정의 ↔ 핸들러 라우팅
정합, 동작 힌트와 설명의 일관성, 정본 상수와 enum 의 일치, 생성 파일 경로 안전성.
`server/src` 를 고쳤으면 `npm run check` 를 통과시키고 `server/dist` 도 함께 커밋한다.

플러그인 로드:

```bash
claude --plugin-dir /Volumes/data/repository/zeans/social/social-flow
```

## 환경변수·자격증명

`.mcp.json` 이 셸 환경에서 패스스루한다. 시크릿은 파일에 커밋하지 않는다 —
미설정 시 해당 툴만 명시적 에러를 반환하고 나머지는 정상 동작한다.

| 변수 | 필수 | 기본 | 용도 |
|---|---|---|---|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | naver_search 사용 시 | — | Naver Open API (developers.naver.com) |
| `SERPAPI_API_KEY` | serp_* 사용 시 | — | SerpApi 키 |
| `DATA_GO_KR_API_KEY` | datago_file_fetch·api_call 사용 시 | — | 공공데이터포털 인증키 (data.go.kr 마이페이지 — 키 외에 **API 별 활용신청** 필요. 검색·상세·다운로드는 키 없이 동작) |
| `OPENAI_API_KEY` | gpt_image_* 사용 시 | — | OpenAI API 키 (platform.openai.com/api-keys — 이미지 생성) |
| `GEMINI_API_KEY` (또는 `GOOGLE_API_KEY`) | veo_* · tts_* · music_* 사용 시 | — | Gemini API 키 (aistudio.google.com/apikey — 영상·음성·음악 생성 공통) |
| `SNS_TOKEN_DIR` | | `~/.config/social-flow` | SNS 자격증명 루트 디렉토리 |
| `THREADS_TOKEN_FILE` 외 플랫폼별 | | `<SNS_TOKEN_DIR>/규약 파일명` | 기본(평면) 경로 개별 오버라이드 — 채널 디렉토리에는 미적용 |

자격증명 파일 규약(600 권한, 커밋 금지) — `threads_token` · `instagram_token` ·
`facebook_page_token` · `youtube-oauth-client.json`. **멀티 채널**: 채널(브랜드)별
토큰은 `<SNS_TOKEN_DIR>/<채널 slug>/` 하위에 같은 규약 파일명으로 두고, 게시 툴의
`channel` 인자로 선택한다 — 채널 지정 시 그 디렉토리만 쓰며 기본(평면) 토큰으로
폴백하지 않는다(오계정 게시 방지). 평면 파일은 채널 미지정(단일 채널·레거시)
경로다. **파일이 있는 플랫폼의 게시 툴만 노출된다**(기본 ∪ 채널 디렉토리 합집합).
발급·갱신 절차는 `skills/publish/references/token-setup.md` 참조.

## 문서 (docs/)

전체 색인은 **[docs/index.html](docs/index.html)**.

### API 레퍼런스 (docs/api-reference/)

내부 MCP 서버가 호출하는 외부 API 11종의 공식 계약과, 이 구현이 그 계약을 어떻게
지키는지(또는 의도적으로 좁히는지)를 나란히 적은 레퍼런스다.

- **[API 레퍼런스 허브](docs/api-reference/index.html)** — 인벤토리·자격증명 매트릭스·툴↔API 매핑
- **[MCP 툴 스펙 & 베스트 프랙티스](docs/api-reference/mcp-tools.html)** — Tool 필드,
  동작 힌트 판정표, 툴 작성 원칙 7가지, 품질 평가 루브릭
- **[툴 품질 감사 리포트](docs/api-reference/tool-audit.html)** — 31개 툴 채점 결과와 수정 내역
- 개별 API — [Gemini TTS](docs/api-reference/gemini-tts.html) ·
  [Veo 3.1](docs/api-reference/gemini-veo.html) ·
  [Lyria](docs/api-reference/gemini-lyria.html) ·
  [OpenAI Images](docs/api-reference/openai-images.html) ·
  [SerpApi](docs/api-reference/serpapi.html) ·
  [Naver 검색](docs/api-reference/naver-search.html) ·
  [공공데이터포털](docs/api-reference/data-go-kr.html) ·
  [Meta Graph](docs/api-reference/meta-graph.html) ·
  [YouTube Data](docs/api-reference/youtube-data.html)

### 사용 가이드 (docs/guides/)

- **[즉흥 녹화 가이드](docs/guides/ingest-usage/index.html)** — 화면 녹화(+음성)
  → 타임라인 → 스토리보드 → 게시 흐름. 준비·녹화 요령·조정 노브 포함.
- **[촬영 대본 가이드](docs/guides/screencast-usage/index.html)** — 스토리보드
  선행 촬영 흐름. 촬영 수칙·정합 이탈 보고·편집 화면 구성·문제 해결.

## 안전 계약 (요약)

- **HITL 이중 게이트** — 스토리보드 승인(제작 전) + 게시 승인(공개 전).
  승인 없이 게시 툴을 호출하지 않는다.
- **사실 왜곡 금지** — 시효성 값은 독립 출처 2개 교차 검증, 범위는 범위로.
- **크로스포스팅 복붙 금지** — 플랫폼마다 문장을 다시 설계한다.
- **토큰 평문 비노출** — 파일 기반, /me 로 계정 자동 결정.
- **생성 비주얼 제한** — 무드샷·자사 캐릭터 발화만. 실존 인물·국가 상징·보도
  화면 연출 금지.

## 관련 프로젝트

- 파이프라인·게시 클라이언트 원전: `fect-persona` 플러그인
  (`/Volumes/data/repository/astra/fect/fect-persona`)
- 생성 도구 서버: `fect-mcp-server` — gpt-image·video·tts·music 모듈 이식 원전
  (이식 완료 후 런타임 의존 없음). nanobanana(Gemini 이미지)·vision 만 이 서버에
  남아 있으며 선택 사용이다 (`/Volumes/data/repository/astra/fect/fect-mcp-server`)
