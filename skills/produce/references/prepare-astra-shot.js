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

function keyframeImages(scene, dir, numFrames, frameRate) {
  const frames = scene.visual.frames, keys = frames?.keyframes;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 6 || frames.mode !== 'first_last' || !frames.end)
    throw new Error('ASTRA intermediate keyframes require first_last, an end image and 1–6 intermediate images (8 total maximum)');
  const images = [{ imagePath: localImage(dir, scene.visual.bg), frameIdx: 0, strength: scene.visual.video.strength ?? 1 }];
  let previous = 0;
  for (const key of keys) {
    if (!key || !Number.isFinite(key.atSeconds) || key.atSeconds <= 0 || key.atSeconds >= scene.duration)
      throw new Error('Each intermediate keyframe atSeconds must be finite and strictly inside the planned shot duration');
    const frameIdx = Math.round(key.atSeconds * frameRate);
    if (frameIdx <= previous || frameIdx >= numFrames - 1)
      throw new Error('Intermediate keyframes must map to distinct increasing interior frame indices');
    images.push({ imagePath: localImage(dir, key.image), frameIdx, strength: key.strength ?? scene.visual.video.strength ?? 1 });
    previous = frameIdx;
  }
  images.push({ imagePath: localImage(dir, frames.end), frameIdx: numFrames - 1, strength: scene.visual.video.strength ?? 1 });
  return images;
}

function motionTimeline(scene, plan) {
  const design = scene.shot?.videoDesign || {};
  const actions = plan.performance.filter(event => event.kind === 'action');
  const authoredAction = design.action || scene.visual?.action;
  const warnings = [];
  const seconds = Number(scene.duration);
  const beats = [];
  if (actions.length && authoredAction && !actions.some(event => (event.videoDirection || event.text) === authoredAction))
    warnings.push('Resolved performance actions take precedence over this omitted design action. Reconcile any unique required action before generation: ' + authoredAction);
  for (const beat of design.motion?.beats || []) {
    if (!beat.state) continue;
    if (Number.isFinite(beat.at) && (beat.at < 0 || (Number.isFinite(seconds) && beat.at > seconds))) {
      warnings.push(`Design motion beat at ${beat.at}s falls outside the ${seconds}s shot and is omitted. Reconcile its required action with performance: ${beat.state}`);
    } else if (beat.state === design.before || beat.state === design.after) continue;
    else if (actions.length) {
      warnings.push('Resolved performance actions take precedence over this omitted design motion beat. Reconcile any unique required state before generation: ' + beat.state);
    } else beats.push(beat);
  }
  return { action: actions.length ? null : authoredAction, beats, warnings };
}

function motionPrompt(scene, plan) {
  const design = scene.shot?.videoDesign || {}, camera = scene.visual?.camera || {};
  const speech = plan.performance.filter(event => event.kind !== 'action');
  const line = speech[0];
  // A single supplied line already anchors a wholly concurrent performance.
  // Keep numeric timing for any sequential action, other delivery or extra line.
  const concurrentLine = plan.mode === 'audio_conditioned' && speech.length === 1 && line.delivery === 'on_screen'
    && Number.isFinite(line.speechStartSeconds) && Number.isFinite(line.speechEndSeconds)
    && line.speechEndSeconds > line.speechStartSeconds
    && plan.performance.filter(event => event.kind === 'action').every(event =>
      Number.isFinite(event.startSeconds) && Number.isFinite(event.endSeconds)
      && Math.abs(event.startSeconds - line.speechStartSeconds) < 1e-6
      && Math.abs(event.endSeconds - line.speechEndSeconds) < 1e-6);
  const redact = value => {
    let text = String(value || '').trim();
    for (const event of speech) if (event.text) text = text.split(event.text).join('the supplied speech');
    return text;
  };
  const at = seconds => Number(seconds.toFixed(3));
  const span = (start, end) => Number.isFinite(start) && Number.isFinite(end)
    ? concurrentLine ? ' During the supplied spoken line,' : ` From ${at(start)} to ${at(end)} seconds,` : '';
  const instructions = [
    'One continuous uninterrupted shot. Keep the exact people, location and visual style of the supplied opening image.',
    redact(design.before),
    redact(camera.framing),
    require('../../storyboard/references/film-techniques.js').instructions(scene),
    require('../../storyboard/references/production-mode.js').moveOf(camera)?.family === 'static'
      ? 'The camera stays fixed with identical framing, angle, focal length and background scale. ' + redact(camera.end)
      : redact([camera.movement, camera.speed, camera.end].filter(Boolean).join('. ')),
  ];
  if (plan.mode === 'audio_conditioned') instructions.push('Match visible lip movements to the supplied audio. Only the designated person speaks.');
  const timeline = motionTimeline(scene, plan);
  if (timeline.action) instructions.push(redact(timeline.action));
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
  for (const beat of timeline.beats) if (beat.state && !seen.has(beat.state)) {
    instructions.push((Number.isFinite(beat.at) ? `At ${at(beat.at)} seconds, ` : '') + redact(beat.state));
    seen.add(beat.state);
  }
  if (design.continuity) instructions.push('Preserve these continuity conditions throughout: ' + redact(design.continuity));
  if (design.after) instructions.push('The shot finishes with this state and holds it until the cut: ' + redact(design.after));
  instructions.push('All surfaces stay unlettered and unobstructed, exactly as in the supplied image.');
  return instructions.filter(Boolean).map(text => text.trim()).join(' ');
}

function designDirectionConflict(opening, continuityText) {
  const side = text => {
    const matches = [...String(text || '').matchAll(/image[ -](left|right)\s+jamb/gi)].map(m => m[1].toLowerCase());
    return matches.length === 1 ? matches[0] : null;
  };
  const a = side(opening), b = side(continuityText);
  return Boolean(a && b && a !== b);
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
  const numFrames = 8 * Math.ceil((seconds * frameRate - 1) / 8) + 1;
  const common = { prompt: motionPrompt(scene, plan), width, height, frameRate, numFrames,
    ...(video.seed !== undefined ? { seed: video.seed } : {}),
    ...(options.outputPath ? { outputPath: path.resolve(options.outputPath) } : {}),
    ...(options.filename ? { filename: options.filename } : {}) };
  // Carry authored controls to the selected adapter; never let Zod strip an unsupported choice.
  const controls = {};
  for (const key of ['guidance', 'numInferenceSteps', 'negativePrompt', 'generateAudio'])
    if (video[key] !== undefined) controls[key] = video[key];
  if (video.hdr !== undefined) throw new Error('hdr cannot be combined with the authored opening image');
  const warnings = [...plan.warnings, ...motionTimeline(scene, plan).warnings];
  if (scene.edit?.continuity && designDirectionConflict(scene.shot?.videoDesign?.before, scene.edit.continuity))
    warnings.push('Opening and edit continuity disagree on image-left/image-right. Reconcile the authored state before judging continuity.');
  const onScreen = plan.mode === 'audio_conditioned';
  const hasKeyframes = scene.visual.frames?.keyframes !== undefined;
  if (onScreen && hasKeyframes)
    throw new Error('audio2video does not support intermediate keyframes; do not silently discard this authored constraint');
  if (onScreen || hasKeyframes) {
    for (const key of ['tier', 'lora', 'numGeneratedKeyframes'])
      if (video[key] !== undefined) throw new Error(key + ' is not supported by ' + (onScreen ? 'audio2video' : 'keyframe'));
  } else {
    for (const key of ['tier', 'lora', 'numGeneratedKeyframes'])
      if (video[key] !== undefined) controls[key] = video[key];
  }
  let tool, args, audioSeconds;
  if (onScreen) {
    if (!options.audioPath) throw new Error('Supply the composed shot audioPath for on-screen speech');
    if (response.lines.some(line => !line.audioCurrent)) throw new Error('Attach current speech for every line before preparing audio2video');
    const audioPath = path.resolve(options.audioPath);
    audioSeconds = probeAudio(audioPath);
    tool = 'astra_audio2video';
    // The tool's speech sync check expects motion under every spoken line, so it stays off
    // when an off-screen voice shares the track (mouths should be still then).
    const expectLipSync = plan.performance.filter(event => event.kind !== 'action').every(event => event.delivery === 'on_screen');
    args = adapter.astraAudio2VideoSchema.parse({ ...common, audioPath, imagePath, strength: video.strength ?? 0.9,
      negativePrompt: video.negativePrompt ?? 'subtitles, captions, dialogue text, typography, letters, logos, watermarks',
      expectLipSync, ...controls });
    if (!expectLipSync) warnings.push('An off-screen voice shares this audio, so the automatic speech sync check and reseed are off. Inspect each visible mouth against its line.');
    if (scene.visual.frames?.end) warnings.push('audio2video has no last-image input. The planned end is review context, not a submitted constraint.');
  } else if (hasKeyframes) {
    tool = 'astra_keyframe_video';
    args = adapter.astraKeyframeVideoSchema.parse({ ...common,
      images: keyframeImages(scene, dir, numFrames, frameRate), generateAudio: video.generateAudio ?? false,
      ...controls });
  } else {
    tool = 'astra_img2video';
    args = adapter.astraImg2VideoSchema.parse({ ...common, firstFramePath: imagePath,
      ...(scene.visual.frames?.end ? { lastFramePath: localImage(dir, scene.visual.frames.end) } : {}),
      strength: video.strength ?? 1, ...controls });
  }
  const requestedSeconds = args.numFrames / args.frameRate;
  const neededSeconds = Math.max(seconds, audioSeconds || 0, plan.durationSeconds || 0);
  if (requestedSeconds + 1e-6 < neededSeconds)
    throw new Error('Requested frames would truncate the planned action or composed audio; lengthen or recut the shot explicitly');
  const edit = require('./edit-plan.js').preview(win.SCENES, { videoWarningsApproved: true })
    .find(row => row.card === win.SCENES.indexOf(scene)) || scene.edit || {};
  if (onScreen && (edit.in || edit.pre))
    throw new Error('audio2video requires edit.in=0 and pre=0 so source trimming cannot remove supplied speech; replan the aligned shot explicitly');
  const coverage = require('../../_shared/video-duration.js').shotTiming(scene,
    { performanceSeconds: plan.durationSeconds, audioSeconds, edit, outputFps: frameRate });
  const { numFrames: _frames, ...withoutFrames } = args;
  const optimized = adapter.resolveVideoDuration(tool, { ...withoutFrames, requiredSeconds: coverage.requiredSeconds });
  args = optimized.args;
  if (hasKeyframes) args = adapter.astraKeyframeVideoSchema.parse({ ...args,
    images: keyframeImages(scene, dir, args.numFrames, frameRate) });
  if (video.numFrames !== undefined && video.numFrames !== args.numFrames)
    warnings.push('Stored numFrames differs from the optimized request. Refresh previz and quote before submitting a new generation.');
  const sound = { ...scene.sound };
  if (sound.audioSource === undefined && scene.narration?.some(line => (line.tts || '').trim())) sound.audioSource = 'speech';
  const soundArgs = { ...args };
  // The legacy keyframe fallback is not an authored request to suppress sound.
  if (hasKeyframes && video.generateAudio === undefined) delete soundArgs.generateAudio;
  const soundPlan = scene.sound?.audioSource !== undefined || Array.isArray(scene.sound?.effects)
    ? adapter.prepareVideoSound(tool, soundArgs, sound) : undefined;
  if (soundPlan) { args = soundPlan.arguments; warnings.push(...soundPlan.warnings); }
  const digest = value => createHash('sha256').update(value).digest('hex');
  const source = { path: imagePath, sha256: digest(fs.readFileSync(imagePath)), frameIdx: 0,
    role: 'authored_opening', opening: scene.shot?.videoDesign?.before || null };
  const handoff = continuity.plan(win, win.SCENES.indexOf(scene), dir);
  if (handoff?.previous && handoff.observedEnd.status !== 'captured_not_reviewed')
    warnings.push('The preceding selected endpoint is missing or stale. Inspect the actual connection before accepting this opening.');
  const keyframes = hasKeyframes ? args.images.map((image, index) => ({
    path: image.imagePath, sha256: digest(fs.readFileSync(image.imagePath)), frameIdx: image.frameIdx,
    atSeconds: image.frameIdx / frameRate,
    role: index === 0 ? 'authored_opening' : index === args.images.length - 1 ? 'authored_ending' : 'authored_intermediate',
    state: index > 0 && index < args.images.length - 1 ? scene.visual.frames.keyframes[index - 1].state || null : null,
  })) : undefined;
  return { shotId: scene.id, boardRevision: response.revision, performanceRevision: plan.performanceRevision,
    tool, arguments: args, source, ...(soundPlan ? { soundPlan } : {}), ...(keyframes ? { keyframes } : {}),
    performancePrompt: plan.videoPrompt,
    continuity: handoff, warnings, requestedSeconds: optimized.timing.requestedSeconds, durationPlan: optimized.timing, quote: adapter.priceOf(tool, args), coverage, audioSeconds, review: 'not_reviewed',
    instructions: 'Use these arguments unchanged. References describe state; audio2video submits only the authored opening. Inspect the output, select its trim, capture its actual endpoint, then stage the next opening. No generation was performed.' };
}

module.exports = { prepare, motionPrompt, motionTimeline, designDirectionConflict, keyframeImages };
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
