import { HOSTED_VIDEO_ROUTES } from './hosted-video-routes.js';
import { openingPositionsSchema } from './msr-opening.js';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifyImageFile, type ImageMetadata } from './image-media.js';
import { framesForSeconds } from './astra-video-client.js';
import { resolveVideoDuration } from './video-duration.js';
import { FRAME_FIELDS, VIDEO_ADAPTERS, VENDOR_REFERENCE_TOOLS, requiredCharacters, referenceLabel } from './video-registry.js';

const load = createRequire(import.meta.url);
const imageRouting = () => load(fileURLToPath(new URL('../../skills/storyboard/references/render-routing.js', import.meta.url))) as {
  hasStructuredImages(scene: unknown): boolean;
  framePlan(scene: unknown): { mode: string; start: string; end: string };
  checkFrames(scene: unknown): string[];
  imageReferences(scene: unknown): ImageReference[];
  referenceConstraints(ref: ImageReference): string;
};
interface ImageReference { scope?: string; resolvedPanel?: boolean; id: string; path: string; role: string; use: string; purpose: string; wardrobe?: 'fitting'; defaultOutfit?: string; preserve?: string[]; avoid?: string[] }
export const characterPanels = () => load(fileURLToPath(new URL('../../skills/channel/references/character-panels.js', import.meta.url))) as {
  canonicalReferences(boardDir: string, shotId: string, ids: string[], use: string, options?: { combined?: boolean }): ImageReference[];
  sheetPanels(boardDir: string, ids: string[]): Map<string, Record<string, string>>;
};
export interface ImageBinding extends ImageMetadata {
  id: string; path: string; role: string; use: string; purpose: string; submitted: boolean; preserve?: string[]; avoid?: string[];
}
interface ShotVisual {
  video?: { strength?: number; referenceLayout?: 'panels' | 'combined'; openingPositions?: unknown; openingImageSha256?: string };
  character?: string | { id: string } | Array<string | { id: string }>;
  characterInputs?: unknown;
  bystanders?: string[];
  frames?: { start?: string; end?: string; storyboardKeyframes?: Array<{file: string; startSeconds: number; description?: string; title?: string}>; keyframes?: { image: string; atSeconds: number; state: string; strength?: number }[] };
  references?: ImageReference[];
}
/** The listed ratio closest to an image's, for vendors whose adaptive ratio would follow a face panel. */
function nearestRatio(width: number, height: number): string {
  const ratios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
  const value = (ratio: string) => { const [w, h] = ratio.split(':').map(Number); return Math.abs(Math.log((w / h) / (width / height))); };
  return ratios.reduce((best, ratio) => value(ratio) < value(best) ? ratio : best);
}
// No framing words here: "face close-up" in this sentence opened every 2026-10-31 test render on a close-up.
const PANEL_VIEWS: Record<string, string> = { face: 'face', front: 'headless front body', back: 'headless back body' };
/**
 * An MSR slot is an input source, not a declared subject, so name the character-sheet panels
 * (panels.json) that show one character: the face close-up carries the head, the headless panels
 * the physique. Fitting panels leave scene clothing to the opening image.
 */
function msrPanelBinding(paths: string[], refs: ImageReference[], compact = false): string {
  const groups = new Map<string, string[]>();
  const fitting = new Set<string>();
  paths.forEach((file, i) => {
    if (refs[i].role === 'background') return;
    let panels: Record<string, { file?: string; wardrobe?: string }>;
    try { panels = JSON.parse(readFileSync(path.join(path.dirname(file), 'panels.json'), 'utf8')).panels ?? {}; } catch { return; }
    const view = Object.entries(panels).find(([, panel]) => panel.file === path.basename(file))?.[0];
    if (!view || !PANEL_VIEWS[view]) return;
    const folder = path.dirname(file);
    groups.set(folder, [...(groups.get(folder) ?? []), `Image ${i + 1} (${PANEL_VIEWS[view]})`]);
    if (panels[view].wardrobe === 'fitting') fitting.add(folder);
  });
  return [...groups].filter(([, items]) => items.length > 1).map(([folder, items]) => compact
    ? `Images ${items.map(item => item.replace(/Image (\d+) \(([^)]+)\)/, '$1($2)')).join(', ')}: ONE ${path.basename(folder)}; head/hair only from face; ${fitting.has(folder) ? 'physique from body, wardrobe from the scene' : 'physique/clothes only from body'}; ignore face-panel clothing.`
    : `${items.join(', ')} show one character, ${path.basename(folder)}: render one complete character with the head and hair from the face and ${fitting.has(folder) ? 'physique from the body panels, dressed for the scene' : 'the body and outfit from the headless panels'}. Ignore clothing visible in the face panel; never duplicate a person for separate panels.`).join('\n');
}
/** A character-sheet panel counts once per sheet folder; any other character image counts alone. */
function characterKey(file: string): string {
  try { readFileSync(path.join(path.dirname(file), 'panels.json')); return path.dirname(file); } catch { return file; }
}
export function hasStructuredImages(shot: Record<string, unknown>): boolean {
  return imageRouting().hasStructuredImages(shot);
}
export function hasSubjectInput(references: unknown): boolean {
  return Array.isArray(references) && references.some(ref => ref && typeof ref === 'object' && !ref.background);
}
export function hasVideoSubjectReferences(shot: Record<string, unknown>): boolean {
  return imageRouting().imageReferences(shot).some(ref => ref.role !== 'background' && ['video', 'both'].includes(ref.use));
}
interface SheetSubject { id?: string; imageUrl?: string; panels?: Record<string, string>; references?: {path?: string}[] }
/** Look up submitted files in the board's cast and prop sheets, including alternate views and versions. */
export function registeredVideoSubjects(board: Record<string, unknown>, episode: string, paths: readonly string[]) {
  const sheets = board.SB_DOC as { characters?: SheetSubject[] | Record<string, SheetSubject>; props?: SheetSubject[] } | undefined;
  const matches = new Map<string, Set<string>>();
  const submitted = new Set(paths);
  const collect = (kind: string, entries: SheetSubject[] | Record<string, SheetSubject> | undefined) => {
    if (!entries) return;
    const rows = Array.isArray(entries) ? entries : Object.entries(entries).map(([id, entry]) => ({...entry, id}));
    for (const row of rows) {
      if (!row?.id) continue;
      const versions = Array.isArray(row.references) ? row.references.map(ref => typeof ref === 'string' ? ref : ref?.path) : [];
      const files = [row.imageUrl, ...Object.values(row.panels ?? {}), ...versions];
      for (const file of files) {
        if (typeof file !== 'string' || !file) continue;
        const local = path.resolve(episode, 'storyboard', file);
        if (!existsSync(local)) continue;
        const actual = realpathSync(local);
        if (!submitted.has(actual)) continue;
        const owners = matches.get(actual) ?? new Set<string>();
        owners.add(kind + ':' + row.id);
        matches.set(actual, owners);
      }
    }
  };
  collect('character', sheets?.characters);
  collect('prop', sheets?.props);
  return matches;
}
function msrReference(imagePath: string, role: string) {
  if (role === 'background') return { imagePath, background: true };
  if (role === 'prop' || role === 'style') return { imagePath, nonCharacter: true };
  return { imagePath };
}
function bindOpeningPositions(input: Record<string, unknown>, visual: ShotVisual, episode: string) {
  const stored = visual.video?.openingPositions;
  const positions = openingPositionsSchema.parse(stored ?? input.openingPositions);
  if (stored !== undefined && input.openingPositions !== undefined &&
      JSON.stringify(positions) !== JSON.stringify(openingPositionsSchema.parse(input.openingPositions)))
    throw new Error('image_plan_mismatch: openingPositions disagree with shot_prompt');
  const cast = [visual.character ?? []].flat().map(entry => typeof entry === 'string' ? entry : entry.id);
  for (const id of [...cast, ...(visual.bystanders ?? [])]) {
    if (!positions.some(row => row.character === id)) throw new Error('openingPositions: missing opening position for ' + id);
  }
  if (visual.video?.openingImageSha256) {
    const start = visual.frames?.start;
    if (!start || createHash('sha256').update(readFileSync(path.resolve(episode, 'storyboard', start))).digest('hex') !== visual.video.openingImageSha256)
      throw new Error('openingPositions stale: inspect the changed start image and update shot_prompt');
  }
  return positions;
}
type AuthoredFrames = NonNullable<ShotVisual['frames']>;
type TimedImage = NonNullable<AuthoredFrames['keyframes']>[number];

function timedImages(frames: AuthoredFrames, duration: unknown, fps: number, genai: boolean): TimedImage[] | undefined {
  if (frames.keyframes !== undefined || !genai || frames.storyboardKeyframes === undefined) return frames.keyframes;
  const rows = frames.storyboardKeyframes;
  if (!Array.isArray(rows) || rows.length < 2 || rows[0]?.file !== frames.start ||
      rows[0]?.startSeconds !== 0 || rows.at(-1)?.file !== frames.end || typeof duration !== 'number')
    throw new Error('image_plan_invalid: storyboardKeyframes must span the declared opening and ending images');
  const last = Math.ceil(duration * fps) - 1;
  const pins = rows.slice(1).filter((row, i) => i !== rows.length - 2 || Math.round(row.startSeconds * fps) !== last);
  return pins.length ? pins.map(row => ({ image: row.file, atSeconds: row.startSeconds, state: row.description || row.title || row.file })) : undefined;
}

function sceneTimedImages(members: Record<string, unknown>[], fps: number, genai: boolean) {
  const tracks = members.map(member => {
    const frames = (member.visual as ShotVisual)?.frames ?? {};
    const duration = Number(member.duration);
    return { frames, duration, pins: timedImages(frames, duration, fps, genai) };
  });
  if (!tracks.some(track => track.pins?.length)) return;
  const timeline: TimedImage[] = [];
  let offset = 0;
  for (const [i, { frames, duration, pins }] of tracks.entries()) {
    if (i && frames.start) timeline.push({ atSeconds: offset, image: frames.start, state: 'Shot opening' });
    for (const pin of pins ?? []) {
      if (!Number.isFinite(pin.atSeconds) || pin.atSeconds <= 0 || pin.atSeconds >= duration)
        throw new Error('image_plan_invalid: intermediate frame must fall inside its storyboard shot');
      timeline.push({ ...pin, atSeconds: offset + pin.atSeconds });
    }
    offset += duration;
    if (i < tracks.length - 1 && frames.end) {
      const atSeconds = (Math.ceil(offset * fps) - 1) / fps;
      const previous = timeline.at(-1);
      if (previous?.image !== frames.end || Math.round(previous.atSeconds * fps) !== Math.round(atSeconds * fps))
        timeline.push({ atSeconds, image: frames.end, state: 'Shot ending' });
    }
  }
  return timeline;
}
/** Compile authored image roles into adapter arguments; never downgrade a temporal constraint to a reference. */
export function prepareVideoImages(tool: string, input: Record<string, unknown>, shot: Record<string, unknown>, episode: string, members?: Record<string, unknown>[]) {
  const visual = (shot.visual ?? {}) as ShotVisual;
  const routing = imageRouting();
  const frames = routing.framePlan(shot);
  const fields = FRAME_FIELDS[tool];
  const engine = VIDEO_ADAPTERS[tool]?.engine;
  const structured = hasStructuredImages(shot);
  const gatewayFrames = tool === 'astra_genai_img2video' || tool === 'astra_genai_audio2video';
  const openingField = fields && [fields[0], ...(gatewayFrames ? ['imagePath', 'imageUri'] : [])].find(key => input[key] !== undefined);
  const callerOpening = openingField && input[openingField];
  // A legacy caller may provide its own opening. An authored pair still binds
  // both endpoints, even when the caller repeats one of them.
  const legacyFrames = !structured && (['ltx-api', 'ltx-desktop-local', 'veo', 'astra-genai'].includes(engine) || tool === 'seedance_img2video') &&
    (frames.end || frames.mode !== 'reference' && frames.start && !openingField);
  if (!structured && !legacyFrames) {
    const msr = tool === 'astra_genai_msr' || (tool === 'astra_genai_img2video' && Array.isArray(input.references));
    return { args: msr ? { ...input, openingPositions: bindOpeningPositions(input, visual, episode) } : input, imageBindings: undefined };
  }
  if (legacyFrames && (!fields || frames.end && !fields[1]))
    throw new Error('image_plan_unsupported: adapter cannot carry the authored frame plan');
  // A legacy board can leave the opening to its caller. Validate the whole pair
  // together while keeping the caller's local path or gateway URI on the request.
  const suppliedStart = !structured && !frames.start && frames.end && typeof callerOpening === 'string' ? callerOpening : undefined;
  const errors = routing.checkFrames(suppliedStart ? {...shot, visual:{...visual, bg:suppliedStart}} : shot);
  if (errors.length) throw new Error('image_plan_invalid: ' + errors.join('; '));
  let references = routing.imageReferences(shot);
  const rawCast = (shot.visual as Record<string, unknown> | undefined)?.character;
  const canonicalMsr = !(shot.visual as Record<string,unknown>)?.sceneSpeakerReferences && !visual.characterInputs && tool === 'astra_genai_msr' && frames.mode === 'reference' && rawCast !== undefined
    && existsSync(path.join(episode, 'storyboard', 'cast.json'));
  if (canonicalMsr) {
    const ids = ([] as unknown[]).concat(rawCast ?? []).map(entry => typeof entry === 'string' ? entry : (entry as { id: string }).id);
    // Old combined pictures and omitted faces cannot redefine a declared principal's identity.
    if (visual.video?.referenceLayout !== undefined && !['panels', 'combined'].includes(visual.video.referenceLayout))
      throw new Error('image_plan_invalid: unknown MSR referenceLayout');
    references = [...characterPanels().canonicalReferences(path.join(episode, 'storyboard'), String(shot.id ?? 'shot'), ids, 'both',
      { combined: visual.video?.referenceLayout === 'combined' }),
      ...references.filter(ref => ref.role !== 'character')];
  }
  references = references.map(ref => {
    const authored = visual.references?.find(item => item.id === ref.id || path.resolve(episode, 'storyboard', item.path) === path.resolve(episode, 'storyboard', ref.path));
    return { ...ref, ...(authored?.preserve ? { preserve: authored.preserve } : {}), ...(authored?.avoid ? { avoid: authored.avoid } : {}) };
  });
  let videoRefs = references.filter(ref => ['video', 'both'].includes(ref.use));
  if (tool === 'seedance_reference' && videoRefs.length && videoRefs.every(ref => ref.resolvedPanel) &&
      Array.isArray(input.referenceImagePaths)) {
    const panels = new Map(videoRefs.map(ref => [realpathSync(path.resolve(episode,'storyboard',ref.path)),ref]));
    const prefix = input.referenceImagePaths.map((file, index) => {
      const absolute = realpathSync(path.resolve(episode,file));
      const panel = panels.get(absolute);
      panels.delete(absolute);
      return panel ?? {id:'input-'+(index+1),path:absolute,role:'continuity',use:'video',purpose:'Keep the authored prompt binding for this image.'};
    });
    videoRefs = [...prefix, ...panels.values()];
  }
  const frameMode = frames.mode !== 'reference';
  const genaiPins = tool === 'astra_genai_img2video' || tool === 'astra_genai_audio2video';
  const fps = Number(input.fps ?? input.frameRate ?? 24);
  const keyframes = members && members.length > 1 ? sceneTimedImages(members, fps, genaiPins)
    : timedImages(visual.frames ?? {}, shot.duration, fps, genaiPins);
  if (keyframes !== undefined && (!Array.isArray(keyframes) || !keyframes.length || keyframes.length > (frames.end ? 6 : 7) || (frames.mode !== 'first_last' && !(genaiPins && frames.mode === 'first'))))
    throw new Error('image_plan_invalid: intermediate frames require first_last and 1..6 entries');
  const host = tool === 'host_external';
  if (!host && videoRefs.length && frameMode && tool !== 'astra_genai_img2video') throw new Error('image_plan_unsupported: this adapter cannot combine pinned start/end frames with additional video references; retain references with use:image or explicitly replan mode:reference');
  if (!host && keyframes && tool !== 'astra_keyframe_video' && !genaiPins) throw new Error('image_plan_unsupported: this adapter cannot accept intermediate frames');
  const args = { ...(host ? input : resolveVideoDuration(tool, input).args) };
  const assigned = new Set<string>();
  const bindings: ImageBinding[] = [];
  const boardDir = path.join(episode, 'storyboard');
  const resolve = (file: string) => realpathSync(path.resolve(boardDir, file));
  const bind = (id: string, file: string, role: string, use: string, purpose: string, submitted: boolean) => {
    const absolute = resolve(file);
    const metadata = verifyImageFile(absolute);
    const ref = references.find(item => item.id === id);
    bindings.push({ id, path: absolute, role, use, purpose, submitted, ...metadata,
      ...(ref?.preserve ? { preserve: ref.preserve } : {}), ...(ref?.avoid ? { avoid: ref.avoid } : {}) });
    return absolute;
  };
  if (host) {
    if (frameMode) {
      if (!frames.start) throw new Error('image_plan_invalid: start image is required');
      bind('start', frames.start, 'start', 'video', 'Opening state', false);
      if (frames.end) bind('end', frames.end, 'end', 'video', 'Ending state', false);
    }
    for (const [i, frame] of (keyframes ?? []).entries()) bind('keyframe-' + (i + 1), frame.image, 'keyframe', 'video', frame.state, false);
    // The set render that composed the start image (role composition) is already in it; the video never takes it.
    for (const ref of references) if (ref.role !== 'composition') bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, false);
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
    if (VIDEO_ADAPTERS[tool]?.operation !== 'reference') throw new Error('image_plan_unsupported: reference mode needs a reference adapter');
    // MSR's background slot carries the shot's start image — its characters, place and props composed by the
    // image tool (user directive 2026-10-31); a plain background reference only conditioned that image.
    // The hosted reference lanes take a spoken shot as MSR does, but with no background slot and no pinned first
    // frame: the start image goes last among the pictures and the place picture stays out (the start image has it).
    const msr = tool === 'astra_genai_msr', vendor = VENDOR_REFERENCE_TOOLS.includes(tool);
    const sent = msr || vendor ? videoRefs.filter(ref => ref.role !== 'background') : videoRefs;
    const paths = sent.map(ref => bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, true));
    const assetContract = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
    if (assetContract) {
      const positions = visual.video?.openingPositions;
      const owners = Array.isArray(positions) ? openingPositionsSchema.parse(positions).filter(p => p.images.length).map(p => p.character) : [];
      const issue = assetContract.validate(sent.map((ref, i) => ({ ...ref, path: paths[i] })), input.model as string | undefined, owners);
      if (issue) throw new Error('image_plan_unsupported: ' + issue);
    }
    const start = (msr || vendor) && frames.start ? bind('start', frames.start, 'start', 'video', 'Opening picture', true) : undefined;
    if (msr) put('references', [...paths.map((file, i) => msrReference(file, sent[i].role)), ...(start ? [{ imagePath: start, background: true }] : [])]);
    else {
      // A caller may repeat the authored prefix. Only the cast resolver may append the remaining panels.
      const caller = args.referenceImagePaths;
      if (tool === 'seedance_reference' && Array.isArray(caller) && caller.length < paths.length &&
          equal(caller, paths.slice(0, caller.length)) && paths.slice(caller.length).every(file =>
            requiredCharacters(shot).some(person => [person.face?.path, person.bodyPath].some(panel =>
              panel && realpathSync(path.resolve(episode, 'storyboard', panel)) === file))))
        delete args.referenceImagePaths;
      put('referenceImagePaths', [...paths, ...(start ? [start] : [])]);
    }
    if (vendor && start && args.ratio === undefined) {
      const opening = bindings[bindings.length - 1];
      args.ratio = nearestRatio(opening.width, opening.height);
    }
    if (msr && sent.length > 4) throw new Error('msr_subject_limit: at most four subject images plus one background');
    if (vendor) {
      // Two principal characters take references (user directive 2026-10-31); the model draws anyone else.
      const characters = new Set(sent.flatMap((ref, i) => ref.role === 'character' ? [characterKey(paths[i])] : []));
      if (characters.size > 2) throw new Error(`msr_character_limit: references show ${characters.size} characters; reference two principal characters and describe anyone else in the action`);
    }
    if (msr) {
      // The model card describes each reference first ("Image 1: ..."), then the action.
      const binding = msrPanelBinding(paths, sent, canonicalMsr);
      args.prompt = [...sent.map((ref, i) => `Image ${i + 1}: ${canonicalMsr && ref.role === 'character' ? '' : ref.role + ', '}${ref.purpose}${routing.referenceConstraints(ref) ? " " + routing.referenceConstraints(ref) : ""}`),
        ...(start ? [`Image ${sent.length + 1}: ${canonicalMsr ? 'opening composition (people, place, props)' : 'the opening picture, the characters, place and props as the shot begins'}`] : []),
        ...(binding ? [binding] : []), '', String(args.prompt ?? '')].join('\n');
    } else {
      const label = (i: number) => vendor || tool === 'fasth3_omni_reference' ? referenceLabel(tool, 'image', i) : 'Image ' + i;
      const guidance = [...sent.map((ref, i) => `${label(i + 1)} (${ref.scope === 'shot_guide' ? ref.role : ref.id + ', ' + ref.role}): ${ref.purpose}${routing.referenceConstraints(ref) ? " " + routing.referenceConstraints(ref) : ""}`),
        ...(start ? [`${label(sent.length + 1)} (start, opening picture): the characters, place and props as the shot begins; open on this composition.`] : [])].join('\n');
      args.prompt = String(args.prompt ?? '') + '\nImage reference roles:\n' + guidance;
    }
  } else if (keyframes && !genaiPins) {
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
    if (!frames.start && !suppliedStart) throw new Error('image_plan_invalid: start image is required');
    const putFrame = (id: 'start' | 'end', file: string, field: string) => {
      const absolute = bind(id, file, id, 'video', id === 'start' ? 'Opening state' : 'Ending state', true);
      if (gatewayFrames) {
        const local = id === 'start' ? 'imagePath' : 'lastFramePath';
        const uri = id === 'start' ? 'imageUri' : 'lastFrameUri';
        if (input[local] !== undefined) field = local;
        else if (input[uri] !== undefined) field = uri;
      }
      if (!field.endsWith('Uri')) return put(field, absolute);
      const mime = bindings[bindings.length - 1].mimeType;
      if (!['image/png', 'image/jpeg'].includes(mime)) throw new Error('image_plan_unsupported: GenAI frames need PNG/JPEG');
      put(field, 'data:' + mime + ';base64,' + readFileSync(absolute).toString('base64'));
    };
    if (frames.start) putFrame('start', frames.start, fields[0]);
    else if (openingField) assigned.add(openingField);
    if (frames.end) putFrame('end', frames.end, fields[1]!);
    // On unstructured cards an explicit last frame may add to the legacy opening.
    if (!structured && !frames.end && fields[1]) {
      assigned.add(fields[1]);
      if (gatewayFrames) { assigned.add('lastFramePath'); assigned.add('lastFrameUri'); }
    }
    if (keyframes) {
      const fps = Number(args.fps ?? 24);
      const pins = keyframes.map((frame, i) => {
        if (!Number.isFinite(frame.atSeconds) || frame.atSeconds <= 0 || (typeof shot.duration === 'number' && frame.atSeconds >= shot.duration) || !frame.state?.trim())
          throw new Error('image_plan_invalid: intermediate frame needs time and state inside the clip');
        const strength = frame.strength ?? visual.video?.strength;
        return { imagePath: bind('keyframe-' + (i + 1), frame.image, 'keyframe', 'video', frame.state, true),
          frameIdx: Math.round(frame.atSeconds * fps), ...(strength === undefined ? {} : { strength }) };
      });
      if (pins.some((pin, i) => pin.frameIdx <= (i ? pins[i - 1].frameIdx : 0)))
        throw new Error('image_plan_invalid: intermediate frame indices must increase after the opening frame');
      put('keyframes', pins);
    }
    if (tool === 'astra_genai_img2video' && videoRefs.length) {
      const ordered = [...videoRefs].sort((a, b) => Number(a.role === 'background') - Number(b.role === 'background'));
      const paths = ordered.map(ref => bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, true));
      if (ordered.filter(ref => ref.role !== 'background').length > 4)
        throw new Error('msr_subject_limit: at most four subject images plus one background');
      put('references', paths.map((file, i) => msrReference(file, ordered[i].role)));
      args.prompt = [...ordered.map((ref, i) => `Image ${i + 1}: ${ref.role}, ${ref.purpose}${routing.referenceConstraints(ref) ? " " + routing.referenceConstraints(ref) : ""}`),
        msrPanelBinding(paths, ordered), '', String(args.prompt ?? '')].filter(Boolean).join('\n');
    }
  }
  if (tool === 'astra_genai_msr' || (tool === 'astra_genai_img2video' && videoRefs.length)) {
    // Prop-only boards have enough role information to declare an empty cast.
    const propsOnly = ![visual.character ?? []].flat().length && !visual.bystanders?.length &&
      videoRefs.every(ref => ['background', 'prop', 'style'].includes(ref.role));
    const positions = bindOpeningPositions(propsOnly && !visual.video?.openingPositions && input.openingPositions === undefined
      ? { ...input, openingPositions: [] } : input, visual, episode);
    if (canonicalMsr) {
      const subjects = videoRefs.filter(ref => ref.role !== 'background');
      for (const [index, ref] of subjects.entries()) {
        if (ref.role !== 'character') continue;
        const owner = positions.find(row => row.images.includes(index + 1));
        if (!owner || !['face', 'front', 'back', 'msr'].some(panel => ref.id === `${shot.id ?? 'shot'}-${owner.character}-${panel}`))
          throw new Error('openingPositions: match Image ' + (index + 1) + ' to the cast member who owns this panel');
      }
    }
    args.openingPositions = positions;
  }
  for (const key of ['sourceImagePath', 'lastImagePath', 'firstFramePath', 'lastFramePath', 'imagePath', 'imageUri', 'lastFrameUri', 'firstFrameImagePath', 'lastFrameImagePath', 'referenceImagePaths', 'references', 'keyframes', 'images']) {
    if (input[key] !== undefined && !assigned.has(key)) throw new Error('image_plan_mismatch: unplanned ' + key);
  }
  for (const ref of references.filter(item => item.use === 'image')) bind(ref.id, ref.path, ref.role, ref.use, ref.purpose, false);
  return { args, imageBindings: bindings };
}
