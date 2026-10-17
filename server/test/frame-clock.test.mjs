import { test } from 'node:test';
import assert from 'node:assert/strict';
import clock from '../../skills/produce/references/frame-clock.js';
test('rounded ffprobe durations retain exact frames and preserve an extra audio sample', () => {
  for (const fps of [24, 25, 30, 48, 50, 60]) for (const frames of [25, 121, 145, 193]) {
    const samples = frames * 48000 / fps;
    assert.equal(clock.durationFrames(Number((samples / 48000).toFixed(6)), fps), frames);
    assert.equal(clock.durationFrames(Number(((samples + 1) / 48000).toFixed(6)), fps), frames + 1);
    assert.equal(clock.durationFrames(Number(((samples - 1) / 48000).toFixed(6)), fps), frames);
  }
  assert.equal(clock.durationFrames(0, 24), 0);
  assert.equal(clock.durationFrames(1 / 48000, 24), 1);
  for (const bad of [NaN, Infinity, -1, '6.04']) assert.throws(() => clock.durationFrames(bad, 24));
});
