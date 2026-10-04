/** Reviews the assembled media, including transitions and the music mix. */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { checkedSpeechSchema, listen, measureSignal, normalizeSpeech, REVIEW_MODEL, reviewFailures, reviewSchema, sha256, signalFailures, transcriptCheckSchema } from './tts-quality.js';
const exec = promisify(execFile);
export const finalSpeechSchema = z.object({
    mediaPath: z.string().min(1), expectedText: z.string().trim().min(1).max(12000),
    language: z.string().trim().min(2).max(80), delivery: z.string().trim().min(1).max(2000),
    /** Present only on an explicit user request: also transcribe the episode blind and hold it to the 2% CER. */
    transcriptCheck: transcriptCheckSchema.optional(),
}).strict();
export async function reviewFinalSpeech(input) {
    const request = finalSpeechSchema.parse(input), media = path.resolve(request.mediaPath);
    // The handle stays out of the proof identity: putting it there would make every proof written
    // without it unreusable. Whether the check ran is recorded by the stored transcript.
    const { transcriptCheck, ...identity } = request;
    const proofPath = media + '.speech-quality.json', lockPath = proofPath + '.lock';
    let lock;
    try {
        lock = openSync(lockPath, 'wx');
    }
    catch {
        return { success: false, status: 'unverified', error: 'Final speech review is already locked' };
    }
    const temp = mkdtempSync(path.join(tmpdir(), 'speech-final-'));
    let base = { version: 1, policy: 'final-speech-v1', model: REVIEW_MODEL, ...identity, mediaPath: media };
    function save(status, extra) {
        const result = { ...base, status, checkedAt: new Date().toISOString(), ...extra };
        const staging = path.join(temp, 'proof.json');
        writeFileSync(staging, JSON.stringify(result, null, 2) + '\n');
        // The destination may be on another volume, so stage beside it before rename.
        writeFileSync(proofPath + '.tmp', readFileSync(staging));
        renameSync(proofPath + '.tmp', proofPath);
        return { success: status === 'pass', status, proofPath, ...extra };
    }
    try {
        base = { ...base, mediaSha256: sha256(readFileSync(media)), textSha256: sha256(normalizeSpeech(request.expectedText)) };
        const wav = path.join(temp, 'final.flac');
        await exec('ffmpeg', ['-y', '-v', 'error', '-i', media, '-map', '0:a:0', '-map_metadata', '-1', '-ac', '1', '-ar', '24000', '-c:a', 'flac', wav], { timeout: 60000 });
        base.audioSha256 = sha256(readFileSync(wav));
        if (sha256(readFileSync(media)) !== base.mediaSha256)
            throw new Error('Final media changed during decoding');
        if (existsSync(proofPath)) {
            const old = JSON.parse(readFileSync(proofPath, 'utf8'));
            const same = Object.entries(base).every(([k, v]) => ['mediaSha256', 'expectedText'].includes(k) || old[k] === v);
            if (old.audioSha256 === base.audioSha256 && old.textSha256 === base.textSha256 && old.status === 'fail')
                return save('fail', { reused: true, signal: old.signal, transcript: old.transcript, failures: old.failures, review: old.review, error: 'This exact final audio already failed; fix the audio before another listening review' });
            // A request that now asks for the dictation check cannot reuse a PASS that was never transcribed.
            if (same && old.status === 'pass' && (!transcriptCheck || typeof old.transcript === 'string')) {
                const review = reviewSchema.parse(old.review);
                if (!signalFailures(old.signal, request.expectedText, 1800).length && !reviewFailures(request.expectedText, typeof old.transcript === 'string' ? old.transcript : null, review, old.signal.duration).length &&
                    (review.continuity ?? 0) >= 95 && review.continuityEvidence)
                    return save('pass', { reused: true, signal: old.signal, transcript: old.transcript, review, failures: [] });
            }
        }
        save('unverified', {});
        const signal = await measureSignal(wav, 1800);
        const failures = signalFailures(signal, request.expectedText, 1800);
        if (failures.length)
            return save('fail', { signal, failures });
        const reviewRequest = { ...checkedSpeechSchema.parse({ generator: 'tts_local_generate', generation: {}, expectedText: request.expectedText.slice(0, 4000),
                language: request.language, delivery: request.delivery, outputPath: path.dirname(media), filename: 'final.wav' }),
            expectedText: request.expectedText, transcriptCheck };
        const result = await listen(wav, reviewRequest, true);
        failures.push(...reviewFailures(request.expectedText, result.transcript, result.review, signal.duration));
        if ((result.review.continuity ?? 0) < 95 || !result.review.continuityEvidence)
            failures.push('Episode continuity below 95 or missing listening evidence');
        if (sha256(readFileSync(media)) !== base.mediaSha256)
            throw new Error('Final media changed during listening');
        return save(failures.length ? 'fail' : 'pass', { signal, ...result, transcriptCheck: transcriptCheck ?? null, failures });
    }
    catch (error) {
        return save('unverified', { error: error instanceof Error ? error.message : String(error) });
    }
    finally {
        rmSync(temp, { recursive: true, force: true });
        closeSync(lock);
        rmSync(lockPath, { force: true });
    }
}
