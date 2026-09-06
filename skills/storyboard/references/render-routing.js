/* One semantic routing contract for planning, the approval page and production. */
(function(root){
 'use strict';
 const PURPOSES={portrait:'still_camera',atmosphere:'still_camera',place:'still_camera',detail:'still_camera',human_process:'character_html',mechanism:'object_html',physical_state:'object_html',comparison:'data_graph',trend:'data_graph',share:'data_graph',distribution:'data_graph',timeline:'data_graph',live_action:'generated_video'};
 const LABELS={still_camera:'정지 이미지 · 카메라 무빙',character_html:'3D 캐릭터 · HTML',object_html:'3D 사물 · HTML',data_graph:'수치·그래프 · HTML',generated_video:'영상 생성'};
 const CHARTS={comparison:['bar','dot'],trend:['line'],share:['stacked-bar'],distribution:['histogram'],timeline:['timeline']};
 const text=x=>typeof x==='string'&&!!x.trim();
 function exempt(scene){return scene.type==='outro'||(!scene.visual?.video&&(['recording','screencast'].includes(scene.visual?.source)||scene.visual?.picture==='recording'))}
 function recommend(purpose){return PURPOSES[purpose]||null}
 function checkScene(scene,{draft=false}={}){
  if(exempt(scene))return [];
  const r=scene.shot?.render,v=scene.visual||{},errors=[],bad=s=>errors.push('shot.render: '+s);
  if(!r||typeof r!=='object')return ['shot.render: choose one of the five modes and record purpose and reason before assets'];
  const expected=recommend(r.purpose);
  if(!expected)bad('unknown purpose; use '+Object.keys(PURPOSES).join(', '));
  if(!LABELS[r.mode])bad('unknown mode; use '+Object.keys(LABELS).join(', '));
  else if(expected&&expected!==r.mode)bad(r.purpose+' requires '+expected+', not '+r.mode);
  if(!text(r.reason))bad('reason must explain why this treatment conveys the cut');
  const info=scene.shot?.infoType;
  if(info==='statistic'&&!['comparison','trend','share','distribution'].includes(r.purpose))bad('statistic needs a quantitative purpose');
  if(info==='timeline'&&r.purpose!=='timeline')bad('timeline needs a timeline purpose');
  if(info==='principle'&&!['human_process','mechanism','physical_state'].includes(r.purpose))bad('principle needs a human process or a physical mechanism/state');
  if(['human_process','mechanism','physical_state'].includes(r.purpose)&&info!=='principle')bad('explanation purposes require infoType principle');
  if(CHARTS[r.purpose]&&info!==(r.purpose==='timeline'?'timeline':'statistic'))bad('chart purpose and infoType disagree');
  if(r.mode==='still_camera'){
   const camera=r.camera;
   if(!camera||!['focus-in','rack-focus','approach','pull','pan','push','reveal','parallax'].includes(camera.effect)||!text(camera.target)||!text(camera.reason))bad('still camera needs effect, target and a content-based reason');
   if(['reveal','parallax'].includes(camera?.effect)&&!text(camera.layersPlan))bad('layered camera needs a prepared foreground and clean-background plan');
   const region=p=>Array.isArray(p)&&p.length===4&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1&&p[2]>0&&p[2]<=1&&p[3]>0&&p[3]<=1;
   if(!draft&&['focus-in','rack-focus','approach'].includes(camera?.effect)&&!region(camera.focusTo))bad('focusTo needs normalized x,y,rx,ry from the actual image');
   if(!draft&&camera?.effect==='rack-focus'&&!region(camera.focusFrom))bad('rack-focus needs a source focus region');
   if(!draft&&['reveal','parallax'].includes(camera?.effect)&&(!Array.isArray(camera.layers)||!camera.layers.length))bad('layered camera needs actual layer assets before production');
  }
  if(['character_html','object_html'].includes(r.mode)&&!text(r.action))bad('explanation needs a visible subject action, including before and after');
  if(r.mode==='character_html'&&(!Array.isArray(r.actors)||!r.actors.length||r.actors.some(a=>!text(a))))bad('character explanation needs actors who perform the action');
  if(r.mode==='object_html'&&Array.isArray(r.actors)&&r.actors.length)bad('object explanation must not add decorative actors');
  if(r.mode==='generated_video'){
   if(r.motionEssential!==true||!text(r.whyNotStill)||!text(r.action))bad('generated video needs essential continuous motion, action and whyNotStill');
  }
  if(r.mode==='data_graph'){
   const data=r.data;
   if(!data||!text(data.source)||!text(data.unit)||!CHARTS[r.purpose]?.includes(data.chart))bad('data needs a source, unit and chart suited to its purpose');
   const values=data?.values;
   if(!Array.isArray(values)||values.length<2||values.some(p=>!p||!text(p.label)||(r.purpose==='timeline'?!text(p.date):!Number.isFinite(p.value))))bad('data needs at least two labelled source values (dated events for timeline)');
   if(['bar','histogram','stacked-bar'].includes(data?.chart)&&data.baseline!==0)bad('length/area charts need baseline 0');
   if(r.purpose==='share'&&Array.isArray(values)&&(!Number.isFinite(data.total)||data.total<=0||values.some(p=>p?.value<0)||Math.abs(values.reduce((sum,p)=>sum+(p?.value||0),0)-data.total)>1e-6))bad('part-to-whole values must sum to the stated total');
  }
  // Draft validates meaning; production also validates the selected renderer's handoff.
  if(!draft){
   const slide=v.slide,generated=!!v.video||scene.type==='broll'||(scene.type==='quote'&&!!v.clip);
   if(r.mode==='still_camera'){
    if(!Number.isFinite(scene.duration)||scene.duration<=0)bad('still camera needs a finite positive duration');
    if(!text(v.bg))bad('still camera needs its source image');
    if(generated)bad('still camera cannot hand off to generated video');
    if(slide&&slide.kind!=='camera')bad('a still-camera HTML wrapper must use kind camera, not an explanation kind');
    if(!slide&&(!v.camera||!text(v.bg)))bad('still camera needs an image and camera handoff');
    if(!slide&&['focus-in','rack-focus','reveal','parallax'].includes(r.camera?.effect))bad('focus/layer effects need the shared camera HTML runtime; a zoom anchor is insufficient');
   }
   if(['character_html','object_html','data_graph'].includes(r.mode)){
    if(generated)bad('an explanation cannot hand off to generated video');
    if(!slide||slide.kind!=='diagram'||slide.motion!==true||slide.treatment!=='editorial')bad('explanation needs an editorial motion diagram');
    if(r.mode==='data_graph'&&(slide?.subject?.kind!=='data'||slide?.object))bad('graph explanation needs a data subject without a physical 3D object');
    if(['character_html','object_html'].includes(r.mode)&&(slide?.subject?.kind!=='object'||slide?.object?.renderer!=='mesh'))bad('physical explanation needs a real mesh object subject');
   }
   if(r.mode==='generated_video'&&(!generated||slide||!text(v.why)))bad('generated video needs a video handoff and visual.why, including the opening cut');
  }
  return errors;
 }
 const api={PURPOSES,LABELS,CHARTS,recommend,exempt,checkScene};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RENDER_ROUTING=api;
})(typeof window==='object'?window:globalThis);
