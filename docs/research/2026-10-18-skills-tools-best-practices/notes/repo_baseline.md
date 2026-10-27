# social-flow 저장소의 스킬·MCP 툴 작성 현황 기준선 (2026-10-18 측정)

측정 대상: `/Users/zeans/orca/workspaces/social-flow/marakihau` (브랜치 `skills-tools-best-practices`, HEAD `08ee1a3`, `server/dist`와 `server/src/tools.ts`의 마지막 커밋은 둘 다 `f44cbbe`). 모든 수치는 아래에 적은 명령으로 직접 셌다. 출처 표기는 URL 대신 `파일:줄` 또는 실행한 명령이다. 측정 스크립트는 스크래치패드(`/private/tmp/claude-501/-Users-zeans-orca-workspaces-social-flow-marakihau/e733eee1-e210-4bb6-b673-26812193d046/scratchpad/`)의 `skills2.py`·`links.py`·`astra13.py`·`tools.mjs`·`tools2.mjs`에 있다.

측정 방법 요약
- 스킬: `skills/*/SKILL.md` 21개의 frontmatter를 정규식으로 파싱(저장소에 PyYAML 없음). description은 `>` 접힘 블록 기호를 떼고 줄을 공백으로 이어 붙여 글자 수를 셌다. body는 frontmatter 닫는 `---` 뒤의 줄 수(`body.count('\n')`)와 공백 기준 단어 수.
- 툴: 워크트리에 `server/node_modules`가 없어 `server/dist`를 그대로 import할 수 없었다. 저장소를 스크래치패드로 rsync(`data/`·`.git` 제외)하고 다른 워크트리(`snaggletooth/server/node_modules`)를 심볼릭 링크로 빌려 `dist/tools.js`의 `TOOLS`와 `dist/handlers.js`의 `ROUTES`를 읽었다. 재빌드는 하지 않았다.
- `skill-lint.js --list`도 같은 미러에서 실행했다(워크트리에서 직접 실행하면 `ERR_MODULE_NOT_FOUND: zod`).

## 1. 스킬 구조와 크기 (SKILL.md, references, scripts, _shared, agents)

### Takeaway
스킬 21개 중 20개가 `name·description·argument-hint·allowed-tools` 네 필드만 쓰고, SKILL.md 본문은 중앙값 192줄이지만 `produce` 한 개가 1,341줄(전체 본문 줄의 22%)로 극단값이다. 실행 코드 142개는 전부 `references/` 안에 들어 있고 `scripts/` 디렉터리는 하나도 없다. reference 문서 109개 중 49개가 `storyboard`에 몰려 있다.

### Cited Findings
- 스킬 수 21개(`skills/*/SKILL.md`), 공유 폴더 `skills/_shared/`는 SKILL.md 없이 파일 24개(문서 .md 8개 + js/json/d.ts 16개) — `ls skills/_shared | wc -l`, `ls skills/_shared/*.md | wc -l`
- 스킬별 측정표 — `python3 scratchpad/skills2.py`

| skill | frontmatter 필드 | desc 글자(한글 글자) | body 줄 | body 단어 | refs .md 파일 / 총 줄 / 최대 파일 줄 | 코드 파일 (refs 안 / 스킬 전체) | refs 기타 파일 | allowed-tools 수 (mcp) |
|---|---|---|---|---|---|---|---|---|
| autoproduce | name, description, argument-hint, allowed-tools | 408 (20) | 103 | 953 | 6 / 1679 / 1029 | 8 / 8 | 1 | 42 (33) |
| branding | 동일 4필드 | 779 (24) | 157 | 1135 | 0 / 0 / 0 | 0 / 0 | 1 | 10 (3) |
| channel | 동일 4필드 | 563 (32) | 302 | 2569 | 6 / 750 / 236 | 8 / 8 | 16 | 13 (7) |
| datago | 동일 4필드 | 474 (35) | 121 | 1020 | 0 / 0 / 0 | 0 / 0 | 0 | 14 (6) |
| edit-speech | 동일 4필드 | 394 (14) | 96 | 1001 | 0 / 0 / 0 | 0 / 0 | 0 | 15 (15) |
| grow-instagram | 동일 4필드 | 672 (19) | 382 | 3069 | 2 / 593 / 356 | 0 / 0 | 0 | 28 (19) |
| grow-threads | 동일 4필드 | 785 (17) | 653 | 5996 | 3 / 841 / 508 | 1 / 1 | 0 | 17 (10) |
| grow-youtube | 동일 4필드 | 743 (17) | 515 | 4805 | 2 / 570 / 300 | 0 / 0 | 0 | 29 (20) |
| ingest | 동일 4필드 | 787 (45) | 192 | 1597 | 1 / 164 / 164 | 3 / 3 | 0 | 7 (1) |
| inspect-content | 동일 4필드 | 444 (26) | 96 | 1059 | 1 / 42 / 42 | 0 / 0 | 0 | 5 (5) |
| intro | 동일 4필드 | 719 (27) | 285 | 2233 | 1 / 275 / 275 | 1 / 1 | 2 | 17 (10) |
| platform-guide | name, description | 408 (27) | 113 | 1197 | 4 / 1219 / 650 | 10 / 10 | 0 | 0 (0) |
| produce | 동일 4필드 | 770 (20) | 1341 | 16758 | 26 / 4320 / 974 | 57 / 57 | 3 | 53 (46) |
| project-init | 동일 4필드 | 430 (28) | 106 | 933 | 1 / 73 / 73 | 0 / 0 | 0 | 12 (6) |
| publish | 동일 4필드 | 486 (22) | 508 | 4960 | 2 / 296 / 149 | 0 / 0 | 0 | 9 (3) |
| review-recent | 동일 4필드 | 356 (29) | 60 | 481 | 0 / 0 / 0 | 0 / 0 | 0 | 6 (1) |
| setup-instagram | 동일 4필드 | 670 (29) | 184 | 1371 | 1 / 151 / 151 | 0 / 0 | 0 | 8 (2) |
| setup-threads | 동일 4필드 | 588 (28) | 193 | 1586 | 1 / 177 / 177 | 0 / 0 | 0 | 8 (2) |
| setup-youtube | 동일 4필드 | 646 (30) | 210 | 1594 | 1 / 147 / 147 | 0 / 0 | 0 | 8 (2) |
| storyboard | 동일 4필드 | 408 (22) | 240 | 2290 | 49 / 15330 / 3736 | 52 / 52 | 10 | 28 (19) |
| topic-scout | 동일 4필드 | 704 (48) | 188 | 1790 | 2 / 250 / 162 | 2 / 2 | 1 | 8 (3) |

- 분포(최소 / 중앙값 / 최대 / 합) — `skills2.py` 출력
  - description 글자 수: 356 / 588 / 787 / 12,234 (1,024자 초과 0개)
  - SKILL.md 본문 줄: 60 / 192 / 1,341 / 6,045
  - SKILL.md 본문 단어: 481 / 1,594 / 16,758 / 58,397
  - references .md 파일 수: 0 / 1 / 49 / 109, 총 줄: 0 / 250 / 15,330 / 26,877
  - 코드 파일 수: 0 / 0 / 57 / 142
  - allowed-tools 항목 수: 0 / 12 / 53 / 337
- 본문 500줄 초과 스킬 4개: `produce` 1,341, `grow-threads` 653, `grow-youtube` 515, `publish` 508 — `skills2.py`
- 쓰지 않는 frontmatter 필드: `when_to_use`, `disable-model-invocation`, `user-invocable`, `paths`, `model`, `effort`, `context`는 21개 스킬 어디에도 없다 — `skills2.py`의 fields 열
- 코드 위치: 142개 코드 파일 모두 `references/` 안(스킬별 "refs 안"과 "전체"가 모두 같음). `find skills -type d -name scripts | wc -l` = 0. 스킬 하위 디렉터리는 `references` 18개, `assets` 1개(`storyboard`)뿐 — `find skills -maxdepth 2 -mindepth 2 -type d`
- `storyboard`의 파일 구성: md 51, js 47, html 8, png 5, py 3, json 2 등 — `find skills/storyboard -type f | sed 's/.*\.//' | sort | uniq -c`
- `produce`의 파일 구성: js 34, md 27, sh 10, mjs 6, py 5, html 3, ts 2 — 같은 명령
- `channel/references`는 woff2 폰트 6개(최대 `NotoSansSCVariable.woff2` 7.8MB)와 css·txt를 포함해 비문서 파일이 16개다 — `find skills/channel/references -type f -size +200k`
- 가장 큰 reference 문서: `storyboard/references/scenes-schema.md` 3,736줄, `storyboard/references/legacy-reviewer.md` 1,601줄, `storyboard/references/legacy-authoring.md` 1,350줄, `autoproduce/references/legacy-unattended.md` 1,029줄, `produce/references/video-model-selection.md` 974줄 — `find skills -path '*/references/*.md' -exec wc -l {} + | sort -n | tail -6`. 상위 5개 중 3개가 `legacy-*` 파일이다.
- `_shared` 문서 크기: `host-review.md` 44줄 ~ `model-settings.md` 213줄 — `grep -c '' skills/_shared/*.md`. `automation-guidance.md`는 SKILL.md 20개가 링크한다 — `grep -l 'automation-guidance.md' skills/*/SKILL.md | wc -l`
- H1 앞 서문(preamble): SKILL.md 대부분이 frontmatter 직후, 제목(H1) 전에 정책 문단을 둔다. `produce`는 19줄(`skills/produce/SKILL.md:8-26`, H1은 27행), `publish` 9줄, `branding`·`intro` 8줄, `channel`·`topic-scout` 6줄 — `awk`로 frontmatter 끝과 첫 `# ` 줄 비교
- YAML 주석을 frontmatter 안에 쓰는 관행: `grow-instagram`(8줄, `skills/grow-instagram/SKILL.md:13-20`), `grow-youtube`(8줄), `grow-threads`(5줄), `publish`(3줄, `skills/publish/SKILL.md:11-13`) — 게시 툴 사전 승인 예외 이유를 적어 둔다
- 에이전트 5개(`agents/*.md`) — `skills2.py`의 AGENTS 블록

| agent | frontmatter | description 글자 (한글) | body 줄 / 단어 | tools |
|---|---|---|---|---|
| brand-reviewer | name, description, tools, color | 1,929 (0) | 156 / 1,192 | Read, Grep, Glob, Bash |
| content-reviewer | 동일 | 1,784 (0) | 385 / 3,919 | 동일 |
| growth-post-reviewer | 동일 | 1,501 (0) | 198 / 2,073 | 동일 |
| slide-reviewer | 동일 | 2,836 (0) | 203 / 2,281 | 동일 |
| storyboard-reviewer | 동일 | 430 (0) | 144 / 1,342 | 동일 |

  에이전트는 모두 읽기 전용 리뷰어이고 `model` 필드는 없다. description은 스킬보다 길고(최대 2,836자) `<example>` 블록을 품는다(시스템이 노출한 에이전트 설명에서 확인).

### Inferences
- 크기 분포는 "대부분 작고 몇 개가 매우 큰" 형태다. 상위 4개(500줄 초과)가 본문 줄의 약 50%(3,017/6,045)를 차지한다.
- `references/`가 문서·실행 코드·폰트·HTML 템플릿을 한데 담는 다목적 폴더로 쓰인다. 공식 관행의 `scripts/`·`assets/` 분리는 `storyboard/assets` 한 곳만 따른다.
- `legacy-*` 대형 문서 세 개가 여전히 참조 트리에 있어, 새 계약과 옛 계약이 같은 스킬 폴더에 공존한다.

### Gaps
- reference 파일이 실제로 한 세션에서 몇 개나 열리는지(런타임 로드량)는 정적 측정으로 알 수 없다.
- 단어 수는 공백 분할 기준이라 코드 블록·표가 많은 문서에서는 산문 분량을 과대평가한다.

## 2. description 작성 스타일 (트리거 vs 워크플로 요약, 언어)

### Takeaway
21개 description 전부가 3인칭 동사로 시작하는 한 줄 정체 요약 → `Use when`(1개는 `Use for`) 트리거 문장 → 워크플로·경계 설명의 3단 구조다. 글자 수 기준으로 트리거 앞 13%, 트리거 문장 26%, 트리거 뒤 워크플로 요약 60%이다. 언어는 영어이고, 한국어는 따옴표 안 트리거 문구에만 나온다(전체 비공백 글자의 3~8%).

### Cited Findings
- 21개 모두 `description: >` 접힘 블록을 쓴다 — `astra13.py` 항목 c2 ("block >" 21/21)
- `Use when`/`Use for` 포함 21/21. `project-init`만 `Use for "프로젝트 초기 설정", ...` 형태 — `skills2.py`, `skills/project-init/SKILL.md:3-`
- 구성 비율: 트리거 앞(정체 요약) 13%, 트리거 문장 26%, 트리거 뒤 60% — `Use (when|for)` 위치와 그 문장 끝(따옴표 밖 첫 마침표)으로 분할한 스크래치패드 스크립트. 트리거 뒤 길이는 `platform-guide` 56자 ~ `grow-threads` 589자
- 따옴표로 묶은 트리거 문구 수: 스킬당 3~9개 — 같은 스크립트
- description의 한글은 트리거 인용 안에만 있다. 한글 글자 수 14(`edit-speech`)~48(`topic-scout`), 비율 3~8% — `astra13.py` c2
- 첫 76자가 정체를 담도록 쓰는 관행과 그 이유: codex-cli가 description을 약 76자에서 자른다고 측정해 기록 — `skills/platform-guide/references/skill-lint.js:10-15`, 상수 `CODEX_VISIBLE = 76` (`skill-lint.js:41`). 첫 76자 중복 금지·"This skill should be used" 같은 리드인 금지 규칙 — `skill-lint.js:268-275`
- 대표 예시(원문 그대로)
  - `produce`: "Builds the video and the per-platform text from an already-approved storyboard. Use when the user asks to "영상 만들어", "콘텐츠 제작", "produce the video", "플랫폼별 콘텐츠 만들어", or right after a storyboard is approved. Turns the approved scenes.js under data/[channel]/episodes/[topic]/storyboard/ into a narrated 9:16 video at 1080x1920/30fps — generated backgrounds, TTS narration, BGM with ducking, clean speech video, brand outro — plus the Threads, Instagram, Facebook and YouTube text … Boundary — storyboard plans and stops for approval, produce starts after it, autoproduce runs both unattended." — `skills/produce/SKILL.md:3-4`
  - `platform-guide`: "The per-platform writing rules, video specs and safe zones. Knowledge only, nothing runs. Use when the user asks about "플랫폼 문법", … or when another social-flow skill needs the posting limits, caption rules, video specs or safe-zone numbers. The source of truth is references/platform-playbook.md." — `skills/platform-guide/SKILL.md:3-8`
  - `publish`: "Posts finished episode files to Threads, Instagram, Facebook and YouTube. Use when the user asks to "게시해", "올려줘", … Takes the per-platform content … through account checks and public media hosting, stops at a mandatory human approval gate, publishes … as an immediate public post, and records the permalinks in publish-log.md." — `skills/publish/SKILL.md:3-9`
  - `review-recent`: "Reports how the last few published videos did on YouTube and Instagram. Use when the user asks to "최근 영상 피드백", … Calls content_feedback for the last 5 posts per platform, writes a chart-first HTML report under data/[channel]/growth/review-recent.html, and opens it." — `skills/review-recent/SKILL.md:3-`
  - `grow-threads`: "Runs one autonomous Threads growth tick — reply, join conversations, post. Use when … One tick replies to inbox comments (golden hour first), snapshots insights, joins keyword conversations … Every outgoing text clears the configured review gates (zero P0) before it goes out, inside the standing authorization in data/[channel]/growth/threads/growth-plan.md. Recur with /loop [interval] /social-flow:grow-threads [channel]. First run needs the init argument." — `skills/grow-threads/SKILL.md:3-13`
- 형제 스킬 경계를 description에 직접 적는 패턴: `produce`("Boundary — storyboard plans…"), `storyboard`("Produce builds an approved board; autoproduce runs both unattended."), `autoproduce`("Storyboard stops at a plan; produce builds an existing approved board.") — 각 SKILL.md 3행 부근
- 툴 description(서버)도 영어가 기본이고, 104개 중 18개에만 한글이 섞인다 — `tools2.mjs` ("Korean chars in description 18")

### Inferences
- 트리거 조건은 명확히 적혀 있지만, 글자 예산의 60%는 "무엇을 어떻게 하는지" 워크플로 설명이다. description이 트리거 판단용 텍스트와 절차 요약을 겸한다.
- `grow-threads` description의 "clears the configured review gates (zero P0)"는 CLAUDE.md의 2026-10-16 지침("review scores … not automatic execution gates", `CLAUDE.md:5-12`)과 표현이 어긋나 보인다. 실제 동작 차이인지 문구가 덜 갱신된 것인지는 본문까지 대조하지 않았다.

### Gaps
- description이 실제 라우팅(자동 호출) 정확도에 어떤 영향을 주는지는 측정 수단(평가 로그)이 저장소에 없어 확인하지 못했다.
- 트리거 문장 경계는 휴리스틱(따옴표 밖 첫 마침표)으로 잘랐으므로 비율은 ±수 % 오차가 있을 수 있다.

## 3. 규칙 밀도와 교차 참조 부담

### Takeaway
SKILL.md에는 대문자 `MUST/NEVER/ALWAYS`나 한국어 `절대/반드시/금지`가 한 번도 없다(본문이 영어). 대신 소문자 `never`·`do not`과 번호 붙은 "Absolute rules" 섹션이 규칙을 싣는다. `produce`는 서로 다른 .md 링크 54개, "Read/Follow/Apply [문서]" 지시 33개를 갖고, 행동 전에 먼저 읽으라는 문서가 최소 5개다.

### Cited Findings
- 지시어 빈도(SKILL.md 본문 전체 대상, 정규식 단어 경계) — `python3 scratchpad/links.py`

| skill | MUST | NEVER | ALWAYS | must | never | do not/don't | "absolute rule" | 절대/반드시/금지 | require(s/d) | refuse/reject |
|---|---|---|---|---|---|---|---|---|---|---|
| produce | 0 | 0 | 0 | 10 | 32 | 46 | 7 | 0/0/0 | 18 | 8 |
| publish | 0 | 0 | 0 | 5 | 8 | 28 | 2 | 0/0/0 | 7 | 1 |
| grow-threads | 0 | 0 | 0 | 7 | 10 | 23 | 6 | 0/0/0 | 4 | 1 |
| grow-youtube | 0 | 0 | 0 | 1 | 14 | 20 | 7 | 0/0/0 | 0 | 1 |
| grow-instagram | 0 | 0 | 0 | 2 | 5 | 18 | 4 | 0/0/0 | 0 | 0 |
| storyboard | 0 | 0 | 0 | 0 | 2 | 17 | 0 | 0/0/0 | 2 | 0 |
| topic-scout | 0 | 0 | 0 | 1 | 4 | 22 | 0 | 0/0/0 | 0 | 0 |
| autoproduce | 0 | 0 | 0 | 1 | 1 | 10 | 0 | 0/0/0 | 2 | 0 |

- "## Absolute rules" 섹션이 있는 스킬 8개와 번호 항목 수 — `awk`로 섹션 범위 측정
  - `produce`: 67-192행(126줄), 번호 규칙 16개, 번호 목록 앞에 별도 문단 7개(`skills/produce/SKILL.md:67-74`)
  - `publish`: 39-134행(96줄), 11개
  - `grow-youtube`: 55줄, 9개 / `grow-instagram`: 51줄, 9개 / `grow-threads`: 30줄, 6개
  - `setup-instagram`·`setup-threads`·`setup-youtube`: 18~22줄, 각 5개
- 본문 다른 곳에서 번호로 규칙을 호출: "absolute rule 13", "absolute rules 11·12", "absolute rule 10", "absolute rule 14" — `skills/produce/SKILL.md:300,337,459,680,700,1160`
- 날짜 박힌 지시(ISO 날짜) 수: `produce` 27, `publish` 6, `grow-threads` 5(본문), 나머지 0~1 — `grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}'`. 예: "**Owner directive (2026-10-17): every delivered video is subtitle-free, including speech.** This supersedes older burned-subtitle exceptions and rendering recipes below." — `skills/produce/SKILL.md:28-30`, "**New authoring contract (2026-10-16):** Read [character-led scenarios](...) first." — `skills/produce/SKILL.md:26`
- "supersede" 문구는 SKILL.md 18개에 나온다(공통 서문 "This policy supersedes older quality-gate…" 포함, `produce`는 2회) — `grep -oi supersed`
- 교차 참조(서로 다른 .md 링크/백틱 경로) — `links.py`

| skill | 고유 .md 링크 | 자기 refs | 다른 스킬 refs | _shared | "Read [..] first/at entry/before" | Read/Follow/Apply/Use [..](.md) 지시 |
|---|---|---|---|---|---|---|
| produce | 54 | 22 | 27 | 5 | 5 | 33 |
| storyboard | 28 | 18 | 6 | 4 | 0 | 14 |
| autoproduce | 14 | 3 | 9 | 2 | 0 | 5 |
| channel | 13 | 7 | 3 | 3 | 1 | 5 |
| inspect-content | 8 | 1 | 5 | 2 | 1 | 4 |
| edit-speech | 7 | 0 | 2 | 5 | 1 | 5 |
| 나머지 15개 | 1~6 | 0~4 | 0~4 | 1~3 | 0~1 | 1~2 |

- `produce`가 "먼저 읽으라"고 지시하는 문서 5개: `../_shared/automation-guidance.md`(first), `../storyboard/references/character-scenarios.md`(first), `../storyboard/references/production-mode.md`(at entry), `../_shared/model-settings.md`(before), `references/cinematic-edit.md`(before) — `grep -oE '[Rr]ead \[[^]]+\]\([^)]+\)[^.]{0,40}(first|at entry|before)' skills/produce/SKILL.md`
- `produce` 서문 19줄(`skills/produce/SKILL.md:8-26`)은 거의 매 줄이 다른 문서 링크다(motion-graphics, host-review, video-routing, narration-visual-grounding, action-direction, shot-continuity, evals, automation-guidance, prop-continuity, character-scenarios).
- 다른 스킬의 references를 직접 링크하는 비중: `produce`의 고유 링크 54개 중 27개가 `../storyboard/references/…` 등 타 스킬 문서 — `links.py`

### Inferences
- 규칙 강도는 대문자 강조 대신 섹션 제목("Absolute rules")과 번호 체계로 표현된다. 번호 규칙을 본문에서 번호로 다시 호출하므로(규칙 13 등) 번호 재배열이 본문 참조를 깨뜨릴 위험이 있다.
- `produce`와 `storyboard`가 사실상 하나의 문서 그래프를 공유한다. `produce`를 수행하려면 `storyboard/references`의 여러 문서를 함께 읽어야 한다.
- 날짜 박힌 "supersedes … below" 지시가 위에 쌓이는 방식이라, 본문 아래쪽에는 대체된 옛 지시가 남아 있는 구조다(`produce/SKILL.md:29`가 스스로 "older … recipes below"라고 밝힘).

### Gaps
- 실행 한 번에 필요한 "필수 선행 읽기" 총량(링크를 재귀로 따라간 줄 수)은 조건 분기가 많아 정적으로 계산하지 않았다.
- `do not`·`never` 집계에는 코드 블록 안 문자열과 인용도 섞여 있다.

## 4. MCP 툴 표면 (개수, 이름, description, 스키마, 주석, 에러, 대용량 응답)

### Takeaway
툴은 104개이고 `TOOLS`(정적 배열)와 `ROUTES`(핸들러 맵)가 1:1로 맞는다. 모든 툴에 `title`과 `annotations`가 있고 17개가 `outputSchema`를 선언한다. 입력 스키마는 `tools.ts`에 손으로 쓴 JSON Schema이고, 런타임 검증은 핸들러의 별도 zod 스키마(`parseArgs`)가 맡는다. 툴 정의 JSON 전체는 약 45.8만 자이며, 그중 `storyboard_apply` 한 개의 inputSchema가 68,613자다.

### Cited Findings
- 등록 방식: 저수준 `Server` + `setRequestHandler(ListToolsRequestSchema/CallToolRequestSchema)`. `McpServer.registerTool`이 아니다 — `server/src/index.ts:2-4,19-22,31,44`
- 정의 위치: `export const TOOLS: Tool[] = [` — `server/src/tools.ts:1100`(파일 5,277줄). 핸들러: `server/src/handlers.ts`(1,567줄)의 `ROUTES`
- 개수: `TOOLS` 104, `ROUTES` 104, 중복 이름 0, 한쪽에만 있는 이름 0 — `node scratchpad/tools.mjs`
- 이름 규칙: snake_case에 밑줄 1개 이상(`/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/`), 테스트로 강제 — `server/test/contract.test.mjs:114-116`. 접두어별 개수: tts 13, astra 9, blender 7, serp 5, datago 5, mlx 5, threads 5, sns 5, veo 4, omni 4, music 4, suno 4, youtube 4, video 4, seedance 3, storyboard 3, gpt 2, instagram 2, facebook 2, 그 외 1개짜리 14종(host, character, location, stock, naver, image, sfx, stt, project, capability, content, speech, acting, scenario) — `tools.mjs`. 접두어는 공급자(veo, seedance, suno, serp, gpt…)와 도메인(storyboard, project, speech, location…)이 섞여 있다.
- 다중 동작 툴: `action`/`operation`/`mode`/`level`/`source` enum으로 동작을 고르는 툴 11개 — `tts_route:action`, `host_review:action`, `character_voice_audition:action`, `location_manage:action`, `tts_list_voices:source`, `project_manage:action`, `sns_comment_moderate:action`, `speech_manage:action`, `acting_review:mode`, `storyboard_read:level`, `video_plan:operation` — `tools2.mjs`
- description 길이: 최소 178(`threads_draft_create`) / 중앙값 966 / 최대 3,743(`astra_audio2video`), 합 113,340자 — `tools.mjs`. 상위: `seedance_reference` 3,667, `storyboard_apply` 2,933, `astra_img2video` 2,696, `astra_text2video` 2,670, `blender_pose_key` 2,260
- description 내용 패턴(104개 중) — `tools2.mjs`
  - "Use for/Use it/Use when/Use this" 포함 52
  - "Do NOT/never/NEVER/Never" 포함 83
  - 빈 줄로 나뉜 여러 문단 56, 마크다운 굵게(`**`) 29
  - 비용·과금 언급 33, 승인/HITL 언급 17, `⚠️` 경고 9개(`threads_publish`, `instagram_publish`, `facebook_publish`, `facebook_comment`, `youtube_publish`, `youtube_update`, `sns_comment_reply`, `sns_comment_moderate`, `astra_video_delete_upload`)
  - 첫 단어 상위: Generate 21, Create 12, Read 6, Direct 5
- 입력 스키마 관행 — `tools.mjs`
  - 속성 수: 툴당 0 / 7 / 24(최소/중앙/최대), 총 832개, description 없는 속성 0개
  - required: 툴당 0 / 1 / 9, required가 0개인 툴 16개
  - enum 사용 툴 69개(enum 노드 213), default 사용 툴 48개(default 노드 138)
  - 최상위 `additionalProperties:false` 24개. 나머지는 `parseArgs`가 알 수 없는 최상위 키를 거부해 같은 효과를 낸다 — `server/src/handlers.ts:160-189`
  - inputSchema JSON 크기: 47 / 1,547.5 / 68,613자, 합 307,371자. 상위: `storyboard_apply` 68,613, `astra_audio2video` 12,156, `astra_text2video` 11,707, `astra_img2video` 11,470, `project_manage` 10,355
  - 툴 정의 전체 JSON(이름·title·description·스키마·주석) 합 458,145자, 최대 71,792자(`storyboard_apply`). 4자=1토큰 단순 환산으로 약 11.5만 토큰(추정치. 한글이 섞인 JSON이라 실제 토크나이저 수치와 다를 수 있음)
  - enum 목록은 클라이언트 모듈의 상수에서 가져온다("copying a 30-entry list into the schema invites the accident…") — `server/src/tools.ts:160-163`, import 블록 `tools.ts:1-80`
- 스키마 이원화: `zod-to-json-schema`/`zodToJsonSchema`/`toJSONSchema` 사용 0건 — `grep -rn` on `server/src`, `server/package.json`. 즉 `tools.ts`의 JSON Schema와 핸들러 zod 스키마는 따로 관리된다. `handlers.ts`의 `parseArgs(` 호출 87회, `z.object(`를 정의하는 src 파일 29개 — `grep -c`. 서버 전체 패리티 테스트는 없고, 일부 툴만 속성 키와 zod shape를 대조한다(예: `server/test/elevenlabs-v4-provider.test.mjs:233`)
- annotations: 104/104에 `title`과 `annotations`. 프리셋 `HINT` 6종 — `server/src/tools.ts:583-595`

| 분류 | readOnly | destructive | idempotent | openWorld | 툴 수 |
|---|---|---|---|---|---|
| read | true | – | – | true | 24 |
| local | true | – | – | false | 8 |
| generate | false | false | false | true | 41 |
| generateLocal | false | false | false | false | 22 |
| publish | false | true | false | true | 6 (`threads_publish`, `instagram_publish`, `facebook_publish`, `facebook_comment`, `youtube_publish`, `sns_comment_reply`) |
| moderate | false | true | true | true | 3 (`astra_video_delete_upload`, `youtube_update`, `sns_comment_moderate`) |

  (분류는 `tools2.mjs`가 힌트 조합으로 역산). 주석 설계 이유: "destructiveHint … translates 'a call is immediately public' … the description prose reaches only the model, never the approval UI" — `server/src/tools.ts:165-169`
- outputSchema/structuredContent: 17개 툴(게시·댓글·인사이트·스카우트 계열: `threads_publish`, `instagram_publish`, `facebook_publish`, `facebook_comment`, `youtube_publish`, `youtube_update`, `youtube_insights`, `sns_comment_inbox`, `sns_comment_reply`, `sns_comment_moderate`, `sns_account_check`, `instagram_insights`, `content_feedback`, `youtube_topic_scout`, `sns_issue_scout`, `threads_insights`, `threads_search`) — `tools2.mjs`. required에는 "성공 경로에 항상 있는 필드만" 넣고 실패 시 structuredContent 없이 `isError` — `server/src/tools.ts:598-603`, `server/src/handlers.ts:128-147`(`fromApi`: 성공 본문이 JSON 객체면 text와 structuredContent에 함께 실음). 나머지 87개 툴은 text 블록만 돌려준다.
- 에러 반환 규칙 — `server/src/index.ts`
  - 알 수 없는 툴: `McpError(ErrorCode.InvalidParams)`(-32602) 프로토콜 오류 — `index.ts:47-49`
  - 운영자가 끈 툴: `isError: true` + 재활성화 방법 안내 text — `index.ts:53-66`
  - 핸들러 예외: `Error executing tool "<name>": <message>`, `isError: true` — `index.ts:105-111`
  - 인자 검증 실패: zod 이슈를 `path: message`로 이어 붙인 `Invalid arguments — …`, 알 수 없는 키는 허용 키 목록과 함께 거부 — `handlers.ts:171-189`. 이 오류는 위 catch를 거쳐 `isError` 결과가 된다(-32602 아님).
  - 외부 API 실패: `HTTP <status>\n<원본 본문>`, `isError: true` — `handlers.ts:137-139`
  - `isError` 사용 위치: `handlers.ts` 16, `serp-client.ts` 14, `datago-client.ts` 8, `index.ts` 4, `naver-client.ts` 4 등 총 50곳 — `grep -c isError`
- 과금 기록은 스킬이 아니라 서버 단일 지점에서: 과금 툴은 성공·실패 모두 에피소드 원장에 기록 — `server/src/index.ts:66-103`
- 노출 제어: 자격 증명 파일이 없는 플랫폼의 게시·인사이트 툴(최대 11개, `SNS_PLATFORM_BY_TOOL` 11항목, `tools.ts:5233`)을 ListTools에서 숨기고, env `SOCIAL_FLOW_*`와 `disabled-tools.json`으로 툴을 이름·접두 와일드카드로 끈다(요청마다 재평가) — `server/src/index.ts:24-42`, `server/src/tool-gate.ts`. 그래서 키가 없는 클라이언트는 104개보다 적게 본다(README도 명시, `README.md:676-`).
- 대용량 응답 처리
  - 페이지/개수 인자(`page`·`limit`·`pageToken`·`nextPageToken`)를 받는 툴 15개 — `tools2.mjs`. 이름 통일은 테스트로 강제("pagination argument names are uniform server-wide") — `server/test/contract.test.mjs:215`
  - 잘림 안내: SerpApi 계열은 엔진이 준 것보다 적게 돌려줄 때 응답 note로 알리고 페이지로 닿지 않는 범위를 설명 — `server/src/tools.ts:570`, `server/src/serp-client.ts:72,314,450-454`
  - data.go.kr: 12,000자/8,000자에서 자르고 "lower limit, or use page…" 안내 — `server/src/datago-client.ts:446,491`
  - STT 미리보기 4,000자 절단 후 "full text in the JSON" — `server/src/handlers.ts:1183`
  - 댓글 목록: 응답 크기 상한으로 오래된 댓글을 버리면 그 수를 `truncated` 필드로 알림 — `server/src/sns-client.ts:2481`
  - 읽기 깊이 조절: `storyboard_read`의 `level=outline|full` — `tools2.mjs`, 툴 description
  - 이미지: `gpt_image_text2img`/`gpt_image_img2img`는 base64 image 블록을 인라인으로 돌려주고 `savePath`가 있으면 파일 경로도 text에 적음 — `server/src/handlers.ts:64-71,772-807`. 로컬 생성(`image_local_generate`)은 base64 없이 파일만 씀 — `handlers.ts:809-810` 주석
  - 경로/파일 성격의 인자(`path`·`file`·`dir`·`output` 포함 이름)를 가진 툴 63개 — `tools2.mjs`

### Inferences
- 툴 정의가 매우 크다(약 45.8만 자). 특히 `storyboard_apply`의 스키마가 전체 inputSchema의 약 22%(68,613/307,371)를 차지한다. 클라이언트가 툴 정의를 모두 컨텍스트에 싣는 환경이라면 비용 대부분이 몇 개 툴에서 나온다.
- JSON Schema와 zod를 따로 유지하므로 두 정의가 어긋날 수 있는 구조다. 현재는 일부 툴만 테스트로 대조한다.
- `structuredContent`는 외부 플랫폼 응답을 그대로 싣는 17개 툴에 한정되고, 생성·로컬 툴 87개는 사람이 읽는 text 메타 줄(예: `Model:`, `Duration:`, `Billed tokens:`)로 결과를 전달한다(`handlers.ts:73-126`).

### Gaps
- 실제 클라이언트(Claude Code)가 툴 정의를 지연 로딩하는지, 그때 토큰 비용이 얼마인지는 이 저장소 밖의 문제라 측정하지 않았다.
- 툴 104개 중 description·스키마의 의미상 품질(오해 소지)은 평가하지 않았다(범위 밖).

## 5. 기존 강제 장치 (체커, 린터, 테스트, 훅)

### Takeaway
스킬 표면은 `skill-lint.js`(16개 규칙, 현재 0건 위반)가, 툴 표면은 `server/test/contract.test.mjs`(이름·title·description 길이·파라미터 description·enum·annotations·outputSchema·라우팅·HITL 문구)가 CI에서 막는다. 콘텐츠 계약은 `check-style.py`·`check-scenes.js` 등 `--selftest` 체커 18개가 CI에 걸려 있다. 훅은 SessionStart 컨텍스트 주입 하나뿐이다.

### Cited Findings
- CI: `.github/workflows/check.yml` — push(main, staging, dev)와 PR에서 실행. `npm run check`(빌드 + `node --test test/*.test.mjs`), `check:dist`(커밋된 dist가 새 빌드와 같은지), 그리고 `--selftest` 체커들 — `check.yml:27-69`, `server/package.json` scripts
- 서버 테스트 파일 125개(`ls server/test | wc -l`, fixtures 포함)
- `skill-lint.js`(537줄, `skills/platform-guide/references/skill-lint.js`) — CI `check.yml:69`. `--list` 결과 "16 rules · 0 violated"(스크래치패드 미러에서 실행). 규칙:
  1. name이 디렉터리명과 같음
  2. description ≤ 1,024자(`DESCRIPTION_MAX`, `skill-lint.js:43`)
  3. description에 `<angle>` 자리표시자 없음
  4. description 첫 76자가 스킬 간 유일(`CODEX_VISIBLE`, `skill-lint.js:41`)
  5. 리드인("this skill should be used" 등) 금지 — `skill-lint.js:268-275`
  6. allowed-tools의 `mcp__` 항목은 `mcp__social-flow__`만 — `skill-lint.js:47,278-290`. 존재하지 않는 툴 이름은 검사하지 않음(접두만 확인)
  7. 금지된 브라우저 툴(`claude-in-chrome`, `chrome-devtools`)이 어디에도 없음 — `skill-lint.js:45`
  8. 언급된 reference 파일이 실재
  9. Contents 링크가 실제 제목에 닿음
  10. 100줄 초과·제목 4개 이상인 reference에 `## Contents` 존재 — `skill-lint.js:353-365`
  11. 변동성 reference(가격·플랫폼 한도 6개, `VOLATILE`)에 신선도 줄 존재 — `skill-lint.js:65-72`
  12. 고아 reference 없음(다른 산문 파일 어디서든 basename이 언급되면 통과) — `skill-lint.js:385-399`
  13. SKILL.md ≤ 1,350줄(`SKILL_MAX_LINES`, "A ceiling … not a target… never raise it to fit new prose") — `skill-lint.js:49-57`
  14. 매니페스트 6종 버전 일치 — `skill-lint.js:74-81`
  15. MCP 설정 4종이 같은 `server/dist/bundle.js`를 실행, OpenAI interface 블록 일치 — `skill-lint.js:84-89`
  16. README·매니페스트 산문의 "N tools"가 서버 툴 수와 일치 — `skill-lint.js:443-462`
- `allowed-tools`가 Claude Code에서 권고(advisory)일 뿐이라는 측정 기록: "a name that resolves to nothing is not refused, it is ignored (measured: a skill whose allowed-tools named one tool still saw all 218)" — `skill-lint.js:17-22`
- `contract.test.mjs`(1,564줄)의 툴 표면 검사 — `server/test/contract.test.mjs`
  - 이름 유일, snake_case 네임스페이스 — `:107-116`
  - title 존재·60자 이하, description 40자 이상 — `:118-123`
  - inputSchema가 object이고 required ⊆ properties — `:125-131`
  - 모든 파라미터(중첩 포함)에 description — `:133-140`
  - enum 비어 있지 않음·중복 없음·default ∈ enum — `:142-154`
  - annotations 존재, readOnly면 destructive/idempotent 미설정, 쓰기 툴이면 둘 다 명시 — `:156-172`
  - outputSchema 유효성과 속성 description — `:174-198`
  - 파라미터 camelCase, 검색 툴 공통 인자명, `page` 의미 설명 — `:202-298`
  - 모든 툴에 핸들러, 핸들러에 대응 툴, ListTools 게이트 대상 실재 — `:300-322`
  - HITL: 즉시 공개 툴 중 하나 이상 destructive, 그 description이 승인 없는 호출을 금지, 읽기 전용 툴엔 파괴 경고 없음 — `:442-467`
  - 플랫폼별 인사이트 툴의 scope 명시 등 개별 계약 — `:469-579`
- 콘텐츠·계약 체커(CI의 `--selftest` 대상) — `check.yml:40-69`, 각 파일 머리말
  - `check-style.py`(1,937줄): 한국어 AI 말투 결정적 판정, exit 0/1/2/3, "the verdict is authoritative" — `skills/platform-guide/references/check-style.py:1-12`. CLAUDE.md에 따르면 콘텐츠 카피만 기계 차단하고 문서·주석에는 돌지 않음 — `CLAUDE.md:50-53`
  - `check-scenes.js`(3,206줄): scenes.js 계약, `--draft`(스토리 단계), `--json` — `skills/storyboard/references/check-scenes.js:1-8`
  - `check-slide.js`(816줄), `check-research.js`(1,097줄), `check-meta.js`(396줄, YouTube meta.md 게이트)
  - `pipeline-lint.js`(237줄): "checks the prose mirrors against pipeline.js" — SKILL.md 산문과 pipeline.js의 단계 인계·리뷰어 출력 계약을 대조 — `skills/platform-guide/references/pipeline-lint.js:1-8`, CI 주석 `check.yml:42`
  - `format-lint.js`(490줄): 인라인 포맷 미러 대조 — `check.yml:66`
  - 그 밖에 `episode-state.js`, `snap-boundaries.py`, `assemble-bg-prompt.js`, `cost-preview.js`, `check-duplicate.py`, `check-batch.py`, `resolve-asset.py`, `check-final-speech-rate.py`, `serve.js` selftest
- 스킬 문서 내용을 직접 검사하는 서버 테스트는 적다: `skills/…/*.md`를 참조하는 테스트 5개, `SKILL.md`를 읽는 테스트 1개(`seedance-routing.test.mjs`) — `grep -lE` on `server/test`
- 훅: `hooks/hooks.json`에 SessionStart(`startup|resume|clear|compact`) 한 개, `node hooks/project-context.js`, timeout 5초. 스크립트는 19줄이고 "Context only: no files, environment variables, network calls or automatic choices." — `hooks/hooks.json`, `hooks/project-context.js:5`. PreToolUse 등 툴 호출 검사 훅은 없다.
- 체커가 커버하지 않는 영역(저장소가 스스로 밝힘): D8 금지 어미 규칙은 문서·주석에 대해 "no checker runs" — `CLAUDE.md:50-53`

### Inferences
- 툴 쪽 강제는 촘촘하다(스키마 위생, 주석 일관성, HITL 문구까지 테스트). 스킬 쪽 강제는 라우팅 표면(description 길이·중복·리드인)과 참조 무결성 중심이며, 본문 품질(길이 상한 1,350줄은 사실상 `produce` 기준)이나 참조 깊이, evals 존재는 강제하지 않는다.
- `allowed-tools` 검사는 접두만 확인하므로 존재하지 않는 툴 이름은 잡지 못한다(다만 현재 측정상 그런 항목은 0개, 6절 참고).

### Gaps
- `npm test`는 실행하지 않았다(빌드·파일 쓰기 가능성 때문에 읽기 전용 제약으로 생략). 현재 CI 통과 여부는 확인하지 않았다.
- 체커 18개 각각의 세부 규칙 수는 세지 않았다.

## 6. README를 단일 출처로 쓰는 방식과 실제 등록 툴의 동기화

### Takeaway
README는 툴 104개를 모두 언급하고(누락 0), "104 tools" 주장 3곳은 서버와 일치하며 skill-lint가 이를 강제한다. 기계적으로 찾은 불일치는 스킬 수다. `AGENTS.md:3`과 `README.md:437`이 "18 skills"라고 적지만 실제 스킬은 21개이고, 스킬 수를 검사하는 규칙은 없다.

### Cited Findings
- 단일 출처 선언: "[README.md](README.md) is the source of truth for structure, skills, and the MCP tool list." — `CLAUDE.md:21`. "README.md is the source of truth for structure and the tool list" — `AGENTS.md:3-4`
- 툴 수 주장: `README.md:601`, `README.md:604`, `README.md:671`("## MCP tool surface (104 tools)") 모두 104 = 서버 `TOOLS` 104 — `grep -noE '[0-9]+ (skills|agents|reviewers|tools)\b'`, `tools.mjs`. `README.md:874`의 "31 tools"는 "as of 2026-07-29"라는 과거 감사 기록이라 skill-lint가 의도적으로 건너뜀 — `skill-lint.js:451`
- README 언급 대비 툴 목록: 서버 툴 중 README에 이름이 없는 툴 0개 — 스크래치패드 비교 스크립트(`TOOLS` 이름 vs `README.md` 본문). README의 툴 모양 토큰 중 서버에 없는 14개는 툴이 아니다: Meta 권한 scope(`threads_keyword_search`, `threads_manage_insights`, `instagram_business_manage_insights`), 토큰·설정 이름(`threads_token`, `instagram_token`, `facebook_page_token`, `video_budget_usd`), 툴 계열 약칭(`gpt_image`, `mlx_image`, `mlx_video`, `tts_elevenlabs`), 호스트 CLI 툴(`image_gen`, `image_edit`, `image_to_video`)
- 스킬 수 불일치: "social-flow is a Claude Code plugin: 18 skills, 5 reviewer agents" — `AGENTS.md:3`. "Codex CLI — the 18 skills load; MCP tools don't wire up yet (measured on codex 0.147.0)" — `README.md:437`. 실제 21개 — `ls skills/*/SKILL.md`. README에 21개 스킬 이름은 모두 등장 — 비교 스크립트
- 단일 출처가 둘인 지점: annotations 판정표의 출처를 "docs/api-reference/mcp-tools.html §7 is the source of truth"라고 적음 — `server/src/tools.ts:169`, 같은 취지 `tools.ts:580`. CLAUDE.md는 README를 툴 목록의 출처로 지정 — `CLAUDE.md:21`
- skill-lint의 산문 수치 동기화는 "N tools"와 "ships N tools" 패턴, 매니페스트 버전, MCP 설정 경로만 대상 — `skill-lint.js:443-462, 74-89`
- allowed-tools와 실제 툴 대조: 존재하지 않는 툴을 가리키는 allowed-tools 항목 0개. 어떤 스킬의 allowed-tools에도 없는 툴 25개(`astra_text2video`, `blender_*` 7개, `facebook_comment`, `facebook_publish`, `music_list_options`, `omni_*` 4개, `scenario_check`, `seedance_text2video`, `sns_comment_moderate`, `tts_generate_checked`, `tts_multi_speaker`, `tts_review_final`, `tts_route`, `veo_extension`, `veo_text2video`, `youtube_update`) — 비교 스크립트. 이 중 게시 툴 일부는 의도적으로 뺐다: "*_publish/facebook_comment are deliberately left un-pre-approved — the native permission prompt on every irreversible publish call has to act as a second line of defense" — `skills/publish/SKILL.md:11-13`. 반대로 `grow-*`는 게시 툴을 사전 승인하고 그 예외 이유를 YAML 주석으로 적음 — `skills/grow-instagram/SKILL.md:13-20`
- README는 1,048줄이고 `## MCP tool surface (104 tools)` 섹션(671-791행)에서 백틱 툴 이름 114개(고유) 언급 — `wc -l README.md`, `awk 'NR>=671 && NR<792' README.md | grep -oE '`[a-z]+_[a-z0-9_]+`' | sort -u | wc -l`

### Inferences
- 툴 목록 동기화는 "수치 + 이름 언급" 수준에서 지켜지고 있다. 다만 README가 툴 description·스키마의 내용까지 반영하는지는 검사 대상이 아니다.
- 스킬 수는 검사 규칙이 없어서 AGENTS.md와 README의 "18 skills"가 21개로 늘어난 뒤에도 그대로다. README의 437행은 "measured on codex 0.147.0"이라는 측정 시점 문구가 붙어 있어 과거 기록으로 볼 여지도 있으나, `AGENTS.md:3`은 현재형 서술이다.

### Gaps
- 이 세션에 설치된 플러그인 툴은 `mcp__plugin_social-flow_social-flow__*` 접두로 노출됐다(세션 툴 목록 관찰). 반면 SKILL.md allowed-tools와 skill-lint는 `mcp__social-flow__`를 쓴다(`skill-lint.js:47`). 플러그인 설치 환경에서 allowed-tools 사전 승인이 실제로 매칭되는지는 검증하지 않았다. skill-lint 주석은 allowed-tools가 권고일 뿐이라고 기록한다(`skill-lint.js:17-22`).
- 같은 세션 툴 목록에는 저장소에 있는 `video_catalog`·`video_plan`·`video_execute`·`video_status`가 보이지 않았다. 설치본과 워크트리 버전이 다른 것으로 보이며, 설치본 버전은 확인하지 않았다.

## 7. ASTRA skill-lint 13항목 체크리스트 적용 (6개 스킬 표본 + 21개 자동 항목 요약)

### Takeaway
기준은 `/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/commands/skill-lint.md`의 13항목이다. 표본 6개(`produce`, `storyboard`, `autoproduce`, `grow-threads`, `publish`, `platform-guide`)에서 공통 약점은 13번(evals 형식)과 9번(부작용 스킬에 `disable-model-invocation` 없음, 정규식은 놓침), 그리고 3번(본문 500줄 초과: `produce`·`grow-threads`·`publish`)이다. 5번(참조 1단계)은 ASTRA의 문자 그대로 검사로는 통과지만, 실제로는 참조 중첩이 넓게 있다.

### Cited Findings
- 체크리스트 원문과 판정 방법: 13개 항목, Auto/Semi/Manual 구분, 심각도(FAIL=명시 규칙 위반, WARN=판단 필요, MANUAL=사람 검토) — `.../5.25.0/commands/skill-lint.md:37-86`
- ASTRA 문서 내부 불일치(판정 시 주의)
  - 2번 언어 정책: §12.1은 "All skill description fields are written in English"이고 대화형 도메인 스킬은 `description: "..."` 한 줄 — `.../docs/development/skill-best-practices.md:184-193`. 같은 문서 §14 체크리스트는 "interactive skill → Korean `description: "..."` single line" — `skill-best-practices.md:237,240`
  - 3번 500줄: 심각도 기준은 "WARN (500-line overage)"인데 출력 예시는 "FAIL SKILL.md = 680 lines" — `commands/skill-lint.md:65,84`
  - 12번: 커맨드는 "No persona agents"(FAIL if `agents/*-persona.md`), §14는 "Persona agent description keeps the … guard prefix" — `commands/skill-lint.md:52`, `skill-best-practices.md:250`
  - 커맨드는 체크리스트 출처를 "§13"이라 하지만 실제 체크리스트는 §14 — `commands/skill-lint.md:9,37`, `skill-best-practices.md:237`
- 표본 판정 — `python3 scratchpad/astra13.py`(커맨드에 적힌 정규식·조건을 그대로 구현) + 수동 확인

| # | 항목 | produce | storyboard | autoproduce | grow-threads | publish | platform-guide |
|---|---|---|---|---|---|---|---|
| 1 | 3인칭 + What + When + 트리거 | PASS (1인칭 0, `use when` 1) | PASS | PASS | PASS | PASS | PASS |
| 2 | 언어 정책 (Semi) | 영어 `>` 블록, 한글 3%. §12.1 기준 대화형이면 한 줄 `"…"`이어야 해 형식 불일치 | 영어 `>`, 6%, 대화형, 형식 불일치 | 영어 `>`, 6%, 형식 불일치 | 영어 `>`, 3%, 형식 불일치 | 영어 `>`, 5%, 형식 불일치 | 영어 `>`, 8%, 배경지식형이라 `>` 블록 부합 |
| 3 | 본문 ≤ 500줄 | 초과 (1,341) | PASS (240) | PASS (103) | 초과 (653) | 초과 (508) | PASS (113) |
| 4 | 슬래시 경로만 | PASS* (정규식 11건 모두 `printf`의 `\t`·`\n`, 예 `SKILL.md:542`) | PASS | PASS | PASS* (2건, `\n`) | PASS* (1건, `\n`, `SKILL.md:486`) | PASS |
| 5 | 참조 1단계 | 문자 검사 PASS / 링크된 자기 refs 19개 중 11개가 다른 .md를 링크, 자기 refs 중 SKILL.md 미언급 5개 | 문자 검사 PASS / 18개 중 11개가 다른 .md 링크, refs .md 49개 중 21개는 SKILL.md에 이름 없음 | 문자 검사 PASS / 3개 중 1개(`legacy-unattended.md`), 미언급 3개 | PASS (링크된 자기 refs 0) | PASS (0) | PASS (0) |
| 6 | 시간 의존 표현 없음 | 정규식 PASS (0) / ISO 날짜 27개, 날짜 박힌 지시(`SKILL.md:26,28`) | PASS (날짜 0) | PASS (0) | 정규식 PASS / 날짜 5 | 정규식 PASS / 날짜 6 | 정규식 PASS / 날짜 1 |
| 7 | 용어 일관성 | MANUAL (미평가) | MANUAL | MANUAL | MANUAL | MANUAL | MANUAL |
| 8 | allowed-tools 명시 | PASS (53개) | PASS (28) | PASS (42) | PASS (17) | PASS (9) | FAIL (필드 없음) |
| 9 | 부작용 → `disable-model-invocation` | 정규식 PASS / 유료 생성 툴 46개 사전 승인, 필드 없음 | 정규식 PASS | 정규식 WARN은 오탐("throu**gh pr**oduce", `SKILL.md:92`) / 유료 생성·자동 실행, 필드 없음 | 정규식 PASS / `threads_publish` 등 즉시 공개 게시를 사전 승인, 필드 없음 | 정규식 PASS / 게시 툴을 allowed-tools에서 빼 권한 프롬프트로 대신(`SKILL.md:11-13`), 필드 없음 | PASS |
| 10 | 배경지식 → `user-invocable: false` | PASS (AskUserQuestion 있음) | PASS | PASS | PASS | PASS | WARN ("Knowledge only, nothing runs"인데 `user-invocable: false` 없음) |
| 11 | 4원칙 | MANUAL — 검토 후보: H1 앞 19줄 지시 묶음, "supersedes … below"로 본문 아래 옛 지시 존치(`SKILL.md:29`) | MANUAL | MANUAL | MANUAL | MANUAL | MANUAL |
| 12 | persona 에이전트 없음 | PASS (`agents/*-persona.md` 0개, 에이전트 5개 모두 `*-reviewer.md`) | PASS | PASS | PASS | PASS | PASS |
| 13 | 평가 시나리오 ≥ 3 | WARN — `evals.md`는 있으나 `## Scenario` 0개(일반 `##` 제목 3개: Selected endpoint 등) | WARN — `##` 8개, `## Scenario` 0 | WARN — `##` 4개, `## Scenario` 0 | WARN (evals.md 없음) | WARN (없음) | WARN (없음) |

  *PASS\*: ASTRA 정규식은 걸렸지만 내용을 확인하니 Windows 경로가 아님.*
- 표본 집계(MANUAL 7·11 제외, 2번은 Semi로 별도): `produce` PASS 7 / 초과·WARN 2(3, 13) + 9번 의미상 WARN, `storyboard` PASS 9 / WARN 1(13), `autoproduce` PASS 9 / WARN 1(13) + 9번 의미상 WARN, `grow-threads` PASS 7 / 초과·WARN 2(3, 13) + 9번 의미상 WARN, `publish` PASS 7 / 초과·WARN 2 + 9번 의미상 WARN, `platform-guide` PASS 7 / FAIL 1(8) / WARN 2(10, 13)
- 21개 전체 자동 항목 요약 — `astra13.py` "ALL-SKILL AUTO SUMMARY"
  - 1번: PASS 20, FAIL 1(`project-init` — `Use for`를 써서 `use when|when (the user|you)` 정규식에 걸리지 않음. 트리거 문구 자체는 있음)
  - 3번: 초과 4(`produce`, `grow-threads`, `grow-youtube`, `publish`)
  - 4번: 정규식 hit 3(`grow-threads`, `produce`, `publish`), 모두 `printf` 이스케이프 오탐
  - 5번: 문자 검사 FAIL 0
  - 6번: 정규식 hit 0 (ISO 날짜 형식은 정규식이 겨냥하지 않음)
  - 8번: FAIL 1(`platform-guide`)
  - 9번: 정규식 WARN 3(`autoproduce` "through produce", `ingest` "merge the timeline"(`SKILL.md:93`), `topic-scout` `merge-scout.py`(`SKILL.md:83-84`)) — 셋 다 오탐. `disable-model-invocation`을 쓴 스킬 0개
  - 10번: WARN 3(`edit-speech`, `inspect-content`, `platform-guide` — 본문에 AskUserQuestion/ExitPlanMode 없음, `user-invocable: false`도 없음)
  - 13번: `## Scenario` 기준 WARN 21/21. `references/evals.md`가 있는 스킬 4개: `produce`(`##` 3), `storyboard`(8), `autoproduce`(4), `inspect-content`(번호 붙은 `##` 5 + "Evaluation scope")

### Inferences
- ASTRA 9번의 키워드 목록(`git push`, `gh pr`, `npm publish`, `rm`, `deploy`, `merge`)은 개발 워크플로 기준이라, 이 저장소의 실제 부작용(즉시 공개 SNS 게시, 유료 영상·음성 생성)을 잡지 못하고 오탐만 낸다. 저장소는 부작용 제어를 `disable-model-invocation` 대신 (a) 서버 annotations의 `destructiveHint`, (b) `publish`의 게시 툴 비사전승인, (c) growth-plan.md 상시 승인 같은 별도 장치로 처리한다.
- 5번은 ASTRA 검사(`](references/` 문자열)가 reference 안의 상대 링크(`](other.md)`, `](../…)`)를 보지 못해 통과로 나온다. 실측으로는 `storyboard`·`produce`의 참조 트리가 2단계 이상이다. 저장소의 skill-lint "no orphan reference"도 basename 언급만 보므로 깊이를 강제하지 않는다.
- 2번은 ASTRA 문서 자체가 모순이라 판정이 기준 선택에 따라 달라진다. 이 저장소는 "영어 `>` 블록 + 한국어 트리거 인용"이라는 제3의 형태이며, §12.1·§14 어느 쪽 행과도 깔끔히 맞지 않는다.

### Gaps
- 7번(용어 일관성)과 11번(4원칙)은 Manual 항목이라 평가하지 않고 검토 후보만 적었다.
- ASTRA 3번의 본문 줄 계산(`awk '/^---$/{n++; next} n==2'`)은 본문의 `---` 수평선도 건너뛰므로 위 수치와 몇 줄 차이가 날 수 있다.
- 표본 6개 외 15개 스킬은 자동 항목만 집계했고 수동 확인은 하지 않았다.
