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
const meta = { version: 'scenario-v2', channel: 'test', topic: 'bowl', direction: 'D1' };
const pool = [{ id: 'father', source: 'identity.md' }, { id: 'child', source: 'identity.md' }];
function candidate() {
  return { kind: 'fiction', expression: 'mixed', engine: 'empathy', reveal: 'none',
    premise: 'A child notices a parent going hungry.', viewerExperience: 'Recognize care in a small action.',
    message: 'Care becomes mutual.', endingReason: 'The child reciprocates.', difference: 'Recognition through the empty pot.',
    cta: 'none', setups: [], cast: pool.map(c => ({ id: c.id, role: c.id, want: 'Protect the other', voice: 'Reserved', reason: 'The relationship changes' })),
    beats: ['훅', '전개 #1', '전개 #2', '전개 #3', '마무리', 'CTA'].map((item, i) => ({ item,
      expectation: 'The parent has eaten', change: 'The child notices', necessity: 'Build recognition',
      events: i === 5 ? [] : [{ kind: 'action', character: i % 2 ? 'child' : 'father', text: i % 2 ? 'The child passes a bowl.' : 'The father shares the rice.', basis: 'invented' }] })) };
}
const body = c => '```scenario-json\n' + JSON.stringify(c) + '\n```\n';
const run = (c, research) => checkScenarioV2(meta, body(c), research, { pool }).findings;
test('fiction works without research, a factual wow, a narrator or a second engine', () => {
  assert.deepEqual(run(candidate()), []);
});
test('a scenario in another language names the suggested beats in English', () => {
  const c = candidate();
  ['Hook', 'development #1', 'development #2', 'development #3', 'ending'].forEach((item, i) => { c.beats[i].item = item; });
  assert.deepEqual(run(c), []);
});
test('payoffs use actual narrative beat positions and repeated performance survives renamed intent', () => {
  const c = candidate();
  c.beats.splice(5, 0, {...c.beats[1], item:'The reply'});
  c.setups = [{ open:1, pay:6, detail:'empty pot', reinterpretation:'there was no supper' }];
  assert.deepEqual(run(c), []);
  c.beats[2] = {...c.beats[1], item:'Another name', change:'A different author explanation'};
  assert.match(JSON.stringify(run(c)), /Beat 3 repeats the preceding observable events/);
  c.setups[0].pay = 7;
  assert.match(JSON.stringify(run(c)), /existing narrative beats/); // CTA
  c.beats.length = 4; c.setups[0].pay = 5;
  assert.match(JSON.stringify(run(c)), /existing narrative beats/);
});
test('blind scenario prefix excludes private cast, evidence and author questions', t => {
  const d=mkdtempSync(path.join(tmpdir(),'scenario-prefix-'));
  t.after(() => rmSync(d,{recursive:true,force:true}));
  const c=candidate(), f=path.join(d,'scenario.md');
  c.beats[0].events=[{kind:'dialogue',character:'secret-father',to:'secret-child',basis:'invented',text:'Wait.',audience:{speaker:'Muffled voice'}}];
  writeFileSync(f,body(c));
  const r=spawnSync(process.execPath,[path.join(root,'check-scenario.js'),f,'--text','--through=1'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.stdout.trim(),'[beat-1/e1 · dialogue · Muffled voice] Wait.');
  const unfinished = structuredClone(c);
  unfinished.beats.splice(1,0,{events:[]});
  writeFileSync(f,body(unfinished));
  const partialRead = n => spawnSync(process.execPath,[path.join(root,'check-scenario.js'),f,'--text','--through='+n],{encoding:'utf8'});
  assert.equal(partialRead(1).stdout,r.stdout);
  assert.equal(partialRead(2).status,3);
  c.beats[0].events = [
    {kind:'action', withGroup:2, text:'The second lock clicks.', basis:'invented'},
    {kind:'dialogue',character:'father',to:'child',group:1,text:'Wait.',basis:'invented'},
    {kind:'dialogue',character:'child',to:'father',group:2,delivery:'off_screen',text:'It is open.',basis:'invented'},
  ];
  assert.deepEqual(run(c), []);
  writeFileSync(f, body(c));
  const read = n => spawnSync(process.execPath,[path.join(root,'check-scenario.js'),f,'--text','--through='+n],{encoding:'utf8'}).stdout;
  assert.doesNotMatch(read(1), /second lock|It is open/);
  assert.match(read(2), /second lock clicks[\s\S]*off_screen[\s\S]*It is open/);
  c.beats[0].events[0].withGroup=3;
  assert.match(JSON.stringify(run(c)), /withGroup must identify speech/);
  writeFileSync(f, body(c));
  const broken = spawnSync(process.execPath,[path.join(root,'check-scenario.js'),f,'--text','--through=1'],{encoding:'utf8'});
  assert.equal(broken.status,3); assert.equal(broken.stdout,'');
  c.beats[0].events = [{kind:'dialogue',character:'father',to:'child',delivery:'off_screen',text:'Open it.',basis:'invented'}];
  c.beats[1].events = [{...c.beats[0].events[0], delivery:'on_screen'}];
  assert.doesNotMatch(JSON.stringify(run(c)),/repeats the preceding observable/);
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
test('an unidentified listener does not require inventing a cast member or addressing the viewer', () => {
  const c = candidate();
  c.beats[0].events = [{kind:'dialogue',character:'father',to:'unidentified',text:'Anybody there?',basis:'invented'}];
  assert.deepEqual(run(c), []);
  c.beats[0].events[0].to = 'fathre';
  assert.match(JSON.stringify(run(c)), /unknown dialogue addressee/);
});
test('malformed events and speech in a visual candidate fail without throwing', () => {
  for (const expression of ['dialogue', 'narration']) {
    const malformed = candidate(); malformed.expression = expression; malformed.beats[0].events = [null];
    assert.match(JSON.stringify(run(malformed)), /events need kind and text/);
  }
  const c = candidate(); c.expression = 'visual';
  c.beats[0].events[0] = {kind:'dialogue',character:'father',to:'child',text:'Eat.',basis:'invented'};
  assert.match(JSON.stringify(run(c)), /must not contain speech/);
});
test('candidate CLI accepts one readable candidate despite creative metadata gaps but rejects unreadable input', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-guidance-'));
  try {
    mkdirSync(path.join(dir,'candidates')); writeFileSync(path.join(dir,'identity.md'),'# Character');
    writeFileSync(path.join(dir,'cast.json'),JSON.stringify({characters:pool}));
    const file=path.join(dir,'candidates/d1.md'), c=candidate();
    delete c.viewerExperience; delete c.message; c.beats.pop();
    writeFileSync(file,'---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D1\n---\n'+body(c));
    const cli=()=>spawnSync(process.execPath,[path.join(root,'check-scenario.js'),path.dirname(file),'--json'],{encoding:'utf8'});
    const result=cli(); assert.equal(result.status,0,result.stdout);
    assert.equal(JSON.parse(result.stdout).files.length,1);
    assert.ok(JSON.parse(result.stdout).warnings > 0);
    const authoring = () => spawnSync(process.execPath, [path.join(root,'check-scenario.js'), path.dirname(file), '--json','--authoring'], {encoding:'utf8'});
    assert.ok(JSON.parse(authoring().stdout).findings.some(f => f.code === 'hook_type_required' && f.level === 'bad'));
    c.primaryHookType = 'everyday_frustration';
    writeFileSync(file,'---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D1\n---\n'+body(c));
    assert.equal(authoring().status, 0);
    c.primaryHookType = 'empathy';
    writeFileSync(file,'---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D1\n---\n'+body(c));
    assert.ok(JSON.parse(authoring().stdout).findings.some(f => f.code === 'hook_type_invalid' && f.level === 'bad'));
    writeFileSync(file,'---\nversion: scenario-v2\n---\n```scenario-json\n{broken\n```');
    assert.equal(cli().status,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
