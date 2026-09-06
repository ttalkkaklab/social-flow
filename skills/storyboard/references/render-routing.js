/* One semantic routing contract for planning, the approval page and production. */
(function(root){
 'use strict';
 const PURPOSES={portrait:'still_camera',atmosphere:'still_camera',place:'still_camera',detail:'still_camera',human_process:'character_html',mechanism:'object_html',physical_state:'object_html',comparison:'data_graph',trend:'data_graph',share:'data_graph',distribution:'data_graph',geographic:'data_graph',timeline:'data_graph',live_action:'generated_video',evidence_quote:'editorial_html',verdict:'editorial_html'};
 const LABELS={still_camera:'정지 이미지 · 카메라 무빙',character_html:'3D 캐릭터 · HTML',object_html:'3D 사물 · HTML',data_graph:'수치·그래프 · HTML',generated_video:'영상 생성',editorial_html:'짧은 인용·결론 · HTML'};
 const CHARTS={comparison:['bar','dot'],trend:['line'],share:['stacked-bar','donut','pie'],distribution:['histogram'],geographic:['map'],timeline:['timeline']};
 const text=x=>typeof x==='string'&&!!x.trim();
 function exempt(scene){return scene.type==='outro'||(!scene.visual?.video&&(['recording','screencast'].includes(scene.visual?.source)||scene.visual?.picture==='recording'))}
 function recommend(purpose){return PURPOSES[purpose]||null}
 function checkScene(scene,{draft=false}={}){
  if(exempt(scene))return [];
  const r=scene.shot?.render,v=scene.visual||{},errors=[],bad=s=>errors.push('shot.render: '+s);
  if(!r||typeof r!=='object')return ['shot.render: choose a supported mode and record purpose and reason before assets'];
  const expected=recommend(r.purpose);
  if(!expected)bad('unknown purpose; use '+Object.keys(PURPOSES).join(', '));
  if(!LABELS[r.mode])bad('unknown mode; use '+Object.keys(LABELS).join(', '));
  else if(expected&&expected!==r.mode)bad(r.purpose+' requires '+expected+', not '+r.mode);
  if(!text(r.reason))bad('reason must explain why this treatment conveys the cut');
  const info=scene.shot?.infoType;
  if(info==='statistic'&&!['comparison','trend','share','distribution','geographic'].includes(r.purpose))bad('statistic needs a quantitative purpose');
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
  if(r.mode==='editorial_html'){
   if(info!=='other')bad('an editorial quote/verdict uses infoType other');
   if(!Number.isFinite(scene.duration)||scene.duration<=0||scene.duration>8)bad('a text-led quote/verdict must last at most 8 seconds');
   if(r.purpose==='evidence_quote'&&(!text(r.evidence?.source)||!text(r.evidence?.quote)))bad('evidence_quote needs evidence.source and the exact evidence.quote');
  }
  if(r.mode==='data_graph'){
   const data=r.data;
   if(!text(data?.title)&&!text(scene.title))bad('data graph needs data.title (or scene.title) naming the quantity being compared');
   if(!data||!text(data.source)||!text(data.unit)||!CHARTS[r.purpose]?.includes(data.chart))bad('data needs a source, unit and chart suited to its purpose');
   const values=data?.values;
   if(!Array.isArray(values)||values.length<(data.chart==='map'?1:2)||values.some(p=>!p||!text(p.label)||(r.purpose==='timeline'?!text(p.date):!(Number.isFinite(p.value)||(data.chart==='map'&&p.value===null)))))bad('data needs labelled finite source values: at least two, or one for a map (dated events for timeline; explicit null is missing map data)');
   if(['bar','histogram','stacked-bar','donut','pie'].includes(data?.chart)&&data.baseline!==0)bad('length/area charts need baseline 0');
   if(r.purpose==='share'&&Array.isArray(values)&&(!Number.isFinite(data.total)||data.total<=0||values.some(p=>p?.value<0)||Math.abs(values.reduce((sum,p)=>sum+(p?.value||0),0)-data.total)>Math.abs(data.total)*1e-9))bad('part-to-whole values must sum to the stated total');
   if(r.purpose==='share'&&data?.unit==='%'&&data.total!==100)bad('percentage shares need total 100');
   checkData(data,(scene.narration||[]).length).forEach(bad);
  }
  // Draft validates meaning; production also validates the selected renderer's handoff.
  if(!draft){
   const slide=v.slide,generated=!!v.video||scene.type==='broll'||(scene.type==='quote'&&!!v.clip);
   if(r.mode==='still_camera'){
    if(!Number.isFinite(scene.duration)||scene.duration<=0)bad('still camera needs a finite positive duration');
    if(!text(v.bg))bad('still camera needs its source image');
    if(generated)bad('still camera cannot hand off to generated video');
    if(slide&&slide.kind!=='camera')bad('a still-camera HTML wrapper must use kind camera, not an explanation kind');
    if(!slide||slide.kind!=='camera'||slide.motion!==true)bad('still camera needs the shared camera HTML runtime for a verifiable image and camera handoff');
   }
   if(['character_html','object_html','data_graph'].includes(r.mode)){
    if(generated)bad('an explanation cannot hand off to generated video');
    if(!slide||slide.kind!=='diagram'||slide.motion!==true||slide.treatment!=='editorial')bad('explanation needs an editorial motion diagram');
    if(r.mode==='data_graph'&&(slide?.subject?.kind!=='data'||slide?.object))bad('graph explanation needs a data subject without a physical 3D object');
    if(['character_html','object_html'].includes(r.mode)&&(slide?.subject?.kind!=='object'||slide?.object?.renderer!=='mesh'))bad('physical explanation needs a real mesh object subject');
   }
   if(r.mode==='generated_video'&&(!generated||slide||!text(v.why)))bad('generated video needs a video handoff and visual.why, including the opening cut');
   if(r.mode==='editorial_html'&&(generated||!slide||slide.kind!=='diagram'||slide.motion!==true||slide.treatment!=='editorial'||slide.subject?.kind!=='type'||slide.object))bad('editorial quote/verdict needs a text subject on an editorial motion diagram');
   if(r.mode==='data_graph'&&slide?.chartRenderer!=='svg-v1')bad('data graphs require chartRenderer svg-v1 and the shared chart template');
  }
  return errors;
 }
 function checkData(data,segments){
  if(!data)return [];
  const errors=[],values=Array.isArray(data.values)?data.values:[],labels=values.map(v=>v?.label);
  if(new Set(labels).size!==labels.length)errors.push('chart labels must be unique');
  if(labels.some(l=>!text(l)||Array.from(l).length>24))errors.push('chart labels must have 1..24 characters; use concise source-faithful names');
  const max=data.chart==='map'?(data.map?.mode==='symbol'?12:250):['line','histogram'].includes(data.chart)?12:data.chart==='timeline'?4:6;
  if(values.length>max)errors.push('chart exceeds '+max+' marks; split the comparison into readable cuts');
  if(['bar','dot'].includes(data.chart)&&values.reduce((sum,v)=>sum+(Array.from(String(v?.label||'')).length>12?118:82),0)>496)errors.push('chart labels need more vertical space; shorten source-faithful labels or split the cut');
  if(['stacked-bar','donut','pie'].includes(data.chart)&&values.some(v=>Array.from(String(v?.label||'')).length>12)&&values.length>4)errors.push('long share labels need at most four parts; shorten labels or split the cut');
  if(['donut','pie'].includes(data.chart)&&values.reduce((sum,v)=>sum+Math.max(88,Math.ceil(Array.from(String(v?.label||'')).length/11)*31.05+50),0)>600)errors.push('circular chart labels exceed the phone-height budget; shorten source-faithful labels or split the composition');
  if(data.surface!=null&&!['paper','ink'].includes(data.surface))errors.push('chart surface must be paper or ink');
  if(data.decimals!=null&&(!Number.isInteger(data.decimals)||data.decimals<0||data.decimals>3))errors.push('chart decimals must be 0..3');
  if(data.chart==='line'||data.chart==='timeline'){
   const dates=values.map(v=>{
    const s=v?.date;if(typeof s!=='string'||!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(s))return NaN;
    const full=s.length===4?s+'-01-01':s.length===7?s+'-01':s,t=Date.parse(full);
    return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===full?t:NaN;
   });
   if(dates.some((d,i)=>!Number.isFinite(d)||(i>0&&d<=dates[i-1])))errors.push('time charts need strictly increasing ISO dates; spacing follows elapsed time');
   if(data.chart==='timeline'&&dates.some((d,i)=>i>0&&(d-dates[i-1])/(dates[dates.length-1]-dates[0])<.27))errors.push('timeline events overlap at phone size; split clustered events into a separate cut without changing their dates');
  }
  if(data.chart==='histogram'&&values.some((v,i)=>!Number.isFinite(v?.from)||!Number.isFinite(v?.to)||v.to<=v.from||v.value<0||(i>0&&v.from!==values[i-1].to)||(i>0&&Math.abs((v.to-v.from)-(values[0].to-values[0].from))>1e-9)))errors.push('histogram needs contiguous equal-width from/to bins and nonnegative frequencies');
  if(data.chart==='map')errors.push(...checkMap(data));
  const beats=data.beats;
  if(!Array.isArray(beats)||!beats.length||beats.length!==segments)errors.push('chart beats need one group, focus and insight per narration segment');
  else beats.forEach((b,i)=>{
   if(b?.group!==i+1||!Array.isArray(b.focus)||!b.focus.length||new Set(b.focus).size!==b.focus.length||b.focus.some(l=>!labels.includes(l))||!text(b.insight))errors.push('chart beat '+(i+1)+' needs its group, unique existing focus labels and a concrete insight');
   if(data.chart==='map'&&b?.focus?.length>1)errors.push('map beats focus on one location at a time for unambiguous geographic labels');
   const focus=x=>JSON.stringify(Array.isArray(x)?[...x].sort():x);
   if(i>0&&focus(b?.focus)===focus(beats[i-1]?.focus))errors.push('chart beat '+(i+1)+' repeats the same focus; shorten the cut or reveal another comparison');
  });
  return errors;
 }
 // Inline WGS84 geometry keeps rendering offline and binds geography to the scene hash.
 function checkMap(data){
  const errors=[],m=data.map||{},values=Array.isArray(data.values)?data.values:[];
  if(!['choropleth','symbol'].includes(m.mode))errors.push('map.mode must be choropleth or symbol');
  if(!text(m.source)||!text(m.license))errors.push('map needs boundary source and license attribution');
  if(m.projection!=='equal-area')errors.push('map.projection must be equal-area');
  if(m.mode==='choropleth'&&!['rate','density'].includes(m.measure))errors.push('choropleth needs a normalized rate or density; use symbol for counts');
  if(data.unit==='%'&&values.some(v=>v?.value>100))errors.push('percentage map values cannot exceed 100');
  if(values.some(v=>v?.value!==null&&(!Number.isFinite(v?.value)||v.value<0))||!values.some(v=>Number.isFinite(v?.value)))errors.push('map needs nonnegative values and at least one measured value; null means no data');
  const features=m.geojson?.features;
  if(m.geojson?.type!=='FeatureCollection'||!Array.isArray(features)||!features.length||features.length>500)return [...errors,'map needs an inline GeoJSON FeatureCollection with 1..500 Polygon/MultiPolygon features'];
  const ids=new Set(),points=[];let count=0;
  const coordinate=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  for(const f of features){
   if(f?.type!=='Feature'||!text(f.id)||ids.has(f.id))errors.push('map features need unique string ids');
   ids.add(f?.id);
   const g=f?.geometry,polys=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:null;
   if(!Array.isArray(polys)||!polys.length){errors.push('map geometry must be Polygon or MultiPolygon');continue}
   for(const polygon of polys){
    if(!Array.isArray(polygon)||!polygon.length){errors.push('map polygon needs rings');continue}
    for(const ring of polygon){
     if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!coordinate(p))){errors.push('map rings need at least four valid WGS84 coordinates');continue}
     count+=ring.length;if(count>100000)return [...errors,'simplify map boundaries to at most 100000 coordinates while preserving topology'];for(const point of ring)points.push(point);
     if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])errors.push('map rings must close');
     if(ring.some((p,i)=>i>0&&Math.abs(p[0]-ring[i-1][0])>180))errors.push('split map geometry at the antimeridian before rendering');
     const area=ring.slice(1).reduce((a,p,i)=>a+ring[i][0]*p[1]-p[0]*ring[i][1],0);
     if(Math.abs(area)<1e-10)errors.push('map rings must enclose an area');
    }
   }
  }
  if(count>100000)errors.push('simplify map boundaries to at most 100000 coordinates while preserving topology');
  if(m.geojson.crs)errors.push('map coordinates must use WGS84 longitude/latitude without a custom CRS');
  if(m.mode==='choropleth'){
   const regions=values.map(v=>v?.regionId);
   if(regions.some(id=>!ids.has(id))||new Set(regions).size!==regions.length)errors.push('choropleth values need unique regionId matches in the boundary features');
  }
  if(m.mode==='symbol'){
   if(values.some(v=>!coordinate([v?.longitude,v?.latitude])))errors.push('map symbols need source-based longitude and latitude');
   if(points.length){
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    if(values.some(v=>v?.longitude<minX||v?.longitude>maxX||v?.latitude<minY||v?.latitude>maxY))errors.push('map symbol is outside the supplied geographic extent');
   }
  }
  return [...new Set(errors)];
 }
 const normalize=s=>String(s||'').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 function checkEpisode(win){
  const scenes=win.SCENES||[],errors=[],reasons=new Map();
  if(win.PRELUDE!=null)errors.push('PRELUDE is outside the checked timeline; put the opening in SCENES with its route, duration and assets');
  let textCount=0,textSeconds=0,total=0;
  scenes.forEach((s,i)=>{
   if(exempt(s))return;
   total+=Number.isFinite(s.duration)?s.duration:0;
   const r=s.shot?.render,slide=s.visual?.slide;
   const key=normalize(r?.reason);
   if(key){const shots=reasons.get(key)||[];shots.push(i+1);reasons.set(key,shots)}
   if(r?.mode==='editorial_html'||slide?.subject?.kind==='type'||slide?.kind==='kinetic'){
    textCount++;textSeconds+=Number.isFinite(s.duration)?s.duration:0;
    if(!r||r.mode!=='editorial_html')errors.push('shot '+(i+1)+': text-led slides must use editorial_html; motionBeats cannot turn typography into subject motion');
    if(s.duration>8)errors.push('shot '+(i+1)+': text-led slide exceeds 8 seconds');
   }
  });
  for(const shots of reasons.values())if(shots.length>=3)errors.push('shots '+shots.join(', ')+': repeated render reason; choose each cut from its own subject and visible change');
  const long=win.FORMAT==='youtube-long-16x9';
  if((!long&&textCount>2)||(long&&total>0&&textSeconds/total>0.2))errors.push('text-led slides dominate: at most 2 per short, or 20% of generated duration in long-form; use source images, acted processes or actual charts where the content calls for them');
  return errors;
 }
 const api={PURPOSES,LABELS,CHARTS,recommend,exempt,checkScene,checkData,checkMap,checkEpisode};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RENDER_ROUTING=api;
})(typeof window==='object'?window:globalThis);
