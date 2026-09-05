'use strict';

// Planning constraints mirror the server table; seedance-routing.test.mjs checks drift.
const MODELS = {
  'seedance-1-5-pro-251215': { family: '1-5-pro', duration: [4, 12], resolutions: ['480p', '720p', '1080p'], images: 0, audio: true },
  'dreamina-seedance-2-0-260128': { family: '2-0', duration: [4, 15], resolutions: ['480p', '720p', '1080p', '4k'], images: 9, audio: true },
  'dreamina-seedance-2-5-260628': { family: '2-5', duration: [4, 30], resolutions: ['480p', '720p', '1080p'], images: 30, audio: true },
  'dreamina-seedance-2-0-fast-260128': { family: '2-0-fast', duration: [4, 15], resolutions: ['480p', '720p'], images: 9, audio: true },
  'dreamina-seedance-2-0-mini-260615': { family: '2-0-mini', duration: [4, 15], resolutions: ['480p', '720p'], images: 9, audio: true },
  'seedance-1-0-pro-250528': { family: '1-0-pro', duration: [2, 12], resolutions: ['480p', '720p', '1080p'], images: 0, audio: false },
  'seedance-1-0-pro-fast-251015': { family: '1-0-pro-fast', duration: [2, 12], resolutions: ['480p', '720p', '1080p'], images: 0, audio: false }
};
const DEFAULT_MODEL = 'seedance-1-5-pro-251215';

// A model may render a resolution the price table has no row for. Forecasting silently drops
// such a shot, so the plan is rejected here instead. Mirrors autoproduce/references/prices.tsv;
// seedance-routing.test.mjs checks the drift.
const PRICED = new Set([
  'seedance.1-0-pro-fast.1080p', 'seedance.1-0-pro-fast.720p',
  'seedance.1-5-pro-silent.1080p', 'seedance.1-5-pro-silent.720p',
  'seedance.1-5-pro-audio.1080p', 'seedance.1-0-pro.1080p',
  'seedance.2-0-mini.720p', 'seedance.2-0-fast.720p',
  'seedance.2-0.1080p', 'seedance.2-5.720p', 'seedance.2-5.1080p',
]);

// Seedance-only settings on a slot that defaults to Veo would skip every check below.
const SEEDANCE_KEYS = ['model', 'modelPurpose', 'modelReason', 'referenceImagePaths', 'referenceAudioPaths'];

/** Resolve a planned shot before either forecasting or calling the generation tool. */
function scenePlan(scene) {
  const v = scene.visual || {};
  const supplied = (x) => !!(x && typeof x === 'object' && (x.clip || x.file));
  const kind = scene.type === 'broll' ? 'broll' : v.video && !supplied(v.video) ? 'motion'
    : scene.type === 'quote' && v.clip && typeof v.clip === 'object' && !v.clip.file ? 'quote' : null;
  if (!kind) return null;   // a supplied clip is a file that exists: nothing to route or bill
  const settings = Object.assign({}, v, kind === 'motion' ? v.video : kind === 'quote' ? v.clip : {});
  const engine = settings.engine || (kind === 'motion' ? 'seedance' : 'veo');
  if (!['seedance', 'veo'].includes(engine)) throw new Error('unknown video engine: ' + engine);
  if (engine !== 'seedance') {
    const named = SEEDANCE_KEYS.filter((k) => settings[k] !== undefined);
    if (named.length)
      throw new Error(named.join(', ') + ' only applies to Seedance — set engine:"seedance" or drop the setting');
    return { kind, engine };
  }
  const purpose = settings.modelPurpose || 'standard';
  if (!['standard', 'complex-motion', 'reference', 'fixed-voice'].includes(purpose))
    throw new Error('unknown modelPurpose: ' + purpose);
  const references = settings.referenceImagePaths || [];
  const voices = settings.referenceAudioPaths || [];
  for (const [name, values] of [['referenceImagePaths', references], ['referenceAudioPaths', voices]]) {
    if (!Array.isArray(values) || values.some(x => typeof x !== 'string' || !x.trim()))
      throw new Error(name + ' must be an array of nonempty paths');
  }
  const needsVoice = purpose === 'fixed-voice' || voices.length > 0;
  const needsReference = purpose === 'reference' || references.length > 0 || needsVoice;
  const suggested = needsVoice || references.length > 9 ? 'dreamina-seedance-2-5-260628'
    : needsReference || purpose === 'complex-motion' ? 'dreamina-seedance-2-0-260128' : DEFAULT_MODEL;
  const model = settings.model || suggested;
  const spec = MODELS[model];
  if (!spec) throw new Error('unknown Seedance model: ' + model);
  if (model !== DEFAULT_MODEL && !String(settings.modelReason || '').trim())
    throw new Error('modelReason is required for a Seedance model override or escalation');
  if (spec.images && settings.realFaceInput !== false)
    throw new Error('Seedance 2.x requires realFaceInput:false after inspecting all source/reference images; photoreal faces use 1.5 or Veo');
  if (needsReference && !spec.images) throw new Error(model + ' does not accept reference images/audio');
  if (references.length > spec.images) throw new Error(model + ' accepts at most ' + spec.images + ' reference images');
  if (needsReference && !references.length && !voices.length) throw new Error('reference route needs referenceImagePaths or referenceAudioPaths');
  if (needsVoice && (!voices.length || spec.family !== '2-5')) throw new Error('fixed-voice route requires Seedance 2.5 and referenceAudioPaths');
  if (voices.length > 10) throw new Error('Seedance 2.5 accepts at most 10 reference audio clips');
  const generateAudio = kind !== 'motion';
  if (settings.generateAudio !== undefined && settings.generateAudio !== generateAudio)
    throw new Error('generateAudio must be ' + generateAudio + ' for a ' + kind + ' slot');
  if (needsVoice && !generateAudio) throw new Error('fixed voice needs a b-roll or speaking slot; motion backgrounds discard audio');
  if (generateAudio && !spec.audio) throw new Error(model + ' cannot supply the audio this slot uses');
  const resolution = settings.resolution || '1080p';
  if (!spec.resolutions.includes(resolution)) throw new Error(model + ' does not support ' + resolution);
  const used = Number(scene.duration);
  if (!Number.isFinite(used) || used <= 0) throw new Error('Seedance scene needs a positive duration');
  const durationSeconds = Math.max(spec.duration[0], Math.ceil(used));
  if (durationSeconds > spec.duration[1]) throw new Error(model + ' takes at most ' + spec.duration[1] + ' seconds; shorten or split the scene');
  const family = spec.family === '1-5-pro' ? spec.family + (generateAudio ? '-audio' : '-silent') : spec.family;
  const priceKey = 'seedance.' + family + '.' + resolution;
  if (!PRICED.has(priceKey)) {
    const priced = [...PRICED].filter((k) => k.startsWith('seedance.' + family + '.'))
      .map((k) => k.split('.').pop());
    throw new Error(model + ' has no price for ' + resolution +
      (priced.length ? ' — this model is billed at ' + priced.join(', ') : ' — this model has no price row'));
  }
  return { kind, engine, model, resolution, durationSeconds, generateAudio,
    tool: needsReference ? 'seedance_reference' : 'seedance_img2video',
    referenceImagePaths: references, referenceAudioPaths: voices,
    priceKey,
    reason: settings.modelReason || 'ordinary motion — Seedance 1.5 Pro' };
}

module.exports = { MODELS, DEFAULT_MODEL, scenePlan };
