#!/usr/bin/env node
/** Compile optional scenes.js sound-design fields into the manifests build-reel.sh reads.
 *
 * Usage: node compile-sound-plan.js <storyboard/scenes.js> <workdir> <channel-dir>
 *
 * The script is deliberately idle for legacy boards: without MUSIC.$mix, sound.effects or
 * sound.silence it writes nothing, so the existing hand-authored manifests and byte path stay
 * untouched. Asset paths are resolved here, never stored in scenes.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');

function die(message) { process.stderr.write(`compile-sound-plan: ${message}\n`); process.exit(1); }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function safeCell(value, where) {
  const text = String(value);
  if (!text || /[\t\r\n]/.test(text)) die(`${where} is empty or contains a tab/newline`);
  return text;
}
function writeRows(file, rows) {
  if (rows.length) fs.writeFileSync(file, rows.map((row) => row.join('\t')).join('\n') + '\n');
  else if (fs.existsSync(file)) fs.rmSync(file);
}

const [sourceArg, workArg, channelArg] = process.argv.slice(2);
if (!sourceArg || !workArg || !channelArg) die('usage: compile-sound-plan.js <storyboard/scenes.js> <workdir> <channel-dir>');
const source = path.resolve(sourceArg), work = path.resolve(workArg), channel = path.resolve(channelArg);
const win = evaluateWindowScript(fs.readFileSync(source, 'utf8'));
const scenes = Array.isArray(win.SCENES) ? win.SCENES : die(`${source} has no window.SCENES array`);
const music = record(win.MUSIC), sfxBook = record(win.SFX), mix = record(music.$mix);
const extended = Object.keys(mix).length > 0 || scenes.some((shot) => {
  const sound = record(shot && shot.sound);
  return Array.isArray(sound.effects) || Array.isArray(sound.silence);
});
if (!extended) {
  process.stdout.write(JSON.stringify({ changed: false, reason: 'no extended sound fields' }) + '\n');
  process.exit(0);
}
fs.mkdirSync(work, { recursive: true });

function catalog(kind, id) {
  const clean = safeCell(id, `${kind} asset id`);
  const file = path.join(channel, 'assets', 'audio', kind, `${clean}.wav`);
  if (!fs.existsSync(file)) die(`${kind} asset "${clean}" is missing at ${file}`);
  return file;
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
const writes = { bgm: false, effects: false, ambience: false, silence: false };
const intensitySeparation = { subtle: 10, normal: 6, strong: 3 };
scenes.forEach((shot, idx) => {
  const sound = record(shot && shot.sound);
  if (sound.cue) {
    writes.bgm = true;
    const cue = safeCell(sound.cue, `shot ${idx + 1} sound.cue`);
    if (!Object.prototype.hasOwnProperty.call(music, cue) || cue === '$mix') die(`shot ${idx + 1} names unknown music cue "${cue}"`);
    bgm.push([idx, cueFile(cue)]);
  }
  const narrationCount = Array.isArray(shot && shot.narration) ? shot.narration.length : 0;
  if (sound.drop === true) {
    writes.effects = true;
    const count = Math.max(1, narrationCount);
    for (let seg = 0; seg < count; seg++) effects.push([idx, seg, '', 'off', '', '']);
  }
  if (sound.sfx) { writes.effects = true; effects.push([idx, 0, sfxFile(String(sound.sfx)), 'on', '', '']); }
  if (Array.isArray(sound.effects)) { writes.effects = true; sound.effects.forEach((effect, ei) => {
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
    writes.ambience = true;
    const stop = sound.ambience === null || sound.ambience === '-' || sound.ambience === 'none';
    ambience.push([idx, stop ? '-' : sfxFile(String(sound.ambience))]);
  }
  if (Array.isArray(sound.silence)) { writes.silence = true; sound.silence.forEach((window, wi) => {
    const item = record(window), start = finite(item.startSeconds, NaN), end = finite(item.endSeconds, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start)
      die(`shot ${idx + 1} silence ${wi + 1} has an invalid start/end`);
    if (Number.isFinite(Number(shot.duration)) && end > Number(shot.duration))
      die(`shot ${idx + 1} silence ${wi + 1} is outside the ${shot.duration}s shot`);
    if ((item.scope || 'music') !== 'music') die(`shot ${idx + 1} silence ${wi + 1} has unsupported scope "${item.scope}"`);
    silence.push([idx, start, end, 'music']);
  }); }
});

if (writes.bgm) writeRows(path.join(work, 'bgm.tsv'), bgm);
if (writes.effects) writeRows(path.join(work, 'sfx.tsv'), effects);
if (writes.ambience) writeRows(path.join(work, 'amb.tsv'), ambience);
if (writes.silence) writeRows(path.join(work, 'silence.tsv'), silence);

const env = [];
const put = (name, value) => { if (value !== undefined) env.push(`: "\${${name}:=${Number(value)}}"`); };
put('FINAL_LUFS', mix.targetLufs); put('FINAL_TP', mix.truePeakDbtp);
put('BGM_SEP', mix.bedSeparationLu); put('BGM_SEP_MIN', mix.minimumSeparationLu);
put('BGM_CUE_XF', mix.cueCrossfadeSeconds); put('BGM_FADE_OUT', mix.endingFadeSeconds);
put('BGM_GATE_R', mix.silenceRampSeconds);
const hook = record(mix.hook), ducking = record(mix.ducking);
put('BGM_HOOK_LU', hook.attenuationLu); put('BGM_HOOK_R', hook.releaseSeconds);
put('DUCK_RATIO', ducking.ratio); put('DUCK_ATTACK', ducking.attackMs); put('DUCK_RELEASE', ducking.releaseMs);
fs.writeFileSync(path.join(work, 'sound.env'), env.join('\n') + (env.length ? '\n' : ''));

process.stdout.write(JSON.stringify({
  changed: true, bgm: bgm.length, effects: effects.filter((row) => row[2]).length,
  drops: effects.filter((row) => row[3] === 'off').length, ambience: ambience.length,
  silence: silence.length, env: env.length,
}) + '\n');
