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
    return e;
  }
  function resolvedObjects(m,stateId){return m.objects.map(o=>({...o,...(m.states[stateId]?.objects?.[o.id]||{})}));}
  return {validate,cameraErrors,bindingErrors,resolvedObjects};
});
