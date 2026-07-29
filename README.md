# social-flow

카테고리 기반 쇼트폼 콘텐츠 파이프라인 Claude Code 플러그인 —
**스토리보드(이미지 포함) → 채널별 영상·텍스트 제작 → HITL 승인 게시**를
`data/[카테고리]/[주제]/` 디렉토리 구조로 운영한다.

대상 채널: **Threads · Instagram(릴스) · Facebook 페이지 · YouTube(쇼츠)**.
영상은 9:16 쇼트폼(1080×1920/30fps) 단일 포맷으로 제작해 채널별로 파생한다.
fect-persona 플러그인에서 실측 검증된 영상 파이프라인(세이프존·reveal 동기화·
자막 계약)과 SNS 게시 클라이언트를 승계·일반화했다.

## 구성

```
social-flow/
├── .claude-plugin/plugin.json   # 플러그인 매니페스트
├── .mcp.json                    # 내부 MCP 서버 등록 (social-flow)
├── server/                      # 내부 MCP 서버 (TypeScript, stdio) — 툴 24종
│   └── src/
│       ├── index.ts             # 엔트리 (채널별 게시 툴 조건부 노출)
│       ├── tools.ts             # 툴 정의 (조사 4 + 공공데이터 5 + 생성 6 + 게시 5 + 댓글 3 + 점검 1)
│       ├── handlers.ts          # zod 검증 + 라우팅
│       ├── sns-client.ts        # Threads·IG·FB·YouTube 게시/댓글 (fect-persona 승계)
│       ├── serp-client.ts       # SerpApi (키 마스킹 + 응답 슬리밍)
│       ├── naver-client.ts      # Naver Open API (뉴스·블로그·웹·카페)
│       ├── datago-client.ts     # 공공데이터포털 (검색·상세·다운로드·odcloud·표준 오픈API)
│       ├── image-client.ts      # OpenAI GPT Image 이미지 생성 (fect-mcp-server 이식)
│       ├── video-client.ts      # Veo 3.1 영상 생성 — t2v·i2v·연장·참조 (fect-mcp-server 이식)
│       └── media-utils.ts       # 경로 검증·base64 저장 공용 유틸
├── skills/
│   ├── category/                # /social-flow:category — 카테고리·프로파일 관리
│   ├── datago/                  # /social-flow:datago — 공공데이터 조사→수집→시드 기록
│   ├── ingest/                  # /social-flow:ingest — 화면 녹화(+음성)→타임라인 (녹화 제어·STT·씬 경계·키프레임)
│   ├── storyboard/              # /social-flow:storyboard — 조사→씬 설계→이미지→승인
│   ├── produce/                 # /social-flow:produce — 영상 합성 + 채널별 텍스트
│   │   └── references/          #   build-reel.sh·video-template.html·검수 하네스
│   ├── publish/                 # /social-flow:publish — HITL 승인 후 채널 게시
│   └── channel-guide/           # 지식형 — 채널 문법·영상 규격 SoT
├── agents/
│   └── content-reviewer.md      # 게시 전 적대적 검증 (P0 게이트)
└── data/                        # 콘텐츠 데이터 루트 (data/README.md 참조)
```

## 파이프라인

```
/social-flow:category add 재테크          # 1. 카테고리 프로파일 (1회)
/social-flow:ingest 재테크 record         # 1.5 (선택) 화면+음성 녹화→타임라인 — 웹 조사 대체 소스
/social-flow:storyboard 재테크 "7월 환율 변동"   # 2. 조사(또는 타임라인)→스토리보드→[승인]
/social-flow:produce 재테크 20260729-환율       # 3. 영상+채널 텍스트 제작
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

## MCP 툴 표면 (24종)

| 그룹 | 툴 | 백엔드 |
|---|---|---|
| 조사 | `naver_search` | Naver Open API (일 25,000회 무료 — 한국어 1차) |
| 조사 | `serp_web_search` / `serp_news_search` / `serp_naver_search` | SerpApi (무료 250회/월 — 정밀·해외) |
| 공공데이터 | `datago_search` / `datago_detail` / `datago_file_download` | data.go.kr (무인증 — 검색·상세·파일 원본) |
| 공공데이터 | `datago_file_fetch` / `datago_api_call` | odcloud·apis.data.go.kr (인증키 + **API 별 활용신청** 필수) |
| 이미지 생성 | `gpt_image_text2img` / `gpt_image_img2img` | OpenAI GPT Image (OPENAI_API_KEY — 텍스트 렌더링·임의 WIDTHxHEIGHT, 멀티 레퍼런스 16장·마스크 인페인팅) |
| 영상 생성 | `veo_text2video` / `veo_img2video` / `veo_extension` / `veo_reference` | Veo 3.1 (GEMINI_API_KEY — 720p~4k, 비동기 1~6분, mp4 로컬 저장) |
| 게시 | `threads_publish` / `instagram_publish` / `facebook_publish` / `facebook_comment` / `youtube_publish` | 각 플랫폼 API 직접 호출 — **자격증명 파일이 있는 채널만 노출** |
| 받은 댓글 | `sns_comment_inbox` / `sns_comment_reply` / `sns_comment_moderate` | 채널 횡단 정규화 인박스 · 답글 · 숨김(삭제 미제공) |
| 점검 | `sns_account_check` | 토큰 /me 일괄 점검 (토큰 값 비노출) |

게시 툴은 검토 게이트가 없어 **호출 = 즉시 공개 게시**다 — publish 스킬의 HITL
승인 게이트를 반드시 거친다.

이미지·영상 생성 툴은 `fect-mcp-server` 의 gpt-image·video 모듈을 이식한 것이다
(이미지 = OPENAI_API_KEY, 영상 = GEMINI_API_KEY). 음성·BGM 생성(`tts_*` /
`music_*`)은 여전히 별도 서버 **fect-mcp**(사용자 레벨 등록)를 사용하며, 4K·
배너 비율·최저가 이미지가 필요하면 fect-mcp 의 `nanobanana_*`(Gemini)를 쓴다.

## 전제 조건

- Node 20+, ffmpeg, Google Chrome (헤드리스 캡처), python3
- whisper.cpp (`brew install whisper-cpp`) + `~/.cache/whisper-cpp/ggml-large-v3-turbo.bin`
  — ingest(녹화→타임라인) 사용 시. 녹화 모드는 터미널 앱에 **화면 기록·마이크**
  권한(시스템 설정 → 개인정보 보호 및 보안) 필요
- `OPENAI_API_KEY` (platform.openai.com/api-keys) — storyboard 의 씬 이미지
  생성(내장 `gpt_image_*` 툴)에 필수
- `GEMINI_API_KEY` (aistudio.google.com/apikey) — produce 의 영상 생성
  (내장 `veo_*` 툴)에 필수
- `fect-mcp` MCP 서버 (음성 생성 도구 — Gemini TTS·Lyria BGM) —
  없으면 produce 의 내레이션·BGM 생성이 동작하지 않는다
- chrome-devtools MCP (produce §8 폰 모드 검수용 — 선택, 없으면 캡처 스크립트로 대체)
- 게시할 채널의 자격증명 파일 (아래)

> **로드 방식 주의**: 스킬의 MCP 툴 참조(`mcp__social-flow__*`)는 `--plugin-dir`
> 로드 기준이다. 마켓플레이스 설치 시 서버 프리픽스가 달라질 수 있으니 로드 후
> `/mcp` 로 실제 툴 이름을 확인하라. `data/` 는 **플러그인 루트가 아니라 세션
> cwd 기준**으로 생성된다 — 이 레포를 프로젝트 루트로 열고 쓰는 구성이 기본이다.

## 설치

```bash
cd server && npm install && npm run build
```

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
| `GEMINI_API_KEY` (또는 `GOOGLE_API_KEY`) | veo_* 사용 시 | — | Gemini API 키 (aistudio.google.com/apikey — 영상 생성) |
| `SNS_TOKEN_DIR` | | `~/.config/social-flow` | SNS 자격증명 공통 디렉토리 |
| `THREADS_TOKEN_FILE` 외 채널별 | | `<SNS_TOKEN_DIR>/규약 파일명` | 채널별 개별 오버라이드 |

자격증명 파일 규약(600 권한, 커밋 금지) — `threads_token` · `instagram_token` ·
`facebook_page_token` · `youtube-oauth-client.json`. **파일이 있는 채널의 게시
툴만 노출된다.** 발급·갱신 절차는
`skills/publish/references/token-setup.md` 참조.

## 사용 가이드 (docs/guides/)

- **[즉흥 녹화 가이드](docs/guides/ingest-usage/index.html)** — 화면 녹화(+음성)
  → 타임라인 → 스토리보드 → 게시 흐름. 준비·녹화 요령·조정 노브 포함.
- **[촬영 대본 가이드](docs/guides/screencast-usage/index.html)** — 스토리보드
  선행 촬영 흐름. 촬영 수칙·정합 이탈 보고·편집 화면 구성·문제 해결.

## 안전 계약 (요약)

- **HITL 이중 게이트** — 스토리보드 승인(제작 전) + 게시 승인(공개 전).
  승인 없이 게시 툴을 호출하지 않는다.
- **사실 왜곡 금지** — 시효성 값은 독립 출처 2개 교차 검증, 범위는 범위로.
- **크로스포스팅 복붙 금지** — 채널마다 문장을 다시 설계한다.
- **토큰 평문 비노출** — 파일 기반, /me 로 계정 자동 결정.
- **생성 비주얼 제한** — 무드샷·자사 캐릭터 발화만. 실존 인물·국가 상징·보도
  화면 연출 금지.

## 관련 프로젝트

- 파이프라인·게시 클라이언트 원전: `fect-persona` 플러그인
  (`/Volumes/data/repository/astra/fect/fect-persona`)
- 생성 도구 서버: `fect-mcp-server` — gpt-image·video 모듈 이식 원전,
  음성(TTS·Lyria)·nanobanana(Gemini 이미지)는 계속 이 서버 사용
  (`/Volumes/data/repository/astra/fect/fect-mcp-server`)
