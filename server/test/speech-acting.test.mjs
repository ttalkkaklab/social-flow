import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileActing, actingSchema } from '../dist/speech-acting.js';
const voice = { engine: 'elevenlabs', voiceId: 'actor-one', model: 'eleven_v4', speed: 1, language: 'ko', stability: 0.5 };
test('acting adapters separate clean transcript from provider syntax without changing voice identity', () => {
  const acting = { direction: 'reassuring', tags: ['sigh'] };
  const v4 = compileActing('괜찮아.', acting, voice);
  assert.equal(v4.generation.text, '[reassuring] [sigh] 괜찮아.');
  assert.equal(v4.generation.voiceId, voice.voiceId);
  const gemini = compileActing('괜찮아.', acting, { engine: 'gemini', model: 'gemini-3.8-flash-tts', voiceId: 'Kore' });
  assert.deepEqual(gemini.generation.turns, [{text:'<sigh> 괜찮아.',style:'reassuring'}]);
  assert.equal(actingSchema.safeParse({tags:['[sigh]']}).success,false);
  assert.throws(()=>compileActing('Hi',acting,{...voice,model:'eleven_v3'}),/update/);
  assert.throws(()=>compileActing('Hi',acting,{engine:'supertonic'}),/removed/);
});
