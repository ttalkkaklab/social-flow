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
 * 2. **응답 슬리밍** — <b> 하이라이트 태그·HTML 엔티티를 제거하고 근거 필드만 싣는다.
 * 3. **타입별 계약 분기** — 아래 SEARCH_TYPES 가 정본이다. 파라미터 지원 범위와
 *    응답 필드가 타입마다 다르므로 하나의 처리로 뭉개지 않는다.
 *
 * ## 지원 타입을 8종으로 확정한 근거 (실측 2026-08-11)
 *
 * 네이버 공식 swagger(naver/naver-openapi-guide)는 book/book_adv/doc/shop/movie 를
 * 여전히 문서에 싣고 있지만, 실제 호출은 **전부 404 (errorCode SE05 "존재하지 않는
 * 검색 api")** 다. 문서만 보고 추가하면 죽은 툴이 된다 — 실호출로 살아 있음을 확인한
 * news/blog/web/cafe/kin/image/encyc/local 만 노출한다.
 *
 * adult(성인 검색어 판별)·errata(오타 변환)는 살아 있으나 items 배열이 아니라
 * 스칼라 한 개({"adult":"0"} / {"errata":""})를 반환하는 별개 계약이고, 콘텐츠
 * 리서치 용도가 아니라 제외했다.
 */

const NAVER_BASE = 'https://openapi.naver.com/v1/search';

export type NaverSearchType = 'news' | 'blog' | 'web' | 'cafe' | 'kin' | 'image' | 'encyc' | 'local';

/** 타입별 정렬 옵션 — 값 체계가 타입마다 다르다 */
type SortOption = 'sim' | 'date' | 'random' | 'comment';

interface SearchTypeSpec {
  /** 엔드포인트 파일명 */
  endpoint: string;
  /** 허용 sort 값 — 빈 배열이면 sort 파라미터 자체를 보내지 않는다 */
  sorts: SortOption[];
  /** limit(display) 상한 — local 은 API 자체가 5건까지만 준다 */
  maxLimit: number;
  /** start(page) 파라미터 지원 여부 */
  paging: boolean;
}

/**
 * 타입별 파라미터 계약 (실측 2026-08-11).
 *
 * 함정 두 가지가 여기 박혀 있다:
 * - **web/encyc 은 공식 문서상 sort 비적용 대상**이다. 실호출은 400 이 아니라
 *   200 을 주지만(실측 2026-08-11), 그건 지원한다는 뜻이 아니라 **조용히 무시**
 *   한다는 뜻이다 — 정렬됐다고 믿고 시효성 값을 뽑는 게 정확히 위험한 경우다.
 * - **local 은 sim/date 가 아니라 random/comment 체계** 이고, display 를 10으로
 *   올려도 5건만 오며 start 를 넘겨도 같은 결과가 온다(페이징 없음).
 *
 * 둘 다 에러가 아니라 조용히 무시되는 부류라, 서버가 호출 전에 걸러 모델이
 * "정렬됐다"고 오해하는 것을 막는다.
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

/** 타입별 허용 sort 값 — 툴 설명·계약 테스트가 이 표를 정본으로 참조한다 */
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
  /** 결과 수 (기본 10, 최대 30 — API 상한은 100이지만 LLM 컨텍스트 보호. local 은 5) */
  limit?: number;
  /** 시작 위치 (1부터) — 첫 페이지에 근거가 없을 때만. local 은 미지원 */
  page?: number;
  /** 타입별 값 체계가 다르다 — sortsForType() 참조 */
  sort?: SortOption;
  /** 이미지 크기 필터 (type=image 전용) */
  imageSize?: (typeof NAVER_IMAGE_FILTERS)[number];
}

function err(message: string): NaverResult {
  return { text: message, isError: true };
}

/** 네이버 검색 응답의 <b> 하이라이트·HTML 엔티티 제거 */
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
 * 네이버 좌표(KATECH 계열 정수 문자열)를 WGS84 경위도로 환산한다.
 *
 * local 응답의 mapx/mapy 는 "1269719531" 처럼 소수점이 빠진 정수 문자열이다
 * (실측 2026-08-11). 10^7 로 나누면 경도 126.9719531 · 위도 37.5773782 가 되어
 * 지도 링크·거리 계산에 바로 쓸 수 있다. 원본 정수를 그대로 흘리면 모델이 이를
 * 좌표로 오인해 엉뚱한 지점을 인용한다.
 */
function toLatLng(mapx: unknown, mapy: unknown): { lat: number; lng: number } | undefined {
  const x = Number(mapx);
  const y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return undefined;
  const lng = x / 1e7;
  const lat = y / 1e7;
  // 한반도 범위를 벗어나면 좌표계 가정이 깨진 것 — 추측값을 흘리지 않는다
  if (lng < 120 || lng > 135 || lat < 32 || lat > 44) return undefined;
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

/**
 * 타입별 응답 필드가 다르다 (실측 2026-08-11):
 *   news/blog/cafe/kin/encyc → title, link, description (+ 타입별 부가 필드)
 *   image                    → title, link, thumbnail, sizewidth, sizeheight (description 없음)
 *   local                    → title, category, address, roadAddress, telephone, mapx, mapy
 * 공통 슬리밍으로 뭉개면 지역 검색의 좌표·주소가 통째로 사라진다.
 */
function slimItem(type: NaverSearchType, item: Record<string, unknown>): Record<string, unknown> {
  const title = stripMarkup(String(item.title ?? ''));

  if (type === 'image') {
    return compact({
      title,
      // image 응답의 link 는 원본 이미지 URL, thumbnail 은 네이버 CDN 축소본이다
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
    // originallink = 언론사 원문, link = 네이버 미러. 출처 표기는 원문이 맞다
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
      `지원하지 않는 검색 타입: ${type}. 사용 가능: ${NAVER_SEARCH_TYPES.join(', ')} ` +
        '(book/doc/shop/movie 는 네이버가 종료한 API 다 — 공식 문서에 남아 있어도 호출하면 404).',
    );
  }

  // 타입이 지원하지 않는 정렬을 조용히 무시당하면, 모델은 정렬됐다고 믿고
  // 오래된 자료를 최신으로 인용한다. 호출 전에 명시적으로 거절한다.
  if (input.sort && !spec.sorts.includes(input.sort)) {
    const allowed = spec.sorts.length > 0 ? spec.sorts.join('|') : '(정렬 미지원)';
    return err(
      `type=${type} 은 sort=${input.sort} 를 지원하지 않는다 — 허용값: ${allowed}. ` +
        (spec.sorts.length === 0
          ? '이 타입에 sort 를 보내면 에러 없이 무시되므로(정렬됐다고 믿으면 오래된 자료를 최신으로 인용하게 된다) 서버가 미리 거절한다. sort 를 빼고 호출할 것.'
          : '정렬 없이 호출하거나 허용값으로 바꿀 것.'),
    );
  }
  if (input.imageSize && type !== 'image') {
    return err(`imageSize 는 type=image 전용이다 (현재 type=${type}). 이미지 크기로 좁히려면 type=image 로 호출할 것.`);
  }
  if (input.page && input.page > 1 && !spec.paging) {
    return err(
      `type=${type} 은 페이징을 지원하지 않는다 — page 를 넘겨도 같은 결과가 온다(실측). ` +
        '검색어를 좁혀 다시 호출할 것.',
    );
  }

  const limit = Math.min(input.limit ?? 10, spec.maxLimit);
  // 네이버 start 는 페이지가 아니라 **항목 오프셋**(1부터)이다. page 를 그대로
  // 넘기면 page=2 가 2번째 항목부터를 뜻해 결과가 겹친다(limit=3 이면 2건 중복).
  // 검색 툴 공통 인자 page 는 어느 툴에서나 같은 뜻이어야 하므로 여기서 환산한다.
  const start = input.page && input.page > 1 ? (input.page - 1) * limit + 1 : undefined;
  // 환산 결과가 API 상한(1000)을 넘으면 400 SE03 이 온다 — 호출 전에 거절해 크레딧과
  // 왕복을 아끼고, 모델에게 "페이지를 더 넘기지 말고 검색어를 좁히라"고 지시한다
  if (start !== undefined && start > 1000) {
    return err(
      `page=${input.page} 는 limit=${limit} 기준 시작 위치 ${start} 로 환산되는데, 네이버 API 상한은 1000 이다. ` +
        '더 깊은 페이지는 조회할 수 없다 — 검색어를 좁혀 다시 호출할 것.',
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
        `Naver Open API ${res.status} — NAVER_CLIENT_ID/SECRET 이 유효하지 않거나 검색 API 사용 신청이 안 된 앱이다. ` +
          '키를 교정하기 전 재시도 금지 (https://developers.naver.com/apps 에서 확인).',
      );
    }
    if (res.status === 429) {
      return err('Naver Open API 429 — 일일 쿼터(25,000회) 소진. 이번 세션에서는 WebSearch/serp_* 로 대체할 것.');
    }
    if (res.status === 404) {
      return err(
        `Naver Open API 404 — ${type} 엔드포인트가 응답하지 않는다(네이버가 종료했을 수 있다). ` +
          `살아 있는 타입: ${NAVER_SEARCH_TYPES.join(', ')}. 재시도 대신 다른 타입이나 serp_* 로 대체할 것.`,
      );
    }
    return err(`Naver Open API HTTP ${res.status}: ${res.body.slice(0, 500)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return err(`Naver Open API 응답 JSON 파싱 실패: ${res.body.slice(0, 300)}`);
  }

  const body = json as Record<string, unknown>;
  const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
  if (items.length === 0) {
    return {
      text: '(검색 결과 없음 — 검색어를 바꿔 1회만 재시도하거나, 확인 실패한 주장은 본문에서 제외할 것)',
      isError: false,
    };
  }

  const slim = compact({
    // local 의 total 은 전체 업체 수가 아니라 **요청한 건수를 그대로 되돌려준
    // 값**이다 (실측 2026-08-11: limit=2 → total:2, limit=3 → total:3).
    // 그대로 실으면 모델이 "강남에 카페가 2곳"으로 읽으므로 아예 뺀다.
    query: input.query,
    type,
    total: type === 'local' ? undefined : body.total,
    // 지역 검색은 5건이 상한이고 페이징이 없다 — 제약을 항상 실어, 적은 결과를
    // 검색 실패로 오해하거나 total 부재를 결함으로 읽지 않게 한다
    note:
      type === 'local'
        ? '지역 검색은 API 상한이 5건이고 페이징이 없다. 전체 업체 수는 이 API 로 알 수 없다(total 미제공)'
        : undefined,
    items: items.map((item) => slimItem(type, item)),
  });
  return { text: JSON.stringify(slim, null, 1), isError: false };
}
