/**
 * 환경설정 로딩.
 *
 * 자격증명(SerpApi·Naver 키, SNS 토큰)은 기동 시가 아니라 **툴 호출 시점에 지연 검증**한다 —
 * 검색 키 없이도 게시 툴은 동작해야 하고, 그 반대도 마찬가지다.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export const config = {
  /** SerpApi 키 (serp_* 자료조사·사실검증 툴 필수) — https://serpapi.com/manage-api-key */
  serpApiKey: process.env.SERPAPI_API_KEY || '',
  /** Naver Open API 자격증명 (naver_search 툴 필수) — https://developers.naver.com/apps */
  naverClientId: process.env.NAVER_CLIENT_ID || '',
  naverClientSecret: process.env.NAVER_CLIENT_SECRET || '',
  /** 공공데이터포털 인증키 (datago_file_fetch·datago_api_call 필수 — 검색·상세·다운로드는 무인증) */
  dataGoKrApiKey: process.env.DATA_GO_KR_API_KEY || '',
  /** Gemini API 키 (veo_* 영상 생성 툴 필수) — https://aistudio.google.com/apikey */
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  /** OpenAI API 키 (gpt_image_* 이미지 생성 툴 필수) — https://platform.openai.com/api-keys */
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  requestTimeoutMs: 15_000,
};

/**
 * SNS 직접 게시 자격증명 경로 (채널별 게시 툴).
 *
 * 공통 디렉터리(SNS_TOKEN_DIR, 기본 ~/.config/social-flow) 아래 규약 파일명을 쓰되,
 * 채널별 env 로 개별 경로를 오버라이드할 수 있다 (600 권한, 커밋 금지).
 * 토큰 **값**은 env 로 받지 않는다 — Meta 60일 refresh 절차가 파일을 덮어쓰는 구조라
 * 파일 기반이어야 갱신이 가능하고, 커밋 파일(.mcp.json)에 시크릿이 실리는 것도 막는다.
 *
 * 게시 계정은 설정이 아니라 토큰의 /me 조회로 자동 결정된다 — 계정 ID 를 설정으로
 * 받으면 토큰·계정 불일치(잘못된 계정으로 게시) 여지가 생기므로 의도적으로 두지 않는다.
 */
const snsTokenDir = process.env.SNS_TOKEN_DIR || join(homedir(), '.config', 'social-flow');

export const SNS_CHANNELS = ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'] as const;
export type SnsChannel = (typeof SNS_CHANNELS)[number];

export const snsCredentialFiles: Record<SnsChannel, string> = {
  THREADS: process.env.THREADS_TOKEN_FILE || join(snsTokenDir, 'threads_token'),
  INSTAGRAM: process.env.INSTAGRAM_TOKEN_FILE || join(snsTokenDir, 'instagram_token'),
  FACEBOOK: process.env.FACEBOOK_PAGE_TOKEN_FILE || join(snsTokenDir, 'facebook_page_token'),
  YOUTUBE: process.env.YOUTUBE_OAUTH_FILE || join(snsTokenDir, 'youtube-oauth-client.json'),
};

export function requireSerpApiKey(): string {
  if (!config.serpApiKey) {
    throw new Error(
      'SERPAPI_API_KEY is not set. serp_* research tools require a SerpApi key (https://serpapi.com/manage-api-key). ' +
        'Do NOT publish unverified time-sensitive facts — use built-in WebSearch or naver_search instead, or ask the user for a fact source.',
    );
  }
  return config.serpApiKey;
}

export function requireDataGoKrKey(): string {
  if (!config.dataGoKrApiKey) {
    throw new Error(
      'DATA_GO_KR_API_KEY is not set. datago_file_fetch/datago_api_call require a data.go.kr 인증키 ' +
        '(www.data.go.kr 마이페이지 > 개인 API 인증키). 키가 있어도 API 별 활용신청(자동승인)이 선행돼야 한다. ' +
        '키 없이도 datago_search/datago_detail/datago_file_download 는 동작한다 — 파일데이터 수집은 그쪽을 쓸 것.',
    );
  }
  return config.dataGoKrApiKey;
}

export function requireGeminiKey(): string {
  if (!config.geminiApiKey) {
    throw new Error(
      'GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. veo_* video generation tools require a Gemini API key ' +
        '(https://aistudio.google.com/apikey). 영상 생성은 키 설정 전까지 사용할 수 없다 — ' +
        '검색·게시·이미지 툴은 이 키 없이도 정상 동작한다.',
    );
  }
  return config.geminiApiKey;
}

export function requireOpenAiKey(): string {
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. gpt_image_* image generation tools require an OpenAI API key ' +
        '(https://platform.openai.com/api-keys). 이미지 생성은 키 설정 전까지 사용할 수 없다 — ' +
        '검색·게시·영상 툴은 이 키 없이도 정상 동작한다.',
    );
  }
  return config.openaiApiKey;
}

export function requireNaverKeys(): { id: string; secret: string } {
  if (!config.naverClientId || !config.naverClientSecret) {
    throw new Error(
      'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not set. naver_search requires Naver Open API credentials ' +
        '(https://developers.naver.com/apps — 검색 API 사용 신청). ' +
        'Use built-in WebSearch or serp_* tools instead until the keys are configured.',
    );
  }
  return { id: config.naverClientId, secret: config.naverClientSecret };
}
