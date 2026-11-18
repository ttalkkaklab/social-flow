import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { shotSchema } from '../dist/storyboard.js';
const require=createRequire(import.meta.url);
const catalog=require('../../skills/storyboard/references/film-techniques.js');

test('tool schema preserves reasons and refuses unknown, duplicate or empty selections',()=>{
  const shot={type:'points',shot:{techniques:[{id:'camera.snorricam',reason:'Follow panic from the body'}]}};
  assert.deepEqual(shotSchema.parse(shot).shot.techniques,shot.shot.techniques);
  for(const selection of [[{id:'camera.fake',reason:'x'}],[{id:'camera.static',reason:''}],[{id:'camera.static',reason:'x'},{id:'camera.static',reason:'y'}]])assert.equal(shotSchema.safeParse({type:'points',shot:{techniques:selection}}).success,false);
  assert.ok(catalog.findings({shot:{size:'mcu',techniques:[{id:'framing.ms',reason:'show hands'}]}}).some(x=>x.includes('conflicts')));
});
test('every camera move and beat accent has a vendor movement, a prompt phrase and a review icon',()=>{
  // A move missing one of the three is sent as raw "Camera: …" text, fails check-scenes or draws a blank chip.
  const {moveOf}=require('../../skills/storyboard/references/production-mode.js');
  const template=readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html',import.meta.url),'utf8');
  const icons=template.slice(template.indexOf('var CAM_ICON'),template.indexOf('function camIcon'));
  const groups=template.slice(template.indexOf('var CAM_GROUPS'),template.indexOf('var CAM_FAMILY'));
  const moves=catalog.entries.filter(e=>e.category==='camera'&&e.fields.movement), accents=catalog.entries.filter(e=>e.fields.accent);
  assert.deepEqual(accents.map(e=>e.id),['camera.speed-ramp','camera.impact-shake']);
  for(const e of moves)assert.ok(moveOf({movement:e.fields.movement}),e.id+' movement');
  for(const e of accents)assert.ok(!e.fields.movement&&e.fields.cue&&e.prompt.includes('{cue}'),e.id+' cue');
  for(const e of [...moves,...accents]){
    assert.ok(e.prompt,e.id+' prompt');
    assert.ok(icons.includes('"'+e.id+'":')&&groups.includes('"'+e.id+'"'),e.id+' icon');
  }
  assert.equal(new Set(moves.map(e=>e.fields.movement)).size,moves.length);
});
test('untrusted technique ids and repeated malformed entries cannot crash diagnostics',()=>{
  for(const id of ['toString','constructor','__proto__']) {
    assert.equal(shotSchema.safeParse({type:'points',shot:{techniques:[{id,reason:'x'}]}}).success,false);
    assert.match(catalog.findings({shot:{techniques:[{id,reason:'x'}]}}).join(),/Unknown technique/);
  }
  assert.doesNotThrow(()=>catalog.findings({shot:{techniques:[null,null,{},{}]}}));
});
