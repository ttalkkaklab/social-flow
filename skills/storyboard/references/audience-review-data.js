'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { read } = require('./audience-effects.js');
const { previews } = require('./audience-preview.js');
const { previewStamp } = require('./audience-spotting.js');

function scoreSources(board, directory) {
  const episode = path.dirname(path.resolve(directory)), parent = path.dirname(episode);
  const channel = path.basename(parent) === 'episodes' ? path.dirname(parent) : episode;
  const sources = Object.create(null);
  for (const [name, cue] of Object.entries(board.MUSIC || {})) {
    if (name.startsWith('$') || !cue || !/^[^/\\\x00-\x1f]+$/.test(name)) continue;
    const asset = typeof cue.asset === 'string' ? cue.asset.trim() : '';
    let file;
    if (/^audio\/[^/\\\x00-\x1f]+$/.test(asset)) {
      file = path.join(directory, asset);
    } else if (asset) {
      if (/[/\\\x00-\x1f]/.test(asset)) continue;
      const resolver = path.resolve(__dirname, '../../channel/references/resolve-asset.py');
      const found = spawnSync('python3', [resolver, channel, 'bgm', asset], {encoding:'utf8'});
      if (found.status === 0) file = found.stdout.trim();
    } else {
      file = path.join(episode, '.work', name === 'base' ? 'bgm.wav' : 'bgm-' + name + '.wav');
    }
    if (!file || !fs.existsSync(file)) continue;
    const real = fs.realpathSync(file);
    if (!real.startsWith(fs.realpathSync(channel) + path.sep) || !fs.statSync(real).isFile() ||
        !/\.(mp3|wav|m4a|mp4|ogg|opus|aac|flac|webm)$/i.test(real)) continue;
    sources[name] = { asset, href: path.relative(fs.realpathSync(directory), real).split(path.sep).map(encodeURIComponent).join('/') };
  }
  return sources;
}

function exportData(win, directory, check = false) {
  const board = win || {};
  const cues = read(board, directory);
  const { scenes, changed } = previews(board, directory, cues, check);
  const values = { AUDIENCE_PREVIEWS: scenes, AUDIENCE_CUES: cues, AUDIENCE_PREVIEW_STAMP: previewStamp(board),
    REVIEW_SCORE_SOURCES: scoreSources(board, directory) };
  const content = Object.entries(values).map(([name, value]) =>
    'window.' + name + ' = ' + JSON.stringify(value).replace(/</g, '\\u003c') + ';\n').join('');
  return { content, changed };
}

function refresh(directory) {
  const file = path.join(directory, 'audience-review-data.js');
  if (!fs.existsSync(file)) return;
  const source = path.join(directory, 'scenes.js');
  // Re-read after a concurrent board save or music completion changes the export.
  for (let attempt = 0; attempt < 2; attempt++) {
    const previous = fs.readFileSync(file, 'utf8');
    const snapshot = fs.readFileSync(source, 'utf8');
    const { content } = exportData(evaluateWindowScript(snapshot), directory);
    if (content === previous) return;
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, content, { flag: 'wx' });
      if (fs.readFileSync(source, 'utf8') !== snapshot || fs.readFileSync(file, 'utf8') !== previous) continue;
      fs.renameSync(temp, file);
      return;
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
}
module.exports = { exportData, refresh };
