import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const {compile}=require(path.join(root,'skills/produce/references/edit-plan.js'));
const cards='0\tvoice.wav\t0\tnone\n1\tvoice.wav\t0\tnone\n';
const scenes=()=>[{type:'cover'},{type:'points',transition:'dissolve'}];
test('source transitions compile automatically with live handles and short audio margins',()=>{
 const r=compile(scenes(),cards);
 assert.equal(r.plan[0].handle,.4);assert.equal(r.plan[1].enter,'dissolve');
 assert.match(r.cards,/enter=dissolve/);assert.equal(r.plan[0].pre,0);assert.equal(r.plan[0].post,.12);
});
test('contradictory, missing and malformed edits fail instead of falling back',()=>{
 assert.throws(()=>compile(scenes(),cards.replace('1\tvoice.wav\t0\tnone','1\tvoice.wav\t0\tnone\tenter=cut')),/contradicts/);
 assert.throws(()=>compile([{},{}],cards),/choose a transition/);
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
test('approved reuse edits compile while missing source frames still stop the renderer',()=>{
 const s=[{visual:{reuse:{}},edit:{in:.2}},{transition:'dissolve'}];
 assert.throws(()=>compile(s,cards),/Reused clips/);
 const result=compile(s,cards,{videoWarningsApproved:true});
 assert.equal(result.plan[0].in,.2);assert.equal(result.plan[0].handle,.4);
});
