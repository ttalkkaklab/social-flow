import { test } from 'node:test';
import assert from 'node:assert/strict';

test('3d_generation lists blender as a local provider with an install hint', async () => {
  const { capabilityStatus } = await import('../dist/capability-status.js');
  const cap = capabilityStatus().capabilities.find((c) => c.capability === '3d_generation');
  const blender = cap.providers.find((p) => p.provider.startsWith('blender'));
  assert.ok(blender, 'blender provider present');
  assert.match(blender.needs, /brew install --cask blender|BLENDER=/);
  assert.match(blender.note, /bake-blender\.py/);
  // A local install is not a one-env-var offer, so it never appears in setupOffers.
  assert.ok(!capabilityStatus().setupOffers.some((o) => /Blender/i.test(o.env)));
});

test('speech capabilities expose gateway aliases independently of local runtime', async () => {
  const { capabilityStatus } = await import('../dist/capability-status.js');
  const speech = capabilityStatus().capabilities.find(c => c.capability === 'tts');
  assert.deepEqual(speech.providers.map(p => p.provider), ['astra-genai', 'gemini', 'elevenlabs']);
  assert.match(speech.providers[1].note, /tts_gemini_38/);
  assert.match(speech.providers[2].note, /eleven_v4 only/);
});
