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
export async function webSearch(input) {
    const num = input.num ?? 10;
    const { result, json } = await callSerpApi({
        engine: 'google',
        q: input.q,
        gl: input.gl,
        hl: input.hl,
        location: input.location,
        num,
        start: input.page && input.page > 1 ? (input.page - 1) * num : undefined,
        tbs: input.recency ? RECENCY_TBS[input.recency] : undefined,
    });
    if (result)
        return result;
    const p = json;
    const organicResults = (p.organic_results ?? []).slice(0, num).map((r) => compact({
        position: r.position,
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        date: r.date,
        source: r.source,
    }));
    // error 필드 없이 200 + 빈 결과가 오는 경우도 있다(강한 필터·페이지 초과 등) —
    // 빈 스켈레톤 JSON 만 돌려주면 "결과 없음"과 구분되지 않아 모델이 방향을 잃는다
    if (organicResults.length === 0 && !p.answer_box && !p.knowledge_graph) {
        return {
            text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것)',
            isError: false,
        };
    }
    const slim = compact({
        query: input.q,
        total_results: p.search_information?.total_results,
        answer_box: pick(p.answer_box, ['type', 'title', 'answer', 'snippet', 'link']),
        knowledge_graph: pick(p.knowledge_graph, ['title', 'type', 'description', 'source', 'website']),
        organic_results: organicResults,
        related_questions: (p.related_questions ?? [])
            .slice(0, 4)
            .map((r) => compact({ question: r.question, snippet: r.snippet, link: r.link })),
    });
    return { text: JSON.stringify(slim, null, 1), isError: false };
}
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
    const max = input.max_results ?? 10;
    const { result, json } = await callSerpApi({
        engine: 'google_news',
        q: input.q,
        gl: input.gl,
        hl: input.hl,
    });
    if (result)
        return result;
    const p = json;
    const newsResults = (p.news_results ?? []).slice(0, max).map((r) => compact({
        position: r.position,
        title: r.title,
        source: typeof r.source === 'object' ? r.source?.name : r.source,
        date: r.date,
        snippet: r.snippet,
        link: r.link,
    }));
    // webSearch 와 같은 이유 — error 필드 없는 200 + 빈 결과를 명시적으로 안내한다
    if (newsResults.length === 0) {
        return {
            text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것)',
            isError: false,
        };
    }
    return { text: JSON.stringify({ query: input.q, news_results: newsResults }, null, 1), isError: false };
}
/**
 * naver 엔진의 sort_by 는 where 에 따라 값 체계가 갈린다 (공식 문서):
 *   where=news → 0=관련도(기본) · 1=최신 · 2=오래된순
 *   그 외      → r=관련도(기본) · dd=최신
 * 잘못된 값은 에러가 아니라 **조용히 무시**되므로, 최신순으로 정렬됐다고 믿고
 * 시효성 값을 뽑으면 오래된 기사를 최신으로 인용하게 된다.
 */
function naverSortValue(where, sortBy) {
    if (!sortBy)
        return undefined;
    if (where === 'news')
        return sortBy === 'latest' ? '1' : '0';
    return sortBy === 'latest' ? 'dd' : 'r';
}
export async function naverSearch(input) {
    const max = input.max_results ?? 10;
    const where = input.where ?? 'web';
    const { result, json } = await callSerpApi({
        engine: 'naver',
        query: input.query,
        where,
        page: input.page,
        sort_by: naverSortValue(where, input.sort_by),
    });
    if (result)
        return result;
    const p = json;
    const slimItems = (items) => (items ?? []).slice(0, max).map((r) => compact({
        position: r.position,
        title: r.title,
        link: r.link,
        snippet: r.snippet ?? r.description,
        source: typeof r.source === 'object' ? r.source?.name : (r.source ?? r.press_name),
        date: r.date ?? r.published_date,
    }));
    // where 에 따라 결과 배열의 **키 이름이 다르다** (실측 2026-07-29):
    //   where=web      → organic_results   (SerpApi 문서는 web_results 라고 적지만 실제는 이쪽)
    //   where=news     → news_results
    //   where=nexearch → web_results (+ ads/inline_images…)
    // web_results 만 보던 때는 기본 경로(where=web)가 매번 "결과 없음"을 반환했고,
    // 그게 진짜 빈 결과와 구분되지 않아 모델이 검색을 포기했다. 셋 다 확인한다.
    const items = slimItems(p.organic_results ?? p.web_results ?? p.news_results);
    if (items.length === 0) {
        return {
            text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것)',
            isError: false,
        };
    }
    return { text: JSON.stringify({ query: input.query, where, results: items }, null, 1), isError: false };
}
