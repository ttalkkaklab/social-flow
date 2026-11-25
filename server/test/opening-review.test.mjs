import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runOpeningReview as run, readOpeningReviewSummary as summary} from '../dist/opening-review.js';

const settings = {surface:'Instagram Reels',audience:'home cooks'};
const option = (detail, direction='D1') => {
  const text = 'The lid reveals '+detail+'.';
  return {direction,primaryHookType:'cause_mystery',text:text+' Later the seal breaks.',opening:[{kind:'visual',start:0,end:2,text}]};
};
function assess(prepared, scores, extra={}, direction='D1') {
  const item = prepared.packets.find(p => p.direction === direction);
  const verdicts = scores.map((sum,i) => {
    const total = sum/10;
    return {reviewerId:item.sourceRevision+'-'+i,reasonToStay:'At the opening the lid has one visibly split row.',ratings:Array.from({length:5},(_,index) => {
      const score = Math.max(0,Math.min(2,total-2*index));
      return score ? {score,evidence:'At 1 second the split is still hidden.'} : {score};
    })};
  });
  return run({action:'record',stage:prepared.stage,runId:prepared.runId,
    ...(prepared.receipt ? {receipt:prepared.receipt} : {}),direction,
    sourceRevision:item.sourceRevision, packetDigest:item.packetDigest,policyVersion:prepared.policyVersion, verdicts,...extra});
}
const keys = p => p.packets.map(({direction,sourceRevision}) => ({direction,sourceRevision}));
const reserve = (rated,candidates,requestId,extra={}) => run({action:'reserve_revision',stage:rated.stage,runId:rated.runId,
  ...(rated.receipt ? {receipt:rated.receipt} : {}), candidates,requestId,expectedReceiptRevision:rated.receiptRevision,...extra});
const inline = (opts,extra={}) => run({action:'prepare',stage:'synopsis',synopses:opts,...settings,...extra});

test('blind synopsis quotes source cues, excludes the ending and threshold, validates IDs and reviewer evidence',async () => {
  const candidate = option('one split row');
  candidate.opening.push({kind:'sound',start:3,end:4,text:'Later the seal breaks.'});
  const p = await inline([candidate]);
  assert.doesNotMatch(JSON.stringify(p.packets[0].packet),/cause_mystery|Later|40|payoff/);
  assert.equal(p.editsUsed,0);
  await assert.rejects(inline([{...candidate,primaryHookType:'unknown'}]),/hook_type_invalid/);
  await assert.rejects(inline([{...candidate,opening:[{start:0,end:2,text:'Invented words',kind:'speech'}]}]),/must quote/);
  const ratings = Array.from({length:5},()=>({score:1}));
  await assert.rejects(assess(p,[0,0,0],{verdicts:['a','b','c'].map(reviewerId=>({reviewerId,ratings,reasonToStay:'The lid is visible.'}))}),/needs the cue/);
  await assert.rejects(assess(p,[0,0,0],{verdicts:['a','a','c'].map(reviewerId=>({reviewerId,ratings}))}),/distinct/);
  await assert.rejects(assess(p,[0,0,0],{verdicts:['a','b','c'].map(reviewerId=>({reviewerId,ratings:Array.from({length:5},()=>({score:0}))}))}),/witnessed reason/);
  const rated = await assess(p,[30,40,50]);
  assert.equal(rated.metric.value,40); assert.equal(rated.status,'pass');
  await assert.rejects(reserve(rated,keys(p),'invalid'),/Only the current/);
});
test('qualified exact-version observations take precedence; unrelated metrics keep editorial points',async () => {
  const prepare = () => inline([option('one split row')],{policy:{minStarts:100,observedCeiling:35}});
  const p = await prepare(), measured = {source:'channel report',sourceRevision:p.packets[0].sourceRevision,...settings,
    window:'release week',starts:100,endedBefore3:38,durationSeconds:15,denominator:'eligible starts',definition:'ended_before_3s'};
  const rated = await assess(p,[0,0,0],{measurement:measured});
  assert.equal(rated.status,'high'); assert.equal(rated.metric.unit,'percent'); assert.equal(rated.metric.value,38);
  for (const patch of [{starts:99},{sourceRevision:'0'.repeat(64)},{definition:'other'},{durationSeconds:2}]) {
    const fallback = await assess(await prepare(),[10,20,20],{measurement:{...measured,...patch}});
    assert.equal(fallback.status,'pass'); assert.equal(fallback.metric.unit,'points');
  }
});
test('a Reels-only statistic cannot certify a Stories or Facebook opening', async () => {
  for (const [surface, unit, status] of [['Instagram Reels', 'percent', 'pass'], ['Instagram Stories', 'points', 'high'], ['Facebook Reels', 'points', 'high']]) {
    const opened = await inline([option('one split row')], { surface, policy: { minStarts: 100, observedCeiling: 35 } });
    const measured = { source: 'owned channel report', sourceRevision: opened.packets[0].sourceRevision, surface, audience: settings.audience,
      window: 'one release week', starts: 100, durationSeconds: 15, denominator: 'eligible starts', definition: 'reels_skip_rate', ratePercent: 5 };
    const result = await assess(opened, [50, 50, 50], { measurement: measured });
    assert.equal(result.metric.unit, unit, surface);
    assert.equal(result.status, status, surface);
  }
});
test('an inferior editorial draft cannot reverse the ranking within the observed cohort', async () => {
  const versions = [
    { draft: 'a blue lid', editorial: 80, observed: 38 },
    { draft: 'a red lid', editorial: 50, observed: 70 },
    { draft: 'a white lid', editorial: 90 },
  ];
  let receipt;
  let original;
  for (const [index, version] of versions.entries()) {
    const p = await inline([option(version.draft)], receipt ? { receipt } : { policy: { minStarts: 100, observedCeiling: 35 } });
    const revision = p.packets[0].sourceRevision;
    original ??= revision;
    const measurement = { ...settings, source: 'qualified trial', sourceRevision: revision, window: 'one week',
      starts: 100, durationSeconds: 12, definition: 'ended_before_3s', endedBefore3: version.observed, denominator: 'eligible starts' };
    const rated = await assess(p, Array(3).fill(version.editorial), version.observed !== undefined ? { measurement } : {});
    assert.equal(rated.bestRevision, original);
    if (index < versions.length - 1) receipt = (await reserve(rated, keys(p), 'mixed-' + index)).receipt;
  }
});
function makeBoard(t) {
  const path = mkdtempSync(join(tmpdir(),'opening-review-')); t.after(()=>rmSync(path,{recursive:true,force:true}));
  const file = join(path,'scenes.js');
  const shot = (id,duration,action) => ({id,type:'points',scene:1,duration,visual:{action}});
  const data = {STORY:{primaryHookType:'cause_mystery'},STRUCTURE:{sequences:[],scenes:[{no:1}]},
    SCENES:[shot('s0001',2.5,'The lid opens.'), shot('s0002',0.5,'A drop falls.'), shot('s0003',7,'The secret ending.')]};
  const save = () => {
    const raw = Object.entries(data).map(([key,val]) => 'window.'+key+' = '+JSON.stringify(val)+';').join('\n');
    writeFileSync(file,raw); return {path,expectedSha256:createHash('sha256').update(raw).digest('hex')};
  };
  return {data,save,path,file};
}
test('shared limit, fourth synopsis handoff, idempotent concurrent board reservation and best opening recovery',async t => {
  let p = await inline([option('a plain lid')],{policy:{combined:true}}), result;
  for (let round=0;round<4;round++) {
    result = await assess(p,[50,50,50]);
    const reserved = await reserve(result,keys(p),'syn-'+round);
    assert.equal(reserved.slot,round+1);
    const candidate = option('a lid with mark '+round);
    p = await inline([candidate],{receipt:reserved.receipt});
  }
  result = await assess(p,[80,90,100]);
  assert.equal(result.status,'limit_reached'); assert.equal(result.editsRemaining,1);
  const best = result.bestDraft; assert.match(best.snapshot.synopsis.text,/a plain lid/);
  const saved = await reserve(result,keys(p),'no-fifth-synopsis'); assert.equal(saved.status,'limit_reached');
  const board = makeBoard(t);
  board.data.SCENES[0].shot={render:{mode:'still_camera',reason:'The producer prefers the initial render.'}};
  const io=board.save();
  p = await run({action:'prepare',stage:'storyboard',...io,receipt:result.receipt});
  assert.deepEqual(p.packets[0].packet.cues.map(c=>c.text),['The lid opens.','A drop falls.']);
  assert.doesNotMatch(JSON.stringify(p.packets[0].packet),/secret ending|cause_mystery/);
  result = await assess(p,[50,50,60],io);
  const reservations = await Promise.all([reserve(result,keys(p),'board-5',io),reserve(result,keys(p),'board-5',io)]);
  assert.deepEqual(reservations.map(r=>r.slot),[5,5]);
  board.data.SCENES[0].visual.action = 'The blank wall fills the frame.';
  const changed = board.save();
  assert.equal(summary(board.path).status,'stale');
  p = await run({action:'prepare',stage:'storyboard',...changed});
  const last = await assess(p,[60,70,80],changed);
  assert.equal(last.status,'limit_reached'); assert.equal(last.editsRemaining,0);
  assert.equal(last.bestDraft.snapshot.openingShots[0].visual.action,'The lid opens.');
  assert.equal(summary(board.path).metric.value,70);
  board.data.SCENES[0].shot.render.reason='A subsequent budget decision for the same picture.';
  board.save();
  assert.equal(summary(board.path).sourceRevision,last.sourceRevision);
  const patch=last.bestDraft.restorePatch;
  assert.deepEqual(patch.changes,[{path:['shotsById','s0001','visual','action'],operation:'set',
    expected:'The blank wall fills the frame.',value:'The lid opens.'}]);
  assert.doesNotMatch(JSON.stringify(last.bestDraft.snapshot),/producer prefers|render.reason/);
  board.data.SCENES[0].visual.action=patch.changes[0].value;
  const restored=board.save();
  assert.equal(summary(board.path).sourceRevision,last.bestRevision);
  const known=await run({action:'prepare',stage:'storyboard',...restored});
  assert.equal(known.packets[0].sourceRevision,last.bestRevision);
  assert.equal(known.editsRemaining,0); assert.equal(known.packets[0].status,'limit_reached');
  assert.equal(board.data.SCENES[0].shot.render.reason,'A subsequent budget decision for the same picture.');
  const ledger = JSON.parse(readFileSync(join(board.path,'opening-review.json'),'utf8'));
  assert.equal(ledger.ledger.reservations.length,5);
});
test('unresolved speech across three seconds is withheld and a timing-only repair consumes zero revisions',async t => {
  const board=makeBoard(t);
  board.data.SCENES[0]={id:'s0001',type:'points',scene:1,duration:5,shot:{videoDesign:{before:'A closed lid.'}},
    narration:[{id:'line1',speaker:'cook',tts:'The seal breaks in the final word.',estimatedSeconds:5}]};
  let io=board.save();
  let p=await run({action:'prepare',stage:'storyboard',...settings,...io});
  const early = p.packets[0];
  assert.doesNotMatch(JSON.stringify(early.packet),/final word/);
  const incomplete = await assess(p,[0,0,0],io); assert.equal(incomplete.status,'incomplete'); assert.equal(incomplete.editsUsed,0);
  board.data.SCENES[0].narration[0].estimatedSeconds=2;
  io=board.save(); p=await run({action:'prepare',stage:'storyboard',...io});
  assert.notEqual(early.packetDigest,p.packets[0].packetDigest);
  const repaired = await assess(p,[0,0,0],io); assert.equal(repaired.status,'pass'); assert.equal(repaired.editsUsed,0);
});

test('a reserved synopsis batch cannot switch its selected hook or edit an unlisted high candidate',async () => {
  let p=await inline([option('the first row','D1'),option('the second row','D2')]);
  const d1=await assess(p,[60,60,60]);
  const d2=await assess({...p,receipt:d1.receipt},[60,60,60],{},'D2');
  const reserved=await reserve(d2,keys(p).slice(0,1),'only-first');
  await assert.rejects(inline([{...option('the revised row'),primaryHookType:'predict_outcome'}],{receipt:reserved.receipt}),/hook_type_conflict/);
  await assert.rejects(inline([option('an unlisted edit','D2')],{receipt:reserved.receipt}),/reservation/);
  const passedSecond=await assess({...p,receipt:d1.receipt},[0,0,0],{},'D2');
  const onlyFirst=await reserve(passedSecond,keys(p).slice(0,1),'first-fails');
  await assert.rejects(inline([option('updated first'), option('unlisted passing sibling','D2')],{receipt:onlyFirst.receipt}),/reservation/);
});
test('visible title rules, performed actions, muted sound and referenced payoff determine review freshness',async t => {
  const board=makeBoard(t);
  board.data.STRUCTURE.sequences=[{id:'s1',scenes:[1,2,3],question:'Why is the seal split?',payoff:2}];
  board.data.SCENES[0]={id:'s0001',type:'points',scene:1,duration:1.25,summary:'A dumpling splits.',title:'SECRET EDITOR NOTE',
    visual:{overlay:'none',action:'A dumpling splits.'},shot:{render:{mode:'generated_video'}},sound:{effects:[{description:'A bell rings.',atSeconds:0}]}};
  board.data.SCENES[1]={id:'s0002',type:'points',scene:1,duration:1.75,summary:'Flour slides down the lid.',title:'Row 2',
    visual:{overlay:'html',action:'Flour slides down the lid.'},shot:{render:{mode:'still_camera'}}};
  board.data.SCENES[2]={id:'s0003',type:'points',scene:2,duration:4,summary:'A rivet leaks.'};
  board.data.SCENES.push({id:'s0004',type:'points',scene:3,duration:3,summary:'The shop closes.'});
  let io=board.save();
  const p=await run({action:'prepare',stage:'storyboard',...settings,playback:'muted',...io});
  const packet=p.packets[0].packet;
  assert.deepEqual(packet.cues.map(c=>c.text),['A dumpling splits.','Row 2','Flour slides down the lid.']);
  await assess(p,[0,0,0],io);
  board.data.SCENES[2].summary='The leak comes from a different pipe.'; board.save();
  assert.equal(summary(board.path).status,'stale');
});
test('only an explicitly distinct board run resets the counter and preserves the prior receipt',async t => {
  const board=makeBoard(t), io=board.save(), prepare={action:'prepare',stage:'storyboard',...settings,...io};
  const p=await run(prepare), high=await assess(p,[60,60,60],io);
  const hold=await reserve(high,keys(p),'edit',io);
  assert.equal(summary(board.path).pendingSlot,1);
  await assert.rejects(run({...prepare,runId:'another-run'}),/run/);
  const restart={...prepare,startNewRun:true,runId:'another-run',expectedReceiptRevision:hold.receiptRevision};
  const fresh=await run(restart);
  assert.equal(fresh.editsUsed,0);assert.equal(fresh.runId,'another-run');
  assert.equal((await run(restart)).receiptRevision,fresh.receiptRevision);
  const history=JSON.parse(readFileSync(join(board.path,'opening-review.json'),'utf8')).previousRuns;
  assert.equal(history.length,1);assert.equal(history[0].ledger.reservations.length,1);
});
test('verified speech alignment clips a crossing line to the audience-visible time window',async t => {
  const board=makeBoard(t);
  const wav=Buffer.alloc(44+4*8000*2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  const path=join(board.path,'take.wav'), tts='A cat';
  writeFileSync(path,wav);writeFileSync(join(board.path,'take.alignment.json'),JSON.stringify({alignment:{
    characters:[...tts],character_start_times_seconds:[0,0.5,2.6,3.1,3.4],character_end_times_seconds:[0.5,0.7,2.9,3.3,3.7]}}));
  board.data.SCENES[0]={id:'s0001',type:'points',scene:1,duration:4,
    narration:[{id:'line1',speaker:'cook',tts,audio:{path,sha256:createHash('sha256').update(wav).digest('hex'),generation:{text:tts}}}]};
  const io=board.save(),p=await run({action:'prepare',stage:'storyboard',...settings,...io});
  assert.equal(p.packets[0].packet.cues[0].text,'A c');
  assert.deepEqual(p.packets[0].missing,[]);
});

test('synopsis extraction starts at its first paragraph and reads consecutive sentences in source and playback order',async () => {
  const one=option('one row');
  const cue=(text,start=0,kind='visual')=>({kind,start,end:start+0.5,text});
  const closed='A vendor watches a closed lid in silence.';
  await assert.rejects(inline([{...one,text:closed+'\n\nTen minutes later, a hidden rivet breaks.',opening:[cue('a hidden rivet breaks.')]}]),/starting with the first sentence/);
  await assert.rejects(inline([{...one,text:closed+' The timer rings. A rivet breaks.',opening:[cue(closed),cue('A rivet breaks.',1)]}]),/consecutive/);
  await assert.rejects(inline([{...one,text:'One row splits. The seal leaks.',opening:[cue('The seal leaks.'),cue('One row splits.',1)]}]),/first sentence/);
  await assert.rejects(inline([{...one,text:'A vendor waits until the ending when a hidden rivet breaks.',opening:[cue('a hidden rivet breaks.')]}]),/performed clause/);
  const prose='Mina asks, “Which row split?” The vendor points to the left.\n\nThe hinge has a gap.';
  const p=await inline([{...one,text:prose,opening:[cue('Which row split?',0,'speech'),cue('The vendor points to the left.',1.5)]}]);
  assert.deepEqual(p.packets[0].packet.cues.map(c=>c.text),['Which row split?','The vendor points to the left.']);
  assert.doesNotMatch(JSON.stringify(p.packets[0].packet),/hinge|sourceMap/);
  await assert.rejects(inline([{...one,direction:' D2 '}]),/canonical direction/);
});
test('board handoff uses the selected scenario direction even when two candidates share a type',async t => {
  const board=makeBoard(t),io=board.save(), file=join(board.path,'scenario.md');
  const scenario=(direction,type='cause_mystery') => ['---','version: scenario-v2','direction: '+direction,'---','```scenario-json',JSON.stringify({primaryHookType:type}),'```',''].join('\n');
  writeFileSync(file,scenario('D2'));
  const onlyD1=await inline([option('the left row','D1')]);
  const prepare={action:'prepare',stage:'storyboard',...io,...settings};
  await assert.rejects(run({...prepare,receipt:onlyD1.receipt}),/direction/);
  const two=await inline([option('the left row','D1'),option('the right row','D2')]);
  await assert.rejects(run({...prepare,receipt:two.receipt,direction:'D1'}),/direction/);
  const p=await run({...prepare,receipt:two.receipt});
  assert.equal(p.packets[0].direction,'D2');
  const passed=await assess(p,[0,0,0],io,'D2');assert.equal(passed.status,'pass');
  writeFileSync(file,scenario('D2').replace('{"primaryHookType":','{  "primaryHookType" :  '));
  assert.equal(summary(board.path).status,'pass');
  assert.equal(summary(board.path).sourceRevision,passed.sourceRevision);
  writeFileSync(file,scenario('D1'));
  assert.equal(summary(board.path).status,'stale');
  await assert.rejects(assess(p,[0,0,0],io,'D2'),/direction/);
  writeFileSync(file,'bad');
  assert.equal(summary(board.path).status,'incomplete');
  await assert.rejects(run(prepare),/selected_scenario/);
  writeFileSync(file,scenario('D2','predict_outcome'));
  await assert.rejects(run(prepare),/hook_type_conflict/);
  const fresh=makeBoard(t),freshIo=fresh.save(); writeFileSync(join(fresh.path,'scenario.md'),scenario('D2'));
  assert.equal((await run({...prepare,...freshIo})).packets[0].direction,'D2');
});

test('a private shot summary cannot reveal an inferred relationship to blind readers',async t => {
  const board=makeBoard(t);
  const first=board.data.SCENES[0];
  first.summary='Mira recognizes the thief as her brother, a relationship the viewer learns only at the end.';
  first.shot={videoDesign:{before:'Mira stares at a hand.'}};
  delete first.visual;
  const prepare={action:'prepare',stage:'storyboard',...settings};
  let p=await run({...prepare,...board.save()});
  assert.doesNotMatch(JSON.stringify(p.packets[0].packet),/brother|relationship|thief/);
  assert.ok(p.packets[0].packet.cues.some(c=>c.text==='Mira stares at a hand.'));
  delete first.shot;
  p=await run({...prepare,...board.save()});
  assert.ok(p.packets[0].missing.some(s=>s.includes('s0001')));
  assert.equal(p.packets[0].status,'incomplete');
});

test('rendered card words reach blind readers and a changed on-screen source invalidates its verdict', async t => {
  const board = makeBoard(t);
  const first = { id: 's0001', type: 'points', scene: 1, duration: 3, title: 'Deadline',
    footnote: 'Before noon', visual: { picture: 'still', overlay: 'html' } };
  board.data.SCENES = [first];
  let io = board.save();
  const prepared = await run({ action: 'prepare', stage: 'storyboard', ...settings, ...io });
  assert.deepEqual(prepared.packets[0].packet.cues.map(c => c.text), ['Deadline', 'Before noon']);
  await assess(prepared, [0, 0, 0], io);
  first.footnote = 'After midnight';
  board.save();
  assert.equal(summary(board.path).status, 'stale');

  const cover = makeBoard(t);
  cover.data.SCENES = [{ ...first, duration: 6, type: 'cover', kicker: 'From the archive', stat: '17', statLabel: 'witnesses' }];
  io = cover.save();
  const waiting = await run({ action: 'prepare', stage: 'storyboard', ...settings, ...io });
  assert.deepEqual(waiting.packets[0].packet.cues.map(c => c.text), ['From the archive', 'Deadline']);
  assert.ok(waiting.packets[0].missing.some(reason => reason.includes('reveals')));
  assert.equal(waiting.packets[0].status, 'incomplete');

  const quote = makeBoard(t);
  quote.data.SCENES = [{ ...first, type: 'quote', speaker: 'Mira', role: 'Witness', text: 'I saw the seal break.' }];
  io = quote.save();
  const quoted = await run({ action: 'prepare', stage: 'storyboard', ...settings, ...io });
  assert.deepEqual(quoted.packets[0].packet.cues.map(c => c.text), ['Mira', 'Witness', 'I saw the seal break.']);
});

test('separate narration follows the compiled card pre-roll and invalidates a reviewed opening', async t => {
  const board = makeBoard(t);
  const shot = {id:'s0001',type:'points',duration:5,shot:{videoDesign:{before:'A loose hinge.'}},
    narration:[{id:'line1',speaker:'cook',tts:'Hear the hinge.',estimatedSeconds:2}]};
  board.data.SCENES = [shot];
  let io = board.save();
  const prepare = () => run({action:'prepare',stage:'storyboard',...settings,...io});
  const speech = prepared => prepared.packets[0].packet.cues.filter(cue => cue.kind === 'speech');
  const origin = await prepare();
  assert.deepEqual(speech(origin), [{kind:'speech',start:0,end:2,text:'Hear the hinge.'}]);
  assert.equal((await assess(origin,[0,0,0],io)).status,'pass');

  shot.edit = {pre:2}; io = board.save();
  assert.equal(summary(board.path).status,'stale');
  const crossing = await prepare();
  assert.notEqual(crossing.packets[0].packetDigest,origin.packets[0].packetDigest);
  assert.deepEqual(speech(crossing),[]);
  assert.equal((await assess(crossing,[0,0,0],io)).status,'incomplete');

  shot.narration[0].estimatedSeconds=1; io=board.save();
  assert.deepEqual(speech(await prepare()),[{kind:'speech',start:2,end:3,text:'Hear the hinge.'}]);
  delete shot.edit; shot.transition='dip'; io=board.save();
  assert.deepEqual(speech(await prepare()),[{kind:'speech',start:.3,end:1.3,text:'Hear the hinge.'}]);
  shot.visual={sync:true}; io=board.save();
  assert.deepEqual(speech(await prepare()),[{kind:'speech',start:0,end:1,text:'Hear the hinge.'}]);
});

test('a recorded opening quotes clip-local speech, checks source and groups, and never guesses words at the boundary', async t => {
  const board = makeBoard(t);
  const shot = {id:'s0001',type:'points',scene:1,duration:4,shot:{videoDesign:{before:'A green light.'}},
    visual:{source:'recording',clip:'recording.mp4'},narration:[],
    performance:[{kind:'dialogue',character:'cook',group:1},
      {kind:'action',withGroup:1,text:'The green light flashes.',durationSeconds:.4}]};
  board.data.SCENES=[{id:'s0002',type:'broll',after:1,duration:1},shot];
  const transcript = {shot:2,source:'recording.mp4',groups:[
    {speaker:'cook',text:'First click.',start:.5,end:1.5},
    {speaker:'cook',text:'Second click.',start:2,end:3},
    {speaker:'cook',text:'The ending.',start:3,end:3.75},
  ]};
  board.data.STORY.transcripts=[transcript];
  let io = board.save();
  const prepare = () => run({action:'prepare',stage:'storyboard',...settings,...io});
  const speech = prepared => prepared.packets[0].packet.cues.filter(cue => cue.kind === 'speech');
  const original = await prepare();
  assert.deepEqual(speech(original), [
    {kind:'speech',text:'First click.',start:.5,end:1.5},
    {kind:'speech',text:'Second click.',start:2,end:3},
  ]);
  assert.ok(original.packets[0].packet.cues.some(cue => cue.kind === 'visual' && cue.text === 'The green light flashes.' && cue.start === .5 && cue.end === .9));
  assert.equal((await assess(original,[0,0,0],io)).status,'pass');
  transcript.groups[0].text='A new click.'; io=board.save();
  assert.equal(summary(board.path).status,'stale');
  const revised=await prepare();
  assert.notEqual(revised.packets[0].packetDigest,original.packets[0].packetDigest);
  transcript.groups[1].end=3.2; transcript.groups[2].start=3.2; io=board.save();
  const crossing = await prepare();
  assert.deepEqual(speech(crossing),[{kind:'speech',text:'A new click.',start:.5,end:1.5}]);
  assert.equal((await assess(crossing,[0,0,0],io)).status,'incomplete');
  for (const corrupt of [
    () => {transcript.source='unrelated.mp4';},
    () => {transcript.source='recording.mp4'; transcript.groups[1].start=.7;},
    () => {transcript.groups[1].start=2; board.data.STORY.transcripts=[transcript,transcript];},
    () => {board.data.STORY.transcripts=[];},
  ]) {
    corrupt(); io=board.save();
    const invalid=await prepare();
    assert.deepEqual(speech(invalid),[]);
    assert.equal((await assess(invalid,[0,0,0],io)).status,'incomplete');
  }
});

test('an alluring false promise can clear the risk ceiling while remaining ineligible for restoration',async t => {
  const board=makeBoard(t),io=board.save();
  const p=await run({action:'prepare',stage:'storyboard',...settings,...io});
  const editorialFinding='The episode never reveals the promised source of the leak.';
  const recorded=await assess(p,[0,0,0],{...io,eligibleForRestore:false,editorialFinding});
  for (const result of [recorded,summary(board.path)]) {
    assert.equal(result.status,'pass'); assert.equal(result.metric.value,0);
    assert.equal(result.editorialValidity,'ineligible'); assert.equal(result.eligibleForRestore,false);
    assert.equal(result.bestRevision,undefined); assert.equal(result.editorialFinding,editorialFinding);
    assert.ok(result.findings.some(f => f.cue === editorialFinding));
    assert.equal(result.witnesses.length,3);
    assert.ok(result.witnesses.every(w => w.reasonToStay.includes('visibly split row')));
    assert.ok(result.findings.some(f => f.cue.includes('visibly split row')));
  }
  assert.equal(recorded.bestDraft,undefined);
  await assert.rejects(reserve(recorded,keys(p),'low-risk',io),/Only the current/);
  board.data.SCENES[0].visual.action='A different steamer opens.'; board.save();
  const stale=summary(board.path);
  assert.equal(stale.status,'stale'); assert.equal(stale.editorialValidity,'unverified'); assert.deepEqual(stale.witnesses,[]);
  const other=await inline([option('a blue lid')]);
  const fallback=await assess(other,[0,0,0],{eligibleForRestore:false});
  assert.match(fallback.editorialFinding,/excluded this revision from restoration/);
  assert.equal(fallback.eligibleForRestore,false);
});

test('a Korean synopsis maps consecutive action and speech into the first three seconds', async () => {
  const action = '찜기 뚜껑이 열린다.';
  const line = '이 줄만 터졌네.';
  const synopsis = { direction: 'D1', primaryHookType: 'cause_mystery',
    text: action + ' 모치가 말한다. “' + line + '”\n\n힌지 아래에 물이 맺힌다.',
    opening: [{ kind: 'visual', start: 0, end: 1, text: action },
      { kind: 'visual', start: 1, end: 1.5, text: '모치가 말한다.' },
      { kind: 'speech', start: 1.5, end: 2.8, text: line }] };
  const prepared = await inline([synopsis], { language: 'ko' });
  const packet = prepared.packets[0].packet;
  assert.equal(packet.language, 'ko');
  assert.deepEqual(packet.cues.map(cue => cue.text), [action, '모치가 말한다.', line]);
  assert.doesNotMatch(JSON.stringify(packet), /힌지|cause_mystery/);
});

test('recorded speech on a source-audio trim uses the first included source frame', async t => {
  const board = makeBoard(t), clip = 'clip.mp4';
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=black:s=16x16:r=4',
    '-f','lavfi','-i','sine=frequency=250','-t','5','-c:v','mpeg4','-c:a','aac',join(board.path,clip)]);
  board.data.SCENES=[{id:'s0001',type:'points',duration:4,visual:{source:'recording',clip},
    shot:{videoDesign:{before:'A loose hinge.'}},narration:[],sound:{audioSource:'video'},edit:{in:.501,out:4.75}}];
  board.data.STORY.transcripts=[{shot:1,source:clip,groups:[
    {start:.1,end:.5,text:'Outside the edit.'},{start:.75,end:1.25,text:'First included frame.'},{start:3.75,end:4.5,text:'Past three seconds.'},
  ]}];
  let io=board.save();
  const prepare = () => run({action:'prepare',stage:'storyboard',...settings,...io});
  const original=await prepare();
  assert.deepEqual(original.packets[0].packet.cues.filter(cue=>cue.kind==='speech'),[{kind:'speech',text:'First included frame.',start:0,end:.5}]);
  assert.equal((await assess(original,[0,0,0],io)).status,'pass');
  board.data.STORY.transcripts[0].groups[0].end=.8;
  board.data.STORY.transcripts[0].groups[1].start=.8;
  io=board.save();
  const clipped=await prepare();
  assert.equal((await assess(clipped,[0,0,0],io)).status,'incomplete');
  assert.doesNotMatch(JSON.stringify(clipped.packets[0].packet),/Outside the edit/);
});

test('the blind board plays only placed audience effects and retained source-video sound',async t => {
  const temp=makeBoard(t),path=join(temp.path,'storyboard');
  mkdirSync(path); const assets=join(temp.path,'assets/audio/sfx'); mkdirSync(assets,{recursive:true});
  const asset=join(assets,'bell.wav'),clip=join(path,'live.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=880:duration=3','-ar','16000',asset]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=16x16:r=10:d=3','-i',asset,'-t','3','-c:v','mpeg4','-c:a','aac',clip]);
  const wavHash=createHash('sha256').update(readFileSync(asset)).digest('hex'),clipHash=createHash('sha256').update(readFileSync(clip)).digest('hex');
  const shot={id:'s0001',type:'points',scene:1,duration:3,sound:{audioSource:'speech',effects:[]}};
  const data={STORY:{primaryHookType:'sensory_pattern'},SCENES:[shot],STRUCTURE:{scenes:[{no:1}],sequences:[]}};
  const prepare=async () => {
    const raw=Object.entries(data).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n');
    writeFileSync(join(path,'scenes.js'),raw);
    const pp=await run({action:'prepare',stage:'storyboard',path,...settings,expectedSha256:createHash('sha256').update(raw).digest('hex')});
    return pp.packets[0];
  };
  const bell={id:'bell',delivery:'post',sfx:'bell',description:'A bell rings.',trigger:'The lid opens.',atSeconds:0};
  const sounds=entry=>entry.packet.cues.filter(c=>c.kind==='sound').map(c=>c.text);
  shot.sound.effects=[bell];
  let entry=await prepare();assert.deepEqual(sounds(entry),[]);assert.equal(entry.status,'incomplete');
  const ignoredRevision=entry.sourceRevision;
  bell.description='Unmixed editorial notation.';assert.equal((await prepare()).sourceRevision,ignoredRevision);
  bell.description='A bell rings.';
  bell.audience={intent:'Surprise'};
  entry=await prepare(); assert.deepEqual(sounds(entry),[]);assert.equal(entry.status,'incomplete');
  const {boardClock}=createRequire(import.meta.url)('../../skills/storyboard/references/audience-effects.js');
  bell.audience.timingBasis=boardClock(data,path).basis(shot.id,bell);
  entry=await prepare();assert.deepEqual(sounds(entry),['A bell rings.']);assert.deepEqual(entry.missing,[]);
  bell.trigger='The lock opens.';assert.deepEqual(sounds(await prepare()),[]);
  delete bell.audience; bell.delivery='native';
  shot.visual={video:{clip}};
  assert.deepEqual(sounds(await prepare()),[]);
  shot.sound.audioSource='video';assert.deepEqual(sounds(await prepare()),['A bell rings.']);
  shot.visual.video.generateAudio=false;assert.deepEqual(sounds(await prepare()),[]);
  delete shot.visual.video.generateAudio;bell.delivery='input';
  assert.deepEqual(sounds(await prepare()),[]);
  shot.visual.video.speechBinding={mode:'audio_conditioned',videoSha256:clipHash,conditioningAudioPath:asset,conditioningAudioSha256:wavHash};
  assert.deepEqual(sounds(await prepare()),['A bell rings.']);
  shot.sound.effects=[];
  data.STRUCTURE.scenes[0].videoDirection={fps:10,audio:{mode:'conditioning',path:asset,cues:[{frame:2,action:'She reveals the secret recipe.'}]}};
  entry=await prepare();assert.deepEqual(sounds(entry),['Sound from the retained scene track.']);
  assert.doesNotMatch(JSON.stringify(entry.packet),/recipe/);
  shot.sound.audioSource='speech';assert.deepEqual(sounds(await prepare()),[]);
  shot.sound.audioSource='video';delete shot.visual.video.speechBinding;
  assert.deepEqual(sounds(await prepare()),[]);
  data.STRUCTURE.scenes[0].videoDirection.audio.mode='mix';
  assert.deepEqual(sounds(await prepare()),[]);
});
