#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
const { readScenes } = require('../../autoproduce/references/cost-preview.js');
const { full, STYLES, motionErrors } = require('./production-mode.js');
const { resolveStylePack } = require('./style-pack.js');
const LOOKS = {
  miniature: 'An architectural exhibition miniature diorama with articulated objects, matte materials, soft contact shadows and restrained fine detail.',
  architectural: 'A precise architectural cutaway model with believable thickness, connected parts, legible spatial relationships and softly lit material surfaces.',
  realistic: 'A physically believable location with natural textures, coherent perspective, detailed stone and foliage, and restrained depth of field.',
  webtoon: 'A coherent drawn webtoon scene with expressive linework, cel shading and illustrated depth.',
  archive: 'A faithful presentation of the supplied archival reference, preserving its composition and marks as source evidence.'
};
function assemble(win, index) {
  if (!['hybrid', 'full_video'].includes(win.PRODUCTION?.mode)) throw new Error('Choose a production mode before assembling prompts');
  const scene = win.SCENES[index], d = scene?.shot?.videoDesign, style = win.PRODUCTION.style;
  if (!d || !style || !LOOKS[d.look]) throw new Error('Choose style and videoDesign before assembling prompts');
  for (const [name, value] of Object.entries({ before: d.before, action: d.action, after: d.after, camera: d.camera,
    continuity: d.continuity, world: style.world, materials: style.materials, palette: style.palette, lighting: style.lighting }))
    if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name);
  if (full(win.PRODUCTION)) {
    const errors = motionErrors(scene);
    if (errors.length) throw new Error(errors.join('; '));
  }
  const canvas = win.FORMAT === 'youtube-long-16x9' ? 'Landscape 16:9' : 'Portrait 9:16';
  const preset = style.preset || 'spatial-explainer'; // Resume existing miniature boards.
  if (preset !== 'spatial-explainer' && !STYLES[preset]) throw new Error('Unknown visual style: ' + preset);
  if (STYLES[preset] && d.look !== 'archive' && !STYLES[preset].looks.includes(d.look))
    throw new Error('Shot look conflicts with selected visual style');
  if (['photoreal', 'webtoon'].includes(preset) && style.referencePack)
    throw new Error('Remove the miniature reference pack for this style');
  const treatment = d.look === 'archive' ? LOOKS.archive : (STYLES[preset]?.prompt || LOOKS[d.look]);
  const pack = d.look === 'archive' || ['photoreal', 'webtoon'].includes(preset) ? null : resolveStylePack({
    id: style.referencePack, role: scene.visual.styleRole || 'environment' });
  const spoken = (scene.narration || []).map(n => n.tts || n.sub || '').join(' ');
  const source = [canvas + ', edge-to-edge composition.',
    'Meaning to illustrate (do not render these words): ' + spoken,
    'Opening state: ' + d.before,
    'The image must make the narrated subject and action understandable; a beautiful but unrelated scene fails.',
    ...(pack ? ['Use the attached image for STYLE ONLY. Design a new scene for the narration.',
      ...Object.values(pack.rules), 'Style pack: ' + pack.id + ' / ' + pack.digest] : []),
    treatment, style.world,
    'Materials: ' + style.materials, 'Palette: ' + style.palette, 'Lighting: ' + style.lighting,
    'Camera composition: ' + scene.visual.camera.framing,
    'Spatial continuity: ' + d.continuity,
    'Keep the physical subject legible at phone size. The image contains only the scene; subtitles are added in editing.'].join('\n');
  const lock = 'Preserve identity, facial features, clothing design, proportions and materials while allowing the planned changes in pose, expression and position. ' +
    d.continuity + ' Architecture and terrain retain stable geometry throughout the intended action.';
  const action = d.motion?.kind === 'subject_action'
    ? ['Subject action: ' + d.action, 'Visible change: ' + d.motion.visibleChange,
      ...d.motion.beats.map(b => b.at + 's: ' + b.state),
      'Animate the articulated subject through these states. Breathing, cloth flutter and camera movement alone do not fulfill this action.'].join('\n')
    : d.action;
  return { sourcePrompt: source, stylePreset: preset,
    styleBinding: pack?.binding || null,
    styleGuidePath: pack?.guidePath || null,
    sourceReferenceImages: pack?.referenceImagePaths || [],
    sourceImageArgs: pack ? { referenced_image_paths: pack.referenceImagePaths } : {},
    endFramePrompt: 'Edit the supplied opening image into this final state: ' + d.after + '\n' + treatment + '\n' + lock +
      '\nPreserve lighting. Follow the planned camera endpoint: ' + (scene.visual.camera.end || d.camera),
    motionPrompt: [action, d.camera, treatment, 'The shot ends with ' + d.after, lock,
      'Audio: silent; narration is supplied separately.'].join('\n') };
}
module.exports = { assemble, LOOKS };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), target = args[0], n = Number(args[args.indexOf('--shot') + 1]);
    if (!target || !args.includes('--shot') || !Number.isInteger(n) || n < 1) throw new Error('usage: spatial-prompts.js <storyboard dir|scenes.js> --shot N');
    const win = readScenes(fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target);
    console.log(JSON.stringify(assemble(win, n - 1), null, 2));
  } catch (e) { console.error('spatial-prompts: ' + e.message); process.exitCode = 1; }
}
