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
const { mixFindings, mixEnvironment, musicEnvelopeFindings, hasClipSound } = require('./sound-mix-contract.js');
const { timelineFindings, compileTimeline, spottingReport } = require('./music-timeline.js');
const audience = require('../../storyboard/references/audience-effects.js');
const { preparer } = require('./audience-derivation.js');
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
const mixErrors = mixFindings(music.$mix);
if (mixErrors.length) die(`window.MUSIC.$mix: ${mixErrors.join('; ')}`);
const timelineErrors = timelineFindings(music, scenes);
if (timelineErrors.length) die(timelineErrors.join('; '));
const hasTimeline = Object.prototype.hasOwnProperty.call(music, '$timeline');
fs.mkdirSync(work, { recursive: true });
const markerFile = path.join(work, 'sound-plan.json');
const ownedNames = new Set(['bgm.tsv', 'sfx.tsv', 'bgm-drops.tsv', 'amb.tsv', 'silence.tsv', 'music-gain.tsv', 'sound.env', 'music-timeline.json', 'sfx-spans.json']);
let previous = {};
if (fs.existsSync(markerFile)) {
  try { previous = record(JSON.parse(fs.readFileSync(markerFile, 'utf8')).files); }
  catch { die(`${markerFile} is not valid JSON`); }
}
for (const [idx, shot] of scenes.entries()) {
  const errors = musicEnvelopeFindings(shot?.sound?.musicGain, shot?.duration, shot?.type);
  if (errors.length) die(`shot ${idx + 1}: ${errors.join('; ')}`);
}
const removed = [], warnings = [], generated = {};
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function warn(message) { warnings.push(message); process.stderr.write(`compile-sound-plan: warning: ${message}\n`); }
// A board written with the story tools decides music per scene (story_music). Silence nobody
// decided is reported here; the build goes on.
if (win.STORY?.authoring === 'story-first') {
  const { undecided, mismatch } = spottingReport(win);
  if (undecided.length) warn(`${undecided.length} scene(s) have no music decision (scenes ${undecided.join(', ')}) — record score or none with story_music`);
  if (mismatch.length) warn(`the music timeline disagrees with the decision on scenes ${mismatch.join(', ')} — spot them again with story_music`);
}
// Report scene decisions before the early return for boards that have no sound files to mix.
audience.spottingDigest(win).forEach(warn);
// Files music_execute made for this episode, by content hash (.work/music-routing/state.json).
const receipts = new Set();
const musicOutputs = new Map();
try {
  const state = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(source)), '.work/music-routing/state.json'), 'utf8'));
  for (const job of Object.values(record(state.jobs))) {
    if (typeof record(job.output).sha256 !== 'string') continue;
    receipts.add(job.output.sha256);
    if (job.status === 'completed') musicOutputs.set(JSON.stringify([job.assetId, job.outputFile]), job.output.sha256);
  }
} catch { /* no music was generated for this episode */ }
const cueFiles = new Map();
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
      warn(`${name} changed after compile; keeping the human-edited file`);
    }
  }
}

const extended = hasTimeline || Object.keys(mix).length > 0 || scenes.some((shot) => {
  const sound = record(shot && shot.sound);
  return Array.isArray(sound.effects) || Array.isArray(sound.silence) || sound.musicGain !== undefined ||
    sound.sfx !== undefined || sound.ambience !== undefined || sound.drop === true;
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
  if (cueFiles.has(name)) return cueFiles.get(name);
  const cue = record(music[name]);
  if (typeof cue.asset === 'string' && cue.asset.trim()) return catalog('bgm', cue.asset.trim());
  const file = path.join(work, name === 'base' ? 'bgm.wav' : `bgm-${safeCell(name, 'music cue')}.wav`);
  if (!fs.existsSync(file)) die(`generated music cue "${name}" is missing at ${file}`);
  // A cue without `asset` is generated for this episode. A file with no receipt here was made for
  // another episode or cue, or copied in by hand: say so, and leave the choice to the author.
  if (!receipts.has(digest(fs.readFileSync(file))))
    warn(`music cue "${name}": ${file} has no generation receipt in this episode (.work/music-routing) — generate it with music_plan → music_execute, or name a channel asset; a file made for another episode is not this cue`);
  cueFiles.set(name, file);
  return file;
}

const timelinePlan = hasTimeline ? compileTimeline(music, scenes, cueFile) : null;
const bgm = [], drops = [], ambience = [], silence = [], musicGain = [];
const audienceSpans = [];
const audienceClock = audience.boardClock(win, path.dirname(source), channel);
const checkedAudienceMusic = new Set();
function audienceFile(source) {
  const derivation = source.derivation;
  if (derivation?.status === 'invalid') die(`audience_derivation_invalid: ${source.assetId}: ${derivation.reason}`);
  if (!source.available) {
    if (source.kind === 'catalog') die(source.lookupError || `cannot resolve audience SFX catalog asset "${source.assetId}"`);
    die(`missing audience music: ${source.path} — use the music_plan handoff in storyboard_read.audienceEffects, then place the cue against that WAV`);
  }
  if (source.kind === 'music' && !checkedAudienceMusic.has(source.path)) {
    if (derivation) {
      const replay = spawnSync('python3', [preparer, source.directory, '--verify-receipt', derivation.receiptPath], { encoding: 'utf8' });
      if (replay.status !== 0) die(`audience_derivation_invalid: ${source.assetId}: ${replay.stderr?.trim() || replay.error?.message || 'could not reproduce the derivative WAV'}`);
    } else {
      const key = JSON.stringify([source.assetId, fs.realpathSync(source.path)]);
      if (musicOutputs.get(key) !== source.sha256) warn(`audience cue "${source.assetId}": ${source.path} has no matching generation receipt in this episode (.work/music-routing)`);
    }
    checkedAudienceMusic.add(source.path);
  }
  return safeCell(source.path, 'audience effect path');
}
const shots = scenes.map((s, card) => ({ id: s.id, card }));
const intensitySeparation = { subtle: 10, normal: 6, strong: 3 };
let ignoredSceneEffects = 0;
let ambienceActive = false;
scenes.forEach((shot, idx) => {
  const sound = record(shot && shot.sound);
  if (sound.musicGain) musicGain.push([idx, JSON.stringify(sound.musicGain)]);
  if (sound.cue) {
    const cue = safeCell(sound.cue, `shot ${idx + 1} sound.cue`);
    if (!Object.prototype.hasOwnProperty.call(music, cue) || cue === '$mix') die(`shot ${idx + 1} names unknown music cue "${cue}"`);
    bgm.push([idx, cueFile(cue)]);
  }
  const narrationCount = Array.isArray(shot && shot.narration) ? shot.narration.length : 0;
  if (sound.drop === true) {
    const count = Math.max(1, narrationCount);
    for (let seg = 0; seg < count; seg++) drops.push([idx, seg]);
  }
  if (sound.sfx) ignoredSceneEffects++;
  if (Array.isArray(sound.effects)) { sound.effects.forEach((effect, ei) => {
    const item = record(effect);
    if (item !== effect) die(`shot ${shot.id || idx + 1} sound.effects[${ei}] must be an effect object`);
    if (item.audience) {
      audience.checkDelivery(shot.id, item);
      if (!item.id || !item.sfx || !item.trigger || !item.description || !item.audience.intent ||
          sound.effects.filter(e => e?.id === item.id).length !== 1 ||
          sound.effects.some(e => ['input','native'].includes(e?.delivery) && e.sfx === item.sfx))
        die(`audience_id_conflict: ${shot.id}/${item.id} needs a unique post event and asset owner`);
      if (item.atSeconds == null) die(`${shot.id}/${item.id}: planned effect needs observed atSeconds`);
      audienceClock.bounds(shot.id, item);
      const placed = audienceClock.row(shot.id, item);
      const file = audienceFile(placed.source);
      if (placed.status !== 'placed') die(`audience_timing_stale: ${shot.id}/${item.id}`);
      const separationLu = item.separationLu ?? intensitySeparation[item.intensity || 'normal'];
      if (!Number.isFinite(separationLu) || separationLu < 0 || separationLu > 30) die('invalid audience separationLu');
      audienceSpans.push({ shotId: shot.id, id: item.id, assetPath: file, sourceSha256: placed.source.sha256, separationLu,
        ...(placed.source.derivation ? { derivation: { ...placed.source.derivation, status: 'reproduced' } } : {}),
        ...(item.sourceStartSeconds == null ? {} : { sourceStartSeconds: item.sourceStartSeconds }),
        ...(item.fadeInSeconds == null ? {} : { fadeInSeconds: item.fadeInSeconds }),
        start: { shotId: shot.id, atSeconds: item.atSeconds }, end: item.end, fadeOutSeconds: item.fadeOutSeconds });
      return;
    }
    if (['native', 'input'].includes(item.delivery)) {
      if (sound.audioSource !== 'video') die(`shot ${idx + 1}: ${item.delivery} effects require audioSource=video`);
      return; // Already in the card soundtrack; never place the same effect twice.
    }
    ignoredSceneEffects++;
  }); }
  if (!['broll', 'outro'].includes(shot.type)) {
    if (hasClipSound(shot)) {
      if (ambienceActive || sound.ambience !== undefined) ambience.push([idx, '-']);
      ambienceActive = false;
    } else if (sound.ambience !== undefined) {
      const stop = sound.ambience === null || sound.ambience === '-' || sound.ambience === 'none';
      ambience.push([idx, stop ? '-' : sfxFile(String(sound.ambience))]);
      ambienceActive = !stop;
    }
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
if (ignoredSceneEffects) warn(`omitted ${ignoredSceneEffects} untagged scene effect(s); only audience cues play in post`);

if (audienceSpans.length) {
  const boundaries = scenes;
  // Natural tails may cross adjacent cards, but stop where a separately spliced insert begins.
  for (const span of audienceSpans) {
    const start = boundaries.findIndex(s => s.id === span.shotId);
    const boundary = boundaries.findIndex((s, i) => i > start && ['broll','outro'].includes(s.type));
    if (boundary > start) span.limit = { shotId: boundaries[boundary - 1].id, atSeconds: 'end' };
  }
  writeOwned('sfx-spans.json', JSON.stringify({ version: 1, shots, spans: audienceSpans }, null, 2) + '\n');
}
writeRows('bgm.tsv', bgm);
writeRows('bgm-drops.tsv', drops);
writeRows('amb.tsv', ambience);
writeRows('silence.tsv', silence);
writeRows('music-gain.tsv', musicGain);

const env = mixEnvironment(mix);
if (hasTimeline) writeOwned('music-timeline.json', JSON.stringify(timelinePlan, null, 2) + '\n');
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
  bgm: bgm.length, effects: audienceSpans.length,
  drops: drops.length, ambience: ambience.length,
  silence: silence.length, env: env.length, removed, warnings,
}) + '\n');
