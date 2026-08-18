import { requireNaverKeys } from './config.js';
import { buildQuery, requestRaw } from './http.js';

/**
 * Naver Open API search client — the first-line tool for Korean-language content research.
 *
 * Separate from SerpApi's naver engine (serp_naver_search), this calls the **official Naver
 * Open API** directly — the free quota is large (25,000 calls/day) and it's the closest thing
 * to real Korean news/blog/cafe usage data. Use this when SerpApi credits are precious or
 * Korean-language source research is the main goal.
 *
 * Invariants (same philosophy as serp-client):
 * 1. **Key masking** — credentials go in headers only, so there's no URL leak path, but
 *    responses are slimmed in case a key gets echoed in an error body.
 * 2. **Response slimming** — strips <b> highlight tags and HTML entities, keeps only the
 *    evidence fields.
 * 3. **Per-type contract branching** — SEARCH_TYPES below is the source of truth. Parameter
 *    support and response fields differ by type, so don't mash them into one code path.
 *
 * ## Why the supported types are fixed at 8 (measured 2026-08-11)
 *
 * Naver's official swagger (naver/naver-openapi-guide) still documents book/book_adv/doc/
 * shop/movie, but real calls are **all 404 (errorCode SE05 "존재하지 않는 검색 api" — "search
 * api does not exist")**. Adding them from the docs alone gets you a dead tool — only
 * news/blog/web/cafe/kin/image/encyc/local, confirmed alive by real calls, are exposed.
 *
 * adult (adult-keyword detection) and errata (typo correction) are alive but are a separate
 * contract that returns a single scalar ({"adult":"0"} / {"errata":""}) instead of an items
 * array, and they aren't for content research, so they're excluded.
 */

const NAVER_BASE = 'https://openapi.naver.com/v1/search';

export type NaverSearchType = 'news' | 'blog' | 'web' | 'cafe' | 'kin' | 'image' | 'encyc' | 'local';

/** Sort options per type — the value system differs from type to type */
type SortOption = 'sim' | 'date' | 'random' | 'comment';

interface SearchTypeSpec {
  /** Endpoint file name */
  endpoint: string;
  /** Allowed sort values — an empty array means the sort parameter isn't sent at all */
  sorts: SortOption[];
  /** limit(display) cap — for local the API itself gives at most 5 results */
  maxLimit: number;
  /** Whether the start(page) parameter is supported */
  paging: boolean;
}

/**
 * Per-type parameter contract (measured 2026-08-11).
 *
 * Two traps are baked in here:
 * - **web/encyc are documented as not taking sort.** A real call returns 200, not 400
 *   (measured 2026-08-11), but that doesn't mean it's supported — it means it's **silently
 *   ignored**, which is exactly the dangerous case: believing the results are sorted and
 *   pulling recency-sensitive values out of them.
 * - **local uses random/comment, not sim/date**, and raising display to 10 still returns 5
 *   results, while passing start returns the same results (no paging).
 *
 * Both are the silently-ignored kind rather than errors, so the server filters them before
 * the call to keep the model from believing the results were sorted.
 */
const SEARCH_TYPES: Record<NaverSearchType, SearchTypeSpec> = {
  news: { endpoint: 'news.json', sorts: ['sim', 'date'], maxLimit: 30, paging: true },
  blog: { endpoint: 'blog.json', sorts: ['sim', 'date'], maxLimit: 30, paging: true },
  web: { endpoint: 'webkr.json', sorts: [], maxLimit: 30, paging: true },
  cafe: { endpoint: 'cafearticle.json', sorts: ['sim', 'date'], maxLimit: 30, paging: true },
  kin: { endpoint: 'kin.json', sorts: ['sim', 'date'], maxLimit: 30, paging: true },
  image: { endpoint: 'image.json', sorts: ['sim', 'date'], maxLimit: 30, paging: true },
  encyc: { endpoint: 'encyc.json', sorts: [], maxLimit: 30, paging: true },
  local: { endpoint: 'local.json', sorts: ['random', 'comment'], maxLimit: 5, paging: false },
};

export const NAVER_SEARCH_TYPES = Object.keys(SEARCH_TYPES) as NaverSearchType[];
export const NAVER_SORTS: SortOption[] = ['sim', 'date', 'random', 'comment'];
export const NAVER_IMAGE_FILTERS = ['all', 'large', 'medium', 'small'] as const;

/** Allowed sort values per type — tool descriptions and contract tests treat this table as the source of truth */
export function sortsForType(type: NaverSearchType): SortOption[] {
  return SEARCH_TYPES[type].sorts;
}

export function maxLimitForType(type: NaverSearchType): number {
  return SEARCH_TYPES[type].maxLimit;
}

export interface NaverResult {
  text: string;
  isError: boolean;
}

export interface NaverSearchInput {
  query: string;
  type?: NaverSearchType;
  /** Result count (default 10, max 30 — the API cap is 100, but this protects LLM context. local is 5) */
  limit?: number;
  /** Start position (1-based) — only when the first page has no evidence. Unsupported for local */
  page?: number;
  /** The value system differs by type — see sortsForType() */
  sort?: SortOption;
  /** Image size filter (type=image only) */
  imageSize?: (typeof NAVER_IMAGE_FILTERS)[number];
}

function err(message: string): NaverResult {
  return { text: message, isError: true };
}

/** Strips <b> highlights and HTML entities from a Naver search response */
function stripMarkup(text: string): string {
  return text
    .replace(/<\/?b>/gi, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;|&#39;/g, "'");
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Converts Naver coordinates (KATECH-style integer strings) to WGS84 lat/lng.
 *
 * mapx/mapy in a local response are integer strings with the decimal point dropped, like
 * "1269719531" (measured 2026-08-11). Divide by 10^7 and you get longitude 126.9719531 ·
 * latitude 37.5773782, usable directly for map links and distance math. Passing the raw
 * integer through makes the model read it as a coordinate and cite the wrong spot.
 */
function toLatLng(mapx: unknown, mapy: unknown): { lat: number; lng: number } | undefined {
  const x = Number(mapx);
  const y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return undefined;
  const lng = x / 1e7;
  const lat = y / 1e7;
  // Outside the Korean peninsula the coordinate-system assumption broke — don't pass a guess through
  if (lng < 120 || lng > 135 || lat < 32 || lat > 44) return undefined;
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

/**
 * Response fields differ by type (measured 2026-08-11):
 *   news/blog/cafe/kin/encyc → title, link, description (+ per-type extra fields)
 *   image                    → title, link, thumbnail, sizewidth, sizeheight (no description)
 *   local                    → title, category, address, roadAddress, telephone, mapx, mapy
 * Mashing them into one shared slimming loses the coordinates and address of a local search entirely.
 */
function slimItem(type: NaverSearchType, item: Record<string, unknown>): Record<string, unknown> {
  const title = stripMarkup(String(item.title ?? ''));

  if (type === 'image') {
    return compact({
      title,
      // In an image response, link is the original image URL and thumbnail is Naver's CDN downscale
      imageUrl: String(item.link ?? ''),
      thumbnail: item.thumbnail,
      width: Number(item.sizewidth) || undefined,
      height: Number(item.sizeheight) || undefined,
    });
  }

  if (type === 'local') {
    return compact({
      title,
      category: item.category,
      address: item.address,
      roadAddress: item.roadAddress,
      telephone: item.telephone,
      link: item.link,
      coords: toLatLng(item.mapx, item.mapy),
      description: stripMarkup(String(item.description ?? '')),
    });
  }

  return compact({
    title,
    // originallink = the outlet's own article, link = Naver's mirror. Cite the original
    link: String(item.originallink ?? item.link ?? ''),
    description: stripMarkup(String(item.description ?? '')),
    source: item.bloggername ?? item.cafename ?? undefined,
    date: item.pubDate ?? item.postdate ?? undefined,
  });
}

export async function naverSearch(input: NaverSearchInput): Promise<NaverResult> {
  const { id, secret } = requireNaverKeys();
  const type = input.type ?? 'news';
  const spec = SEARCH_TYPES[type];
  if (!spec) {
    return err(
      `unsupported search type: ${type}. Available: ${NAVER_SEARCH_TYPES.join(', ')} ` +
        '(book/doc/shop/movie are APIs Naver shut down — still in the official docs, but calling them returns 404).',
    );
  }

  // If a sort the type doesn't support gets silently ignored, the model believes the results
  // are sorted and cites stale material as current. Reject it explicitly before the call.
  if (input.sort && !spec.sorts.includes(input.sort)) {
    const allowed = spec.sorts.length > 0 ? spec.sorts.join('|') : '(no sort support)';
    return err(
      `type=${type} does not support sort=${input.sort} — allowed: ${allowed}. ` +
        (spec.sorts.length === 0
          ? 'Sending sort to this type is ignored without an error (and believing it sorted leads to citing stale material as current), so the server rejects it up front. Call again without sort.'
          : 'Call without sort, or switch to an allowed value.'),
    );
  }
  if (input.imageSize && type !== 'image') {
    return err(`imageSize is for type=image only (current type=${type}). To narrow by image size, call with type=image.`);
  }
  if (input.page && input.page > 1 && !spec.paging) {
    return err(
      `type=${type} does not support paging — passing page returns the same results (measured). ` +
        'Narrow the query and call again.',
    );
  }

  const limit = Math.min(input.limit ?? 10, spec.maxLimit);
  // Naver's start is an **item offset** (1-based), not a page. Passing page straight through
  // would make page=2 mean "from the 2nd item", so results overlap (with limit=3, 2 duplicates).
  // The shared search-tool argument page must mean the same thing in every tool, so convert here.
  const start = input.page && input.page > 1 ? (input.page - 1) * limit + 1 : undefined;
  // If the converted value exceeds the API cap (1000) you get a 400 SE03 — reject before the
  // call to save credits and a round trip, and tell the model to narrow the query instead of
  // paging deeper
  if (start !== undefined && start > 1000) {
    return err(
      `page=${input.page} converts to start position ${start} at limit=${limit}, and the Naver API cap is 1000. ` +
        'Deeper pages can\'t be fetched — narrow the query and call again.',
    );
  }
  const url = `${NAVER_BASE}/${spec.endpoint}${buildQuery({
    query: input.query,
    display: limit,
    start: spec.paging ? start : undefined,
    sort: spec.sorts.length > 0 ? input.sort : undefined,
    filter: type === 'image' ? input.imageSize : undefined,
  })}`;

  const res = await requestRaw('get', url, {
    'X-Naver-Client-Id': id,
    'X-Naver-Client-Secret': secret,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return err(
        `Naver Open API ${res.status} — NAVER_CLIENT_ID/SECRET is invalid, or the app hasn't been registered for the search API. ` +
          'Do not retry before fixing the key (check at https://developers.naver.com/apps).',
      );
    }
    if (res.status === 429) {
      return err('Naver Open API 429 — daily quota (25,000 calls) exhausted. Fall back to WebSearch/serp_* for this session.');
    }
    if (res.status === 404) {
      return err(
        `Naver Open API 404 — the ${type} endpoint isn't responding (Naver may have shut it down). ` +
          `Live types: ${NAVER_SEARCH_TYPES.join(', ')}. Switch to another type or serp_* instead of retrying.`,
      );
    }
    return err(`Naver Open API HTTP ${res.status}: ${res.body.slice(0, 500)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return err(`failed to parse Naver Open API response JSON: ${res.body.slice(0, 300)}`);
  }

  const body = json as Record<string, unknown>;
  const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
  if (items.length === 0) {
    return {
      text: '(no search results — retry once with a different query, or drop claims you could not verify from the copy)',
      isError: false,
    };
  }

  const slim = compact({
    // For local, total isn't the number of businesses — it's **the requested count handed
    // straight back** (measured 2026-08-11: limit=2 → total:2, limit=3 → total:3).
    // Passed through, the model reads it as "there are 2 cafes in Gangnam", so drop it entirely.
    query: input.query,
    type,
    total: type === 'local' ? undefined : body.total,
    // Local search caps at 5 results and has no paging — always carry the constraint so a small
    // result set isn't mistaken for a failed search, or a missing total for a defect
    note:
      type === 'local'
        ? 'Local search is capped at 5 results by the API and has no paging. The total number of businesses is not knowable from this API (no total provided)'
        : undefined,
    items: items.map((item) => slimItem(type, item)),
  });
  return { text: JSON.stringify(slim, null, 1), isError: false };
}
