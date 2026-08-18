import { requireSerpApiKey } from './config.js';
import { buildQuery, requestRaw } from './http.js';

/**
 * SerpApi client — backend for the research/fact-checking tools (serp_*).
 *
 * Two invariants:
 * 1. **Key masking** — SerpApi only takes api_key as a URL query param, so on error
 *    paths (requestRaw puts the URL in timeout/unreachable bodies) we always mask
 *    it so the key can't leak into the LLM context.
 * 2. **Response slimming** — raw SERP JSON runs 20–60KB per search. We keep only
 *    the fields the LLM can cite as evidence, cutting it to 2–4KB (no raw
 *    passthrough — a deliberate exception to http.ts's raw-return philosophy).
 */

const SERPAPI_BASE = 'https://serpapi.com/search';

export interface SerpResult {
  text: string;
  isError: boolean;
}

const RECENCY_TBS: Record<string, string> = {
  hour: 'qdr:h',
  day: 'qdr:d',
  week: 'qdr:w',
  month: 'qdr:m',
  year: 'qdr:y',
};

function maskKey(text: string): string {
  return text.replace(/api_key=[^&\s"']+/g, 'api_key=***');
}

function err(message: string): SerpResult {
  return { text: message, isError: true };
}

/**
 * Response for 200 + empty results without an error field (strong filters, page
 * overrun, etc.). Returning a bare skeleton JSON is indistinguishable from
 * "no results", and the model loses its bearings.
 */
function emptyResult(): SerpResult {
  return {
    text: '(no search results — retry once with a different query, or drop claims you could not verify from the copy)',
    isError: false,
  };
}

/**
 * Strips the screen-reader labels that leak into Naver SERP scrape results.
 *
 * Measured 2026-08-11: where=video appends "새 창 열림" ("opens in a new window")
 * to title/origin/channel ("너만몰라TV새 창 열림"). Left in place, the model reads
 * it as part of the channel name and copies it into citations.
 */
function stripA11yLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/새 창 열림\s*$/, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Slice notice — when we return fewer items than the engine gave us, the response
 * says so.
 *
 * Each engine returns a fixed number of items per call, and it differs from our
 * `limit`. Stay silent and the model believes what it got is everything and stops
 * researching.
 *
 * How to recover the truncated range differs per engine, so the caller passes it
 * in as `more` — on engines whose page stride is smaller than one batch (video:
 * 68 items, stride 48) the next page overlaps into it; on engines with no page
 * param at all (google_news) limit is the only lever.
 *
 * Judge by **how many items this response actually contained**, not by a
 * constant. Engine page sizes wobble with query and timing (Google web: 5–10
 * items for the same request), so reasoning from a constant produces a notice
 * that contradicts the response.
 *
 * @param received how many items the engine gave this time
 * @param limit    how many the user asked for
 * @param more     how to fetch more — differs per tool (page vs limit)
 */
function sliceNote(received: number, limit: number, more: string): string | undefined {
  if (received <= limit) return undefined;
  return `This response contained ${received} items but limit=${limit}, so ${received - limit} were cut. ${more}`;
}

/** Drops undefined / empty-string / empty-array / empty-object fields to shrink the payload */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

function pick(obj: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const source = obj as Record<string, unknown>;
  const out = compact(Object.fromEntries(keys.map((k) => [k, source[k]])));
  return Object.keys(out).length > 0 ? out : undefined;
}

interface SerpCallOutcome {
  result?: SerpResult;
  json?: Record<string, unknown>;
}

async function callSerpApi(
  params: Record<string, string | number | boolean | undefined>,
): Promise<SerpCallOutcome> {
  const apiKey = requireSerpApiKey();
  const url = `${SERPAPI_BASE}${buildQuery({ ...params, api_key: apiKey, output: 'json' })}`;
  const res = await requestRaw('get', url, {});

  if (!res.ok) {
    if (res.status === 401) {
      return {
        result: err(
          'SerpApi 401 Unauthorized — SERPAPI_API_KEY is invalid. Do not retry before fixing the key (401/400 return the same thing on retry).',
        ),
      };
    }
    if (res.status === 429) {
      return {
        result: err(
          'SerpApi 429 — monthly quota or hourly throughput exhausted. Stop searching for this session; write from the evidence already gathered, or drop unverified claims from the copy.',
        ),
      };
    }
    return { result: err(`SerpApi HTTP ${res.status}: ${maskKey(res.body.slice(0, 500))}`) };
  }

  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return { result: err(`SerpApi response JSON parse failed: ${maskKey(res.body.slice(0, 300))}`) };
  }

  const body = json as Record<string, unknown>;
  // "No results" arrives as HTTP 200 + an error field — treat as an empty result, not a tool error
  if (typeof body.error === 'string') {
    if (/hasn'?t returned any results|no results/i.test(body.error)) {
      return {
        result: {
          text: '(no search results — retry once with a different query, or drop claims you could not verify from the copy. Searches with no results are not billed)',
          isError: false,
        },
      };
    }
    return { result: err(`SerpApi error: ${maskKey(body.error)}`) };
  }

  return { json: body };
}

// ── Per-engine search + slimming ─────────────────────────────────

export interface WebSearchInput {
  query: string;
  gl?: string;
  hl?: string;
  location?: string;
  limit?: number;
  page?: number;
  recency?: 'hour' | 'day' | 'week' | 'month' | 'year';
}

/**
 * Google result page size. `start` is a 0-based **item offset**, and pages only
 * break on multiples of this value.
 *
 * **`num` is a no-op on this engine** (measured 2026-08-11). SerpApi doesn't
 * forward it to Google — the response's `search_parameters` has no `num`, it
 * isn't on `search_metadata.google_url` either, and `serpapi_pagination.current`
 * counts start 0/10/20 as pages 1/2/3. The real page is **always 10 items**
 * regardless of the request.
 *
 * So don't tie the offset unit to `limit`. Set the offset in multiples of 20
 * for `limit=20` and page=2 points at Google page 3, wiping out page 2 (items
 * 11–20) entirely. `limit` is only a server-side slice, so the offset is always
 * in units of 10.
 *
 * (We once wrote "Google's cursor consumes the requested num" — a misreading.
 * num=20·start=20 had no duplicates because num was ignored and start=20 was
 * simply page 3; the duplicates at num=5·start=5 were because start=5 pointed
 * inside page 1.)
 */
export const GOOGLE_PAGE_SIZE = 10;

export async function webSearch(input: WebSearchInput): Promise<SerpResult> {
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
  if (result) return result;

  const p = json as Record<string, any>;
  const rawOrganic = (p.organic_results as any[]) ?? [];
  // position restarts at 1 on every page — left alone, page 2's #1 reads as the
  // same rank as page 1's #1. Adding the offset makes it a global rank, so the
  // model can spot cross-page reshuffling on its own (Google sometimes repeats
  // the same link on another page).
  const offset = input.page && input.page > 1 ? (input.page - 1) * GOOGLE_PAGE_SIZE : 0;
  const organicResults = rawOrganic.slice(0, limit).map((r, i) =>
    compact({
      position: offset + (typeof r.position === 'number' ? r.position : i + 1),
      title: r.title,
      link: r.link,
      snippet: r.snippet,
      date: r.date,
      source: r.source,
    }),
  );
  if (organicResults.length === 0 && !p.answer_box && !p.knowledge_graph) return emptyResult();
  const slim = compact({
    query: input.query,
    // total_results swings wildly between pages (measured: 462 on page 1, 122 on
    // page 2 for the same query) — not a citable number, so only on the first page
    total_results: input.page && input.page > 1 ? undefined : p.search_information?.total_results,
    note: sliceNote(
      rawOrganic.length,
      limit,
      `raising page by 1 continues from global #${offset + GOOGLE_PAGE_SIZE + 1}, skipping the range in between — to see everything, keep limit at ${GOOGLE_PAGE_SIZE} or below and step through pages in order`,
    ),
    answer_box: pick(p.answer_box, ['type', 'title', 'answer', 'snippet', 'link']),
    knowledge_graph: pick(p.knowledge_graph, ['title', 'type', 'description', 'source', 'website']),
    organic_results: organicResults,
    related_questions: ((p.related_questions as any[]) ?? [])
      .slice(0, 4)
      .map((r) => compact({ question: r.question, snippet: r.snippet, link: r.link })),
  });
  return { text: JSON.stringify(slim, null, 1), isError: false };
}

/** Schema cap for serp_news_search.limit — must match handlers.ts */
export const SERP_NEWS_MAX_LIMIT = 20;

export interface NewsSearchInput {
  query: string;
  gl?: string;
  hl?: string;
  limit?: number;
}

/**
 * Google News search.
 *
 * This engine has no result-count/page params (num/start), so we only trim the
 * returned count with a server-side slice — billing is one search either way.
 *
 * The sort param so (0=relevance | 1=date) is unusable too. Measured
 * (2026-07-29): sending it with `q` returns 400: "`q` and `so` parameters can't
 * be used together." — so is only for topic/publication/story token
 * exploration. If you need newest-first, use serp_web_search's recency
 * (tbs=qdr:*) or naver_search (sort=date).
 */
export async function newsSearch(input: NewsSearchInput): Promise<SerpResult> {
  const max = input.limit ?? 10;
  const { result, json } = await callSerpApi({
    engine: 'google_news',
    q: input.query,
    gl: input.gl,
    hl: input.hl,
  });
  if (result) return result;

  const p = json as Record<string, any>;
  /**
   * Items without a link are section headers, but **they carry real articles
   * inside stories[]** (measured 2026-08-11:
   * {"position":1,"title":"주요 뉴스","stories":[4 items]}).
   *
   * We once dropped headers wholesale — and the 4 dropped articles were the most
   * recent in the response. Recency checking is this tool's reason to exist, and
   * the freshest top-ranked articles were vanishing. The header itself can't be
   * cited, so peel it off, but flatten and keep the articles inside.
   */
  const rawNews = ((p.news_results as any[]) ?? []).flatMap((r) => {
    if (typeof r?.link === 'string' && r.link.length > 0) return [r];
    const stories = (r?.stories as any[]) ?? [];
    return stories.filter((s) => typeof s?.link === 'string' && s.link.length > 0);
  });
  // flattening the bundles makes original positions collide (articles inside a
  // header also count from 1) — renumber so the response doesn't have two #2s
  const newsResults = rawNews.slice(0, max).map((r, i) =>
    compact({
      position: i + 1,
      title: r.title,
      source: typeof r.source === 'object' ? r.source?.name : r.source,
      date: r.date,
      snippet: r.snippet,
      link: r.link,
    }),
  );
  if (newsResults.length === 0) return emptyResult();
  return {
    text: JSON.stringify(
      compact({
        query: input.query,
        // this engine has no page param — limit is the only way to reach the truncated range
        note: sliceNote(
          rawNews.length,
          max,
          max >= SERP_NEWS_MAX_LIMIT
            ? `this engine has no page param and limit is already at its cap (${SERP_NEWS_MAX_LIMIT}), so the rest is unreachable — re-query with a narrower query or gl/hl`
            : `this engine has no page param, so if you need more, call again with a higher limit (cap ${SERP_NEWS_MAX_LIMIT})`,
        ),
        news_results: newsResults,
      }),
      null,
      1,
    ),
    isError: false,
  };
}

export type SerpNaverWhere = 'web' | 'news' | 'image' | 'video';

/** Allowed period values for the naver engine (official docs + measured — bad values get 400 "Invalid format") */
export const SERP_NAVER_PERIODS = ['1h', '1d', '1w', '1m', '3m', '6m', '1y'] as const;

export interface NaverSearchInput {
  query: string;
  where?: SerpNaverWhere;
  page?: number;
  sort?: 'relevance' | 'latest' | 'oldest';
  period?: (typeof SERP_NAVER_PERIODS)[number];
  limit?: number;
}

/**
 * The naver engine's sort_by value scheme differs by where (official docs + measured):
 *   where=news → 0=relevance (default) · 1=newest · 2=oldest
 *   others     → r=relevance (default) · dd=newest
 * Wrong values are **silently ignored**, not errors — believe the results are
 * sorted newest-first and pull recency facts, and you end up citing old
 * articles as new.
 *
 * oldest is news-only — other wheres have no equivalent value, so we reject
 * before calling.
 */
function naverSortValue(where: SerpNaverWhere, sort?: 'relevance' | 'latest' | 'oldest'): string | undefined {
  if (!sort) return undefined;
  if (where === 'news') return sort === 'latest' ? '1' : sort === 'oldest' ? '2' : '0';
  return sort === 'latest' ? 'dd' : 'r';
}

/**
 * Schema cap for serp_naver_search.limit — must match handlers.ts.
 *
 * Items per call differ by where (measured 2026-08-11, query "전기차 보조금":
 * web 15 · news 10 · video 68 · image 48) and wobble with the query, so no
 * constant here — sliceNote judges truncation from **this response's actual
 * count**. Reasoning from a constant produces a notice that contradicts the
 * response (it actually did).
 */
export const SERP_NAVER_MAX_LIMIT = 50;

/**
 * Page stride for the naver engine — **must equal the number of items per call**.
 *
 * If they diverge, pages silently overlap or skip. image can match its chunk to
 * this value via `num`, so we do (unsent, the engine default of 50 kicks in and
 * 48 arrive — measured); the other wheres have fixed chunks, so we use those as
 * the stride (measured 2026-08-11: web 15).
 */
const NAVER_STRIDE: Record<SerpNaverWhere, number> = {
  web: 15,
  news: 10,
  // video ignores num, so its chunk (68) can't be shrunk — use stride 48 to
  // match the next offset Naver's own pagination proposes (start=49). That's 20
  // short of the chunk, so page boundaries overlap a bit, but a stride of 10
  // would overlap by 40.
  video: 48,
  image: 10,
};

/**
 * The naver engine's `start` offset — the stride differs per where (official docs + measured).
 *
 *   web   : start = (page-1)*15 + 1   (same value as the documented formula page*15-29, for page≥2)
 *   others: start = (page-1)*10 + 1
 *
 * Use the documented formula as-is and page=2 becomes start=1, overlapping
 * page 1 — SerpApi's own pagination skips page=2 too. Here we keep the stride
 * uniform so page means "the next batch" on every where.
 */
function naverStart(where: SerpNaverWhere, page?: number): number | undefined {
  if (!page || page < 2) return undefined;
  return (page - 1) * NAVER_STRIDE[where] + 1;
}

export async function naverSearch(input: NaverSearchInput): Promise<SerpResult> {
  // A limit above the stride overlaps at page boundaries by the difference —
  // video's chunk is 68 with stride 48, so limit=50 slid by 2 per page and
  // duplicated 10 items (measured). Clamping to the stride makes pages line up
  // exactly, and the overflow comes back on the next page, so no results are lost.
  const requested = input.limit ?? 10;
  const where = input.where ?? 'web';
  const max = Math.min(requested, NAVER_STRIDE[where]);
  if (input.sort === 'oldest' && where !== 'news') {
    return err(`sort=oldest is where=news only (current where=${where}) — other search types have no equivalent sort value.`);
  }
  const { result, json } = await callSerpApi({
    engine: 'naver',
    query: input.query,
    where,
    // SerpApi's convenience arg `page` makes **page 2 a no-op on where=web**.
    // The official docs apply `start = page*15 - 29` to web only, and page=2
    // yields 1 — the same offset as page=1 (measured 2026-08-11: both start=1,
    // 15/15 links duplicated. The page=1 response's serpapi_pagination.next also
    // skips page=2 and points at page=3&start=16). We compute start ourselves
    // to dodge the trap.
    start: naverStart(where, input.page),
    sort_by: naverSortValue(where, input.sort),
    period: input.period,
    // **num must be sent explicitly, equal to the stride** (a where=image-only param).
    //
    // Pagination's invariant is "items per call = stride". When they diverge,
    // pages overlap (chunk > stride) or skip (chunk < stride). Measured 2026-08-11:
    //
    //   num unsent → 48 received (the engine default of 50 kicks in). The stride
    //                is 10, so page=2 pointed inside the previous page — 38 duplicated.
    //   num=10     → 10 received. Matches the stride; pages line up cleanly.
    //
    // We once wrote "unsent means 10 arrive" — wrong. Unsent means the default
    // applies, not that it's disabled. Billing is one search either way, so
    // there's no reason to grab more at once. Need more, step through page.
    num: where === 'image' ? NAVER_STRIDE.image : undefined,
  });
  if (result) return result;

  const p = json as Record<string, any>;

  /**
   * How to fetch more after truncation — differs per where.
   *
   * **The page stride is smaller than the items per call** (measured
   * 2026-08-11: video returns 68 with stride 48, web 15 with stride 15). So the
   * truncated range isn't "gone forever" — the next page usually overlaps into
   * it. We once asserted it was gone; that was wrong, and the wording burned
   * credits on pointless re-queries.
   *
   * If limit has room to grow, that's cheaper (one call). At the cap already,
   * point at page instead.
   */
  // On video, Naver reshuffles results per page, so boundaries overlap a little
  // (measured: even at stride 48, 10 duplicates between pages 1↔2. Within a page
  // it's unique 48/48 and boundaries do connect, so it's engine behavior, not
  // our stride math). We're stateless — the server can't remember the previous
  // page — so we just disclose what can't be removed.
  const overlapWarn = where === 'video' ? ' (this search type overlaps a little at page boundaries — dedupe by link)' : '';
  const moreHint =
    (max < requested
      ? `requested limit=${requested} exceeds where=${where}'s page size (${NAVER_STRIDE[where]}), so it was lowered to ${max} — to get more, raise page one step at a time`
      : `raise page by 1 to get the next contiguous range`) + overlapWarn;

  // image and video have entirely different result fields — mash them through
  // the common slimming and original URL, resolution, and duration disappear,
  // making them useless for sourcing material.
  if (where === 'image') {
    // the docs say inline_images_results, but the actual response key is images_results
    // (measured 2026-08-11 — the docs' own naver-images-api example shows images_results too).
    const rawImages = (p.images_results as any[]) ?? (p.inline_images_results as any[]) ?? [];
    const images = rawImages.slice(0, max).map((r) =>
      compact({
        title: r.title,
        imageUrl: r.original,
        thumbnail: r.thumbnail,
        width: r.width,
        height: r.height,
        source: r.source,
        where: r.where,
        link: r.link,
      }),
    );
    if (images.length === 0) return emptyResult();
    return {
      text: JSON.stringify(
        compact({ query: input.query, where, note: sliceNote(rawImages.length, max, moreHint), images }),
        null,
        1,
      ),
      isError: false,
    };
  }

  if (where === 'video') {
    // measured 2026-08-11: the response key is video_results, not the documented inline_videos_results
    const rawVideos = (p.video_results as any[]) ?? (p.inline_videos_results as any[]) ?? [];
    const videos = rawVideos.slice(0, max).map((r) =>
      compact({
        position: r.position,
        title: stripA11yLabel(r.title),
        link: r.link,
        duration: r.duration,
        source: stripA11yLabel(r.origin),
        channel: stripA11yLabel(typeof r.channel === 'object' ? r.channel?.name : r.channel),
        date: r.publish_date,
        // view count — required: the skill tells callers to use this tool to read
        // view flow. The raw value is a display string like "조회수 1,118" ("1,118 views")
        views: r.views,
        thumbnail: r.thumbnail,
      }),
    );
    if (videos.length === 0) return emptyResult();
    return {
      text: JSON.stringify(
        compact({ query: input.query, where, note: sliceNote(rawVideos.length, max, moreHint), videos }),
        null,
        1,
      ),
      isError: false,
    };
  }

  const slimItems = (items: any[] | undefined) =>
    (items ?? []).slice(0, max).map((r) => {
      // where=news nests date and outlet under news_info, not at the top level
      // (measured 2026-08-11: news_info.news_date "2시간 전" / news_info.press_name "이데일리").
      // When we only read the top level, news results lost date and source
      // entirely — recency checking is this tool's reason to exist, and there was
      // no way to tell whether sort/period filters had applied.
      const info = (r.news_info ?? {}) as Record<string, unknown>;
      return compact({
        position: r.position,
        title: r.title,
        link: r.link,
        snippet: r.snippet ?? r.description,
        source:
          (typeof r.source === 'object' ? (r.source as any)?.name : r.source) ??
          info.press_name ??
          info.name ??
          r.press_name,
        date: r.date ?? r.published_date ?? info.news_date ?? info.date,
      });
    });
  // The result array's **key name differs by where** (measured 2026-07-29):
  //   where=web      → organic_results   (the SerpApi docs say web_results, but this is what arrives)
  //   where=news     → news_results
  //   where=nexearch → web_results (+ ads/inline_images…)
  // When we only read web_results, the default path (where=web) returned "no
  // results" every time — indistinguishable from a genuinely empty result, and
  // the model gave up searching. Check all three.
  const raw = (p.organic_results as any[]) ?? (p.web_results as any[]) ?? (p.news_results as any[]) ?? [];
  const items = slimItems(raw);
  if (items.length === 0) return emptyResult();
  return {
    text: JSON.stringify(
      compact({
        query: input.query,
        where,
        note: sliceNote(raw.length, max, moreHint),
        results: items,
      }),
      null,
      1,
    ),
    isError: false,
  };
}

// ── Image search (engine=google_images) ───────────────────────────

/**
 * Filter params for Google image search (official docs + measured 2026-08-11).
 *
 * SerpApi takes these as **dedicated params**, no tbs assembly — build tbs by
 * hand and they overwrite each other and get silently ignored, so use only the
 * dedicated ones. Aspect ratio in particular moved to imgar after Google
 * discontinued the old tbs=iar.
 */
/** One ijn step on google_images = 100 items (official docs + measured) */
const GOOGLE_IMAGES_PAGE_SIZE = 100;

/** Schema cap for serp_image_search.limit — must match handlers.ts */
export const SERP_IMAGE_MAX_LIMIT = 50;

export const IMAGE_SIZES = ['large', 'medium', 'icon', '2mp', '4mp', '8mp', '15mp'] as const;
export const IMAGE_ASPECTS = ['square', 'tall', 'wide', 'panoramic'] as const;
export const IMAGE_TYPES = ['photo', 'clipart', 'lineart', 'animated', 'face'] as const;
export const IMAGE_LICENSES = ['free', 'commercial', 'modify', 'modify_commercial', 'creative_commons'] as const;

const IMGSZ: Record<(typeof IMAGE_SIZES)[number], string> = {
  large: 'l',
  medium: 'm',
  icon: 'i',
  '2mp': '2mp',
  '4mp': '4mp',
  '8mp': '8mp',
  '15mp': '15mp',
};
const IMGAR: Record<(typeof IMAGE_ASPECTS)[number], string> = { square: 's', tall: 't', wide: 'w', panoramic: 'xw' };
/** License codes — fmc (modify + commercial use allowed) is the narrowest pick for copyright-safe material */
const LICENSES: Record<(typeof IMAGE_LICENSES)[number], string> = {
  free: 'f',
  commercial: 'fc',
  modify: 'fm',
  modify_commercial: 'fmc',
  creative_commons: 'cl',
};

export interface ImageSearchInput {
  query: string;
  gl?: string;
  hl?: string;
  limit?: number;
  page?: number;
  size?: (typeof IMAGE_SIZES)[number];
  aspect?: (typeof IMAGE_ASPECTS)[number];
  imageType?: (typeof IMAGE_TYPES)[number];
  license?: (typeof IMAGE_LICENSES)[number];
  color?: string;
  safe?: boolean;
}

export async function imageSearch(input: ImageSearchInput): Promise<SerpResult> {
  const max = input.limit ?? 20;
  const { result, json } = await callSerpApi({
    engine: 'google_images',
    q: input.query,
    gl: input.gl,
    hl: input.hl,
    // this engine has no num — it returns 100 per call and pages via ijn (0-based).
    // We trim the returned count with a server-side slice; billing is one search either way.
    ijn: input.page && input.page > 1 ? input.page - 1 : undefined,
    imgsz: input.size ? IMGSZ[input.size] : undefined,
    imgar: input.aspect ? IMGAR[input.aspect] : undefined,
    image_type: input.imageType,
    licenses: input.license ? LICENSES[input.license] : undefined,
    image_color: input.color,
    safe: input.safe === false ? 'off' : 'active',
  });
  if (result) return result;

  const p = json as Record<string, any>;
  const rawImages = (p.images_results as any[]) ?? [];
  // This engine's position is **already global** (measured 2026-08-11: ijn=1 →
  // 101–200). webSearch is the opposite — position restarts at 1 per page, so
  // only there do we add the offset. The two engines' contracts are inverted;
  // copy the same formula across and you double-add.
  const images = rawImages.slice(0, max).map((r, i) =>
    compact({
      position: typeof r.position === 'number' ? r.position : i + 1,
      title: r.title,
      imageUrl: r.original,
      thumbnail: r.thumbnail,
      width: r.original_width,
      height: r.original_height,
      source: r.source,
      link: r.link,
      // only present when a license filter is applied — evidence for commercial-use decisions
      licenseUrl: r.license_details_url,
    }),
  );
  if (images.length === 0) return emptyResult();

  return {
    text: JSON.stringify(
      compact({
        query: input.query,
        note: sliceNote(
          rawImages.length,
          max,
          `this engine returns ${GOOGLE_IMAGES_PAGE_SIZE} per call but the limit cap is ${SERP_IMAGE_MAX_LIMIT}, so the rest is unreachable. One page step is ${GOOGLE_IMAGES_PAGE_SIZE} items, so page can't reach the truncated range either — narrow with filters (size·aspect·license) and re-query`,
        ),
        images,
        suggested_searches: ((p.suggested_searches as any[]) ?? []).slice(0, 6).map((r) => r.name ?? r.q).filter(Boolean),
      }),
      null,
      1,
    ),
    isError: false,
  };
}

// ── Trending searches (engine=google_trends_trending_now) ─────────

/** Allowed values for serp_trending_now.hours — only the four windows Google predefines */
export const TRENDING_HOURS = [4, 24, 48, 168] as const;
/** Schema cap for serp_trending_now.limit — must match handlers.ts */
export const SERP_TRENDING_MAX_LIMIT = 50;
export const DEFAULT_TRENDING_GEO = 'KR';
export const DEFAULT_TRENDING_HOURS = 24;
export const DEFAULT_TRENDING_LIMIT = 20;
const TREND_BREAKDOWN_CAP = 8;

export interface TrendingNowInput {
  geo?: string;
  hours?: (typeof TRENDING_HOURS)[number];
  categoryId?: number;
  onlyActive?: boolean;
  hl?: string;
  limit?: number;
}

export interface TrendingItem {
  query: string;
  searchVolume: number | null;
  increasePct: number | null;
  active: boolean;
  startedAt: string | null;
  categories: string[];
  breakdown: string[];
}

export interface TrendingNowData {
  geo: string;
  hours: number;
  count: number;
  received: number;
  trends: TrendingItem[];
}

function unixToIso(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

/**
 * Returns trending searches in parsed form — shared by the serp_trending_now tool and
 * sns_issue_scout. Search volume and increase percentage are rough bucketed figures Google
 * hands out (2,000,000 · 1000%), good for ranking against each other but not as absolutes.
 */
export async function fetchTrendingNow(
  input: TrendingNowInput,
): Promise<{ error?: SerpResult; data?: TrendingNowData }> {
  const geo = (input.geo ?? DEFAULT_TRENDING_GEO).toUpperCase();
  const hours = input.hours ?? DEFAULT_TRENDING_HOURS;
  const limit = input.limit ?? DEFAULT_TRENDING_LIMIT;
  const { result, json } = await callSerpApi({
    engine: 'google_trends_trending_now',
    geo,
    hours,
    hl: input.hl,
    category_id: input.categoryId,
    only_active: input.onlyActive ? 'true' : undefined,
  });
  if (result) return result.isError ? { error: result } : { data: { geo, hours, count: 0, received: 0, trends: [] } };

  const p = json as Record<string, any>;
  const raw = (p.trending_searches as any[]) ?? [];
  const trends: TrendingItem[] = raw.slice(0, limit).map((t) => ({
    query: str(t.query),
    searchVolume: typeof t.search_volume === 'number' ? t.search_volume : null,
    increasePct: typeof t.increase_percentage === 'number' ? t.increase_percentage : null,
    active: t.active === true,
    startedAt: unixToIso(t.start_timestamp),
    categories: ((t.categories as any[]) ?? []).map((c) => str(c?.name)).filter(Boolean),
    breakdown: ((t.trend_breakdown as any[]) ?? []).slice(0, TREND_BREAKDOWN_CAP).map(str).filter(Boolean),
  }));
  return { data: { geo, hours, count: trends.length, received: raw.length, trends } };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export async function trendingNow(input: TrendingNowInput): Promise<SerpResult> {
  const { error, data } = await fetchTrendingNow(input);
  if (error) return error;
  if (!data || data.trends.length === 0) {
    return {
      text: '(no trending searches — check the geo code, or widen hours to 168 and retry exactly once)',
      isError: false,
    };
  }
  const limit = input.limit ?? DEFAULT_TRENDING_LIMIT;
  return {
    text: JSON.stringify(
      compact({
        geo: data.geo,
        hours: data.hours,
        count: data.count,
        note: sliceNote(
          data.received,
          limit,
          `this engine has no page — to see more, raise limit up to ${SERP_TRENDING_MAX_LIMIT} or narrow with categoryId`,
        ),
        trends: data.trends,
      }),
      null,
      1,
    ),
    isError: false,
  };
}

// ── Raw Google web search data (sns_issue_scout only) ─────────────

export interface OrganicHit {
  position: number;
  title: string;
  link: string;
  snippet: string;
  date?: string;
  source?: string;
}

/**
 * Slims Google organic results and passes them straight through — for callers that bundle
 * several searches into one response (sns_issue_scout). webSearch handles the text wrapping.
 */
export async function fetchGoogleOrganic(input: {
  query: string;
  gl?: string;
  hl?: string;
  page?: number;
  recency?: WebSearchInput['recency'];
}): Promise<{ error?: SerpResult; hits: OrganicHit[] }> {
  const { result, json } = await callSerpApi({
    engine: 'google',
    q: input.query,
    gl: input.gl,
    hl: input.hl,
    start: input.page && input.page > 1 ? (input.page - 1) * GOOGLE_PAGE_SIZE : undefined,
    tbs: input.recency ? RECENCY_TBS[input.recency] : undefined,
  });
  if (result) return result.isError ? { error: result, hits: [] } : { hits: [] };
  const p = json as Record<string, any>;
  const offset = input.page && input.page > 1 ? (input.page - 1) * GOOGLE_PAGE_SIZE : 0;
  const hits: OrganicHit[] = ((p.organic_results as any[]) ?? [])
    .filter((r) => typeof r?.link === 'string')
    .map((r, i) => ({
      position: offset + (typeof r.position === 'number' ? r.position : i + 1),
      title: str(r.title),
      link: r.link as string,
      snippet: str(r.snippet),
      date: typeof r.date === 'string' ? r.date : undefined,
      source: typeof r.source === 'string' ? r.source : undefined,
    }));
  return { hits };
}
