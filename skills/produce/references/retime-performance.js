#!/usr/bin/env node
'use strict';
// Explicitly replan a shot after speech replacement; never infer which actions to remove.
const fs = require('node:fs'), path = require('node:path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { duration } = require('./compose-speech.js');

const { retime } = require('../../_shared/performance-retiming.js');

function run(args) {
  const target = args.shift(), shotId = args.shift();
  if (!target || !shotId) throw new Error('Use BOARD SHOT [--speech-bound-actions] [--action INDEX SECONDS] [--apply]');
  const options = { actions: [] }; let apply = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--speech-bound-actions') options.speechBoundActions = true;
    else if (flag === '--action') {
      const index = Number(args.shift()), seconds = Number(args.shift());
      if (!Number.isInteger(index) || index < 0) throw new Error('Action index must be a nonnegative integer');
      options.actions.push([index, seconds]);
    } else if (flag === '--apply') apply = true;
    else throw new Error('Unknown argument: ' + flag);
  }
  const file = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  const source = fs.readFileSync(file, 'utf8');
  const win = evaluateWindowScript(source, { filename: file });
  const index = win.SCENES.findIndex(s => s.id === shotId);
  if (index < 0) throw new Error('Unknown shot: ' + shotId);
  const result = retime(win.SCENES[index], options, line => duration(path.resolve(path.dirname(file), line.audio.path)));
  if (apply) {
    win.SCENES[index] = result.scene;
    const output = Object.entries(win).map(([key, value]) => 'window.' + key + '=' + JSON.stringify(value, null, 2) + ';').join('\n') + '\n';
    if (fs.readFileSync(file, 'utf8') !== source) throw new Error('Board changed during retiming');
    fs.writeFileSync(file + '.retime.tmp', output);
    fs.renameSync(file + '.retime.tmp', file);
  }
  return { shotId, applied: apply, previousSeconds: result.previousSeconds,
    durationSeconds: result.plan.durationSeconds, performance: result.plan.performance,
    warnings: ['Recompose speech and refresh video requests and endpoint evidence after applying. Existing video reviews are not evidence for the revised timing.'] };
}
module.exports = { retime, run };
if (require.main === module) try { console.log(JSON.stringify(run(process.argv.slice(2)), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
