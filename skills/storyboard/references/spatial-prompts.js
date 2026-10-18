#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
const { readScenes } = require('../../autoproduce/references/cost-preview.js');
const { droneSceneErrors, isDrone, full, MODES, STYLES, packPresets, motionErrors, missingCameraSlots, finalState, shotStyle, shotStyleErrors } = require('./production-mode.js');
const { resolveStylePack } = require('./style-pack.js');
const PROMPT = require('./assemble-bg-prompt.js');
const sourceContext = require('./source-context.js');
const { previzHandoff } = require('./render-routing.js');
const { cutTreatment, castLines, defaultStyleRole } = require('./cut-treatments.js');
const { cameraLock } = require('../../_shared/scene-acting.js');
const LOOKS = {
  miniature: 'An architectural exhibition miniature diorama with articulated objects, matte materials, soft contact shadows and restrained fine detail.',
  architectural: 'A precise architectural cutaway model with believable thickness, connected parts, legible spatial relationships and softly lit material surfaces.',
  realistic: 'A physically believable location with natural textures, coherent perspective, detailed stone and foliage, and restrained depth of field.',
  webtoon: 'A coherent drawn webtoon scene with expressive linework, cel shading and illustrated depth.',
  clay: 'A sculpted plasticine scene on a handcrafted set, thumbprinted matte surfaces and warm tactile light.',
  papercut: 'A layered cut-paper diorama with fibre edges, separated depth layers and soft shadows between them.',
  inkwash: 'A brushed ink-wash painting on rice paper with wet grey gradients, empty space and one accent colour.',
  toon3d: 'A stylised 3D cartoon render with rounded appealing characters, clean shaders and cinematic light.',
  arcade: 'A hand-painted 2D arcade game stage with bold-outlined painted sprites, layered parallax backdrops and saturated cel colour.',
  archive: 'A faithful presentation of the supplied archival reference, preserving its composition and marks as source evidence.'
};
const text = value => typeof value === 'string' && !!value.trim();
const clause = value => String(value ?? '').trim().replace(/[.!?\s]*$/, '');
// Missing creative fields are reported as warnings; the prompt is assembled from what exists.
function missing_(fields) {
  return Object.entries(fields).filter(([, value]) => !text(value)).map(([name]) => 'Missing ' + name);
}
/* Beats are ordered by description, never by a clock: Seedance 1.5 Pro shows no timestamps in any
   vendor example and 2.0 self-reports unstable precision timing (scenes-schema §clip prompt). The
   seconds stay in the plan for the playback review, which compares observed states at those times. */
function beatsInWords(beats) {
  return beats.map((b, i) => (i === 0 ? 'At first' : i === beats.length - 1 ? 'Finally' : 'Then') + ', ' + clause(b.state)).join('. ');
}
function motionText(d) {
  if (d.motion?.kind !== 'subject_action') return d.action || '';
  return ['Subject action: ' + clause(d.action), 'Visible change: ' + clause(d.motion.visibleChange),
    ...(Array.isArray(d.motion.beats) && d.motion.beats.length ? [beatsInWords(d.motion.beats)] : []),
    'The articulated subject itself carries this change; ambient motion and the camera move stay secondary'].join('. ');
}
/* The consistency lock is the only place an exclusion can go on Seedance, and the gate wants its
   holding verbs (stays · holds · keeps). The look and the episode camera language ride here so every
   clip of the episode is drawn with one lens and one material world. */
function lockText(d, style, treatment, castLocks) {
  const base = ['The subject stays exactly consistent with the input frame: identity, facial features, clothing design, proportions and materials hold while pose, expression and position change as planned',
    clause(d.continuity), 'Architecture and terrain keep stable geometry throughout', 'The look holds: ' + clause(treatment),
    'The episode camera language holds: ' + clause(style.camera)].join('. ');
  return castLocks?.length ? base + '. ' + castLocks.join(' ') : base;
}
/* The previz binding (blender-previz.md §6.3): on the reference route the motion prompt opens on the
   vendor's clay-model template — the still is the first frame, the clip is the only reference for
   camera and blocking, its look is not to be copied — and names which coloured model is which
   character. clipAssemble puts this in the scene slot, ahead of the camera span. */
function previzPreamble(p) {
  const bindings = (p.actors || []).map(a => 'The ' + clause(a.color) + ' model in Video 1 is ' + clause(a.is) + (a.image ? ' from Image ' + a.image : '') + '.');
  return ['Image 1 is the first frame.',
    'Use Video 1, a 3D clay-model previz, as the only reference for camera movement, shot rhythm, shot-size changes, subject positions, motion trajectory and blocking; strictly keep its camera path, pacing and order of actions.',
    'Do not reference its visual content.', ...bindings].join(' ');
}
/* The source still of a previz cut is edited from the previz's first frame, so the composition the
   clip starts on is the composition the still has (blender-previz.md §6.6). */
const PREVIZ_SOURCE_LOCK = 'Composition lock: the first attached image is frame 1 of the 3D previz, rendered clean (no stamp, no gizmo); it fixes the camera, the framing, and where every subject stands and how large it is in frame; keep that composition exactly and render every surface, figure and light in the episode style described here.';
function characterIds(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(entry => typeof entry === 'string' ? entry : entry?.id)
    .filter(id => typeof id === 'string' && id.trim()))];
}
// LTX takes the source frame, not a Seedance reference clip. Its 2000-character
// request limit applies to the complete prompt; reject overflow without losing action beats.
function astraMotionPrompt(d, camera, style, treatment, externalNarration, castAppearance = [], hasVisibleCast = true) {
  const lock = cameraLock(camera);
  const beats = d.motion?.kind === 'subject_action' ? d.motion.beats : [];
  const states = beats.length ? beatsInWords(beats)
    : 'At first, ' + clause(d.before) + '. Finally, ' + clause(finalState(d));
  const actionInBeats = beats.some(b => clause(b.state) === clause(d.action));
  const sameLanding = clause(camera.end) === clause(finalState(d));
  const prompt = [...(style.preset === 'webtoon' ? [
    'A continuous shot of hand-drawn 2D cel animation. Black ink contours and flat shaded colour planes persist on ' + (hasVisibleCast ? 'visible faces, hands, hair, clothing and the illustrated background' : 'objects and the illustrated environment') + ' in every frame.'
  ] : [treatment]),
    'Camera: ' + [camera.framing, camera.movement, ...(!lock ? [camera.speed] : [])].filter(text).map(clause).join('; ') + '.',
    ...(lock ? [lock] : []),
    ...(!actionInBeats ? ['Action: ' + clause(d.action) + '.'] : []), states + '.',
    ...(!sameLanding ? ['Camera landing: ' + clause(camera.end) + '.'] : []),
    hasVisibleCast ? 'The input image fixes identity, face, costume, proportions, materials and actor screen positions; preserve them while the planned action changes pose and location.'
      : 'The input image fixes object identity, proportions, materials and spatial layout; preserve them while the planned physical changes unfold.',
    ...castAppearance,
    clause(d.continuity) + '.',
    'Episode camera language: ' + clause(style.camera) + '.',
    ...(externalNarration && hasVisibleCast ? ['The characters keep their mouths closed throughout their physical actions.'] : []),
    'Animate through the last frame with stable ' + (hasVisibleCast ? 'anatomy' : 'geometry') + ' and natural contact. No captions, subtitles, lettering, logos or overlays in any frame.'].join(' ');
  if (prompt.length > 2000)
    throw new Error('ASTRA motion prompt exceeds 2000 characters (' + prompt.length + '); shorten the action, motion beats or camera descriptions before generation');
  return prompt;
}
function assemble(win, index, dir) {
  if (!MODES[win.PRODUCTION?.mode]) throw new Error('Choose a production mode before assembling prompts');
  const scene = win.SCENES[index], d = scene?.shot?.videoDesign, v = scene?.visual;
  if (!d || !win.PRODUCTION.style || !LOOKS[d.look]) throw new Error('Choose style and videoDesign before assembling prompts');
  // Throws stay for input that cannot be assembled; creative gaps and conflicts land in `warnings`
  // on the result (automation guidance 2026-10-16) and the prompt is built from the fields that exist.
  const warnings = [];
  if ((scene.narration || []).some(line => line.delivery === 'on_screen') && /never speaks|mouths? (?:stay |remain |kept )?closed|no speech,? no dialogue/i.test(JSON.stringify(d)))
    warnings.push('On-screen dialogue conflicts with a silent-acting instruction in videoDesign; resolve the named speaker action before generating');
  const overrideProblems = shotStyleErrors(scene, index);
  if (overrideProblems.length) throw new Error(overrideProblems.join('; '));
  // The episode style, or the per-shot preset with its own materials/palette/lighting.
  const style = shotStyle(win, index);
  if (!v || typeof v !== 'object') throw new Error('Missing visual');
  if (d.camera !== undefined) throw new Error('videoDesign.camera is retired; the camera lives in the four visual.camera slots');
  const droneProblems = droneSceneErrors(scene, {draft:true});
  if (droneProblems.length) throw new Error(droneProblems.join('; '));
  const isVideo = full(win.PRODUCTION) || !!v.video;
  if (isVideo) warnings.push(...motionErrors(scene));
  const after = finalState(d);
  warnings.push(...missing_({ 'videoDesign.before': d.before, 'videoDesign.action': d.action, 'videoDesign.after (or the last motion beat)': after,
    'videoDesign.continuity': d.continuity, 'style.world': style.world, 'style.materials': style.materials, 'style.palette': style.palette,
    'style.lighting': style.lighting, 'style.camera': style.camera, 'visual.camera.framing': v.camera?.framing }));
  const camera = v.camera || {}, missingSlots = missingCameraSlots(camera);
  if (isVideo && missingSlots.length) warnings.push('Missing ' + missingSlots.map(s => 'visual.camera.' + s).join(', ') + ' (the motion prompt is assembled from the four slots, so none is returned yet)');
  const canvas = win.FORMAT === 'youtube-long-16x9' ? 'Landscape 16:9' : 'Portrait 9:16';
  const preset = style.preset || 'spatial-explainer'; // Resume existing miniature boards.
  if (preset !== 'spatial-explainer' && !STYLES[preset]) throw new Error('Unknown visual style: ' + preset);
  if (STYLES[preset] && d.look !== 'archive' && !STYLES[preset].looks.includes(d.look))
    warnings.push('Shot look conflicts with the ' + (style.override ? 'per-shot' : 'selected') + ' visual style');
  if (STYLES[preset] && !packPresets.includes(preset) && style.referencePack && !style.override)
    warnings.push('Remove the miniature reference pack for this style');
  const treatment = d.look === 'archive' ? LOOKS.archive : (STYLES[preset]?.prompt || LOOKS[d.look]);
  const cutType = scene.shot?.cutType;
  const castIds = characterIds(v.character);
  const cast = win.PRODUCTION.cast || {};
  const appliesCutLook = d.look !== 'archive';
  const activeCast = appliesCutLook && ['action', 'reaction', 'insert'].includes(cutType)
    ? castIds.map(id => ({ id, entry: cast[id] })).filter(({ entry }) => entry && typeof entry === 'object') : [];
  const pack = d.look === 'archive' || !packPresets.includes(preset) ? null : resolveStylePack({
    id: style.referencePack, role: v.styleRole || defaultStyleRole(cutType, castIds) });
  const spoken = (scene.narration || []).map(n => n.tts || n.sub || '').join(' ');
  const previz = v.video && v.video.previz && typeof v.video.previz === 'object' ? v.video.previz : null;
  const previzFrame = previz && typeof previz.firstFrame === 'string' ? (dir ? path.resolve(dir, previz.firstFrame) : previz.firstFrame) : null;
  const castReferenceImages = activeCast.filter(({ entry }) => text(entry.name) && text(entry.image))
    .map(({ id, entry }) => ({ id, name: entry.name, path: dir ? path.resolve(dir, entry.image) : entry.image }));
  const locationRef = scene.shot?.location ? require('./location-assets.js').references(win, index, dir) : null;
  const propSnapshot = require('./prop-continuity.js').snapshot(win, index);
  const propReferenceImages = propSnapshot.filter(p => p.visible).flatMap(p => p.references.map(r => dir ? path.resolve(dir, r.path) : r.path));
  const continuityContract = require('./shot-continuity.js');
  const continuity = continuityContract.plan(win, index, dir);
  const sourceReferenceImages = [...new Set([...(locationRef?.paths || []), ...(previzFrame ? [previzFrame] : []), ...(continuity?.referenceImages || []), ...(pack?.referenceImagePaths || []), ...castReferenceImages.map(ref => ref.path), ...propReferenceImages])];
  const spatialWarnings = locationRef && previz && !previz.locationBinding ? ['Standalone previz is not bound to this location. Compare its camera and blocking or rebuild with location_manage action previz; the location render controls source composition.'] : [];
  const compositionLock = locationRef
    ? 'Composition lock: the first attached image is the shared 3D location render. Keep its camera, architecture, framing and authored character placement and orientation. Render surfaces and visible characters in the episode style. Other references supply appearance or motion planning; keep the location composition when they differ.'
    : previzFrame ? PREVIZ_SOURCE_LOCK : null;
  const castPromptLines = appliesCutLook ? castLines(cast, castIds, cutType) : [];
  const castImageLines = castReferenceImages.map(ref => {
    const imageNumber = sourceReferenceImages.indexOf(ref.path) + 1;
    return `The attached image ${imageNumber} is the approved appearance of ${ref.name}; preserve the identity of visible parts only. The shot framing controls which parts appear; this reference supplies appearance, not pose, framing or background.`;
  });
  const castLocks = activeCast.filter(({ entry }) => text(entry.name) && text(entry.sheet))
    .map(({ entry }) => `${entry.name.trim()} keeps this exact appearance on visible parts only, within the planned framing: ${entry.sheet}`);
  const perCutTreatment = appliesCutLook ? cutTreatment(preset, cutType) : '';
  const world = style.worlds?.[d.worldId] ?? style.world;
  const propPrompt = require('./prop-continuity.js').prompt(win, index);
  const sourceTechnique = require('./film-techniques.js').sourceInstructions(scene);
  const videoTechnique = require('./film-techniques.js').instructions(scene);
  const source = [...(propPrompt ? [propPrompt] : []), canvas + ', edge-to-edge composition.',
    'Opening state: ' + (d.before || ''),
    sourceContext.guidance(sourceContext.context(scene, win.STORY)),
    ...continuityContract.sourceGuidance(continuity, sourceReferenceImages),
    ...(compositionLock ? [compositionLock] : []),
    ...(pack ? [locationRef ? 'Attached image ' + (sourceReferenceImages.indexOf(pack.referenceImagePaths[0]) + 1) + ' is for STYLE ONLY. Preserve the first image composition.'
                            : previzFrame ? 'The first attached image is the previz frame: its composition is kept exactly. Attached image ' + (sourceReferenceImages.indexOf(pack.referenceImagePaths[0]) + 1) + ' is for STYLE ONLY.'
                            : 'Attached image ' + (sourceReferenceImages.indexOf(pack.referenceImagePaths[0]) + 1) + ' is for STYLE ONLY. Design the opening composition for this shot, preserving the state supplied by continuity references.', ...Object.values(pack.rules)] : []),
    treatment, ...(perCutTreatment ? [perCutTreatment] : []), ...castPromptLines, ...castImageLines, world,
    'Materials: ' + (style.materials || ''), 'Palette: ' + (style.palette || ''), 'Lighting: ' + (style.lighting || ''),
    'Camera language: ' + (style.camera || ''),
    'Camera composition: ' + (camera.framing || ''),
    ...(sourceTechnique ? [sourceTechnique] : []),
    ...(scene.shot?.depth?.mode === 'deep' ? ['Depth: keep all planned planes sharp and readable together: ' + (scene.shot.depth.planes || []).join('; ') + '.'] : []),
    ...(scene.shot?.depth?.mode === 'shallow' ? ['Depth: shallow focus on ' + (scene.shot.depth.focus || 'the planned subject') + '.'] : []),
    ...(perCutTreatment || activeCast.length ? ['Framing priority: the shot camera composition controls crop, angle, subject scale and visible body parts. Cast sheets, cut-type notes and episode camera language supply appearance and intent only; keep off-frame body parts outside the image.' + (previzFrame ? ' The previz first frame must already match this composition; correct a conflicting previz before generating the source image.' : '')] : []),
    'Spatial continuity: ' + (d.continuity || ''),
    ...(locationRef ? [locationRef.prompt, 'Attached image ' + (sourceReferenceImages.indexOf(locationRef.paths[0]) + 1) + ' is the LOCATION reference (reference review: ' + (locationRef.approved ? 'reviewed' : 'not_reviewed or stale') + '). Preserve its camera and architecture.'] : []),
    ...(locationRef?.startActors || []).flatMap(actor => {
      const ref = castReferenceImages.find(item => item.id === actor.id);
      return ref ? ['The ' + actor.color + ' proxy is ' + ref.name + ' from attached image ' + (sourceReferenceImages.indexOf(ref.path) + 1) + '; that image supplies appearance only.'] : [];
    }),
    'Keep the physical subject legible at phone size. The image contains only a text-free scene; dialogue stays in audio, with no subtitles, captions or lettering in the image or final video.'].join('\n');
  const locationLock = locationRef ? '. The location holds the approved reference architecture and fixed object inventory: ' + locationRef.invariants.join('; ') : '';
  const lock = lockText(d, style, treatment, castLocks) + locationLock + (propPrompt ? ". " + propPrompt : "") + (isDrone(camera) ? '. The flight keeps continuous terrain parallax and stable landmarks; the picture stays a clean aerial view with scenery at every frame edge' : '');
  let motionPrompt = null;
  const engine = v.video?.engine || v.engine || 'seedance';
  const promptEngine = v.video?.model === 'dreamina-seedance-2-5-260628' ? 'seedance-2.5' : 'seedance';
  // Keep the story text intact. An optional adapter rendering carries the same
  // event in English when the selected model cannot accept its original language.
  const performanceDirection = (scene.performance || []).map((event, index) => {
    if (event.videoDirection !== undefined && !text(event.videoDirection)) throw new Error('performance.videoDirection must be non-empty text');
    if (event.kind === 'action') return `Event ${index + 1}: ${event.character}: ${event.videoDirection || event.text}` +
      (event.withGroup ? ` (concurrent with speech group ${event.withGroup})` : '');
    const line = scene.narration?.[event.group - 1];
    const direction = event.videoDirection || line?.acting?.visual;
    return `Event ${index + 1}: ${event.character} ${line?.delivery || 'voiceover'}` +
      (event.to ? ` addressed to ${event.to}; preserve the listener and eyeline` : '') +
      (direction ? `; ${direction}` : '');
  }).join('. ');
  if (!missingSlots.length && engine === 'astra') {
    const astraAppearance = activeCast.filter(({ entry }) => text(entry.sheet))
      .map(({ entry }) => 'Appearance to preserve on visible parts only: ' + clause(entry.sheet) + '.');
    motionPrompt = astraMotionPrompt(d, camera, style, treatment, !!spoken.trim() && (scene.narration || []).every(n => n.delivery === 'voiceover' || (!n.delivery && (!n.speaker || n.speaker === win.SB_DOC?.narratorCharacterId))), [...astraAppearance, ...(propPrompt ? [propPrompt] : [])], castIds.length > 0) + locationLock;
    if (videoTechnique) motionPrompt += '\n' + videoTechnique;
    if (performanceDirection) motionPrompt += '\nOrdered performance: ' + performanceDirection;
  } else if (!missingSlots.length) {
    const onReferenceRoute = previz && (v.video.engine || v.engine || 'seedance') !== 'host' && previzHandoff(scene) === 'reference_video';
    const clip = PROMPT.clipAssemble({ engine: promptEngine, camera, techniques:scene.shot?.techniques, motion: motionText(d) + (performanceDirection ? '\nOrdered performance: ' + performanceDirection : ''), locks: lock,
      ...(onReferenceRoute ? { scene: previzPreamble(previz) } : {}),
      audio: scene.sound?.effects?.some(effect => ['auto', 'native'].includes(effect.delivery)) &&
        scene.sound.audioSource !== 'speech' && (scene.sound.audioSource === 'video' || !scene.narration?.some(line => text(line.tts)))
        ? 'scene effects follow visible actions; use the prepared sound plan'
        : 'silent; narration is supplied separately' });
    const problems = [...clip.hits.map(h => `"${h.match}" (${h.why})`), ...clip.negHits.map(h => `negative directive "${h}"`),
      ...clip.timeHits, ...clip.hanHits.map(h => `Korean "${h}"`), ...(clip.lockMissing ? ['no consistency lock'] : [])];
    if (problems.length) warnings.push('The motion prompt trips the Seedance prompt advice that check-scenes.js also reports: ' + problems.join('; ') +
      '. Prefer rewriting videoDesign.action, motion.beats or continuity positively, without seconds. For translated performance, preserve the original text and supply each event.videoDirection in the selected model\'s supported language.');
    motionPrompt = clip.prompt;
  }
  // The vendor rejects the request above this length, so it stays a hard stop.
  if (engine === 'astra' && motionPrompt?.length > 2000)
    throw new Error('ASTRA motion prompt including performance exceeds 2000 characters; shorten descriptions or split at a natural action boundary, preserving every action');
  const locationEndReady = !locationRef || !!(locationRef.resultImage && v.bg && path.resolve(dir,v.bg)===path.resolve(dir,locationRef.resultImage));
  return { warnings, continuity, spatialWarnings, propSnapshot, propReferenceImages, endFrameImageArgs: locationRef && locationEndReady ? {referenced_image_paths: [path.resolve(dir,v.bg), ...locationRef.endPaths]} : {}, endFrameReady: locationEndReady, locationEndReferenceImages: locationRef?.endPaths || [], locationBinding: locationRef?.binding || null, locationReferenceRoles: locationRef?.roles || [], sourcePrompt: source, stylePreset: preset, cutType, castIds,
    styleBinding: pack?.binding || null,
    styleGuidePath: pack?.guidePath || null,
    castReferenceImages,
    sourceReferenceImages,
    // The previz frame goes first, followed by the pack image and the episode cast images.
    sourceImageArgs: sourceReferenceImages.length ? { referenced_image_paths: sourceReferenceImages } : {},
    previzFirstFrame: previzFrame,
    endFramePrompt: (locationRef ? 'Image 1 is the generated opening frame; image 2 is the location endpoint render. Preserve image 1 appearance while using image 2 for the final camera, architecture and authored character state. ' + locationRef.endPrompt + '\n' : '') + 'Edit the supplied opening image into this final state: ' + (after || '') + '\n' + treatment + '\n' + lock +
      '\nPreserve lighting. Follow the planned camera endpoint: ' + (camera.end || camera.framing || ''),
    motionPrompt };
}
module.exports = { assemble, LOOKS, beatsInWords, previzPreamble, PREVIZ_SOURCE_LOCK };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), target = args[0], n = Number(args[args.indexOf('--shot') + 1]);
    if (!target || !args.includes('--shot') || !Number.isInteger(n) || n < 1) throw new Error('usage: spatial-prompts.js <storyboard dir|scenes.js> --shot N');
    const scenesPath = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
    const win = readScenes(scenesPath);
    const result = assemble(win, n - 1, path.dirname(path.resolve(scenesPath)));
    for (const w of result.warnings) console.error('spatial-prompts warning: ' + w);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) { console.error('spatial-prompts: ' + e.message); process.exitCode = 1; }
}
