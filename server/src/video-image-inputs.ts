import path from 'node:path';
import { realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifyImageFile, type ImageMetadata } from './image-media.js';
import { framesForSeconds } from './astra-video-client.js';
import { resolveVideoDuration } from './video-duration.js';

const load = createRequire(import.meta.url);
const imageRouting = () => load(fileURLToPath(new URL('../../skills/storyboard/references/render-routing.js', import.meta.url))) as {
  hasStructuredImages(scene: unknown): boolean;
  framePlan(scene: unknown): { mode: string; start: string; end: string };
  checkFrames(scene: unknown): string[];
  imageReferences(scene: unknown): ImageReference[];
};
interface ImageReference { id: string; path: string; role: string; use: string; purpose: string }
export interface ImageBinding extends ImageMetadata {
  id: string; path: string; role: string; use: string; purpose: string; submitted: boolean;
}
interface ShotVisual {
  video?: { strength?: number };
  frames?: { start?: string; keyframes?: { image: string; atSeconds: number; state: string; strength?: number }[] };
  references?: ImageReference[];
}
const FRAME_FIELDS: Record<string, [string, string?]> = {
  veo_img2video: ['sourceImagePath', 'lastImagePath'], seedance_img2video: ['sourceImagePath', 'lastImagePath'],
  omni_img2video: ['sourceImagePath', 'lastImagePath'], astra_img2video: ['firstFramePath', 'lastFramePath'],
  astra_audio2video: ['imagePath'], astra_genai_img2video: ['imageUri', 'lastFrameUri'],
  astra_genai_audio2video: ['imagePath', 'lastFramePath'], mlx_video_generate: ['firstFrameImagePath', 'lastFrameImagePath'], ltx_video_generate: ['firstFrameImagePath', 'lastFrameImagePath'],
};
// No framing words here: "face close-up" in this sentence opened every 2026-10-31 test render on a close-up.
const PANEL_VIEWS: Record<string, string> = { face: 'face', front: 'headless front body', back: 'headless back body' };
/**
 * An MSR slot is an input source, not a declared subject, so name the character-sheet panels
 * (panels.json) that show one character: the face close-up carries the head, the headless panels
 * the body and outfit.
 */
function msrPanelBinding(paths: string[], refs: ImageReference[]): string {
  const groups = new Map<string, string[]>();
  paths.forEach((file, i) => {
    if (refs[i].role === 'background') return;
    let panels: Record<string, { file?: string }>;
    try { panels = JSON.parse(readFileSync(path.join(path.dirname(file), 'panels.json'), 'utf8')).panels ?? {}; } catch { return; }
    const view = Object.entries(panels).find(([, panel]) => panel.file === path.basename(file))?.[0];
    if (view && PANEL_VIEWS[view]) groups.set(path.dirname(file), [...(groups.get(path.dirname(file)) ?? []), `Image ${i + 1} (${PANEL_VIEWS[view]})`]);
  });
  return [...groups].filter(([, items]) => items.length > 1).map(([folder, items]) =>
    `${items.join(', ')} show one character, ${path.basename(folder)}: render one complete character with the head and hair from the face and the body and outfit from the headless panels.`).join('\n');
}
/** A character-sheet panel counts once per sheet folder; any other character image counts alone. */
function characterKey(file: string): string {
  try { readFileSync(path.join(path.dirname(file), 'panels.json')); return path.dirname(file); } catch { return file; }
}
export function hasStructuredImages(shot: Record<string, unknown>): boolean {
  return imageRouting().hasStructuredImages(shot);
}
/** Compile authored image roles into adapter arguments; never downgrade a temporal constraint to a reference. */
export function prepareVideoImages(tool: string, input: Record<string, unknown>, shot: Record<string, unknown>, episode: string) {
  const visual = (shot.visual ?? {}) as ShotVisual;
  // Legacy boards keep their adapter contract; new authoring declares references, including an empty array.
  if (!hasStructuredImages(shot)) return { args: input, imageBindings: undefined };
  const routing = imageRouting();
  const errors = routing.checkFrames(shot);
  if (errors.length) throw new Error('image_plan_invalid: ' + errors.join('; '));
  const frames = routing.framePlan(shot);
  const references = routing.imageReferences(shot);
  const videoRefs = references.filter(ref => ['video', 'both'].includes(ref.use));
  const frameMode = frames.mode !== 'reference';
  const keyframes = visual.frames?.keyframes;
  if (keyframes !== undefined && (!Array.isArray(keyframes) || !keyframes.length || keyframes.length > 6 || frames.mode !== 'first_last'))
    throw new Error('image_plan_invalid: intermediate frames require first_last and 1..6 entries');
  const host = tool === 'host_external';
  if (!host && videoRefs.length && frameMode) throw new Error('image_plan_unsupported: installed adapters cannot combine pinned start/end frames with additional video references; retain references with use:image or explicitly replan mode:reference');
  if (!host && keyframes && tool !== 'astra_keyframe_video') throw new Error('image_plan_unsupported: this adapter cannot accept intermediate frames');
  const args = { ...(host ? input : resolveVideoDuration(tool, input).args) };
  const assigned = new Set<string>();
  const bindings: ImageBinding[] = [];
  const boardDir = path.join(episode, 'storyboard');
  const resolve = (file: string) => realpathSync(path.resolve(boardDir, file));
  const bind = (id: string, file: string, role: string, use: string, purpose: string, submitted: boolean) => {
    const absolute = resolve(file);
    const metadata = verifyImageFile(absolute);
    bindings.push({ id, path: absolute, role, use, purpose, submitted, ...metadata });
    return absolute;
  };
  if (host) {
    if (frameMode) {
      if (!frames.start) throw new Error('image_plan_invalid: start image is required');
      bind('start', frames.start, 'start', 'video', 'Opening state', false);
      if (frames.end) bind('end', frames.end, 'end', 'video', 'Ending state', false);
    }
    for (const [i, frame] of (keyframes ?? []).entries()) bind('keyframe-' + (i + 1), frame.image, 'keyframe', 'video', frame.state, false);
    for (const ref of references) bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, false);
    return { args, imageBindings: bindings, imageHandoff: 'unverified_host_mapping: bind every video/both input and temporal frame to the actual host schema; do not omit unsupported inputs or claim submission from this plan' };
  }
  const equal = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'string' && typeof b === 'string' && b.startsWith('data:')) return a === b;
    if (typeof a === 'string' && typeof b === 'string') return realpathSync(path.resolve(episode, a)) === b;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
      return Object.keys(left).every(key => Object.hasOwn(right, key)) && Object.entries(right).every(([k, v]) =>
        k.endsWith('Path') ? equal(left[k], v) : (k === 'strength' && v === 1 && left[k] === undefined) || JSON.stringify(left[k]) === JSON.stringify(v));
    }
    return a === b;
  };
  const put = (key: string, value: unknown) => {
    if (args[key] !== undefined && !equal(args[key], value)) throw new Error('image_plan_mismatch: ' + key);
    args[key] = value;
    assigned.add(key);
  };
  if (frames.mode === 'reference') {
    if (!['seedance_reference', 'veo_reference', 'astra_genai_msr', 'fasth3_omni_reference'].includes(tool)) throw new Error('image_plan_unsupported: reference mode needs a reference adapter');
    if (tool === 'veo_reference' && videoRefs.some(ref => ['style', 'composition'].includes(ref.role)))
      throw new Error('image_plan_unsupported: Veo references preserve assets, not style or composition');
    if (tool === 'astra_genai_msr' && videoRefs.some((ref, i) => ref.role === 'background' && i !== videoRefs.length - 1))
      throw new Error('image_plan_invalid: MSR background must be last so prompt image indices match the gateway');
    const paths = videoRefs.map(ref => bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, true));
    if (tool === 'astra_genai_msr') put('references', videoRefs.map((ref, i) => ({ imagePath: paths[i], ...(ref.role === 'background' ? { background: true } : {}) })));
    else put('referenceImagePaths', paths);
    if (tool === 'astra_genai_msr') {
      // Two principal characters take references (user directive 2026-10-31); the model draws anyone else.
      const characters = new Set(videoRefs.flatMap((ref, i) => ref.role === 'character' ? [characterKey(paths[i])] : []));
      if (characters.size > 2) throw new Error(`msr_character_limit: references show ${characters.size} characters; reference two principal characters and describe anyone else in the action`);
      // The model card describes each reference first ("Image 1: ..."), then the action.
      const binding = msrPanelBinding(paths, videoRefs);
      args.prompt = [...videoRefs.map((ref, i) => `Image ${i + 1}: ${ref.role}, ${ref.purpose}`), ...(binding ? [binding] : []), '', String(args.prompt ?? '')].join('\n');
    } else {
      const guidance = videoRefs.map((ref, i) => `${tool === 'fasth3_omni_reference' ? '<Picture ' + (i + 1) + '>' : 'Image ' + (i + 1)} (${ref.id}, ${ref.role}): ${ref.purpose}`).join('\n');
      args.prompt = String(args.prompt ?? '') + '\nImage reference roles:\n' + guidance;
    }
  } else if (keyframes) {
    const fps = Number(args.frameRate ?? 24);
    const count = Number(args.numFrames ?? (args.duration === undefined ? NaN : framesForSeconds(Number(args.duration), fps)));
    if (!Number.isFinite(fps) || fps <= 0 || !Number.isInteger(count) || count < 2) throw new Error('image_plan_invalid: keyframes need explicit frame count or duration');
    const strength = visual.video?.strength ?? 1;
    const images = [{ imagePath: bind('start', frames.start, 'start', 'video', 'Opening state', true), frameIdx: 0, strength },
      ...keyframes.map((frame, i) => {
        if (!Number.isFinite(frame.atSeconds) || frame.atSeconds <= 0 || (typeof shot.duration === 'number' && frame.atSeconds >= shot.duration) || !frame.state?.trim()) throw new Error('image_plan_invalid: intermediate frame needs time and state');
        return { imagePath: bind('keyframe-' + (i + 1), frame.image, 'keyframe', 'video', frame.state, true), frameIdx: Math.round(frame.atSeconds * fps), strength: frame.strength ?? strength };
      }), { imagePath: bind('end', frames.end, 'end', 'video', 'Ending state', true), frameIdx: count - 1, strength }];
    if (images.some((item, i) => i > 0 && item.frameIdx <= images[i - 1].frameIdx)) throw new Error('image_plan_invalid: keyframe indices must be distinct, increasing and inside the clip');
    put('images', images);
  } else {
    const fields = FRAME_FIELDS[tool];
    if (!fields || (frames.end && !fields[1])) throw new Error('image_plan_unsupported: adapter cannot carry the authored frame plan');
    if (!frames.start) throw new Error('image_plan_invalid: start image is required');
    const value = (id: string, file: string) => {
      const absolute = bind(id, file, id, 'video', id === 'start' ? 'Opening state' : 'Ending state', true);
      if (tool !== 'astra_genai_img2video') return absolute;
      const mime = bindings[bindings.length - 1].mimeType;
      if (!['image/png', 'image/jpeg'].includes(mime)) throw new Error('image_plan_unsupported: GenAI frames need PNG/JPEG');
      return 'data:' + mime + ';base64,' + readFileSync(absolute).toString('base64');
    };
    put(fields[0], value('start', frames.start));
    if (frames.end) put(fields[1]!, value('end', frames.end));
  }
  for (const key of ['sourceImagePath', 'lastImagePath', 'firstFramePath', 'lastFramePath', 'imagePath', 'imageUri', 'lastFrameUri', 'firstFrameImagePath', 'lastFrameImagePath', 'referenceImagePaths', 'references', 'images']) {
    if (input[key] !== undefined && !assigned.has(key)) throw new Error('image_plan_mismatch: unplanned ' + key);
  }
  for (const ref of references.filter(item => item.use === 'image')) bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, false);
  return { args, imageBindings: bindings };
}
