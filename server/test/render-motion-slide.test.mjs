import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {contrastWarning,rowContrast} from '../../skills/produce/references/render-evidence.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function rates(source,name){
 const literal=source.match(new RegExp('const '+name+'\\s*=\\s*(\\{[^;\\n]+\\})'))?.[1];
 assert.ok(literal,`${name} declaration missing`);
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+literal+')')));
}
test('camera runtime and renderer diagnostic RATE tables agree in every row',()=>{
 const runtime=read('../../skills/storyboard/references/still-camera.js');
 const renderer=read('../../skills/produce/references/render-motion-slide.mjs');
 assert.deepEqual(rates(runtime,'RATE'),rates(renderer,'CAMERA_RATE'));
});
test('the renderer calls the tested camera guard, legibility, contrast and motion-evidence helpers',()=>{
 const s=read('../../skills/produce/references/render-motion-slide.mjs');
 assert.match(s,/isCamera\?cameraGuard\(meta,W,H\):null/);assert.match(s,/if\(cameraProblem\)return die\(cameraProblem\)/);
 assert.ok(s.includes('${measureSlideDOM.toString()})(${groupTextRows.toString()},${roleFontFloor.toString()})'));
 assert.match(s,/if \(item\.px < item\.floor\)/);
 assert.match(s,/contrast unmeasured:/);
 assert.match(s, /motion\.slideEvidence\(r\.mp4, \{ stillLimit: motion\.plateStillLimit\(global\.window\.MOTION_POLICY\) \}\)/);
 assert.match(s, /rendered_motion: renderedMotion/);
 assert.match(s, /opt\.pngOnly \|\| opt\.previz \? null/);
});

function runRendererContrast(pixels, text) {
 const source=read('../../skills/produce/references/render-motion-slide.mjs');
 const start=source.indexOf('    const contrastFrame=');
 const end=source.indexOf('    // Crossfade remnants',start);
 assert.ok(start>=0&&end>start);
 let decodes=0;
 const context={legibility:{text},path:{join:(...parts)=>parts.join('/')},OUT:'out',N:1,W:2,H:3,readContrastFrame:()=>{decodes++;return {pixels,error:null};},rowContrast,contrastWarning};
 const result=vm.runInNewContext('let minContrast=null;const warn=[];'+source.slice(start,end)+';({minContrast,warn})',context);
 return {...result,decodes};
}
const textRows=()=>[0,1,2].map(y=>({sel:'#row'+y,rows:[{x:0,y,w:2,h:1,px:65}]}));
test('renderer contrast gate measures visible rows and produces low-contrast evidence',()=>{
 const result=runRendererContrast(Uint8Array.from([100,100,0,255,0,255]),textRows());
 assert.equal(result.decodes,1);
 assert.equal(result.minContrast.ratio,1);
 assert.equal(result.warn.length,1);
 assert.match(result.warn[0],/contrast #row0: 1.00:1 below 4.5:1/);
});
test('renderer min_contrast keeps the lowest row and normal rows have zero warnings',()=>{
 const result=runRendererContrast(Uint8Array.from([0,255,0,180,0,230]),textRows());
 assert.equal(result.decodes,1);
 assert.equal(result.minContrast.sel,'#row1');
 assert.ok(result.minContrast.ratio>4.5&&result.minContrast.ratio<21);
 assert.equal(result.warn.length,0);
});

const templates = ['kinetic-type','motion-slide','character-act'];
function assertSustainCap(renderer, sources) {
 const cap = Number(renderer.match(/g\.dur > (\d+) \+ meta\.hold/)[1]);
 for (const [name, source] of sources) {
  const fallback = Number(source.match(/animation:svsettle var\(--seg-d,(\d+)ms\)/)[1]);
  assert.equal(fallback, cap, `${name} fallback must follow the renderer entrance cap`);
 }
}
test('all sustain fallbacks match the renderer cap and a divergent fallback is rejected',()=>{
 const renderer=fs.readFileSync(new URL('../../skills/produce/references/render-motion-slide.mjs',import.meta.url),'utf8');
 const sources=templates.map(name=>[name,fs.readFileSync(new URL(`../../skills/storyboard/references/${name}-template.html`,import.meta.url),'utf8')]);
 assertSustainCap(renderer,sources);
 const mutated=sources.map(([name,source],i)=>[name,i===0?source.replace('var(--seg-d,2600ms)','var(--seg-d,4000ms)'):source]);
 assert.throws(()=>assertSustainCap(renderer,mutated),/kinetic-type fallback/);
});
test('sustained semantic motion subtracts its actual delay without subtracting hold',()=>{
 for(const name of templates){
  const source=fs.readFileSync(new URL(`../../skills/storyboard/references/${name}-template.html`,import.meta.url),'utf8');
  const start=source.indexOf('  window.__setSegs = function'),end=source.indexOf('\n  };',start)+6;
  const makeElement=delay=>{const props=new Map();return{props,delay,dataset:{rg:'1'},closest:()=>({dataset:{rg:'1'}}),style:{setProperty:(k,v)=>props.set(k,v)}}};
  const a=makeElement('0.54s'),b=makeElement('0.2s');
  const context={window:{},meshes:[],meshSegs:{},counters:[],sprites:[],syncGround(){},getComputedStyle:el=>({animationDelay:el.delay}),document:{querySelectorAll:()=>[a,b]}};
  vm.runInNewContext(source.slice(start,end),context);
  context.window.__setSegs({1:4000});
  assert.equal(a.props.get('--seg-d'),'4000ms');assert.equal(a.props.get('--sv-d'),'3460ms');
  assert.equal(b.props.get('--seg-d'),'4000ms');assert.equal(b.props.get('--sv-d'),'3800ms');
 }
});
