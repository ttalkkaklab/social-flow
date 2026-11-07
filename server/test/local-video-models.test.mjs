import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localVideoStrategy, generateLocalVideo } from '../dist/local-video-models.js';
import { videoCatalog } from '../dist/video-registry.js';
import { quoteVideo } from '../dist/video-pricing.js';
import { TOOLS } from '../dist/tools.js';
test('model-named tools share transport while keeping contracts and legacy alias distinct', async () => {
  assert.equal(localVideoStrategy('mlx_video_generate'), localVideoStrategy('ltx_video_generate'));
  assert.equal(localVideoStrategy('ltx_video_generate').acceptsModel('ddalcu/FastH3-Omni-MLX-Serve-8bit'), false);
  assert.equal(localVideoStrategy('fasth3_omni_reference').schema.safeParse({ prompt:'x', numFrames:49, referenceImagePaths:['x'] }).success, false);
  for (const name of ['ltx_video_generate', 'fasth3_omni_reference']) {
    assert.equal(quoteVideo(name, {}).estimatedUsd, 0);
    assert.ok(TOOLS.some(t => t.name === name));
    assert.ok(videoCatalog().adapters.some(a => a.tool === name));
  }
  assert.equal(videoCatalog().adapters.find(a => a.tool === 'mlx_video_generate').replacement, 'ltx_video_generate');
  await assert.rejects(generateLocalVideo('fasth3_omni_reference', { prompt: 'no references' }));
});
