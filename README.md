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
├── server/                      # 내부 MCP 서버 (TypeScript, stdio) — 툴 38종
│   └── src/
│       ├── index.ts             # 엔트리 (플랫폼별 게시·인사이트 툴 조건부 노출)
│       ├── tools.ts             # 툴 정의 (조사 5 + 공공데이터 5 + 생성 15 + 게시 4 + 댓글 4 + 인사이트 3 + 검색 1 + 점검 1)
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
│   ├── setup-threads/           # /social-flow:setup-threads — Threads 계정 개설·API 연동 (ego lite HITL — 개설·브랜딩·Meta 앱·60일 토큰, 상태 탐지·재개)
│   │   └── references/          #   setup-playbook.md(ego CDP 레시피·토큰 교환·60일 갱신)
│   ├── setup-instagram/         # /social-flow:setup-instagram — Instagram 계정 개설·API 연동 (ego lite HITL — 프로페셔널 전환·Instagram Login OAuth·60일 토큰)
│   │   └── references/          #   setup-playbook.md(UID 예약변수 함정·테스터 초대 수락 경로)
│   ├── setup-youtube/           # /social-flow:setup-youtube — YouTube 브랜드 채널 개설·API 연동 (ego lite HITL — 고급기능 인증→채널 생성→refresh_token, 여러 날 재개)
│   │   └── references/          #   setup-playbook.md(루프백 리스너·프로덕션 단계 7일 만료 함정)
│   ├── datago/                  # /social-flow:datago — 공공데이터 조사→수집→시드 기록
│   ├── ingest/                  # /social-flow:ingest — 화면 녹화(+음성)→타임라인 (녹화 제어·STT·씬 경계·키프레임)
│   ├── storyboard/              # /social-flow:storyboard — 조사→씬 설계→문안·씬별·어휘 수렴(95점)→이미지→이미지 수렴(95점)→승인
│   ├── produce/                 # /social-flow:produce — 영상 합성 + 플랫폼별 텍스트
│   │   └── references/          #   build-reel.sh·video-template.html·검수 하네스
│   ├── autoproduce/             # /social-flow:autoproduce — 주제 하나로 조사→저작→영상까지 무인 관통 (사람 게이트를 기계 게이트 7개로 대체, 경제 티어 기본)
│   │   └── references/          #   cost-tiers.md(모델 사다리·승급 조건)·prices.tsv(단가 SoT)·cost-report.sh
│   ├── publish/                 # /social-flow:publish — HITL 승인 후 플랫폼 게시
│   ├── grow-threads/            # /social-flow:grow-threads — Threads 자율 성장 루프 1틱 (init 플랜=상시 승인서, /loop 로 반복 — 성장 스킬은 플랫폼별 분리)
│   │   └── references/          #   growth-playbook.md(전술 정본)·growth-plan-template.md(플랜·state 스키마)
│   ├── grow-youtube/            # /social-flow:grow-youtube — YouTube 자율 성장 루프 1틱 (댓글 응대·지표 관찰·대기열 보충 저작·대기열 게시 — queue: ready 를 사람 또는 자동 저작이 찍은 것만)
│   │   └── references/          #   growth-playbook.md(근거 등급 표기 정본)·growth-plan-template.md
│   ├── grow-instagram/          # /social-flow:grow-instagram — Instagram 자율 성장 루프 1틱 (댓글 응대·이탈률/시청 관찰·대기열 보충 저작·대기열 게시 — 릴스는 queue_instagram: ready + 공개 URL 이 있어야만)
│   │   └── references/          #   growth-playbook.md(두 관문·자격 상실 정본)·growth-plan-template.md
│   └── platform-guide/          # 지식형 — 플랫폼 문법·영상 규격·한국어 문체 SoT
│       └── references/          #   platform-playbook.md·korean-style.md·check-style.py(문체 게이트)
├── agents/
│   ├── brand-reviewer.md        # 프로필 이미지·인트로 영상 적대적 평가 (95점/90점 수렴 게이트)
│   ├── content-reviewer.md      # 게시 전 적대적 검증 (P0 게이트)
│   ├── growth-post-reviewer.md  # 성장 루프 문안 적대적 검증 (AI 티·맥락 — 95점 게이트)
│   └── storyboard-reviewer.md   # 스토리보드 적대적 검증 (문안 AI 티 / 씬별 역할·맥락 / 어휘 / 이미지 맥락 — 각 95점 게이트)
└── data/                        # 콘텐츠 데이터 루트 (data/README.md 참조)
```

## 파이프라인

```
/social-flow:channel add 재테크           # 1. 채널 프로파일 (1회)
/social-flow:branding 재테크              # 1.2 (선택) 채널 프로필 이미지 — 4종 후보→HITL 선택→95점 수렴
/social-flow:intro 재테크                 # 1.3 (선택) 채널 인트로 — 컨셉 4종 HITL→veo 4초 생성→90점 수렴 (본편 뒤 접합 클로징)
/social-flow:setup-threads 재테크         # 1.4 (선택) SNS 계정 개설·API 연동 — ego lite HITL (플랫폼별: setup-instagram·setup-youtube)
/social-flow:ingest 재테크 record         # 1.5 (선택) 화면+음성 녹화→타임라인 — 웹 조사 대체 소스
/social-flow:storyboard 재테크 "7월 환율 변동"   # 2. 조사(또는 타임라인)→스토리보드→[승인]
/social-flow:produce 재테크 20260729-환율       # 3. 영상+플랫폼 텍스트 제작
/social-flow:publish 재테크 20260729-환율       # 4. [승인]→게시→permalink 기록
/social-flow:grow-threads 재테크 init          # 5. (선택) Threads 성장 플랜 확정 [승인 — 상시 승인서]
/loop 30m /social-flow:grow-threads 재테크     #    이후 30분 주기 자율 성장 루프 (인박스 답글·인사이트·키워드 참여·판단 게시 — 95점 게이트)
/social-flow:grow-youtube 재테크 init          # 5-b. (선택) YouTube 성장 플랜 확정 [승인 — 상시 승인서]
/loop 1h /social-flow:grow-youtube 재테크      #     이후 1시간 주기 자율 성장 루프 (댓글 응대·지표 관찰·대기열 보충 저작·대기열 게시)
/social-flow:grow-instagram 재테크 init        # 5-c. (선택) Instagram 성장 플랜 확정 [승인 — 상시 승인서]
/loop 1h /social-flow:grow-instagram 재테크    #     이후 1시간 주기 자율 성장 루프 (댓글 응대·이탈률 관찰·대기열 보충 저작·대기열 게시)
```

각 단계는 이전 단계의 산출물을 검사한다 — 스토리보드 미승인이면 produce 가,
제작 미완이면 publish 가 중단하고 이전 단계를 안내한다.

**주제만 주고 영상까지 한 번에** (2~3단계를 사람 승인 없이 관통):

```
/social-flow:autoproduce 재테크 "7월 환율 변동"   # 조사→scenes.js→이미지→TTS→빌드→output
```

승인 게이트 자리에 기계 게이트 아홉이 선다 — 사실 검증(교차검증 통과 3건 이상)·
문체 검사기·storyboard-reviewer 문안 95점·씬별 95점(최저 씬)·어휘 95점(최저 씬)·
이미지 95점·빌드 리포트(drift 0)·content-reviewer P0=0·비용 상한. 모델은
**경제 티어가 기본**이라 Veo 를 한 번도 부르지 않고(정지 배경 + 켄번즈) 편당 약
$0.05 이며, 훅 지표가 임계 아래로 떨어진 경우에만 커버 4초를 `veo-3.1-lite` 로
승급한다. 저작은 **플랫폼 루프당 하루 최대 2편**(하드캡, 성공·실패 포함)이고,
후보 주제는 `check-duplicate.py` 가 채널의 기존 주제 전부와 비교해 말만 바꾼
재탕을 버린다. 사다리·승급 조건·단가는 `skills/autoproduce/references/` 참조.
성장 스킬이 대기열을 스스로 채울 때 부르는 것도 이 스킬이다.

**문체 게이트** — 한국어 텍스트가 나오는 모든 지점(스토리보드 저작, produce 의 TTS
직전·플랫폼 카피, publish 승인 직전, content-reviewer 검증)에서
`check-style.py` 가 AI 티를 결정적으로 판정한다. 번역투·상투구·조수 말투·연결어미
뒤 쉼표를 S1/S2/S3 로 나눠 잡고, S1 이 남으면 게시로 넘어가지 않는다(exit 2).
표면 8종(나레이션·자막·카드 텍스트·플랫폼 4종·댓글)마다 임계와 끄는 규칙이 다르다 —
Threads 반말이나 FB 사례 수집형 마무리처럼 플레이북이 요구하는 격식과 싸우지 않는다.
영상 표면은 `extract-text.js` 가 scenes.js 에서 뽑아 넘긴다. 규칙 SoT 는
`skills/platform-guide/references/korean-style.md`, 판정은 코드가 하고 문장은
에이전트가 고친다.

**스토리보드 수렴 게이트** — 검사기가 규칙으로 잡는 층이 있다면, 그 위층은 사람이
읽어야 느끼는 것들이다. 대구 남용, 3개 나열, 훈계형 마무리, 전부 같은 길이로
낭독되는 리듬. 그림 쪽도 같다 — 해상도는 기계가 보지만 "이 그림이 그 씬이 말하는
내용을 보여주는가"는 봐야 안다. 그래서 storyboard 스킬은 승인 전에 적대적 리뷰어
`storyboard-reviewer` 를 **네 번** 부른다.

| 관문 | 보는 것 | 하드캡 | 통과선 |
|---|---|---|---|
| 문안 모드 (§4.5) | 스토리보드 전체의 문장 | 5라운드 | 총점 ≥95 · P0 0 |
| 씬 모드 (§4.6) | 씬 하나하나의 역할·맥락 | 5라운드 | **최저 씬** ≥95 · P0 0 |
| 어휘 모드 (§4.7) | 나레이션·타이틀의 낱말 | 5라운드 | **최저 씬** ≥95 · P0 0 |
| 이미지 모드 (§5.5) | 생성된 PNG 와 씬의 정합 | 3라운드 | 총점 ≥95 · P0 0 |

씬 관문 둘이 평균이 아니라 **가장 낮은 씬**을 보는 이유는 평균이 무너진 한 씬을 잘
나온 씬들로 가려 주기 때문이다. 순서에도 이유가 있다 — 문장이 바뀌면 그 씬이 보여줄
그림도 바뀌니 이미지가 마지막이고, 빠질 씬의 낱말을 다듬는 건 헛일이니 어휘가 씬별
뒤다. 하드캡에 걸리면 최고 점수 버전과 미해결 지적을 그대로 승인 화면에 실어 사람이
판단한다. autoproduce 의 무인 경로도 같은 게이트를 라운드 2로 돈다(미달이면 저작 중단).

**스토리보드 선행 촬영 흐름** (완성도 있는 시연·튜토리얼용 — 순서가 뒤집힌다):

```
/social-flow:storyboard 재테크 <주제> 촬영 대본으로   # 씬 설계+촬영 대본(script.md)→[승인]
/social-flow:ingest 재테크 record <주제>              # 대본 보며 촬영→전사·씬 정합(alignment.json)
/social-flow:produce 재테크 <주제>                    # 녹화를 잘라 9:16 편집 (육성+실화면, TTS 없음)
/social-flow:publish 재테크 <주제>                    # [승인]→게시
```

## MCP 툴 표면 (38종)

**`tools/list` 에는 38종이 다 보이지 않는다.** 게시·인사이트 툴 9종
(`threads_publish`·`instagram_publish`·`facebook_publish`·`facebook_comment`·
`youtube_publish`·`threads_insights`·`instagram_insights`·`youtube_insights`·
`threads_search`)은 **자격증명 파일이 있는 플랫폼만** 노출된다 — 목록을 요청한 시점에
평가하므로 토큰을 추가하면 서버를 다시 띄우지 않아도 나타난다. 토큰이 하나도 없는
환경에서 세면 29종이다. 숨은 툴도 핸들러는 살아 있어 직접 부르면 토큰 부재 에러가
돌아온다(조용히 실패하지 않는다).

| 그룹 | 툴 | 백엔드 |
|---|---|---|
| 조사 | `naver_search` | Naver Open API (일 25,000회 무료 — 한국어 1차). type 8종: news·blog·web·cafe·kin(지식iN)·image·encyc(백과)·local(지역) |
| 조사 | `serp_web_search` / `serp_news_search` / `serp_naver_search` / `serp_image_search` | SerpApi (무료 250회/월 — 정밀·해외). naver 는 where=web·news·image·video + period 기간 필터, image 는 라이선스·크기·종횡비 필터 |
| 공공데이터 | `datago_search` / `datago_detail` / `datago_file_download` | data.go.kr (무인증 — 검색·상세·파일 원본) |
| 공공데이터 | `datago_file_fetch` / `datago_api_call` | odcloud·apis.data.go.kr (인증키 + **API 별 활용신청** 필수) |
| 이미지 생성 | `image_local_generate` | Z-Image Turbo 온디바이스, mflux/MLX (**API 키·네트워크·과금 없음 — 기본 경로**. Apple Silicon + `uv tool install --python 3.12 mflux` 필요, 최초 호출 시 가중치 31GB 다운로드. 텍스트 포함 이미지 금지 — 한글 자소가 깨진다) |
| 이미지 생성 | `gpt_image_text2img` / `gpt_image_img2img` | OpenAI GPT Image (OPENAI_API_KEY — **텍스트 포함·고품질 경로**: 텍스트 렌더링·임의 WIDTHxHEIGHT, 멀티 레퍼런스 16장·마스크 인페인팅) |
| 영상 생성 | `veo_text2video` / `veo_img2video` / `veo_extension` / `veo_reference` | Veo 3.1 (GEMINI_API_KEY — 720p~4k, 비동기 1~6분, mp4 로컬 저장) |
| 음성 생성 | `tts_generate` / `tts_multi_speaker` / `tts_list_voices` | Gemini TTS (GEMINI_API_KEY — 보이스 30종, 언어 자동 감지, wav 모노 24kHz 저장) |
| 음성 생성 | `tts_local_generate` | Supertonic 3 온디바이스 (**API 키·네트워크 없음** — 보이스 10종, 언어 31종 명시 지정, wav 모노 44.1kHz. 로컬 python + `pip install supertonic` 필요) |
| 음악 생성 | `music_generate_clip` / `music_generate` / `music_generate_advanced` / `music_list_options` | Lyria 3 Clip(30초 고정 mp3 — BGM 기본 경로) · Lyria RealTime(5~300초 가변 wav 48kHz, seed 재현) |
| 게시 | `threads_publish` / `instagram_publish` / `facebook_publish` / `facebook_comment` / `youtube_publish` | 각 플랫폼 API 직접 호출 — **자격증명 파일이 있는 플랫폼만 노출** |
| 받은 댓글 | `sns_comment_inbox` / `sns_comment_reply` / `sns_comment_moderate` | 플랫폼 횡단 정규화 인박스 · 답글 · 숨김(삭제 미제공). 인박스·답글은 4플랫폼, 숨김은 YouTube 제외(API 가 주는 건 의미가 다른 검토 보류뿐) |
| 점검 | `sns_account_check` | 토큰 /me 일괄 점검 (토큰 값 비노출) |
| 성장 조회 | `threads_insights` / `threads_search` | Threads 인사이트(계정·게시물 지표)·공개 게시물 키워드 검색 — grow-threads 전용 (`threads_manage_insights`·`threads_keyword_search` 스코프) |
| 성장 조회 | `youtube_insights` | 채널 통계 + Analytics 기간 지표(조회·engagedViews·평균 시청 비율·구독 증감) + 영상별 지표 — grow-youtube 전용 (`youtube.readonly`·`yt-analytics.readonly` 스코프, 데이터 2~3일 지연) |
| 성장 조회 | `instagram_insights` | 계정 구간 지표(도달·조회·프로필 방문·저장) + 미디어별 지표 — 릴스에만 `reels_skip_rate`·`ig_reels_avg_watch_time` 이 붙는다(훅·유지 판정). grow-instagram 전용 (`instagram_business_manage_insights` 스코프, 팔로워 수는 프로필 필드) |

검색 툴(`*_search`)은 인자 이름이 같다 — **`query`(검색어) · `limit`(결과 수) ·
`page`(페이지)**. 백엔드 API 가 `q`·`display`·`num`·`start` 중 무엇을 쓰든 환산은
서버가 맡는다. 계약 테스트가 이 규약을 강제하므로 새 검색 툴도 같은 이름을 쓴다.

게시 툴은 검토 게이트가 없어 **호출 = 즉시 공개 게시**다 — publish 스킬의 HITL
승인 게이트를 반드시 거친다. 유일한 예외는 성장 스킬(grow-threads·grow-youtube·
grow-instagram)의 자율 모드로, init 에서 HITL 로 승인한 `growth-plan.md`(상시
승인서) 범위 안에서만 게시별 승인 없이 게시한다. grow-threads 는 게시 빈도를
개수 상한 없이 스스로 판단하는 대신, 나가는 모든 문안을 적대적 리뷰어
(growth-post-reviewer)에 통과시켜 95점 이상·P0 0건일 때만 게시한다(통과선은 2026-08-12
에 90 으로 내렸다가 2026-08-13 사용자 지시로 95 에 복귀했다 — P0 조건은 그대로다). 영상 플랫폼 둘은 여기에 방어선을
하나 더 둔다 — storyboard.md 에 대기열 마커가 찍힌 것만 나가며, 마커는 플랫폼별로
분리돼 있다(YouTube `queue: ready` · Instagram `queue_instagram: ready`).
같은 키를 공유하면 먼저 도는 루프가 마커를 소진해 다른 쪽이 영영 게시하지 못한다.
마커를 찍는 주체는 둘이다 — 사람이 직접 찍거나 플랜에서 `autoproduce` 를 켠
경우 대기열이 마를 때 루프가 스스로 한 편을 만들어 찍는다. 자동 저작분은 기계
게이트 아홉(사실 검증·문체·storyboard-reviewer 문안/씬별/어휘/이미지·
빌드 리포트·content-reviewer P0·비용 상한)을 전부 통과한 것만 `ready` 가 되고,
하나라도 떨어지면 `hold` 로 남아 사람을 기다린다.
grow-instagram 은 공개 HTTPS URL 이 있어야만 게시하고, 호스팅이 없으면 게시
단계와 자동 저작을 함께 끈다(자율 루프가 임시 터널을 띄우지 않으므로, 나갈 길이
없는 영상을 돈 들여 만들지도 않는다).

생성 툴 13종은 `fect-mcp-server` 의 gpt-image·video·tts·music 모듈을 이식한 것으로,
**외부 MCP 서버 없이 이 플러그인 단독으로 동작한다**. 키는 둘이다 — 이미지는 OPENAI_API_KEY,
영상·음성·음악은 GEMINI_API_KEY. 4K·배너 비율·최저가 이미지가 필요한
경우에만 별도 서버 fect-mcp 의 `nanobanana_*`(Gemini)를 선택적으로 쓸 수 있다.

음성·음악 이식 시 확인한 사항:

- **나레이션 본문은 `tts_local_generate`(로컬), 연기가 필요한 컷만 `tts_generate`(Gemini).**
  이 맥에서 잰 값으로 Supertonic 은 CPU 만 써서 실시간 6.3배, 회차당 비용이 0이다.
  대신 스타일·감정 지시 인자가 없어서 인트로 멘트나 캐릭터 대사는 Gemini 쪽이어야
  한다. 근거와 상용 API 13종 비용 비교는
  [로컬 TTS와 상용 API](docs/research/2026-08-11-local-tts-and-commercial-api/index.html).
- **두 엔진의 샘플레이트가 다르다 — 로컬 44.1kHz, Gemini 24kHz.** 한 영상 안에서
  섞으려면 리샘플링이 필요하다. `tts_local_generate` 는 응답에 오디오 길이를 담아
  주므로 씬 길이 검사에 ffprobe 를 따로 부르지 않아도 된다.
- **BGM 기본 경로는 `music_generate_clip`**(Lyria 3, 30초 고정 · 클립당 약 $0.04).
  정확한 길이(내레이션 맞춤)나 seed 재현이 필요할 때만 `music_generate` 계열을 쓴다.
- **다중 화자(`tts_multi_speaker`)는 flash 모델에서 짧은 대화 스크립트가 자주 거절된다**
  (`Model tried to generate text…`). 서버가 3회 자동 재시도하며 그래도 실패하면
  `model: "gemini-2.5-pro-preview-tts"` 로 바꾸면 통과한다 (실측 확인).
- Lyria 는 프롬프트 정책 필터가 예민하다 — "lo-fi/vinyl crackle" 조합이 차단된
  사례가 있으며 악기·분위기를 평이하게 서술하면 통과한다.

## 전제 조건

- Node 20+, ffmpeg, Google Chrome (헤드리스 캡처), python3
- `pip install supertonic` — `tts_local_generate`(로컬 음성) 사용 시. 최초 호출에서
  가중치 385MB 를 `~/.cache/supertonic3` 에 내려받는다(약 24초). 가상환경에 깔았으면
  `SUPERTONIC_PYTHON` 으로 인터프리터를 지정한다. 코드는 MIT, **가중치는 OpenRAIL-M**
  (상업 이용 가능하되 용도 제한 조항이 붙는다)
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
| `GEMINI_API_KEY` (또는 `GOOGLE_API_KEY`) | veo_* · tts_generate · tts_multi_speaker · music_* 사용 시 | — | Gemini API 키 (aistudio.google.com/apikey — 영상·음성·음악 생성 공통. `tts_local_generate` 는 이 키가 없어도 된다) |
| `SUPERTONIC_PYTHON` | | `python3` | 로컬 TTS 를 실행할 Python 인터프리터. 가상환경에 설치했으면 그 경로를 지정한다(예: `~/venvs/tts/bin/python`). venv 자동 탐색은 하지 않는다 — 저장소마다 다른 환경을 조용히 집어 목소리가 바뀌는 사고를 막는다 |
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
- **[스레드 성장 베스트 프랙티스](docs/guides/threads-growth/index.html)** —
  게시물 단위 심사·랭킹 5신호·스하리 문화. grow-threads 의 해설판.
- **[유튜브 쇼츠 성장 베스트 프랙티스](docs/guides/youtube-shorts-growth/index.html)** —
  AI 고지 경계선·2027년 YPP 개편·공식 문서가 부정하는 통념. grow-youtube 의 해설판.
- **[인스타그램 릴스 성장 베스트 프랙티스](docs/guides/instagram-growth/index.html)** —
  계정 자격과 게시물 오디션이라는 두 관문·랭킹이 실제로 예측하는 항목·검증에서
  죽은 통념 9개. grow-instagram 의 해설판.

## 안전 계약 (요약)

- **HITL 이중 게이트** — 스토리보드 승인(제작 전) + 게시 승인(공개 전).
  승인 없이 게시 툴을 호출하지 않는다. 스토리보드 승인 앞에는 적대적 수렴 게이트
  둘(문안·이미지, 각 95점·P0 0건)이 선다.
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
