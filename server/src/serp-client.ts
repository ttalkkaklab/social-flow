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

/** undefined·빈 문자열·빈 배열·빈 객체 필드를 제거해 페이로드를 줄인다 */
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
          'SerpApi 401 Unauthorized — SERPAPI_API_KEY 가 유효하지 않다. 키를 교정하기 전 재시도 금지 (401/400 은 재시도해도 같은 결과).',
        ),
      };
    }
    if (res.status === 429) {
      return {
        result: err(
          'SerpApi 429 — 월간 쿼터 또는 시간당 처리량 소진. 이번 세션에서는 추가 검색을 중단하고, 이미 확보한 근거 안에서만 저작하거나 미검증 주장을 본문에서 제외할 것.',
        ),
      };
    }
    return { result: err(`SerpApi HTTP ${res.status}: ${maskKey(res.body.slice(0, 500))}`) };
  }

  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return { result: err(`SerpApi 응답 JSON 파싱 실패: ${maskKey(res.body.slice(0, 300))}`) };
  }

  const body = json as Record<string, unknown>;
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

// ── 엔진별 검색 + 슬리밍 ─────────────────────────────────────────

export interface WebSearchInput {
  q: string;
  gl?: string;
  hl?: string;
  location?: string;
  num?: number;
  page?: number;
  recency?: 'hour' | 'day' | 'week' | 'month' | 'year';
}

export async function webSearch(input: WebSearchInput): Promise<SerpResult> {
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
  if (result) return result;

  const p = json as Record<string, any>;
  const slim = compact({
    query: input.q,
    total_results: p.search_information?.total_results,
    answer_box: pick(p.answer_box, ['type', 'title', 'answer', 'snippet', 'link']),
    knowledge_graph: pick(p.knowledge_graph, ['title', 'type', 'description', 'source', 'website']),
    organic_results: ((p.organic_results as any[]) ?? []).slice(0, num).map((r) =>
      compact({
        position: r.position,
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        date: r.date,
        source: r.source,
      }),
    ),
    related_questions: ((p.related_questions as any[]) ?? [])
      .slice(0, 4)
      .map((r) => compact({ question: r.question, snippet: r.snippet, link: r.link })),
  });
  return { text: JSON.stringify(slim, null, 1), isError: false };
}

export interface NewsSearchInput {
  q: string;
  gl?: string;
  hl?: string;
  max_results?: number;
}

export async function newsSearch(input: NewsSearchInput): Promise<SerpResult> {
  const max = input.max_results ?? 10;
  const { result, json } = await callSerpApi({
    engine: 'google_news',
    q: input.q,
    gl: input.gl,
    hl: input.hl,
  });
  if (result) return result;

  const p = json as Record<string, any>;
  const slim = compact({
    query: input.q,
    news_results: ((p.news_results as any[]) ?? []).slice(0, max).map((r) =>
      compact({
        position: r.position,
        title: r.title,
        source: typeof r.source === 'object' ? r.source?.name : r.source,
        date: r.date,
        snippet: r.snippet,
        link: r.link,
      }),
    ),
  });
  return { text: JSON.stringify(slim, null, 1), isError: false };
}

export interface NaverSearchInput {
  query: string;
  where?: 'web' | 'news';
  page?: number;
  sort_by?: 'relevance' | 'latest';
  max_results?: number;
}

export async function naverSearch(input: NaverSearchInput): Promise<SerpResult> {
  const max = input.max_results ?? 10;
  const { result, json } = await callSerpApi({
    engine: 'naver',
    query: input.query,
    where: input.where ?? 'web',
    page: input.page,
    sort_by: input.sort_by === 'latest' ? 'dd' : input.sort_by === 'relevance' ? 'r' : undefined,
  });
  if (result) return result;

  const p = json as Record<string, any>;
  const slimItems = (items: any[] | undefined) =>
    (items ?? []).slice(0, max).map((r) =>
      compact({
        position: r.position,
        title: r.title,
        link: r.link,
        snippet: r.snippet ?? r.description,
        source: typeof r.source === 'object' ? r.source?.name : (r.source ?? r.press_name),
        date: r.date ?? r.published_date,
      }),
    );
  const slim = compact({
    query: input.query,
    web_results: slimItems(p.web_results as any[]),
    news_results: slimItems(p.news_results as any[]),
  });
  return { text: JSON.stringify(slim, null, 1), isError: false };
}
