import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.ELEVENLABS_API_KEY = 'test-key-never-sent';
const { voiceAuditionSchema, manageVoiceAudition } = await import('../dist/voice-audition.js');
const { pcmToWav } = await import('../dist/media-utils.js');
const candidates = ['voice-one', 'voice-two', 'voice-three'].map((voiceId, i) => ({
  label: `Candidate ${i + 1}`, reason: 'Matches the character',
  tts: { engine: 'elevenlabs', model: 'eleven_v4', voiceId, language: 'ko', speed: 1, stability: 0.5, similarity: 0.8 },
}));
const call = args => manageVoiceAudition(voiceAuditionSchema.parse(args));

async function fixture(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'voice-audition-'));
  const identityPath = path.join(dir, 'identity.md');
  const original = '# Mina\n\n```json\n' + JSON.stringify({ character: { id: 'mina', name: 'Mina' } }) + '\n```\n';
  writeFileSync(identityPath, original);
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const wav = pcmToWav(Buffer.alloc(24000 * 2, calls.length), 24000, 1);
    return new Response(wav, { headers: { 'content-type': 'audio/wav', 'character-cost': '10' } });
  };
  try { await fn({ dir, identityPath, original, calls, create: () => call({ action: 'create', identityPath, sampleText: '괜찮아. 내가 옆에 있어.', candidates, acting: { direction: 'reassuring', tags: ['sigh'] } }) }); }
  finally { globalThis.fetch = oldFetch; rmSync(dir, { recursive: true, force: true }); }
}

test('three real WAV candidates preserve draft identity until explicit selection', async () => fixture(async ({ identityPath, original, calls, create }) => {
  const audition = await create();
  assert.equal(audition.status, 'ready');
  assert.equal(audition.candidates.length, 3);
  assert.equal(calls.length, 3);
  const events=readFileSync(path.join(path.dirname(audition.auditionPath),'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length,3);
  assert.ok(events.every(e=>e.ok && e.tool==='tts_elevenlabs_generate' && e.quantity===.01));
  assert.equal(readFileSync(identityPath, 'utf8'), original);
  assert.equal(audition.selected, undefined);
  for (const [i, candidate] of audition.candidates.entries()) {
    assert.equal(candidate.id, String(i + 1));
    assert.equal(readFileSync(candidate.audioPath).subarray(0, 4).toString(), 'RIFF');
    assert.equal(calls[i].body.model_id, 'eleven_v4');
    assert.equal(calls[i].body.inputs[0].voice_id, candidates[i].tts.voiceId);
    assert.match(calls[i].body.inputs[0].text, /\[reassuring\]/);
  }
  const html = readFileSync(audition.previewPath, 'utf8');
  assert.equal((html.match(/<audio /g) || []).length, 3);
  assert.doesNotMatch(html, /autoplay/i);
  assert.equal((await call({ action: 'read', auditionPath: audition.auditionPath })).status, 'ready');
  const selection = await call({ action: 'select', auditionPath: audition.auditionPath, candidateId: '2', userSelection: '2번 목소리로 해줘' });
  assert.deepEqual(selection.tts, candidates[1].tts);
  const body = JSON.parse(readFileSync(identityPath, 'utf8').match(/```json\s*\n([\s\S]*?)```/)[1]);
  assert.equal(body.tts.voiceId, 'voice-two');
  assert.equal(body.voiceSelection.userSelection, '2번 목소리로 해줘');
  assert.equal(body.voiceSelection.audioSha256, audition.candidates[1].audioSha256);
  assert.equal((await call({ action: 'read', auditionPath: audition.auditionPath })).status, 'selected');
  await assert.rejects(call({ action: 'select', auditionPath: audition.auditionPath, candidateId: '1', userSelection: '1' }), /unselected|already/i);
  assert.equal(calls.length, 3, 'selection must not generate more audio');
}));

test('selection rejects changed identity and changed audio without writing voice', async () => fixture(async ({ identityPath, original, create }) => {
  const audition = await create();
  const args = { action: 'select', auditionPath: audition.auditionPath, candidateId: '1', userSelection: '1번' };
  writeFileSync(identityPath, original + '\nchanged');
  await assert.rejects(call(args), /identity changed/i);
  assert.equal(readFileSync(identityPath, 'utf8'), original + '\nchanged');
  writeFileSync(identityPath, original);
  writeFileSync(audition.candidates[2].audioPath, 'corrupted audio');
  await assert.rejects(call(args), /audio changed/i);
  assert.equal(readFileSync(identityPath, 'utf8'), original);
}));

test('audition schema requires explicit choice and exactly three comparable distinct voices', () => {
  assert.equal(voiceAuditionSchema.safeParse({ action: 'select', auditionPath: '/tmp/audition.json', candidateId: '1' }).success, false);
  assert.equal(voiceAuditionSchema.safeParse({ action: 'select', auditionPath: '/tmp/audition.json', userSelection: 'choose one' }).success, false);
  const base = { action: 'create', identityPath: '/tmp/identity.md', sampleText: '괜찮아. 내가 옆에 있어.', candidates };
  assert.equal(voiceAuditionSchema.safeParse({ ...base, candidates: candidates.slice(0, 2) }).success, false);
  assert.equal(voiceAuditionSchema.safeParse({ ...base, candidates: [candidates[0], candidates[0], candidates[2]] }).success, false);
  const mixed = structuredClone(candidates); mixed[2].tts.language = 'en';
  assert.equal(voiceAuditionSchema.safeParse({ ...base, candidates: mixed }).success, false);
});

test('selection rejects manifest voice settings that no longer match generated speech', async () => fixture(async ({ identityPath, original, create }) => {
  const audition = await create();
  const manifest = JSON.parse(readFileSync(audition.auditionPath, 'utf8'));
  manifest.candidates[0].tts.voiceId = 'different-voice';
  writeFileSync(audition.auditionPath, JSON.stringify(manifest));
  await assert.rejects(call({ action: 'select', auditionPath: audition.auditionPath, candidateId: '1', userSelection: '1번' }), /manifest|settings|generation|voice|candidate/i);
  assert.equal(readFileSync(identityPath, 'utf8'), original);
}));

test('auditions honor underlying provider disable switches before spending', async () => fixture(async ({calls,create}) => {
 const before=process.env.SOCIAL_FLOW_DISABLE_TOOLS;
 process.env.SOCIAL_FLOW_DISABLE_TOOLS='tts_elevenlabs_generate';
 try { await assert.rejects(create(),/generator is disabled/); assert.equal(calls.length,0); }
 finally { if(before===undefined)delete process.env.SOCIAL_FLOW_DISABLE_TOOLS;else process.env.SOCIAL_FLOW_DISABLE_TOOLS=before; }
}));
