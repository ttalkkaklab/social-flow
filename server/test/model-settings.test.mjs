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
const videoType = { id: 'drama' };
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
    input: JSON.stringify({ models, videoType, request: 'Use drama, Seedance 720p, Gemini Flash TTS and host images' }), encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  const read = spawnSync(process.execPath, [cli, 'show', root], { encoding: 'utf8' });
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout).config.models, models);
  assert.deepEqual(JSON.parse(read.stdout).config.videoType, videoType);
  const bytes = fs.readFileSync(settings.readSettings(root).file, 'utf8');
  assert.throws(() => settings.saveSettings(root, models, { request: 'Repeat setup' }), /already exist/);
  assert.equal(fs.readFileSync(settings.readSettings(root).file, 'utf8'), bytes);
});

test('later episodes inherit settings; explicit partial changes affect new episodes only', t => {
  const root = workspace(t);
  const first = settings.saveSettings(root, models, { videoType, request: 'Initial user choices' });
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
  settings.saveSettings(root, models, { videoType, request: 'Initial choices' });
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
  const current = settings.saveSettings(root, models, { videoType, request: 'Initial choices' });
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
  const current = settings.saveSettings(root, models, { videoType, request: 'Initial choices' });
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
  const current = settings.saveSettings(root, models, { videoType, request: 'Initial choices' });
  fs.mkdirSync(current.file + '.lock');
  assert.throws(() => settings.saveSettings(root, { image: { engine: 'zimage' } }, {
    request: 'Concurrent update', expectedRevision: current.revision,
  }), /EEXIST/);
  assert.equal(settings.readSettings(root).revision, current.revision);
  assert.equal(fs.existsSync(current.file + '.lock'), true);
});

test('video type selection is explicit, validates custom details, and changes only future episodes', t => {
  const root = workspace(t);
  assert.throws(() => settings.saveSettings(root, models, { request: 'Models only' }), /Select a video type/);
  for (const choice of [{ id: 'invented' }, { id: 'custom' }, { id: 'drama', apiKey: 'invalid' }]) {
    assert.throws(() => settings.saveSettings(root, models, { videoType: choice, request: 'Invalid type' }));
  }
  const first = settings.saveSettings(root, models, { videoType, request: 'Drama' });
  const original = episode(root, 'original');
  settings.snapshotSettings(root, original);
  const updated = settings.saveSettings(root, undefined, {
    videoType: { id: 'explainer' }, request: 'Make future episodes narrator-led explainers', expectedRevision: first.revision,
  });
  assert.deepEqual(updated.config.models, models);
  assert.deepEqual(settings.snapshotSettings(root, original).config.videoType, videoType);
  assert.equal(settings.snapshotSettings(root, episode(root, 'new')).config.videoType.id, 'explainer');
  const custom = settings.saveSettings(root, {}, {
    videoType: { id: 'custom', detail: 'Documentary with acted conversations' }, request: 'Use this hybrid', expectedRevision: updated.revision,
  });
  assert.equal(custom.config.videoType.detail, 'Documentary with acted conversations');
  const listed = spawnSync(process.execPath, [cli, 'types'], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const choices = JSON.parse(listed.stdout);
  assert.ok(choices.some(choice => choice.id === 'drama' && choice.speechGuidance === 'character_dialogue'));
  assert.ok(choices.some(choice => choice.id === 'explainer' && choice.speechGuidance === 'narrator_led'));
});

test('legacy settings request only the missing type and legacy episode snapshots remain resumable', t => {
  const root = workspace(t);
  const file = path.join(root, settings.SETTINGS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, models, request: 'Legacy model choices', updatedAt: '2026-10-15' }));
  const old = settings.readSettings(root);
  assert.equal(old.status, 'video_type_required');
  assert.throws(() => settings.saveSettings(root, models, { videoType, request: 'Do not overwrite' }), /already exist/);
  const existing = episode(root, 'legacy');
  const snapshotFile = path.join(existing, settings.SNAPSHOT_FILE);
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
  fs.writeFileSync(snapshotFile, JSON.stringify({ version: 1, source: file, revision: old.revision, config: old.config }));
  assert.equal(settings.snapshotSettings(root, existing).resumed, true);
  assert.throws(() => settings.snapshotSettings(root, episode(root, 'new')), /video_type_required/);
  const fixed = settings.saveSettings(root, undefined, { videoType, request: 'Choose drama', expectedRevision: old.revision });
  assert.equal(fixed.status, 'configured');
  assert.deepEqual(fixed.config.models, models);
  assert.equal(settings.snapshotSettings(root, existing).config.videoType, undefined);
});


test('speech settings allow Gemini and ElevenLabs v4 while local non-speech models remain available', () => {
  for (const speech of [{ engine: 'supertonic' }, { engine: 'mlx', model: 'local' }, { engine: 'elevenlabs', model: 'eleven_v3' }, { engine: 'elevenlabs', model: 'eleven_multilingual_v2' }]) assert.throws(() => settings.validateModels({ ...models, speech }));
  assert.doesNotThrow(() => settings.validateModels({ video: { engine: 'mlx', model: 'video-local' }, image: { engine: 'mlx', model: 'image-local' }, speech: { engine: 'elevenlabs', model: 'eleven_v4' } }));
});


test('retired saved speech choices require explicit migration and keep historical episode snapshots', t => {
  for (const speech of [{ engine: 'supertonic' }, { engine: 'mlx', model: 'old-local' }, { engine: 'elevenlabs', model: 'eleven_v3' }]) {
    const root = workspace(t), file = path.join(root, settings.SETTINGS_FILE);
    fs.mkdirSync(path.dirname(file));
    const config = { version: 1, models: { ...models, speech }, videoType, request: 'Previous selection', updatedAt: '2026-10-16' };
    fs.writeFileSync(file, JSON.stringify(config));
    const current = settings.readSettings(root);
    assert.equal(current.status, 'migration_required');
    assert.deepEqual(current.config.models.speech, speech);
    assert.throws(() => settings.snapshotSettings(root, episode(root, 'new')), /migration_required/);
    assert.throws(() => settings.saveSettings(root, { image: { engine: 'zimage' } }, { expectedRevision: current.revision, request: 'Only change images' }));
    const prior = episode(root, 'prior'), priorFile = path.join(prior, settings.SNAPSHOT_FILE);
    fs.mkdirSync(path.dirname(priorFile));
    fs.writeFileSync(priorFile, JSON.stringify({ version: 1, source: file, revision: current.revision, config }));
    const next = settings.saveSettings(root, { speech: { engine: 'elevenlabs', model: 'eleven_v4' } }, { expectedRevision: current.revision, request: 'Use ElevenLabs v4 from now on' });
    assert.equal(next.status, 'configured');
    assert.deepEqual(settings.snapshotSettings(root, prior).config.models.speech, speech);
    assert.equal(settings.snapshotSettings(root, episode(root, 'after')).config.models.speech.model, 'eleven_v4');
  }
});

test('GenAI is a separate model-selecting engine; legacy Astra remains fixed-model', () => {
  const video = { engine:'astra-genai', model:'ltx-2.5-22b-dev', resolution:'1280x704' };
  const image = { engine:'astra-genai', model:'z-image-turbo' };
  assert.doesNotThrow(()=>settings.validateModels({video,image,speech:models.speech}));
  assert.throws(()=>settings.validateModels({video:{engine:'astra-genai'}},true),/model is required/);
  assert.doesNotThrow(()=>settings.validateModels({video:{engine:'astra'}},true));
  assert.throws(()=>settings.validateModels({video:{engine:'astra',model:video.model}},true),/fixed server model/);
});
