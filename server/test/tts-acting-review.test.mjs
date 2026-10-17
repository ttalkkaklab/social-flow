import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actingVerdict, actingVerdictSchema, parseActingObservation, reviewActing } from '../dist/tts-acting-review.js';
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

test('axis-bound observations preserve unfavorable numbers, scope and evidence without normalization',()=>{
 const input={heardText:'Hello',complete:true,confidence:.96,confidenceReason:'Every word was clearly audible.',axes:{
  accuracy:{evidence:'The words match the expected text with native pronunciation.',issues:[],score:100},
  acting:{evidence:'The second phrase is flat instead of the intended reassurance.',issues:[{start:1,end:2,severity:'major',observation:'Flat reassurance.',correction:'Reassure the listener.'}],score:80},
  naturalness:{evidence:'The phrasing and breath sound natural throughout.',issues:[],score:100},
  audioQuality:{evidence:'The recording is clear without noise or clipping.',issues:[],score:100},
 }};
 const parsed=parseActingObservation(input);
 assert.equal(parsed.acting,80);assert.equal(actingVerdict(parsed,5).score,94);
 assert.equal(actingVerdict(parsed,5).verdict,'FAIL');assert.deepEqual(parsed.issues[0].axes,['acting']);
 assert.match(parsed.evidence,/audioQuality: The recording is clear/);
 input.axes.accuracy.score=75;
 const inconsistent=parseActingObservation(input),outcome=actingVerdict(inconsistent,5);
 assert.equal(inconsistent.accuracy,75);assert.equal(outcome.evaluationStatus,'invalid_evidence');
 assert.equal(outcome.verdict,'FAIL');assert.equal(input.axes.accuracy.score,75);
 input.axes.accuracy.score=101;assert.throws(()=>parseActingObservation(input));
});

test('concise per-axis observations retain the existing valid flat verdict contract',()=>{
 const result=parseActingObservation({heardText:'Hello',complete:true,confidence:.95,confidenceReason:'The complete recording was clear.',axes:{
  accuracy:{evidence:'All words match.',issues:[],score:100},
  acting:{evidence:'Friendly greeting.',issues:[],score:100},
  naturalness:{evidence:'Natural rhythm.',issues:[],score:100},
  audioQuality:{evidence:'Clean recording.',issues:[],score:100},
 }});
 assert.equal(actingVerdict(result,1).verdict,'PASS');assert.equal(actingVerdict(result,1).score,100);
 assert.equal(result.evidence,'accuracy: All words match.\nacting: Friendly greeting.\nnaturalness: Natural rhythm.\naudioQuality: Clean recording.');
});

test('failed dispatched acting reviews record usage locally and in the episode ledger', async () => {
 const dir=mkdtempSync(join(tmpdir(),'acting-review-ledger-'));
 const previousFetch=globalThis.fetch, previousKey=config.geminiApiKey;
 let calls=0,dispatched;
 try {
  config.geminiApiKey='test-only-never-sent';
  globalThis.fetch=async(resource,options)=>{
   calls++;dispatched=JSON.parse(options?.body ?? await resource.text());
   throw new Error('mock failure after dispatch');
  };
  const audioPath=join(dir,'take.wav');
  writeFileSync(audioPath,pcmToWav(Buffer.alloc(24000*2,10),24000,1));
  const request={audioPath,expectedText:'Hello',direction:'Friendly',language:'en',requestedBy:'Please evaluate this audio',outputPath:dir};
  await assert.rejects(reviewActing(request),/mock failure after dispatch/);
  const properties=dispatched.generationConfig.responseJsonSchema.properties;
  for(const axis of ['accuracy','acting','naturalness','audioQuality']){
   const fields=Object.keys(properties.axes.properties[axis].properties);
   assert.ok(fields.indexOf('evidence')<fields.indexOf('score'));
   assert.ok(fields.indexOf('issues')<fields.indexOf('score'));
  }
  assert.match(properties.axes.properties.accuracy.description,/Pacing.*do not reduce word accuracy/);
  assert.match(properties.axes.properties.audioQuality.description,/unless the brief requests it/);
  assert.match(JSON.stringify(dispatched.systemInstruction),/independent audio performance critic/);
  assert.match(JSON.stringify(dispatched.systemInstruction),/never invent a defect/);
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
