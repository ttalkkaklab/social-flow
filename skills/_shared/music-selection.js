'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const settings = require('./model-settings.js');
const { evaluateWindowScript } = require('./scenes-vm.js');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function findMusicWorkspace(directory) {
  let dir = directory;
  for (;;) {
    if (fs.existsSync(path.join(dir, settings.SETTINGS_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
/** Snapshot wins over workspace edits. Explicit scoped changes replace the complete choice. */
function readMusicContext(directory, assetId) {
  const root = fs.realpathSync(directory);
  const snapshotFile = path.join(root, settings.SNAPSHOT_FILE);
  const workspace = findMusicWorkspace(root);
  let selection, source, snapshotRevision;
  if (fs.existsSync(snapshotFile)) {
    const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    settings.validateConfig(snap.config, true);
    if (snap.version !== 1 || snap.revision !== hash(snap.config) || typeof snap.source !== 'string') throw new Error('Invalid music snapshot');
    selection = snap.config.models.music; source = 'snapshot'; snapshotRevision = snap.revision;
  } else if (workspace) {
    const config = settings.readSettings(workspace).config;
    if (!config) throw new Error('music_setup_required');
    selection = config.models.music; source = 'workspace';
  }
  const boardFile = path.join(root, 'storyboard/scenes.js');
  const board = fs.existsSync(boardFile) ? evaluateWindowScript(fs.readFileSync(boardFile, 'utf8'), { filename: boardFile }) : {};
  const production = board.PRODUCTION || {};
  if (!selection && production.modelSettings?.models?.music) {
    selection = production.modelSettings.models.music; source = 'board';
  }
  const overrides = production.modelSettings?.overrides || [];
  for (const change of overrides) {
    if (!change.music) continue;
    if (!['episode', 'shot'].includes(change.scope) || typeof change.request !== 'string' || !change.request.trim() || (change.scope === 'shot' && typeof change.shotId !== 'string')) throw new Error('music_override_invalid');
    settings.validateModels({ music: change.music }, true);
  }
  for (const scope of ['episode', 'shot']) {
    for (const change of overrides) {
      if (!change.music || change.scope !== scope || (scope === 'shot' && String(change.shotId) !== assetId)) continue;
      if (typeof change.request !== 'string' || !change.request.trim()) throw new Error('music_override_requires_request');
      selection = change.music; source = scope + '_override';
    }
  }
  if (!selection) throw new Error('music_setup_required: save music model settings or an explicit board choice');
  settings.validateModels({ music: selection }, true);
  const authFile = path.join(root, '.social-flow/music-authorization.json');
  const authorization = production.musicAuthorization ?? (fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : undefined);
  return { directory: root, assetId, selection, source, authorization,
    revision: hash({ selection, source, snapshotRevision, authorization, overrides }) };
}
module.exports = { readMusicContext, findMusicWorkspace };
