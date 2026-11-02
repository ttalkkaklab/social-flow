import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { inspectPanels } = require('../../skills/channel/references/character-panels.js');
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
