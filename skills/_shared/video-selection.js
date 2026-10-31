'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const settings = require('./model-settings.js');
const { evaluateWindowScript } = require('./scenes-vm.js');
const { videoLines } = require('../storyboard/references/structure-contract.js');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function readVideoContext(episode, shotId) {
  const root = fs.realpathSync(episode);
  const boardFile = path.join(root, 'storyboard/scenes.js');
  const board = fs.existsSync(boardFile) ? evaluateWindowScript(fs.readFileSync(boardFile, 'utf8'), { filename: boardFile }) : {};
  const production = board.PRODUCTION || {};
  const snapshotFile = path.join(root, settings.SNAPSHOT_FILE);
  let snapshot;
  if (fs.existsSync(snapshotFile)) {
    snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    settings.validateConfig(snapshot.config, true);
    if (snapshot.version !== 1 || snapshot.revision !== hash(snapshot.config) || typeof snapshot.source !== 'string')
      throw new Error('Invalid episode model snapshot');
  }
  const scenes = board.SCENES || [];
  const matches = scenes.filter(s => String(s.id ?? s.shot?.id) === shotId);
  if (matches.length !== 1) throw new Error('shotId must identify exactly one storyboard shot');
  const shot = matches[0];
  const { resolveVideoChoice } = require('../storyboard/references/production-mode.js');
  const { selection, source } = resolveVideoChoice(production, shot, snapshot?.config.models.video);
  const overrides = production.modelSettings?.overrides || [];
  // A retired engine loads here so video_plan can refuse it as video_engine_unsupported.
  for (const change of overrides) if (change.video) settings.validateModels({ video: change.video }, true, true);
  if (snapshot || source.endsWith('_override')) settings.validateModels({ video: selection }, true, true);
  return { episode: root, shotId, selection, source, snapshotRevision: snapshot?.revision || null,
    revision: hash({ selection, source, snapshotRevision: snapshot?.revision, overrides, imagePlan: { frames: shot.visual?.frames, references: shot.visual?.references, bg: shot.visual?.bg }, shotPrompt: shot.visual?.video?.prompt, shotLines: videoLines(shot), authorization: production.videoAuthorization,
      budget: production.videoBudgetUsd, approval: production.approval, maxAttempts: production.maxAttempts }),
    lines: videoLines(shot), production, board, shot };
}
module.exports = { readVideoContext };
