'use strict';
const cameraPurposes={introduce:'focus-in',inspect:'rack-focus',detail:'approach',context:'pull',discovery:'reveal',depth:'parallax'};
const lanes={still_camera:['push','pan','pull','focus-in','rack-focus','approach','reveal','parallax'],character_explanation:['alliance','document','supply'],object_explanation:['gears','pulley','hinge']};
const region=r=>Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[0]>=0&&r[0]<=1&&r[1]>=0&&r[1]<=1&&r[2]>0&&r[2]<=1&&r[3]>0&&r[3]<=1;
function validate(plan){
 const errors=[];
 if(!plan||plan.version!==1||plan.mode!=='animation-review')return ['Expected version:1 and mode:animation-review'];
 if(!Array.isArray(plan.clips)||plan.clips.length<1||plan.clips.length>30)return ['Review needs 1–30 clips'];
 const ids=new Set();
 for(const [i,c]of plan.clips.entries()){
  const at='clip '+(i+1);
  if(!c||typeof c!=='object'){errors.push(at+': expected an object');continue}
  if(!/^[a-z][a-z0-9-]{0,60}$/.test(c.id)||ids.has(c.id))errors.push(at+': unique safe id required');ids.add(c.id);
  if(!lanes[c.lane]?.includes(c.template))errors.push(at+': template does not belong to lane');
  for(const f of ['title','caption','intent'])if(typeof c[f]!=='string'||!c[f].trim())errors.push(at+': '+f+' required');
  if(!Number.isFinite(c.duration)||c.duration<4||c.duration>20)errors.push(at+': duration must be 4–20 seconds');
  if(c.lane==='still_camera'&&(typeof c.image!=='string'||!c.image))errors.push(at+': still image required');
  if(c.lane==='still_camera'){
   if(c.purpose&&cameraPurposes[c.purpose]!==c.template)errors.push(at+': camera template does not match the stated purpose');
   if(['focus-in','rack-focus','approach'].includes(c.template)&&!region(c.focusTo))errors.push(at+': focusTo needs normalized x,y,rx,ry');
   if(c.template==='rack-focus'&&!region(c.focusFrom))errors.push(at+': rack-focus needs focusFrom');
   if(['reveal','parallax'].includes(c.template)&&(!Array.isArray(c.layers)||c.layers.length<1||c.layers.length>4||c.layers.some(l=>!l||typeof l.image!=='string'||!l.image||!Number.isFinite(l.depth)||l.depth<=0||l.depth>1)))errors.push(at+': layered camera requires 1–4 prepared transparent layers and a clean background');
  }
  if(c.annotations!==undefined){
   if(c.lane!=='object_explanation')errors.push(at+': annotations belong only to object explanations');
   if(!Array.isArray(c.annotations)||c.annotations.length>2)errors.push(at+': use at most two separate annotation windows');
   else{
    for(const a of c.annotations)if(!a||![0,1].includes(a.target)||typeof a.text!=='string'||!a.text.trim()||typeof a.reason!=='string'||!a.reason.trim()||!Number.isFinite(a.start)||!Number.isFinite(a.end)||a.start<0||a.end>c.duration||a.end-a.start<1||a.end-a.start>c.duration*.45)errors.push(at+': annotation needs a target, text, reason and a short time window');
    const sorted=c.annotations.filter(a=>a).slice().sort((a,b)=>a.start-b.start);
    if(sorted.some((a,j)=>j&&a.start<sorted[j-1].end))errors.push(at+': only one annotation may be visible at a time');
   }
  }
 }
 return errors;
}
module.exports={validate,lanes,cameraPurposes};
