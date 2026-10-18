import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createActors,updateActors} from './location-actors.mjs';
const entries=window.LOCATION_REVIEW||[];
const ko=(document.documentElement.lang||navigator.language).startsWith('ko');
const word=(a,b)=>ko?a:b;
function node(tag,text,parent,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;if(parent)parent.append(n);return n;}
function button(text,parent,fn){const b=node('button',text,parent);b.type='button';b.onclick=fn;return b;}
function url(p){const u=new URL(p,document.baseURI);if(!['file:','http:','https:'].includes(u.protocol))throw Error('Unsupported asset URL');return u.href;}
function mount(){
  if(!entries.length)return;
  const section=node('section',null,null,'location-review');section.id='locations';
  const app=document.getElementById('location-viewer-host')||document.getElementById('app')||document.body;
  const anchor=document.getElementById('shots');if(anchor&&!document.getElementById('location-viewer-host'))anchor.before(section);else app.prepend(section);
  node('h2',word('장소 · 촬영 공간','Locations · filming space'),section);
  node('p',word('둘러보기는 촬영 구도를 바꾸지 않습니다. 변경안을 내보낸 뒤 적용하고 참조를 다시 렌더하세요.','Exploring does not change the shot. Export and apply a camera proposal, then render new references.'),section);
  const select=node('select',null,section);select.setAttribute('aria-label',word('장소 샷 선택','Location shot'));
  entries.forEach((e,i)=>{const o=node('option',e.shotId+' · '+e.title+' · '+(e.name||''),select);o.value=i;});
  const host=node('div',null,section);let dispose=()=>{};
  function choose(){dispose();host.replaceChildren();dispose=view(entries[Number(select.value)],host);}
  select.onchange=choose;choose();if(location.hash==='#locations')section.scrollIntoView();
  document.addEventListener('click',ev=>{const link=ev.target.closest('[data-location-shot]');if(!link)return;const i=entries.findIndex(e=>e.shotId===link.dataset.locationShot);if(i>=0){select.value=i;choose();section.scrollIntoView();}});
  const nav=document.querySelector('.review-sidebar nav');if(nav){const a=node('a',word('장소','Locations'),nav);a.href='#locations';}
}
function view(e,host){
  if(e.error){node('p',e.error,host,'location-error');return ()=>{};}
  const status=node('p',`${e.name} · v${e.revision} · ${e.state.label} · `+(e.approved?word('참조 승인','References approved'):e.fresh?word('참조 검토 대기','Reference review pending'):word('참조 재생성 필요','References stale')),host);
  node('p',e.invariants.join(' · '),host);
  const layout=node('div',null,host,'location-layout');const stage=node('div',null,layout,'location-stage');
  const controls=node('div',null,layout,'location-controls');
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch(err){node('p','WebGL: '+err.message,stage);return ()=>{};}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#e6e4df');renderer.outputColorSpace=THREE.SRGBColorSpace;
  stage.append(renderer.domElement);renderer.domElement.setAttribute('aria-label',word('3D 장소: 드래그로 회전, 휠로 확대','3D location: drag to orbit, wheel to zoom'));renderer.domElement.tabIndex=0;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x77716a,2*e.state.light));
  const light=new THREE.DirectionalLight(0xffffff,3*e.state.light);light.position.set(1,-3,6);scene.add(light);
  const cam=new THREE.PerspectiveCamera(50,1,0.01,1000);cam.up.set(0,0,1);
  const orbit=new OrbitControls(cam,renderer.domElement);orbit.enableDamping=false;
  const actorModel=createActors(e.blocking?.actors||[]);scene.add(actorModel.group);let actorTime=0,showGaze=true,scrubbing=false;
  function actorObjects(){return (e.baseObjects||e.objects).map(o=>{
    const a={...o,...e.states[scrubbing?e.stateId:selectedState].objects?.[o.id]};
    if(!scrubbing)return a;
    const b={...o,...e.states[e.endStateId||e.stateId].objects?.[o.id]};
    return {...(actorTime===1?b:a),position:a.position.map((v,i)=>v+(b.position[i]-v)*actorTime),rotation:(a.rotation||[0,0,0]).map((v,i)=>v+((b.rotation||[0,0,0])[i]-v)*actorTime)};
  });}
  function refreshActors(){updateActors(actorModel,e.startActors||[],e.endActors||[],actorTime,actorObjects(),showGaze);}
  const original=structuredClone(e.camera);let shotView=true,disposed=false,model=null,raf=0,hidden=false;let selectedState=e.stateId;
  refreshActors();
  const info=node('p','',controls);info.setAttribute('role','status');
  function setCamera(c){cam.position.fromArray(c.position);orbit.target.fromArray(c.target);cam.fov=THREE.MathUtils.radToDeg(2*Math.atan(36/(2*c.lensMm)))/(1);cam.aspect=c.width/c.height; // vertical FOV from horizontal sensor
    cam.fov=THREE.MathUtils.radToDeg(2*Math.atan(36/(2*c.lensMm)/cam.aspect));cam.updateProjectionMatrix();orbit.update();}
  function size(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);cam.aspect=shotView?original.width/original.height:w/h;cam.fov=THREE.MathUtils.radToDeg(2*Math.atan(36/(2*Number(lens.value))/cam.aspect));cam.updateProjectionMatrix();}
  function label(){info.textContent=shotView?word('촬영 카메라 · 저장된 구도','Shot camera · saved composition'):word('자유 관찰 · 촬영 구도 유지','Explore · shot unchanged');}
  button(word('촬영 카메라','Shot camera'),controls,()=>{shotView=true;lens.value=original.lensMm;setCamera(original);size();label();});
  button(word('평면도','Top view'),controls,()=>{shotView=false;cam.position.set(0,0,12);orbit.target.set(0,0,0);orbit.update();size();label();});
  button(word('벽 숨기기 / 복원','Hide / show walls'),controls,()=>{hidden=!hidden;if(model)model.traverse(o=>{const id=o.userData.locationId||o.name;const spec=actorObjects().find(v=>v.id===id);if(spec?.role==='wall')o.visible=!hidden&&spec.visible!==false;});});
  button(word('측면도','Side view'),controls,()=>{shotView=false;cam.position.set(12,0,2);orbit.target.set(0,0,1);orbit.update();size();label();});
  button(word('시선 표시 / 숨기기','Show / hide gaze'),controls,()=>{showGaze=!showGaze;refreshActors();});
  const phaseLabel=node('label',word('인물 배치','Actor blocking'),controls),phase=node('select',null,phaseLabel);phase.setAttribute('aria-label',word('인물 배치','Actor blocking'));
  node('option',word('시작','Start'),phase).value='start';node('option',word('끝','End'),phase).value='end';
  phase.onchange=()=>{actorTime=phase.value==='end'?1:0;selectedState=actorTime?e.endStateId:e.stateId;stateSelect.value=selectedState;time.value=actorTime*100;time.oninput();};
  node('p',(e.blocking?.actors||[]).map(a=>a.id+' · '+a.height+' m').join(' / ')||word('배치된 인물 없음','No actors placed'),controls);
  const lensLabel=node('label',word('렌즈 (mm)','Lens (mm)'),controls);const lens=node('input',null,lensLabel);lens.type='number';lens.min='10';lens.max='300';lens.value=original.lensMm;lens.onchange=()=>{lens.value=Math.max(10,Math.min(300,Number(lens.value)||35));shotView=false;size();label();};
  const stateLabel=node('label',word('장소 상태','Location state'),controls);const stateSelect=node('select',null,stateLabel);
  Object.entries(e.states).forEach(([id,s])=>{node('option',s.label,stateSelect).value=id;});stateSelect.value=e.stateId;
  stateSelect.onchange=()=>{scrubbing=false;selectedState=stateSelect.value;applyState(selectedState);refreshActors();objectSelect.onchange();info.textContent=word('상태 변경안 선택됨 · 적용 후 렌더 필요','State proposal selected · apply and render');};
  button(word('상태 변경안 내보내기','Export state proposal'),controls,()=>{const patch={version:1,type:'location-state',shotId:e.shotId,baseFingerprint:e.fingerprint,stateId:selectedState};const href=URL.createObjectURL(new Blob([JSON.stringify(patch,null,2)],{type:'application/json'}));const a=node('a');a.href=href;a.download=e.shotId+'-state.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);});
  const objLabel=node('label',word('물체','Object'),controls);const objectSelect=node('select',null,objLabel);node('option',word('물체 선택','Select object'),objectSelect).value='';
  e.objects.forEach(o=>{node('option',o.label+' · '+o.id,objectSelect).value=o.id;});
  const detail=node('p','',controls);objectSelect.onchange=()=>{const base=(e.baseObjects||e.objects).find(x=>x.id===objectSelect.value),o=base?{...base,...(e.states[selectedState].objects?.[base.id]||{})}:null;detail.textContent=o?o.id+' · '+o.position.map(n=>n.toFixed(2)).join(', ')+' m':'';};
  const timelineLabel=node('label',word('카메라 경로','Camera path'),controls);const time=node('input',null,timelineLabel);time.type='range';time.min=0;time.max=100;time.value=0;time.disabled=!original.end&&!e.blocking?.actors?.some(a=>a.end);
  time.oninput=()=>{shotView=true;const t=Number(time.value)/100;actorTime=t;scrubbing=true;applyState(selectedState);refreshActors();const end={...original,...original.end};lens.value=original.lensMm+(end.lensMm-original.lensMm)*t;setCamera({...original,lensMm:Number(lens.value),position:original.position.map((v,i)=>v+(end.position[i]-v)*t),target:original.target.map((v,i)=>v+(end.target[i]-v)*t)});size();info.textContent=word('경로 미리보기','Path preview')+' '+time.value+'%';};
  button(word('카메라 변경안 내보내기','Export camera proposal'),controls,()=>{
    const patch={version:1,type:'location-camera',shotId:e.shotId,baseFingerprint:e.fingerprint,camera:{position:cam.position.toArray(),target:orbit.target.toArray(),lensMm:Number(lens.value),width:original.width,height:original.height,...(original.end?{end:original.end}:{})}};
    const blob=new Blob([JSON.stringify(patch,null,2)],{type:'application/json'}),href=URL.createObjectURL(blob),a=node('a');a.href=href;a.download=e.shotId+'-camera.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);info.textContent=word('변경안을 내려받았습니다. 적용 후 참조를 다시 렌더하세요.','Proposal downloaded. Apply it and render new references.');
  });
  orbit.addEventListener('start',()=>{shotView=false;size();label();});
  setCamera(original);label();size();const observer=new ResizeObserver(size);observer.observe(stage);
  function applyState(stateId){
    model?.traverse(o=>{const id=o.userData.locationId||o.name,spec=actorObjects().find(v=>v.id===id);if(!spec)return;
      // Exported root transforms are glTF Y-up. Apply state coordinates at that boundary.
      o.position.set(spec.position[0],spec.position[2],-spec.position[1]);
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(spec.rotation||[0,0,0]).map(THREE.MathUtils.degToRad),'ZYX'));
      const basis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
      o.quaternion.copy(basis.clone().multiply(q).multiply(basis.clone().invert()));
      o.visible=spec.visible!==false&&!(hidden&&spec.role==='wall');
    });
    for(const lamp of scene.children.filter(o=>o.isLight))lamp.intensity=(lamp.isHemisphereLight?2:3)*e.states[stateId].light;
  }
  const loading=node('p',word('3D 세트를 여는 중','Loading 3D set'),controls);
  new GLTFLoader().load(url(e.glb),g=>{
    if(disposed){g.scene.traverse(o=>o.geometry?.dispose());return;}
    model=g.scene; // glTF is Y-up; return to the contract's Blender Z-up basis.
    model.rotation.x=Math.PI/2;scene.add(model);
    applyState(selectedState);refreshActors();loading.textContent=word('3D 세트 준비됨','3D set ready');stage.dataset.ready='true';
  },undefined,err=>{loading.textContent=word('3D 파일을 열지 못했습니다. 로컬 HTTP 서버로 열어 주세요. ','Cannot load 3D file. Open via a local HTTP server. ')+err.message;stage.dataset.error='true';});
  const ray=new THREE.Raycaster();renderer.domElement.addEventListener('dblclick',ev=>{const r=renderer.domElement.getBoundingClientRect();const rw=shotView?Math.min(r.width,r.height*original.width/original.height):r.width,rh=shotView?rw*original.height/original.width:r.height;ray.setFromCamera(new THREE.Vector2((ev.clientX-r.left-(r.width-rw)/2)/rw*2-1,-(ev.clientY-r.top-(r.height-rh)/2)/rh*2+1),cam);const hit=ray.intersectObjects(model?[model]:[],true).find(h=>h.object.visible);if(hit){objectSelect.value=hit.object.userData.locationId||hit.object.name;objectSelect.onchange();}});
  function draw(){if(disposed)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setScissorTest(false);renderer.clear();if(shotView){const ratio=original.width/original.height;const rw=Math.min(w,h*ratio),rh=rw/ratio;renderer.setViewport((w-rw)/2,(h-rh)/2,rw,rh);}else renderer.setViewport(0,0,w,h);renderer.render(scene,cam);raf=requestAnimationFrame(draw);}draw();
  const spatial=node('details',null,host);node('summary',word('LLM 공간 정보 · 저장된 촬영 구도','LLM spatial evidence · saved shot'),spatial);
  node('p',word('자유 관찰과 상태 변경안은 아래 근거를 갱신하지 않습니다. 변경안을 적용한 뒤 다시 렌더하세요.','Exploration and proposals do not update this evidence. Apply changes and render again.'),spatial);
  if(e.spatial){node('pre',JSON.stringify(e.spatial,null,2),spatial,'location-spatial');const a=node('a',word('공간 정보 JSON 내려받기','Download spatial JSON'),spatial);a.href=url(e.spatialAsset.path);a.download='spatial.json';}
  else node('p',word('공간 정보가 없습니다. 장소를 다시 렌더하면 생성됩니다.','No spatial evidence. Render this location to generate it.'),spatial);
  const compare=node('div',null,host,'location-compare');for(const [kind,frame] of Object.entries(e.frames||{})){const fig=node('figure',null,compare);const image=node('img',null,fig);image.src=url(frame.path);image.alt=e.name+' '+kind;node('figcaption',({start:word('촬영 · 시작','Shot · start'),end:word('촬영 · 끝','Shot · end'),'start-top':word('평면 · 시작','Top · start'),'end-top':word('평면 · 끝','Top · end'),'start-side':word('측면 · 시작','Side · start'),'end-side':word('측면 · 끝','Side · end')})[kind]||kind,fig);}
  if(e.resultImage){const fig=node('figure',null,compare);const image=node('img',null,fig);image.src=url(e.resultImage);image.alt=word('생성 결과','Generated result');node('figcaption',e.resultReview ? word('생성 검수: ','Result review: ')+e.resultReview.verdict+' · '+e.resultReview.notes : word('생성 결과 · 별도 검수','Generated result · review separately'),fig);}
  return ()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();orbit.dispose();scene.traverse(o=>{o.geometry?.dispose();for(const mat of (Array.isArray(o.material)?o.material:[o.material])){if(mat){for(const v of Object.values(mat))if(v?.isTexture)v.dispose();mat.dispose();}}});renderer.dispose();};
}
mount();
