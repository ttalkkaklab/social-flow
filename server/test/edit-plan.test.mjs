import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const {compile}=require(path.join(root,'skills/produce/references/edit-plan.js'));
const cards='0\tvoice.wav\t0\tnone\n1\tvoice.wav\t0\tnone\n';
const scenes=()=>[{type:'cover'},{type:'points',transition:'dissolve'}];
test('contradictory, missing and malformed edits fail instead of falling back',()=>{
 assert.throws(()=>compile(scenes(),cards.replace('1\tvoice.wav\t0\tnone','1\tvoice.wav\t0\tnone\tenter=cut')),/contradicts/);
 assert.equal(compile([{},{}],cards).plan[1].transition,'cut'); // a missing transition defaults to cut (2026-10-18)
 assert.throws(()=>compile([{},{transition:'spin'}],cards),/unknown transition/);
 for(const edit of [{transitionSeconds:NaN},{in:-1},{post:'0.2'},{unknown:1},{transitionSeconds:0}]){
  const s=scenes();s[1].edit=edit;assert.throws(()=>compile(s,cards));
 }
 assert.throws(()=>compile(scenes(),cards.replace('0\tvoice.wav\t0\tnone','0\tvoice.wav\t0\tnone\tsync=1')),/Sync|sync/);
});
test('dip halves, source trims, authored breathing room and durations survive compilation',()=>{
 const s=scenes();s[1].transition='dip:white';s[1].edit={in:.5,post:.3};
 const r=compile(s,cards);assert.equal(r.plan[0].exit,'white');assert.equal(r.plan[1].enter,'white');assert.equal(r.plan[1].in,.5);
 const a=scenes();a[1].edit={transitionSeconds:.2};assert.equal(compile(a,cards).plan[0].handle,.2);
});
