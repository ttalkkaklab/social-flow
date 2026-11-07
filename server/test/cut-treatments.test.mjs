import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cutTreatment } = require('../../skills/storyboard/references/cut-treatments.js');

const PRESETS = [
  'cinematic-miniature', 'photoreal', 'webtoon', 'claymation',
  'paper-cutout', 'ink-wash', 'toon-3d', 'arcade-2d'
];

// A phone insert was formerly widened by the action/reaction treatment.
test('action and reaction intent never imposes a competing camera distance', () => {
  for (const preset of PRESETS) {
    for (const cutType of ['action', 'reaction']) {
      const prompt = cutTreatment(preset, cutType);
      assert.doesNotMatch(prompt, /full or medium|medium.close shot|whole body|previous cut.s subject/i);
      assert.match(prompt, /shot's camera framing/);
    }
  }
});
