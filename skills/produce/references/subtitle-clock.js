#!/usr/bin/env node
'use strict';

// Bound already-formatted automatic cues. Keep each format's existing nearest
// tick; only ticks outside the exact card frame clock move inward.
function integer(value,positive=false) {
  const s=String(value);
  if(!/^(0|[1-9]\d*)$/.test(s)||(positive&&s==='0'))throw new Error('Invalid subtitle frame clock');
  return BigInt(s);
}
function ticks(stamp,unit) {
  const re=unit===1000n?/^(\d+):(\d{2}):(\d{2}),(\d{3})$/:/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/;
  const m=String(stamp).match(re);
  if(!m)throw new Error('Invalid automatic subtitle timestamp');
  // A legacy printf can round seconds to 60. Normalize that carry as integer
  // ticks, without re-rounding the time or changing the file-append formatter.
  return (BigInt(m[1])*3600n+BigInt(m[2])*60n+BigInt(m[3]))*unit+BigInt(m[4]);
}
function stamp(tick,unit) {
  const hours=tick/(3600n*unit),minutes=tick/(60n*unit)%60n,seconds=tick/unit%60n;
  const pad=(v,n)=>String(v).padStart(n,'0');
  return `${pad(hours,unit===1000n?2:1)}:${pad(minutes,2)}:${pad(seconds,2)}${unit===1000n?',':'.'}${pad(tick%unit,unit===1000n?3:2)}`;
}
function bound(startFrame,frames,fps,srtStart,srtEnd,assStart,assEnd) {
  const first=integer(startFrame),length=integer(frames,true),rate=integer(fps,true);
  return [[srtStart,srtEnd,1000n],[assStart,assEnd,100n]].flatMap(([start,end,unit])=>{
    const lower=(first*unit+rate-1n)/rate,upper=(first+length)*unit/rate;
    const oldStart=ticks(start,unit),oldEnd=ticks(end,unit);
    const boundedStart=oldStart<lower?lower:oldStart,boundedEnd=oldEnd>upper?upper:oldEnd;
    if(boundedEnd<=boundedStart)throw new Error(`Automatic subtitle interval collapses at ${unit===1000n?'SRT':'ASS'} precision inside card`);
    return [stamp(boundedStart,unit),stamp(boundedEnd,unit)];
  });
}
module.exports={bound};
if(require.main===module){try{
  const args=process.argv.slice(2);
  if(args.length!==7)throw new Error('usage: subtitle-clock.js <start frame> <frames> <integer FPS> <SRT start> <SRT end> <ASS start> <ASS end>');
  process.stdout.write(bound(...args).join('\t')+'\n');
}catch(e){console.error('subtitle clock: '+e.message);process.exitCode=1;}}
