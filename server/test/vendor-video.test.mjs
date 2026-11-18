import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runVendorJob, VendorHttpError, vendorJson } from '../dist/vendor-video.js';
import { videoEvents } from '../dist/video-events.js';

function job(t, overrides) {
  const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-vendor-'));
  t.after(() => fs.rmSync(outputPath, { recursive: true, force: true }));
  return { vendor: 'Fixture', outputPath, filename: 'clip.mp4', intervalMs: 0, maxPolls: 3, ...overrides };
}
const withEvents = (fn) => { const ids = []; return videoEvents.run({ submitted: id => ids.push(id), usage() {} }, fn).then(result => ({ result, ids })); };

test('a finished job is recorded once, polled and downloaded; a failed status read never repeats the POST', async t => {
  let posts = 0, polls = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response('mp4-bytes'));
  const spec = job(t, {
    submit: async () => { posts++; return 'job-1'; },
    poll: async () => { polls++; if (polls === 1) throw new Error('503'); return polls === 2 ? { state: 'running' } : { state: 'done', url: 'https://cdn/clip.mp4' }; },
  });
  const { result, ids } = await withEvents(() => runVendorJob(spec));
  assert.equal(result.success, true);
  assert.deepEqual(ids, ['job-1']);
  assert.equal(posts, 1);
  assert.equal(fs.readFileSync(result.videoPath, 'utf8'), 'mp4-bytes');
});

test('only an explicit refusal of the POST is terminal; a lost answer or a dead poll keeps the job open', async t => {
  const refused = await runVendorJob(job(t, { submit: async () => { throw new VendorHttpError('HTTP 400', 400, true); }, poll: async () => ({ state: 'running' }) }));
  assert.deepEqual([refused.success, refused.terminal], [false, true]);
  const lost = await runVendorJob(job(t, { submit: async () => { throw new Error('socket hang up'); }, poll: async () => ({ state: 'running' }) }));
  assert.deepEqual([lost.success, lost.terminal], [false, false]);
  const dead = await runVendorJob(job(t, { submit: async () => 'job-2', poll: async () => { throw new Error('down'); } }));
  assert.deepEqual([dead.terminal, dead.providerId], [false, 'job-2']);
  const failed = await runVendorJob(job(t, { submit: async () => 'job-3', poll: async () => ({ state: 'failed', error: 'policy' }) }));
  assert.deepEqual([failed.terminal, failed.providerId], [true, 'job-3']);
});

test('vendorJson treats rate limits and conflicts as retryable, other 4xx as refusals', async t => {
  for (const [status, terminal] of [[400, true], [402, true], [429, false], [409, false], [500, false]]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('{"error":"x"}', { status }));
    await assert.rejects(vendorJson('https://vendor/x', {}), error => error instanceof VendorHttpError && error.terminal === terminal);
    globalThis.fetch.mock.restore();
  }
});
