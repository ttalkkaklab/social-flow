/* Authored rounded mesh components for repeatable illustration scenes.
 * Runtime assets are built from a scene specification, never episode-specific HTML.
 */
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const mat=(name,color,roughness=.67,metalness=0)=>{const m=new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.12,clearcoatRoughness:.65});m.name=name;return m};
const M={skin:mat('warm porcelain skin','#edbc92',.63),blush:mat('soft rose cheek','#d99882'),hair:mat('ink hair','#303c41'),eye:mat('obsidian eyes','#1d2a30',.19),white:mat('ivory silk','#f5e8c8'),robe:mat('celadon silk','#689992'),trim:mat('deep green silk','#2f6260'),gold:mat('brushed brass','#ba9354',.48,.48),wood:mat('honey wood','#aa7350'),woodLight:mat('end grain wood','#d0a278'),woodDark:mat('dark wood joints','#77503c'),stone:mat('warm plaster','#e5cdb0'),floor:mat('stone floor','#d4c5af'),roof:mat('glazed roof','#536e6c',.5),leaf:mat('muted green','#789782'),cloth:mat('linen sacks','#d9b682',.95),ink:mat('ink details','#5a5c4f'),red:mat('terracotta silk','#b76d55'),blue:mat('slate blue silk','#698794'),paper:mat('bamboo paper','#f2ddaa'),tea:mat('jade ceramic','#92b7a4',.3),water:mat('blue green water','#94b8b0',.35)};
const group=(p,name,pos=[0,0,0])=>{const g=new T.Group();g.name=name;g.position.fromArray(pos);p.add(g);return g};
const mesh=(p,name,g,m,pos=[0,0,0],scale)=>{const o=new T.Mesh(g,m);o.name=name;o.position.fromArray(pos);if(scale)o.scale.fromArray(scale);p.add(o);return o};
const box=(p,n,size,pos,m=M.wood,b=.045)=>mesh(p,n,new RoundedBoxGeometry(...size,3,Math.min(b,...size.map(v=>v*.4))),m,pos);
const sphere=(p,n,pos,scale,m)=>mesh(p,n,new T.SphereGeometry(1,32,24),m,pos,scale);
const cyl=(p,n,r1,r2,h,pos,m)=>mesh(p,n,new T.CylinderGeometry(r1,r2,h,40),m,pos);
const tube=(p,n,pts,r,m)=>mesh(p,n,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(a=>new T.Vector3(...a))),Math.max(12,pts.length*5),r,8,false),m);
function lathe(p,n,profile,pos,m,scale=[1,1,1]){return mesh(p,n,new T.LatheGeometry(profile.map(a=>new T.Vector2(...a)),48),m,pos,scale)}
function feather(p,n,pos,rot){const g=group(p,n,pos);g.rotation.z=rot;sphere(g,n+'blade',[0,.23,0],[.085,.30,.019],M.white);tube(g,n+'quill',[[0,-.09,.025],[0,.21,.025],[0,.48,.02]],.008,M.gold);for(let j=0;j<5;j++)for(const sign of [-1,1])tube(g,n+'vein'+sign+j,[[0,.04+j*.075,.022],[sign*.06,.10+j*.065,.022]],.003,M.paper);return g}
function doll(p,id,pos,style='gong',scale=1,yaw=0){
 const root=group(p,id,pos);root.scale.setScalar(scale);root.rotation.y=yaw;
 const robe=style==='gong'?M.robe:style==='liu'?M.blue:M.red;
 for(const x of [-.19,.19]){const foot=group(root,id+(x<0?'LeftFoot':'RightFoot'),[x,0,0]);sphere(foot,id+'shoe'+x,[0,.09,.12],[.19,.095,.28],M.hair)}
 lathe(root,id+'robe',[[0,.13],[.35,.13],[.45,.18],[.48,.32],[.42,.71],[.31,1.13],[.25,1.20],[0,1.22]],[0,0,0],robe,[1,1,.78]);
 // Raised garment folds and crossed ivory lapels follow the robe's curved surface.
 for(const sign of [-1,1])tube(root,id+'lapel'+sign,[[sign*.18,1.15,.20],[sign*.11,1.04,.255],[-sign*.11,.84,.305]],.047,M.white);
 for(let i=-2;i<=2;i++)tube(root,id+'pleat'+i,[[i*.12,.19,.31],[i*.105,.40,.32],[i*.07,.68,.29]],.008,style==='gong'?M.trim:M.woodDark);
 const belt=cyl(root,id+'belt',.366,.373,.095,[0,.73,0],M.trim);belt.scale.z=.78;
 box(root,id+'buckle',[.14,.115,.06],[0,.74,.30],M.gold,.018);
 for(const x of [-.29,.29])tube(root,id+'robeEdge'+x,[[x,.19,.29],[x*.83,.4,.32],[x*.65,.67,.31]],.016,M.white);
 const head=group(root,id+'Head',[0,1.54,0]);
 sphere(head,id+'hairBack',[0,.06,-.035],[.50,.48,.41],M.hair);
 sphere(head,id+'face',[0,-.015,.075],[.465,.42,.38],M.skin);
 for(const x of [-.45,.45]){sphere(head,id+'ear'+x,[x,-.025,.055],[.075,.115,.08],M.skin);sphere(head,id+'earInset'+x,[x*1.017,-.024,.12],[.025,.057,.018],M.blush)}
 for(const x of [-.18,.18]){
  sphere(head,id+'eye'+x,[x,.015,.424],[.045,.064,.026],M.eye);
  sphere(head,id+'catchlight'+x,[x-.012,.040,.446],[.013,.017,.006],M.white);
  tube(head,id+'brow'+x,[[x-.067,.14,.398],[x,.158,.42],[x+.055,.135,.405]],.018,M.hair);
  sphere(head,id+'cheek'+x,[x*1.47,-.104,.355],[.07,.034,.012],M.blush);
 }
 sphere(head,id+'nose',[0,-.074,.441],[.052,.052,.05],M.skin);
 tube(head,id+'smile',[[-.052,-.181,.406],[0,-.195,.420],[.052,-.18,.406]],.010,M.hair);
 if(style==='gong'||style==='liu'){
  for(const sign of [-1,1])sphere(head,id+'moustache'+sign,[sign*.083,-.135,.43],[.10,.030,.030],M.hair).rotation.z=sign*.14;
  const beard=lathe(head,id+'beard',[[0,0],[.035,.04],[.10,.16],[.14,.25],[.12,.29],[0,.30]],[0,-.50,.31],M.hair,[1,1,.40]);
  for(let i=-1;i<=1;i++)tube(head,id+'beardStrand'+i,[[i*.06,-.24,.37],[i*.05,-.36,.363],[i*.015,-.46,.329]],.006,M.ink);
 }
 if(style==='gong'){
  box(head,id+'hatBase',[.84,.17,.57],[0,.383,-.01],M.trim,.065);
  lathe(head,id+'hat',[[0,0],[.31,0],[.32,.14],[.26,.36],[.21,.43],[0,.45]],[0,.43,-.03],M.trim,[1,1,.83]);
  tube(head,id+'hatSeam',[[0,.45,.24],[0,.65,.19],[0,.84,.13]],.012,M.gold);
  for(const x of [-.15,.15])tube(head,id+'hatRibbon'+x,[[x,.42,-.27],[x,.20,-.42],[x+.04,-.12,-.37]],.035,M.trim);
 }else{
  sphere(head,id+'cap',[0,.32,-.04],[.445,.18,.34],M.hair);
  box(head,id+'capBand',[.77,.09,.11],[0,.31,.29],M.gold,.025);
  sphere(head,id+'topknot',[0,.48,-.05],[.17,.18,.15],M.hair);
 }
 for(const sign of [-1,1]){
  const side=sign<0?'Left':'Right',arm=group(root,id+side+'Arm',[sign*.28,1.04,.02]);
  arm.rotation.z=sign*.30;
  lathe(arm,id+'sleeve'+sign,[[0,-.40],[.16,-.40],[.19,-.27],[.18,-.10],[.15,.08],[0,.12]],[0,0,0],robe,[1,1,.94]);
  const elbow=group(arm,id+side+'Elbow',[0,-.40,0]);
  lathe(elbow,id+'foreSleeve'+sign,[[0,-.27],[.19,-.27],[.20,-.21],[.16,.02],[0,.05]],[0,0,0],robe,[1,1,.94]);
  const cuff=cyl(elbow,id+'cuff'+sign,.192,.188,.05,[0,-.26,0],M.white);cuff.scale.z=.94;
  const hand=group(elbow,id+side+'Hand',[0,-.36,0]);
  sphere(hand,id+'hand'+sign,[0,0,0],[.108,.125,.095],M.skin);
  sphere(hand,id+'thumb'+sign,[sign*.09,.01,.058],[.043,.065,.045],M.skin);
  if(style==='gong'&&sign===1){const fan=group(hand,id+'Fan',[0,.07,.13]);fan.rotation.set(.10,0,-.75);for(let k=-3;k<=3;k++)feather(fan,id+'feather'+k,[0,.015,0],k*.15);tube(fan,id+'handle',[[0,-.20,0],[0,.22,0]],.022,M.gold)}
 }
 return root;
}
function plant(p,id,pos,size=1){const g=group(p,id,pos);g.scale.setScalar(size);lathe(g,id+'pot',[[0,0],[.22,0],[.27,.08],[.30,.39],[.33,.42],[.33,.47],[.29,.47],[.27,.10],[0,.1]],[0,0,0],M.tea);for(let i=0;i<5;i++){const a=i*2.4,x=Math.sin(a)*.25,z=Math.cos(a)*.2; tube(g,id+'stem'+i,[[0,.35,0],[x*.5,.9,z],[x,1.35+i*.06,z]],.012,M.leaf);for(let j=0;j<3;j++){const leaf=sphere(g,id+'leaf'+i+j,[x+Math.sin(a+j)*.14,.7+j*.25,z],[.23,.06,.10],M.leaf);leaf.rotation.z=(i%2?1:-1)*.5}}}
function backdrop(scene,num){
 const g=group(scene,'environment');
 box(g,'plinth',[7.1,.20,5.4],[0,-.13,0],M.stone,.10);
 box(g,'plinthEdge',[7.16,.08,5.46],[0,-.26,0],M.woodLight,.035);
 for(let i=0;i<7;i++)for(let j=0;j<5;j++)box(g,'floorTile'+i+j,[.99,.04,1.05],[-3+i,.002,-2.08+j*1.045],(i+j)%3?M.floor:M.stone,.025);
 box(g,'rearWall',[7.04,3.3,.15],[0,1.62,-2.46],M.stone,.055);
 box(g,'wallFoot',[7.08,.25,.28],[0,.16,-2.33],M.woodLight,.035);
 for(const x of [-3.17,0,3.17]){
  cyl(g,'pillar'+x,.115,.13,3.45,[x,1.7,-2.16],M.wood);
  cyl(g,'pillarBase'+x,.22,.23,.14,[x,.10,-2.16],M.woodDark);
  box(g,'bracket'+x,[.51,.17,.48],[x,3.18,-2.16],M.woodDark,.06);
 }
 // Lattice windows supply architectural context without competing with foreground actors.
 for(const x of [-1.6,1.6]){
  box(g,'windowGlass'+x,[2.25,1.95,.09],[x,1.97,-2.35],M.water,.09);
  for(const dx of [-1.16,1.16])box(g,'windowPost'+x+dx,[.095,2.04,.16],[x+dx,1.97,-2.23],M.wood,.022);
  for(const y of [1,2.95])box(g,'windowSill'+x+y,[2.42,.10,.23],[x,y,-2.18],M.wood,.025);
  for(let k=-3;k<=3;k++)box(g,'latticeV'+x+k,[.035,1.88,.065],[x+k*.28,1.99,-2.22],M.woodLight,.01);
  for(let k=0;k<4;k++)box(g,'latticeH'+x+k,[2.25,.035,.065],[x,1.20+k*.47,-2.20],M.woodLight,.01);
 }
 box(g,'eaves',[7.5,.16,1.04],[0,3.38,-2.13],M.woodDark,.07);
 // Individually curved clay tiles and brass ridge tips.
 for(let i=0;i<29;i++){const x=-3.53+i*.252;tube(g,'roofTile'+i,[[x,3.45,-1.65],[x,3.53,-1.95],[x,3.75,-2.57]],.126,M.roof)}
 for(const x of [-3.6,3.6])tube(g,'roofCorner'+x,[[x*.9,3.45,-1.65],[x,3.53,-1.65],[x*1.025,3.66,-1.65]],.07,M.gold);
 for(const x of [-2.8,2.8])plant(g,'plant'+x,[x,0,-1.2],.75);
 if(num===4){
  const store=group(g,'store',[-2.0,0,-1.5]);for(let j=0;j<3;j++)for(let i=0;i<2;i++)sack(store,'stored'+i+j,[i*.51,j*.37,.1],.48);
 }else{
  const shelf=group(g,'shelf',[2.55,0,-1.72]);for(const y of [.3,.9,1.5])box(shelf,'shelfBoard'+y,[.92,.09,.46],[0,y,0],M.wood);
  for(const x of [-.40,.40])box(shelf,'shelfLeg'+x,[.065,1.8,.39],[x,.9,0],M.woodDark);
  for(let j=0;j<4;j++)cyl(shelf,'scroll'+j,.07,.07,.40,[-.27+j*.17,1.14,0],M.paper);
 }
 return g;
}
function table(p,height=1.10){const g=group(p,'table',[0,0,.55]);box(g,'tableTop',[3.25,.18,1.77],[0,height,0],M.woodLight,.08);box(g,'tableApron',[2.9,.28,1.42],[0,height-.2,0],M.wood,.03);for(const x of [-1.3,1.3])for(const z of [-.61,.61]){box(g,'tableLeg'+x+z,[.17,height-.20,.17],[x,(height-.20)/2+.01,z],M.woodDark,.025);box(g,'tableFoot'+x+z,[.23,.12,.26],[x,.075,z],M.woodDark,.02)}return g}
function seal(p,id,pos,color){const g=group(p,id,pos);box(g,id+'Base',[.34,.12,.34],[0,.06,0],color,.035);sphere(g,id+'turtleShell',[0,.18,0],[.14,.085,.125],color);sphere(g,id+'turtleHead',[0,.17,.14],[.054,.047,.065],color);for(const x of [-.12,.12])for(const z of [-.07,.07])sphere(g,id+'foot'+x+z,[x,.13,z],[.05,.024,.035],color);return g}
function sack(p,id,pos,size=1){const g=group(p,id,pos);g.scale.setScalar(size);lathe(g,id+'body',[[0,0],[.27,.015],[.37,.11],[.40,.32],[.36,.53],[.22,.67],[.12,.70],[.17,.80],[.13,.85],[0,.83]],[0,0,0],M.cloth,[1,1,.79]);const pts=[];for(let i=0;i<=32;i++){const a=i*Math.PI/16;pts.push([Math.cos(a)*.13,.71,Math.sin(a)*.106])}tube(g,id+'tie',pts,.018,M.woodDark);for(let i=-2;i<=2;i++)tube(g,id+'fold'+i,[[i*.046,.68,.075],[i*.068,.53,.18],[i*.079,.38,.28]],.007,M.woodLight);return g}
function cart(p){const g=group(p,'cart',[.35,0,.8]);
 for(const x of [-.42,-.14,.14,.42])box(g,'bedPlank'+x,[.24,.09,1.35],[x,.63,0],M.woodLight,.025);
 box(g,'axle',[1.62,.12,.13],[0,.46,.18],M.woodDark,.02);
 for(const x of [-.6,.6]){box(g,'sideRail'+x,[.09,.16,1.45],[x,.94,0],M.wood,.025);for(const z of [-.59,0,.59])box(g,'stake'+x+z,[.075,.45,.075],[x,.8,z],M.woodDark,.02);box(g,'shaft'+x,[.075,.075,1.9],[x,.61,1.23],M.wood,.023)}
 for(const sign of [-1,1]){const w=group(g,sign<0?'leftWheel':'rightWheel',[sign*.77,.46,.18]);w.rotation.y=Math.PI/2;
  mesh(w,'rim'+sign,new T.TorusGeometry(.43,.055,12,64),M.woodDark);
  mesh(w,'tire'+sign,new T.TorusGeometry(.446,.022,10,64),M.gold);
  const hub=cyl(w,'hub'+sign,.11,.11,.23,[0,0,0],M.wood);hub.rotation.x=Math.PI/2;
  for(let k=0;k<10;k++){const a=k*Math.PI/5;tube(w,'spoke'+sign+k,[[Math.cos(a)*.08,Math.sin(a)*.08,0],[Math.cos(a)*.39,Math.sin(a)*.39,0]],.024,M.woodLight);sphere(w,'rivet'+sign+k,[Math.cos(a)*.43,Math.sin(a)*.43,.035],[.014,.014,.014],M.gold)}
 }
 const load=group(g,'load',[0,.68,0]);for(let i=0;i<3;i++)sack(load,'sack'+i,[i%2*.53-.265,0,Math.floor(i/2)*.59-.34],.64);sack(load,'topSack',[0,.36,-.10],.64);
 return g;
}
// Merge unnamed stationary surfaces within each articulated branch to keep playback light.
function compact(node,animated){for(const c of [...node.children])if(!c.isMesh)compact(c,animated);const buckets=new Map();for(const c of [...node.children])if(c.isMesh&&!animated.has(c.name)){c.updateMatrix();const geo=c.geometry.clone().applyMatrix4(c.matrix),key=c.material.uuid;const arr=buckets.get(key)||{mat:c.material,list:[]};arr.list.push(geo);buckets.set(key,arr);node.remove(c)}for(const {mat,list}of buckets.values()){const merged=mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g),false);if(merged)mesh(node,'surface-'+mat.name,merged,mat)}}

export {M,group,mesh,box,sphere,cyl,tube,lathe,doll,backdrop,table,seal,sack,cart,compact};
