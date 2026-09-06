/* Shared by the offline checker and the bundled browser renderer. No clocks or I/O. */
'use strict';
const STYLES = ['illustration3d', 'photoreal3d'];
const GEOMETRIES = ['roundedBox', 'sphere', 'cylinder', 'torus'];
const LOCAL_GLB = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.glb$/;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const poseFields = ['position', 'rotation', 'scale'];
function checkRecipe(r, segments) {
  const errors = [], bad = s => errors.push(s);
  if (!r || r.version !== 1) return ['mesh recipe requires version:1'];
  if (!STYLES.includes(r.style)) bad('mesh style must be illustration3d or photoreal3d');
  const nodes = Array.isArray(r.nodes) ? r.nodes : [];
  if (!nodes.length || nodes.length > 200) bad('mesh recipe needs 1–200 model nodes');
  const ids = new Set();
  const checkPose = (p, at) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) { bad(`${at}: invalid pose`); return; }
    for (const key of Object.keys(p)) {
      if (!poseFields.includes(key) || !vector(p[key])) bad(`${at}: ${key} must be a finite vector of length 3`);
      if (key === 'scale' && vector(p[key]) && p[key].some(v => v <= 0)) bad(`${at}: scale must be positive`);
    }
  };
  nodes.forEach(n => {
    if (!n || !ID.test(n.id) || ids.has(n.id)) { bad('mesh node ids must be unique identifiers'); return; }
    if (n.parent && !ids.has(n.parent)) bad(`${n.id}: parent must precede its child`);
    ids.add(n.id);
    if (n.source) {
      if (!LOCAL_GLB.test(n.source)) bad(`${n.id}: source must be a local GLB filename beside the recipe`);
      if (n.geometry) bad(`${n.id}: choose source or geometry`);
    } else if (n.geometry) {
      const g = n.geometry;
      if (!GEOMETRIES.includes(g.type)) bad(`${n.id}: unsupported geometry`);
      if (!Array.isArray(g.size) || g.size.length !== ({roundedBox:3, sphere:1, cylinder:3, torus:2})[g.type] ||
          g.size.some(v => !Number.isFinite(v) || v <= 0)) bad(`${n.id}: invalid geometry size`);
      if (g.bevel != null && (!Number.isFinite(g.bevel) || g.bevel <= 0 || g.bevel > Math.min(...(g.size || [0])) / 2))
        bad(`${n.id}: invalid bevel`);
    }
    checkPose(n.pose || {}, n.id);
    const m = n.material || {};
    if (m.finish != null && !['wood', 'linen'].includes(m.finish)) bad(`${n.id}: finish must be wood or linen`);
    if (m.color && !/^#[0-9a-f]{6}$/i.test(m.color)) bad(`${n.id}: material color must be hex`);
    for (const k of ['metalness', 'roughness', 'clearcoat'])
      if (m[k] != null && (!Number.isFinite(m[k]) || m[k] < 0 || m[k] > 1)) bad(`${n.id}: invalid ${k}`);
  });
  for (const b of r.bindings || []) {
    if (!b || !ID.test(b.id) || ids.has(b.id) || !nodes.some(n => n.id === b.asset && n.source) || !b.node)
      bad('mesh binding needs a unique id, imported asset and named GLB node');
    else ids.add(b.id);
  }
  if (r.style === 'photoreal3d' && !nodes.some(n => n.source))
    bad('photoreal3d requires an imported GLB with authored materials; primitive assemblies are illustration3d');
  if (!r.camera || !vector(r.camera.position) || !vector(r.camera.target) ||
      !Number.isFinite(r.camera.fov) || r.camera.fov < 15 || r.camera.fov > 65 ||
      JSON.stringify(r.camera.position) === JSON.stringify(r.camera.target)) bad('mesh camera needs position, target and fov 15–65');
  if (r.floorY != null && !Number.isFinite(r.floorY)) bad('mesh floorY must be finite');
  if (r.contactShadows != null && (!Array.isArray(r.contactShadows) || r.contactShadows.length>12)) bad('mesh contactShadows needs at most 12 anchors');
  for (const s of Array.isArray(r.contactShadows)?r.contactShadows:[]) {
    if (!s || typeof s.target!=='string' || !s.target || !Array.isArray(s.size) || s.size.length!==2 || s.size.some(x=>!Number.isFinite(x)||x<=0||x>10) || !Number.isFinite(s.opacity) || s.opacity<0 || s.opacity>1)
      bad('mesh contact shadow needs target, positive size and opacity 0–1');
  }
  if (r.lighting != null) {
    const l=r.lighting;
    if (!l || typeof l !== 'object' || Array.isArray(l)) bad('mesh lighting must be an object');
    else {
      for (const k of ['exposure','environment','key','fill','rim','shadowOpacity']) {
        if (l[k] != null && (!Number.isFinite(l[k]) || l[k] < 0 || l[k] > (k === 'shadowOpacity' ? 1 : 4)))
          bad(`mesh lighting.${k} is outside its finite range`);
      }
      if (l.keyPosition != null && (!vector(l.keyPosition) || l.keyPosition.every(x=>x===0))) bad('mesh lighting.keyPosition needs a nonzero vec3');
      if (l.keyColor != null && !/^#[0-9a-f]{6}$/i.test(l.keyColor)) bad('mesh lighting.keyColor needs a hex color');
    }
  }
  const states = Array.isArray(r.states) ? r.states : [];
  const groups = Array.isArray(r.groups) ? r.groups : [];
  if (!groups.length || (segments != null && groups.length !== segments) || states.length !== groups.length + 1)
    bad('mesh needs one group per narration segment and N+1 complete states');
  states.forEach((s, i) => {
    if (!s || typeof s !== 'object') { bad(`mesh state ${i} is invalid`); return; }
    for (const [id, p] of Object.entries(s.pose || {})) {
      if (!ids.has(id)) bad(`state ${i}: unknown target ${id}`);
      checkPose(p, `state ${i}/${id}`);
    }
    for (const [id, clip] of Object.entries(s.clips || {})) {
      if (!nodes.some(n => n.id === id && n.source) || !clip || typeof clip.name !== 'string' || !clip.name ||
          !Number.isFinite(clip.time) || clip.time < 0) bad(`state ${i}: invalid animation clip ${id}`);
    }
    if (i > 0) {
      const a = states[i - 1] || {};
      const keys = [...new Set([...Object.keys(a.clips || {}), ...Object.keys(s.clips || {})])];
      for (const id of keys) if (!a.clips?.[id] || !s.clips?.[id] || a.clips[id].name !== s.clips[id].name)
        bad(`group ${i}: an animation clip must keep its name across the boundary`);
      const semantic = state => JSON.stringify({pose: [...ids].map(id => poseFor(r, state, id)), clips: state.clips || {}});
      if (semantic(a) === semantic(s)) bad(`group ${i}: object state is unchanged; camera and labels do not qualify`);
    }
  });
  groups.forEach((g, i) => {
    if (!g || g.group !== i + 1 || !Number.isFinite(g.durationMs) || g.durationMs < 200)
      bad(`mesh group ${i + 1}: needs ordered group and durationMs >= 200`);
    if (g && !['smoother', 'linear'].includes(g.ease)) bad(`mesh group ${i + 1}: ease must be smoother or linear`);
    if (g?.motionWindow != null && (!Array.isArray(g.motionWindow) || g.motionWindow.length!==2 || g.motionWindow.some(x=>!Number.isFinite(x)||x<0||x>1) || g.motionWindow[0]>=g.motionWindow[1])) bad(`mesh group ${i+1}: motionWindow needs ordered fractions 0–1`);
  });
  return errors;
}
function poseFor(r, state, id) {
  const base = r.nodes.find(n => n.id === id)?.pose || {};
  const override = state.pose?.[id] || {};
  return {position: override.position || base.position || [0,0,0],
    rotation: override.rotation || base.rotation || [0,0,0], scale: override.scale || base.scale || [1,1,1]};
}
// Quintic easing has zero velocity and acceleration at both ends. Random seeks have no history.
const ease = (u, name) => { u = Math.max(0, Math.min(1, u)); return name === 'linear' ? u : u*u*u*(u*(u*6-15)+10); };
function sampleRecipe(r, group, progress) {
  const index = Math.max(0, Math.min(r.groups.length - 1, group - 1));
  const window=r.groups[index].motionWindow || [0,1];
  const u = ease(group < 1 ? 0 : group > r.groups.length ? 1 : (progress-window[0])/(window[1]-window[0]), r.groups[index].ease);
  return {from: r.states[index], to: r.states[index + 1], u};
}
module.exports = { STYLES, LOCAL_GLB, checkRecipe, poseFor, sampleRecipe };
