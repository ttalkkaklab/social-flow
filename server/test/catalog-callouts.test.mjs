import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {leader}=createRequire(import.meta.url)('../../skills/storyboard/references/catalog-callouts.js');
test('catalog leaders remain finite through coincident anchors and changes of direction',()=>{
 for(const point of [[176,1430],[176,1100],[700,1100],[900,1480]])for(const side of ['left','right']){
  const path=leader(point,[176,1430],side);
  assert.ok(path.startsWith(`M${point[0]} ${point[1]} `));assert.match(path,/ L(?:176|396) 1430$/);
  assert.doesNotMatch(path,/NaN|Infinity/);
 }
 assert.notEqual(leader([700,1000],[650,1350],'right'),leader([720,1020],[650,1350],'right'));
 // A leader arriving from the left continues toward the right label, without a hairpin.
 const right=leader([300,1200],[650,1335],'right');
 const xs=[...right.matchAll(/[MLQ]([\d.]+)/g)].map(m=>Number(m[1]));
 assert.ok(xs.every((x,i)=>i===0||x>=xs[i-1]));
});
