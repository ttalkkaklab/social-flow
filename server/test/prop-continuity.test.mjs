import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import api from '../../skills/storyboard/references/prop-continuity.js';
import cli from '../../skills/storyboard/references/prop-sheet-cli.js';
import { applyStoryboard, storyboardApplySchema, serializeBoard, readBoard } from '../dist/storyboard.js';

import { fixture } from './fixtures/prop-board.mjs';
import { TOOLS } from '../dist/tools.js';
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
test('condition cannot recover during an ordinary move', () => {
  const win = fixture(), e = win.SB_DOC.propContinuity.events[0];
  e.kind = 'move'; e.from.condition = 'intact'; e.to.condition = 'repaired';
  assert.match(JSON.stringify(bad(win)), /Condition changes/);
  e.kind = 'repair'; e.from = {condition:'intact'}; e.to = {condition:'repaired'}; assert.deepEqual(bad(win), []);
});
test('MCP schema exposes propSheet', () => {
  const win = fixture(), sheet = { props: win.SB_DOC.props, continuity: win.SB_DOC.propContinuity };
  assert.ok(storyboardApplySchema.safeParse({path:'.', propSheet:sheet}).success);
  const advertised = TOOLS.find(t=>t.name==='storyboard_apply').inputSchema.properties;
  assert.ok(advertised.propSheet.properties.continuity.properties.events);
  assert.ok(advertised.expectedSha256);
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

test('globals prop edits and removals require a current hash and preserve a backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'props-globals-'));
  try {
    const win = fixture();
    win.STRUCTURE = {version:'structure-v1',sequences:[{id:'q1',title:'Loan',purpose:'Track watch',scenes:[1]}],scenes:[{no:1,place:'Room',time:'Day',event:'Loan',charge:{open:'-',close:'+'},turn:'Possession A to B'}]};
    win.SCENES.forEach((s,i)=>Object.assign(s,{scene:1,beat:i?'cta':'hook',shot:{size:i?'cu':'ls',angle:'eye',feel:'calm',info:'Watch '+i,infoType:'other'}}));
    const file=join(dir,'scenes.js');writeFileSync(file,serializeBoard(win));
    const original=readFileSync(file,'utf8'), hash=cli.run([dir]).sha256;
    const doc=structuredClone(win.SB_DOC);doc.props[0].description='Changed through globals';
    for (const SB_DOC of [doc, {characters:doc.characters}, null]) {
      assert.throws(()=>applyStoryboard({path:dir,globals:{SB_DOC},draft:true}),/head_moved/);
      assert.equal(readFileSync(file,'utf8'),original);
    }
    const saved=applyStoryboard({path:dir,globals:{SB_DOC:doc},draft:true,expectedSha256:hash});
    assert.equal(saved.written,true,JSON.stringify(saved.findings));
    assert.equal(readFileSync(join(dir,'.prop-history',hash+'.js'),'utf8'),original);
    assert.match(readFileSync(file,'utf8'),/Changed through globals/);
    const unchanged=readBoard(dir).win.SB_DOC;unchanged.displayTitle='Metadata only';
    assert.equal(applyStoryboard({path:dir,globals:{SB_DOC:unchanged},draft:true}).written,true);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
