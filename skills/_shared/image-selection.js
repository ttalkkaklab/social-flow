'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const settings = require('./model-settings.js');
const { evaluateWindowScript } = require('./scenes-vm.js');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function findImageWorkspace(directory) {
  let dir = directory;
  for (;;) {
    if (fs.existsSync(path.join(dir, settings.SETTINGS_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
/** Snapshot wins over workspace edits. Explicit scoped changes replace the complete choice. */
function readImageContext(directory, assetId) {
  const root = fs.realpathSync(directory);
  const snapshotFile = path.join(root, settings.SNAPSHOT_FILE);
  const workspace = findImageWorkspace(root);
  let selection, source, snapshotRevision;
  if (fs.existsSync(snapshotFile)) {
    const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    settings.validateConfig(snap.config, true);
    if (snap.version !== 1 || snap.revision !== hash(snap.config) || typeof snap.source !== 'string') throw new Error('Invalid image snapshot');
    selection = snap.config.models.image; source = 'snapshot'; snapshotRevision = snap.revision;
  } else if (workspace) {
    const config = settings.readSettings(workspace).config;
    if (!config) throw new Error('image_setup_required');
    selection = config.models.image; source = 'workspace';
  }
  const boardFile = path.join(root, 'storyboard/scenes.js');
  const board = fs.existsSync(boardFile) ? evaluateWindowScript(fs.readFileSync(boardFile, 'utf8'), { filename: boardFile }) : {};
  const production = board.PRODUCTION || {};
  if (!selection && production.modelSettings?.models?.image) {
    selection = production.modelSettings.models.image; source = 'board';
  }
  const overrides = production.modelSettings?.overrides || [];
  for (const change of overrides) {
    if (!change.image) continue;
    if (!['episode', 'shot'].includes(change.scope) || typeof change.request !== 'string' || !change.request.trim() || (change.scope === 'shot' && typeof change.shotId !== 'string')) throw new Error('image_override_invalid');
    settings.validateModels({ image: change.image }, true);
  }
  for (const scope of ['episode', 'shot']) {
    for (const change of overrides) {
      if (!change.image || change.scope !== scope || (scope === 'shot' && String(change.shotId) !== assetId)) continue;
      if (typeof change.request !== 'string' || !change.request.trim()) throw new Error('image_override_requires_request');
      selection = change.image; source = scope + '_override';
    }
  }
  if (!selection) throw new Error('image_setup_required: save image model settings or an explicit board choice');
  settings.validateModels({ image: selection }, true);
  const authFile = path.join(root, '.social-flow/image-authorization.json');
  const authorization = production.imageAuthorization ?? (fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : undefined);
  return { directory: root, assetId, selection, source, authorization,
    revision: hash({ selection, source, snapshotRevision, authorization, overrides }) };
}
module.exports = { readImageContext, findImageWorkspace };
