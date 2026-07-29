import { z } from 'zod';
import * as datago from './datago-client.js';
import * as image from './image-client.js';
import * as music from './music-client.js';
import * as naver from './naver-client.js';
import * as serp from './serp-client.js';
import * as sns from './sns-client.js';
import * as tts from './tts-client.js';
import * as video from './video-client.js';
import { formatError, formatFileSize, saveBase64Image } from './media-utils.js';
function text(message, isError = false) {
    return { content: [{ type: 'text', text: message }], isError };
}
/** 생성 이미지 응답 — base64 이미지 블록 + 요약 텍스트 블록 (fect-mcp 계약 승계). */
function imageResult(message, base64Data, mimeType) {
    return {
        content: [
            { type: 'image', data: base64Data, mimeType },
            { type: 'text', text: message },
        ],
    };
}
/**
 * 플랫폼 API 결과 → MCP 툴 결과.
 *
 * 성공 시 본문이 JSON 객체면 structuredContent 로도 실어 outputSchema 계약을
 * 만족시킨다(스펙은 직렬화 JSON 을 텍스트 블록으로도 함께 실으라고 권한다).
 * 실패 시에는 structuredContent 를 채우지 않는다 — 실패 본문은 플랫폼 원문
 * 에러라 우리 스키마를 만족하지 않으며, isError 로 이미 구분된다.
 */
function fromApi(result, note) {
    if (!result.ok) {
        return text(`HTTP ${result.status}\n${result.body}`, true);
    }
    // 노트는 성공 경로에만 붙인다 — 게시 실패에 "게시 완료" 안내가 실리면
    // 호출자가 실패를 성공으로 보고하고 후속 절차(링크 답글 등)를 건너뛴다.
    const out = text(note ? `${note}\n${result.body}` : result.body);
    const parsed = tryParseObject(result.body);
    if (parsed)
        out.structuredContent = parsed;
    return out;
}
function tryParseObject(body) {
    try {
        const value = JSON.parse(body);
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value
            : undefined;
    }
    catch {
        return undefined;
    }
}
/** Zod 파싱 실패를 모델이 교정 가능한 메시지로 변환 */
function parseArgs(schema, args) {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        throw new Error(`Invalid arguments — ${issues}`);
    }
    return parsed.data;
}
// ── 조사 스키마 ──────────────────────────────────────────────────
const serpWebSchema = z.object({
    q: z.string().min(1).max(300),
    gl: z.string().regex(/^[a-z]{2}$/i, 'must be a 2-letter country code, e.g. kr, us').optional(),
    hl: z.string().min(2).max(7).optional(),
    location: z.string().max(120).optional(),
    num: z.number().int().min(1).max(20).optional(),
    page: z.number().int().min(1).max(5).optional(),
    recency: z.enum(['hour', 'day', 'week', 'month', 'year']).optional(),
});
const serpNewsSchema = z.object({
    q: z.string().min(1).max(300),
    gl: z.string().regex(/^[a-z]{2}$/i, 'must be a 2-letter country code, e.g. kr, us').optional(),
    hl: z.string().min(2).max(7).optional(),
    max_results: z.number().int().min(1).max(20).optional(),
});
const serpNaverSchema = z.object({
    query: z.string().min(1).max(300),
    where: z.enum(['web', 'news']).optional(),
    page: z.number().int().min(1).max(5).optional(),
    sort_by: z.enum(['relevance', 'latest']).optional(),
    max_results: z.number().int().min(1).max(20).optional(),
});
const naverSearchSchema = z.object({
    query: z.string().min(1).max(300),
    type: z.enum(['news', 'blog', 'web', 'cafe']).optional(),
    display: z.number().int().min(1).max(30).optional(),
    start: z.number().int().min(1).max(1000).optional(),
    sort: z.enum(['sim', 'date']).optional(),
});
// ── 공공데이터포털 스키마 ────────────────────────────────────────
const datagoTypeSchema = z.enum(['API', 'FILE']);
const datagoSearchSchema = z.object({
    keyword: z.string().min(1).max(100),
    type: datagoTypeSchema.optional(),
    page: z.number().int().min(1).max(50).optional(),
    perPage: z.number().int().min(1).max(20).optional(),
});
const datagoDetailSchema = z.object({
    publicDataPk: z.string().regex(/^\d+$/, 'publicDataPk is the numeric id from datago_search'),
    type: datagoTypeSchema,
});
const datagoDownloadSchema = z.object({
    publicDataPk: z.string().regex(/^\d+$/),
    publicDataDetailPk: z.string().min(1).max(200),
    saveDir: z
        .string()
        .regex(/^\//, 'saveDir must be an absolute path')
        .optional(),
});
const datagoFileFetchSchema = z.object({
    publicDataPk: z.string().regex(/^\d+$/),
    uddi: z.string().min(1).max(200),
    page: z.number().int().min(1).max(100_000).optional(),
    perPage: z.number().int().min(1).max(50).optional(),
});
const datagoApiCallSchema = z.object({
    path: z
        .string()
        .min(1)
        .max(300)
        .regex(/^[\w.\-/]+$/, 'path is the segment after apis.data.go.kr/, e.g. 1360000/VilageFcstInfoService_2.0/getUltraSrtNcst'),
    params: z
        .record(z.union([z.string().max(500), z.number(), z.boolean()]))
        .refine((p) => !Object.keys(p).some((k) => /^servicekey$/i.test(k)), {
        message: 'serviceKey is injected by the server — do not pass it',
    })
        .optional(),
});
// ── SNS 게시 스키마 ──────────────────────────────────────────────
const SNS_PUBLISHED_NOTE = '게시 완료 — 이미 외부에 공개된 상태다. permalink 를 사용자에게 보고할 것.';
const isVideoUrl = (u) => /\.(mp4|mov)(\?|#|$)/i.test(u);
/** 채널(브랜드) slug — data/<slug> 규약과 동일. 지정 시 채널 토큰만 사용(기본 토큰 폴백 없음). */
const channelSlugSchema = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'channel must be a kebab-case slug (same as data/<slug>)')
    .optional();
/**
 * Threads 본문 길이 — 플랫폼은 500자 상한을 세되 **이모지는 UTF-8 바이트로** 센다.
 *
 * JS 의 `.length`(UTF-16 코드 유닛)는 이모지를 2로 세어 플랫폼(대개 4)보다 적게
 * 잡는다. 즉 이 검증을 통과한 캡션이 플랫폼에서 거부될 수 있다. BMP 밖 문자만
 * 실제 UTF-8 바이트 수로 세어 과소 계산을 없앤다 (한글·ASCII 는 그대로 1).
 */
export function threadsTextLength(text) {
    let count = 0;
    for (const ch of text) {
        count += (ch.codePointAt(0) ?? 0) > 0xffff ? Buffer.byteLength(ch, 'utf8') : 1;
    }
    return count;
}
const THREADS_MAX_CHARS = 500;
const threadsPublishSchema = z.object({
    caption: z
        .string()
        .min(1)
        .refine((value) => threadsTextLength(value) <= THREADS_MAX_CHARS, (value) => ({
        message: `THREADS caption must be ≤${THREADS_MAX_CHARS} chars (got ${threadsTextLength(value)} — 이모지는 UTF-8 바이트로 계산된다)`,
    })),
    imageUrl: z.string().url().optional(),
    replyToId: z.string().min(1).optional(),
    channel: channelSlugSchema,
});
const instagramPublishSchema = z
    .object({
    caption: z.string().min(1).max(2200, 'INSTAGRAM caption must be ≤2200 chars'),
    imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
    videoUrl: z.string().url().optional(),
    channel: channelSlugSchema,
})
    .superRefine((v, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!v.imageUrls && !v.videoUrl)
        issue('imageUrls', 'INSTAGRAM requires imageUrls (1-10) or videoUrl (reel)');
    if (v.imageUrls && v.videoUrl)
        issue('videoUrl', 'imageUrls and videoUrl are mutually exclusive');
    if (v.videoUrl && !isVideoUrl(v.videoUrl))
        issue('videoUrl', 'videoUrl must be a .mp4/.mov URL');
});
const facebookPublishSchema = z
    .object({
    caption: z.string().min(1).max(5000),
    imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
    videoUrl: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
    channel: channelSlugSchema,
})
    .superRefine((v, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.imageUrls && v.videoUrl)
        issue('videoUrl', 'imageUrls and videoUrl are mutually exclusive');
    if (v.videoUrl && !isVideoUrl(v.videoUrl))
        issue('videoUrl', 'videoUrl must be a .mp4/.mov URL');
    if (v.linkUrl && (v.imageUrls || v.videoUrl))
        issue('linkUrl', 'linkUrl is for text-only posts (no media)');
});
const facebookCommentSchema = z.object({
    postId: z.string().min(1),
    message: z.string().min(1).max(8000, 'FACEBOOK comment must be ≤8000 chars'),
    channel: channelSlugSchema,
});
const youtubePublishSchema = z.object({
    videoFilePath: z.string().min(1),
    title: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[^<>]*$/, 'YouTube rejects angle brackets in titles'),
    caption: z.string().min(1).max(5000),
    privacyStatus: z.enum(['public', 'unlisted', 'private']).optional(),
    thumbnailFilePath: z.string().min(1).optional(),
    categoryId: z
        .string()
        .regex(/^\d{1,3}$/, 'categoryId is a numeric YouTube category id, e.g. 22 (People & Blogs)')
        .optional(),
    madeForKids: z.boolean().optional(),
    channel: channelSlugSchema,
});
// ── 받은 댓글 관리 스키마 (인박스는 읽기 전용, 답글·숨김은 즉시 공개) ─────
const commentPlatform = z.enum(['THREADS', 'INSTAGRAM', 'FACEBOOK']);
/** 플랫폼별 답글 길이 상한 — 게시 본문 상한과 같다(플랫폼 하드 리밋). */
const REPLY_MAX_CHARS = { THREADS: 500, INSTAGRAM: 2200, FACEBOOK: 8000 };
const commentInboxSchema = z.object({
    platforms: z.array(commentPlatform).min(1).optional(),
    channel: channelSlugSchema,
    postLimit: z.number().int().min(1).max(25).optional(),
    commentLimit: z.number().int().min(1).max(100).optional(),
    sinceHours: z.number().min(0.1).max(720).optional(),
    includeAnswered: z.boolean().optional(),
    includeOwn: z.boolean().optional(),
});
const commentReplySchema = z
    .object({
    platform: commentPlatform,
    commentId: z.string().min(1),
    message: z.string().min(1),
    channel: channelSlugSchema,
})
    .superRefine((v, ctx) => {
    const max = REPLY_MAX_CHARS[v.platform];
    // THREADS 는 게시 본문과 같은 이모지 바이트 규칙을 쓴다 (답글 = 새 게시물)
    const length = v.platform === 'THREADS' ? threadsTextLength(v.message) : v.message.length;
    if (length > max) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['message'],
            message: `${v.platform} reply must be ≤${max} chars (got ${length})`,
        });
    }
});
const commentModerateSchema = z.object({
    platform: commentPlatform,
    commentId: z.string().min(1),
    action: z.enum(['hide', 'unhide', 'like', 'unlike']),
    channel: channelSlugSchema,
});
const accountCheckSchema = z.object({
    channel: channelSlugSchema,
});
// ── 라우팅 ───────────────────────────────────────────────────────
export const ROUTES = {
    serp_web_search: async (args) => {
        const result = await serp.webSearch(parseArgs(serpWebSchema, args));
        return text(result.text, result.isError);
    },
    serp_news_search: async (args) => {
        const result = await serp.newsSearch(parseArgs(serpNewsSchema, args));
        return text(result.text, result.isError);
    },
    serp_naver_search: async (args) => {
        const result = await serp.naverSearch(parseArgs(serpNaverSchema, args));
        return text(result.text, result.isError);
    },
    naver_search: async (args) => {
        const result = await naver.naverSearch(parseArgs(naverSearchSchema, args));
        return text(result.text, result.isError);
    },
    // ── 공공데이터포털 (검색·상세·다운로드는 무인증 / fetch·api_call 은 키+활용신청) ──
    datago_search: async (args) => {
        const result = await datago.searchDatasets(parseArgs(datagoSearchSchema, args));
        return text(result.text, result.isError);
    },
    datago_detail: async (args) => {
        const result = await datago.datasetDetail(parseArgs(datagoDetailSchema, args));
        return text(result.text, result.isError);
    },
    datago_file_download: async (args) => {
        const result = await datago.downloadFile(parseArgs(datagoDownloadSchema, args));
        return text(result.text, result.isError);
    },
    datago_file_fetch: async (args) => {
        const result = await datago.fetchFileRows(parseArgs(datagoFileFetchSchema, args));
        return text(result.text, result.isError);
    },
    datago_api_call: async (args) => {
        const result = await datago.callOpenApi(parseArgs(datagoApiCallSchema, args));
        return text(result.text, result.isError);
    },
    // ── 이미지 생성 (OpenAI GPT Image) — base64 이미지 블록 + 요약 텍스트 반환 ──
    gpt_image_text2img: async (args) => {
        const request = parseArgs(image.text2ImageSchema, args);
        const result = await image.generateFromText(request);
        if (!result.success || !result.base64) {
            return text(`Image generation failed: ${result.error}`, true);
        }
        let summary = `Image generated successfully\n\nModel: ${result.model}\nSize: ${result.size ?? 'auto'}\nQuality: ${result.quality ?? 'auto'}\nMIME Type: ${result.mimeType}\nPrompt: ${result.prompt}`;
        if (result.revisedPrompt)
            summary += `\nRevised Prompt: ${result.revisedPrompt}`;
        if (request.savePath) {
            try {
                const saved = await saveBase64Image(result.base64, request.savePath);
                summary += `\nSaved to: ${saved.filePath} (${formatFileSize(saved.size)})`;
            }
            catch (saveError) {
                summary += `\nFile save failed: ${formatError(saveError)}`;
            }
        }
        return imageResult(summary, result.base64, result.mimeType);
    },
    gpt_image_img2img: async (args) => {
        const request = parseArgs(image.img2ImgSchema, args);
        const result = await image.generateFromImage(request);
        if (!result.success || !result.base64) {
            return text(`Image editing failed: ${result.error}`, true);
        }
        let summary = `Image edited successfully\n\nModel: ${result.model}\nSize: ${result.size ?? 'auto'}\nQuality: ${result.quality ?? 'auto'}\nReference Images: ${request.sourceImagesBase64.length}\nMask: ${request.maskBase64 ? 'yes' : 'no'}\nInput Fidelity: ${request.inputFidelity ?? 'default'}\nMIME Type: ${result.mimeType}\nPrompt: ${result.prompt}`;
        if (result.revisedPrompt)
            summary += `\nRevised Prompt: ${result.revisedPrompt}`;
        if (request.savePath) {
            try {
                const saved = await saveBase64Image(result.base64, request.savePath);
                summary += `\nSaved to: ${saved.filePath} (${formatFileSize(saved.size)})`;
            }
            catch (saveError) {
                summary += `\nFile save failed: ${formatError(saveError)}`;
            }
        }
        return imageResult(summary, result.base64, result.mimeType);
    },
    // ── 영상 생성 (Veo 3.1) — mp4 로컬 저장 후 경로·메타 텍스트 반환 ──
    veo_text2video: async (args) => {
        const result = await video.generateFromText(parseArgs(video.text2VideoSchema, args));
        if (!result.success)
            return text(`Video generation failed: ${result.error}`, true);
        return text(`Video generated successfully!\n\nFile: ${result.videoPath}\nModel: ${result.model}\nAspect Ratio: ${result.aspectRatio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds\nPrompt: ${result.prompt}`);
    },
    veo_img2video: async (args) => {
        const result = await video.generateFromImage(parseArgs(video.img2VideoSchema, args));
        if (!result.success)
            return text(`Video generation from image failed: ${result.error}`, true);
        const lastImageInfo = result.lastImage ? `\nLast Frame Image: ${result.lastImage}` : '';
        const modeInfo = result.lastImage ? ' (frame interpolation mode)' : '';
        return text(`Video generated from image${modeInfo} successfully!\n\nOutput: ${result.videoPath}\nFirst Frame Image: ${result.sourceImage}${lastImageInfo}\nModel: ${result.model}\nAspect Ratio: ${result.aspectRatio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds\nPrompt: ${result.prompt}`);
    },
    veo_extension: async (args) => {
        const result = await video.extendVideo(parseArgs(video.videoExtensionSchema, args));
        if (!result.success)
            return text(`Video extension failed: ${result.error}`, true);
        return text(`Video extended successfully!\n\nOutput: ${result.videoPath}\nSource Video: ${result.sourceVideo}\nModel: ${result.model}\nResolution: ${result.resolution}\nAdded Duration: +${result.duration} seconds\nPrompt: ${result.prompt}`);
    },
    veo_reference: async (args) => {
        const result = await video.generateWithReferences(parseArgs(video.referenceVideoSchema, args));
        if (!result.success)
            return text(`Video generation with references failed: ${result.error}`, true);
        const refImagesInfo = result.referenceImages?.join('\n  - ') || '';
        return text(`Video generated with reference images successfully!\n\nOutput: ${result.videoPath}\nReference Images (${result.referenceImages?.length || 0}):\n  - ${refImagesInfo}\nModel: ${result.model}\nAspect Ratio: ${result.aspectRatio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds\nPrompt: ${result.prompt}`);
    },
    // ── 음성 합성 (Gemini TTS) — wav 로컬 저장 후 경로·메타 텍스트 반환 ──
    // 대본 전문이 아니라 길이만 돌려준다 — 16k 자 대본을 그대로 반향하면
    // 호출자 컨텍스트만 태우고, 이미 자기가 보낸 문자열이라 정보가 없다.
    tts_generate: async (args) => {
        const request = parseArgs(tts.ttsGenerateSchema, args);
        const result = await tts.generateSpeech(request);
        if (!result.success)
            return text(`TTS generation failed: ${result.error}`, true);
        const style = request.stylePrompt ? `\nStyle: ${request.stylePrompt}` : '';
        return text(`Audio generated successfully!\n\nFile: ${result.audioPath}\nVoice: ${result.voiceName}\nModel: ${result.model}\nTemperature: ${request.temperature}${style}\nText length: ${request.text.length} chars`);
    },
    tts_multi_speaker: async (args) => {
        const request = parseArgs(tts.ttsMultiSpeakerSchema, args);
        const result = await tts.generateDialogue(request);
        if (!result.success)
            return text(`Multi-speaker TTS generation failed: ${result.error}`, true);
        const speakerInfo = request.speakers.map((s) => `  - ${s.speakerName}: ${s.voiceName}`).join('\n');
        return text(`Multi-speaker audio generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nSpeakers:\n${speakerInfo}\nScript length: ${request.script.length} chars`);
    },
    tts_list_voices: async () => {
        const voiceList = Object.entries(tts.TTS_VOICES)
            .map(([voice, characteristic]) => `  - ${voice}: ${characteristic}`)
            .join('\n');
        return text(`Available TTS Voices (${tts.TTS_VOICE_NAMES.length} voices):\n\n${voiceList}\n\n` +
            `Tips for choosing a voice:\n` +
            `- For professional/business: Kore, Charon, Rasalgethi, Alnilam\n` +
            `- For friendly/casual: Achird, Puck, Zubenelgenubi, Sulafat\n` +
            `- For calm/gentle: Achernar, Vindemiatrix, Umbriel\n` +
            `- For energetic/lively: Fenrir, Sadachbia, Laomedeia\n` +
            `- For clear narration: Iapetus, Erinome, Schedar\n\n` +
            `채널 프로파일(data/<slug>/profile.md)에 TTS 보이스가 지정돼 있으면 그 값을 그대로 쓸 것 — ` +
            `회차마다 목소리가 바뀌면 채널 정체성이 깨진다.`);
    },
    // ── 음악 생성 (Lyria) — 30초 배치 클립 / 길이 지정 스트리밍 ──
    music_generate_clip: async (args) => {
        const result = await music.generateClip(parseArgs(music.musicClipSchema, args));
        if (!result.success)
            return text(`Clip music generation failed: ${result.error}`, true);
        return text(`Music clip generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: 30 seconds (fixed)\nPrompt: ${result.prompt}\n\n` +
            `44.1kHz stereo MP3. Lyria 3 는 비결정론적이다 — 재사용할 BGM 이면 이 파일을 에셋으로 보관할 것(같은 프롬프트로 같은 곡이 다시 나오지 않는다).`);
    },
    music_generate: async (args) => {
        const request = parseArgs(music.musicGenerateSchema, args);
        const result = await music.generateSimple(request);
        if (!result.success)
            return text(`Music generation failed: ${result.error}`, true);
        const settings = [
            request.genre && `genre: ${request.genre}`,
            request.mood && `mood: ${request.mood}`,
            request.instruments?.length && `instruments: ${request.instruments.join(', ')}`,
            request.bpm && `bpm: ${request.bpm}`,
        ].filter(Boolean);
        const settingsInfo = settings.length > 0 ? `\nSettings: ${settings.join(', ')}` : '';
        return text(`Music generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: ${result.durationSeconds} seconds\nPrompt: ${result.prompt}${settingsInfo}\n\n48kHz stereo 16-bit WAV.`);
    },
    music_generate_advanced: async (args) => {
        const request = parseArgs(music.musicAdvancedSchema, args);
        const result = await music.generateAdvanced(request);
        if (!result.success)
            return text(`Advanced music generation failed: ${result.error}`, true);
        const promptInfo = request.prompts.map((p) => `  - "${p.text}" (weight: ${p.weight ?? 1.0})`).join('\n');
        const configInfo = request.config
            ? `\nConfig: ${Object.entries(request.config)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ')}`
            : '';
        return text(`Advanced music generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: ${result.durationSeconds} seconds\n\nWeighted Prompts:\n${promptInfo}${configInfo}\n\n48kHz stereo 16-bit WAV.`);
    },
    music_list_options: async () => {
        const bullets = (items) => items.map((item) => `  - ${item}`).join('\n');
        return text(`Suggested Music Generation Options (non-exhaustive — free text is accepted everywhere):\n\n` +
            `GENRES (${music.MUSIC_GENRES.length} suggestions):\n${bullets(music.MUSIC_GENRES)}\n\n` +
            `MOODS (${music.MUSIC_MOODS.length} suggestions):\n${bullets(music.MUSIC_MOODS)}\n\n` +
            `INSTRUMENTS (${music.MUSIC_INSTRUMENTS.length} suggestions):\n${bullets(music.MUSIC_INSTRUMENTS)}\n\n` +
            `TIPS for better results:\n` +
            `- Combine genre + mood for more specific output (e.g., "calm jazz", "energetic techno")\n` +
            `- Specify instruments for desired sound palette\n` +
            `- Use BPM to control tempo (60=slow, 120=moderate, 180=fast)\n` +
            `- For 30s short-form BGM, prefer music_generate_clip (Lyria 3 — describe BPM/key/mood in the prompt)\n` +
            `- For exact durations (5-300s), use music_generate (Lyria RealTime)\n` +
            `- For BGM under narration, ask for space in the vocal frequency range\n\n` +
            `ADVANCED CONTROLS (music_generate_advanced):\n` +
            `- guidance (0-6): How closely to follow the prompt (higher = more faithful)\n` +
            `- density (0-1): Note density (0=sparse, 1=dense)\n` +
            `- brightness (0-1): Tonal brightness (0=dark, 1=bright)\n` +
            `- temperature (0-3, model default 1.1): Creativity level (higher = more experimental)\n` +
            `- scale: Musical key (e.g., C_MAJOR_A_MINOR — each value covers a major key and its relative minor)\n` +
            `- topK (1-1000, model default 40): Sampling constraint\n` +
            `- seed (0-2147483647): Reproducibility — the ONLY way to regenerate the same music\n` +
            `- muteBass/muteDrums/onlyBassAndDrums: Rhythm section control\n` +
            `- musicGenerationMode: QUALITY (default) | DIVERSITY | VOCALIZATION`);
    },
    // ── 자사 SNS 직접 게시 (플랫폼별 툴 — 즉시 공개, HITL 승인 후 호출) ──
    threads_publish: async (args) => {
        const input = parseArgs(threadsPublishSchema, args);
        return fromApi(await sns.publishThreads(input), SNS_PUBLISHED_NOTE);
    },
    instagram_publish: async (args) => {
        const input = parseArgs(instagramPublishSchema, args);
        return fromApi(await sns.publishInstagram(input.videoUrl
            ? { caption: input.caption, videoUrl: input.videoUrl, channel: input.channel }
            : { caption: input.caption, imageUrls: input.imageUrls, channel: input.channel }), SNS_PUBLISHED_NOTE);
    },
    facebook_publish: async (args) => {
        const input = parseArgs(facebookPublishSchema, args);
        return fromApi(await sns.publishFacebook(input.videoUrl
            ? { caption: input.caption, videoUrl: input.videoUrl, channel: input.channel }
            : { caption: input.caption, imageUrls: input.imageUrls, linkUrl: input.linkUrl, channel: input.channel }), SNS_PUBLISHED_NOTE);
    },
    facebook_comment: async (args) => {
        const input = parseArgs(facebookCommentSchema, args);
        return fromApi(await sns.commentFacebook(input), SNS_PUBLISHED_NOTE);
    },
    youtube_publish: async (args) => {
        const input = parseArgs(youtubePublishSchema, args);
        return fromApi(await sns.publishYoutube({
            videoFilePath: input.videoFilePath,
            title: input.title,
            description: input.caption,
            privacyStatus: input.privacyStatus,
            thumbnailFilePath: input.thumbnailFilePath,
            categoryId: input.categoryId,
            madeForKids: input.madeForKids,
            channel: input.channel,
        }), SNS_PUBLISHED_NOTE);
    },
    sns_account_check: async (args) => {
        const input = parseArgs(accountCheckSchema, args);
        return fromApi(await sns.checkAccounts(input.channel));
    },
    // ── 받은 댓글 관리 (인박스는 읽기 전용, 답글·숨김은 즉시 공개) ──
    sns_comment_inbox: async (args) => {
        const input = parseArgs(commentInboxSchema, args);
        return fromApi(await sns.commentInbox(input));
    },
    sns_comment_reply: async (args) => {
        const input = parseArgs(commentReplySchema, args);
        return fromApi(await sns.replyToComment(input), SNS_PUBLISHED_NOTE);
    },
    sns_comment_moderate: async (args) => {
        const input = parseArgs(commentModerateSchema, args);
        return fromApi(await sns.moderateComment(input), '모더레이션 반영 완료 — 이미 플랫폼에 적용된 상태다.');
    },
};
