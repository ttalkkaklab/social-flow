import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { quoteVideo } from '../dist/video-pricing.js';

test('hosted vendors reserve from the price sheet: HeyGen at its standard rate, LTX audio by its length, MiniMax paid pictures', t => {
  assert.equal(quoteVideo('heygen_reference', { resolution: '768p', durationSeconds: 10 }).reserveUsd, 0.6);
  assert.equal(quoteVideo('heygen_img2video', { resolution: '480p', durationSeconds: 5 }).reserveUsd, 0.1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-price-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const voice = path.join(dir, 'v.wav'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=4', voice]);
  assert.equal(quoteVideo('ltx_api_audio2video', { model: 'ltx-2-5-pro', resolution: '1920x1080', audioPath: voice }).reserveUsd, 0.68);
  const seven = Array.from({ length: 7 }, (_, i) => `p${i}.png`);
  assert.equal(quoteVideo('minimax_reference', { model: 'MiniMax-H3', resolution: '768P', durationSeconds: 5, referenceImagePaths: seven }).reserveUsd, 0.48);
  assert.equal(quoteVideo('minimax_reference', { model: 'MiniMax-H3-Max', resolution: '768P', durationSeconds: 5, referenceImagePaths: ['a.png', 'b.png'] }).reserveUsd, 0.4);
});
