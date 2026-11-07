import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { actingReviewSchema, reviewActing } from '../dist/acting-review.js';
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
test('missing tracks and overlong media fail before spending', async t => {
  const f = setup(t);
  for (const patch of [{ audio: false }, { video: false }, { duration: 121 }, { duration: NaN }]) {
    f.deps.probe = async () => ({ ...media, ...patch });
    await assert.rejects(reviewActing(f.request, f.deps));
  }
  assert.equal(f.calls(), 0);
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
