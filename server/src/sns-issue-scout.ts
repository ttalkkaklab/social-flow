/**
 * SNS issue scout — sweeps what is being said right now on Threads, X, and
 * Instagram with SerpApi Google searches (the `site:` operator).
 *
 * A different yardstick from the YouTube scout. YouTube picks "verified outliers"
 * by the multiple over a channel's median, but for these three networks the APIs we
 * have can't get us engagement counts on other people's posts (Threads keyword
 * search returns only our own posts until advanced access, the Instagram Login API
 * has no public search, and X is pay-as-you-go on a separate account). So what this
 * tool hands back is a **mention list** — it gathers Google-indexed posts over a
 * recent window and counts the topic phrases that show up across several posts and
 * several platforms. There are no likes or view counts and the order is Google
 * relevance, so the result doesn't go in the same column as the YouTube multiplier
 * table.
 *
 * Alongside that it attaches Google Trends trending searches to show whether the
 * seeds overlap with "what is rising right now".
 */

import type { ApiResult } from './http.js';
import {
  DEFAULT_TRENDING_HOURS,
  fetchGoogleOrganic,
  fetchTrendingNow,
  GOOGLE_PAGE_SIZE,
  type OrganicHit,
  type TrendingItem,
  TRENDING_HOURS,
} from './serp-client.js';
import { STOP, tokenizeTitle } from './youtube-topic-scout.js';

export const SNS_SCOUT_PLATFORMS = ['threads', 'x', 'instagram'] as const;
export type SnsPlatform = (typeof SNS_SCOUT_PLATFORMS)[number];
export const SNS_SCOUT_RECENCIES = ['day', 'week', 'month'] as const;
export type SnsRecency = (typeof SNS_SCOUT_RECENCIES)[number];

export const DEFAULT_SNS_RECENCY: SnsRecency = 'week';
export const DEFAULT_SNS_GL = 'kr';
export const DEFAULT_SNS_HL = 'ko';
export const DEFAULT_SNS_KEYWORD_LIMIT = 15;
export const DEFAULT_SNS_TRENDING_LIMIT = 20;
export const MAX_SNS_QUERIES = 4;
export const MAX_SNS_PAGES_PER_QUERY = 2;
/** Cap on posts carried in the response — 3 platforms × 4 seeds × 2 pages can bring up to 240 */
export const SNS_POST_CAP = 90;
const SNIPPET_CAP = 200;
const EVIDENCE_CAP = 3;
const UNIGRAM_WEIGHT = 0.5;
/** Snippets at least this long that match character for character count as the same post (reposts, copy-pasted promos) */
const DUP_SNIPPET_MIN = 60;
const RETRY_RE = /timed out|HTTP 5\d\d/;

/** Domains fed to Google's `site:`. Threads moved from threads.net to threads.com in 2025 */
export const SNS_SITE: Record<SnsPlatform, string> = {
  threads: 'threads.com',
  x: 'x.com',
  instagram: 'instagram.com',
};

export interface SnsIssueScoutInput {
  query: string;
  extraQueries?: string[];
  platforms?: SnsPlatform[];
  recency?: SnsRecency;
  gl?: string;
  hl?: string;
  pagesPerQuery?: number;
  includeTrending?: boolean;
  trendingHours?: (typeof TRENDING_HOURS)[number];
  limit?: number;
}

export interface SnsPost {
  platform: SnsPlatform;
  url: string;
  author: string | null;
  title: string;
  snippet: string;
  date?: string;
  matchedQueries: string[];
}

export interface SnsKeyword {
  phrase: string;
  score: number;
  postCount: number;
  platformCount: number;
  platforms: SnsPlatform[];
  evidence: Array<{ platform: SnsPlatform; url: string; title: string }>;
}

export interface SnsTrendingItem extends TrendingItem {
  matchesSeed: boolean;
}

function fail(status: number, message: string): ApiResult {
  return { ok: false, status, body: message };
}

function okJson(payload: Record<string, unknown>): ApiResult {
  return { ok: true, status: 200, body: JSON.stringify(payload) };
}

// ── URL normalization — folds one post arriving several times via slug/media paths into one ──

const THREADS_POST_RE = /^https?:\/\/(?:www\.)?threads\.(?:com|net)\/@([^/?#]+)\/post\/([A-Za-z0-9_-]+)/i;
const X_POST_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i;
const IG_POST_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:([^/?#]+)\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;

/**
 * Returns the canonical URL and the author for a post URL, null for profile, tag, or
 * explore pages. Google results mix in `/@user` (profile), `/post/<code>/media`,
 * `/post/<code>/<slug>`, and `/status/<id>/photo/1` — every one of them is either the
 * same post or not a post at all.
 */
export function canonicalPost(platform: SnsPlatform, link: string): { url: string; author: string | null } | null {
  if (platform === 'threads') {
    const m = THREADS_POST_RE.exec(link);
    if (!m) return null;
    return { url: `https://www.threads.com/@${m[1]}/post/${m[2]}`, author: m[1] };
  }
  if (platform === 'x') {
    const m = X_POST_RE.exec(link);
    if (!m) return null;
    // x.com/i/status/<id> is the short form, with no author
    return { url: `https://x.com/${m[1]}/status/${m[2]}`, author: m[1] === 'i' ? null : m[1] };
  }
  const m = IG_POST_RE.exec(link);
  if (!m) return null;
  const kind = m[2].toLowerCase() === 'reels' ? 'reel' : m[2].toLowerCase();
  return { url: `https://www.instagram.com/${kind}/${m[3]}/`, author: m[1] ?? null };
}

/** Pulls the author out of Google's source field ("X · ffreedomkr" · "Instagram · jeong_creator") */
export function authorFromSource(source: string | undefined): string | null {
  if (!source) return null;
  const parts = source.split('·').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1];
  return /^(x|threads|instagram|twitter)$/i.test(tail) ? null : tail;
}

// ── Tokens — the YouTube scout's tokenizer plus Korean particle stripping ──

/**
 * SNS bodies are prose, not titles, so "자동화를 · 자동화는 · 자동화가" get counted
 * separately. Only common particles come off the end of a word; the word is left alone
 * when under 2 characters of stem would remain, and the single syllable "이" is common
 * at the end of nouns (고양이, 어린이) so it only comes off from 4 characters up.
 *
 * Even so, mis-cuts like 워크플로→워크플 and 전문가→전문 get through, so **stripping
 * happens only when the stem shows up on its own somewhere in this batch**
 * (normalizeTokens' vocab). If "자동화" is in another post, "자동화를" merges into it;
 * "워크플" is nowhere, so "워크플로" stays as it is. The only goal is to gather a
 * word's particle variants into one bucket.
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

export function stripKoParticle(token: string): string {
  if (!/[가-힣]$/.test(token)) return token;
  const multi = KO_MULTI_SUFFIX.exec(token);
  if (multi && token.length - multi[1].length >= 2) return token.slice(0, -multi[1].length);
  if (KO_I_SUFFIX.test(token) && token.length >= 4) return token.slice(0, -1);
  if (KO_SINGLE_SUFFIX.test(token) && token.length >= 3) return token.slice(0, -1);
  return token;
}

function keepToken(token: string): boolean {
  return token.length >= 2 && !STOP.has(token) && !SNS_STOP.has(token) && !/^\d+$/.test(token);
}

/** SNS body (title + snippet) to raw tokens — lowercased, symbols dropped, stop words removed. Particles come off later */
export function tokenizeSnsText(text: string): string[] {
  return tokenizeTitle(text).filter(keepToken);
}

/**
 * Strips particles off the raw tokens — only when the stem is in vocab (every raw
 * token in this batch). Drop it if stripping turns it into a stop word ("이유는"→"이유").
 */
export function normalizeTokens(tokens: string[], vocab: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of tokens) {
    const stem = stripKoParticle(raw);
    const token = stem !== raw && vocab.has(stem) ? stem : raw;
    if (keepToken(token)) out.push(token);
  }
  return out;
}

/** 1~3-gram phrases. Duplicates within one post count once — so counting posts never picks the same post twice */
export function phrasesFromTokens(tokens: string[]): string[] {
  const phrases = new Set<string>();
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      phrases.add(tokens.slice(i, i + n).join(' '));
    }
  }
  return [...phrases];
}

/**
 * Counts topic phrases over a batch of posts.
 *
 * Score = mention count × (1 + 0.25 × (platform count − 1)), single words × 0.5.
 * This lane has no engagement counts, so the only signals are "do several posts say
 * it together" and "does it surface on several platforms at once". Phrases made only
 * of seed tokens (the search term itself) sit in every post and carry no information,
 * so they come out. Only phrases from two or more posts survive — three or more for
 * single-word phrases.
 */
export function scoreSnsKeywords(posts: SnsPost[], queries: string[], limit: number): SnsKeyword[] {
  const rawByPost = posts.map((post) => tokenizeSnsText(`${post.title} ${post.snippet}`));
  const rawSeeds = queries.flatMap((q) => tokenizeSnsText(q));
  const vocab = new Set([...rawByPost.flat(), ...rawSeeds]);
  const seedTokens = new Set(normalizeTokens(rawSeeds, vocab));

  const byPhrase = new Map<
    string,
    { urls: Set<string>; platforms: Set<SnsPlatform>; evidence: SnsKeyword['evidence'] }
  >();
  posts.forEach((post, index) => {
    const tokens = normalizeTokens(rawByPost[index], vocab);
    for (const phrase of phrasesFromTokens(tokens)) {
      const words = phrase.split(' ');
      if (words.every((w) => seedTokens.has(w))) continue;
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
      // single-word phrases are everywhere, so halve the score — it lets longer phrases reach the list
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
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.phrase.split(' ').length - a.phrase.split(' ').length ||
        b.postCount - a.postCount ||
        a.phrase.localeCompare(b.phrase),
    );

  // drop substrings of longer phrases already picked — with "클로드 코드" taken, "클로드" is a duplicate
  const covered = (longer: string, shorter: string): boolean =>
    shorter.includes(' ') ? longer.includes(shorter) : longer.split(' ').includes(shorter);
  const kept: SnsKeyword[] = [];
  for (const row of ranked) {
    if (kept.some((k) => k.phrase !== row.phrase && covered(k.phrase, row.phrase))) continue;
    kept.push(row);
    if (kept.length >= limit) break;
  }
  return kept;
}

function collectQueries(input: SnsIssueScoutInput): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [input.query, ...(input.extraQueries ?? [])]) {
    const query = (q ?? '').trim();
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= MAX_SNS_QUERIES) break;
  }
  return out;
}

function hitToPost(platform: SnsPlatform, hit: OrganicHit, query: string): SnsPost | null {
  const canonical = canonicalPost(platform, hit.link);
  if (!canonical) return null;
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

function markSeedMatches(items: TrendingItem[], seedTokens: Set<string>): SnsTrendingItem[] {
  return items.map((item) => {
    const hay = `${item.query} ${item.breakdown.join(' ')}`.toLowerCase();
    const matchesSeed = [...seedTokens].some((t) => t.length >= 2 && hay.includes(t));
    return { ...item, matchesSeed };
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Scout SNS issues. On success an ApiResult with a JSON body; on failure one carrying guidance.
 * Searches run one after another, platforms × seeds × pages of them (SerpApi credits =
 * that count + 1 for trending).
 */
export async function snsIssueScout(input: SnsIssueScoutInput): Promise<ApiResult> {
  const queries = collectQueries(input);
  if (queries.length === 0) return fail(400, 'query is empty — pass a search term drawn from the channel\'s topic area.');

  const platforms = (input.platforms && input.platforms.length > 0 ? input.platforms : [...SNS_SCOUT_PLATFORMS]).filter(
    (p, i, arr) => arr.indexOf(p) === i,
  );
  const recency = input.recency ?? DEFAULT_SNS_RECENCY;
  const gl = (input.gl ?? DEFAULT_SNS_GL).toLowerCase();
  const hl = input.hl ?? DEFAULT_SNS_HL;
  const pages = clamp(Math.floor(input.pagesPerQuery ?? 1), 1, MAX_SNS_PAGES_PER_QUERY);
  const limit = clamp(Math.floor(input.limit ?? DEFAULT_SNS_KEYWORD_LIMIT), 3, 30);
  const includeTrending = input.includeTrending ?? true;

  const errors: string[] = [];
  const byUrl = new Map<string, SnsPost>();
  const bySnippet = new Map<string, string>();
  let searches = 0;
  let rawHits = 0;
  let duplicates = 0;

  for (const platform of platforms) {
    for (const query of queries) {
      for (let page = 1; page <= pages; page++) {
        searches += 1;
        const params = { query: `site:${SNS_SITE[platform]} ${query}`, gl, hl, page, recency };
        let { error, hits } = await fetchGoogleOrganic(params);
        // retry timeouts and 5xx once — SerpApi serves an identical search from cache, so it costs no credit
        if (error && RETRY_RE.test(error.text)) {
          searches += 1;
          ({ error, hits } = await fetchGoogleOrganic(params));
        }
        if (error) {
          errors.push(`${platform} "${query}" p${page}: ${error.text}`);
          // key and quota errors come back the same on the next search — don't burn more credits
          if (/401|429/.test(error.text)) return fail(/401/.test(error.text) ? 401 : 429, error.text);
          break;
        }
        rawHits += hits.length;
        for (const hit of hits) {
          const post = hitToPost(platform, hit, query);
          if (!post) continue;
          const cur = byUrl.get(post.url);
          if (cur) {
            if (!cur.matchedQueries.includes(query)) cur.matchedQueries.push(query);
            if (!cur.date && post.date) cur.date = post.date;
            if (!cur.author && post.author) cur.author = post.author;
            continue;
          }
          // posts re-uploading the same sentence verbatim (a recruiting ad reposted, say) fold
          // into one — otherwise every phrase in them climbs as "seen in two posts" and takes
          // over the topic-phrase list
          if (post.snippet.length >= DUP_SNIPPET_MIN) {
            const twin = bySnippet.get(post.snippet);
            if (twin && twin !== post.url) {
              duplicates += 1;
              const first = byUrl.get(twin);
              if (first && !first.matchedQueries.includes(query)) first.matchedQueries.push(query);
              continue;
            }
            bySnippet.set(post.snippet, post.url);
          }
          byUrl.set(post.url, post);
        }
        // a page that came back short means the next one is empty
        if (hits.length < GOOGLE_PAGE_SIZE) break;
      }
    }
  }

  const posts = [...byUrl.values()];
  const keywords = scoreSnsKeywords(posts, queries, limit);
  const seedTokens = new Set(queries.flatMap((q) => tokenizeSnsText(q)));

  let trending: { geo: string; hours: number; count: number; items: SnsTrendingItem[] } | undefined;
  let credits = searches;
  if (includeTrending) {
    credits += 1;
    const hours = input.trendingHours ?? DEFAULT_TRENDING_HOURS;
    const { error, data } = await fetchTrendingNow({ geo: gl, hours, hl, limit: DEFAULT_SNS_TRENDING_LIMIT });
    if (error) {
      errors.push(`trending ${gl.toUpperCase()}: ${error.text}`);
    } else if (data) {
      const related = new Set([...seedTokens, ...keywords.slice(0, 10).flatMap((k) => k.phrase.split(' '))]);
      trending = { geo: data.geo, hours: data.hours, count: data.count, items: markSeedMatches(data.trends, related) };
    }
  }

  if (posts.length === 0 && errors.length > 0 && !trending) {
    return fail(502, `SNS scout failed — every search failed:\n${errors.join('\n')}`);
  }

  const platformOrder = new Map(platforms.map((p, i) => [p, i]));
  const sortedPosts = posts.sort(
    (a, b) => (platformOrder.get(a.platform) ?? 0) - (platformOrder.get(b.platform) ?? 0) || a.url.localeCompare(b.url),
  );

  return okJson({
    queries,
    platforms,
    method: {
      via: 'serpapi google site: search',
      recency,
      gl,
      hl,
      pagesPerQuery: pages,
      sites: Object.fromEntries(platforms.map((p) => [p, SNS_SITE[p]])),
      ranking: 'Google relevance order — this lane carries no engagement counts such as likes, replies, or views',
      scoring:
        'Topic-phrase score = mention count × (1 + 0.25 × (platform count − 1)). A different yardstick from the YouTube scout\'s channel-median multiple, so never mix it into the same table',
      trending: includeTrending
        ? `Google Trends trending searches (${gl.toUpperCase()}, ${input.trendingHours ?? DEFAULT_TRENDING_HOURS}h) — measured on Google search, not on SNS engagement`
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
    note:
      posts.length > SNS_POST_CAP
        ? `Carried only ${SNS_POST_CAP} of ${posts.length} posts — the topic phrases (keywords) were counted over all of them. To see more, trim the seeds or narrow platforms and call again`
        : undefined,
    errors: errors.length > 0 ? errors : undefined,
  });
}
