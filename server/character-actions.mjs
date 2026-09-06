/* Deterministic, contact-driven actions shared by illustration templates. */
import * as T from 'three';
import {M,group,box,cyl,tube,doll,backdrop,table,seal,cart} from './illustration-components.mjs';
const v=a=>new T.Vector3(...a),down=v([0,-1,0]);
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10)};
const beat=(t,start,end)=>ease((t-start)/(end-start));
const world=(o,p=[0,0,0])=>o.localToWorld(v(p));

// Two fixed-length arm segments. Targets are world points; elbows bend toward a pole.
export function reach(actor,side,target,pole=[0,-1,.4]){
 actor.updateWorldMatrix(true,true);
 const arm=actor.getObjectByName(actor.name+side+'Arm'),elbow=actor.getObjectByName(actor.name+side+'Elbow');
 const aim=actor.worldToLocal(target.clone()).sub(arm.position),d=Math.max(.041,Math.min(.759,aim.length())),axis=aim.normalize();
 let bend=v(pole).addScaledVector(axis,-v(pole).dot(axis));
 if(bend.lengthSq()<1e-8)bend=v([1,0,0]).addScaledVector(axis,-axis.x);
 bend.normalize();const along=(.40**2-.36**2+d*d)/(2*d),height=Math.sqrt(Math.max(0,.40**2-along*along));
 const upper=axis.clone().multiplyScalar(along).addScaledVector(bend,height);
 arm.quaternion.setFromUnitVectors(down,upper.clone().normalize());
 const lower=axis.multiplyScalar(d).sub(upper).applyQuaternion(arm.quaternion.clone().invert());
 elbow.quaternion.setFromUnitVectors(down,lower.normalize());actor.updateWorldMatrix(true,true);
}
function resting(actor,side){const sign=side==='Left'?-1:1;return world(actor,[sign*.49,.43,.12])}
function handTo(actor,side,target,amount=1){reach(actor,side,resting(actor,side).lerp(target,amount))}
function face(actor,pitch,yaw,roll=0){actor.getObjectByName(actor.name+'Head').rotation.set(pitch,yaw,roll)}
function neutral(actor){actor.rotation.z=0;for(const side of ['Left','Right']){const f=actor.getObjectByName(actor.name+side+'Foot');f.position.y=0;f.position.z=0;f.rotation.x=0} }

export function characterSet(scene,kind){
 backdrop(scene,kind==='supply'?4:3);
 const scholar=doll(scene,'scholar',[-1.10,0,-.22],'gong',1.05,.18);
 const colleague=doll(scene,'colleague',[1.10,0,-.22],kind==='document'?'liu':'sun',1.02,-.18);
 scholar.getObjectByName('scholarFan').visible=false;
 let animate,targets,contacts=[];
 if(kind==='alliance'){
  const furniture=table(scene,.80);furniture.position.z=.85;const desk=group(furniture,'tableContents',[0,-.30,0]);
  box(desk,'map',[2.75,.035,1.29],[0,1.21,0],M.paper,.02);
  for(let j=0;j<5;j++)tube(desk,'mapContour'+j,[[-1.2+j*.06,1.233,-.4],[-.8+j*.15,1.233,-.22],[-.2+j*.13,1.233,-.42],[.6+j*.13,1.233,-.24]],.008,M.woodLight);
  const left=seal(desk,'leftSeal',[-.86,1.24,-.55],M.tea),right=seal(desk,'rightSeal',[.86,1.24,-.55],M.red);
  targets=[left,right];
  animate=t=>{
   neutral(scholar);neutral(colleague);const approach=beat(t,.5,1.5),move=beat(t,1.6,4.7),release=beat(t,5.1,6.2),nod=Math.sin(Math.PI*beat(t,5.5,7.3));
   scholar.position.set(-1.10+.17*move,0,-.22);colleague.position.set(1.10-.17*move,0,-.22);
   scholar.rotation.set(.06*approach*(1-release),.18+.06*move,0);colleague.rotation.set(.06*approach*(1-release),-.18-.06*move,0);
   left.position.x=-.86+.37*move;right.position.x=.86-.37*move;
   face(scholar,.16*approach*(1-release),.05+.15*release);face(colleague,.14*approach*(1-release)+.13*nod,-.05-.15*release);
   scene.updateMatrixWorld(true);
   handTo(scholar,'Right',world(left,[0,.24,0]),approach*(1-release));handTo(scholar,'Left',resting(scholar,'Left'));
   handTo(colleague,'Left',world(right,[0,.24,0]),approach*(1-release));handTo(colleague,'Right',resting(colleague,'Right'));
   contacts=approach===1&&release===0?[[scholar,'Right',left,[0,.24,0]],[colleague,'Left',right,[0,.24,0]]]:[];
  };
 }else if(kind==='document'){
  const furniture=table(scene,.80);furniture.position.z=.85;const desk=group(furniture,'tableContents',[0,-.30,0]);
  const pages=group(desk,'document',[0,1.24,-.2]);
  for(let j=0;j<18;j++){box(pages,'slat'+j,[.10,.045,.86],[-.91+j*.107,0,0],M.paper,.012);for(const z of [-.31,.31])tube(pages,'binding'+j+z,[[-.95+j*.107,.026,z],[-.865+j*.107,.026,z]],.007,M.woodDark);for(let k=0;k<4;k++)box(pages,'ink'+j+k,[.03,.004,.047],[-.91+j*.107,.026,-.15+k*.097],M.ink,.001)}
  const stamp=seal(desk,'stamp',[.98,1.24,-.50],M.red);
  const imprint=group(pages,'stampImprint',[.54,.028,-.23]);
  // The ink belongs to the document and appears only after physical stamp contact.
  for(const x of [-.09,.09])box(imprint,'inkEdge'+x,[.012,.002,.19],[x,0,0],M.red,.001);
  for(const z of [-.09,.09])box(imprint,'inkEdge'+z,[.19,.002,.012],[0,0,z],M.red,.001);
  for(const x of [-.035,.035])box(imprint,'inkGlyph'+x,[.015,.002,.12],[x,0,0],M.red,.001);
  targets=[pages,stamp];
  animate=t=>{
   neutral(scholar);neutral(colleague);
   const grasp=beat(t,.5,1.4),lift=beat(t,1.5,2.4),travel=beat(t,2.3,3.4),press=beat(t,3.6,4.2),raise=beat(t,4.5,5.1),back=beat(t,5.2,6.2),down=beat(t,6.1,6.7),release=beat(t,6.8,7.5);
   scholar.position.set(-1.1,0,-.22);colleague.position.set(1.1-.12*travel*(1-back),0,-.22+.14*lift*(1-down));
   scholar.rotation.set(.09*grasp*(1-release),.18,0);colleague.rotation.set(.07*grasp*(1-release),-.18,0);
   stamp.position.set(.98-.44*travel*(1-back),1.24+.16*lift-.132*press+.132*raise-.16*down,-.50+.07*travel*(1-back));
   imprint.visible=t>=4.2;face(scholar,.16*grasp*(1-release),.1);face(colleague,.14*grasp*(1-release),-.08);
   scene.updateMatrixWorld(true);
   handTo(colleague,'Left',world(stamp,[0,.24,0]),grasp*(1-release));handTo(colleague,'Right',resting(colleague,'Right'));
   handTo(scholar,'Right',world(pages,[-.52,.08,-.24]),grasp*(1-release));handTo(scholar,'Left',resting(scholar,'Left'));
   contacts=grasp===1&&release===0?[[colleague,'Left',stamp,[0,.24,0]]]:[];
  };
 }else if(kind==='supply'){
  const wagon=cart(scene),left=wagon.getObjectByName('leftWheel'),right=wagon.getObjectByName('rightWheel');
  // Short shafts put the puller inside the diorama, with a handle for each hand.
  for(const x of [-.6,.6]){const shaft=wagon.getObjectByName('shaft'+x);shaft.scale.z=1.35/1.9;shaft.position.z=.98}
  const handles=[group(wagon,'leftGrip',[-.6,.61,1.65]),group(wagon,'rightGrip',[.6,.61,1.65])];
  scholar.position.set(-1.50,0,.20);scholar.rotation.y=.55;
  targets=[wagon.getObjectByName('load'),left];
  animate=t=>{
   neutral(scholar);neutral(colleague);const grasp=beat(t,.6,1.5),travel=beat(t,2,7.2),distance=.85*travel,phase=distance/.425*Math.PI*2;
   wagon.position.set(.35,0,-.55+distance);left.rotation.set(0,Math.PI/2,-distance/.446);right.rotation.copy(left.rotation);
   const stride=Math.sin(phase),bob=.018*(1-Math.cos(phase*2));
   colleague.position.set(.35,bob,1.40+distance);colleague.rotation.set(.10*grasp,0,-.025*stride);
   for(const [i,side] of ['Left','Right'].entries()){
    const foot=colleague.getObjectByName('colleague'+side+'Foot'),swing=Math.sin(phase+i*Math.PI);
    foot.position.z=.12*swing;foot.position.y=.07*Math.max(0,swing);foot.rotation.x=.13*swing;
   }
   face(colleague,.02,.08*beat(t,6,7.5));face(scholar,.06,.20*travel);
   scene.updateMatrixWorld(true);
   handles.forEach((h,i)=>handTo(colleague,i?'Right':'Left',world(h),grasp));
   const wave=beat(t,1,2)*(1-beat(t,4.4,5.4));handTo(scholar,'Right',world(scholar,[.57,1.25,.32]),wave);handTo(scholar,'Left',resting(scholar,'Left'));
   contacts=grasp===1?handles.map((h,i)=>[colleague,i?'Right':'Left',h,[0,0,0]]):[];
  };
 }else throw Error('Unknown character action: '+kind);
 return {animate,targets,contactDiagnostics:()=>contacts.map(([actor,side,target,point])=>({actor:actor.name,hand:side,target:target.name,error:world(actor.getObjectByName(actor.name+side+'Hand')).distanceTo(world(target,point))}))};
}
