#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
const { readScenes } = require('../../autoproduce/references/cost-preview.js');
const { full, MODES, STYLES, packPresets, motionErrors, missingCameraSlots, finalState } = require('./production-mode.js');
const { resolveStylePack } = require('./style-pack.js');
const PROMPT = require('./assemble-bg-prompt.js');
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
const clause = value => String(value).trim().replace(/[.!?\s]*$/, '');
function require_(fields) {
  for (const [name, value] of Object.entries(fields)) if (!text(value)) throw new Error('Missing ' + name);
}
/* Beats are ordered by description, never by a clock: Seedance 1.5 Pro shows no timestamps in any
   vendor example and 2.0 self-reports unstable precision timing (scenes-schema §clip prompt). The
   seconds stay in the plan for the playback review, which compares observed states at those times. */
function beatsInWords(beats) {
  return beats.map((b, i) => (i === 0 ? 'At first' : i === beats.length - 1 ? 'Finally' : 'Then') + ', ' + clause(b.state)).join('. ');
}
function motionText(d) {
  if (d.motion?.kind !== 'subject_action') return d.action;
  return ['Subject action: ' + clause(d.action), 'Visible change: ' + clause(d.motion.visibleChange), beatsInWords(d.motion.beats),
    'The articulated subject itself carries this change; ambient motion and the camera move stay secondary'].join('. ');
}
/* The consistency lock is the only place an exclusion can go on Seedance, and the gate wants its
   holding verbs (stays · holds · keeps). The look and the episode camera language ride here so every
   clip of the episode is drawn with one lens and one material world. */
function lockText(d, style, treatment) {
  return ['The subject stays exactly consistent with the input frame: identity, facial features, clothing design, proportions and materials hold while pose, expression and position change as planned',
    clause(d.continuity), 'Architecture and terrain keep stable geometry throughout', 'The look holds: ' + clause(treatment),
    'The episode camera language holds: ' + clause(style.camera)].join('. ');
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
function assemble(win, index, dir) {
  if (!MODES[win.PRODUCTION?.mode]) throw new Error('Choose a production mode before assembling prompts');
  const scene = win.SCENES[index], d = scene?.shot?.videoDesign, style = win.PRODUCTION.style, v = scene?.visual;
  if (!d || !style || !LOOKS[d.look]) throw new Error('Choose style and videoDesign before assembling prompts');
  if (!v || typeof v !== 'object') throw new Error('Missing visual');
  if (d.camera !== undefined) throw new Error('videoDesign.camera is retired; the camera lives in the four visual.camera slots');
  const isVideo = full(win.PRODUCTION) || !!v.video;
  if (isVideo) {
    const errors = motionErrors(scene);
    if (errors.length) throw new Error(errors.join('; '));
  }
  const after = finalState(d);
  require_({ 'videoDesign.before': d.before, 'videoDesign.action': d.action, 'videoDesign.after (or the last motion beat)': after,
    'videoDesign.continuity': d.continuity, 'style.world': style.world, 'style.materials': style.materials, 'style.palette': style.palette,
    'style.lighting': style.lighting, 'style.camera': style.camera, 'visual.camera.framing': v.camera?.framing });
  const camera = v.camera, missingSlots = missingCameraSlots(camera);
  if (isVideo && missingSlots.length) throw new Error('Missing ' + missingSlots.map(s => 'visual.camera.' + s).join(', ') + ' (the motion prompt is assembled from the four slots)');
  const canvas = win.FORMAT === 'youtube-long-16x9' ? 'Landscape 16:9' : 'Portrait 9:16';
  const preset = style.preset || 'spatial-explainer'; // Resume existing miniature boards.
  if (preset !== 'spatial-explainer' && !STYLES[preset]) throw new Error('Unknown visual style: ' + preset);
  if (STYLES[preset] && d.look !== 'archive' && !STYLES[preset].looks.includes(d.look))
    throw new Error('Shot look conflicts with selected visual style');
  if (STYLES[preset] && !packPresets.includes(preset) && style.referencePack)
    throw new Error('Remove the miniature reference pack for this style');
  const treatment = d.look === 'archive' ? LOOKS.archive : (STYLES[preset]?.prompt || LOOKS[d.look]);
  const pack = d.look === 'archive' || !packPresets.includes(preset) ? null : resolveStylePack({
    id: style.referencePack, role: v.styleRole || 'environment' });
  const spoken = (scene.narration || []).map(n => n.tts || n.sub || '').join(' ');
  const previz = v.video && v.video.previz && typeof v.video.previz === 'object' ? v.video.previz : null;
  const previzFrame = previz && typeof previz.firstFrame === 'string' ? (dir ? path.resolve(dir, previz.firstFrame) : previz.firstFrame) : null;
  const source = [canvas + ', edge-to-edge composition.',
    'Narrated meaning this picture must convey: ' + spoken,
    'Opening state: ' + d.before,
    ...(previzFrame ? [PREVIZ_SOURCE_LOCK] : []),
    'The image must make the narrated subject and action understandable; a beautiful but unrelated scene fails.',
    ...(pack ? [previzFrame ? 'The first attached image is the previz frame: its composition is kept exactly. The second attached image is for STYLE ONLY.'
                            : 'Use the attached image for STYLE ONLY. Design a new scene for the narration.', ...Object.values(pack.rules)] : []),
    treatment, style.world,
    'Materials: ' + style.materials, 'Palette: ' + style.palette, 'Lighting: ' + style.lighting,
    'Camera language: ' + style.camera,
    'Camera composition: ' + camera.framing,
    'Spatial continuity: ' + d.continuity,
    'Keep the physical subject legible at phone size. The image contains only the scene; subtitles are added in editing.'].join('\n');
  const lock = lockText(d, style, treatment);
  let motionPrompt = null;
  if (!missingSlots.length) {
    const onReferenceRoute = previz && (v.video.engine || v.engine || 'seedance') !== 'host' && (previz.handoff || 'reference_video') === 'reference_video';
    const clip = PROMPT.clipAssemble({ engine: 'seedance', camera, motion: motionText(d), locks: lock,
      ...(onReferenceRoute ? { scene: previzPreamble(previz) } : {}),
      audio: 'silent; narration is supplied separately' });
    const problems = [...clip.hits.map(h => `"${h.match}" (${h.why})`), ...clip.negHits.map(h => `negative directive "${h}"`),
      ...clip.timeHits, ...clip.hanHits.map(h => `Korean "${h}"`), ...(clip.lockMissing ? ['no consistency lock'] : [])];
    if (problems.length) throw new Error('The motion prompt fails the Seedance prompt gate that check-scenes.js runs: ' + problems.join('; ') +
      '. Rewrite videoDesign.action, motion.beats or continuity positively, in English, without seconds.');
    motionPrompt = clip.prompt;
  }
  return { sourcePrompt: source, stylePreset: preset,
    styleBinding: pack?.binding || null,
    styleGuidePath: pack?.guidePath || null,
    sourceReferenceImages: [...(previzFrame ? [previzFrame] : []), ...(pack?.referenceImagePaths || [])],
    // The previz frame goes first: it is the composition the still is edited from, the pack image the look.
    sourceImageArgs: previzFrame || pack ? { referenced_image_paths: [...(previzFrame ? [previzFrame] : []), ...(pack?.referenceImagePaths || [])] } : {},
    previzFirstFrame: previzFrame,
    endFramePrompt: 'Edit the supplied opening image into this final state: ' + after + '\n' + treatment + '\n' + lock +
      '\nPreserve lighting. Follow the planned camera endpoint: ' + (camera.end || camera.framing),
    motionPrompt };
}
module.exports = { assemble, LOOKS, beatsInWords, previzPreamble, PREVIZ_SOURCE_LOCK };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), target = args[0], n = Number(args[args.indexOf('--shot') + 1]);
    if (!target || !args.includes('--shot') || !Number.isInteger(n) || n < 1) throw new Error('usage: spatial-prompts.js <storyboard dir|scenes.js> --shot N');
    const scenesPath = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
    const win = readScenes(scenesPath);
    console.log(JSON.stringify(assemble(win, n - 1, path.dirname(path.resolve(scenesPath))), null, 2));
  } catch (e) { console.error('spatial-prompts: ' + e.message); process.exitCode = 1; }
}
