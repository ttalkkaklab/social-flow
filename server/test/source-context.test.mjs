import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const bg = require('../../skills/storyboard/references/assemble-bg-prompt.js');
const spatial = require('../../skills/storyboard/references/spatial-prompts.js');
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

test('general CLI carries meaning and grounding while keeping the authored opening and explicit override',()=>{
  withBoard(board(), file=>{
    const result=cli(file); assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/The boy holds a closed book/);
    assert.match(result.stdout,/historical claim supplied by narration/);
    assert.match(result.stdout,/room and gestures are reconstructed/);
    assert.match(result.stdout,/subsequent action and completed result belong to later frames/);
    assert.equal(bg.bannedHits(result.stdout).length,0);
    const override=cli(file,['--scene','An unopened book rests alone.']);
    assert.equal(override.status,0,override.stderr);
    assert.match(override.stdout,/An unopened book rests alone/);
    assert.doesNotMatch(override.stdout,/The boy holds a closed book/);
    assert.notEqual(cli(file,['--scene','left view of a book']).status,0);
    assert.ok(bg.bannedHits(result.stdout+' left view of a book').length);
    const checked=spawnSync(process.execPath,[script,'--check',result.stdout],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr);
  });
});

test('spatial source context updates with narration but never enters the motion or endpoint prompt',()=>{
  const win=board(); const initial=spatial.assemble(win,0);
  assert.match(initial.sourcePrompt,/Opening state: The boy holds a closed book/);
  assert.match(initial.sourcePrompt,/Speech may carry facts that the picture cannot show/);
  assert.match(initial.sourcePrompt,/do not invent a historical incident/);
  assert.doesNotMatch(initial.sourcePrompt,/Narrated meaning this picture must convey/);
  assert.doesNotMatch(initial.motionPrompt,/corruption|memoir/);
  assert.doesNotMatch(initial.endFramePrompt,/corruption|memoir/);
  assert.match(initial.motionPrompt,/He opens the book/);
  assert.match(initial.endFramePrompt,/The book is open/);
  win.SCENES[0].narration[0].tts='The narrator distinguishes later events from this decision.';
  const changed=spatial.assemble(win,0);
  assert.notEqual(changed.sourcePrompt,initial.sourcePrompt);
  assert.equal(changed.motionPrompt,initial.motionPrompt);
  assert.deepEqual(changed.sourceImageArgs,initial.sourceImageArgs);
});

test('silent fiction and legacy direct calls need no new fields',()=>{
  const win=board(); win.STORY={kind:'fiction'};win.SCENES[0].narration=[];
  const result=spatial.assemble(win,0);
  assert.match(result.sourcePrompt,/Opening state: The boy holds a closed book/);
  assert.doesNotMatch(result.sourcePrompt,/spokenMeaning/);
  const legacy=bg.assemble({size:'ms',scene:'A closed book.',tail:''});
  assert.equal(legacy.prompt,'medium shot, waist up, at eye level. A closed book.');
  assert.deepEqual(legacy.hits,[]);
});

test('editorial parsing does not exempt malformed blocks or visual instruction fields',()=>{
  for(const value of ['[EDITORIAL_CONTEXT_JSON]{"scene":"left view of a book"}[/EDITORIAL_CONTEXT_JSON]',
    '[EDITORIAL_CONTEXT_JSON]left view of a book[/EDITORIAL_CONTEXT_JSON]',
    '[EDITORIAL_CONTEXT_JSON]{"spokenMeaning":"quote"}[/EDITORIAL_CONTEXT_JSON] from the boy\'s left']) {
    assert.ok(bg.bannedHits(value).length,value);
  }
});

test('CLI refreshes narration and grounding and consumes a still-camera depiction without videoDesign',()=>{
  const win=board();
  delete win.SCENES[0].shot.videoDesign;
  win.SCENES[0].shot.render.mode='still_camera';
  win.SCENES[0].visual.action='A seated reader beside the closed book.';
  win.SCENES[0].narration[0].tts='The memoir says "left view of the hall".\nThis is a quoted description.';
  const first=withBoard(win,file=>cli(file));
  assert.equal(first.status,0,first.stderr);
  assert.match(first.stdout,/A seated reader beside the closed book/);
  assert.equal(bg.bannedHits(first.stdout).length,0);
  win.SCENES[0].narration[0].tts='Later testimony revised the claim.';
  win.STORY.adaptationBoundary='Only the seated reading is reconstructed.';
  const updated=withBoard(win,file=>cli(file));
  assert.equal(updated.status,0,updated.stderr);
  assert.match(updated.stdout,/Later testimony revised the claim/);
  assert.match(updated.stdout,/Only the seated reading is reconstructed/);
  assert.doesNotMatch(updated.stdout,/room and gestures are reconstructed/);
  assert.match(updated.stdout,/A seated reader beside the closed book/);
  win.SCENES[0].shot.render.mode='generated_video';
  const generated=withBoard(win,file=>cli(file));
  assert.equal(generated.status,0,generated.stderr);
  assert.doesNotMatch(generated.stdout,/A seated reader beside the closed book/);
});

test('a closing marker in quoted editorial text fails conservatively without hiding camera directions',()=>{
  const win=board();
  win.SCENES[0].narration[0].tts='A quotation containing [/EDITORIAL_CONTEXT_JSON] and left view of a hall.';
  const result=withBoard(win,file=>cli(file,['--scene','left view of a book']));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/left view of/);
});

test('exported browser diagnostics and CLI ignore the same editorial context but inspect actual visual directions',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'source-context-browser-'));
  try {
    require('../../skills/storyboard/references/storyboard-html.js').storyboardHtml(dir);
    const html=readFileSync(path.join(dir,'storyboard.html'),'utf8');
    assert.match(html,/<script src="\.\/source-context.js"><\/script>/);
    const runtime={};runtime.window=runtime;
    runInNewContext(readFileSync(path.join(dir,'source-context.js'),'utf8'),runtime);
    for(const name of ['charEntries','charsOf','personOnScreen','bannedSpaceHits']) {
      const code=html.match(new RegExp('  function '+name+'\\([^]*?\\n  }'))?.[0];
      assert.ok(code,`real template function ${name}`);
      runInNewContext(code,runtime);
    }
    const source=require('../../skills/storyboard/references/source-context.js');
    const prompt=bg.assemble({scene:'A sealed envelope on a desk.',sourceContext:source.context({narration:[{tts:'A worker described a left view of the hall.'}]})}).prompt;
    assert.equal(bg.bannedHits(prompt).length,0);
    assert.equal(runtime.bannedSpaceHits(prompt).length,0);
    assert.equal(runtime.personOnScreen({type:'points',visual:{bgPrompt:prompt}},''),false);
    for(const direction of [' left view of a book',' from the boy\'s left',' 3 meters']) {
      assert.ok(bg.bannedHits(prompt+direction).length);
      assert.ok(runtime.bannedSpaceHits(prompt+direction).length);
    }
    assert.equal(runtime.personOnScreen({type:'points',visual:{bgPrompt:prompt+' A worker is seated at the desk.'}},''),true);
    assert.equal(runtime.personOnScreen({type:'points',visual:{bgPrompt:prompt,character:'reader'}},''),true);
    assert.equal(runtime.personOnScreen({type:'points',visual:{bgPrompt:prompt}},'A worker stands in frame.'),true);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
