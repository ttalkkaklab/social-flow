# TikTok LIVE 송출과 실시간 채팅 API

2026년 11월 22일 기준. 한국 크리에이터가 자체 인코더로 방송하고 시청자 질문에 캐릭터 음성으로 답하는 경우를 중심으로 조사했다.

TikTok은 외부 인코더로 영상과 음성을 보내는 방법을 공개했다. 방송할 계정의 LIVE 화면에서 방송용 서버 주소와 스트림 키를 받아 사용한다. 반면 일반 앱이 OAuth로 방송을 예약·생성하고 키를 발급받아 시작·종료하거나 시청자 채팅을 구독하는 API는 공개 개발자 문서에서 확인되지 않았다. 광고 계정의 LIVE 영상 조회, 쇼핑 방송의 성과 조회, 아바타의 음성 답변은 각각 별도 제품에 있다. [TikTok 인코더 안내](https://inapp.tiktokv.com/falcon/webcast_mt/page/obs_intro/index.html) · [개발자 권한 목록](https://developers.tiktok.com/docs/en/tiktok-api-scopes) · [일반 웹훅 목록](https://developers.tiktok.com/docs/en/webhooks-events)

## 기능별로 가능한 일

| 필요한 기능 | 확인한 경로 | 사용 조건과 한계 |
| --- | --- | --- |
| 방송 예약과 시청 알림 | 크리에이터가 LIVE Events에서 일정을 만들면 시청자가 등록하고 알림을 받을 수 있다. | 일반 개발자 권한 목록에서는 예약 API를 확인할 수 없다. [TikTok LIVE Events](https://newsroom.tiktok.com/new-tiktok-live-features?lang=en-AU) |
| 방송 생성과 외부 송출 | 앱 또는 LIVE Center에서 방송 정보를 입력하고 서버 주소와 키를 받는다. OBS 등 외부 인코더가 여기에 미디어를 보낸다. | 계정에 외부 송출 메뉴가 있어야 한다. TikTok은 새 방송마다 새 주소와 키를 사용하도록 안내한다. [TikTok 인코더 안내](https://inapp.tiktokv.com/falcon/webcast_mt/page/obs_intro/index.html) · [BytePlus 연결 절차](https://docs.byteplus.com/en/docs/byteplus-livesaas/docs-synchronizing-a-live-stream-from-byteplus-live-to-third-party-platforms) |
| 방송 중 상태와 종료 | 운영자는 TikTok 모니터에서 시청자 반응을 보고 시청 화면에서 실제 재생을 확인할 수 있다. TikTok은 종료할 때 인코더와 앱 양쪽에서 방송을 끝내라고 안내한다. | 범용 앱에 송출 상태 전환이나 종료를 알려 주는 LIVE 웹훅은 확인되지 않았다. [TikTok 인코더 안내](https://inapp.tiktokv.com/falcon/webcast_mt/page/obs_intro/index.html) · [방송 모니터 안내](https://support.restream.io/en/articles/6721574-stream-to-tiktok) · [일반 웹훅](https://developers.tiktok.com/docs/en/webhooks-events) |
| 댓글·좋아요·입장·선물을 개별 이벤트로 수신 | TikFinity의 데스크톱 WebSocket이나 비공식 TikTok-Live-Connector는 여러 종류의 이벤트를 제공한다. | 제공사별 지원 범위와 이용 조건이 적용된다. 일반 TikTok OAuth에서 이 이벤트를 구독하는 권한은 확인되지 않았다. [TikFinity 개발자 문서](https://tikfinity.zerody.one/tiktok/dapi) · [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) |
| 채팅을 받아 캐릭터가 말로 답변 | BytePlus AI Live는 방송할 TikTok 계정의 사용자 ID로 관객 반응을 가져오고 아바타가 답을 읽는 기능을 문서화했다. | BytePlus 제품 안에서 동작한다. 채팅창에 답글을 자동 게시하는 옵션은 미지원으로 표시한다. [BytePlus AI Live 상호작용](https://docs.byteplus.com/en/docs/byteplus-livesaas/configuring-ai-live-interactions) |
| 광고용 LIVE 영상 조회 | TikTok API for Business의 `GET /open_api/v1.3/identity/live/get/`으로 광고 계정에 연결된 TikTok 계정의 LIVE 영상을 조회한다. TikTok 공식 SDK도 LIVE 광고 참여 대상을 설정할 때 이 API에서 받은 영상 ID를 사용한다고 명시한다. | 광고용 계정과 권한을 전제로 한다. 조회 결과로 인코더 접속 권한이나 채팅 구독 권한을 얻을 수 있다는 내용은 없다. [Business API](https://business-api.tiktok.com/portal/docs?id=1785238052792321) · [공식 SDK의 LIVE 영상 ID 설명](https://github.com/tiktok/tiktok-business-api-sdk/blob/main/python_sdk/docs/DmpcustomAudiencerulecreateRuleSpecInclusionRuleSetRules.md) |
| 쇼핑 LIVE 성과 조회 | TikTok Shop의 `GET /analytics/202609/shop_lives/overview_performance`는 상점 단위 LIVE 성과를 집계한다. 방송별 성과 목록도 제공한다. | 판매자 토큰, Shop Analytics 권한(`data.shop_analytics.public.read`), 서명된 요청이 필요하다. 댓글·좋아요 집계 수치로 개별 질문의 본문을 알 수는 없다. [Shop LIVE 성과 API](https://partner.tiktokshop.com/docv2/page/get-shop-live-performance-overview-202609) · [202609 버전의 지표와 필드](https://partner.tiktokshop.com/docv2/page/6az7iwe9) |

## 한국 계정으로 PC에서 방송하는 절차

1. **계정의 LIVE 자격을 확인한다.** TikTok 한국 공지는 방송 진행 연령을 만 18세, 가상 선물 발송 등 수익화 관련 기능을 만 19세로 설명한다. TikTok은 팔로워 기준과 기능을 계정별로 다르게 적용하는 시험도 공지했다. 한국 계정에 공통으로 적용되는 외부 송출 키 발급 기준을 팔로워 숫자 하나로 확정할 근거는 찾지 못했다. [TikTok 한국 연령 안내](https://newsroom.tiktok.com/enhancing-the-live-community-experience-kr?lang=ko-KR) · [팔로워 요건과 단계적 기능 제공](https://newsroom.tiktok.com/tiktoklive?lang=en-ZA)
2. **외부 송출 메뉴를 확인한다.** 문서에 나온 진입점은 앱의 `+ → Cast on PC/Mac` 또는 데스크톱 LIVE Center의 `Go LIVE`다. 모바일에서 방송할 수 있어도 외부 앱의 송출 승인은 별개다. 로그인한 계정에서 서버 주소와 키를 실제로 발급받을 수 있는지가 자체 인코더 사용을 결정한다. [TikTok LIVE Center](https://livecenter.tiktok.com/) · [BytePlus의 앱·PC 화면 안내](https://docs.byteplus.com/en/docs/byteplus-livesaas/docs-synchronizing-a-live-stream-from-byteplus-live-to-third-party-platforms) · [Restream 권한 안내](https://support.restream.io/en/articles/6721574-stream-to-tiktok)
3. **인코더가 준비되면 이번 방송의 키를 받는다.** BytePlus의 LIVE Center 절차에서는 방송 정보 저장 후 키가 생성되고 5분 안에 연결하도록 안내한다. 이 시간은 문서에 나온 그 절차에서 처음 연결할 때의 기준이다. 서버 주소와 키를 별도로 받는 인코더에는 각 필드에 넣고, 완성된 주소를 받는 인코더에는 키의 쿼리 문자열까지 포함한다. 키가 들어간 주소는 시청 링크로 공유하지 않는다. [BytePlus 키 발급·연결 예시](https://docs.byteplus.com/en/docs/byteplus-livesaas/docs-synchronizing-a-live-stream-from-byteplus-live-to-third-party-platforms)
4. **송출, 시청, 채팅을 각각 확인한다.** 인코더 연결 후 실제 시청 화면에 영상과 소리가 도착하는지 보고, 상호작용이 목적이라면 시청자가 남긴 질문이 캐릭터 음성으로 돌아오는지도 확인한다. 연결이 끊길 때 자동 종료할지는 TikTok 쪽 설정에 따라 달라질 수 있다. [TikTok 종료 안내](https://inapp.tiktokv.com/falcon/webcast_mt/page/obs_intro/index.html) · [자동 종료 옵션](https://support.restream.io/en/articles/6721574-stream-to-tiktok)

## 시청자 질문을 읽는 선택지

**기존 캐릭터를 계속 쓰는 경우.** 운영자가 TikTok 모니터에서 질문을 골라 로컬 프로그램에 전달할 수 있다. 자동 수신이 필요하면 그 채널에서 사용이 허용된 이벤트 공급원을 연결해야 한다. 예를 들어 TikFinity는 같은 컴퓨터에서 데스크톱 앱을 실행하고 로컬 WebSocket으로 `chat`, `gift`, `follow`, `like` 등의 이벤트를 받는 방법을 공개했다. 오픈소스 TikTok-Live-Connector는 자신을 ByteDance와 무관한 비공식 라이브러리로 명시한다. 두 문서가 입증하는 것은 이벤트를 읽는 제품 기능이다. 개별 계정의 사용 승인과 서비스 수준은 각 제공 조건을 확인해야 한다. [TikFinity API](https://tikfinity.zerody.one/tiktok/dapi) · [커넥터 원본 문서](https://github.com/zerodytrash/TikTok-Live-Connector)

**아바타와 답변을 서비스에 맡기는 경우.** BytePlus AI Live는 TikTok 계정 ID, 서버 주소, 스트림 키를 설정하는 절차를 제공한다. 답변용 자료와 필터를 설정하면 아바타가 진행을 잠시 멈추고 질문에 답한 뒤 원래 대본으로 돌아간다. 좋아요·팔로우·공유에 음성으로 반응하는 설정도 있다. TikTok 채팅 원문을 우리 서버로 보내는 범용 콜백은 이 제품 문서에서 확인되지 않았다. [TikTok 송출 설정](https://docs.byteplus.com/en/docs/byteplus-livesaas/Synchronizing_a_live_stream_from_AI_Live_to_third-party_platforms) · [음성 답변과 지원 이벤트](https://docs.byteplus.com/en/docs/byteplus-livesaas/configuring-ai-live-interactions)

**파트너 앱으로 송출하는 경우.** Streamlabs는 TikTok과 제휴해 로그인과 심사를 거쳐 앱에서 직접 방송하는 경로를 운영한다. Restream도 계정 연결을 지원한다. 두 업체는 자사 연동에서 게임 콘텐츠 비중 50%를 유지해야 한다고 안내한다. 비게임 캐릭터 토크쇼가 이 경로로 계속 방송할 수 있다고 전제하기 어렵다. Restream의 채팅 지원표에서 TikTok은 읽기·답글·중계 세 항목 모두 미지원이다. 운영 중 댓글을 보려면 TikTok 모니터를 열도록 안내한다. [Streamlabs 제휴 발표](https://ir.logitech.com/news/news-details/2024/Logitechs-Streamlabs-Launches-TikTok-LIVE-Integration-to-Power-Seamless-Streaming/default.aspx) · [Streamlabs 조건](https://streamlabs.com/platforms/tiktok) · [Restream 송출 조건](https://support.restream.io/en/articles/6721574-stream-to-tiktok) · [Restream 채팅 지원표](https://support.restream.io/en/articles/2379624-what-is-restream-chat)

TikTok이 직접 받는 제휴 신청 중에는 시청자 선물로 게임 내 동작을 일으키는 LIVE Interactive Games도 있다. 게임과 상호작용 방식을 제출해 심사받는 프로그램이다. 일반 토크쇼에 시청자 댓글 API를 발급한다고 안내하지는 않는다. [TikTok for Gaming 파트너 접수](https://cp-game.tiktok.com/interactive-game-registration)

AI 캐릭터가 **상품을 판매하는 방송**이라면 시장별 판매 정책도 적용된다. 예를 들어 미국 TikTok Shop은 LIVE에서 AI 음성이나 녹음본에 의존해 실시간 소통을 대신하는 방식을 제한한다. BytePlus의 기술 지원과 각 시장에서 쇼핑 방송에 허용하는 운영 방식는 서로 다른 판단이다. [미국 TikTok Shop LIVE 정책](https://seller-us.tiktok.com/university/course?content_id=4581457528243969&learning_id=4357891188557610)

## 이름이 비슷한 개발자 API

| API | 응답이 의미하는 것 |
| --- | --- |
| Content Posting | `video.upload`와 `video.publish`는 초안 전송과 일반 게시물 발행 권한이다. `POST /v2/post/publish/video/init/`의 `upload_url`은 영상 파일을 보낼 주소다. `POST /v2/post/publish/status/fetch/`와 `post.publish.complete`는 그 게시물의 처리 상태를 알려 준다. [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started) · [게시 상태와 웹훅](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status) |
| Research API와 Business 댓글 웹훅 | Research의 `POST /v2/research/video/comment/list/`는 `video_id` 또는 `comment_id`로 게시물 댓글을 조회한다. Business의 `comment.update`도 소유 계정이 게시한 공개 영상의 댓글 변경을 알린다. 두 문서 모두 LIVE 방에서 시청자가 방금 쓴 질문을 제공한다고 명시하지 않는다. [Research 댓글 조회](https://developers.tiktok.com/docs/en/research-api-specs-query-video-comments) · [Business 댓글 조회](https://business-api.tiktok.com/gateway/docs/index?doc_id=1760232109619202&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b) |
| Data Portability | 이용자가 동의하면 방송 이력, 시청 이력, 이용자 자신의 LIVE 댓글 등 정해진 자료를 내보낸다. 문서상 대상은 유럽경제지역과 영국 이용자다. 한국 방송의 전체 관객 댓글을 생방송 중에 구독하는 용도로 쓸 수 없다. [대상 지역](https://developers.tiktok.com/products/data-portability-api) · [LIVE 데이터 항목](https://developers.tiktok.com/docs/en/data-portability-data-types) |

## 조사 당시의 Social Flow 구현

아래 표는 구현 변경 전 커밋 `e1338c73`을 기준으로 한다. 이후 추가된 RTMP 송출, 방송 직전 키 입력, TikFinity 자동 채팅과 상태 조회는 [현재 방송 가이드](../../../skills/live-character/SKILL.md)에서 확인할 수 있다. 실제 한국 계정의 권한, 스트림 키 발급, TikTok 수신, 공개 재생 및 채팅 왕복은 이번 조사에서 실측하지 않았다.

| 항목 | 현재 동작 |
| --- | --- |
| 송출 | `live-run --tiktok`은 실행 환경의 `TIKTOK_LIVE_RTMPS_URL`을 읽는다. 주소는 방송용 키를 포함한 완전한 `rtmps://` 형식이어야 한다. 계정이 `rtmp://`만 보여 주면 현재 입력 검증에서 거부한다. 주소 앞부분을 임의로 고쳐도 서버의 RTMPS 지원은 확인되지 않는다. [송출 입력](../../../server/src/live-run.ts) · [주소 검증](../../../server/src/live-encoder.ts) |
| 인코딩 | 폭 720픽셀인 입력을 받으면 세로 720×1280, 24fps, H.264, 목표 영상 비트레이트 4.5Mbps, GOP 2초, AAC 48kHz·96kbps로 인코딩한다. 이 값은 로컬 인코더 설정이다. TikTok 수신 여부는 방송할 때 확인할 수 있다. [프레임 설정](../../../server/src/live-character.ts) · [FFmpeg 인자](../../../server/src/live-encoder.ts) |
| 외부 채팅 입력 | 프로그램이 표준 입력에서 한 줄짜리 JSON을 읽는다. 출처·이벤트 ID·본문을 검증하고 일정 범위에서 같은 출처와 ID의 중복을 제거한다. 방송 중 운영자가 골라 넣은 질문에는 `operator`, 외부에서 수신한 TikTok 질문에는 `tiktok`을 쓴다. [입력 처리](../../../server/src/live-run.ts) · [메시지 형식](../../../server/src/live-character.ts) |
| 예약·상태 조회·종료 | 현재 방송 예약, 플랫폼 상태 조회, 방송 종료를 API로 처리하는 코드는 YouTube용이다. TikTok 쪽은 이미 발급된 주소로 미디어를 보내며, 별도 연결 없이는 시청자 질문이 자동으로 들어오지 않는다. [플랫폼 분기](../../../server/src/live-run.ts) · [운영 설명](../../../skills/live-character/SKILL.md) |

예를 들어 외부 수신기가 실제 시청자 질문을 받으면 아래 형식으로 기존 프로그램에 전달할 수 있다. 이 JSON은 Social Flow의 로컬 입력 예시다.

```json
{"source":"tiktok","id":"example-event-123","text":"오늘은 어떤 이야기예요?"}
```

이 버전에서 캐릭터와 생성 음성을 그대로 쓸 때 첫 판단 기준은 **방송할 계정이 이번에 쓸 RTMPS 주소와 키를 발급하는지**다. 이 조건을 충족하면 기존 코드로 영상과 음성을 보낼 수 있다. 시청자 질문까지 자동으로 처리하려면 **댓글 원문과 이벤트 ID를 프로그램에 넘겨줄 수 있는지**를 따로 확인해야 한다.
