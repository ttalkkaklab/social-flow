import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { characterVoiceTarget, compareVoiceMetadata } from '../dist/voice-target.js';
import { manageVoiceAudition, voiceAuditionSchema } from '../dist/voice-audition.js';
import { ttsSchema } from '../dist/character-tts.js';
import { actingVerdict } from '../dist/tts-acting-review.js';
import { pcmToWav } from '../dist/media-utils.js';
import { config } from '../dist/config.js';
const require = createRequire(import.meta.url);
const { compileActing } = require('../../skills/_shared/speech-contract.js');
const { generationVoiceErrors, voiceErrors } = require('../../skills/_shared/character-voice.js');
const source = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const doc = () => JSON.parse(source.match(/```json\s*\n([\s\S]*?)```/)[1]);
const markdown = value => '# Character\n\n```json\n' + JSON.stringify(value) + '\n```';
const voice = { engine:'gemini', model:'gemini-3.8-flash-tts',voiceId:'Kore',language:'ko',speed:1 };

test('confirmed voice targets carry age and acoustic fields without turning biography into controls', () => {
  const first = characterVoiceTarget(source);
  assert.equal(first.vocalGender, 'male');
  assert.match(first.baselineDirection, /24세|24/);
  assert.ok(first.traits.length);
  assert.doesNotMatch(first.baselineDirection, /Goal|Backstory|Traits|Fear/);
  const changed = doc(); changed.character.identity.age.value = '70세';
  assert.notEqual(characterVoiceTarget(markdown(changed)).baselineDirection,first.baselineDirection);
  changed.character.speech.timbre.value = '낮고 선명한 여성 중음';
  assert.equal(characterVoiceTarget(markdown(changed)).vocalGender,'female');
  const missing = characterVoiceTarget('```json\n{"character":{"name":"Mrs. Smith"}}\n```');
  assert.equal(missing.vocalGender,'unspecified');
  assert.ok(missing.warnings.length);
  assert.equal(characterVoiceTarget(source,{vocalGender:'neutral'}).vocalGender,'neutral');
  for (const timbre of ['not female; androgynous','여성적이지 않은 중성 음색']) {
    const ambiguous=doc();ambiguous.character.speech.timbre.value=timbre;
    assert.equal(characterVoiceTarget(markdown(ambiguous)).vocalGender,'unspecified');
  }
});

test('provider comparisons distinguish known conflicts from missing metadata', () => {
  const target = characterVoiceTarget(source);
  assert.ok(compareVoiceMetadata(target).unknown.length);
  const conflict = compareVoiceMetadata(target,{voiceId:'Kore',source:'gemini-library',retrievedAt:new Date().toISOString(),gender:'female',description:'70-year-old narrator'});
  assert.equal(conflict.conflicts.length,2);
  const match = compareVoiceMetadata(target,{voiceId:'Kore',source:'gemini-library',retrievedAt:new Date().toISOString(),gender:'male',description:'28-year-old actor'});
  assert.deepEqual(match.matched,['vocalGender','ageDescriptionProximity']);
  assert.ok(match.unknown.some(value=>/actual audio/.test(value)));
  for (const [wanted,reported] of [[8,18],[14,24],[59,69]]) {
    const comparison=compareVoiceMetadata({...target,perceivedAge:`${wanted}세`},{voiceId:'Kore',source:'gemini-library',retrievedAt:new Date().toISOString(),age:`${reported}세`});
    assert.equal(comparison.matched.includes('ageDescriptionProximity'),false);
    assert.ok(comparison.conflicts.length);
  }
});

test('stable Gemini voice identity survives scene emotion and exact request provenance', () => {
  for (const model of ['gemini-3.8-flash-tts','gemini-2.5-flash-preview-tts']) {
    const pinned = {...voice,model,voiceDirection:'Mature female, low clear register.'};
    assert.deepEqual(voiceErrors(pinned),[]);
    assert.equal(ttsSchema.safeParse(pinned).success,true);
    for (const acting of [undefined,{direction:'urgent but restrained'}]) {
      const line = {tts:'괜찮아요.',...(acting?{acting}:{})};
      const plan = compileActing(line.tts,acting,pinned);
      const style = plan.generation.turns?.[0].style || plan.generation.stylePrompt;
      assert.match(style,/Mature female/);
      if (acting) assert.match(style,/urgent but restrained/);
      const proof={generator:plan.generator,text:line.tts,language:'ko',voiceSettings:plan.generation};
      assert.deepEqual(generationVoiceErrors(pinned,proof,line),[]);
      const tampered=structuredClone(proof);
      if(tampered.voiceSettings.turns) delete tampered.voiceSettings.turns[0].style;
      else delete tampered.voiceSettings.stylePrompt;
      assert.match(generationVoiceErrors(pinned,tampered,line).join(),/differs/);
    }
  }
});

test('unsupported or oversized identity controls fail rather than silently dropping a baseline', () => {
  const eleven={...voice,engine:'elevenlabs',model:'eleven_v4',voiceId:'actor',voiceDirection:'Do not insert biography into audio tags.'};
  assert.ok(voiceErrors(eleven).length);
  assert.equal(ttsSchema.safeParse(eleven).success,false);
  assert.throws(()=>compileActing('Hi',{direction:'x'.repeat(200)},{...voice,voiceDirection:'y'.repeat(400)}),/500/);
});

test('audition planning is read-only and adds identity controls to the same generation compiler', async () => {
  const dir=mkdtempSync(join(tmpdir(),'voice-target-'));
  try {
    const identityPath=join(dir,'identity.md');writeFileSync(identityPath,source);
    const candidates=['Kore','Puck','Charon'].map(voiceId=>({label:voiceId,reason:'Test real catalog IDs',tts:{...voice,voiceId}}));
    const args=voiceAuditionSchema.parse({action:'plan',identityPath,candidates,sampleText:'괜찮아요. 제가 여기 있어요.'});
    const plan=await manageVoiceAudition(args);
    assert.equal(plan.review,'not_reviewed');
    assert.match(plan.candidates[0].compiled.generation.turns[0].style,/24/);
    assert.equal(plan.candidates[0].tts.voiceDirection,plan.target.baselineDirection);
    assert.equal(readFileSync(identityPath,'utf8'),source);
    const lengthy=doc();lengthy.character.speech.timbre.value='Low resonant voice. '.repeat(30);
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

test('perfect transcript scores cannot compensate for a wrong character voice', () => {
  const review={accuracy:100,acting:100,naturalness:100,audioQuality:100,characterFit:90,complete:true,confidence:.98,heardText:'Hello',observedVoice:'Young and bright female voice.',evidence:'Complete audio heard; audible timbre contradicts the requested older male voice.',confidenceReason:'Clear recording and full coverage.',issues:[{start:0,end:1,axes:['characterFit'],severity:'major',observation:'Voice is a young female rather than an older male.',correction:'Choose an appropriate base voice.'}]};
  assert.equal(actingVerdict(review,2).score,96);
  assert.equal(actingVerdict(review,2).verdict,'FAIL');
  review.characterFit=100;review.issues=[];
  assert.equal(actingVerdict(review,2).verdict,'PASS');
  review.accuracy=75;
  review.issues=[{start:0,end:1,axes:['accuracy'],severity:'major',observation:'Scores compressed per instructions. No actual accuracy defects present.',correction:'None.'}];
  assert.equal(actingVerdict(review,2).evaluationStatus,'invalid_evidence');
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
