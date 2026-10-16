'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const models = require('./model-settings.js');
const config = require('./project-config.js');
const SETTINGS_KEYS = ['models', 'videoType', ...config.PROJECT_FIELDS];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// All paths we create are under the explicit workspace; no linked managed directories.
function managed(root, relative, type) {
  const parts = relative.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Managed path is a symbolic link: ${relative}`);
    const expected = i === parts.length - 1 ? type : 'directory';
    if (expected === 'directory' ? !stat.isDirectory() : !stat.isFile()) throw new Error(`Expected ${expected}: ${relative}`);
  }
  return current;
}

function read(root) {
  managed(root, '.social-flow/models.json', 'file');
  try { return models.readSettings(root); }
  catch { throw new Error('Project settings are invalid or unreadable; repair .social-flow/models.json explicitly, do not reset it'); }
}

function layout(root, channel) {
  if (!config.SLUG.test(channel || '')) throw new Error('Invalid channel slug');
  const base = `data/${channel}`;
  return {
    profile: managed(root, `${base}/profile.md`, 'file'),
    catalog: managed(root, `${base}/assets/catalog.md`, 'file'),
    episodes: managed(root, `${base}/episodes`, 'directory'),
  };
}

function status(root) {
  const saved = read(root);
  const missing = config.missingProjectFields(saved.config);
  if (saved.status === 'migration_required') missing.push('models.speech');
  const paths = saved.config?.project ? layout(root, saved.config.project.channel) : undefined;
  if (paths) for (const [key, file] of Object.entries(paths)) if (!fs.existsSync(file)) missing.push(key);
  return {
    ...saved, workspace: root, status: saved.status === 'migration_required' ? 'migration_required' : missing.length ? 'project_setup_required' : 'ready', missing,
    paths,
    pendingConnections: Object.entries(saved.config?.sns || {}).filter(([, a]) => a.enabled && a.status !== 'connected').map(([name]) => name),
    connectionNote: 'Saved connection status is historical. Recheck sns_account_check before publishing; setup does not authorize publication.',
  };
}

function validateInputSettings(input) {
  if (!object(input) || !Object.keys(input).length || Object.keys(input).some(key => !SETTINGS_KEYS.includes(key))) throw new Error('settings must contain supported project fields only; never pass credentials');
  if (Object.hasOwn(input, 'models') && !object(input.models)) throw new Error('models must be an object');
}

function candidate(current, input, request) {
  validateInputSettings(input);
  if (typeof request !== 'string' || !request.trim()) throw new Error('Record the actual user selection/change request');
  const next = { ...current, ...input, models: { ...current?.models, ...input.models }, version: 1, request, updatedAt: new Date().toISOString() };
  if (input.sns && next.project) {
    next.sns = Object.fromEntries(Object.entries(input.sns).map(([platform, account]) => {
      if (!object(account)) throw new Error('Invalid SNS account record');
      return [platform, { ...account, credentialRef: account.credentialRef ?? config.credentialRef(next.project.channel, platform) }];
    }));
  }
  models.validateConfig(next);
  const missing = config.missingProjectFields(next);
  if (missing.length) throw new Error(`Missing initial choices: ${missing.join(', ')}`);
  return next;
}

function writeNew(file, contents) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, contents, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

function ensureLayout(root, channel, profile) {
  const paths = layout(root, channel);
  const ignore = managed(root, '.gitignore', 'file');
  if (!fs.existsSync(paths.profile)) {
    if (typeof profile !== 'string' || !profile.trim()) throw new Error('Provide profileMarkdown authored from the channel profile template');
    const slug = /^slug:\s*["']?([a-z0-9-]+)["']?\s*$/m.exec(profile)?.[1];
    if (slug !== channel) throw new Error('profileMarkdown slug must match project.channel');
  } else if (profile !== undefined && fs.readFileSync(paths.profile, 'utf8') !== profile) {
    throw new Error('Existing channel profile differs; use channel update explicitly, never overwrite during project setup');
  }
  // Preflight every destination before the first write. Interrupted setup can safely resume.
  writeNew(paths.profile, profile);
  writeNew(paths.catalog, fs.readFileSync(path.join(__dirname, '../channel/references/assets-catalog-template.md'), 'utf8'));
  fs.mkdirSync(paths.episodes, { recursive: true });
  const original = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  const lines = original.split(/\r?\n/);
  const additions = ['/.social-flow/', '/data/'].filter(line => !lines.includes(line));
  if (additions.length) fs.appendFileSync(ignore, (original && !original.endsWith('\n') ? '\n' : '') + '\n# social-flow local settings and content\n' + additions.join('\n') + '\n');
}

function save(root, current, next, request) {
  return models.saveSettings(root, next.models, {
    request, ...(current.config ? { expectedRevision: current.revision } : {}), videoType: next.videoType,
    ...Object.fromEntries(config.PROJECT_FIELDS.map(key => [key, next[key]])),
  });
}

function handoff(snapshot) {
  const c = snapshot.config;
  const selection = { kind: 'standing', reference: snapshot.file };
  const production = {
    videoType: c.videoType,
    modelSettings: { source: snapshot.source, revision: snapshot.revision, models: c.models },
    ...(c.style ? { style: { ...c.style, selection } } : {}),
    ...(c.production ? { mode: c.production.mode, renderRatioVersion: c.production.renderRatioVersion, selection } : {}),
    ...(c.production?.previzRenderer ? { previz: { renderer: c.production.previzRenderer, selection } } : {}),
    projectSettings: { source: snapshot.source, revision: snapshot.revision, snapshot: snapshot.file },
  };
  return { FORMAT: c.production?.format, PRODUCTION: production, sns: c.sns,
    episodeBudgetUsd: c.production?.episodeBudgetUsd,
    note: 'Copy into a NEW board only, then translate models into adapter fields using model-settings.md. Preserve explicit episode overrides. A saved preference is not a cost quote or publication approval.' };
}

function createEpisode(root, topic) {
  if (!config.SLUG.test(topic || '')) throw new Error('Invalid episode topic slug');
  const saved = read(root);
  if (!saved.config?.project) throw new Error('project_setup_required: choose the project channel first');
  const base = `data/${saved.config.project.channel}/episodes/${topic}`;
  const dir = managed(root, base, 'directory');
  const snap = managed(root, `${base}/.work/model-settings.json`, 'file');
  const board = managed(root, `${base}/storyboard/scenes.js`, 'file');
  if (fs.existsSync(snap)) {
    const snapshot = models.snapshotSettings(root, dir);
    return { status: 'resumed', episode: dir, snapshot, handoff: handoff(snapshot) };
  }
  if (fs.existsSync(board)) return { status: 'legacy_episode', episode: dir, note: 'Resume the existing board and its explicit choices; no snapshot or files were rewritten.' };
  const state = status(root);
  if (state.status !== 'ready') throw new Error(`project_setup_required: ${state.missing.join(', ')}`);
  for (const sub of ['storyboard', '.work', 'output']) managed(root, `${base}/${sub}`, 'directory');
  for (const sub of ['storyboard', '.work', 'output']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const snapshot = models.snapshotSettings(root, dir);
  return { status: 'created', episode: dir, snapshot, handoff: handoff(snapshot) };
}

function manageProject(args) {
  if (!object(args) || Object.keys(args).some(key => !['action', 'workspace', 'settings', 'request', 'expectedRevision', 'profileMarkdown', 'topic'].includes(key))) throw new Error('Invalid project arguments');
  if (!['options', 'status', 'init', 'update', 'episode'].includes(args.action)) throw new Error('Unknown project action');
  if (args.action === 'options') return { videoTypes: models.VIDEO_TYPES, ...config.options() };
  if (typeof args.workspace !== 'string' || !path.isAbsolute(args.workspace)) throw new Error('workspace must be an explicit absolute project directory');
  if (!fs.existsSync(args.workspace)) throw new Error('Workspace does not exist; create the user-selected project directory first');
  const root = fs.realpathSync(args.workspace);
  if (!fs.statSync(root).isDirectory()) throw new Error('workspace must be a directory');
  if (args.action === 'status') return status(root);
  managed(root, '.social-flow', 'directory');
  read(root); // Never create a lock over a corrupt or linked settings file.
  fs.mkdirSync(path.join(root, '.social-flow'), { recursive: true });
  const lock = path.join(root, '.social-flow/project.lock');
  fs.mkdirSync(lock); // Atomic across MCP, CLI and overlapping sessions.
  try {
    if (args.action === 'episode') return createEpisode(root, args.topic);
    const current = read(root);
    if (args.action === 'update' && (!current.config || !args.expectedRevision || current.revision !== args.expectedRevision)) throw new Error('Settings revision changed or missing; read status again before update');
    if (!args.settings) {
      if (args.action !== 'init' || config.missingProjectFields(current.config).length) throw new Error('Initial settings are required');
      ensureLayout(root, current.config.project.channel, args.profileMarkdown);
      return status(root);
    }
    const next = candidate(current.config, args.settings, args.request);
    if (current.config?.project?.channel && next.project.channel !== current.config.project.channel) throw new Error('Changing project.channel would redirect existing content; use a separate workspace');
    if (args.action === 'init' && current.config) {
      for (const key of SETTINGS_KEYS) {
        if (current.config[key] !== undefined && !isDeepStrictEqual(current.config[key], next[key])) throw new Error(`Existing ${key} differs; use update with the current revision`);
      }
    }
    ensureLayout(root, next.project.channel, args.profileMarkdown);
    const unchanged = current.config && SETTINGS_KEYS.every(key => isDeepStrictEqual(current.config[key], next[key]));
    if (!unchanged) save(root, current, next, args.request);
    return status(root);
  } finally { fs.rmdirSync(lock); }
}

module.exports = { manageProject, handoff };
if (require.main === module) {
  try {
    const [action, workspace, argument] = process.argv.slice(2);
    const input = ['init', 'update'].includes(action) ? JSON.parse(fs.readFileSync(0, 'utf8') || '{}') : {};
    const result = manageProject({ ...input, action, workspace, ...(action === 'episode' ? { topic: argument } : {}) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error('project-settings: ' + error.message); process.exitCode = 1; }
}
