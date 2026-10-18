import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text2ImageSchema, img2ImgSchema } from '../dist/image-client.js';
import { assertImageModelAvailable, validateMlxImageOperation } from '../dist/image-models.js';

test('GPT transparent preview, mini fidelity and dated retirement use model-specific contracts', () => {
  assert.equal(text2ImageSchema.safeParse({ prompt: 'x', model: 'gpt-image-2', background: 'transparent' }).success, true);
  assert.equal(text2ImageSchema.safeParse({ prompt: 'x', model: 'gpt-image-2-2026-04-21', size: '1088x1920' }).success, true);
  assert.equal(img2ImgSchema.safeParse({ prompt: 'x', model: 'gpt-image-1-mini', sourceImagesBase64: ['x'], inputFidelity: 'low' }).success, true);
  assert.equal(img2ImgSchema.safeParse({ prompt: 'x', model: 'gpt-image-1-mini', sourceImagesBase64: ['x'], inputFidelity: 'high' }).success, false);
  assert.equal(text2ImageSchema.safeParse({ prompt: 'x', background: 'transparent', outputFormat: 'jpeg' }).success, false);
  assert.throws(() => assertImageModelAvailable('gpt-image-1', new Date('2026-10-23T00:00:00Z')), /image_model_retired/);
  assert.doesNotThrow(() => assertImageModelAvailable('gpt-image-1', new Date('2026-10-22T00:00:00Z')));
});

test('MLX checks actual pack operation, reference limit, transparency and Turbo schedule', () => {
  assert.throws(() => validateMlxImageOperation('Krea-2-Turbo', 'edit', {}), /operation_unsupported/);
  assert.throws(() => validateMlxImageOperation('Mage-Flow-Edit-Turbo', 'variation', {}), /operation_unsupported/);
  assert.doesNotThrow(() => validateMlxImageOperation('Qwen-Image-2.1-Turbo-8bit', 'edit', { transparent: true, refImagePaths: Array(9).fill('x'), steps: 8 }));
  assert.throws(() => validateMlxImageOperation('Qwen-Image-2.1-Turbo-8bit', 'text', { steps: 40 }), /schedule_fixed/);
  assert.throws(() => validateMlxImageOperation('FLUX.2-klein-4B', 'edit', { refImagePaths: Array(4).fill('x') }), /reference_limit/);
  assert.doesNotThrow(() => validateMlxImageOperation('custom-pack', 'text', {}));
  assert.throws(() => validateMlxImageOperation('custom-pack', 'edit', {}), /operation_unsupported/);
});
