import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { identityVoice, boardVoiceErrors } = require('../../skills/_shared/character-voice.js');
const tts = { engine: 'gemini', voiceId: 'Kore', language: 'ko', speed: 1 };
const identity = value => '```json\n' + JSON.stringify({ tts: value }) + '\n```';
test('character identity requires structured, usable voice settings', () => {
  assert.deepEqual(identityVoice(identity(tts)), tts);
  for (const text of ['# Hero\n**목소리**: M1', identity(null), identity({ ...tts, voiceId: '' }), identity({ ...tts, language: '' }), identity({ ...tts, speed: 0 }), identity({ ...tts, voiceId: 'unknown' }), identity(tts) + identity(tts)]) assert.throws(() => identityVoice(text));
});
test('local cast and dialogue speakers cannot silently inherit narrator voice', () => {
  const board = { PRODUCTION: { cast: { hero: {} } }, SCENES: [{ visual: { character: ['hero'] }, narration: [{ speaker: 'guest' }] }] };
  assert.equal(boardVoiceErrors(board).length, 2);
  board.SB_DOC = { characters: [{ id: 'hero', tts }, { id: 'guest', tts: { ...tts, voiceId: 'Puck' } }] };
  assert.deepEqual(boardVoiceErrors(board), []);
  board.SB_DOC.characters[1].tts = null;
  assert.match(boardVoiceErrors(board).join(), /guest.*tts/);
  assert.deepEqual(boardVoiceErrors({ SCENES: [] }), []);
});

test('assembly refuses missing character voice before quality-warning approval', () => {
  const fs = require('node:fs'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'voice-gate-'));
  try {
    fs.writeFileSync(path.join(dir, 'scenes.js'), 'window.PRODUCTION={cast:{hero:{}}};window.SCENES=[];');
    assert.throws(() => require('../../skills/produce/references/verify-build-plan.js').verify(dir, dir), /hero.*tts/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('malformed character containers produce validation errors instead of crashing', () => {
  for (const board of [null,{SCENES:{}},{SCENES:[null]},{SCENES:[{visual:{character:[null]}}]},{SCENES:[{narration:{}}]},{SCENES:[{narration:[null]}]},{SB_DOC:{characters:'hero'}}]) assert.ok(boardVoiceErrors(board).length);
});


test('local character settings obey the generation engine contracts', async () => {
  const { voiceErrors, normalizeLanguage } = require('../../skills/_shared/character-voice.js');
  const { ttsSchema, normalizeCharacterLanguage } = await import('../dist/character-tts.js');
  const { VALID_TTS_MODELS, GEMINI_38_TTS_MODELS } = await import('../dist/tts-client.js');
  const { ELEVENLABS_MODELS } = await import('../dist/elevenlabs-client.js');
  const valid=[...[...VALID_TTS_MODELS,...GEMINI_38_TTS_MODELS].map(model=>({...tts,engine:'gemini',voiceId:'Kore',model})),...ELEVENLABS_MODELS.map(model=>({...tts,engine:'elevenlabs',voiceId:'voice_123',model}))];
  for(const setting of valid) { assert.deepEqual(voiceErrors(setting),[],JSON.stringify(setting));assert.equal(ttsSchema.safeParse(setting).success,true,JSON.stringify(setting)); }
  const invalid=[{...tts,language:'klingon'},{...tts,model:'ignored'},{...tts,engine:'elevenlabs',stylePrompt:'ignored'}, { ...tts,engine:'gemini',voiceId:'Kore',speed:0.8,model:'no-such-model'},{...tts,engine:'mlx',voiceId:'local',speed:0.8},{...tts,engine:'elevenlabs',voiceId:'a/b'},{...tts,engine:'elevenlabs',voiceId:'valid',model:'no-such-model'}];
  for(const setting of invalid) { assert.ok(voiceErrors(setting).length,JSON.stringify(setting));assert.equal(ttsSchema.safeParse(setting).success,false,JSON.stringify(setting)); }
  for(const language of ['Korean',' KO ','English','Japanese','Spanish','French','Portuguese']) {
    assert.equal(normalizeLanguage(language),normalizeCharacterLanguage(language));
    assert.equal(ttsSchema.parse({...tts,language}).language,normalizeLanguage(language));
    assert.equal(identityVoice(identity({...tts,language})).language,normalizeLanguage(language));
  }
});


test('optional voice fields reject malformed types without throwing and trim consistently',async()=>{
  const {voiceErrors}=require('../../skills/_shared/character-voice.js');
  const {ttsSchema}=await import('../dist/character-tts.js');
  for(const engine of ['gemini','mlx']) for(const patch of [{model:{}},{model:[]},{model:''},{model:' '},{stylePrompt:[]},{stylePrompt:{}},{stylePrompt:''},{model:{},stylePrompt:'warm'}]) {
    const value={engine,voiceId:'Kore',language:'ko',speed:1,...patch};
    assert.ok(voiceErrors(value).length);assert.equal(ttsSchema.safeParse(value).success,false);
  }
  const padded={engine:'gemini',voiceId:' Kore ',language:' Korean ',speed:1,model:' gemini-2.5-flash-preview-tts ',stylePrompt:' warm '};
  assert.deepEqual(voiceErrors(padded),[]);
  assert.deepEqual(identityVoice(identity(padded)),ttsSchema.parse(padded));
});


test('only supported hosted speech engines and v4 character settings are accepted', async () => {
  const { voiceErrors, generationVoiceErrors } = require('../../skills/_shared/character-voice.js');
  const { ttsSchema } = await import('../dist/character-tts.js');
  const v4 = { engine: 'elevenlabs', model: 'eleven_v4', voiceId: 'actor-one', speed: 1, language: 'ko', stability: 0.4, similarity: 0.8 };
  for (const value of [v4, { ...tts, model: 'gemini-3.8-flash-tts', voiceId: 'voice_custom-123' }, { ...tts, model: 'gemini-3.8-flash-tts', voiceId: 'achernar' }]) {
    assert.deepEqual(voiceErrors(value), []);
    assert.equal(ttsSchema.safeParse(value).success, true);
  }
  for (const value of [{ ...tts, engine: 'supertonic' }, { ...tts, engine: 'mlx' }, { ...v4, model: 'eleven_v3' }, { ...v4, speed: 1.2 }, { ...v4, stability: NaN }, { ...v4, similarity: 1.1 }, { ...tts, stability: 0.5 }, { ...tts, voiceId: 'voice_custom' }]) {
    assert.ok(voiceErrors(value).length);
    assert.equal(ttsSchema.safeParse(value).success, false);
  }
  const proof = { generator: 'tts_elevenlabs_generate', language: 'ko', voiceSettings: { voiceId: v4.voiceId, model: v4.model, stability: v4.stability, similarity: v4.similarity } };
  assert.deepEqual(generationVoiceErrors(v4, proof), []);
  assert.match(generationVoiceErrors(v4, { ...proof, voiceSettings: { ...proof.voiceSettings, stability: 0.9 } }).join(), /stability differs/);
  assert.match(generationVoiceErrors(v4, { ...proof, generator: 'tts_local_generate' }).join(), /single-speaker/);
});
