---
name: platform-guide
description: >
  This skill should be used when the user asks about "플랫폼 문법", "플랫폼별 작성 규칙",
  "인스타 캡션 어떻게", "쇼츠 제목 규칙", "platform grammar", "how to write for
  Threads/Instagram/Facebook/YouTube", or when any social-flow skill needs the
  per-platform writing rules, video specs, safe zones, or posting-limit reference.
  Knowledge-only skill — the SoT for platform grammar lives in
  references/platform-playbook.md.
---

# 플랫폼 가이드 — 문법·규격의 SoT

Threads · Instagram · Facebook · YouTube 4개 게시 플랫폼의 작성 문법, 영상 규격,
한도, 안티패턴을 담은 지식형 스킬. produce(§9 플랫폼별 텍스트)와 publish(승인
게이트 검토), content-reviewer 에이전트가 이 스킬의 플레이북을 기준으로 삼는다.

## 핵심 원칙 (요약)

1. **"사실은 공유하되 문장은 공유하지 않는다"** — 같은 소재라도 플랫폼마다 화자·
   어체·종결·정보 밀도를 다시 설계한다. 자동 크로스포스팅은 금지.
2. **쉬운 말** — 시청자는 비전문가다. 무설명 전문용어·직역어·주어 없는 과압축
   금지. 용어가 꼭 필요하면 쉬운 말을 앞세우고 첫 등장에서만 괄호 병기.
3. **첫 대면이 전부** — Threads 첫 줄, IG 캡션 첫 125자, YT 제목+썸네일, 영상
   첫 3초. 여기서 승부가 안 나면 나머지는 읽히지 않는다.
4. **골든타임 응대** — 게시 후 첫 60분의 댓글 응답 속도가 도달을 좌우한다
   (Buffer 190만 게시물 분석: 답글 시 참여도 Threads +42% / IG +21% / FB +9.5%).
5. **AI 티 없는 한국어** — 번역투·상투구·조수 말투가 한 문장만 섞여도 광고로 읽히고
   스크롤된다. 규칙은 `references/korean-style.md`, 판정은 `references/check-style.py`
   가 한다. 나레이션·자막·카피·제목·댓글 문안 전부가 대상이다.

## 플랫폼 한눈에 보기

| | Threads | Instagram | Facebook | YouTube |
|---|---|---|---|---|
| 형태 | 텍스트/이미지 1장 (영상 불가) | 릴스·캐러셀 ≤10장 | 텍스트/이미지/일반 영상 | 쇼츠(9:16 ≤3분) |
| 본문 상한 | 500자 | 캡션 2,200자 | 5,000자 | 제목 100자·설명 5,000자 |
| 어체 | 구어체 반말 1~3줄 | 훅+저장 CTA | 구조화 설명체 | 키워드형 |
| 링크 | 본문 금지 → 자기 답글 | 캡션 링크 클릭 불가 → 댓글 | 본문 금지 → 첫 댓글 | 설명란 가능 |
| 해시태그 | ≤1 (가중치 0) | 3~5 | 0~2 | 3~5 (#Shorts 필수) |
| 미디어 | 공개 HTTPS URL | 공개 HTTPS URL | 공개 HTTPS URL | 로컬 파일 업로드 |
| 한도 | 250건/24h | 100건/24h | — | 업로드 100회/일 |

상세 문법·카피 공식·안티패턴 체크리스트·영상 규격(세이프존·자막·길이)은
`references/platform-playbook.md` 를 Read 한다 — 플랫폼별 작성 전에 반드시.

## 문체 게이트

한국어 텍스트를 쓰거나 고쳤으면 표면별로 검사기를 돌린다. 판정은 코드가 하고,
문장은 사람·에이전트가 고친다.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
python3 $PG/check-style.py --surface <표면> <파일>
node $PG/extract-text.js ./storyboard/scenes.js <narration|subtitle|screen> | \
  python3 $PG/check-style.py --surface <표면> -
```

표면 8종: `narration` `subtitle` `screen` `threads` `ig` `fb` `yt` `reply`.
exit 0 통과 / 1 경고(S2 누적) / 2 불합격(S1) / 3 게이트 미실행(빈 입력·경로 오류).

**S1 은 예외 없이 고친 뒤 재실행한다.** exit 3 도 통과가 아니다 — 경로를 고쳐
다시 돌린다. 경로는 `${CLAUDE_PLUGIN_ROOT}` 기준으로 쓴다(produce·publish 는
`data/<채널>/<주제>/` 에서 돌기 때문에 상대경로는 잡히지 않는다).

## 적대적 검증 게이트 — 발신 글 공통 계약

플러그인이 저작해 밖으로 나가는 모든 한국어 문안은 두 단계를 통과한 것만 게시한다.
1차는 위 문체 검사기(기계 판정이 정본), 2차는 적대적 리뷰어 에이전트다 — AI 가
쓴 티가 나는지, 처음 읽는 사람이 따라올 수 있는 어휘인지를 반증으로 검증한다.
**score ≥95 이고 P0=0 일 때만 게시**하고, 최대 3라운드(무인 경로는 2라운드) 안에
미달이면 게시하지 않는다 — 미달 글을 올리는 것보다 안 올리는 것이 낫다.

| 발신 글 | 저작 지점 | 리뷰어 | 판정 tail |
|---|---|---|---|
| 스토리보드 문안 (나레이션·자막·화면) | storyboard · autoproduce | storyboard-reviewer 문안 모드 | `STORYBOARD_REVIEW` |
| 플랫폼 카피 (threads·ig·fb·yt) | produce · autoproduce | content-reviewer 카피 축 | `CONTENT_REVIEW` |
| 성장 문안 (새 글·검색 참여·인박스 답글) | grow-threads · grow-instagram · grow-youtube | growth-post-reviewer | `GROWTH_POST_REVIEW` |
| 게시 후 답글 | publish | growth-post-reviewer | `GROWTH_POST_REVIEW` |
| bio·채널 소개·태그라인 | channel · intro | growth-post-reviewer `standalone` | `GROWTH_POST_REVIEW` |

통과선 95 는 2026-08-13 사용자 지시다(성장 문안은 2026-08-12 에 90 으로 내렸다가
같은 지시로 95 복귀). 리뷰어를 거치지 않는 발신 문안 경로를 새 스킬에 만들지
않는다 — 새 표면이 생기면 이 표에 행을 추가하고 기존 리뷰어를 확장한다.

## Additional Resources

### Reference Files

- **`references/platform-playbook.md`** — 플랫폼별 문법 상세, 카피 공식, 영상 규격, 안티패턴 체크리스트 (SoT)
- **`references/korean-style.md`** — 한국어 문체 SoT: AI 티 패턴 표(T·D·C·A), 심각도, 표면별 적용, 빼기 전용 원칙
- **`references/check-style.py`** — 문체 결정적 검사기 (표준 라이브러리만, `--surface`·`--json`·`--doc`·`--selftest`)
- **`references/extract-text.js`** — scenes.js → 표면별 텍스트 추출 (narration·subtitle·screen, `window.SCENES` 전역 계약 대응)
