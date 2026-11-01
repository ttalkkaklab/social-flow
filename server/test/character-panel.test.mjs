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
      appearance: 'olive green skin, amber eyes', outfit: 'worn dark iron plate armor, heavy leather boots' } } });
  return { root, identityPath };
}

test('each panel prompt comes from the sheet: the face from appearance, the body panels from height, weight, build and outfit', (t) => {
  const { identityPath } = orc(t);
  const face = characterPanelRequest({ identityPath, view: 'face' });
  assert.deepEqual(face.inputs, []);
  assert.match(face.prompt, /Close head portrait.*Character: olive green skin, amber eyes\..*Korean webtoon illustration/);
  assert.throws(() => characterPanelRequest({ identityPath, view: 'front' }), /character_panel_missing: make kardum's face panel first/);
  writeFileSync(face.file, png);
  recordCharacterPanel(face);
  assert.equal(JSON.parse(readFileSync(face.panelsFile, 'utf8')).panels.face.file, 'kardum-face-v1.png');
  const front = characterPanelRequest({ identityPath, view: 'front' });
  assert.deepEqual(front.inputs, [face.file]);
  assert.match(front.prompt, /Headless front.*Character: 225 cm tall; about 200 kg; height measured.*worn dark iron plate armor/);
  assert.equal(front.requestId, 'kardum-front-v1');
  writeFileSync(front.file, png);
  recordCharacterPanel(front);
  // A face reference or "keep this character" left Qwen redrawing the front; the back turns the front alone around.
  const back = characterPanelRequest({ identityPath, view: 'back' });
  assert.deepEqual(back.inputs, [front.file]);
  assert.match(back.prompt, /^Turn this headless costume mannequin around 180 degrees/);
});

test('on the GenAI 800-character cap the height note goes first, then the style sentence', (t) => {
  const { root, identityPath } = orc(t);
  const current = settings.readSettings(root);
  settings.saveSettings(root, { ...current.config.models, image: { engine: 'astra-genai', model: 'z-image-turbo' } },
    { expectedRevision: current.revision, request: 'Fixture: the GenAI gateway image model' });
  const front = characterPanelRequest({ identityPath, view: 'front', references: [] });
  assert.ok(front.prompt.length <= 800, `${front.prompt.length} characters`);
  assert.doesNotMatch(front.prompt, /height measured/);
  assert.match(front.prompt, /225 cm tall; about 200 kg/);
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
  assert.match(characterPanelRequest({ identityPath, view: 'back', references: [] }).args.negativePrompt, /^front view, chest, .*, head, face/);
});

test('a model without a negative prompt gets none and the panel says so', (t) => {
  const { identityPath } = orc(t);
  const front = characterPanelRequest({ identityPath, view: 'front', references: [] });
  assert.equal(front.args.negativePrompt, undefined);
  assert.ok(front.warnings.some((w) => /no negative prompt/.test(w)));
});
