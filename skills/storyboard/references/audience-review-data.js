'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { read } = require('./audience-effects.js');
const { previews } = require('./audience-preview.js');
const { previewStamp } = require('./audience-spotting.js');

function exportData(win, directory, check = false) {
  const board = win || {};
  const cues = read(board, directory);
  const { scenes, changed } = previews(board, directory, cues, check);
  const values = { AUDIENCE_PREVIEWS: scenes, AUDIENCE_CUES: cues, AUDIENCE_PREVIEW_STAMP: previewStamp(board) };
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
