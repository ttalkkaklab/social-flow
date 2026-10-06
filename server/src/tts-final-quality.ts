/** Reviews the assembled media, including transitions and the music mix. */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import * as chapters from '../../skills/produce/references/final-speech-chapters.js';
import { checkedSpeechSchema, listen, measureSignal, normalizeSpeech, REVIEW_MODEL, reviewFailures, reviewSchema, sha256, signalFailures, transcriptCheckSchema } from './tts-quality.js';
const exec = promisify(execFile);
export const finalSpeechSchema = z.object({
  mediaPath: z.string().min(1), expectedText: z.string().trim().min(1).max(12000),
  language: z.string().trim().min(2).max(80), delivery: z.string().trim().min(1).max(2000),
  /** Present only on an explicit user request: also transcribe the episode blind and hold it to the 2% CER. */
  transcriptCheck: transcriptCheckSchema.optional(),
  segments: z.array(z.object({ startSeconds: z.number().finite().nonnegative(), expectedText: z.string().trim().min(1).max(1000) }).strict()).min(1).max(1000).optional(),
}).strict();
export type FinalSpeechRequest = z.infer<typeof finalSpeechSchema>;
export async function reviewFinalSpeech(input: FinalSpeechRequest, deps = { listen }): Promise<Record<string, unknown>> {
  const request = finalSpeechSchema.parse(input), media = path.resolve(request.mediaPath);
  // The handle stays out of the proof identity: putting it there would make every proof written
  // without it unreusable. Whether the check ran is recorded by the stored transcript. It is still
  // carried into every saved proof, reused ones included — a transcribed take whose request record
  // was dropped cannot say who asked for it or why.
  const { transcriptCheck, segments, ...identity } = request;
  const proofPath = media + '.speech-quality.json', lockPath = proofPath + '.lock';
  let lock: number;
  try { lock = openSync(lockPath, 'wx'); } catch { return { success: false, status: 'unverified', error: 'Final speech review is already locked' }; }
  const temp = mkdtempSync(path.join(tmpdir(), 'speech-final-'));
  let base: Record<string, unknown> = { version: 1, policy: 'final-speech-v1', model: REVIEW_MODEL, ...identity, mediaPath: media };
  let singleReviewStarted = false;
  function save(status: string, extra: Record<string, unknown>) {
    const result = { ...base, status, checkedAt: new Date().toISOString(), ...extra };
    const staging = path.join(temp, 'proof.json');
    writeFileSync(staging, JSON.stringify(result, null, 2) + '\n');
    // The destination may be on another volume, so stage beside it before rename.
    writeFileSync(proofPath + '.tmp', readFileSync(staging)); renameSync(proofPath + '.tmp', proofPath);
    return { success: status === 'pass', status, proofPath, ...extra };
  }
  try {
    base = { ...base, mediaSha256: sha256(readFileSync(media)), textSha256: sha256(normalizeSpeech(request.expectedText)) };
    const wav = path.join(temp, 'final.flac');
    await exec('ffmpeg', ['-y','-v','error','-i',media,'-map','0:a:0','-map_metadata','-1','-ac','1','-ar','24000','-c:a','flac',wav], { timeout: 60000 });
    base.audioSha256 = sha256(readFileSync(wav));
    if (sha256(readFileSync(media)) !== base.mediaSha256) throw new Error('Final media changed during decoding');
    if (readFileSync(wav).length > chapters.LIMIT) {
      return await reviewChapters(request, media, wav, temp, base, proofPath, save, deps);
    }
    if (sha256(readFileSync(media)) !== base.mediaSha256) throw new Error('Final media changed during decoding');
    if (existsSync(proofPath)) {
      const old = JSON.parse(readFileSync(proofPath, 'utf8'));
      const same = Object.entries(base).every(([k,v]) => ['mediaSha256','expectedText'].includes(k) || old[k] === v);
      if (old.audioSha256 === base.audioSha256 && old.textSha256 === base.textSha256 && old.status === 'fail') return save('fail', { reused: true, signal: old.signal, transcript: old.transcript, transcriptCheck: transcriptCheck ?? old.transcriptCheck ?? null, failures: old.failures, review: old.review, error: 'This exact final audio already failed; fix the audio before another listening review' });
      // A request that now asks for the dictation check cannot reuse a PASS that was never transcribed.
      if (same && old.status === 'pass' && (!transcriptCheck || typeof old.transcript === 'string')) {
        const review = reviewSchema.parse(old.review);
        if (!signalFailures(old.signal, request.expectedText, 1800).length && !reviewFailures(request.expectedText, typeof old.transcript === 'string' ? old.transcript : null, review, old.signal.duration).length &&
          (review.continuity ?? 0) >= 95 && review.continuityEvidence) return save('pass', { reused: true, signal: old.signal, transcript: old.transcript, transcriptCheck: transcriptCheck ?? old.transcriptCheck ?? null, review, failures: [] });
      }
    }
    singleReviewStarted = true;
    save('unverified', {});
    const signal = await measureSignal(wav, 1800);
    const failures = signalFailures(signal, request.expectedText, 1800);
    if (failures.length) return save('fail', { signal, failures });
    const reviewRequest = { ...checkedSpeechSchema.parse({ generator: 'tts_local_generate', generation: {}, expectedText: request.expectedText.slice(0,4000),
      language: request.language, delivery: request.delivery, outputPath: path.dirname(media), filename: 'final.wav' }),
      expectedText: request.expectedText, transcriptCheck };
    const result = await deps.listen(wav, reviewRequest, true);
    failures.push(...reviewFailures(request.expectedText, result.transcript, result.review, signal.duration));
    if ((result.review.continuity ?? 0) < 95 || !result.review.continuityEvidence) failures.push('Episode continuity below 95 or missing listening evidence');
    if (sha256(readFileSync(media)) !== base.mediaSha256) throw new Error('Final media changed during listening');
    return save(failures.length ? 'fail' : 'pass', { signal, ...result, transcriptCheck: transcriptCheck ?? null, failures });
  } catch (error) {
    const failure = { error: error instanceof Error ? error.message : String(error) };
    // Decoding, request planning and proof validation do not own a new review.
    // Preserve completed verdicts and resumable chapter checkpoints on these errors.
    // Chapter listening saves its own checkpoint; only an active single review may
    // replace its proof here.
    return singleReviewStarted ? save('unverified', failure) : { success: false, status: 'unverified', proofPath, ...failure };
  } finally { rmSync(temp, { recursive: true, force: true }); closeSync(lock); rmSync(lockPath, { force: true }); }
}

/** Preserve every canonical sample, including silence and music outside the subtitle cues. */
async function reviewChapters(request: FinalSpeechRequest, media: string, wav: string, temp: string,
  base: Record<string, unknown>, proofPath: string, save: (status: string, extra: Record<string, unknown>) => Record<string, unknown>, deps: { listen: typeof listen }) {
  if (!request.segments) throw new Error('Final FLAC exceeds 14 MiB; provide final-timeline sentence segments for chapter listening');
  const pcm = chapters.decode(wav), totalSamples = pcm.length / chapters.BYTES;
  const planned = chapters.plan(request.segments, totalSamples, request.expectedText);
  const identity = { policy: chapters.POLICY, sampleRate: chapters.RATE, totalSamples, pcmSha256: chapters.hash(pcm), segments: request.segments, transcriptCheck: request.transcriptCheck ?? null };
  const old: any = existsSync(proofPath) ? JSON.parse(readFileSync(proofPath, 'utf8')) : null;
  const pieces: any[] = [];
  const commit = (status: string, extra: Record<string, unknown> = {}) => save(status, { ...identity, pieces, manifestSha256: chapters.manifest({ ...identity, pieces }), ...extra });
  // A completed failure cannot buy new scores through container, direction or boundary edits.
  if (old?.pcmSha256 === identity.pcmSha256 && old.textSha256 === base.textSha256 && old.status === 'fail') {
    chapters.validate(old, pcm, request.expectedText, false);
    return save('fail', { ...identity, model: old.model, language: old.language, delivery: old.delivery, transcriptCheck: old.transcriptCheck ?? null, segments: old.segments, pieces: old.pieces, manifestSha256: old.manifestSha256, failures: old.failures, reused: true });
  }
  if (old?.policy === chapters.POLICY && old.model === base.model && old.language === request.language && old.delivery === request.delivery &&
      old.pcmSha256 === identity.pcmSha256 && chapters.digest(old.segments) === chapters.digest(identity.segments) &&
      chapters.digest(old.transcriptCheck ?? null) === chapters.digest(identity.transcriptCheck) && old.status === 'pass') {
    chapters.validate(old, pcm, request.expectedText);
    return save('pass', { ...identity, pieces: old.pieces, manifestSha256: old.manifestSha256, failures: [], reused: true });
  }
  commit('unverified');
  try {
  for (const piece of planned) {
    const samples = pcm.subarray(piece.startSample * chapters.BYTES, piece.endSample * chapters.BYTES);
    const raw = path.join(temp, 'piece.pcm'), file = path.join(temp, 'piece.flac');
    writeFileSync(raw, samples);
    await exec('ffmpeg', ['-y','-v','error','-f','s32le','-ar',String(chapters.RATE),'-ac','1','-i',raw,'-map_metadata','-1','-c:a','flac',file], { timeout: 60000 });
    const payload = readFileSync(file);
    if (payload.length > chapters.LIMIT || !chapters.decode(file).equals(samples)) throw new Error('Chapter encoding exceeded the limit or changed PCM samples');
    const binding = { ...piece, pcmSha256: chapters.hash(samples), audioSha256: chapters.hash(payload), payloadBytes: payload.length, model: REVIEW_MODEL, transcriptCheck: request.transcriptCheck ?? null };
    const reusable = old?.pcmSha256 === identity.pcmSha256 && old.textSha256 === base.textSha256 && old.language === request.language && old.delivery === request.delivery && old.manifestSha256 === chapters.manifest(old);
    const cached = reusable && old?.pieces?.find((p: any) => Object.entries(binding).every(([k,v]) => chapters.digest(p[k]) === chapters.digest(v)));
    let evidence: any;
    if (cached && ['pass','fail'].includes(cached.status)) {
      const failures = chapters.listeningFailures(cached);
      if (chapters.digest(cached.failures) !== chapters.digest(failures) || cached.status !== (failures.length ? 'fail' : 'pass')) throw new Error('Invalid cached chapter verdict');
      evidence = cached;
    } else {
      const signal = await measureSignal(file, 120);
      const reviewRequest = { ...checkedSpeechSchema.parse({ generator: 'tts_local_generate', generation: {}, expectedText: piece.expectedText,
        language: request.language, delivery: request.delivery, outputPath: path.dirname(media), filename: 'final.wav' }), transcriptCheck: request.transcriptCheck };
      const result = await deps.listen(file, reviewRequest, true);
      reviewSchema.parse(result.review);
      evidence = { ...binding, signal, ...result, status: 'pass' };
      const failures = chapters.listeningFailures(evidence);
      evidence = { ...evidence, status: failures.length ? 'fail' : 'pass', failures };
    }
    pieces.push(evidence);
    if (sha256(readFileSync(media)) !== base.mediaSha256) throw new Error('Final media changed during chapter listening');
    commit('unverified');
  }
  const failures = pieces.flatMap(p => p.failures.map((f: string) => `${p.kind} ${p.index}: ${f}`));
  return commit(failures.length ? 'fail' : 'pass', { failures });
  } catch (error) {
    return commit('unverified', { error: error instanceof Error ? error.message : String(error) });
  }
}
