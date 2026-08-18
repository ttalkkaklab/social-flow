/**
 * SNS 이슈 스카우트 — 스레드·X·인스타그램에서 지금 무엇이 오가는지를 SerpApi
 * 구글 검색(`site:` 연산자)으로 훑는다.
 *
 * 유튜브 스카우트와 잣대가 다르다. 유튜브는 채널 중앙값 대비 배수로 "검증된
 * 아웃라이어"를 고르지만, 세 SNS 는 우리가 가진 API 로 남의 글 참여량을 못 받는다
 * (스레드 키워드 검색은 고급 액세스 전엔 자기 글만, 인스타 로그인 API 엔 공개
 * 검색이 없고, X 는 종량제 별도 계정). 그래서 이 툴이 주는 것은 **언급 목록**이다 —
 * 구글이 인덱싱한 게시물을 최근 구간으로 모아, 여러 글·여러 플랫폼에 같이 나오는
 * 주제어를 빈도로 세운다. 좋아요·조회 수는 없고 순서도 구글 관련도순이라, 결과를
 * 유튜브 배수 표와 같은 칸에 섞지 않는다.
 *
 * 곁들여 Google Trends 급상승 검색어를 붙여 "지금 뜨는 것"과 시드가 겹치는지 표시한다.
 */
import { DEFAULT_TRENDING_HOURS, fetchGoogleOrganic, fetchTrendingNow, GOOGLE_PAGE_SIZE, } from './serp-client.js';
import { STOP, tokenizeTitle } from './youtube-topic-scout.js';
export const SNS_SCOUT_PLATFORMS = ['threads', 'x', 'instagram'];
export const SNS_SCOUT_RECENCIES = ['day', 'week', 'month'];
export const DEFAULT_SNS_RECENCY = 'week';
export const DEFAULT_SNS_GL = 'kr';
export const DEFAULT_SNS_HL = 'ko';
export const DEFAULT_SNS_KEYWORD_LIMIT = 15;
export const DEFAULT_SNS_TRENDING_LIMIT = 20;
export const MAX_SNS_QUERIES = 4;
export const MAX_SNS_PAGES_PER_QUERY = 2;
/** 응답에 싣는 게시물 상한 — 3플랫폼 × 4시드 × 2페이지면 240건까지 올 수 있다 */
export const SNS_POST_CAP = 90;
const SNIPPET_CAP = 200;
const EVIDENCE_CAP = 3;
const UNIGRAM_WEIGHT = 0.5;
/** 이 길이 이상 스니펫이 글자 그대로 같으면 같은 글(재게시·복붙 홍보)로 본다 */
const DUP_SNIPPET_MIN = 60;
const RETRY_RE = /timed out|HTTP 5\d\d/;
/** 구글 `site:` 에 넣는 도메인. 스레드는 2025 년에 threads.net → threads.com 으로 옮겼다 */
export const SNS_SITE = {
    threads: 'threads.com',
    x: 'x.com',
    instagram: 'instagram.com',
};
function fail(status, message) {
    return { ok: false, status, body: message };
}
function okJson(payload) {
    return { ok: true, status: 200, body: JSON.stringify(payload) };
}
// ── URL 정규화 — 같은 글이 슬러그·미디어 경로로 여러 번 오는 것을 하나로 ──
const THREADS_POST_RE = /^https?:\/\/(?:www\.)?threads\.(?:com|net)\/@([^/?#]+)\/post\/([A-Za-z0-9_-]+)/i;
const X_POST_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i;
const IG_POST_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:([^/?#]+)\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
/**
 * 게시물 URL 이면 정규 URL 과 작성자를, 프로필·태그·탐색 페이지면 null 을 돌려준다.
 * 구글 결과에는 `/@user`(프로필)·`/post/<code>/media`·`/post/<code>/<슬러그>`·
 * `/status/<id>/photo/1` 이 섞여 오는데, 전부 한 글이거나 글이 아니다.
 */
export function canonicalPost(platform, link) {
    if (platform === 'threads') {
        const m = THREADS_POST_RE.exec(link);
        if (!m)
            return null;
        return { url: `https://www.threads.com/@${m[1]}/post/${m[2]}`, author: m[1] };
    }
    if (platform === 'x') {
        const m = X_POST_RE.exec(link);
        if (!m)
            return null;
        // x.com/i/status/<id> 는 작성자 없는 짧은 주소다
        return { url: `https://x.com/${m[1]}/status/${m[2]}`, author: m[1] === 'i' ? null : m[1] };
    }
    const m = IG_POST_RE.exec(link);
    if (!m)
        return null;
    const kind = m[2].toLowerCase() === 'reels' ? 'reel' : m[2].toLowerCase();
    return { url: `https://www.instagram.com/${kind}/${m[3]}/`, author: m[1] ?? null };
}
/** 구글 source 필드("X · ffreedomkr" · "Instagram · jeong_creator")에서 작성자를 뽑는다 */
export function authorFromSource(source) {
    if (!source)
        return null;
    const parts = source.split('·').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2)
        return null;
    const tail = parts[parts.length - 1];
    return /^(x|threads|instagram|twitter)$/i.test(tail) ? null : tail;
}
// ── 토큰 — 유튜브 스카우트의 토크나이저에 한국어 조사 떼기를 얹는다 ──
/**
 * SNS 본문은 제목과 달리 산문이라 "자동화를·자동화는·자동화가" 가 따로 세어진다.
 * 흔한 조사만 어절 끝에서 떼되, 남는 어간이 2자 미만이면 손대지 않고, 단음절 "이" 는
 * 고양이·어린이처럼 명사 끝에 흔해 4자 이상에서만 뗀다.
 *
 * 그래도 워크플로→워크플, 전문가→전문 같은 오절단이 남아서 **떼는 건 어간이 이번
 * 묶음 어딘가에 홀로 나올 때만** 한다(normalizeTokens 의 vocab). "자동화" 가 다른
 * 글에 있으면 "자동화를" 은 거기 합쳐지고, "워크플" 은 어디에도 없으니 "워크플로" 는
 * 그대로다. 목적은 같은 낱말의 조사 변형을 한 칸에 모으는 것뿐이다.
 */
const KO_MULTI_SUFFIX = /(에서는|에서도|으로는|으로도|에게는|까지는|부터는|에서|으로|에게|까지|부터|보다|처럼|에는|에도)$/;
const KO_SINGLE_SUFFIX = /[가은는을를의에로도와과]$/;
const KO_I_SUFFIX = /이$/;
const SNS_STOP = new Set([
    'instagram',
    'threads',
    'twitter',
    'x',
    'com',
    'www',
    'http',
    'https',
    'reel',
    'reels',
    'post',
    'status',
    'on',
    'at',
    'by',
    'from',
    'this',
    'that',
    'it',
    'be',
    'are',
    'was',
    'have',
    'has',
    'not',
    '있는',
    '없는',
    '있다',
    '없다',
    '하고',
    '해서',
    '하면',
    '해요',
    '합니다',
    '입니다',
    '있어요',
    '같아요',
    '거예요',
    '거든요',
    '때문에',
    '그리고',
    '하지만',
    '그런데',
    '그래서',
    '근데',
    '오늘',
    '요즘',
    '지금',
    '이번',
    '다들',
    '너무',
    '정말',
    '진짜',
    '완전',
    '많이',
    '계속',
    '이제',
    '아직',
    '먼저',
    '바로',
    '다시',
    '한번',
    '분들',
    '님들',
    '사람',
    '사람들',
    '내가',
    '제가',
    '우리',
    '저는',
    '나는',
    '새로운',
    '어려운',
    '쉬운',
    '좋은',
    '많은',
    '다른',
    '같은',
    '이런',
    '저런',
    '그런',
    '어떤',
    '모든',
    '여러',
    '대한',
    '위한',
    '통해',
    '통한',
    '대해',
    '관련',
    '것들',
    '아니라',
    '아니고',
    '아닌',
    '아니면',
    '이게',
    '그게',
    '저게',
    '하나',
    '직접',
    '전체',
    '기본',
    '있게',
    '없게',
    '되게',
    '만들어',
    '만든',
    '만들',
    '만들고',
    '쓰고',
    '쓰는',
    '쓰면',
    '써서',
    '해도',
    '해야',
    '하면서',
    '이렇게',
    '그렇게',
    '어떻게',
    '무엇',
    '누구',
    '언제',
    '어디',
    '여기',
    '거기',
    '되는',
    '되면',
    '된다',
    '됩니다',
    '한다',
    '했다',
    '있고',
    '없고',
    '그럼',
    '또한',
    '물론',
    '결국',
    '사실',
    '대부분',
    '거의',
    '항상',
    '보통',
    '특히',
    '정도',
    '경우',
    '대신',
    '위해',
    '때문',
    '같이',
    '함께',
    '또는',
    '혹은',
    '이후',
    '이전',
    '전에',
    '후에',
    '동안',
    '하루',
    '매일',
    '올해',
    '작년',
    '이상',
    '이하',
    '미만',
    '조금',
    '약간',
    '엄청',
]);
export function stripKoParticle(token) {
    if (!/[가-힣]$/.test(token))
        return token;
    const multi = KO_MULTI_SUFFIX.exec(token);
    if (multi && token.length - multi[1].length >= 2)
        return token.slice(0, -multi[1].length);
    if (KO_I_SUFFIX.test(token) && token.length >= 4)
        return token.slice(0, -1);
    if (KO_SINGLE_SUFFIX.test(token) && token.length >= 3)
        return token.slice(0, -1);
    return token;
}
function keepToken(token) {
    return token.length >= 2 && !STOP.has(token) && !SNS_STOP.has(token) && !/^\d+$/.test(token);
}
/** SNS 본문(제목+스니펫)을 날 토큰으로 — 소문자·기호 제거·불용어. 조사는 아직 안 뗀다 */
export function tokenizeSnsText(text) {
    return tokenizeTitle(text).filter(keepToken);
}
/**
 * 날 토큰의 조사를 뗀다 — 어간이 vocab(이번 묶음의 날 토큰 전체)에 있을 때만.
 * 뗀 뒤 불용어가 되면("이유는"→"이유") 버린다.
 */
export function normalizeTokens(tokens, vocab) {
    const out = [];
    for (const raw of tokens) {
        const stem = stripKoParticle(raw);
        const token = stem !== raw && vocab.has(stem) ? stem : raw;
        if (keepToken(token))
            out.push(token);
    }
    return out;
}
/** 1~3그램 구. 한 글 안 중복은 한 번만 — 글 수를 셀 때 같은 글이 두 번 잡히지 않게 */
export function phrasesFromTokens(tokens) {
    const phrases = new Set();
    for (let n = 1; n <= 3; n++) {
        for (let i = 0; i <= tokens.length - n; i++) {
            phrases.add(tokens.slice(i, i + n).join(' '));
        }
    }
    return [...phrases];
}
/**
 * 게시물 묶음에서 주제어를 세운다.
 *
 * 점수 = 언급 글 수 × (1 + 0.25 × (플랫폼 수 − 1)), 낱말 하나짜리는 × 0.5.
 * 참여량이 없는 경로라 "여러 글이 같이 말하는가"와 "여러 플랫폼에 동시에
 * 뜨는가"만 신호로 쓴다. 시드 토큰만으로 된 구(검색어 그 자체)는 모든 글에 있어
 * 정보가 없으니 뺀다. 두 글 이상(낱말 하나짜리 구는 세 글 이상)에서 나온 구만 살린다.
 */
export function scoreSnsKeywords(posts, queries, limit) {
    const rawByPost = posts.map((post) => tokenizeSnsText(`${post.title} ${post.snippet}`));
    const rawSeeds = queries.flatMap((q) => tokenizeSnsText(q));
    const vocab = new Set([...rawByPost.flat(), ...rawSeeds]);
    const seedTokens = new Set(normalizeTokens(rawSeeds, vocab));
    const byPhrase = new Map();
    posts.forEach((post, index) => {
        const tokens = normalizeTokens(rawByPost[index], vocab);
        for (const phrase of phrasesFromTokens(tokens)) {
            const words = phrase.split(' ');
            if (words.every((w) => seedTokens.has(w)))
                continue;
            const cur = byPhrase.get(phrase) ?? { urls: new Set(), platforms: new Set(), evidence: [] };
            if (!cur.urls.has(post.url)) {
                cur.urls.add(post.url);
                cur.platforms.add(post.platform);
                if (cur.evidence.length < EVIDENCE_CAP) {
                    cur.evidence.push({ platform: post.platform, url: post.url, title: post.title });
                }
            }
            byPhrase.set(phrase, cur);
        }
    });
    const ranked = [...byPhrase.entries()]
        .map(([phrase, v]) => {
        const postCount = v.urls.size;
        const platformCount = v.platforms.size;
        // 낱말 하나짜리 구는 어디에나 있어 점수를 반으로 — 두 낱말 이상 구가 목록에 오르게
        const weight = phrase.includes(' ') ? 1 : UNIGRAM_WEIGHT;
        return {
            phrase,
            score: Math.round(postCount * weight * (1 + 0.25 * (platformCount - 1)) * 10) / 10,
            postCount,
            platformCount,
            platforms: SNS_SCOUT_PLATFORMS.filter((p) => v.platforms.has(p)),
            evidence: v.evidence,
        };
    })
        .filter((row) => (row.phrase.includes(' ') ? row.postCount >= 2 : row.postCount >= 3))
        .sort((a, b) => b.score - a.score ||
        b.phrase.split(' ').length - a.phrase.split(' ').length ||
        b.postCount - a.postCount ||
        a.phrase.localeCompare(b.phrase));
    // 이미 고른 긴 구의 부분 문자열은 뺀다 — "클로드 코드"를 골랐으면 "클로드"는 중복이다
    const covered = (longer, shorter) => shorter.includes(' ') ? longer.includes(shorter) : longer.split(' ').includes(shorter);
    const kept = [];
    for (const row of ranked) {
        if (kept.some((k) => k.phrase !== row.phrase && covered(k.phrase, row.phrase)))
            continue;
        kept.push(row);
        if (kept.length >= limit)
            break;
    }
    return kept;
}
function collectQueries(input) {
    const seen = new Set();
    const out = [];
    for (const q of [input.query, ...(input.extraQueries ?? [])]) {
        const query = (q ?? '').trim();
        if (!query)
            continue;
        const key = query.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(query);
        if (out.length >= MAX_SNS_QUERIES)
            break;
    }
    return out;
}
function hitToPost(platform, hit, query) {
    const canonical = canonicalPost(platform, hit.link);
    if (!canonical)
        return null;
    return {
        platform,
        url: canonical.url,
        author: canonical.author ?? authorFromSource(hit.source),
        title: hit.title.replace(/\s+/g, ' ').trim(),
        snippet: hit.snippet.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CAP),
        date: hit.date,
        matchedQueries: [query],
    };
}
function markSeedMatches(items, seedTokens) {
    return items.map((item) => {
        const hay = `${item.query} ${item.breakdown.join(' ')}`.toLowerCase();
        const matchesSeed = [...seedTokens].some((t) => t.length >= 2 && hay.includes(t));
        return { ...item, matchesSeed };
    });
}
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
/**
 * SNS 이슈를 스카우트한다. 성공 시 JSON 본문, 실패 시 안내가 실린 ApiResult.
 * 검색은 플랫폼 × 시드 × 페이지만큼 순차로 돈다(SerpApi 크레딧 = 그 횟수 + 급상승 1).
 */
export async function snsIssueScout(input) {
    const queries = collectQueries(input);
    if (queries.length === 0)
        return fail(400, 'query 가 비어 있다 — 채널 주제 영역에서 뽑은 검색어를 넣는다.');
    const platforms = (input.platforms && input.platforms.length > 0 ? input.platforms : [...SNS_SCOUT_PLATFORMS]).filter((p, i, arr) => arr.indexOf(p) === i);
    const recency = input.recency ?? DEFAULT_SNS_RECENCY;
    const gl = (input.gl ?? DEFAULT_SNS_GL).toLowerCase();
    const hl = input.hl ?? DEFAULT_SNS_HL;
    const pages = clamp(Math.floor(input.pagesPerQuery ?? 1), 1, MAX_SNS_PAGES_PER_QUERY);
    const limit = clamp(Math.floor(input.limit ?? DEFAULT_SNS_KEYWORD_LIMIT), 3, 30);
    const includeTrending = input.includeTrending ?? true;
    const errors = [];
    const byUrl = new Map();
    const bySnippet = new Map();
    let searches = 0;
    let rawHits = 0;
    let duplicates = 0;
    for (const platform of platforms) {
        for (const query of queries) {
            for (let page = 1; page <= pages; page++) {
                searches += 1;
                const params = { query: `site:${SNS_SITE[platform]} ${query}`, gl, hl, page, recency };
                let { error, hits } = await fetchGoogleOrganic(params);
                // 타임아웃·5xx 는 한 번 더 — 같은 검색은 SerpApi 캐시가 받아 크레딧이 안 든다
                if (error && RETRY_RE.test(error.text)) {
                    searches += 1;
                    ({ error, hits } = await fetchGoogleOrganic(params));
                }
                if (error) {
                    errors.push(`${platform} "${query}" p${page}: ${error.text}`);
                    // 키·쿼터 오류는 다음 검색도 같은 결과다 — 크레딧을 더 태우지 않는다
                    if (/401|429/.test(error.text))
                        return fail(/401/.test(error.text) ? 401 : 429, error.text);
                    break;
                }
                rawHits += hits.length;
                for (const hit of hits) {
                    const post = hitToPost(platform, hit, query);
                    if (!post)
                        continue;
                    const cur = byUrl.get(post.url);
                    if (cur) {
                        if (!cur.matchedQueries.includes(query))
                            cur.matchedQueries.push(query);
                        if (!cur.date && post.date)
                            cur.date = post.date;
                        if (!cur.author && post.author)
                            cur.author = post.author;
                        continue;
                    }
                    // 같은 문장을 그대로 다시 올린 글(모집 광고 재게시 등)은 하나로 — 안 그러면
                    // 그 글의 모든 구가 "두 글에서 나왔다"로 올라와 주제어 목록을 차지한다
                    if (post.snippet.length >= DUP_SNIPPET_MIN) {
                        const twin = bySnippet.get(post.snippet);
                        if (twin && twin !== post.url) {
                            duplicates += 1;
                            const first = byUrl.get(twin);
                            if (first && !first.matchedQueries.includes(query))
                                first.matchedQueries.push(query);
                            continue;
                        }
                        bySnippet.set(post.snippet, post.url);
                    }
                    byUrl.set(post.url, post);
                }
                // 한 페이지가 덜 찼으면 다음 페이지는 비어 있다
                if (hits.length < GOOGLE_PAGE_SIZE)
                    break;
            }
        }
    }
    const posts = [...byUrl.values()];
    const keywords = scoreSnsKeywords(posts, queries, limit);
    const seedTokens = new Set(queries.flatMap((q) => tokenizeSnsText(q)));
    let trending;
    let credits = searches;
    if (includeTrending) {
        credits += 1;
        const hours = input.trendingHours ?? DEFAULT_TRENDING_HOURS;
        const { error, data } = await fetchTrendingNow({ geo: gl, hours, hl, limit: DEFAULT_SNS_TRENDING_LIMIT });
        if (error) {
            errors.push(`trending ${gl.toUpperCase()}: ${error.text}`);
        }
        else if (data) {
            const related = new Set([...seedTokens, ...keywords.slice(0, 10).flatMap((k) => k.phrase.split(' '))]);
            trending = { geo: data.geo, hours: data.hours, count: data.count, items: markSeedMatches(data.trends, related) };
        }
    }
    if (posts.length === 0 && errors.length > 0 && !trending) {
        return fail(502, `SNS 스카우트 실패 — 검색이 모두 실패했다:\n${errors.join('\n')}`);
    }
    const platformOrder = new Map(platforms.map((p, i) => [p, i]));
    const sortedPosts = posts.sort((a, b) => (platformOrder.get(a.platform) ?? 0) - (platformOrder.get(b.platform) ?? 0) || a.url.localeCompare(b.url));
    return okJson({
        queries,
        platforms,
        method: {
            via: 'serpapi google site: 검색',
            recency,
            gl,
            hl,
            pagesPerQuery: pages,
            sites: Object.fromEntries(platforms.map((p) => [p, SNS_SITE[p]])),
            ranking: '구글 관련도순 — 좋아요·답글·조회 같은 참여량은 이 경로에 없다',
            scoring: '주제어 점수 = 언급 글 수 × (1 + 0.25 × (플랫폼 수 − 1)). 유튜브 스카우트의 채널 중앙값 배수와 다른 잣대라 같은 표에 섞지 말 것',
            trending: includeTrending
                ? `Google Trends 급상승 검색어(${gl.toUpperCase()}, ${input.trendingHours ?? DEFAULT_TRENDING_HOURS}시간) — 구글 검색 기준이지 SNS 참여 기준이 아니다`
                : 'off',
        },
        scanned: {
            searches,
            hits: rawHits,
            posts: posts.length,
            duplicates,
            returnedPosts: Math.min(posts.length, SNS_POST_CAP),
        },
        credits,
        keywords,
        posts: sortedPosts.slice(0, SNS_POST_CAP),
        trending,
        note: posts.length > SNS_POST_CAP
            ? `게시물 ${posts.length}건 중 ${SNS_POST_CAP}건만 실었다 — 주제어(keywords)는 전체로 셌다. 더 보려면 시드를 줄이거나 platforms 를 좁혀 다시 부를 것`
            : undefined,
        errors: errors.length > 0 ? errors : undefined,
    });
}
