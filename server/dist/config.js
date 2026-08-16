/**
 * 환경설정 로딩.
 *
 * 자격증명(SerpApi·Naver 키, SNS 토큰)은 기동 시가 아니라 **툴 호출 시점에 지연 검증**한다 —
 * 검색 키 없이도 게시 툴은 동작해야 하고, 그 반대도 마찬가지다.
 */
import { existsSync, readdirSync } from 'node:fs';
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
    /** Gemini API 키 (veo_* 영상 · tts_* 음성 · music_* 음악 생성 툴 공통 필수) — https://aistudio.google.com/apikey */
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    /** OpenAI API 키 (gpt_image_* 이미지 생성 툴 필수) — https://platform.openai.com/api-keys */
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    /** BytePlus ModelArk API 키 (seedance_* 영상 생성 툴 필수) — https://ai.byteplus.com/ark/region:ap-southeast-1/apikey */
    arkApiKey: process.env.ARK_API_KEY || '',
    requestTimeoutMs: 15_000,
};
/**
 * ModelArk 리전 엔드포인트.
 *
 * 영상 모델은 ap-southeast-1(싱가포르)에만 있어서 기본값이 곧 유일한 선택지다.
 * env 오버라이드를 남겨 두는 건 리전이 늘거나 중국 본토 방주(volcengine)를 쓰는
 * 설치본을 위한 것이고, 자동 탐색은 하지 않는다 — 조용한 리전 이동은 "어제는
 * 되던 모델이 오늘 없는" 실패가 된다.
 */
export function arkBaseUrl() {
    return (process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '');
}
/**
 * 로컬 TTS(Supertonic)를 실행할 Python 인터프리터.
 *
 * 다른 자격증명과 달리 **없어도 기동은 된다** — `python3` 로 폴백하고, 실제로 없거나
 * 패키지가 안 깔렸으면 호출 시점에 설치 안내와 함께 실패한다(supertonic-client).
 *
 * venv 경로를 자동 탐색하지 않는 건 의도적이다. `./venv`·`./.venv` 를 뒤지면 편하지만,
 * 저장소마다 다른 가상환경을 조용히 집어 "어제는 되던 목소리가 오늘 다른 목소리"가
 * 되는 실패가 생긴다. 어느 인터프리터를 쓸지는 명시로만 정한다.
 */
export function supertonicPython() {
    return process.env.SUPERTONIC_PYTHON || 'python3';
}
/**
 * 로컬 이미지 생성(Z-Image Turbo)을 실행할 mflux CLI 실행 파일.
 *
 * supertonicPython 과 같은 원칙 — 없어도 기동은 되고, 호출 시점에 설치 안내와 함께
 * 실패한다(zimage-client). 기본값은 uv tool 의 결정적 설치 경로다. PATH 를 뒤지는
 * 폴백은 두지 않는다 — 조용한 자동 발견은 "어제는 되던 게 오늘 다른 결과"를 만든다.
 */
export function mfluxZImageBin() {
    return process.env.MFLUX_ZIMAGE_BIN || join(homedir(), '.local', 'bin', 'mflux-generate-z-image-turbo');
}
/**
 * SNS 직접 게시 자격증명 경로 (플랫폼별 게시 툴).
 *
 * 용어 계약: **채널(channel) = 운영 브랜드**(data/<slug> 와 1:1), **플랫폼(platform)
 * = SNS 서비스**(Threads·Instagram·Facebook·YouTube). 토큰은 두 층으로 해석된다:
 *
 *   <SNS_TOKEN_DIR>/<채널 slug>/<규약 파일명>   ← 채널 지정 시 (멀티 채널 운영)
 *   <SNS_TOKEN_DIR>/<규약 파일명>               ← 채널 미지정 시 (단일 채널·레거시)
 *
 * 채널 지정 시 평면(기본) 파일로 **폴백하지 않는다** — 기본 토큰이 다른 브랜드
 * 계정일 때 조용히 오계정 게시되는 사고를 원천 차단한다 (2026-07-29 사용자 확정).
 * 플랫폼별 *_TOKEN_FILE env 오버라이드는 기본(평면) 경로에만 적용된다.
 *
 * 토큰 **값**은 env 로 받지 않는다 — Meta 60일 refresh 절차가 파일을 덮어쓰는 구조라
 * 파일 기반이어야 갱신이 가능하고, 커밋 파일(.mcp.json)에 시크릿이 실리는 것도 막는다.
 *
 * 게시 계정은 설정이 아니라 토큰의 /me 조회로 자동 결정된다 — 계정 ID 를 설정으로
 * 받으면 토큰·계정 불일치(잘못된 계정으로 게시) 여지가 생기므로 의도적으로 두지 않는다.
 */
export const snsTokenDir = process.env.SNS_TOKEN_DIR || join(homedir(), '.config', 'social-flow');
export const SNS_PLATFORMS = ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'];
/** 플랫폼별 규약 파일명 — 채널 디렉토리 안에서도 같은 이름을 쓴다. */
const SNS_CREDENTIAL_FILENAMES = {
    THREADS: 'threads_token',
    INSTAGRAM: 'instagram_token',
    FACEBOOK: 'facebook_page_token',
    YOUTUBE: 'youtube-oauth-client.json',
};
/** 기본(채널 미지정) 자격증명 — 평면 파일. *_TOKEN_FILE env 는 이 경로에만 적용된다. */
const defaultSnsCredentialFiles = {
    THREADS: process.env.THREADS_TOKEN_FILE || join(snsTokenDir, 'threads_token'),
    INSTAGRAM: process.env.INSTAGRAM_TOKEN_FILE || join(snsTokenDir, 'instagram_token'),
    FACEBOOK: process.env.FACEBOOK_PAGE_TOKEN_FILE || join(snsTokenDir, 'facebook_page_token'),
    YOUTUBE: process.env.YOUTUBE_OAUTH_FILE || join(snsTokenDir, 'youtube-oauth-client.json'),
};
/** 채널 slug 규약 — data/<slug> 와 동일한 kebab-case. 경로 조립에 쓰이므로 트래버설을 원천 차단한다. */
export const CHANNEL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** 채널·플랫폼 → 자격증명 파일 경로. 채널 지정 시 채널 디렉토리만 본다(폴백 없음). */
export function snsCredentialFile(platform, channel) {
    if (!channel)
        return defaultSnsCredentialFiles[platform];
    if (!CHANNEL_SLUG_RE.test(channel)) {
        throw new Error(`Invalid channel slug: "${channel}" — kebab-case (data/<slug> 와 동일 규약)만 허용된다.`);
    }
    return join(snsTokenDir, channel, SNS_CREDENTIAL_FILENAMES[platform]);
}
/** <SNS_TOKEN_DIR> 하위에서 규약 파일을 1개 이상 가진 채널 디렉토리 나열 (없으면 빈 배열). */
export function listChannelDirs() {
    let entries;
    try {
        entries = readdirSync(snsTokenDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && CHANNEL_SLUG_RE.test(entry.name))
            .map((entry) => entry.name);
    }
    catch {
        return []; // SNS_TOKEN_DIR 자체가 없음 — 자격증명 미설정
    }
    return entries
        .map((channel) => ({
        channel,
        platforms: SNS_PLATFORMS.filter((platform) => existsSync(snsCredentialFile(platform, channel))),
    }))
        .filter((dir) => dir.platforms.length > 0)
        .sort((a, b) => a.channel.localeCompare(b.channel));
}
export function requireSerpApiKey() {
    if (!config.serpApiKey) {
        throw new Error('SERPAPI_API_KEY is not set. serp_* research tools require a SerpApi key (https://serpapi.com/manage-api-key). ' +
            'Do NOT publish unverified time-sensitive facts — use built-in WebSearch or naver_search instead, or ask the user for a fact source.');
    }
    return config.serpApiKey;
}
export function requireDataGoKrKey() {
    if (!config.dataGoKrApiKey) {
        throw new Error('DATA_GO_KR_API_KEY is not set. datago_file_fetch/datago_api_call require a data.go.kr 인증키 ' +
            '(www.data.go.kr 마이페이지 > 개인 API 인증키). 키가 있어도 API 별 활용신청(자동승인)이 선행돼야 한다. ' +
            '키 없이도 datago_search/datago_detail/datago_file_download 는 동작한다 — 파일데이터 수집은 그쪽을 쓸 것.');
    }
    return config.dataGoKrApiKey;
}
export function requireGeminiKey() {
    if (!config.geminiApiKey) {
        throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. veo_* (video), tts_* (speech), and music_* (Lyria) ' +
            'generation tools all require a Gemini API key (https://aistudio.google.com/apikey). ' +
            '영상·음성·음악 생성은 키 설정 전까지 사용할 수 없다 — 검색·게시·이미지 툴은 이 키 없이도 정상 동작한다.');
    }
    return config.geminiApiKey;
}
export function requireOpenAiKey() {
    if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not set. gpt_image_* image generation tools require an OpenAI API key ' +
            '(https://platform.openai.com/api-keys). 이미지 생성은 키 설정 전까지 사용할 수 없다 — ' +
            '검색·게시·영상 툴은 이 키 없이도 정상 동작한다.');
    }
    return config.openaiApiKey;
}
export function requireArkKey() {
    if (!config.arkApiKey) {
        throw new Error('ARK_API_KEY is not set. seedance_* (video) generation tools require a BytePlus ModelArk API key ' +
            '(https://ai.byteplus.com/ark/region:ap-southeast-1/apikey). ' +
            '키는 서명용 AccessKeyId/SecretAccessKey 가 아니라 콘솔이 따로 발급하는 API Key 다(ark- 로 시작). ' +
            '그리고 키만으로는 부족하다 — 모델마다 콘솔 Model activation 에서 먼저 켜야 하고, 안 켜면 태스크 생성이 ' +
            'ModelNotOpen 으로 떨어진다(seedance-1-5-pro 포함, 2026-08-15 실측). 첫 활성화 때 ' +
            'TOS·VPC·ML 플랫폼 교차 서비스 권한 부여를 요구하는데 이건 계정 주인이 눌러야 한다. ' +
            'Dreamina Seedance 2.5·2.0 계열은 그 위에 계정 잔액 $30 초과 또는 리소스팩 구매라는 관문이 하나 더 있다 ' +
            '(seedance-1-5-pro·1-0-pro 계열은 잔액 관문만 없다). ' +
            '이 키가 없어도 veo_* 영상 생성은 GEMINI_API_KEY 로 정상 동작한다 — 어느 쪽을 쓸지는 ' +
            'skills/produce/references/video-model-selection.md 를 볼 것.');
    }
    return config.arkApiKey;
}
export function requireNaverKeys() {
    if (!config.naverClientId || !config.naverClientSecret) {
        throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not set. naver_search requires Naver Open API credentials ' +
            '(https://developers.naver.com/apps — 검색 API 사용 신청). ' +
            'Use built-in WebSearch or serp_* tools instead until the keys are configured.');
    }
    return { id: config.naverClientId, secret: config.naverClientSecret };
}
