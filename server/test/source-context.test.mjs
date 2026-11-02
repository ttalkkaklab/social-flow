import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const bg = require('../../skills/storyboard/references/assemble-bg-prompt.js');
const script = path.resolve(import.meta.dirname, '../../skills/storyboard/references/assemble-bg-prompt.js');
function board() {
  return {
    PRODUCTION: {mode:'full_video', style:{preset:'webtoon', world:'A study.', materials:'Ink.', palette:'Cream.', lighting:'Daylight.', camera:'Observation.'}},
    STORY: {kind:'adapted', adaptationBoundary:'The memoir establishes the decision; room and gestures are reconstructed.'},
    SCENES: [{narration:[{tts:'A left view of the document cannot prove corruption.',delivery:'voiceover'}],
      shot:{size:'ms', angle:'eye', info:'A historical claim supplied by narration.',render:{reason:'Contextual study portrait, not evidence of corruption.'},videoDesign:{
        look:'webtoon',before:'The boy holds a closed book.',action:'He opens the book.',after:'The book is open.',continuity:'The book keeps its ochre cover.',
        motion:{kind:'subject_action',subject:'The boy',visibleChange:'The book opens.',beats:[{at:0,state:'The book is closed.'},{at:4,state:'The book is open.'}]}}},
      visual:{camera:{framing:'Medium view of the boy and book.',movement:'static',end:'The open book.'},video:{engine:'astra'}}}]
  };
}
function withBoard(win, fn) {
  const dir = mkdtempSync(path.join(tmpdir(),'source-context-'));
  const file = path.join(dir,'scenes.js');
  writeFileSync(file,Object.entries(win).map(([key,value])=>`window.${key} = ${JSON.stringify(value)};`).join('\n'));
  try { return fn(file); } finally { rmSync(dir,{recursive:true,force:true}); }
}
function cli(file, extra = []) { return spawnSync(process.execPath,[script,'--from',file,'--shot','1',...extra],{encoding:'utf8'}); }

test('editorial parsing does not exempt malformed blocks or visual instruction fields',()=>{
  for(const value of ['[EDITORIAL_CONTEXT_JSON]{"scene":"left view of a book"}[/EDITORIAL_CONTEXT_JSON]',
    '[EDITORIAL_CONTEXT_JSON]left view of a book[/EDITORIAL_CONTEXT_JSON]',
    '[EDITORIAL_CONTEXT_JSON]{"spokenMeaning":"quote"}[/EDITORIAL_CONTEXT_JSON] from the boy\'s left']) {
    assert.ok(bg.bannedHits(value).length,value);
  }
});

test('a closing marker in quoted editorial text fails conservatively without hiding camera directions',()=>{
  const win=board();
  win.SCENES[0].narration[0].tts='A quotation containing [/EDITORIAL_CONTEXT_JSON] and left view of a hall.';
  const result=withBoard(win,file=>cli(file,['--scene','left view of a book']));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/left view of/);
});
