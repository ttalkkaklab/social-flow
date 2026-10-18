import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actingVerdict, actingVerdictSchema, parseActingObservation, reviewActing } from '../dist/tts-acting-review.js';
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

test('professional-band ratings need positive evidence, not a fabricated defect or a forced100',()=>{
 const observed={heardText:'Hello',complete:true,confidence:.95,confidenceReason:'The entire recording was clearly audible.',observedVoice:'Adult male, warm lower register and natural phrasing.',axes:Object.fromEntries(['accuracy','acting','naturalness','audioQuality','characterFit'].map(axis=>[axis,{evidence:'Actual words, vocal delivery and recording meet the requested professional standard.',issues:[],score:95}]))};
 const before=JSON.stringify(observed),parsed=parseActingObservation(observed),result=actingVerdict(parsed,1);
 assert.equal(result.score,95);assert.equal(result.evaluationStatus,'consistent');assert.equal(result.verdict,'PASS');
 assert.equal(result.verdictPolicyVersion,'acting-verdict-v2');assert.equal(JSON.stringify(observed),before);
 for (const evidence of ['?','??????????','Not observed.']) {
  const placeholder=structuredClone(observed);placeholder.axes.accuracy.evidence=evidence;
  assert.throws(()=>parseActingObservation(placeholder));
 }
 assert.throws(()=>parseActingObservation({...observed,observedVoice:'Voice not observed.'}));
 observed.axes.characterFit.score=94;
 assert.equal(actingVerdict(parseActingObservation(observed),1).evaluationStatus,'invalid_evidence');
 assert.equal(actingVerdict(parseActingObservation(observed),1).verdict,'FAIL');
 observed.axes.characterFit.score=95;observed.axes.characterFit.issues=[{start:0,end:.5,severity:'major',observation:'Voice contradicts the requested vocal identity.',correction:'Choose a matching voice.'}];
 assert.equal(actingVerdict(parseActingObservation(observed),1).verdict,'FAIL');
});

test('legacy speech review prepares host evidence without network or score', async () => {
 const dir=mkdtempSync(join(tmpdir(),'host-audio-')); const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>{throw new Error('External evaluator must never be called');};
  const audioPath=join(dir,'take.wav');writeFileSync(audioPath,pcmToWav(Buffer.alloc(48000,10),24000,1));
  const result=await reviewActing({audioPath,expectedText:'Hello',direction:'Friendly',requestedBy:'Review the voice',outputPath:dir});
  assert.equal(result.status,'not_reviewed');assert.equal(result.score,null);
  assert.equal(result.externalEvaluationCalls,0);assert.equal(result.provider,'host');
  assert.equal(result.mediaSha256.length,64);
 } finally {globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
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
