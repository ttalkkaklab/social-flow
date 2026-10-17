#!/usr/bin/env node
'use strict';

// Prepare real adapter arguments without generating, uploading or approving media.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const continuity = require('../../storyboard/references/shot-continuity.js');
const caps = { provider: 'astra', model: 'astra', audioConditioning: true,
  lipSync: true, postLipSync: false,
  evidence: 'ASTRA audio2video accepts supplied stereo audio and one opening image; img2video accepts first/last images. This declares input support, not output quality.' };

function localImage(dir, value) {
  if (typeof value !== 'string' || !value.trim() || /^[a-z][a-z0-9+.-]*:/i.test(value))
    throw new Error('Supply a local authored opening image; no image is selected automatically');
  const file = path.resolve(dir, value);
  if (!fs.statSync(file).isFile() || !fs.statSync(file).size) throw new Error('Image must be a nonempty local file');
  return file;
}

function probeAudio(file) {
  const result = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=channels:format=duration', '-of', 'json', file],
  { encoding: 'utf8', timeout: 15000 }));
  const seconds = Number(result.format?.duration);
  if (result.streams?.[0]?.channels !== 2 || !Number.isFinite(seconds) || seconds <= 0)
    throw new Error('audio2video needs measurable stereo audio; compose the complete shot before preparing it');
  return seconds;
}

function motionPrompt(scene, plan) {
  const design = scene.shot?.videoDesign || {}, camera = scene.visual?.camera || {};
  const speech = plan.performance.filter(event => event.kind !== 'action');
  const redact = value => {
    let text = String(value || '').trim();
    for (const event of speech) if (event.text) text = text.split(event.text).join('the supplied speech');
    return text;
  };
  const at = seconds => Number(seconds.toFixed(3));
  const span = (start, end) => Number.isFinite(start) && Number.isFinite(end)
    ? ` From ${at(start)} to ${at(end)} seconds,` : '';
  const instructions = [
    'Keep the exact people, location and visual style of the supplied opening image.',
    redact(design.before),
    redact(camera.framing),
    require('../../storyboard/references/production-mode.js').moveOf(camera)?.family === 'static'
      ? 'The camera stays fixed with identical framing, angle, focal length and background scale. ' + redact(camera.end)
      : redact([camera.movement, camera.speed, camera.end].filter(Boolean).join('. ')),
  ];
  if (plan.mode === 'audio_conditioned') instructions.push('Match visible lip movements to the supplied audio. Only the designated person speaks.');
  const authoredAction = design.action || scene.visual?.action;
  if (authoredAction && !plan.performance.some(event => event.kind === 'action' && (event.videoDirection || event.text) === authoredAction))
    instructions.push(redact(authoredAction));
  for (const event of plan.performance) {
    if (event.kind === 'action') instructions.push(span(event.startSeconds, event.endSeconds) + ' ' + redact(event.videoDirection || event.text));
    else {
      const delivery = event.delivery === 'on_screen'
        ? `${redact(event.speaker)} speaks naturally${event.to ? ' to ' + redact(event.to) : ''}.`
        : 'The voice is outside this view; all visible mouths stay closed.';
      instructions.push(span(event.speechStartSeconds, event.speechEndSeconds) + ' ' + delivery);
      instructions.push(...['direction', 'context', 'intent', 'emotion', 'vocal', 'visual']
        .filter(key => event.acting?.[key]).map(key => redact(event.acting[key])));
      if (event.videoDirection) instructions.push(redact(event.videoDirection));
      if (event.acting?.tags?.length) instructions.push(redact(event.acting.tags.join(', ')));
    }
  }
  const seen = new Set([design.before, design.after]);
  for (const beat of design.motion?.beats || []) if (beat.state && !seen.has(beat.state)) {
    instructions.push((Number.isFinite(beat.at) ? `At ${at(beat.at)} seconds, ` : '') + redact(beat.state));
    seen.add(beat.state);
  }
  if (design.after) instructions.push('The shot finishes with this state: ' + redact(design.after));
  if (design.continuity) instructions.push(redact(design.continuity));
  instructions.push('All surfaces stay unlettered and unobstructed, exactly as in the supplied image.');
  return instructions.filter(Boolean).map(text => text.trim()).join(' ');
}

async function prepare(target, options) {
  const dist = path.resolve(__dirname, '../../../server/dist');
  const adapter = await import(pathToFileURL(path.join(dist, 'astra-shot-runtime.bundle.js')).href);
  const { readBoard, manageSpeech } = adapter;
  const { file, win } = readBoard(target), dir = path.dirname(file);
  const scene = win.SCENES.find(shot => shot.id === options.shotId);
  if (!scene) throw new Error('Select an existing stable shotId');
  if (scene.visual?.reuse || scene.visual?.video?.engine !== 'astra')
    throw new Error('Prepare only a generated shot already assigned to ASTRA; do not switch or regenerate imported footage');
  const response = manageSpeech({ path: file, action: 'plan_video', shotId: scene.id, capabilities: caps });
  const plan = response.plan;
  const video = scene.visual.video;
  const imagePath = localImage(dir, scene.visual.bg);
  const [width, height] = String(video.resolution || '').split('x').map(Number);
  const frameRate = video.frameRate ?? 24;
  const seconds = Number(scene.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Plan a finite positive shot duration');
  const numFrames = video.numFrames ?? 8 * Math.ceil((seconds * frameRate - 1) / 8) + 1;
  const common = { prompt: motionPrompt(scene, plan), width, height, frameRate, numFrames,
    ...(video.seed !== undefined ? { seed: video.seed } : {}),
    ...(options.outputPath ? { outputPath: path.resolve(options.outputPath) } : {}),
    ...(options.filename ? { filename: options.filename } : {}) };
  const warnings = [...plan.warnings];
  const onScreen = plan.mode === 'audio_conditioned';
  let tool, args, audioSeconds;
  if (onScreen) {
    if (!options.audioPath) throw new Error('Supply the composed shot audioPath for on-screen speech');
    if (response.lines.some(line => !line.audioCurrent)) throw new Error('Attach current speech for every line before preparing audio2video');
    const audioPath = path.resolve(options.audioPath);
    audioSeconds = probeAudio(audioPath);
    tool = 'astra_audio2video';
    args = adapter.astraAudio2VideoSchema.parse({ ...common, audioPath, imagePath, strength: video.strength ?? 0.9,
      negativePrompt: video.negativePrompt ?? 'subtitles, captions, dialogue text, typography, letters, logos, watermarks' });
    if (scene.visual.frames?.end) warnings.push('audio2video has no last-image input. The planned end is review context, not a submitted constraint.');
  } else {
    tool = 'astra_img2video';
    args = adapter.astraImg2VideoSchema.parse({ ...common, firstFramePath: imagePath,
      ...(scene.visual.frames?.end ? { lastFramePath: localImage(dir, scene.visual.frames.end) } : {}),
      strength: video.strength ?? 1 });
  }
  const requestedSeconds = args.numFrames / args.frameRate;
  const neededSeconds = Math.max(seconds, audioSeconds || 0, plan.durationSeconds || 0);
  if (requestedSeconds + 1e-6 < neededSeconds)
    throw new Error('Requested frames would truncate the planned action or composed audio; lengthen or recut the shot explicitly');
  const digest = value => createHash('sha256').update(value).digest('hex');
  const source = { path: imagePath, sha256: digest(fs.readFileSync(imagePath)), frameIdx: 0,
    role: 'authored_opening', opening: scene.shot?.videoDesign?.before || null };
  const handoff = continuity.plan(win, win.SCENES.indexOf(scene), dir);
  if (handoff?.previous && handoff.observedEnd.status !== 'captured_not_reviewed')
    warnings.push('The preceding selected endpoint is missing or stale. Inspect the actual connection before accepting this opening.');
  return { shotId: scene.id, boardRevision: response.revision, performanceRevision: plan.performanceRevision,
    tool, arguments: args, source,
    performancePrompt: plan.videoPrompt,
    continuity: handoff, warnings, requestedSeconds, audioSeconds, review: 'not_reviewed',
    instructions: 'Use these arguments unchanged. References describe state; audio2video submits only the authored opening. Inspect the output, select its trim, capture its actual endpoint, then stage the next opening. No generation was performed.' };
}

module.exports = { prepare, motionPrompt };
if (require.main === module) (async () => {
  const args = process.argv.slice(2), target = args.shift(), options = {};
  const names = { '--shot': 'shotId', '--audio': 'audioPath', '--output': 'outputPath', '--filename': 'filename' };
  while (args.length) {
    const key = names[args.shift()];
    if (!key || !args.length) throw new Error('Use BOARD --shot ID [--audio WAV] [--output DIR] [--filename NAME.mp4]');
    options[key] = args.shift();
  }
  if (!target || !options.shotId) throw new Error('Supply a board and --shot stable ID');
  console.log(JSON.stringify(await prepare(target, options), null, 2));
})().catch(error => { console.error('prepare-astra-shot: ' + error.message); process.exitCode = 1; });
