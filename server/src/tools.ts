import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from './music-client.js';
import { DEFAULT_TTS_MODEL, DEFAULT_TTS_TEMPERATURE, DEFAULT_VOICE, TTS_VOICE_NAMES, VALID_TTS_MODELS } from './tts-client.js';

/**
 * 툴 표면 정의 (31종) — 조사 4종 + 공공데이터 5종 +
 * 생성 13종(이미지 2 + 영상 4 + 음성 3 + 음악 4) +
 * 플랫폼별 게시 5종 + 받은 댓글 3종 + 계정 점검 1종.
 *
 * 게시 툴 description 은 HITL 계약을 내장한다 — 이 서버에는 검토 게이트가 없어
 * 호출 = 즉시 공개 게시이므로, 사용자 승인 없이는 절대 호출하지 않도록 명시한다.
 *
 * 생성 툴은 fect-mcp-server 이식 — 이미지(gpt_image_*, OPENAI_API_KEY)는 gpt-image
 * 모듈, 영상(veo_*)·음성(tts_*)·음악(music_*)은 각각 video·tts·music 모듈이며 셋 다
 * GEMINI_API_KEY 를 쓴다. description 은 원문을 승계하되 이 서버에 없는 툴의 교차
 * 참조를 제거하고 쇼트폼 파이프라인 맥락(채널 프로파일 보이스·seed 고정)을 더했다
 * (키는 호출 시점 검증).
 *
 * 음성·조성·모드 목록은 각 클라이언트 모듈의 정본 상수에서 파생시킨다 — 30종짜리
 * 목록을 스키마에 복사해 두면 모델 추가 때 한쪽만 고쳐지는 사고가 난다.
 *
 * 모든 툴은 title(표시 이름)과 annotations(동작 힌트)를 단다. 특히 destructiveHint
 * 는 "호출 = 즉시 공개"라는 이 서버의 성질을 **클라이언트가 읽을 수 있는 형태**로
 * 옮긴 것이다 — description 산문은 모델만 읽고 승인 UI 는 읽지 못한다.
 * 판정 기준표는 docs/api-reference/mcp-tools.html §7 이 정본이다.
 */

/** Veo 공통 프로퍼티 정의 (Veo 3.1 계열) */
const VEO_MODEL_PROPERTY = {
  type: 'string',
  description:
    'Veo model (default: "veo-3.1-generate-preview"). fast = same features at 1/4 cost, lite = cheapest (1/8 cost) but no 4k/extension/reference support.',
  enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview'],
  default: 'veo-3.1-generate-preview',
} as const;

const VEO_RESOLUTION_PROPERTY = {
  type: 'string',
  description: 'Output resolution (default: "720p"). 1080p and 4k require durationSeconds=8; 4k is not supported by the lite model.',
  enum: ['720p', '1080p', '4k'],
  default: '720p',
} as const;

const VEO_DURATION_PROPERTY = {
  type: 'number',
  description: 'Clip length in seconds (default: 8). 1080p/4k output requires 8.',
  enum: [4, 6, 8],
  default: 8,
} as const;

/** TTS 공통 프로퍼티 정의 (Gemini TTS) — 목록은 tts-client.ts 정본에서 파생 */
const TTS_VOICE_ENUM = [...TTS_VOICE_NAMES];

const TTS_VOICE_PROPERTY = {
  type: 'string',
  description: `Voice to use (default: "${DEFAULT_VOICE}"). Call tts_list_voices for the personality of each.`,
  enum: TTS_VOICE_ENUM,
  default: DEFAULT_VOICE,
};

const TTS_MODEL_PROPERTY = {
  type: 'string',
  description:
    'TTS model (default: gemini-2.5-flash-preview-tts — cheapest, free tier). gemini-2.5-pro-preview-tts: higher quality, no free tier, and the fallback when flash keeps returning no audio for a script. gemini-3.1-flash-tts-preview: newest, streaming-capable, 2x price.',
  enum: [...VALID_TTS_MODELS],
  default: DEFAULT_TTS_MODEL,
};

const TTS_TEMPERATURE_PROPERTY = {
  type: 'number',
  description: `Sampling temperature 0–2 (default ${DEFAULT_TTS_TEMPERATURE} — recommended for take-to-take voice consistency in narration/briefing; use 0.6–0.7 for expressive storytelling; provider default is 1.0)`,
  minimum: 0,
  maximum: 2,
  default: DEFAULT_TTS_TEMPERATURE,
};

/** 음악 공통 프로퍼티 정의 (Lyria) — 조성·모드 목록은 music-client.ts 정본에서 파생 */
const MUSIC_SCALE_ENUM = [...MUSIC_SCALES];
const MUSIC_MODE_ENUM = [...MUSIC_GENERATION_MODES];

const MUSIC_DURATION_PROPERTY = {
  type: 'number',
  description: 'Duration of the generated music in seconds (5-300, default: 30)',
  minimum: 5,
  maximum: 300,
  default: 30,
};

/** 플랫폼별 게시 툴 공통 꼬리 — 완성본 계약 + 게시 후 보고 */
const SNS_HITL_LINE =
  '캡션·제목은 재가공 없이 그대로 게시된다 — 해시태그 포함 최종 문안을 넣을 것. 게시 후 응답의 permalink 를 사용자에게 보고한다.';

/**
 * 채널(브랜드) 선택 공통 프로퍼티 — data/<slug>/ 채널과 짝을 이루는
 * <SNS_TOKEN_DIR>/<slug>/ 토큰 디렉토리를 지정한다.
 */
const SNS_CHANNEL_PROPERTY = {
  type: 'string',
  pattern: '^[a-z0-9][a-z0-9-]{0,63}$',
  description:
    '채널(브랜드) slug — data/<slug>/ 와 동일한 kebab-case. 지정 시 <SNS_TOKEN_DIR>/<slug>/ 의 토큰만 쓰며 없으면 명시적 에러를 반환한다(기본 토큰 폴백 없음 — 오계정 게시 방지). 생략 시 기본(평면) 토큰 — 채널 디렉토리를 운영 중이면 반드시 지정할 것.',
} as const;

const SERP_QUOTA_LINE =
  '검색 1회 = SerpApi 크레딧 1건(무료 250회/월) — 동일 검색 반복 금지. 한국어 소재 리서치는 쿼터가 큰 naver_search(Naver Open API, 일 25,000회)를 우선 검토할 것.';

/**
 * MCP 동작 힌트 프리셋 (readOnly/destructive/idempotent/openWorld).
 *
 * 클라이언트가 "이 호출에 사용자 확인을 받아야 하나"를 판단하는 유일한 기계 판독
 * 근거다. 이 서버에는 게시 전 검토 게이트가 없어 호출이 곧 공개이므로, 그 사실을
 * description 산문으로만 적어두면 모델은 읽어도 클라이언트는 읽지 못한다.
 *
 * 판정 기준은 docs/api-reference/mcp-tools.html 의 판정표가 정본이다.
 */
const HINT = {
  /** 외부 조회 — 부작용 없음 */
  read: { readOnlyHint: true, openWorldHint: true },
  /** 서버 내장 상수 — API 호출조차 없다 */
  local: { readOnlyHint: true, openWorldHint: false },
  /** 로컬 파일 생성 — 기존 상태를 파괴하진 않지만 결과가 비결정론적이라 멱등도 아니다 */
  generate: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  /** 호출 즉시 외부 공개 · 재시도 = 중복 게시 */
  publish: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  /** 외부 상태 설정 — 즉시 반영되지만 반복해도 결과가 같다 */
  moderate: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
} as const;

/**
 * 게시·댓글 툴의 출력 스키마.
 *
 * MCP 는 outputSchema 를 선언한 서버가 그에 맞는 structuredContent 를 반환할 것을
 * MUST 로 요구한다. 따라서 **성공 경로에서 항상 채워지는 필드만** required 로 잡고,
 * 실패는 structuredContent 없이 isError 로만 반환한다 (handlers.fromApi).
 */
type OutputSchema = NonNullable<Tool['outputSchema']>;

const PERMALINK_PROPERTY = {
  type: 'string',
  description: '공개 게시물 URL. 게시는 성공했으나 permalink 조회만 실패하면 null (게시 재시도 금지 — 비멱등)',
};

const PLATFORM_PROPERTY = { type: 'string', description: '게시된 플랫폼' };

const publishOutput = (idKey: string, idDescription: string): OutputSchema => ({
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    [idKey]: { type: 'string', description: idDescription },
    permalink: PERMALINK_PROPERTY,
  },
  required: ['platform', idKey],
});

const YOUTUBE_PUBLISH_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    videoId: { type: 'string', description: '업로드된 영상 id' },
    permalink: { type: 'string', description: 'https://www.youtube.com/watch?v=<videoId>' },
    fileName: { type: 'string', description: '업로드한 로컬 파일명' },
    thumbnailSet: { type: 'boolean', description: 'thumbnailFilePath 를 준 경우에만 — 썸네일 설정 성공 여부' },
    thumbnailWarning: {
      type: 'string',
      description: '썸네일 설정만 실패했을 때의 사유. 영상 업로드는 성공한 상태이므로 재업로드 금지 — 이 툴만 다시 부르지 말고 YouTube Studio 에서 설정할 것',
    },
  },
  required: ['platform', 'videoId', 'permalink'],
};

const ACCOUNT_CHECK_OUTPUT: OutputSchema = {
  type: 'object',
  description: 'channel 지정 시 { channel, platforms }, 미지정 시 { channels, defaultTokens } 형태로 온다',
  properties: {
    channel: { type: 'string', description: '점검한 채널 slug (channel 지정 시)' },
    platforms: { type: 'object', description: '플랫폼별 { ok, account } 또는 { ok:false, reason }' },
    channels: { type: 'object', description: '채널 slug → 플랫폼별 점검 결과 (channel 미지정 시)' },
    defaultTokens: { description: '기본(평면) 토큰 점검 결과. 기본 토큰이 없으면 안내 문자열' },
  },
};

const COMMENT_INBOX_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '조회한 채널 slug (미지정이면 null)' },
    accounts: { type: 'object', description: '플랫폼별 토큰 소유 계정 정보' },
    summary: {
      type: 'object',
      description:
        'postsScanned · commentsFetched · actionable · byPlatform · withinGoldenHour(첫 60분 미응대 수) · oldestActionableMinutes · filters',
    },
    posts: { type: 'array', description: '게시물별 정규화 댓글 목록', items: { type: 'object' } },
    skipped: {
      type: 'array',
      description: '조회하지 못한 플랫폼과 사유 (자격증명 없음 · scope 부족 등)',
      items: { type: 'object' },
    },
  },
  required: ['summary', 'posts', 'skipped'],
};

const COMMENT_REPLY_OUTPUT: OutputSchema = {
  type: 'object',
  description: '답글 id 의 키 이름이 플랫폼마다 다르다 — THREADS=postId · FACEBOOK=commentId · INSTAGRAM=replyId',
  properties: {
    platform: PLATFORM_PROPERTY,
    postId: { type: 'string', description: 'THREADS — 답글도 하나의 게시물이다' },
    commentId: { type: 'string', description: 'FACEBOOK — 댓글에 단 대댓글 id' },
    replyId: { type: 'string', description: 'INSTAGRAM — 답글 id' },
    permalink: PERMALINK_PROPERTY,
  },
  required: ['platform'],
};

const COMMENT_MODERATE_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    commentId: { type: 'string', description: '대상 댓글 id' },
    action: { type: 'string', description: '적용한 동작' },
    done: { type: 'boolean', description: '플랫폼 반영 완료' },
  },
  required: ['platform', 'commentId', 'action', 'done'],
};

export const TOOLS: Tool[] = [
  // ── 자료조사·사실검증 ──────────────────────────────────────────
  {
    name: 'serp_web_search',
    title: 'Google 웹 검색 (SerpApi)',
    annotations: HINT.read,
    description: `Google 웹 검색 (SerpApi) — 스토리보드 저작 전 자료조사·사실검증용. 해외 자료는 gl/hl 로 국가·언어를 지정, 한국어 일반 자료는 gl=kr&hl=ko. 서버가 organic/answer_box/knowledge_graph/related_questions 만 추려 반환. ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '검색어 (site:, filetype: 등 연산자 지원)' },
        gl: { type: 'string', description: '국가 코드 2자, 예: kr, us, vn' },
        hl: { type: 'string', description: '언어 코드, 예: ko, en, vi' },
        location: { type: 'string', description: '결과 기준 지역명 (선택), 예: Seoul, South Korea' },
        num: { type: 'number', description: '결과 수 (기본 10, 최대 20)' },
        page: { type: 'number', description: '페이지 (1부터) — 첫 페이지에 근거가 없을 때만' },
        recency: {
          type: 'string',
          enum: ['hour', 'day', 'week', 'month', 'year'],
          description: '기간 필터 — 시효성 값(가격·기한·시행일) 검증 시 month/year 권장',
        },
      },
      required: ['q'],
    },
  },
  {
    name: 'serp_news_search',
    title: 'Google 뉴스 검색 (SerpApi)',
    annotations: HINT.read,
    description: `Google 뉴스 검색 (SerpApi) — 최신 동향·발표·시행 소식 확인용. 시효성 값(가격·기한·시행일)을 콘텐츠에 쓰기 전 교차 검증에 사용. 이 엔진에는 기간 필터·정렬 파라미터가 없다(검색어와 함께 쓸 수 없음) — 발표 시점으로 좁혀야 하면 serp_web_search 의 recency 나 naver_search(sort=date)를 쓸 것. ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '검색어' },
        gl: { type: 'string', description: '국가 코드 2자, 예: kr, us' },
        hl: { type: 'string', description: '언어 코드, 예: ko, en' },
        max_results: {
          type: 'number',
          description: '반환 기사 수 (기본 10, 최대 20). 이 엔진은 num/start 가 없어 서버가 응답을 잘라 주는 것이며, 값을 줄여도 과금은 검색 1회로 동일하다',
        },
      },
      required: ['q'],
    },
  },
  {
    name: 'serp_naver_search',
    title: 'Naver 검색 (SerpApi 경유)',
    annotations: HINT.read,
    description: `Naver 검색 (SerpApi 경유) — naver_search(공식 Open API)가 키 미설정·쿼터 소진일 때의 대체 경로. where=web(기본)|news. ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (NOT/OR/site: 연산자 지원)' },
        where: { type: 'string', enum: ['web', 'news'], description: '검색 유형 (기본 web)' },
        page: { type: 'number', description: '페이지 (1부터)' },
        sort_by: { type: 'string', enum: ['relevance', 'latest'], description: '정렬 (기본 relevance)' },
        max_results: { type: 'number', description: '반환 결과 수 (기본 10, 최대 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'naver_search',
    title: 'Naver 검색 (공식 Open API)',
    annotations: HINT.read,
    description:
      'Naver Open API 검색 (공식, 일 25,000회 무료) — 한국어 소재 리서치의 1차 도구. 뉴스·블로그·웹문서·카페글을 타입으로 선택한다. 한국 트렌드·실사용 후기·국내 뉴스는 Google 보다 이쪽이 정확하다. 서버가 <b> 하이라이트를 제거하고 title/link/description/date 만 추려 반환.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        type: {
          type: 'string',
          enum: ['news', 'blog', 'web', 'cafe'],
          description: 'news=뉴스(기본) | blog=블로그 후기 | web=웹문서 | cafe=카페글(실사용 여론)',
        },
        display: { type: 'number', description: '결과 수 (기본 10, 최대 30)' },
        start: { type: 'number', description: '시작 위치 (1부터) — 첫 페이지에 근거가 없을 때만' },
        sort: { type: 'string', enum: ['sim', 'date'], description: 'sim=정확도순(기본) | date=최신순 — web 타입은 미지원' },
      },
      required: ['query'],
    },
  },

  // ── 공공데이터포털 (data.go.kr) — 정부 공식 데이터 시드 수집 ──────
  {
    name: 'datago_search',
    title: '공공데이터 데이터셋 검색',
    annotations: HINT.read,
    description:
      '공공데이터포털(data.go.kr) 데이터셋 검색 (무인증·무쿼터) — 정부·공공기관 공식 통계·현황 데이터를 키워드로 찾는다. 콘텐츠의 수치 근거로는 기사 재인용보다 이 원천 데이터가 우선이다. type 생략 시 오픈API·파일데이터를 동시 검색. 결과의 publicDataPk+type 을 datago_detail 에 넘겨 수집 경로(다운로드 식별자·엔드포인트)를 얻는다. 검색어는 기관명·주제어 조합이 잘 듣는다 (예: "관광 통계", "소상공인 현황").',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '검색어 (주제어, 필요시 기관명 병기)' },
        type: { type: 'string', enum: ['API', 'FILE'], description: 'API=오픈API | FILE=파일데이터(CSV 등) — 생략 시 둘 다 검색' },
        page: { type: 'number', description: '페이지 (1부터)' },
        perPage: { type: 'number', description: '타입당 결과 수 (기본 10, 최대 20)' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'datago_detail',
    title: '공공데이터 데이터셋 상세',
    annotations: HINT.read,
    description:
      '공공데이터포털 데이터셋 상세 조회 (무인증) — FILE 이면 다운로드 식별자(publicDataDetailPk)와 odcloud API 경로를, API 면 엔드포인트 단서(스웨거·요청주소·활용가이드 문서 링크)를 추출한다. 메타(제공기관·수정일·업데이트 주기·이용허락범위)는 출처 표기와 시효 판단에 쓴다. publicDataPk 와 type 은 datago_search 응답값을 그대로 넘긴다.',
    inputSchema: {
      type: 'object',
      properties: {
        publicDataPk: { type: 'string', description: 'datago_search 응답의 publicDataPk (숫자 문자열)' },
        type: { type: 'string', enum: ['API', 'FILE'], description: 'datago_search 응답의 type' },
      },
      required: ['publicDataPk', 'type'],
    },
  },
  {
    name: 'datago_file_download',
    title: '공공데이터 파일 다운로드',
    annotations: HINT.generate,
    description:
      '공공데이터포털 파일데이터 원본 다운로드 (무인증) — CSV 등 실파일을 로컬에 저장하고 인코딩 판별 + 선두 6행 미리보기를 반환한다(100MB 상한). publicDataPk/publicDataDetailPk 는 datago_detail 응답값을 그대로 쓴다. 활용신청 없이 즉시 쓸 수 있는 가장 빠른 파일 수집 경로다. 미리보기 encoding 이 euc-kr 이면 Read 전에 iconv 변환이 필요하다. saveDir 는 주제 디렉토리(data/<채널>/<주제>/storyboard/) 하위를 권장 — 생략 시 임시 디렉토리에 저장된다.',
    inputSchema: {
      type: 'object',
      properties: {
        publicDataPk: { type: 'string', description: 'datago_detail 응답의 publicDataPk' },
        publicDataDetailPk: { type: 'string', description: 'datago_detail 응답의 publicDataDetailPk (uddi:… 전체 — 접미사 포함)' },
        saveDir: { type: 'string', description: '저장 디렉토리 절대 경로 (생략 시 OS 임시 디렉토리 하위 social-flow-datago/)' },
      },
      required: ['publicDataPk', 'publicDataDetailPk'],
    },
  },
  {
    name: 'datago_file_fetch',
    title: '공공데이터 파일 행 조회',
    annotations: HINT.read,
    description:
      '공공데이터포털 파일데이터를 odcloud JSON API 로 행 단위 조회 (인증키 + **해당 API 활용신청 필수**) — 파일 전체를 받지 않고 필요한 페이지만 가져온다. 대용량(수십 MB) 데이터셋에서 일부 행만 필요할 때 datago_file_download 대신 쓴다. -4 에러 = 이 API 에 활용신청이 안 된 키 — 포털에서 활용신청(자동승인) 후 재시도하거나 datago_file_download(무인증)로 대체할 것. publicDataPk/uddi 는 datago_detail 의 odcloudPath 구성값이다.',
    inputSchema: {
      type: 'object',
      properties: {
        publicDataPk: { type: 'string', description: 'datago_detail 응답의 publicDataPk' },
        uddi: { type: 'string', description: 'datago_detail 응답의 publicDataDetailPk (uddi:… 전체)' },
        page: { type: 'number', description: '페이지 (1부터)' },
        perPage: { type: 'number', description: '행 수 (기본 10, 최대 50)' },
      },
      required: ['publicDataPk', 'uddi'],
    },
  },
  {
    name: 'datago_api_call',
    title: '공공데이터 표준 오픈API 호출',
    annotations: HINT.read,
    description:
      '공공데이터포털 표준 오픈API(apis.data.go.kr) 호출 (인증키 + **해당 API 활용신청 필수**) — path 이하 경로에 파라미터와 serviceKey 를 자동 조립해 GET 호출한다. path·파라미터 계약은 datago_detail 의 endpoint/requestUrls 또는 활용가이드(docs)에서 먼저 확인할 것 — 파라미터를 추측해 반복 호출하지 않는다(일일 트래픽 소진). 응답이 XML 인 API 가 많다 — dataType/_type=JSON 파라미터를 지원하는 API 는 JSON 을 요청할 것. 인증 거부 시 활용신청 여부부터 확인.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'apis.data.go.kr 이하 경로 (예: 1360000/VilageFcstInfoService_2.0/getUltraSrtNcst)' },
        params: {
          type: 'object',
          additionalProperties: { type: ['string', 'number', 'boolean'] },
          description: '쿼리 파라미터 (serviceKey 는 서버가 주입 — 넣지 말 것)',
        },
      },
      required: ['path'],
    },
  },

  // ── 이미지 생성 (OpenAI GPT Image — fect-mcp gpt-image 모듈 이식) ──
  {
    name: 'gpt_image_text2img',
    title: '이미지 생성 (텍스트 → 이미지)',
    annotations: HINT.generate,
    description: `Generate an image from a text prompt using OpenAI GPT Image models.

Use when the user asks to create, draw, generate, or make an image, picture, photo, banner, illustration, or thumbnail from a description (이미지 생성, 그림 그려줘). Strengths: reliable text rendering inside the image (posters, labels, UI mockups, signage), strong photorealism, and exact custom WIDTHxHEIGHT resolutions (e.g. "1088x1920" for 9:16 — gpt-image-2 only, edges multiple of 16).
Do NOT use to edit or compose existing images — use gpt_image_img2img.
Note: gpt-image-2 (default) does NOT support transparent backgrounds; transparent requires the deprecated gpt-image-1/1.5 and png/webp output. Size/quality/background constraints are enforced per model — see each parameter.

Returns: the generated image as MCP image content (always base64), plus a text block with model, size, quality, and the saved file path when savePath is given.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt (max 32,000 characters)',
          maxLength: 32000,
        },
        model: {
          type: 'string',
          description: 'OpenAI GPT Image model (default: "gpt-image-2")',
          enum: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'],
          default: 'gpt-image-2',
        },
        size: {
          type: 'string',
          description:
            'Output size (default: "auto"). Presets: "1024x1024" / "1536x1024" / "1024x1536" / "auto". Custom "WIDTHxHEIGHT" is gpt-image-2 only (edges multiple of 16, aspect 1:3–3:1, max edge 3840px, total pixels 655,360–8,294,400).',
          default: 'auto',
        },
        quality: {
          type: 'string',
          description: 'Generation quality (default: "auto")',
          enum: ['low', 'medium', 'high', 'auto'],
          default: 'auto',
        },
        background: {
          type: 'string',
          description:
            'Background mode (default: "opaque"). "transparent" is NOT supported by gpt-image-2 (use gpt-image-1 / gpt-image-1.5) and requires a png or webp output.',
          enum: ['opaque', 'transparent', 'auto'],
          default: 'opaque',
        },
        outputFormat: {
          type: 'string',
          description: 'Output image format (default: "png")',
          enum: ['png', 'jpeg', 'webp'],
          default: 'png',
        },
        savePath: {
          type: 'string',
          description: 'Absolute file path to save the generated image. Supports .png/.jpg/.jpeg/.gif/.webp/.bmp. Parent directories are created automatically.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'gpt_image_img2img',
    title: '이미지 편집·합성 (이미지 → 이미지)',
    annotations: HINT.generate,
    description: `Edit or compose images using OpenAI GPT Image models (multi-reference + optional mask).

Use when the user asks to inpaint a masked region, combine multiple reference images (1-16 via sourceImagesBase64) into one output, or edit while preserving fine input details such as faces and logos (이미지 합성, 인페인팅, 이미지 수정, 배경 교체).
Do NOT use for text-to-image from scratch — use gpt_image_text2img.
Mask: optional PNG with alpha channel, same dimensions as the first source image; fully transparent pixels are the regions to regenerate (applied to the first image only). gpt-image-2 (default) always runs at high input fidelity — do not pass inputFidelity for it.

Returns: the edited image as MCP image content (always base64, in the requested outputFormat), plus a text block with model, size, quality, mask/fidelity flags, and the saved file path when savePath is given.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Edit / composition prompt (max 32,000 characters)',
          maxLength: 32000,
        },
        sourceImagesBase64: {
          type: 'array',
          description: 'Base64-encoded reference images (1 to 16 entries)',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 16,
        },
        sourceMimeType: {
          type: 'string',
          description: 'MIME type of each source image (default: "image/png")',
          enum: ['image/png', 'image/jpeg', 'image/webp'],
          default: 'image/png',
        },
        maskBase64: {
          type: 'string',
          description: 'Optional base64-encoded PNG mask with alpha channel; transparent pixels are repainted. Must match the first source image dimensions.',
        },
        model: {
          type: 'string',
          description: 'OpenAI GPT Image model (default: "gpt-image-2")',
          enum: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'],
          default: 'gpt-image-2',
        },
        size: {
          type: 'string',
          description:
            'Output size (default: "auto"). Presets: "1024x1024" / "1536x1024" / "1024x1536" / "auto". Custom "WIDTHxHEIGHT" is gpt-image-2 only (edges multiple of 16, aspect 1:3–3:1, max edge 3840px, total pixels 655,360–8,294,400).',
          default: 'auto',
        },
        quality: {
          type: 'string',
          description: 'Generation quality (default: "auto")',
          enum: ['low', 'medium', 'high', 'auto'],
          default: 'auto',
        },
        background: {
          type: 'string',
          description:
            'Background mode (default: "opaque"). "transparent" is NOT supported by gpt-image-2 (use gpt-image-1 / gpt-image-1.5) and requires a png or webp output.',
          enum: ['opaque', 'transparent', 'auto'],
          default: 'opaque',
        },
        outputFormat: {
          type: 'string',
          description: 'Output image format (default: "png")',
          enum: ['png', 'jpeg', 'webp'],
          default: 'png',
        },
        inputFidelity: {
          type: 'string',
          description: 'How strongly to preserve fine details (faces, logos, layout) of the input images. Only for gpt-image-1 / gpt-image-1.5 (API default: "low"). Do NOT set for gpt-image-2 (always high fidelity, parameter rejected) or gpt-image-1-mini (unsupported).',
          enum: ['high', 'low'],
        },
        savePath: {
          type: 'string',
          description: 'Absolute file path to save the edited image. Supports .png/.jpg/.jpeg/.gif/.webp/.bmp.',
        },
      },
      required: ['prompt', 'sourceImagesBase64'],
    },
  },

  // ── 영상 생성 (Google Veo 3.1 — fect-mcp video 모듈 이식) ──────────
  {
    name: 'veo_text2video',
    title: '영상 생성 (텍스트 → 영상)',
    annotations: HINT.generate,
    description: `Generate a video with native audio from a text prompt using Google Veo 3.1.

Use when the user asks to create, generate, or make a video, clip, footage, or short ad from a description alone (비디오 생성, 영상 만들어줘). Audio is generated natively: wrap dialogue in double quotes, and describe SFX ("engine roaring") and ambient sound explicitly in the prompt.
Do NOT use when a source visual exists — use veo_img2video to animate a still image, veo_extension to continue a Veo-generated video, or veo_reference to keep a specific subject consistent from photos.
Cost lever: default model is top quality ($0.40/s at 720p); fast is 1/4 the cost, lite is 1/8 (no 4k). Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, model, aspect ratio, resolution, and duration in seconds. Videos carry an invisible SynthID watermark.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Descriptive text prompt for video generation (English recommended)',
        },
        model: VEO_MODEL_PROPERTY,
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9")',
          enum: ['16:9', '9:16'],
          default: '16:9',
        },
        resolution: VEO_RESOLUTION_PROPERTY,
        durationSeconds: VEO_DURATION_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'veo_img2video',
    title: '영상 생성 (이미지 → 영상)',
    annotations: HINT.generate,
    description: `Animate a still image into a video (first frame, or first+last frame interpolation) using Google Veo 3.1.

Use when the user provides an image to bring to life, animate, or add motion to (이미지로 영상 만들기) — e.g. animate a product photo. Provide sourceImagePath as the first frame; optionally add lastImagePath for a smooth transition between two images. The prompt should describe the desired motion.
Do NOT use for pure text-to-video (use veo_text2video), continuing an existing video (use veo_extension), or subject consistency from reference photos (use veo_reference).
Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, source/last frame image paths, model, aspect ratio, resolution, and duration in seconds.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for video animation/motion',
        },
        sourceImagePath: {
          type: 'string',
          description: 'Absolute path to the first frame (starting) image file',
        },
        lastImagePath: {
          type: 'string',
          description: 'Optional: Absolute path to the last frame (ending) image file. When provided, the video will smoothly transition from the first image to this last image.',
        },
        model: VEO_MODEL_PROPERTY,
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9")',
          enum: ['16:9', '9:16'],
          default: '16:9',
        },
        resolution: VEO_RESOLUTION_PROPERTY,
        durationSeconds: VEO_DURATION_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'sourceImagePath'],
    },
  },
  {
    name: 'veo_extension',
    title: '영상 연장 (+7초)',
    annotations: HINT.generate,
    description: `Extend a Veo-generated video by adding 7 seconds of new content per call.

Use when the user asks to continue, lengthen, or extend a video that was previously generated by Veo (비디오 연장, 이어서 만들기). Up to 20 extensions per video; input must be a Veo output at 720p, 16:9 or 9:16, and 141 seconds or shorter.
Do NOT use on videos not generated by Veo, and do NOT use the lite model (unsupported). For a brand-new scene use veo_text2video instead.
Output is always 720p and follows the input video's aspect ratio. Voice cannot be effectively extended if absent from the last 1 second of the input. Takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, source video path, model, resolution, and the added duration (+7 seconds).`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for the video continuation',
        },
        sourceVideoPath: {
          type: 'string',
          description: 'Absolute path to the source video file to extend (must be a Veo-generated 720p video, 141 seconds or shorter)',
        },
        model: {
          type: 'string',
          description: 'Veo model (default: "veo-3.1-generate-preview"). The lite model does NOT support extension.',
          enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'],
          default: 'veo-3.1-generate-preview',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the extended video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the extended video (default: video_extended_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'sourceVideoPath'],
    },
  },
  {
    name: 'veo_reference',
    title: '영상 생성 (참조 이미지 · 8초 고정)',
    annotations: HINT.generate,
    description: `Generate an 8-second video that keeps subjects from 1-3 reference images consistent, using Google Veo 3.1.

Use when the user wants a video featuring a specific person, character, product, or garment shown in reference photos — fashion videos, brand/product marketing, consistent character animation (캐릭터 일관성, 제품 영상). Provide 1-3 clear, well-lit reference images (multiple angles improve consistency) and a detailed prompt describing the scene and interactions.
Do NOT use the lite model (unsupported). To animate a single image as-is use veo_img2video; for free-form generation use veo_text2video.
Duration is fixed at 8 seconds when reference images are used. Takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, reference image list, model, aspect ratio, resolution, and duration.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed text description of the video scene and subject interactions',
        },
        referenceImagePaths: {
          type: 'array',
          items: {
            type: 'string',
          },
          minItems: 1,
          maxItems: 3,
          description: 'Array of 1-3 absolute paths to reference images. These images guide the video generation to preserve subject appearance.',
        },
        model: {
          type: 'string',
          description: 'Veo model (default: "veo-3.1-generate-preview"). The lite model does NOT support reference images.',
          enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'],
          default: 'veo-3.1-generate-preview',
        },
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9")',
          enum: ['16:9', '9:16'],
          default: '16:9',
        },
        resolution: VEO_RESOLUTION_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_ref_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'referenceImagePaths'],
    },
  },

  // ── 음성 합성 (Google Gemini TTS — fect-mcp tts 모듈 이식) ─────────
  {
    name: 'tts_generate',
    title: '음성 합성 (단일 화자)',
    annotations: HINT.generate,
    description: `Convert text to single-voice speech audio using Google Gemini TTS.

Use when the user asks to read text aloud, narrate, voice-over, or convert text to speech/audio (음성 변환, TTS, 나레이션). 30 voices; 90+ languages are auto-detected from the input text itself (there is no language parameter) — Korean, English, Japanese, Vietnamese and both Simplified (zh-CN) and Traditional (zh-TW) Chinese are all supported. Control delivery with stylePrompt (e.g. "Say cheerfully", "In a spooky whisper").
Do NOT use for two-person dialogue scripts — use tts_multi_speaker. Unsure which voice fits? Call tts_list_voices first.
Keep voiceName/stylePrompt/temperature byte-identical across takes of one video — the model re-interprets any wording change and the narrator's voice drifts between cuts. If a script fails repeatedly (the server already retries 3x), switch model to gemini-2.5-pro-preview-tts rather than rewording it.

Returns: a text block with the saved .wav file path, voice name, and text length.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to convert to speech (max 16,000 characters — split longer scripts)',
          maxLength: 16000,
        },
        voiceName: TTS_VOICE_PROPERTY,
        model: TTS_MODEL_PROPERTY,
        stylePrompt: {
          type: 'string',
          description: 'Optional style instruction (e.g., "Say cheerfully", "In a whisper", "With excitement")',
        },
        temperature: TTS_TEMPERATURE_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: tts_<timestamp>.wav)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'tts_multi_speaker',
    title: '음성 합성 (2인 대화)',
    annotations: HINT.generate,
    description: `Convert a dialogue script into multi-speaker audio (max 2 voices) using Google Gemini TTS.

Use when the user wants a conversation, interview, or podcast-style dialogue voiced by distinct speakers (대화 음성, 팟캐스트 오디오). Script lines are prefixed with speaker names ("Joe: Hello!\\nJane: Hi!"), and each name must match an entry in the speakers array with its assigned voice.
Do NOT use for a single narrator — use tts_generate. Maximum 2 speakers; each needs a unique voice.

Returns: a text block with the saved .wav file path, speaker/voice assignments, and script length.`,
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Conversation script with speaker names (e.g., "Joe: Hello!\\nJane: Hi there!"). Every speaker name used here must match a speakerName in the speakers array. Max 16,000 characters — split longer scripts.',
          maxLength: 16000,
        },
        speakers: {
          type: 'array',
          description: 'Array of speaker configurations (max 2 speakers)',
          items: {
            type: 'object',
            properties: {
              speakerName: {
                type: 'string',
                description: 'Name of the speaker (must match names used in the script)',
              },
              voiceName: {
                type: 'string',
                description: 'Voice to use for this speaker',
                enum: TTS_VOICE_ENUM,
              },
            },
            required: ['speakerName', 'voiceName'],
          },
          minItems: 1,
          maxItems: 2,
        },
        model: TTS_MODEL_PROPERTY,
        stylePrompt: {
          type: 'string',
          description: 'Optional style instruction for the overall conversation (e.g., "Make Speaker1 sound tired, Speaker2 excited")',
        },
        temperature: TTS_TEMPERATURE_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: tts_multi_<timestamp>.wav)',
        },
      },
      required: ['script', 'speakers'],
    },
  },
  {
    name: 'tts_list_voices',
    title: 'TTS 음성 목록',
    annotations: HINT.local,
    description: `List all 30 available TTS voices with their personality/style traits.

Use before tts_generate or tts_multi_speaker when the user has not specified a voice, or asks what voices are available (목소리 종류). Read-only; makes no API call.
Do NOT use to generate audio — use tts_generate or tts_multi_speaker. The list is static; one call per session is enough. When the channel profile (data/<slug>/profile.md) already fixes a TTS voice, use that instead of picking a new one.

Returns: a text list of 30 voice names, each with a one-line personality/style description (e.g. "Kore — Firm").`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── 음악 생성 (Google Lyria — fect-mcp music 모듈 이식) ────────────
  {
    name: 'music_generate_clip',
    title: '음악 생성 (30초 클립)',
    annotations: HINT.generate,
    description: `Generate a fixed 30-second music clip from a text prompt using Google Lyria 3 (batch, single call).

Use as the DEFAULT for short-form BGM, jingles, and post background music (배경음악, BGM) — cheaper ($0.04/clip) and simpler than the streaming tools. Lyria 3 has no structured parameters: describe genre, instruments, BPM, key, mood, and structure in natural language inside the prompt, optionally with section tags ([Intro] [Verse] [Chorus] [Outro]) or timestamps ("[0:00 - 0:10] Intro: ..."). Can generate vocals and lyrics — add "instrumental only, no vocals" to the prompt if unwanted. Output carries a SynthID audio watermark.
If the request is blocked for "an unspecified policy reason", that is prompt filtering, not a bug — reword the prompt more plainly and retry once rather than repeating the same text.
Do NOT use when an exact non-30s duration is required, or when the same music must be reproducible — use music_generate / music_generate_advanced (seed) instead. Non-deterministic: the same prompt returns different music each call, so store signature BGM as a reusable asset.

Returns: a text block with the saved .mp3 file path (44.1kHz stereo, exactly 30 seconds).`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Natural-language description including genre, instruments, BPM, key, mood (e.g., "Calm lo-fi hip hop, 80 BPM, C major, soft piano and vinyl crackle, instrumental only")',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: music_clip_<timestamp>.mp3)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'music_generate',
    title: '음악 생성 (길이 지정)',
    annotations: HINT.generate,
    description: `Generate instrumental music from a text prompt using Google Lyria RealTime (streaming).

Use when the requested duration must be controlled (5-300s) — e.g. matching a narration length. For standard 30-second short-form BGM, prefer music_generate_clip (cheaper, single call). Optionally constrain genre, mood, instruments, BPM (60-200). Genre/mood/instrument values are free text — music_list_options shows suggestions, not a closed list.
Do NOT use for vocals or lyrics — Lyria RealTime is instrumental-only. For blending multiple weighted musical ideas or tuning density/brightness/seed, use music_generate_advanced.
For BGM under narration, say so in the prompt (e.g. "leaves space for a spoken voiceover, no melody in the vocal frequency range").

Returns: a text block with the saved .wav file path (48kHz stereo 16-bit PCM), duration, and applied settings.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the music to generate (e.g., "upbeat electronic dance music")',
        },
        genre: {
          type: 'string',
          description: 'Optional genre — free text (e.g., "Jazz", "Synthwave", "Bossa Nova"); see music_list_options for suggestions',
        },
        mood: {
          type: 'string',
          description: 'Optional mood/atmosphere — free text (e.g., "Energetic", "Calm", "Epic")',
        },
        instruments: {
          type: 'array',
          description: 'Optional array of instruments — free text (e.g., "Piano", "303 Acid Bass")',
          items: { type: 'string' },
        },
        durationSeconds: MUSIC_DURATION_PROPERTY,
        bpm: {
          type: 'number',
          description: 'Beats per minute (60-200)',
          minimum: 60,
          maximum: 200,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: music_<timestamp>.wav)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'music_generate_advanced',
    title: '음악 생성 (가중 프롬프트 · 세부 제어)',
    annotations: HINT.generate,
    description: `Generate instrumental music by blending multiple weighted prompts with fine-grained controls (Google Lyria RealTime).

Use when the request needs blended musical ideas — e.g. [{"text": "jazz piano", "weight": 1.0}, {"text": "electronic beats", "weight": 0.5}] — or fine tuning of guidance, density, brightness, temperature, scale (key), seed (reproducibility), or bass/drum controls. seed is the ONLY way to regenerate the same music (Lyria 3 Clip has no seed) — record the seed of a channel's signature BGM to keep later episodes consistent.
Do NOT use for a simple single-idea request — music_generate is sufficient and simpler. No vocals or lyrics (Lyria RealTime is instrumental-only).

Returns: a text block with the saved .wav file path (48kHz stereo 16-bit PCM), duration, and the applied prompt weights/config.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          description: 'Array of weighted prompts to blend',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Musical description (e.g., "minimal techno", "jazz piano")',
              },
              weight: {
                type: 'number',
                description: 'Weight for this prompt — any non-zero value (0 is invalid; 1.0 is the typical starting point; larger = stronger influence)',
                default: 1.0,
              },
            },
            required: ['text'],
          },
          minItems: 1,
        },
        durationSeconds: MUSIC_DURATION_PROPERTY,
        config: {
          type: 'object',
          description: 'Optional generation configuration',
          properties: {
            guidance: {
              type: 'number',
              description: 'Prompt adherence (0.0-6.0, default: 4.0)',
              minimum: 0,
              maximum: 6,
              default: 4.0,
            },
            bpm: {
              type: 'number',
              description: 'Beats per minute (60-200)',
              minimum: 60,
              maximum: 200,
            },
            scale: {
              type: 'string',
              description: 'Musical key/scale. Each value covers both the major key and its relative minor.',
              enum: MUSIC_SCALE_ENUM,
            },
            density: {
              type: 'number',
              description: 'Note density (0.0-1.0)',
              minimum: 0,
              maximum: 1,
            },
            brightness: {
              type: 'number',
              description: 'Tonal brightness (0.0-1.0)',
              minimum: 0,
              maximum: 1,
            },
            temperature: {
              type: 'number',
              description: 'Creativity level (0.0-3.0; model default 1.1 when omitted)',
              minimum: 0,
              maximum: 3,
            },
            topK: {
              type: 'number',
              description: 'Sampling constraint (1-1000, model default 40)',
              minimum: 1,
              maximum: 1000,
            },
            seed: {
              type: 'number',
              description: 'Random seed (0-2147483647). The only way to reproduce the same music for a channel signature BGM.',
              minimum: 0,
              maximum: 2147483647,
            },
            muteBass: {
              type: 'boolean',
              description: 'Reduce bass elements',
              default: false,
            },
            muteDrums: {
              type: 'boolean',
              description: 'Reduce drum elements',
              default: false,
            },
            onlyBassAndDrums: {
              type: 'boolean',
              description: 'Generate only the rhythm section (bass and drums)',
              default: false,
            },
            musicGenerationMode: {
              type: 'string',
              description: 'QUALITY (default) | DIVERSITY | VOCALIZATION (treats vocalizations as an instrument — still no lyrics)',
              enum: MUSIC_MODE_ENUM,
            },
          },
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file',
        },
      },
      required: ['prompts'],
    },
  },
  {
    name: 'music_list_options',
    title: '음악 옵션 목록',
    annotations: HINT.local,
    description: `List suggested genres, moods, and instruments for music generation.

Use when the user asks what music styles are available (장르 목록) or wants inspiration. The lists are SUGGESTIONS, not a closed set — all music tools accept free-text descriptions beyond these. Read-only; makes no API call.
Do NOT use to generate music — use music_generate_clip, music_generate, or music_generate_advanced. The list is static; one call per session is enough.

Returns: categorized text lists — 32 genres, 25 moods, 22 instruments (non-exhaustive).`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── 자사 SNS 직접 게시 (플랫폼별 툴 — 로컬 자격증명, 즉시 공개) ──────
  // 자격증명 파일이 있는 플랫폼의 툴만 ListTools 에 노출된다 (index.ts + SNS_PLATFORM_BY_TOOL).
  // 멀티 채널: channel(브랜드 slug) 지정 시 <SNS_TOKEN_DIR>/<slug>/ 토큰만 사용(폴백 없음).
  {
    name: 'threads_publish',
    title: '⚠️ Threads 게시 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: publishOutput('postId', 'Threads 게시물 id — 링크 답글의 replyToId 로 그대로 넘긴다'),
    description:
      `⚠️ Threads 직접 게시 — 로컬 토큰으로 Threads API 에 **즉시 공개 게시**한다(게시 계정은 토큰의 /me 로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·미디어를 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 이 툴이 지원하는 형태는 텍스트 또는 이미지 1장이다 — 플랫폼 자체는 영상·캐러셀도 지원하지만, 이 파이프라인은 영상을 YouTube·릴스로 내보내고 Threads 에는 커버 이미지 본문 + 풀영상 링크 답글로 유입을 만드는 전략을 쓴다. 본문 링크 금지 플랫폼 규칙: 링크는 본문이 아니라 게시 성공 직후 응답 postId 를 replyToId 로 넣은 답글로 이어서 게시한다. 게시 쿼터는 24시간당 250건. ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: {
          type: 'string',
          description:
            '게시 본문 완성본 ≤500자 (해시태그는 ≤1개 권장 — 랭킹 가중치 0). 이모지는 플랫폼이 UTF-8 바이트로 세므로 1자보다 크게 계산된다',
        },
        imageUrl: { type: 'string', format: 'uri', description: '공개 접근 가능한 이미지 URL 1장 (플랫폼이 크롤 — 로컬 경로 불가)' },
        replyToId: { type: 'string', description: '이 게시물 id 에 대한 답글로 게시 (자기 답글 체인 — 링크는 본문이 아닌 답글에)' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'instagram_publish',
    title: '⚠️ Instagram 게시 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: publishOutput('mediaId', 'Instagram 미디어 id'),
    description:
      `⚠️ Instagram 직접 게시 — 로컬 토큰으로 IG API 에 **즉시 공개 게시**한다(게시 계정은 토큰의 /me 로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·미디어를 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 이미지 1~10장(2장 이상 캐러셀) **또는** 릴스 영상 1개(imageUrls 와 배타). 이미지는 **JPEG 만** 받는다(PNG·MPO·JPS 거부). 게시 후 이미지 교체 불가(캡션만 수정 가능). 게시 쿼터는 24시간 이동 구간당 100건(캐러셀은 1건). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: '게시 캡션 완성본 ≤2200자 (첫 125자가 훅 — 캡션 내 링크는 클릭 불가)' },
        imageUrls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: '공개 접근 가능한 이미지 URL 1~10장 (2장 이상이면 캐러셀 — 첫 장 비율 기준 강제 크롭). videoUrl 과 동시 사용 불가',
        },
        videoUrl: { type: 'string', format: 'uri', description: '릴스 영상 공개 URL 1개 (.mp4/.mov) — imageUrls 와 동시 사용 불가' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'facebook_publish',
    title: '⚠️ Facebook 페이지 게시 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: publishOutput('postId', 'Facebook 게시물 id (<pageId>_<postId>) — facebook_comment 의 postId 로 그대로 넘긴다'),
    description:
      `⚠️ Facebook 페이지 직접 게시 — 로컬 페이지 토큰으로 Graph API 에 **즉시 공개 게시**한다(게시 페이지는 토큰의 /me 로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·미디어를 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 형태: 텍스트 / 이미지 ≤10장 / 영상 1개(일반 영상 — 릴스 아님). 원문 링크는 본문(linkUrl)이 아니라 게시 성공 직후 facebook_comment 첫 댓글로 **반드시** 단다. ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: '게시 본문 완성본 ≤5000자' },
        imageUrls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: '공개 접근 가능한 이미지 URL ≤10장 — videoUrl 과 동시 사용 불가',
        },
        videoUrl: { type: 'string', format: 'uri', description: '영상 공개 URL 1개 (.mp4/.mov) — imageUrls 와 동시 사용 불가' },
        linkUrl: { type: 'string', format: 'uri', description: '(예외용) 링크 첨부 — 텍스트 게시(미디어 없음)에서만. 기본 규칙은 링크를 facebook_comment 첫 댓글로 다는 것' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'facebook_comment',
    title: '⚠️ Facebook 댓글 작성 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: publishOutput('commentId', 'Facebook 댓글 id'),
    description:
      `⚠️ Facebook 페이지 댓글 직접 작성 — 페이지 토큰으로 자기 게시물에 **즉시 공개 댓글**을 단다(작성 주체는 페이지 자신). 별도 검토 게이트가 없으므로 반드시 사용자가 승인한 최종 문안만 게시한다(HITL — 승인 없이 호출 금지). 핵심 용도: facebook_publish 성공 직후 원문 링크를 **첫 댓글**로 다는 링크 규칙(본문 링크 대신 첫 댓글 — FB 댓글 링크는 클릭 가능·프리뷰 렌더). postId 는 facebook_publish 응답의 postId 를 그대로 쓴다. 댓글만 실패했으면 이 툴만 재시도한다(본문 재게시 금지 — 게시 API 비멱등). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'facebook_publish 응답의 postId (<pageId>_<postId> 형식)' },
        message: { type: 'string', description: '댓글 완성본 ≤8000자 — 원문 링크 + 한 줄 안내 문구' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['postId', 'message'],
    },
  },
  {
    name: 'youtube_publish',
    title: '⚠️ YouTube 업로드 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: YOUTUBE_PUBLISH_OUTPUT,
    description:
      `⚠️ YouTube 직접 게시 — 로컬 OAuth 리프레시 토큰으로 **로컬 영상 파일을 즉시 공개 업로드**한다(대상 채널은 토큰 소유 계정으로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·영상을 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 세로 9:16·3분 이하 영상은 쇼츠로 자동 분류(별도 플래그 없음). 유일하게 공개 URL 호스팅이 불필요한 플랫폼이다(파일 직접 업로드). 업로드는 videos.insert 전용 "Video Uploads" 쿼터 버킷을 쓴다 — 호출당 1유닛·기본 일 100회이므로 회차 게시를 아낄 이유가 없다(과거의 "1,600유닛/일 6건" 제한은 2026년 쿼터 개편으로 사라졌다). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        videoFilePath: { type: 'string', description: '업로드할 로컬 영상 파일 절대 경로 (.mp4/.mov)' },
        title: { type: 'string', description: '영상 제목 ≤100자 (꺾쇠 <> 금지) — 키워드형 권장(쇼츠는 제목 검색 노출 비중이 큼)' },
        caption: { type: 'string', description: '영상 설명(description) 완성본 ≤5000자 — 첫 줄 요약 + 핵심 포인트 + 해시태그(#Shorts 포함 3~5개)' },
        thumbnailFilePath: {
          type: 'string',
          description:
            '커버 스틸 절대 경로 (.jpg/.png ≤2MB) — 필수 권장: 미지정 시 쇼츠는 YouTube 가 임의 프레임을 썸네일로 뽑아 제목 커버가 안 보인다. 채널에 전화번호 인증(중급 기능)이 없으면 지정이 거부되며 게시는 성공하고 thumbnailWarning 으로 보고된다',
        },
        privacyStatus: {
          type: 'string',
          enum: ['public', 'unlisted', 'private'],
          description: '공개 범위 (기본 public)',
        },
        categoryId: {
          type: 'string',
          description:
            'YouTube 카테고리 id (기본 "22" = People & Blogs). 추천·탐색 분류에 쓰이므로 채널 성격에 맞춰 지정할 것 — 24=Entertainment, 25=News & Politics, 26=Howto & Style, 27=Education, 28=Science & Technology.',
        },
        madeForKids: {
          type: 'boolean',
          description:
            '아동용 콘텐츠 자기 선언(COPPA, 기본 false). 영상이 아동 대상이면 반드시 true 로 지정할 것 — 허위 선언은 채널 제재 사유이며, true 면 댓글·개인화 광고가 비활성화된다.',
          default: false,
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['videoFilePath', 'title', 'caption'],
    },
  },

  // ── 받은 댓글 관리 (인박스 → 답글 → 숨김) ────────────────────────
  // 플랫폼 횡단 툴이라 SNS_CHANNEL_BY_TOOL 게이트를 걸지 않는다 — 미설정 플랫폼은
  // skipped 에 사유와 함께 실려 나온다 (sns_account_check 와 같은 취급).
  {
    name: 'sns_comment_inbox',
    title: '받은 댓글 인박스',
    annotations: HINT.read,
    outputSchema: COMMENT_INBOX_OUTPUT,
    description:
      '받은 댓글 인박스 — Threads·Instagram·Facebook 최근 게시물의 댓글·대댓글을 한 번에 모아 정규화 목록으로 반환한다(읽기 전용, 부작용 없음). 기본값은 **우리가 아직 답하지 않은 남의 댓글만**(includeOwn/includeAnswered=false) — "이미 답했는가"는 추측이 아니라 플랫폼 필드(Threads is_reply_owned_by_me · IG username 일치 · FB from.id==pageId)로 판정하므로 중복 답글이 나가지 않는다. 각 댓글에 ageMinutes 가 실려 오며 summary.withinGoldenHour 는 첫 60분 안에 남은 미응대 수다(답글 속도가 확산을 좌우 — 이 값이 0 이 아니면 최우선 처리). 응답의 commentId 를 sns_comment_reply/sns_comment_moderate 에 그대로 넘긴다. YouTube 는 토큰 scope 부족으로 제외된다.',
    inputSchema: {
      type: 'object',
      properties: {
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK'] },
          description: '조회할 플랫폼 (생략 시 자격증명이 있는 3개 플랫폼 전부)',
        },
        channel: SNS_CHANNEL_PROPERTY,
        postLimit: { type: 'number', description: '플랫폼당 훑을 최근 게시물 수 (기본 5, 최대 25)' },
        commentLimit: { type: 'number', description: '게시물당 가져올 댓글 수 (기본 50, 최대 100)' },
        sinceHours: { type: 'number', description: '이 시간 이내 댓글만 (예: 24 — 생략 시 전체)' },
        includeAnswered: { type: 'boolean', description: '우리가 이미 답한 댓글도 포함 (기본 false — 스레드 전체 맥락이 필요할 때만 true)' },
        includeOwn: { type: 'boolean', description: '우리 계정이 쓴 댓글도 포함 (기본 false — 대화 흐름 확인용)' },
      },
    },
  },
  {
    name: 'sns_comment_reply',
    title: '⚠️ 받은 댓글에 답글 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: COMMENT_REPLY_OUTPUT,
    description:
      `⚠️ 받은 댓글에 답글 작성 — 로컬 토큰으로 **즉시 공개 답글**을 단다(작성 주체는 브랜드 계정 자신). 별도 검토 게이트가 없으므로 사용자가 승인한 최종 문안만 게시한다(HITL — 승인 없이 호출 금지). commentId 는 sns_comment_inbox 응답값을 그대로 쓴다. 플랫폼별 계약: THREADS 는 reply_to_id 를 단 새 게시물이 곧 답글이라 대댓글의 대댓글까지 자유롭게 이어진다 / INSTAGRAM 은 **최상위 댓글에만** 답글이 붙는다(대댓글에 답하려면 그 부모 commentId 를 넘길 것 — parentCommentId 가 있는 댓글은 그 값을 사용) / FACEBOOK 은 댓글 id 에 다는 댓글이 곧 대댓글이다. 실패 시 같은 호출을 맹목 재시도하지 않는다(비멱등 — 중복 답글). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK'], description: '대상 플랫폼' },
        commentId: { type: 'string', description: 'sns_comment_inbox 의 commentId (IG 는 최상위 댓글 id 여야 함)' },
        message: { type: 'string', description: '답글 완성본 — THREADS ≤500자, IG ≤2200자, FB ≤8000자' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['platform', 'commentId', 'message'],
    },
  },
  {
    name: 'sns_comment_moderate',
    title: '⚠️ 댓글 숨김·해제 · FB 좋아요',
    annotations: HINT.moderate,
    outputSchema: COMMENT_MODERATE_OUTPUT,
    description:
      '⚠️ 받은 댓글 숨김/해제와 Facebook 댓글 좋아요 — 호출 즉시 반영된다(HITL — 사용자 승인 없이 호출 금지). **삭제는 제공하지 않는다**: 숨김은 되돌릴 수 있고 작성자 본인에게는 계속 보여 마찰이 적은 반면 삭제는 비가역이라, 스팸·어뷰징 대응에는 숨김이 브랜드 리스크가 낮다. 정당한 비판·불만은 숨기지 않는다 — 숨김은 스팸·광고·혐오·개인정보 노출에만 쓴다. like/unlike 는 FACEBOOK 만 지원한다(Threads·IG 는 댓글 좋아요 API 자체가 없어 답글이 유일한 반응 수단).',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK'], description: '대상 플랫폼' },
        commentId: { type: 'string', description: 'sns_comment_inbox 의 commentId' },
        action: {
          type: 'string',
          enum: ['hide', 'unhide', 'like', 'unlike'],
          description: 'hide/unhide 는 3개 플랫폼 공통, like/unlike 는 FACEBOOK 전용',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['platform', 'commentId', 'action'],
    },
  },
  {
    name: 'sns_account_check',
    title: 'SNS 자격증명 점검',
    annotations: HINT.read,
    outputSchema: ACCOUNT_CHECK_OUTPUT,
    description:
      'SNS 게시용 로컬 자격증명을 일괄 점검한다 — Threads/Instagram/Facebook 페이지는 /me 조회, YouTube 는 리프레시 토큰 교환 + 채널 조회. channel 지정 시 그 채널(브랜드) 토큰 세트만, 생략 시 <SNS_TOKEN_DIR> 하위 모든 채널 디렉토리 + 기본(평면) 토큰을 함께 점검해 채널별로 묶어 반환한다. 계정 id·이름과 유효 여부만 반환하며 토큰 값은 노출하지 않는다. 플랫폼별 *_publish 전 사전 점검(게시 예정 계정 확인)과 Meta 토큰 60일 만료 갱신 시점 판단에 사용한다. 자격증명 미설정 플랫폼은 사유와 함께 ok:false 로 표시된다.',
    inputSchema: { type: 'object', properties: { channel: SNS_CHANNEL_PROPERTY } },
  },
];

/**
 * 플랫폼별 게시 툴 → 필요한 자격증명 플랫폼 매핑 — index.ts 가 ListTools 시점에
 * 자격증명 파일이 존재하는(기본 토큰 ∪ 채널 디렉토리) 플랫폼의 툴만 노출하는 데
 * 쓴다 (핸들러는 전부 유지 — 미설정 플랫폼을 직접 호출하면 명시적 토큰 부재
 * 에러가 반환된다).
 */
export const SNS_PLATFORM_BY_TOOL: Record<string, 'THREADS' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE'> = {
  threads_publish: 'THREADS',
  instagram_publish: 'INSTAGRAM',
  facebook_publish: 'FACEBOOK',
  facebook_comment: 'FACEBOOK',
  youtube_publish: 'YOUTUBE',
};
