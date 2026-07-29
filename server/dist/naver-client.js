import { requireNaverKeys } from './config.js';
import { buildQuery, requestRaw } from './http.js';
/**
 * Naver Open API 검색 클라이언트 — 한국어 콘텐츠 조사의 1차 도구.
 *
 * SerpApi 의 naver 엔진(serp_naver_search)과 별개로 **네이버 공식 Open API** 를 직접
 * 호출한다 — 무료 쿼터가 크고(일 25,000회) 한국어 뉴스·블로그·카페 실사용 데이터에
 * 가장 가깝다. SerpApi 크레딧이 아깝거나 한국어 소재 리서치가 주 목적일 때 이쪽을 쓴다.
 *
 * 불변 조건 (serp-client 와 동일 철학):
 * 1. **키 마스킹** — 자격증명은 헤더로만 전달하므로 URL 유출 경로가 없지만,
 *    에러 본문에 키가 에코될 가능성에 대비해 응답을 슬리밍한다.
 * 2. **응답 슬리밍** — <b> 하이라이트 태그·HTML 엔티티를 제거하고 근거 필드만 남긴다.
 */
const NAVER_BASE = 'https://openapi.naver.com/v1/search';
const ENDPOINT_BY_TYPE = {
    news: 'news.json',
    blog: 'blog.json',
    web: 'webkr.json',
    cafe: 'cafearticle.json',
};
function err(message) {
    return { text: message, isError: true };
}
/** 네이버 검색 응답의 <b> 하이라이트·HTML 엔티티 제거 */
function stripMarkup(text) {
    return text
        .replace(/<\/?b>/gi, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;|&#39;/g, "'");
}
function compact(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null || value === '')
            continue;
        out[key] = value;
    }
    return out;
}
export async function naverSearch(input) {
    const { id, secret } = requireNaverKeys();
    const type = input.type ?? 'news';
    const display = Math.min(input.display ?? 10, 30);
    const url = `${NAVER_BASE}/${ENDPOINT_BY_TYPE[type]}${buildQuery({
        query: input.query,
        display,
        start: input.start,
        // webkr 엔드포인트는 sort 파라미터를 지원하지 않는다 — 넘기면 400
        sort: type === 'web' ? undefined : input.sort,
    })}`;
    const res = await requestRaw('get', url, {
        'X-Naver-Client-Id': id,
        'X-Naver-Client-Secret': secret,
    });
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            return err(`Naver Open API ${res.status} — NAVER_CLIENT_ID/SECRET 이 유효하지 않거나 검색 API 사용 신청이 안 된 앱이다. ` +
                '키를 교정하기 전 재시도 금지 (https://developers.naver.com/apps 에서 확인).');
        }
        if (res.status === 429) {
            return err('Naver Open API 429 — 일일 쿼터(25,000회) 소진. 이번 세션에서는 WebSearch/serp_* 로 대체할 것.');
        }
        return err(`Naver Open API HTTP ${res.status}: ${res.body.slice(0, 500)}`);
    }
    let json;
    try {
        json = JSON.parse(res.body);
    }
    catch {
        return err(`Naver Open API 응답 JSON 파싱 실패: ${res.body.slice(0, 300)}`);
    }
    const body = json;
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
        return {
            text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것)',
            isError: false,
        };
    }
    const slim = {
        query: input.query,
        type,
        total: body.total,
        items: items.map((item) => compact({
            title: stripMarkup(String(item.title ?? '')),
            link: String(item.originallink ?? item.link ?? ''),
            description: stripMarkup(String(item.description ?? '')),
            source: item.bloggername ?? item.cafename ?? undefined,
            date: item.pubDate ?? item.postdate ?? undefined,
        })),
    };
    return { text: JSON.stringify(slim, null, 1), isError: false };
}
