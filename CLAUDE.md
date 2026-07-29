# social-flow — 프로젝트 지침

카테고리 기반 쇼트폼 콘텐츠 파이프라인 Claude Code 플러그인.
구조·스킬·MCP 툴 목록은 [README.md](README.md)를 정본으로 삼는다.

## Git / GitHub 인증 (필수)

원격 `origin`은 **`zeanxai/social-flow`(PRIVATE)** 이다.
머신의 기본 `GITHUB_TOKEN`은 **다른 계정(zeanserssi)** 이라 이 저장소에 접근할 수 없다.
따라서 이 저장소의 모든 GitHub 작업은 **`ZEANXAI_GITHUB_TOKEN`** 환경변수를 써야 한다.

### gh CLI

`gh`는 `GH_TOKEN`을 `GITHUB_TOKEN`보다 우선하므로, 전역 설정을 건드리지 말고
명령 단위로 앞에 얹는다.

```bash
GH_TOKEN="$ZEANXAI_GITHUB_TOKEN" gh pr list
GH_TOKEN="$ZEANXAI_GITHUB_TOKEN" gh pr create --base dev --title "..." --body "..."
```

`GH_TOKEN` 없이 `gh`를 호출하면 `Could not resolve to a Repository`로 실패한다.
이는 권한 오류가 아니라 **계정이 틀린 것**이므로, 저장소를 새로 만들거나
origin을 바꾸는 식으로 우회하지 말 것.

### git push / fetch

push는 gh 인증과 별개 경로(credential helper)를 탄다.
저장소 로컬 config(`.git/config`, 커밋 대상 아님)에 helper가 설정되어 있어
평소에는 `git push`가 그대로 동작한다.

```bash
git config --local credential.https://github.com.username zeanxai
git config --local credential.https://github.com.helper \
  '!f(){ test "$1" = get && echo username=zeanxai && echo password=$ZEANXAI_GITHUB_TOKEN; };f'
```

helper는 **환경변수를 참조만** 하므로 토큰 값이 파일에 남지 않는다.
클론을 새로 뜨거나 `.git/config`가 초기화되면 위 두 줄을 다시 설정한다.

> 토큰 값을 코드·문서·커밋 메시지에 평문으로 적지 않는다. 환경변수 이름만 기록한다.

## 브랜치 전략

```
feat/<name> | fix/<name>  (integration)  →  dev  →  staging  →  main
```

- 스프린트 작업은 `feat/sprint-<N>-<name>` 워크트리에서 수행해 integration 브랜치로 PR.
- 승격은 `dev → staging → main` 순서. `main` 직행 금지.
- 머지 후에도 원격 작업 브랜치는 보존한다(이력·롤백). 로컬 스프린트 브랜치만 정리.

## 커밋·비밀정보

- `.env*`, `*.pem`, `*.key`, 자격증명·시크릿류는 절대 커밋하지 않는다(`.gitignore` 등록됨).
- 대용량 산출물(`data/**/output/**/*.mp4|mov|wav|pcm`, `data/**/.work/`,
  `data/**/recording/raw/`)은 재생성 가능하므로 커밋 대상이 아니다.
- API 키는 `.mcp.json`이 아니라 셸 환경변수로 주입한다.

## 다중 세션 주의

여러 Claude Code 세션이 이 저장소에서 동시에 작업한다.
커밋·머지 전 `git status`와 최근 수정 파일(`find . -mmin -30`)을 확인해
다른 세션이 편집 중인 파일을 함께 커밋하지 않도록 한다.
