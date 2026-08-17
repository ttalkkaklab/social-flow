# social-flow — 프로젝트 지침

채널 기반 쇼트폼 콘텐츠 파이프라인 Claude Code 플러그인.
구조·스킬·MCP 툴 목록은 [README.md](README.md)를 정본으로 삼는다.

## 문체 금칙 — 보고체 상태 동사 (사용자 지시, 2026-08-12)

**남긴다 · 갈린다 · 나뉜다 · 남는다 · 남습니다 · 나뉩니다 · 갈립니다 · 남깁니다**
류로 문장을 닫지 않는다. 현상을 동사 하나로 정리해 끝내는 낭독체가 AI 티다.
대신 대상을 주어로 구체적으로 쓴다 — "근거를 남긴다" → "근거를 적어 둔다",
"추천이 갈린다" → "미용실마다 다른 색을 권한다", "둘로 나뉜다" → "두 갈래다".

**적용 범위는 콘텐츠 문안만이 아니다** — 스킬 문서·코드 주석·툴 설명·발행 HTML·
커밋 메시지·사용자 응답 전부다. 콘텐츠 문안은 `check-style.py` D8(S1)이 기계
차단하지만 **문서와 주석에는 검사기가 돌지 않으므로** 쓰는 사람이 지켜야 한다.
새 문서를 쓰거나 고칠 때 이 스캔을 돌린다:

```bash
python3 - <<'PY'
import re, os, glob
pat = re.compile(r'남긴다|갈린다|갈렸다|엇갈린다|나뉜다|(?<!살아)남는다'
                 r'|갈립니다|나뉩니다|(?<!살아)남습니다|남깁니다')
roots = ['skills','agents','server/src','docs'] + glob.glob('data/*/growth/*/growth-plan.md')
files = ['README.md','CLAUDE.md']
for r in roots:
    if os.path.isfile(r): files.append(r); continue
    for dp,_,fn in os.walk(r):
        files += [os.path.join(dp,f) for f in fn
                  if f.endswith(('.md','.html','.ts','.js','.sh','.py'))]
for p in files:
    if 'korean-style.md' in p or 'check-style.py' in p: continue   # 규칙 정본·픽스처
    s = open(p,encoding='utf-8',errors='replace').read()
    for m in pat.finditer(s):
        print(f"{p}: …{s[max(0,m.start()-40):m.end()+15]}…".replace('\n',' '))
PY
```

`growth-plan.md`(상시 승인서)는 스캔에 넣는다 — 틱마다 다시 읽는 우리 산문이다.
`growth-log.md`·`state.json` 은 넣지 않는다(과거 기록이고 리뷰어 인용을 담는다).
`CLAUDE.md` 는 이 절이 금칙 형태를 인용하므로 그 대목이 잡히는 게 정상이다.

규칙 정본은 `skills/platform-guide/references/korean-style.md` §D8 이다.
예외는 `살아남는다`(다른 동사)와 조건절(`나뉜다면`)·구어 과거·명령(`남겼어`·`남겨 둬`).

## 브랜치 전략

```
feat/<name> | fix/<name>  (integration)  →  dev  →  staging  →  main
```

- 스프린트 작업은 `feat/sprint-<N>-<name>` 워크트리에서 수행해 integration 브랜치로 PR.
- 승격은 `dev → staging → main` 순서. `main` 직행 금지.
- 머지 후에도 원격 작업 브랜치는 보존한다(이력·롤백). 로컬 스프린트 브랜치만 정리.

## 커밋·비밀정보

- `.env*`, `*.pem`, `*.key`, 자격증명·시크릿류는 절대 커밋하지 않는다(`.gitignore` 등록됨).
- `data/` 하위는 전부 커밋 대상이 아니다 — 구조 설명 문서인 `data/README.md` 만 예외다.
  채널 프로파일·스토리보드·이미지·영상·브랜딩 자산은 로컬 산출물이며,
  이 저장소는 플러그인 코드·스킬만 담는다.
- 반대로 `server/dist/` 는 빌드 산출물이지만 **반드시 커밋한다** — `.mcp.json` 이
  빌드 단계 없이 `${CLAUDE_PLUGIN_ROOT}/server/dist/index.js` 를 직접 실행하므로,
  무시하면 설치본이 깨진다. `server/src/` 수정 시 `npm run build` 후 dist 도 함께 커밋한다.
- API 키는 `.mcp.json`이 아니라 셸 환경변수로 주입한다.

## 다중 세션 주의

여러 Claude Code 세션이 이 저장소에서 동시에 작업한다.
커밋·머지 전 `git status`와 최근 수정 파일(`find . -mmin -30`)을 확인해
다른 세션이 편집 중인 파일을 함께 커밋하지 않도록 한다.
