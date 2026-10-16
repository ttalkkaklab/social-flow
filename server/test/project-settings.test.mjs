import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { manageProject } = require('../../skills/_shared/project-settings.js');
const modelSettings = require('../../skills/_shared/model-settings.js');
const hook = require.resolve('../../hooks/project-context.js');
const cli = require.resolve('../../skills/_shared/project-settings.js');
const defaults = () => ({
  project: { name: 'History', channel: 'history' }, videoType: { id: 'documentary' },
  models: { video: { engine: 'seedance', model: 'seedance-1-5-pro-251215', resolution: '720p' }, speech: { engine: 'supertonic' }, image: { engine: 'host', model: 'host-managed', host: 'codex' } },
  style: { preset: 'webtoon', palette: 'ochre and blue' },
  production: { mode: 'video_50', renderRatioVersion: 1, format: 'shorts-9x16', previzRenderer: 'blender', episodeBudgetUsd: 5 },
  sns: Object.fromEntries(['threads', 'instagram', 'facebook', 'youtube'].map(p => [p, { enabled: p === 'youtube', status: p === 'youtube' ? 'pending' : 'disabled' }])),
});
const profileMarkdown = '---\nname: History\nslug: history\n---\n# History\n\nAn existing authored channel profile.\n';
function workspace(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'social flow project ')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function init(root, settings = defaults()) {
  return manageProject({ action: 'init', workspace: root, settings, request: 'Use the selected history project defaults', profileMarkdown });
}
function call(root, action, extra = {}) { return manageProject({ workspace: root, action, ...extra }); }

test('initial setup records every preference and creates reusable directories without credentials', t => {
  const root = workspace(t);
  const initial = call(root, 'status');
  assert.equal(initial.status, 'project_setup_required');
  assert.deepEqual(fs.readdirSync(root), []);
  const state = init(root);
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.pendingConnections, ['youtube']);
  assert.equal(state.config.sns.youtube.credentialRef, '${SNS_TOKEN_DIR}/history/youtube-oauth-client.json');
  assert.equal(state.config.style.preset, 'webtoon');
  assert.equal(state.config.production.mode, 'video_50');
  assert.equal(fs.readFileSync(state.paths.profile, 'utf8'), profileMarkdown);
  assert.ok(fs.statSync(state.paths.episodes).isDirectory());
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\/\.social-flow\//);
  assert.equal(fs.existsSync(path.join(root, 'data/history/assets/branding')), false);
});

test('repeated init and interrupted directory repair preserve settings, assets, profile and custom ignores', t => {
  const root = workspace(t);
  fs.writeFileSync(path.join(root, '.gitignore'), 'custom-file');
  const first = init(root);
  const bytes = fs.readFileSync(first.file, 'utf8');
  fs.writeFileSync(path.join(root, 'data/history/assets/custom.txt'), 'keep');
  init(root);
  assert.equal(fs.readFileSync(first.file, 'utf8'), bytes);
  fs.rmSync(first.paths.catalog);
  const repaired = call(root, 'init');
  assert.equal(repaired.revision, first.revision);
  assert.ok(fs.existsSync(first.paths.catalog));
  assert.equal(fs.readFileSync(path.join(root, 'data/history/assets/custom.txt'), 'utf8'), 'keep');
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^custom-file\n/);
  assert.throws(() => init(root, { ...defaults(), style: { preset: 'photoreal' } }), /use update/);
  assert.throws(() => call(root, 'init', { profileMarkdown: 'different' }), /Existing channel profile differs/);
});

test('multiple episodes inherit full snapshots and later default edits affect only new episodes', t => {
  const root = workspace(t);
  const first = init(root);
  const a = call(root, 'episode', { topic: 'history-01' });
  const b = call(root, 'episode', { topic: 'history-02' });
  assert.deepEqual(a.snapshot.config, b.snapshot.config);
  assert.equal(a.handoff.PRODUCTION.style.selection.kind, 'standing');
  assert.equal(a.handoff.FORMAT, 'shorts-9x16');
  assert.equal(a.handoff.PRODUCTION.previz.renderer, 'blender');
  fs.writeFileSync(path.join(a.episode, 'storyboard/scenes.js'), 'approved board');
  call(root, 'update', { expectedRevision: first.revision, request: 'Change future artwork', settings: { style: { preset: 'photoreal' } } });
  const resumed = call(root, 'episode', { topic: 'history-01' });
  assert.equal(resumed.status, 'resumed');
  assert.equal(resumed.snapshot.config.style.preset, 'webtoon');
  assert.equal(fs.readFileSync(path.join(a.episode, 'storyboard/scenes.js'), 'utf8'), 'approved board');
  assert.equal(call(root, 'episode', { topic: 'history-03' }).snapshot.config.style.preset, 'photoreal');
  assert.throws(() => call(root, 'update', { expectedRevision: first.revision, request: 'Stale change', settings: { style: { preset: 'webtoon' } } }), /revision/);
});

test('model-only legacy config gains only missing fields and legacy boards are not relabelled', t => {
  const root = workspace(t);
  const d = defaults();
  modelSettings.saveSettings(root, d.models, { request: 'Original model choices', videoType: d.videoType });
  const { models, videoType, ...missing } = d;
  assert.ok(call(root, 'status').missing.includes('sns'));
  const ready = init(root, missing);
  assert.deepEqual(ready.config.models, models);
  const dir = path.join(root, 'data/history/episodes/old/storyboard');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenes.js'), 'legacy board');
  assert.equal(call(root, 'episode', { topic: 'old' }).status, 'legacy_episode');
  assert.equal(fs.existsSync(path.join(dir, '../.work')), false);
  const updated = modelSettings.saveSettings(root, { image: { engine: 'zimage' } }, { request: 'Change image engine', expectedRevision: ready.revision });
  assert.deepEqual(updated.config.sns, ready.config.sns);
  assert.deepEqual(updated.config.production, ready.config.production);
});

test('invalid choices and credential payloads fail without creating content or overwriting config', t => {
  const root = workspace(t);
  for (const mutate of [
    d => { d.models = null; },
    d => { d.style.preset = 'unknown'; },
    d => { d.production.mode = 'hybrid'; },
    d => { d.production.episodeBudgetUsd = -1; },
    d => { d.production.renderRatioVersion = 2; },
    d => { d.sns.youtube.token = 'secret'; },
    d => { d.sns.youtube.status = 'connected'; },
    d => { d.project.channel = '../outside'; },
    d => { d.sns.youtube.credentialRef = '/tmp/token'; },
  ]) {
    const d = defaults(); mutate(d);
    assert.throws(() => init(root, d));
    assert.equal(fs.existsSync(path.join(root, 'data')), false);
    assert.equal(fs.existsSync(path.join(root, '.social-flow/models.json')), false);
  }
  const first = init(root);
  const bytes = fs.readFileSync(first.file, 'utf8');
  assert.throws(() => call(root, 'update', { expectedRevision: first.revision, request: 'Unknown fields', settings: { access_token: 'secret' } }), /supported project fields/);
  assert.equal(fs.readFileSync(first.file, 'utf8'), bytes);
});

test('SNS connection updates preserve other platforms and episode history', t => {
  const root = workspace(t);
  const first = init(root);
  const episode = call(root, 'episode', { topic: 'before-login' });
  const sns = structuredClone(first.config.sns);
  Object.assign(sns.youtube, { status: 'connected', accountId: 'UCverified', handle: '@history', checkedAt: '2026-10-16T03:00:00Z' });
  const next = call(root, 'update', { expectedRevision: first.revision, request: 'Record the verified YouTube account', settings: { sns } });
  assert.deepEqual(next.pendingConnections, []);
  assert.equal(next.config.sns.threads.status, 'disabled');
  assert.equal(call(root, 'episode', { topic: 'before-login' }).snapshot.config.sns.youtube.status, 'pending');
  assert.equal(episode.handoff.sns.youtube.status, 'pending');
});

test('path traversal, linked destinations and concurrent locks do not write outside the project', t => {
  const root = workspace(t), outside = workspace(t);
  fs.symlinkSync(outside, path.join(root, 'data'), 'dir');
  assert.throws(() => init(root), /symbolic link/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(root, 'data'));
  init(root);
  assert.throws(() => call(root, 'episode', { topic: '../escape' }), /slug/);
  fs.symlinkSync(outside, path.join(root, 'data/history/episodes/linked'), 'dir');
  assert.throws(() => call(root, 'episode', { topic: 'linked' }), /symbolic link/);
  fs.mkdirSync(path.join(root, '.social-flow/project.lock'));
  assert.throws(() => call(root, 'init'), /EEXIST/);
  assert.ok(fs.existsSync(path.join(root, '.social-flow/project.lock')));
});

test('corrupt files fail explicitly and the read-only hook never echoes file contents', t => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, '.social-flow'));
  fs.writeFileSync(path.join(root, '.social-flow/models.json'), '{secret_token: DO_NOT_ECHO');
  assert.throws(() => call(root, 'status'), /invalid or unreadable/);
  const result = spawnSync(process.execPath, [hook], { input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: root }), encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /DO_NOT_ECHO/);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(fs.readFileSync(path.join(root, '.social-flow/models.json'), 'utf8'), '{secret_token: DO_NOT_ECHO');
});

test('CLI with spaces and SessionStart use the same state without side effects', t => {
  const root = workspace(t);
  const before = spawnSync(process.execPath, [hook], { input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: root }), encoding: 'utf8' });
  assert.match(before.stdout, /incomplete/);
  assert.deepEqual(fs.readdirSync(root), []);
  const created = spawnSync(process.execPath, [cli, 'init', root], { input: JSON.stringify({ settings: defaults(), request: 'Use selected defaults', profileMarkdown }), encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const saved = call(root, 'status');
  const bytes = fs.readFileSync(saved.file, 'utf8');
  const after = spawnSync(process.execPath, [hook], { input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: root }), encoding: 'utf8' });
  assert.match(after.stdout, /webtoon/);
  assert.equal(fs.readFileSync(saved.file, 'utf8'), bytes);
  assert.equal(fs.existsSync(path.join(root, '.social-flow/project.lock')), false);
});

test('options share the production catalog, and no choices are silently inferred', t => {
  const root = workspace(t);
  const choices = manageProject({ action: 'options' });
  assert.equal(choices.productionModes.length, 6);
  assert.equal(choices.styles.length, 8);
  assert.throws(() => call(root, 'init'), /Initial settings/);
  assert.equal(fs.existsSync(path.join(root, '.social-flow/models.json')), false);
});

test('MCP route exposes the same project operations and catches errors', async t => {
  const root = workspace(t);
  const { ROUTES } = await import('../dist/handlers.js');
  const result = await ROUTES.project_manage({ action: 'init', workspace: root, settings: defaults(), request: 'Use selected defaults', profileMarkdown });
  assert.equal(result.isError, false);
  assert.equal(JSON.parse(result.content[0].text).status, 'ready');
  const invalid = await ROUTES.project_manage({ action: 'episode', workspace: root, topic: '../bad' });
  assert.equal(invalid.isError, true);
});
