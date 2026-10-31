import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolveVideoDuration, DURATION_TOOLS } from '../dist/video-duration.js';
import { priceOf } from '../dist/usage-ledger.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const { minimumDuration, shotTiming } = require('../../skills/_shared/video-duration.js');

test('every new-generation tool exposes requiredSeconds and selects covering duration', () => {
  for (const tool of DURATION_TOOLS) {
    assert.ok(TOOLS.find(item => item.name === tool).inputSchema.properties.requiredSeconds);
    const { args, timing } = resolveVideoDuration(tool, { requiredSeconds: 3.2 });
    assert.ok(timing.requestedSeconds >= 3.2, tool);
    assert.equal(args.requiredSeconds, undefined);
  }
  assert.equal(resolveVideoDuration('seedance_img2video', { requiredSeconds: 3.2 }).args.durationSeconds, 4);
  assert.equal(resolveVideoDuration('seedance_reference', { requiredSeconds: 4.1 }).args.durationSeconds, 5);
  assert.equal(resolveVideoDuration('astra_img2video', { requiredSeconds: 5 }).args.numFrames, 121);
  assert.equal(resolveVideoDuration('astra_img2video', { requiredSeconds: 8 }).args.numFrames, 193);
});

test('frame boundaries select the minimum covering point and never silently clip', () => {
  for (const [min, max, step, fps] of [[25, 193, 8, 24], [9, 241, 8, 24], [29, 289, 4, 24], [25, 193, 8, 60], [25, 193, 8, 29.97], [25, 193, 8, 59.94]]) {
    for (let frame = min; frame <= max; frame += step) {
      assert.equal(minimumDuration(frame / fps, { min, max, step, frameRate: fps }).numFrames, frame);
      if (frame < max) assert.equal(minimumDuration(frame / fps + 1e-7, { min, max, step, frameRate: fps }).numFrames, frame + step);
    }
    assert.throws(() => minimumDuration(max / fps + 1e-7, { min, max, step, frameRate: fps }), /split or replan/);
  }
  for (const requiredSeconds of [0, -1, NaN, Infinity, '4'])
    assert.throws(() => resolveVideoDuration('seedance_text2video', { requiredSeconds }), /finite positive/);
  for (const key of ['duration', 'durationSeconds', 'numFrames', 'frames', 'autoDuration', 'audioMaxDuration'])
    assert.throws(() => resolveVideoDuration('seedance_text2video', { requiredSeconds: 4, [key]: 8 }), /mutually exclusive/);
  assert.throws(() => resolveVideoDuration('astra_text2video', { requiredSeconds: 16, tier: 'fast' }), /split or replan/);
  assert.throws(() => resolveVideoDuration('seedance_text2video', { requiredSeconds: 15.01 }), /split or replan/);
  const legacy = { durationSeconds: 8 };
  assert.equal(resolveVideoDuration('seedance_text2video', legacy).args, legacy);
});

test('source coverage includes audio margins, trim and frame-rounded outgoing handle', () => {
  const timing = shotTiming({ duration: 3 }, { audioSeconds: 3.2, performanceSeconds: 2,
    edit: { pre: .3, post: .12, in: .5, handle: .24 } });
  assert.equal(timing.bodySeconds, 109 / 30);
  assert.equal(timing.handleSeconds, 8 / 30);
  assert.ok(Math.abs(timing.requiredSeconds - 4.4) < 1e-10);
  assert.equal(resolveVideoDuration('seedance_img2video', { requiredSeconds: timing.requiredSeconds }).args.durationSeconds, 5);
});

test('the ledger prices the resolved duration, and an impossible need prices nothing', () => {
  assert.equal(priceOf('seedance_img2video', { requiredSeconds: 3.2 }).quantity, 4);
  assert.equal(priceOf('seedance_img2video', { requiredSeconds: 99 }).key, null);
});

test('MCP normalization reaches wire payload and invalid plans never call transport', async () => {
  const { ROUTES } = await import('../dist/handlers.js');
  const { config } = await import('../dist/config.js');
  const oldFetch = globalThis.fetch, oldKey = config.arkApiKey;
  let calls = [];
  config.arkApiKey = 'ark-test-no-network';
  globalThis.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body));
    return new Response('{"error":{"message":"mock submission stopped"}}', { status: 400 });
  };
  try {
    await assert.rejects(ROUTES.seedance_text2video({ prompt: 'A person walks', requiredSeconds: 31 }), /split or replan/);
    assert.equal(calls.length, 0);
    await ROUTES.seedance_text2video({ prompt: 'A person walks', requiredSeconds: 2.4 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].duration, 4);
    assert.equal(calls[0].requiredSeconds, undefined);
    await ROUTES.seedance_text2video({ prompt: 'A person walks', requiredSeconds: 4.2 });
    assert.equal(calls[1].duration, 5);
    assert.equal(calls[1].frames, undefined);
  } finally { globalThis.fetch = oldFetch; config.arkApiKey = oldKey; }
});
