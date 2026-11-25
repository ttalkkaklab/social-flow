'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {voiceErrors, generationVoiceErrors, normalizeLanguage} = require('./character-voice.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalizeVoice = voice => Object.fromEntries(Object.entries(voice || {}).map(([key, value]) =>
  [key, key === 'language' ? normalizeLanguage(value) : typeof value === 'string' ? value.trim() : value]));

function explicitVoiceOverride(board, voice, current) {
  const overrides = board?.PRODUCTION?.modelSettings?.overrides;
  if (Array.isArray(overrides))
    return overrides.some(entry => entry?.scope === 'episode' && typeof entry.request === 'string' &&
      entry.request.trim() && entry.speech?.engine === voice.engine && entry.speech.model === voice.model &&
      entry.speech.voiceId === voice.voiceId);
  const override = overrides?.speech;
  return typeof override?.request === 'string' && override.request.trim() &&
    override.engine === voice?.engine && override.model === voice?.model &&
    (override.voiceId === voice?.voiceId || (voice?.voiceId !== 'default' &&
      (voice?.engine !== current?.tts?.engine || voice?.model !== current?.tts?.model)));
}

/** Validate a new take without silently updating the episode's approved voice snapshot. */
function characterSpeech(character, {boardDir, board} = {}) {
  let current;
  if (boardDir && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(character?.id || '')) {
    let channel = path.resolve(boardDir);
    while (!fs.existsSync(path.join(channel, 'profile.md')) && path.dirname(channel) !== channel) channel = path.dirname(channel);
    const identity = path.join(channel, 'assets/characters', character.id, 'identity.md');
    if (fs.existsSync(identity)) current = require('../channel/references/character-sheet.js').handoff(identity, {voiceOnly: character.voiceOnly === true});
  }
  const resolved = character?.tts ? character : {...current, ...character, tts: current?.tts};
  const voice = resolved.tts;
  const invalid = voiceErrors(voice);
  if (invalid.length) throw new Error('character_voice_invalid: ' + invalid.join('; '));
  const override = explicitVoiceOverride(board, voice, current);
  if (current && !override && !isDeepStrictEqual(normalizeVoice(current.tts), normalizeVoice(voice)))
    throw new Error(`character_voice_stale: ${resolved.id} differs from the shared character voice; apply the requested sheet voice to SB_DOC.characters, or record an explicit episode speech override with request and voiceId`);
  if (current?.voiceReference && resolved.voiceReference && !override && current.voiceReference.sha256 !== resolved.voiceReference.sha256)
    throw new Error(`character_voice_stale: ${resolved.id} selected sample changed; refresh the episode voice reference explicitly`);
  const reference = resolved.voiceReference || (!override ? current?.voiceReference : undefined);
  const selected = reference || resolved.voiceSelection || resolved.voiceReferenceWarning || (!override && (current?.voiceSelection || current?.voiceReferenceWarning));
  if (voice.engine === 'astra-genai' && voice.voiceId.trim().toLowerCase() === 'default' && selected && !override)
    throw new Error(`character_voice_unregistered: ${resolved.id} has a selected sample but voiceId is default; register that sample with the gateway and pin its returned voice ID. A direction prompt does not clone a sample`);
  if (!override && (resolved.voiceReferenceWarning || current?.voiceReferenceWarning))
    throw new Error(`character_voice_sample_invalid: ${resolved.id} selected sample cannot be resolved`);
  if (reference) {
    if (reference.tts && !isDeepStrictEqual(normalizeVoice(reference.tts), normalizeVoice(voice)))
      throw new Error(`character_voice_sample_stale: ${resolved.id} sample uses different TTS settings`);
    const file = path.resolve(boardDir || process.cwd(), reference.path);
    if (!reference.sha256 || hash(fs.readFileSync(file)) !== reference.sha256)
      throw new Error(`character_voice_sample_stale: ${resolved.id} selected sample bytes changed or lack a pinned hash`);
    return {...resolved, voiceReference: {...reference, path: file}};
  }
  return resolved;
}

// Resolve existing ancestors too: an output symlink cannot hide an episode boundary.
function physicalPath(file) {
  let current = path.resolve(file), suffix = [];
  while (!fs.existsSync(current) && path.dirname(current) !== current) {
    suffix.unshift(path.basename(current)); current = path.dirname(current);
  }
  return path.join(fs.realpathSync(current), ...suffix);
}
function episodeBoardForOutput(outputPath) {
  let folder = physicalPath(outputPath || process.cwd());
  while (true) {
    if (path.basename(folder) === 'assets' && fs.existsSync(path.join(path.dirname(folder), 'profile.md'))) return undefined;
    const board = path.join(folder, 'storyboard/scenes.js');
    if (fs.existsSync(board)) return fs.realpathSync(board);
    if (path.dirname(folder) === folder) return undefined;
    folder = path.dirname(folder);
  }
}

// Old recording metadata may omit provider text. New contexts and execution receipts may not.
function plannedGenerationErrors(voice, proof, line) {
  const errors = generationVoiceErrors(voice, proof, line);
  if (errors.length) return errors;
  const expected = require('./speech-contract.js').compileActing(line?.tts ?? proof.text, line?.acting, voice);
  const fields = proof.generator === 'tts_local_voxcpm2' ? ['model','text','voice','instructions'] : proof.generator === 'tts_astra_genai' ? ['model','text','voice','speed','instructions']
    : proof.generator === 'tts_gemini_38' ? ['turns'] : ['text'];
  for (const key of fields) {
    if (!isDeepStrictEqual(proof.voiceSettings[key], expected.generation[key]))
      errors.push('Actual provider arguments differ from plan_audio: ' + key);
  }
  return errors;
}

/** Check the line binding before synthesis, including saved plans for hosted voices. */
function validateSpeechContext(generator, args) {
  const context = args.speechContext;
  const requiresContext = ['tts_astra_genai','tts_local_voxcpm2'].includes(generator);
  const outputBoard = (context || requiresContext) ? episodeBoardForOutput(args.outputPath) : undefined;
  if (!context) {
    if (outputBoard) throw new Error('speech_context_required: use speech_manage plan_audio for episode TTS');
    return;
  }
  const file = fs.realpathSync(context.path);
  if (outputBoard && file !== outputBoard) throw new Error('speech_context_mismatch: output belongs to a different episode');
  const source = fs.readFileSync(file, 'utf8');
  if (hash(source) !== context.expectedRevision) throw new Error('speech_context_stale: re-plan audio after storyboard changes');
  const board = require('./scenes-vm.js').evaluateWindowScript(source, {filename: file});
  const matches = (board.SCENES || []).flatMap(shot => shot.narration || []).filter(line => line.id === context.lineId);
  if (matches.length !== 1 || !matches[0].speaker) throw new Error('speech_context_invalid: select one explicit stable line ID');
  const line = matches[0], raw = board.SB_DOC?.characters;
  const characters = Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([id, value]) => ({...value, id}));
  const cast = characters.filter(character => character.id === line.speaker);
  if (cast.length !== 1) throw new Error('speech_context_invalid: speaker needs one character entry');
  const character = characterSpeech(cast[0], {boardDir: path.dirname(file), board});
  const errors = plannedGenerationErrors(character.tts, {generator, voiceSettings: args, text: line.tts, language: character.tts.language}, line);
  if (generator === 'tts_local_voxcpm2' && (args.referenceAudio !== character.voiceReference?.path ||
      args.referenceSha256 !== character.voiceReference?.sha256 || args.continuationAudio || args.continuationText))
    errors.push('Local voice conditioning differs from the pinned sample');
  if (errors.length) throw new Error('speech_context_mismatch: ' + errors.join('; '));
}

function localSpeechProofOptions(character, boardDir, board) {
  if (character?.tts?.engine !== 'mlx-audio') return {};
  if (!board) {
    const file = path.join(boardDir, 'scenes.js');
    board = require('./scenes-vm.js').evaluateWindowScript(fs.readFileSync(file, 'utf8'), {filename: file});
  }
  const actor = characterSpeech(character, {boardDir, board});
  return {required: true, referenceSha256: actor.voiceReference?.sha256};
}

/** Verify actual generation and bytes; caller-written voiceSettings alone are not evidence. */
function verifiedSpeechGeneration(audioPath, proof, voice, line, {required = false, referenceSha256} = {}) {
  if (!proof?.receiptPath) {
    if (required) throw new Error('speech_receipt_required: attach the completed TTS receiptPath');
    return proof;
  }
  const receipt = JSON.parse(fs.readFileSync(proof.receiptPath, 'utf8'));
  if (receipt.status !== 'completed' || receipt.result?.success !== true ||
      receipt.generator !== proof.generator || !receipt.result?.audioPath ||
      fs.realpathSync(receipt.result.audioPath) !== fs.realpathSync(audioPath) ||
      receipt.audioSha256 !== hash(fs.readFileSync(audioPath)))
    throw new Error('speech_receipt_mismatch: receipt must cover this completed generator and these exact audio bytes');
  if (voice?.engine === 'mlx-audio' && required && (receipt.generation.referenceSha256 !== referenceSha256 ||
      receipt.generation.continuationAudio || receipt.generation.continuationText))
    throw new Error('speech_receipt_voice_mismatch: local conditioning differs from the selected character sample');
  const actual = {...proof, voiceSettings: receipt.generation};
  const errors = plannedGenerationErrors(voice, actual, line);
  if (errors.length) throw new Error('speech_receipt_voice_mismatch: ' + errors.join('; '));
  return actual;
}

// The retired per-shot renderer played this recording directly, in place of a generated turn; its clips are still verified.
function verifyShotPerformance(file, card, board, boardDir) {
  const lines = (card.narration || []).filter(line => line.tts?.trim());
  const line = lines[0], audio = line?.audio;
  const registry = board.SB_DOC?.characters ?? [];
  const actor = Array.isArray(registry) ? registry.find(person => person.id === line?.speaker) : registry[line?.speaker];
  if (lines.length !== 1 || line.delivery === 'voiceover' || !actor || !audio?.path ||
      fs.realpathSync(path.resolve(boardDir, audio.path)) !== fs.realpathSync(file) || audio.sha256 !== hash(fs.readFileSync(file)))
    throw new Error('scene_speech_performance: attach the current recording of the speaking line before using its audio');
  const character = characterSpeech({...actor, id:line.speaker}, {board, boardDir});
  if (audio.revision !== require('./speech-contract.js').speechRevision(line, character) || audio.generation?.text !== line.tts)
    throw new Error('scene_speech_performance: the recorded line has changed');
  verifiedSpeechGeneration(file, audio.generation, character.tts, line, {required:true, referenceSha256: character.voiceReference?.sha256});
}

// Only the adapter that uploaded the driver can attest which bytes generated this picture.
function conditioningAudioSha256(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) return;
  const video = path.resolve(videoPath);
  const receipts = ['.astra-job.json','.astra-genai.json'].map(suffix => video + suffix).filter(file => fs.existsSync(file));
  if (receipts.length !== 1) return;
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(receipts[0], 'utf8')); } catch { return; }
  if (!receipt || receipt.status !== 'completed' || !receipt.jobId || receipt.videoPath !== video ||
      hash(fs.readFileSync(video)) !== receipt.sha256) return;
  const contract = require('./scene-speech-receipt.js');
  if (contract.perShotSceneOperation(receipt.operation)) {
    return contract.sceneDriver(contract.readSceneRequest(video,receipt));
  }
  return recordedConditioningDriver(receipt,receipts[0]);
}
function recordedConditioningDriver(receipt,sidecar) {
  if (receipt?.status !== 'completed' || !receipt.jobId || !/^[a-f0-9]{64}$/.test(receipt.conditioningAudioSha256)) return;
  const request = receipt.submittedRequest;
  const astra = sidecar.endsWith('.astra-job.json') && receipt.mode === 'audio2video' &&
    request?.mode === 'audio2video' && request.audio_upload_id && !request.audio_start_time && request.audio_max_duration === undefined;
  const gateway = sidecar.endsWith('.astra-genai.json') && receipt.version === 1 && receipt.operation === 'audio-to-video' &&
    /^[a-f0-9]{64}$/.test(receipt.fingerprint);
  if (astra || gateway) return receipt.conditioningAudioSha256;
}

module.exports = {characterSpeech, localSpeechProofOptions, validateSpeechContext, verifiedSpeechGeneration, verifyShotPerformance, conditioningAudioSha256, recordedConditioningDriver};
