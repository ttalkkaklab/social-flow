#!/usr/bin/env node
'use strict';
// Replacement subtitles are timing inputs, never an alternate narration source.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {evaluateWindowScript}=require('../../_shared/scenes-vm.js');
const {parseOptions}=require('./edit-plan.js');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function replacement(bytes,scene,duration) {
  if(duration!==undefined&&(!Number.isFinite(duration)||duration<=0))throw new Error('Replacement subtitles need a finite positive card duration');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const rows=text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
  const expected=(scene.narration||[]).map(seg=>String(seg.sub??seg.tts??'')).filter(s=>s!=='');
  if(!expected.length||rows.length!==expected.length)throw new Error('Replacement subtitle sentence count differs from SCENES');
  let previous=0;
  rows.forEach((row,i)=>{
    if(row.length!==3||!row.slice(0,2).every(v=>/^\d+(?:\.\d+)?$/.test(v)))throw new Error('Invalid replacement subtitle TSV row '+(i+1));
    const [start,end]=row.map(Number);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<previous||end<=start||(duration!==undefined&&end>duration))
      throw new Error('Replacement subtitle reversed, overlapping or outside card at row '+(i+1));
    // ASS stores centiseconds: a positive interval must survive both output clocks.
    if(Math.round(end*100)<=Math.round(start*100))throw new Error('Replacement subtitle interval collapses at ASS precision');
    if(row[2]!==expected[i])throw new Error('Replacement subtitle text/order differs from SCENES at row '+(i+1));
    if(/[{}\\\x00-\x1f\x7f]/.test(row[2]))throw new Error('Replacement subtitle text contains unsupported rendering characters');
    previous=end;
  });
  return rows;
}
function inputs(work,scenes) {
  const cards=path.join(work,'cards.tsv');
  if(!fs.existsSync(cards))return [];
  return fs.readFileSync(cards,'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).flatMap(line=>{
    const cols=line.split('\t'),opts=parseOptions(cols[4]),mode=opts['subs-mode']??'append';
    if(!['append','replace'].includes(mode))throw new Error('Unknown subs-mode: '+mode);
    if(Object.hasOwn(opts,'subs-mode')&&!opts.subs)throw new Error('subs-mode requires a subs file');
    if(!Object.hasOwn(opts,'subs'))return [];
    if(!opts.subs)throw new Error('Empty subs file path');
    const card=Number(cols[0]),scene=scenes[card];
    if(!Number.isInteger(card)||!scene||['broll','outro'].includes(scene.type))throw new Error('Subtitle card differs from SCENES');
    const file=fs.realpathSync(path.resolve(work,opts.subs));
    if(!fs.statSync(file).isFile())throw new Error('Subtitle input is not a file: '+file);
    const bytes=fs.readFileSync(file),sha256=hash(bytes);
    const rows=mode==='replace'?replacement(bytes,scene):null;
    return [{card,mode,file,bytes,sha256,rows}];
  });
}
function media(work,scenes) {
  return Object.fromEntries(inputs(work,scenes).map(({file,sha256})=>[file,sha256]));
}
function match(work,scenes,proof) {
  const entries=inputs(work,scenes);
  for(const {file,sha256} of entries)if(proof.mediaSha256?.[file]!==sha256)
    throw new Error('Rebuild: missing or stale subtitle input provenance: '+file);
  return entries;
}
function checkedCard(work,board,card,duration,offset=0) {
  const proof=JSON.parse(fs.readFileSync(path.join(work,'build-plan-check.json'),'utf8'));
  const source=path.join(board,'scenes.js');
  for(const [file,want] of [[source,proof.scenesSha256],[path.join(work,'cards.tsv'),proof.cardsSha256],[path.join(work,'segs.tsv'),proof.segsSha256]])
    if(hash(fs.readFileSync(file))!==want)throw new Error('Rebuild: subtitle source plan changed: '+file);
  const win=evaluateWindowScript(fs.readFileSync(source,'utf8'),{filename:source});
  const entry=match(work,win.SCENES,proof).find(e=>e.card===card);
  if(!entry)throw new Error('Missing checked subtitle card '+card);
  // Both output formats use the same inward-rounded centisecond window. It cannot
  // spill across a fractional-frame card end, and read(1) cannot drop the last cue.
  if(entry.mode==='replace') {
    if(!Number.isFinite(offset)||offset<0)throw new Error('Invalid subtitle card offset');
    const rows=replacement(entry.bytes,win.SCENES[card],duration).map(([s,e,text])=>{
      const start=Math.ceil((offset+Number(s))*100)/100,end=Math.floor((offset+Number(e))*100)/100;
      if(end<=start)throw new Error('Replacement subtitle interval collapses at output precision');
      return [start.toFixed(2),end.toFixed(2),text].join('\t');
    });
    return Buffer.from(rows.join('\n')+'\n');
  }
  // Legacy append keeps its original parser behavior and bytes.
  return entry.bytes;
}
module.exports={inputs,media,replacement,match,checkedCard};
if(require.main===module){try{
  const [work,board,card,duration,offset='0']=process.argv.slice(2);
  if(!work||!board||card===undefined||duration===undefined)throw new Error('usage: explicit-subtitles.js <workdir> <storyboard> <card> <actual seconds>');
  const seconds=duration.includes('/')?duration.split('/').map(Number).reduce((a,b)=>a/b):Number(duration);
  process.stdout.write(checkedCard(path.resolve(work),path.resolve(board),Number(card),seconds,Number(offset)));
}catch(e){console.error('subtitles: '+e.message);process.exitCode=1;}}
