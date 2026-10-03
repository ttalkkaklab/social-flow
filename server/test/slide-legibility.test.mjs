import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupTextRows, percentileContrast} from '../../skills/produce/references/slide-legibility.mjs';

const glyph=(y,h=81.5,char='가',x=176)=>({x,y,w:56.78,h,char,px:68});
test('six overlapping line boxes remain six rows (measured kinetic fixture)',()=>{
  const rows=groupTextRows(Array.from({length:6},(_,i)=>glyph(414.3359375+i*73.4375)));
  assert.equal(rows.length,6);
  for(let i=1;i<rows.length;i++) assert.ok(rows[i-1].y+rows[i-1].h<=rows[i].y);
});
test('three wrapped hero lines remain three rows',()=>{
  assert.equal(groupTextRows([430.78125,564.6953125,698.609375].map(y=>glyph(y,148.5))).length,3);
});
test('a larger baseline-aligned emphasis span shares one row',()=>{
  const rows=groupTextRows([glyph(600),glyph(571,110.5,'강',240),glyph(600,81.5,'끝',330),glyph(600,81.5,' ',400)]);
  assert.equal(rows.length,1);assert.equal(rows[0].chars,3);
});
test('contrast identifies black/white and flat negative controls',()=>{
  assert.equal(percentileContrast(Uint8Array.from({length:100},(_,i)=>i<50?0:255)),21);
  assert.equal(percentileContrast(new Uint8Array(100).fill(80)),1);
  assert.equal(percentileContrast(new Uint8Array()),null);
});

test('different-size adjacent lines stay separate despite partial overlap',()=>{
 assert.equal(groupTextRows([glyph(0,120),glyph(110,60)]).length,2);
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
