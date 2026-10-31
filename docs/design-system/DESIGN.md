# 검토 화면 디자인 시스템

작성일: 2026-10-31. 기준 화면은 스토리보드 상세(`skills/storyboard/references/storyboard-html-template.html`)다.
스토리보드가 실제로 그리는 값을 `getComputedStyle`로 재서 토큰으로 옮겼고, 스토리보드는 이 토큰을
별칭으로 읽는다. 캐릭터·소품·배경 시트, 목록, 허브도 같은 토큰과 기본 부품으로 그린다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `skills/channel/references/review-assets/design-system.css` | 토큰(`--ds-*`)과 기본 부품(`.ds-*`). 유일한 원본 |
| `review-assets/review.css` | 첫 줄에서 디자인 시스템을 불러온다. `--review-*` 이름은 `--ds-*`의 별칭이다 |
| `review-assets/review-typography.css` | 작성 언어에 따라 `--ds-font-*` 가운데 하나를 고른다 |
| `storyboard-html-template.html` | `:root`의 `--accent`·`--card`·`--s3` 같은 이름이 모두 `--ds-*`의 별칭이다 |

`storyboard-html.js`는 에피소드 폴더에, `review-library.js`는 `assets/review/`에 `design-system.css`를 복사한다.
디자인을 바꿀 때는 `design-system.css`의 값을 고친다. 에피소드나 라이브러리에 복사된 파일은 고치지 않는다.

## 채널 색

채널 `THEME`의 `accent`·`accent2`·`ink`는 스토리보드 렌더러가 `--accent`와 `--ds-accent`에 함께 쓴다.
라이브러리 페이지는 `THEME`을 읽지 않아서 기본 강조색(`#3f6cff`)을 쓴다. 채널 색을 라이브러리에도
쓰려면 내보내기 단계에서 채널 프로필의 색을 읽어야 하며, 아직 구현하지 않았다.

## 토큰

### 색

| 토큰 | 값 | 스토리보드 출처 |
|---|---|---|
| `--ds-canvas` | `#f2f5f9` | 본문 배경(`.review-board`) |
| `--ds-canvas-glow-1`, `-2` | `#dce8f9`, `#e5e9f4` | 배경의 두 방사형 빛 |
| `--ds-surface` | `#fff` | `--card` |
| `--ds-surface-reading` | 흰색 94% | 샷 카드·영상 설정 막대 |
| `--ds-surface-glass` | 흰색 78% | 왼쪽 메뉴 |
| `--ds-glass-border` | 흰색 96% | 카드 테두리 |
| `--ds-sunk` | `#f4f4f5` | 참조 이미지 칸, 탭 트랙, 길이 알약 |
| `--ds-bubble` | `#f0f3f8` | 대사 말풍선 |
| `--ds-badge-dark` | `#1d2330` | 샷 번호 배지 |
| `--ds-text` | `#18181b` | 본문 |
| `--ds-muted` | `#4b5565` | 보조 글자. 템플릿의 `#52525b`는 `.review-board`에서 이 값으로 덮여 있었다 |
| `--ds-line` | `#dce2eb` | 구분선 |
| `--ds-hair` | `#ebebee` | 카드 안 가는 선 |
| `--ds-accent` | `#3f6cff` | 채널 강조색 기본값 |
| `--ds-accent-ink` | `#1d4ed8` | 시퀀스 머리말, 링크 글자 |
| `--ds-link` | `#2563eb` | 라이브러리 링크·행동 |
| `--ds-nav-current` | `#1648a0` | 현재 메뉴 |
| `--ds-ok` / `--ds-warn` / `--ds-bad` | `#147a4b` / `#855400` / `#b52f24` | 판정 색 |
| `--ds-warn-ink` / `--ds-warn-surface` | `#763d00` / `#fff4df` | 서체 누락 경고 |
| `--ds-track` | 검정 5% | 탭 트랙, 시트 섹션 링크 |
| `--ds-nav-current-bg` | 흰색 92% | 현재 메뉴 바탕 |
| `--ds-surface-soft` | 흰색 75% | 스타일 카드 |
| `--ds-surface-opaque` | `#f8faff` | 투명도 줄이기 설정의 메뉴 |
| `--ds-control-border` | `#b7c2d2` | 언어 선택 테두리 |
| `--ds-input` | `#767680` | 입력 테두리(고대비) |
| `--ds-print-line` | `#ccc` | 인쇄 카드 테두리 |

글자 대비(WCAG 대비율, 흰 표면 / 캔버스 / 회색 우물): `--ds-text` 17.7 / 16.2 / 16.1, `--ds-muted` 7.5 / 6.9 / 6.9,
`--ds-accent-ink` 6.7 / 6.1 / 6.1, `--ds-link` 5.2 / 4.7 / 4.7. 모두 본문 기준 4.5:1을 넘는다.

### 모서리

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--ds-radius-xs` | 6px | 칩 |
| `--ds-radius-sm` | 8px | 탭 버튼, 썸네일 |
| `--ds-radius-tile` | 10px | 아이콘 타일, 탭 트랙 |
| `--ds-radius-md` | 12px | 입력창, 무대 이미지 |
| `--ds-radius-panel` | 14px | 참조 이미지 칸 |
| `--ds-radius-lg` | 16px | 씬 띠 |
| `--ds-radius-card` | 20px | 샷 카드, 목록 카드 |
| `--ds-radius-hero` | 24px | 영상 설정 막대, 시퀀스 카드, 시트 상단 카드 |
| `--ds-radius-pill` | 999px | 알약 |

### 그림자

| 토큰 | 쓰는 곳 |
|---|---|
| `--ds-shadow-glass` | 샷 카드, 영상 설정 막대, 모든 라이브러리 카드 |
| `--ds-shadow-glass-strong` / `-hover` | 시퀀스 카드와 그 호버, 라이브러리 카드 호버 |
| `--ds-shadow-band` / `-hover` | 씬 띠 |
| `--ds-shadow-float` | 왼쪽 메뉴 |
| `--ds-shadow-raised` | 선택된 탭 |
| `--ds-shadow-paper` | 템플릿의 `--shadow`(인쇄용 종이 카드) |
| `--ds-shadow-tile` | 아이콘 타일, 재생 버튼 |

강조 채움은 `--ds-fill-accent`(타일·재생 버튼)와 `--ds-fill-accent-hover`다.

### 글자 크기와 간격

글자 크기는 11·12·13·14·15·16·17·18·19·20·22·28·29px이다. 작은 글자부터 `--ds-text-micro`, `-cap`, `-aux`,
`-ui`, `-body`, `-dialogue`, `-scene`, `-shot-sm`, `-lead`, `-shot`, `-heading`, `-display`, `-title`이다. 간격은 4px 격자
(`--ds-s1` 4px부터 `--ds-s7` 56px까지)이고, 누르는 요소의 최소 높이는 `--ds-tap`(44px)이다. 모든 검토 화면(스토리보드, 시트,
목록, 허브)은 같은 최대 폭 `--ds-page-max`(1280px)를 쓴다. 문서 제목 크기는 `--ds-title-size`, 자간은
`--ds-tracking-*`(라벨 0.05em, 머리말 0.12em, 제목 -0.035em 등)다. 문서 제목은 `clamp(1.75rem, 2.6vw, 2.25rem)`, 굵기 650,
자간 -0.035em으로 스토리보드 제목과 라이브러리 제목이 같다.

## 서체

| 언어 | 서체 | 근거 |
|---|---|---|
| 영어·베트남어·프랑스어·독일어·스페인어 | Inter 4.1 | 디자인 시스템이 가장 많이 고르는 웹폰트다. 2026-07 조사에서 이름이 확인된 웹폰트 가운데 Inter 36개, Roboto 14개, Poppins 10개였다. 베트남어 성조, 독일어 ß·ẞ, 프랑스어 œ, 스페인어 ñ·¿를 실제 파일에서 확인했다 |
| 한국어 | Pretendard 1.3.9 | Inter와 Source Han Sans를 바탕으로 만들어 라틴 글자와 어울린다. 정부 디자인 시스템(KRDS)이 같은 계열을 쓴다 |
| 일본어 | Noto Sans JP | 일본 디지털청 디자인 시스템이 채택했다 |
| 중국어 간체·번체 | Noto Sans SC / TC | 지역별 한자 형태를 따로 갖췄고 OFL이라 오프라인 동봉이 가능하다 |

웹 전체 점유율은 Roboto가 1위다(Web Almanac 2025 기준 페이지의 약 10%, Inter 1.4%). 이 시스템은 세련된
인상과 디자인 도구 쪽 채택을 우선해 Inter를 골랐다. 2026-10-31에 Inter 4.1과 Pretendard 1.3.9가 최신
릴리스인 것을 다시 확인했다. 파일 출처·라이선스·해시는 `review-assets/fonts/manifest.json`, 언어별 선택
규칙은 `docs/loops/009-review-typography/research.md`에 있다.

출처:

- [Inter 릴리스](https://github.com/rsms/inter/releases), [Inter 위키백과](https://en.wikipedia.org/wiki/Inter_(typeface))
- [Pretendard npm](https://npmjs.com/package/pretendard), [Homebrew cask](https://formulae.brew.sh/cask/font-pretendard)
- [디자인 시스템 기본 서체 조사](https://experiments.lazyweb.com/research/most-common-primary-font-in-design-systems)
- [2026 서체 조합과 Web Almanac 수치](https://muz.li/blog/font-pairings-2026/)
- [Google Fonts 인기 순위 정리](https://speckyboy.com/most-popular-google-fonts.md)

## 반응형 기준점

640px, 768px, 1024px 세 곳이다. CSS 변수는 미디어 쿼리에 쓸 수 없어 `max-width: 639px`, `767px`, `1023px`로
적는다(기준점에서 1px 아래). 1024px 미만에서는 왼쪽 메뉴가 본문 위로 올라가고 링크는 옆으로 넘겨 본다.
768px 미만에서는 시트 상단 카드의 사진·썸네일·기본 설정이 위아래로 쌓인다. 640px 미만에서는 목록이 한 열이 된다.

## 밝은 화면 고정

검토 화면은 밝은 화면만 쓴다(2026-08-14 결정, 템플릿 `color-scheme: light`). 스토리보드는 생성 이미지와
영상의 색을 판단하는 화면이라 바탕을 바꾸지 않는다. 대신 `prefers-contrast: more`와 `prefers-reduced-transparency`에서
반투명 표면을 불투명하게 바꾸고, `prefers-reduced-motion`에서 전환을 끈다. 어두운 화면이 필요해지면 `:root`의
색 토큰만 다시 정의하면 된다.

## 고유 디자인 요소

검토 화면이 흔한 카드 격자로 보이지 않게 하는 요소다. 새 화면은 이 가운데 맞는 것을 쓴다.

- 차가운 빛이 번지는 정적인 바탕(`--ds-canvas`와 두 빛)
- 번호 배지: 시퀀스(강조색 채움), 씬(테두리), 샷(`--ds-badge-dark`)
- 강조색 아이콘 타일과 같은 채움의 원형 재생 버튼
- 조명 무대: 2:3 무대에 패널 하나를 크게, 옆 띠에서 나머지를 고른다(출연진 카드, 캐릭터 시트)
- 대사 말풍선(`--ds-bubble`, 왼쪽 위 모서리만 4px)
- 회색 우물 안의 썸네일(참조 이미지 칸, 목록 카드의 이미지)

## 쓰지 않는 패턴

- 읽는 표면(카드, 시트)에는 흐림을 쓰지 않는다. 흐림은 떠 있는 메뉴에만 쓴다(`--ds-blur`).
- 글자에 그라데이션을 쓰지 않는다. 강조색 채움은 타일, 번호 배지, 재생 버튼 같은 도형에만 쓴다.
- 보라·파랑 그라데이션 히어로, 이모지 아이콘, 장식용 일러스트를 쓰지 않는다. 그림은 채널이 만든 이미지뿐이다.
- `--ds-shadow-glass-hover`보다 무거운 그림자, 테두리와 그림자를 겹친 이중 강조를 쓰지 않는다.
- 한 화면의 강조색은 하나다. 판정 색(ok/warn/bad)은 상태를 알릴 때만 쓴다.

## 상태

모든 링크와 버튼은 `:focus-visible`에 강조색 2px 윤곽선을 그린다. 카드는 호버에 `--ds-shadow-glass-hover`,
누르면 `--ds-press`만큼 내려앉는다. 이미지는 그려지기 전까지 회색 우물(`--ds-sunk`)이 자리를 잡아 레이아웃이 흔들리지 않고, 이미지가 없으면 같은 우물에 빈 상태 아이콘과 문구가 들어간다. 쓸 수 없는 재생 버튼은 흰 바탕에 테두리만 남기고 흐리게 바뀌며 커서가 `not-allowed`가 된다.

## 기본 부품

스토리보드 템플릿은 자기 클래스(`.scene`, `.view-setup` 등)를 그대로 쓴다. 아래 부품은 템플릿 밖 페이지용이다.
`review.css`가 템플릿 스타일보다 뒤에 오기 때문에 같은 우선순위의 부품 클래스를 템플릿 마크업에 붙이면
템플릿 규칙을 덮는다.

| 부품 | 스토리보드 원형 |
|---|---|
| `.ds-card`, `.ds-card-hero` | `.scene`, `.view-setup` |
| `.ds-tile` | `.view-setup-ico` |
| `.ds-kicker` | `.seq-kicker` |
| `.ds-pill` | `.scene-dur` |
| `.ds-panel`, `.ds-panel-head`, `.ds-panel-count` | `.shot-refs` |
| `.ds-tabs` | `.shot-tab-nav` |
| `.ds-chevron` | `.view-setup-head::after` |
| `.ds-chip` | 출연진 카드의 샷 칩 |

## 검증

토큰을 옮긴 뒤 스토리보드가 그대로인지 픽셀로 비교했다. 같은 에피소드를 HEAD 코드와 새 코드로 각각
렌더하고, 영상 프레임 로딩 차이를 없애려고 영상만 가린 채 1440×9000과 390×6000을 캡처했다. 두 크기
모두 PSNR이 무한대였다. 토큰 값을 바꿀 때도 같은 비교로 의도하지 않은 변화를 찾는다.
