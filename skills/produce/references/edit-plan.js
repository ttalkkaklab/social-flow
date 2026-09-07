#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const carry = /^(jcut|dissolve|iris|blur|zoom|push:(l2r|r2l|u2d|d2u)|whip:(l2r|r2l|u2d|d2u))$/;
const durations = {jcut:.24, dissolve:.40, iris:.40, blur:.40, zoom:.32, push:.32, whip:.24};
function seconds(value, fallback, label, max=2) {
  const n = value === undefined ? fallback : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) throw new Error(label + ' must be seconds in 0..' + max);
  return n;
}
function parseOptions(text) {
  const out = {};
  for (const part of (text || '').split(',').filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq < 1 || Object.hasOwn(out, part.slice(0,eq))) throw new Error('Invalid or duplicate card option: ' + part);
    out[part.slice(0,eq)] = part.slice(eq+1);
  }
  return out;
}
function compile(scenes, text) {
  const rows = text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
  const shots = scenes.map((s,i)=>({s,i})).filter(({s})=>!['broll','outro'].includes(s.type));
  if (rows.length !== shots.length || rows.some((r,k)=>r[0]!==String(shots[k].i))) throw new Error('Edit plan card order differs from SCENES');
  const plan = shots.map(({s,i},k)=>{
    const opts = parseOptions(rows[k][4]), edit = s.edit === undefined ? {} : s.edit;
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('shot '+(i+1)+': edit must be an object');
    for (const key of Object.keys(edit)) if (!['in','pre','post','transitionSeconds','reason','continuity'].includes(key)) throw new Error('Unknown edit field: '+key);
    const t = s.transition === undefined && k===0 ? 'cut' : s.transition;
    if (!(carry.test(t) || ['cut','dip','dip:white'].includes(t))) throw new Error('shot '+(i+1)+': choose a transition in scenes.js');
    if (k===0 && carry.test(t)) throw new Error('First shot cannot carry a previous picture');
    const enter = t==='dip'?'black':t==='dip:white'?'white':t;
    const join = seconds(edit.transitionSeconds, carry.test(t)?durations[t.split(':')[0]]:0, 'transitionSeconds', .8);
    if (carry.test(t) && join<.08) throw new Error('A moving transition needs at least 0.08 seconds');
    if (!carry.test(t) && edit.transitionSeconds!==undefined) throw new Error('transitionSeconds applies only to moving transitions');
    const start = seconds(edit.in,0,'edit.in',3600);
    const pre = seconds(edit.pre, opts.sync==='1'?0:t.startsWith('dip')?.30:0,'edit.pre');
    const post = seconds(edit.post,.12,'edit.post');
    if (carry.test(t) && pre!==0) throw new Error('A split edit must start the next voice at the card boundary (pre=0)');
    if (start && s.visual?.slide) throw new Error('Slide reveal timing cannot use edit.in; author the source animation timing');
    if (opts.sync==='1' && (start || pre || edit.post>0 || carry.test(t))) throw new Error('Sync footage requires cut, in=0 and no audio margins');
    return {card:i, transition:t, enter, join, handle:0, in:start, pre:opts.sync==='1'?0:pre, post:opts.sync==='1'?0:post, exit:'cut', opts,
      reason:edit.reason||'', continuity:edit.continuity||''};
  });
  plan.forEach((p,k)=>{
    if (!k) return;
    const prev=plan[k-1];
    if (carry.test(p.transition)) {
      if (shots[k-1].i+1!==p.card) throw new Error('A moving carry cannot bridge an inserted recording; choose cut or dip');
      if (prev.opts.sync==='1') throw new Error('Moving carry after sync footage needs a separately planned silent handle; use cut or dip');
      prev.handle=p.join;
    }
    if (p.enter==='black'||p.enter==='white') prev.exit=p.enter;
  });
  const resolved=plan.map((p,k)=>{
    const expected={enter:p.enter,exit:p.exit,join:p.join,handle:p.handle,in:p.in,pre:p.pre,post:p.post};
    for (const [key,value] of Object.entries(expected)) {
      let actual=p.opts[key];
      if (['enter','exit'].includes(key)) actual=actual==='0'?'cut':actual==='1'?'black':actual;
      if (actual!==undefined && (typeof value==='number' ? actual.trim()==='' || Number(actual)!==value : String(actual)!==String(value))) throw new Error('shot '+(p.card+1)+': cards.tsv '+key+' contradicts scenes.js; update the source edit plan');
    }
    return [...rows[k].slice(0,4),Object.entries({...p.opts,...expected}).map(([key,value])=>key+'='+value).join(',')].join('\t');
  }).join('\n')+'\n';
  return {cards:resolved, plan:plan.map(({opts,...p})=>p)};
}
function write(work, scenes) {
  const source=fs.readFileSync(path.join(work,'cards.tsv'),'utf8');
  const result=compile(scenes,source);
  fs.writeFileSync(path.join(work,'cards.resolved.tsv'),result.cards);
  fs.writeFileSync(path.join(work,'edit-plan.json'),JSON.stringify({version:1, cardsSha256:createHash('sha256').update(result.cards).digest('hex'), shots:result.plan},null,2)+'\n');
  return result;
}
function preview(scenes) {
  const cards=scenes.flatMap((s,i)=>['broll','outro'].includes(s.type)?[]:[`${i}\tvoice.wav\t0\tnone\t${s.visual?.sync===true?'sync=1':''}`]).join('\n');
  return compile(scenes,cards).plan;
}
module.exports={compile,write,carry,preview};
if(require.main===module){try{
  const board=path.resolve(process.argv[2]||'storyboard');
  const win=require('../../autoproduce/references/cost-preview.js').readScenes(path.join(board,'scenes.js'));
  console.log(JSON.stringify(preview(win.SCENES),null,2));
}catch(e){console.error('edit plan: '+e.message);process.exitCode=1;}}
