/**
 * Google Gemini TTS 음성 합성 클라이언트 — fect-mcp-server tts 모듈 이식.
 *
 * Google Gen AI SDK 로 텍스트를 음성으로 변환한다.
 * - 기본 모델: gemini-2.5-flash-preview-tts (요청별 model 로 교체 가능)
 * - 단일 화자(내레이션)와 2인 대화 합성 지원
 * - 언어는 요청 필드가 아니라 입력 텍스트에서 자동 감지된다 (103개 언어, zh-TW 제외)
 *
 * 응답은 컨테이너 없는 16-bit 원시 PCM(audio/L16) 이라 WAV 헤더를 씌워 저장하고
 * 경로만 반환한다 (원본의 클래스 래퍼는 이 서버의 모듈 함수 규약에 맞춰 접었다 —
 * 동작 동일).
 *
 * API 키는 기동 시가 아니라 호출 시점에 검증한다 (config.requireGeminiKey).
 */
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import { bareFilenameSchema, pcmToWav, saveAudioFile } from './media-utils.js';
/**
 * 지원 음성 30종과 성격 특성.
 *
 * 원본은 목록(types)·특성 표(handlers)·스키마 enum(tools) 3곳에 같은 30개를
 * 흩어 두었다. 이 서버는 이 레코드 하나를 정본으로 삼고 나머지를 파생시킨다 —
 * 음성이 추가될 때 한 곳만 고치면 된다.
 */
export const TTS_VOICES = {
    Zephyr: 'Bright',
    Puck: 'Upbeat',
    Charon: 'Informative',
    Kore: 'Firm',
    Fenrir: 'Excitable',
    Leda: 'Youthful',
    Orus: 'Firm',
    Aoede: 'Breezy',
    Callirrhoe: 'Easygoing',
    Autonoe: 'Bright',
    Enceladus: 'Breathy',
    Iapetus: 'Clear',
    Umbriel: 'Easygoing',
    Algieba: 'Smooth',
    Despina: 'Smooth',
    Erinome: 'Clear',
    Algenib: 'Gravelly',
    Rasalgethi: 'Informative',
    Laomedeia: 'Upbeat',
    Achernar: 'Soft',
    Alnilam: 'Firm',
    Schedar: 'Even',
    Gacrux: 'Mature',
    Pulcherrima: 'Forward',
    Achird: 'Friendly',
    Zubenelgenubi: 'Casual',
    Vindemiatrix: 'Gentle',
    Sadachbia: 'Lively',
    Sadaltager: 'Knowledgeable',
    Sulafat: 'Warm',
};
/** 음성 이름 배열 — zod enum·JSON Schema enum 의 단일 출처. */
export const TTS_VOICE_NAMES = Object.keys(TTS_VOICES);
export const DEFAULT_VOICE = 'Kore';
/** Gemini TTS 모델 (2026-07 기준) */
export const VALID_TTS_MODELS = [
    'gemini-2.5-flash-preview-tts', // 무료 티어 있음 · 최저가 (기본값)
    'gemini-2.5-pro-preview-tts', // 고품질 · 무료 티어 없음
    'gemini-3.1-flash-tts-preview', // TTS 계열 중 유일하게 스트리밍 지원 · 2배 가격
];
export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
/**
 * 세션 컨텍스트 한도 32k 토큰 대비 보수적 상한 (CJK 문자 ≈ 1~2 토큰).
 * 수 분을 넘는 출력은 품질 드리프트가 문서화되어 있어 분할 합성을 권장한다.
 */
export const MAX_TTS_INPUT_CHARS = 16_000;
/**
 * TTS 는 LLM 기반이라 회차 간 톤·속도가 흔들린다. 내레이션처럼 컷마다 이어 붙이는
 * 콘텐츠는 낮은 온도가 필수라 공급사 기본값(1.0) 대신 0.4 를 기본으로 둔다.
 */
export const DEFAULT_TTS_TEMPERATURE = 0.4;
/** 오디오 대신 텍스트 토큰이 반환돼 실패하는 현상이 무작위로 발생 — 공급사 문서가 재시도를 요구한다. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;
/** 원시 PCM 응답의 기본 규격 — mimeType 파라미터로 실제 값이 오면 그쪽을 쓴다. */
const PCM_FALLBACK_MIME = 'audio/L16;codec=pcm;rate=24000';
const PCM_CHANNELS = 1;
// ── 요청 스키마 ──────────────────────────────────────────────────
const voiceSchema = z.enum(TTS_VOICE_NAMES);
const modelSchema = z.enum(VALID_TTS_MODELS).optional().default(DEFAULT_TTS_MODEL);
const temperatureSchema = z.number().min(0).max(2).optional().default(DEFAULT_TTS_TEMPERATURE);
export const ttsGenerateSchema = z.object({
    text: z
        .string()
        .min(1, 'Text is required')
        .max(MAX_TTS_INPUT_CHARS, `Text exceeds ${MAX_TTS_INPUT_CHARS} characters (32k-token session limit); split the script`),
    voiceName: voiceSchema.optional().default(DEFAULT_VOICE),
    model: modelSchema,
    stylePrompt: z.string().optional(),
    temperature: temperatureSchema,
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
const speakerSchema = z.object({
    speakerName: z.string().min(1, 'Speaker name is required'),
    voiceName: voiceSchema,
});
export const ttsMultiSpeakerSchema = z.object({
    script: z
        .string()
        .min(1, 'Script is required')
        .max(MAX_TTS_INPUT_CHARS, `Script exceeds ${MAX_TTS_INPUT_CHARS} characters (32k-token session limit); split the script`),
    speakers: z.array(speakerSchema).min(1).max(2, 'Maximum 2 speakers allowed'),
    model: modelSchema,
    stylePrompt: z.string().optional(),
    temperature: temperatureSchema,
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
// ── 내부 헬퍼 ────────────────────────────────────────────────────
/** MIME 타입이 컨테이너 없는 원시 PCM 인지 판별 (Gemini TTS 는 audio/L16;codec=pcm;rate=24000). */
export function isRawPcmMimeType(mimeType) {
    const normalized = mimeType.toLowerCase();
    return normalized.startsWith('audio/l16') || normalized.includes('codec=pcm');
}
/** MIME 타입 파라미터에서 샘플레이트 추출 (기본 24000). */
export function parseSampleRate(mimeType) {
    const match = mimeType.match(/rate=(\d+)/);
    return match ? parseInt(match[1], 10) : 24_000;
}
/**
 * 스타일 지시문과 대본을 합성용 프롬프트로 조립한다.
 *
 * 라벨 없는 `스타일: "본문"` 합성은 분류기 오거절(PROHIBITED_CONTENT)을 유발하거나
 * 지시문을 그대로 낭독하는 실패 모드가 문서화되어 있어, 합성 preamble 과 대본 시작
 * 라벨을 명시한다.
 */
export function buildStyledPrompt(stylePrompt, transcript) {
    if (!stylePrompt)
        return transcript;
    return [
        'Synthesize the following transcript as speech.',
        `Director's Notes — Style: ${stylePrompt}`,
        '--- TRANSCRIPT BEGINS ---',
        transcript,
    ].join('\n');
}
/** MIME 타입 → 파일 확장자 (컨테이너 포맷 응답용). */
function extensionFromMimeType(mimeType) {
    const mimeToExt = {
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/x-wav': 'wav',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'audio/webm': 'webm',
        'audio/aac': 'aac',
        'audio/flac': 'flac',
    };
    return mimeToExt[mimeType.split(';')[0]] || 'wav';
}
/**
 * generateContent 호출 + 오디오 추출 (자동 재시도 포함).
 *
 * 3회 모두 실패하면 마지막 에러에 모델 교체 힌트를 붙인다 — `No content parts in
 * response` 가 연속되는 대본은 flash 로는 끝내 통과하지 않고 pro 로 바꾸면 한 번에
 * 나오는 실패 모드가 실측돼 있다.
 */
async function synthesizeWithRetry(model, contentText, speechConfig, temperature) {
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey: requireGeminiKey() });
    let lastError;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const config = {
                responseModalities: ['AUDIO'],
                speechConfig,
                // undefined 면 공급사 기본값(1.0). 스키마 기본값(0.4)이 주입되는 게 정상 경로다.
                ...(temperature !== undefined ? { temperature } : {}),
            };
            const response = await genai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: contentText }] }],
                config,
            });
            const parts = response.candidates?.[0]?.content?.parts;
            if (!parts || parts.length === 0)
                throw new Error('No content parts in response');
            for (const part of parts) {
                if (part.inlineData?.data) {
                    return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || PCM_FALLBACK_MIME };
                }
            }
            // 오디오 대신 텍스트 토큰이 반환된 경우 — 재시도 대상
            throw new Error('No audio data found in response parts');
        }
        catch (error) {
            lastError = error;
            if (attempt < MAX_ATTEMPTS - 1) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1)));
            }
        }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    const hint = model === DEFAULT_TTS_MODEL
        ? ' (retried 3x — this script may not pass on flash; retry with model="gemini-2.5-pro-preview-tts")'
        : ' (retried 3x)';
    throw new Error(message + hint);
}
/**
 * 오디오 페이로드를 파일로 저장한다.
 * - 원시 PCM(audio/L16 등)은 WAV 헤더(모노 16-bit)를 씌워 저장
 * - 컨테이너 포맷(mp3 등)은 그대로 저장
 */
function saveAudio(audio, outputPath, filename, defaultPrefix) {
    const rawBuffer = Buffer.from(audio.data, 'base64');
    const isPcm = isRawPcmMimeType(audio.mimeType);
    const fileBuffer = isPcm ? pcmToWav(rawBuffer, parseSampleRate(audio.mimeType), PCM_CHANNELS) : rawBuffer;
    const ext = isPcm ? 'wav' : extensionFromMimeType(audio.mimeType);
    return saveAudioFile(outputPath || process.cwd(), filename || `${defaultPrefix}_${Date.now()}.${ext}`, fileBuffer);
}
// ── 합성 함수 2종 ────────────────────────────────────────────────
/** 단일 화자 합성 — 내레이션·보이스오버 */
export async function generateSpeech(request) {
    const model = request.model || DEFAULT_TTS_MODEL;
    const voiceName = request.voiceName || DEFAULT_VOICE;
    try {
        console.error(`[TTS] Synthesizing... (model: ${model}, voice: ${voiceName}, ${request.text.length} chars)`);
        const speechConfig = {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        };
        const audio = await synthesizeWithRetry(model, buildStyledPrompt(request.stylePrompt, request.text), speechConfig, request.temperature);
        const audioPath = saveAudio(audio, request.outputPath, request.filename, 'tts');
        console.error(`[TTS] Audio saved to: ${audioPath}`);
        return { success: true, audioPath, text: request.text, voiceName, model };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[TTS] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
/** 2인 대화 합성 — 인터뷰·팟캐스트 형식 */
export async function generateDialogue(request) {
    const model = request.model || DEFAULT_TTS_MODEL;
    try {
        const speakerNames = request.speakers.map((s) => s.speakerName).join(', ');
        console.error(`[TTS] Synthesizing dialogue... (model: ${model}, speakers: ${speakerNames})`);
        const speechConfig = {
            multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: request.speakers.map((speaker) => ({
                    speaker: speaker.speakerName,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.voiceName } },
                })),
            },
        };
        const audio = await synthesizeWithRetry(model, buildStyledPrompt(request.stylePrompt, request.script), speechConfig, request.temperature);
        const audioPath = saveAudio(audio, request.outputPath, request.filename, 'tts_multi');
        console.error(`[TTS] Dialogue audio saved to: ${audioPath}`);
        return { success: true, audioPath, text: `Multi-speaker conversation with: ${speakerNames}`, model };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[TTS] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
