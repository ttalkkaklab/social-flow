/* Shared motion vocabulary. Selection is editorial judgment; validation checks executable inputs. */
(function(root) {
  'use strict';
  const rows = [
    ['kinetic_type','키네틱 타이포그래피','Words carry the argument','short statement','motion_html',true],
    ['comparison','수량·비교','Compare magnitudes on a common scale','labelled values and unit','data_graph',true],
    ['part_whole','전체·부분','Explain composition or allocation','nonnegative values summing to total','data_graph',true],
    ['trend','추세','Show measured change over time','ordered observations','data_graph',true],
    ['timeline','타임라인','Explain event order','dated events','data_graph',true],
    ['process','과정·절차','Show ordered stages and handoffs','ordered steps','motion_html',true],
    ['relationship','관계·흐름','Explain connections, not necessarily sequence','nodes and explicit edges','motion_html',true],
    ['causal','원리·인과','Change a cause and show its effect','model, variable and limits','motion_html',false],
    ['before_after','상태 변환·전후 비교','Compare the same subject before and after','matched states and invariant','motion_html',true],
    ['ui_demo','UI 조작 시연','Show an action and visible interface response','action, input and output','motion_html',true],
    ['input_output','입력·산출물 변환','Trace input into a corresponding result','input and output content','motion_html',true],
    ['recorded_evidence','실제 기록 기반 설명','Prove an actual operation','supplied recording and source','stock_video',false],
    ['spatial','공간·경로 탐색','Locate a detail within a whole','map or authored space and focus path','motion_html',false],
    ['layers','레이어 분해·재조립','Explain a digital layer structure','ordered layer names','motion_html',true],
    ['mechanism','오브젝트·메커니즘','Explain physical operation','articulated mesh and action','object_html',false],
    ['product_hero','제품 히어로','Reveal product form and material','recognizable product asset','object_html',false],
    ['character_action','캐릭터·상황','Explain a human action or reaction','character and purposeful action','character_html',false],
    ['metaphor','연속 모핑·시각적 은유','Connect concepts through a visual analogy','explicit analogy and correspondences','motion_html',false],
    ['simulation','제너레이티브·시뮬레이션','Explain accumulation and limits','capacity, arrival and service rates','motion_html',true],
    ['brand_mark','브랜드·로고','Make an identity memorable','supplied logo and motion signature','motion_html',false],
    ['montage','리듬 중심 몽타주','Build energy rather than detailed explanation','assets and musical beat map','motion_html',false],
  ];
  const TYPES = Object.fromEntries(rows.map(([id,label,use,inputs,route,builtIn])=>[id,{id,label,use,inputs,route,builtIn}]));
  const PALETTES = {
    editorial: {paper:'#f7f8fa',ink:'#192c43',muted:'#526479',accent:'#245be5',soft:'#e4eaf3'},
    botanical: {paper:'#f2f6f0',ink:'#183b31',muted:'#50665a',accent:'#217255',soft:'#dce9de'},
    plum: {paper:'#f7f3f7',ink:'#382a45',muted:'#6e5a78',accent:'#8542a5',soft:'#e9dfed'},
    midnight: {paper:'#111e32',ink:'#f6f8fc',muted:'#b2c1d6',accent:'#80bfff',soft:'#263b55'},
  };
  const txt=x=>typeof x==='string'&&!!x.trim();
  function inspect(scene) {
    const m=scene.shot?.motionGraphic, errors=[], advice=[];
    if(!m)return {errors,advice}; // Existing boards retain their original contract.
    if(m.version!==1)errors.push('motionGraphic.version must be 1');
    if(!TYPES[m.type])errors.push('unknown motionGraphic.type: '+m.type);
    if(!txt(m.reason))advice.push('Explain why this type serves this line; name a rejected alternative.');
    if(!txt(m.intent))advice.push('Name the one thing the viewer should understand or feel.');
    if(!['data','recording','reenactment','metaphor'].includes(m.evidence))errors.push('motionGraphic.evidence must be data, recording, reenactment or metaphor');
    if(scene.visual?.slide?.renderer==='motion-svg-v1'&&!PALETTES[m.style?.palette])errors.push('choose a supported palette or author a custom slide without the built-in renderer');
    if(!txt(m.style?.reason))advice.push('Explain palette and typography in the subject context.');
    if(m.evidence==='recording'&&!scene.visual?.src&&!scene.visual?.clip)errors.push('recording evidence requires an actual source file');
    if(!Array.isArray(m.beats)||!m.beats.length)advice.push('Plan introduce, change and read/hold beats against speech or music.');
    else for(const b of m.beats)if(!b||!Number.isFinite(b.at)||b.at<0||b.at>1||!txt(b.action))errors.push('beats need normalized finite at and a visible action');
    if(scene.shot?.render?.mode==='motion_html'){
      if(!Number.isFinite(scene.duration)||scene.duration<=0)errors.push('motion HTML needs a positive finite duration');
      if(!scene.visual?.slide||scene.visual.slide.motion!==true)errors.push('motion HTML needs a motion slide handoff');
    }
    return {errors,advice};
  }
  function validateContent(scene) {
    const m=scene.shot?.motionGraphic, errors=inspect(scene).errors;
    if(!m||!TYPES[m.type]?.builtIn)return errors.concat('type needs an authored slide or its existing asset route; no generic fallback');
    const c=m.content||{};
    if(m.evidence==='recording')errors.push('built-in graphics cannot claim recording evidence; use the actual footage route');
    if(!txt(c.title))errors.push('content.title is required');
    if(['comparison','part_whole','trend'].includes(m.type)){
      if(!Array.isArray(c.values)||c.values.length<2||c.values.length>6||c.values.some(v=>!txt(v?.label)||!Number.isFinite(v.value)||v.value<0))errors.push('2..6 labelled nonnegative finite values required');
      if(!txt(c.unit)||!txt(c.source))errors.push('data content needs unit and source');
      if(m.type==='part_whole'&&Array.isArray(c.values)&&c.values.length>4)errors.push('built-in part/whole supports at most 4 labelled parts; author a denser composition for more');
      if(m.type==='part_whole'&&(!(c.total>0)||Math.abs((Array.isArray(c.values)?c.values:[]).reduce((a,b)=>a+(b?.value||0),0)-c.total)>1e-8))errors.push('parts must sum to positive total');
      if(m.type!=='part_whole'&&(Array.isArray(c.values)?c.values:[]).every(v=>v?.value===0))errors.push('data scale must be positive');
    }
    if(['process','timeline','layers','relationship'].includes(m.type)){
      if(!Array.isArray(c.items)||c.items.length<2||c.items.length>4||c.items.some(v=>!txt(v?.label)))errors.push('2..4 labelled items required');
      if(m.type==='timeline'&&(Array.isArray(c.items)?c.items:[]).some(v=>!txt(v?.date)))errors.push('timeline items need dates');
      if(m.type==='relationship'&&(!Array.isArray(c.edges)||!c.edges.length||c.edges.some(e=>!Array.isArray(e)||e.length!==2||e.some(i=>!Number.isInteger(i)||i<0||i>=c.items?.length)||e[0]===e[1])))errors.push('relationship edges must reference distinct existing item indexes');
    }
    if(['before_after','input_output','ui_demo'].includes(m.type)&&(!txt(c.input)||!txt(c.output)))errors.push('input and output are required');
    if(c.mappings&&(!Array.isArray(c.mappings)||c.mappings.length<1||c.mappings.length>3||c.mappings.some(v=>!txt(v?.from)||!txt(v?.to))))errors.push('mappings need 1..3 explicit from/to correspondences');
    if(m.type==='ui_demo'&&!txt(c.action))errors.push('UI demo needs an explicit action label');
    if(m.type==='kinetic_type'&&(!Array.isArray(c.lines)||!c.lines.length||c.lines.length>3||c.lines.some(v=>!txt(v))))errors.push('1..3 short lines required');
    if(m.type==='simulation'&&(!Number.isInteger(c.capacity)||c.capacity<2||c.capacity>12||!Number.isFinite(c.arrival)||c.arrival<=0||!Number.isFinite(c.service)||c.service<=0))errors.push('simulation needs capacity 2..12 and positive finite arrival/service rates');
    return errors;
  }
  const api={TYPES,PALETTES,inspect,validateContent};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MOTION_GRAPHICS=api;
})(typeof window==='object'?window:globalThis);
