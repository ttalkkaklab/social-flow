# data/ — 콘텐츠 데이터 루트

사용자가 운영하는 **채널별 디렉토리**가 이 아래에 생긴다 — 채널 하나(브랜드)가
디렉토리 하나이며, 그 산출물이 여러 SNS 플랫폼(Threads·Instagram·Facebook·
YouTube)으로 게시된다. 구조는 파이프라인 3단계와 1:1 로 대응한다:

```
data/
└── <채널 slug>/                     # /social-flow:channel add 가 생성
    ├── profile.md                   # 채널 프로파일 (톤·보이스·테마·플랫폼 SoT)
    ├── assets/                      # 채널 공용 자산 — branding/(로고) · intro/(인트로 영상·로고음) · outro.mp4
    ├── growth/                      # 성장 스킬 상태
    │   ├── <플랫폼>/                #   플랫폼별 — growth-plan.md(상시 승인서)·state.json·growth-log.md (threads/·youtube/·instagram/)
    │   ├── autoproduce.json         #   채널 공용 — 자동 저작 예산·이력 (영상 한 편이 두 플랫폼에 다 나가므로 플랫폼별로 나누지 않는다)
    │   └── .autoproduce.lock/       #   채널 공용 락 — 두 성장 루프가 동시에 저작하는 것을 막는다 (mkdir 원자성, 60분 지나면 죽은 락)
    └── <주제 slug>/                 # 게시 주제 하나 = 디렉토리 하나
        ├── storyboard/              # 1차: 이미지 포함 스토리보드
        │   ├── research.md          #   조사·검증 원장
        │   ├── storyboard.md        #   사람이 승인하는 문서 (status 추적)
        │   ├── storyboard.html      #   검토용 렌더 — scenes.js 직접 로드 (스킬 템플릿 기반)
        │   ├── scenes.js            #   기계가 읽는 SoT (THEME+SCENES)
        │   ├── script.md            #   촬영 모드 한정 — 촬영 대본
        │   └── images/              #   씬별 9:16 생성 이미지 (촬영 모드는 생략)
        ├── .work/                   # 제작 중간 산출물 (gitignore)
        └── output/                  # 2차: 플랫폼별 콘텐츠
            ├── video/               #   video.mp4(클린) · video-sub.mp4(번인) · subs.srt · cover.jpg · build-report.txt · cost-report.txt(자동 저작분)
            ├── threads/post.md
            ├── instagram/caption.md
            ├── facebook/post.md
            ├── youtube/meta.md
            └── publish-log.md       # 게시 기록 (permalink)
```

- 진행 상태는 `storyboard.md` frontmatter 의 `status` 로 추적한다:
  `draft → approved → produced → published`. **autoproduce 가 만든 주제는
  `approved` 를 거치지 않고 바로 `produced` 로 시작한다** — 사람 승인 대신 기계
  게이트를 통과한 것이라 `auto_produced: true` 와 `approved_by` 로 구분한다.
- 영상·오디오 원본(mp4/wav)은 `.gitignore` 로 커밋에서 제외된다 — 재생성 가능.
- **SNS 게시 토큰은 이 디렉토리에 두지 않는다** — 저장소 밖
  `~/.config/social-flow/<채널 slug>/` (data/ 와 동일 slug)에 두고, 게시 툴의
  `channel` 인자가 그 디렉토리를 가리킨다.
