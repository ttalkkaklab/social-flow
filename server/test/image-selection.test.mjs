import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const settings = require('../../skills/_shared/model-settings.js');
const { readImageContext } = require('../../skills/_shared/image-selection.js');

test('image selection keeps snapshot, applies scoped explicit changes and validates saved model/quality', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-selection-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const models = { video: { engine: 'host', host: 'grok', model: 'host-managed' }, speech: { engine: 'gemini', model: 'gemini-2.5-flash-preview-tts' }, image: { engine: 'gpt-image', model: 'gpt-image-2', quality: 'low' } };
  const initial = settings.saveSettings(dir, models, { videoType: { id: 'drama' }, request: 'test choices' });
  const episode = path.join(dir, 'episode'); fs.mkdirSync(episode);
  settings.snapshotSettings(dir, episode);
  settings.saveSettings(dir, { image: { engine: 'zimage' } }, { expectedRevision: initial.revision, request: 'future episodes local' });
  assert.equal(readImageContext(episode, 's1').selection.engine, 'gpt-image');
  assert.equal(readImageContext(dir, 'logo').selection.engine, 'zimage');
  fs.mkdirSync(path.join(episode, 'storyboard'));
  fs.writeFileSync(path.join(episode, 'storyboard/scenes.js'), 'window.PRODUCTION = ' + JSON.stringify({ modelSettings: { overrides: [
    { scope: 'shot', shotId: 's1', request: 'shot uses host', image: { engine: 'host', host: 'codex', model: 'host-managed' } },
    { scope: 'episode', request: 'episode uses local', image: { engine: 'zimage' } },
  ] } }));
  assert.equal(readImageContext(episode, 's1').selection.engine, 'host');
  assert.equal(readImageContext(episode, 's2').selection.engine, 'zimage');
  assert.throws(() => settings.validateModels({ image: { engine: 'gpt-image', model: 'invented' } }, true), /Unsupported image model/);
  assert.throws(() => settings.validateModels({ image: { engine: 'gpt-image', model: 'gpt-image-2', quality: 'max' } }, true), /Invalid image quality/);
});
