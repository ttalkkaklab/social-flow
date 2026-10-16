import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {applyStoryboard,storyboardApplySchema,checkStoryboard} from '../dist/storyboard.js';

test('sparse creative plan saves and checks without review, CTA or structural prose; invalid references still refuse writing',()=>{
 const dir=mkdtempSync(join(tmpdir(),'guided-board-'));
 try {
  const r=applyStoryboard(storyboardApplySchema.parse({path:dir,set:{shots:[{type:'points',duration:5,narration:[{tts:'The door closes.'}],beat:'quiet-ending',shot:{size:'invented-framing'}}]}}));
  assert.ok(!r.findings.some(f=>f.level==='bad'),JSON.stringify(r));
  assert.equal(checkStoryboard({path:dir,draft:true}).violations,0);
  const invalid=applyStoryboard(storyboardApplySchema.parse({path:dir,set:{shots:[{type:'points',shot:{eyeline:{matchShot:9}}}]}}));
  assert.ok(invalid.findings.some(f=>f.level==='bad'&&f.what.includes('matchShot')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI blocks unsupported render routes and malformed timing instead of reporting them as creative advice',()=>{
 const dir=mkdtempSync(join(tmpdir(),'guided-cli-'));
 try {
  for(const shot of [{type:'points',shot:{render:{mode:'made_up'}}},{type:'points',duration:-1}]){
   writeFileSync(join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([shot])+';');
   const r=spawnSync(process.execPath,['skills/storyboard/references/check-scenes.js',dir,'--draft','--json'],{cwd:join(import.meta.dirname,'../..'),encoding:'utf8'});
   assert.equal(r.status,1,r.stdout+r.stderr); assert.ok(JSON.parse(r.stdout).violations>0);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
