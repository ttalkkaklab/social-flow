#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { checkStory, storyHash, storySpeech } = require('./story-contract.js');
try {
  const args = process.argv.slice(2), target = args.find(a => !a.startsWith('--'));
  if (!target) throw new Error('usage: check-story.js <storyboard dir|scenes.js> [--draft|--hash|--text|--map]');
  const file = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  const win = evaluateWindowScript(fs.readFileSync(file, 'utf8'), { filename: file });
  if (!Array.isArray(win.SCENES)) throw new Error('window.SCENES must be an array');
  if (args.includes('--hash')) process.stdout.write(storyHash(win) + '\n');
  else if (args.includes('--text') || args.includes('--map')) {
    const errors = checkStory(win, {requireReview: false});
    if (errors.length) throw new Error(errors.join('; '));
    const rows = storySpeech(win).map((x, i) => ({number: i + 1, shot: x.shot,
      group: x.group, quote: x.n.sub || x.n.tts}));
    process.stdout.write(args.includes('--map') ? JSON.stringify(rows, null, 2) + '\n'
      : rows.map(x => `${x.number}. ${x.quote}`).join('\n') + '\n');
  } else {
    const errors = checkStory(win, { requireReview: !args.includes('--draft') });
    process.stdout.write(JSON.stringify({ violations: errors.length, errors }, null, 2) + '\n');
    process.exitCode = errors.length ? 1 : 0;
  }
} catch (e) { process.stderr.write(`check-story: ${e.message}\n`); process.exitCode = 3; }
