import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSpeechTiming } from '../dist/live-native.js';
import { RATE, SAMPLES } from '../dist/live-character.js';

test('native conditioning and playout share a sample clock through the last partial frame', () => {
  for (const samples of [1, SAMPLES, SAMPLES + 1, RATE * 30]) {
    const pcm = Buffer.alloc(samples * 2, 37);
    const { modelPcm, modelFrames, leadFrames, speechFrames } = nativeSpeechTiming(pcm);
    const from = leadFrames * SAMPLES * 2;
    assert.equal((modelFrames - 1) % 8, 0);
    assert.equal(speechFrames, Math.ceil(samples / SAMPLES));
    assert.equal(modelPcm.length, modelFrames * SAMPLES * 2);
    assert.deepEqual(modelPcm.subarray(from, from + pcm.length), pcm);
    assert.ok(!modelPcm.subarray(0, from).some(Boolean));
    assert.ok(!modelPcm.subarray(from + pcm.length).some(Boolean));
  }
});
