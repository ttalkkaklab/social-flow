#!/usr/bin/env node
'use strict';
// Plan a real adapter request and optionally persist resolved effect ownership in the board.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createHash } = require('crypto');
async function prepare(board, shotId, tool, request, apply = false) {
  const runtime = await import(pathToFileURL(path.resolve(__dirname, '../../../server/dist/astra-shot-runtime.bundle.js')).href);
  const { file, win, header, sha256 } = runtime.readBoard(board);
  const scene = win.SCENES.find(shot => shot.id === shotId);
  if (!scene) throw new Error('Unknown shotId: ' + shotId);
  if (scene.visual?.reuse) throw new Error('Imported footage uses post effects; do not prepare new generation');
  const engine = scene.visual?.video?.engine;
  if (engine && !tool.startsWith(engine + '_')) throw new Error('Selected tool differs from the authored video engine');
  const sound = { ...scene.sound };
  // Exact authored dialogue stays on its existing speech lane unless the board explicitly
  // selects the mixed source soundtrack. Never replace pinned TTS as a side effect of auto SFX.
  // MSR is the exception: it speaks the dialogue in each speaker's sampled voice, so its own
  // speech-and-effects soundtrack is the cut's audio.
  const spoken = (scene.narration || []).filter(line => (line.tts || '').trim());
  if (sound.audioSource === undefined && spoken.length) sound.audioSource = tool === 'astra_genai_msr' ? 'video' : 'speech';
  const plan = runtime.prepareVideoSound(tool, request, sound);
  if (apply) {
    scene.sound = plan.sound;
    const before = fs.readFileSync(file);
    if (createHash('sha256').update(before).digest('hex') !== sha256) throw new Error('Board changed while preparing sound');
    const history = path.join(path.dirname(file), '.sound-history');
    fs.mkdirSync(history, { recursive: true });
    const backup = path.join(history, sha256 + '.js');
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, before, { flag: 'wx' });
    const temporary = file + '.sound-' + process.pid;
    try { fs.writeFileSync(temporary, runtime.serializeBoard(win, header), { flag: 'wx' }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  return { shotId, ...plan, quote: runtime.priceOf(tool, plan.arguments), applied: apply };
}
module.exports = { prepare };
if (require.main === module) (async () => {
  const [board, shotId, tool, requestFile, flag] = process.argv.slice(2);
  if (!requestFile || (flag && flag !== '--apply')) throw new Error('Usage: prepare-video-sound.js BOARD SHOT_ID TOOL REQUEST.json [--apply]');
  console.log(JSON.stringify(await prepare(board, shotId, tool, JSON.parse(fs.readFileSync(requestFile, 'utf8')), flag === '--apply'), null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
