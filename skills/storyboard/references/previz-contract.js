/* previz-contract.js — the three.js previz spec (blender-previz.md §6.5), shared by
   previz-runtime.mjs (the page), the storyboard checkers and the tests.

   A previz is a camera and a set of grey proxies moved by keyframes, rendered at the cut's
   billed length, 24 fps, in the format's canvas. The spec keeps Blender's own coordinates —
   metres, Z up, a proxy faces -Y — so a plan written for blender_scene_build moves to the
   three.js page and back without re-typing a number. toThree() maps into three.js's Y-up frame.

   {
     fps: 24, seconds: 5, width: 1080, height: 1920,
     camera: { lensMm: 35, keys: [{ frame: 1, position: [x, y, z], target: [x, y, z] }, …] },
     actors: [{ name: 'porter', kind: 'person', color: '#d0342c', height: 1.75,
                keys: [{ frame: 1, position: [0, 0, 0], rotationZDeg: 0 }, …] }, …]
   }

   kind · person (height) · box (size [x, y, z]) · cylinder (radius, height) · sphere (radius) ·
   car (optional size, default 1.8 × 4.4 × 1.45 m). A key's position is the proxy's floor point.
   Keys interpolate LINEAR by frame and clamp outside their range, the way the bridge keys do. */
(function (root) {
  'use strict';
  const KINDS = ['person', 'box', 'cylinder', 'sphere', 'car'];
  const CAR = [1.8, 4.4, 1.45];
  const vec = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const pos = (n) => Number.isFinite(n) && n > 0;
  const COLOR_RE = /^#[0-9a-f]{6}$/i;

  function checkSpec(spec) {
    const errors = [], bad = (s) => errors.push(s);
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['PREVIZ must be an object'];
    if (!Number.isInteger(spec.fps) || spec.fps < 24 || spec.fps > 60) bad('fps must be an integer 24–60 (24 for frame-for-frame QA)');
    if (!Number.isInteger(spec.seconds) || spec.seconds < 2) bad('seconds must be a whole number of seconds, 2 or more — the cut length the vendor bills');
    if (!Number.isInteger(spec.width) || !Number.isInteger(spec.height) || spec.width % 2 || spec.height % 2 || spec.width < 2 || spec.height < 2)
      bad('width and height must be even integers — the format canvas (1080×1920 or 1920×1080)');
    const cam = spec.camera;
    if (!cam || typeof cam !== 'object') bad('camera { lensMm, keys } is required');
    else {
      if (!pos(cam.lensMm) || cam.lensMm < 8 || cam.lensMm > 400) bad('camera.lensMm must be 8–400 (a 36 mm sensor on the longer side)');
      errors.push(...checkKeys(cam.keys, 'camera', (k) => {
        const e = [];
        if (!vec(k.position)) e.push('position [x, y, z] in metres');
        if (!vec(k.target)) e.push('target [x, y, z] — the point the camera looks at');
        else if (vec(k.position) && k.position.every((v, i) => v === k.target[i])) e.push('target must differ from position');
        return e;
      }, spec));
    }
    if (!Array.isArray(spec.actors) || !spec.actors.length) bad('actors must list at least one proxy — the subject the cut is about');
    else {
      const names = new Set();
      spec.actors.forEach((a, i) => {
        const where = 'actors[' + i + ']';
        if (!a || typeof a !== 'object') { bad(where + ' must be an object'); return; }
        if (typeof a.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(a.name)) bad(where + ' name must be a short identifier');
        else if (names.has(a.name)) bad(where + ' repeats the name ' + a.name); else names.add(a.name);
        if (!KINDS.includes(a.kind)) bad(where + ' kind must be one of ' + KINDS.join(', '));
        if (a.color !== undefined && !COLOR_RE.test(String(a.color))) bad(where + ' color must be #rrggbb — one flat colour per actor, grey when absent');
        if (a.kind === 'person' && !pos(a.height)) bad(where + ' person needs height in metres');
        if (a.kind === 'box' && !(vec(a.size) && a.size.every(pos))) bad(where + ' box needs size [x, y, z]');
        if (a.kind === 'cylinder' && (!pos(a.radius) || !pos(a.height))) bad(where + ' cylinder needs radius and height');
        if (a.kind === 'sphere' && !pos(a.radius)) bad(where + ' sphere needs radius');
        if (a.kind === 'car' && a.size !== undefined && !(vec(a.size) && a.size.every(pos))) bad(where + ' car size is [x, y, z] when given');
        errors.push(...checkKeys(a.keys, where, (k) => {
          const e = [];
          if (!vec(k.position)) e.push('position [x, y, z] — the proxy\'s floor point');
          if (k.rotationZDeg !== undefined && !Number.isFinite(k.rotationZDeg)) e.push('rotationZDeg must be a number');
          return e;
        }, spec));
      });
    }
    return errors;
  }

  function checkKeys(keys, where, each, spec) {
    const errors = [];
    if (!Array.isArray(keys) || !keys.length) return [where + ' needs keys — one key is a locked-off pose, two or more are a move'];
    const last = Number.isInteger(spec.fps) && Number.isInteger(spec.seconds) ? spec.fps * spec.seconds : null;
    const frames = new Set();
    keys.forEach((k, i) => {
      const at = where + '.keys[' + i + ']';
      if (!k || typeof k !== 'object') { errors.push(at + ' must be an object'); return; }
      if (!Number.isInteger(k.frame) || k.frame < 1) errors.push(at + ' frame must be an integer from 1');
      else if (frames.has(k.frame)) errors.push(at + ' repeats frame ' + k.frame);
      else frames.add(k.frame);
      if (last && Number.isInteger(k.frame) && k.frame > last) errors.push(at + ' frame ' + k.frame + ' is past the last frame ' + last + ' (fps × seconds)');
      each(k).forEach((m) => errors.push(at + ' ' + m));
    });
    return errors;
  }

  const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
  /* LINEAR between the two keys around `frame`, clamped to the first and last key. */
  function sampleKeys(keys, frame, fields) {
    const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
    let lo = sorted[0], hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (frame >= sorted[i].frame && frame <= sorted[i + 1].frame) { lo = sorted[i]; hi = sorted[i + 1]; break; }
    }
    const u = frame <= lo.frame ? 0 : frame >= hi.frame ? 1 : (frame - lo.frame) / (hi.frame - lo.frame);
    const out = {};
    for (const f of fields) {
      const a = lo[f], b = hi[f] === undefined ? a : hi[f];
      if (a === undefined) continue;
      out[f] = Array.isArray(a) ? lerp(a, b, u) : a + (b - a) * u;
    }
    return out;
  }
  function sampleCamera(spec, frame) {
    const s = sampleKeys(spec.camera.keys, frame, ['position', 'target']);
    return { position: s.position, target: s.target, lensMm: spec.camera.lensMm };
  }
  function sampleActor(actor, frame) {
    const s = sampleKeys(actor.keys.map((k) => Object.assign({ rotationZDeg: 0 }, k)), frame, ['position', 'rotationZDeg']);
    return { position: s.position, rotationZDeg: s.rotationZDeg };
  }
  /* The page's local time → the 1-based frame, clamped to the cut. Frame 1 is t = 0. */
  function frameAt(spec, tMs) {
    const last = spec.fps * spec.seconds;
    return Math.min(last, Math.max(1, 1 + Math.round(tMs / 1000 * spec.fps)));
  }
  /* Blender (x right, y away, z up) → three.js (x right, y up, z toward the viewer). */
  const toThree = (v) => [v[0], v[2], -v[1]];
  /* Blender's AUTO sensor fit puts the 36 mm sensor on the longer side; three.js wants the
     vertical field of view, so a landscape frame scales the horizontal angle by the aspect. */
  function fovVertical(lensMm, width, height) {
    const long = 2 * Math.atan(18 / lensMm);
    const vertical = height >= width ? long : 2 * Math.atan(Math.tan(long / 2) * height / width);
    return vertical * 180 / Math.PI;
  }
  /* The proxy's dimensions: the footprint and the height above its floor point. */
  function actorExtent(a) {
    if (a.kind === 'person') return { width: a.height * 0.36, depth: a.height * 0.22, height: a.height };
    if (a.kind === 'box') return { width: a.size[0], depth: a.size[1], height: a.size[2] };
    if (a.kind === 'cylinder') return { width: a.radius * 2, depth: a.radius * 2, height: a.height };
    if (a.kind === 'sphere') return { width: a.radius * 2, depth: a.radius * 2, height: a.radius * 2 };
    const s = a.size || CAR;
    return { width: s[0], depth: s[1], height: s[2] };
  }

  const api = { KINDS, CAR, checkSpec, sampleKeys, sampleCamera, sampleActor, frameAt, toThree, fovVertical, actorExtent };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PREVIZ_CONTRACT = api;
})(typeof window === 'object' ? window : globalThis);
