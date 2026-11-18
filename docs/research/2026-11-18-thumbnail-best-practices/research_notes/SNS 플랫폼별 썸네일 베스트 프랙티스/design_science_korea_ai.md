# 플랫폼 공통 썸네일 디자인 근거 · 한글 썸네일 관행 · AI 생성 썸네일 (조사일 2026-11-18)

근거 등급 표기: **[논문]** 동료 심사 논문·학회 발표, **[프리프린트]** arXiv 등 심사 전 논문, **[1차]** 플랫폼 공식 문서, **[업체 조사]** 표본과 방법을 공개한 업체 자체 조사(관찰 연구이며 인과 아님), **[집계]** 여러 연구를 표로 모은 2차 자료, **[블로그]** 마케팅 업체·도구 사이트·개인 글(대부분 출처 없음, 의견으로 취급), **[검색 요약]** 검색 결과 요약으로만 확인하고 원문을 열지 못한 항목.

직접 연 페이지: vidIQ 썸네일 연구, arXiv 2601.21815(KAIST) 본문, arXiv 2607.23739 초록, YouTube 합성 콘텐츠 공개 도움말, korean-text-render-bench 저장소, 고구마팜 토크 예능 글, 오픈애즈 글, Mark Studios 집계표. 그 밖의 링크는 검색 결과 요약에서 고른 것이라, 옆 문장의 내용과 페이지가 정확히 맞지 않을 수 있다(인용 전 원문 확인 필요).

조사 한계: WebSearch 가 미국 지역 검색이라 네이버 블로그·브런치 글이 거의 잡히지 않았고, 이번 세션에서 plugin 의 `naver_search` MCP 가 연결되지 않아 한국어 자료는 웹에 공개된 업체 블로그 위주다. 표본을 밝힌 한국어 썸네일 클릭률 연구는 찾지 못했다. 플랫폼별 규격·크롭·API 는 다른 조사 노트(`youtube_longform.md`, `youtube_shorts.md`, `tiktok.md`, `meta_instagram_facebook_threads.md`)가 다룬다.

## 1. 학술·대규모 표본 근거: 무엇이 클릭과 조회수와 함께 움직이고, 오도하는 썸네일은 어떤 대가를 치르는가

### Takeaway
표본이 큰 관찰 연구들은 "사람 얼굴", "썸네일 이미지의 강한 감정(긍정이든 부정이든)", "선명한 색·해상도"가 조회수와 함께 오른다고 보고한다. 글자는 있는 쪽이 조회수와 함께 오르되 긴 글자는 반대라는 보도가 있지만, 이 부분은 원문을 확인하지 못한 보도자료 한 건에 기댄다. 다만 전부 상관관계이고 지표도 CTR 이 아니라 조회수·브레이크아웃 여부이며, 얼굴 효과는 비교군을 두면 거의 사라진다는 반대 결과도 있다. 오도하는(미끼) 썸네일이 시청 유지·만족도를 얼마나 깎는지 직접 잰 연구는 찾지 못했다. 신뢰도가 떨어진다는 근거는 뉴스 헤드라인 실험에서 꾸준히 나오고, YouTube 자체 A/B 도구는 CTR 이 아니라 시청 시간 점유율로 승자를 정한다.

### Cited Findings
**얼굴·감정·텍스트와 조회수**
- [논문] Cui·Chung·Peng·Wang, "Clicks for money: predicting video views through a sentiment analysis of titles and thumbnails", *Journal of Business Research* 183권(2024년 7월 온라인). 2023-02-16~28 에 올라온 YouTube 영상 16,215개. 썸네일의 강한 감정(긍정·부정 모두)은 조회수 증가와, "captions"의 강한 감정은 오히려 반대 방향과 연관된다. 여기서 caption 이 썸네일 위 글자를 뜻하는지 영상 제목을 뜻하는지는 원문을 열지 못해 확인하지 못했다(보도자료는 "captions in the thumbnails"라는 표현을 써서 썸네일 위 글자일 가능성이 있다) — [Lingnan Scholars](https://scholars.ln.edu.hk/en/publications/clicks-for-money-predicting-video-views-through-a-sentiment-analy/), [EconBiz](https://www.econbiz.de/Record/clicks-for-money-predicting-video-views-through-a-sentiment-analysis-of-titles-and-thumbnails-cui-geng/10015141746)
- [검색 요약·대학 보도자료] 같은 연구: 51%(8,220개)가 사람 얼굴, 38%(6,168개)가 썸네일 안에 글자를 넣었고, 얼굴·높은 해상도·선명한 색은 클릭 증가, 긴 글자와 감정적 제목은 클릭 감소와 연관 — [Asia Research News](https://www.asiaresearchnews.com/node/20288) (원문 미열람, 검색 요약으로 확인)
- [업체 조사] vidIQ, 브레이크아웃(채널 평균보다 크게 앞선) 썸네일 500개, 30개 분야, 2026-06-30 발표·07-08 갱신. 조건: 2분 이상, 구독자 1만+, 조회수 5만+, 채널당 최대 2개. 사람 얼굴 69%(상위 100개 75%, 상위 50개 80%), 고대비 56%(상위 50개 46%), 얼굴 또는 고대비 89%. 과장된 표정은 5%뿐(상위 50개 6%). 글자 없음 28%로 단일 패턴 중 최다, 1~3단어 24%, 글자가 있는 썸네일의 중앙값 5단어. vidIQ 스스로 "무엇을 썼는지 기술할 뿐 원인이 아니며, CTR 이 아닌 브레이크아웃 지표"라고 밝힌다. 분야별 결과는 공개하지 않았다 — [vidIQ Research](https://vidiq.com/research/youtube-thumbnail-study/)
- [검색 요약·업체 조사] Eden: 507,478개 영상 분석(사용 가능 표본 2,960개 썸네일). 브레이크아웃 썸네일의 84.2% 에 얼굴이 있지만 부진 영상도 82.2% 에 얼굴이 있다. 글자가 있는 브레이크아웃 썸네일 평균 6.8단어 — [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/) (원문 미열람). **충돌:** vidIQ 는 부진 영상 비교군이 없어 "얼굴이 많다"만 보여 주고, Eden 의 비교군은 얼굴 효과가 사실상 없음을 시사한다.
- [논문, 집계 경유] Georgia Tech·Yahoo Labs(CHI 2014): Instagram 사진 110만 장, 얼굴이 있으면 좋아요 38%, 댓글 32% 더 받을 가능성. **클릭이나 YouTube 연구가 아니다** — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)
- [블로그] 1of10 은 "아이트래킹 연구에서 얼굴 있는 썸네일이 38~45% 더 낫다"고 쓰지만 출처를 밝히지 않는다 — [1of10](https://1of10.com/blog/best-youtube-thumbnails/)
- [논문, 집계 경유] Korea University 등, *Decision Support Systems* 2022: 38개 대형 브랜드 채널의 2018년 영상 3,743개. 글자 32%, 사람 35%, 제품 53%. 유명인 썸네일이 조회수와 양의 관계(계수 1.0291) — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)
- [논문, 집계 경유] UBC, *IEEE TKDE*(2007~2015 BBTV 네트워크 데이터): 게시 후 썸네일을 바꾼 영상의 53.3% 가 인기가 올랐고, 메타데이터를 안 바꾼 영상은 35%. 데이터 제공자 BBTV 가 채널 최적화를 판매하는 회사라는 이해충돌 — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)
- [프리프린트, 집계 경유] Duke 등(arXiv 2606.03173, 2026): 키즈 인플루언서 채널에서 제목·썸네일·설명에 "감정적 미끼"가 있는 영상은 같은 채널 다른 영상보다 조회수 중앙값 +65.6% — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)

**도덕적 분노(타인 비난)와 한국·미국 차이**
- [논문] Park·Kim·Kim·Bin·Moon·Lee(KAIST), "Moral Outrage Shapes Commitments Beyond Attention", WWW '26. 2024년 한국 뉴스 채널 7개(292,136개 영상)와 미국 뉴스 채널 16개(105,761개). 썸네일과 제목을 **함께** Qwen2-VL-7B 로 분류(얼굴·글자를 따로 보지 않음). "타인 비난" 수사의 IRR: 미국 조회수 1.94·좋아요 2.28·댓글 3.04, 한국 조회수 1.04·좋아요 1.16·댓글 1.73. 한국은 "중립"이 모든 지표를 낮췄고, "타인 칭찬"은 두 나라 모두 참여를 낮췄다 — [arXiv 2601.21815](https://arxiv.org/html/2601.21815v2)
- [논문] 같은 논문의 한계 절: 한국어 주석 일치도(평균 약 0.751)가 영어(약 0.527)보다 높았고, 저자들은 이를 "한국 YouTube 콘텐츠가 오버레이 캡션을 자주 넣어 도덕적 단서를 더 명시적으로 만든다"는 점으로 설명한다. 측정이 아니라 해석이다 — [arXiv 2601.21815](https://arxiv.org/html/2601.21815v2)

**주의를 끄는 정도(아이트래킹)**
- [검색 요약·논문] University of Florida Jain Lab(ETRA 2018): 볼 영상을 고르는 과제에서 참가자는 제목 텍스트 영역보다 썸네일 이미지에 약 두 배의 시선을 썼다. 썸네일 안의 얼굴 대 글자는 분리하지 않았다 — [Jain Lab](https://faculty.eng.ufl.edu/jain/research/completed-projects/eye-tracking-for-online-user-experience/) (원문 미열람)
- [집계] Netflix 소비자 조사(2014, 2016 보도): 탐색 중 시선의 82% 이상이 아트워크에 가고, 작품당 평균 1.8초를 쓴다. 비공개 표본 — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)
- [집계] "시각 처리가 6만 배 빠르다"는 흔한 주장은 1982년 Business Week 광고로 거슬러 올라가며 연구 근거가 없다. "맞춤 썸네일 154% 상승"도 출처 미상 — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)

**클릭베이트 탐지와 유병률**
- [프리프린트, ICWSM 2027 채택] Naveed 등, "Separating Clicks from Baits": 8개국 2,843개 영상(오도 썸네일 1,359개, 합계 조회수 76억+). 영상→텍스트 설명·썸네일·자막을 합친 멀티모달 LLM 판별에서 Claude 3.5 Sonnet 정확도 93.8%. 오도 여부 정의가 주관적이고 문화 의존적이라고 인정한다. 시청자 반응 실험은 없다 — [arXiv 2607.23739](https://arxiv.org/abs/2607.23739)
- [프리프린트] ThumbnailTruth(arXiv 2509.04714)는 "오도 썸네일이 정확한 썸네일보다 CTR 14% 높다"는 최근 연구를 인용하지만 원 연구를 추적하지 못했다 — [arXiv 2509.04714](https://arxiv.org/pdf/2509.04714)
- [논문, 집계 경유] Cyprus University of Technology(2018): 추천에서 수집한 20.6만 개 영상 중 41% 가 분류기(정확도 0.924) 기준 클릭베이트. "예쁜" 태그가 붙은 썸네일의 81% 가 클릭베이트였다. 반면 Bauhaus-Weimar·Leipzig(2018)는 무작위 YouTube-8M 영상 24개 중 1개만 클릭베이트로 봤다. 표본 추출 방식에 따라 유병률이 크게 어긋난다 — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)
- [프리프린트] 썸네일-본편 키프레임 간 얼굴 일치를 특징으로 써서 썸네일과 내용의 불일치를 잡는 방법 — [arXiv 2112.08611](https://arxiv.org/pdf/2112.08611)

**호기심 격차와 신뢰도**
- [검색 요약] 뉴스 헤드라인 실험들: 본문을 고정해도 클릭베이트 헤드라인은 기사 신뢰도를 유의하게 낮췄고, 원래 신뢰도가 낮은 출처가 가장 크게 손해를 봤다. 다만 3개 연구 논문은 클릭베이트가 비클릭베이트보다 호기심을 더 일으키지 못했다고 보고했고, Engaging News Project(미국 성인 2,057명)는 "전방 참조(호기심 격차)" 헤드라인과 일반 헤드라인 사이에 인식 차이를 찾지 못했다 — [Penn State Pure](https://pure.psu.edu/en/publications/does-clickbait-actually-atract-more-clicks-three-clickbait-studie/), [journalism.co.uk](https://www.journalism.co.uk/readers-perceive-question-based-headlines-more-negatively-study-shows/), [Radboud thesis](https://theses.ubn.ru.nl/handle/123456789/14307) (모두 원문 미열람, 대부분 학위논문·요약)
- [1차] YouTube "Test & compare" 는 썸네일(최대 3개)의 승자를 CTR 이 아니라 **시청 시간 점유율**로 고른다. YouTube 는 CTR 만 최적화하면 다른 승자가 나올 수 있다고 설명한다 — [YouTube Help 13861714](https://support.google.com/youtube/answer/13861714) (검색 요약으로 확인, 세부는 YouTube 노트 참조)
- [집계] YouTube 는 크리에이터들이 4천만 회 이상 제목·썸네일 실험을 돌렸다고 밝혔지만 승률은 공개하지 않았다. 업체 NoteLM 의 127개 테스트(15개 채널)는 70% 에서 명확한 승자, 승자 평균 CTR +37% 라고 주장한다(업체 자료) — [Mark Studios 집계표](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics)
- [블로그·일화] Forgotten Weapons 채널의 "AI 썸네일 실험"이 조회수 30% 증가와 시청자 반감을 함께 보고했다는 요약이 있으나, 요약 페이지가 내용을 불러오지 못해 확인하지 못했다 — [Recapio](https://recapio.com/digest/the-ai-paradox-results-of-my-thumbnail-experiment-by-forgotten-weapons)

### Inferences
- 얼굴을 "넣으면 오른다"는 규칙으로 쓰기는 어렵다. 브레이크아웃과 부진 영상의 얼굴 비율이 비슷하다는 Eden 수치가 맞다면, 얼굴은 분야의 기본 문법이지 차별 요인이 아니다. 얼굴은 이야기에 필요한 인물·반응이 있을 때 쓰는 편이 근거에 맞다.
- Cui 등의 결과는 "감정은 그림(표정·상황)이 전하고, 글자는 감정어를 덜어 낸다"는 방향을 시사한다. caption 이 썸네일 위 글자라면 이 결과는 감정어를 크게 쓰는 예능 자막식 썸네일 문구에 불리한 근거가 된다. 원문 확인 전까지는 가설로 다룬다.
- 한국 뉴스 채널에서 분노 수사의 조회수 효과가 4% 에 그친 KAIST 결과는, 미국 실무자들의 "분노·자극" 조언을 한국어 채널에 그대로 옮기면 안 된다는 신호다. 단 뉴스 채널 한정이다.
- YouTube 가 시청 시간 점유율로 썸네일 승자를 고른다는 사실은, 본편이 지키지 못하는 약속을 하는 썸네일이 플랫폼 자체 실험에서도 불리하다는 뜻이다. 이 저장소의 "promise and proof" 지침(약속한 결과를 본편이 보여 준다)과 같은 방향이다.

### Gaps
- 시선 방향(카메라 응시 vs 대상 응시), 화면 속 물체 개수, 시각적 혼잡도, 채도를 독립 변수로 잰 동료 심사 연구는 찾지 못했다. "카메라 응시 시 CTR 20% 상승" 같은 수치는 출처 없는 블로그뿐이다.
- 오도하는 썸네일이 시청 유지율·만족도·구독 해지에 미치는 영향을 직접 잰 연구는 찾지 못했다. 신뢰도 근거는 뉴스 헤드라인(텍스트) 실험에서 온 것이고 영상 썸네일 실험이 아니다.
- Mark Studios 집계표에 실린 개별 논문(Korea University DSS 2022, UBC TKDE, Duke 프리프린트)은 원문을 열지 않았다.

## 2. 실무 프레임워크: 측정된 것과 의견을 구분하면

### Takeaway
MrBeast 문서, Paddy Galloway, 1of10, vidIQ 등의 조언은 "제목·썸네일을 먼저 정하고 본편이 그 약속을 지킨다", "요소를 적게, 초점은 하나", "휴대폰 크기에서 확인", "썸네일 글자와 제목이 같은 말을 반복하지 않는다"로 모인다. 이 중 수치로 측정된 것은 vidIQ 의 기술 통계와 YouTube 의 시청 시간 기반 A/B 정도이고, 나머지는 경험칙이다. "3요소 규칙"을 Galloway 가 만들었다는 귀속은 확인되지 않았다.

### Cited Findings
- [블로그·유출 문서] "How to succeed in MrBeast production"(2024년 9월 유포, 진위 미확인): 영상 판단 지표로 CTR·AVD·AVP 를 들고, 모든 영상의 창작 과정이 제목과 썸네일에서 시작하며 그것이 시청자 기대를 정한다고 쓴다. 예: "I Spent 50 Hours In My Front Yard"보다 "…In Ketchup", "I Spent"보다 "I Survived" — [Simon Willison](https://simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/), [Creator Handbook](https://www.creatorhandbook.net/leaked-document-allegedly-reveals-mrbeasts-secrets-to-youtube-success-the-key-takeaways/). 유출 시점·유출자에 대해 출처끼리 어긋난다.
- [블로그] Paddy Galloway 의 "3요소 규칙" 귀속은 출처 없는 블로그 한 곳뿐이다 — [contentcreators.com](https://contentcreators.com/blog/youtube-thumbnail-best-practices). 영상 요약에서는 "스크롤 중 몇 초 안에 잡을 만큼 단순해야 한다", 자동 생성 녹취에서는 "썸네일은 80~90% 가 클릭의 심리, 10~20% 가 디자인"이라는 발언이 그에게 귀속된다 — [Colin and Samir](https://www.colinandsamir.com/resources/the-new-rules-of-youtube-from-paddy-galloway), [Coconote 녹취](https://coconote.app/notes/fd9b4fe8-3d9d-43b8-b308-6c08c99dac6f/transcript) (둘 다 검색 요약)
- [블로그] 1of10: 브레이크아웃 썸네일 5~10개를 모아 서로 다른 채널·분야에서 반복되는 구도·표정·글자 처리를 찾고, 한 번만 나온 처리는 성공 원인이 아닐 가능성이 크다. 모든 글자에 외곽선·그림자·색 블록을 줘 배경과 분리하라 — [1of10 best thumbnails](https://1of10.com/blog/best-youtube-thumbnails/), [1of10 design tips](https://1of10.com/blog/youtube-thumbnail-design/)
- [업체 조사] vidIQ 의 상위 50개 브레이크아웃은 얼굴이 화면의 대략 3분의 1을 채우고 글자를 얼굴 반대편에 두는 경우가 많았다고 도식으로 보여 주지만 수치화하지 않았다. FAQ 는 밝은 피사체·어두운 배경, YouTube UI 색(빨강·흰색·검정) 회피를 권하는데 이는 연구 결과가 아니라 조언이다 — [vidIQ Research](https://vidiq.com/research/youtube-thumbnail-study/)
- [블로그, 한국] 오픈애즈(링커레터, 2023-09-07): 피사체는 하나, 많아도 2~3개 이하, 색은 3가지 이하, 시청자가 가장 궁금해할 한 가지만, 80% 이상이 휴대폰으로 보므로 생각보다 약 20% 크게. 썸네일 문구는 후킹, 제목은 내용 설명으로 역할을 나누고 같은 말을 반복하지 말 것. 실험 근거는 제시하지 않는다 — [오픈애즈](https://www.openads.co.kr/content/contentDetail?contsId=11601)
- [블로그, 한국] 고구마팜(2024-02-21, 토크 예능): 요소를 "큰 덩어리"로 묶어 첫눈에 인지되게, 색 최소화, 타이틀과 이미지 사이 명도 차를 가장 크게, 설명 문구 4개 이하, 폰트 종류 최소화. 시지각 이론 기반이며 클릭률 데이터는 없다 — [고구마팜](https://gogumafarm.kr/브랜드-유튜브-디자인-전략-토크-예능-콘텐츠-썸네일/)
- [검색 요약] "1초 동안 다른 사람에게 보여 주기", "요소는 최대 3개" 같은 조언이 여러 실무자 콘텐츠에 반복된다 — [Spotter Studio 5 C's](https://www.spotterstudio.com/blog/the-5-cs-of-better-thumbnails), [1of10](https://1of10.com/blog/how-to-never-make-bad-thumbnails-again)

| 원칙 | 근거 수준 |
|---|---|
| 제목·썸네일 먼저, 본편이 약속을 지킨다 | 유출 문서(진위 미확인) + YouTube 시청시간 기반 A/B(1차)로 간접 지지 |
| 초점 하나, 요소 3개 이하 | 의견(실무자 공통). 측정 연구 없음 |
| 스퀸트·휴대폰 크기 테스트 | 의견. 근거는 노출 크기가 작다는 사실뿐 |
| 썸네일 글자 ≠ 제목 반복 | 의견(오픈애즈 등). 측정 연구 없음 |
| 글자 짧게 | 약한 관찰 근거. Cui 등(긴 글자 ↔ 클릭 감소)은 원문 미확인 보도자료 기준이고, 같은 보도는 글자가 있는 쪽이 조회수와 함께 오른다고 한다. vidIQ 는 비교군 없이 브레이크아웃의 72% 가 글자를 썼고 중앙값 5단어라는 기술 통계뿐 |
| 얼굴 크게 | 혼재(vidIQ 지지, Eden 비교군은 차이 없음) |

### Inferences
- 자동 생성기에 넣을 규칙 중 근거가 가장 단단한 것은 "본편이 지키는 약속"(YouTube 가 시청 시간 점유율로 썸네일 승자를 고른다는 1차 문서)이다. "글자 짧게"는 실무자 합의는 넓지만 측정 근거는 약하다. "요소 3개", "얼굴 3분의 1"은 기본값으로 쓰되 강제 규칙이 아닌 권고로 두는 편이 근거 수준에 맞다.
- 1of10 의 "여러 채널에서 반복되는 패턴만 믿어라"는 방법론 자체가 자동화에 맞다: 채널의 기존 썸네일과 같은 분야 브레이크아웃을 참조 묶음으로 쓰는 방식.

### Gaps
- Galloway·MrBeast 의 1차 발언(본인 채널·팟캐스트 원문)은 열지 못했다.
- TubeBuddy 의 공개 집계 조사는 이번 검색에서 찾지 못했다.
- 1of10 이 가진 대규모 데이터(자칭 "620억 조회수") 기반의 공개 통계는 없다.

## 3. 작은 크기 타이포그래피와 한글 썸네일 관행

### Takeaway
작은 크기 가독성에 대한 권위 있는 "썸네일 높이 대비 글자 높이" 기준은 찾지 못했다. 블로그들의 픽셀 권장치는 서로 어긋난다. 공통 조언은 굵은 산세리프(한글은 굵은 고딕), 외곽선·그림자·색 블록, 3~5단어 이내, 강조어 하나만 노랑 등 고채도. 한국 썸네일은 글자가 많은 예능 자막식이 흔하다는 관찰은 있지만(KAIST 한계 절), 그것이 더 잘 클릭된다는 측정은 찾지 못했다. 한국 실무자들 사이에서는 짧은 "단어형 썸네일"로 옮겨 간다는 관찰이 나온다.

### Cited Findings
**일반 타이포그래피(전부 블로그 수준)**
- [검색 요약·블로그] 1280×720 캔버스 기준 주 글자 60~80px, 보조 40~50px, 혹은 약 100pt 등 권장치가 서로 다르다. 미리보기 크기도 약 200×113(메인), 168×94(사이드바), 120~160px 폭 테스트 등으로 출처마다 다르다. 외곽선 10~15px 를 권하는 글도 있다. 재생 시간 배지가 오른쪽 아래를 가리므로 글자를 피하라는 조언이 반복된다 — [creaticalc](https://creaticalc.com/blog/youtube-thumbnail-mobile-readability), [mergeimages](https://mergeimages.net/blog/youtube-thumbnail-text-readability), [thumbmagic](https://thumbmagic.co/blog/youtube-thumbnail-size) (권위 없음, 서로 충돌)
- [관찰 연구] 긴 캡션은 클릭 감소와 연관(Cui 등 2024, 보도자료 기준), 글자 있는 브레이크아웃의 중앙값 5단어(vidIQ 2026), 무글자 28% — [Asia Research News](https://www.asiaresearchnews.com/node/20288), [vidIQ](https://vidiq.com/research/youtube-thumbnail-study/)

**한국어 실무 자료(신뢰도: 낮음~중간, 데이터 없음)**
- [블로그] 글자 수 기준이 자료마다 다르다: "3~5단어", "4단어 또는 8글자 이내", "핵심을 10글자 이내". 폰트 굵기 800 이상(Black, ExtraBold)·외곽선 4px 이상, 흰색+검정 외곽선은 어떤 배경에도 무난하고 노랑은 시선을 강하게 끈다, 가장 강조할 단어 하나만 노랑·형광으로 — [크몽](https://kmong.com/article/1015--%EC%A1%B0%ED%9A%8C%EC%88%98-%EC%98%AC%EB%A6%AC%EB%8A%94-%EC%9C%A0%ED%8A%9C%EB%B8%8C-%EC%8D%B8%EB%84%A4%EC%9D%BC-%EB%94%94%EC%9E%90%EC%9D%B8-%ED%8C%81-5%EA%B0%80%EC%A7%80), [NONOWIKI](https://nonowiki.com/%EC%9C%A0%ED%8A%9C%EB%B8%8C-%EC%8D%B8%EB%84%A4%EC%9D%BC-%EC%83%89%EC%83%81-%ED%8F%B0%ED%8A%B8-%EC%A0%84%EB%9E%B5-%ED%81%B4%EB%A6%AD%EB%A5%A0ctr%EC%9D%84-%EB%86%92%EC%9D%B4%EB%8A%94-%EC%8B%A4/), [snsboost](https://snsboost.kr/blog/25), [Threads @centerlord_youtube](https://www.threads.com/@centerlord_youtube/post/DBFkOrWy_Sb?hl=ko) (검색 요약. "CTR 18~22% 상승" 같은 수치는 출처 불명)
- [블로그] 현직 PD 관찰: 문장형 제목을 넣던 썸네일에서 짧은 "단어형 썸네일"로 옮겨 가는 추세. 예: 스튜디오 수제 '또간집'은 지역명만 적는다 — [careet](https://www.careet.net/1417) (검색 요약)
- [블로그] 웹예능 '문명특급'처럼 자막·편집에 밈을 적극적으로 쓰는 문화가 썸네일 자막 스타일과 이어진다는 서술 — [고구마팜](https://gogumafarm.kr/%eb%a6%ac%eb%b7%b0-%eb%b8%8c%ec%9d%b4%eb%a1%9c%ea%b7%b8-%ed%86%a0%ed%81%ac%ec%87%bc-%ec%9c%a0%ed%8a%9c%eb%b8%8c%ec%97%90%ec%84%9c-%ec%9e%98%eb%90%98%eb%8a%94-%ec%bd%98%ed%85%90%ec%b8%a0-%ec%9c%a0/) (검색 요약)
- [블로그] 고구마팜: 타이틀은 명도 차를 가장 크게, 덜 중요한 글자는 명도 차를 작게 줘 위계를 만든다. 설명 문구 4개 이하, 색·폰트 종류 최소화 — [고구마팜](https://gogumafarm.kr/브랜드-유튜브-디자인-전략-토크-예능-콘텐츠-썸네일/)
- [논문] 한국 뉴스 채널 썸네일은 오버레이 캡션이 잦아 도덕적 단서가 명시적이라는 저자 해석(측정 아님) — [arXiv 2601.21815](https://arxiv.org/html/2601.21815v2)

**한글 가독성 연구(본문 크기 연구, 썸네일 아님)**
- [논문, 초록 수준] 모바일 화면용 한글 고딕 연구(한국컴퓨터정보학회논문지, 2023): 본고딕을 작은 크기에 맞게 조정할 때 굵기·획 대비·글자 안쪽 여백(속공간)·자간을 핵심 변수로 다룬다 — [KoreaScience JAKO202325051029868](https://koreascience.kr/article/JAKO202325051029868.pdf)
- [논문, 초록 수준] 차량 정보 화면의 한글 최소 가독 크기 실험(대한인간공학회지, 2012)은 글자체·크기·획폭·줄간격을 요인으로 다룬다. VDT 한글 한 음절의 최소 가독 크기 연구(2009)는 연령·성별 차이를 비교했다 — [KoreaScience JAKO201212851254986](https://koreascience.kr/article/JAKO201212851254986.pdf), [KoreaScience JAKO200913060412186](https://koreascience.kr/article/JAKO200913060412186.pdf)

### Inferences
- 한글은 한 음절이 네모 안에 초성·중성·종성을 쌓으므로, 같은 높이에서 라틴 대문자보다 획이 촘촘하다. 겹받침(ㄻ, ㄺ)·된소리가 있는 음절은 작은 크기에서 뭉개지기 쉽다(아래 5절 벤치마크에서 생성 모델도 같은 음절에서 실패). 썸네일 문구는 짧고 받침이 단순한 단어를 우선하고, 글자 높이를 라틴 기준보다 넉넉히 잡는 편이 안전하다는 추론이다(직접 측정 없음).
- 외곽선을 두껍게 하면 한글 속공간이 메워진다. 외곽선은 글자 바깥으로만 그리는(stroke outside, paint-order) 방식이 합리적이다. 이것도 측정이 아닌 설계 추론이다.
- 예능 자막식(노랑·흰색 굵은 글자 + 검정 외곽선)은 한국 시청자에게 익숙한 문법이지만, 썸네일의 "긴 글자"는 Cui 등의 보도자료 결과(긴 글자 ↔ 클릭 감소, 원문 미확인)와 반대 방향이다. 자동 생성기의 기본값은 "짧은 단어형 + 강조어 하나 노랑"이 근거와 국내 추세 양쪽에 맞는다.

### Gaps
- 썸네일 크기(폭 약 120~360px)에서 한글 글자 높이별 판독률을 잰 연구는 찾지 못했다. 한글 가독성 연구는 본문 크기(9~14pt) 위주다.
- 한국어 썸네일의 글자 양·색과 CTR 의 관계를 표본으로 잰 국내 연구·에이전시 보고서는 찾지 못했다(네이버 검색 경로가 막혀 있었다는 한계 포함).
- "썸네일 높이의 몇 %" 같은 최소 글자 크기 기준은 권위 있는 출처가 없다.

## 4. 장르별 차이: 스토리·드라마 vs 설명 vs 튜토리얼, 숏드라마 커버

### Takeaway
장르별 썸네일 전략을 측정으로 비교한 공개 연구는 찾지 못했다. 근거로 쓸 수 있는 것은 (1) 감정 강도가 조회수와 함께 오른다는 관찰(Cui 등), (2) 한국 뉴스에서는 분노 효과가 약하다는 KAIST 결과, (3) 숏드라마 업계가 "짧게 봐도 살아남는 약속(관계의 결정, 뜻밖의 정체, 위협받는 인물)"을 광고 소재의 핵심으로 본다는 분석 정도다. 설명·튜토리얼은 결과물·사물을 보여 주는 쪽으로 옮겨 간다는 의견이 있지만 근거는 약하다.

### Cited Findings
- [블로그] ReelShort 광고 분석: 첫 과제는 짧은 노출에서도 살아남는 약속을 찾는 것 — 관계의 결정, 뜻밖의 정체, 위협받는 인물, 혹은 작품 묶음에 대한 접근 — [AdMapix](https://www.admapix.com/blog/ad-intelligence/reelshort-ad-strategy-2026)
- [보도] 마이크로드라마는 약 60초 단위의 세로 회차로 잘려 있고, 급한 반전·고조된 감정 갈등이 특징이며 복수·"응징"이 주요 테마다 — [NPR 2025-03-19](https://www.npr.org/2025/03/19/nx-s1-5330470/micro-drama-soap-opera-app), [Dazed](https://www.dazeddigital.com/film-tv/article/71084/1/horny-vertical-micro-romances-tiktok-youtube-shorts-reelshort-microdrama)
- [블로그] 2026 의견 글: 일반적인 감정 얼굴보다 주제·결과·핵심 사물을 분명히 보여 주는 이미지가 유리해졌다는 주장(근거 약함) — [DEV Community](https://dev.to/checkcalc/the-psychology-of-the-perfect-thumbnail-in-2026-why-faces-are-dying-out-mld)
- [블로그] Kapwing 의 상위 썸네일 분석: 놀람(26.95%)·행복(26.65%) 표정이 가장 흔하다(조회수와의 관계가 아닌 빈도) — [Kapwing](https://kapwing.com/resources/the-youtube-thumbnail-faces-that-attract-the-most-views)
- [블로그, 한국] 오픈애즈: 썸네일은 예쁜 디자인보다 "동영상 미리보기"처럼 내용을 짐작하게 해야 하고, 1부·2부 연재도 썸네일·제목을 바꿔 같은 이미지를 반복하지 말 것. 채널 고유색·로고로 일관성(예: 드로우앤드류의 초록) — [오픈애즈](https://www.openads.co.kr/content/contentDetail?contsId=11601)
- [업체 조사] vidIQ 는 30개 분야를 수집했지만 분야별 결과를 공개하지 않았다 — [vidIQ](https://vidiq.com/research/youtube-thumbnail-study/)

### Inferences
- 드라마·스토리 회차 커버는 "인물 클로즈업 + 그 인물이 처한 결정·위협의 순간"이 업계 소재 분석과 감정 강도 근거 양쪽에 맞는다. 단 본편에 그 순간이 실제로 있어야 YouTube 의 시청 시간 기반 평가와 오도 판별 연구 기준을 함께 통과한다(1절).
- 연재물은 회차마다 다른 장면을 쓰되 채널 색·로고·회차 번호 위치를 고정해 "같은 시리즈"임을 알리는 방식이 실무 조언(오픈애즈)과 맞는다. 회차 번호가 클릭을 늘린다는 측정은 없다.
- 설명·주장형 영상은 이 저장소의 "promise and proof" 지침과 같은 원리로, 결과물(증거) 이미지 + 시청자 말로 쓴 짧은 약속 문구가 근거 방향과 맞는다.

### Gaps
- 장르별(드라마·교육·튜토리얼) 썸네일 특징과 CTR·조회수의 관계를 비교한 연구는 찾지 못했다.
- ReelShort·DramaBox 앱 내 커버(포스터) 디자인 관행이나 성과 데이터는 찾지 못했다. 회차 번호·클리프행어 장면 사용 여부도 확인하지 못했다.

## 5. AI 이미지 모델로 썸네일 만들기: 글자 처리, 실패 유형, 플랫폼 공개 규정

### Takeaway
한글 렌더링 벤치마크(2026-05, 소표본)에서 GPT Image 2 는 14개 중 13개 판정, 12개 정확 일치(92%), 평균 CER 0.038로 상위권이지만 완벽하지 않다. 겹받침·된소리·숫자·긴 문자열에서 모델들이 틀린다. Qwen-Image·Z-Image 는 그 벤치마크에 없다. YouTube 공식 문서는 AI 로 썸네일을 만들거나 다듬는 것을 "제작 보조"로 분류해 공개 대상이 아니라고 명시한다. 다만 C2PA 메타데이터·내부 탐지로 자동 라벨이 붙을 수 있고, 그 대상은 영상 콘텐츠다. TikTok·Meta 가 커버 이미지에 라벨을 다는지는 1차 문서로 확인하지 못했다. 시청자가 AI 같은 이미지를 싫어하면서도 클릭은 하는 "역설"은 일화 수준이다.

### Cited Findings
**한글 텍스트 렌더링**
- [오픈 벤치마크] korean-text-render-bench(2026-05-29 스냅숏, fal.ai 엔드포인트). 흰 포스터에 검정 산세리프 한글만 그리게 하고 GPT-4o 가 판독, CER 과 정확 일치율로 채점. 결과: recraft-v4-pro·seedream-5·nano-banana-pro 각 CER 0.000(14/14), **gpt-image-2 CER 0.038(12/13, 92%)**, recraft-v4 0.071, gpt-image-1.5 0.083(12/14), flux-2-flash 0.145(9/14), ideogram-v3 0.302(5/14), imagen-4 1.332(0/14, 한글처럼 보이는 가짜 글자). 실패 사례: 떡볶이→덕볶이, 맑음(ㄻ)→맘음, "주식회사 아이오브"→"주성휘브", "커피 2잔"→"커피 22잔". 가장 어려운 문구는 "닭갈비 맛집". 셀당 이미지 1장, 시드·비율 변화 없음, 판독자가 모델이라는 한계를 저자가 밝힌다. README 의 "5 models x 8 prompts"와 본문 "9개 모델·14개 프롬프트"가 어긋난다 — [GitHub hankimis/korean-text-render-bench](https://github.com/hankimis/korean-text-render-bench)
- [블로그] GPT Image 2 텍스트 정확도 "영어 약 99%, 한국어 등 90% 이상" 같은 수치는 2차 가이드의 주장이며 OpenAI 공식 수치는 찾지 못했다 — [createvision](https://createvision.ai/guides/gpt-image-2-complete-guide), [sunra](https://sunra.ai/gpt-image-2/text-rendering)

**AI 썸네일에 대한 시청자 반응**
- [보도·설문] Animoto 2026 State of Video(Quartz 보도): 소비자 36% 가 AI 생성 브랜드 영상이 브랜드 인식을 낮춘다고 답했고, 82% 이상이 AI 영상을 알아볼 수 있다고 믿는다. 썸네일이 아닌 영상 대상 — [Quartz](https://qz.com/ai-video-animoto-state-of-industry-report-2026)
- [블로그] AI 얼굴·질감이 섬뜩함을 주고 신뢰를 낮춘다는 주장들은 검증 가능한 방법론이 없다 — [uppbeat](https://uppbeat.io/blog/creator-questions/are-ai-thumbnails-putting-viewers-off-your-videos), [ucstrategies](https://ucstrategies.com/news/ai-thumbnail-design-psychology-marketers/)

**플랫폼 공개 규정**
- [1차] YouTube "Disclosing altered or synthetic content": "generative AI tools to create or improve a video outline, script, thumbnail, title, or infographic"는 제작 보조로 공개 불필요. 공개 대상은 실제 인물이 하지 않은 말·행동, 실제 사건·장소 영상의 변경, 일어나지 않은 사실적 장면, 영상의 주가 되는 AI 음악. 비현실적·애니메이션 콘텐츠, 미용 필터·색 보정은 제외. 사실적 콘텐츠 라벨은 플레이어에, 그 외는 확장 설명란에 붙는다. YouTube 는 C2PA 메타데이터가 있거나 내부 시스템이 AI 생성·변경으로 탐지한 콘텐츠에 자동 라벨을 붙일 수 있고, 자체 AI 도구·C2PA·수동 검토로 붙은 라벨은 크리에이터가 바꿀 수 없다 — [YouTube Help 14328491](https://support.google.com/youtube/answer/14328491?hl=en)
- [블로그] 실존 인물의 사실적 합성 얼굴을 썸네일에 쓰면 YouTube 개인정보 지침에 따른 삭제 요청 대상이 될 수 있다는 해설 — [thumbnailpeak](https://thumbnailpeak.com/blog/are-ai-thumbnails-allowed-on-youtube), [pikzels](https://pikzels.com/blog/are-ai-thumbnails-allowed-on-youtube)
- [보도·블로그] TikTok: 사실적인 이미지·음성·영상의 AI 생성 콘텐츠에 크리에이터 라벨을 요구하고, 만화풍 AI 는 범위 밖이라는 해설. 업로드 파일의 C2PA Content Credentials 를 읽어 자동 라벨, 자체 도구 결과물과 C2PA 태그 업로드에 보이지 않는 워터마크 시험. 2026-07 기준 30억 건 이상 라벨, C2PA 운영위원회 합류. 광고는 사실적 AI 콘텐츠에 표시 라벨 필수(2026-07-21 갱신, 범위에 대해 출처끼리 어긋남). 커버 이미지에 대한 언급은 없다 — [TikTok Newsroom 2026-03-10](https://newsroom.tiktok.com/tiktok-ssa-shares-more-ways-to-spot-shape-and-understand-ai-generated-content?lang=en-ZA), [Tubefilter 2026-07-14](https://www.tubefilter.com/2026/07/14/tiktok-ai-transparency-tools-content-labels/), [cinerads](https://www.cinerads.com/blog/tiktok-ai-content-policy) (뉴스룸 본문은 열지 않았다)
- [검색 요약·보도] Meta(1차 페이지는 열지 않음): 2024-02 부터 업계 표준 지표(C2PA, IPTC 메타데이터, 보이지 않는 워터마크)로 AI 생성 이미지를 탐지해 라벨, 2024-07 "Made with AI"→"AI info"로 이름 변경. IPTC 분석에 따르면 Instagram 은 IPTC DigitalSourceType 은 보지만 C2PA 는 보지 않았다. 업로드 시 메타데이터가 벗겨지는 경우가 많다. 2026-11-01 뉴스레터는 라벨을 이미지 오른쪽 위 메뉴로 옮긴다고 보도(단일 출처, 미확인) — [Meta Newsroom 2024-02](https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/), [TechCrunch 2024-07-01](https://techcrunch.com/2024/07/01/meta-changes-its-label-from-made-with-ai-to-ai-info-to-indicate-use-of-ai-in-photos), [IPTC](https://iptc.org/?p=9040), [CO/AI](https://getcoai.com/news/facebook-and-instagram-make-ai-labels-less-prominent-on-edited-content)

### Inferences
- **글자는 코드로 합성하고, 모델은 배경·인물만 그리게 하는 방식**이 기본값으로 안전하다. 근거: 최상위 모델도 한글에서 1/13 정도 틀리고, 실패 유형(겹받침·숫자 중복)이 썸네일 문구에 흔한 형태다. 코드 합성은 폰트·외곽선·크기·위치를 결정적으로 통제하고, 문구 수정 시 이미지를 다시 생성할 필요가 없다. 모델 렌더링이 필요한 경우(간판·포장지처럼 장면 속 글자)는 이 저장소 지침대로 GPT Image 2 를 쓰고 결과 글자를 판독·검사해야 한다. 이 추론을 직접 비교한 연구는 찾지 못했다.
- 코드 합성을 전제로 하면 이미지 프롬프트에 "no text, no letters, no watermark"와 글자 들어갈 빈 영역(예: 프레임 왼쪽 3분의 1 은 단순한 배경)을 명시하는 편이 합리적이다. Z-Image·Qwen-Image 처럼 텍스트 정확도가 측정되지 않은 모델이 가짜 글자를 그리는 위험(imagen-4 사례)을 줄인다.
- YouTube 기준으로 썸네일 자체는 공개 대상이 아니지만, 썸네일이 "본편에 없는 사실적 장면"을 보여 주면 오도 썸네일 문제(1절)와 겹친다. 생성기는 본편 장면·인물 시트에서 출발해 본편에 있는 순간을 그리게 하는 것이 정책·신뢰 양쪽에 안전하다.
- 생성 이미지에 C2PA 메타데이터가 붙어 있으면 TikTok·YouTube·Meta 가 자동 라벨을 달 수 있다. 썸네일·커버 파일에 메타데이터가 남는지 여부를 생성 파이프라인이 기록해 두면 라벨이 붙었을 때 원인을 추적할 수 있다.

### Gaps
- Qwen-Image, Z-Image 의 한글 렌더링 정확도 측정은 찾지 못했다(벤치마크에 없음).
- "코드 합성 vs 모델 렌더링" 썸네일의 CTR 이나 인식 차이를 비교한 연구는 찾지 못했다.
- TikTok 커버, Instagram 릴스 커버 이미지가 AIGC/AI info 라벨 대상인지 1차 문서로 확인하지 못했다. 각 플랫폼 노트 참조.
- AI 썸네일이 CTR 이나 시청자 신뢰에 주는 영향을 통제 실험으로 잰 연구는 찾지 못했다. Forgotten Weapons 실험은 원문 미확인.
- 생성 인물 얼굴의 "섬뜩함"을 썸네일 맥락에서 잰 연구는 찾지 못했다.

## 6. 접근성과 다크 모드

### Takeaway
썸네일 전용 접근성 기준은 없다. 가장 권위 있는 수치는 WCAG 의 글자 대비(일반 4.5:1, 큰 글자 3:1)이며, 이미지 위 글자에 적용하는 것은 해석이다. 색만으로 의미를 전달하지 말고 명도 대비를 확보하라는 원칙이 색각 이상 대응의 핵심이다. YouTube 다크 모드에서 썸네일이 어떻게 보이는지에 대한 권위 있는 자료는 찾지 못했다.

### Cited Findings
- [검색 요약·표준 해설] WCAG 1.4.3: 일반 글자 4.5:1, 큰 글자 3:1. 색만으로 정보를 전달하지 말 것 — [web.dev Color and contrast](https://web.dev/learn/accessibility/color-contrast), [Acquia: 이미지 위 글자 대비](https://docs.acquia.com/web-governance/text-top-image-gradient-or-backdrop-filter-should-have-minimum-contrast)
- [블로그] 자막 가독성 가이드: 어두운 배경 위 흰 글자에는 얇은 어두운 외곽선, 순백·순흑 조합에는 외곽선·그림자가 필요할 수 있다 — [Rev](https://rev.com/blog/the-best-and-worst-font-colors-for-closed-captions)
- [블로그, 한국] 고구마팜: 색을 적게 써도 타이틀과 이미지의 명도 차가 없으면 변별력이 떨어진다(명도 대비 우선) — [고구마팜](https://gogumafarm.kr/브랜드-유튜브-디자인-전략-토크-예능-콘텐츠-썸네일/)
- [업체 조사 FAQ] vidIQ: 밝은 피사체·어두운 배경, YouTube UI 색(빨강·흰색·검정)을 피하라는 조언(연구 결과 아님) — [vidIQ](https://vidiq.com/research/youtube-thumbnail-study/)

### Inferences
- 자동 생성기에서 측정 가능한 검사로 옮기기 쉬운 것은 "글자 색과 외곽선(또는 바로 뒤 배경) 사이 명도 대비 ≥ 3:1"이다. 외곽선이 있으면 배경과 무관하게 이 조건을 맞추기 쉽다.
- 노랑+검정 외곽선, 흰색+검정 외곽선은 적록 색각 이상에서도 명도 차가 커서 안전한 편이다. 빨강·초록만으로 대비를 만드는 조합(예: 초록 글자 + 빨강 배경)은 피하는 편이 맞다. 이는 일반 색각 원리에서 나온 추론이다.
- 썸네일 가장자리가 어둡거나 하얗게 비어 있으면 다크·라이트 UI 배경과 섞여 경계가 사라질 수 있다. 가장자리에 질감·색이 있는 배경을 쓰는 편이 안전하다는 것도 추론이다(측정 없음).

### Gaps
- YouTube·TikTok 다크 모드 배경 위 썸네일 경계·대비에 대한 측정이나 공식 지침은 찾지 못했다.
- 색각 이상 시청자 대상의 썸네일 클릭 연구는 찾지 못했다.
