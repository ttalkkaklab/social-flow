# 이 머신의 Claude Code 설치 목록 (2026-08-17 정리 후)

플러그인을 36개 지우고 둘만 남긴 뒤의 상태다. 사용자 의도한 정리이며, 이 문서는
**무엇이 남았는지**와 **다시 필요해지면 어디서 되찾는지**를 적어 둔다.

> 머신(`~/.claude`) 상태 기록이지 이 플러그인의 사양이 아니다. 다른 머신에서는 다르다.

## 남긴 것 — 플러그인 둘

| 플러그인 | 버전 | 마켓플레이스 | 스킬 | 에이전트 | 커맨드 |
|---|---|---|---|---|---|
| `social-flow` | 0.16.2 | `social-flow-local` (로컬 디렉토리) | 16 | 4 | 0 |
| `astra-methodology` | 5.23.0 | `astra` | 28 | 14 | 9 |

### social-flow 스킬 16

`autoproduce` · `branding` · `channel` · `datago` · `grow-instagram` · `grow-threads` ·
`grow-youtube` · `ingest` · `intro` · `platform-guide` · `produce` · `publish` ·
`setup-instagram` · `setup-threads` · `setup-youtube` · `storyboard`

에이전트 4 — `brand-reviewer` · `content-reviewer` · `growth-post-reviewer` · `storyboard-reviewer`

**설치본이 저장소보다 뒤처져 있다 — 0.16.2 대 0.20.0.** 로컬 마켓플레이스는 워킹트리
스냅샷이라 저장소를 고쳐도 설치본이 따라오지 않는다. 새 기능(가로 롱폼·촬영 클립 레인)을
스킬로 쓰려면 마켓플레이스를 다시 설치해야 하고, 그때 **미커밋 편집분과 `data/` 까지
스냅샷에 딸려 간다** — 업데이트 전 `git status` 를 본다.

### astra-methodology 5.23.0

스프린트 파이프라인(`/blueprint`·`/sprint-init`·`/pr-merge`·`/autorun`), 품질 게이트
에이전트(convention·naming·design-token·loop-verifier 등), 기획 산출물 생성
(`/service-planner`·`/handoff-publish`)을 담는다. 목록 정본은 그 플러그인의 README 다.

## 개인 스킬 — `~/.claude/skills/`

| 스킬 | 상태 |
|---|---|
| `ego-browser` | **정리 때 같이 지워졌다가 2026-08-17 복원** |

`~/.claude/skills/` 디렉토리가 통째로 비워졌던 것이라, 플러그인이 아닌 개인 스킬도
함께 사라진다는 것을 이번에 확인했다.

### ego lite 복원 절차 (또 지워지면 이대로)

**CLI·앱은 플러그인과 무관하다** — 지워지는 것은 스킬 문서뿐이고, 정본이 앱 번들 안에
그대로 들어 있다.

```bash
cp -R "/Applications/ego lite.app/Contents/Resources/ego-browser/"{SKILL.md,references,scripts,learnings} \
      ~/.claude/skills/ego-browser/
```

- 복원 확인: `diff -r "/Applications/ego lite.app/Contents/Resources/ego-browser" ~/.claude/skills/ego-browser`
- 실측 2026-08-17 — CLI `~/.local/bin/ego-browser` 0.4.6.14 / chromium 150.0.7871.101 /
  node v24.18.0 은 스킬이 없는 동안에도 정상 동작했다. 페이지 열기·스냅샷·task space
  정리까지 복원 직후 실제로 통과했다.
- CLI 는 `ego-browser upgrade` 로 스스로 올린다. 앱을 올리면 번들 안 스킬도 새 것이
  되므로, 업그레이드 뒤에는 위 복사를 한 번 더 해 문서와 CLI 버전을 맞춘다.

## 지운 플러그인이 오던 마켓플레이스

플러그인은 지웠지만 마켓플레이스 등록은 남아 있다 — 되돌릴 때 다시 검색할 필요가 없다.

`astra` · `claude-plugins-official` · `proposal-specialist-marketplace` ·
`knowledge-work-plugins` · `ouroboros` · `fect-persona-local` · `social-flow-local`

`/plugin` 으로 이 마켓들에서 필요한 것만 다시 설치한다.

## 이 정리로 없어진 것 중 기억해 둘 만한 것

- **브라우저 폴백 두 갈래가 얇아졌다** — `browse`(gstack)·`connect-chrome` 이 빠졌다.
  전역 지침의 폴백 순서(ego lite → Chrome DevTools MCP → `browse`)에서 마지막 칸이
  비었으므로, ego 가 못 하는 계측은 Chrome DevTools MCP 로 간다.
- **fect-persona 스킬이 빠졌다** — 뉴스·페르소나 저작(`write-trade-news` 등)을 쓰려면
  `fect-persona-local` 마켓에서 다시 설치한다.
- 그 밖의 범용 스킬(프레임워크 리뷰·테스트 패턴·디자인 등)은 이 저장소 작업에 안 쓰였다.

## 함께 확인한 것

`~/.claude/settings.json` 이 API 키 여럿을 **평문으로** 담고 있다(OpenAI·Google·SerpApi
등). 이 저장소 규칙은 키를 셸 환경변수로 주입하는 것이므로, 옮길지 검토할 값어치가 있다.
값은 여기 옮겨 적지 않는다.
