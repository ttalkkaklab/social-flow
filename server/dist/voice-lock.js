/** Generated dialogue → pinned voice → blind ASR; originals are never overwritten. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { elevenLabsBaseUrl, requireElevenLabsKey } from './config.js';
import { describeElevenLabsError } from './elevenlabs-client.js';
import { pcmToWav, validateFilePath } from './media-utils.js';
import { characterErrorRate, measureSignal, sha256, signalFailures } from './tts-quality.js';
import { transcribeLocal, qwen3AsrTranscribeSchema } from './qwen3-asr-client.js';
import { ttsSchema } from './portal-characters.js';
import { VOICE_LOCK_MODEL, VOICE_LOCK_PROPERTY, voiceLockConfigSchema } from './voice-lock-config.js';
const exec = promisify(execFile);
export const voiceLockApplySchema = z.object({
    sourcePath: z.string().min(1), outputPath: z.string().min(1),
    shotId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), characterId: z.string().min(1).max(128),
    tts: ttsSchema, expectedText: z.string().trim().min(1).max(4000),
    inputKind: z.enum(['single_speaker', 'dialogue_stem']),
}).strict();
/** No automatic paid retry after an ambiguous network failure. */
export async function convertVoice(audio, voiceId, removeBackgroundNoise) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(voiceId))
        throw new Error('Invalid ElevenLabs voiceId');
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'dialogue.wav');
    form.append('model_id', VOICE_LOCK_MODEL);
    form.append('remove_background_noise', String(removeBackgroundNoise));
    const response = await fetch(`${elevenLabsBaseUrl()}/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`, {
        method: 'POST', headers: { 'xi-api-key': requireElevenLabsKey() }, body: form, signal: AbortSignal.timeout(180000),
    });
    if (!response.ok)
        throw new Error(describeElevenLabsError(response.status, await response.text()));
    const pcm = Buffer.from(await response.arrayBuffer());
    if (!pcm.length || pcm.length % 2 || pcm.length > 120 * 24000 * 2)
        throw new Error('Invalid or overlong STS audio');
    return { audio: pcmToWav(pcm, 24000, 1), requestId: response.headers.get('request-id') ?? undefined };
}
const defaults = {
    convert: convertVoice,
    transcribe: async (audioPath, language, outputPath, filename) => {
        const result = await transcribeLocal(qwen3AsrTranscribeSchema.parse({ audioPath, language, outputPath, filename, timestamps: false }));
        if (!result.success || !result.text?.trim())
            throw new Error(result.error || 'Blind transcription returned no speech');
        return result.text;
    },
};
export async function applyVoiceLock(input, dependencies = defaults) {
    const request = voiceLockApplySchema.parse(input);
    validateFilePath(request.sourcePath, { allowedExtensions: ['.mp4', '.mov', '.wav', '.mp3', '.m4a', '.flac', '.ogg'] });
    validateFilePath(request.outputPath);
    const root = path.resolve(request.outputPath);
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(path.join(root, `${request.shotId}-`));
    const lock = voiceLockConfigSchema.parse(request.tts.voiceLock ?? {});
    const result = {
        status: 'failed', characterId: request.characterId, shotId: request.shotId, voiceId: request.tts.voiceId,
        model: lock.model, expectedText: request.expectedText, sourcePath: path.resolve(request.sourcePath), reportPath: path.join(dir, 'voice-lock.json'),
    };
    try {
        const stat = statSync(result.sourcePath);
        if (!stat.isFile() || stat.size > 512 * 1024 * 1024)
            throw new Error('Source must be a file <= 512 MiB');
        result.sourceSha256 = sha256(readFileSync(result.sourcePath));
        if (!lock.enabled) {
            result.status = 'skipped';
            result.error = 'Character voiceLock.enabled is false; no conversion or verification performed';
        }
        else {
            if (request.tts.engine !== 'elevenlabs')
                throw new Error('Voice lock requires character tts.engine=elevenlabs and its pinned voiceId');
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(request.tts.voiceId))
                throw new Error('Invalid ElevenLabs voiceId');
            const language = qwen3AsrTranscribeSchema.parse({ audioPath: 'source.wav', language: request.tts.language ?? 'ko' }).language;
            const sourceCopy = path.join(dir, `source${path.extname(result.sourcePath).toLowerCase()}`);
            copyFileSync(result.sourcePath, sourceCopy);
            const sourceAudio = path.join(dir, 'dialogue.wav');
            await exec('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', sourceCopy, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', sourceAudio], { timeout: 60000 });
            const before = await measureSignal(sourceAudio);
            result.sourceDurationSeconds = before.duration;
            const sourceFailures = signalFailures(before, request.expectedText);
            if (sourceFailures.length)
                throw new Error(`Source: ${sourceFailures.join('; ')}`);
            result.sourceTranscript = await dependencies.transcribe(sourceAudio, language, dir, 'source-transcript.json');
            result.sourceCer = characterErrorRate(request.expectedText, result.sourceTranscript);
            if (result.sourceCer > 0.02)
                result.warnings = ['Source transcript differs from approved dialogue (CER > 2%); compare the source and converted take by ear'];
            const converted = await dependencies.convert(readFileSync(sourceAudio), request.tts.voiceId, lock.removeBackgroundNoise);
            result.requestId = converted.requestId;
            result.audioPath = path.join(dir, 'converted.wav');
            writeFileSync(result.audioPath, converted.audio, { flag: 'wx' });
            const after = await measureSignal(result.audioPath);
            result.outputDurationSeconds = after.duration;
            result.outputSha256 = sha256(converted.audio);
            result.transcript = await dependencies.transcribe(result.audioPath, language, dir, 'converted-transcript.json');
            result.outputCer = characterErrorRate(request.expectedText, result.transcript);
            const failures = signalFailures(after, request.expectedText);
            if (result.outputCer > 0.02)
                failures.push('Converted transcript differs from approved dialogue (CER > 2%)');
            if (Math.abs(after.duration - before.duration) > 0.12)
                failures.push('Duration drift exceeds 120 ms; inspect lip sync');
            if (failures.length)
                throw new Error(failures.join('; '));
            if (['.mp4', '.mov'].includes(path.extname(sourceCopy))) {
                const videoPath = path.join(dir, 'converted.mp4');
                await exec('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', sourceCopy, '-i', result.audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-map_metadata', '-1', '-movflags', '+faststart', videoPath], { timeout: 60000 });
                result.videoPath = videoPath;
            }
            result.status = 'passed';
        }
    }
    catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
    }
    writeFileSync(result.reportPath, JSON.stringify({ ...result, policy: 'voice-lock-v1', inputKind: request.inputKind, voiceLock: lock, generatedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
    return result;
}
export const VOICE_LOCK_TOOLS = [{
        name: 'voice_lock_apply', title: 'Lock generated dialogue to a character voice',
        description: 'Convert single-speaker model-generated audio/video with ElevenLabs STS. Records source blind ASR and checks converted ASR against approved dialogue (CER <= 2%) and duration drift <= 120 ms. Writes new WAV, optional MP4 and report without overwriting source. Paid conversion runs once after source validation. Separate mixed audio into dialogue stems first. Does not clone voices. passed verifies text and signal, not perceptual identity or lip sync: listen before assembly. Failed findings follow produce speech HITL.',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        inputSchema: { type: 'object', required: ['sourcePath', 'outputPath', 'shotId', 'characterId', 'tts', 'expectedText', 'inputKind'], properties: {
                sourcePath: { type: 'string', description: 'Local single-speaker audio/video file' },
                outputPath: { type: 'string', description: 'Episode output/voice-lock directory; each attempt gets a new folder' },
                shotId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,80}$', description: 'Shot key for the report and folder' },
                characterId: { type: 'string', description: 'Speaking character id from the board/portal' },
                expectedText: { type: 'string', minLength: 1, maxLength: 4000, description: 'Approved dialogue for comparison; never supplied to blind ASR' },
                inputKind: { type: 'string', enum: ['single_speaker', 'dialogue_stem'], description: 'Confirm one speaker without background music/effects to preserve; stems must be remixed externally' },
                tts: { type: 'object', required: ['engine', 'voiceId'], description: 'Pinned character voice block', properties: {
                        engine: { type: 'string', enum: ['gemini', 'supertonic', 'elevenlabs', 'mlx'], description: 'Must be elevenlabs when enabled' },
                        voiceId: { type: 'string', description: 'Pinned ElevenLabs voice_id' },
                        model: { type: 'string', description: 'Existing TTS model, not used for STS' },
                        speed: { type: 'number', minimum: 0.7, maximum: 1.2, description: 'Existing TTS speed, not applied to STS' },
                        language: { type: 'string', description: 'ASR language, default ko' },
                        stylePrompt: { type: 'string', description: 'Existing TTS style, not sent to STS' }, voiceLock: VOICE_LOCK_PROPERTY,
                    } },
            } },
        outputSchema: { type: 'object', required: ['status', 'reportPath'], properties: {
                status: { type: 'string', enum: ['passed', 'failed', 'skipped'], description: 'Measured validation outcome' },
                reportPath: { type: 'string', description: 'JSON report with hashes, durations, transcripts and failures' },
            }, additionalProperties: true },
    }];
