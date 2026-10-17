import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { actingMediaPart, actingReviewSchema, actingReviewOutcome, reviewActing, cinematographyPrompt, CINEMATOGRAPHY_RESPONSE_JSON_SCHEMA } from '../dist/acting-review.js';
import { TOOLS } from '../dist/tools.js';

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
  assert.equal(actingMediaPart(Buffer.from('x'), media, 'video').videoMetadata.fps, 8);
  assert.equal(actingMediaPart(Buffer.from('x'), media, 'audio').videoMetadata, undefined);
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
