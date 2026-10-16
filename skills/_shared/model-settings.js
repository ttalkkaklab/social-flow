'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SETTINGS_FILE = '.social-flow/models.json';
const SNAPSHOT_FILE = '.work/model-settings.json';
const VIDEO_TYPES = require('./video-types.json').types;
const ENGINES = {
  video: ['host', 'seedance', 'veo', 'astra', 'mlx'],
  speech: ['gemini', 'elevenlabs', 'supertonic', 'mlx'],
  image: ['host', 'gpt-image', 'zimage', 'mlx'],
};
const FIELDS = {
  video: ['engine', 'model', 'resolution', 'host'],
  speech: ['engine', 'model'],
  image: ['engine', 'model', 'quality', 'host'],
};

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateVideoType(choice) {
  if (!object(choice) || !VIDEO_TYPES.some(type => type.id === choice.id)) {
    throw new Error('videoType.id must name a video type from model-settings.js types');
  }
  for (const [key, value] of Object.entries(choice)) {
    if (!['id', 'detail'].includes(key) || !nonempty(value) || value.length > 1000) throw new Error(`Invalid videoType.${key}`);
  }
  if (choice.id === 'custom' && !nonempty(choice.detail)) throw new Error('Custom videoType requires detail describing the type and speech approach');
  return choice;
}

// Model IDs and adapter-specific dimensions are checked by the actual generation tool.
// Fixed-model tools omit model; host tools use "host-managed" if they expose no selector.
function validateModels(models, partial = false) {
  if (!object(models)) throw new Error('models must be an object');
  for (const key of Object.keys(models)) {
    if (!Object.hasOwn(ENGINES, key)) throw new Error(`Unknown model category: ${key}`);
  }
  if (partial && !Object.keys(models).length) throw new Error('Model update is empty');
  for (const [kind, engines] of Object.entries(ENGINES)) {
    if (partial && !Object.hasOwn(models, kind)) continue;
    const choice = models[kind];
    if (!object(choice) || !engines.includes(choice.engine)) throw new Error(`${kind}.engine must be one of ${engines.join(', ')}`);
    for (const [key, value] of Object.entries(choice)) {
      if (!FIELDS[kind].includes(key) || !nonempty(value)) throw new Error(`Invalid ${kind}.${key}`);
    }
    const fixed = ['supertonic', 'zimage', 'astra'].includes(choice.engine);
    if (choice.engine === 'host' && !nonempty(choice.host)) throw new Error(`${kind}.host must identify the selected CLI, such as codex or grok`);
    if (choice.engine !== 'host' && choice.host !== undefined) throw new Error(`${kind}.host is only valid for a host engine`);
    if (!fixed && !nonempty(choice.model)) throw new Error(`${kind}.model is required`);
    if (fixed && choice.model !== undefined) throw new Error(`${kind}.${choice.engine} uses a fixed server model; omit model`);
  }
  return models;
}

function revision(config) {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

function validateConfig(config) {
  if (!object(config) || config.version !== 1 || !nonempty(config.request) || !nonempty(config.updatedAt)) {
    throw new Error('Invalid model settings version or selection record; repair explicitly, do not reset');
  }
  validateModels(config.models);
  if (config.videoType !== undefined) validateVideoType(config.videoType);
  return config;
}

function settingsPath(workspace) {
  return path.join(fs.realpathSync(workspace), SETTINGS_FILE);
}

function readSettings(workspace) {
  const file = settingsPath(workspace);
  const config = readJson(file);
  if (config === undefined) return { status: 'setup_required', file };
  validateConfig(config);
  return { status: config.videoType ? 'configured' : 'video_type_required', file, revision: revision(config), config };
}

function writeJson(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const contents = JSON.stringify(value, null, 2) + '\n';
  if (exclusive) {
    fs.writeFileSync(file, contents, { flag: 'wx', mode: 0o600 });
    return;
  }
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, contents, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function saveSettings(workspace, models, { request, expectedRevision, videoType } = {}) {
  if (!nonempty(request)) throw new Error('Record the actual user selection/change request');
  const file = settingsPath(workspace);
  // Serialize updates so two sessions cannot both overwrite the same revision.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  fs.mkdirSync(lock);
  try {
    const current = readSettings(workspace);
    if (expectedRevision === undefined && current.config) throw new Error('Settings already exist; use update with the current revision and explicit user request');
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error('Settings revision changed or settings are missing; read again');
    const typeOnly = expectedRevision !== undefined && videoType !== undefined &&
      (models === undefined || (object(models) && !Object.keys(models).length));
    if (!typeOnly) validateModels(models, expectedRevision !== undefined);
    if (videoType !== undefined) validateVideoType(videoType);
    if (!current.config && videoType === undefined) throw new Error('Select a video type before saving initial settings');
    const config = {
      version: 1,
      models: { ...current.config?.models, ...models },
      ...(videoType || current.config?.videoType ? { videoType: videoType || current.config.videoType } : {}),
      updatedAt: new Date().toISOString(),
      request: request.trim(),
    };
    validateConfig(config);
    writeJson(file, config);
    return readSettings(workspace);
  } finally {
    fs.rmdirSync(lock);
  }
}

function snapshotSettings(workspace, episode) {
  const root = fs.realpathSync(workspace);
  const episodeRoot = fs.realpathSync(episode);
  const relative = path.relative(root, episodeRoot);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Episode directory must be inside the selected workspace');
  }
  const file = path.join(episodeRoot, SNAPSHOT_FILE);
  const existing = readJson(file);
  if (existing !== undefined) {
    if (!object(existing) || existing.version !== 1 || !nonempty(existing.source)) throw new Error('Invalid episode model snapshot');
    validateConfig(existing.config);
    if (existing.revision !== revision(existing.config)) throw new Error('Episode model snapshot is inconsistent; repair explicitly');
    return { ...existing, file, resumed: true };
  }
  const current = readSettings(root);
  if (current.status === 'video_type_required') throw new Error('video_type_required: select a video type before starting a new episode; keep saved models');
  if (current.status !== 'configured') throw new Error('Select video, speech and image models and a video type before creating an episode snapshot');
  const snapshot = { version: 1, source: current.file, revision: current.revision, config: current.config };
  writeJson(file, snapshot, true);
  return { ...snapshot, file, resumed: false };
}

module.exports = { SETTINGS_FILE, SNAPSHOT_FILE, VIDEO_TYPES, validateVideoType, validateModels, readSettings, saveSettings, snapshotSettings };

if (require.main === module) {
  try {
    const [command, workspace, argument] = process.argv.slice(2);
    if (command === 'types') {
      console.log(JSON.stringify(VIDEO_TYPES, null, 2));
      process.exit(0);
    }
    if (!workspace || !['show', 'init', 'update', 'snapshot'].includes(command)) {
      throw new Error('Usage: model-settings.js types | show|init|update|snapshot WORKSPACE [REVISION|EPISODE]; init/update read {models,videoType,request} JSON from stdin');
    }
    let result;
    if (command === 'show') result = readSettings(workspace);
    else if (command === 'snapshot') {
      if (!argument) throw new Error('snapshot requires the episode directory');
      result = snapshotSettings(workspace, argument);
    } else {
      if (command === 'update' && !argument) throw new Error('update requires the revision returned by show');
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      result = saveSettings(workspace, input.models, { request: input.request, videoType: input.videoType, expectedRevision: command === 'update' ? argument : undefined });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('model-settings: ' + error.message);
    process.exitCode = 1;
  }
}
