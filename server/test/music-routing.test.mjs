import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planMusic, executeMusic, musicStatus, resumeMusic, routeLegacyMusic } from '../dist/music-routing.js';
import { musicTransaction } from '../dist/music-state.js';
import { config } from '../dist/config.js';
// Suno polls every 15 s; run that clock forward instead of waiting (astra-video-client.test.mjs).
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms < 1_000 ? ms : 0, ...args);
function fixture(t, auth = { reference: 'test allocation', maxUsd: 1, maxConcurrent: 1, maxAttempts: 3 }, music = { engine: 'elevenlabs', model: 'music_v2_5' }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'music-route-')));
  fs.mkdirSync(path.join(dir, 'storyboard'));
  const board = { modelSettings: { models: { music } }, musicAuthorization: auth };
  const write = () => fs.writeFileSync(path.join(dir, 'storyboard/scenes.js'), 'window.PRODUCTION=' + JSON.stringify(board)); write();
  const old = config.elevenLabsApiKey, oldSuno = config.sunoApiKey; config.elevenLabsApiKey = 'test-only'; config.sunoApiKey = 'test-only';
  t.after(() => { config.elevenLabsApiKey = old; config.sunoApiKey = oldSuno; fs.rmSync(dir, { recursive: true, force: true }); });
  const plan = (requestId = 'base-1', args = {}, extra = {}) => planMusic({ directory: dir, assetId: 'base', requestId, reserveUsd: 0.4, args: { prompt: 'soft piano', forceInstrumental: true, ...args }, ...extra });
  return { dir, board, write, plan, run: (p, dispatch) => executeMusic({ directory: dir, planId: p.id }, dispatch) };
}
function wav() {
  const data = Buffer.alloc(44 + 1600); data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(1600, 40);
  return data;
}
function output(args) {
  // A tiny valid PCM file; deliberately use the provider's source.mp3 filename.
  const data = wav();
  fs.mkdirSync(args.outputPath, { recursive: true }); const file = path.join(args.outputPath, args.filename); fs.writeFileSync(file, data);
  return { content: [{ type: 'text', text: 'mock provider' }], musicReceipt: { requestId: 'provider-id', audioPath: file } };
}
test('managed output is decoded to stereo WAV and reused without a second dispatch', async t => {
  const f = fixture(t), p = f.plan(); let calls = 0;
  const dispatch = async (_tool, args) => { calls++; assert.equal(args.modelId, 'music_v2_5'); return output(args); };
  const result = await f.run(p, dispatch);
  assert.equal(result.musicReceipt.output.sampleRate, 48000); assert.equal(result.musicReceipt.output.channels, 2);
  assert.equal(result.musicReceipt.review, 'not_reviewed'); assert.ok(result.musicReceipt.output.durationSeconds > 0);
  assert.deepEqual(await f.run(p, dispatch), result); assert.equal(calls, 1);
  assert.equal(musicStatus({ directory: f.dir, requestId: p.requestId }).providerId, 'provider-id');
  fs.appendFileSync(p.outputFile, 'changed'); await assert.rejects(f.run(p, dispatch), /cached_output_changed/);
});
test('plan binds model, native fields, output location and current selection', async t => {
  const f = fixture(t);
  assert.throws(() => f.plan('bad', { modelId: 'music_v2' }), /selection_mismatch/);
  assert.throws(() => f.plan('bad', { bpm: 80 }), /argument_unsupported/);
  assert.throws(() => f.plan('bad', { outputPath: '../outside' }), /output_outside/);
  assert.throws(() => f.plan('bad', { filename: 'bed.mp3' }), /requires_wav/);
  assert.throws(() => f.plan('bad', {}, { reserveUsd: 0 }), /quote_required/);
  fs.symlinkSync(os.tmpdir(), path.join(f.dir, 'escape'));
  assert.throws(() => f.plan('bad', { outputPath: 'escape' }), /output_outside/);
  const p = f.plan(); f.board.modelSettings.models.music.model = 'music_v2'; f.write();
  await assert.rejects(f.run(p, async () => assert.fail()), /plan_stale/);
  await assert.rejects(routeLegacyMusic('music_elevenlabs_generate', { prompt: 'p', outputPath: f.dir }, async () => assert.fail()), /context_required/);
});
test('unknown submission retains budget and concurrency; reconciliation does not resubmit', async t => {
  const f = fixture(t), p = f.plan(); let calls = 0;
  await assert.rejects(f.run(p, async () => { calls++; throw new Error('timeout'); }), /timeout/);
  assert.equal(musicStatus({ directory: f.dir, requestId: p.requestId }).status, 'submission_unknown');
  await assert.rejects(f.run(p, async () => assert.fail()), /request_pending/);
  await assert.rejects(f.run(f.plan('next'), async () => assert.fail()), /concurrency_limit/);
  assert.throws(() => musicStatus({ directory: f.dir, requestId: p.requestId, action: 'reconcile' }), /requires_billing/);
  const job = musicStatus({ directory: f.dir, requestId: p.requestId, action: 'reconcile', spentUsd: 0.8, evidence: 'Provider terminal; invoice verified' });
  assert.equal(job.status, 'failed'); assert.equal(calls, 1);
  await assert.rejects(f.run(f.plan('next'), async () => assert.fail()), /budget_exceeded/);
});
test('atomic reservations, attempt limits and malformed state block paid dispatch', async t => {
  const f = fixture(t, { reference: 'test', maxUsd: 0.7, maxConcurrent: 2, maxAttempts: 1 });
  let release; const ready = new Promise(resolve => { release = resolve; });
  const run = f.run(f.plan(), async (_tool, args) => { await ready; return output(args); });
  await assert.rejects(f.run(f.plan('second'), async () => assert.fail()), /budget_exceeded/);
  release(); await run;
  await assert.rejects(f.run(f.plan('third', {}, { reserveUsd: 0.1 }), async () => assert.fail()), /attempt_limit/);
  const lock = path.join(f.dir, '.work/music-routing/state.lock');
  fs.writeFileSync(lock, 'owner');
  assert.throws(() => musicTransaction(f.dir, undefined, () => {}), /state_busy/);
  // A lock older than any transaction was left by a crashed process and no longer blocks.
  const old = new Date(Date.now() - 60_000); fs.utimesSync(lock, old, old);
  musicTransaction(f.dir, undefined, () => {}); assert.equal(fs.existsSync(lock), false);
  fs.writeFileSync(path.join(f.dir, '.work/music-routing/state.json'), '{}');
  assert.throws(() => musicStatus({ directory: f.dir, requestId: 'base-1' }));
});
test('invalid audio preserves provider evidence and reserves uncertain billing', async t => {
  const f = fixture(t), p = f.plan();
  await assert.rejects(f.run(p, async (_tool, args) => {
    const result = output(args); fs.writeFileSync(result.musicReceipt.audioPath, 'not audio'); return result;
  }));
  const job = musicStatus({ directory: f.dir, requestId: p.requestId });
  assert.equal(job.status, 'submission_unknown'); assert.equal(job.providerId, 'provider-id');
  assert.equal(fs.existsSync(p.outputFile), false);
});
test('a definite rejection before any provider task frees the slot and the reservation', async t => {
  const f = fixture(t, { reference: 'test', maxUsd: 0.7, maxConcurrent: 1, maxAttempts: 3 }), p = f.plan();
  await assert.rejects(f.run(p, async () => ({ isError: true, terminal: true, content: [{ type: 'text', text: 'HTTP 400' }] })), /adapter_failed/);
  const job = musicStatus({ directory: f.dir, requestId: p.requestId });
  assert.equal(job.status, 'failed'); assert.equal(job.spentUsd, 0);
  // maxConcurrent 1 and maxUsd 0.7 would each refuse this second 0.4 reservation if the first were held.
  const next = f.plan('base-2'); await f.run(next, async (_tool, args) => output(args));
  assert.equal(musicStatus({ directory: f.dir, requestId: next.requestId }).status, 'completed');
});
test('resume finishes an interrupted Suno request from its task ID without resubmitting', async t => {
  const f = fixture(t, undefined, { engine: 'suno-api', model: 'V6' });
  const p = planMusic({ directory: f.dir, assetId: 'base', requestId: 'suno-1', reserveUsd: 0.4, args: { style: 'calm piano', instrumental: true, pickTrack: 1 } });
  await assert.rejects(f.run(p, async () => ({ isError: true, content: [{ type: 'text', text: 'poll lost' }], musicReceipt: { requestId: 'task-1' } })));
  assert.equal(musicStatus({ directory: f.dir, requestId: 'suno-1' }).status, 'submission_unknown');
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(String(url)); assert.equal(options?.method, undefined);
    if (String(url).includes('record-info')) return Response.json({ code: 200, data: { status: 'SUCCESS', response: { sunoData: [{ id: 'a', audioUrl: 'https://cdn.test/a.mp3' }, { id: 'b', audioUrl: 'https://cdn.test/b.mp3' }] } } });
    return new Response(wav());
  });
  const result = await resumeMusic({ directory: f.dir, requestId: 'suno-1', action: 'resume' });
  assert.equal(result.musicReceipt.output.channels, 2);
  assert.ok(urls[0].includes('taskId=task-1')); assert.ok(urls.every(u => !u.endsWith('/api/v1/generate')));
  assert.equal(musicStatus({ directory: f.dir, requestId: 'suno-1' }).status, 'completed');
  await assert.rejects(resumeMusic({ directory: f.dir, requestId: 'suno-1', action: 'resume' }), /resume_requires/);
});
