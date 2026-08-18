import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from './music-client.js';
import {
  DEFAULT_SUPERTONIC_LANGUAGE,
  DEFAULT_SUPERTONIC_SPEED,
  DEFAULT_SUPERTONIC_STEPS,
  DEFAULT_SUPERTONIC_VOICE,
  MAX_SUPERTONIC_INPUT_CHARS,
  SUPERTONIC_LANGUAGES,
  SUPERTONIC_VOICE_NAMES,
} from './supertonic-client.js';
import {
  DEFAULT_SEEDANCE_DURATION,
  DEFAULT_SEEDANCE_MODEL,
  DEFAULT_SEEDANCE_REFERENCE_MODEL,
  DEFAULT_SEEDANCE_RESOLUTION,
  SEEDANCE_FPS,
  SEEDANCE_REFERENCE_MODELS,
  VALID_SEEDANCE_MODELS,
  VALID_SEEDANCE_RATIOS,
  VALID_SEEDANCE_RESOLUTIONS,
} from './seedance-client.js';
import { DEFAULT_TTS_MODEL, DEFAULT_TTS_TEMPERATURE, DEFAULT_VOICE, TTS_VOICE_NAMES, VALID_TTS_MODELS } from './tts-client.js';
import {
  DEFAULT_ZIMAGE_QUANTIZE,
  DEFAULT_ZIMAGE_STEPS,
  MAX_ZIMAGE_DIMENSION,
  MIN_ZIMAGE_DIMENSION,
  ZIMAGE_DIMENSION_STEP,
  ZIMAGE_QUANTIZE_OPTIONS,
} from './zimage-client.js';

/**
 * 툴 표면 정의 (43종) — 조사 6종 + 공공데이터 5종 +
 * 생성 18종(이미지 3 + 영상 7 + 음성 4 + 음악 4) +
 * 플랫폼별 게시 5종 + 받은 댓글 3종 + 계정 점검 1종 +
 * 성장 조회 5종(Threads 인사이트·키워드 검색 · YouTube 인사이트 · Instagram
 * 인사이트 · 최근 게시분 피드백 — 인사이트 셋은 grow-* 전용, content_feedback 는
 * 두 영상 플랫폼을 묶어 HTML 보고서를 쓴다).
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
 * 영상만 엔진이 둘이다 — veo_*(Google Veo 3.1, GEMINI_API_KEY)와
 * seedance_*(ByteDance Seedance, ARK_API_KEY). 둘은 대체재가 아니라 잘하는 일이
 * 다르고, 어느 쪽을 언제 쓰는지의 정본은
 * skills/produce/references/video-model-selection.md 다. 툴 description 은 그
 * 판단표의 요약을 각자 싣는다 — 스킬 문서를 안 읽고 툴 목록만 보는 호출자도
 * 엔진을 고를 수 있어야 한다.
 *
 * 음성·조성·모드 목록은 각 클라이언트 모듈의 정본 상수에서 파생시킨다 — 30종짜리
 * 목록을 스키마에 복사해 두면 모델 추가 때 한쪽만 고쳐지는 사고가 난다.
 *
 * 모든 툴은 title(표시 이름)과 annotations(동작 힌트)를 단다. 특히 destructiveHint
 * 는 "호출 = 즉시 공개"라는 이 서버의 성질을 **클라이언트가 읽을 수 있는 형태**로
 * 옮긴 것이다 — description 산문은 모델만 읽고 승인 UI 는 읽지 못한다.
 * 판정 기준표는 docs/api-reference/mcp-tools.html §7 이 정본이다.
 */

/**
 * Veo 공통 프로퍼티 정의 (Veo 3.1 계열).
 *
 * 기본값이 표준이 아니라 fast 인 근거는 video-client.ts DEFAULT_VIDEO_MODEL 주석에
 * 적어 두었다 — 세 티어의 블라인드 아레나 Elo 가 통계적으로 같다.
 */
const VEO_MODEL_PROPERTY = {
  type: 'string',
  description:
    'Veo model (default: "veo-3.1-fast-generate-preview"). Blind-arena Elo puts the three tiers within overlapping confidence intervals on every board — the tier buys features and resolution, not measurably better video — so pick the CHEAPEST tier that has the features you need. lite is 1/2 the cost of fast and 1/8 of standard but drops 4k, extension, and reference images; standard costs 4x fast for no measured preference gain.',
  enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview'],
  default: 'veo-3.1-fast-generate-preview',
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

/**
 * 배제 지시 — 프롬프트 본문이 아니라 이 필드로 보낸다.
 *
 * 문법은 공식 문서가 못 박는다: 지시문이 아니라 명사·형용사구를 콤마로 나열한다.
 * 본문에 "no ~" 를 적으면 그 명사가 오히려 그려진다(로컬 이미지 실측 4장 전패).
 */
const VEO_NEGATIVE_PROMPT_PROPERTY = {
  type: 'string',
  description:
    'What to keep OUT of the frame, as comma-separated noun or adjective phrases: "wall, frame, on-screen text, subtitles". Do NOT write instructions such as "no walls" or "don\'t show walls" — Google\'s prompt guide names that form as not recommended, and writing an exclusion into the prompt body tends to summon the very noun you named. Put every exclusion here instead of in prompt.',
} as const;

/**
 * Seedance 공통 프로퍼티 정의 (BytePlus ModelArk) — 목록·기본값은 seedance-client.ts
 * 능력표에서 파생시킨다. 모델별 제약(해상도·길이·음성·seed)은 스키마 enum 하나로는
 * 표현되지 않아 클라이언트의 superRefine 이 호출 전에 거부한다.
 */
const SEEDANCE_MODEL_PROPERTY = {
  type: 'string',
  description:
    `Seedance model (default: "${DEFAULT_SEEDANCE_MODEL}" — the cheapest model that reaches 1080p, accepts photoreal human faces as input, supports seed, and has no activation gate). ` +
    'Quality, from the Artificial Analysis blind image-to-video arena: dreamina-seedance-2-0-260128 ranks 1st overall (Elo 1,198), the three Veo 3.1 tiers sit at 1,066-1,086, and seedance-1-5-pro-251215 is the arena baseline at 1,000 — so 2.0 is clearly the best Seedance, and 1.5 pro trades roughly a 59:41 preference against Veo for about a third of the price. ' +
    'dreamina-seedance-2-5-260628, the 2.0 fast/mini variants, and seedance-1-0-pro-fast-251015 have NO public evaluation at all — prefer them only for cost or for a capability the tested models lack, not for a shot that matters. ' +
    'The 2.x models REJECT input images containing real human faces and need account balance > $30 to activate, which rules them out for photoreal-person sources.',
  enum: [...VALID_SEEDANCE_MODELS],
  default: DEFAULT_SEEDANCE_MODEL,
} as const;

const SEEDANCE_RESOLUTION_PROPERTY = {
  type: 'string',
  description:
    `Output resolution (default: "${DEFAULT_SEEDANCE_RESOLUTION}"). Support differs per model — 1080p needs 2.0, 1.5 pro, or 1.0 pro/fast; 4k is 2.0 only; 2.5 and the 2.0 fast/mini models top out at 720p.`,
  enum: [...VALID_SEEDANCE_RESOLUTIONS],
  default: DEFAULT_SEEDANCE_RESOLUTION,
} as const;

const SEEDANCE_DURATION_PROPERTY = {
  type: 'number',
  description:
    `Clip length in seconds (default: ${DEFAULT_SEEDANCE_DURATION}). Range differs per model — 2.5 accepts 4-30, the 2.0 series 4-15, 1.5 pro 4-12, and 1.0 pro/fast 2-12. Frame rate is fixed at ${SEEDANCE_FPS} fps. Cost scales linearly with duration.`,
  default: DEFAULT_SEEDANCE_DURATION,
} as const;

const SEEDANCE_AUDIO_PROPERTY = {
  type: 'boolean',
  description:
    'Generate a soundtrack with the video (default: false — this pipeline adds narration separately with tts_*, and on seedance-1-5-pro audio doubles the price). The vendor default is true; set it to true only when you want the model to voice the clip. The 1.0 pro/fast models are silent-only and reject true.',
  default: false,
} as const;

const SEEDANCE_WATERMARK_PROPERTY = {
  type: 'boolean',
  description: 'Burn a visible "AI Generated" mark into the bottom-right corner (default: false).',
  default: false,
} as const;

const SEEDANCE_SEED_PROPERTY = {
  type: 'number',
  description:
    'Random seed, -1 to 2147483647 (default -1). Supported only by seedance-1-5-pro and the 1.0 pro/fast models — the 2.x models reject it, so the reference lane has no seed at all. The API reference calls it a random seed and does not promise that the same seed reproduces the same video: do NOT build shot-to-shot consistency on it. Consistency belongs on reference images (seedance_reference) or first+last frames.',
} as const;

const SEEDANCE_CAMERA_FIXED_PROPERTY = {
  type: 'boolean',
  description:
    'Ask the model to hold the camera still. Supported only by seedance-1-5-pro and the 1.0 pro/fast models — on 2.x, describe the camera in the prompt instead.',
} as const;

const SEEDANCE_RATIO_VALUES = [...VALID_SEEDANCE_RATIOS];

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
 * 검색 툴군의 인자 이름은 전부 같다 — 툴을 갈아탈 때 인자를 다시 배우지 않도록
 * 설명에도 명시한다. 백엔드 API 의 q/display/num/start 로의 환산은 서버가 맡는다.
 */
const SEARCH_ARG_LINE =
  '검색 툴 공통 인자: query(검색어)·limit(결과 수)·page(페이지). ' +
  '엔진이 준 것보다 적게 돌려줬으면 응답 note 에 그 사실이 실린다 — 잘린 구간은 page 를 넘겨도 닿지 않으니 note 가 있으면 읽을 것.';

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
  /** 온디바이스 생성 — generate 와 같되 네트워크를 타지 않는다(로컬 모델) */
  generateLocal: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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

const YOUTUBE_UPDATE_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    videoId: { type: 'string', description: '고친 영상 id' },
    permalink: { type: 'string', description: 'https://www.youtube.com/watch?v=<videoId>' },
    privacyStatus: { type: 'string', description: '반영 뒤 공개 범위 (public | unlisted | private)' },
    title: { type: 'string', description: '반영 뒤 제목' },
    changed: {
      type: 'object',
      description: '무엇이 실제로 바뀌었는지 — 전부 false 면 호출이 아무것도 안 바꾼 것이다',
      properties: {
        privacyStatus: { type: 'boolean' },
        title: { type: 'boolean' },
        description: { type: 'boolean' },
      },
    },
    dryRun: { type: 'boolean', description: 'dryRun 호출에만 — true' },
    current: { type: 'object', description: 'dryRun 호출에만 — 지금 YouTube 에 있는 snippet·status' },
    wouldSend: { type: 'object', description: 'dryRun 호출에만 — 실제로 보낼 본문. 병합 결과를 눈으로 확인하는 자리다' },
  },
  required: ['platform', 'videoId'],
};

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
    captionSet: { type: 'boolean', description: 'captionFilePath 를 준 경우에만 — 자막 트랙 업로드 성공 여부' },
    captionWarning: {
      type: 'string',
      description:
        '자막 업로드만 실패했을 때의 사유(스코프 부족이 가장 흔하다 — captions.insert 는 youtube.force-ssl 이 필요하다). 영상 업로드는 성공한 상태이므로 재업로드 금지 — 토큰을 재발급하거나 YouTube Studio 에서 자막만 올릴 것',
    },
  },
  required: ['platform', 'videoId', 'permalink'],
};

const FACEBOOK_PUBLISH_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    postId: {
      type: 'string',
      description:
        'Facebook 게시물 id — facebook_comment 의 postId 로 그대로 넘긴다. 영상 게시일 때는 이 값이 곧 video_id 다',
    },
    permalink: PERMALINK_PROPERTY,
    captionSet: { type: 'boolean', description: 'captionFilePath 를 준 경우에만 — 자막 파일 업로드 성공 여부' },
    captionWarning: {
      type: 'string',
      description:
        '자막 업로드만 실패했을 때의 사유. 게시는 성공한 상태이므로 재게시 금지 — 영상이 아직 처리 중이라 실패했을 수 있으니 잠시 뒤 자막만 다시 올릴 것',
    },
  },
  required: ['platform', 'postId'],
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
  description: '답글 id 의 키 이름이 플랫폼마다 다르다 — THREADS=postId · FACEBOOK=commentId · INSTAGRAM/YOUTUBE=replyId',
  properties: {
    platform: PLATFORM_PROPERTY,
    postId: { type: 'string', description: 'THREADS — 답글도 하나의 게시물이다' },
    commentId: { type: 'string', description: 'FACEBOOK — 댓글에 단 대댓글 id' },
    replyId: { type: 'string', description: 'INSTAGRAM·YOUTUBE — 답글 id' },
    parentCommentId: {
      type: 'string',
      description: 'YOUTUBE — 답글이 실제로 붙은 최상위 댓글 id. 대댓글 id 를 넘겼다면 그 부모로 바뀐 값이다',
    },
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

const THREADS_INSIGHTS_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '조회한 채널 slug (미지정이면 null)' },
    account: { type: 'object', description: '토큰 소유 계정 { id, username }' },
    period: { type: 'object', description: '계정 지표 집계 구간 { since, until, days }' },
    user: {
      type: 'object',
      description:
        '계정 지표 — views 는 { total, daily[] } 일 단위 시계열, likes·replies·reposts·quotes 는 구간 합계, followers_count 는 현재값(구간 무관)',
    },
    posts: {
      type: 'array',
      description:
        '최근 루트 게시물별 지표 { postId, permalink, excerpt, timestamp, metrics: { views, likes, replies, reposts, quotes, shares } } — 개별 조회 실패 시 metrics=null + metricsError',
      items: { type: 'object' },
    },
  },
  required: ['account', 'period', 'user', 'posts'],
};

const INSTAGRAM_INSIGHTS_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '조회한 채널 slug (미지정이면 null)' },
    account: {
      type: 'object',
      description:
        '{ id, username, accountType, followersCount, followsCount, mediaCount } — 팔로워 수는 인사이트가 아니라 프로필 필드다(인사이트의 follower_count 는 팔로워 100 미만 계정에서 빈 값)',
    },
    period: { type: 'object', description: '계정 지표 집계 구간 { since, until, days }' },
    user: {
      type: 'object',
      description:
        '계정 구간 합계 — reach, views, profile_views, accounts_engaged, total_interactions, likes, comments, shares, saves, profile_links_taps',
    },
    media: {
      type: 'array',
      description:
        '최근 미디어별 지표 { mediaId, mediaType, mediaProductType, permalink, excerpt, timestamp, metrics } — metrics 공통은 views·reach·likes·comments·shares·saved·total_interactions 이고, 표면 전용 지표가 mediaProductType 에 따라 갈려 붙는다: REELS 면 ig_reels_avg_watch_time(ms)·ig_reels_video_view_total_time(ms)·reels_skip_rate, FEED 면 follows·profile_visits. 두 묶음은 배타적이라 반대쪽에 요청하면 400 으로 그 미디어 지표가 통째로 비므로 섞어 부르지 않는다. 개별 조회 실패 시 metrics=null + metricsError',
      items: { type: 'object' },
    },
  },
  required: ['account', 'period', 'user', 'media'],
};

const YOUTUBE_INSIGHTS_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '조회한 채널 slug (미지정이면 null)' },
    account: {
      type: 'object',
      description:
        '{ channelId, title, subscriberCount, viewCount, videoCount, subscriberCountHidden } — subscriberCountHidden=true 면 구독자 수가 반올림 값이라 증감 판단에 쓸 수 없다',
    },
    period: { type: 'object', description: '집계 구간 { startDate, endDate, days } (YYYY-MM-DD)' },
    metrics: {
      type: 'object',
      description:
        '채널 구간 지표 — views, engagedViews(초반을 넘겨 본 조회), estimatedMinutesWatched, averageViewDuration(초), averageViewPercentage, subscribersGained/Lost, likes, comments, shares. Analytics 데이터는 2~3일 지연되므로 최근 구간이 비어 있으면 {} 로 온다(0 과 구분)',
    },
    revenue: { type: 'object', description: 'includeRevenue=true 이고 수익 스코프가 있을 때만 — estimatedRevenue, estimatedAdRevenue, estimatedRedPartnerRevenue, cpm' },
    revenueError: { type: 'string', description: '수익 조회만 실패한 사유 (다른 지표는 정상)' },
    videos: {
      type: 'array',
      description:
        '최근 업로드별 { videoId, permalink, title, publishedAt, duration, durationSeconds, lifetime: { views, likes, comments }, period: 구간 지표 } — durationSeconds ≤180 이면 쇼츠 후보(세로 여부는 API 로 확인 불가), period 는 데이터 없으면 null',
      items: { type: 'object' },
    },
    videosError: {
      type: 'string',
      description:
        '영상 조회만 실패한 사유 — 이게 있으면 videos 의 빈 배열·0 값을 "업로드가 없다"로 읽으면 안 된다 (채널 지표는 정상)',
    },
    note: { type: 'string', description: 'API 로 얻을 수 없는 지표에 대한 안내' },
  },
  required: ['account', 'period', 'metrics', 'videos'],
};

const CONTENT_FEEDBACK_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '조회한 채널 slug (미지정이면 null)' },
    generatedAt: { type: 'string', description: '보고서 생성 시각 ISO-8601' },
    limit: { type: 'number', description: '플랫폼당 최근 게시 수' },
    days: { type: 'number', description: '집계 일수' },
    htmlPath: { description: '쓴 HTML 경로. 채널도 outputPath 도 없으면 null' },
    youtube: {
      type: 'object',
      description:
        '{ available, error?, account, cohort, items[], notes[] } — items 는 최근 영상별 hook(초반 통과%)·retain(평균 시청%)·angle(조회만 낮고 훅·유지가 산 편)·문제/가설/다음 편',
    },
    instagram: {
      type: 'object',
      description:
        '{ available, error?, account, cohort, items[], notes[] } — 릴스면 skip(3초 이탈%)·watch(초)·shareRate, 아니면 pending',
    },
  },
  required: ['generatedAt', 'limit', 'days', 'youtube', 'instagram'],
};

const YOUTUBE_TOPIC_SCOUT_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '호출에 실은 채널 slug (미지정이면 null)' },
    queries: { type: 'array', description: '실제로 돌린 시드 검색어', items: { type: 'string' } },
    method: {
      type: 'object',
      description:
        '{ baseline, minMultiplier, minViews, publishedAfterDays, duration, regionCode, language, via, note } — 채널 중앙값 대비 배수 계약. 기본 시장은 US/en',
    },
    scanned: {
      type: 'object',
      description: '{ channels, videos, outliers } — 훑은 채널·영상 수와 5배 이상 편 수',
    },
    quotaUnits: { type: 'number', description: '이번 호출이 쓴 YouTube Data API 쿼터 추정치 (search=100, 나머지 목록=1)' },
    keywords: {
      type: 'array',
      description:
        '{ phrase, score, outlierCount, bestMultiplier, evidence[] } — 아웃라이어 제목에서 뽑은 주제어. 점수=배수 합',
      items: { type: 'object' },
    },
    outliers: {
      type: 'array',
      description:
        '{ videoId, permalink, title, channelTitle, views, baseline, multiplier, publishedAt, durationSeconds, commentCount, tags, gaps[] } — 채널 중앙값 대비 minMultiplier 이상',
      items: { type: 'object' },
    },
    channels: {
      type: 'array',
      description: '{ channelId, title, subscriberCount, videoCount, baseline, outlierCount, skipped? }',
      items: { type: 'object' },
    },
    errors: { type: 'array', description: '부분 실패 사유. 없으면 필드 자체 생략', items: { type: 'string' } },
    excludedOwnChannelId: { description: 'OAuth 로 알아낸 내 채널 id. API 키만 쓰면 null' },
  },
  required: ['queries', 'method', 'scanned', 'quotaUnits', 'keywords', 'outliers', 'channels'],
};

const SNS_ISSUE_SCOUT_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    queries: { type: 'array', description: '실제로 돌린 시드 검색어', items: { type: 'string' } },
    platforms: { type: 'array', description: '훑은 플랫폼 (threads | x | instagram)', items: { type: 'string' } },
    method: {
      type: 'object',
      description:
        '{ via, recency, gl, hl, pagesPerQuery, sites, ranking, scoring, trending } — 구글 site: 검색 계약. ranking 은 관련도순(참여량 아님), scoring 은 언급 글 수 × 플랫폼 가중',
    },
    scanned: {
      type: 'object',
      description: '{ searches, hits, posts, duplicates, returnedPosts } — 돌린 검색 수(재시도 포함)·받은 결과 수·게시물로 판정된 수(중복 제거)·같은 문장 재게시로 접은 수·응답에 실은 수',
    },
    credits: { type: 'number', description: '이번 호출이 쓴 SerpApi 크레딧 추정치 (검색 수 + 급상승 1)' },
    keywords: {
      type: 'array',
      description:
        '{ phrase, score, postCount, platformCount, platforms[], evidence[{platform,url,title}] } — 여러 글·여러 플랫폼에 같이 나온 주제어. 점수는 언급 글 수 기반이라 유튜브 배수와 다른 잣대',
      items: { type: 'object' },
    },
    posts: {
      type: 'array',
      description:
        '{ platform, url, author, title, snippet, date?, matchedQueries[] } — 게시물 단위(프로필·태그 페이지 제외, 슬러그·미디어 경로 정규화). 참여량 필드는 없다',
      items: { type: 'object' },
    },
    trending: {
      type: 'object',
      description:
        '{ geo, hours, count, items[{query, searchVolume, increasePct, active, startedAt, categories[], breakdown[], matchesSeed}] } — Google Trends 급상승 검색어. includeTrending=false 면 없음',
    },
    note: { type: 'string', description: '게시물을 상한까지만 실었을 때의 안내' },
    errors: { type: 'array', description: '부분 실패 사유. 없으면 필드 자체 생략', items: { type: 'string' } },
  },
  required: ['queries', 'platforms', 'method', 'scanned', 'credits', 'keywords', 'posts'],
};

const THREADS_SEARCH_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: '조회한 채널 slug (미지정이면 null)' },
    query: { type: 'string', description: '실행한 검색어' },
    searchType: { type: 'string', description: 'TOP(인기순) 또는 RECENT(최신순)' },
    count: { type: 'number', description: '반환 게시물 수' },
    results: {
      type: 'array',
      description:
        '{ postId, username, text, mediaType, permalink, timestamp, ageMinutes, isReply, isQuotePost, hasReplies } — postId 를 threads_publish 의 replyToId 로 넘기면 답글 참여',
      items: { type: 'object' },
    },
  },
  required: ['query', 'count', 'results'],
};

export const TOOLS: Tool[] = [
  // ── 자료조사·사실검증 ──────────────────────────────────────────
  {
    name: 'serp_web_search',
    title: 'Google 웹 검색 (SerpApi)',
    annotations: HINT.read,
    description: `Google 웹 검색 (SerpApi) — 스토리보드 저작 전 자료조사·사실검증용. 해외 자료는 gl/hl 로 국가·언어를 지정, 한국어 일반 자료는 gl=kr&hl=ko. 서버가 organic/answer_box/knowledge_graph/related_questions 만 추려 반환. ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (site:, filetype: 등 연산자 지원)' },
        gl: { type: 'string', description: '국가 코드 2자, 예: kr, us, vn' },
        hl: { type: 'string', description: '언어 코드, 예: ko, en, vi' },
        location: { type: 'string', description: '결과 기준 지역명 (선택), 예: Seoul, South Korea' },
        limit: { type: 'number', description: '결과 수 (기본 10, 최대 10 — 이 엔진은 한 페이지가 10건 고정이다). 더 필요하면 page 를 1씩 올릴 것. ' },
        page: { type: 'number', description: '페이지 (1부터 5) — 첫 페이지에 근거가 없을 때만' },
        recency: {
          type: 'string',
          enum: ['hour', 'day', 'week', 'month', 'year'],
          description: '기간 필터 — 시효성 값(가격·기한·시행일) 검증 시 month/year 권장',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_news_search',
    title: 'Google 뉴스 검색 (SerpApi)',
    annotations: HINT.read,
    description: `Google 뉴스 검색 (SerpApi) — 최신 동향·발표·시행 소식 확인용. 시효성 값(가격·기한·시행일)을 콘텐츠에 쓰기 전 교차 검증에 사용. 이 엔진에는 기간 필터·정렬 파라미터가 없다(검색어와 함께 쓸 수 없음) — 발표 시점으로 좁혀야 하면 serp_web_search 의 recency, serp_naver_search 의 period, naver_search(sort=date) 를 쓸 것. ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        gl: { type: 'string', description: '국가 코드 2자, 예: kr, us' },
        hl: { type: 'string', description: '언어 코드, 예: ko, en' },
        limit: {
          type: 'number',
          description: '반환 기사 수 (기본 10, 최대 20). 이 엔진은 결과 수 파라미터가 없어 서버가 응답을 잘라 주는 것이며, 값을 줄여도 과금은 검색 1회로 동일하다',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_naver_search',
    title: 'Naver 검색 (SerpApi 경유)',
    annotations: HINT.read,
    description: `Naver 검색 (SerpApi 경유) — naver_search(공식 Open API)가 키 미설정·쿼터 소진일 때의 대체 경로이자, 공식 API 에 없는 **동영상 검색**과 기간 필터(period)를 쓰는 경로. where=web(기본)|news|image|video. 같은 검색을 공식 API 로 할 수 있으면 쿼터가 두 자릿수 큰 naver_search 를 먼저 쓸 것. ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (NOT/OR/site: 연산자 지원)' },
        where: {
          type: 'string',
          enum: ['web', 'news', 'image', 'video'],
          description: 'web=웹문서(기본) | news=뉴스 | image=이미지 | video=동영상(공식 Open API 에 없는 유형)',
        },
        page: { type: 'number', description: '페이지 (1부터 5)' },
        sort: {
          type: 'string',
          enum: ['relevance', 'latest', 'oldest'],
          description: '정렬 (기본 relevance). oldest 는 where=news 전용 — 다른 유형에 넘기면 에러',
        },
        period: {
          type: 'string',
          enum: ['1h', '1d', '1w', '1m', '3m', '6m', '1y'],
          description: '기간 필터 — 시효성 값 검증 시 최신 구간으로 좁힐 것. 공식 Open API 에는 없는 기능이다',
        },
        limit: { type: 'number', description: '반환 결과 수 (기본 10, 최대 50). 한 호출에 오는 건수는 where·검색어에 따라 다르다(실측: web 15 · news 10 · video 68 · image 48) — limit 보다 많이 오면 잘린 건수와 대처법이 응답 note 에 실린다' },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_image_search',
    title: 'Google 이미지 검색 (SerpApi)',
    annotations: HINT.read,
    description: `Google 이미지 검색 (SerpApi) — 스토리보드 레퍼런스·구도 조사, 실물 확인(제품·장소·인물이 실제로 어떻게 생겼는지), 생성 이미지 프롬프트의 시각 근거 수집용. 원본 URL·해상도·출처를 반환한다. **콘텐츠에 그대로 실을 소재를 찾는 용도라면 license 를 반드시 지정할 것** — 무지정 결과는 저작권 확인이 안 된 이미지이며, 게시물에 넣으면 침해가 된다. 직접 만들 이미지는 이 툴 대신 image_local_generate(기본·무료)나 gpt_image_text2img(텍스트 포함·고품질)를 쓴다(권리 문제 없음). ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (site: 등 연산자 지원)' },
        gl: { type: 'string', description: '국가 코드 2자, 예: kr, us' },
        hl: { type: 'string', description: '언어 코드, 예: ko, en' },
        limit: { type: 'number', description: '결과 수 (기본 20, 최대 50) — 엔진이 한 번에 100건을 주므로 값을 줄여도 과금은 검색 1회다. **page 한 칸이 100건이라 51~100번은 어떤 조합으로도 받을 수 없다** — 그 구간이 필요하면 필터(size·aspect·license)나 검색어로 좁힐 것' },
        page: { type: 'number', description: '페이지 (1부터 5) — 한 칸이 100건이라 page=2 는 101번부터다(51~100 은 건너뛴다). 결과의 position 은 이 엔진이 주는 전역 순번 그대로다' },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'icon', '2mp', '4mp', '8mp', '15mp'],
          description: '이미지 크기 — 쇼트폼 배경으로 쓸 고해상도는 large 이상 권장',
        },
        aspect: {
          type: 'string',
          enum: ['square', 'tall', 'wide', 'panoramic'],
          description: '종횡비 — 9:16 세로 포맷 레퍼런스는 tall',
        },
        imageType: {
          type: 'string',
          enum: ['photo', 'clipart', 'lineart', 'animated', 'face'],
          description: '이미지 종류 (photo=사진 | clipart=클립아트 | lineart=선화 | animated=움짤 | face=얼굴)',
        },
        license: {
          type: 'string',
          enum: ['free', 'commercial', 'modify', 'modify_commercial', 'creative_commons'],
          description:
            '라이선스 범위 — 게시물에 실을 소재는 commercial(상업 이용 가능) 이상, 편집까지 하면 modify_commercial 을 쓸 것',
        },
        color: {
          type: 'string',
          enum: ['bw', 'trans', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'gray', 'black', 'brown'],
          description: '주조색 — trans=투명 배경(로고·오버레이 소재)',
        },
        safe: { type: 'boolean', description: '성인 콘텐츠 필터 (기본 true=켬)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_trending_now',
    title: 'Google 급상승 검색어 (SerpApi)',
    annotations: HINT.read,
    description:
      'Google Trends 급상승 검색어 (SerpApi engine=google_trends_trending_now) — "지금 이 나라에서 뭐가 뜨나"를 검색량·증가율과 함께 받는다(읽기 전용). topic-scout 의 SNS 이슈 절과 grow-* 루프의 시의성 소재 판단용. 구글 검색 기준이지 SNS 참여 기준이 아니며, searchVolume·increasePct 는 구글이 구간으로 주는 어림값(2,000,000 · 1000%)이라 순위 비교로만 쓴다. 검색어(query)가 없는 엔진이라 geo 로 나라를 고르고 hours 로 창을 정한다 — 창은 4·24·48·168 넷뿐. 이 엔진은 page 가 없다. 호출 1회 = SerpApi 크레딧 1건(무료 250회/월) — 같은 geo·hours 를 한 세션에 반복하지 말 것.',
    inputSchema: {
      type: 'object',
      properties: {
        geo: { type: 'string', description: '나라 코드 2자 (기본 KR). 미국 US, 일본 JP' },
        hours: {
          type: 'number',
          enum: [4, 24, 48, 168],
          description: '최근 몇 시간의 급상승인지 (기본 24). 구글이 정한 창 넷 — 4 | 24 | 48 | 168(7일)',
        },
        categoryId: {
          type: 'number',
          description:
            '카테고리로 좁힐 때 (선택). 3=Business and Finance · 4=Entertainment · 7=Health · 14=Politics · 16=Shopping · 17=Sports · 18=Technology · 19=Travel — 없으면 전체',
        },
        onlyActive: { type: 'boolean', description: 'true 면 지금도 오르는 중인 검색어만 (기본 false — 창 안에 한 번이라도 급상승한 것 전부)' },
        hl: { type: 'string', description: '언어 코드, 예: ko, en — 카테고리 이름 표기에만 영향' },
        limit: { type: 'number', description: '결과 수 (기본 20, 최대 50). 엔진이 한 번에 수백 건을 주므로 값을 줄여도 과금은 1회다' },
      },
    },
  },
  {
    name: 'naver_search',
    title: 'Naver 검색 (공식 Open API)',
    annotations: HINT.read,
    description:
      `${SEARCH_ARG_LINE} ` +
      'Naver Open API 검색 (공식, 일 25,000회 무료) — 한국어 소재 리서치의 1차 도구. type 으로 8종을 고른다: news=뉴스 | blog=블로그 후기 | web=웹문서 | cafe=카페글(실사용 여론) | kin=지식iN(진짜 궁금해하는 질문 — 쇼트폼 주제 발굴에 강하다) | image=이미지 | encyc=백과사전(용어 정의) | local=지역 업체(주소·좌표·전화). 한국 트렌드·실사용 후기·국내 뉴스는 Google 보다 이쪽이 정확하다. 서버가 <b> 하이라이트를 제거하고 근거 필드만 추려 반환하며, local 은 좌표를 경위도로 환산해 준다. ' +
      '**타입마다 파라미터 제약이 다르다** — web·encyc 은 정렬 미지원(sort 를 넘기면 서버가 거절), local 은 sort=random|comment 체계에 최대 5건·페이징 없음, imageSize 는 type=image 전용. 책·쇼핑·전문자료·영화 검색은 네이버가 종료해 없다(공식 문서에 남아 있어도 호출하면 404) — 필요하면 serp_web_search 로 대체할 것. 동영상 검색은 serp_naver_search(where=video).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        type: {
          type: 'string',
          enum: ['news', 'blog', 'web', 'cafe', 'kin', 'image', 'encyc', 'local'],
          description:
            'news=뉴스(기본) | blog=블로그 후기 | web=웹문서 | cafe=카페글 | kin=지식iN 질문 | image=이미지 | encyc=백과사전 | local=지역 업체',
        },
        limit: { type: 'number', description: '결과 수 (기본 10, 최대 30 — local 은 API 상한이 5)' },
        page: { type: 'number', description: '페이지 (1부터) — 첫 페이지에 근거가 없을 때만. 쿼터가 커서 serp_* (1~5) 보다 깊이 넘길 수 있으나, (page-1)×limit+1 이 1000 을 넘으면 API 상한이라 거절된다. local 은 페이징 미지원' },
        sort: {
          type: 'string',
          enum: ['sim', 'date', 'random', 'comment'],
          description:
            'news/blog/cafe/kin/image: sim=정확도순(기본) | date=최신순 · local: random=정확도순 | comment=리뷰 많은 순 · web/encyc: 정렬 미지원',
        },
        imageSize: {
          type: 'string',
          enum: ['all', 'large', 'medium', 'small'],
          description: '이미지 크기 필터 (type=image 전용)',
        },
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
        query: { type: 'string', description: '검색어 (주제어, 필요시 기관명 병기)' },
        type: { type: 'string', enum: ['API', 'FILE'], description: 'API=오픈API | FILE=파일데이터(CSV 등) — 생략 시 둘 다 검색' },
        page: { type: 'number', description: '페이지 (1부터)' },
        limit: { type: 'number', description: '타입당 결과 수 (기본 10, 최대 20)' },
      },
      required: ['query'],
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
      '공공데이터포털 파일데이터 원본 다운로드 (무인증) — CSV 등 실파일을 로컬에 저장하고 인코딩 판별 + 선두 6행 미리보기를 반환한다(100MB 상한). publicDataPk/publicDataDetailPk 는 datago_detail 응답값을 그대로 쓴다. 활용신청 없이 즉시 쓸 수 있는 가장 빠른 파일 수집 경로다. 미리보기 encoding 이 euc-kr 이면 Read 전에 iconv 변환이 필요하다. saveDir 는 주제 디렉토리(data/<채널>/episodes/<주제>/storyboard/) 하위를 권장 — 생략 시 임시 디렉토리에 저장된다.',
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
        limit: { type: 'number', description: '행 수 (기본 10, 최대 50)' },
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

Use when the image must contain legible text — posters, labels, UI mockups, signage, title cards — or when a quality boost over the local default is worth paying for. The local engine breaks Korean glyphs (실측: "딸깍연구소" 가 "달닥연구소" 로 깨졌다); every text-bearing image belongs here. Strengths: reliable text rendering inside the image, strong photorealism, and exact custom WIDTHxHEIGHT resolutions (e.g. "1088x1920" for 9:16 — gpt-image-2 only, edges multiple of 16).
Do NOT use as the first choice for text-free images (커버 배경·b-roll·시안 탐색) — the plugin's default path is image_local_generate (local Z-Image, free); this tool bills per image. Do NOT use to edit or compose existing images — use gpt_image_img2img.
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
  {
    name: 'image_local_generate',
    title: '이미지 생성 (로컬 · Z-Image — 기본)',
    annotations: HINT.generateLocal,
    description: `Generate an image from a text prompt **on this machine** using Z-Image Turbo (6B, Apache 2.0) via mflux — no API key, no network, no per-image cost.

This is the DEFAULT image generation path of this plugin. Use for any text-free image: cover backgrounds, b-roll stills, branding drafts, mood exploration, bulk candidate batches (이미지 생성, 커버 배경). Measured on this class of machine (M4 Max): 1024×1024 in ~2–3.5 min and 1088×1920 (9:16) in ~7.5 min under heavy load — minutes, not seconds, with 32–39GB peak memory; avoid running alongside video renders.
Do NOT use when the image must contain legible text — Korean glyphs break (실측: "딸깍연구소" 가 "달닥연구소" 로 렌더링됐다); any text-bearing image (poster, label, title card) and any quality-critical shot goes to gpt_image_text2img instead. Do NOT use to edit existing images — gpt_image_img2img.
Requires mflux (\`uv tool install --python 3.12 mflux\`; Apple Silicon only); set MFLUX_ZIMAGE_BIN if the binary lives elsewhere. The first call downloads the ~31GB weight repository to ~/.cache/huggingface — the tool extends its own timeout by an hour for that download, so a very slow first call is normal, not stuck.

Returns: a text block with the saved .png path, resolution, steps, seed, quantization, and generation time.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt (max 32,000 characters). English prompts recommended; do not ask for text in the image.',
          maxLength: 32000,
        },
        width: {
          type: 'number',
          description: `Image width in pixels (default: 1024). ${MIN_ZIMAGE_DIMENSION}–${MAX_ZIMAGE_DIMENSION}, multiple of ${ZIMAGE_DIMENSION_STEP}. 9:16 세로형은 1080×1920 이 아니라 1088×1920 이다.`,
          minimum: MIN_ZIMAGE_DIMENSION,
          maximum: MAX_ZIMAGE_DIMENSION,
          default: 1024,
        },
        height: {
          type: 'number',
          description: `Image height in pixels (default: 1024). Same constraints as width. Generation time scales with width×height — 9:16 full size takes ~4x a 1024² render.`,
          minimum: MIN_ZIMAGE_DIMENSION,
          maximum: MAX_ZIMAGE_DIMENSION,
          default: 1024,
        },
        steps: {
          type: 'number',
          description: `Diffusion steps (default: ${DEFAULT_ZIMAGE_STEPS} — the model card's recommended setting; 9 steps = 8 DiT forwards). More steps rarely help this turbo-distilled model.`,
          minimum: 1,
          maximum: 50,
          default: DEFAULT_ZIMAGE_STEPS,
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducible output. Omit for a random seed. Re-run the same prompt+seed+size to get the identical image.',
          minimum: 0,
        },
        quantize: {
          type: 'number',
          description: `Weight quantization bits (default: ${DEFAULT_ZIMAGE_QUANTIZE}). 8 is the measured baseline; 4 halves memory with a small quality cost.`,
          enum: [...ZIMAGE_QUANTIZE_OPTIONS],
          default: DEFAULT_ZIMAGE_QUANTIZE,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the image file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the image file (default: zimage_<timestamp>.png)',
        },
      },
      required: ['prompt'],
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
Prefer seedance_text2video when you need a length off Veo's 4/6/8-second grid, a ratio other than 16:9 or 9:16, or a much cheaper silent shot; keep Veo when native dialogue audio is the point.
Cost lever: the default is now fast ($0.10/s at 720p) because blind-arena Elo shows no measurable quality gap between the tiers; drop to lite ($0.05/s) whenever 4k, extension, and reference images are not needed. Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, model, aspect ratio, resolution, and duration in seconds. Videos carry an invisible SynthID watermark.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Descriptive text prompt for video generation (English recommended)',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
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
For a silent b-roll shot from an already-generated background, seedance_img2video bills only the seconds you ask for — a 4-second 1080p shot runs about $0.23 silent against $0.64 on veo-3.1-lite, which must bill 8 seconds at 1080p and cannot turn audio off. Stay on Veo when the clip needs native audio or a later veo_extension.
Person policy, measured 2026-08-15: an adult photoreal face in the source image passes here and holds for the clip, while Seedance 2.x rejects the very same file — so this is the image lane for photoreal people. A face that reads as a MINOR is blocked whether it arrives as a photo or an illustration (Support code 17301594); blocked generations are not billed, so redraw the cut instead of hunting for a way around it.
For composition control — a subject appearing, vanishing, or changing pose exactly as drawn — pass lastImagePath. Reference images (veo_reference) carry appearance, not layout.
Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, source/last frame image paths, model, aspect ratio, resolution, and duration in seconds.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for video animation/motion',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
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
Do NOT use on videos not generated by Veo, and do NOT use the lite model (unsupported). For a brand-new scene use veo_text2video instead. Seedance has no equivalent for local files — its video input accepts only public URLs — so extension of a local clip always lands here.
Output is always 720p and follows the input video's aspect ratio. Voice cannot be effectively extended if absent from the last 1 second of the input. Takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, source video path, model, resolution, and the added duration (+7 seconds).`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for the video continuation',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
        sourceVideoPath: {
          type: 'string',
          description: 'Absolute path to the source video file to extend (must be a Veo-generated 720p video, 141 seconds or shorter)',
        },
        model: {
          type: 'string',
          description: 'Veo model (default: "veo-3.1-fast-generate-preview"). The lite model does NOT support extension. Blind-arena Elo has fast and standard statistically tied, so standard only buys 4k here.',
          enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'],
          default: 'veo-3.1-fast-generate-preview',
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
This is the reference tool for REAL people — Seedance's seedance_reference rejects real human faces, while it accepts far more reference images (up to 30) and a free duration, so route drawn characters and products there. The person policy here is documented as the same allow_adult contract veo_img2video runs under, but it is unmeasured on this mode; only the image lane was probed.
Reference images are ASSET only: they preserve ONE subject's appearance, NOT the layout of the picture. For a cut that must match a drawn composition use veo_img2video with sourceImagePath + lastImagePath. Veo 3.1 has no style reference at all — the official docs send style images to the experimental veo-2.0 model, so route sketch or toon style transfer to seedance_reference instead.
Duration is fixed at 8 seconds when reference images are used. Takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, reference image list, model, aspect ratio, resolution, and duration.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed text description of the video scene and subject interactions',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
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
          description: 'Veo model (default: "veo-3.1-fast-generate-preview"). The lite model does NOT support reference images. Blind-arena Elo has fast and standard statistically tied, so standard only buys 4k here.',
          enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'],
          default: 'veo-3.1-fast-generate-preview',
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

  // ── 영상 생성 (ByteDance Seedance — BytePlus ModelArk) ─────────────
  // Veo 와 같은 자리를 쓰는 두 번째 엔진이다. 어느 쪽을 언제 쓰는지의 정본은
  // skills/produce/references/video-model-selection.md 다.
  {
    name: 'seedance_text2video',
    title: '영상 생성 (텍스트 → 영상, Seedance)',
    annotations: HINT.generate,
    description: `Generate a video from a text prompt using ByteDance Seedance (BytePlus ModelArk).

Use when you need a clip that Veo's fixed 4/6/8-second grid cannot express — an odd length (2-30 seconds, any whole second), a 21:9 or 4:3 frame, or simply the cheapest possible shot: a silent 9:16 1080p 5-second clip costs about $0.24 on seedance-1-0-pro-fast, against $0.64 on veo-3.1-lite and $0.96 on veo-3.1-fast (Veo forces an 8-second bill at 1080p and always includes audio). Korean prompts are understood only by dreamina-seedance-2-5; every other model expects English.
Do NOT use when you need Veo's native dialogue audio quality or its +7s extension of an existing clip — veo_text2video and veo_extension keep those. When a source visual already exists use seedance_img2video, and for subject consistency from photos use seedance_reference.
Model choice drives both price and limits; read the model parameter before overriding the default. Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, model, ratio, resolution, duration, and the billed completion token count.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Video description. Vendor formula: Subject + Movement + Environment + Camera movement + Aesthetic description + Sound. Write camera as a span, not a verb — "starting frame composition + movement + movement amplitude + ending frame composition" (combos the docs name: Hitchcock = dolly-in/out + zoom-out/in, bullet time = time slowdown + surround). Shot size follows the example word order, "Close-up of the man on the left". Do NOT write timecodes such as "0-3 seconds" — the vendor states precise-timing support is unstable and forcing it degrades the result; cut timing in the edit instead. Multi-cut in one call is supported via "Shot 1: ... Shot 2: ..." or "The shot cuts to ...". Prompt body must be English or Chinese (Korean only on dreamina-seedance-2-5-260628) — Korean dialogue still works inside quotes on 1.5-pro, which lip-syncs it.',
        },
        model: SEEDANCE_MODEL_PROPERTY,
        ratio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9"). "adaptive" lets the model pick.',
          enum: SEEDANCE_RATIO_VALUES,
          default: '16:9',
        },
        resolution: SEEDANCE_RESOLUTION_PROPERTY,
        durationSeconds: SEEDANCE_DURATION_PROPERTY,
        generateAudio: SEEDANCE_AUDIO_PROPERTY,
        watermark: SEEDANCE_WATERMARK_PROPERTY,
        seed: SEEDANCE_SEED_PROPERTY,
        cameraFixed: SEEDANCE_CAMERA_FIXED_PROPERTY,
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
    name: 'seedance_img2video',
    title: '영상 생성 (이미지 → 영상, Seedance)',
    annotations: HINT.generate,
    description: `Animate a still image into a video (first frame, or first+last frame interpolation) using ByteDance Seedance.

Use for the cheap b-roll lane of this pipeline: animating an already-generated cover or point background PNG. ratio defaults to "adaptive" so the source image is not center-cropped — pass an explicit ratio only when you intend a different frame. Billing follows the requested duration, so ask for the length you will actually cut in.
The default model (seedance-1-5-pro) accepts photoreal human faces. The dreamina-seedance-2.5/2.0 models REJECT input images containing real human faces, so never route a photoreal-person background through them.
Do NOT use for pure text-to-video (use seedance_text2video) or for subject consistency across several photos (use seedance_reference). Veo's veo_img2video remains the choice when you want its native audio or Veo-only extension afterwards.

Returns: a text block with the saved .mp4 file path, source/last frame image paths, model, ratio, resolution, duration, and the billed completion token count.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Motion only — do not re-describe people, background, or lighting already visible in the source image, or the model redesigns the scene. Write camera as a span: "starting frame composition + movement + movement amplitude + ending frame composition". Do NOT write timecodes such as "0-3 seconds" (vendor: precise-timing support is unstable). English or Chinese only. There is no negative-prompt parameter here — an unwanted element has to be designed out of the sentence, not forbidden in it.',
        },
        sourceImagePath: {
          type: 'string',
          description: 'Absolute path to the first frame (starting) image file',
        },
        lastImagePath: {
          type: 'string',
          description: 'Optional: Absolute path to the last frame (ending) image file for a smooth interpolation. Not supported by seedance-1-0-pro-fast-251015 (first frame only).',
        },
        model: SEEDANCE_MODEL_PROPERTY,
        ratio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "adaptive" — follows the source image). A different value makes the server center-crop your image.',
          enum: SEEDANCE_RATIO_VALUES,
          default: 'adaptive',
        },
        resolution: SEEDANCE_RESOLUTION_PROPERTY,
        durationSeconds: SEEDANCE_DURATION_PROPERTY,
        generateAudio: SEEDANCE_AUDIO_PROPERTY,
        watermark: SEEDANCE_WATERMARK_PROPERTY,
        seed: SEEDANCE_SEED_PROPERTY,
        cameraFixed: SEEDANCE_CAMERA_FIXED_PROPERTY,
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
    name: 'seedance_reference',
    title: '영상 생성 (참조 이미지, Seedance 2.x)',
    annotations: HINT.generate,
    description: `Generate a video that keeps subjects from reference images consistent, using Dreamina Seedance 2.x.

Use when a character, product, or garment must stay the same across the shot and you have several photos of it (캐릭터 일관성, 제품 영상). dreamina-seedance-2-5-260628 takes 1-30 reference images and up to 30 seconds; the 2.0 series takes 1-9 and up to 15 seconds. Unlike veo_reference the length is not pinned to 8 seconds.
Do NOT pass reference images containing real human faces — the 2.x models reject them; use veo_reference for real people. The seedance-1-5-pro and 1.0 models do not accept reference images at all and are rejected before the call. These models also need account balance > $30 to activate.
References carry the artistic STYLE through along with the subject. That is the feature when you want a sketch or toon look transferred — this is the only style-transfer lane in the plugin, since Veo 3.1 dropped style references — and a defect when you only wanted the layout: a storyboard frame passed here returns its drawing style, not its composition. For composition use seedance_img2video with sourceImagePath + lastImagePath.
Do NOT feed a three-view or multi-view character sheet. ByteDance's own docs advise against it twice: the model reads the separate angles as separate people, which worsens identity drift and produces duplicate characters in one frame. Send a headshot (face only, neutral expression, minimal shoulders and background) plus one full-body shot instead — the docs call those two sufficient. Order is weight: put the asset that must be matched most precisely first in the array.

Returns: a text block with the saved .mp4 file path, reference image list, model, ratio, resolution, duration, and the billed completion token count.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Scene and subject interactions. The 2.x advanced formula: precise subject + action details + scene/environment + lighting & color tone + camera movement + visual style + image quality + constraints. For multi-cut, write a "Shot 1 / Shot 2 / Shot 3" storyboard and order each shot as camera movement -> subject action and expression -> position change -> audio. Do NOT put timecodes on the shots — the vendor states precise-timing support is unstable. English or Chinese only. Unwanted subtitles cannot be fully blocked at 9:16: the vendor notes portrait output hallucinates burned-in text noticeably more often than landscape, so inspect the frames.',
        },
        referenceImagePaths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 30,
          description: 'Absolute paths to reference images guiding subject appearance — up to 30 for dreamina-seedance-2-5-260628, up to 9 for the 2.0 series. Must not contain real human faces.',
        },
        model: {
          type: 'string',
          description: `Seedance model (default: "${DEFAULT_SEEDANCE_REFERENCE_MODEL}" — the only reference-capable model with independent quality data: rank 1 on the Artificial Analysis blind image-to-video arena, and it also outputs 1080p and 4k). Only the 2.x models accept reference images. Switch to dreamina-seedance-2-5-260628 when you actually need more than 9 reference images or more than 15 seconds — it is untested in every public arena, so do not pick it for a shot that matters without comparing first. fast and mini trade quality for cost and are likewise untested.`,
          enum: [...SEEDANCE_REFERENCE_MODELS],
          default: DEFAULT_SEEDANCE_REFERENCE_MODEL,
        },
        ratio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "adaptive").',
          enum: SEEDANCE_RATIO_VALUES,
          default: 'adaptive',
        },
        resolution: SEEDANCE_RESOLUTION_PROPERTY,
        durationSeconds: SEEDANCE_DURATION_PROPERTY,
        generateAudio: SEEDANCE_AUDIO_PROPERTY,
        watermark: SEEDANCE_WATERMARK_PROPERTY,
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
    name: 'tts_local_generate',
    title: '음성 합성 (로컬 · Supertonic)',
    annotations: HINT.generateLocal,
    description: `Convert text to speech **on this machine** using Supertonic 3 — no API key, no network, no quota, no per-character cost.

Use for narration bodies and any bulk voice-over: scene narration in the produce pipeline, long scripts, and repeated takes where API cost or quota would add up. Measured at 6.3x realtime on CPU alone. 10 built-in voices (F1–F5 female, M1–M5 male) across 31 languages; output is 44.1kHz mono WAV and the response includes the exact audio duration, so no ffprobe round-trip is needed for length checks.
Do NOT use when the line needs acted delivery — there is no style/emotion parameter here, so intro lines, character dialogue, and anything with a stylePrompt belong to tts_generate (Gemini). Do NOT mix both engines inside one video without resampling: this returns 44.1kHz and tts_generate returns 24kHz.
Requires a local Python runtime with the \`supertonic\` package (pip install supertonic); set SUPERTONIC_PYTHON if it lives in a virtualenv. The first call downloads 385MB of weights to ~/.cache/supertonic3. Model weights are OpenRAIL-M licensed (code is MIT) — commercial use is permitted with use-based restrictions, so review the terms before shipping generated audio.

Returns: a text block with the saved .wav path, voice, language, audio duration, sample rate, and synthesis time.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: `The text to convert to speech (max ${MAX_SUPERTONIC_INPUT_CHARS} characters — split longer scripts by scene)`,
          maxLength: MAX_SUPERTONIC_INPUT_CHARS,
        },
        voice: {
          type: 'string',
          description: `Voice style (default: "${DEFAULT_SUPERTONIC_VOICE}"). F1–F5 are female, M1–M5 male; the vendor publishes no personality labels beyond that. Keep one voice per channel — see data/<slug>/profile.md.`,
          enum: [...SUPERTONIC_VOICE_NAMES],
          default: DEFAULT_SUPERTONIC_VOICE,
        },
        lang: {
          type: 'string',
          description: `Language code (default: "${DEFAULT_SUPERTONIC_LANGUAGE}"). Unlike tts_generate this is NOT auto-detected — set it, because the code also selects chunking (Korean uses shorter chunks). Use "na" only for text whose language is unsupported.`,
          enum: [...SUPERTONIC_LANGUAGES],
          default: DEFAULT_SUPERTONIC_LANGUAGE,
        },
        speed: {
          type: 'number',
          description: `Speech speed 0.7–2.0 (default: ${DEFAULT_SUPERTONIC_SPEED}). Keep it identical across every cut of one video.`,
          minimum: 0.7,
          maximum: 2.0,
          default: DEFAULT_SUPERTONIC_SPEED,
        },
        steps: {
          type: 'number',
          description: `Quality steps 1–100 (default: ${DEFAULT_SUPERTONIC_STEPS}). Higher is slower with diminishing returns; the default is the vendor's recommended setting.`,
          minimum: 1,
          maximum: 100,
          default: DEFAULT_SUPERTONIC_STEPS,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: supertonic_<timestamp>.wav)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'tts_list_voices',
    title: 'TTS 음성 목록',
    annotations: HINT.local,
    description: `List the available voices for both TTS engines — 30 Gemini voices with personality traits, plus the 10 local Supertonic voices.

Use before tts_generate, tts_multi_speaker, or tts_local_generate when the user has not specified a voice, or asks what voices are available (목소리 종류). Read-only; makes no API call.
Do NOT use to generate audio — use tts_generate (acted delivery) or tts_local_generate (narration, free). The list is static; one call per session is enough. When the channel profile (data/<slug>/profile.md) already fixes a voice, use that instead of picking a new one.

Returns: a text list of the 30 Gemini voice names with one-line personality descriptions (e.g. "Kore — Firm"), followed by the 10 Supertonic voice IDs (F1–F5, M1–M5 — no personality labels are published for these) and a note on which engine to pick.`,
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
    outputSchema: publishOutput('postId', 'Threads 게시물 id — 답글을 이어 달 때 replyToId 로 그대로 넘긴다'),
    description:
      `⚠️ Threads 직접 게시 — 로컬 토큰으로 Threads API 에 **즉시 공개 게시**한다(게시 계정은 토큰의 /me 로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·미디어를 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 이 툴이 지원하는 형태는 텍스트(선택적 링크 프리뷰 카드) 또는 이미지 1장이다 — 플랫폼 자체는 영상·캐러셀도 지원하지만, 이 파이프라인은 영상을 YouTube·릴스로 내보내고 Threads 에는 구어체 본문 + 영상 링크(linkUrl)로 유입을 만드는 전략을 쓴다. 영상 회차는 커버 이미지를 붙이지 않는다 — 링크 프리뷰 카드가 그 자리를 대신하고, 한 번의 호출로 게시가 끝난다(링크를 답글로 따로 달지 않는다). 게시 쿼터는 24시간당 250건. ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: {
          type: 'string',
          description:
            '게시 본문 완성본 ≤500자 (해시태그는 ≤1개 권장 — 랭킹 가중치 0). 이모지는 플랫폼이 UTF-8 바이트로 세므로 1자보다 크게 계산된다',
        },
        imageUrl: { type: 'string', format: 'uri', description: '공개 접근 가능한 이미지 URL 1장 (플랫폼이 크롤 — 로컬 경로 불가). linkUrl 과 배타' },
        linkUrl: {
          type: 'string',
          format: 'uri',
          description:
            '본문에 붙일 링크 프리뷰 카드 URL (영상 회차의 릴스·쇼츠 permalink). 텍스트 게시 전용이라 imageUrl 과 배타이며, caption 본문에 같은 URL 을 적어도 플랫폼은 링크 1개로 센다(상한 5개)',
        },
        replyToId: { type: 'string', description: '이 게시물 id 에 대한 답글로 게시 (자기 답글 체인, 또는 남의 글에 답글 참여)' },
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
        videoUrl: {
          type: 'string',
          format: 'uri',
          description:
            '릴스 영상 공개 URL 1개 (.mp4/.mov) — imageUrls 와 동시 사용 불가. **자막 번인본을 준다** — IG Content Publishing 에는 자막 파일을 받는 파라미터가 없어서, 자막을 따로 올리는 다른 플랫폼과 달리 여기서는 화면에 태운 영상이 유일한 방법이다',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'facebook_publish',
    title: '⚠️ Facebook 페이지 게시 (즉시 공개)',
    annotations: HINT.publish,
    outputSchema: FACEBOOK_PUBLISH_OUTPUT,
    description:
      `⚠️ Facebook 페이지 직접 게시 — 로컬 페이지 토큰으로 Graph API 에 **즉시 공개 게시**한다(게시 페이지는 토큰의 /me 로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·미디어를 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 형태: 텍스트 / 이미지 ≤10장 / 영상 1개(일반 영상 — 릴스 아님). 영상 게시에는 **자막 파일을 함께 올린다**(captionFilePath) — 이 파이프라인은 자막을 영상에 태우지 않고 따로 올리는 것이 원칙이라, 번인본이 아니라 자막 없는 클린 마스터를 videoUrl 로 준다. 원문 링크는 본문(linkUrl)이 아니라 게시 성공 직후 facebook_comment 첫 댓글로 **반드시** 단다. ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: '게시 본문 완성본 ≤5000자' },
        imageUrls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: '공개 접근 가능한 이미지 URL ≤10장 — videoUrl 과 동시 사용 불가',
        },
        videoUrl: { type: 'string', format: 'uri', description: '영상 공개 URL 1개 (.mp4/.mov) — imageUrls 와 동시 사용 불가. 자막 번인본이 아니라 **클린 마스터**를 준다(자막은 captionFilePath 로 따로)' },
        captionFilePath: {
          type: 'string',
          description:
            '자막 파일 **로컬** 절대 경로 (.srt, ≤200K) — videoUrl 게시에서만 유효. 영상 URL 과 달리 호스팅이 필요 없다(파일 직접 업로드). 게시 성공 직후 자동으로 올라가며, 자막만 실패하면 captionWarning 이 온다(게시는 유효 — 재게시 금지)',
        },
        captionLocale: {
          type: 'string',
          description:
            '자막 로케일 (기본 ko_KR). `ko_KR`·`en_US`·`vi_VN` 형식이어야 한다 — FB 는 업로드 파일명이 `<이름>.<locale>.srt` 인지로 로케일을 판정하고, 형식이 틀리면 error 386 으로 거부한다',
        },
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
      `⚠️ YouTube 직접 게시 — 로컬 OAuth 리프레시 토큰으로 **로컬 영상 파일을 즉시 공개 업로드**한다(대상 채널은 토큰 소유 계정으로 자동 결정). 별도 검토 게이트가 없으므로 반드시 사용자가 최종 문안·영상을 확인·승인한 직후에만 호출한다(HITL — 승인 없이 호출 금지). 세로 9:16·3분 이하 영상은 쇼츠로 자동 분류(별도 플래그 없음). 유일하게 공개 URL 호스팅이 불필요한 플랫폼이다(파일 직접 업로드 — 자막 파일도 마찬가지). **영상과 자막은 따로 올린다** — captionFilePath 로 .srt 를 함께 주고 videoFilePath 에는 자막을 태우지 않은 클린 마스터를 준다. 업로드는 videos.insert 전용 "Video Uploads" 쿼터 버킷을 쓴다 — 호출당 1유닛·기본 일 100회이므로 회차 게시를 아낄 이유가 없다(과거의 "1,600유닛/일 6건" 제한은 2026년 쿼터 개편으로 사라졌다). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        videoFilePath: { type: 'string', description: '업로드할 로컬 영상 파일 절대 경로 (.mp4/.mov)' },
        title: { type: 'string', description: '영상 제목 ≤100자 (꺾쇠 <> 금지) — 키워드형 권장(쇼츠는 제목 검색 노출 비중이 큼)' },
        caption: { type: 'string', description: '영상 설명(description) 완성본 **≤5000바이트**(글자 수가 아니다 — 한국어는 글자당 3바이트라 약 1,666자) — 첫 줄 요약 + 핵심 포인트. **해시태그를 포맷별로 다르게 붙인다** — 9:16 쇼츠는 #Shorts 를 포함해 3~5개를 붙이고, 16:9 롱폼은 #Shorts 를 붙이지 않는다(쇼츠 표면으로 잘못 분류된다). 롱폼은 해시태그 대신 **챕터 타임스탬프**를 싣는다 — 첫 줄이 00:00 이고 3개 이상, 각 구간 10초 이상이 문서 요건이다. **어겼을 때의 거동은 공식 문서에 없다** — 10초는 실제로 안 막는 것을 확인했고(2초 구간 21개가 그대로 렌더됐다), 확실한 것은 자동 챕터가 신규 업로드에 기본 켜짐이고 설명란 수동 목록이 그것을 덮는다는 것뿐이다. 요건을 어기면 우리 목록이 무시되고 자동 챕터가 대신 붙을 수 있다.' },
        thumbnailFilePath: {
          type: 'string',
          description:
            '커버 스틸 절대 경로 (.jpg/.png ≤2MB) — **필수**. 미지정 업로드는 YouTube 가 임의 프레임을 썸네일로 뽑아 제목 커버가 안 보이고, 게시 후 API 로는 세로 표면을 되돌릴 수 없다. 이 지정이 바꾸는 것은 **가로 표면**(검색결과·공유 미리보기·임베드)뿐이다 — 쇼츠 피드·채널 쇼츠 탭의 세로 프레임(oar*)은 YouTube 네이티브 앱의 프레임 선택으로만 바뀐다(publish 스킬 §3 세로 표면 단계). 채널에 전화번호 인증(중급 기능)이 없으면 지정이 거부되며 게시는 성공하고 thumbnailWarning 으로 보고된다',
        },
        captionFilePath: {
          type: 'string',
          description:
            '자막 파일 절대 경로 (.srt) — **기본으로 지정한다**. 자막을 영상에 태우지 않고 따로 올리면 게시 후에도 자막만 교체할 수 있고, 시청자가 끄고 켤 수 있고, YouTube 자동 번역의 원본이 된다. videoFilePath 는 번인본이 아니라 자막 없는 클린 마스터를 준다. 업로드는 **youtube.force-ssl 스코프**가 필요하고(게시용 youtube.upload 로는 거부된다) **쿼터 400유닛**을 쓴다 — 영상 업로드(1유닛)와 달리 무거우니 회차마다 한 번만. 자막만 실패하면 captionWarning 이 오고 게시는 유효하다(재업로드 금지)',
        },
        captionLanguage: {
          type: 'string',
          description: '자막 언어 BCP-47 (기본 ko) — 예: ko, en, vi. 자동 번역의 원본 언어가 된다',
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
        containsSyntheticMedia: {
          type: 'boolean',
          description:
            '합성 미디어 자기 고지 — **기본 true**(이 파이프라인은 Veo 영상·Lyria 음악을 쓴다). YouTube 는 실제처럼 보이는 AI 생성·변형 콘텐츠(AI 생성 음악, 실제 장소·인물의 사실적 생성 영상)에 고지를 요구하고, 상습 미고지에 라벨 강제·삭제·YPP 정지를 예고한다. 반대로 "고지가 노출·수익 자격에 영향을 주지 않는다"고 명시하므로 애매하면 켜 두는 쪽이 손해가 없다. false 로 내릴 수 있는 경우는 명확히 면제인 사용뿐이다 — 대본·제목·썸네일 생성, 자막 생성, 아이디어 생성, 자기 목소리 복제, 사실적이지 않은 애니메이션·판타지 영상, 색보정·뷰티 필터.',
          default: true,
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['videoFilePath', 'title', 'caption', 'thumbnailFilePath'],
    },
  },
  {
    name: 'youtube_update',
    title: '⚠️ YouTube 영상 메타데이터·공개범위 변경',
    annotations: HINT.moderate,
    outputSchema: YOUTUBE_UPDATE_OUTPUT,
    description:
      '⚠️ 이미 게시된 YouTube 영상의 공개 범위·제목·설명을 고친다(videos.update). **호출 즉시 반영되고 되돌릴 수 없다 — 사람 승인 없이 호출 금지.** **롱폼 2단 게시의 두 번째 단계다** — 8~15분 영상을 privacyStatus "private" 로 올려 watch 페이지에서 인코딩·자막·챕터를 사람이 확인한 뒤 이 툴로 public 으로 돌린다. 쇼트폼처럼 바로 공개하면 실패를 시청자가 먼저 본다. **videos.update 는 부분 갱신이 아니라 덮어쓰기라서** 이 툴이 먼저 videos.list 로 현재 값을 읽어 병합한다 — 인자로 안 준 필드는 지금 값을 그대로 다시 싣는다(제목·설명·태그·언어·COPPA 선언·합성미디어 고지 전부). 되돌릴 수 없는 변경이므로 **처음 쓰는 영상에는 dryRun: true 를 먼저 부르고 wouldSend 를 눈으로 확인할 것.** publishAt(예약 공개)은 privacyStatus 가 private 일 때만 걸린다 — 아니면 400 으로 거부한다. **스코프**: youtube (읽기 전용 youtube.readonly 로는 안 되고 게시용 youtube.upload 로도 안 된다). 부족하면 에러에 재발급 안내가 실려 온다.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: '대상 영상 id (permalink 의 v= 값)' },
        privacyStatus: {
          type: 'string',
          enum: ['public', 'unlisted', 'private'],
          description: '공개 범위. 미지정이면 지금 값을 유지한다',
        },
        title: { type: 'string', description: '제목 ≤100자. 미지정이면 지금 제목을 유지한다' },
        description: { type: 'string', description: '설명 ≤5000바이트(한국어 약 1,666자). 롱폼이면 챕터 타임스탬프가 여기 들어간다. 미지정이면 지금 설명을 유지한다' },
        categoryId: { type: 'string', description: 'YouTube 카테고리 id. 미지정이면 지금 값을 유지한다' },
        madeForKids: { type: 'boolean', description: 'COPPA 자기 선언. 미지정이면 지금 값을 유지한다 — 빼고 보내면 기본값으로 되돌아가는 API 함정을 이 툴이 막는다' },
        containsSyntheticMedia: { type: 'boolean', description: '합성 미디어 고지. 미지정이면 지금 값을 유지한다' },
        publishAt: { type: 'string', description: '예약 공개 시각 (RFC3339, 예 2026-08-20T09:00:00Z). privacyStatus 를 "private" 로 함께 줘야 걸린다' },
        dryRun: { type: 'boolean', description: '보낼 본문만 돌려주고 호출하지 않는다. 되돌릴 수 없는 변경 앞의 확인용', default: false },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_insights',
    title: 'YouTube 성과 인사이트',
    annotations: HINT.read,
    outputSchema: YOUTUBE_INSIGHTS_OUTPUT,
    description:
      'YouTube 성과 인사이트 — 채널 통계(구독자·총 조회)와 기간 지표(조회·engagedViews·평균 시청 지속·평균 시청 비율·구독 증감), 최근 업로드별 지표를 한 번에 반환한다(읽기 전용, 부작용 없음). grow-youtube 루프가 틱마다 스냅샷을 찍어 전 틱 대비 증감과 잘 먹힌 영상 유형을 판단하는 용도 — 저장·비교는 호출자가 data/<채널>/growth/youtube/ 에서 한다. **스코프 2종 필요**: 채널·영상 조회는 youtube.readonly, 기간 지표는 yt-analytics.readonly. 게시(youtube.upload)만으로 발급한 기존 토큰에는 없으므로 재발급이 필요하고, 부족 시 에러에 재발급 안내가 실려 온다. 수익 지표(includeRevenue)는 yt-analytics-monetary.readonly 가 하나 더 필요하며 실패해도 나머지 지표는 그대로 온다. **Analytics 데이터는 2~3일 지연**되므로 어제·오늘 값이 비어 보이는 것은 정상이고, days 를 7 이상으로 두어야 추세가 보인다. 쇼츠 훅 판정에 쓰는 스와이프 이탈률(Studio 의 "How many chose to view")은 Analytics API 에 대응 메트릭이 없어 이 툴로 못 가져온다 — averageViewPercentage 로 대신하고 스와이프 지표는 Studio 에서 수동 확인할 것.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '집계 일수 (기본 7, 1~365). Analytics 지연이 2~3일이라 7 미만은 비어 보일 수 있다' },
        videoLimit: { type: 'number', description: '지표를 붙일 최근 업로드 수 (기본 10, 최대 50, 0 이면 채널 지표만)' },
        includeRevenue: {
          type: 'boolean',
          description: '수익 지표 포함 (기본 false) — yt-analytics-monetary.readonly 스코프가 추가로 필요하다',
          default: false,
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
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
      '받은 댓글 인박스 — Threads·Instagram·Facebook·YouTube 최근 게시물의 댓글·대댓글을 한 번에 모아 정규화 목록으로 반환한다(읽기 전용, 부작용 없음). 기본값은 **우리가 아직 답하지 않은 남의 댓글만**(includeOwn/includeAnswered=false) — "이미 답했는가"는 추측이 아니라 플랫폼 필드(Threads is_reply_owned_by_me · IG username 일치 · FB from.id==pageId · YT authorChannelId 일치)로 판정하므로 중복 답글이 나가지 않는다. YouTube 는 스레드 안 우리 마지막 답글 시각을 기준으로 판정해, 우리 답글 **뒤에** 달린 새 댓글은 미응대로 잡힌다. 답글 목록을 온전히 받지 못한 스레드(답글 100건 초과 또는 조회 실패)는 판정 근거가 없으므로 **응대됨으로 처리해 목록에서 뺀다** — 놓친 댓글은 다음 조회에서 잡히지만, 반대로 틀리면 중복 답글이 공개로 나가기 때문이다. 각 댓글에 ageMinutes 가 실려 오며 summary.withinGoldenHour 는 첫 60분 안에 남은 미응대 수다(답글 속도가 확산을 좌우 — 이 값이 0 이 아니면 최우선 처리). 응답의 commentId 를 sns_comment_reply/sns_comment_moderate 에 그대로 넘긴다. YouTube 는 댓글 스코프(youtube.force-ssl)가 없으면 skipped 에 재발급 안내와 함께 실려 나온다.',
    inputSchema: {
      type: 'object',
      properties: {
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'] },
          description: '조회할 플랫폼 (생략 시 자격증명이 있는 4개 플랫폼 전부)',
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
      `⚠️ 받은 댓글에 답글 작성 — 로컬 토큰으로 **즉시 공개 답글**을 단다(작성 주체는 브랜드 계정 자신). 별도 검토 게이트가 없으므로 사용자가 승인한 최종 문안만 게시한다(HITL — 승인 없이 호출 금지). commentId 는 sns_comment_inbox 응답값을 그대로 쓴다. 플랫폼별 계약: THREADS 는 reply_to_id 를 단 새 게시물이 곧 답글이라 대댓글의 대댓글까지 자유롭게 이어진다 / INSTAGRAM 은 **최상위 댓글에만** 답글이 붙는다(대댓글에 답하려면 그 부모 commentId 를 넘길 것 — parentCommentId 가 있는 댓글은 그 값을 사용) / FACEBOOK 은 댓글 id 에 다는 댓글이 곧 대댓글이다 / YOUTUBE 도 최상위 댓글에만 붙지만 대댓글 id 를 넘겨도 된다 — 이 툴이 부모를 조회해 스레드 루트로 바꿔 달고 응답의 parentCommentId 로 어디에 붙었는지 알린다(youtube.force-ssl 스코프 필요). 실패 시 같은 호출을 맹목 재시도하지 않는다(비멱등 — 중복 답글). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'], description: '대상 플랫폼' },
        commentId: { type: 'string', description: 'sns_comment_inbox 의 commentId (IG 는 최상위 댓글 id 여야 함 — YT 는 대댓글 id 도 허용)' },
        message: { type: 'string', description: '답글 완성본 — THREADS ≤500자, IG ≤2200자, FB ≤8000자, YT ≤10000자' },
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
      '⚠️ 받은 댓글 숨김/해제와 Facebook 댓글 좋아요 — 호출 즉시 반영된다(HITL — 사용자 승인 없이 호출 금지). **삭제는 제공하지 않는다**: 숨김은 되돌릴 수 있고 작성자 본인에게는 계속 보여 마찰이 적은 반면 삭제는 비가역이라, 스팸·어뷰징 대응에는 숨김이 브랜드 리스크가 낮다. 정당한 비판·불만은 숨기지 않는다 — 숨김은 스팸·광고·혐오·개인정보 노출에만 쓴다. like/unlike 는 FACEBOOK 만 지원한다(Threads·IG 는 댓글 좋아요 API 자체가 없어 답글이 유일한 반응 수단). **YouTube 는 지원하지 않는다** — API 가 제공하는 것은 의미가 다른 검토 보류/거부(setModerationStatus)뿐이라 되돌릴 수 있는 숨김으로 매핑할 수 없다. YouTube 댓글은 Studio 에서 처리한다.',
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

  // ── Instagram 성장 조회 (grow-instagram 스킬 전용 읽기 툴 — 부작용 없음) ──
  {
    name: 'instagram_insights',
    title: 'Instagram 성과 인사이트',
    annotations: HINT.read,
    outputSchema: INSTAGRAM_INSIGHTS_OUTPUT,
    description:
      'Instagram 성과 인사이트 — 계정 구간 지표(도달·조회·프로필 방문·참여 계정·상호작용·저장·프로필 링크 누름)와 최근 미디어별 지표를 한 번에 반환한다(읽기 전용, 부작용 없음). grow-instagram 루프가 틱마다 스냅샷을 찍어 전 틱 대비 증감과 잘 먹힌 릴스 유형을 판단하는 용도 — 저장·비교는 호출자가 data/<채널>/growth/instagram/ 에서 한다. **릴스(mediaProductType=REELS)에만** ig_reels_avg_watch_time(평균 시청 시간 ms)·ig_reels_video_view_total_time(총 시청 시간 ms)·reels_skip_rate(건너뛴 비율)가 붙는다 — 이 셋이 훅 판정의 1차 지표이고, 이미지·캐러셀에는 플랫폼이 지원하지 않는다. **팔로워 수는 인사이트가 아니라 account.followersCount 프로필 값**을 쓴다(인사이트의 follower_count 는 팔로워 100 미만 계정에서 빈 값이라 신규 채널에서 쓸 수 없다). **instagram_business_manage_insights 스코프 필요** — 게시용으로 발급한 기존 토큰에는 없을 수 있으며, 부족 시 에러에 재발급 안내가 실려 온다. 미디어당 /insights 1회 왕복이라 mediaLimit 만큼 API 호출이 늘어난다.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '계정 지표 집계 일수 (기본 7, 1~90)' },
        mediaLimit: {
          type: 'number',
          description: '지표를 붙일 최근 미디어 수 (기본 10, 최대 25, 0 이면 계정 지표만)',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
    },
  },
  {
    name: 'content_feedback',
    title: '최근 게시분 피드백 보고서',
    annotations: HINT.generate,
    outputSchema: CONTENT_FEEDBACK_OUTPUT,
    description:
      '최근 게시분 피드백 — YouTube 와 Instagram 에서 최근 N편(기본 5)을 가져와 플랫폼별로 채점하고, 도표·퍼널·막대 차트 위주 HTML 보고서를 로컬에 쓴다(외부 공개 없음). 유튜브는 초반 통과(engagedViews/조회)·평균 시청 비율, 인스타 릴스는 3초 이탈(reels_skip_rate)·평균 시청·도달 대비 공유를 본다. 절대 임계가 아니라 이번 N편 중앙값 대비로 훅·유지·공유·각도 레버를 고른다. 유튜브에서 조회만 낮고 초반 통과·유지가 중앙 이상이면 각도 — 다음 편 제목을 방법·도구가 아니라 느끼는 문제로 연다. 토큰이 없는 플랫폼은 그 섹션만 건너뛴다. **HTML 기본 경로** data/<channel>/growth/review-recent.html — outputPath 로 바꿀 수 있다. Analytics 는 2~3일 지연되므로 days 기본 28. review-recent 스킬이 이 툴을 부른 뒤 보고서를 연다.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: SNS_CHANNEL_PROPERTY,
        limit: {
          type: 'number',
          description: '플랫폼당 최근 게시 수 (기본 5, 1~10)',
        },
        days: {
          type: 'number',
          description: '집계 일수 (기본 28, 최소 7 — 유튜브 Analytics 지연을 감안)',
        },
        outputPath: {
          type: 'string',
          description:
            'HTML 저장 경로. 상대면 cwd 기준. 생략 시 data/<channel>/growth/review-recent.html. .html 만 허용, .. 금지',
        },
      },
    },
  },
  {
    name: 'youtube_topic_scout',
    title: '유튜브 시장 주제 스카우트',
    annotations: HINT.read,
    outputSchema: YOUTUBE_TOPIC_SCOUT_OUTPUT,
    description:
      '내 분야에서 이미 터진 유튜브 주제를 찾는다(읽기 전용). 시드 검색어로 관련 채널을 모은 뒤 각 채널의 최근 업로드 조회수 중앙값을 구하고, 그 중앙값의 5배(기본) 이상 나온 영상만 아웃라이어로 본다 — 절대 조회수는 채널 크기마다 기본값이 달라 주제를 고르는 잣대가 못 된다. 아웃라이어 제목에서 주제어를 뽑아 keywords 로 돌려준다. 주제만 참고하고 제목·썸네일·대본은 베끼지 말 것. includeComments=true 면 상위 아웃라이어 댓글에서 미해결 질문(결핍)을 gaps 에 싣는다. 인증은 YOUTUBE_API_KEY 가 우선(게시 쿼터를 안 씀)이고, 없으면 채널 OAuth youtube.readonly. search.list 가 호출당 100유닛이라 시드는 최대 4개.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '시드 검색어 — 채널 profile 주제 영역에서 뽑은 한 줄(예: "AI 업무 자동화"). 검색 툴 공통 인자명',
        },
        extraQueries: {
          type: 'array',
          items: { type: 'string' },
          description: '추가 시드(최대 3개, query 와 합쳐 4개). 같은 말의 다른 표현·하위 주제',
        },
        channel: SNS_CHANNEL_PROPERTY,
        excludeChannelId: {
          type: 'string',
          description: '결과에서 뺄 채널 id (UC…). 내 채널을 알고 있으면 넣는다. OAuth 면 mine 을 자동으로 뺀다',
        },
        regionCode: {
          type: 'string',
          description: '검색 지역 코드 2글자 (기본 US). 한국만 볼 때 KR. topic-scout 는 미국·중국을 기본으로 두 번 부른다',
        },
        language: {
          type: 'string',
          description: '관련 언어 (기본 en). 중국 시장은 zh, 한국만 볼 때 ko',
        },
        publishedAfterDays: {
          type: 'number',
          description: '이 일수 이내 영상만 검색에 쓴다 (기본 90, 7~365). "지금 시장"을 보는 창',
        },
        channelLimit: {
          type: 'number',
          description: '훑을 경쟁 채널 수 (기본 20, 5~40). 영상에서 말한 30~50 의 실용 상한',
        },
        videosPerChannel: {
          type: 'number',
          description: '채널당 최근 업로드 수 (기본 15, 5~30). 중앙값 표본',
        },
        minMultiplier: {
          type: 'number',
          description: '아웃라이어 배수 하한 (기본 5). 채널 중앙값 대비',
        },
        minViews: {
          type: 'number',
          description: '아웃라이어 최소 조회 (기본 1000). tiny 채널의 5×20회를 걸러 낸다',
        },
        duration: {
          type: 'string',
          enum: ['short', 'any'],
          default: 'short',
          description: 'short=4분 미만 검색·3분 이하 아웃라이어(쇼트폼 기본) | any=길이 무관',
        },
        includeComments: {
          type: 'boolean',
          description: '상위 5개 아웃라이어 댓글에서 질문형 결핍을 뽑을지 (기본 false — 쿼터 +5)',
        },
        limit: {
          type: 'number',
          description: '반환할 주제어 수 (기본 15, 3~30). 검색 툴 공통 인자명',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'sns_issue_scout',
    title: 'SNS 이슈 스카우트 (스레드·X·인스타, SerpApi)',
    annotations: HINT.read,
    outputSchema: SNS_ISSUE_SCOUT_OUTPUT,
    description:
      '스레드·X·인스타그램에서 내 주제로 지금 오가는 글을 모아 주제어를 세운다(읽기 전용). SerpApi 구글 검색에 site:threads.com / site:x.com / site:instagram.com 을 붙여 최근 구간(recency, 기본 week) 게시물을 플랫폼 × 시드마다 훑고, 게시물 URL 을 정규화해 중복을 걷어낸 뒤 여러 글·여러 플랫폼에 같이 나오는 주제어를 keywords 로 돌려준다. **youtube_topic_scout 과 잣대가 다르다** — 이 경로에는 좋아요·답글·조회 같은 참여량이 없고 순서도 구글 관련도순이라, 결과는 "무엇이 터졌나"가 아니라 "이 주제로 지금 무엇이 오가나"의 언급 목록이다. 점수는 언급 글 수 × 플랫폼 가중이므로 유튜브 배수 표와 같은 칸에 섞지 말 것. includeTrending(기본 true)이면 Google Trends 급상승 검색어(gl 나라)를 trending 에 붙이고 시드·상위 주제어와 겹치는 항목에 matchesSeed 를 표시한다. 크레딧 = 플랫폼 수 × 시드 수 × pagesPerQuery + 급상승 1 (기본 3×1×1+1=4건, 무료 250회/월) — 같은 시드를 같은 날 반복하지 말 것. 스니펫이 본문 그대로가 아닐 수 있다(스레드는 자동 생성 주제 요약문이 스니펫으로 오기도 한다) — 인용하려면 URL 을 열어 확인할 것.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '시드 검색어 — 채널 profile 주제 영역에서 뽑은 짧은 명사구(예: "AI 자동화"). 검색 툴 공통 인자명',
        },
        extraQueries: {
          type: 'array',
          items: { type: 'string' },
          description: '추가 시드(최대 3개, query 와 합쳐 4개). 같은 말의 다른 표현·하위 주제 — 시드 하나가 플랫폼 수만큼 크레딧을 쓴다',
        },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['threads', 'x', 'instagram'] },
          description: '훑을 플랫폼 (기본 셋 다). 좁히면 크레딧이 그만큼 준다',
        },
        recency: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          description: '최근 구간 (기본 week). "지금 이슈"는 day~week, 소재 풀은 month',
        },
        gl: { type: 'string', description: '국가 코드 2자 (기본 kr) — 검색 지역이자 급상승 검색어의 나라' },
        hl: { type: 'string', description: '언어 코드 (기본 ko)' },
        pagesPerQuery: {
          type: 'number',
          description: '플랫폼 × 시드마다 넘길 구글 페이지 수 (기본 1, 최대 2 — 한 페이지 10건). 2 로 두면 크레딧이 두 배',
        },
        includeTrending: {
          type: 'boolean',
          description: 'Google Trends 급상승 검색어를 함께 받을지 (기본 true, 크레딧 +1). serp_trending_now 를 따로 부를 거면 false',
        },
        trendingHours: {
          type: 'number',
          enum: [4, 24, 48, 168],
          description: '급상승 검색어 창 (기본 24). 4 | 24 | 48 | 168',
        },
        limit: { type: 'number', description: '반환할 주제어 수 (기본 15, 3~30). 검색 툴 공통 인자명' },
      },
      required: ['query'],
    },
  },

  // ── Threads 성장 조회 (grow-threads 스킬 전용 읽기 툴 — 부작용 없음) ─────
  // 인사이트·키워드 검색 스코프는 게시용 토큰에 없을 수 있다 — 부족 시 서버가
  // 에러에 재발급 안내(token-setup.md)를 얹어 반환한다.
  {
    name: 'threads_insights',
    title: 'Threads 성과 인사이트',
    annotations: HINT.read,
    outputSchema: THREADS_INSIGHTS_OUTPUT,
    description:
      'Threads 성과 인사이트 — 계정 지표(팔로워 수·프로필 조회 시계열·좋아요·답글·리포스트·인용 구간 합계)와 최근 루트 게시물별 지표를 한 번에 반환한다(읽기 전용, 부작용 없음). grow-threads 루프가 틱마다 스냅샷을 찍어 전 틱 대비 증감과 잘 먹힌 글 유형을 판단하는 용도 — 저장·비교는 호출자가 data/<채널>/growth/threads/ 에서 한다. views·shares 지표는 플랫폼이 "개발 중"으로 표시하는 값이라 오차가 있을 수 있고, followers_count 는 현재값만 온다(기간 무관). **threads_manage_insights 스코프 필요** — 게시용으로 발급한 기존 토큰에는 없을 수 있으며, 부족 시 에러에 재발급 안내가 실려 온다. 게시물당 /insights 1회 왕복이라 postLimit 만큼 API 호출이 늘어난다.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: '계정 지표 집계 일수 (기본 7, 1~90 — 플랫폼 제약상 2024-04-13 이전 데이터는 조회 불가)',
        },
        postLimit: {
          type: 'number',
          description: '지표를 붙일 최근 루트 게시물 수 (기본 10, 최대 25, 0 이면 계정 지표만)',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
    },
  },
  {
    name: 'threads_search',
    title: 'Threads 키워드 검색',
    annotations: HINT.read,
    outputSchema: THREADS_SEARCH_OUTPUT,
    description:
      'Threads 공개 게시물 키워드 검색 — 채널 관심 키워드로 남의 공개 대화를 찾아 참여 후보를 고른다(읽기 전용, 부작용 없음). 결과의 postId 를 threads_publish 의 replyToId 로 넘기면 그 글에 답글로 참여할 수 있다(답글 게시 자체는 게시 툴의 승인 정책을 따른다). 대화 참여 목적이면 searchType=RECENT + sinceHours 로 신선한 글을 고를 것 — 오래된 글 답글은 도달이 없다. **threads_keyword_search 스코프 필요**(부족 시 에러에 재발급 안내). 쿼터: 계정당 24시간 롤링 2,200회(결과 없는 쿼리 미포함) — 틱당 키워드 1~3개면 충분하다. 민감·유해 키워드는 빈 결과가 정상 동작이며, 앱이 고급 접근 승인 전이면 자기 계정 게시물만 검색된다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 키워드 (채널 growth-plan 의 관심 키워드)' },
        searchType: {
          type: 'string',
          enum: ['TOP', 'RECENT'],
          description: 'TOP=인기순(기본) | RECENT=최신순 — 대화 참여용은 RECENT 권장',
        },
        searchMode: {
          type: 'string',
          enum: ['KEYWORD', 'TAG'],
          description: 'KEYWORD=본문 검색(기본) | TAG=게시물에 붙은 토픽 태그 일치',
        },
        sinceHours: { type: 'number', description: '이 시간 이내 게시물만 (예: 24 — RECENT 와 조합 권장)' },
        limit: { type: 'number', description: '결과 수 (기본 25, 최대 100)' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['query'],
    },
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
  threads_insights: 'THREADS',
  threads_search: 'THREADS',
  instagram_publish: 'INSTAGRAM',
  instagram_insights: 'INSTAGRAM',
  facebook_publish: 'FACEBOOK',
  facebook_comment: 'FACEBOOK',
  youtube_publish: 'YOUTUBE',
  youtube_insights: 'YOUTUBE',
};
