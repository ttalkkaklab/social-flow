import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { negDirectiveHits } = require('../../skills/storyboard/references/assemble-bg-prompt.js');
const {
  CUT_TYPES, BASE, PRESET_NOTES, APPEARANCE_WORDS,
  cutTreatment, castLines, defaultStyleRole
} = require('../../skills/storyboard/references/cut-treatments.js');

const PRESETS = [
  'cinematic-miniature', 'photoreal', 'webtoon', 'claymation',
  'paper-cutout', 'ink-wash', 'toon-3d', 'arcade-2d'
];

test('every preset and cut type resolves to positive prompt text', () => {
  assert.equal(CUT_TYPES.length, 6);
  assert.equal(Object.keys(BASE).length, 6);
  assert.deepEqual(Object.keys(PRESET_NOTES), PRESETS);
  for (const preset of PRESETS) {
    for (const cutType of CUT_TYPES) {
      const treatment = cutTreatment(preset, cutType);
      assert.ok(treatment.length > 0, `${preset}/${cutType}`);
      assert.deepEqual(negDirectiveHits(treatment, 'seedance'), [], `${preset}/${cutType}: ${treatment}`);
    }
  }
  assert.equal(cutTreatment('spatial-explainer', 'document'), cutTreatment('cinematic-miniature', 'document'));
  assert.equal(cutTreatment('photoreal', 'unknown'), '');
});

test('cast lines use the same sheet text on people cuts and omit it on empty cuts', () => {
  const sheet = 'An officer in his thirties, lean build, calm face; dark armor and red sleeves.';
  const cast = { yi: { name: 'Yi Sun-sin', sheet }, missing: { name: 'Missing sheet' } };
  assert.deepEqual(castLines(cast, ['yi'], 'action'), [`Cast — Yi Sun-sin: ${sheet}`]);
  assert.deepEqual(castLines(cast, ['yi'], 'insert'), [
    'Only the hands, sleeves and boots of Yi Sun-sin are in frame.',
    `Cast — Yi Sun-sin: ${sheet}`
  ]);
  for (const cutType of ['document', 'map', 'scenery']) assert.deepEqual(castLines(cast, ['yi'], cutType), []);
  assert.deepEqual(castLines(cast, ['channel-cast', 'missing'], 'reaction'), []);
});

test('default style roles follow cut content', () => {
  assert.equal(defaultStyleRole('action', ['yi']), 'character');
  assert.equal(defaultStyleRole('action', ['yi', 'horse']), 'interaction');
  assert.equal(defaultStyleRole('reaction', ['onlookers']), 'interaction');
  assert.equal(defaultStyleRole('insert', ['yi']), 'interaction');
  for (const cutType of ['document', 'map', 'scenery']) assert.equal(defaultStyleRole(cutType, []), 'environment');
  assert.ok(APPEARANCE_WORDS.includes('armor'));
  assert.ok(APPEARANCE_WORDS.includes('갑옷'));
});
