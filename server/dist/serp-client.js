import { requireSerpApiKey } from './config.js';
import { buildQuery, requestRaw } from './http.js';
/**
 * SerpApi 클라이언트 — 자료조사·사실검증 툴(serp_*)의 백엔드.
 *
 * 두 가지 불변 조건:
 * 1. **키 마스킹** — SerpApi 는 api_key 를 URL 쿼리로만 받으므로, 에러 경로(requestRaw 의
 *    타임아웃/도달불가 본문에 URL 포함)에서 키가 LLM 컨텍스트로 새지 않게 항상 마스킹한다.
 * 2. **응답 슬리밍** — 원본 SERP JSON 은 검색 1회에 20~60KB. LLM 이 근거로 쓸 필드만
 *    추려 2~4KB 로 줄인다 (원문 패스스루 금지 — http.ts 의 원문 반환 철학의 의도적 예외).
 */
const SERPAPI_BASE = 'https://serpapi.com/search';
const RECENCY_TBS = {
    hour: 'qdr:h',
    day: 'qdr:d',
    week: 'qdr:w',
    month: 'qdr:m',
    year: 'qdr:y',
};
function maskKey(text) {
    return text.replace(/api_key=[^&\s"']+/g, 'api_key=***');
}
function err(message) {
    return { text: message, isError: true };
}
/**
 * error 필드 없이 200 + 빈 결과가 오는 경우(강한 필터·페이지 초과 등)의 응답.
 * 빈 스켈레톤 JSON 만 돌려주면 "결과 없음"과 구분되지 않아 모델이 방향을 잃는다.
 */
function emptyResult() {
    return {
        text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것)',
        isError: false,
    };
}
/**
 * 네이버 SERP 스크래핑 결과에 섞여 들어오는 스크린리더 라벨을 떼어낸다.
 *
 * 실측 2026-08-11: where=video 의 title·origin·channel 끝에 "새 창 열림"이 붙어
 * 온다("너만몰라TV새 창 열림"). 남겨 두면 모델이 채널명의 일부로 읽어 인용문에
 * 그대로 복사한다.
 */
function stripA11yLabel(value) {
    if (typeof value !== 'string')
        return undefined;
    const cleaned = value.replace(/새 창 열림\s*$/, '').trim();
    return cleaned.length > 0 ? cleaned : undefined;
}
/**
 * 슬라이스 고지 — 엔진이 준 것보다 적게 돌려줄 때 그 사실을 응답에 싣는다.
 *
 * 검색 엔진마다 한 번에 주는 건수가 고정이고 우리 `limit` 과 다르다. 침묵하면
 * 모델은 받은 것이 전부라고 믿고 조사를 멈춘다.
 *
 * 잘린 구간을 되찾는 방법은 엔진마다 달라서 호출자가 `more` 로 넘긴다 — page
 * 보폭이 한 묶음보다 작은 엔진(video 68건에 보폭 48)에서는 다음 page 가 겹쳐
 * 가져오고, page 인자가 아예 없는 엔진(google_news)에서는 limit 뿐이다.
 *
 * 상수 추정이 아니라 **이번 응답이 실제로 준 건수**로 판단한다. 엔진 페이지
 * 크기는 검색어·시점에 따라 흔들리므로(구글 웹은 같은 요청에 5~10건), 상수를
 * 근거로 대면 응답과 모순되는 고지문이 만들어진다.
 *
 * @param received 엔진이 이번에 준 건수
 * @param limit    사용자가 요청한 건수
 * @param more     더 가져오는 방법 — 툴마다 다르다(page vs limit)
 */
function sliceNote(received, limit, more) {
    if (received <= limit)
        return undefined;
    return `이번 응답은 ${received}건을 받았는데 limit=${limit} 라 ${received - limit}건을 잘랐다. ${more}`;
}
/** undefined·빈 문자열·빈 배열·빈 객체 필드를 제거해 페이로드를 줄인다 */
function compact(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null || value === '')
            continue;
        if (Array.isArray(value) && value.length === 0)
            continue;
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
            continue;
        out[key] = value;
    }
    return out;
}
function pick(obj, keys) {
    if (!obj || typeof obj !== 'object')
        return undefined;
    const source = obj;
    const out = compact(Object.fromEntries(keys.map((k) => [k, source[k]])));
    return Object.keys(out).length > 0 ? out : undefined;
}
async function callSerpApi(params) {
    const apiKey = requireSerpApiKey();
    const url = `${SERPAPI_BASE}${buildQuery({ ...params, api_key: apiKey, output: 'json' })}`;
    const res = await requestRaw('get', url, {});
    if (!res.ok) {
        if (res.status === 401) {
            return {
                result: err('SerpApi 401 Unauthorized — SERPAPI_API_KEY 가 유효하지 않다. 키를 교정하기 전 재시도 금지 (401/400 은 재시도해도 같은 결과).'),
            };
        }
        if (res.status === 429) {
            return {
                result: err('SerpApi 429 — 월간 쿼터 또는 시간당 처리량 소진. 이번 세션에서는 추가 검색을 중단하고, 이미 확보한 근거 안에서만 저작하거나 미검증 주장을 본문에서 제외할 것.'),
            };
        }
        return { result: err(`SerpApi HTTP ${res.status}: ${maskKey(res.body.slice(0, 500))}`) };
    }
    let json;
    try {
        json = JSON.parse(res.body);
    }
    catch {
        return { result: err(`SerpApi 응답 JSON 파싱 실패: ${maskKey(res.body.slice(0, 300))}`) };
    }
    const body = json;
    // 결과 없음은 HTTP 200 + error 필드로 온다 — 툴 에러가 아니라 "빈 결과"로 취급
    if (typeof body.error === 'string') {
        if (/hasn'?t returned any results|no results/i.test(body.error)) {
            return {
                result: {
                    text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것. 결과 없는 검색은 과금되지 않음)',
                    isError: false,
                },
            };
        }
        return { result: err(`SerpApi error: ${maskKey(body.error)}`) };
    }
    return { json: body };
}
/**
 * 구글 결과 페이지 크기. `start` 는 0부터 세는 **항목 오프셋**이며, 이 값의
 * 배수로만 페이지를 끊는다.
 *
 * **`num` 은 이 엔진에서 무효다** (실측 2026-08-11). SerpApi 가 구글로 넘기지
 * 않는다 — 응답의 `search_parameters` 에 `num` 이 없고 `search_metadata.google_url`
 * 에도 실리지 않으며, `serpapi_pagination.current` 는 start 0/10/20 을 각각
 * 1/2/3 페이지로 센다. 즉 실제 페이지는 요청과 무관하게 **항상 10건**이다.
 *
 * 그래서 오프셋 단위를 `limit` 에 연동하면 안 된다. `limit=20` 을 20 배수로
 * 잡으면 page=2 가 구글 3페이지를 가리켜 2페이지(11~20번)가 통째로 사라진다.
 * `limit` 은 서버 슬라이스일 뿐이므로 오프셋은 항상 10 단위다.
 *
 * (한때 "구글이 커서를 요청한 num 만큼 소비한다"고 적었으나 오독이었다.
 * num=20·start=20 에서 중복이 없던 것은 num 이 무시된 채 start=20 이 그냥
 * 3페이지였기 때문이고, num=5·start=5 의 중복은 start=5 가 1페이지 안쪽을
 * 가리켰기 때문이다.)
 */
const GOOGLE_PAGE_SIZE = 10;
export async function webSearch(input) {
    const limit = input.limit ?? 10;
    const { result, json } = await callSerpApi({
        engine: 'google',
        q: input.query,
        gl: input.gl,
        hl: input.hl,
        location: input.location,
        start: input.page && input.page > 1 ? (input.page - 1) * GOOGLE_PAGE_SIZE : undefined,
        tbs: input.recency ? RECENCY_TBS[input.recency] : undefined,
    });
    if (result)
        return result;
    const p = json;
    const rawOrganic = p.organic_results ?? [];
    // position 은 페이지마다 1부터 다시 시작한다 — 그대로 두면 page=2 의 1번이
    // page=1 의 1번과 같은 순위로 읽힌다. 오프셋을 더해 전역 순번으로 바꾸면
    // 모델이 페이지 경계의 재배치(구글이 같은 링크를 다른 페이지에도 얹는 경우)를
    // 스스로 알아볼 수 있다.
    const offset = input.page && input.page > 1 ? (input.page - 1) * GOOGLE_PAGE_SIZE : 0;
    const organicResults = rawOrganic.slice(0, limit).map((r, i) => compact({
        position: offset + (typeof r.position === 'number' ? r.position : i + 1),
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        date: r.date,
        source: r.source,
    }));
    if (organicResults.length === 0 && !p.answer_box && !p.knowledge_graph)
        return emptyResult();
    const slim = compact({
        query: input.query,
        // total_results 는 페이지마다 크게 흔들린다(실측: 같은 검색어에서 1페이지 462,
        // 2페이지 122) — 근거로 인용할 수 있는 값이 아니라 첫 페이지에서만 싣는다
        total_results: input.page && input.page > 1 ? undefined : p.search_information?.total_results,
        note: sliceNote(rawOrganic.length, limit, `page 를 1씩 올리면 전역 ${offset + GOOGLE_PAGE_SIZE + 1}번부터 이어지므로 그 사이 구간은 건너뛴다 — 빠짐없이 보려면 limit 을 ${GOOGLE_PAGE_SIZE} 이하로 두고 page 를 차례로 넘길 것`),
        answer_box: pick(p.answer_box, ['type', 'title', 'answer', 'snippet', 'link']),
        knowledge_graph: pick(p.knowledge_graph, ['title', 'type', 'description', 'source', 'website']),
        organic_results: organicResults,
        related_questions: (p.related_questions ?? [])
            .slice(0, 4)
            .map((r) => compact({ question: r.question, snippet: r.snippet, link: r.link })),
    });
    return { text: JSON.stringify(slim, null, 1), isError: false };
}
/** serp_news_search.limit 의 스키마 상한 — handlers.ts 와 같은 값이어야 한다 */
export const SERP_NEWS_MAX_LIMIT = 20;
/**
 * Google 뉴스 검색.
 *
 * 이 엔진에는 결과 수·페이지 파라미터(num/start)가 없어 반환 개수는 서버 측
 * 슬라이스로만 줄인다 — 과금은 어느 쪽이든 검색 1회다.
 *
 * 정렬 파라미터 so(0=관련도 | 1=날짜)도 쓸 수 없다. 실측(2026-07-29) 결과
 * `q` 와 함께 보내면 400 이 온다: "`q` and `so` parameters can't be used
 * together." — so 는 topic/publication/story 토큰 탐색 전용이다. 최신순이
 * 필요하면 serp_web_search 의 recency(tbs=qdr:*) 나 naver_search(sort=date)
 * 를 쓴다.
 */
export async function newsSearch(input) {
    const max = input.limit ?? 10;
    const { result, json } = await callSerpApi({
        engine: 'google_news',
        q: input.query,
        gl: input.gl,
        hl: input.hl,
    });
    if (result)
        return result;
    const p = json;
    /**
     * link 없는 항목은 섹션 헤더인데, **그 안에 stories[] 로 실기사를 달고 온다**
     * (실측 2026-08-11: {"position":1,"title":"주요 뉴스","stories":[4건]}).
     *
     * 한때 헤더를 통째로 버렸는데, 버려진 4건이 응답에서 가장 최신이었다 —
     * 시효성 검증이 이 툴의 존재 이유인데 최상위 랭크의 최신 기사가 사라졌다.
     * 헤더 자체는 근거로 못 쓰므로 벗겨내되, 안의 기사는 평탄화해 살린다.
     */
    const rawNews = (p.news_results ?? []).flatMap((r) => {
        if (typeof r?.link === 'string' && r.link.length > 0)
            return [r];
        const stories = r?.stories ?? [];
        return stories.filter((s) => typeof s?.link === 'string' && s.link.length > 0);
    });
    // 묶음을 평탄화하면 원본 position 이 겹친다(헤더 안 기사도 1부터 센다) —
    // 순번을 다시 매겨 "2위가 두 개"인 응답을 만들지 않는다
    const newsResults = rawNews.slice(0, max).map((r, i) => compact({
        position: i + 1,
        title: r.title,
        source: typeof r.source === 'object' ? r.source?.name : r.source,
        date: r.date,
        snippet: r.snippet,
        link: r.link,
    }));
    if (newsResults.length === 0)
        return emptyResult();
    return {
        text: JSON.stringify(compact({
            query: input.query,
            // 이 엔진은 페이지 인자가 없다 — 잘린 구간을 가져올 방법이 limit 뿐이다
            note: sliceNote(rawNews.length, max, max >= SERP_NEWS_MAX_LIMIT
                ? `이 엔진에는 페이지 인자가 없고 limit 도 이미 상한(${SERP_NEWS_MAX_LIMIT})이라 나머지는 받을 수 없다 — 더 좁은 검색어나 gl/hl 로 재조회할 것`
                : `이 엔진에는 페이지 인자가 없으므로 더 필요하면 limit 을 올려 재호출할 것(상한 ${SERP_NEWS_MAX_LIMIT})`),
            news_results: newsResults,
        }), null, 1),
        isError: false,
    };
}
/** naver 엔진의 period 허용값 (공식 문서 + 실측 — 오값은 400 "Invalid format") */
export const SERP_NAVER_PERIODS = ['1h', '1d', '1w', '1m', '3m', '6m', '1y'];
/**
 * naver 엔진의 sort_by 는 where 에 따라 값 체계가 다르다 (공식 문서 + 실측):
 *   where=news → 0=관련도(기본) · 1=최신 · 2=오래된순
 *   그 외      → r=관련도(기본) · dd=최신
 * 잘못된 값은 에러가 아니라 **조용히 무시**되므로, 최신순으로 정렬됐다고 믿고
 * 시효성 값을 뽑으면 오래된 기사를 최신으로 인용하게 된다.
 *
 * oldest 는 news 전용이다 — 다른 where 에 대응값이 없어 호출 전에 거절한다.
 */
function naverSortValue(where, sort) {
    if (!sort)
        return undefined;
    if (where === 'news')
        return sort === 'latest' ? '1' : sort === 'oldest' ? '2' : '0';
    return sort === 'latest' ? 'dd' : 'r';
}
/**
 * serp_naver_search.limit 의 스키마 상한 — handlers.ts 와 같은 값이어야 한다.
 *
 * 한 번에 오는 건수는 where 마다 다르고(실측 2026-08-11 "전기차 보조금":
 * web 15 · news 10 · video 68 · image 48) 검색어에 따라 흔들리므로 상수로 두지
 * 않는다 — 잘림 판단은 sliceNote 가 **이번 응답의 실제 건수**로 한다. 상수를
 * 근거로 대면 응답과 모순되는 고지문이 만들어진다(실제로 만들어졌다).
 */
export const SERP_NAVER_MAX_LIMIT = 50;
/**
 * naver 엔진의 페이지 보폭 — **한 번에 오는 건수와 반드시 같아야 한다**.
 *
 * 어긋나면 조용히 겹치거나 빠진다. image 는 `num` 으로 청크를 이 값에 맞출 수
 * 있어 그렇게 하고(미전송 시 엔진 기본값 50이 걸려 48건이 온다 — 실측), 나머지
 * where 는 청크가 고정이라 그 값을 보폭으로 쓴다 (실측 2026-08-11: web 15).
 */
const NAVER_STRIDE = {
    web: 15,
    news: 10,
    // video 는 num 이 안 먹어 청크(68)를 줄일 수 없다 — 네이버 자체 pagination 이
    // 제시하는 다음 오프셋(start=49)에 맞춰 보폭 48 을 쓴다. 청크보다 20 작아
    // 페이지 경계에서 겹치는 구간이 남지만, 보폭을 10 으로 두면 40건이 겹친다.
    video: 48,
    image: 10,
};
/**
 * naver 엔진의 `start` 오프셋 — where 마다 보폭이 다르다 (공식 문서 + 실측).
 *
 *   web  : start = (page-1)*15 + 1   (문서 공식 page*15-29 와 같은 값, page≥2 에서)
 *   그 외 : start = (page-1)*10 + 1
 *
 * 문서 공식을 그대로 쓰면 page=2 가 start=1 이 되어 1페이지와 겹친다 — SerpApi
 * 자신의 pagination 도 page=2 를 건너뛴다. 여기서는 보폭을 일정하게 잡아
 * page 가 어느 where 에서나 "다음 묶음"을 뜻하게 만든다.
 */
function naverStart(where, page) {
    if (!page || page < 2)
        return undefined;
    return (page - 1) * NAVER_STRIDE[where] + 1;
}
export async function naverSearch(input) {
    // limit 을 보폭보다 크게 주면 페이지 경계에서 그 차이만큼 겹친다 — video 는
    // 청크 68 에 보폭 48 이라 limit=50 이면 2건씩 밀려 10건이 중복됐다(실측).
    // 보폭으로 클램프하면 페이지가 정확히 이어지고, 넘친 만큼은 다음 page 에서
    // 다시 오므로 잃는 결과가 없다.
    const requested = input.limit ?? 10;
    const where = input.where ?? 'web';
    const max = Math.min(requested, NAVER_STRIDE[where]);
    if (input.sort === 'oldest' && where !== 'news') {
        return err(`sort=oldest 는 where=news 전용이다 (현재 where=${where}) — 다른 검색 유형에는 대응 정렬값이 없다.`);
    }
    const { result, json } = await callSerpApi({
        engine: 'naver',
        query: input.query,
        where,
        // SerpApi 의 편의 인자 `page` 를 쓰면 **where=web 에서 2페이지가 무동작**이다.
        // 공식 문서가 web 에만 `start = page*15 - 29` 를 쓰는데, page=2 는 1 이 되어
        // page=1 과 같은 오프셋을 가리킨다 (실측 2026-08-11: 둘 다 start=1, 링크
        // 15/15 중복. page=1 응답의 serpapi_pagination.next 도 page=2 를 건너뛰고
        // page=3&start=16 을 가리킨다). start 를 직접 계산해 이 함정을 피한다.
        start: naverStart(where, input.page),
        sort_by: naverSortValue(where, input.sort),
        period: input.period,
        // **num 은 반드시 보폭과 같은 값으로 명시한다** (where=image 전용 파라미터).
        //
        // 페이지네이션의 불변식은 "한 번에 오는 건수 = 보폭"이다. 둘이 어긋나면
        // 겹치거나(청크 > 보폭) 빠진다(청크 < 보폭). 실측 2026-08-11:
        //
        //   num 미전송 → 48건 수신 (엔진 기본값 50이 걸린다). 보폭은 10 이므로
        //                page=2 가 직전 페이지 안쪽을 가리켜 38건이 중복됐다.
        //   num=10     → 10건 수신. 보폭과 일치해 페이지가 깨끗하게 이어진다.
        //
        // "안 보내면 10건이 온다"고 적었던 때가 있으나 틀렸다 — 미전송은 기본값
        // 적용이지 비활성화가 아니다. 과금은 어느 쪽이든 검색 1회이므로 한 번에
        // 많이 받을 이유도 없다. 더 필요하면 page 를 넘긴다.
        num: where === 'image' ? NAVER_STRIDE.image : undefined,
    });
    if (result)
        return result;
    const p = json;
    /**
     * 잘렸을 때 더 가져오는 방법 — where 마다 다르다.
     *
     * **page 보폭이 한 번에 오는 건수보다 작다**(실측 2026-08-11: video 는 68건이
     * 오는데 보폭 48, web 은 15건에 보폭 15). 즉 잘린 구간은 "영영 못 본다"가
     * 아니라 대개 다음 page 가 겹쳐서 가져온다 — 한때 그렇게 단정했으나 틀렸고,
     * 그 문구는 쓸데없는 재조회로 크레딧을 태웠다.
     *
     * limit 을 올릴 여지가 있으면 그쪽이 싸다(호출 1회). 상한에 이미 닿았으면
     * page 를 넘기라고 안내한다.
     */
    // video 는 네이버가 page 마다 결과를 재배치해 경계에서 일부가 겹친다
    // (실측: 보폭 48 로 맞춰도 page1↔2 에 10건 중복. 페이지 내부는 고유 48/48 이고
    // 경계도 이어지므로 우리 보폭 계산 문제가 아니라 엔진 특성이다). stateless 라
    // 서버가 직전 페이지를 기억할 수 없으니, 없앨 수 없는 사실을 알려만 준다.
    const overlapWarn = where === 'video' ? ' (이 검색 유형은 page 경계에서 일부가 겹쳐 오니 링크로 중복을 걸러낼 것)' : '';
    const moreHint = (max < requested
        ? `요청한 limit=${requested} 는 where=${where} 의 페이지 크기(${NAVER_STRIDE[where]})를 넘어 ${max} 로 줄였다 — 더 받으려면 page 를 1씩 올릴 것`
        : `page 를 1씩 올리면 이어지는 구간을 받을 수 있다`) + overlapWarn;
    // 이미지·비디오는 결과 필드 자체가 다르다 — 공통 슬리밍으로 뭉개면
    // 원본 URL·해상도·재생시간이 사라져 소재 선별에 못 쓴다.
    if (where === 'image') {
        // 문서는 inline_images_results 라고 적지만 실제 응답 키는 images_results 다
        // (실측 2026-08-11 — 문서의 naver-images-api 예시도 images_results 로 나온다).
        const rawImages = p.images_results ?? p.inline_images_results ?? [];
        const images = rawImages.slice(0, max).map((r) => compact({
            title: r.title,
            imageUrl: r.original,
            thumbnail: r.thumbnail,
            width: r.width,
            height: r.height,
            source: r.source,
            where: r.where,
            link: r.link,
        }));
        if (images.length === 0)
            return emptyResult();
        return {
            text: JSON.stringify(compact({ query: input.query, where, note: sliceNote(rawImages.length, max, moreHint), images }), null, 1),
            isError: false,
        };
    }
    if (where === 'video') {
        // 실측 2026-08-11: 응답 키는 문서의 inline_videos_results 가 아니라 video_results 다
        const rawVideos = p.video_results ?? p.inline_videos_results ?? [];
        const videos = rawVideos.slice(0, max).map((r) => compact({
            position: r.position,
            title: stripA11yLabel(r.title),
            link: r.link,
            duration: r.duration,
            source: stripA11yLabel(r.origin),
            channel: stripA11yLabel(typeof r.channel === 'object' ? r.channel?.name : r.channel),
            date: r.publish_date,
            // 조회수 — 스킬이 이 툴을 "조회 흐름 파악"에 쓰라고 안내하므로 필수다.
            // 원본은 "조회수 1,118" 같은 표시 문자열로 온다
            views: r.views,
            thumbnail: r.thumbnail,
        }));
        if (videos.length === 0)
            return emptyResult();
        return {
            text: JSON.stringify(compact({ query: input.query, where, note: sliceNote(rawVideos.length, max, moreHint), videos }), null, 1),
            isError: false,
        };
    }
    const slimItems = (items) => (items ?? []).slice(0, max).map((r) => {
        // where=news 는 날짜·언론사를 최상위가 아니라 news_info 하위에 중첩해서 준다
        // (실측 2026-08-11: news_info.news_date "2시간 전" / news_info.press_name "이데일리").
        // 최상위만 보던 때는 뉴스 결과에서 date·source 가 통째로 사라졌다 — 시효성
        // 검증이 이 툴의 존재 이유인데 정렬·기간 필터가 걸렸는지 확인할 길이 없었다.
        const info = (r.news_info ?? {});
        return compact({
            position: r.position,
            title: r.title,
            link: r.link,
            snippet: r.snippet ?? r.description,
            source: (typeof r.source === 'object' ? r.source?.name : r.source) ??
                info.press_name ??
                info.name ??
                r.press_name,
            date: r.date ?? r.published_date ?? info.news_date ?? info.date,
        });
    });
    // where 에 따라 결과 배열의 **키 이름이 다르다** (실측 2026-07-29):
    //   where=web      → organic_results   (SerpApi 문서는 web_results 라고 적지만 실제는 이쪽)
    //   where=news     → news_results
    //   where=nexearch → web_results (+ ads/inline_images…)
    // web_results 만 보던 때는 기본 경로(where=web)가 매번 "결과 없음"을 반환했고,
    // 그게 진짜 빈 결과와 구분되지 않아 모델이 검색을 포기했다. 셋 다 확인한다.
    const raw = p.organic_results ?? p.web_results ?? p.news_results ?? [];
    const items = slimItems(raw);
    if (items.length === 0)
        return emptyResult();
    return {
        text: JSON.stringify(compact({
            query: input.query,
            where,
            note: sliceNote(raw.length, max, moreHint),
            results: items,
        }), null, 1),
        isError: false,
    };
}
// ── 이미지 검색 (engine=google_images) ────────────────────────────
/**
 * Google 이미지 검색의 필터 파라미터 (공식 문서 + 실측 2026-08-11).
 *
 * SerpApi 는 이 필터들을 tbs 조립 없이 **전용 파라미터**로 받는다 — tbs 를 직접
 * 만들면 서로 덮어써서 조용히 무시되므로 전용 쪽만 쓴다. 특히 종횡비는 예전
 * tbs=iar 이 구글에서 중단돼 imgar 로 바뀌었다.
 */
/** google_images 의 ijn 한 칸 = 100건 (공식 문서 + 실측) */
const GOOGLE_IMAGES_PAGE_SIZE = 100;
/** serp_image_search.limit 의 스키마 상한 — handlers.ts 와 같은 값이어야 한다 */
export const SERP_IMAGE_MAX_LIMIT = 50;
export const IMAGE_SIZES = ['large', 'medium', 'icon', '2mp', '4mp', '8mp', '15mp'];
export const IMAGE_ASPECTS = ['square', 'tall', 'wide', 'panoramic'];
export const IMAGE_TYPES = ['photo', 'clipart', 'lineart', 'animated', 'face'];
export const IMAGE_LICENSES = ['free', 'commercial', 'modify', 'modify_commercial', 'creative_commons'];
const IMGSZ = {
    large: 'l',
    medium: 'm',
    icon: 'i',
    '2mp': '2mp',
    '4mp': '4mp',
    '8mp': '8mp',
    '15mp': '15mp',
};
const IMGAR = { square: 's', tall: 't', wide: 'w', panoramic: 'xw' };
/** 라이선스 코드 — 저작권 안전한 소재만 뽑을 때 fmc(수정·상업 이용 가능)가 가장 좁다 */
const LICENSES = {
    free: 'f',
    commercial: 'fc',
    modify: 'fm',
    modify_commercial: 'fmc',
    creative_commons: 'cl',
};
export async function imageSearch(input) {
    const max = input.limit ?? 20;
    const { result, json } = await callSerpApi({
        engine: 'google_images',
        q: input.query,
        gl: input.gl,
        hl: input.hl,
        // 이 엔진은 num 이 없다 — 한 번에 100건을 주고 페이지는 ijn(0부터)으로 넘긴다.
        // 반환 개수는 서버 슬라이스로 줄이며, 과금은 어느 쪽이든 검색 1회다.
        ijn: input.page && input.page > 1 ? input.page - 1 : undefined,
        imgsz: input.size ? IMGSZ[input.size] : undefined,
        imgar: input.aspect ? IMGAR[input.aspect] : undefined,
        image_type: input.imageType,
        licenses: input.license ? LICENSES[input.license] : undefined,
        image_color: input.color,
        safe: input.safe === false ? 'off' : 'active',
    });
    if (result)
        return result;
    const p = json;
    const rawImages = p.images_results ?? [];
    // 이 엔진의 position 은 **이미 전역**이다 (실측 2026-08-11: ijn=1 → 101~200).
    // webSearch 는 반대로 페이지마다 1부터 다시 시작하므로 거기서만 오프셋을 더한다
    // — 두 엔진의 계약이 정반대라 같은 공식을 복사하면 이중 가산이 된다.
    const images = rawImages.slice(0, max).map((r, i) => compact({
        position: typeof r.position === 'number' ? r.position : i + 1,
        title: r.title,
        imageUrl: r.original,
        thumbnail: r.thumbnail,
        width: r.original_width,
        height: r.original_height,
        source: r.source,
        link: r.link,
        // 라이선스 필터를 걸었을 때만 실려 오는 필드 — 상업 이용 판단 근거가 된다
        licenseUrl: r.license_details_url,
    }));
    if (images.length === 0)
        return emptyResult();
    return {
        text: JSON.stringify(compact({
            query: input.query,
            note: sliceNote(rawImages.length, max, `이 엔진은 한 번에 ${GOOGLE_IMAGES_PAGE_SIZE}건을 주는데 limit 상한이 ${SERP_IMAGE_MAX_LIMIT} 라 그 이상은 받을 수 없다. page 한 칸이 ${GOOGLE_IMAGES_PAGE_SIZE}건이라 잘린 구간은 page 로도 닿지 않는다 — 필터(size·aspect·license)로 좁혀 재조회할 것`),
            images,
            suggested_searches: (p.suggested_searches ?? []).slice(0, 6).map((r) => r.name ?? r.q).filter(Boolean),
        }), null, 1),
        isError: false,
    };
}
