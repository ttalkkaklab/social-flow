import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiveAnswers, spokenAddress } from '../dist/live-answers.js';
import { liveFaqCount } from '../dist/live-options.js';

test('the selected number of distinct FAQ bodies survives restart and buffered timing excludes cached answers', async (t) => {
  const project = mkdtempSync(join(tmpdir(), 'live-faq-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const scope = ['host', 'topic', 'source-hash'];
  const library = new LiveAnswers([], project, scope);
  const draft = async (n, prior) =>
    Array.from({ length: n }, (_, i) => ({
      questions: ['Question ' + (prior.length + i)],
      answer: 'Answer ' + (prior.length + i)
    }));
  for (const n of [10, 30, 50, 100]) {
    assert.equal(await liveFaqCount(String(n)), n);
    assert.equal((await library.plan(n, draft)).length, n);
  }
  await assert.rejects(liveFaqCount('20'));
  const resumed = new LiveAnswers([], project, scope);
  assert.equal((await resumed.plan(100, () => assert.fail('Redrafted existing FAQ'))).length, 100);
  resumed.recordDuration(10);
  const estimate = resumed.estimate(100, () => true, 1, 0);
  assert.equal(estimate.generationSeconds, 10);
  assert.equal(estimate.bufferSeconds, 120);
  assert.equal(Date.parse(estimate.expectedStartTime), 130000);
  const cold = new LiveAnswers([], project, ['other sources']);
  assert.equal(cold.exact('Question 1'), undefined);
  await assert.rejects(cold.plan(10, async () => []));
});

test('learned replies can be searched by synonyms supplied by the planner without using viewer names as cache keys', (t) => {
  const project = mkdtempSync(join(tmpdir(), 'live-match-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const lib = new LiveAnswers([], project, ['tea']);
  lib.remember('꽃생차 얼마예요?', '꽃생차 가격은 자료에 없어요.', join(project, 'tea.mp4'));
  const restarted = new LiveAnswers([], project, ['tea']);
  assert.equal(restarted.search(['판매가', '가격'])[0].answer, '꽃생차 가격은 자료에 없어요.');
  assert.equal(restarted.exact('꽃생차 얼마예요!').answer, '꽃생차 가격은 자료에 없어요.');
  assert.deepEqual(restarted.search(['airfare']), []);
  assert.equal(spokenAddress('민지', 'ko'), '민지 님');
  assert.equal(spokenAddress('민지 님', 'ko'), '민지 님');
  assert.equal(spokenAddress(undefined, 'ko'), undefined);
});

test('preflight requires every selected video to finish verification', async (t) => {
  const project = mkdtempSync(join(tmpdir(), 'preflight-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const rows = Array.from({ length: 10 }, (_, i) => ({ questions: ['Q' + i], answer: 'A' + i }));
  const library = new LiveAnswers(rows, project, []);
  const checked = [];
  const prepare = (fail) =>
    library.prepare(10, assert.fail, async (text) => {
      checked.push(text);
      if (fail && text === 'A8') throw Error('missing audio');
    });
  await assert.rejects(prepare(true), /missing audio/);
  assert.equal(checked.length, 9);
  checked.length = 0;
  assert.equal(await prepare(false), 10);
  assert.deepEqual(
    checked,
    rows.map((row) => row.answer)
  );
});

test('previously saved oversized drafts are excluded and can be replaced by a renderable answer', async t => {
  const { fitsLiveShot } = await import('../dist/live-native.js');
  const project = mkdtempSync(join(tmpdir(), 'faq-duration-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const old = new LiveAnswers([], project, ['tea']);
  const long = { questions: ['Describe tea.'], answer: 'tea '.repeat(66).trim() };
  await old.plan(1, async () => [long]);
  const library = new LiveAnswers([], project, ['tea'], text => fitsLiveShot(text, 'en'));
  assert.equal(library.expected(1).length, 0);
  await assert.rejects(library.plan(1, async () => [long]), /distinct/);
  assert.equal((await library.plan(1, async () => [{ ...long, answer: 'A warm drink.' }]))[0].answer, 'A warm drink.');
});

test('a smaller show after restart prefers already completed FAQ bodies for both ETA and preparation', async t => {
  const project = mkdtempSync(join(tmpdir(), 'faq-resume-cache-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const old = new LiveAnswers([], project, ['tea']);
  const rows = await old.plan(30, async (n, prior) => Array.from({ length:n }, (_, i) => ({
    questions:['Question ' + (prior.length+i)], answer:'Answer ' + (prior.length+i)
  })));
  const cached = new Set(rows.slice(0,10).map(r => r.answer));
  const ready = text => cached.has(text);
  const resumed = new LiveAnswers([], project, ['tea']);
  assert.equal(resumed.estimate(10, ready, 0).cached, 10);
  const selected = [];
  await resumed.prepare(10, assert.fail, async text => { selected.push(text); }, ready);
  assert.deepEqual(new Set(selected), cached);
});

test('an oversized configured body identifies the question to shorten before timing starts', () => {
  assert.throws(() => new LiveAnswers([{ questions:['Which tea?'], answer:'long' }], '/unused', [], () => false),
    /Which tea\?.*15-second/);
});
