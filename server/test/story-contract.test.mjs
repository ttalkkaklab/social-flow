import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkStory: inspectStory, storyHash, storySpeech } = require(path.join(root, 'story-contract.js'));
const { storyPerformance } = require(path.join(root, 'story-performance.js'));
// These unit cases explicitly exercise optional review diagnostics.
const checkStory = (win, options = {}) => inspectStory(win, { requireReview: true, ...options });
const ref = shot => ({ shot, group: 1, quote: ['Why is the box moving?', 'The table shakes.', 'A fan moves the table.', 'Check the table before the box.'][shot - 1] });
function fixture() {
  const w = { COMPREHENSION: { question: 'Why?', answer: 'A fan.', takeaway: 'Check the support.' },
    SCENES: [1, 2, 3, 4].map(i => ({ type: i === 1 ? 'cover' : 'points',
      beat: i === 1 ? 'hook' : i === 4 ? 'cta' : 'drip', narration: [{ tts: ref(i).quote, sub: ref(i).quote }] })),
    STORY: { version: 'story-v1', kind: 'fiction', viewerNeed: 'Solve the moving-box puzzle',
      thesis: 'Check the table before the box.', basis: 'An explicitly fictional demonstration',
      opening: ref(1), payoff: ref(3), ending: ref(4), endingReason: 'Return to the initial mistaken attribution',
      cta: 'none', beats: [1, 2, 3, 4].map(shot => ({ shot, change: `New clue ${shot}`, necessity: `Required step ${shot}` })) }
  };
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning', 'progression', 'payoff', 'grounding'].map(k => [k, { reason: `${k} evidence in fictional premise`, refs: [ref(3)] }])) };
  return w;
}
test('rejects fabricated evidence, invalid indices and an ending before payoff', () => {
  const w = fixture(); w.STORY.payoff.quote = 'invented';
  assert.match(checkStory(w).join(), /not in the referenced narration/);
  w.STORY.payoff = { ...ref(3), group: 0 };
  assert.match(checkStory(w).join(), /1-based/);
  w.STORY.payoff = ref(3); w.STORY.ending = ref(2);
  assert.match(checkStory(w).join(), /cannot precede/);
});
test('recorded insert speech uses playback order, not the broll array position', () => {
  const w = fixture();
  w.SCENES.push({type: 'broll', after: 0, narration: [], visual: {source: 'recording', clip: 'footage/insert.mp4'}});
  w.STORY.transcripts = [{shot: 5, source: 'footage/insert.mp4', groups: [{text: 'A real observation.', start: 0, end: 1}]}];
  w.STORY.beats.push({shot: 5, change: 'Observation', necessity: 'Shows the initial condition'});
  w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);
  assert.deepEqual(storySpeech(w).map(x => x.shot), [1, 5, 2, 3, 4]);
});
// story-v2: checkStory delegates to story-performance.js; meaning comes from ordered performance.
function board() {
  const w = { SCENES: [
    { type: 'cover', beat: 'hook', narration: [{tts: 'Have you eaten?', sub: 'Have you eaten?', speaker: 'child'}],
      performance: [{kind: 'dialogue', character: 'child', to: 'father', group: 1}] },
    { type: 'points', beat: 'drip', narration: [{tts: 'I ate earlier.', sub: 'I ate earlier.', speaker: 'father'}],
      performance: [{kind: 'dialogue', character: 'father', to: 'child', group: 1},
        {kind: 'action', character: 'child', text: 'The child sees the empty pot.'}] },
    { type: 'points', beat: 'cta', duration: 3, narration: [],
      performance: [{kind: 'action', character: 'child', text: 'The child shares the rice with the father.'}] }
  ], STORY: { version: 'story-v2', kind: 'fiction', expression: 'mixed', reveal: 'none', cta: 'none',
    viewerNeed: 'Recognize quiet care', thesis: 'Care becomes mutual.', basis: 'Invented family; consistent actions.',
    endingReason: 'A reciprocal action resolves the question.',
    cast: ['father', 'child'].map(id => ({ id, role: id, want: 'Protect the other', voice: 'Reserved', reason: 'The relationship changes', source: 'identity.md' })),
    beats: [1, 2, 3].map(shot => ({shot, change: 'Recognition develops', necessity: 'Connect care to action'})) }
  };
  const events = storyPerformance(w), ref = e => ({ shot: e.shot, event: e.event, quote: e.quote });
  w.STORY.opening = ref(events[0]); w.STORY.payoff = ref(events[2]); w.STORY.ending = ref(events[3]);
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning','progression','payoff','grounding','character'].map(k => [k, { reason: 'Observed reciprocal care', refs: [ref(events[3])] }])) };
  return w;
}
test('readers retain original indices through invalid slots and never invent unresolved speech', () => {
  const win = { STORY:{version:'story-v2'}, SCENES:[null,
    { narration:[null, {tts:'Actual line'}], performance:[null, {kind:'dialogue',group:2,character:'child'},
      {kind:'dialogue',group:99}, {kind:'action',text:{intent:'Not observable text'}}, {kind:'unknown',group:2}] },
    42, {type:'broll', after:1, narration:[{tts:'Insert line'}], performance:[{kind:'dialogue',group:1,character:'child'}]}] };
  const rows = storyPerformance(win);
  assert.deepEqual(rows.map(r=>[r.shot,r.event]), [[2,1],[2,2],[2,3],[2,4],[2,5],[4,1]]);
  assert.equal(rows[1].quote,'Actual line');
  assert.ok([0,2,3,4].every(i=>rows[i].unresolved === true && rows[i].quote === ''));
  assert.deepEqual(storySpeech(win).map(r=>[r.shot,r.group]), [[2,2],[4,1]]);
});
test('blind evidence retains listeners, stable references and interleaved events without author intent', () => {
  const w = board();
  w.SCENES[1].id = 's0042';
  Object.assign(w.SCENES[1].narration[0], { id: 's0042-l1', delivery: 'on_screen',
    acting: { context: 'Hidden future outcome', intent: 'Author explanation' } });
  const before = storyPerformance(w).filter(r => r.shotId === 's0042');
  assert.deepEqual(before.map(r => [r.kind, r.lineId, r.character, r.to, r.delivery]), [
    ['dialogue', 's0042-l1', 'father', 'child', 'on_screen'],
    ['action', undefined, 'child', undefined, undefined],
  ]);
  assert.doesNotMatch(JSON.stringify(before), /Hidden future|Author explanation|acting/);
  w.SCENES.unshift({ id: 's0099', performance: [{ kind: 'action', character: 'child', text: 'A knock.' }] });
  const after = storyPerformance(w).filter(r => r.shotId === 's0042');
  assert.equal(after[0].shot, before[0].shot + 1);
  assert.deepEqual(after.map(({ shot, ...row }) => row), before.map(({ shot, ...row }) => row));
});
test('unknown speakers, duplicate/missing speech, fabricated action quotes and malformed action text fail', () => {
  let w = board(); w.SCENES[0].narration[0].speaker = 'other';
  assert.match(checkStory(w).join(), /speaker/);
  w = board(); w.SCENES[0].performance.push({...w.SCENES[0].performance[0]});
  assert.match(checkStory(w).join(), /unique narration/);
  w = board(); w.STORY.ending.quote = 'They fly away.';
  assert.match(checkStory(w).join(), /exact observable/);
  w = board(); w.SCENES[2].performance[0].text = 12;
  assert.match(checkStory(w).join(), /action requires|exact observable/);
});
test('audience text hides production identities, uses audible words and preserves disclosed listeners', () => {
  const w = board(), s = w.SCENES[1];
  s.id = 'the-thief'; Object.assign(s.narration[0], {id:'father-confesses', sub:'The father confesses.', tts:'Stop.', delivery:'off_screen'});
  const read = () => storyPerformance(w, {audienceOnly:true})[1];
  assert.deepEqual(read(), { shot:2, event:1, kind:'dialogue', delivery:'off_screen', quote:'Stop.' });
  s.performance[0].audience = {speaker:'Distorted voice', listener:'Girl at the phone'};
  assert.equal(read().character, 'Distorted voice');
  assert.equal(read().to, 'Girl at the phone');
  assert.equal(storyPerformance(w)[1].character, 'father');
  assert.equal(storyPerformance(w)[1].quote, 'Stop.');
  assert.equal(storyPerformance(w)[1].displayText, 'The father confesses.');
});
test('events in one take and across cuts can carry independent non-overlapping dramatic beats', () => {
  const w = board();
  w.SCENES[1].id = 's0002';
  const beat = (start, end) => ({start, end, change:'She can see the empty pot.', necessity:'It gives her a reason to share.'});
  w.STORY.beats = [beat({shot:1,event:1},{shotId:'s0002',event:1}), beat({shotId:'s0002',event:2},{shot:3,event:1})];
  assert.deepEqual(inspectStory(w), []);
  w.STORY.beats[1].start.event = 1;
  assert.match(inspectStory(w).join(), /without overlap/);
  w.STORY.beats[1].start = {shotId:'missing',event:1};
  assert.match(inspectStory(w).join(), /existing event bounds/);
});
test('a reveal staged on a line needs a concurrent audience action before a blind prefix can pass it', t => {
  const dir = mkdtempSync(path.join(tmpdir(),'spoken-visual-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const w = board(), file = path.join(dir,'scenes.js'), s = w.SCENES[1];
  const direction = 'Show the stolen ring in the reflected hand.';
  s.narration[0].acting = {visual:direction};
  const read = n => {
    writeFileSync(file, 'window.STORY = ' + JSON.stringify(w.STORY) + ';\nwindow.SCENES = ' + JSON.stringify(w.SCENES));
    return execFileSync(process.execPath,[path.join(root,'check-story.js'),file,'--text','--through='+n],{encoding:'utf8'});
  };
  assert.match(inspectStory(w).join(), /no matching audience action/);
  assert.doesNotMatch(read(1), /ring/);
  assert.throws(() => read(2), /unrepresented visual cue/);
  s.performance.push({kind:'action',withGroup:1,text:'A ring glints in the mirror.',videoDirection:direction});
  assert.doesNotMatch(inspectStory(w).join(), /no matching audience action/);
  assert.match(read(2), /A ring glints in the mirror/);
  assert.doesNotMatch(read(2), /stolen ring/);
});
test('a public prefix keeps simultaneous action and speech together without disclosing a later group', t => {
  const dir = mkdtempSync(path.join(tmpdir(),'audience-prefix-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const w = board(), shot = w.SCENES[0];
  shot.narration.push({id:'the-thief', speaker:'father', tts:'Here I am.', sub:'The culprit speaks.'});
  shot.performance.unshift({kind:'action', character:'father', withGroup:2, text:'The caller removes the mask.'});
  shot.performance.push({kind:'dialogue', character:'father', to:'child', group:2});
  const file = path.join(dir,'scenes.js');
  writeFileSync(file, 'window.STORY = ' + JSON.stringify(w.STORY) + ';\nwindow.SCENES = ' + JSON.stringify(w.SCENES));
  const read = n => execFileSync(process.execPath,[path.join(root,'check-story.js'),file,'--text','--through='+n],{encoding:'utf8'});
  assert.match(read(1), /Have you eaten/);
  assert.doesNotMatch(read(1), /mask|Here I am|culprit|the-thief/);
  assert.match(read(2), /removes the mask/);
  assert.match(read(2), /Here I am/);
  assert.doesNotMatch(read(2), /culprit|the-thief|I ate earlier/);
  w.STORY.beats = [{start:{shot:1,event:2},end:{shot:1,event:1},change:'A voice becomes familiar.',necessity:'The child can ask about the mask.'}];
  assert.match(inspectStory(w).join(), /splits simultaneous evidence/);
  w.STORY.beats[0].end.event = 3;
  assert.doesNotMatch(inspectStory(w).join(), /splits simultaneous evidence/);
  shot.performance[0].withGroup = 9;
  assert.match(inspectStory(w).join(), /withGroup must identify/);
  writeFileSync(file, 'window.STORY = ' + JSON.stringify(w.STORY) + ';\nwindow.SCENES = ' + JSON.stringify(w.SCENES));
  assert.throws(() => read(1), /Repair its withGroup/);
  assert.doesNotMatch(JSON.stringify(storyPerformance(w,{audienceOnly:true})), /removes the mask/);
});
test('legacy whole-shot notes can be stored in array order when an insert plays earlier', () => {
  const w = board();
  w.SCENES.push({type:'broll',after:0,duration:1,performance:[{kind:'action',text:'An empty plate.'}]});
  w.STORY.beats.push({shot:4,change:'There is no food.',necessity:'Sets up the offer.'});
  assert.deepEqual(inspectStory(w),[]);
});
test('an action nobody performs is a world event, while a mistyped actor still fails', () => {
  const w = board(); w.SCENES[1].performance.push({ kind: 'action', text: 'The lid of the empty pot rattles.' });
  assert.deepEqual(checkStory(w, { requireReview: false }), []);
  w.SCENES[1].performance[2].character = 'chlid';
  assert.match(checkStory(w, { requireReview: false }).join(), /not cast: chlid/);
});
test('a call to an unidentified in-world listener is distinct from viewer address and mistyped cast', () => {
  const w = board(); w.SCENES[0].performance[0].to = 'unidentified';
  assert.deepEqual(checkStory(w, { requireReview: false }), []);
  assert.equal(storyPerformance(w)[0].to, 'unidentified');
  w.SCENES[0].performance[0].to = 'fathre';
  assert.match(checkStory(w, { requireReview: false }).join(), /addressee/);
});
test('reused shot transcripts cannot cite speech beyond the clip duration', () => {
  const w = board();
  w.SCENES[0].duration = 3;
  w.SCENES[0].visual = {reuse: {clip: 'recording.mp4'}};
  w.SCENES[0].narration = [];
  w.STORY.transcripts = [{shot: 1, source: 'recording.mp4', groups: [
    {text: 'Have you eaten?', speaker: 'child', start: 0, end: 3}
  ]}];
  assert.deepEqual(checkStory(w, {requireReview: false}), []);
  Object.assign(w.STORY.transcripts[0].groups[0], {start: 30, end: 35});
  assert.match(checkStory(w, {requireReview: false}).join(), /within the reused clip/);
});
