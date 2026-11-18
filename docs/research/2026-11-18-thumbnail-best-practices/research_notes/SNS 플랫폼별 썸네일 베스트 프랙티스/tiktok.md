# TikTok 커버(썸네일) 베스트 프랙티스 — 숏폼·롱폼·가로 영상 (조사일 2026-11-18)

근거 등급 표기: **[1차]** TikTok 공식 문서(developers.tiktok.com, support/creator-academy, 커뮤니티 가이드라인) · **[보도]** 기술 언론 · **[블로그]** 마케팅 업체·도구 사이트(대부분 출처 없음, 의견으로 취급).
조사 한계: TikTok 고객센터·Creator Academy 페이지가 JS 렌더링이라 WebFetch 로 본문을 거의 못 읽었다(제목만 반환). 커버 크롭·게시 후 수정 같은 핵심 UI 사실은 공식 문서로 확인하지 못했고, 블로그끼리 서로 어긋난다. 실제 계정 UI(TikTok Studio, ego lite)에서 직접 확인하는 것이 유일한 확정 수단이다.

## 1. 커버가 보이는 곳과 각 표면의 크롭

### Takeaway
커버가 정지 이미지로 보이는 곳으로 확인된 것은 프로필 그리드(3열)뿐이다. 검색 결과·재생목록·시리즈 목록 같은 다른 "목록형" 표면도 커버를 쓴다는 근거는 Miraflow 의 막연한 문장("썸네일로 표시되는 모든 곳") 하나다. For You·Following 피드는 자동재생이라 첫 프레임이 사실상의 커버 역할을 한다. 프로필 그리드는 9:16 커버를 가운데 기준 약 3:4로 잘라 보여 준다는 것이 다수 블로그·도구의 공통 주장이지만 공식 수치는 없고, 1:1 이라고 쓰는 블로그도 있어 충돌한다.

### Cited Findings
- [블로그] 프로필 그리드는 3열이고 커버를 약 3:4 로 보여 준다. 9:16 프레임에서 위·아래 약 240px(1920 기준 12.5%)씩 잘린다. 같은 출처가 안전영역을 "Y:240~1600"으로 적는데, 위·아래 240px 를 빼면 1680 이 되어 자체 수치가 맞지 않는다(아래 추론은 240~1680 사용). 위·아래 약 15% 가 숨는다는 변형 주장도 있다 — [nemovideo](https://www.nemovideo.com/blog/tiktok-thumbnail-guide), [thumbcrafted cover preview](https://thumbcrafted.com/tiktok-cover-preview), [lunabloom](https://blog.lunabloomai.com/tiktok-thumbnail-size-2/) (검색 요약 기준, 일부 페이지는 429로 본문 미확인)
- [블로그] 그리드 플래너 도구는 타일을 1080×1440(3:4) "가운데 크롭 + 조회수 배지"로 시뮬레이션한다 — [socialk.it TikTok grid planner](https://socialk.it/en/tools/tiktok-grid-planner), [pixgrid](https://pixgrid.io/tiktok-grid-maker)
- [블로그] 다른 도구는 표시 비율을 약 1:1.3 으로 적는다(3:4=1:1.33 과 근사) — [postiz](https://postiz.com/tools/tiktok-photo-resizer)
- [블로그·충돌] SocialRails(“Last verified: May 1, 2026”, 출처 없음)는 그리드가 **1:1 정사각 중앙 크롭**(위·아래 420px 숨김)이라고 쓰고, 하단 약 270px 에 캡션 첫 줄이 흰 글씨로 자동 오버레이된다고 주장한다. 다른 출처들과 어긋나고 근거가 없다 — [SocialRails](https://socialrails.com/blog/tiktok-thumbnail-size-guide)
- [블로그] 3:4 그리드가 Instagram 의 2025년 1월 변경과 같은 방향이라는 설명이 있으나, TikTok 이 1:1 그리드를 쓴 적이 있다는 출처는 찾지 못했다 — [oktopost (Instagram grid 2026)](https://www.oktopost.com/blog/instagram-changed-grid-layout-heres-everything-know-far/)
- [블로그] 데스크톱 웹 업로드에서 커스텀 커버를 올리면 **3:4 비율로 자르는 내장 크롭 가이드**가 뜬다(2024-01-16 기사) — [RouteNote](https://routenote.com/blog/upload-tiktok-thumbnail/).
- [블로그] 그리드 위 고정(pin) 3개가 맨 윗줄을 차지하고, 커버는 "영상이 썸네일로 표시되는 모든 곳"에 쓰인다(구체 위치 미기재, 2026-03-26) — [Miraflow](https://miraflow.ai/blog/tiktok-cover-image-strategy-2026-profile-grid-convert)
- [블로그] 커스텀 썸네일을 고르면 아래에 Preview 버튼이 생겨 "프로필 피드에서 어떻게 보일지" 미리 보여 준다(연도 미표기 기사) — [Lindsey Gamble](https://www.lindseygamble.com/blog/tiktok-launches-preview-feature-for-viewing-thumbnails-on-profile-feed)
- [1차] Display API 의 video 객체는 `cover_image_url`(정적 CDN 링크, "TTL of 6 hours"), `width`·`height`, `title`(최대 150자), `embed_link` 를 준다 — [TikTok API v2 Video Object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object)
- [이전 내부 조사] 피드(자동재생)에서는 커버 이미지가 보이지 않고 첫 1~3초 화면이 커버 역할을 한다. TikTok for Business 지침은 "첫 3초 안에 제안", "첫 6초에 훅" — `docs/research/2026-08-17-video-cover-design/index.html` (그 문서가 1차로 확인한 TikTok Ads 크리에이티브 지침 인용)

### Inferences
- 설계 기준은 "9:16 캔버스, 핵심(얼굴·제목)은 가운데 3:4 영역(Y 240~1680) 안, 더 보수적으로는 가운데 1:1 영역(Y 420~1500) 안"이 안전하다. 1:1 주장과 3:4 주장이 갈리므로 둘의 교집합(가운데 1080×1080)에 제목을 두면 어느 쪽이 맞아도 살아 있다.
- 그리드 타일에는 재생수 배지가 붙는다(도구 시뮬레이션 기준, 위치는 출처에 없음). 제목을 타일 모서리에 붙이지 않는다.
- RouteNote 의 웹 3:4 크롭 도구는 TikTok 이 커버의 "목록용 표시 영역"을 3:4 로 다룬다는 간접 증거다. 단, 이것은 위의 "9:16 캔버스" 기준과 충돌한다: Studio 가 업로드 이미지를 3:4 로 잘라 저장한다면 플러그인은 처음부터 3:4(예: 1080×1440) 커버를 준비해야 하고, 9:16 을 저장한다면 9:16 캔버스에 3:4 안전영역을 두면 된다. 어느 쪽인지는 아래 Gaps 참고.
- Display API 가 정적 `cover_image_url` 을 주므로 공유 카드·임베드·외부 목록도 이 커버를 쓸 가능성이 높다(추론).
- 피드 노출이 대부분인 숏폼에서는 커버보다 첫 프레임이 성과를 좌우하고, 커버는 프로필 방문자·검색 사용자에게 작동한다. 따라서 "커버 = 목록용 정지 이미지", "첫 프레임 = 피드용 훅"으로 역할을 나눠 설계한다.

### Gaps
- TikTok 공식 문서에서 그리드 크롭 비율·픽셀 수치를 찾지 못했다(공식 페이지 본문 미수집).
- Studio 가 업로드한 커스텀 커버를 3:4 로 저장하는지 9:16 으로 저장하는지 — 플러그인이 준비할 파일 규격을 결정하는 사실인데 확인하지 못했다. 실제 Studio 에서 업로드·저장 후 `cover_image_url` 의 픽셀 크기로 확인할 수 있다.
- 검색 결과 탭(레이아웃 자체가 출처 미확인), Following 탭, 재생목록·Series 목록, 공유 카드에서의 크롭은 어떤 출처도 다루지 않았다. 실제 계정 화면 캡처로 확인해야 한다.
- 하단 캡션 자동 오버레이 주장(SocialRails)은 다른 출처에서 재확인되지 않았다.

## 2. 커버 설정 방법 — 앱, TikTok Studio 웹, Content Posting API, 게시 후 수정

### Takeaway
게시 전에는 앱·웹 모두 "영상 프레임 선택" 또는 "이미지 업로드"가 가능하다(웹은 3:4 크롭 도구). Content Posting API 는 영상의 경우 `video_cover_timestamp_ms`(프레임 선택)만 있고 **커스텀 커버 이미지 필드도, 게시 후 커버·공개 범위 수정 엔드포인트도 없다**. 게시 후 커버 수정은 앱의 "Edit post"로 가능하다는 2025–2026 블로그 보고가 다수지만 7일 창·하루 1회 같은 제한이 붙고 계정·지역·앱 버전마다 다르다는 단서가 붙는다.

### Cited Findings
- [1차] Direct Post 요청 본문의 `video_cover_timestamp_ms`(int32, 선택): "Specifies which frame (measured in milli-seconds) will be used as the video cover." 미지정·무효값이면 "the cover is set to the first frame of the uploaded video." 커버 이미지 업로드 필드는 문서에 없다 — [Content Posting API — Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [1차] 같은 문서의 `privacy_level`: `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, `SELF_ONLY` 중 `/creator_info/query/` 가 돌려준 값만 허용. 게시 후 편집 필드·엔드포인트는 문서에 없다 — [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [1차] 사진(캐러셀) 게시는 `photo_cover_index`(0부터, 필수)로 `photo_images` 중 커버를 고른다. `post_mode` 는 `DIRECT_POST`(`video.publish` 스코프) 또는 `MEDIA_UPLOAD`(받은편지함으로 보내 사용자가 앱 편집 흐름에서 마무리, `video.upload` 스코프) — [Content Posting API — Photo Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post)
- [1차] TikTok 고객센터 "How to post a video on TikTok": TikTok Studio 웹(www.tiktok.com/tiktokstudio)의 Upload 화면에 Cover 옵션이 있다(검색 요약 기준, 본문 직접 열람 실패) — [TikTok Support](https://www.tiktok.com/support/faq_detail?id=7581826684085606968)
- [1차, 요약 기준] Creator Academy 웹 제작 소개 글: 웹에서 "자신의 커버를 업로드하거나 영상의 한 프레임을 커버로 선택"할 수 있다 — [Creator Academy: tool-web-creation-intro](https://www.tiktok.com/creator-academy/article/tool-web-creation-intro) (본문 렌더링 실패, 검색 스니펫만 확인)
- [블로그, 2024-01-16] 웹 업로드 절차: 영상 선택 → Edit cover → Upload cover → 파일 선택 → 3:4 크롭 → 확인. JPG/JPEG/PNG. 당시 모바일은 프레임 선택만 됐다고 기술 — [RouteNote](https://routenote.com/blog/upload-tiktok-thumbnail/); 같은 시기 앱·데스크톱 모두 가능하다는 Matt Navarra 인용 — [Net Influencer](https://www.netinfluencer.com/tiktok-new-feature-upload-custom-thumbnail/); 반대로 날짜 없는 Tabcut 글은 커스텀 커버 업로드 기능이 "has since been removed"라고 쓴다(시점 불명, 충돌) — [Tabcut](https://tabcut.com/blog/post/how-to-upload-a-custom-tiktok-cover-image-shorts-tiktoktipsandtricks)
- [블로그] 앱 게시 흐름에 Upload 옵션이 생겨 카메라 롤 이미지를 커버로 쓸 수 있게 됐다(연도 미표기) — [Lindsey Gamble](https://www.lindseygamble.com/blog/tiktok-allows-the-uploading-of-custom-thumbnail-covers)
- [블로그] 커버 규격 1080×1920(최소 720×1280), JPG/PNG, sRGB, 최대 20MB(같은 글 FAQ는 5MB 미만 권장 — 자체 모순) — [SocialRails](https://socialrails.com/blog/tiktok-thumbnail-size-guide)
- [블로그, 2026-07-28] 게시 후 앱의 ⋯ → "Edit post"에서 설명·커버를 **게시 후 7일 이내, 하루 1회** 바꿀 수 있다. 근거는 TikTok 고객센터가 아니라 크리에이터의 YouTube 시연이고, "availability can vary by account, region, and app version" — [JoinBrands](https://joinbrands.com/blog/how-to-edit-tiktok-videos-after-posting/)
- [블로그] 같은 "Edit post" 경로로 설명·해시태그·커버·커버 텍스트를 바꿀 수 있다는 2023-01 크리에이터 영상 — [@danthomasuk](https://www.tiktok.com/@danthomasuk/video/7188554736365260038); 반대로 같은 시기 "게시 후 커버 변경 불가, 삭제 후 재업로드뿐"이라는 영상 — [@videolikeadad](https://www.tiktok.com/@videolikeadad/video/7185588101626989866); Kapwing 가이드도 "변경 불가"라고 기술(작성 시점 약 1년 이상 전) — [Kapwing](https://www.kapwing.com/resources/how-to-change-tiktok-thumbnail/)
- [블로그] "Delete and re-edit"(게시물을 지우고 원본 클립으로 편집 화면 복귀)이 대체 경로로 소개된다 — [@vision.rift](https://www.tiktok.com/@vision.rift/video/7638588072199736598). 재업로드는 기존 참여 지표를 잃는다.
- [내부 기준] 이 플러그인의 2026-11-18 지침은 Studio 에서 비공개(Only you) 상태로 커버를 편집·저장·재확인한 뒤 같은 게시물을 Everyone 으로 바꾸게 하고, 번들 도구에 공개범위·커버 변경 엔드포인트가 없다고 적어 둔다 — `skills/publish/references/tiktok-private-cover.md`

### Inferences
- API 업로드만으로는 커스텀 커버 이미지를 넣을 수 없다. 선택지는 (a) 커버로 쓸 정지 화면을 영상 안 특정 시점에 실제로 넣고 `video_cover_timestamp_ms` 로 지정, (b) 비공개 업로드 후 Studio 웹에서 이미지 업로드(3:4 크롭 도구). (a)는 화면에 문자 없음 규칙(영상 위 표기 금지)과 충돌할 수 있으므로, 제목이 들어간 커버는 (b) 경로가 맞다.
- "7일·하루 1회" 제한이 사실이면 비공개 상태에서 커버를 한 번에 맞춰야 하고, 실패 시 다음 날까지 기다려야 할 수 있다. 내부 지침의 "제한이 있으면 비공개로 두고 보고" 규칙과 맞물린다.
- 게시 후 검증은 Display API `cover_image_url`(6시간 TTL)로 저장된 커버를 받아 비교하는 방식이 가능하다(별도 `video.list` 스코프 필요 — 스코프명은 이 조사에서 재확인하지 않음).

### Gaps
- 게시 후 커버 수정의 공식 제한(기간·횟수·Studio 웹 지원 여부)을 공식 문서로 확인하지 못했다.
- Studio 웹의 현재(2026-11) 커버 크롭 비율이 여전히 3:4 인지, 앱 업로드와 같은지 미확인.
- 앱 내 커버 텍스트·제목 스타일(커버 위 글자 템플릿)의 현재 종류·위치·크기 — 이번 조사에서 다룬 출처가 없다.
- Content Posting API 에 2025–2026년 커스텀 커버 이미지 필드가 추가됐다는 근거는 찾지 못했다(Direct Post 문서 현재본에 없음).

## 3. 가로(16:9)·롱폼 영상의 커버

### Takeaway
TikTok 은 2022년 말부터 가로 전체화면 모드를 시험했고, 1분을 넘는 16:9 영상에 "Full screen" 버튼을 붙인다. 업로드 길이는 10분 → 15분 → 30분 → 60분(2024년 일부 사용자 시험)으로 늘었다. 그러나 가로·롱폼 영상의 커버가 그리드·검색에서 어떻게 표시·크롭되는지에 대한 공식 안내나 신뢰할 만한 분석은 찾지 못했다.

### Cited Findings
- [보도] TikTok 이 일부 사용자 대상으로 가로 전체화면 모드를 시험 중이라고 TechCrunch 에 확인(2022-12) — [Tubefilter](https://www.tubefilter.com/2022/12/14/tiktok-horizontal-video-feed-rival-youtube-format/amp/), [Yahoo/TechCrunch](https://news.yahoo.com/tiktok-wants-turn-phone-sideways-163338648.html)
- [보도] 크리에이터에게 가로 촬영을 권하는 움직임(2023) — [Social Media Today](https://www.socialmediatoday.com/news/tiktok-encouraging-creators-post-videos-landscape-format/705914/)
- [블로그] 16:9 이고 1분을 넘으면 Full Screen 버튼이 붙는다. 60초 미만 가로 영상은 위·아래 검은 띠가 붙는다 — [Kapwing horizontal TikToks](https://kapwing.com/resources/horizontal-tiktoks), [clickanalytic](https://www.clickanalytic.com/blog/tiktok-aspect-ratio-complete-guide/)
- [보도] 60분 업로드는 2024년 소수 사용자 시험, 그 전 30분(2024-01)·15분(2023)·10분(2022) — [Search Engine Land](https://searchengineland.com/tiktok-testing-60-minute-video-uploads-440588); 2025-04 기준 확대 진행 중이라는 독일 보도 — [onlinemarketing.de](https://onlinemarketing.de/social-media-marketing/tiktok-longform-update-60-minuten-videos-rollout). 전면 출시 확인 출처는 찾지 못했다.
- [블로그] 2026년에도 9:16 이 최적이며 가로 게시물은 성과가 낮다는 의견 — [posteverywhere](https://posteverywhere.ai/blog/tiktok-aspect-ratio) (의견, 데이터 없음)
- [1차] API 의 video 객체가 `width`·`height` 를 따로 주므로 가로 영상도 원본 비율 정보를 가진다 — [Video Object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object)

### Inferences
- 가로 영상도 그리드 타일은 세로(3:4 추정)이므로, 프레임 선택 커버를 쓰면 16:9 프레임이 세로 타일에 레터박스되거나 가운데만 잘릴 가능성이 높다. 롱폼·가로 영상일수록 9:16(최소 3:4 영역에 맞춘) 커스텀 커버 업로드가 실익이 크다 — 실기 확인 필요.
- 롱폼은 피드 자동재생보다 검색·프로필·재생목록으로 찾아오는 비중이 커질 수 있어, 커버의 "목록형 표면" 역할이 숏폼보다 중요해진다(추론, 데이터 없음).

### Gaps
- 가로 영상 커버의 그리드·검색 표시 방식, 커스텀 커버 비율 요구치, TikTok 공식 안내 — 출처 없음.
- 60분 업로드의 2026-11 현재 공개 범위 미확인.

## 4. 디자인 가이드 — 커버 문구, 안전영역, 얼굴, 시리즈 번호, 그리드 일관성, 첫 프레임과의 구분

### Takeaway
공식 TikTok 문서에서 커버 디자인 규칙은 찾지 못했다. 실무 가이드(의견)는 공통적으로 ① 짧고 큰 고대비 문구(0~5단어), ② 가운데 배치, ③ 일관된 템플릿으로 그리드를 "목차"처럼 만들기, ④ 시리즈는 색·아이콘·레이아웃으로 묶기를 권한다. 커버가 프로필 방문·검색 클릭률에 미치는 효과를 측정한 공개 데이터(표본 크기 포함)는 없었다.

### Cited Findings
- [블로그, 2026-03-26] 그리드 타일이 작으므로 크기가 최대 제약. 문구는 0~3단어(다른 절에서는 3~5단어 — 같은 글 안에서 불일치), 고대비, 템플릿·색으로 카테고리 구분, 시리즈는 색·아이콘·레이아웃으로 표시(번호 권고 없음). "의도적 커버 전략을 쓴 프로필이 기본 프레임보다 꾸준히 낫다"는 주장에 데이터·표본 없음. TikTok 은 프로필 전환 지표를 제공하지 않아 프로필 조회 대비 팔로워 증가로 추정해야 한다고 기술 — [Miraflow](https://miraflow.ai/blog/tiktok-cover-image-strategy-2026-profile-grid-convert)
- [블로그] 200×350px(프로필 썸네일 크기)에서 가독성 테스트, 핵심은 가운데 영역 — [SocialRails](https://socialrails.com/blog/tiktok-thumbnail-size-guide)
- [블로그, 2023-03-07 갱신] 커버 스타일을 하나로 통일해 프로필을 정돈. 커버는 처음 온 시청자에게 클릭 전 맥락을 주므로 교육형 콘텐츠에 특히 유용. Canva 등 외부 커버는 브랜딩엔 좋지만 TikTok 이 앱 내 도구·로파이 미감을 선호해 참여가 떨어질 수 있다는 의견(근거 없음, 오래된 자료) — [Planoly](https://planoly.com/blog/tiktok-covers)
- [블로그] 그리드 3개 게시물을 이어 붙이는 프로필 배너 기법 — [Dreamina/CapCut](https://dreamina.capcut.com/resource/tiktok-banner-tutorial) (의견)
- [블로그] 커버 문구와 함께 TikTok 편집기의 텍스트는 자동 제목 위에 덧입혀진다는 언급 — [SocialRails](https://socialrails.com/blog/tiktok-thumbnail-size-guide) (재확인 안 됨)
- [이전 내부 조사·1차] TikTok for Business 광고 지침: 첫 3초에 제안, 첫 6초에 훅, 사람(크리에이터·직원·고객)을 화면에 — 피드용 첫 프레임 설계 근거 — `docs/research/2026-08-17-video-cover-design/index.html`
- [블로그] 재생목록(Creator Playlists)은 팔로워 1만(혹은 5천~1만) 이상 계정에서 쓸 수 있고 이름은 생성 시 지정 — [Kapwing playlists](https://www.kapwing.com/resources/tiktok-playlists/), [Shopify](https://www.shopify.com/blog/how-to-make-a-playlist-on-tiktok). "Part 2" 같은 번호 표기 관행에 대한 근거 자료는 찾지 못했다.
- [블로그] 유료 Series 는 이름·설명·커버·가격을 따로 설정한다 — [Metricool](https://metricool.com/tiktok-series) (공식 고객센터 페이지는 열람하지 못함)

### Inferences
- 우리 기존 규칙(커버 제목 16자 이내 + 주제어, 가운데 배치, 생성 배경 + HTML 제목)은 실무 의견과 같은 방향이다. TikTok 용으로는 제목을 가운데 1:1 영역에 두고 타일 하단(재생수 배지)과 상단 12.5% 를 비운다.
- 시리즈물은 커버에 번호(예: "2화")를 크게 넣는 편이 그리드에서 순서를 읽기 쉽다 — 근거 데이터는 없고 YouTube 관행에서 빌린 추론이다. 색·레이아웃 일관성과 함께 쓴다.
- 커버 문구(목록에서 무엇인지 알림), 캡션(검색·설명), 첫 프레임 훅(피드에서 스와이프를 멈춤)은 각자 다른 표면을 맡는다. 첫 프레임에 커버 카드를 그대로 쓰면 피드에서 정지 화면으로 읽혀 스와이프될 위험이 있다(이전 내부 조사 결론과 같다).

### Gaps
- 커버가 프로필 방문·검색 CTR·팔로우 전환에 미치는 영향을 측정한 공개 데이터는 일반 검색에서 나오지 않았다. Later·Hootsuite·Sprout Social·Buffer·Socialinsider 를 겨냥한 검색은 따로 돌리지 않았으므로, 이 업체들에 해당 보고서가 없다고 단정할 수 없다(후속 확인 대상).
- TikTok Creator Academy/Creative Center 의 커버 전용 디자인 지침 — 본문 미수집으로 미확인.
- 한국 시장 특화 관행: 한국어 검색 결과는 도구·생성기 홍보 페이지뿐이었고 실측 기록은 없었다 — [trymypost(ko)](https://www.trymypost.com/ko/features/tiktok-cover-generator), [CapCut(ko)](https://www.capcut.com/ko-kr/resource/tiktok-profile-picture-size).

## 5. TikTok SEO — 커버 문구가 검색에 영향을 주는가

### Takeaway
SEO 업체 블로그들은 TikTok 검색이 음성(ASR)·화면 문자(OCR)·캡션·해시태그를 색인한다고 입을 모으지만 공식 확인은 없다. **커버 이미지·커버 텍스트가 색인되는지는 어떤 출처도 다루지 않았다.**

### Cited Findings
- [블로그] 세 층 색인: 음성 ASR, 화면 텍스트 OCR, 캡션+해시태그. 첫 몇 초 화면 문자에 키워드를 두라는 권고 — [Toptal](https://www.toptal.com/creator/post/tiktok-seo), [socialk.it SEO guide](https://socialk.it/en/blog/tiktok-seo-guide), [OpenClip](https://openclip.app/blog/metadata-impacts-tiktok-seo)
- [블로그·충돌] 화면 문자의 가중치가 "음성과 비슷하고 설명란보다 높다"는 주장과 "음성과 비슷하다"는 주장이 있고, "TikTok 앱 내 텍스트 기능으로 넣은 문자만 읽는다"는 주장도 있으나 검증되지 않았다 — 위 SEO 가이드들 (검색 요약 기준)
- [1차] 사진 게시물·영상 모두 API 로는 `title`/캡션 문자열을 보내며, video 객체 `title` 최대 150자 — [Video Object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object)

### Inferences
- 우리 파이프라인은 영상 위 문자를 쓰지 않으므로(자막·표기 금지), OCR 경로를 기대할 수 없다. 검색 노출은 캡션 첫 줄의 키워드와 내레이션·대사 속 키워드(ASR)에 기대야 한다. 커버 문구는 검색 색인보다는 "검색 결과 화면에서 눈에 띄어 클릭받는" 역할로 보는 편이 안전하다.
- 커버 문구와 캡션 첫 줄에 같은 주제어를 넣으면 색인 여부와 무관하게 검색 결과에서 일관된 신호를 준다.

### Gaps
- 커버 이미지 OCR 여부, 화면 문자 가중치 — 공식·실험 근거 없음.

## 6. 정책 — 오해 소지 커버, 브랜드 콘텐츠 공개, AI 생성 라벨

### Takeaway
커뮤니티 가이드라인에 "썸네일/클릭베이트"를 직접 지칭한 규정은 찾지 못했다. 다만 오해를 부르는 콘텐츠·미공개 협찬은 일반 규정으로 다뤄지고 For You 노출 제외 대상이 될 수 있다. API 에는 `brand_content_toggle`·`brand_organic_toggle`·`is_aigc` 가 있으며, `is_aigc` 는 설명란에 "Creator labeled as AI-generated" 태그를 붙인다. 이 라벨이 커버 이미지 위에 표시되는지는 확인하지 못했다.

### Cited Findings
- [1차] `brand_content_toggle`: "Set to true if the video is a paid partnership to promote a third-party business." `brand_organic_toggle`: "promoting the creator's own business." `is_aigc`(기본 false): "If set, the video will be labelled with Creator labeled as AI-generated tag in video's description." — [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [1차, 검색 요약 기준·2024 판, 현재 문구 미확인] Integrity & Authenticity: 상당한 해를 줄 수 있는 허위·오해 콘텐츠 금지, 일부는 "FYF INELIGIBLE"로 추천 제외 — [TikTok Community Guidelines: Integrity and Authenticity](https://www.tiktok.com/community-guidelines/en/integrity-authenticity/)
- [1차, 검색 요약 기준·2024 판, 현재 문구 미확인] 상업 활동: 신뢰도에 영향을 주는 이해관계를 공개해야 한다 — [TikTok Community Guidelines: Regulated Commercial Activities](https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities)
- [보도, 2025-08-15] 가이드라인 개정으로 FYF 부적격 예시 목록이 단순해졌고 AI 생성 콘텐츠 관련 문구가 바뀌었다 — [TechCrunch](https://techcrunch.com/2025/08/15/tiktoks-new-guidelines-add-subtle-changes-for-live-creators-ai-content-and-more/)
- [보도] 부적격 콘텐츠를 반복 게시한 계정은 For You 노출에서 차단될 수 있다(2024) — [Yahoo Tech](https://www.yahoo.com/tech/tiktok-block-users-feed-repeatedly-155549425.html)
- [블로그] AI 토글은 게시 설정의 More options 에 있고, TikTok 탐지로 자동 부착된 라벨은 제거할 수 없다는 설명(출처마다 위치 표현 다름) — [Hootsuite](https://blog.hootsuite.com/ai-disclosure-policy-for-tiktok/), [magichour](https://magichour.ai/blog/tiktok-ai-generated-content-labels)
- [블로그·과장 가능] AI 라벨 토글이 "mandatory"라는 주장 — [Rewarx](https://www.rewarx.com/blogs/tiktok-ai-label-toggle-mandatory-stay-live) (다른 출처보다 강한 표현, 미검증)

### Inferences
- 생성형 이미지로 만든 커버는 AI 생성 콘텐츠의 일부로 보고 `is_aigc` 를 사실대로 켠다(내부 지침도 "진실한 공개 유지"). 비공개 → 공개 전환 과정에서 공개 설정을 지우거나 바꾸지 않는다.
- 커버가 영상에 없는 장면·결과를 약속하면 Integrity 규정의 "오해 소지"에 걸릴 수 있다. 커버는 영상 안에서 실제로 보여 주는 장면·주장만 담는다(약속-증명 원칙과 같은 방향).

### Gaps
- 썸네일·커버를 명시한 TikTok 정책 문구 — 찾지 못함.
- AI 라벨·유료 파트너십 라벨이 프로필 그리드·검색 타일의 커버 위에 표시되는지 — 출처 없음, 실기 확인 필요.
