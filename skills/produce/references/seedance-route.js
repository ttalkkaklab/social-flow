'use strict';

// The build projects the server's adapter table into the catalog shared with the storyboard.
const { adapters } = require('../../_shared/video-catalog.json');
const { modelConstraints } = adapters.find(a => a.tool === 'seedance_reference');
const MODELS = Object.fromEntries(Object.entries(modelConstraints).map(([model, spec]) => [model, {
  family: model.replace('dreamina-seedance-', '').replace(/-\d{6}$/, ''),
  duration: spec.duration, resolutions: spec.resolutions, taskTypes: spec.referenceTaskTypes, images: spec.referenceImages[1],
  videos: spec.referenceVideos.maxClips, voices: spec.referenceAudio.maxClips, audioOnly: spec.referenceAudio.audioOnly, audio: spec.audio,
}]));
const { selectOperation, seedanceMedia } = require('../../_shared/video-selection.js');
const { forecastHostedVideo, hostedSelection } = require('../../_shared/hosted-video-forecast.js');
const DEFAULT_MODEL = 'dreamina-seedance-2-0-260128';
const { checkFrames, framePlan, previzHandoff } = require('../../storyboard/references/render-routing.js');

const PRICED = new Set(Object.values(MODELS).flatMap(spec => spec.resolutions.flatMap(res =>
  [`seedance.${spec.family}.${res}`, `seedance.${spec.family}-video.${res}`])));

// Seedance-only settings on another engine's slot would skip every check below.
const SEEDANCE_KEYS = ['model', 'modelPurpose', 'modelReason', 'referenceImagePaths', 'referenceAudioPaths', 'referenceVideoTaskIds', 'previz'];

/** Resolve a planned shot before either forecasting or calling the generation tool. */
function scenePlan(scene, production) {
  const v = scene.visual || {};
  const mode = require('../../storyboard/references/production-mode.js');
  if (mode.reused(scene)) {
    const errors = mode.reuseErrors(scene);
    if (errors.length) throw new Error(errors.join('; '));
    return null; // Imported media never produces API arguments.
  }
  // A filmed shot carries none of these shapes, so it falls out with kind null on its own.
  // `visual.video.clip` is produce's output record and does not make the shot supplied.
  const kind = scene.type === 'broll' ? 'broll' : v.video ? 'motion'
    : scene.type === 'quote' && v.clip && typeof v.clip === 'object' ? 'quote' : null;
  if (!kind) return null;
  const settings = { ...v, ...mode.videoSlot(scene) };
  const choice = hostedSelection(production, scene);
  if (choice) {
    for (const key of ['engine', 'model', 'resolution', 'operation']) delete settings[key];
    Object.assign(settings, choice);
  }
  const frameErrors = checkFrames(scene);
  if (frameErrors.length) throw new Error(frameErrors.join('; '));
  const endFrame = framePlan(scene).end;
  if (endFrame) settings.lastImagePath = endFrame;
  // `host` is the CLI's own video tool (Grok image_to_video — owner directive 2026-09-07); it takes
  // a source and prompt and none of the Seedance planning fields.
  // `astra` is our own LTX-2.5 box (`astra_*`, video-model-selection §ASTRA). It is opt-in per
  // shot and never a default: a call costs wall clock instead of money and renders one job at a
  // time, so a board only asks for it where nobody is waiting. Like `host` it takes none of the
  // Seedance planning fields.
  const engine = settings.engine || (settings.model?.startsWith('veo-') ? 'veo' : 'seedance');
  if (['veo', 'ltx-api', 'ltx-desktop-local'].includes(engine)) return forecastHostedVideo({ scene, settings, engine, kind });
  if (!['seedance', 'host', 'astra'].includes(engine)) throw new Error('unknown video engine: ' + engine);
  if (engine !== 'seedance') {
    const refs = Array.isArray(v.references) ? v.references.filter(ref => ['video', 'both'].includes(ref.use)) : [];
    if (refs.length && engine !== 'host') throw new Error('image_plan_unsupported: this forecast route does not accept video references');
    if (refs.length && v.frames?.mode !== 'reference') throw new Error('image_plan_unsupported: pinned frames cannot be combined with video references');
    // A host video tool takes no reference clip, so a previz on that lane shapes the still and the
    // prompt instead (handoff frame_and_prompt, render-routing checkPreviz) and is not a Seedance field.
    const named = SEEDANCE_KEYS.filter((k) => settings[k] !== undefined &&
      !(k === 'previz' && (engine === 'host' || engine === 'astra') && previzHandoff(scene) === 'frame_and_prompt'));
    if (named.length)
      throw new Error(named.join(', ') + ' only applies to Seedance — set engine:"seedance" or drop the setting');
    return { kind, engine };
  }
  const purpose = settings.modelPurpose || 'standard';
  if (!['standard', 'complex-motion', 'reference', 'fixed-voice', 'previz'].includes(purpose))
    throw new Error('unknown modelPurpose: ' + purpose);
  const references = v.references === undefined ? (settings.referenceImagePaths || []) : require('../../storyboard/references/render-routing.js').imageReferences(scene).filter(ref => ['video', 'both'].includes(ref.use)).map(ref => ref.path);
  if (v.references !== undefined && references.length && v.frames?.mode !== 'reference') throw new Error('image_plan_unsupported: pinned frames cannot be combined with video references');
  const media = seedanceMedia(scene);
  const paths = media.referenceVideoPaths || [], urls = media.referenceVideoUrls || [];
  const originals = media.referenceVideoTaskIds ?? [];
  if (!Array.isArray(originals) || originals.some(id => typeof id !== 'string' || !/^cgt-[A-Za-z0-9_-]{1,120}$/.test(id)))
    throw new Error('referenceVideoTaskIds must contain Seedance generation task IDs');
  const voices = media.referenceAudioPaths || [];
  for (const [name, values] of [['referenceImagePaths', references], ['referenceAudioPaths', voices], ['referenceVideoPaths', paths], ['referenceVideoUrls', urls]]) {
    if (!Array.isArray(values) || values.some(x => typeof x !== 'string' || !x.trim()))
      throw new Error(name + ' must be an array of nonempty paths');
  }
  // The previz lane (storyboard blender-previz.md §6): the Blender clip is Video 1, the source
  // still is Image 1, and the two travel on the reference route — first_frame cannot be mixed
  // with a reference video, so the still's composition is a reference, not a lock.
  const previz = settings.previz;
  const referencePreviz = purpose === 'previz' && previzHandoff(scene) === 'reference_video';
  if (previz !== undefined && purpose !== 'previz') throw new Error('visual.video.previz needs modelPurpose:"previz"');
  if (purpose === 'previz' && kind !== 'motion') throw new Error('the previz route is a motion-background (visual.video) slot; b-roll and speech clips do not carry a previz');
  if (purpose === 'previz') {
    if (!previz || typeof previz !== 'object' || Array.isArray(previz)) throw new Error('modelPurpose previz needs visual.video.previz { clip, sha256, fps, seconds }');
    // Same shape rule as render-routing checkPreviz: storyboard-relative, no scheme, no absolute path, no .. segment.
    if (typeof previz.clip !== 'string' || !/\.(mp4|mov)$/i.test(previz.clip.trim()) || /^[a-z][a-z0-9+.-]*:/i.test(previz.clip) ||
        /^[\/\\]/.test(previz.clip) || /(^|[\/\\])\.\.([\/\\]|$)/.test(previz.clip))
      throw new Error('previz.clip must be a storyboard-relative mp4/mov path (no scheme, no absolute path, no ..) — the rendered previz');
    if (!['reference_video', 'frame_and_prompt'].includes(previzHandoff(scene))) throw new Error('previz.handoff must be reference_video or frame_and_prompt');
    if (!Number.isInteger(previz.seconds) || previz.seconds < 2) throw new Error('previz.seconds must be a whole number of seconds (2 or more)');
    if (!Number.isFinite(previz.fps) || previz.fps < 24 || previz.fps > 60) throw new Error('previz.fps must be 24–60 (render at 24 for frame-for-frame QA)');
    if (referencePreviz && (!references.length || references[0] !== (v.bg || ''))) throw new Error('previz route: referenceImagePaths[0] must be the source still (visual.bg) — "Image 1 is the first frame"');
    if (referencePreviz && settings.lastImagePath !== undefined) throw new Error('previz route takes no end frame — the reference route cannot carry last_frame');
  }
  const saved = Boolean(production?.modelSettings?.models?.video || production?.videoModel?.engine === 'seedance' || production?.modelSettings?.overrides?.length);
  const operation = settings.operation || (saved && selectOperation(settings, [scene]).operation);
  const spoken = (scene.narration || []).some(line => line.tts?.trim() && ['on_screen', 'off_screen'].includes(line.delivery));
  const needsVoice = purpose === 'fixed-voice' || voices.length > 0;
  const videoCount = paths.length + urls.length + originals.length;
  const task = media.omniReferenceTaskType;
  const needsReference = videoCount > 0 || Boolean(task) || operation === 'reference' || purpose === 'reference' || referencePreviz || references.length > 0 || needsVoice;
  const suggested = needsVoice || references.length > 9 ? 'dreamina-seedance-2-5-260628'
    : needsReference || purpose === 'complex-motion' ? 'dreamina-seedance-2-0-260128' : DEFAULT_MODEL;
  const model = settings.model || suggested;
  const spec = MODELS[model];
  if (!spec) throw new Error('unknown Seedance model: ' + model);
  if (videoCount > spec.videos) throw new Error(model + ' accepts at most ' + spec.videos + ' reference videos');
  if (task && !spec.taskTypes.includes(task))
    throw new Error('Unsupported Seedance reference task for ' + model);
  if (['edit','extend'].includes(task) && (!videoCount || settings.ratio && settings.ratio !== 'adaptive'))
    throw new Error('Editing and extension require a video and adaptive ratio');
  if (referencePreviz && !spec.videos)
    throw new Error(model + ' takes no reference video — use previz.handoff:"frame_and_prompt" and omit reference arrays, or choose a model with video input');
  if (spec.images && !saved && typeof media.realFaceInput !== 'boolean')
    throw new Error('Specify realFaceInput:false for ordinary media or true for reviewed ModelArk portrait assets');
  if (needsReference && !spec.images) throw new Error(model + ' does not accept reference images/audio');
  if (references.length > spec.images) throw new Error(model + ' accepts at most ' + spec.images + ' reference images');
  if (needsReference && !saved && !references.length && !voices.length && !videoCount) throw new Error('reference route needs referenceImagePaths or referenceAudioPaths');
  if (settings.lastImagePath !== undefined && (typeof settings.lastImagePath !== 'string' || !settings.lastImagePath.trim() || needsReference))
    throw new Error('lastImagePath needs a supported image-to-video route and a nonempty local path');
  if (needsVoice && (!voices.length || !spec.audioOnly && !references.length && !videoCount)) throw new Error('fixed-voice route needs reference audio and a compatible visual reference');
  if (voices.length > spec.voices) throw new Error(model + ' accepts at most ' + spec.voices + ' reference audio clips');
  if (operation && !['text', 'image', 'reference'].includes(operation)) throw new Error('Unsupported Seedance operation: ' + operation);
  if (operation && operation !== 'reference' && (needsReference || spoken)) throw new Error('Seedance needs the reference operation for the selected inputs or speech');
  const generateAudio = saved ? (spoken || Boolean(media.generateAudio)) : kind !== 'motion';
  if (settings.generateAudio !== undefined && settings.generateAudio !== generateAudio)
    throw new Error('generateAudio must be ' + generateAudio + ' for a ' + kind + ' slot');
  if (needsVoice && !generateAudio) throw new Error('fixed voice needs a b-roll or speaking slot; motion backgrounds discard audio');
  if (generateAudio && !spec.audio) throw new Error(model + ' cannot supply the audio this slot uses');
  const resolution = settings.resolution || (saved ? '720p' : '1080p');
  if (!spec.resolutions.includes(resolution)) throw new Error(model + ' does not support ' + resolution);
  const used = Number(scene.duration);
  if (!Number.isFinite(used) || used <= 0) throw new Error('Seedance scene needs a positive duration');
  const durationSeconds = Math.max(spec.duration[0], Math.ceil(used));
  if (scene.visual?.camera?.preset === 'drone-flythrough' && scene.visual.camera.trajectory?.seconds !== durationSeconds)
    throw new Error('drone trajectory.seconds must equal the resolved billed duration ' + durationSeconds);
  if (durationSeconds > spec.duration[1]) throw new Error(model + ' takes at most ' + spec.duration[1] + ' seconds in one request');
  if (purpose === 'previz') {
    if (referencePreviz && !spec.videos) throw new Error(model + ' does not accept a reference video');
    if (previz.seconds !== durationSeconds) throw new Error('previz.seconds (' + previz.seconds + ') must equal the billed length ' + durationSeconds + 's — render the previz at the cut length');
  }
  const adaptive = task === 'edit' || settings.durationSeconds === -1;
  const outputSeconds = adaptive ? spec.duration[1] : (settings.durationSeconds ?? durationSeconds);
  if (!Number.isInteger(outputSeconds) || outputSeconds < durationSeconds || outputSeconds > spec.duration[1] ||
      task === 'edit' && settings.durationSeconds !== undefined && settings.durationSeconds !== -1)
    throw new Error('Invalid Seedance output duration for the planned shot');
  const inputSeconds = videoCount ? (referencePreviz && videoCount === 1 ? previz.seconds : spec.duration[1]) : 0;
  const family = spec.family + (videoCount ? '-video' : '');
  const priceKey = 'seedance.' + family + '.' + resolution;
  if (!PRICED.has(priceKey)) {
    const priced = [...PRICED].filter((k) => k.startsWith('seedance.' + family + '.'))
      .map((k) => k.split('.').pop());
    throw new Error(model + ' has no price for ' + resolution +
      (priced.length ? ' — this model is billed at ' + priced.join(', ') : ' — this model has no price row'));
  }
  return { kind, engine, model, resolution, ...(typeof media.realFaceInput === 'boolean' ? {realFaceInput:media.realFaceInput} : {}), durationSeconds: adaptive ? -1 : outputSeconds, generateAudio,
    tool: needsReference ? 'seedance_reference' : operation === 'text' ? 'seedance_text2video' : 'seedance_img2video',
    referenceImagePaths: references, referenceAudioPaths: voices,
    ...(settings.lastImagePath ? { lastImagePath: settings.lastImagePath } : {}),
    // The vendor bills input + output seconds when a video is attached.
    ...(paths.length ? { referenceVideoPaths: paths } : {}), ...(urls.length ? { referenceVideoUrls: urls } : {}),
    ...(originals.length ? { referenceVideoTaskIds: originals } : {}),
    ...(task ? { omniReferenceTaskType: task } : {}),
    ...(adaptive || videoCount ? { billedSeconds: outputSeconds + inputSeconds } : {}),
    priceKey,
    reason: settings.modelReason || model + ' / ' + purpose };
}

module.exports = { MODELS, DEFAULT_MODEL, PRICED, scenePlan };
