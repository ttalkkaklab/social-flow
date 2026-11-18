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
  const override = board?.PRODUCTION?.modelSettings?.overrides?.speech;
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
  const fields = proof.generator === 'tts_astra_genai' ? ['model','text','voice','speed','instructions']
    : proof.generator === 'tts_gemini_38' ? ['turns'] : ['text'];
  for (const key of fields) {
    if (!isDeepStrictEqual(proof.voiceSettings[key], expected.generation[key]))
      errors.push('Actual provider arguments differ from plan_audio: ' + key);
  }
  return errors;
}

/** Pure local preflight used by both the gateway raw tool and tts_route. */
function validateSpeechContext(generator, args) {
  const context = args.speechContext;
  const outputBoard = generator === 'tts_astra_genai' ? episodeBoardForOutput(args.outputPath) : undefined;
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
  if (errors.length) throw new Error('speech_context_mismatch: ' + errors.join('; '));
}

/** Verify actual generation and bytes; caller-written voiceSettings alone are not evidence. */
function verifiedSpeechGeneration(audioPath, proof, voice, line, {required = false} = {}) {
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
  const actual = {...proof, voiceSettings: receipt.generation};
  const errors = plannedGenerationErrors(voice, actual, line);
  if (errors.length) throw new Error('speech_receipt_voice_mismatch: ' + errors.join('; '));
  return actual;
}

module.exports = {characterSpeech, validateSpeechContext, verifiedSpeechGeneration};
