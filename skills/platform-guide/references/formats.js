/**
 * formats.js — 포맷 프리셋 정본 (Single Source of Truth)
 *
 * 이 파일이 두 포맷의 모든 상수를 담는다. 빌더·템플릿·리뷰어·문서에 흩어져 있던
 * 숫자를 한곳으로 모으고, format-lint.js 가 그 인라인 미러를 여기와 기계로 대조한다.
 *
 * ┌ 읽는 쪽 ────────────────────────────────────────────────────────────┐
 * │ format-resolve.js  프리셋 → format.env(--sh) / JSON(--json) / URL   │
 * │ format-lint.js     인라인 미러와 여기를 대조 (읽기 전용)             │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * 브라우저는 이 파일을 안 읽는다 — data/<채널>/<주제>/ 에서 플러그인 루트로 가는
 * <script src> 경로가 없다. 템플릿은 인라인 미러를 갖고 린트가 대조한다.
 *
 * ## shorts-9x16 값의 성격
 *
 * **전부 오늘 코드에 이미 박혀 있는 값을 옮겨 적은 것이다.** 새 값도 반올림도 없다.
 * 이 항등성이 회귀 0 의 근거이고 1단계 인수 조건이다 — FORMAT 없는 기존 scenes.js 에
 * format-resolve.js --sh 를 돌리면 오늘 빌더 인라인 기본값과 문자 동일한 방출이 나온다.
 * 값을 고칠 일이 있으면 반드시 원본 코드와 함께 고친다(근거 주석의 파일:줄 참조).
 *
 * ## youtube-long-16x9 의 provisional
 *
 * zone·fonts 는 2026-08-17 데스크톱 웹 실측으로 채웠다(safezone-landscape.md).
 * provisional 이 남아 있는 이유는 모바일 웹 가로와 상단 제목바를 못 쟀기 때문이고,
 * 그 둘은 zone 을 좁히는 방향으로만 움직일 수 있다.
 *
 * sub 는 영영 null 이다 — burn:false 라 태울 곳이 없다. format-resolve.js 는
 * burn 이 열린 포맷에서만 sub 를 요구한다. zone·fonts 가 null 인 호출은 여전히
 * exit 1 로 거부한다 — 조용히 세로 값으로 떨어지면 12분치 캡처를 태운 뒤에야 드러난다.
 */

'use strict';

/**
 * 안전영역·자막 좌표는 세로 실측값이고 가로는 미정이다.
 * pacing 은 §3.2 표, guards 는 §2.5 방출 표가 정본이다.
 */
const FORMATS = {
  'shorts-9x16': {
    label: '쇼트폼 9:16',
    provisional: false,

    // video-template.html:41 --w/--h · capture-frames.sh:13 --window-size
    canvas: { w: 1080, h: 1920, fps: 30 },

    // storyboard/SKILL.md:233 · produce/SKILL.md:252 · cost-tiers.md:32-33
    // 1088 인 이유는 gpt-image 의 16 배수 제약이다(1080 이 안 들어간다).
    image: { gpt: '1088x1920', local: '1088x1920', zoomBase: '1620x2880' },

    // video-template.html:42 --zone-x/--zone-top/--zone-bottom
    zone: { x: 176, top: 190, bottom: 570, anchor: 'top' },

    // storyboard-html-template.html:286~331 의 프레임폭 비율.
    // 값은 절대px/1080 이고 린트가 그 CSS 와 대조한다.
    fonts: {
      kicker: 0.0315,
      coverTitle: 0.0926,
      stat: 0.1898,
      statLabel: 0.037,
      title: 0.0556,
      capTitle: 0.046,
      capDesc: 0.0324,
      foot: 0.0241,
      floorPx: 24,
      statGuard: 0.1898,
    },

    // build-reel.sh:452-454 ASS 헤더·Style Sub
    sub: {
      playResX: 1080,
      playResY: 1920,
      fontSize: 58,
      marginLR: 250,
      marginV: 380,
      outline: 5,
      shadow: 1.7,
    },

    // §3.2 페이싱 표. sceneMax=MAX_DUR(build-reel.sh:49),
    // recSceneMax=MAX_SCENE(build-screencast.sh:37) — 읽는 빌더가 서로 다르다.
    pacing: {
      sceneMin: 4,
      sceneMax: 13,
      recSceneMax: 20,
      charCap: { cover: 40, body: 50 },
      sentMin: 8,
      sentMax: 25,
      rate: 4.5,
      totalMin: 35,
      totalMax: 75,
      totalHard: 90, // build-screencast.sh:202 의 t>90 리터럴
      sceneCountMin: 4,
      sceneCountMax: 7,
    },

    chapters: null, // 쇼트폼에 챕터 개념이 없다

    // scenes-schema.md:280-283 — b-roll 칸 + 모션 배경 합쳐 최대 2칸(8초×2)
    video: { aspectRatio: '9:16', generatedSecondsMax: 16 },

    // 두 값이 다른 개념이다 — 한 필드로 묶으면 팬을 켜는 순간 중앙 줌이 망가진다.
    //   zoomSpan   = 카드당 중앙 켄번즈 총 줌 폭 (build-reel.sh:64 ZOOM_SPAN)
    //   panZoom*   = 팬 베이스 배율 clamp 범위 (§7.1, 가로 신규 — KB_ZOOM_MIN/MAX)
    // 세로는 panAllowed:false 이고 cards.tsv 5열이 항상 빈 칸이라 팬 체인에 안 들어간다.
    kenburns: { zoomSpan: 0.035, panZoomMin: 1.06, panZoomMax: 1.35, panAllowed: false },

    burn: true, // build-reel.sh:66 BURN 기본 1

    // capture-frames.sh:13. urlFormat 부재 = URL 에 format= 이 안 붙는 오늘 동작
    capture: { w: 1080, h: 1920, urlFormat: null },

    // §2.5 방출 표의 가드 키 — 전부 "그 기능을 끄는 값"이다.
    // 오늘 빌더에 없는 변수라 대조할 인라인 기본값이 없고, 0 이 곧 오늘 동작이다.
    guards: {
      strictDim: 0, // 0 = 자산 해상도 불일치를 경고 한 줄로
      ovlHold: 0, // 0 = 오버레이가 씬 내내 (build-screencast.sh:151 에 enable 절 없음)
      shrinkWarn: 3.0, // build-screencast.sh:38 — 미러 키
      blowupWarn: 0, // 0 = 업스케일 경고 끔 (가로 전용 신규)
      strictAr: 0, // build-intro.sh 전용. 회차 빌드는 안 읽는다
    },

    outroAsset: 'outro.mp4',
    introAsset: 'intro-master.mp4',
    stingerAsset: 'intro-stinger.mp4',

    outputs: ['reel.mp4', 'reel-sub.mp4', 'subs.srt', 'cover.jpg'],
    platforms: ['youtube', 'instagram', 'threads', 'facebook'],
    queueKeys: ['queue', 'queue_instagram'],
    hashtags: { required: ['#Shorts'], forbidden: [] },

    gates: { autoproduce: true, costCapKey: 'max_cost_per_video' },
    midrollThresholdSec: null,
  },

  'youtube-long-16x9': {
    label: '유튜브 롱폼 16:9',
    // 세이프존은 2026-08-17 데스크톱 웹 실측으로 확정했다(safezone-landscape.md).
    // provisional 이 남아 있는 이유는 두 표면을 아직 못 쟀기 때문이다 —
    // 모바일 웹 가로(에뮬레이션이 안 걸린다)와 상단 제목바(이 클라이언트에서 렌더 0).
    // 그 둘은 zone 을 **좁히는** 방향으로만 움직일 수 있다.
    provisional: true,

    canvas: { w: 1920, h: 1080, fps: 30 },

    // 가로 gpt 주문은 2560x1440 — 픽셀 단가 키가 붙기 전까지 §7.3 이 1920x1088 로
    // 못 박아 뒀다. 로컬(Z-Image)은 2048x1152 다.
    image: { gpt: '2560x1440', local: '2048x1152', zoomBase: '2880x1620' },

    // 실측 2026-08-17 — safezone-landscape.md 가 정본이다.
    // 좌표는 1920x1080 캔버스 단위이고 DOM rect 를 S=1920/플레이어폭 으로 환산해 얻었다.
    //   x 96      프레임 폭 5%. 전체화면 버튼이 최악 36px 를 먹으므로 여유 60px
    //   top 96    상단 그라디언트 최악 144px 은 덮을 뿐 가리지 않는다. 폭 인셋과 같은 값
    //   bottom 285  **자막 2줄 최악 상단 y795 에서 온다**(플레이어 873px 일 때).
    //               사용자 결정(2026-08-17): 209~285 중 최악 기준.
    //               컨트롤바(실화면 59px 고정)는 자막보다 아래라 이 값에 포함된다.
    zone: { x: 96, top: 96, bottom: 285, anchor: 'top' },

    // 세로 비율 × 0.72 · 하한 24px. 높이 비례(0.5625)면 본문이 20px 아래로 떨어지고
    // 폭 비례(1.0)면 제목 2줄이 zone 을 넘는다. 값은 절대px/1920 비율로 적는다.
    // 검산: 커버 블록 = kicker 24 + 제목 72×1.14×2줄 + stat 148 + label 29 ≈ 409px
    //       zone 높이 699px 안이고 제목 3줄(491px)도 208px 여유다【실측 계산】.
    fonts: {
      kicker: 0.0125,      // 24px — 하한이 걸린다
      coverTitle: 0.0375,  // 72px
      stat: 0.0771,        // 148px
      statLabel: 0.0151,   // 29px
      title: 0.0224,       // 43px
      capTitle: 0.0188,    // 36px
      capDesc: 0.0130,     // 25px
      foot: 0.0125,        // 24px — 하한
      floorPx: 24,
      statGuard: 0.0771,
    },

    // BURN=0 이라 태울 곳이 없다. 번인이 열리면 여섯 값이 함께 온다.
    // 참고로 유튜브 자체 자막은 캔버스 단위 48px 로 일정하다【실측】 — 우리가 번인을
    // 열게 되면 그 값이 출발점이지 세로의 58 이 아니다.
    sub: null,

    pacing: {
      sceneMin: 6,
      sceneMax: 20, // 생성 레인 카드 길이(MAX_DUR)
      // 촬영 레인 씬 길이 상한 없음 — 사용자 결정 2026-08-16.
      // "내가 녹화한 파일도 있을테니까" — 녹화 한 덩어리가 한 씬으로 들어오는 것이
      // 정상 경로다. null 이 의미 정본이고 리졸버가 MAX_SCENE=999999 로 방출한다
      // (build-screencast.sh:136 의 awk d>m 비교식을 안 고치려는 전달 표현).
      recSceneMax: null,
      charCap: { cover: 70, body: 90 },
      sentMin: 12,
      sentMax: 40,
      rate: 4.5,
      totalMin: 480,
      totalMax: 900,
      totalHard: 1200,
      sceneCountMin: 28,
      sceneCountMax: 70,
    },

    // 생성 레인 — 사람이 챕터를 저작하고 길이 대역을 건다.
    chapters: {
      min: 5,
      max: 10,
      secMin: 45,
      secMax: 120,
      introSecMin: 25,
      introSecMax: 35,
      ytMinSec: 10,
      firstAtZero: true,
    },

    // 촬영 레인 — 챕터를 기계가 파생한다(사용자 위임 판정 2026-08-16).
    //
    // 길이 대역(secMin/secMax)을 안 거는 이유가 핵심이다. 챕터 경계는 씬 시작
    // 지점에서만 열리므로(scenes-schema §chapter) 씬 하나는 반드시 챕터 하나 안에
    // 통째로 들어간다. 씬 상한이 없는 레인에서 챕터 상한을 남기면 상한이 20초에서
    // 120초로 자리만 옮긴다.
    //
    // 대신 개수 대역을 건다. 사람은 씬에 `chapter` 문자열 하나만 적고 타임스탬프·
    // 10초 병합·요건 검사는 빌더가 실측 시각(cs = totf / fps)에서 만든다.
    //
    // 챕터를 붙이는 근거는 광고가 아니다 — 미드롤 슬롯은 Studio 에서 챕터와 무관하게
    // 놓인다【1차 support.google.com/youtube/answer/6175006 — 그 페이지에 'chapter'
    // 0회】. 근거는 탐색 수단이다. 한국어 롱폼은 자동 챕터가 사실상 안 붙어서
    // (미저작 59편 전부 0개 · 영어는 13편 중 7편, Fisher p≈1.2e-06【실측】)
    // 챕터를 안 쓰면 시청자가 15분 강의에서 원하는 대목으로 갈 방법이 없어진다.
    chaptersRec: {
      min: 3,           // 유튜브 요건. 병합 뒤 이 아래면 파일을 안 만들고 지나간다
      targetMin: 6,     // 저작 목표 — 게이트가 아니다
      targetMax: 13,
      secMin: null,     // 길이 대역을 안 건다 (위 주석)
      secMax: null,
      ytMinSec: 10,     // 10초 미만 경계는 앞 챕터로 접는다
      firstAtZero: true,
      labelSource: 'chapter', // 씬 title 을 복사하지 않는다 — title 은 구어 훅이고
                              // 챕터는 설명란 검색어라 레지스터가 다르다
    },

    // §7.1 — 도입·챕터 전환만, 회차 합산 40초(8초×5칸)
    video: { aspectRatio: '16:9', generatedSecondsMax: 40 },

    // zoomSpan 은 세로와 같다(중앙 줌은 포맷과 무관). panZoom* 이 §7.1 의 팬 상한 —
    // 이동폭 = W(z-1) 이므로 1.35 가 곧 35% 다.
    kenburns: { zoomSpan: 0.035, panZoomMin: 1.06, panZoomMax: 1.35, panAllowed: true },

    burn: false, // 유튜브는 클린 마스터 + subs.srt 를 받는다

    capture: { w: 1920, h: 1080, urlFormat: 'wide' },

    guards: {
      strictDim: 1,
      ovlHold: 5.0, // 로어서드 노출 길이 (씬 시작 기준)
      shrinkWarn: 3.0, // 방향과 무관하다 — 출력 글자px 식에 캔버스 폭이 안 들어간다
      blowupWarn: 1.0, // SHRINK<1 이면 업스케일. crop 1080~1920 대역이 함정이다
      strictAr: 1,
    },

    outroAsset: 'outro-16x9.mp4',
    introAsset: 'intro-master-16x9.mp4',
    stingerAsset: 'intro-stinger-16x9.mp4',

    outputs: ['reel.mp4', 'subs.srt', 'cover.jpg', 'thumbnail.jpg'],
    platforms: ['youtube'],
    queueKeys: ['queue_youtube_long'],
    hashtags: { required: [], forbidden: ['#Shorts'] },

    gates: { autoproduce: false, costCapKey: 'max_cost_per_video_long' },
    midrollThresholdSec: 480,
  },
};

/** window.FORMAT 이 없는 scenes.js 가 받는 포맷. 이 상수가 곧 회귀 0 의 정의다. */
const DEFAULT_FORMAT = 'shorts-9x16';

module.exports = { FORMATS, DEFAULT_FORMAT };
