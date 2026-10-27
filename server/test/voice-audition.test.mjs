import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { test } from 'node:test';

process.env.ELEVENLABS_API_KEY = 'test-key-never-sent';
const { voiceAuditionSchema, manageVoiceAudition } = await import('../dist/voice-audition.js');
const { pcmToWav } = await import('../dist/media-utils.js');
const { config } = await import('../dist/config.js');
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

// Gemini casting plans built from a character identity's voice target.
const source = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const doc = () => JSON.parse(source.match(/```json\s*\n([\s\S]*?)```/)[1]);
const markdown = value => '# Character\n\n```json\n' + JSON.stringify(value) + '\n```';
const voice = { engine:'gemini', model:'gemini-3.8-flash-tts',voiceId:'Kore',language:'ko',speed:1 };

test('audition planning is read-only and adds identity controls to the same generation compiler', async () => {
  const dir=mkdtempSync(join(tmpdir(),'voice-target-'));
  try {
    const identityPath=join(dir,'identity.md');writeFileSync(identityPath,source);
    const candidates=['Kore','Puck','Charon'].map(voiceId=>({label:voiceId,reason:'Test real catalog IDs',tts:{...voice,voiceId}}));
    const args=voiceAuditionSchema.parse({action:'plan',identityPath,candidates,sampleText:'괜찮아요. 제가 여기 있어요.'});
    const plan=await manageVoiceAudition(args);
    assert.equal(plan.review,'not_reviewed');
    assert.equal(plan.candidates[0].compiled.generation.turns[0].style,plan.target.baselineDirection);
    assert.match(plan.target.perceivedAge,/24/);
    assert.ok(plan.target.warnings.some(text=>/immutable speaker traits/.test(text)));
    assert.equal(plan.candidates[0].tts.voiceDirection,plan.target.baselineDirection);
    assert.equal(readFileSync(identityPath,'utf8'),source);
    const lengthy=doc();lengthy.character.speech.pace.value='Measured concise phrasing. '.repeat(30);
    writeFileSync(identityPath,markdown(lengthy));
    const incomplete=await manageVoiceAudition(args);
    assert.match(incomplete.candidates[0].generationError,/compact/);
    assert.ok(incomplete.target.warnings.some(value=>/400/.test(value)));
    await assert.rejects(manageVoiceAudition({...args,action:'create'}),/compact/);
    const compact=await manageVoiceAudition({...args,voiceProfile:{baselineDirection:'Low resonant adult voice.'}});
    assert.equal(compact.candidates[0].tts.voiceDirection,'Low resonant adult voice.');
    const mismatch=structuredClone(args);mismatch.candidates[0].metadata={voiceId:'Puck',source:'gemini-library',retrievedAt:new Date().toISOString()};
    assert.equal(voiceAuditionSchema.safeParse(mismatch).success,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('per-excerpt audition acting preserves identity and exact ordered words', async () => {
  const dir=mkdtempSync(join(tmpdir(),'voice-turns-'));
  try {
    const identityPath=join(dir,'identity.md');writeFileSync(identityPath,source);
    const candidates=['Kore','Puck','Charon'].map(voiceId=>({label:voiceId,reason:'Distinct source excerpt delivery',tts:{...voice,voiceId}}));
    const sampleTurns=[{text:'괜찮아요.',acting:{direction:'Reassure softly.'}},{text:'지금 나가요!',acting:{direction:'Give a firm urgent command.'}}];
    const args={action:'plan',identityPath,candidates,sampleText:'괜찮아요. 지금 나가요!',sampleTurns};
    const plan=await manageVoiceAudition(voiceAuditionSchema.parse(args));
    for (const candidate of plan.candidates) {
      const turns=candidate.compiled.generation.turns;
      assert.deepEqual(turns.map(t=>t.text),sampleTurns.map(t=>t.text));
      assert.match(turns[0].style,/Reassure softly/);assert.doesNotMatch(turns[0].style,/urgent command/);
      assert.match(turns[1].style,/urgent command/);
      for (const turn of turns) assert.ok(turn.style.startsWith(plan.target.baselineDirection));
      assert.equal(candidate.compiled.generation.voice,candidate.tts.voiceId);
    }
    assert.equal(readFileSync(identityPath,'utf8'),source);
    assert.equal(voiceAuditionSchema.safeParse({...args,sampleTurns:[...sampleTurns].reverse()}).success,false);
    assert.equal(voiceAuditionSchema.safeParse({...args,acting:{direction:'Ambiguous shared emotion'}}).success,false);
    assert.equal(voiceAuditionSchema.safeParse({...args,candidates:candidates.map(c=>({...c,tts:{...c.tts,model:'gemini-2.5-flash-preview-tts'}}))}).success,false);
    await assert.rejects(manageVoiceAudition(voiceAuditionSchema.parse({...args,sampleTurns:[sampleTurns[0],{...sampleTurns[1],acting:{direction:'x'.repeat(500)}}]})),/500/);
    writeFileSync(identityPath,markdown({character:{}}));
    await assert.rejects(manageVoiceAudition(voiceAuditionSchema.parse({...args,sampleTurns:[{...sampleTurns[0],acting:{direction:'x'.repeat(500),context:'Additional acting context.'}},sampleTurns[1]]})),/500/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('selection rejects an altered Gemini baseline while preserving the heard baseline on a valid choice', async () => {
  const dir=mkdtempSync(join(tmpdir(),'voice-baseline-select-'));
  const originalFetch=globalThis.fetch,originalKey=config.geminiApiKey;
  config.geminiApiKey='offline-mock-never-sent';
  const data=pcmToWav(Buffer.alloc(48000,1),24000,1).toString('base64');
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/interactions')
    ? {steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data}]}]}
    : {candidates:[{content:{parts:[{inlineData:{mimeType:'audio/wav',data}}]}}]}));
  try {
    for (const model of ['gemini-3.8-flash-tts','gemini-2.5-flash-preview-tts']) {
    const identityPath=join(dir,'identity.md');writeFileSync(identityPath,source);
    const candidates=['Kore','Puck','Charon'].map(voiceId=>({label:voiceId,reason:'Baseline provenance test',tts:{...voice,model,voiceId}}));
    const audition=await manageVoiceAudition(voiceAuditionSchema.parse({action:'create',identityPath,candidates,sampleText:'괜찮아요.'}));
    const saved=readFileSync(audition.auditionPath,'utf8'),tampered=JSON.parse(saved);
    tampered.candidates[0].tts.voiceDirection='An unrelated bright young voice.';
    writeFileSync(audition.auditionPath,JSON.stringify(tampered));
    const select={action:'select',auditionPath:audition.auditionPath,candidateId:'1',userSelection:'1번 목소리'};
    await assert.rejects(manageVoiceAudition(voiceAuditionSchema.parse(select)),/voice settings or acting differ/);
    assert.equal(readFileSync(identityPath,'utf8'),source);
    delete tampered.candidates[0].tts.voiceDirection;
    writeFileSync(audition.auditionPath,JSON.stringify(tampered));
    await assert.rejects(manageVoiceAudition(voiceAuditionSchema.parse(select)),/voice settings or acting differ/);
    writeFileSync(audition.auditionPath,saved);
    const selected=await manageVoiceAudition(voiceAuditionSchema.parse(select));
    assert.equal(selected.tts.voiceDirection,audition.target.baselineDirection);
    assert.match(readFileSync(identityPath,'utf8'),/voiceDirection/);
    }
    const identityPath=join(dir,'turn-identity.md');writeFileSync(identityPath,source);
    const candidates=['Kore','Puck','Charon'].map(voiceId=>({label:voiceId,reason:'Per-turn provenance',tts:{...voice,voiceId}}));
    const audition=await manageVoiceAudition(voiceAuditionSchema.parse({action:'create',identityPath,candidates,sampleText:'괜찮아요. 지금 나가요!',sampleTurns:[{text:'괜찮아요.',acting:{direction:'Calm.'}},{text:'지금 나가요!',acting:{direction:'Urgent.'}}]}));
    const saved=readFileSync(audition.auditionPath,'utf8'),tampered=JSON.parse(saved);
    tampered.sampleTurns[1].acting.direction='Sleepy.';writeFileSync(audition.auditionPath,JSON.stringify(tampered));
    const select=voiceAuditionSchema.parse({action:'select',auditionPath:audition.auditionPath,candidateId:'1',userSelection:'1번 목소리'});
    await assert.rejects(manageVoiceAudition(select),/voice settings or acting differ/);
    tampered.sampleTurns=JSON.parse(saved).sampleTurns;tampered.sampleText='다른 대사입니다.';writeFileSync(audition.auditionPath,JSON.stringify(tampered));
    await assert.rejects(manageVoiceAudition(select),/reproduce sampleText/);
    writeFileSync(audition.auditionPath,saved);
    assert.equal((await manageVoiceAudition(select)).selection.candidateId,'1');
  } finally {globalThis.fetch=originalFetch;config.geminiApiKey=originalKey;rmSync(dir,{recursive:true,force:true});}
});
