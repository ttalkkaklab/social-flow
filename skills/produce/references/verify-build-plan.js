#!/usr/bin/env node
'use strict';
// Run against the source plan on every assembly, never a cached PASS marker.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {verifyClip}=require('./slide-render-proof.js');

function verifyManifest(work,board,scenes){
  const media={};
  const remember=file=>{media[file]=createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  const lines=fs.readFileSync(path.join(work,'segs.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
  const expected=[];
  scenes.forEach((s,i)=>{
    if(['broll','outro'].includes(s.type))return;
    const segs=s.narration?.length?s.narration:[{tts:'',sub:''}];
    segs.forEach((seg,j)=>expected.push({s,i,j,seg}));
  });
  if(lines.length!==expected.length)throw new Error('segs.tsv segment count differs from SCENES');
  lines.forEach((cols,k)=>{
    const {s,i,j,seg}=expected[k];
    if(cols.length!==5||cols[0]!==String(i)||cols[1]!==String(j)||cols[3]!==String(seg.tts||'')||cols[4]!==String(seg.sub??seg.tts??''))throw new Error('segs.tsv narration/order differs from SCENES at row '+(k+1));
    if(s.visual?.slide){
      const clips=cols[2].split('|'),groups=seg.revealGroups||[j+1];
      if(!Array.isArray(groups)||groups.length!==clips.length)throw new Error('sub-reveal groups must be declared in narration[].revealGroups');
      for(const [part,visual] of clips.entries()){
        if(!visual.startsWith('@')||visual.includes('::'))throw new Error('slide segments must use the checked clip directly, without an overlay');
        const file=path.resolve(work,visual.slice(1));
        // A|B sub-reveals retain their own numbered proof groups.
        const match=path.basename(file).match(/^r(\d+)\.mp4$/);
        if(!match)throw new Error('slide clip must be r<group>.mp4: '+file);
        const group=Number(match[1]);
        if(group!==groups[part])throw new Error('slide clip group differs from the narrated segment');
        verifyClip(file,path.resolve(board,s.visual.slide.file),group);remember(file);
      }
    } else {
      const generated=s.visual?.video?.clip;
      const declared=generated||s.visual?.renderedFile||s.visual?.clip;
      if(typeof declared!=='string'||!declared.trim())throw new Error('non-slide scene needs visual.video.clip, visual.renderedFile or visual.clip before assembly');
      const source=generated ? require('./check-production.js').assetPath(board,declared) : path.resolve(board,declared);
      if(!fs.statSync(source).isFile())throw new Error('declared source is not a file');
      if(cols[2].includes('::')||cols[2].includes('|')||path.resolve(work,cols[2].replace(/^@/,''))!==source)throw new Error('segment media differs from the declared source');
      remember(source);
    }
  });
  return media;
}

function verify(work, board) {
  const file = path.join(board, 'scenes.js');
  if (!fs.existsSync(file)) throw new Error('source storyboard/scenes.js is required; pass the storyboard directory as build-reel.sh argument 2');
  const ref = path.resolve(__dirname, '../../storyboard/references');
  for (const [script, args] of [['check-scenes.js', []], ['check-slide.js', ['--require-all']]]) {
    const run = spawnSync(process.execPath, [path.join(ref, script), board, ...args], {encoding:'utf8'});
    if (run.status !== 0) throw new Error(script + ' blocked assembly:\n' + run.stdout + run.stderr);
  }
  const win = {window:{}};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), win, {timeout:5000});
  const expected = win.window.SCENES.map((s,i)=>({s,i})).filter(({s})=>!['broll','outro'].includes(s.type)).map(({i})=>i);
  const cards = fs.readFileSync(path.join(work, 'cards.tsv'), 'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  const ids = cards.map(l=>l.split('\t')[0]);
  if (JSON.stringify(ids)!==JSON.stringify(expected.map(String))) throw new Error('cards.tsv does not match SCENES order; no unplanned opening, missing card or duplicate card is allowed');
  require('./edit-plan.js').write(work,win.window.SCENES);
  const mediaSha256={...verifyManifest(work,board,win.window.SCENES),...require('./check-tts-quality.js').check(work,board)};
  const hash = p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const plugin = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../.claude-plugin/plugin.json'),'utf8'));
  fs.writeFileSync(path.join(work, 'build-plan-check.json'), JSON.stringify({mediaSha256,version:plugin.version,storyboard:board,scenesSha256:hash(file),cardsSha256:hash(path.join(work,'cards.tsv')),segsSha256:hash(path.join(work,'segs.tsv')),resolvedCardsSha256:hash(path.join(work,'cards.resolved.tsv')),editPlanSha256:hash(path.join(work,'edit-plan.json')),checks:['check-scenes','check-slide','segment-inputs','edit-plan'],cards:expected},null,2)+'\n');
}
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('usage: verify-build-plan.js <workdir> [storyboard directory]');
    const work = path.resolve(process.argv[2]);
    verify(work, path.resolve(process.argv[3] || path.join(work, '../storyboard')));
    console.log('Source plan and card order verified.');
  } catch (e) {console.error('build plan: '+e.message);process.exitCode=1;}
}
module.exports={verify,verifyManifest};
