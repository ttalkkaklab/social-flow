/* Shared location validation. Coordinates: metres, Z up; camera lens on 36mm sensor. */
(function(root,factory){ const api=factory(); if(typeof module==='object') module.exports=api; else root.LOCATION_CONTRACT=api; })(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const id = s => !['constructor','prototype','__proto__','location-camera','key','fill'].includes(s) && typeof s==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,54}$/.test(s);
  const vec = v => Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  const hash = s => typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
  function cameraErrors(c){
    const e=[];
    if(!c||!vec(c.position)||!vec(c.target)) return ['camera position and target must be finite xyz vectors'];
    if(c.position.every((v,i)=>v===c.target[i])) e.push('camera position equals target');
    if(!Number.isFinite(c.lensMm)||c.lensMm<10||c.lensMm>300) e.push('camera lensMm must be 10..300');
    if(!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<64||c.height<64||c.width>4096||c.height>4096) e.push('camera width/height must be 64..4096');
    if(c.end && (c.end.width!==undefined||c.end.height!==undefined||c.end.end!==undefined))e.push('camera endpoint cannot change raster size or nest endpoints');
    if(c.end){ e.push(...cameraErrors({...c,...c.end,end:undefined})); }
    return e;
  }
  function validate(m){
    const e=[];
    if(!m||typeof m!=='object') return ['location must be an object'];
    if(m.schemaVersion!==1||!id(m.id)||!Number.isInteger(m.revision)||m.revision<1) e.push('schemaVersion=1, safe id and positive revision required');
    if(typeof m.name!=='string'||!m.name.trim()||typeof m.description!=='string'||!m.description.trim()) e.push('name and description required');
    if(m.units!=='metres'||m.up!=='Z') e.push('location uses metres and Z up');
    if(!m.provenance||!['authored','measured','reconstructed'].includes(m.provenance.kind)||!m.provenance.notes) e.push('provenance kind and notes required');
    const objects=m.objects;
    if(!Array.isArray(objects)||!objects.length||objects.length>1000) return [...e,'objects must contain 1..1000 meshes'];
    const ids=new Set();
    objects.forEach(o=>{
      if(!o||!id(o.id)||ids.has(o.id)){e.push('invalid or duplicate object id');return;} ids.add(o.id);
      if(!['box','cylinder','sphere'].includes(o.kind)||!vec(o.position)||!vec(o.size)||o.size.some(x=>x<=0)||!vec(o.rotation||[0,0,0])) e.push(o.id+': invalid geometry');
      if(!/^#[a-f0-9]{6}$/i.test(o.color||'')) e.push(o.id+': hex color required');
      if(o.fixed!==undefined&&typeof o.fixed!=='boolean')e.push(o.id+': fixed must be boolean');
      if(o.visible!==undefined&&typeof o.visible!=='boolean')e.push(o.id+': visible must be boolean');
      if(typeof o.label!=='string'||!o.label.trim()) e.push(o.id+': label required');
    });
    if(!m.states||!Object.keys(m.states).length) e.push('states required');
    for(const [key,s] of Object.entries(m.states||{})){
      if(!id(key)||!s||typeof s.label!=='string'||!s.label.trim()) {e.push('invalid state');continue;}
      if(!Number.isFinite(s.light)||s.light<0||s.light>5) e.push(key+': light must be 0..5');
      for(const [oid,v] of Object.entries(s.objects||{})){
        const object=objects.find(o=>o?.id===oid);if(object&&(object.fixed||object.role==='wall')&&Object.keys(v||{}).length)e.push(key+': fixed architecture needs a new revision '+oid);
        if(!ids.has(oid)||!v||Object.keys(v).some(k=>!['position','rotation','visible'].includes(k))||('position' in v&&!vec(v.position))||('rotation' in v&&!vec(v.rotation))||(v.visible!==undefined&&typeof v.visible!=='boolean')) e.push(key+': invalid object override '+oid);
      }
    }
    if(!m.cameras||!Object.keys(m.cameras).length) e.push('cameras required');
    for(const [key,c] of Object.entries(m.cameras||{})) {if(!id(key))e.push('invalid camera id');e.push(...cameraErrors(c).map(v=>key+': '+v));}
    if(!Array.isArray(m.invariants)||!m.invariants.length||m.invariants.some(s=>typeof s!=='string'||!s.trim())) e.push('invariants required');
    return e;
  }
  function bindingErrors(b,m){
    if(!b||typeof b!=='object')return ['location binding required'];
    const e=[];
    if(b.id!==m.id||b.revision!==m.revision||!hash(b.manifestSha256))e.push('location identity/revision/hash mismatch');
    if(!Object.hasOwn(m.states,b.stateId))e.push('unknown location state');
    if(!Object.hasOwn(m.cameras,b.cameraId))e.push('unknown location camera');
    if(b.camera)e.push(...cameraErrors(b.camera));
    if(!Array.isArray(b.mustShow)||b.mustShow.some(v=>!m.objects.some(o=>o.id===v)))e.push('mustShow contains unknown objects');
    if(b.endStateId!==undefined&&!Object.hasOwn(m.states,b.endStateId))e.push('unknown location end state');
    if(b.continuityGroup!==undefined&&(typeof b.continuityGroup!=='string'||!b.continuityGroup.trim()))e.push('continuityGroup must be nonempty');
    if(b.continuityBreak!==undefined&&(typeof b.continuityBreak!=='string'||!b.continuityBreak.trim()))e.push('continuityBreak needs an observed story reason');
    e.push(...blockingErrors(b.blocking,m));
    return e;
  }
  function resolvedObjects(m,stateId){return m.objects.map(o=>({...o,...(m.states[stateId]?.objects?.[o.id]||{})}));}
  function blockingErrors(blocking,m){
    if(blocking===undefined)return [];
    if(!blocking||!Array.isArray(blocking.actors)||blocking.actors.length>32)return ['blocking.actors must contain 0..32 actors'];
    const e=[],ids=new Set(m.objects.map(o=>o.id));
    for(const a of blocking.actors){
      if(!a||!id(a.id)||ids.has(a.id)){e.push('invalid, duplicate or colliding blocking actor id');continue;}ids.add(a.id);
      if(!Number.isFinite(a.height)||a.height<.1||a.height>10||!/^#[a-f0-9]{6}$/i.test(a.color||''))e.push(a.id+': height 0.1..10 metres and hex color required');
      for(const [phase,p] of [['start',a.start],['end',a.end===undefined?a.start:a.end]]){
        if(!p||!vec(p.position)||!Number.isFinite(p.rotationZDeg)){e.push(a.id+': '+phase+' needs position and rotationZDeg');continue;}
        if(p.gazeTarget!==undefined&&typeof p.gazeTarget!=='string')e.push(a.id+': gazeTarget must be an actor or object id');
        if(p.holds!==undefined&&(!Array.isArray(p.holds)||new Set(p.holds).size!==p.holds.length||p.holds.some(v=>!m.objects.some(o=>o.id===v))))e.push(a.id+': holds must name unique location objects');
      }
    }
    for(const a of blocking.actors){
      if(!a)continue;
      for(const p of [a.start,a.end])if(p?.gazeTarget!==undefined&&(!ids.has(p.gazeTarget)||p.gazeTarget===a.id))e.push(a.id+': unknown or self gazeTarget');
    }
    if(blocking.axis!==undefined&&(!Array.isArray(blocking.axis)||blocking.axis.length!==2||blocking.axis[0]===blocking.axis[1]||blocking.axis.some(v=>!ids.has(v))))e.push('blocking.axis needs two distinct actor or object ids');
    return e;
  }
  // A missing end holds the complete start pose; an authored end is a complete state.
  function actorsAt(blocking,phase){return (blocking?.actors||[]).map(a=>({id:a.id,height:a.height,color:a.color,...(phase==='end'&&a.end!==undefined?a.end:a.start)}));}
  function point(m,b,id,phase){
    const actor=actorsAt(b.blocking,phase).find(a=>a.id===id);
    if(actor)return [actor.position[0],actor.position[1],actor.position[2]+actor.height*.93];
    return resolvedObjects(m,phase==='end'?(b.endStateId||b.stateId):b.stateId).find(o=>o.id===id)?.position;
  }
  function close(a,b){return Math.abs(a-b)<1e-4;}
  function samePosition(a,b){return a.every((v,i)=>close(v,b[i]));}
  function sameAngle(a,b){return close(((a-b)%360+540)%360,180);}
  function continuityIssues(previous,current){
    const issues=[],a=previous.b,b=current.b;
    if(b.continuityBreak)return issues;
    if(a.id!==b.id||a.manifestSha256!==b.manifestSha256)issues.push('shared set revision changed');
    const before=actorsAt(a.blocking,'end'),after=actorsAt(b.blocking,'start');
    if(!a.blocking||!b.blocking)issues.push('shared character blocking is missing');
    else {
      if(before.length!==after.length||before.some(x=>!after.some(y=>y.id===x.id)))issues.push('actor inventory changed; keep off-camera actors in the set');
      for(const actor of before){
        const next=after.find(x=>x.id===actor.id);if(!next)continue;
        if(!samePosition(actor.position,next.position))issues.push(actor.id+': position jumps at cut');
        if(!sameAngle(actor.rotationZDeg,next.rotationZDeg))issues.push(actor.id+': body direction jumps at cut');
        if(actor.gazeTarget!==next.gazeTarget)issues.push(actor.id+': gaze target changes at cut');
        if(JSON.stringify([...(actor.holds||[])].sort())!==JSON.stringify([...(next.holds||[])].sort()))issues.push(actor.id+': held objects change at cut');
      }
    }
    const objects=resolvedObjects(previous.m,a.endStateId||a.stateId),nextObjects=resolvedObjects(current.m,b.stateId);
    for(const o of objects){
      const n=nextObjects.find(x=>x.id===o.id);if(!n)continue;
      if(!samePosition(o.position,n.position)||!(o.rotation||[0,0,0]).every((v,i)=>sameAngle(v,(n.rotation||[0,0,0])[i]))||(o.visible!==false)!==(n.visible!==false))issues.push(o.id+': set object state jumps at cut');
    }
    const axis=b.blocking?.axis;
    if(axis&&JSON.stringify(axis)===JSON.stringify(a.blocking?.axis)&&!current.s.shot?.lineCrossing){
      function side(ctx,phase){const p=point(ctx.m,ctx.b,axis[0],phase),q=point(ctx.m,ctx.b,axis[1],phase),c=phase==='end'?{...ctx.camera,...ctx.camera.end}:ctx.camera;if(!p||!q)return 0;return (q[0]-p[0])*(c.position[1]-p[1])-(q[1]-p[1])*(c.position[0]-p[0]);}
      if(side(previous,'end')*side(current,'start')< -1e-8)issues.push('camera crosses the shared action axis; plan a visible bridge or intentional lineCrossing');
    }
    return issues;
  }
  function blockingPrompt(blocking,phase='start'){
    if(!blocking)return '';
    const actors=actorsAt(blocking,phase);
    return 'The location render also controls character positions, body orientation and gaze. ' + actors.map(a=>`Proxy ${a.color} is ${a.id}; preserve its placement and body direction${a.gazeTarget?'; eyes look at '+a.gazeTarget:''}${a.holds?.length?'; holds '+a.holds.join(', '):''}.`).join(' ')+' Character sheets control appearance only; off-camera actors stay outside the crop.';
  }
  return {validate,cameraErrors,bindingErrors,resolvedObjects,blockingErrors,actorsAt,point,continuityIssues,blockingPrompt};
});
