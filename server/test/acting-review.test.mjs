import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { actingMediaPart, actingReviewTimeout, ACTING_RESPONSE_JSON_SCHEMA, actingObservationSchema, actingReviewSchema, actingReviewOutcome, probeActingMedia, reviewActing, cinematographyPrompt, CINEMATOGRAPHY_RESPONSE_JSON_SCHEMA } from '../dist/acting-review.js';
import { TOOLS } from '../dist/tools.js';

const media = { duration: 3, audio: true, video: true, mimeType: 'video/mp4' };
const coverage = () => ({ observed: true, complete: true, start: 0, end: 3, evidence: 'At 0–3 seconds restrained hesitation resolves to a questioning rise.' });
const good = () => ({ scores: { situation: 97, expression: 96, body: 97, vocalEmotion: 98, speechAccuracy: 99, lipSync: 95 }, confidence: 0.95, confidenceReason: 'The full utterance is clear and the visible mouth movement can be inspected throughout.', complete: true, audibleSpeech: true, visibleCaptions: false, audio: coverage(), video: coverage(), findings: [] });
const defect = axis => ({ start: 1, end: 2, axis, severity: 'major', observed: 'A bright cheerful reaction contradicts the intended doubt.', expected: 'Restrained puzzlement.', correction: 'Use a small uncertain reaction.' });
function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'acting-review-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'storyboard'));
  writeFileSync(path.join(dir, 'storyboard/scenes.js'), 'window.SCENES=[];');
  const file = path.join(dir, 'clip.mp4');
  writeFileSync(file, 'fixture media bytes');
  const request = actingReviewSchema.parse({ mediaPath: file, expectedText: 'What do you mean?', direction: 'A startled host quietly questions the unexpected hiring decision.', requestedBy: 'user', reason: 'User requested adversarial audiovisual evaluation.' });
  let calls = 0;
  const deps = { cacheDirectory: path.join(dir, '.acting-reviews'), probe: async () => media, evaluate: async () => { calls++; return { observation: good(), usage: { inputTokens: 100, outputTokens: 200, thoughtTokens: 30 } }; } };
  return { dir, file, request, deps, calls: () => calls };
}

test('explicit request is mandatory; unknown arguments cannot silently change review', () => {
  assert.equal(actingReviewSchema.safeParse({ mediaPath: 'x', direction: 'a'.repeat(20) }).success, false);
  assert.equal(actingReviewSchema.safeParse({ mediaPath: 'x', direction: 'a'.repeat(20), requestedBy: 'u', reason: 'reason reason', targetScore: 95 }).success, false);
});
test('acting_review MCP surface requires explicit request context and defaults to audiovisual', () => {
  const review = TOOLS.find(tool => tool.name === 'acting_review');
  assert.ok(review);
  assert.deepEqual(review.inputSchema.required, ['mediaPath', 'direction', 'requestedBy', 'reason']);
  assert.equal(review.inputSchema.additionalProperties, false);
  assert.equal(review.inputSchema.properties.mode.default, 'audiovisual');
});
test('provider JSON contract bounds confidence as fraction and all scores 0 to 100', () => {
  assert.equal(ACTING_RESPONSE_JSON_SCHEMA.properties.confidence.minimum, 0);
  assert.equal(ACTING_RESPONSE_JSON_SCHEMA.properties.confidence.maximum, 1);
  for (const axis of Object.values(ACTING_RESPONSE_JSON_SCHEMA.properties.scores.properties)) {
    assert.equal(axis.minimum, 0); assert.equal(axis.maximum, 100);
  }
  assert.ok(ACTING_RESPONSE_JSON_SCHEMA.required.includes('confidenceReason'));
  assert.equal(ACTING_RESPONSE_JSON_SCHEMA.properties.findings.items.properties.observed.minLength,10);
  assert.equal(ACTING_RESPONSE_JSON_SCHEMA.properties.findings.items.properties.expected.minLength,1);
  assert.equal(ACTING_RESPONSE_JSON_SCHEMA.properties.findings.items.properties.correction.minLength,1);
  assert.equal(actingObservationSchema.safeParse({ ...good(), confidenceReason: '' }).success, false);
  assert.equal(actingObservationSchema.safeParse({ ...good(), confidenceReason: undefined }).success, false);
});
test('percentage confidence is rejected without normalization and raw observation is retained', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; return { observation: { ...good(), confidence: 95 }, usage: { inputTokens: 4, outputTokens: 5, thoughtTokens: 0 } }; };
  const result = await reviewActing(f.request, f.deps);
  assert.equal(result.status, 'unverified'); assert.equal(result.review, null);
  assert.equal(JSON.parse(result.rejectedObservation.json).confidence, 95);
  assert.equal(result.rejectedObservation.truncated, false);
  assert.equal((await reviewActing(f.request, f.deps)).status, 'unverified'); assert.equal(calls, 1);
});
test('rejected raw observations are bounded and retained on invalid provider JSON', async t => {
  const f = setup(t);
  f.deps.evaluate = async () => { throw Object.assign(new Error('Invalid JSON'), { rejectedObservation: 'x'.repeat(200000), usage: { inputTokens: 4, outputTokens: 5, thoughtTokens: 0 } }); };
  const result = await reviewActing(f.request, f.deps);
  assert.equal(result.status, 'unverified'); assert.equal(result.rejectedObservation.truncated, true);
  assert.equal(result.rejectedObservation.json.length, 131072);
  assert.equal((await reviewActing(f.request, f.deps)).reused, true);
});
test('full review sends actual file bytes and preserves hash-bound usage receipt', async t => {
  const f = setup(t);
  const evaluate = f.deps.evaluate;
  f.deps.evaluate = async (bytes, probe, request) => {
    assert.equal(bytes.toString(), 'fixture media bytes'); assert.equal(probe.video, true); assert.equal(request.mode, 'audiovisual');
    return evaluate();
  };
  const result = await reviewActing(f.request, f.deps);
  assert.equal(result.status, 'pass'); assert.equal(result.score, 95); assert.equal(result.success, true);
  const receipt = JSON.parse(readFileSync(result.receiptPath, 'utf8'));
  assert.match(receipt.mediaSha256, /^[a-f0-9]{64}$/); assert.equal(receipt.costUsd, null); assert.equal(receipt.usage.thoughtTokens, 30);
  assert.equal((await reviewActing(f.request, f.deps)).reused, true); assert.equal(f.calls(), 1);
  const events = readFileSync(path.join(f.dir, '.work/events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 1); assert.equal(events[0].tool, 'acting_review');
});
test('failed input cannot reroll; changed direction and media are visibly distinct receipts', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; return { observation: { ...good(), scores: { ...good().scores, vocalEmotion: 70 }, findings: [defect('vocalEmotion')] }, usage: { inputTokens: 1, outputTokens: 2, thoughtTokens: 0 } }; };
  const first = await reviewActing(f.request, f.deps);
  assert.equal(first.status, 'fail'); assert.equal(first.score, 70);
  assert.equal((await reviewActing(f.request, f.deps)).reused, true); assert.equal(calls, 1);
  const second = await reviewActing({ ...f.request, direction: f.request.direction + ' Revised blocking.' }, f.deps);
  assert.notEqual(second.directionSha256, first.directionSha256); assert.equal(second.mediaSha256, first.mediaSha256);
  writeFileSync(f.file, 'new actual media');
  const third = await reviewActing(f.request, f.deps);
  assert.notEqual(third.mediaSha256, first.mediaSha256); assert.equal(calls, 3);
});
test('null axes, missing coverage and invalid timestamps remain unverified', t => {
  const f = setup(t);
  for (const patch of [
    { scores: { ...good().scores, lipSync: null } },
    { audio: { ...coverage(), observed: false } },
    { video: { ...coverage(), end: 1 } },
    { audio: { ...coverage(), start: 0.5 } },
    { confidence: 0.89 }, { complete: false },
    { findings: [{ start: 2, end: 1, axis: 'expression', severity: 'minor', observed: 'A smile contradicts the question', expected: 'Doubt', correction: 'Remove smile' }] },
  ]) assert.equal(actingReviewOutcome({ ...good(), ...patch }, media, f.request).status, 'unverified');
});
test('a minor real defect fails even when all scores exceed 95', t => {
  const f = setup(t);
  const review = { ...good(), findings: [{ start: 1, end: 2, axis: 'expression', severity: 'minor', observed: 'A brief smile contradicts the question', expected: 'Doubt', correction: 'Remove smile' }] };
  assert.equal(actingReviewOutcome(review, media, f.request).status, 'fail');
});
test('empty expectedText cannot hide audible speech, uncertain silence, or poor scored axes', t => {
  const f = setup(t);
  const request = { ...f.request, expectedText: '' };
  assert.equal(actingReviewOutcome(good(), media, request).status, 'unverified');
  assert.equal(actingReviewOutcome({ ...good(), audibleSpeech: null }, media, request).status, 'unverified');
  const silent = { ...good(), audibleSpeech: false, scores: { ...good().scores, vocalEmotion: null, speechAccuracy: null, lipSync: null } };
  assert.equal(actingReviewOutcome(silent, media, request).status, 'pass');
  const poor = { ...silent, scores: { ...silent.scores, vocalEmotion: 10 }, findings: [defect('vocalEmotion')] };
  assert.equal(actingReviewOutcome(poor, media, request).status, 'fail');
  assert.equal(actingReviewOutcome(poor, media, request).score, 10);
  assert.equal(actingReviewOutcome({ ...good(), audibleSpeech: false }, media, f.request).status, 'fail');
});
test('byte-identical copies in another source directory reuse the same failed receipt', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; return { observation: { ...good(), scores: { ...good().scores, vocalEmotion: 60 }, findings: [defect('vocalEmotion')] }, usage: { inputTokens: 1, outputTokens: 2, thoughtTokens: 0 } }; };
  const first = await reviewActing(f.request, f.deps);
  const other = path.join(f.dir, 'another-take'); mkdirSync(other);
  const copied = path.join(other, 'copy.mp4'); writeFileSync(copied, readFileSync(f.file));
  const second = await reviewActing({ ...f.request, mediaPath: copied }, f.deps);
  assert.equal(second.status, 'fail'); assert.equal(second.reused, true); assert.equal(second.receiptPath, first.receiptPath);
  assert.equal(second.currentMediaPath, realpathSync(copied)); assert.equal(calls, 1);
});
test('production cache override shares receipts without dependency cache injection', async t => {
  const f = setup(t), previous = process.env.SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR;
  const cache = path.join(f.dir, 'global-cache');
  process.env.SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR = cache;
  try {
    const { cacheDirectory, ...deps } = f.deps;
    const result = await reviewActing(f.request, deps);
    assert.equal(path.dirname(result.receiptPath), cache);
    assert.equal((await reviewActing(f.request, deps)).reused, true);
    assert.equal(f.calls(), 1);
  } finally {
    if (previous === undefined) delete process.env.SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR;
    else process.env.SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR = previous;
  }
});
test('audio-only review never claims visual axes and cannot substitute for audiovisual', async t => {
  const f = setup(t);
  const observation = { ...good(), scores: { ...good().scores, expression: null, body: null, lipSync: null }, video: { observed: false, complete: false, start: null, end: null, evidence: 'No visual track reviewed in audio-only mode.' } };
  assert.equal(actingReviewOutcome(observation, media, { ...f.request, mode: 'audio' }).status, 'pass');
  assert.equal(actingReviewOutcome(observation, media, f.request).status, 'unverified');
});
test('unobserved video may have empty evidence while observed coverage needs evidence', t => {
  const f = setup(t);
  const observation = { ...good(), scores: { ...good().scores, expression: null, body: null, lipSync: null }, video: { observed: false, complete: false, start: null, end: null, evidence: '' } };
  assert.equal(actingObservationSchema.safeParse(observation).success, true);
  assert.equal(actingReviewOutcome(observation, media, { ...f.request, mode: 'audio' }).status, 'pass');
  const unsupported = { ...observation, audio: { ...coverage(), evidence: '' } };
  assert.equal(actingReviewOutcome(unsupported, media, { ...f.request, mode: 'audio' }).status, 'unverified');
});
test('unsupported low scores remain unverified without rewriting scores or inventing findings', t => {
  const f = setup(t);
  const observation = { ...good(), scores: { ...good().scores, situation: 72, vocalEmotion: 71, speechAccuracy: 73 }, findings: [] };
  const before = JSON.stringify(observation);
  const outcome = actingReviewOutcome(observation, media, f.request);
  assert.equal(outcome.status, 'unverified'); assert.equal(outcome.score, null);
  assert.equal(outcome.failures.filter(failure => failure.includes('deduction lacks')).length, 3);
  assert.equal(JSON.stringify(observation), before);
});
test('distracting scores supported only by minor findings are unverified without recalibration', t => {
  const f = setup(t);
  const observation = { ...good(), scores: { ...good().scores, vocalEmotion: 72 }, findings: [{ ...defect('vocalEmotion'), severity: 'minor' }] };
  const before = JSON.stringify(observation);
  const outcome = actingReviewOutcome(observation, media, f.request);
  assert.equal(outcome.status, 'unverified'); assert.equal(outcome.score, null);
  assert.ok(outcome.failures.includes('vocalEmotion score below 80 conflicts with only minor findings'));
  assert.equal(JSON.stringify(observation), before);
  const supported = { ...observation, findings: [defect('vocalEmotion')] };
  assert.equal(actingReviewOutcome(supported, media, f.request).status, 'fail');
  assert.equal(actingReviewOutcome(supported, media, f.request).score, 72);
});
test('missing tracks and overlong media fail before spending', async t => {
  const f = setup(t);
  for (const patch of [{ audio: false }, { video: false }, { duration: 121 }, { duration: NaN }]) {
    f.deps.probe = async () => ({ ...media, ...patch });
    await assert.rejects(reviewActing(f.request, f.deps));
  }
  assert.equal(f.calls(), 0);
});
test('malformed provider response is unverified and retained instead of fabricated PASS', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; return { observation: { complete: true }, usage: { inputTokens: 50, outputTokens: 5, thoughtTokens: 0 } }; };
  const result = await reviewActing(f.request, f.deps);
  assert.equal(result.status, 'unverified'); assert.equal(result.review, null); assert.equal(result.usage.inputTokens, 50);
  assert.equal((await reviewActing(f.request, f.deps)).reused, true); assert.equal(calls, 1);
});
test('concurrent requests have one paid attempt', async t => {
  const f = setup(t); let release;
  const held = new Promise(resolve => { release = resolve; });
  f.deps.evaluate = async () => { await held; return { observation: good(), usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } }; };
  const first = reviewActing(f.request, f.deps);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(reviewActing(f.request, f.deps), /identical review/);
  release(); assert.equal((await first).status, 'pass');
});
test('source mutation during probe prevents billing', async t => {
  const f = setup(t);
  f.deps.probe = async () => { writeFileSync(f.file, 'changed while probing'); return media; };
  await assert.rejects(reviewActing(f.request, f.deps), /changed during probe/);
  assert.equal(f.calls(), 0);
});
test('source mutation during review preserves uploaded hash but cannot claim current source passed', async t => {
  const f = setup(t);
  const original = readFileSync(f.file);
  f.deps.evaluate = async () => {
    writeFileSync(f.file, 'changed while remote reviewer was working');
    return { observation: good(), usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } };
  };
  const result = await reviewActing(f.request, f.deps);
  assert.equal(result.status, 'unverified'); assert.equal(result.sourceChanged, true);
  assert.notEqual(result.mediaSha256, result.currentMediaSha256);
  assert.ok(result.review); // Preserve what the remote reviewer actually evaluated.
  writeFileSync(f.file, original);
  assert.equal((await reviewActing(f.request, f.deps)).status, 'unverified');
});
test('cached outcome is rederived and receipt identity tampering does not bill again', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; return { observation: { ...good(), scores: { ...good().scores, expression: 60 }, findings: [defect('expression')] }, usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } }; };
  const result = await reviewActing(f.request, f.deps);
  const saved = JSON.parse(readFileSync(result.receiptPath, 'utf8'));
  writeFileSync(result.receiptPath, JSON.stringify({ ...saved, success: true, status: 'pass', score: 100, failures: [] }));
  const cached = await reviewActing(f.request, f.deps);
  assert.equal(cached.success, false); assert.equal(cached.status, 'fail'); assert.equal(cached.score, 60);
  for (const patch of [{ mediaSha256: 'wrong' }, { directionSha256: 'wrong' }, { requestSha256: 'wrong' }, { policy: 'wrong' }, { model: 'wrong' }, { review: { complete: true } }, { request: { ...saved.request, direction: 'Altered direction with different meaning.' } }]) {
    writeFileSync(result.receiptPath, JSON.stringify({ ...saved, ...patch }));
    assert.equal((await reviewActing(f.request, f.deps)).status, 'unverified');
  }
  assert.equal(calls, 1);
});
test('receipt write failure keeps evaluated lock and prevents an automatic paid retry', async t => {
  const f = setup(t); let receiptDirectory;
  f.deps.evaluate = async () => {
    // Replace the eventual receipt path with a directory to make rename fail.
    const { readdirSync } = await import('node:fs');
    const directory = path.join(f.dir, '.acting-reviews');
    const lock = readdirSync(directory).find(name => name.endsWith('.lock'));
    receiptDirectory = path.join(directory, lock.slice(0, -5));
    mkdirSync(receiptDirectory);
    return { observation: good(), usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } };
  };
  await assert.rejects(reviewActing(f.request, f.deps), /Could not persist paid acting review/);
  const pending = JSON.parse(readFileSync(receiptDirectory + '.lock', 'utf8'));
  assert.equal(pending.phase, 'evaluated'); assert.equal(pending.receipt.review.complete, true);
  rmSync(receiptDirectory, { recursive: true });
  await assert.rejects(reviewActing(f.request, f.deps), /identical review/);
});
test('ffprobe inspects actual MP4 audio/video streams without network', async t => {
  const f = setup(t);
  const made = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-y', f.file]);
  assert.equal(made.status, 0, made.stderr?.toString());
  const probe = await probeActingMedia(f.file);
  assert.equal(probe.video, true); assert.equal(probe.audio, true); assert.equal(probe.mimeType, 'video/mp4'); assert.ok(Math.abs(probe.duration - 1) < 0.1);
});

// User-directed clean video output: a strong acting score cannot hide captions.
test('rendered captions fail and unknown caption coverage remains unverified', t => {
  const f = setup(t);
  assert.ok(ACTING_RESPONSE_JSON_SCHEMA.required.includes('visibleCaptions'));
  assert.equal(actingReviewOutcome({ ...good(), visibleCaptions: true }, media, f.request).status, 'fail');
  assert.equal(actingReviewOutcome({ ...good(), visibleCaptions: null }, media, f.request).status, 'unverified');
  assert.equal(actingObservationSchema.safeParse({ ...good(), visibleCaptions: undefined }).success, false);
  assert.equal(actingReviewOutcome(good(), media, f.request).status, 'pass');
});


test('visual reviews request temporal samples; audio-only reviews retain their modality', () => {
  const bytes = Buffer.from('media');
  for (const mode of ['video', 'audiovisual']) {
    const part = actingMediaPart(bytes, media, mode);
    assert.equal(part.videoMetadata.fps, 8);
    assert.equal(part.inlineData.data, bytes.toString('base64'));
    assert.equal(part.inlineData.mimeType, 'video/mp4');
  }
  assert.equal(actingMediaPart(bytes, media, 'audio').videoMetadata, undefined);
  assert.equal(actingMediaPart(bytes, {...media, video:false, mimeType:'audio/wav'}, 'audio').videoMetadata, undefined);
});


test('unchanged audio policy keeps v6 paid receipts reusable', async t => {
  const f = setup(t);
  const audio = {...f.request, mode:'audio'};
  const first = await reviewActing(audio, f.deps);
  assert.equal(first.policy, 'acting-review-v8');
  const repeated = await reviewActing(audio, f.deps);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.receiptPath, first.receiptPath);
  assert.equal(f.calls(), 1);
  const visual = await reviewActing({...f.request, mode:'video'}, f.deps);
  assert.equal(visual.policy, 'acting-review-v9');
  assert.notEqual(visual.receiptPath, first.receiptPath);
  assert.equal(f.calls(), 2);
});

// Model rejection must not become a casting decision, including on cache reuse.
test('unfavorable voice reviews remain advisory on fresh and cached responses', async t => {
  const f = setup(t);
  f.deps.evaluate = async () => {
    const observation = good(); observation.scores.vocalEmotion = 70;
    observation.findings.push(defect('vocalEmotion'));
    return { observation, usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } };
  };
  for (const result of [await reviewActing(f.request, f.deps), await reviewActing(f.request, f.deps)]) {
    assert.equal(result.status, 'fail');
    assert.equal(result.advisoryOnly, true);
    assert.equal(result.selectionAuthority, 'user');
    assert.match(result.interpretation, /do not reject, replace or regenerate/);
  }
});

test('review transport timeout defaults preserve performance and allow validated cinema overrides', () => {
  assert.equal(actingReviewTimeout('performance', ''), 180000);
  assert.equal(actingReviewTimeout('cinematography', ''), 600000);
  assert.equal(actingReviewTimeout('cinematography', '30000'), 30000);
  assert.equal(actingReviewTimeout('performance', '900000'), 900000);
  for (const value of ['29999', '900001', 'NaN', '40000.5']) assert.throws(() => actingReviewTimeout('cinematography', value));
});

test('authorized transport retry has one immutable child and preserves the failed original byte-for-byte', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; if (calls === 1) throw new Error('This operation was aborted');
    return { observation: good(), usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } }; };
  const original = await reviewActing(f.request, f.deps), bytes = readFileSync(original.receiptPath, 'utf8');
  assert.equal(original.review, null); assert.equal(original.rejectedObservation, null);
  const retry = await reviewActing({ ...f.request, retryTransportFailure: true }, f.deps);
  assert.equal(retry.status, 'pass'); assert.equal(retry.retryOf, original.requestSha256);
  assert.notEqual(retry.receiptPath, original.receiptPath);
  assert.equal(readFileSync(original.receiptPath, 'utf8'), bytes);
  assert.equal((await reviewActing({ ...f.request, retryTransportFailure: true }, f.deps)).reused, true);
  assert.equal((await reviewActing(f.request, f.deps)).status, 'unverified'); assert.equal(calls, 2);
});

test('even a second transport failure cannot authorize a third attempt', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; throw new Error('Request timed out'); };
  const original = await reviewActing(f.request, f.deps);
  const retry = await reviewActing({ ...f.request, retryTransportFailure: true }, f.deps);
  assert.equal(retry.status, 'unverified'); assert.equal(retry.retryOf, original.requestSha256);
  assert.equal((await reviewActing({ ...f.request, retryTransportFailure: true }, f.deps)).receiptPath, retry.receiptPath);
  assert.equal(calls, 2);
});

test('pass, fail, low-confidence and rejected observations cannot use transport retry', async t => {
  const f = setup(t); let calls = 0;
  const observations = [good(), { ...good(), confidence: .5 },
    { ...good(), scores: { ...good().scores, body: 70 }, findings: [defect('body')] },
    { complete: true }];
  for (let i = 0; i < observations.length; i++) {
    const input = { ...f.request, direction: f.request.direction + ' Case ' + i };
    f.deps.evaluate = async () => { calls++; return { observation: observations[i], usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } }; };
    await reviewActing(input, f.deps);
    await assert.rejects(reviewActing({ ...input, retryTransportFailure: true }, f.deps), /cannot be rerolled/);
  }
  assert.equal(calls, observations.length);
});

test('retry cannot use missing, changed-media, changed-direction or tampered parent identity', async t => {
  const f = setup(t); let calls = 0;
  f.deps.evaluate = async () => { calls++; throw new Error('This operation was aborted'); };
  await assert.rejects(reviewActing({ ...f.request, retryTransportFailure: true }, f.deps), /existing matching original/);
  const original = await reviewActing(f.request, f.deps), saved = readFileSync(original.receiptPath, 'utf8');
  await assert.rejects(reviewActing({ ...f.request, direction: f.request.direction + ' Changed.', retryTransportFailure: true }, f.deps), /existing matching original/);
  writeFileSync(f.file, 'different media');
  await assert.rejects(reviewActing({ ...f.request, retryTransportFailure: true }, f.deps), /existing matching original/);
  writeFileSync(f.file, 'fixture media bytes');
  for (const patch of [{ model: 'another-model' }, { policy: 'another-policy' }, { mediaSha256: 'wrong' },
    { requestSha256: 'wrong' }, { currentMediaSha256: 'wrong' }, { sourceChanged: true },
    { rejectedObservation: { json: 'partial model response', truncated: false } }, { failures: ['Invalid JSON'] }]) {
    writeFileSync(original.receiptPath, JSON.stringify({ ...JSON.parse(saved), ...patch }));
    await assert.rejects(reviewActing({ ...f.request, retryTransportFailure: true }, f.deps));
  }
  assert.equal(calls, 1);
});

// focus:'cinematography' — a separate rubric and receipt policy in the same module.
describe('cinematography focus', () => {
  const media = { duration: 4, audio: true, video: true, mimeType: 'video/mp4' };
  const axes = ['camera', 'direction', 'continuity', 'physicalNaturalness', 'facialNaturalness'];
  const unseen = () => ({ observed: false, complete: false, start: null, end: null, evidence: '' });
  const coverage = () => ({ observed: true, complete: true, start: 0, end: 4, evidence: '0–4s: the door jamb stays fixed; the woman travels left and lowers a rigid tray onto the desk.' });
  const good = () => ({ scores: { situation: null, expression: null, body: null, vocalEmotion: null, speechAccuracy: null, lipSync: null },
    confidence: .95, confidenceReason: 'The complete shot shows identifiable rigid edges and clear hand/desk contact.', complete: true,
    audibleSpeech: null, visibleCaptions: false, audio: unseen(), video: coverage(), findings: [],
    cinematography: { scores: Object.fromEntries(axes.map(axis => [axis, 96])), evidence: Object.fromEntries(axes.map(axis => [axis, coverage()])),
      limitation: '', facialApplicability: 'applicable', facialApplicabilityReason: 'The woman has a visible relevant face throughout the shot.' } });
  const request = () => actingReviewSchema.parse({ mediaPath: '/tmp/source.mp4', mode: 'video', focus: 'cinematography',
    direction: 'A fixed wide shot shows a woman carrying a tray leftward to the desk.', requestedBy: 'user', reason: 'User requested camera and physical naturalness review.' });
  const defect = () => ({ start: 1, end: 2, axis: 'physicalNaturalness', severity: 'major',
    observed: 'The left foot slides along two floorboards while planted.', expected: 'A stationary foot during the weight-bearing step.', correction: 'Regenerate grounded walking with stable planted contact.' });

  test('cinematography is explicit video-only and discoverable; default performance remains unchanged', () => {
    const input = request();
    assert.equal(actingReviewSchema.parse({ ...input, focus: undefined }).focus, 'performance');
    for (const mode of ['audio', 'audiovisual']) assert.equal(actingReviewSchema.safeParse({ ...input, mode }).success, false);
    const surface = TOOLS.find(tool => tool.name === 'acting_review').inputSchema;
    assert.equal(surface.properties.focus.default, 'performance');
    assert.deepEqual(surface.properties.focus.enum, ['performance', 'cinematography']);
    assert.equal(actingMediaPart(Buffer.from('x'), media, 'video', 'cinematography').videoMetadata.fps, 24);
  });

  test('separate fixed rubric distinguishes camera, subject travel and neutral facial geometry', () => {
    const text = cinematographyPrompt(media, request());
    assert.match(text, /frame-right.*frame-left.*not a direction reversal/);
    assert.match(text, /not expressive intensity/);
    assert.match(text, /24fps, not guaranteed/);
    assert.match(text, /95 is professionally usable/);
    assert.deepEqual(CINEMATOGRAPHY_RESPONSE_JSON_SCHEMA.properties.cinematography.properties.scores.required, axes);
    const result = actingReviewOutcome(good(), media, request());
    assert.equal(result.status, 'pass'); assert.equal(result.score, 96); assert.deepEqual(result.evaluatedAxes, axes);
  });

  test('a real physical defect fails without score rewriting; unsupported deductions remain unverified', () => {
    const review = good(); review.cinematography.scores.physicalNaturalness = 68;
    assert.equal(actingReviewOutcome(review, media, request()).status, 'unverified');
    review.findings = [defect()];
    assert.equal(actingReviewOutcome(review, media, request()).status, 'fail');
    assert.equal(actingReviewOutcome(review, media, request()).score, 68);
    review.findings[0].severity = 'minor';
    assert.equal(actingReviewOutcome(review, media, request()).status, 'unverified');
    review.cinematography.scores.physicalNaturalness = 98;
    assert.equal(actingReviewOutcome(review, media, request()).status, 'fail');
  });

  test('unknown face and incomplete axis evidence cannot pass; intentional prop insert does not demand emotional acting', () => {
    const review = good(); review.cinematography.scores.facialNaturalness = null; review.cinematography.evidence.facialNaturalness = unseen();
    assert.equal(actingReviewOutcome(review, media, request()).status, 'unverified');
    review.cinematography.facialApplicability = 'not_applicable';
    review.cinematography.facialApplicabilityReason = 'An intentional hands-and-tray insert contains no faces.';
    const insert = actingReviewOutcome(review, media, request());
    assert.equal(insert.status, 'pass'); assert.equal(insert.evaluatedAxes.includes('facialNaturalness'), false);
    review.cinematography.scores.facialNaturalness = 99;
    assert.equal(actingReviewOutcome(review, media, request()).status, 'unverified');
    review.cinematography.scores.facialNaturalness = null;
    review.cinematography.evidence.camera.end = 2;
    assert.equal(actingReviewOutcome(review, media, request()).status, 'unverified');
  });

  test('low confidence, unsupported captions, invalid times and audio claims cannot certify cinematography', () => {
    for (const mutate of [
      r => { r.confidence = .75; }, r => { r.visibleCaptions = true; }, r => { r.visibleCaptions = null; },
      r => { r.audio = coverage(); }, r => { r.scores.expression = 98; },
      r => { r.findings = [{ ...defect(), end: 6 }]; }, r => { r.cinematography.evidence.continuity.evidence = ''; },
    ]) { const review = good(); mutate(review); assert.equal(actingReviewOutcome(review, media, request()).status, 'unverified'); }
    const review = good(); review.visibleCaptions = true; review.findings = [{ ...defect(), axis: 'direction' }];
    assert.equal(actingReviewOutcome(review, media, request()).status, 'fail');
  });

  test('short clips cannot pass inverted or negative axis coverage within duration tolerance', () => {
    const brief = { ...media, duration: .05 };
    for (const span of [{ start: .09, end: .01 }, { start: -.01, end: .05 }]) {
      const review = good();
      review.video = { ...coverage(), end: .05 };
      for (const axis of axes) review.cinematography.evidence[axis] = { ...coverage(), end: .05 };
      review.cinematography.evidence.camera = { ...coverage(), ...span };
      assert.equal(actingReviewOutcome(review, brief, request()).status, 'unverified');
    }
  });

  test('new focus has immutable separate receipts and default old performance receipts still reuse', async t => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cinema-review-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'clip.mp4'); writeFileSync(file, 'source video bytes'); let calls = 0;
    const deps = { cacheDirectory: path.join(dir, 'cache'), probe: async () => media,
      evaluate: async () => { calls++; return { observation: good(), usage: { inputTokens: 1, outputTokens: 1, thoughtTokens: 0 } }; } };
    const input = { ...request(), mediaPath: file };
    const cinema = await reviewActing(input, deps);
    assert.equal(cinema.policy, 'cinematography-review-v1'); assert.equal(cinema.status, 'pass');
    assert.equal((await reviewActing(input, deps)).reused, true); assert.equal(calls, 1);
    const performance = await reviewActing({ ...input, focus: 'performance' }, deps);
    assert.equal(performance.policy, 'acting-review-v9'); assert.notEqual(performance.receiptPath, cinema.receiptPath);
    assert.equal(performance.status, 'unverified'); // A cinema response cannot certify performance.
    const old = JSON.parse(readFileSync(performance.receiptPath, 'utf8')); delete old.request.focus;
    writeFileSync(performance.receiptPath, JSON.stringify(old));
    assert.equal((await reviewActing({ ...input, focus: undefined }, deps)).reused, true); assert.equal(calls, 2);
    const tampered = JSON.parse(readFileSync(cinema.receiptPath, 'utf8')); tampered.request.focus = 'performance';
    writeFileSync(cinema.receiptPath, JSON.stringify(tampered));
    assert.equal((await reviewActing(input, deps)).status, 'unverified'); assert.equal(calls, 2);
  });
});
