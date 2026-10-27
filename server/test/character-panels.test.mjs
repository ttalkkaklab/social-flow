import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { inspectPanels, boardPanelFindings } = require('../../skills/channel/references/character-panels.js');
// PPM is a real decodable image. The probe reads bytes, not extension or metadata.
function ppm(w, h, color = 80) { return Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), Buffer.alloc(w*h*3, color)]); }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sf-panels-'));
  const folder = join(root, 'assets/characters/hero');
  const board = join(root, 'episodes/one/storyboard');
  mkdirSync(folder, {recursive:true}); mkdirSync(join(board, 'images'), {recursive:true});
  writeFileSync(join(folder, 'identity.md'), '# Hero');
  const manifest = { schemaVersion:1, panels:{} };
  for (const slot of ['front','back','face']) {
    const bytes = ppm(slot === 'face' ? 100 : 80, slot === 'face' ? 100 : 120, slot === 'back' ? 90 : 80);
    writeFileSync(join(folder, slot+'.ppm'), bytes);
    manifest.panels[slot] = {file:slot+'.ppm',purpose:'character_reference',view:slot,framing:{status:'measured',sha256:createHash('sha256').update(bytes).digest('hex'),subjectBox:[.1,.08,.8,slot === 'face' ? .7 : .84]}};
  }
  const save=()=>writeFileSync(join(folder, 'panels.json'), JSON.stringify(manifest)); save();
  return {root,folder,board,manifest,save,clean:()=>rmSync(root,{recursive:true,force:true})};
}
test('actual image ratios, recorded occupancy and changed-byte evidence are independent diagnostics', () => {
  const f=fixture();try {
    assert.deepEqual(inspectPanels(f.folder).findings, []);
    const item=f.manifest.panels.back;
    item.framing.subjectBox=[.1,.05,.8,.89];f.save();
    assert.match(inspectPanels(f.folder).findings.map(x=>x.message).join(), /3 percentage points/);
    item.framing.subjectBox=[.1,.05,.8,.5];f.save();
    assert.match(inspectPanels(f.folder).findings.map(x=>x.message).join(), /subject height 50%/);
    writeFileSync(join(f.folder,'face.ppm'),ppm(80,120));
    const warnings=inspectPanels(f.folder).findings;
    assert.ok(warnings.some(x=>x.domain==='image-ratio' && x.message.includes('1:1')));
    assert.ok(warnings.some(x=>x.domain==='image-framing' && x.message.includes('stale')));
    writeFileSync(join(f.folder,'front.ppm'),'corrupt');
    assert.ok(inspectPanels(f.folder).findings.some(x=>x.message.includes('dimensions unavailable')));
  }finally{f.clean();}
});
test('wrong-purpose, missing, malformed, traversal and symlink references cannot become shared slots',()=>{
  const f=fixture();try {
    f.manifest.panels.front.purpose='episode_scene';f.save();
    assert.equal(inspectPanels(f.folder).slots.front,undefined);
    f.manifest.panels.front.purpose='character_reference';
    writeFileSync(join(f.root,'outside.ppm'),ppm(80,120));
    for(const file of ['../../../outside.ppm','/absolute.ppm']) {
      f.manifest.panels.front.file=file;f.save();assert.equal(inspectPanels(f.folder).slots.front,undefined);
    }
    symlinkSync(join(f.root,'outside.ppm'),join(f.folder,'link.ppm'));
    f.manifest.panels.front.file='link.ppm';f.save();assert.equal(inspectPanels(f.folder).slots.front,undefined);
    writeFileSync(join(f.folder,'panels.json'),'{bad');
    assert.equal(inspectPanels(f.folder,{front:'front.ppm'}).slots.front,undefined);
    rmSync(join(f.folder,'panels.json'));
    const legacy=inspectPanels(f.folder,{front:'front.ppm'});
    assert.equal(legacy.slots.front,'front.ppm');
    assert.ok(legacy.findings.some(x=>x.domain==='image-purpose'));
    assert.ok(legacy.findings.some(x=>x.domain==='image-slot'));
  }finally{f.clean();}
});
test('episode scene paths and copies are diagnosed even when renamed into the shared folder',()=>{
  const f=fixture();try {
    const win={SB_DOC:{characters:[{id:'hero',panels:{body:'../../../assets/characters/hero/front.ppm'}}]},SCENES:[]};
    assert.equal(boardPanelFindings(win,f.board,f.root).filter(x=>x.domain!=='image-reference-missing').length,0);
    f.manifest.panels.front.purpose='episode_scene';f.save();
    assert.ok(boardPanelFindings(win,f.board,f.root).some(x=>x.domain==='image-purpose'));
    f.manifest.panels.front.purpose='character_reference';f.save();
    copyFileSync(join(f.folder,'front.ppm'),join(f.board,'images/scene.ppm'));
    win.SCENES=[{visual:{bg:'images/scene.ppm'}}];
    assert.ok(boardPanelFindings(win,f.board,f.root).some(x=>x.domain==='image-purpose'));
    win.SB_DOC.characters[0].panels.body='images/scene.ppm';
    assert.ok(boardPanelFindings(win,f.board,f.root).length);
    rmSync(join(f.folder,'identity.md'));
    assert.ok(boardPanelFindings(win,f.board,f.root).some(x=>x.domain==='character-source'));
  }finally{f.clean();}
});

test('shared images with empty storyboard references identify the exact character, slot and file',()=>{
  const f=fixture();try {
    for (const characters of [[{id:'hero',panels:{}}], {hero:{panels:{face:'   '}}}]) {
      const findings=boardPanelFindings({SB_DOC:{characters}},f.board,f.root);
      assert.equal(findings.filter(x=>x.domain==='image-reference-missing').length,3);
      const face=findings.find(x=>x.slot==='face');
      assert.equal(face.characterId,'hero');assert.equal(face.source,join(f.folder,'face.ppm'));
      assert.equal(face.field,'SB_DOC.characters.hero.panels.face');
    }
  }finally{f.clean();}
});
