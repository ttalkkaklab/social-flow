import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkScenarioV2 } = require(path.join(root, 'scenario-v2.js'));
const { checkStory, storyHash } = require(path.join(root, 'story-contract.js'));
const { storyPerformance } = require(path.join(root, 'story-performance.js'));
const meta = { version: 'scenario-v2', channel: 'test', topic: 'bowl', direction: 'D1' };
const pool = [{ id: 'father', source: 'identity.md' }, { id: 'child', source: 'identity.md' }];
function candidate() {
  return { kind: 'fiction', expression: 'mixed', engine: 'empathy', reveal: 'none',
    premise: 'A child notices a parent going hungry.', viewerExperience: 'Recognize care in a small action.',
    message: 'Care becomes mutual.', endingReason: 'The child reciprocates.', difference: 'Recognition through the empty pot.',
    cta: 'none', setups: [], cast: pool.map(c => ({ id: c.id, role: c.id, want: 'Protect the other', voice: 'Reserved', reason: 'The relationship changes' })),
    beats: ['훅', '전개 #1', '전개 #2', '전개 #3', '마무리', 'CTA'].map((item, i) => ({ item,
      expectation: 'The parent has eaten', change: 'The child notices', necessity: 'Build recognition',
      events: i === 5 ? [] : [{ kind: 'action', character: i % 2 ? 'child' : 'father', text: 'Shares the last bowl of rice.', basis: 'invented' }] })) };
}
const body = c => '```scenario-json\n' + JSON.stringify(c) + '\n```\n';
const run = (c, research) => checkScenarioV2(meta, body(c), research, { pool }).findings;
test('fiction works without research, a factual wow, a narrator or a second engine', () => {
  assert.deepEqual(run(candidate()), []);
});
test('factual and adapted claims cannot bypass evidence; inventions stay explicitly marked', () => {
  const c = candidate(); c.kind = 'evidence';
  assert.match(JSON.stringify(run(c)), /invented events/);
  c.kind = 'fiction'; c.beats[0].events[0].basis = 'fact'; c.beats[0].events[0].claims = [1];
  assert.match(JSON.stringify(run(c)), /Verified/);
  const research = '## Verified\n| # | Claim | Source |\n|---|---|---|\n| 1 | Real event | official record |\n';
  assert.deepEqual(run(c, research), []);
  c.kind = 'adapted'; assert.match(JSON.stringify(run(c, research)), /adaptationBoundary/);
  c.adaptationBoundary = 'First event documented; the family and dialogue are invented.';
  assert.deepEqual(run(c, research), []);
});
test('unknown cast, missing events and unearned held reveals fail', () => {
  const c = candidate(); c.beats[0].events[0].character = 'stranger';
  assert.match(JSON.stringify(run(c)), /not cast/);
  c.beats[0].events = []; assert.match(JSON.stringify(run(c)), /observable/);
  c.reveal = 'held'; assert.match(JSON.stringify(run(c)), /planted/);
});
test('candidate CLI accepts three distinct stories sharing an engine and rejects broken pool paths', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-v2-'));
  try {
    mkdirSync(path.join(dir, 'candidates')); writeFileSync(path.join(dir, 'identity.md'), '# Character');
    writeFileSync(path.join(dir, 'cast.json'), JSON.stringify({ characters: pool }));
    for (let i = 1; i <= 3; i++) writeFileSync(path.join(dir, 'candidates', `d${i}.md`),
      `---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D${i}\nfrozen:\n---\n` + body({ ...candidate(), premise: 'Distinct situation ' + i }));
    const cli = () => spawnSync(process.execPath, [path.join(root, 'check-scenario.js'), path.join(dir, 'candidates'), '--json'], { encoding: 'utf8' });
    assert.equal(cli().status, 0, cli().stdout);
    writeFileSync(path.join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'father', source: 'missing.md' }] }));
    assert.equal(cli().status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
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
    endingReason: 'A reciprocal action resolves the question.', cast: candidate().cast.map(c => ({...c, source: 'identity.md'})),
    beats: [1, 2, 3].map(shot => ({shot, change: 'Recognition develops', necessity: 'Connect care to action'})) }
  };
  const events = storyPerformance(w), ref = e => ({ shot: e.shot, event: e.event, quote: e.quote });
  w.STORY.opening = ref(events[0]); w.STORY.payoff = ref(events[2]); w.STORY.ending = ref(events[3]);
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning','progression','payoff','grounding','character'].map(k => [k, { reason: 'Observed reciprocal care', refs: [ref(events[3])] }])) };
  return w;
}
test('dialogue and silent action deliver meaning without a spoken thesis', () => {
  assert.deepEqual(checkStory(board()), []);
});
test('whole-story extraction attributes speech and includes silent actions, never author intent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'performance-'));
  try {
    const w = board(); writeFileSync(path.join(dir, 'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const r = spawnSync(process.execPath, [path.join(root, 'check-story.js'), dir, '--text'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /dialogue · child → father/);
    assert.match(r.stdout, /empty pot/); assert.doesNotMatch(r.stdout, /Care becomes mutual/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('unknown speakers, duplicate/missing speech and fabricated action quotes fail', () => {
  let w = board(); w.SCENES[0].narration[0].speaker = 'other';
  assert.match(checkStory(w).join(), /speaker/);
  w = board(); w.SCENES[0].performance.push({...w.SCENES[0].performance[0]});
  assert.match(checkStory(w).join(), /unique narration/);
  w = board(); w.STORY.ending.quote = 'They fly away.';
  assert.match(checkStory(w).join(), /exact observable/);
});
test('action and cast edits stale the review; camera changes do not', () => {
  for (const edit of [w => w.SCENES[2].performance[0].text += ' Again.', w => w.STORY.cast[0].want = 'Hide the food',
    w => w.SCENES[0].narration[0].speaker = 'father', w => w.SCENES[1].visual = {action: 'Changed action'}]) {
    const w = board(); edit(w); assert.match(checkStory(w).join(), /stale/);
  }
  const w = board(); w.SCENES[0].visual = {camera: {movement: 'dolly'}};
  assert.deepEqual(checkStory(w), []);
});
test('all-visual fiction can be reviewed and live transcript errors fail cleanly', () => {
  const w = board();
  w.SCENES.forEach((s, i) => { s.duration = 3; s.narration = []; s.performance = [{kind: 'action', character: i === 0 ? 'father' : 'child', text: 'The family exchanges food and looks.'}]; });
  w.STORY.expression = 'visual';
  for (const [key, shot] of [['opening',1], ['payoff',2], ['ending',3]]) w.STORY[key] = {shot,event:1,quote:w.SCENES[shot-1].performance[0].text};
  assert.deepEqual(checkStory(w, {requireReview:false}), []);
  w.STORY.transcripts = [{shot:2,groups:{}}];
  assert.match(checkStory(w, {requireReview:false}).join(), /transcript/);
});

test('malformed event text and invalid expression fail without throwing', () => {
  const w = board(); w.SCENES[2].performance[0].text = 12;
  assert.match(checkStory(w).join(), /action requires|exact observable/);
  const c = candidate(); c.expression = 'visual';
  c.beats[0].events[0] = {kind:'dialogue',character:'father',to:'child',text:'Eat.',basis:'invented'};
  assert.match(JSON.stringify(run(c)), /must not contain speech/);
});

test('wording extraction preserves speaker and addressee while excluding actions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'speech-only-'));
  try {
    const w = board(); writeFileSync(path.join(dir, 'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const r = spawnSync(process.execPath, [path.join(root, 'check-story.js'), dir, '--text', '--speech'], {encoding:'utf8'});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /child → father/); assert.doesNotMatch(r.stdout, /empty pot|shares the rice/);
  } finally { rmSync(dir, {recursive:true,force:true}); }
});

test('scene checker permits a visual close but requires the action in the production plan', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'visual-close-'));
  try {
    const w = board();
    const save = () => writeFileSync(path.join(dir,'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const cli = () => spawnSync(process.execPath,[path.join(root,'check-scenes.js'),dir,'--json'],{encoding:'utf8'});
    save(); let result = cli();
    assert.notEqual(result.status, 3, result.stderr);
    assert.doesNotMatch(result.stdout, /last narrated shot has no narration/);
    assert.match(result.stdout, /performance action is missing/);
    w.SCENES.forEach(s => {s.visual = {action:s.performance.filter(e=>e.kind==='action').map(e=>e.text).join(' ')};});
    save(); result = cli();
    assert.doesNotMatch(result.stdout, /performance action is missing/);
    // Other visual/format contracts still fail this deliberately minimal fixture.
    assert.equal(result.status,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
