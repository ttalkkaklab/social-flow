/* Shared by the planner, approval page and production preflight. */
(function (root) {
  'use strict';
  const text = value => typeof value === 'string' && !!value.trim();
  const CHOICES = ['full_video', 'video_50', 'video_30', 'hook_only'];
  const CUT_TYPES = ['action', 'reaction', 'insert', 'document', 'map', 'scenery'];
  // stills_only is out of CHOICES on purpose: a channel whose generated-video cap is 0 has no
  // video cost to compare, so the four-option HITL has nothing to offer. The board still
  // records its visual style, and that record is what stills_only carries.
  const MODES = { full_video: '100% 이상', video_50: '50% 이상', video_30: '30% 이상', hook_only: '훅만 영상', stills_only: '정지 전용 (생성 영상 0)', hybrid: '혼합 제작 (기존 승인)' };
  const RATIOS = { full_video: 1, video_50: .5, video_30: .3 };
  // A cut is a shot in the playback line; b-roll is spliced by `after` and is not a cut, so it
  // sits outside the ratio on both sides (it still counts toward the generated-slot cap).
  const newCut = scene => eligible(scene) && !reused(scene) && scene.type !== 'broll';
  const generated = scene => !!scene.visual?.video || (scene.type === 'quote' && typeof scene.visual?.clip === 'object');
  function hookScene(scenes) { return scenes.find(s => s.type === 'hooking' || s.beat === 'hooking') || scenes.find(s => s.type === 'cover') || scenes.find(newCut); }
  function coverageErrors(win) {
    const key = win.PRODUCTION?.mode, scenes = win.SCENES || [], cuts = scenes.filter(newCut);
    if (key === 'hook_only') {
      const hook = hookScene(scenes);
      return hook && newCut(hook) && generated(hook) && cuts.filter(generated).length === 1
        ? [] : ['hook_only requires only the opening hook cut to be generated video'];
    }
    if (!RATIOS[key]) return [];
    const minimum = Math.ceil(cuts.length * RATIOS[key]);
    return cuts.filter(generated).length >= minimum ? [] : [key + ' requires at least ' + minimum + ' of ' + cuts.length + ' new cuts as generated video'];
  }
  // Two HITL choices every episode with generated video records (user directive 2026-09-11):
  // which 3D renderer draws the mandatory previz, and which video model the clips are made on.
  const PREVIZ_RENDERERS = { blender: '블렌더 브릿지 — 관절 마네킹, 모션 캡처', threejs: 'three.js 페이지 — 헤드리스 크롬, 관절 없음' };
  // Suggested models and priced resolutions; each cut may choose its own model and resolution.
  const VIDEO_MODELS = {
    'seedance-1-5-pro-251215': { label: 'Seedance 1.5 Pro', resolutions: ['720p', '1080p'] },
    'dreamina-seedance-2-0-260128': { label: 'Seedance 2.0', resolutions: ['1080p'] },
    'dreamina-seedance-2-0-fast-260128': { label: 'Seedance 2.0 fast', resolutions: ['720p'] },
    'dreamina-seedance-2-0-mini-260615': { label: 'Seedance 2.0 mini', resolutions: ['720p'] },
    'dreamina-seedance-2-5-260628': { label: 'Seedance 2.5', resolutions: ['720p', '1080p'] }
  };
  const selectionRecorded = sel => sel && ['user', 'standing'].includes(sel.kind) && text(sel.reference);
  // The four slots every generated shot stores (scenes-schema §camera); spatial-prompts.js
  // assembles the motion prompt's camera span from them, so nothing else describes the camera.
  const CAMERA_SLOTS = ['movement', 'speed', 'framing', 'end'];
  const normalize = value => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  // A static camera has no speed to state (the span reads "static camera"), so that one slot may stay empty.
  const staticCamera = camera => /^(static|fixed|locked)/i.test(String(camera?.movement || '').trim());
  const missingCameraSlots = camera => CAMERA_SLOTS.filter(slot => !text(camera?.[slot]) && !(slot === 'speed' && staticCamera(camera)));
  // A move written to be invisible is a still with extra steps. ep402 (2026-09-06) asked for
  // "very small optical focus change", "gentle focus", "hold composition with subtle light
  // variation" and got clips whose every frame repeats the last; ep411 (2026-09-09) asked for
  // "slow dolly in" on wide miniature stages and read as stills on a phone. The camera slots
  // name a move the viewer can see, in vendor vocabulary: dolly in, truck right, arc shot,
  // pedestal up, at slow / steady / fast — or static, chosen, on at most a third of the shots.

  // Shot camera presets are independent of the episode's material/illustration style.
  const CAMERA_PRESETS = { 'drone-flythrough': { label: '드론 경로 비행', variants: { cinematic: '부드러운 항공 촬영', fpv: '기울어지는 FPV' } } };
  const CAMERA_VECTOR_SCHEMA = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' }, description: 'Local metres [X right, Y forward, Z up], not latitude/longitude.' };
  // Shared with storyboard_apply's discovery schema. Ordinary cameras keep their existing fields.
  const CAMERA_INPUT_SCHEMA = {
    type: 'object', additionalProperties: true,
    description: 'Shot camera, independent of the episode visual style. A drone trajectory is authored first; drone-previz.js derives movement, speed, framing and end. Copy those slots back before prompt assembly.',
    properties: {
      preset: { type: 'string', enum: Object.keys(CAMERA_PRESETS), description: 'Optional shot preset. Omit on ordinary camera shots; drone-flythrough is continuous travel through a 3D location.' },
      variant: { type: 'string', enum: Object.keys(CAMERA_PRESETS['drone-flythrough'].variants), description: 'cinematic keeps the horizon level; fpv uses authored bank at bends. Required with drone-flythrough.' },
      movement: { type: 'string', description: 'One camera move in vendor vocabulary, chosen from shot.feel (directing-grammar §4–§5): static · dolly in/out · zoom in/out (lens only) · dolly zoom in/out · pan left/right · tilt up/down · whip pan · truck left/right · pedestal up/down · crane up/down · arc shot · tracking · handheld · aerial. Not push in, orbit, boom or a Korean word (storyboard_check enforces the vocabulary and the conditions below). A pan, tilt, truck, pedestal or dolly is a sentence from framing to end, so end must differ from framing. A whip pan needs the hit in sound.sfx or visual.audio. A dolly zoom needs shot.depth deep (the background that stretches), a stationary subject, and happens once per episode. For drone shots copy the trajectory-derived value from drone-previz.js.' },
      speed: { type: 'string', description: 'Movement pace as slow, steady or fast — never inside movement, never a word the viewer cannot see (very slow, subtle). Empty on static. Generated from the trajectory on drone shots.' },
      framing: { type: 'string', description: 'Opening composition — what the camera holds before the move starts (hold in). Generated from the trajectory on drone shots.' },
      end: { type: 'string', description: 'Closing composition — where the move settles and holds (hold out); on a pan, tilt, truck, pedestal or dolly it names a different picture from framing. Generated from the trajectory on drone shots.' },
      trajectory: {
        type: 'object', additionalProperties: true,
        description: 'Drone flight plan. Keys cover zero through seconds in increasing order; positions move and targets remain distinct and nonvertical. Render and inspect the interpolated path before generation.',
        required: ['coordinateSpace', 'seconds', 'lensMm', 'keys'],
        properties: {
          coordinateSpace: { type: 'string', enum: ['local-meters'], description: 'Blender-compatible local coordinates, Z up.' },
          seconds: { type: 'integer', minimum: 2, maximum: 30, description: 'Whole billed duration. Must match the selected model duration and the previz.' },
          lensMm: { type: 'number', minimum: 12, maximum: 50, description: 'Fixed focal length for the flight, in millimetres.' },
          keys: {
            type: 'array', minItems: 2, maxItems: 32,
            description: 'Ordered flight waypoints; first at=0, last at=seconds. Intermediate points do not imply stops.',
            items: { type: 'object', additionalProperties: true, required: ['at', 'position', 'target', 'rollDeg', 'label'], properties: {
              at: { type: 'number', minimum: 0, description: 'Seconds on the flight timeline; strictly increasing.' },
              position: CAMERA_VECTOR_SCHEMA,
              target: { ...CAMERA_VECTOR_SCHEMA, description: 'Point the camera looks toward, in local metres; aim ahead around the bend.' },
              rollDeg: { type: 'number', minimum: -35, maximum: 35, description: 'Bank after aiming. cinematic requires 0 at every key; fpv allows −35 through 35 degrees.' },
              label: { type: 'string', minLength: 1, description: 'English landmark label used in the generated camera prompt.' }
            } }
          },
          proxies: {
            type: 'array', minItems: 1, description: 'Landmarks and occluders for the previz. May be omitted while drafting, but required by drone-previz.js before rendering. Uses previz-contract.js.',
            items: { type: 'object', additionalProperties: true, required: ['name', 'kind', 'keys'], properties: {
              name: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,31}$', description: 'Unique proxy identifier.' },
              kind: { type: 'string', enum: ['person','box','cylinder','sphere','car'], description: 'box needs size; person needs height; cylinder needs radius and height; sphere needs radius; car size is optional.' },
              color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'One flat colour per proxy; omit for grey.' },
              size: { ...CAMERA_VECTOR_SCHEMA, items: { type: 'number', exclusiveMinimum: 0 }, description: 'Positive dimensions [width, depth, height] in metres.' },
              height: { type: 'number', exclusiveMinimum: 0, description: 'Proxy height in metres.' },
              radius: { type: 'number', exclusiveMinimum: 0, description: 'Cylinder or sphere radius in metres.' },
              keys: { type: 'array', minItems: 1, description: 'Proxy poses at 1-based frames; a static landmark uses one key.', items: { type: 'object', additionalProperties: true, required: ['frame','position'], properties: {
                frame: { type: 'integer', minimum: 1, description: '1-based previz frame at 24 fps; a static proxy uses frame 1.' },
                position: CAMERA_VECTOR_SCHEMA, rotationZDeg: { type: 'number', description: 'Proxy rotation around world Z, in degrees.' }
              } } }
            } }
          }
        }
      }
    },
    allOf: [
      { if: { required: ['preset'], properties: { preset: { const: 'drone-flythrough' } } }, then: { required: ['variant','trajectory'] } },
      { if: { required: ['variant'], properties: { variant: { const: 'cinematic' } } }, then: { properties: { trajectory: { properties: { keys: { items: { properties: { rollDeg: { const: 0 } } } } } } } } },
      { if: { required: ['trajectory'] }, then: { required: ['preset'] } },
      { if: { required: ['variant'] }, then: { required: ['preset'] } }
    ]
  };
  function cameraInputErrors(camera) {
    if (!camera || typeof camera !== 'object' || Array.isArray(camera)) return ['camera must be an object'];
    const errors = [];
    for (const slot of CAMERA_SLOTS) if (camera[slot] !== undefined && typeof camera[slot] !== 'string') errors.push(slot + ' must be text');
    if (camera.preset !== undefined && !Object.keys(CAMERA_PRESETS).includes(camera.preset)) errors.push('unknown camera preset');
    if (camera.variant !== undefined && !Object.keys(CAMERA_PRESETS['drone-flythrough'].variants).includes(camera.variant)) errors.push('unknown drone variant');
    if ((camera.variant !== undefined || camera.trajectory !== undefined) && !isDrone(camera)) errors.push('variant and trajectory require preset drone-flythrough');
    return errors.concat(droneErrors(camera));
  }
  const isDrone = camera => camera?.preset === 'drone-flythrough';
  const vec3 = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  function droneErrors(camera) {
    if (!isDrone(camera)) return camera?.trajectory ? ['trajectory requires preset drone-flythrough'] : [];
    const e = [], t = camera.trajectory;
    if (!CAMERA_PRESETS['drone-flythrough'].variants[camera.variant]) e.push('drone variant must be cinematic or fpv');
    if (!t || t.coordinateSpace !== 'local-meters') return e.concat('drone trajectory needs local-meters coordinates (Z up)');
    if (!Number.isInteger(t.seconds) || t.seconds < 2 || t.seconds > 30) e.push('drone trajectory.seconds must be 2–30 whole billed seconds');
    if (!Number.isFinite(t.lensMm) || t.lensMm < 12 || t.lensMm > 50) e.push('drone lensMm must be 12–50');
    if (!Array.isArray(t.keys) || t.keys.length < 2 || t.keys.length > 32) return e.concat('drone trajectory needs 2–32 ordered keys');
    t.keys.forEach((k, i) => {
      if (!k || !Number.isFinite(k.at) || k.at < 0 || k.at > t.seconds || (i && k.at <= t.keys[i - 1]?.at)) e.push('drone key times must be finite, increasing and inside seconds');
      if (!vec3(k?.position) || !vec3(k?.target)) e.push('drone key needs position and target [x,y,z]');
      else {
        if (k.position.every((v, j) => v === k.target[j])) e.push('drone target must differ from position');
        if (Math.hypot(k.position[0]-k.target[0], k.position[1]-k.target[1]) < .01) e.push('drone target must not point vertically (unstable horizon)');
        if (i && vec3(t.keys[i-1]?.position) && k.position.every((v,j) => v === t.keys[i-1].position[j])) e.push('drone consecutive positions must move');
      }
      if (!Number.isFinite(k?.rollDeg) || Math.abs(k.rollDeg) > (camera.variant === 'cinematic' ? 0 : 35)) e.push('drone rollDeg must be 0 for cinematic, or within ±35 for fpv');
      if (!text(k?.label)) e.push('drone keys need English landmark labels for framing and prompts');
    });
    if (t.keys[0]?.at !== 0 || t.keys[t.keys.length-1]?.at !== t.seconds) e.push('drone keys must cover 0 through trajectory.seconds');
    return e;
  }
  // Cubic Hermite interpolation with time-aware shared tangents: a waypoint is not a stop.
  function droneSample(camera, at) {
    const keys = camera.trajectory.keys;
    let i = 0;
    while (i < keys.length - 2 && at > keys[i+1].at) i++;
    const a = keys[i], b = keys[i+1], dt = b.at-a.at, u = Math.max(0, Math.min(1, (at-a.at)/dt));
    const tangent = (j, f, axis) => {
      const lo = keys[Math.max(0,j-1)], hi = keys[Math.min(keys.length-1,j+1)];
      return (hi[f][axis]-lo[f][axis])/(hi.at-lo.at);
    };
    const out = {};
    for (const f of ['position','target']) out[f] = a[f].map((v,j) =>
      (2*u**3-3*u*u+1)*v + (u**3-2*u*u+u)*dt*tangent(i,f,j) +
      (-2*u**3+3*u*u)*b[f][j] + (u**3-u*u)*dt*tangent(i+1,f,j));
    out.rollDeg = a.rollDeg + (b.rollDeg-a.rollDeg)*(u*u*(3-2*u));
    return out;
  }
  function droneSlots(camera) {
    const e = droneErrors(camera); if (e.length) throw new Error(e.join('; '));
    const t=camera.trajectory, keys=t.keys, at=v=>v.map(n=>Number(n.toFixed(2))).join(', ');
    return {
      movement: 'drone fly-through following ' + keys.map(k=>k.label + ' at (' + at(k.position) + ') metres looking toward (' + at(k.target) + ') with bank ' + k.rollDeg + ' degrees').join(' then ') +
        (camera.variant==='fpv' ? '; bank with the planned turns' : '; keep a level horizon'),
      speed: 'steady forward travel with continuous waypoint transitions',
      framing: 'Wide aerial view toward ' + keys[0].label + '; camera at (' + at(keys[0].position) + ') metres, looking at (' + at(keys[0].target) + '), ' + t.lensMm + ' mm lens',
      end: 'Arrive at ' + keys[keys.length-1].label + '; camera at (' + at(keys[keys.length-1].position) + ') metres, looking at (' + at(keys[keys.length-1].target) + ')'
    };
  }
  function droneBinding(camera) {
    // Exact plan binding, not a claim that the rendered bytes contain this motion.
    return JSON.stringify({ preset:camera.preset, variant:camera.variant, trajectory:camera.trajectory });
  }
  function droneCameraKeys(camera, fps=24) {
    const e=droneErrors(camera); if(e.length) throw new Error(e.join('; '));
    if (!Number.isInteger(fps) || fps<24 || fps>60) throw new Error('drone fps must be 24–60');
    const last=camera.trajectory.seconds*fps, stride=Math.ceil(last/480), frames=[];
    for(let frame=1;frame<last;frame+=stride) frames.push(frame);
    frames.push(last);
    return { lensMm:camera.trajectory.lensMm, keys:frames.map(frame=>{
      const s=droneSample(camera,(frame-1)/(last-1)*camera.trajectory.seconds);
      if (Math.hypot(s.position[0]-s.target[0],s.position[1]-s.target[1])<.01) throw new Error('drone spline crosses a vertical or coincident target; adjust waypoints');
      return {frame,...s};
    }) };
  }
  function droneSceneErrors(scene, {draft=false}={}) {
    const c=scene.visual?.camera;
    if (!isDrone(c)) return droneErrors(c);
    const e=droneErrors(c), r=scene.shot?.render, d=scene.shot?.videoDesign;
    if (r?.mode!=='generated_video' || !['place','live_action'].includes(r?.purpose)) e.push('drone-flythrough requires generated_video with purpose place or live_action');
    if (r?.motionEssential!==true || !text(r?.whyNotStill)) e.push('drone-flythrough needs motionEssential and whyNotStill, including in full_video');
    if (d?.motion?.kind!=='spatial_reveal' || !text(d.motion.visibleChange) || !text(d.motion.reason)) e.push('drone-flythrough needs a justified spatial_reveal with visibleChange');
    if (['arcade','papercut','inkwash'].includes(d?.look)) e.push('drone-flythrough needs a volumetric look; flat arcade, paper-cutout and ink-wash are incompatible');
    if (!e.length) {
      const slots=droneSlots(c);
      for(const k of CAMERA_SLOTS) if(c[k]!==slots[k]) e.push('drone visual.camera.'+k+' is stale; regenerate it from the trajectory');
      if (!draft) {
        const p=scene.visual?.video?.previz;
        if (p?.camera?.trajectoryBinding!==droneBinding(c)) e.push('drone previz trajectoryBinding is missing or stale; rebuild the previz');
        if (p?.seconds!==c.trajectory.seconds) e.push('drone previz seconds differ from trajectory.seconds');
        if (Number.isFinite(scene.duration) && scene.duration>c.trajectory.seconds) e.push('drone clip is shorter than its scene');
      }
    }
    return e;
  }

  const NEUTERED = /\b(?:very|extremely|almost|ever so)\s+(?:slow|slight|small|subtle|gentle)|\b(?:barely|hardly|imperceptibl[ey]|subtle|subtly|tiny|minimal|micro|slight|slightly|gentle|gently|restrained|quiet)\b|\bhold(?:ing)?\s+(?:the\s+)?(?:composition|frame|shot)\b|\block(?:ed)?[- ]off\b|\bbreathing only\b/i;
  const WIDE = /\b(?:wide|establishing|extreme long|long shot|full[- ]body figures|small figures)\b/i;
  // The move families a generated shot may declare, in the vendor's words (video-model-selection
  // §Camera), and what each one has to bring with it (directing-grammar §4, film-directing course
  // L13 pan·tilt · L14 dolly·truck·tracking · L15 dolly zoom, 2026-08-28 ~ 08-30). `movement` opens
  // with the move; a trailing description ("dolly in toward the gate") is allowed, a speed word is not.
  const MOVES = [
    { key: 'static', family: 'static', re: /^(?:static|fixed|locked(?:[- ]off)?)(?:\s+camera)?\b/i },
    { key: 'dolly zoom', family: 'dollyzoom', re: /^dolly zoom(?:\s+(in|out))?\b/i },
    { key: 'dolly', family: 'travel', re: /^dolly (?:in|out)\b/i },
    { key: 'zoom', family: 'lens', re: /^zoom (?:in|out)\b/i },
    { key: 'whip pan', family: 'whip', re: /^whip pan\b/i },
    { key: 'pan', family: 'rotate', re: /^pan(?:\s+(?:left|right))?\b/i },
    { key: 'tilt', family: 'rotate', re: /^tilt (?:up|down)\b/i },
    { key: 'truck', family: 'travel', re: /^truck(?:\s+(?:left|right))?\b/i },
    { key: 'pedestal', family: 'height', re: /^pedestal (?:up|down)\b/i },
    { key: 'crane', family: 'height', re: /^crane (?:up|down)\b/i },
    // arc and tracking hold one framing while the world moves past — no A/B rule, no hold phrase.
    { key: 'arc shot', family: 'follow', re: /^arc shot\b/i },
    { key: 'tracking', family: 'follow', re: /^tracking\b/i },
    { key: 'handheld', family: 'viewpoint', re: /^(?:handheld|shaky cam)\b/i },
    { key: 'aerial', family: 'aerial', re: /^(?:aerial|drone)\b/i },
  ];
  const MOVE_WORDS = 'static, dolly in/out, zoom in/out, dolly zoom in/out, pan left/right, tilt up/down, whip pan, truck left/right, pedestal up/down, crane up/down, arc shot, tracking, handheld, aerial';
  // What practitioners say → the word the engines were shown (Veo: 0 hits for push, orbit, boom).
  const SYNONYMS = [
    [/\bpush(?:ing)?[ -]?in\b/i, 'dolly in'], [/\bpull[ -]?(?:back|out)\b/i, 'dolly out'],
    [/\borbit(?:ing)?\b/i, 'arc shot'], [/\bboom (?:up|down)\b/i, 'pedestal up/down'], [/\bcrab\b/i, 'truck left/right'],
    [/\b(?:zolly|vertigo(?: effect)?|contra[- ]zoom|trombone shot)\b/i, 'dolly zoom in/out'], [/\bswish pan\b/i, 'whip pan'],
    [/팬|패닝/, 'pan left/right'], [/틸트/, 'tilt up/down'], [/달리/, 'dolly in/out'], [/트럭/, 'truck left/right'],
    [/트래킹|따라가/, 'tracking'], [/휩|스윕/, 'whip pan'], [/페데스탈|붐/, 'pedestal up/down'],
  ];
  const moveOf = camera => MOVES.find(m => m.re.test(String(camera?.movement || '').trim())) || null;
  // Moves that travel from one picture to another — the ones that carry a hold on each end.
  const TRAVELS = ['rotate', 'travel', 'height', 'lens', 'dollyzoom'];
  const travels = camera => { const m = moveOf(camera); return !!m && TRAVELS.includes(m.family); };
  function moveErrors(scene) {
    const v = scene.visual || {}, camera = v.camera || {}, errors = [];
    if (isDrone(camera) || !text(camera.movement)) return errors;
    const written = String(camera.movement).trim();
    // "slow dolly in" is a move with its pace in the wrong slot — read the move past the pace word.
    const pace = /^(?:very\s+)?(?:slow|steady|fast|quick|rapid)(?:ly)?\s+/i.exec(written);
    const movement = pace ? written.slice(pace[0].length) : written, move = moveOf({ movement });
    if (pace) errors.push(`visual.camera.movement "${written}" carries the pace — the pace lives in visual.camera.speed; write "${movement}"`);
    if (!move) {
      const hint = SYNONYMS.find(([re]) => re.test(movement));
      errors.push(`visual.camera.movement "${written}" is not a vendor move` +
        (hint ? ` — write "${hint[1]}"` : ` — open with one of ${MOVE_WORDS}`) + ' (directing-grammar §4)');
      return errors;
    }
    // L13 — a pan is a sentence from A to B, not a look around: the two ends name different pictures.
    if (travels({ movement }) && text(camera.framing) && text(camera.end) && normalize(camera.framing) === normalize(camera.end))
      errors.push(`a ${move.key} that starts and ends on "${camera.framing}" has nowhere to go — write what the camera settles on in visual.camera.end, or choose static`);
    // L13 — a whip pan lands only on a sound; without one it is a smear the edit cannot hide.
    if (move.family === 'whip' && !text(scene.sound?.sfx) && !text(v.audio))
      errors.push('a whip pan lands on a sound — write the hit in sound.sfx (or the whoosh in visual.audio) on this shot');
    // L15 — a dolly zoom happens to the background, on a subject who stands still, in one direction.
    if (move.family === 'dollyzoom') {
      if (!/^dolly zoom (?:in|out)\b/i.test(movement))
        errors.push('a dolly zoom names its direction — "dolly zoom in" (camera in, lens out: the world backs away, isolation) or "dolly zoom out" (camera out, lens in: the background closes in, cornered)');
      const depth = scene.shot?.depth;
      if (depth?.mode !== 'deep' || !Array.isArray(depth.planes) || depth.planes.length < 2)
        errors.push('a dolly zoom is something that happens to the background — write shot.depth deep with the planes that stretch (a corridor, columns, a row of cars); in front of a plain wall nothing happens');
      const travel = scene.shot?.composition?.movement;
      if (travel && travel !== 'stationary')
        errors.push(`a dolly zoom holds the subject's size, so the subject stands still — shot.composition.movement is "${travel}"`);
    }
    return errors;
  }
  function cameraWarnings(scene) {
    const camera = scene.visual?.camera || {}, move = moveOf(camera), warnings = [], d = scene.duration;
    if (!move || isDrone(camera)) return warnings;
    if (move.family === 'dollyzoom' && Number.isFinite(d) && d > 5)
      warnings.push(`a dolly zoom is one hit, 3–5 s (directing-grammar §5); this cut runs ${d} s — the viewer sees the trick before the feeling lands`);
    if (move.family === 'whip' && Number.isFinite(d) && d > 4)
      warnings.push(`a whip pan is a transition, 3–4 s (directing-grammar §5); this cut runs ${d} s`);
    if (move.family === 'rotate' && /\bfast\b/i.test(String(camera.speed || '')))
      warnings.push(`a fast ${move.key} strobes at 24 fps when the background holds vertical lines (posts, window frames); if it reads broken, widen the framing and come closer rather than slowing down (L13)`);
    return warnings;
  }
  // L15 — the trick is spent once: the second time the audience watches the camera, not the person.
  // Takes the whole board so the numbers it prints are board shot numbers.
  function episodeMoveErrors(scenes) {
    const at = (scenes || []).map((s, i) => eligible(s) && !reused(s) && s.visual?.video && moveOf(s.visual?.camera)?.family === 'dollyzoom' ? i + 1 : 0).filter(Boolean);
    return at.length > 1 ? [`[dolly-zoom-twice] shots ${at.join(', ')} each ask for a dolly zoom — it is spent once per episode (directing-grammar §4); keep the shot where the world turns over, and write another move on the rest`] : [];
  }
  function cameraErrors(scene) {
    const v = scene.visual || {}, camera = v.camera || {}, errors = droneSceneErrors(scene);
    const span = [camera.movement, camera.speed].filter(text).join(' ');
    const hit = NEUTERED.exec(span);
    if (hit) errors.push(`visual.camera asks for a move the viewer cannot see ("${hit[0]}"); write a visible move at slow, steady or fast, or choose static`);
    if (v.video?.cameraFixed === true && !staticCamera(camera))
      errors.push(`visual.video.cameraFixed locks the provider camera while visual.camera.movement is "${camera.movement}"; drop cameraFixed or write static`);
    return errors.concat(moveErrors(scene));
  }
  // The final state is written once: the last motion beat on an acted shot, videoDesign.after otherwise.
  function finalState(design) {
    const beats = design?.motion?.kind === 'subject_action' ? design.motion.beats : null;
    return Array.isArray(beats) && beats.length ? beats[beats.length - 1]?.state : design?.after;
  }
  const STYLES = {
    'cinematic-miniature': { label: '시네마틱 미니어처 디오라마', looks: ['miniature', 'architectural'],
      prompt: 'Cinematic miniature diorama, tactile matte handcrafted surfaces, articulated miniature figures, coherent scale and soft contact shadows.' },
    'photoreal': { label: '완전 실사풍', looks: ['realistic'],
      prompt: 'Photoreal live-action cinematography: life-size human proportions, natural skin and fabric texture, real locations, physically plausible light and photographic lenses; every surface reads as a real material at real scale.' },
    'webtoon': { label: '웹툰풍', looks: ['webtoon'],
      prompt: 'Korean webtoon illustration: consistent expressive character linework, clean contour lines, controlled cel shading, illustrated backgrounds and a coherent drawn palette; skin and cloth are drawn, and the frame is one unbroken picture.' },
    // Added 2026-09-08 from the Shorts style survey (docs/research/2026-09-08-shorts-visual-styles).
    // Named studios and living artists stay out of every prompt: the image lane refuses them.
    'claymation': { label: '클레이 스톱모션', looks: ['clay'],
      prompt: 'Stop-motion claymation: matte plasticine figures and sets with visible thumbprints and slight surface imperfections, chunky simplified forms, handcrafted miniature props, warm tactile studio light and soft contact shadows; the whole frame is one sculpted scene photographed on a set.' },
    'paper-cutout': { label: '종이 컷아웃 디오라마', looks: ['papercut'],
      prompt: 'Layered paper-cut diorama: every figure, prop and backdrop is a flat cut-paper shape with visible fibre edges, stacked in separated depth layers with soft cast shadows between the layers, a muted paper palette, simple readable silhouettes and a shallow theatre-stage depth.' },
    'ink-wash': { label: '수묵화', looks: ['inkwash'],
      prompt: 'East Asian ink-wash painting: confident brushed black ink lines with wet-on-wet grey gradients on pale rice-paper texture, generous empty space, one restrained mineral accent colour, figures and places drawn in calligraphic strokes; the frame stays one painted picture.' },
    'toon-3d': { label: '3D 카툰 캐릭터', looks: ['toon3d'],
      prompt: 'Stylised 3D cartoon animation: appealing characters with large expressive eyes and simplified rounded proportions, soft subsurface skin, clean material shaders on props and sets, warm rim light and cinematic depth of field, rendered like a feature-animation frame.' },
    // Added 2026-09-09 from a user reference: a 1990s hand-painted arcade fighting/action game frame.
    // The game HUD (health bars, portraits, player names) is not part of the generated picture:
    // the image lane garbles lettering, generated video warps a static overlay, and nothing is drawn over video.
    'arcade-2d': { label: '아케이드 게임 화면', looks: ['arcade'],
      prompt: 'Hand-painted 1990s arcade game art: characters as large painted sprites with bold dark outlines, exaggerated heroic proportions and saturated colours with hard cel highlights, staged side-on in front of layered parallax backgrounds (painted foreground props, a mid-ground set, a distant painted backdrop), slightly grainy CRT-era colour and a wide stage read; the whole frame is one painted game scene and the picture holds only the stage and its characters, every frame edge kept as painted scenery.' }
  };
  // Only the miniature presets carry a bundled reference pack; every other preset is prompt-only.
  const packPresets = ['cinematic-miniature', 'spatial-explainer'];
  const ALL_LOOKS = ['archive', ...new Set(Object.values(STYLES).flatMap(s => s.looks))];
  // A shot may leave the episode style when the author judges the picture needs another preset —
  // only after the user approved that shot in HITL (visual-style.md §Per-shot style). The record is
  // shot.style: { preset, reason, selection: { kind: 'user', reference } }, optionally its own
  // materials / palette / lighting; everything it leaves out falls back to PRODUCTION.style.
  const SHOT_STYLE_KEYS = ['preset', 'reason', 'selection', 'materials', 'palette', 'lighting'];
  function shotStyle(win, index) {
    const base = win.PRODUCTION?.style || {}, o = win.SCENES?.[index]?.shot?.style;
    if (!o || typeof o !== 'object' || !text(o.preset)) return { ...base, override: false };
    const own = Object.fromEntries(['materials', 'palette', 'lighting'].filter(k => text(o[k])).map(k => [k, o[k]]));
    return { ...base, ...own, preset: o.preset, override: true, reason: o.reason, selection: o.selection };
  }
  function shotStyleErrors(scene, index) {
    const o = scene?.shot?.style, tag = '[shot-style] shot ' + (index + 1) + ': ';
    if (o === undefined) return [];
    const errors = [];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return [tag + 'shot.style must be an object with preset, reason and selection'];
    if (!STYLES[o.preset]) errors.push(tag + 'shot.style.preset must be one of ' + Object.keys(STYLES).join(', '));
    if (!text(o.reason)) errors.push(tag + 'shot.style.reason states why this picture needs another preset than the episode');
    if (!(o.selection && o.selection.kind === 'user' && text(o.selection.reference)))
      errors.push(tag + 'a per-shot style leaves the episode style only on the user\'s HITL approval; record it in shot.style.selection { kind: "user", reference }');
    Object.keys(o).filter(k => !SHOT_STYLE_KEYS.includes(k)).forEach(k => errors.push(tag + 'shot.style.' + k + ' is not a shot-level field (world and camera language stay episode constants)'));
    return errors;
  }
  // Explicit imported inputs, never inferred from an existing generation output.
  function reused(scene) { return scene.visual?.reuse !== undefined; }
  // The channel's generated-video cap is written snake_case in profile.md and copied into
  // scenes.js, where boards use either spelling — check-scenes normalizeMotionPolicy accepts both
  // and resolves the profile value, so take the caller's normalized number first and read the
  // board in both spellings after it. null means no cap was recorded anywhere.
  function videoCap(win, given) {
    const policy = win.MOTION_POLICY || {};
    const raw = given !== undefined ? given
      : policy.generatedVideoMax !== undefined ? policy.generatedVideoMax : policy.generated_video_max;
    return raw === undefined || raw === null || raw === '' ? null : Number(raw);
  }
  function reuseErrors(scene) {
    if (!reused(scene)) return [];
    const v = scene.visual || {}, r = v.reuse, errors = [];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return ['visual.reuse must be an imported clip record'];
    const local = file => text(file) && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(file) && !/[\t\r\n|]/.test(file);
    if (!local(r.clip) || !/\.(mp4|mov|m4v|webm)$/i.test(r.clip)) errors.push('visual.reuse.clip must be a local, already trimmed file path');
    if (!/^[a-f0-9]{64}$/.test(r.sha256 || '')) errors.push('visual.reuse.sha256 must identify the imported file bytes');
    if (!text(r.sourceEpisode)) errors.push('visual.reuse.sourceEpisode must identify the original generated episode');
    const range = r.sourceRange;
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start ||
        !Number.isFinite(scene.duration) || scene.duration <= 0 || Math.abs(range.end - range.start - scene.duration) > .001)
      errors.push('visual.reuse.sourceRange must give original start/end seconds spanning exactly scene.duration');
    if (v.video !== undefined || v.clip !== undefined || v.source !== undefined || v.slide !== undefined || v.renderedFile !== undefined ||
        v.engine !== undefined || v.prompt !== undefined || v.bgPrompt !== undefined || v.bg !== undefined || ['broll', 'quote', 'outro'].includes(scene.type))
      errors.push('A reused clip cannot also declare a generation, recording, slide or alternate file handoff');
    if (v.picture !== 'ai-video' || v.overlay !== 'none') errors.push('Reused generated clips keep picture:ai-video and overlay:none');
    if (scene.title || scene.stat || (scene.bullets || []).length || scene.footnote)
      errors.push('Reused video allows subtitles only; clear title, stat, bullets and footnote');
    if (scene.shot?.render?.mode !== 'generated_video' || scene.shot?.render?.purpose !== 'live_action' ||
        scene.shot?.render?.motionEssential !== true || !text(scene.shot?.render?.whyNotStill) || !text(scene.shot?.render?.action) || !text(v.why))
      errors.push('Reused video needs essential live_action with action, whyNotStill and visual.why');
    errors.push(...motionErrors(scene));
    return errors;
  }
  // A supplied file — the user's recording, or a free stock clip (visual.source "stock" with a
  // clip path) — is never a generated shot; a stock photograph may still feed a generated cut.
  function eligible(scene) {
    const v = scene.visual || {};
    return scene.type !== 'outro' && !(!reused(scene) && !v.video &&
      (['recording', 'screencast'].includes(v.source) || v.picture === 'recording' ||
       (v.source === 'stock' && typeof v.clip === 'string')));
  }
  function full(production) { return production?.mode === 'full_video'; }
  // Outputs and approval metadata must not invalidate their own input signature.
  function signature(win) {
    const p = win.PRODUCTION || {};
    return JSON.stringify({ format: win.FORMAT, mode: p.mode, imageProvider: p.imageProvider, videoProvider: p.videoProvider, videoBudgetUsd: p.videoBudgetUsd,
      maxAttempts: p.maxAttempts, generationRevision: p.generationRevision, comparison: p.comparison, style: p.style, cast: p.cast,
      scenes: (win.SCENES || []).filter(eligible).map(s => {
        const v = s.visual || {}, video = { ...v.video };
        delete video.clip;
        return { type: s.type, duration: s.duration, narration: s.narration,
          ...(reused(s) ? { reuse: v.reuse } : {}),
          render: s.shot?.render, design: s.shot?.videoDesign, cutType: s.shot?.cutType,
          frames: v.frames, imagePair: v.imagePair, styleRole: v.styleRole, stylePack: v.stylePack,
          bg: v.bg, bgPrompt: v.bgPrompt, camera: v.camera, action: v.action, video, engine: v.engine,
          prompt: v.prompt, clip: typeof v.clip === 'object' ? v.clip : undefined,
          source: v.source, license: v.license, file: typeof v.clip === 'string' ? v.clip : undefined };
      }) });
  }
  function motionErrors(scene) {
    const d = scene.shot?.videoDesign || {}, m = d.motion, errors = [];
    if (!m || !['subject_action', 'spatial_reveal', 'archive_hold'].includes(m.kind))
      return ['videoDesign.motion.kind must be subject_action, spatial_reveal or archive_hold'];
    for (const key of ['subject', 'visibleChange'])
      if (!text(m[key])) errors.push('videoDesign.motion.' + key + ' is required');
    if (m.kind === 'archive_hold' && d.look !== 'archive') errors.push('archive_hold is only for archival evidence');
    if (m.kind !== 'subject_action' && !text(m.reason)) errors.push('Camera-only or archival shots need an explicit motion.reason');
    if (['character', 'interaction'].includes(scene.visual?.styleRole) && d.look !== 'archive' && m.kind !== 'subject_action')
      errors.push('Character and interaction shots require subject_action, not a camera-only reveal');
    if (m.kind === 'subject_action') {
      const beats = m.beats;
      if (!Array.isArray(beats) || beats.length < 2 || beats.some(b => !b || !Number.isFinite(b.at) || b.at < 0 || b.at > scene.duration || !text(b.state)) ||
          beats.some((b, i) => i && b.at <= beats[i - 1].at) || new Set(beats.map(b => b.state?.trim())).size < 2)
        errors.push('Subject action needs distinct, ordered motion.beats with seconds and visible states within the shot');
      else if (text(d.after) && normalize(d.after) !== normalize(beats[beats.length - 1].state))
        errors.push('videoDesign.after must be the last motion beat, written once; drop after or make the two identical');
      const directions = [d.action, d.continuity, scene.visual?.video?.prompt].join(' ');
      if (/keep (?:every|all) (?:person|people|characters?).{0,40}fixed|(?:people|women|characters?) (?:and door )?(?:stay|remain) fixed|only (?:very )?(?:small|subtle) (?:natural )?breathing|no new text, objects or actions/i.test(directions))
        errors.push('Subject action contradicts a global freeze or breathing-only instruction');
    }
    return errors;
  }
  function check(win, { requireSelection = false, requireApproval = false, draft = false, generatedVideoMax } = {}) {
    const p = win.PRODUCTION, errors = Array.from(win.SCENES || []).flatMap((s, i) => reuseErrors(s).map(e => `shot ${i + 1}: ${e}`));
    if (!p) return requireSelection || (win.SCENES || []).some(reused)
      ? errors.concat(['Choose a production mode with a four-option cost comparison before generation']) : errors;
    if (!MODES[p.mode]) errors.push('PRODUCTION.mode must be full_video, video_50, video_30, hook_only, or stills_only where the channel generated-video cap is 0 (hybrid is legacy)');
    // host = the CLI's own media tool (image_gen on Codex and Grok, image_to_video on Grok); absent reads as api.
    for (const key of ['imageProvider', 'videoProvider'])
      if (p[key] !== undefined && !['host', 'api'].includes(p[key])) errors.push('PRODUCTION.' + key + ' must be host or api');
    if (!Number.isFinite(p.videoBudgetUsd) || p.videoBudgetUsd < 0)
      errors.push('PRODUCTION.videoBudgetUsd must be a finite nonnegative episode cap');
    if (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1 || p.maxAttempts > 5)
      errors.push('PRODUCTION.maxAttempts must be 1–5 total attempts per clip (including the first)');
    // stills_only buys no generated video, so there is no cost quote to fingerprint and nothing
    // for the user to approve; the four-option comparison never ran. Every other mode carries one.
    if (requireApproval && p.mode !== 'stills_only' && (!p.approval || !['user', 'standing'].includes(p.approval.kind) ||
        !text(p.approval.reference) || !Number.isFinite(Date.parse(p.approval.at)) || !text(p.approval.quoteFingerprint)))
      errors.push('PRODUCTION.approval needs kind, reference, at and the approved cost quoteFingerprint');
    // The visual style is asked before authoring in every production mode (visual-style.md,
    // user directive 2026-09-06): a board without the preset stops here, not only under full_video.
    // spatial-explainer is accepted for boards that predate the presets.
    const chosen = p.style?.preset;
    if (!chosen) errors.push('Choose an episode visual style (PRODUCTION.style.preset) before authoring; every production mode carries one');
    else if (chosen !== 'spatial-explainer' && !STYLES[chosen]) errors.push('Unknown PRODUCTION.style.preset');
    if (STYLES[chosen] && (!['user', 'standing'].includes(p.style.selection?.kind) ||
        !text(p.style.selection?.reference))) errors.push('Record the actual style HITL choice in PRODUCTION.style.selection');
    if (STYLES[chosen] && !packPresets.includes(chosen) && p.style.referencePack)
      errors.push('Only cinematic-miniature carries the miniature reference pack; drop referencePack for ' + chosen);
    if (p.cast !== undefined) {
      if (!p.cast || typeof p.cast !== 'object' || Array.isArray(p.cast)) errors.push('[cast-sheet] PRODUCTION.cast must be an object keyed by character id');
      else Object.entries(p.cast).forEach(([id, entry]) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push('[cast-sheet] PRODUCTION.cast.' + id + ' must be an object with name and sheet');
          return;
        }
        if (!text(entry.name)) errors.push('[cast-sheet] PRODUCTION.cast.' + id + '.name is required');
        if (!text(entry.sheet)) errors.push('[cast-sheet] PRODUCTION.cast.' + id + '.sheet is required');
        if (entry.image !== undefined && (!text(entry.image) || /^[a-z][a-z0-9+.-]*:|^\/|^\\|(?:^|[\\/])\.\.(?:[\\/]|$)|[\t\r\n|]/i.test(entry.image)))
          errors.push('[cast-sheet] PRODUCTION.cast.' + id + '.image must be a relative path beside scenes.js');
      });
    }
    (win.SCENES || []).forEach((scene, i) => {
      if (scene.shot?.cutType !== undefined && !CUT_TYPES.includes(scene.shot.cutType))
        errors.push('[cutType-unknown] shot ' + (i + 1) + ': shot.cutType must be one of ' + CUT_TYPES.join(', '));
      shotStyleErrors(scene, i).forEach(e => errors.push(e));
    });
    if (draft) return errors; // Shot assets/designs are authored after the narration-only draft.
    (win.SCENES || []).forEach((s, i) => {
      if (eligible(s) && !reused(s) && s.visual?.video) cameraErrors(s).forEach(e => errors.push('shot ' + (i + 1) + ': ' + e));
    });
    episodeMoveErrors(win.SCENES || []).forEach(e => errors.push(e));
    // A generated cut exists → the previz renderer and the video model were put to the user
    // (blender-previz.md §6, production-mode.md §When to ask). Nothing renders or bills before that.
    const generatedCuts = (win.SCENES || []).filter(s => eligible(s) && !reused(s) && s.visual?.video && s.shot?.render?.mode === 'generated_video');
    if (generatedCuts.length) {
      // spatial-prompts.js assembles every source and motion prompt from these six fields.
      for (const key of ['reference', 'world', 'materials', 'palette', 'lighting', 'camera'])
        if (!text(p.style?.[key])) errors.push('PRODUCTION.style.' + key + ' is required once a generated cut exists');
      if (!PREVIZ_RENDERERS[p.previz?.renderer]) errors.push('Ask which 3D previz renderer draws the generated cuts and record it in PRODUCTION.previz.renderer (blender | threejs)');
      else if (!selectionRecorded(p.previz.selection)) errors.push('Record the actual previz renderer HITL choice in PRODUCTION.previz.selection');
      const vm = p.videoModel;
      if (p.videoProvider === 'host') {
        if (vm && vm.model !== 'host') errors.push('PRODUCTION.videoModel.model must be host under videoProvider host');
      } else if (!vm || !text(vm.model)) errors.push('Ask which video model makes the generated cuts and record it in PRODUCTION.videoModel (an episode default or mixed; each cut records its model and resolution)');
      if (vm && vm.model !== 'host' && !selectionRecorded(vm.selection)) errors.push('Record the actual video model HITL choice in PRODUCTION.videoModel.selection');
    }
    errors.push(...coverageErrors(win));
    if (!full(p)) {
      const count = (win.SCENES || []).filter(s => eligible(s) &&
        (s.visual?.video || s.type === 'broll' || (s.type === 'quote' && typeof s.visual?.clip === 'object'))).length;
      if (p.mode === 'hybrid' && ((count < 1 && !(win.SCENES || []).some(reused)) || count > 2)) errors.push('hybrid needs 1–2 generated clips or at least one reused clip with zero generation; revise conflicting channel constraints before production');
      // stills_only holds only while the channel cap stays 0, and only while no shot carries a clip —
      // otherwise the board is buying video under a contract that says it buys none.
      if (p.mode === 'stills_only') {
        const cap = videoCap(win, generatedVideoMax);
        if (cap === null)
          errors.push('stills_only needs the channel cap on the board: copy the profile policy into window.MOTION_POLICY with generated_video_max 0 (generatedVideoMax is read too)');
        else if (cap !== 0)
          errors.push('stills_only is for a channel whose generated_video_max is 0; choose a cost mode from the four-option comparison instead');
        if (count) errors.push('stills_only carries no generated clip; ' + count + ' shot(s) hold one — drop them or choose a cost mode');
        // An imported clip already has its own zero-generation shape under legacy hybrid, so the two
        // contracts stay disjoint: stills_only is the board that plays no video at all.
        const imported = (win.SCENES || []).filter(reused).length;
        if (imported) errors.push('stills_only plays no video at all; ' + imported + ' shot(s) import one (visual.reuse) — drop them or use the reuse shape');
      }
      return errors;
    }
    const style = p.style || {};
    if (!generatedCuts.length)
      for (const key of ['reference', 'world', 'materials', 'palette', 'lighting', 'camera'])
        if (!text(style[key])) errors.push('PRODUCTION.style.' + key + ' is required');
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s) || reused(s)) return;
      const v = s.visual || {}, design = s.shot?.videoDesign || {};
      const bad = message => errors.push('shot ' + (i + 1) + ': ' + message);
      if (s.shot?.render?.mode !== 'generated_video' || !v.video || v.slide || (v.source && v.source !== 'stock') || v.clip)
        bad('full_video needs a narrated visual.video handoff; no slide/still substitution or b-roll splice');
      if (['broll', 'quote'].includes(s.type)) bad('full_video generated cuts use ordinary narrated cards');
      // A stock photograph (visual.source "stock") is a supplied source image: a license record, no prompt.
      if (!text(v.bg) || (!text(v.bgPrompt) && v.source !== 'stock')) bad('keep a source image path and its generation prompt');
      if (!text(v.video?.prompt)) bad('store the motion prompt before generation');
      // The host video tool (owner directive 2026-09-07) tops out at 720p and takes every full_video cut.
      const hostVideo = p.videoProvider === 'host';
      // The API lane renders at the resolution the user chose with the model (PRODUCTION.videoModel); 1080p before that record exists.
      const wantRes = hostVideo ? '720p' : (v.video?.resolution || p.videoModel?.resolution || '1080p');
      if (v.video?.resolution !== wantRes || v.video?.generateAudio !== false)
        bad(hostVideo ? 'the host video tool tops out at 720p; write resolution:"720p" and generateAudio:false with separate narration'
                      : 'write the chosen model\'s resolution (' + wantRes + ') and generateAudio:false with separate narration');
      if (v.video?.engine !== (hostVideo ? 'host' : 'seedance'))
        bad(hostVideo ? 'videoProvider:host routes every full_video cut to engine:"host" (the CLI\'s own image_to_video)'
                      : 'full_video uses the priced Seedance image-to-video route');
      for (const key of ['look', 'worldId', 'before', 'action', 'continuity', 'reject'])
        if (!text(design[key])) bad('videoDesign.' + key + ' is required');
      if (design.motion?.kind !== 'subject_action' && !text(design.after)) bad('videoDesign.after is required unless the last motion beat states the final result');
      if (design.camera !== undefined) bad('videoDesign.camera is retired; the camera lives in the four visual.camera slots');
      for (const slot of missingCameraSlots(v.camera))
        bad('visual.camera.' + slot + ' is required; the motion prompt is assembled from the four slots (speed may stay empty on a static camera)');
      if (!ALL_LOOKS.includes(design.look))
        bad('videoDesign.look must be one of ' + ALL_LOOKS.join(', '));
      const shotPreset = shotStyle(win, i).preset;
      if (STYLES[shotPreset] && design.look !== 'archive' && !STYLES[shotPreset].looks.includes(design.look))
        bad('videoDesign.look conflicts with the selected ' + (shotPreset === style.preset ? 'episode' : 'per-shot') + ' style');
      motionErrors(s).forEach(bad);
      if (!Array.isArray(s.narration) || !s.narration.length) bad('a generated cut needs its approved narration');
      if (s.title || s.stat || (s.bullets || []).length || s.footnote || !['none', undefined].includes(v.overlay))
        bad('only burned subtitles go over full-video footage; clear title, bullets, footnote and overlays');
    });
    // Three identical set-ups in a row read as one long take that keeps restarting. A change of
    // size, angle or move needs a reason, and the reason is the next sentence (full-video.md §Shot plan).
    const run = [];
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s)) return;
      const camera = s.visual?.camera || {}, key = normalize(camera.framing) + '|' + normalize(camera.movement);
      if (run.length && run[run.length - 1].key !== key) run.length = 0;
      run.push({ key, shot: i + 1 });
      if (run.length === 3) errors.push('shots ' + run.map(r => r.shot).join(', ') + ': the same framing and camera move three times in a row; change size, angle or move for a reason');
    });
    // A full-video episode is carried by the camera as much as by the subject. ep411 held a
    // static or slow camera on wide miniature stages for 8 of 15 shots and measured like a
    // slideshow (2026-09-09): the camera moves on at least two of every three shots, never
    // stands still twice in a row, and at least half the shots come closer than wide.
    const generated = (win.SCENES || []).map((s, i) => ({ s, shot: i + 1 })).filter(({ s }) => eligible(s) && !reused(s));
    if (generated.length >= 3) {
      const statics = generated.filter(({ s }) => staticCamera(s.visual?.camera));
      if (statics.length * 3 > generated.length)
        errors.push(`${statics.length} of ${generated.length} shots hold a static camera; a full-video episode moves the camera on at least two of every three shots`);
      generated.forEach(({ s, shot }, k) => {
        if (k && staticCamera(s.visual?.camera) && staticCamera(generated[k - 1].s.visual?.camera))
          errors.push(`shots ${generated[k - 1].shot}, ${shot}: two static cameras in a row; move on one of them`);
      });
      const conventional = generated.filter(({s}) => !isDrone(s.visual?.camera) || droneSceneErrors(s).length);
      const wide = conventional.filter(({ s }) => WIDE.test(String(s.visual?.camera?.framing || '')));
      if (wide.length * 2 > conventional.length)
        errors.push(`${wide.length} of ${conventional.length} shots are framed wide; small figures on a wide stage read as a still on a phone — bring at least half the shots to medium or close`);
    }
    return errors;
  }
  function policy(base, production, scenes) {
    // The episode approval authorizes these two changes only. Keep channel motion floors,
    // voice, format, factual evidence and publishing gates intact.
    if (!production || !MODES[production.mode]) return base;
    return { ...base, videoBudgetUsd: production.videoBudgetUsd,
      // hook_only: the hook plus every imported clip — reuse is outside the count but still a slot.
      generatedVideoMax: production.mode === 'hook_only' ? 1 + scenes.filter(reused).length : RATIOS[production.mode] ? scenes.filter(eligible).length : Math.min(base.generatedVideoMax ?? 2, 2) };
  }
  const api = { CAMERA_INPUT_SCHEMA, cameraInputErrors, CAMERA_PRESETS, isDrone, droneErrors, droneSample, droneSlots, droneBinding, droneCameraKeys, droneSceneErrors, STYLES, MODES, CHOICES, CUT_TYPES, RATIOS, videoCap, newCut, generated, hookScene, coverageErrors, CAMERA_SLOTS, PREVIZ_RENDERERS, VIDEO_MODELS, packPresets, ALL_LOOKS, shotStyle, shotStyleErrors, eligible, reused, reuseErrors, full, signature, check, policy, motionErrors, missingCameraSlots, cameraErrors, cameraWarnings, episodeMoveErrors, moveOf, travels, MOVES, staticCamera, finalState };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PRODUCTION_MODE = api;
})(typeof window === 'object' ? window : globalThis);
