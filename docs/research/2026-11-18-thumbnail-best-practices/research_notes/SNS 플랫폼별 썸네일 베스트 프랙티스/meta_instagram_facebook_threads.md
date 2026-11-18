# Meta 표면(Instagram Reels · Facebook Reels/영상 · Threads 영상)의 커버·썸네일 베스트 프랙티스

조사일 2026-11-18. 모든 기능 주장에 확인 날짜나 출처 날짜를 붙였다. 개발자 문서는 2026-11-18 에 직접 열어 확인했고(Graph API v27.0 예시 기준), 블로그·보도는 각 항목에 날짜를 적었다. help.instagram.com 은 본문이 스크립트로만 렌더링돼 WebFetch 로 읽지 못했다(빈 "Help Center" 만 돌아옴). 그래서 인스타 앱 동작 일부는 2차 자료 등급이다.

## 1. Instagram Reels 커버가 보이는 자리와 크롭(프로필 그리드·릴스 탭·피드·탐색), 게시 후 편집

### Takeaway
릴스 커버 원본은 9:16(1080×1920)으로 만들고, 프로필 그리드 타일은 2025년 1월부터 가운데 3:4 조각(1080×1920 기준 1080×1440, 위아래 각 240px = 12.5% 잘림)만 보인다고 보고 설계한다. 앱에서는 게시 후에도 커버 교체와 그리드 미리보기 위치 조정("Adjust Cover"/"Adjust preview")이 된다. 피드·릴스 탭 자동재생에서는 커버 대신 영상 첫 화면이 보인다.

### Cited Findings
- 프로필 그리드가 정사각(1:1)에서 세로 3:4 직사각으로 바뀌었다. Planoly 는 "as of January 2025, Instagram has confirmed the switch to a vertical 3:4 grid format" 라고 적었다 — [Planoly, The Ups and Downs of Instagram's New Rectangle Grid](https://webflow.planoly.com/blog/the-ups-and-downs-of-instagrams-new-rectangle-grid); 같은 시기 3분 릴스 발표와 함께 바뀌었다는 서술 — [PostEverywhere, Instagram aspect ratios](https://posteverywhere.ai/blog/instagram-aspect-ratios)
- 시험은 2024년 8월에 시작됐고, Mosseri 가 그리드 적용 직전에 Instagram 스토리로 알렸다(2차 보도) — [RouteNote](https://routenote.com/blog/instagrams-new-profile-grid-layout-from-squares-to-rectangles/)
- Mosseri 의 변경 이유: 업로드 대부분이 세로인데 정사각으로 자르는 것은 "pretty brutal" 하다 — [Engadget (시험 단계 보도)](https://www.engadget.com/social-media/instagrams-experimental-profile-grid-has-rectangular-images-instead-of-squares-160007086.html)
- 모든 게시물은 그리드에서 3:4 로 가운데 크롭되고, 열면 원래 비율로 보인다. 사용자는 정사각 그리드로 되돌릴 수 없다. Kapwing 본문은 3:4 라고 쓰고 이미지 캡션에만 4:5 가 나온다(본문 기준 3:4) — [Kapwing, Instagram's New Grid Layout (2025-12-30 게시, 제목은 2026)](https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/)
- 3:4 사진 업로드 지원은 그리드 변경과 별개로 2025년 5월에 추가됐다(그리드 변경 약 4개월 뒤) — [9to5Mac, 2025-05-29](https://9to5mac.com/2025/05/29/instagram-changes-standard-photo-aspect-ratio/); [DivePhotoGuide](https://www.divephotoguide.com/underwater-photography-scuba-ocean-news/instagram-now-supports-images-3-4-aspect-ratio/)
- 그리드 썸네일 맞춤 기능이 정식 출시됐다: 게시물을 길게 누르거나 점 세 개 메뉴 → "Adjust Cover" → 미리보기 위치 조정. 캐러셀·피드 게시물·릴스 모두 해당. 게시일은 "Feb 12"(연도 표기 없음, 세로 그리드 변경 직후 맥락이라 2025-02-12 로 추정) — [Lindsey Gamble, Instagram Rolls Out Thumbnail Customization](https://www.lindseygamble.com/blog/instagram-rolls-out-thumbnail-customization-as-part-of-profile-updates)
- 일반 게시물은 점 세 개 → "Adjust Preview" 로 썸네일 위치를 끌어 맞추고, 위아래 배경 테두리를 넣을 수 있다 — [Kapwing](https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/)
- 게시 후 릴스 커버 교체: 릴스 열기 → 점 세 개 → Edit → 프레임 선택 또는 카메라 롤에서 이미지 업로드. 영상과 오디오 자체는 게시 후 바꿀 수 없다 — [Later, Instagram Reels cover photo](https://later.com/blog/instagram-reels-cover-photo/); [Lilach Bullock](https://www.lilachbullock.com/instagram-reels-cover-size/); 게시 후 커버 편집이 "새 기능"으로 소개됨 — [Lindsey Gamble, 5 new Instagram features](https://www.lindseygamble.com/blog/5-new-instagram-features-text-based-creative-tools-comments-on-stories-trial-reels-collaborative-carousels-post-publish-reels-editing)
- 상충: 일부 옛 가이드는 고객센터 문구 "Right now, you can't edit your cover photo after you've uploaded it" 를 인용한다. 한 확장 프로그램 홍보 페이지는 "2026년 3월부터" 게시 후 편집이 된다고 적는다. 위 Gamble 기사와 다수 가이드는 이미 그전부터 된다고 쓰므로 그 고객센터 문구는 낡은 것으로 보인다 — [검색 결과 요약: Kontentino](https://www.kontentino.com/q-and-a/instagram-reel-cover-photo/), [iShort](https://ishort-pp.web.app/instagram-edit-reel-thumbnail.html)
- 커버가 실제로 보이는 곳은 주로 탐색 탭과 프로필이고, 릴스 소비 대부분은 추천 피드에서 일어나 커버가 두드러지지 않는다(Mosseri, Threads 답변, 2024-09-16 무렵 2차 정리) — [Lindsey Gamble, Cover Photos for Reels Have Minimal Impact](https://www.lindseygamble.com/blog/cover-photos-for-reels-have-minimal-impact-according-to-instagram-head-adam-mosseri)
- API 문서 기준 크롭: `cover_url` 이미지는 9:16 권장, 아니면 "the middle most 9:16 rectangle" 을 커버로 쓰고, 피드에 공유하면 "middle-most 1:1 square" 를 피드 게시물에 쓴다 — [Instagram Graph API, IG User Media (v27.0, 2026-11-18 확인)](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)

### Inferences
- 1080×1920 커버의 그리드 노출 영역은 가운데 1080×1440(y=240–1680)이다(직접 계산). 제목·얼굴은 이 띠 안, 더 안전하게는 위 15%·아래 35% 안전영역 안에 두면 그리드와 릴스 전체 화면 양쪽에서 산다. 기존 사내 안전영역(상 15 · 하 35 · 좌 6 · 우 18%)은 그리드 크롭(위아래 12.5%)을 이미 견딘다는 2026-08-17 조사 결론과 맞는다.
- API 문서의 "1:1 피드 크롭" 문구는 그리드가 3:4 로 바뀐 뒤에도 갱신되지 않은 옛 서술일 가능성이 높다. 정사각 크롭에서도 살아남게 하려면 핵심 요소를 가운데 1080×1080(y=420–1500) 안에 두면 3:4·1:1 둘 다 만족한다.
- 탐색 탭 타일 비율은 공식 문서를 찾지 못했다. 그리드와 같은 가운데 크롭이라고 가정하고 가운데 정렬로 설계하는 것이 안전하다.

### Gaps
- Instagram 공식(help.instagram.com, about.instagram.com)의 그리드 3:4 전환 공지 원문과 정확한 날짜를 직접 확인하지 못했다(고객센터가 스크립트 렌더링이라 읽기 실패, TechCrunch·The Verge 원보도 검색 결과 없음). "2025년 1월"은 2차 자료 다수 일치 수준이다.
- 릴스 탭·탐색 탭 타일의 정확한 픽셀 비율, "프로필 그리드에 표시" 토글(예전 "Show in profile grid" 옵션)이 2025–2026 앱에 남아 있는지 확인하지 못했다. `share_to_feed=false` 가 API 쪽 대응값이다(2절).
- 게시 후 커버 편집이 처음 생긴 날짜를 1차 자료로 확인하지 못했다.

## 2. Instagram Graph API — `cover_url`, `thumb_offset` 동작·한도, 게시 후 변경 가능 여부

### Takeaway
REELS 컨테이너 생성 시 `cover_url`(공개 URL의 JPEG, 8MB 이하, 9:16 권장) 또는 `thumb_offset`(ms, 기본 0 = 첫 프레임)으로 커버를 지정하고, 둘 다 주면 `cover_url` 이 이긴다. 게시 후 API 로 커버를 바꾸는 경로는 문서에 없으므로 커버는 게시 전에 확정해야 한다.

### Cited Findings
- `cover_url`: "For Reels only. The path to an image to use as the cover image for the Reels tab." 공개 서버에 있어야 한다 — [IG User Media 레퍼런스 (v27.0, 2026-11-18 확인)](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)
- 우선순위: "If you specify both `cover_url` and `thumb_offset`, we use `cover_url` and ignore `thumb_offset`." — 같은 문서
- `thumb_offset`: "Location, in milliseconds, of the video or reel frame to be used as the cover thumbnail image." 기본값 `0` = 첫 프레임. 값은 영상 길이 안이어야 한다 — 같은 문서
- 커버 이미지 요건: JPEG, 최대 8MB, sRGB(다른 색공간은 변환), 9:16 권장(아니면 가운데 9:16 크롭), 피드 공유 시 가운데 1:1 — 같은 문서
- `share_to_feed`: `true` 면 피드와 릴스 탭 둘 다, `false` 면 릴스 탭만. 어느 값도 릴스 탭 노출을 보장하지 않는다 — 같은 문서
- 릴스 영상 사양: MOV/MP4(moov 앞, edit list 없음), HEVC/H264, 23–60fps, 가로 최대 1920px, 25Mbps VBR, AAC 48kHz 128kbps, 3초–15분, 300MB — 같은 문서
- 게시 후 변경: `/media` 엔드포인트의 Updating 항목은 "This operation is not supported" 이고, 게시된 미디어의 커버를 바꾸는 엔드포인트는 문서에 없다 — 같은 문서
- 사내 플러그인 상태(2026-11-18): `instagram_publish` 에 `thumb_offset`·`cover_url`·`share_to_feed`·`is_ai_generated` 를 선택 입력으로 추가했다. 이전에는 보낼 수 없어 그리드에 첫 프레임이 커버로 나왔다. Instagram Login 경로(graph.instagram.com)는 `video_url`(공개 URL)만 받는다. Instagram 은 API 로 비공개 게시할 방법이 없다 — [사내 조사 docs/research/2026-11-18-sns-video-publish-apis/README.md §4, 표 4번](../../../2026-11-18-sns-video-publish-apis/README.md)

### Inferences
- API 로는 그리드 크롭 위치("Adjust Cover")를 지정할 수 없다. 그리드에서는 가운데 3:4 가 그대로 쓰이므로, 커버 자체를 가운데 정렬 구도로 만드는 것이 API 게시 파이프라인의 유일한 통제 수단이다.
- 비공개 게시가 불가능하므로 TikTok 처럼 "비공개로 올리고 커버 확인 후 공개" 순서를 쓸 수 없다. 커버 JPEG 를 게시 전에 로컬에서 3:4·1:1 크롭 미리보기로 검수하는 단계가 대신해야 한다.
- 잘못 올라간 커버는 앱(점 세 개 → Edit)에서 사람이 고치는 수밖에 없다(1절).

### Gaps
- `cover_url` 이미지의 최소 해상도는 문서에 없다.
- 게시 후 커버 변경 API 의 부재는 "문서에 없음" 수준이며, Meta 가 명시적으로 불가하다고 적은 문장은 찾지 못했다.

## 3. Instagram 공식 가이드(@creators, Mosseri, Business 블로그)와 커버 효과 데이터

### Takeaway
Instagram 책임자의 입장은 "커버는 탐색·프로필에서만 보여 도달 효과는 미미하다"이다(2024-09). 커버는 이미 프로필에 온 사람이 무엇을 볼지 고르게 돕는 도구로 다루고, 도달은 영상 첫 장면과 원본성으로 얻는다.

### Cited Findings
- Mosseri 는 커버가 "only a marginal effect" 를 가지며, 주로 탐색과 프로필에서 보이고, 릴스 대부분은 추천으로 소비돼 커버가 두드러지지 않는다고 Threads 에서 답했다(2차 요약, 직접 인용 아님, 게시 "Sep 16", 맥락상 2024) — [Lindsey Gamble](https://www.lindseygamble.com/blog/cover-photos-for-reels-have-minimal-impact-according-to-instagram-head-adam-mosseri); 같은 주제 팟캐스트 회차 2024-09-10 "Do Reels Covers Matter" — [The Instagram Stories podcast](https://chartable.com/podcasts/the-instagram-stories-1467688778/episodes/177237166-91024-do-reels-covers-matter-and-lindsey-gamble-talks-mastering-influencer-marketing)
- 같은 요약: 커버는 사용자가 릴스 내용을 이해하는 데 도움을 주지만 영향은 제한적이다 — [Lindsey Gamble](https://www.lindseygamble.com/blog/cover-photos-for-reels-have-minimal-impact-according-to-instagram-head-adam-mosseri)
- 반대 방향의 오래된 근거: Hootsuite 2021 실험에서 상위 릴스 3편 중 2편 커버에 사람이 있었다. 표본이 작고 Mosseri 발언보다 앞선다 — [Hootsuite, Instagram Reels experiment](https://blog.hootsuite.com/instagram-reels-experiment/)
- Instagram 은 2024-10 앱 안에 "Best Practices" 허브를 열어 사진·릴스 제작 가이드를 제공했다 — [PetaPixel, 2024-10-02](https://petapixel.com/2024/10/02/instagram-launches-best-practices-to-help-creators-improve-their-photos-and-reels)
- Mosseri 의 2026 우선순위: "creativity and connecting with the people you care about" (Kapwing 인용) — [Kapwing](https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/)
- 사내 2026-08-17 조사 결론: 릴스 피드는 커버 이미지를 보여 주지 않고 재생 시작 1–3초가 커버 역할을 한다. 우리 릴스 4편의 `reels_skip_rate` 84.8–93.8% 는 이 자리의 문제였다 — [사내 조사 docs/research/2026-08-17-video-cover-design/index.html](../../../2026-08-17-video-cover-design/index.html)

### Inferences
- 마케팅 블로그의 "커버가 도달을 올린다" 주장은 플랫폼 책임자 발언과 충돌한다. 파이프라인에서 커버에 쓰는 비용(생성 이미지 호출 등)은 그리드 정돈과 프로필 방문자 전환 수준의 가치로 잡는 것이 맞다.
- 피드 성과는 커버가 아닌 영상 첫 프레임이 결정하므로, `thumb_offset=0` 기본값 상태에서 첫 프레임이 곧 그리드 커버가 된다는 점을 거꾸로 이용할 수 있다: 첫 프레임이 이미 좋은 장면이면 `cover_url` 없이도 된다.

### Gaps
- @creators 계정이나 Instagram Business 블로그의 커버 전용 공식 지침 원문은 찾지 못했다.
- 커버 유무·스타일별 성과를 수치로 비교한 2025–2026 대규모 데이터(Later, Socialinsider, Metricool 등)는 이번 조사에서 확보하지 못했다. 이 분야 수치 대부분은 출처가 없거나 2021 무렵 것이다.
- Mosseri 원 발언(Threads 게시물)의 직접 인용을 확보하지 못했다.

## 4. Facebook Reels·Facebook 영상 썸네일 — 사양, Graph API, Meta Business Suite, 2025 "모든 영상 = 릴스"

### Takeaway
2025-06-17 이후 Facebook 에 올리는 영상은 모두 릴스로 분류된다. API 로는 Page 영상 게시 때 `thumb`(이미지 원본 데이터)를 붙이거나, 게시 뒤 `POST /{video-id}/thumbnails`(`source`, `is_preferred=true`)로 커버를 바꿀 수 있다. Instagram 과 달리 Facebook 은 게시 후에도 API 로 커버를 교체할 수 있다.

### Cited Findings
- 2025-06-17 발표: "starting soon, all videos will be shared as reels", Video 탭을 Reels 탭으로 개명, 프로필·페이지에 몇 달에 걸쳐 전 세계 순차 적용, 기존 영상은 그대로, 추천 방식은 바뀌지 않음, 라이브는 별도 — [Meta Newsroom, Making it Easier to Create Videos on Facebook (2025-06)](https://about.fb.com/news/2025/06/making-it-easier-create-videos-facebook/amp/); [TechCrunch, 2025-06-17](https://techcrunch.com/2025/06/17/facebook-announces-that-all-videos-on-its-platform-will-soon-be-shared-as-reels); 릴스 길이·형식 제한 해제 — [afaqs](https://www.afaqs.com/news/social-media/facebook-to-convert-all-videos-to-reels-no-length-and-format-restrictions-9373864)
- 지표: 이후 영상 지표는 Meta Business Suite 에서 릴스로 통합 표시, 과거 지표는 그해 말까지 열람 가능 — [Meta for Creators blog](https://creators.facebook.com/blog/making-it-easier-to-create-videos-on-facebook)
- Reels Publishing API 사양(v27.0 문서, 2026-11-18 확인): 9:16, 1080×1920 권장(최소 540×960), 3–90초, 24–60fps, H.264/H.265(VP9·AV1 지원), 닫힌 GOP 2–5초, AAC LC 48kHz 스테레오. `video_state` 는 DRAFT·SCHEDULED·PUBLISHED. 커버는 "Add a custom cover photo for your reel" 로 외부 Graph API 문서에 연결만 돼 있다 — [Reels Publishing guide](https://developers.facebook.com/docs/video-api/guides/reels-publishing)
- `POST /{video_id}/thumbnails`: `source`(이미지 파일, 필수), `is_preferred`(기본 false, true 면 기본 썸네일), 최대 10MB, "We recommend that you use thumbnails with the same aspect ratio as the video", Page 와 연결된 영상에서만 가능, 권한 `pages_read_user_content`·`pages_manage_engagement`·`pages_show_list` — [Video Thumbnails 레퍼런스 (2026-11-18 확인)](https://developers.facebook.com/docs/graph-api/reference/video/thumbnails/)
- `POST /{page-id}/videos` 의 `thumb`: "The video thumbnail raw data to be uploaded and associated with a video." `unpublished_content_type` 에 DRAFT·SCHEDULED 등이 있다 — [Page Videos 레퍼런스 (2026-11-18 확인)](https://developers.facebook.com/docs/graph-api/reference/page/videos/)
- 사내 플러그인 상태(2026-11-18): `facebook_publish` 에 `reel: true` 를 붙이면 `video_reels` start → rupload → finish 순서로 Reels 게시. Reel 은 90초까지라 100–215초 에피소드 대부분은 일반 Page 영상(`/{page}/videos`)으로 올라간다. 커버 교체는 `POST /{video-id}/thumbnails` — [사내 조사 2026-11-18-sns-video-publish-apis §5](../../../2026-11-18-sns-video-publish-apis/README.md)

### Inferences
- 앱 쪽은 "모든 영상 = 릴스, 길이 제한 없음"(2025-06)인데 Reels Publishing API 문서는 여전히 3–90초다. API 경로는 90초 초과 영상을 `/videos` 로 보내야 하고, 앱에서는 그 결과도 릴스 탭에 보일 수 있다(추정, 미검증).
- 90초 이하 세로 영상은 9:16 커버를 `thumbnails` 에 `is_preferred=true` 로 올리고, 가로 장편 영상은 16:9(1280×720 이상) 커버를 영상 비율과 맞춰 올린다(문서의 "same aspect ratio" 권고 적용).
- Facebook 은 DRAFT 게시와 게시 후 썸네일 교체가 되므로, DRAFT → 썸네일 지정 → 게시 순서로 커버를 검수할 수 있다(실제 DRAFT 영상에 thumbnails 가 붙는지는 미검증).

### Gaps
- Meta Business Suite 의 썸네일 옵션(프레임 선택/업로드, 릴스 커버 편집)에 대한 2025–2026 공식 문서는 확인하지 못했다.
- Facebook 장편(16:9) 영상 썸네일에 대한 Meta 의 공식 디자인 가이드(글자 크기, 얼굴 등)는 찾지 못했다.
- Facebook 피드·릴스 탭에서 썸네일이 실제 어느 비율로 잘리는지 1차 자료가 없다.
- `video_reels` 로 올린 Reel 에도 `/{video-id}/thumbnails` 가 똑같이 적용되는지 문서에 명시가 없다(레퍼런스는 Reels 를 언급하지 않음).

## 5. Threads 영상 게시물의 커버·썸네일

### Takeaway
Threads API(2026-11-18 확인)에는 영상 커버를 지정하는 파라미터가 없다(`video_url` 만 있음). 앱에서 커스텀 커버를 고를 수 있는지는 1차 자료로 확인하지 못했다. 따라서 Threads 에서는 영상 첫 프레임이 곧 미리보기라고 보고 설계한다.

### Cited Findings
- `POST /{threads-user-id}/threads` 파라미터 27개(`media_type`, `text`, `image_url`, `video_url`, `is_made_with_ai`, `alt_text`, `crossreshare_to_ig` 등) 중 cover·thumbnail·thumb_offset·cover_url 은 없다. 영상 전용은 `video_url`("The public URL of the video. Required if `media_type=VIDEO`.") 하나뿐 — [Threads API Publishing 레퍼런스 (2026-11-18 확인)](https://developers.facebook.com/docs/threads/reference/publishing)
- Threads 영상 사양: 비율 0.01:1–10:1(9:16 권장), 길이 0초 초과 300초 이하, 1GB, MOV/MP4, HEVC/H264, 23–60fps, 가로 최대 1920px, 영상 최대 100Mbps — [Threads Posts guide](https://developers.facebook.com/docs/threads/posts)
- 서드파티 도구의 표가 서로 다르다: Postmypost 는 Threads 영상 커버를 지원한다고 표시, SocialPilot 표에는 Threads 썸네일이 "No" — [Postmypost](https://help.postmypost.io/docs/tools/publications/faq/video-cover); [SocialPilot](https://help.socialpilot.co/article/855-how-to-edit-video-thumbnails-on-socialpilot-in-the-new-create-post-experience)

### Inferences
- 공식 API 에 파라미터가 없으므로 Postmypost 의 "지원"은 영상 앞에 커버 프레임을 붙이는 식의 우회일 가능성이 높다(추정).
- 파이프라인에서 Threads 용 영상은 첫 프레임을 커버로 쓸 수 있는 장면으로 시작하게 하는 것 외에 통제 수단이 없다.

### Gaps
- Threads 앱 작성 화면에 커버 선택 기능이 있는지, 피드에서 영상 미리보기가 몇 비율로 잘리는지 Meta 공식 자료를 찾지 못했다.
- `crossreshare_to_ig` 로 Instagram 에 같이 올릴 때 커버가 어떻게 정해지는지 문서가 없다.

## 6. Meta 표면 공통 디자인 지침 — 안전영역, 그리드 일관성, 얼굴·제목, 광고 vs 오가닉 텍스트, 원본성·워터마크

### Takeaway
9:16 커버의 글자·얼굴은 위 14–15%, 아래 35%, 좌우 6% 밖에 두지 않고, 그리드용으로 가운데 3:4 띠 안에 다시 가둔다. 원본성 정책(Instagram 2022 랭킹 변경 → 2026 확장, Facebook 2025-07)상 타 플랫폼 워터마크나 재업로드 표시는 배포를 깎으므로, 커버와 영상에 다른 플랫폼 로고·워터마크를 넣지 않는다.

### Cited Findings
- Reels 광고 안전영역(서드파티 정리): 위 14%(270px), 아래 35%(672px), 좌우 6%(65px), 1080×1920 기준. 스토리는 아래 20% — [Adnova, Meta ad safe zones guide](https://adnova.ai/blogs/meta-ad-safe-zones-guide); 2026-03 Meta 가 Facebook·Instagram 스토리·릴스 안전영역을 하나로 합쳤다는 보도(아래 여백 20–35% 로 출처마다 다름) — [Billo, Meta Ads Safe Zones 2026](https://billo.app/blog/meta-ads-safe-zones); 고지문 있는 릴스 광고는 아래 40% 비우기 권고 — 같은 묶음 검색 결과(2차)
- 9:16 보다 긴 화면의 폰에서는 소재를 확대해 채우므로 안전영역 밖이 잘릴 수 있다 — [AdCreate, 2026 cheat sheet](https://adcreate.com/blog/social-media-ad-sizes-safe-zones-2026)
- 사내 교집합 안전영역 상 15 · 하 35 · 좌 6 · 우 18% 는 그리드 3:4 크롭(위아래 각 12.5%)을 견딘다 — [사내 조사 2026-08-17](../../../2026-08-17-video-cover-design/index.html)
- Instagram 원본성 랭킹: Mosseri 가 2022-04-20 Instagram 원본을 우대하고 애그리게이터를 과대평가하지 않도록 랭킹을 바꾼다고 발표 — [Fast Company](https://www.fastcompany.com/90744109/instagram-tiktok-algorithm-adam-mosseri); [Tubefilter, 2022-04-21](https://www.tubefilter.com/2022/04/21/instagram-adam-mosseri-algorithm-change-original-content/)
- 2026-04 확장: 원본성 규칙이 릴스에서 사진·캐러셀로 넓어졌고, 워터마크·소폭 크롭·단순 재게시는 "original" 로 인정되지 않으며 코멘터리·리믹스 같은 의미 있는 변형이 필요하다(PetaPixel 2026-04-30 보도, 본문은 403 으로 열지 못해 검색 요약 등급) — [PetaPixel](https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/); 캡션·테두리·워터마크·자막만 바꾼 재업로드는 비원본으로 표시된다 — [Digital Camera World](https://www.digitalcameraworld.com/uk/tech/social-media/two-years-later-instagram-is-finally-giving-photographers-the-same-protection-as-videographers-with-this-key-change)
- Facebook 2025-07-14: 남의 콘텐츠를 반복 재사용하는 계정은 일정 기간 수익화 자격을 잃고 모든 게시물 배포가 줄어든다. 중복 영상은 사본 배포를 줄인다. "단순히 클립을 이어 붙이거나 워터마크를 추가하는 것은 의미 있는 개선 사항으로 인정되지 않습니다." 타사 워터마크가 보이는 콘텐츠를 피하라. 링크 없음·대문자 최소·해시태그 5개 이하 캡션이 성과가 가장 좋았다. 게시물 단위 인사이트로 배포 제한 이유를 볼 수 있다 — [Meta for Creators, Combating Unoriginal Content (2025-07-14)](https://creators.facebook.com/blog/combating-unoriginal-content); [TechCrunch, 2025-07-14](https://techcrunch.com/2025/07/14/following-youtube-meta-announces-crackdown-on-unoriginal-facebook-content)
- 같은 Facebook 지침: 자신이 직접 찍거나 만든 원본 위주의 페이지·프로필이 가장 넓게 배포되며, 같은 콘텐츠를 자기 페이지·프로필 여러 곳에 공유하는 것은 허용 — [ppc.land 요약](https://ppc.land/facebook-introduces-stronger-measures-against-unoriginal-content-creators/)

### Inferences
- 그리드 일관성(같은 색 띠·같은 제목 위치·시리즈 번호)은 프로필 방문자가 시리즈를 알아보게 하는 용도로만 가치가 있다(3절의 "효과 미미" 와 맞춤). 시리즈 제목은 가운데 3:4 띠의 위쪽 1/3(1080×1920 기준 y≈300–700)에 두면 릴스 전체 화면의 위 14% UI 와 그리드 크롭을 모두 피한다(직접 계산).
- 같은 영상을 Instagram·Facebook·Threads 에 동시에 올리는 것은 "자기 콘텐츠의 교차 게시"라 Facebook 원본성 지침상 허용된다. 다만 TikTok·YouTube 로고나 워터마크가 박힌 마스터를 재사용하면 안 된다.
- 사내 규칙 "영상 위에 아무것도 그리지 않는다"는 영상 본편 규칙이다. 커버 정지 이미지(`cover_url`, Facebook `thumbnails`)는 영상 프레임이 아니므로 제목 글자를 얹어도 이 규칙과 충돌하지 않는다. 단 글자가 든 생성 이미지는 GPT Image 2 규칙, 코드 렌더링 글자는 예외(사내 CLAUDE.md).

### Gaps
- Meta 공식 Ads Guide 의 안전영역 수치 원문은 열지 못했다(서드파티 정리만 확인). 2026-03 "통합 안전영역"도 2차 자료다.
- 광고 이미지 20% 텍스트 규칙의 폐지(2020 무렵으로 알려짐)와 현재 광고·오가닉 텍스트 오버레이 정책을 이번 조사에서 1차 자료로 확인하지 못했다. 오가닉 커버에 대한 텍스트 비율 규제는 어떤 자료에서도 찾지 못했다.
- 얼굴·글자 크기·제목 단어 수에 대한 Meta 표면 전용 정량 연구(2025–2026, 표본 명시)는 찾지 못했다. Later·Hootsuite·Sprout·Buffer·Socialinsider·Metricool 의 커버 관련 표본 연구도 확보하지 못했다.
- Instagram 2026-04 원본성 확장의 Instagram 공식 공지 원문을 찾지 못했다.
