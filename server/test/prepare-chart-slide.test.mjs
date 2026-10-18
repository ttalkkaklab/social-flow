import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prepare } = require('../../skills/produce/references/prepare-chart-slide.js');
const refs = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const graph = () => ({type:'points',duration:8,narration:[{tts:'Compare the two values.'}],shot:{infoType:'statistic',render:{mode:'data_graph',purpose:'comparison',reason:'Compare measured counts.',data:{title:'Measured counts',source:'research.md#counts',unit:'units',chart:'bar',baseline:0,beats:[{group:1,focus:['B'],insight:'B is twice A.'}],values:[{label:'A',value:16},{label:'B',value:32}]}}},visual:{slide:{file:'slides/counts.html',kind:'diagram',motion:true,treatment:'editorial',subject:{kind:'data'},chartRenderer:'svg-v1'}}});
function fixture(t) {
  const board = fs.mkdtempSync(path.join(os.tmpdir(),'prepare-chart-'));
  t.after(() => fs.rmSync(board,{recursive:true,force:true}));
  const scene = graph();
  const save = () => fs.writeFileSync(path.join(board,'scenes.js'),'window.SCENES='+JSON.stringify([{},scene])+';');
  save(); return {board,scene,save};
}
test('prepares exact shared files with only the shot index changed; preserves unrelated files and board', t => {
  const {board} = fixture(t), before = fs.readFileSync(path.join(board,'scenes.js'));
  fs.mkdirSync(path.join(board,'slides')); fs.writeFileSync(path.join(board,'slides','unrelated.html'),'keep');
  const result = prepare(board,2);
  assert.equal(fs.readFileSync(result.file,'utf8'),fs.readFileSync(path.join(refs,'chart-slide-template.html'),'utf8').replace('const SLIDE_SHOT = 1;','const SLIDE_SHOT = 2;'));
  for (const name of ['chart-runtime.js','render-routing.js'])
    assert.deepEqual(fs.readFileSync(path.join(board,'slides/assets',name)),fs.readFileSync(path.join(refs,name)));
  assert.deepEqual(fs.readFileSync(path.join(board,'scenes.js')),before);
  assert.equal(fs.readFileSync(path.join(board,'slides/unrelated.html'),'utf8'),'keep');
  assert.equal(result.renderArgs[2],result.file);
});
test('wrong mode, malformed graph, invalid output paths and indices fail before writes', t => {
  const {board,scene,save} = fixture(t);
  for (const file of ['../outside.html','slides/nested/chart.html','slides/../../outside.html','/tmp/chart.html']) {
    scene.visual.slide.file = file; save(); assert.throws(()=>prepare(board,2),/direct HTML file/);
    assert.equal(fs.existsSync(path.join(board,'slides')),false);
  }
  scene.visual.slide.file='slides/counts.html'; scene.shot.render.mode='generated_video';save();
  assert.throws(()=>prepare(board,2),/must use data_graph/);
  scene.shot.render.mode='data_graph';scene.shot.render.data.values[0].value=NaN;save();
  assert.throws(()=>prepare(board,2),/invalid data graph/);
  assert.equal(fs.existsSync(path.join(board,'slides')),false);
  for(const index of [0,-1,1.2,Infinity])assert.throws(()=>prepare(board,index),/one-based/);
});
test('symlink output cannot escape or modify other files', t => {
  const {board} = fixture(t);fs.mkdirSync(path.join(board,'slides/assets'),{recursive:true});
  const other=path.join(board,'keep.txt');fs.writeFileSync(other,'keep');
  fs.symlinkSync(other,path.join(board,'slides/assets/chart-runtime.js'));
  assert.throws(()=>prepare(board,2),/symlink/);
  assert.equal(fs.readFileSync(other,'utf8'),'keep');
  assert.equal(fs.existsSync(path.join(board,'slides/counts.html')),false);
});
test('a changed shared template and runtime refresh existing output', t => {
  const {board}=fixture(t),templateRoot=path.join(board,'templates');fs.mkdirSync(templateRoot);
  for(const name of ['chart-slide-template.html','chart-runtime.js','render-routing.js'])fs.copyFileSync(path.join(refs,name),path.join(templateRoot,name));
  prepare(board,2,{templateRoot});
  fs.appendFileSync(path.join(templateRoot,'chart-slide-template.html'),'\n<!-- updated shared template -->');
  fs.appendFileSync(path.join(templateRoot,'chart-runtime.js'),'\n// updated shared runtime');
  const result=prepare(board,2,{templateRoot});
  assert.match(fs.readFileSync(result.file,'utf8'),/updated shared template/);
  assert.match(fs.readFileSync(path.join(board,'slides/assets/chart-runtime.js'),'utf8'),/updated shared runtime/);
});
