import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('a shooting script inherits the scene policy and prints the shot lens, focus trigger and listening perspective', t => {
  const dir = mkdtempSync(join(tmpdir(),'shooting-script-'));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  const scene = {no:1,directionDefaults:{camera:'camera.dolly-in',lensPolicy:'Use spherical lenses.',soundPerspective:'full'}};
  const shot = {type:'points',scene:1,duration:4,visual:{source:'recording',clip:'door.mp4',shot:'The door',action:'Mina waits.',
    camera:{lensMm:45,fStop:4,focusDistanceM:2,target:'brass latch',cue:'third knock',speed:'fast'}},
    shot:{size:'ms',arrangement:'two',techniques:[{id:'camera.rack-focus',from:'the handle',to:'the witness',on:'the bell rings'}]},
    sound:{perspective:'near',diegetic:'Linen rustles.'}};
  writeFileSync(join(dir,'scenes.js'), 'window.STRUCTURE = '+JSON.stringify({scenes:[scene]})+';\nwindow.SCENES = '+JSON.stringify([shot])+';');
  const script = fileURLToPath(new URL('../../skills/storyboard/references/make-script.js',import.meta.url));
  execFileSync(process.execPath,[script,dir]);
  const markdown = readFileSync(join(dir,'script.md'),'utf8');
  const block = markdown.split('#### 샷 1')[1];
  assert.match(markdown.split('#### 샷 1')[0], /Use spherical lenses/);
  for (const text of ['미디엄','투샷','45 mm lens','f/4','focus distance 2 m','the handle → the witness','the bell rings',
    'brass latch','third knock','fast','인물 가까이','Linen rustles.']) assert.ok(block.includes(text), text);
  assert.doesNotMatch(block,/공간 전체|2배 망원/);
});
