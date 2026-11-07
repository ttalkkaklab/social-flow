import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  const s = plan();
  for (const driver of ['settle', 'camera']) {
    s.subject.changes[0].driver = driver;
    assert.match(checkQuality(s, 1).join(), /not subject changes/);
  }
  s.subject.changes[0].driver = 'surface'; s.subject.changes[0].after = 'blank';
  assert.match(checkQuality(s, 1).join(), /distinct/);
  assert.match(checkQuality(plan(), 2).join(), /per narration/);
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
test('an object with no keys is reported, not passed by an empty frozen-keys walk', () => {
  const s = plan();
  s.object = {};
  assert.match(checkQuality(s, 1).join(), /slide\.object needs keys/);
});
test('mesh planning admits 3D styles without legacy bake keys', () => {
  const s={kind:'diagram',treatment:'editorial',quality:'object-state-v1',
    subject:{kind:'object',changes:[{group:1,before:'closed',after:'open',driver:'articulation'}]},
    object:{renderer:'mesh',style:'illustration3d',file:'slides/assets/s2-box.json',plan:'hinge lifts lid'}};
  assert.deepEqual(checkQuality(s,1),[]);
  s.object.file='https://example.com/model.glb'; assert.match(checkQuality(s,1).join(),/object.file/);
});
