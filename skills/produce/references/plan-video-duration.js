#!/usr/bin/env node
'use strict';

// Read-only planning: no submission, upload, board mutation or spending.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { shotTiming } = require('../../_shared/video-duration.js');
const { preview } = require('./edit-plan.js');

async function plan(target, { shotId, tool, args = {}, audioPath, performanceSeconds } = {}) {
  const runtime = await import(pathToFileURL(path.resolve(__dirname, '../../../server/dist/astra-shot-runtime.bundle.js')).href);
  const { win } = runtime.readBoard(target);
  const index = win.SCENES.findIndex(scene => scene.id === shotId);
  const scene = win.SCENES[index];
  if (!scene) throw new Error('Select an existing stable shotId');
  if (scene.visual?.reuse || scene.type === 'outro') throw new Error('Existing footage does not need new generation');
  let audioSeconds;
  if (audioPath) {
    audioSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.resolve(audioPath)], { encoding: 'utf8', timeout: 15000 }).trim());
    if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) throw new Error('Audio must have a measurable positive duration');
  }
  const edit = preview(win.SCENES, { videoWarningsApproved: true }).find(row => row.card === index) || scene.edit || {};
  const coverage = shotTiming(scene, { audioSeconds, performanceSeconds, edit });
  const resolved = runtime.resolveVideoDuration(tool, { ...args, requiredSeconds: coverage.requiredSeconds });
  return { shotId, tool, coverage, timing: resolved.timing, quote: runtime.priceOf(tool, resolved.args), arguments: resolved.args,
    warnings: audioPath ? [] : ['Audio has not been measured. Replan with the composed audio before submission.'],
    instructions: 'Refresh the previz and cost quote with requestedSeconds, retain the selected model/resolution, then submit these arguments with the authored media and prompt. Probe the generated file before accepting it.' };
}
module.exports = { plan };
if (require.main === module) {
  const [target, shotId, tool, json = '{}', audioPath] = process.argv.slice(2);
  plan(target, { shotId, tool, args: JSON.parse(json), audioPath }).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
