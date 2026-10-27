#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { checkStory, storyHash, storySpeech } = require('./story-contract.js');
try {
  const args = process.argv.slice(2), target = args.find(a => !a.startsWith('--'));
  if (!target) throw new Error('usage: check-story.js <storyboard dir|scenes.js> [--review|--hash|--text|--map] [--speech]');
  const file = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  const win = evaluateWindowScript(fs.readFileSync(file, 'utf8'), { filename: file });
  if (!Array.isArray(win.SCENES)) throw new Error('window.SCENES must be an array');
  if (args.includes('--hash')) process.stdout.write(storyHash(win) + '\n');
  else if (args.includes('--text') || args.includes('--map')) {
    // Reading evidence must not depend on editorial metadata or a previous review.
    const rows = win.STORY?.version === 'story-v2'
      ? require('./story-performance.js').storyPerformance(win).filter(x => !args.includes('--speech') || x.kind !== 'action').map((x, i) => ({ number: i + 1, ...x }))
      : storySpeech(win).map((x, i) => ({number: i + 1, shot: x.shot,
      group: x.group, quote: x.n.sub || x.n.tts}));
    process.stdout.write(args.includes('--map') ? JSON.stringify(rows, null, 2) + '\n'
      : rows.map(x => `${x.number}. ${x.kind ? '[' + x.kind + ' · ' + x.character + (x.to ? ' → ' + x.to : '') + '] ' : ''}${x.quote}`).join('\n') + '\n');
  } else {
    const findings = checkStory(win, { requireReview: args.includes('--review') });
    process.stdout.write(JSON.stringify({ violations: 0, errors: [], warnings: findings.length,
      findings, reviewRequested: args.includes('--review'),
      note: 'Editorial guidance only; this result does not certify story quality or production readiness.' }, null, 2) + '\n');
  }
} catch (e) { process.stderr.write(`check-story: ${e.message}\n`); process.exitCode = 3; }
