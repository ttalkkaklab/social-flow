import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseWordCues} from '../../skills/produce/references/word-cue-map.mjs';

test('absolute subtitle starts become exact group-local onsets and preserve provenance',()=>{
 assert.deepEqual(parseWordCues('4.170\t4.500\t첫째\n4.500\t5.000\t둘째\n# aligned 100%',4000,2000),{offsets:[170,500],mode:'aligned'});
 assert.equal(parseWordCues('0\t1\t시험\n# proportional (no aligner)',0,2000).mode,'proportional');
});
test('invalid, unordered and out-of-window cue input fails explicitly',()=>{
 for(const text of ['# aligned','x\t1\t가','0\t-1\t가','1\t2\t가\n0\t1\t나','2\t3\t가'])assert.throws(()=>parseWordCues(text,0,2000));
});
test('all templates apply cues to owned words beyond the first wrapper and reset durations',()=>{
 for(const name of ['kinetic-type','motion-slide','character-act']){
  const src=fs.readFileSync(new URL(`../../skills/storyboard/references/${name}-template.html`,import.meta.url),'utf8');
  const start=src.indexOf('  window.__setWordCues = function'),end=src.indexOf('\n  };',start)+6;
  const word=rg=>{const props=new Map();return{props,closest:()=>({dataset:{rg}}),style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)}}};
  const a=word('1'),b=word('1'),nested=word('2');
  const context={window:{},cssMs:()=>560,document:{querySelectorAll:()=>[a,b,nested]}};
  vm.runInNewContext(src.slice(start,end),context);
  const result=context.window.__setWordCues({'1':[0,280]});
  assert.equal(result.applied,2);assert.equal(a.props.get('--wd'),'0ms');assert.equal(a.props.get('--wr'),'280ms');assert.equal(nested.props.size,0);
  context.window.__setWordCues({'1':[170]});assert.equal(a.props.get('--wr'),undefined);assert.equal(b.props.get('--wd'),undefined);
 }
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
  const props=new Map();
  const el={dataset:{rg:'1'},closest:()=>({dataset:{rg:'1'}}),style:{setProperty:(k,v)=>props.set(k,v)}};
  const context={window:{},meshes:[],meshSegs:{},counters:[],sprites:[],syncGround(){},getComputedStyle:()=>({animationDelay:'0.54s'}),document:{querySelectorAll:()=>[el]}};
  vm.runInNewContext(source.slice(start,end),context);
  context.window.__setSegs({1:4000});
  assert.equal(props.get('--seg-d'),'4000ms');assert.equal(props.get('--sv-d'),'3460ms');
 }
});
