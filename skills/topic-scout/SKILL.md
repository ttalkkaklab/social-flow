---
name: topic-scout
description: >
  This skill should be used when the user asks to "키워드 찾아", "시장 키워드",
  "잘 되는 주제", "우리 채널 키워드", "아웃라이어 주제", "지금 뭐가 핫해",
  "find keywords for my channel", "scout topics", or wants validated YouTube
  topics for a channel from what is already working in that niche. Reads
  profile.md, calls youtube_topic_scout (channel-median × multiplier, not raw
  views; default markets US+CN), writes data/<channel>/growth/keywords/market-keywords.md + chart-first HTML,
  and lets the user pick phrases for the storyboard / autoproduce / grow-youtube
  topic pool.
argument-hint: "<채널> [시드 검색어]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "AskUserQuestion",
  "mcp__social-flow__youtube_topic_scout"]
---

# 시장에서 검증된 주제 찾기

조회수가 안 나오는 이유는 대부분 **내가 하고 싶은 말**을 올리기 때문이다.
이 스킬은 채널 주제 영역 안에서, 이미 사람들이 오래 머문 주제를 찾는다.
절대 조회수가 아니라 **그 채널 최근 업로드 중앙값 대비 배수**로 고른다 —
슈카월드 10만과 신규 채널 10만은 의미가 다르다.

```
/social-flow:topic-scout 재테크
/social-flow:topic-scout ttalkkak-lab "AI 업무 자동화"
```

사람이 보는 산출물은 `data/<채널>/growth/keywords/market-keywords.html` 이다.
유튜브 분석가가 아닌 사람이 읽어도 주제가 뭔지 알게 쓴다.
첫 장은 "이번에 만들 콘텐츠"다 — 고른 키워드가 시장에서 무엇을 다루고,
우리는 어떤 편을 만들지. 둘째 장은 후보 키워드마다 같은 형식이다.
어떻게 골랐나(배수·검색어)는 마지막 한 섹션이다. 근거 차트에 페이지를
쓰지 않는다.
화면에는 시드·구·아웃라이어·결핍·잣대·쿼터 같은 은어를 쓰지 않는다.
영어·중국어 제목은 짧은 한국어로 옮긴다. 해석은 스크립트가 숫자에서 만든다.
표를 채팅에 다시 그리지 않는다.
같은 폴더의 `market-keywords.md` 는 grow-youtube / autoproduce 가 읽는
숫자·고른 구 정본이다. `topic_source: scout` 는 그 md 를 읽는다.

방법의 근거는 `references/method.md`. md 칸은 `references/report-template.md`.
HTML 은 손으로 쓰지 않는다 — `references/render-report.py` 가 뽑는다.

## 절차

1. **채널 확인** — 인자가 없으면 `data/*/profile.md` 를 찾아 고른다.
   `data/<slug>/profile.md` 가 없으면 `/social-flow:channel add` 를 안내하고 중단.
2. **시드 검색어** — 사용자가 검색어를 줬으면 그걸 내부 명사로 둔다. 없으면
   profile §1 **주제 영역**에서 2~3개로 쪼갠다. 한 줄이 길면 핵심 명사만.
   타깃 시청자 문장은 시드에 넣지 않는다. `references/method.md` 표로
   **영어·중국어 시드**를 만든다. 한국어 시드를 US/CN 검색에 그대로 넣지 않는다.
3. **툴 호출** — `mcp__social-flow__youtube_topic_scout` 를 **시장마다** 부른다.
   기본은 미국과 중국. 사용자가 "한국만"이라고 하면 KR/ko 한 번.
   - 미국: `regionCode: US` `language: en` · 영어 시드
   - 중국: `regionCode: CN` `language: zh` · 중국어 시드
   - `query`: 그 시장 시드 첫 줄 · `extraQueries`: 나머지 (최대 2)
   - `channel`: slug
   - `duration`: `short` (사용자가 롱폼을 말하면 `any`)
   - `publishedAfterDays`: 90
   - `channelLimit`: 15 (시장당)
   - `includeComments`: true
   - `limit`: 15
   응답은 `growth/keywords/us.json` · `cn.json` 에 두고
   `references/merge-scout.py --out market-keywords.json us.json cn.json`
   으로 합친다.
4. **기존 주제와 겹침** — `data/<slug>/episodes/*/` 디렉토리명·storyboard 제목을
   읽어 이미 다룬 구는 md 주제어 표에서 "이미 씀"으로 표시한다. 툴이 그 결과를
   버리지 않는다 — 후속편 후보가 될 수 있다.
5. **보고서** — `references/report-template.md` 칸을 채워
   `data/<slug>/growth/keywords/market-keywords.md` 에 쓴다. 같은 폴더에
   `market-keywords.json`(툴 응답 원문)과 `market-keywords-YYYYMMDD.md` 사본을
   둔다. 이어서 HTML 을 뽑는다.

   ```
   python3 ${CLAUDE_PLUGIN_ROOT}/skills/topic-scout/references/render-report.py \
     --json data/<slug>/growth/keywords/market-keywords.json \
     --md   data/<slug>/growth/keywords/market-keywords.md \
     --name "<채널 표시명>"
   ```

   스크립트가 `market-keywords.html` 과 `market-keywords-YYYYMMDD.html` 을 쓴다.
   SVG 를 손으로 그리지 않는다. 해석 문장도 손으로 윤문하지 않는다.
   `## 고른 주제` 한 줄은 "시장 영상은 ~다. 우리는 ~한다." 를 쉬운 말로 적는다.
   배수·조사 방법 문장은 넣지 않는다.
   토큰·노드 문법은 `report.css` 와 스크립트가 지킨다(청 1색 · viewBox 폭 700 ·
   도표에 적색 없음 · 좌측 액센트 보더 없음).
6. **고른다** — AskUserQuestion 으로 상위 8개를 보여 주고 쓸 구를 고르게 한다
   (multi-select). 고른 구는 md `## 고른 주제` 에 적은 뒤 **스크립트를 한 번
   더 돌려** HTML 카드를 갱신한다.
   grow-youtube 플랜이 있으면 주제 풀/`topic_keywords` 에 넣을지 한 번 더 묻는다.
   **플랜 frontmatter 를 승인 없이 고치지 않는다.** 넣을 때도 목록만 추가하고
   `status: approved` 를 유지할지 사용자에게 확인한다.
7. **보고** — HTML 경로 한 줄 + 고른 구 + "이 주제로 스토리보드" /
   "autoproduce 로 한 편" 안내. 편별 조회수 표를 채팅에 다시 그리지 않는다.
   사람이 보는 정본은 HTML, 루프가 읽는 정본은 md 다.
   ego lite 가 있으면 `file://` 로 HTML 을 연다.

## 자격증명

툴이 400 으로 떨어지면 두 길 중 하나를 안내하고 중단한다. 지어내지 않는다.

- **권장** — `YOUTUBE_API_KEY` (Google Cloud 에서 YouTube Data API v3 를 켠
  공개 키). 게시 쿼터를 쓰지 않는다.
- **폴백** — `~/.config/social-flow/<slug>/youtube-oauth-client.json` 의
  `youtube.readonly`. 게시용 `youtube.upload` 만 있는 토큰은 검색(100유닛)이
  거부된다. 재발급은 publish `references/token-setup.md`.

## 규칙

- **주제를 참고하고 베끼지 않는다.** 제목·썸네일·대본을 그대로 쓰지 않는다.
  아웃라이어 `gaps`(댓글 질문)가 있으면 그 결핍을 메우는 한 가지만 더 잘한다.
- 채널 주제 영역 밖 구는 md 주제어 표에 "걸러"로 표시한다. 사용자가 원하면
  그대로 둔다. HTML 묶음 그림이 그 칸을 읽는다.
- 성장 플랜·큐 마커를 이 스킬이 승인하지 않는다. 관찰과 목록만 한다.
- 게시 툴을 호출하지 않는다.
- 조회수 10회짜리 5배를 주제로 올리지 않는다 — 툴의 `minViews` 기본 1000 이
  그 바닥이다. 더 낮추라는 명시가 있을 때만 내린다.

## Additional Resources

### Reference Files

- **`references/method.md`** — 미국·중국 기본, 시드 EN/ZH 표, 쿼터
- **`references/merge-scout.py`** — 시장별 JSON 합치기
- **`references/report-template.md`** — `market-keywords.md` 칸
- **`references/render-report.py`** — JSON+md → 도표 위주 HTML
- **`references/report.css`** — HTML 토큰 (제안서와 같은 청·네이비)
