/**
 * ElevenLabs speech client — REST (`xi-api-key`), plain fetch.
 *
 * The **third speech lane**, next to Gemini TTS (tts-client.ts) and on-device
 * Supertonic (supertonic-client.ts). Division of labor (docs/research/2026-08-22-elevenlabs-tts-api):
 *   - Narration bodies            → Supertonic (free) or Gemini ($38/1M chars). Not this one — $50–100/1M chars
 *   - Acted cuts with audio tags  → this one on eleven_v3 ([whispers], [laughs], [sarcastic] inline)
 *   - Dialogue beyond 2 speakers  → this one (text-to-dialogue, up to 10 voices in one request)
 *   - Subtitle sync               → this one (with-timestamps returns per-character start/end seconds)
 *
 * ## What the field tests pinned (2026-08-23, restricted key on the Mac mini)
 *
 * - `output_format` is a **query parameter**. Put it in the JSON body and the API
 *   silently ignores it and returns the default mp3 — measured (audio/mpeg came back).
 * - `wav_24000` returns a real RIFF/WAVE (correct size fields, mono 16-bit). That is
 *   the default here because build-reel.sh sniffs the first four bytes: RIFF is read
 *   as a container, anything else as raw s16le 24k — so an mp3 narration file would be
 *   decoded as noise. 24kHz also matches the Gemini lane byte for byte.
 * - `wav_44100`/`pcm_44100` are Pro-tier-and-above (403 `output_format_not_allowed`);
 *   `wav_48000` is not gated. Measured, not documented.
 * - with-timestamps returns two alignments. `alignment` is the input text character by
 *   character; `normalized_alignment` is the vendor's normalized text — **Korean comes
 *   back romanized** ("annyeo…"), so it can't index the source string. The sidecar
 *   keeps both verbatim; every summary here reads `alignment`.
 * - text-to-dialogue accepts only the v3 family (`model_does_not_support_dialogue` on
 *   multilingual_v2) and its with-timestamps variant adds `voice_segments`.
 * - The bill is the `character-cost` response header, not a local estimate, so it is
 *   reported as measured (same reasoning as completion_tokens on Seedance).
 *
 * The API key is validated at call time, not at startup (config.requireElevenLabsKey).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { elevenLabsBaseUrl, requireElevenLabsKey } from './config.js';
import { bareFilenameSchema, saveAudioFile } from './media-utils.js';
// ── Constants (source of truth for the tool schemas) ─────────────
/**
 * TTS-capable models as of 2026-08 (docs /models). v1 models were removed
 * 2026-07-09 and Turbo v2.5 is superseded by Flash v2.5 — kept because the vendor
 * still serves it, so an existing profile that names it keeps working.
 */
export const ELEVENLABS_MODELS = [
    'eleven_multilingual_v2', // vendor default for convert — stable, 10k chars, $0.10/1K chars
    'eleven_v3', // expressive — audio tags, 5k chars, the only dialogue model, $0.10/1K
    'eleven_v3_conversational', // v3 family tuned for realtime, half price ($0.05/1K) — convert only (dialogue rejects it, measured)
    'eleven_flash_v2_5', // fastest — 40k chars, $0.05/1K, language_code enforcement
    'eleven_turbo_v2_5', // deprecated in favor of flash_v2_5 (still served — kept for existing profiles)
];
/** Matches the vendor's own convert default — the same request should not sound different here. */
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';
/** text-to-dialogue rejects every other family (measured: model_does_not_support_dialogue). */
export const ELEVENLABS_DIALOGUE_MODEL = 'eleven_v3';
/**
 * Per-request character caps per model (docs /models "Character limits"). v3
 * conversational is not in that table — it gets v3's cap, the conservative read.
 */
export const ELEVENLABS_MODEL_CHAR_CAPS = {
    eleven_multilingual_v2: 10_000,
    eleven_v3: 5_000,
    eleven_v3_conversational: 5_000,
    eleven_flash_v2_5: 40_000,
    eleven_turbo_v2_5: 40_000,
};
/**
 * Schema cap = the default model's cap. A static schema can't vary by model, so v3's
 * lower cap is enforced in superRefine — still before the call, so a rejected
 * request costs nothing. Scene narration is a few hundred characters; anything near
 * these numbers is a script that wasn't split.
 */
export const MAX_ELEVENLABS_INPUT_CHARS = ELEVENLABS_MODEL_CHAR_CAPS[DEFAULT_ELEVENLABS_MODEL];
/** Dialogue: v3 cap applies to the whole request; the vendor recommends staying under ~2,000. */
export const MAX_ELEVENLABS_DIALOGUE_CHARS = ELEVENLABS_MODEL_CHAR_CAPS.eleven_v3;
export const ELEVENLABS_DIALOGUE_MAX_VOICES = 10;
export const ELEVENLABS_DIALOGUE_MAX_INPUTS = 50;
/**
 * Output formats exposed here — the production-relevant subset of the vendor's 29.
 *
 * Not exposed: pcm_* (container-less; wav_* is the same bytes with a header and the
 * builder needs the header), opus/m4a/ulaw/alaw (no place in the video pipeline;
 * opus is Ogg-wrapped, m4a is audio/mp4). wav_44100 stays in the list because a Pro
 * account has it and it matches Supertonic's 44.1kHz — below Pro it is a 403 before
 * any credit is spent.
 */
export const ELEVENLABS_OUTPUT_FORMATS = [
    'wav_16000',
    'wav_22050',
    'wav_24000',
    'wav_44100',
    'wav_48000',
    'mp3_44100_64',
    'mp3_44100_128',
    'mp3_44100_192',
];
/** Same spec as the Gemini lane (mono 24kHz 16-bit WAV) — the builder takes either without resampling. */
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = 'wav_24000';
/** Pro tier and above (measured 403 `output_format_not_allowed` below that). mp3_44100_192 is Creator and above per the docs. */
export const ELEVENLABS_PRO_ONLY_FORMATS = ['wav_44100'];
export const ELEVENLABS_TEXT_NORMALIZATION = ['auto', 'on', 'off'];
/** GET /v2/voices `category` values. */
export const ELEVENLABS_VOICE_CATEGORIES = ['premade', 'cloned', 'generated', 'professional'];
/** Concurrency limit per plan (docs /models; flash doubles it) — quoted in the 429 hint so the caller knows what to do. */
const CONCURRENCY_HINT = 'Free 2 · Starter 3 · Creator 5 · Pro 10 · Scale/Business 15, twice that on flash';
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
// ── Request schemas ──────────────────────────────────────────────
/**
 * voice_id goes into the URL path, so it is validated as an identifier — not a path.
 * Real IDs are 20 alphanumerics; the bound is loose on purpose (cloned/library IDs
 * may differ) but still rejects anything that could escape the path segment.
 */
const voiceIdSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'voiceId must be an ElevenLabs voice_id (letters, digits, _ or -)');
const modelSchema = z.enum(ELEVENLABS_MODELS).optional().default(DEFAULT_ELEVENLABS_MODEL);
const outputFormatSchema = z.enum(ELEVENLABS_OUTPUT_FORMATS).optional().default(DEFAULT_ELEVENLABS_OUTPUT_FORMAT);
/** ISO 639-1 as the API wants it ("ko", "en"). Only Flash/Turbo v2.5 and v3 enforce it; multilingual_v2 ignores it. */
const languageCodeSchema = z.string().regex(/^[a-z]{2}$/, 'languageCode must be a 2-letter ISO 639-1 code (e.g. "ko")').optional();
const seedSchema = z.number().int().min(0).max(4_294_967_295).optional();
const normalizationSchema = z.enum(ELEVENLABS_TEXT_NORMALIZATION).optional();
/** voice_settings — sent only when at least one is given, so the vendor defaults apply otherwise. */
const voiceSettingsFields = {
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    speed: z.number().min(0.7).max(1.2).optional(),
    useSpeakerBoost: z.boolean().optional(),
};
const outputFields = {
    outputFormat: outputFormatSchema,
    timestamps: z.boolean().optional().default(false),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
};
/** wav_* → .wav, mp3_* → .mp3. The extension is the builder's format hint, so it must tell the truth. */
export function extensionForFormat(format) {
    return format.startsWith('wav_') ? '.wav' : '.mp3';
}
/** Sample rate encoded in the format name (wav_24000 → 24000, mp3_44100_128 → 44100). */
export function sampleRateForFormat(format) {
    return parseInt(format.split('_')[1], 10);
}
function checkFilenameMatchesFormat(value, ctx) {
    if (!value.filename)
        return;
    const expected = extensionForFormat(value.outputFormat);
    if (path.extname(value.filename).toLowerCase() !== expected) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['filename'],
            message: `filename extension must be ${expected} for outputFormat ${value.outputFormat} — a mislabeled audio file is read as the wrong format downstream`,
        });
    }
}
export const elevenLabsGenerateSchema = z
    .object({
    text: z
        .string()
        .min(1, 'Text is required')
        .max(MAX_ELEVENLABS_INPUT_CHARS, `Text exceeds ${MAX_ELEVENLABS_INPUT_CHARS} characters; split the script by scene`),
    voiceId: voiceIdSchema,
    model: modelSchema,
    languageCode: languageCodeSchema,
    ...voiceSettingsFields,
    seed: seedSchema,
    previousText: z.string().optional(),
    nextText: z.string().optional(),
    applyTextNormalization: normalizationSchema,
    ...outputFields,
})
    .superRefine((value, ctx) => {
    const cap = ELEVENLABS_MODEL_CHAR_CAPS[value.model];
    if (value.text.length > cap) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['text'],
            message: `${value.model} takes at most ${cap} characters per request (got ${value.text.length}); split the script or pick another model`,
        });
    }
    // Measured: v3 answers 400 unsupported_model to previous_text/next_text — reject before the call.
    if (value.model === 'eleven_v3' && (value.previousText || value.nextText)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [value.previousText ? 'previousText' : 'nextText'],
            message: 'eleven_v3 does not accept previousText/nextText (vendor: "not yet supported") — drop them or use eleven_multilingual_v2',
        });
    }
    checkFilenameMatchesFormat(value, ctx);
});
const dialogueInputSchema = z.object({
    text: z.string().min(1, 'Line text is required'),
    voiceId: voiceIdSchema,
});
export const elevenLabsDialogueSchema = z
    .object({
    inputs: z
        .array(dialogueInputSchema)
        .min(1, 'At least one line is required')
        .max(ELEVENLABS_DIALOGUE_MAX_INPUTS, `At most ${ELEVENLABS_DIALOGUE_MAX_INPUTS} lines per request — split the scene`),
    // `settings` on the dialogue body is {stability} only (spec ModelSettingsResponseModel) —
    // use_speaker_boost/similarity/style are silently ignored there (measured), so not exposed.
    stability: z.number().min(0).max(1).optional(),
    seed: seedSchema,
    languageCode: languageCodeSchema,
    applyTextNormalization: normalizationSchema,
    ...outputFields,
})
    .superRefine((value, ctx) => {
    const total = value.inputs.reduce((sum, line) => sum + line.text.length, 0);
    if (total > MAX_ELEVENLABS_DIALOGUE_CHARS) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['inputs'],
            message: `Dialogue totals ${total} characters; ${ELEVENLABS_DIALOGUE_MODEL} takes at most ${MAX_ELEVENLABS_DIALOGUE_CHARS} per request — split by scene`,
        });
    }
    const voices = new Set(value.inputs.map((line) => line.voiceId));
    if (voices.size > ELEVENLABS_DIALOGUE_MAX_VOICES) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['inputs'],
            message: `${voices.size} distinct voices; text-to-dialogue allows at most ${ELEVENLABS_DIALOGUE_MAX_VOICES} per request`,
        });
    }
    checkFilenameMatchesFormat(value, ctx);
});
export const elevenLabsVoicesSchema = z.object({
    search: z.string().min(1).optional(),
    category: z.enum(ELEVENLABS_VOICE_CATEGORIES).optional(),
    /** Named `limit` like every other paged tool here (server-wide contract); maps to the vendor's page_size. */
    limit: z.number().int().min(1).max(100).optional().default(30),
});
/**
 * Turn an error body into a message the caller can act on.
 *
 * Three body shapes are in the wild (all measured): the current
 * `{detail:{type,code,message,status,request_id}}`, the older `{detail:{status,message}}`
 * (model_not_found still uses it), and FastAPI's 422 `{detail:[{loc,msg,type}]}`.
 * The status string, not the HTTP code, carries the meaning — 401 covers a bad key,
 * a restricted key, and an empty quota alike.
 */
export function describeElevenLabsError(httpStatus, bodyText) {
    let detail;
    try {
        detail = JSON.parse(bodyText).detail;
    }
    catch {
        return `HTTP ${httpStatus}: ${bodyText.slice(0, 300) || '(empty body)'}`;
    }
    if (Array.isArray(detail)) {
        const issues = detail
            .map((issue) => {
            const item = issue;
            const where = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : '';
            return where ? `${where}: ${item.msg ?? ''}` : item.msg ?? '';
        })
            .filter(Boolean);
        return `Invalid request (HTTP ${httpStatus}): ${issues.join('; ') || bodyText.slice(0, 300)}`;
    }
    const d = (detail && typeof detail === 'object' ? detail : {});
    const status = d.status || d.code || '';
    const message = (d.message || '').trim() || bodyText.slice(0, 300);
    switch (status) {
        case 'invalid_api_key':
        case 'needs_authorization':
        case 'unauthorized':
            return `${message} — ELEVENLABS_API_KEY is missing or wrong (https://elevenlabs.io/app/settings/api-keys).`;
        case 'missing_permissions':
            return (`${message} — this is a restricted key. Create one with the permission named in the message ` +
                `(text_to_speech for synthesis, voices_read for tts_elevenlabs_voices, user_read for the subscription line).`);
        case 'quota_exceeded':
        case 'payment_required':
            return `${message} — the plan's character allowance is used up for this cycle; top up or wait for the reset (https://elevenlabs.io/app/subscription).`;
        case 'too_many_concurrent_requests':
        case 'concurrent_limit_exceeded':
        case 'rate_limit_exceeded':
        case 'system_busy':
            return `${message} — concurrency/rate limit (${CONCURRENCY_HINT}); the server already retried ${MAX_ATTEMPTS}x. Run the scenes one at a time.`;
        case 'output_format_not_allowed':
            return `${message} — pick wav_24000 or wav_48000 (every plan) or upgrade the plan.`;
        case 'voice_not_found':
            return `${message} — copy the ID from tts_elevenlabs_voices or the Voice Library page (the ID, not the display name).`;
        case 'model_not_found':
            return `${message} — supported: ${ELEVENLABS_MODELS.join(', ')}.`;
        case 'model_does_not_support_dialogue':
            return `${message} — text-to-dialogue runs on ${ELEVENLABS_DIALOGUE_MODEL} only.`;
        case 'max_character_limit_exceeded':
            return `${message} — per-request caps: v3 ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_v3}, multilingual_v2 ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_multilingual_v2}, flash_v2_5 ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_flash_v2_5}. Split by scene.`;
        case 'free_users_not_allowed':
        case 'subscription_required':
            return `${message} — this feature needs a paid plan (https://elevenlabs.io/pricing).`;
        default:
            return status ? `HTTP ${httpStatus} ${status}: ${message}` : `HTTP ${httpStatus}: ${message}`;
    }
}
/** Retry only what a retry can fix: concurrency/busy 429s and 5xx. A 4xx is the same answer the second time. */
function isRetryable(httpStatus) {
    return httpStatus === 429 || httpStatus >= 500;
}
// ── HTTP ─────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Synthesis time scales with text, and v3 is the slow model (not real-time by
 * design). 60s of slack plus 40ms per character, cut off at 5 minutes.
 */
function timeoutFor(textLength) {
    return Math.min(5 * 60_000, 60_000 + textLength * 40);
}
async function elevenFetch(pathAndQuery, init, timeoutMs) {
    const apiKey = requireElevenLabsKey();
    const url = `${elevenLabsBaseUrl()}${pathAndQuery}`;
    const headers = {
        'xi-api-key': apiKey,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    };
    let lastError;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
        if (response.ok)
            return response;
        const bodyText = await response.text();
        lastError = new Error(describeElevenLabsError(response.status, bodyText));
        if (!isRetryable(response.status) || attempt === MAX_ATTEMPTS - 1)
            break;
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
    }
    throw lastError ?? new Error('ElevenLabs request failed');
}
/** Response meta the caller can't get anywhere else — the bill, the trace id, the vendor's latency. */
function readMeta(response) {
    const cost = response.headers.get('character-cost');
    const latency = response.headers.get('tts-latency-ms');
    return {
        characterCost: cost !== null && cost !== '' ? Number(cost) : undefined,
        requestId: response.headers.get('request-id') ?? undefined,
        latencyMs: latency !== null && latency !== '' ? Number(latency) : undefined,
    };
}
// ── Audio helpers ────────────────────────────────────────────────
/**
 * Duration of a RIFF/WAVE buffer from its fmt and data chunks. Walks the chunk
 * list instead of assuming a 44-byte header — the vendor's WAV carries a LIST/INFO
 * chunk before data (measured), so a fixed offset would read garbage.
 */
export function wavDurationSeconds(buffer) {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        return undefined;
    }
    let byteRate = 0;
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === 'fmt ' && body + 16 <= buffer.length) {
            byteRate = buffer.readUInt32LE(body + 8);
        }
        else if (id === 'data') {
            if (!byteRate)
                return undefined;
            const dataBytes = Math.min(size, buffer.length - body);
            return Math.round((dataBytes / byteRate) * 1000) / 1000;
        }
        offset = body + size + (size & 1);
    }
    return undefined;
}
/** Sidecar path: <audio basename>.alignment.json next to the audio file. */
function alignmentPathFor(audioPath) {
    const ext = path.extname(audioPath);
    return `${audioPath.slice(0, audioPath.length - ext.length)}.alignment.json`;
}
/**
 * Decode a with-timestamps body, save the audio and the sidecar, and summarize the
 * alignment. The sidecar keeps the vendor objects verbatim (both alignments, and
 * voice_segments for dialogue) — nothing is re-derived, so nothing can drift.
 */
function saveTimestamped(body, outputDir, filename, extra) {
    if (!body.audio_base64)
        throw new Error('with-timestamps response carried no audio_base64');
    const audio = Buffer.from(body.audio_base64, 'base64');
    const audioPath = saveAudioFile(outputDir, filename, audio);
    const alignmentPath = alignmentPathFor(audioPath);
    fs.writeFileSync(alignmentPath, JSON.stringify({
        ...extra,
        audio: path.basename(audioPath),
        alignment: body.alignment ?? null,
        normalized_alignment: body.normalized_alignment ?? null,
        ...(body.voice_segments ? { voice_segments: body.voice_segments } : {}),
    }, null, 2));
    const ends = body.alignment?.character_end_times_seconds ?? [];
    return {
        audioPath,
        alignmentPath,
        audio,
        speechEndSeconds: ends.length ? ends[ends.length - 1] : undefined,
        alignedCharacters: body.alignment?.characters?.length,
        voiceSegments: body.voice_segments?.length,
    };
}
function voiceSettingsFrom(request) {
    const settings = {};
    if (request.stability !== undefined)
        settings.stability = request.stability;
    if (request.similarityBoost !== undefined)
        settings.similarity_boost = request.similarityBoost;
    if (request.style !== undefined)
        settings.style = request.style;
    if (request.speed !== undefined)
        settings.speed = request.speed;
    if (request.useSpeakerBoost !== undefined)
        settings.use_speaker_boost = request.useSpeakerBoost;
    return Object.keys(settings).length ? settings : undefined;
}
// ── The 3 calls ──────────────────────────────────────────────────
/** Single-voice synthesis — POST /v1/text-to-speech/{voice_id}[/with-timestamps] */
export async function generateElevenLabsSpeech(request) {
    const outputDir = request.outputPath || process.cwd();
    const filename = request.filename || `elevenlabs_${Date.now()}${extensionForFormat(request.outputFormat)}`;
    try {
        console.error(`[ElevenLabs] Synthesizing... (model: ${request.model}, voice: ${request.voiceId}, ${request.text.length} chars, ${request.outputFormat}${request.timestamps ? ', timestamps' : ''})`);
        const body = {
            text: request.text,
            model_id: request.model,
            ...(request.languageCode ? { language_code: request.languageCode } : {}),
            ...(voiceSettingsFrom(request) ? { voice_settings: voiceSettingsFrom(request) } : {}),
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
            ...(request.previousText ? { previous_text: request.previousText } : {}),
            ...(request.nextText ? { next_text: request.nextText } : {}),
            ...(request.applyTextNormalization ? { apply_text_normalization: request.applyTextNormalization } : {}),
        };
        const endpoint = `/v1/text-to-speech/${encodeURIComponent(request.voiceId)}${request.timestamps ? '/with-timestamps' : ''}` +
            `?output_format=${request.outputFormat}`;
        const response = await elevenFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }, timeoutFor(request.text.length));
        const meta = readMeta(response);
        if (request.timestamps) {
            const saved = saveTimestamped((await response.json()), outputDir, filename, {
                engine: 'elevenlabs',
                model: request.model,
                voice_id: request.voiceId,
                text: request.text,
            });
            console.error(`[ElevenLabs] Audio saved to: ${saved.audioPath} (+ ${path.basename(saved.alignmentPath)})`);
            return {
                success: true,
                audioPath: saved.audioPath,
                alignmentPath: saved.alignmentPath,
                model: request.model,
                outputFormat: request.outputFormat,
                durationSeconds: wavDurationSeconds(saved.audio),
                speechEndSeconds: saved.speechEndSeconds,
                alignedCharacters: saved.alignedCharacters,
                ...meta,
            };
        }
        const audio = Buffer.from(await response.arrayBuffer());
        const audioPath = saveAudioFile(outputDir, filename, audio);
        console.error(`[ElevenLabs] Audio saved to: ${audioPath}`);
        return {
            success: true,
            audioPath,
            model: request.model,
            outputFormat: request.outputFormat,
            durationSeconds: wavDurationSeconds(audio),
            ...meta,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ElevenLabs] Error: ${message.split('\n')[0]}`);
        return { success: false, error: message };
    }
}
/** Multi-voice dialogue — POST /v1/text-to-dialogue[/with-timestamps] (eleven_v3) */
export async function generateElevenLabsDialogue(request) {
    const outputDir = request.outputPath || process.cwd();
    const filename = request.filename || `elevenlabs_dialogue_${Date.now()}${extensionForFormat(request.outputFormat)}`;
    const totalChars = request.inputs.reduce((sum, line) => sum + line.text.length, 0);
    try {
        const voices = new Set(request.inputs.map((line) => line.voiceId));
        console.error(`[ElevenLabs] Synthesizing dialogue... (${request.inputs.length} lines, ${voices.size} voices, ${totalChars} chars, ${request.outputFormat})`);
        const settings = {};
        if (request.stability !== undefined)
            settings.stability = request.stability;
        const body = {
            inputs: request.inputs.map((line) => ({ text: line.text, voice_id: line.voiceId })),
            model_id: ELEVENLABS_DIALOGUE_MODEL,
            ...(Object.keys(settings).length ? { settings } : {}),
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
            ...(request.languageCode ? { language_code: request.languageCode } : {}),
            ...(request.applyTextNormalization ? { apply_text_normalization: request.applyTextNormalization } : {}),
        };
        const endpoint = `/v1/text-to-dialogue${request.timestamps ? '/with-timestamps' : ''}?output_format=${request.outputFormat}`;
        const response = await elevenFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }, timeoutFor(totalChars));
        const meta = readMeta(response);
        if (request.timestamps) {
            const saved = saveTimestamped((await response.json()), outputDir, filename, {
                engine: 'elevenlabs',
                model: ELEVENLABS_DIALOGUE_MODEL,
                inputs: request.inputs.map((line) => ({ voice_id: line.voiceId, text: line.text })),
            });
            console.error(`[ElevenLabs] Dialogue saved to: ${saved.audioPath} (+ ${path.basename(saved.alignmentPath)})`);
            return {
                success: true,
                audioPath: saved.audioPath,
                alignmentPath: saved.alignmentPath,
                model: ELEVENLABS_DIALOGUE_MODEL,
                outputFormat: request.outputFormat,
                durationSeconds: wavDurationSeconds(saved.audio),
                speechEndSeconds: saved.speechEndSeconds,
                alignedCharacters: saved.alignedCharacters,
                voiceSegments: saved.voiceSegments,
                ...meta,
            };
        }
        const audio = Buffer.from(await response.arrayBuffer());
        const audioPath = saveAudioFile(outputDir, filename, audio);
        console.error(`[ElevenLabs] Dialogue saved to: ${audioPath}`);
        return {
            success: true,
            audioPath,
            model: ELEVENLABS_DIALOGUE_MODEL,
            outputFormat: request.outputFormat,
            durationSeconds: wavDurationSeconds(audio),
            ...meta,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ElevenLabs] Error: ${message.split('\n')[0]}`);
        return { success: false, error: message };
    }
}
/**
 * Voice listing — GET /v2/voices. The list is account-specific (premade + cloned +
 * library picks), so unlike the Gemini lane it can't be a server constant. The
 * subscription line is best-effort: it needs user_read, which restricted keys
 * usually lack, and a missing line is not an error.
 */
export async function listElevenLabsVoices(request) {
    try {
        const params = new URLSearchParams({ page_size: String(request.limit), include_total_count: 'true' });
        if (request.search)
            params.set('search', request.search);
        if (request.category)
            params.set('category', request.category);
        const response = await elevenFetch(`/v2/voices?${params.toString()}`, { method: 'GET' }, 30_000);
        const body = (await response.json());
        const voices = (body.voices ?? [])
            .filter((voice) => voice.voice_id && voice.name)
            .map((voice) => ({
            voiceId: voice.voice_id,
            name: voice.name,
            category: voice.category,
            labels: Object.fromEntries(Object.entries(voice.labels ?? {}).filter((entry) => typeof entry[1] === 'string' && entry[1] !== '')),
            description: voice.description ?? undefined,
            previewUrl: voice.preview_url ?? undefined,
            verifiedLanguages: Array.from(new Set((voice.verified_languages ?? []).map((entry) => entry.language).filter((lang) => !!lang))),
        }));
        let subscription;
        try {
            const sub = await elevenFetch('/v1/user/subscription', { method: 'GET' }, 15_000);
            const s = (await sub.json());
            subscription = {
                tier: s.tier,
                status: s.status,
                characterCount: s.character_count,
                characterLimit: s.character_limit,
                resetsAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : undefined,
            };
        }
        catch {
            subscription = undefined; // user_read missing on a restricted key — the listing itself is unaffected
        }
        return { success: true, voices, totalCount: body.total_count, hasMore: body.has_more, subscription };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ElevenLabs] Error: ${message.split('\n')[0]}`);
        return { success: false, error: message };
    }
}
