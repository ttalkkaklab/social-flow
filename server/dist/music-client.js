/**
 * Google Lyria 음악 생성 클라이언트 — fect-mcp-server music 모듈 이식.
 *
 * 성격이 다른 두 갈래 Lyria API 를 모두 감싼다:
 * - Lyria 3 Clip (배치): interactions 단일 호출 · 30초 고정 · MP3 44.1kHz 스테레오.
 *   쇼트폼 BGM 의 기본 경로 — 싸고 호출이 한 번이다.
 * - Lyria RealTime (WebSocket): 스트리밍 PCM 48kHz 스테레오 · 길이 5~300초 가변.
 *   내레이션 길이에 정확히 맞춰야 하거나 seed 재현성이 필요할 때 쓴다.
 *
 * 두 API 모두 인스트루멘털 지향이며 결과는 비결정론적이다 — 시그니처 BGM 은
 * 생성물을 에셋으로 저장해 재사용해야 한다 (RealTime 은 seed 로만 재현 가능).
 *
 * API 키는 기동 시가 아니라 호출 시점에 검증한다 (config.requireGeminiKey).
 */
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import { bareFilenameSchema, pcmToWav, saveAudioFile } from './media-utils.js';
/** Lyria 모델 ID */
export const LYRIA_CLIP_MODEL = 'lyria-3-clip-preview'; // 배치 · 30초 고정 · MP3
export const LYRIA_REALTIME_MODEL = 'models/lyria-realtime-exp'; // WebSocket · 스트리밍 PCM
/** Clip 은 항상 30초 고정 (API 제약) */
const CLIP_DURATION_SECONDS = 30;
/** Lyria RealTime 출력 규격 — 수신 바이트로 길이를 역산하는 데도 쓴다. */
const REALTIME_SAMPLE_RATE = 48_000;
const REALTIME_CHANNELS = 2;
const REALTIME_BYTES_PER_SAMPLE = 2; // 16-bit
const REALTIME_BYTES_PER_SECOND = REALTIME_SAMPLE_RATE * REALTIME_CHANNELS * REALTIME_BYTES_PER_SAMPLE;
/** 목표 길이를 채우지 못할 때의 여유 — 요청 길이 + 이 값까지만 기다린다. */
const REALTIME_TIMEOUT_MARGIN_MS = 30_000;
const REALTIME_POLL_INTERVAL_MS = 100;
/** 장르 제안 목록 (API 가 강제하는 enum 이 아님 — Lyria 는 자유 텍스트를 받는다) */
export const MUSIC_GENRES = [
    'Acid Jazz', 'Afrobeat', 'Ambient', 'Blues', 'Bossa Nova', 'Breakbeat', 'Classical',
    'Country', 'Disco', 'Drum and Bass', 'Dub', 'Dubstep', 'EDM', 'Electronic', 'Funk',
    'Gospel', 'Hip Hop', 'House', 'Jazz', 'Latin', 'Lo-Fi', 'Metal', 'Minimal Techno',
    'Pop', 'R&B', 'Reggae', 'Rock', 'Soul', 'Synthwave', 'Techno', 'Trance', 'World Music',
];
/** 분위기 제안 목록 (자유 텍스트 허용) */
export const MUSIC_MOODS = [
    'Ambient', 'Atmospheric', 'Calm', 'Cheerful', 'Cinematic', 'Dark', 'Dreamy', 'Emotional',
    'Energetic', 'Epic', 'Experimental', 'Happy', 'Hopeful', 'Intense', 'Melancholic',
    'Mysterious', 'Nostalgic', 'Peaceful', 'Playful', 'Powerful', 'Relaxing', 'Romantic',
    'Sad', 'Suspenseful', 'Uplifting',
];
/** 악기 제안 목록 (자유 텍스트 허용) */
export const MUSIC_INSTRUMENTS = [
    '303 Acid Bass', 'Acoustic Guitar', 'Bass Guitar', 'Cello', 'Drums', 'Electric Guitar',
    'Flute', 'Harp', 'Keyboard', 'Orchestra', 'Organ', 'Percussion', 'Piano', 'Saxophone',
    'Strings', 'Synth', 'Synth Bass', 'Synth Lead', 'Synth Pad', 'Trumpet', 'Violin',
    'Vocal Chops',
];
/** 조성 enum — 모델은 나란한조를 구분하지 않으므로 각 값이 장·단조 양쪽에 대응한다. */
export const MUSIC_SCALES = [
    'C_MAJOR_A_MINOR', 'D_FLAT_MAJOR_B_FLAT_MINOR', 'D_MAJOR_B_MINOR', 'E_FLAT_MAJOR_C_MINOR',
    'E_MAJOR_D_FLAT_MINOR', 'F_MAJOR_D_MINOR', 'G_FLAT_MAJOR_E_FLAT_MINOR', 'G_MAJOR_E_MINOR',
    'A_FLAT_MAJOR_F_MINOR', 'A_MAJOR_G_FLAT_MINOR', 'B_FLAT_MAJOR_G_MINOR', 'B_MAJOR_A_FLAT_MINOR',
    'SCALE_UNSPECIFIED',
];
/** 생성 모드 enum */
export const MUSIC_GENERATION_MODES = ['QUALITY', 'DIVERSITY', 'VOCALIZATION'];
// ── 요청 스키마 ──────────────────────────────────────────────────
const durationSchema = z.number().min(5).max(300).default(30);
/** weight 는 0 을 제외한 임의의 값 (±1 상·하한은 API 스펙에 없다) */
const weightedPromptSchema = z.object({
    text: z.string().min(1, 'Prompt text is required'),
    weight: z.number().refine((v) => v !== 0, 'Weight must be a non-zero value').default(1.0),
});
/** Lyria RealTime MusicGenerationConfig */
const musicConfigSchema = z.object({
    guidance: z.number().min(0).max(6).optional(),
    bpm: z.number().min(60).max(200).optional(),
    scale: z.enum(MUSIC_SCALES).optional(),
    density: z.number().min(0).max(1).optional(),
    brightness: z.number().min(0).max(1).optional(),
    temperature: z.number().min(0).max(3).optional(), // 미지정 시 모델 기본값 1.1
    topK: z.number().int().min(1).max(1000).optional(),
    seed: z.number().int().min(0).max(2_147_483_647).optional(), // 유일한 재현성 제어 수단
    muteBass: z.boolean().optional(),
    muteDrums: z.boolean().optional(),
    onlyBassAndDrums: z.boolean().optional(),
    musicGenerationMode: z.enum(MUSIC_GENERATION_MODES).optional(),
});
/** 프롬프트 하나로 생성 (RealTime) */
export const musicGenerateSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    genre: z.string().optional(),
    mood: z.string().optional(),
    instruments: z.array(z.string()).optional(),
    durationSeconds: durationSchema,
    bpm: z.number().min(60).max(200).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
/** 가중 프롬프트 혼합 + 세부 제어 (RealTime) */
export const musicAdvancedSchema = z.object({
    prompts: z.array(weightedPromptSchema).min(1, 'At least one prompt is required'),
    durationSeconds: durationSchema,
    config: musicConfigSchema.optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
/**
 * Lyria 3 Clip (배치 · 30초 고정).
 * BPM·조성·악기 등의 구조화 파라미터가 없으므로 프롬프트 본문에 자연어로 기술한다.
 */
export const musicClipSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
// ── Lyria 3 Clip (배치) ──────────────────────────────────────────
/**
 * 30초 고정 클립 생성 — 단일 호출.
 *
 * 결과는 비결정론적이며 seed 가 없으므로, 시그니처 BGM 은 생성물을 에셋으로
 * 저장해 재사용해야 한다.
 */
export async function generateClip(request) {
    try {
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey: requireGeminiKey() });
        console.error(`[Lyria] Generating 30s clip... (model: ${LYRIA_CLIP_MODEL})`);
        console.error(`[Lyria] Prompt: ${request.prompt.substring(0, 100)}...`);
        const interaction = await genai.interactions.create({
            model: LYRIA_CLIP_MODEL,
            input: request.prompt,
        });
        // Interactions API 는 2026-05 스키마 개편으로 평면 outputs[] 를 steps[].content[] 로
        // 바꿨다 (SDK 2.0 미만은 서버가 아예 거부한다). 오디오는 model_output 스텝 안에 있다.
        for (const step of interaction.steps ?? []) {
            if (step.type !== 'model_output')
                continue;
            for (const content of step.content ?? []) {
                if (content.type !== 'audio' || !content.data)
                    continue;
                const mimeType = content.mime_type || 'audio/mp3';
                const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
                const audioPath = saveAudioFile(request.outputPath || process.cwd(), request.filename || `music_clip_${Date.now()}.${ext}`, Buffer.from(content.data, 'base64'));
                console.error(`[Lyria] Clip saved to: ${audioPath}`);
                return {
                    success: true,
                    audioPath,
                    prompt: request.prompt,
                    durationSeconds: CLIP_DURATION_SECONDS,
                    model: LYRIA_CLIP_MODEL,
                };
            }
        }
        return { success: false, error: `No audio in interaction response (status: ${interaction.status})` };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Lyria] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
// ── Lyria RealTime (스트리밍) ────────────────────────────────────
/**
 * 간단한 프롬프트로 길이 지정 생성.
 *
 * genre/mood/instruments 를 프롬프트 문자열로 접어 generateAdvanced 에 위임한다 —
 * RealTime API 에는 이런 구조화 필드가 없다.
 */
export async function generateSimple(request) {
    const promptParts = [request.prompt];
    if (request.genre)
        promptParts.push(request.genre);
    if (request.mood)
        promptParts.push(request.mood);
    if (request.instruments && request.instruments.length > 0) {
        promptParts.push(`with ${request.instruments.join(', ')}`);
    }
    return generateAdvanced({
        prompts: [{ text: promptParts.join(', '), weight: 1.0 }],
        durationSeconds: request.durationSeconds ?? 30,
        config: request.bpm ? { bpm: request.bpm } : undefined,
        outputPath: request.outputPath,
        filename: request.filename,
    });
}
/** zod 로 검증된 config 를 SDK 타입으로 옮긴다 (명시된 키만 — 모델 기본값을 존중). */
function toLiveMusicConfig(config) {
    const result = {};
    if (config.guidance !== undefined)
        result.guidance = config.guidance;
    if (config.bpm !== undefined)
        result.bpm = config.bpm;
    if (config.scale !== undefined)
        result.scale = config.scale;
    if (config.density !== undefined)
        result.density = config.density;
    if (config.brightness !== undefined)
        result.brightness = config.brightness;
    if (config.temperature !== undefined)
        result.temperature = config.temperature;
    if (config.topK !== undefined)
        result.topK = config.topK;
    if (config.seed !== undefined)
        result.seed = config.seed;
    if (config.muteBass !== undefined)
        result.muteBass = config.muteBass;
    if (config.muteDrums !== undefined)
        result.muteDrums = config.muteDrums;
    if (config.onlyBassAndDrums !== undefined)
        result.onlyBassAndDrums = config.onlyBassAndDrums;
    if (config.musicGenerationMode !== undefined) {
        result.musicGenerationMode = config.musicGenerationMode;
    }
    return result;
}
/**
 * 가중 프롬프트 혼합 + 세부 제어 생성 (WebSocket 스트리밍).
 *
 * 목표 길이만큼의 PCM 바이트가 모이면 세션을 닫고 WAV 로 감싸 저장한다.
 * 스트림은 끝을 알리지 않으므로 "받은 양"이 종료 조건이다.
 */
export async function generateAdvanced(request) {
    const targetDuration = request.durationSeconds ?? 30;
    const targetBytes = targetDuration * REALTIME_BYTES_PER_SECOND;
    const audioChunks = [];
    const state = {
        received: 0,
        done: false,
        error: null,
    };
    let session;
    const weightedPrompts = request.prompts.map((p) => ({ text: p.text, weight: p.weight ?? 1.0 }));
    try {
        const { GoogleGenAI } = await import('@google/genai');
        // RealTime(live.music)은 v1alpha 에서만 노출된다.
        const genai = new GoogleGenAI({ apiKey: requireGeminiKey(), apiVersion: 'v1alpha' });
        console.error(`[Lyria] Streaming ${targetDuration}s... (model: ${LYRIA_REALTIME_MODEL})`);
        console.error(`[Lyria] Prompts: ${weightedPrompts.map((p) => `"${p.text}"(${p.weight})`).join(', ')}`);
        session = await genai.live.music.connect({
            model: LYRIA_REALTIME_MODEL,
            callbacks: {
                onmessage: (message) => {
                    if (state.done)
                        return;
                    for (const chunk of message.serverContent?.audioChunks ?? []) {
                        if (!chunk.data)
                            continue;
                        const buffer = Buffer.from(chunk.data, 'base64');
                        audioChunks.push(buffer);
                        state.received += buffer.length;
                    }
                },
                onerror: (error) => {
                    console.error('[Lyria] Session error:', error);
                    state.error = error instanceof Error ? error : new Error(String(error));
                },
                onclose: () => {
                    // 종료 처리는 아래 수신 대기 루프가 담당한다.
                },
            },
        });
        await session.setWeightedPrompts({ weightedPrompts });
        if (request.config) {
            const musicGenerationConfig = toLiveMusicConfig(request.config);
            if (Object.keys(musicGenerationConfig).length > 0) {
                await session.setMusicGenerationConfig({ musicGenerationConfig });
            }
        }
        await session.play();
        // 목표 바이트 수신까지 대기 (타임아웃: 요청 길이 + 30초)
        const startTime = Date.now();
        const timeoutMs = targetDuration * 1000 + REALTIME_TIMEOUT_MARGIN_MS;
        while (state.received < targetBytes && Date.now() - startTime < timeoutMs) {
            if (state.error)
                throw state.error;
            await new Promise((resolve) => setTimeout(resolve, REALTIME_POLL_INTERVAL_MS));
        }
        state.done = true;
        closeQuietly(session);
        session = undefined;
        if (audioChunks.length === 0) {
            return { success: false, error: 'No audio data received from Lyria RealTime' };
        }
        // 마지막 청크가 목표를 넘겨 도착하므로 요청 길이로 정확히 자른다 — 이 툴의
        // 존재 이유가 "길이를 지정할 수 있다"인데 31초가 나오면 계약을 어기는 것이다.
        // 샘플 경계(채널 × 2byte)에 맞춰 잘라야 스테레오 위상이 어긋나지 않는다.
        const rawPcm = Buffer.concat(audioChunks);
        const frameBytes = REALTIME_CHANNELS * REALTIME_BYTES_PER_SAMPLE;
        const trimTo = Math.floor(Math.min(rawPcm.length, targetBytes) / frameBytes) * frameBytes;
        const pcmData = rawPcm.subarray(0, trimTo);
        const audioPath = saveAudioFile(request.outputPath || process.cwd(), request.filename || `music_${Date.now()}.wav`, pcmToWav(pcmData, REALTIME_SAMPLE_RATE, REALTIME_CHANNELS));
        const durationSeconds = Math.round(pcmData.length / REALTIME_BYTES_PER_SECOND);
        console.error(`[Lyria] Music saved to: ${audioPath} (${durationSeconds}s)`);
        return {
            success: true,
            audioPath,
            prompt: weightedPrompts.map((p) => p.text).join(', '),
            durationSeconds,
            model: LYRIA_REALTIME_MODEL,
        };
    }
    catch (error) {
        state.done = true;
        if (session)
            closeQuietly(session);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Lyria] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
/** 세션 종료 실패는 이미 결정된 결과를 뒤집지 않는다 — 삼키고 로그만 적는다. */
function closeQuietly(session) {
    try {
        session.close();
    }
    catch (error) {
        console.error(`[Lyria] Session close failed (ignored): ${error instanceof Error ? error.message : String(error)}`);
    }
}
