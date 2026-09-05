import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkQuality } = require(path.join(root, 'slide-quality.js'));
const { checkObjectSheet, decodePNG } = require(path.join(root, 'object-sheet.js'));
const { makeSheet } = require(path.join(root, 'object-sheet-fixture.js'));
const plan = () => ({kind:'diagram', treatment:'editorial', quality:'object-state-v1',
  subject:{kind:'object', changes:[{group:1, before:'blank', after:'stamped', driver:'surface'}]},
  object:{keys:'0,16,0 0,16,45'}});
test('editorial quality is mandatory, with a real subject change per group', () => {
  assert.match(checkQuality({treatment:'editorial'}, 1).join(), /requires quality/);
  assert.deepEqual(checkQuality(plan(), 1), []);
  const s = plan(); s.subject.changes[0].driver = 'settle';
  assert.match(checkQuality(s, 1).join(), /not subject changes/);
  s.subject.changes[0].driver = 'surface'; s.subject.changes[0].after = 'blank';
  assert.match(checkQuality(s, 1).join(), /distinct/);
  assert.match(checkQuality(plan(), 2).join(), /per narration/);
});
test('physical subject cannot substitute a still or frozen keys', () => {
  const s = plan(); delete s.object;
  assert.match(checkQuality(s, 1).join(), /baked/);
  s.object = {keys:'0,16,0 0,16,0'};
  assert.match(checkQuality(s, 1).join(), /freeze/);
  s.subject.kind = 'data'; s.subject.changes[0].driver = 'value';
  assert.match(checkQuality(s, 1).join(), /requires subject.kind object/);
});
test('data and type have valid non-object paths', () => {
  for (const [kind, driver] of [['data','value'], ['type','type']]) {
    const s = plan(); delete s.object; s.subject.kind = kind; s.subject.changes[0].driver = driver;
    assert.deepEqual(checkQuality(s, 1), []);
  }
});
test('quality violations block storyboard drafts before approval', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'slide-plan-'));
  try {
    writeFileSync(path.join(dir, 'scenes.js'), 'window.SCENES=' + JSON.stringify([
      {type:'cover', narration:[{tts:'test',sub:'test'}], visual:{slide:{kind:'diagram',motion:true,treatment:'editorial'}}}
    ]) + ';');
    const result = spawnSync(process.execPath, [path.join(root,'check-scenes.js'), dir, '--draft', '--json'], {encoding:'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /"level":\s*"bad"[\s\S]*requires quality/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('sheet gate rejects frozen pixels, invisible-only changes, bad geometry and ranges', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'object-sheet-'));
  const file = path.join(dir, 'sheet.png');
  const meta = {cell:[4,4], cols:3, n:3, ranges:{1:[0,2]}};
  try {
    writeFileSync(file, makeSheet());
    assert.equal(checkObjectSheet(meta, file).pixelChange, 'pass');
    assert.throws(() => checkObjectSheet({...meta, cell:[5,4]}, file), /dimensions/);
    assert.throws(() => checkObjectSheet({...meta, ranges:{1:[1,2]}}, file), /discontinuous/);
    writeFileSync(file, makeSheet([4,4],3,3,true));
    assert.throws(() => checkObjectSheet(meta, file), /frozen/);
    writeFileSync(file, makeSheet([4,4],3,3,false,0));
    assert.throws(() => checkObjectSheet(meta, file), /frozen/);
    writeFileSync(file, makeSheet([4,4],5,5,'tail'));
    assert.throws(() => checkObjectSheet({...meta, cols:5, n:5, ranges:{1:[0,4]}}, file), /frozen/);
    assert.throws(() => decodePNG(Buffer.from('not a png')), /PNG/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('production checker rejects stale and frozen object sheets with a valid plan', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'object-production-'));
  const { mkdirSync } = require('node:fs');
  mkdirSync(path.join(dir, 'slides/assets'), {recursive:true});
  const sheet = path.join(dir, 'slides/assets/s1-disc.png');
  const metadata = {file:'assets/s1-disc.png', shape:'disc', keys:'0,16,0 0,16,45', frames:'1:2',
    cell:[4,4], cols:3, n:3, ranges:{1:[0,2]}, ink:[0,0,4,4]};
  const s = plan(); s.file = 'slides/s1-test.html'; s.motion = true; s.role = 'mechanism'; s.motif = 'clay';
  s.object = {file:'slides/assets/s1-disc.png',shape:'disc',keys:metadata.keys,frames:metadata.frames,plan:'stamps press'};
  const run = () => spawnSync(process.execPath, [path.join(root,'check-slide.js'), dir, '--require-all'], {encoding:'utf8'});
  try {
    writeFileSync(path.join(dir,'scenes.js'), 'window.SCENES='+JSON.stringify([{narration:[{tts:'test'}],visual:{slide:s}}])+';');
    writeFileSync(path.join(dir,'slides/s1-test.html'), '<script src="assets/s1-disc.js"></script> const SLIDE_SHOT = 1; window.__seek = () => {}; function renderSlide(S,h) { return h.object(1,"s1-disc",{x:0,y:0}); }');
    const writeMeta = () => writeFileSync(path.join(dir,'slides/assets/s1-disc.js'), 'window.SLIDE_OBJECTS={"s1-disc":'+JSON.stringify(metadata)+'};');
    writeMeta(); writeFileSync(sheet, makeSheet());
    assert.equal(run().status, 0);
    writeFileSync(sheet, makeSheet([4,4],3,3,true));
    assert.match(run().stderr, /frozen/);
    writeFileSync(sheet, makeSheet()); metadata.keys = '0,16,0 0,16,12'; writeMeta();
    assert.match(run().stderr, /sidecar keys differs/);
    metadata.keys = s.object.keys; metadata.ranges = {1:[0,1]}; writeMeta();
    assert.match(run().stderr, /ranges differ/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
