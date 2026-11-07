'use strict';

// One opening view for authoring, the set camera and the model prompt. Left/right name
// the visible side of the subject, not the side of the output image.
const BEARINGS = {front:0, 'three-quarter-left':45, 'three-quarter-right':-45, 'profile-left':90, 'profile-right':-90, rear:180};
const MODES = [...Object.keys(BEARINGS), 'ots', 'pov'];
const SCHEMA = {type:'object',additionalProperties:false,required:['subject','reason','crop','mode'],properties:{
  subject:{type:'string',minLength:1,description:'English: what the audience must read, including the owner of a body detail.'},
  reason:{type:'string',minLength:1,description:'Why this evidence or reaction matters in this shot; editorial guidance, not provider text.'},
  crop:{type:'string',minLength:1,description:'English: visible boundaries, e.g. only Mina’s clenched right hand and the key fill the frame.'},
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
module.exports={BEARINGS,MODES,SCHEMA,validate,checked,instructions};
