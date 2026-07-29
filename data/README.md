# data/ — 콘텐츠 데이터 루트

사용자가 정한 **카테고리별 디렉토리**가 이 아래에 생긴다. 구조는 파이프라인
3단계와 1:1 로 대응한다:

```
data/
└── <카테고리 slug>/                 # /social-flow:category add 가 생성
    ├── profile.md                   # 카테고리 프로파일 (톤·보이스·테마·채널 SoT)
    ├── assets/                      # 카테고리 공용 자산 (outro.mp4 등)
    └── <주제 slug>/                 # 게시 주제 하나 = 디렉토리 하나
        ├── storyboard/              # 1차: 이미지 포함 스토리보드
        │   ├── research.md          #   조사·검증 원장
        │   ├── storyboard.md        #   사람이 승인하는 문서 (status 추적)
        │   ├── scenes.js            #   기계가 읽는 SoT (THEME+SCENES)
        │   └── images/              #   씬별 9:16 생성 이미지
        ├── .work/                   # 제작 중간 산출물 (gitignore)
        └── output/                  # 2차: 채널별 콘텐츠
            ├── video/               #   video.mp4 · cover.jpg · build-report.txt
            ├── threads/post.md
            ├── instagram/caption.md
            ├── facebook/post.md
            ├── youtube/meta.md
            └── publish-log.md       # 게시 기록 (permalink)
```

- 진행 상태는 `storyboard.md` frontmatter 의 `status` 로 추적한다:
  `draft → approved → produced → published`
- 영상·오디오 원본(mp4/wav)은 `.gitignore` 로 커밋에서 제외된다 — 재생성 가능.
