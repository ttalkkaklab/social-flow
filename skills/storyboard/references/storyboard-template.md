# storyboard.md / research.md 표준 구조

## storyboard.md

사람이 검토·승인하는 문서. 씬별 표와 생성 이미지를 임베드해 **이 문서만 보고
최종 영상을 상상할 수 있어야** 한다.

```markdown
---
channel: <채널 slug>
topic: <주제 slug>
status: draft            # draft | approved | produced | published
created: <YYYY-MM-DD>
---

# <주제 표시명> — 스토리보드

- **채널**: <표시명> (`data/<slug>/profile.md`)
- **예상 총길이**: <NN>초 (본편 <N>씬 + 아웃트로)
- **핵심 메시지**: <이 영상이 남기는 한 문장>
- **커버 훅**: "<커버 title>" — 히어로 수치 <stat>

## 씬 1 — cover

![scene-1](images/scene-1.png)

| 항목 | 내용 |
|---|---|
| 길이 목표 | ~<N>초 |
| kicker | <값> |
| title | <값> (자수: N) |
| stat / statLabel | <값> / <값> |
| 나레이션 ① | tts: "<발음 표기>" · sub: "<원표기>" |
| 나레이션 ② | tts: "…" · sub: "…" |
| 비주얼 | 생성 배경 + veo 모션 "<motion>" |
| 배경 프롬프트 | <bgPrompt 요약> |

## 씬 2 — points
(같은 형식 — bullets 표, reveal 순서 명시)

…씬 반복…

## 출처 (research.md 요약)

| 주장 | 출처 | 확인일 | 상태 |
|---|---|---|---|
| <핵심 수치> | [<매체>](<URL>) | <날짜> | ✅ 2개 교차 |

## 플랫폼 계획

| 플랫폼 | 형태 | 비고 |
|---|---|---|
| instagram | 릴스 | |
| youtube | 쇼츠 | 제목 키워드: <…> |
| threads | 커버 이미지 + 링크 답글 | |
| facebook | 영상 게시 | |
```

## storyboard.html (검토용 렌더 — 템플릿 기반)

`references/storyboard-html-template.html` 을 storyboard/ 에 복사해 만든다.
씬 데이터를 복사하지 않고 `<script src="./scenes.js">` 로 SoT 를 직접 로드해
그리므로, scenes.js 를 고치면 문서가 자동으로 따라온다 — storyboard.md·script.md
가 겪는 사본 드리프트가 이 문서에서는 구조적으로 불가능하다.

- 채우는 곳은 **`<title>` 과 `✎ SB_DOC` 블록 둘뿐** — 스타일·렌더러는 수정 금지.
- SB_DOC 에는 scenes.js 에 없는 편집 메타만 담는다: 핵심 메시지·docNotes·씬별
  주석(sceneNotes)·전환(transitions)·오디오 지시(audioNotes)·개인정보 회피(privacy)·
  출처 요약(sources)·플랫폼 계획(platforms)·촬영 준비(prep)·재확인 목록(recheck).
- 브라우저에서 `storyboard.html` 을 직접 열면 된다(외부 리소스 없음). HITL 승인
  제시 때 이 문서를 기본으로 쓴다.

### 문서가 보여 주는 세 가지

| | 무엇 | 근거 |
|---|---|---|
| 패널 스트립 | 리빌 하나 = 9:16 패널 하나. 배경·오버레이·자막 합성 | produce `video-template.html` / `screencast-overlay.html` 기하의 비례 재현 |
| AV 2열 | 왼쪽 VIDEO(배경·모션·화면 텍스트·프롬프트·촬영 지시) · 오른쪽 AUDIO(대사·자막 차이·오디오 지시) | 방송·광고 대본의 two-column AV 배치 |
| 계약 점검 | 계약 위반을 문서 맨 위 한 곳에 모음 | scenes-schema / shot-script-template |

모드(촬영/생성)는 `visual.source` 로, 삽화 모드는 `narration[].img` 로 자동 판별한다.
촬영 모드는 오버레이가 씬당 하나라 패널도 한 장이다 — 문장별 자막은 AUDIO 열이 보여 준다.
타임라인은 b-roll 을 배열 위치가 아니라 `after` 가 정한 **재생 위치**에 꽂아 그리고,
칸 아래에 누적 시각 눈금을 붙인다.

씬 카드 배치는 패널 수가 정한다 — 3장 이하면 패널을 왼쪽에 세우고 AV 2열을 옆에 놓고,
4장부터는 패널을 위에 깔고 AV 를 아래에 둔다. 가로로 세울수록 AV 값 칸이 좁아져 파일
경로가 줄 중간에서 쪼개지기 때문이다(실측). 1080px 이하에서는 전부 세로로 쌓는다.
브라우저 폭이 넉넉하면 옆에 세운 쪽이 세로도 짧다.

**점검 항목** — 자수·말속도·씬 길이·총길이·커버 제목 16자·statLabel 18자에 더해:

- **프레임 넘침** — 1080px 캔버스에 각 리빌을 그려 텍스트가 존을 넘는지 재고, 넘치면
  produce 와 같은 3단계 축소를 적용한다. 세 단계로도 안 들어가면 위반이다. 재는 방식도
  produce 를 따른다 — 생성 모드는 텍스트 존의 넘침, 촬영 모드는 상단 블록 하단이 y=460 을
  넘는지. 다만 produce 와 같은 사각이 있다 — 아래로 넘친 글자만 잡히므로, 커버·quote·outro
  처럼 블록이 아래나 가운데에 붙는 씬에서 **위로** 밀려난 글자는 이 점검에 안 걸린다.
- **히어로 수치 폭** — produce 의 640px 가드를 그대로 돌려 본다. 최소 크기에서도 넘치면
  짧은 표기로 바꿔야 한다.
- **b-roll** — 나레이션이 비어 있는지, 사용 길이가 8초 이하인지, `src` 가 커버 배경과 같은지.
- **빈 나레이션** — 소리 없이 버티는 씬(발화 클립 quote 는 정상이라 제외).
- **아웃트로 길이 미기재** — outro 씬은 있는데 `SB_DOC.outro` 가 비었을 때.
- **미기입 자리표시자** — SB_DOC 에 `{{…}}` 가 남은 채로 승인에 가는 것을 막는다.

제작 전에 글자 잘림과 계약 위반을 잡는 자리라, 여기서 걸리면 고치고 다시 연다.

## research.md

조사·검증의 원장. 스토리보드에 실리는 **모든 사실 주장**이 여기 항목과 1:1 로
연결돼야 한다.

```markdown
# <주제> — 조사·검증 기록 (<YYYY-MM-DD>)

## 검증 통과

| # | 주장 | 출처 1 | 출처 2 | 도구 | 비고 |
|---|---|---|---|---|---|
| 1 | <수치·기한·시행일> | <URL> | <URL> | naver_search | 원문 발췌: "…" |

## 검증 실패 → 제외

| 주장 | 사유 |
|---|---|
| <주장> | 출처 상충 — 본문에서 제외 |

## 검색 이력

| 도구 | 쿼리 | 결과 요지 |
|---|---|---|
| naver_search(news) | "<쿼리>" | … |
| WebSearch | "<쿼리>" | … |
```

## 상태 전이

`draft` → (HITL 승인) → `approved` → (produce 완료) → `produced` → (publish 완료) → `published`

각 스킬이 자기 단계 완료 시 storyboard.md frontmatter 의 `status` 를 갱신한다 —
디렉토리만 봐도 파이프라인 진행 상태를 알 수 있다.
