#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { checkStory, storyHash, storySpeech } = require('./story-contract.js');
try {
  const args = process.argv.slice(2), target = args.find(a => !a.startsWith('--'));
  if (!target) throw new Error('usage: check-story.js <storyboard dir|scenes.js> [--review|--hash|--text|--map] [--speech] [--through=N]');
  const file = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  const win = evaluateWindowScript(fs.readFileSync(file, 'utf8'), { filename: file });
  if (!Array.isArray(win.SCENES)) throw new Error('window.SCENES must be an array');
  if (args.includes('--hash')) process.stdout.write(storyHash(win) + '\n');
  else if (args.includes('--text') || args.includes('--map')) {
    // Reading evidence must not depend on editorial metadata or a previous review.
    const mapping = args.includes('--map');
    const through = args.find(a => a.startsWith('--through='));
    if (through && (mapping || !/^--through=[1-9]\d*$/.test(through))) throw new Error('--through=N takes a positive audience event number with --text');
    let rows = win.STORY?.version === 'story-v2'
      ? require('./story-performance.js').storyPerformance(win, { audienceOnly: !mapping }).map((x, i) => ({ number: i + 1, ...x }))
      : storySpeech(win).map((x, i) => ({number: i + 1, shot: x.shot,
      group: x.group, quote: mapping ? x.n.sub || x.n.tts : x.n.tts || ''}));
    const unresolved = rows.filter(row => row.unresolvedTiming);
    if (through) {
      let end = Math.min(rows.length, Number(through.slice('--through='.length)));
      const { sameMoment } = require('./story-performance.js');
      while (rows[end]?.together && sameMoment(rows[end - 1], rows[end])) end++;
      rows = rows.slice(0, end);
    }
    if (!mapping && unresolved.some(uncertain => rows.some(row => row.shot === uncertain.shot)))
      throw new Error('Cannot place every cue in the requested shot. Repair its withGroup link before reading this prefix.');
    if (!mapping && rows.some(row => row.unresolvedVisual))
      throw new Error('The requested prefix has a spoken line with an unrepresented visual cue. Add its audience-safe action before the blind read.');
    if (args.includes('--speech')) rows = rows.filter(x => x.kind !== 'action');
    process.stdout.write(mapping ? JSON.stringify(rows, null, 2) + '\n'
      : rows.map(x => `${x.number}. ${x.kind ? '[shot-' + x.shot + '/e' + x.event + ' · ' + x.kind + (x.character ? ' · ' + x.character : '') + (x.to ? ' → ' + x.to : '') + (x.delivery ? ' · ' + x.delivery : '') + (x.together ? ' · simultaneous e' + x.together : '') + '] ' : ''}${x.quote}`).join('\n') + '\n');
  } else {
    const findings = checkStory(win, { requireReview: args.includes('--review') });
    process.stdout.write(JSON.stringify({ violations: 0, errors: [], warnings: findings.length,
      findings, reviewRequested: args.includes('--review'),
      note: 'Editorial guidance only; this result does not certify story quality or production readiness.' }, null, 2) + '\n');
  }
} catch (e) { process.stderr.write(`check-story: ${e.message}\n`); process.exitCode = 3; }
