'use strict';

const { adapters } = require('./video-catalog.json');
const { minimumDuration } = require('./video-duration.js');

function forecastHostedVideo({ scene, settings, engine, kind }) {
  const { model } = settings;
  const constraints = adapters.find(adapter => adapter.engine === engine).modelConstraints;
  const speech = (scene.narration || []).filter(line => line.tts?.trim());
  const dialogue = speech.some(line => line.delivery !== 'voiceover');
  if (engine === 'ltx-desktop-local') {
    const { framePlan } = require('../storyboard/references/render-routing.js');
    const operation = settings.operation || (dialogue ? 'audio' : framePlan(scene).start ? 'image' : 'text');
    const adapter = adapters.find(a => a.engine === engine && a.operation === operation);
    if (!adapter || dialogue && adapter.voice.lane === 'none') throw new Error('Unsupported local Desktop operation for this shot');
    return {kind, engine, model, resolution:settings.resolution, durationSeconds:settings.durationSeconds ?? scene.duration,
      tool:adapter.tool, reason:'Local LTX Desktop GPU', priceKey:'video.ltx-desktop-local'};
  }
  const operation = settings.operation || (scene.visual?.frames?.mode === 'reference' ? 'reference' : dialogue && engine === 'ltx-api' ? 'audio' : 'image');
  const adapter = adapters.find(adapter => adapter.engine === engine && adapter.operation === operation);
  if (!adapter) throw new Error('Unsupported ' + engine + ' operation: ' + operation);
  if (dialogue && adapter.voice.lane === 'none') throw new Error('voice_lane_required: selected model needs an adapter that accepts the character voice');
  const length = settings.durationSeconds ?? scene.duration;
  const generateAudio = !speech.length && (settings.generateAudio ?? (scene.sound?.audioSource !== 'speech' && !/(?:^|\bAudio:\s*)silent\b/i.test(String(settings.prompt || '').trim())));
  const result = { kind, engine, model, generateAudio, tool: adapter.tool };
  if (engine === 'veo') {
    if (!Object.hasOwn(constraints, model)) throw new Error('video_engine_unsupported: select a current Google Cloud Veo model');
    const spec = constraints[model], resolution = settings.resolution || '720p';
    if (!spec.operations.includes(operation) || !spec.resolutions.includes(resolution))
      throw new Error('Unsupported Google Cloud Veo operation or resolution for ' + model);
    const seconds = operation === 'reference' ? [spec.referenceSeconds] : spec.durationSeconds;
    const durationSeconds = operation === 'extend' ? spec.extensionSeconds : minimumDuration(length, { seconds }).requestedSeconds;
    return { ...result, resolution, durationSeconds, reason: 'Google Cloud Veo', priceKey: ['veo.vertex', spec.priceFamily, resolution, generateAudio ? 'audio' : 'silent'].join('.') };
  }
  const resolution = settings.resolution || '1920x1080';
  const tier = Object.entries(constraints.resolutions).find(([, sizes]) => sizes.includes(resolution))?.[0];
  if (!tier || !constraints.models.includes(model)) throw new Error('Unsupported LTX API model or resolution');
  const limit = constraints.limits[model][tier];
  const durationSeconds = operation === 'audio' ? Math.max(2, Number(length)) :
    minimumDuration(length, { seconds: (settings.fps ?? 24) <= 25 ? limit.imageSeconds : limit.highFpsSeconds }).requestedSeconds;
  if (!Number.isFinite(durationSeconds) || operation === 'audio' && durationSeconds > limit.audioMaxSeconds) throw new Error('Unsupported LTX API duration');
  return { ...result, resolution, durationSeconds, reason: operation === 'audio' ? 'LTX API estimate based on planned audio length' : 'LTX API', priceKey: ['ltx-api', model, tier].join('.') };
}

// Reuse the executor's precedence for saved selections and explicit per-shot overrides.
function hostedSelection(production = {}, scene) {
  const saved = production.modelSettings?.models?.video;
  const visual = scene.visual || {};
  const cut = visual.video || (typeof visual.clip === 'object' && visual.clip) || visual;
  const relevant = [saved, production.videoModel, cut, ...(production.modelSettings?.overrides || []).map(change => change.video)]
    .some(choice => choice && (['veo', 'ltx-api', 'ltx-desktop-local'].includes(choice.engine) || /^(veo-|ltx-2-5-(?:pro|fast)$)/.test(choice.model || '')));
  if (!relevant) return null;
  const { resolveVideoChoice } = require('../storyboard/references/production-mode.js');
  return resolveVideoChoice(production, { ...scene, visual: { ...visual, video: cut } }, saved).selection;
}

module.exports = { forecastHostedVideo, hostedSelection };
