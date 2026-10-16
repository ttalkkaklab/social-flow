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
  assert.match(cutTreatment('arcade-2d', 'document'), /stage holds only the scroll item and its painted backdrop/);
  assert.match(cutTreatment('arcade-2d', 'scenery'), /small distant painted sprite silhouettes/);
});

test('cast lines use the same sheet text on people cuts and omit it on empty cuts', () => {
  const sheet = 'An officer in his thirties, lean build, calm face; dark armor and red sleeves.';
  const cast = { yi: { name: 'Yi Sun-sin', sheet }, missing: { name: 'Missing sheet' } };
  assert.deepEqual(castLines(cast, ['yi'], 'action'), [`Cast — Yi Sun-sin: ${sheet}`]);
  assert.deepEqual(castLines(cast, [{ id: 'yi', scope: 'controls the rider only' }], 'action'), [`Cast — Yi Sun-sin: ${sheet}`]);
  assert.deepEqual(castLines(cast, ['yi'], 'insert'), [
    'Show only the parts of Yi Sun-sin specified by the insert framing; the face stays outside the frame. Use the cast sheet for identity of visible parts only.',
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
  assert.ok(APPEARANCE_WORDS.includes('머리카락'));
  assert.ok(!APPEARANCE_WORDS.includes('머리'));
});

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

test('assembled phone action keeps its crop and scopes cast identity to visible parts', () => {
  const { assemble } = require('../../skills/storyboard/references/spatial-prompts.js');
  const win = {
    FORMAT: 'shorts-9x16',
    PRODUCTION: {
      mode: 'full_video',
      style: { preset: 'webtoon', world: 'A kitchen table.', materials: 'Ink and cel colour.',
        palette: 'Warm cream.', lighting: 'Window light.', camera: 'Natural observation.' },
      cast: { grandmother: { name: 'Grandmother', sheet: 'Grey curls, green sleeves, wrinkled hands.', image: 'grandmother.png' } }
    },
    SCENES: [{
      shot: { cutType: 'action', videoDesign: {
        look: 'webtoon', before: 'A thumb rests above a phone.', action: 'The thumb taps send.',
        after: 'The thumb rests beside the phone.', continuity: 'The phone keeps its black case.',
        motion: { kind: 'subject_action', subject: 'The thumb', visibleChange: 'The thumb taps then releases.',
          beats: [{ at: 0, state: 'A thumb rests above a phone.' }, { at: 4, state: 'The thumb rests beside the phone.' }] }
      } },
      visual: { character: ['grandmother'], camera: {
        framing: 'Overhead close-up of hands and phone only; face outside frame.',
        movement: 'dolly in', speed: 'slow', end: 'Tight crop on the thumb beside the phone.'
      }, video: { engine: 'astra' } }
    }]
  };
  for (const cutType of ['action', 'reaction', 'insert']) {
    win.SCENES[0].shot.cutType = cutType;
    const result = assemble(win, 0);
    assert.match(result.sourcePrompt, /Camera composition: Overhead close-up of hands and phone only/);
    assert.match(result.sourcePrompt, /Framing priority: the shot camera composition controls crop/);
    assert.match(result.sourcePrompt, /reference supplies appearance, not pose, framing or background/);
    assert.doesNotMatch(result.sourcePrompt, /full or medium|medium.close shot|whole body|hands, sleeves and boots/);
    assert.match(result.motionPrompt, /identity, face, costume, proportions, materials and actor screen positions/);
    assert.match(result.motionPrompt, /Camera landing: Tight crop on the thumb beside the phone/);
    assert.match(result.motionPrompt, /Appearance to preserve on visible parts only: Grey curls, green sleeves, wrinkled hands/);
    assert.deepEqual(result.sourceImageArgs.referenced_image_paths, ['grandmother.png']);
  }
});

test('a two-place-setting insert preserves deep focus without imposing macro optics', () => {
  const { assemble } = require('../../skills/storyboard/references/spatial-prompts.js');
  const win = {
    PRODUCTION: { mode: 'no_video', style: {
      preset: 'webtoon', world: 'A dining table.', materials: 'Ink and cel colour.',
      palette: 'Warm cream.', lighting: 'Window light.', camera: 'Natural observation.'
    }, cast: { grandmother: { name: 'Grandmother', sheet: 'Grey curls and green sleeves.', image: 'grandmother.png' } } },
    SCENES: [{ narration: [{ speaker: 'grandmother', tts: 'I prepared both places.', delivery: 'voiceover' }], shot: {
      cutType: 'insert', depth: { mode: 'deep', reads: 2, planes: ['near place setting', 'far place setting'] },
      videoDesign: { look: 'webtoon', before: 'Two bowls face each other across the table.',
        action: 'A hand sets down the second spoon.', after: 'Both places are ready.',
        continuity: 'The bowls keep their positions.' }
    }, visual: { character: null, camera: { framing: 'Oblique tabletop view of both place settings; faces outside frame.' } } }]
  };
  const result = assemble(win, 0);
  const prompt = result.sourcePrompt;
  assert.deepEqual(result.castReferenceImages, []);
  assert.deepEqual(result.castIds, []);
  assert.doesNotMatch(prompt, /Grey curls|green sleeves|approved appearance of Grandmother/);
  assert.match(prompt, /both place settings/);
  assert.match(prompt, /keep all planned planes sharp and readable together: near place setting; far place setting/);
  assert.match(prompt, /face stays outside the frame/);
  assert.doesNotMatch(prompt, /macro|shallow depth|one prop/i);
  assert.doesNotMatch(cutTreatment('cinematic-miniature', 'insert'), /macro|shallow/i);
  const scene = win.SCENES[0];
  scene.visual.camera = { framing: 'Oblique view of both place settings.', movement: 'static', speed: 'steady', end: 'Both places are ready.' };
  scene.visual.video = { engine: 'astra' };
  scene.shot.videoDesign.action = 'Steam rises from the two bowls.';
  delete scene.shot.videoDesign.after;
  scene.shot.videoDesign.motion = { kind: 'subject_action', subject: 'Steam', visibleChange: 'Steam rises.',
    beats: [{ at: 0, state: 'Two bowls rest on the table.' }, { at: 4, state: 'Steam rises above both bowls.' }] };
  const motion = assemble(win, 0).motionPrompt;
  assert.match(motion, /object identity, proportions, materials and spatial layout/);
  assert.match(motion, /Steam rises/);
  assert.doesNotMatch(motion, /face|costume|actor|characters|mouth|anatomy|hair|clothing/i);

});
