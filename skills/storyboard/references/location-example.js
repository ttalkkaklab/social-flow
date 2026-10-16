#!/usr/bin/env node
/* Reproducible local workshop fixture. No credentials, portal or paid calls. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const objects=[];
function box(id,label,position,size,color,role){objects.push({id,label,kind:'box',position,size,color,...(role?{role}:{})});}
function cylinder(id,label,position,size,color){objects.push({id,label,kind:'cylinder',position,size,color});}
box('floor','Oak floor',[0,0,-.12],[6,5,.24],'#b49a77');
for(let x=-2.8;x<3;x+=.4)box('floor-seam-'+objects.length,'Floor board seam',[x,0,.005],[.012,5,.006],'#967e62');
box('west-wall','West wall',[-3,0,1.5],[.16,5,3],'#c9c7b8','wall');
// Two true window openings in the north wall.
box('north-base','North wall below windows',[0,2.5,.5],[6,.16,1],'#dedbcb','wall');
box('north-top','North wall above windows',[0,2.5,2.8],[6,.16,.4],'#dedbcb','wall');
for(const [i,x,w] of [[0,-2.65,.7],[1,0,1.4],[2,2.65,.7]])box('north-pier-'+i,'North wall pier',[x,2.5,1.8],[w,.16,1.6],'#dedbcb','wall');
for(const [i,x] of [[1,-1.5],[2,1.5]]){
 box('window-'+i,'Window '+i,[x,2.56,1.8],[1.6,.04,1.6],'#9ebac5');
 for(const z of [1,2.6])box('window-'+i+'-frame-'+z,'Window frame',[x,2.38,z],[1.8,.14,.09],'#eee8d9');
 for(const dx of [-.85,0,.85])box('window-'+i+'-mullion-'+dx,'Window mullion',[x+dx,2.38,1.8],[.07,.14,1.65],'#eee8d9');
 box('window-'+i+'-sill','Window sill',[x,2.3,.96],[1.9,.35,.1],'#b28d60');
}
box('east-rear','East wall rear',[3,1.55,1.5],[.16,1.9,3],'#b3c1bb','wall');
box('east-front','East wall front',[3,-2,1.5],[.16,1,3],'#b3c1bb','wall');
box('east-lintel','Door lintel',[3,-.45,2.7],[.16,2.1,.6],'#b3c1bb','wall');
box('door','Ochre door',[3,-.45,1.15],[.08,2.05,2.3],'#a76f3c');
box('door-handle','Door handle',[2.9,-1.2,1.05],[.1,.18,.05],'#d4b567');
box('desk-top','Workbench top',[-.4,1.1,.9],[2.8,1,.13],'#8b5838');
for(const x of [-1.65,.85])for(const y of [.72,1.48])box('desk-leg-'+objects.length,'Workbench leg',[x,y,.43],[.13,.13,.86],'#3c5656');
box('desk-brace','Workbench brace',[-.4,1.1,.25],[2.6,.09,.1],'#3c5656');
box('cutting-mat','Green cutting mat',[-.45,.95,.98],[1,.55,.015],'#496c63');
box('toolbox','Blue tool chest',[.5,1.15,1.12],[.5,.35,.3],'#3e6078');
box('toolbox-latch','Tool chest latch',[.5,.968,1.11],[.07,.02,.08],'#c9c5b4');
cylinder('stool-seat','Stool seat',[-.5,-.15,.57],[.55,.55,.1],'#c19456');
for(const x of [-.68,-.32])for(const y of [-.33,.03])box('stool-leg-'+objects.length,'Stool leg',[x,y,.27],[.06,.06,.54],'#4e5c59');
for(const z of [.25,1,1.75,2.5])box('shelf-'+z,'Shelf plank',[-2.5,.6,z],[.65,2,.08],'#8e7356');
for(const y of [-.35,1.55])box('shelf-post-'+y,'Shelf upright',[-2.5,y,1.35],[.09,.09,2.7],'#455955');
for(let i=0;i<6;i++)box('book-'+i,'Reference book',[-2.5,-.1+i*.18,1.26],[.4,.12,.44],['#b76348','#647c82','#c9b68d'][i%3]);
cylinder('plant-pot','Plant pot',[2,1.7,.28],[.55,.55,.55],'#ac6248');
cylinder('plant-stem','Plant stem',[2,1.7,.9],[.06,.06,.9],'#4f6744');
for(let i=0;i<5;i++)objects.push({id:'leaf-'+i,label:'Plant leaf',kind:'sphere',position:[2+Math.sin(i*2)*.2,1.7+Math.cos(i*2)*.2,.8+i*.13],size:[.35,.22,.12],color:'#58775a'});
const camera=(position,target,lensMm=28)=>({position,target,lensMm,width:960,height:540});
objects.forEach(o=>{o.id=o.id.replace(/\./g,'_');});
const spec={schemaVersion:1,id:'workshop',revision:1,name:'연속성 시험 작업실',description:'Authored open-front workshop set with two north windows, east ochre door, central workbench and west shelving.',units:'metres',up:'Z',provenance:{kind:'authored',notes:'Fictional measured-coordinate test set. Open front is a deliberate studio cutaway, not a surveyed building.'},objects,
 invariants:['Exactly two windows on the north wall','Ochre doorway remains on the east wall','Workbench stays in front of the windows','Bookshelf stays against the west wall'],
 states:{day:{label:'낮 · 문 닫힘',light:1,objects:{}},night:{label:'밤 · 조명 낮춤',light:.18,objects:{}},open:{label:'낮 · 문 열림',light:1,objects:{door:{visible:false},'door-handle':{visible:false}}}},
 cameras:{wide:camera([.3,-5.8,3.6],[0,.6,1],30),reverse:camera([-1.8,1.8,1.8],[2.8,-.5,1.3],24),detail:camera([.1,-.8,1.8],[-.4,1.1,.9],42),doorway:camera([4,-.7,1.8],[-1,1,1],24)}};
function example(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'workshop-spec.json'),JSON.stringify(spec,null,2));
 const scenes=['wide','reverse','detail','doorway','wide'].map((cameraId,i)=>({id:'s'+String(i+1).padStart(4,'0'),type:'scene',title:['작업실 전경','출입구 역방향','작업대 근접','문 통과','야간 상태'][i],duration:4,narration:[],visual:{camera:{framing:cameraId+' workshop',movement:'locked-off',speed:'still',end:'hold composition'}},shot:{cutType:'scenery',render:{mode:'still_camera',purpose:'place',reason:'Inspect workshop continuity'},videoDesign:{look:'toon3d',worldId:'workshop',before:'The workshop is visible',action:'The room stays still',after:'The same workshop',continuity:'The workshop keeps both windows and its fixed furniture'}}}));
 const win={THEME:{brand:'Location continuity lab',accent:'#496c63',accent2:'#b76348',ink:'#242424'},SCENE_SB_DOC:{displayTitle:'장소 연속성 검토',channelName:'Local test',core:'Five views of one immutable workshop'},FORMAT:'youtube-long-16x9',PRODUCTION:{mode:'stills_only',renderRatioVersion:1,style:{preset:'toon-3d',world:'A fictional workshop',materials:'Matte painted wood',palette:'Muted teal and ochre',lighting:'Soft studio light',camera:'Readable architectural views'}},SCENES:scenes};
 fs.mkdirSync(path.join(dir,'storyboard'),{recursive:true});require('./location-assets.js').saveBoard(path.join(dir,'storyboard','scenes.js'),win);return {spec:path.join(dir,'workshop-spec.json'),board:path.join(dir,'storyboard','scenes.js')};}
module.exports={spec,example};if(require.main===module)console.log(JSON.stringify(example(path.resolve(process.argv[2])),null,2));
