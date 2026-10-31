import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitRealtimePcm } from '../dist/music-client.js';

const SECOND = 48_000 * 2 * 2; // 48 kHz stereo 16-bit

test('a RealTime stream that ends well short of the requested length is a failure', () => {
  assert.throws(() => fitRealtimePcm([Buffer.alloc(SECOND * 3)], SECOND * 10), /ended early: 3\.0s of 10\.0s/);
  assert.throws(() => fitRealtimePcm([], SECOND * 10), /No audio/);
  // Within 90% of the target is accepted as delivered; a longer stream is trimmed to the request.
  assert.equal(fitRealtimePcm([Buffer.alloc(SECOND * 9.5)], SECOND * 10).length, SECOND * 9.5);
  assert.equal(fitRealtimePcm([Buffer.alloc(SECOND * 6), Buffer.alloc(SECOND * 6)], SECOND * 10).length, SECOND * 10);
});
