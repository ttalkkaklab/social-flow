import test from 'node:test';
import assert from 'node:assert/strict';
import { idleRequests, idleRetake, idleCount, IdleRotation, checkStandbyFraming } from '../dist/live-idle.js';
import { astraImg2VideoSchema } from '../dist/astra-video-client.js';

test('prepares ten model-native shots pinned to the same host and broadcast setting', () => {
  const requests = idleRequests('/a/studio.png', 'Quiet late-night radio');
  assert.equal(requests.length, 10);
  assert.equal(new Set(requests.map(r => r.seed)).size, 10);
  assert.equal(new Set(requests.map(r => r.prompt)).size, 10);
  for (const request of requests) {
    assert.ok(astraImg2VideoSchema.safeParse(request).success);
    assert.equal(request.firstFramePath, request.lastFramePath);
    assert.equal(request.tier, 'fast');
    assert.equal(request.width, 736);
    assert.equal(request.height, 1280);
    assert.equal(request.generateAudio, false);
    assert.match(request.prompt, /Quiet late-night radio/);
    assert.ok(request.numFrames / request.frameRate >= 3 && request.numFrames / request.frameRate <= 5);
  }
});

test('plays each shot once per shuffle and avoids back-to-back repeats across shuffles', () => {
  const rotation = new IdleRotation();
  let last = -1;
  const orders = new Set();
  for (let round = 0; round < 100; round++) {
    const clips = Array.from({length: idleCount}, () => rotation.next());
    assert.notEqual(clips[0], last);
    assert.deepEqual([...clips].sort((a,b) => a-b), Array.from({length: 10}, (_,i) => i));
    last = clips.at(-1);
    orders.add(clips.join(','));
  }
  assert.ok(orders.size > 1);
});

test('checks the common camera anchor, rejects cuts and holds, and accepts a quiet blink', () => {
  const reference = Buffer.alloc(24 * 40 * 3, 130);
  const blink = Buffer.from(reference);
  blink.fill(40, 90, 150);
  const other = Buffer.alloc(reference.length, 220);
  const clip = (...frames) => Buffer.concat(frames);
  assert.deepEqual(checkStandbyFraming(clip(reference, blink, reference)), reference);
  assert.throws(() => checkStandbyFraming(clip(reference, reference)), /still frame/);
  assert.throws(() => checkStandbyFraming(clip(reference, other, reference)), /framing/);
  assert.throws(() => checkStandbyFraming(clip(other, blink, other), reference), /different shot/);
});

test('a single blink cannot hide a sustained stationary hold or moving background noise', () => {
  const base = Buffer.alloc(24 * 40 * 3, 100);
  const held = Array.from({length: 29}, (_, i) => {
    const frame = Buffer.alloc(base.length, 100 + i % 2);
    frame.fill(110 + i % 3, 0, 24 * 3);
    return frame;
  });
  const blink = Buffer.from(base);
  blink.fill(60, 24 * 18 * 3, 24 * 19 * 3);
  assert.throws(() => checkStandbyFraming(Buffer.concat([base, blink, ...held])), /stays still/);
});

test('a framing rejection can render a distinct centered take without replacing the previous receipt', () => {
  const index = 4, concept = 'Night radio';
  const request = idleRequests('/host.png', concept)[index];
  const takes = [2, 3, 4].map(attempt => idleRetake(request, index, concept, attempt));
  assert.equal(new Set(takes.map(take => take.seed)).size, takes.length);
  assert.equal(new Set(takes.map(take => take.prompt)).size, takes.length);
  for (const take of takes) {
    assert.equal(take.firstFramePath, request.firstFramePath);
    assert.equal(take.lastFramePath, undefined);
    assert.equal(take.numFrames, 1 + 8 * Math.ceil((request.numFrames - 1) / 16));
    assert.ok(astraImg2VideoSchema.safeParse(take).success);
  }
});
