import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const templates = ['kinetic-type','motion-slide','character-act'];
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
