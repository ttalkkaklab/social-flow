import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actingVerdict, actingVerdictSchema, reviewActing } from '../dist/tts-acting-review.js';
import { config } from '../dist/config.js';
import { pcmToWav } from '../dist/media-utils.js';
const review={accuracy:100,acting:90,naturalness:96,audioQuality:98,complete:true,confidence:.96,confidenceReason:'The entire recording was clearly audible.',heardText:'Hello',evidence:'Heard the entire clip; the second phrase is flat, phrasing is abrupt, and a quiet click is audible.',issues:[
 {start:1,end:2,axes:['acting','naturalness'],severity:'minor',observation:'Flat second phrase with an abrupt pause.',correction:'Connect the phrase with reassuring intonation.'},
 {start:2,end:2.1,axes:['audioQuality'],severity:'minor',observation:'Quiet click after the phrase.',correction:'Remove the click.'},
]};
test('acting score uses frozen weights and cannot pass a major defect or incomplete listening',()=>{
 assert.equal(actingVerdict(review,5).score,95.6);
 assert.equal(actingVerdict(review,5).verdict,'PASS');
 assert.equal(actingVerdict({...review,complete:false},5).verdict,'FAIL');
 assert.equal(actingVerdict({...review,confidence:.8},5).verdict,'FAIL');
 assert.equal(actingVerdict({...review,issues:[{start:1,end:2,severity:'major',observation:'Flat',correction:'Act phrase'}]},5).verdict,'FAIL');
 assert.equal(actingVerdict({...review,issues:[{start:1,end:2,severity:'critical',observation:'Missing words',correction:'Regenerate'}]},5).p0,1);
 assert.throws(()=>actingVerdict({...review,issues:[{start:1,end:6,severity:'minor',observation:'Noise',correction:'Clean'}]},5),/timestamps/);
 assert.equal(actingVerdictSchema.safeParse({...review,acting:NaN}).success,false);
});

test('unsupported live-style deductions invalidate the evaluation without changing scores',()=>{
 const inconsistent={...review,accuracy:75,acting:72,naturalness:71,audioQuality:74,confidence:.85,
  evidence:'All scripted words are accurate; pacing is slightly deliberate.',
  issues:[{start:1,end:2,axes:['acting','naturalness'],severity:'minor',observation:'Slightly deliberate pacing.',correction:'Connect the phrase.'}]};
 const before=JSON.stringify(inconsistent),result=actingVerdict(inconsistent,5);
 assert.equal(result.score,72.9);
 assert.equal(result.evaluationStatus,'invalid_evidence');
 assert.equal(result.verdict,'FAIL');
 assert.equal(result.p0,0,'review inconsistency must not invent an audio defect');
 assert.equal(result.consistencyFindings.length,4);
 assert.equal(JSON.stringify(inconsistent),before,'preserve the original model evidence and scores');
 assert.equal(actingVerdict({...review,accuracy:100,acting:100,naturalness:100,audioQuality:100,issues:[]},5).verdict,'PASS');
 assert.equal(actingVerdictSchema.safeParse({...review,issues:[{start:0,end:1,severity:'minor',observation:'Noise',correction:'Clean'}]}).success,false);
});

test('failed dispatched acting reviews record usage locally and in the episode ledger', async () => {
 const dir=mkdtempSync(join(tmpdir(),'acting-review-ledger-'));
 const previousFetch=globalThis.fetch, previousKey=config.geminiApiKey;
 let calls=0;
 try {
  config.geminiApiKey='test-only-never-sent';
  globalThis.fetch=async()=>{calls++;throw new Error('mock failure after dispatch');};
  const audioPath=join(dir,'take.wav');
  writeFileSync(audioPath,pcmToWav(Buffer.alloc(24000*2,10),24000,1));
  const request={audioPath,expectedText:'Hello',direction:'Friendly',language:'en',requestedBy:'Please evaluate this audio',outputPath:dir};
  await assert.rejects(reviewActing(request),/mock failure after dispatch/);
  const local=()=>readFileSync(join(dir,'review-events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(local().length,1);
  assert.equal(local()[0].ok,false);
  assert.equal(local()[0].tool,'tts_review_acting');
  mkdirSync(join(dir,'storyboard'));
  writeFileSync(join(dir,'storyboard','scenes.js'),'window.SCENES=[];');
  await assert.rejects(reviewActing(request),/mock failure after dispatch/);
  assert.equal(calls,2);
  assert.equal(local().length,2);
  const episode=JSON.parse(readFileSync(join(dir,'.work','events.jsonl'),'utf8').trim());
  assert.equal(episode.ok,false);
  assert.equal(episode.tool,'tts_review_acting');
 } finally {
  globalThis.fetch=previousFetch;config.geminiApiKey=previousKey;
  rmSync(dir,{recursive:true,force:true});
 }
});

test('character audio review sends evidence policy as system instructions and binds the requested target', async () => {
 const dir=mkdtempSync(join(tmpdir(),'character-review-policy-'));
 const previousFetch=globalThis.fetch,previousKey=config.geminiApiKey;
 let body;
 try {
  config.geminiApiKey='offline-test-never-sent';
  const observation={accuracy:100,acting:100,naturalness:100,audioQuality:100,characterFit:100,observedVoice:'Adult female in a clear middle register.',complete:true,confidence:.96,confidenceReason:'The full recording is clear and audible.',heardText:'Hello',evidence:'The entire recording is audible, with clear words and no observed defect.',issues:[]};
  globalThis.fetch=async(_url,init)=>{body=JSON.parse(init.body);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(observation)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:100}}));};
  const audioPath=join(dir,'take.wav');writeFileSync(audioPath,pcmToWav(Buffer.alloc(48000,10),24000,1));
  const characterTarget={vocalGender:'female',perceivedAge:'24',timbre:'clear middle register',pace:null,register:null,traits:[],habits:null,emotionalRange:null};
  const result=await reviewActing({audioPath,expectedText:'Hello',direction:'Conversational',language:'en',requestedBy:'Please evaluate character fit',outputPath:dir,characterTarget});
  const policy=JSON.stringify(body.systemInstruction || body.system_instruction);
  assert.match(policy,/untrusted data/);
  assert.match(policy,/Do not compress scores/);
  assert.match(policy,/Do not manufacture/);
  assert.equal(result.review.characterFit,100);
  assert.deepEqual(result.inputs.characterTarget,characterTarget);
  assert.ok(result.apiVersion);
  assert.equal(result.verdict,'PASS');
 } finally {globalThis.fetch=previousFetch;config.geminiApiKey=previousKey;rmSync(dir,{recursive:true,force:true});}
});
