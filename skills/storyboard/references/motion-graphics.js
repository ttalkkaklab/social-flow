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
  // Themes couple typography, composition and timing; palettes remain a legacy option.
  const THEMES = {
    report: {typography:{title:'paperlogy',body:'pretendard',number:'spacegrotesk',latin:'spacegrotesk'},label:'리포트', use:'Measured quantities, research and evidence',
      colors:{paper:'#f5f7fb',ink:'#172d49',muted:'#50627b',accent:'#2359c4',soft:'#dce5f1'},
      type:{title:56,weight:650,tracking:-1.5},layout:{pad:88,titleY:130,bodyY:290,radius:3},motion:{curve:'smooth',end:0.82}},
    product: {typography:{title:'paperlogy',body:'pretendard',number:'spacegrotesk',latin:'spacegrotesk'},label:'제품 시연', use:'Software actions and input/output transformations',
      colors:{paper:'#edf1f8',ink:'#202c48',muted:'#53617d',accent:'#5845c6',soft:'#dce1ee'},
      type:{title:62,weight:600,tracking:-2},layout:{pad:104,titleY:140,bodyY:310,radius:18},motion:{curve:'decelerate',end:0.78}},
    learning: {typography:{title:'paperlogy',body:'pretendard',number:'spacegrotesk',latin:'spacegrotesk'},label:'학습', use:'Ordered steps, conceptual relationships and models',
      colors:{paper:'#eef5f2',ink:'#173f38',muted:'#48695f',accent:'#137967',soft:'#d5e6df'},
      type:{title:54,weight:600,tracking:-1},layout:{pad:96,titleY:138,bodyY:310,radius:8},motion:{curve:'smooth',end:0.88}},
    campaign: {typography:{title:'blackhansans',body:'pretendard',number:'robotoflex',latin:'robotoflex'},label:'캠페인', use:'Short expressive statements and identity beats',
      colors:{paper:'#762446',ink:'#fff8f1',muted:'#efd4df',accent:'#ffd2a5',soft:'#984461'},
      type:{title:76,weight:780,tracking:-3},layout:{pad:80,titleY:150,bodyY:330,radius:2},motion:{curve:'decelerate',end:0.94}},
  };
  THEMES.story = {label:'스토리',use:'Quotes, cultural stories and reflective narration',
    typography:{title:'gowunbatang',body:'pretendard',number:'spacegrotesk',latin:'gowunbatang'},
    colors:{paper:'#f2f0f7',ink:'#362e49',muted:'#655d76',accent:'#73549a',soft:'#e2ddeb'},
    type:{title:64,weight:700,tracking:-1},layout:{pad:104,titleY:142,bodyY:325,radius:4},motion:{curve:'smooth',end:1}};
  THEMES.playful = {label:'플레이풀',use:'Friendly character-led explanations and light learning',
    typography:{title:'jua',body:'pretendard',number:'spacegrotesk',latin:'jua'},
    colors:{paper:'#fff5e4',ink:'#4b3820',muted:'#776044',accent:'#986117',soft:'#f1dfbf'},
    type:{title:100,weight:700,tracking:0},layout:{pad:96,titleY:140,bodyY:310,radius:24},motion:{curve:'decelerate',end:.8}};
  const CONTEXT_THEMES={research:'report',software:'product',education:'learning',campaign:'campaign',storytelling:'story',friendly:'playful'};
  function resolveTheme(m,boardTheme) {
    const own=m.style?.theme;
    const inherited=boardTheme&&(!own||own.id==='auto'&&!own.context);
    const request=inherited?boardTheme:own;
    if(!request)return null; // Old approved boards retain their rendering.
    if(request.context&&!Object.hasOwn(CONTEXT_THEMES,request.context))throw Error('unknown motion theme context');
    let id=request.id, reason=request.reason, selectedBy='explicit';
    if(id==='auto'){
      if(request.context&&!Object.hasOwn(CONTEXT_THEMES,request.context))throw Error('unknown motion theme context');
      id=CONTEXT_THEMES[request.context];selectedBy=request.context?'context':'type';
      if(!id)id=['comparison','part_whole','trend','timeline','recorded_evidence'].includes(m.type)?'report':
        ['ui_demo','input_output','before_after','layers','product_hero'].includes(m.type)?'product':
        ['kinetic_type','brand_mark','montage'].includes(m.type)?'campaign':'learning';
      reason=request.context?`${({research:'수치와 근거',software:'소프트웨어 사용',education:'학습과 이해',campaign:'짧고 강한 메시지',storytelling:'인용과 이야기',friendly:'친근한 설명'})[request.context]} 중심의 전달 목적에 맞춰 ${THEMES[id].label} 테마를 선택했습니다.`:`${TYPES[m.type]?.label||m.type} 유형의 정보 구조에 맞춰 ${THEMES[id].label} 테마를 선택했습니다.`;
    }
    if(!Object.hasOwn(THEMES,id))throw Error('unknown motion theme: '+id);
    return {id,reason:reason||(inherited?`스토리보드 공통 ${THEMES[id].label} 테마를 적용했습니다.`:THEMES[id].use),selectedBy:inherited?'storyboard':selectedBy,systemVersion:1,typography:{...THEMES[id].typography}};
  }
  function applyTheme(scene,boardTheme) {
    const m=scene.shot?.motionGraphic;
    if(!m||(!m.style?.theme&&!boardTheme))return scene;
    const resolved=resolveTheme(m,boardTheme);
    return {...scene,shot:{...scene.shot,motionGraphic:{...m,style:{...m.style,theme:{id:'auto',...m.style?.theme,resolved}}}}};
  }
  const txt=x=>typeof x==='string'&&!!x.trim();
  function inspect(scene,boardTheme) {
    const m=scene.shot?.motionGraphic, errors=[], advice=[];
    if(!m)return {errors,advice}; // Existing boards retain their original contract.
    if(m.version!==1)errors.push('motionGraphic.version must be 1');
    if(!Object.hasOwn(TYPES,m.type))errors.push('unknown motionGraphic.type: '+m.type);
    if(!txt(m.reason))advice.push('Explain why this type serves this line; name a rejected alternative.');
    if(!txt(m.intent))advice.push('Name the one thing the viewer should understand or feel.');
    if(!['data','recording','reenactment','metaphor'].includes(m.evidence))errors.push('motionGraphic.evidence must be data, recording, reenactment or metaphor');
    if(m.style?.theme||boardTheme){try{resolveTheme(m,boardTheme);}catch(e){errors.push(e.message);}if(m.style?.theme?.context&&!Object.hasOwn(CONTEXT_THEMES,m.style.theme.context))errors.push('unknown motion theme context');}
    if(scene.visual?.slide?.renderer==='motion-svg-v1'&&!m.style?.theme&&!boardTheme&&!PALETTES[m.style?.palette])errors.push('choose a supported palette or author a custom slide without the built-in renderer');
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
  function validateContent(scene,boardTheme) {
    const m=scene.shot?.motionGraphic, errors=inspect(scene,boardTheme).errors;
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
    if(Array.isArray(c.mappings)&&c.mappings.some(item=>item?.fields!==undefined&&(!Array.isArray(item.fields)||!item.fields.length||item.fields.length>2||item.fields.some(v=>!txt(v)||!txt(item.from)||!txt(item.to)||!item.from.includes(v)||!item.to.includes(v)))))errors.push('mapping fields must contain 1..2 nonempty exact substrings of both from and to');
    if(Array.isArray(c.items)&&c.items.some(v=>v?.artifactKind&&(!['frames','checklist'].includes(v.artifactKind)||!Array.isArray(v.artifactItems)||v.artifactItems.length<1||v.artifactItems.length>3||v.artifactItems.some(t=>!txt(t)))))errors.push('artifactKind needs frames or checklist and 1..3 short artifactItems');
    if(Array.isArray(c.items)&&c.items.some(v=>v?.artifactVisuals!==undefined&&(!Array.isArray(v.artifactVisuals)||v.artifactVisuals.length!==v.artifactItems?.length||v.artifactVisuals.some(k=>!['bars','flow','check'].includes(k)))))errors.push('artifactVisuals must match artifactItems with bars, flow or check');
    if(m.type==='kinetic_type'&&(!Array.isArray(c.lines)||!c.lines.length||c.lines.length>3||c.lines.some(v=>!txt(v))))errors.push('1..3 short lines required');
    if(m.type==='kinetic_type'&&c.emphasis!==undefined&&(!Array.isArray(c.emphasis)||c.emphasis.length!==c.lines?.length||c.emphasis.some((v,i)=>typeof v!=='string'||(v&&(!txt(c.lines?.[i])||!c.lines[i].includes(v))))))errors.push('emphasis must align with lines and quote an exact substring (empty string means no emphasis)');
    if(m.type==='simulation'&&(!Number.isInteger(c.capacity)||c.capacity<2||c.capacity>12||!Number.isFinite(c.arrival)||c.arrival<=0||!Number.isFinite(c.service)||c.service<=0))errors.push('simulation needs capacity 2..12 and positive finite arrival/service rates');
    return errors;
  }
  const api={TYPES,PALETTES,THEMES,CONTEXT_THEMES,resolveTheme,applyTheme,inspect,validateContent};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MOTION_GRAPHICS=api;
})(typeof window==='object'?window:globalThis);
