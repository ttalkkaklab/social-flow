import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const settings = require('../../skills/_shared/model-settings.js');
const cli = require.resolve('../../skills/_shared/model-settings.js');
const models = {
  video: { engine: 'seedance', model: 'seedance-1-5-pro-251215', resolution: '720p' },
  speech: { engine: 'gemini', model: 'gemini-2.5-flash-preview-tts' },
  image: { engine: 'host', model: 'host-managed', host: 'codex' },
};

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'social-flow-models-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return fs.realpathSync(root);
}

function episode(root, name) {
  const dir = path.join(root, 'data', 'channel', 'episodes', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('first setup requires all three actual selections, persists across processes, and never reinitializes', t => {
  const root = workspace(t);
  assert.equal(settings.readSettings(root).status, 'setup_required');
  assert.equal(fs.existsSync(path.join(root, '.social-flow')), false);
  assert.throws(() => settings.saveSettings(root, { video: models.video }, { request: 'Use Seedance' }), /speech.engine/);
  assert.throws(() => settings.saveSettings(root, models), /actual user selection/);
  const init = spawnSync(process.execPath, [cli, 'init', root], {
    input: JSON.stringify({ models, request: 'Use Seedance 720p, Gemini Flash TTS and host images' }), encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  const read = spawnSync(process.execPath, [cli, 'show', root], { encoding: 'utf8' });
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout).config.models, models);
  const bytes = fs.readFileSync(settings.readSettings(root).file, 'utf8');
  assert.throws(() => settings.saveSettings(root, models, { request: 'Repeat setup' }), /already exist/);
  assert.equal(fs.readFileSync(settings.readSettings(root).file, 'utf8'), bytes);
});

test('later episodes inherit settings; explicit partial changes affect new episodes only', t => {
  const root = workspace(t);
  const first = settings.saveSettings(root, models, { request: 'Initial user choices' });
  const a = episode(root, 'first');
  const old = settings.snapshotSettings(root, a);
  assert.deepEqual(settings.snapshotSettings(root, episode(root, 'second')).config.models, models);
  const changed = settings.saveSettings(root, { image: { engine: 'zimage' } }, {
    request: 'Change the default image engine to local Z-Image', expectedRevision: first.revision,
  });
  assert.deepEqual(changed.config.models.image, { engine: 'zimage' });
  assert.deepEqual(changed.config.models.video, models.video);
  assert.deepEqual(changed.config.models.speech, models.speech);
  const resumed = settings.snapshotSettings(root, a);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.revision, old.revision);
  assert.deepEqual(resumed.config.models, models);
  assert.deepEqual(settings.snapshotSettings(root, episode(root, 'third')).config.models.image, { engine: 'zimage' });
  assert.throws(() => settings.saveSettings(root, { image: models.image }, {
    request: 'A stale update', expectedRevision: first.revision,
  }), /revision changed/);
});

test('separate workspaces never discover each other or a parent config', t => {
  const root = workspace(t);
  settings.saveSettings(root, models, { request: 'Initial choices' });
  const other = workspace(t);
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  assert.equal(settings.readSettings(other).status, 'setup_required');
  assert.equal(settings.readSettings(nested).status, 'setup_required');
  assert.throws(() => settings.snapshotSettings(other, episode(other, 'missing')), /Select video, speech and image/);
  assert.throws(() => settings.snapshotSettings(root, episode(other, 'outside')), /inside the selected workspace/);
  assert.throws(() => settings.snapshotSettings(root, root), /inside the selected workspace/);
});

test('broken settings are never treated as missing or replaced', t => {
  const root = workspace(t);
  const file = path.join(root, settings.SETTINGS_FILE);
  fs.mkdirSync(path.dirname(file));
  for (const bytes of ['{broken', 'null', '{"version":99}', '[]']) {
    fs.writeFileSync(file, bytes);
    assert.throws(() => settings.readSettings(root));
    assert.throws(() => settings.saveSettings(root, models, { request: 'Do not reset corrupted settings' }));
    assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});

test('invalid categories, credentials and incomplete engine changes do not enter the settings', t => {
  const root = workspace(t);
  const current = settings.saveSettings(root, models, { request: 'Initial choices' });
  for (const patch of [
    {}, { music: {} }, { image: { engine: 'unknown' } },
    { image: { engine: 'gpt-image' } },
    { image: { engine: 'host', model: 'host-managed' } },
    { image: { engine: 'gpt-image', model: 'gpt-image-2', host: 'codex' } },
    { speech: { engine: 'supertonic', model: 'invented' } },
    { video: { engine: 'seedance', model: 'id', apiKey: 'not-a-real-secret' } },
  ]) {
    assert.throws(() => settings.saveSettings(root, patch, { request: 'Invalid request', expectedRevision: current.revision }));
    assert.equal(settings.readSettings(root).revision, current.revision);
  }
});

test('resume uses its snapshot even if defaults disappear, and rejects snapshot corruption', t => {
  const root = workspace(t);
  const current = settings.saveSettings(root, models, { request: 'Initial choices' });
  const dir = episode(root, 'resume');
  const snapshot = settings.snapshotSettings(root, dir);
  fs.unlinkSync(current.file);
  assert.deepEqual(settings.snapshotSettings(root, dir).config.models, models);
  const edited = JSON.parse(fs.readFileSync(snapshot.file, 'utf8'));
  edited.config.models.image = { engine: 'zimage' };
  fs.writeFileSync(snapshot.file, JSON.stringify(edited));
  assert.throws(() => settings.snapshotSettings(root, dir), /inconsistent/);
});

test('an active settings writer prevents a second writer from overwriting preferences', t => {
  const root = workspace(t);
  const current = settings.saveSettings(root, models, { request: 'Initial choices' });
  fs.mkdirSync(current.file + '.lock');
  assert.throws(() => settings.saveSettings(root, { image: { engine: 'zimage' } }, {
    request: 'Concurrent update', expectedRevision: current.revision,
  }), /EEXIST/);
  assert.equal(settings.readSettings(root).revision, current.revision);
  assert.equal(fs.existsSync(current.file + '.lock'), true);
});
