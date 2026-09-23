#!/usr/bin/env node
/** Compile optional scenes.js sound-design fields into the manifests build-reel.sh reads.
 *
 * Usage: node compile-sound-plan.js <storyboard/scenes.js> <workdir> <channel-dir>
 *
 * Extended boards record compiler-owned outputs in sound-plan.json. A later build only removes
 * a stale output when its recorded hash still matches; a human edit is preserved with a warning.
 * Markerless legacy manifests remain untouched. Asset paths are resolved here, never stored in
 * scenes.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const assetResolver = path.resolve(__dirname, '../../channel/references/resolve-asset.py');

function die(message) { process.stderr.write(`compile-sound-plan: ${message}\n`); process.exit(1); }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function safeCell(value, where) {
  const text = String(value);
  if (!text || /[\t\r\n]/.test(text)) die(`${where} is empty or contains a tab/newline`);
  return text;
}
const [sourceArg, workArg, channelArg] = process.argv.slice(2);
if (!sourceArg || !workArg || !channelArg) die('usage: compile-sound-plan.js <storyboard/scenes.js> <workdir> <channel-dir>');
const source = path.resolve(sourceArg), work = path.resolve(workArg), channel = path.resolve(channelArg);
const sourceText = fs.readFileSync(source, 'utf8');
const win = evaluateWindowScript(sourceText);
const scenes = Array.isArray(win.SCENES) ? win.SCENES : die(`${source} has no window.SCENES array`);
const music = record(win.MUSIC), sfxBook = record(win.SFX), mix = record(music.$mix);
fs.mkdirSync(work, { recursive: true });
const markerFile = path.join(work, 'sound-plan.json');
const ownedNames = new Set(['bgm.tsv', 'sfx.tsv', 'amb.tsv', 'silence.tsv', 'sound.env']);
let previous = {};
if (fs.existsSync(markerFile)) {
  try { previous = record(JSON.parse(fs.readFileSync(markerFile, 'utf8')).files); }
  catch { die(`${markerFile} is not valid JSON`); }
}
const removed = [], warnings = [], generated = {};
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function writeOwned(name, content) {
  const file = path.join(work, name);
  fs.writeFileSync(file, content);
  generated[name] = digest(Buffer.from(content));
}
function writeRows(name, rows) {
  if (rows.length) writeOwned(name, rows.map((row) => row.join('\t')).join('\n') + '\n');
}
function cleanPrevious() {
  for (const [name, hash] of Object.entries(previous)) {
    if (!ownedNames.has(name) || Object.prototype.hasOwnProperty.call(generated, name)) continue;
    const file = path.join(work, name);
    if (!fs.existsSync(file)) continue;
    const current = digest(fs.readFileSync(file));
    if (current === hash) { fs.rmSync(file); removed.push(name); }
    else {
      const warning = `${name} changed after compile; keeping the human-edited file`;
      warnings.push(warning);
      process.stderr.write(`compile-sound-plan: warning: ${warning}\n`);
    }
  }
}

const extended = Object.keys(mix).length > 0 || scenes.some((shot) => {
  const sound = record(shot && shot.sound);
  return Array.isArray(sound.effects) || Array.isArray(sound.silence);
});
if (!extended) {
  cleanPrevious();
  if (fs.existsSync(markerFile)) fs.rmSync(markerFile);
  process.stdout.write(JSON.stringify({
    changed: removed.length > 0, reason: 'no extended sound fields', removed, warnings,
  }) + '\n');
  process.exit(0);
}

function catalog(kind, id) {
  const clean = safeCell(id, `${kind} asset id`);
  const result = spawnSync('python3', [assetResolver, channel, kind, clean], { encoding: 'utf8' });
  if (result.status !== 0) die((result.stderr || result.stdout || `cannot resolve ${kind} asset "${clean}"`).trim());
  return safeCell(result.stdout.trim(), `${kind} asset path`);
}
function sfxFile(id) {
  const entry = record(sfxBook[id]);
  return catalog('sfx', typeof entry.asset === 'string' && entry.asset.trim() ? entry.asset.trim() : id);
}
function cueFile(name) {
  const cue = record(music[name]);
  if (typeof cue.asset === 'string' && cue.asset.trim()) return catalog('bgm', cue.asset.trim());
  const file = path.join(work, name === 'base' ? 'bgm.wav' : `bgm-${safeCell(name, 'music cue')}.wav`);
  if (!fs.existsSync(file)) die(`generated music cue "${name}" is missing at ${file}`);
  return file;
}

const bgm = [], effects = [], ambience = [], silence = [];
const intensitySeparation = { subtle: 10, normal: 6, strong: 3 };
scenes.forEach((shot, idx) => {
  const sound = record(shot && shot.sound);
  if (sound.cue) {
    const cue = safeCell(sound.cue, `shot ${idx + 1} sound.cue`);
    if (!Object.prototype.hasOwnProperty.call(music, cue) || cue === '$mix') die(`shot ${idx + 1} names unknown music cue "${cue}"`);
    bgm.push([idx, cueFile(cue)]);
  }
  const narrationCount = Array.isArray(shot && shot.narration) ? shot.narration.length : 0;
  if (sound.drop === true) {
    const count = Math.max(1, narrationCount);
    for (let seg = 0; seg < count; seg++) effects.push([idx, seg, '', 'off', '', '']);
  }
  if (sound.sfx) effects.push([idx, 0, sfxFile(String(sound.sfx)), 'on', '', '']);
  if (Array.isArray(sound.effects)) { sound.effects.forEach((effect, ei) => {
    const item = record(effect), id = safeCell(item.sfx, `shot ${idx + 1} sound.effects[${ei}].sfx`);
    const offset = finite(item.atSeconds, 0);
    const separation = item.separationLu === undefined
      ? intensitySeparation[item.intensity || 'normal']
      : finite(item.separationLu, NaN);
    if (offset < 0) die(`shot ${idx + 1} effect ${ei + 1} has a negative atSeconds`);
    if (Number.isFinite(Number(shot.duration)) && offset >= Number(shot.duration))
      die(`shot ${idx + 1} effect ${ei + 1} is outside the ${shot.duration}s shot`);
    if (!Number.isFinite(separation) || separation < 0 || separation > 30) die(`shot ${idx + 1} effect ${ei + 1} has invalid separationLu`);
    effects.push([idx, 0, sfxFile(id), 'on', offset, separation]);
  }); }
  if (sound.ambience !== undefined) {
    const stop = sound.ambience === null || sound.ambience === '-' || sound.ambience === 'none';
    ambience.push([idx, stop ? '-' : sfxFile(String(sound.ambience))]);
  }
  if (Array.isArray(sound.silence)) { sound.silence.forEach((window, wi) => {
    const item = record(window), start = finite(item.startSeconds, NaN), end = finite(item.endSeconds, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start)
      die(`shot ${idx + 1} silence ${wi + 1} has an invalid start/end`);
    if (Number.isFinite(Number(shot.duration)) && end > Number(shot.duration))
      die(`shot ${idx + 1} silence ${wi + 1} is outside the ${shot.duration}s shot`);
    if ((item.scope || 'music') !== 'music') die(`shot ${idx + 1} silence ${wi + 1} has unsupported scope "${item.scope}"`);
    silence.push([idx, start, end, 'music']);
  }); }
});

writeRows('bgm.tsv', bgm);
writeRows('sfx.tsv', effects);
writeRows('amb.tsv', ambience);
writeRows('silence.tsv', silence);

const env = [];
const put = (name, value) => { if (value !== undefined) env.push(`: "\${${name}:=${Number(value)}}"`); };
put('FINAL_LUFS', mix.targetLufs); put('FINAL_TP', mix.truePeakDbtp);
put('BGM_SEP', mix.bedSeparationLu); put('BGM_SEP_MIN', mix.minimumSeparationLu);
put('BGM_CUE_XF', mix.cueCrossfadeSeconds); put('BGM_FADE_OUT', mix.endingFadeSeconds);
put('BGM_GATE_R', mix.silenceRampSeconds);
const hook = record(mix.hook), ducking = record(mix.ducking);
put('BGM_HOOK_LU', hook.attenuationLu); put('BGM_HOOK_R', hook.releaseSeconds);
put('DUCK_RATIO', ducking.ratio); put('DUCK_ATTACK', ducking.attackMs); put('DUCK_RELEASE', ducking.releaseMs);
if (env.length) writeOwned('sound.env', env.join('\n') + '\n');
cleanPrevious();
fs.writeFileSync(markerFile, JSON.stringify({
  version: 1,
  source: source,
  sourceSha256: digest(Buffer.from(sourceText)),
  files: generated,
}, null, 2) + '\n');

process.stdout.write(JSON.stringify({
  changed: true,
  bgm: bgm.length, effects: effects.filter((row) => row[2]).length,
  drops: effects.filter((row) => row[3] === 'off').length, ambience: ambience.length,
  silence: silence.length, env: env.length, removed, warnings,
}) + '\n');
