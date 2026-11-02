import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { shotSchema } from '../dist/storyboard.js';
const require=createRequire(import.meta.url);
const catalog=require('../../skills/storyboard/references/film-techniques.js');

test('tool schema preserves reasons and refuses unknown, duplicate or empty selections',()=>{
  const shot={type:'points',shot:{techniques:[{id:'camera.snorricam',reason:'Follow panic from the body'}]}};
  assert.deepEqual(shotSchema.parse(shot).shot.techniques,shot.shot.techniques);
  for(const selection of [[{id:'camera.fake',reason:'x'}],[{id:'camera.static',reason:''}],[{id:'camera.static',reason:'x'},{id:'camera.static',reason:'y'}]])assert.equal(shotSchema.safeParse({type:'points',shot:{techniques:selection}}).success,false);
  assert.ok(catalog.findings({shot:{size:'mcu',techniques:[{id:'framing.ms',reason:'show hands'}]}}).some(x=>x.includes('conflicts')));
});
test('untrusted technique ids and repeated malformed entries cannot crash diagnostics',()=>{
  for(const id of ['toString','constructor','__proto__']) {
    assert.equal(shotSchema.safeParse({type:'points',shot:{techniques:[{id,reason:'x'}]}}).success,false);
    assert.match(catalog.findings({shot:{techniques:[{id,reason:'x'}]}}).join(),/Unknown technique/);
  }
  assert.doesNotThrow(()=>catalog.findings({shot:{techniques:[null,null,{},{}]}}));
});
