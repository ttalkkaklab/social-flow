import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupTextRows} from '../../skills/produce/references/slide-legibility.mjs';

const glyph=(y,h=81.5,char='가',x=176)=>({x,y,w:56.78,h,char,px:68});
test('six overlapping line boxes remain six rows (measured kinetic fixture)',()=>{
  const rows=groupTextRows(Array.from({length:6},(_,i)=>glyph(414.3359375+i*73.4375)));
  assert.equal(rows.length,6);
  for(let i=1;i<rows.length;i++) assert.ok(rows[i-1].y+rows[i-1].h<=rows[i].y);
});
test('the 50 percent row boundary rejects both zero and full-overlap mutants',()=>{
 const upper=[glyph(0,100),glyph(40,100)]; // 60% overlap: same measured row.
 const lower=Array.from({length:6},(_,i)=>glyph(i*73.4375));
 assert.equal(groupTextRows(upper).length,1);
 const mutant=t=>new Function('return ('+groupTextRows.toString().replace('*.5','*'+t)+')')();
 assert.notEqual(mutant(0)(lower).length,6);
 assert.notEqual(mutant(1)(upper).length,1);
 assert.equal(groupTextRows([glyph(0,100),glyph(49,100)]).length,1);
 assert.equal(groupTextRows([glyph(0,100),glyph(51,100)]).length,2);
 assert.equal(groupTextRows([glyph(0,100),glyph(50,100)]).length,1);
 assert.equal(groupTextRows([glyph(0,100),glyph(50.01,100)]).length,2);
});
