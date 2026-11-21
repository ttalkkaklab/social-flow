import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { characterPanelRequest, recordCharacterPanel } from '../dist/character-panel.js';
import { manageCharacter } from '../dist/character-manage.js';
import { setupProject, png } from './workflow-fixture.mjs';
const settings = createRequire(import.meta.url)('../../skills/_shared/model-settings.js');

// A workspace (webtoon style, host image model) with one orc whose sheet has a body.
function orc(t) {
  const root = mkdtempSync(join(tmpdir(), 'sf-panel-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  setupProject(root);
  const identityPath = join(root, 'data/c/assets/characters/kardum/identity.md');
  manageCharacter({ identityPath, name: '카르둠', gender: '남성', species: '오크', age: '장년', role: '전사', summary: '전사', heightCm: 225,
    fields: { physical: { weightKg: 200, relativeScale: 'height measured to the top of the head; ears and gear not included', build: 'broad extremely muscular orc ' + 'with heavy shoulders '.repeat(12),
      proportions: 'about 7.5 heads tall, head not oversized', appearance: 'olive green skin, amber eyes', outfit: 'worn dark iron plate armor, heavy leather boots' } } });
  return { root, identityPath };
}

test('front and back use matching fitting clothes and the sheet build, independently of the character costume', (t) => {
  const { identityPath } = orc(t);
  const face = characterPanelRequest({ identityPath, view: 'face' });
  assert.deepEqual(face.inputs, []);
  assert.match(face.prompt, /Head-only identity portrait.*Character: olive green skin, amber eyes\..*Korean webtoon illustration/);
  assert.match(face.prompt, /No shoulders, torso or clothing/);
  assert.throws(() => characterPanelRequest({ identityPath, view: 'front' }), /character_panel_missing: make kardum's face panel first/);
  writeFileSync(face.file, png);
  recordCharacterPanel(face);
  assert.equal(JSON.parse(readFileSync(face.panelsFile, 'utf8')).panels.face.file, 'kardum-face-v1.png');
  const front = characterPanelRequest({ identityPath, view: 'front' });
  assert.deepEqual(front.inputs, [face.file]);
  assert.match(front.prompt, /Headless front.*225 cm tall; about 200 kg; broad extremely muscular orc/);
  assert.match(front.prompt, /fitted T-shirt and short mid-thigh shorts/);
  assert.doesNotMatch(front.prompt, /plate armor/);
  assert.equal(face.panel.wardrobe, undefined);
  assert.equal(front.requestId, 'kardum-front-v1');
  writeFileSync(front.file, png);
  recordCharacterPanel(front);
  // A face reference or "keep this character" left Qwen redrawing the front; the back turns the front alone around.
  const back = characterPanelRequest({ identityPath, view: 'back' });
  assert.deepEqual(back.inputs, [front.file]);
  assert.match(back.prompt, /^Turn this headless mannequin around 180 degrees/);
  assert.match(back.prompt, /fitted T-shirt and short mid-thigh shorts/);
  assert.equal(back.panel.wardrobe, 'fitting');
  assert.equal(JSON.parse(readFileSync(front.panelsFile)).panels.front.wardrobe, 'fitting');
  // The sheet's head words (relativeScale, "head not oversized") drew a head back onto the body panels.
  assert.doesNotMatch(back.prompt, /Character:[^.]*\b(head|ears)\b/);
  assert.match(back.prompt, /about 7\.5 heads tall/);
  assert.equal(back.warnings.some(w => /^head_count_missing/.test(w)), false);
});

test('costume and legacy fronts keep their wardrobe for the rear edit', t => {
  const { identityPath } = orc(t);
  const front = characterPanelRequest({ identityPath, view: 'front', wardrobe: 'character', references: [] });
  assert.match(front.prompt, /plate armor/);
  writeFileSync(front.file, png);
  recordCharacterPanel(front);
  for (const wardrobe of ['character', undefined]) {
    const manifest = JSON.parse(readFileSync(front.panelsFile));
    manifest.panels.front.wardrobe = wardrobe;
    writeFileSync(front.panelsFile, JSON.stringify(manifest));
    const back = characterPanelRequest({ identityPath, view: 'back' });
    assert.equal(back.panel.wardrobe, 'character');
    assert.match(back.prompt, /plate armor/);
    assert.doesNotMatch(back.prompt, /T-shirt|shorts/);
    assert.equal(characterPanelRequest({ identityPath, view: 'back', references: [] }).panel.wardrobe, 'character');
  }
});

test('the GenAI cap reports overlength without dropping style or identity', (t) => {
  const { root, identityPath } = orc(t);
  const current = settings.readSettings(root);
  settings.saveSettings(root, { ...current.config.models, image: { engine: 'astra-genai', model: 'z-image-turbo' } },
    { expectedRevision: current.revision, request: 'Fixture: the GenAI gateway image model' });
  assert.throws(() => characterPanelRequest({ identityPath, view: 'front', references: [] }), /image_prompt_too_long/);
});

test('body panels rule the head out with a negative prompt on models that take one', (t) => {
  const { root, identityPath } = orc(t);
  const current = settings.readSettings(root);
  settings.saveSettings(root, { ...current.config.models, image: { engine: 'astra-genai-native', model: 'qwen-image-fast' } },
    { expectedRevision: current.revision, request: 'Fixture: the model-bound gateway image model' });
  const front = characterPanelRequest({ identityPath, view: 'front', references: [], negativePrompt: 'beard' });
  assert.match(front.args.negativePrompt, /^head, face, hair.*, beard$/);
  assert.equal(front.args.guidanceScale, 4, 'the gateway refuses a negative prompt without CFG');
  assert.equal(characterPanelRequest({ identityPath, view: 'face' }).args.negativePrompt.includes('head'), false);
  assert.match(characterPanelRequest({ identityPath, view: 'face' }).args.negativePrompt, /shoulders, torso, clothing, shirt/);
  assert.match(characterPanelRequest({ identityPath, view: 'back', references: [] }).args.negativePrompt, /^front view, chest, .*, head, face/);
});


test('confirmed multilingual clothing and body-part clothing clauses survive', () => {
  const { sheetPanelPrompt } = createRequire(import.meta.url)('../../skills/_shared/character-identity.js');
  const result = sheetPanelPrompt({ physical: { outfit: { status: 'confirmed', value: '붉은 두루마기; red coat with a hood behind the head; black boots' } } }, 'front', 'character');
  assert.match(result.text, /붉은 두루마기/);
  assert.match(result.text, /red coat with a hood behind the head/);
  assert.deepEqual(result.skipped, []);
});

test('an unclothed design keeps its species and natural markings in both body views', () => {
  const { sheetPanelPrompt } = createRequire(import.meta.url)('../../skills/_shared/character-identity.js');
  const character = { identity: { species: { status: 'confirmed', value: 'tortoise' } }, physical: { outfit: { status: 'not_applicable', value: null } } };
  for (const view of ['front', 'back']) {
    const result = sheetPanelPrompt(character, view);
    assert.equal(result.wardrobe, 'character');
    assert.match(result.text, /tortoise.*natural body surface/);
    assert.doesNotMatch(result.text, /T-shirt|shorts/);
  }
});

test('a smile on the sheet stays out of the neutral face panel and is reported', () => {
  const { panelPrompt } = createRequire(import.meta.url)('../../skills/_shared/character-identity.js');
  const result = panelPrompt({ physical: { appearance: { status: 'confirmed', value: 'Round glasses, small nose, gentle smile, fair skin. Short black hair.' } } }, 'face');
  assert.equal(result.text, 'Round glasses, small nose, fair skin. Short black hair.');
  assert.deepEqual(result.expression, ['gentle smile,']);
});

test('another native gateway model does not inherit Qwen panel guidance', t => {
  const { root, identityPath } = orc(t);
  const current = settings.readSettings(root);
  settings.saveSettings(root, { ...current.config.models, image: { engine: 'astra-genai-native', model: 'another-model' } },
    { expectedRevision: current.revision, request: 'Fixture: another model' });
  const result = characterPanelRequest({ identityPath, view: 'face', negativePrompt: 'beard' });
  assert.equal(result.args.guidanceScale, undefined);
  assert.equal(result.args.negativePrompt, undefined);
  assert.match(result.prompt, /Exclude: beard/);
});
