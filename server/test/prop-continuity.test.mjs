import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import api from '../../skills/storyboard/references/prop-continuity.js';
import cli from '../../skills/storyboard/references/prop-sheet-cli.js';
import { applyPatch, storyboardApplySchema, serializeBoard, readBoard } from '../dist/storyboard.js';

import { fixture } from './fixtures/prop-board.mjs';
import { TOOLS } from '../dist/tools.js';
import { execFileSync } from 'node:child_process';
import still from '../../skills/storyboard/references/assemble-bg-prompt.js';
const bad = win => api.check(win).filter(f => f.level === 'bad');
test('loan keeps ownership, changes custody, and has an exact boundary', () => {
  const win = fixture(); assert.deepEqual(bad(win), []);
  assert.equal(api.stateAt(win, 'watch', { day: 1, order: 2 }, 'before').holderId, 'a');
  assert.deepEqual(api.stateAt(win, 'watch', { day: 1, order: 2 }), { ownerId: 'a', holderId: 'b', location: 'right hand', condition: 'intact' });
});
test('flashbacks and shot reorders never rewrite the story', () => {
  const win = fixture(), before = api.snapshot(win, 0); win.SCENES.reverse();
  assert.deepEqual(api.snapshot(win, 1), before);
  assert.equal(api.snapshot(win, 0)[0].before.holderId, 'a');
  assert.equal(api.stateAt(win, 'watch', { day: 0, order: 0 }).ownerId, 'unknown');
});
test('stale sender is rejected, including reversed input event order', () => {
  const win = fixture(); win.SB_DOC.propContinuity.events[0].from.holderId = 'b';
  assert.match(JSON.stringify(bad(win)), /Stale from.holderId/);
  assert.throws(() => api.snapshot(win, 0), /Stale/);
});
test('atomic gift can change owner and holder together', () => {
  const win = fixture(), e = win.SB_DOC.propContinuity.events[0]; e.kind = 'transfer';
  e.from.ownerId = 'a'; e.to.ownerId = 'b'; assert.deepEqual(bad(win), []);
  assert.equal(api.stateAt(win, 'watch', e.at).ownerId, 'b');
});
test('loss preserves ownership and distinguishes unknown from none', () => {
  const win = fixture(), e = win.SB_DOC.propContinuity.events[0]; e.kind = 'lose';
  e.to = { holderId: 'unknown', location: 'unknown' }; assert.deepEqual(bad(win), []);
  assert.equal(api.stateAt(win, 'watch', e.at).ownerId, 'a');
  e.kind = 'put_down'; e.to = { holderId: null, location: 'table' }; assert.deepEqual(bad(win), []);
});
test('duplicate events, unknown characters, removed shots and missing initials fail', () => {
  for (const mutate of [
    w => w.SB_DOC.propContinuity.events.push(structuredClone(w.SB_DOC.propContinuity.events[0])),
    w => w.SB_DOC.characters.pop(),
    w => w.SCENES.shift(),
    w => w.SB_DOC.propContinuity.initial.splice(0),
    w => w.SB_DOC.propContinuity.events[0].at = { day: 1, order: 0 },
    w => w.SB_DOC.propContinuity.events[0].to.ownerId = 'b',
    w => w.SCENES[0].visual.propUsage[0].expectedEnd = { holderId: 'a' },
    w => w.SCENES[0].visual.propUsage = [],
  ]) { const win = fixture(); mutate(win); assert.ok(bad(win).length); }
});
test('condition cannot recover during an ordinary move', () => {
  const win = fixture(), e = win.SB_DOC.propContinuity.events[0];
  e.kind = 'move'; e.from.condition = 'intact'; e.to.condition = 'repaired';
  assert.match(JSON.stringify(bad(win)), /Condition changes/);
  e.kind = 'repair'; e.from = {condition:'intact'}; e.to = {condition:'repaired'}; assert.deepEqual(bad(win), []);
});
test('legacy ownership never invents custody or history', () => {
  const win = { SB_DOC: { characters: [{ id: 'a' }], props: [{ id: 'p', characterId: 'a' }] }, SCENES: [] };
  assert.equal(api.check(win)[0].level, 'warn');
  assert.deepEqual(api.stateAt(win, 'p', { day: 1, order: 0 }), { ownerId: 'a', holderId: 'unknown', location: 'unknown', condition: 'unknown' });
  assert.deepEqual(api.check({ SCENES: [] }), []);
});
test('unowned and offscreen props are legal', () => {
  const win = fixture(); win.SB_DOC.propContinuity.initial[0].state.ownerId = null;
  win.SCENES[0].visual.propUsage[0].visible = false;
  assert.deepEqual(bad(win), []); assert.equal(api.prompt(win, 0), '');
});
test('invalid ledger shapes produce findings instead of exceptions', () => {
  for (const ledger of [null, [], {}, {version: 2}, {version: 1, timelineId:'t', initial:[null], events:[null]}]) {
    const win = fixture(); win.SB_DOC.propContinuity = ledger; assert.ok(bad(win).length);
  }
});
test('prompt snapshot pins appearance, references and before/after states', () => {
  const win = fixture(); win.SB_DOC.props[0].references = [{ path:'watch-v1.png', version:'v1' }];
  const snap = api.snapshot(win, 0)[0]; assert.equal(snap.appearanceVersion, 'v1');
  assert.equal(snap.references[0].path, 'watch-v1.png'); assert.match(api.prompt(win, 0), /right hand/);
});
test('MCP schema exposes propSheet and rejects invalid ledger at the shared gate', () => {
  const win = fixture(), sheet = { props: win.SB_DOC.props, continuity: win.SB_DOC.propContinuity };
  assert.ok(storyboardApplySchema.safeParse({path:'.', propSheet:sheet}).success);
  sheet.continuity.events[0].from.holderId = 'b';
  const result = applyPatch(win, {path:'.', propSheet:sheet, dryRun:true, draft:true});
  assert.match(JSON.stringify(result.findings), /Stale from/);
});
test('CLI validates atomically, refuses stale writes, backs up approval, preserves globals', () => {
  const dir = mkdtempSync(join(tmpdir(), 'props-'));
  try {
    const file = join(dir, 'scenes.js'), edit = join(dir, 'edit.json');
    const win = fixture(); win.MUSIC = { title: 'untouched' };
    writeFileSync(file, '// approved: old\n' + serializeBoard(win));
    const original = readFileSync(file, 'utf8'), read = cli.run([dir]);
    writeFileSync(edit, JSON.stringify(read.sheet));
    assert.throws(() => cli.run([dir,'--apply',edit,'--expected-sha256','old']), /head_moved/);
    assert.equal(readFileSync(file, 'utf8'), original);
    const result = cli.run([dir,'--apply',edit,'--expected-sha256',read.sha256]);
    assert.equal(readFileSync(result.backup,'utf8'), original);
    assert.doesNotMatch(readFileSync(file,'utf8'), /approved:/);
    assert.deepEqual(readBoard(dir).win.MUSIC, win.MUSIC);
    assert.equal(cli.run([dir,'--at','1:3','--character','b']).states.length, 1);
    const invalid = structuredClone(read.sheet); invalid.continuity.events[0].from.holderId = 'b';
    writeFileSync(edit, JSON.stringify(invalid));
    assert.throws(() => cli.run([dir,'--apply',edit,'--expected-sha256',result.sha256]), /Stale/);
    assert.equal(cli.run([dir]).sha256, result.sha256);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('action rules reject ownerless loans, no-op recipients and disguised custody transfers', () => {
  for (const sender of [null, 'unknown']) {
    const win = fixture(); win.SB_DOC.propContinuity.initial[0].state.holderId = sender;
    win.SB_DOC.propContinuity.events[0].from.holderId = sender;
    assert.match(JSON.stringify(bad(win)), /known current holder/);
  }
  for (const kind of ['damage','repair','move']) {
    const win = fixture(), e = win.SB_DOC.propContinuity.events[0];
    e.kind = kind; e.from.condition = 'intact'; e.to.condition = 'broken';
    assert.match(JSON.stringify(bad(win)), /cannot change holderId/);
  }
  const win = fixture(); win.SB_DOC.propContinuity.events[0].to.holderId = 'a';
  assert.match(JSON.stringify(bad(win)), /Recipient must differ/);
});
test('unknown and duplicate character identities fail explicitly', () => {
  for (const id of ['unknown','a','']) {
    const win = fixture();win.SB_DOC.characters.push({id});
    assert.match(JSON.stringify(bad(win)), /unique non-reserved/);
  }
});
test('appearance-only props reach snapshots and still prompts without invented custody', () => {
  const win = { SB_DOC: {props:[{id:'vase',description:'A blue vase',appearanceVersion:'v2'}]}, SCENES:[{visual:{props:['vase']}}] };
  const snap = api.snapshot(win,0)[0]; assert.equal(snap.before,null);assert.equal(snap.start,null);
  assert.match(api.prompt(win,0), /A blue vase/);
  const result = still.assemble({scene:'A table',propPrompt:api.prompt(win,0)});
  assert.match(result.prompt,/A blue vase/);
});
test('advertised MCP editing schema exposes both propSheet and concurrency hash', () => {
  const properties = TOOLS.find(t=>t.name==='storyboard_apply').inputSchema.properties;
  assert.ok(properties.propSheet.properties.continuity.properties.events);
  assert.ok(properties.expectedSha256);
});
test('actual still CLI includes custody and reference snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(),'props-still-'));
  try {
    const file=join(dir,'scenes.js');writeFileSync(file,serializeBoard(fixture()));
    const out=execFileSync(process.execPath,['skills/storyboard/references/assemble-bg-prompt.js','--from',file,'--shot','1','--scene','A silver watch','--json'],{cwd:join(import.meta.dirname,'../..'),encoding:'utf8'});
    const result=JSON.parse(out);assert.match(result.prompt,/right hand/);assert.equal(result.propSnapshot[0].after.holderId,'b');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('condition-specific source references do not mix intact and damaged images', () => {
  const win=fixture();win.SB_DOC.props[0].references=[{path:'intact.png',version:'v1',condition:'intact'},{path:'broken.png',version:'v2',condition:'broken'}];
  assert.deepEqual(api.snapshot(win,0)[0].references.map(r=>r.path),['intact.png']);
});
