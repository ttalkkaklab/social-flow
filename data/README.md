# data/ — 콘텐츠 데이터 루트

사용자가 운영하는 **채널별 디렉토리**가 이 아래에 생긴다 — 채널 하나(브랜드)가
디렉토리 하나이며, 그 산출물이 여러 SNS 플랫폼(Threads·Instagram·Facebook·
YouTube)으로 게시된다. 구조는 파이프라인 3단계와 1:1 로 대응한다:

```
data/
└── <채널 slug>/                     # /social-flow:channel add 가 생성
    ├── profile.md                   # 채널 프로파일 (톤·보이스·테마·플랫폼 SoT)
    ├── assets/                      # 채널 공용 자산 — 두 편 이상에서 다시 쓰는 것만
    │   ├── catalog.md               #   kind+id → 경로 (resolve-asset.py 가 읽는다)
    │   ├── branding/                #   프로필 로고 (마스터 + 플랫폼 리사이즈)
    │   ├── intro/                   #   인트로 마스터·스팅어·락업·로고음
    │   ├── outro/                   #   default.mp4 · 플랫폼별 youtube.mp4 / instagram.mp4
    │   ├── characters/<id>/         #   회차마다 같은 얼굴을 참조할 시트 (front/side/back/full)
    │   ├── audio/bgm/ · audio/sfx/  #   채널 기본 BGM · 반복 효과음
    │   ├── stills/                  #   다시 꺼내는 정물 (스와치·상품·카드 소품)
    │   ├── fonts/                   #   자막 ttf — produce 가 .work/fonts/ 로 복사
    │   └── scratch/                 #   보이스 테스트 등 버릴 후보
    ├── growth/                      # 성장 스킬 상태
    │   ├── <플랫폼>/                #   플랫폼별 — growth-plan.md(상시 승인서)·state.json·growth-log.md (threads/·youtube/·instagram/)
    │   ├── review-recent.html       #   /social-flow:review-recent — 최근 5편 유튜브·인스타 피드백 (퍼널·비교 막대)
    │   ├── keywords/                #   /social-flow:topic-scout — 시장 주제 스카우트
    │   │   ├── market-keywords.html #     사람이 보는 보고서 (퍼널·배수 막대)
    │   │   └── market-keywords.md   #     루프가 읽는 숫자·고른 구 정본
    │   ├── autoproduce.json         #   채널 공용 — 자동 저작 예산·이력 (영상 한 편이 두 플랫폼에 다 나가므로 플랫폼별로 나누지 않는다)
    │   └── .autoproduce.lock/       #   채널 공용 락 — 두 성장 루프가 동시에 저작하는 것을 막는다 (mkdir 원자성, 60분 지나면 죽은 락)
    └── episodes/                    # 회차 — assets 와 같은 층. 주제 하나 = 디렉토리 하나
        └── <주제 slug>/
            ├── storyboard/          # 1차: 이미지 포함 스토리보드
            │   ├── research.md      #   조사·검증 원장
            │   ├── storyboard.md    #   사람이 승인하는 문서 (status 추적)
            │   ├── storyboard.html  #   검토용 렌더 — scenes.js 직접 로드 (스킬 템플릿 기반)
            │   ├── scenes.js        #   기계가 읽는 SoT (THEME+SCENES)
            │   ├── script.md        #   촬영 모드 한정 — 촬영 대본
            │   └── images/          #   씬별 9:16 생성 이미지 (촬영 모드는 생략)
            ├── .work/               # 제작 중간 산출물 (gitignore)
            └── output/              # 2차: 플랫폼별 콘텐츠
                ├── video/           #   video.mp4(클린) · video-sub.mp4(번인) · subs.srt · cover.jpg · build-report.txt · cost-report.txt(자동 저작분)
                ├── threads/post.md
                ├── instagram/caption.md
                ├── facebook/post.md
                ├── youtube/meta.md
                └── publish-log.md   # 게시 기록 (permalink)
```

- **회차는 `episodes/` 아래** — 채널 루트는 `profile.md` · `assets/` · `growth/` ·
  `episodes/` 네 칸이다. 주제 디렉토리를 채널 루트에 두지 않는다. 옛 배치는
  `episodes/<주제>/` 로 옮긴다. 조회 glob 은 `data/<채널>/episodes/*/storyboard/`.
- **`assets/` 는 공용물만** — 한 편용 생성물(회차 BGM·씬 PNG·TTS)은 그 회차
  `.work/` 에 둔다. 확정본은 종류 폴더 맨 위, 중간물은 그 안의 `.work/` 다.
  조회는 `skills/channel/references/resolve-asset.py <채널dir> <kind> [id]`.
  catalog 행이 없어도 `outro/default.mp4` · 옛 `assets/outro.mp4` 같은 기본
  경로는 찾는다. 비어 있는 종류 폴더는 만들지 않는다 — 파일이 생긴 뒤에 연다.
- 진행 상태는 `storyboard.md` frontmatter 의 `status` 로 추적한다:
  `draft → approved → produced → published`. **autoproduce 가 만든 주제는
  `approved` 를 거치지 않고 바로 `produced` 로 시작한다** — 사람 승인 대신 기계
  게이트를 통과한 것이라 `auto_produced: true` 와 `approved_by` 로 구분한다.
- 영상·오디오 원본(mp4/wav)은 `.gitignore` 로 커밋에서 제외된다 — 재생성 가능.
- **SNS 게시 토큰은 이 디렉토리에 두지 않는다** — 저장소 밖
  `~/.config/social-flow/<채널 slug>/` (data/ 와 동일 slug)에 두고, 게시 툴의
  `channel` 인자가 그 디렉토리를 가리킨다.
