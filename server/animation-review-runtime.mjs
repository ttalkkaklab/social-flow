/* Preview renderer: the host supplies scenes; this module owns geometry and motion. */
import * as T from 'three';
import {characterSet} from './character-actions.mjs';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {M,group,mesh,box,sphere,cyl,tube,doll,backdrop,table,seal,sack,cart,compact} from './illustration-components.mjs';
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
function workshop(scene){
 const env=group(scene,'workshop');box(env,'bench',[7.0,.23,4.7],[0,-.20,0],M.woodLight,.10);
 box(env,'backboard',[7,3.2,.16],[0,1.4,-2.2],M.stone,.09);
 for(let x=-3;x<=3;x+=.3)for(let y=.3;y<2.9;y+=.3)sphere(env,'peg',[x,y,-2.106],[.022,.022,.005],M.woodDark);
 box(env,'shelf',[6.5,.10,.65],[0,2.82,-1.89],M.wood,.04);
 for(let i=0;i<3;i++){cyl(env,'jar'+i,.18,.17,.43,[1.8+i*.43,3.05,-1.9],M.tea);cyl(env,'jarLid'+i,.19,.19,.06,[1.8+i*.43,3.29,-1.9],M.woodDark)}
 for(let i=0;i<3;i++){const g=group(env,'tool'+i,[-2.7+i*.42,1.6,-2.02]);box(g,'toolHandle',[.08,.64,.09],[0,0,0],M.wood,.02);mesh(g,'toolEye',new T.TorusGeometry(.09,.03,8,24),M.gold,[0,.38,0])}
 return env;
}
function gear(parent,name,teeth,r,pos,material){
 const root=r-2.5*r/teeth,tip=r+2*r/teeth,rb=r*Math.cos(Math.PI/9),half=Math.PI/(2*teeth),inv=a=>Math.tan(a)-a,ip=inv(Math.acos(rb/r)),points=[];
 for(let i=0;i<teeth;i++){const c=i*2*Math.PI/teeth;points.push([root,c-Math.PI/teeth]);for(const sign of [-1,1]){const radii=Array.from({length:7},(_,j)=>rb+(tip-rb)*j/6);if(sign>0)radii.reverse();for(const rr of radii){const h=half+ip-inv(Math.acos(rb/rr));points.push([rr,c+sign*h])}}points.push([root,c+Math.PI/teeth]);}
 const sh=new T.Shape();points.forEach(([rr,a],i)=>sh[i?'lineTo':'moveTo'](rr*Math.cos(a),rr*Math.sin(a)));sh.closePath();const hole=new T.Path();hole.absarc(0,0,.135,0,Math.PI*2,true);sh.holes.push(hole);
 if(teeth>20)for(let i=0;i<6;i++){const h=new T.Path(),a=i*Math.PI/3;h.absarc(Math.cos(a)*r*.51,Math.sin(a)*r*.51,r*.16,0,Math.PI*2,true);sh.holes.push(h)}
 const g=group(parent,name,pos);mesh(g,name+'teeth',new T.ExtrudeGeometry(sh,{depth:.20,bevelEnabled:true,bevelSize:.013,bevelThickness:.015,bevelSegments:2,curveSegments:16}),material,[0,0,-.10]);
 const hub=mesh(g,name+'hub',new T.TorusGeometry(.18,.05,12,40),M.gold,[0,0,.12]);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;sphere(g,name+'bolt'+i,[Math.cos(a)*.25,Math.sin(a)*.25,.123],[.025,.025,.013],M.hair)}return g;
}
export function buildSet(kind){
 const scene=new T.Scene();let animate,targets,contactDiagnostics=()=>[];
 if(['alliance','document','supply'].includes(kind)){
  const set=characterSet(scene,kind);animate=set.animate;targets=set.targets;contactDiagnostics=set.contactDiagnostics;
 }else{
  workshop(scene);
  if(kind==='gears'){
   const set=group(scene,'gearbox',[0,0,.25]);box(set,'mount',[4.8,.20,1.85],[0,.12,0],M.roof,.08);
   const small=gear(set,'driver',16,.64,[-1.28,1.62,.45],M.gold),large=gear(set,'driven',32,1.28,[.64,1.62,.45],M.tea);
   for(const x of [-1.28,.64]){box(set,'bearingStand',[.37,1.58,.32],[x,.89,-.07],M.roof,.09);const axle=cyl(set,'axle',.12,.12,.95,[x,1.62,.25],M.hair);axle.rotation.x=Math.PI/2;mesh(set,'bearing',new T.TorusGeometry(.21,.07,12,32),M.gold,[x,1.62,.05])}
   targets=[small,large];animate=t=>{const a=4*Math.PI*smooth((t-.6)/6.8);small.rotation.z=a;large.rotation.z=-a/2+Math.PI/32;};
  }else if(kind==='pulley'){
   const rig=group(scene,'rig');for(const x of [-2.1,2.1]){box(rig,'foot'+x,[.72,.18,1.5],[x,.08,0],M.roof,.07);box(rig,'post'+x,[.15,3.7,.15],[x,1.94,-.35],M.woodDark,.03)}box(rig,'crossbar',[4.4,.2,.23],[0,3.72,-.35],M.wood,.05);
   const wheel=group(rig,'pulley',[0,2.85,0]);mesh(wheel,'groove',new T.TorusGeometry(.67,.055,12,64),M.woodDark);for(const z of [-.07,.07])mesh(wheel,'flange'+z,new T.TorusGeometry(.69,.045,12,64),M.gold,[0,0,z]);for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(wheel,'spoke'+i,[[0,0,0],[Math.cos(a)*.64,Math.sin(a)*.64,0]],.04,M.tea)}sphere(wheel,'axle',[0,0,.08],[.10,.10,.08],M.hair);tube(rig,'hanger',[[0,3.7,-.35],[0,3.55,-.1],[0,2.85,-.1]],.04,M.hair);
   const arc=[];for(let i=0;i<=32;i++){const a=Math.PI-i*Math.PI/32;arc.push([.73*Math.cos(a),2.85+.73*Math.sin(a),0])}tube(rig,'ropeArc',arc,.018,M.white);
   const load=group(rig,'load',[-.73,.2,0]);for(const z of [-.3,.3])for(let j=0;j<4;j++)box(load,'crate'+z+j,[.84,.11,.07],[0,.10+j*.15,z],M.woodLight,.014);for(const x of [-.41,.41]){box(load,'crateSide'+x,[.075,.64,.65],[x,.34,0],M.wood,.02);tube(load,'sling'+x,[[x,.12,.32],[x,.64,.25],[0,.89,0]],.016,M.white)}box(load,'crateBase',[.86,.09,.66],[0,.04,0],M.wood,.02);
   const left=cyl(rig,'leftRope',.019,.019,1,[0,0,0],M.white),right=cyl(rig,'rightRope',.019,.019,1,[0,0,0],M.white),handle=mesh(rig,'pullHandle',new T.TorusGeometry(.13,.024,12,32),M.gold,[.73,2.15,0]);
   targets=[load,wheel];animate=t=>{const u=smooth((t-.7)/6.5),y=.2+u*.85,end=2.15-u*.85;load.position.y=y;left.scale.y=2.85-(y+.89);left.position.set(-.73,(2.85+y+.89)/2,0);right.scale.y=2.85-end;right.position.set(.73,(2.85+end)/2,0);handle.position.y=end-.13;wheel.rotation.z=-u*.85/.73;};
  }else if(kind==='hinge'){
   const body=group(scene,'case',[0,.27,.25]);box(body,'caseBottom',[3.6,.23,2.1],[0,0,0],M.roof,.13);for(const x of [-1.7,1.7])box(body,'sideWall'+x,[.17,.60,2],[x,.29,0],M.roof,.065);for(const z of [-.95,.95])box(body,'endWall'+z,[3.3,.60,.16],[0,.29,z],M.roof,.05);
   box(body,'foam',[3.23,.18,1.72],[0,.22,0],M.hair,.04);for(let i=0;i<5;i++){const bit=cyl(body,'driverBit'+i,.055,.055,.82,[-1.08+i*.44,.39,0],M.gold);bit.rotation.x=Math.PI/2;box(body,'bitHead'+i,[.13,.13,.23],[-1.08+i*.44,.39,.50],M.woodLight,.02)}
   const lid=group(body,'lid',[0,.61,-.95]);box(lid,'lidShell',[3.6,.19,2.1],[0,0,.95],M.tea,.12);box(lid,'lidInset',[3.22,.04,1.73],[0,-.11,.95],M.roof,.065);
   for(const x of [-1.13,1.13]){const hinge=cyl(body,'hingeBarrel'+x,.10,.10,.52,[x,.60,-.97],M.gold);hinge.rotation.z=Math.PI/2;for(const dx of [-.16,.16])mesh(body,'hingeRim'+x+dx,new T.TorusGeometry(.101,.012,8,24),M.woodDark,[x+dx,.60,-.97]).rotation.y=Math.PI/2;box(body,'latch'+x,[.30,.30,.12],[x,.36,1.08],M.gold,.03)}
   tube(body,'caseHandle',[[-.48,.3,1.08],[-.48,.3,1.45],[.48,.3,1.45],[.48,.3,1.08]],.065,M.hair);
   targets=[lid,body.getObjectByName('hingeBarrel-1.13')];animate=t=>{lid.rotation.x=-Math.PI*.58*smooth((t-.7)/5.9)};
  }else throw new Error('Unknown illustration template: '+kind);
 }
 const dynamic=new Set(['leftRope','rightRope','pullHandle']);scene.traverse(o=>{if(!o.isMesh)dynamic.add(o.name)});targets.forEach(o=>dynamic.add(o.name));compact(scene,dynamic);scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 return {scene,animate,targets,contactDiagnostics};
}
export async function mount(el,spec){
 const {scene,animate,targets,contactDiagnostics}=buildSet(spec.template),w=el.clientWidth,h=el.clientHeight;
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(w,h);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;el.appendChild(renderer.domElement);
 const env=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),map=pmrem.fromScene(env,.04);scene.environment=map.texture;scene.environmentIntensity=.65;env.dispose();pmrem.dispose();
 const key=new T.DirectionalLight('#fff1de',3);key.position.set(-3,7,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:30});key.shadow.normalBias=.035;key.shadow.bias=-.0002;key.shadow.radius=4;scene.add(key);
 const fill=new T.DirectionalLight('#c7e2ef',1);fill.position.set(4,4,4);scene.add(fill);const rim=new T.DirectionalLight('#fff3da',1.1);rim.position.set(0,5,-4);scene.add(rim);
 const camera=new T.PerspectiveCamera(37,w/h,.1,100);camera.position.set(spec.template==='gears'?3.3:5.8,5.1,11);camera.lookAt(0,1.6,0);
 function draw(t){animate(8*Math.max(0,Math.min(spec.duration,t))/spec.duration);scene.updateMatrixWorld(true);renderer.render(scene,camera);return targets.map(o=>{const p=(spec.template==='hinge'&&o.name==='lid'?o.localToWorld(new T.Vector3(0,0,.95)):o.getWorldPosition(new T.Vector3())).project(camera);return{x:(p.x+1)*w/2,y:(1-p.y)*h/2,visible:p.z>=-1&&p.z<=1}})}
 return {draw,diagnostics:()=>({technique:'procedural-mesh',template:spec.template,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,actors:spec.lane==='character_explanation'?2:0,contacts:contactDiagnostics()}),dispose:()=>{scene.traverse(o=>{if(o.isMesh)o.geometry.dispose()});map.dispose();renderer.dispose()}};
}
