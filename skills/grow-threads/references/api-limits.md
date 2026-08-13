# Threads 도구 한계·우회 — 실측 정본 (2026-08-11)

성장 루프가 부딪히는 API 벽과 검증된 우회로. 여기 적힌 것은 전부 실호출로 확인한
값이다. 세션이 바뀌어도 같은 벽에서 다시 시간을 쓰지 않게 하는 것이 이 문서의 목적이다.

## 1. 팔로우는 API 로 못 한다

Threads API 에 follow/unfollow 엔드포인트가 없다(2026-08 확인). 팔로우가 필요하면
브라우저뿐이고, 그때 **로그인 계정이 그 채널인지 반드시 확인**해야 한다 — 한 브라우저에
여러 브랜드 세션이 오가므로 남의 브랜드로 팔로우가 나갈 수 있다.

기계적 맞팔·스하리 품앗이는 하지 않는다(§절대 규칙 2). 2026-08-09 자 실사용 기록에
스하리·반하리를 돌리다 하루 만에 계정이 영구정지된 사례가 있다 — 도달 감점이 아니라
계정 소멸 리스크다.

## 2. 키워드 검색은 승인 전까지 자기 글만 나온다

`threads_search` 는 스코프(`threads_keyword_search`)와 앱 권한이 다 붙어 있어도
**개발 모드 표준 액세스**에서는 자기 계정 게시물만 반환한다. 남의 공개 글 검색은
App Review 고급 액세스가 필요하다. **"남의 글 0건"은 오류가 아니라 정상 동작**이므로
버그로 오인해 시간을 쓰지 않는다.

### 해제 경로가 사실상 막혀 있다 — 신청 버튼이 법인 상태 변경을 요구한다 (2026-08-12 실측)

경로는 Meta 앱 → 이용 사례 → Threads API 액세스 → **권한 및 기능** 탭 →
`threads_keyword_search` 행 → 옵션 → **앱 검수에 추가**다. 그런데 그 버튼을 누르면
신청 폼이 아니라 이 다이얼로그가 뜬다:

> To add a permission or feature to App Review, become a Tech Provider …
> **This decision cannot be reversed after you've been identified as a Tech Provider.**
> 비즈니스 인증 → 액세스 인증 → 앱 검수

즉 **검수 목록에 담는 것조차** Tech Provider 전환이 선행이다. 알아야 할 세 가지:

- **Tech Provider 는 앱이 아니라 비즈니스(법인) 단위다.** 앱을 새로 만들어 같은
  비즈니스에 붙여도 못 피한다. 반대로 전용 비즈니스 포트폴리오를 따로 만들면 본
  법인의 다른 Meta 자산은 격리된다.
- 공식 문서와 다이얼로그가 어긋난다. 문서(`docs/development/release/tech-providers/`)는
  인증 **상태**의 상실·자동 복귀 조건을 설명하지만, 다이얼로그가 못박는 비가역은
  "우리는 남의 데이터에 접근하는 기술 제공업체"라는 **자기 분류**와 그에 딸린 상시
  강화 심사다. 문서만 읽고 "되돌릴 수 있다"로 판단하면 안 된다.
- 비용 3단계: 비즈니스 인증(법인 서류) → 액세스 인증(약 5일 심사) → 앱 검수.
  1차 데이터(자기 계정)만 쓰는 앱을 위한 예외 경로는 문서에 없다.

**그래서 기본 판단은 신청하지 않는 것이다**(2026-08-12 사용자 결정). 고급 액세스로
얻는 것은 검색 자동화뿐인데 아래 우회로 이미 참여가 되고 있고, 앱 검수는 "왜 남의
데이터가 필요한가"를 심사하므로 성장 자동화는 승인 논거가 약하다. 값은 비가역인데
이득은 편의다. 다음 세션도 이 버튼을 다시 누르지 않는다.

### 우회 — 브라우저로 찾고 API 로 답한다

승인 전에도 참여는 가능하다. 발견만 브라우저로 하고 게시는 채널 토큰으로 한다.
쓰기가 API 를 타므로 **브라우저 로그인 계정이 무엇이든 게시 주체는 그 채널**이다 —
오계정 사고가 구조적으로 막힌다.

```
threads.com/search?q=<키워드>&filter=recent   ← 발견 (읽기 전용)
  → 후보 글 permalink 열기
  → 루트 글 ID 와 본문을 같은 페이지에서 뽑기
  → threads_publish(replyToId: <그 ID>)        ← 게시 (채널 토큰)
```

**ID 뽑는 규칙 — 함정이 셋이다.** 우리 글로 정답을 대조해 확정했다.

| 무엇 | 판정 |
| --- | --- |
| 상세 페이지의 **첫 `"XDTTextPostAppMediaInfo:<id>"`** | ✅ 루트 글 ID (API 와 같은 값) |
| `"pk"` | ❌ 다른 ID 체계(19자리) — 넘기면 엉뚱한 글 |
| **첫 `"fbid"`** | ❌ 모든 페이지에 같은 값이 나오는 계정 상수 |

**본문은 반드시 같은 페이지의 `document.title` 에서 받는다.** 검색 결과 목록에서
DOM 부모를 훑어 본문을 뽑으면 **ID 와 한 칸 어긋난다**(실측 — AI 자동화 답글을
정치 글에 붙일 뻔했다). ID 와 본문이 같은 페이지에서 나오면 어긋날 수 없다.

게시 직전에 한 번 더 대조한다: 뽑은 ID 가 그 코드의 것인지, `title` 이 우리가 읽은
그 글인지, 플랜 금지 소재가 아닌지.

## 3. 답글은 컨테이너가 FINISHED 된 뒤에 발행해야 한다

`threads_publish(replyToId=남의 글)` · `sns_comment_reply(THREADS)` 가
`400 code 24 subcode 4279009 "미디어를 찾을 수 없음"` 으로 실패하던 원인이다.
권한 문제가 아니다 — **생성 직후 컨테이너 status 가 `IN_PROGRESS` 이고 약 3초 뒤
`FINISHED`** 가 된다(실측 폴링). 과거 코드는 `imageUrl` 이 있을 때만 폴링해서
텍스트 답글이 항상 즉시 발행됐다.

서버는 고쳤다(`publishThreads` 의 폴링을 무조건 실행). **다만 MCP 서버 프로세스는
세션 시작 때 로드한 dist 로 돌기 때문에, 재시작 전에는 구 코드가 계속 실패한다.**
그때의 우회는 2단계 직접 호출이다:

```bash
TOK=$(cat ~/.config/social-flow/<채널>/threads_token)
C=$(curl -sS -X POST "https://graph.threads.net/v1.0/me/threads" \
     -d media_type=TEXT_POST --data-urlencode "text@문안.txt" \
     -d "reply_to_id=<대상ID>" -d "access_token=$TOK" | jq -r .id)
# status 가 FINISHED 될 때까지 3초 간격 폴링 (보통 1~2회)
curl -sS -X POST "https://graph.threads.net/v1.0/me/threads_publish" \
     -d "creation_id=$C" -d "access_token=$TOK"
```

**발행에 실패한 컨테이너를 나중에 다시 발행하지 않는다** — 그 사이 우회로 이미
게시했다면 중복 게시가 된다. 컨테이너는 24시간 뒤 저절로 사라진다.

컨테이너 생성이 200 이라는 사실만으로 "발행 가능"을 단정하지 않는다. 생성은 답글
권한을 검증하지 않는다(이 오판으로 한 번 틀렸다).

## 4. 인박스는 우리 루트 글만 훑는다

`sns_comment_inbox` 는 우리 최근 **게시물**을 훑어 그 댓글을 모은다. 그래서 **남의
글에 단 우리 답글에 상대가 답하면 인박스에 안 잡힌다** — 대화가 이어지는 자리인데
골든아워를 통째로 놓친다.

틱마다 최근 우리 답글 ID 로 직접 확인한다:

```bash
curl -sS "https://graph.threads.net/v1.0/<우리답글id>/replies\
?fields=id,username,text,timestamp&access_token=$TOK"
```

state 에 최근 답글 ID 를 남겨 두고 이 조회를 돌린다.

## 5. 지표는 게시물 단위가 계정 단위보다 느리다

방금 올린 글의 `views` 가 0 으로 보이는 건 대개 집계 전이다. 계정 일별 합계가 먼저
오르고 게시물별 수치가 나중에 채워진다(실측: 13분 0 → 43분 183). **0 을 보고 실패로
판정하지 않는다** — 같은 나이끼리 비교해야 판단이 선다.

브라우저에서는 즉시 볼 수 있다 — 글 상세 페이지 HTML 의 `"impression_count"`.

**응답 형태가 계정과 게시물에서 다르다** — 직접 curl 로 훑을 때 걸린다(2026-08-12 실측).
`me/threads_insights`(계정)는 `total_value.value` 로 오지만 `/{id}/insights`(게시물
하나)는 `values[0].value` 다. 계정 형태만 가정한 파서를 쓰면 **전 항목이 `None` 으로
나오면서 HTTP 는 200** 이라, 지표가 0 인 것처럼 보인다. 두 형태를 함께 받는다:

```python
vals = x.get('values') or []
v = vals[0].get('value') if vals else (x.get('total_value') or {}).get('value')
```

`replies` 는 게시물 단위에서 `name` 이 `thread_replies` 로 오는 것도 같이 본다.
