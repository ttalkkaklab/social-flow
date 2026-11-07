'use strict';

// One opening view for authoring, the set camera and the model prompt. Left/right name
// the visible side of the subject, not the side of the output image.
const BEARINGS = {front:0, 'three-quarter-left':45, 'three-quarter-right':-45, 'profile-left':90, 'profile-right':-90, rear:180};
const MODES = [...Object.keys(BEARINGS), 'ots', 'pov'];
const SCHEMA = {type:'object',additionalProperties:false,required:['subject','reason','crop','mode'],properties:{
  subject:{type:'string',minLength:1,description:'English: what the audience must read, including the owner of a body detail.'},
  reason:{type:'string',minLength:1,description:'Why this evidence or reaction matters in this shot; editorial guidance, not provider text.'},
  crop:{type:'string',minLength:1,description:'English: visible boundaries, e.g. only Mina’s clenched right hand and the key fill the frame.'},
  subjectType:{type:'string',enum:['person','object','detail'],description:'What the crop measures. Person keeps anatomical shot-size boundaries; object/detail uses subject-relative framing. Defaults to person with cast, detail for insert/ecu or an explicit target, otherwise object.'},
  mode:{type:'string',enum:MODES,description:'Opening viewpoint. Left/right name the visible side of the subject. Independent of shot.angle (height).'},
  subjectId:{type:'string',minLength:1,description:'Blocked actor or set object to frame. Defaults to the shot cast for ordinary person shots.'},
  viewerId:{type:'string',minLength:1,description:'Blocked observer for pov/ots; required for those modes.'},
  target:{type:'object',additionalProperties:false,required:['point','span'],description:'Exact body/detail crop in a built set. Use the actual opening blocking, never a guessed face-height substitute.',properties:{
    point:{type:'array',minItems:3,maxItems:3,items:{type:'number'},description:'World-space target [x,y,z] in metres, taken from the staged opening pose.'},
    span:{type:'number',exclusiveMinimum:0,description:'Visible vertical extent in metres around the target; controls detail magnification.'}
  }}
}};
function validate(view) {
  if(!view||typeof view!=='object'||Array.isArray(view))return ['view must be an object'];
  const errors=Object.keys(view).filter(k=>!Object.hasOwn(SCHEMA.properties,k)).map(k=>'unknown view field '+k);
  for(const key of ['subject','reason','crop','mode'])if(typeof view[key]!=='string'||!view[key].trim())errors.push('view.'+key+' is required');
  if(!MODES.includes(view.mode))errors.push('unknown view mode');
  if(view.subjectType!==undefined&&!['person','object','detail'].includes(view.subjectType))errors.push('unknown view subjectType');
  for(const key of ['subjectId','viewerId'])if(view[key]!==undefined&&(typeof view[key]!=='string'||!view[key].trim()))errors.push('invalid view.'+key);
  if(['ots','pov'].includes(view.mode)&&!view.viewerId)errors.push('view.viewerId is required for ots/pov');
  if(['ots','pov'].includes(view.mode)&&!view.subjectId)errors.push('view.subjectId is required for ots/pov');
  if(view.viewerId&&view.viewerId===view.subjectId)errors.push('the observer and subject must differ');
  if(view.target!==undefined){
    const t=view.target;
    if(!t||typeof t!=='object'||Object.keys(t).some(k=>!['point','span'].includes(k))||!Array.isArray(t.point)||t.point.length!==3||!t.point.every(Number.isFinite)||!Number.isFinite(t.span)||t.span<=0)errors.push('view.target needs a finite point and positive span');
    if(['ots','pov'].includes(view.mode))errors.push('detail targets use a direct viewpoint, not ots/pov');
  }
  return errors;
}
function checked(view) {
  if(view===undefined)return undefined;
  const errors=validate(view);
  if(errors.length)throw new Error('shot_view_invalid: '+errors.join('; '));
  return view;
}
const WORDS={
  front:'frontal view of the subject; gaze follows the action, not automatically the lens',
  'three-quarter-left':'the left side of the subject is visible in three-quarter view, facing camera-left',
  'three-quarter-right':'the right side of the subject is visible in three-quarter view, facing camera-right',
  'profile-left':'the left profile of the subject is visible, facing camera-left',
  'profile-right':'the right profile of the subject is visible, facing camera-right',
  rear:'the subject is seen from behind',
  ots:'over the named observer’s shoulder toward the subject',
  pov:'through the named observer’s eyes toward the subject'
};
function instructions(view) {
  if(!checked(view))return '';
  return 'Opening attention: '+view.subject+'. Opening crop: '+view.crop+'. Opening viewpoint: '+WORDS[view.mode]+
    (view.viewerId?' (observer '+view.viewerId+')':'')+'.';
}
// Only explicit framing statements are checked here, not the story's artistic suitability.
// Negative statements and incidental body parts are not crop declarations.
function framingConflicts(size,view,scene='',noPerson=false) {
  const aliases={ws:'ls'}, chosen=aliases[size]||size;
  const known=['els','ls','fs','mfs','ms','mcu','cu','choker','ecu','insert'];
  if(!known.includes(chosen))return [];
  const rules=[
    [/\b(?:head[- ]to[- ]toe|full[- ]body)\b/i,['els','ls','fs']],
    [/\bwaist[- ]up\b/i,['ms']],
    [/\b(?:chest[- ]up|frame bottom at mid[- ]chest)\b/i,['mcu']],
    [/\b(?:face only|only (?:the |[\w’'-]+ )?face|forehead to chin)\b/i,['cu','choker']],
  ];
  const person=(view?.subjectType||((noPerson||view?.target||['insert','ecu'].includes(chosen))?'detail':'person'))==='person';
  const parts=[['view.crop',view?.crop||''],['scene',scene]];
  const out=[];
  for(const [field,text] of parts)for(const sentence of text.split(/[.!?;]\s*/)){
    if(/\b(?:no|not|without|never|avoid)\b/i.test(sentence))continue;
    // In scene prose only a leading shot declaration is a second camera instruction.
    // "She examines a full-body portrait" must not be mistaken for a camera crop.
    if(field==='scene'&&!/^\s*(?:(?:a|an|the)\s+)?(?:extreme |medium |big |tight |wide |full |close[- ]up|head[- ]to[- ]toe|waist[- ]up|chest[- ]up)/i.test(sentence))continue;
    const shot=sentence.match(/\b(extreme (?:wide|long) shot|medium close[- ]up|medium (?:full|long) shot|extreme close[- ]up|(?:big|tight) close[- ]up|wide (?:establishing )?shot|long shot|full shot|medium shot|close[- ]up)\b/i);
    if(shot){
      const label=shot[1].toLowerCase().replace(/-/g,' ');
      const stated=label.startsWith('extreme wide')||label.startsWith('extreme long')?'els':label==='medium close up'?'mcu':/^medium (full|long)/.test(label)?'mfs':label==='extreme close up'?'ecu':/^(big|tight) close up$/.test(label)?'choker':/^(wide (establishing )?|long )shot$/.test(label)?'ls':label==='full shot'?'fs':label==='medium shot'?'ms':'cu';
      if(stated!==chosen&&!(chosen==='insert'&&['cu','ecu'].includes(stated)))out.push(field+' says '+shot[1]+' but shot.size is '+size);
    }
    if(person)for(const [pattern,allowed] of rules){
      const match=sentence.match(pattern);
      if(match&&!allowed.includes(chosen))out.push(field+' says '+match[0]+' but shot.size is '+size);
    }
  }
  return out;
}
module.exports={BEARINGS,MODES,SCHEMA,validate,checked,instructions,framingConflicts};
