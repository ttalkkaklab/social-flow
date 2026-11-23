// Frame numbers throughout this module are relative to the scene. Shot ends are exclusive.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { openingPrompt, sceneShotBindingsSchema, shotTimelineSchema, type OpeningPosition, type SceneVideoDirection } from './msr-opening.js';
import { videoTextPolicy, resolvedDirection, attributeWords, sceneShotNotes, shotVisualWords, sceneCameraDirection, scenePromptText, sceneVoiceDirection } from './video-prompt.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import type { ImageBinding } from './video-image-inputs.js';
import { verifyImageFile } from './image-media.js';
import { HOSTED_VIDEO_ROUTES } from './hosted-video-routes.js';
import { astraGenaiBaseUrl, GENAI_AUDIO_TYPES, GenaiRequestError, genaiAudioUri, genaiSourceUri, requestGenai } from './astra-genai-client.js';
import { FRAME_FIELDS, requiredCharacters, sceneInputCapabilities, VIDEO_ADAPTERS } from './video-registry.js';
import { resolveCharacterVoice, voiceReference } from './video-voice.js';
import { GENAI_MSR_INLINE_MAX_BYTES, uploadGenaiFile } from './astra-genai-upload.js';

const load = createRequire(import.meta.url);
type Timeline = z.infer<typeof shotTimelineSchema>;
type Pin = NonNullable<Timeline['images']>[number];
interface Reference { scope?: string; character?: string; id: string; path: string; role: string; use: string; purpose: string }
interface Member {
  id: string; duration: number; referenceImage?:string; timeline?: Timeline; transition?: string; summary?: string;
  narration?: { id?: string; speaker?: string; delivery?: string; tts?: string; acting?: {direction?: string; vocal?:string; tags?:string[]} }[];
  shot?: { size?: string; angle?: string; videoDesign?: {before?: string; action?: string; sound?: string} };
  visual?: { action?: string; camera?: Record<string, unknown>; frames?: {
    keyframes?: { image: string; atSeconds: number; state: string; strength?: number }[];
    storyboardKeyframes?: { file: string; startFrame?: number; startSeconds?: number; description?: string }[];
  }; video?: { openingPositions?: OpeningPosition[]; prompt?: string; promptSource?: { action?: string; sound?: string } } };
}
type SceneImage = Omit<Pin,'role'> & { shotId: string; role: string; reference?: Reference };
const temporal = (image: SceneImage) => ['start', 'keyframe', 'end'].includes(image.role) && !image.reference;
const english = (value?: string) => value && !nonEnglishOutsideQuotes(value) ? value : '';

/** Apply an approved plan's reference and casting choices to copied shot cards. */
export function bindSceneCards(members: Record<string,unknown>[], bindings?: z.infer<typeof sceneShotBindingsSchema>) {
  if (!bindings) return members;
  const cards = structuredClone(members), seen = new Set<string>();
  for (const binding of bindings) {
    const raw = cards.find(card => card.id === binding.shotId);
    if (!raw || seen.has(binding.shotId)) throw new Error('scene_render_bindings: duplicate or unknown shot '+binding.shotId);
    seen.add(binding.shotId);
    const timeline = shotTimelineSchema.parse(raw.timeline);
    if (binding.framing) timeline.framing = binding.framing;
    if (binding.action) timeline.action = binding.action;
    if (binding.keyframes) timeline.images = [...(timeline.images ?? []), ...binding.keyframes.map(pin=>({...pin,role:'keyframe' as const}))];
    if (binding.openingPositions) timeline.openingPositions = binding.openingPositions;
    if (binding.dialogueCues) timeline.dialogueCues = [...(timeline.dialogueCues ?? []).filter(c=>!binding.dialogueCues!.some(b=>b.lineId===c.lineId)),...binding.dialogueCues];
    raw.timeline=timeline;
  }
  return cards;
}
export function sceneCoverage(members: Record<string,unknown>[], scene: Partial<SceneVideoDirection>, board?: Record<string,unknown>, sceneNo = members[0]?.scene) {
  const owner = (board?.STRUCTURE as {scenes?: {no:number; directionDefaults?: unknown}[]} | undefined)?.scenes?.find(s => s.no === sceneNo);
  return resolvedDirection({directionDefaults:owner?.directionDefaults, videoDirection:scene}, members);
}

export function compileSceneTimeline(raw: Record<string, unknown>[], scene: Partial<SceneVideoDirection>, episode: string, board?: Record<string, unknown>, coverage = sceneCoverage(raw, scene, board), shotScoped = false, namedReferencesOnly = false, guideMode?:'composition'|'background', guideLimit?:number, concise = false) {
  const render = load('../../skills/storyboard/references/render-routing.js');
  const members = raw as unknown as Member[];
  const fps = scene.fps ?? 24;
  if (scene.oneTake && members.length !== 1) throw new Error('scene_one_take: an uninterrupted camera setup must have one shot');
  const shotIds = members.map(s => s.id);
  if (new Set(shotIds).size !== members.length) throw new Error('scene_video_timing: duplicate shot ID');
  let cursor = 0, seconds = 0;
  const images: SceneImage[] = [];
  const requiredPaths = new Set<string>();
  if (guideLimit !== undefined) for (const member of members) {
    for (const ref of render.imageReferences(member)) if (['both','video'].includes(ref.use)) requiredPaths.add(ref.path);
  }
  let guideSlots = guideLimit === undefined ? Infinity : Math.max(0, guideLimit - requiredPaths.size);
  const guides: {shotId:string; path:string; submitted:boolean; reason?:string}[] = [];
  const shots = members.map((member, index) => {
    const { id: shotId, visual } = member;
    const timeline = member.timeline && shotTimelineSchema.parse(member.timeline);
    seconds += member.duration;
    const startFrame = cursor, endFrame = Math.round(seconds * fps);
    const incoming = member.transition && member.transition !== 'cut' ? member.transition : 'hard_cut';
    const transition = timeline?.transition ?? (index === 0 ? 'open' : incoming);
    if (endFrame <= cursor || timeline && (timeline.startFrame !== startFrame || timeline.endFrame !== endFrame) ||
        (transition === 'open') !== (index === 0)) throw new Error('scene_video_timing: inconsistent frame range or transition on ' + shotId);
    cursor = endFrame;
    const notes = sceneShotNotes(raw[index], concise);
    const shotFraming = shotVisualWords(raw[index], coverage.shots[index], coverage.common, notes.end, timeline?.framing, concise);
    const framing = shotFraming || (coverage.common.camera ? attributeWords('camera', coverage.common.camera)
      : members.length === 1 ? 'Use the opening composition.' : '');
    const action = [notes.action || (members.length === 1 ? scene.action || scene.emotion : ''), ...notes.beats].filter(Boolean).join(' ');
    const pins: Pin[] = [...(timeline?.images ?? [])];
    for (const pin of scene.keyframes ?? []) {
      if (pin.frame >= startFrame && pin.frame < endFrame) pins.push({...pin, role:'keyframe'});
    }
    const frames = render.framePlan(member);
    const legacy = visual?.frames;
    const fallback = legacy?.keyframes === undefined ? legacy?.storyboardKeyframes : undefined;
    for (const pin of fallback ?? []) {
      const frame = pin.startFrame !== undefined && pin.startFrame >= startFrame ? pin.startFrame
        : pin.startSeconds !== undefined ? startFrame + Math.round(pin.startSeconds * fps) : pin.startFrame;
      if (!pin.file || frame === undefined || !Number.isInteger(frame)) throw new Error('scene_image_timing: malformed storyboardKeyframes on ' + shotId);
      const role = frame === startFrame ? 'start' : pin.file === frames.end ? 'end' : 'keyframe';
      if (!pins.some(p => p.frame === frame && p.path === pin.file)) pins.push({ path: pin.file, frame, role });
    }
    for (const pin of legacy?.keyframes ?? []) {
      const frame = startFrame + Math.round(pin.atSeconds * fps);
      if (!pins.some(p => p.frame === frame && p.path === pin.image)) pins.push({ path: pin.image, frame, role: 'keyframe', cue: english(pin.state), strength: pin.strength });
    }
    // Reference-mode display images are not temporal pins. Named video/both assets carry appearance.
    if (frames.start && !(namedReferencesOnly && frames.mode === 'reference') && !pins.some(p => p.role === 'start' && p.path === frames.start)) pins.push({ path: frames.start, frame: startFrame, role: 'start' });
    if (frames.end && !pins.some(p => p.role === 'end' && p.path === frames.end && (!fallback || p.frame === endFrame - 1))) pins.push({ path: frames.end, frame: endFrame - 1, role: 'end' });
    const occupied = new Set<number>();
    const references: Reference[] = render.imageReferences(member).filter((r: Reference) => ['video','both'].includes(r.use));
    const add = (pin: Omit<SceneImage,'shotId'>) => {
      if (!Number.isSafeInteger(pin.frame) || pin.frame < startFrame || pin.frame >= endFrame)
        throw new Error('scene_image_timing: ' + shotId + ' ' + pin.path + ' at ' + pin.frame);
      const image = { ...pin, shotId, path: realpathSync(path.resolve(episode, 'storyboard', pin.path)) };
      if (temporal(image)) {
        if (occupied.has(pin.frame)) throw new Error('scene_image_conflict: ' + shotId + ' has two temporal images at frame ' + pin.frame);
        occupied.add(pin.frame);
      }
      images.push(image);
    };
    const people = requiredCharacters(raw[index]);
    const ownerOf = (file: string) => people.find(person => file === person.face?.path || file === person.bodyPath)?.character;
    const claimed = new Set<Reference>();
    for (const pin of pins.sort((a,b) => a.frame - b.frame)) {
      const ref = ['face','outfit'].includes(pin.role) ? references.find(r => r.path === pin.path) : undefined;
      if (ref) claimed.add(ref);
      const owner = ref && ownerOf(ref.path);
      if (owner && pin.character && pin.character !== owner)
        throw new Error('scene_reference_owner: ' + shotId + ' assigns ' + ref!.path + ' to the wrong character');
      add(ref ? {...pin, ...(owner ? {character:owner} : {}), reference:ref} : pin);
    }
    for (const ref of references) if (!claimed.has(ref))
      add({ path: ref.path, role: ref.scope === 'scene' && ref.id.endsWith('-face') ? 'face' : ref.role, frame: startFrame, reference: ref, ...((ref.character || ownerOf(ref.path)) ? {character:ref.character || ownerOf(ref.path)} : {}) });
    if (member.referenceImage) {
      // Distilled I2V accepts a background alongside at least one subject.
      const subjectMissing = guideMode === 'background' && !references.some(ref => !['background','location'].includes(ref.role));
      const occupied = guideMode === 'background' && references.some(ref => ['background','location'].includes(ref.role));
      const guide = {shotId,path:member.referenceImage,submitted:Boolean(guideMode && guideSlots > 0 && !occupied && !subjectMissing)};
      if (guideMode && guide.submitted) {
        guideSlots--;
        const purpose = index === 0 ? 'Composition for the opening view.' : `Composition for the view after cut ${index}.`;
        const reference = {id:shotId+'-composition',role:guideMode,use:'video',scope:'shot_guide',path:member.referenceImage,purpose};
        add({path:member.referenceImage,role:guideMode,frame:startFrame,reference});
        guides.push(guide);
      } else {
        const reason = subjectMissing ? 'The background reference input requires a separate subject reference.' :
          guideMode ? 'No free composition-reference slot.' : 'The selected operation has no compatible composition-reference input.';
        guides.push({...guide,reason});
      }
    }
    // Older approved single-shot plans already bind their narration and voices in
    // the adapter. Preserve their manifest and hash unless a timeline adds a binding.
    const scoped = shotScoped || members.length > 1 || timeline?.openingPositions || timeline?.dialogueCues?.length;
    if (members.length === 1 && timeline?.openingPositions && scene.openingPositions &&
        JSON.stringify(timeline.openingPositions) !== JSON.stringify(scene.openingPositions))
      throw new Error('scene_opening_positions: a single shot and its scene must have the same opening positions');
    const positions = scoped ? timeline?.openingPositions ?? visual?.video?.openingPositions ?? (index === 0 ? scene.openingPositions : undefined) : undefined;
    const blocking = notes.blocking;
    const sound = notes.sound;
    const ordered = load('../../skills/storyboard/references/scene-direction.js').orderedSpeech as (card:Member)=>NonNullable<Member['narration']>;
    const lines = scoped ? ordered(member).filter(line => line.tts?.trim()) : [];
    for (const cue of timeline?.dialogueCues ?? []) {
      if (lines.filter(line => line.id === cue.lineId).length !== 1)
        throw new Error('scene_dialogue_timing: ' + shotId + ' needs one spoken line with id ' + cue.lineId);
    }
    const cast = (board?.SB_DOC as {characters?: Record<string,unknown>[]} | undefined)?.characters;
    const dialogue = lines.map(line => {
      const frame = timeline?.dialogueCues?.find(c => c.lineId === line.id)?.frame;
      const character = cast?.find(c => c.id === line.speaker);
      const context = { episode, board:board ?? {}, shot:raw[index] };
      const warnings: string[] = [];
      const voice = character && voiceReference(resolveCharacterVoice(character, context, warnings), context, warnings);
      const direction = sceneVoiceDirection(line.acting, line.tts);
      return { lineId:line.id, speaker:line.speaker, delivery:line.delivery, text:line.tts!,
        ...(direction ? {direction} : {}),
        ...(frame !== undefined ? {frame} : {}), ...(voice ? {voice} : {}),
        ...(warnings.length ? {warnings} : {}) };
    });
    return { shotId, startFrame, endFrame, transition, framing, action,
      ...(positions?.length ? {openingPositions:positions} : {}), ...(blocking ? {blocking} : {}),
      ...(sound ? {sound} : {}), ...(dialogue.length ? {dialogue} : {}) };
  });
  if (scene.keyframes?.some(pin => pin.frame <= 0 || pin.frame >= cursor - 1))
    throw new Error('scene_image_timing: scene keyframes must fall between the opening and ending frames');
  const cuts = shots.slice(1).map(({ shotId, startFrame: frame, transition }, i) => ({ from: shots[i].shotId, to: shotId, frame, transition }));
  const audio = scene.audio && { ...(scene.audio.mode ? {mode:scene.audio.mode} : {}), path: realpathSync(path.resolve(episode, 'storyboard', scene.audio.path)), startFrame: 0, endFrame: cursor, cues: scene.audio.cues ?? [] };
  if (audio?.cues.some(c => c.frame >= cursor)) throw new Error('scene_audio_timing: cue outside the scene');
  return { fps, frameCount: cursor, shotIds, shots, images, cuts, ...(guides.length ? {shotReferenceImages:guides} : {}), ...(audio ? { audio } : {}) };
}
export type SceneTimeline = ReturnType<typeof compileSceneTimeline>;
export type SceneRequest = SceneTimeline & { sceneNo: number; prompt: string; modelPacedCuts?:boolean; sceneDirection?: Pick<SceneVideoDirection, 'action'|'emotion'|'camera'|'sound'|'oneTake'> & {staging?:string} };

/** Older video references point to a registered cast panel but carry no cast ID. */
export function bindRegisteredPanels(scene: SceneRequest, episode: string, board: Record<string, unknown>) {
  const cast = (board.SB_DOC as {characters?: {id:string; panels?:Record<string,unknown>}[]} | undefined)?.characters ?? [];
  const owners = new Map<string, Set<string>>();
  for (const actor of cast) {
    for (const file of Object.values(actor.panels ?? {})) {
      if (typeof file !== 'string') continue;
      const local = path.resolve(episode, 'storyboard', file);
      if (!existsSync(local)) continue;
      const panel = realpathSync(local);
      const ids = owners.get(panel) ?? new Set<string>();
      ids.add(actor.id);
      owners.set(panel, ids);
    }
  }
  for (const image of scene.images) {
    if (image.role !== 'character' || image.character) continue;
    const ids = owners.get(image.path);
    if (ids?.size === 1) image.character = [...ids][0];
  }
}
export function sceneTimelineWords(t: SceneTimeline, scene: Partial<SceneVideoDirection>,
  {includeDialogue = true, modelFacing = false, modelPacedCuts = false} = {}) {
  const wholeTake = new Set(t.shots.length === 1 ? [scene.camera, scene.action, scene.emotion] : []);
  const timing = (frame: number) => modelFacing ? `At ${Number((frame / t.fps).toFixed(3))} seconds` : `Frame ${frame}`;
  const transitions: Record<string, string> = {
    hard_cut: 'cut directly', dissolve: 'dissolve to the next view', fade: 'fade to the next view',
  };
  return [!modelFacing && `Scene at ${t.fps} fps. Frame numbers start at zero.`, ...t.shots.map(s => {
    const cues = t.images.filter(p => p.shotId === s.shotId && p.cue).map(p => `${timing(p.frame)}: ${p.cue}`);
    const transition = s.transition.replaceAll('_',' ');
    const cut = transitions[s.transition] ?? transition;
    let heading = `${s.shotId} [${s.startFrame}–${s.endFrame - 1}] ${transition}.`;
    if (modelFacing) {
      // The model can paint numeric cut cues onto the picture. The scene manifest retains the cut clock.
      heading = s.transition === 'open' ? '' : modelPacedCuts ? `Then ${cut}.` : `${timing(s.startFrame)}, ${cut}.`;
    }
    return [heading,
      ...[s.framing, s.blocking, s.action].filter(text => text && !wholeTake.has(text)), ...cues, ...t.images.filter(p=>p.shotId===s.shotId && p.reference?.scope==='shot_guide').map(p=>p.reference!.purpose), s.sound && s.sound !== scene.sound && 'Sound: ' + s.sound,
      ...(includeDialogue ? (s.dialogue ?? []).filter(l => l.delivery !== 'voiceover').map(l =>
        (l.frame === undefined ? '' : timing(l.frame) + ': ') + (l.direction ? l.direction + ' ' : '') + l.speaker + ' (' + l.delivery + '): "' + l.text + '"') : []),
    ].filter(Boolean).join(' ');
  }), ...(t.audio ? [modelFacing ? 'Play one continuous soundtrack from the opening.' : 'Play one continuous scene track from frame 0.',
    ...t.audio.cues.map(c => `${timing(c.frame)}: ${c.action}`)] : [])].filter(Boolean).join('\n');
}

/** Compile once, then present the complete scene to the selected adapter's input mapper. */
export function prepareSceneRequest<T>(
  sceneNo: number, members: Record<string, unknown>[], scene: SceneVideoDirection, episode: string,
  dialogue: { speaker?: string; delivery?: string; tts?: string }[],
  options: { bindDialogue: boolean; bindOpening: boolean; suffix: string; shotScoped?: boolean; namedReferencesOnly?: boolean; guideMode?:'composition'|'background'; guideLimit?:number },
  mapInputs: (request: SceneRequest) => T,
  board?: Record<string, unknown>,
) {
  const coverage = sceneCoverage(members, scene, board, sceneNo);
  const owner = (board?.STRUCTURE as {scenes?: {no:number; speakers?:string[]; frames?:unknown}[]} | undefined)?.scenes?.find(s => s.no === sceneNo);
  load('../../skills/_shared/scene-cast.js').sceneCast(owner ?? {no:sceneNo},members);
  const modelPacedCuts = owner?.frames !== undefined && !options.shotScoped && members.length > 1 &&
    !scene.audio && members.every((card, index) => !card.timeline && (index === 0 || !card.transition || card.transition === 'cut'));
  const timeline = compileSceneTimeline(members, scene, episode, board, coverage, options.shotScoped, options.namedReferencesOnly, options.guideMode, options.guideLimit, modelPacedCuts && options.bindDialogue);
  const common = coverage.common;
  const camera = sceneCameraDirection([], common.camera && attributeWords('camera', common.camera));
  const staging = Object.entries(common).filter(([key]) => key !== 'camera').map(([key,row]) => attributeWords(key,row)).filter(Boolean).join(' ');
  const shared = [camera.instruction, staging].filter(Boolean).join(' ');
  const words = sceneTimelineWords(timeline, scene);
  const scopedDialogue = timeline.shots.some(s => s.dialogue?.length);
  const complete = scenePromptText(scene, shared, words, dialogue, scopedDialogue);
  const suffix = (value: string) => [value, options.suffix].filter(Boolean).join(' ');
  const prompt = suffix(openingPrompt(complete, scene.openingPositions));
  const providerTimeline = sceneTimelineWords(timeline, scene, {includeDialogue:!options.bindDialogue, modelFacing:true, modelPacedCuts});
  const text = scenePromptText(scene, shared, providerTimeline, dialogue, options.bindDialogue || scopedDialogue);
  const providerPrompt = suffix(options.bindOpening ? text : openingPrompt(text, scene.openingPositions));
  const request = { sceneNo, prompt, ...timeline, ...(modelPacedCuts ? {modelPacedCuts:true} : {}), sceneDirection:{emotion:scene.emotion, ...(scene.action ? {action:scene.action} : {}),
    ...(camera.instruction ? {camera:camera.instruction} : {}), ...(staging ? {staging} : {}), ...(scene.oneTake ? {oneTake:true} : {}), ...(scene.sound ? {sound:scene.sound} : {})} };
  return { request, providerPrompt, camera, mapped: mapInputs(request) };
}

type Issue = { input: string; shotId?: string; frame?: number; endFrame?: number; path?: string; role?: string; speaker?: string; lineId?: string; reason: string };
export class SceneInputError extends Error {
  constructor(readonly tool: string, readonly sceneRequest: SceneRequest, readonly missing: Issue[], readonly model?: string, readonly resolution?: string) {
    super('scene_inputs_unsupported: ' + tool + ' ' + JSON.stringify(missing));
  }
}
/** Read the deployed I2V request grammar for a refused scene. Discovery never enables a mapper. */
export async function inspectSceneInputContract(error: SceneInputError, validation?: {requestId:string; args:Record<string,unknown>}) {
  if (error.tool !== 'astra_genai_img2video') return undefined;
  const endpoint = '/v1/ltx/v2/image-to-video';
  const address = {baseUrl:astraGenaiBaseUrl(), endpoint};
  const pipeline = error.sceneRequest.images.some(p => !temporal(p)) ? 'msr'
    : error.model === 'ltx-2.5-22b-dev' ? 'guided_hq' : 'generate';
  const [grammar, capabilities] = await Promise.allSettled([
    requestGenai('GET', '/openapi.json', undefined, 10000),
    requestGenai('GET', '/v1/ltx/v2/capabilities', undefined, 10000),
  ]);
  const catalog = z.object({pipelines:z.array(z.object({
    pipeline:z.string(), shot_control:z.object({descriptions:z.string().nullable(),
      frame_accurate_cuts:z.boolean(), shot_scoped_references:z.boolean(), frame_addressed_native_dialogue:z.boolean()}).optional(),
  }))}).safeParse(capabilities.status === 'fulfilled' ? capabilities.value : undefined);
  const control = catalog.success ? catalog.data.pipelines.find(p => p.pipeline === pipeline)?.shot_control : undefined;
  const deployment = {...address, pipeline, ...(control ? {shotControl:control} : {})};
  try {
    if (grammar.status !== 'fulfilled') return {...deployment,status:'unverified'};
    const document = grammar.value as {
      paths: Record<string,{post:{requestBody:{content:Record<string,{schema:{$ref:string}}>}}}>;
      components:{schemas:Record<string,{properties:Record<string,unknown>}>};
    };
    const fields = (ref: string) => {
      if (!ref.startsWith('#/components/schemas/')) throw new Error('Unknown schema reference');
      return Object.keys(document.components.schemas[ref.slice('#/components/schemas/'.length)].properties);
    };
    const schemaRef = (route: string) => document.paths[route]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;
    const ref = schemaRef(endpoint);
    const validationEndpoint = endpoint + '/validate';
    const array = z.object({items:z.object({$ref:z.string()})});
    const arrayFields = (name: string) => {
      const property = document.components.schemas[ref.split('/').pop()!].properties[name];
      const variants = z.object({anyOf:z.array(z.unknown())}).safeParse(property);
      for (const variant of variants.success ? variants.data.anyOf : [property]) {
        const parsed = array.safeParse(variant);
        if (parsed.success) return fields(parsed.data.items.$ref);
      }
      throw new Error('Unknown array schema');
    };
    const contract = {...deployment, status:'verified', requestFields:fields(ref), shotFields:arrayFields('shots'),
      temporalImageFields:arrayFields('keyframes'), referenceFields:arrayFields('references')};
    if (!validation) return contract;
    if (schemaRef(validationEndpoint) !== ref || !error.model || !error.resolution || Object.keys(validation.args).some(key => key !== 'reserveUsd'))
      return {...contract, validation:{status:'not_sent', reason:'Requires the deployed submission schema, saved geometry and unmodified adapter settings'}};
    return {...contract, validation:await validateScenePayload(validationEndpoint, error.sceneRequest, error.model, error.resolution, validation.requestId)};
  } catch {
    return {...deployment, status:'unverified'};
  }
}
export async function buildSceneWire(scene: SceneRequest, model: string, resolution: string, stageFiles = false, bindings?: z.infer<typeof sceneShotBindingsSchema>) {
  const attachments: {shotId?:string; role:string; frame:number; sha256:string; bytes:number}[] = [];
  const shots = scene.shots.map(shot => {
    const binding = bindings?.find(item=>item.shotId === shot.shotId);
    const guidance = binding?.guidance;
    const images = scene.images.filter(image => image.shotId === shot.shotId).map(image => ({
      frame:image.frame, role:image.role, character:image.character, cue:image.cue, strength:image.strength,
      ...(image.reference ? {reference_id:image.reference.id, purpose:image.reference.purpose} : {}),
      image_uri:genaiSourceUri(undefined, image.path),
    }));
    return { ...(binding?.motionPrefix ? {motion_uri:''} : {}),
      ...(binding?.performanceAudio ? {performance_uri:''} : {}),shot_id:shot.shotId, start_frame:shot.startFrame, end_frame:shot.endFrame,
      ...(guidance ? {negative_prompt:guidance.negativePrompt, guidance_scale:guidance.guidanceScale} : {}),
      ...(shot.transition === 'open' ? {} : {transition:shot.transition}),
      description:[shot.framing,shot.action,videoTextPolicy()].join(' '), opening_positions:shot.openingPositions,
      blocking:shot.blocking, audio:shot.sound === scene.sceneDirection?.sound ? undefined : shot.sound, images,
      dialogue:shot.dialogue?.map(line => ({id:line.lineId, speaker:line.speaker, text:line.text, delivery:line.delivery,
        direction:line.direction, frame:line.frame, ...(line.voice ? {voice_uri:genaiAudioUri(undefined,line.voice.path)} : {})})),
    };
  });
  const direction = scene.sceneDirection;
  const prompt = direction ? [direction.emotion,direction.action,direction.camera,direction.staging,direction.sound, direction.oneTake && 'One continuous take. No cuts.'].filter(Boolean).join(' ') : '';
  const trackBytes = scene.audio ? statSync(scene.audio.path).size : 0;
  if (trackBytes > 32 * 1024 * 1024) throw new Error('scene_audio@0: exceeds the 32 MiB gateway upload limit');
  const stageTrack = Boolean(scene.audio && (stageFiles || trackBytes * 4 / 3 > GENAI_MSR_INLINE_MAX_BYTES));
  const body = {model, resolution, fps:scene.fps, num_frames:scene.frameCount, generate_audio:true, prompt:prompt || 'Follow the ordered storyboard shots.',
    image_uri:shots[0]?.images.find(image => image.role === 'start')?.image_uri, shots,
    ...(scene.audio ? {scene_audio:{...(scene.audio.mode ? {mode:scene.audio.mode} : {}),audio_uri:stageTrack ? '' : genaiAudioUri(undefined,scene.audio.path),start_frame:scene.audio.startFrame,
      end_frame:scene.audio.endFrame,cues:scene.audio.cues}} : {})};
  let wire = JSON.stringify(body);
  if (stageFiles || stageTrack || bindings?.some(b=>b.motionPrefix || b.performanceAudio) || Buffer.byteLength(wire) > GENAI_MSR_INLINE_MAX_BYTES) {
    const staged = new Map<string,string>();
    const stageBytes = async (bytes:Buffer, mime:string, role:string, frame:number, shotId?:string) => {
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const id = staged.get(sha256) ?? await uploadGenaiFile(bytes, mime);
      if (!id) throw new Error('Gateway could not stage the original ' + role + ' file for validation');
      staged.set(sha256, id);
      attachments.push({shotId, role, frame, sha256, bytes:bytes.length});
      return id;
    };
    const stage = (uri:string, role:string, frame:number, shotId?:string) =>
      stageBytes(Buffer.from(uri.slice(uri.indexOf(',')+1),'base64'),uri.slice(5,uri.indexOf(';')),role,frame,shotId);
    for (const shot of shots) {
      const binding = bindings?.find(b=>b.shotId === shot.shot_id);
      if (binding?.performanceAudio) shot.performance_uri = await stageBytes(readFileSync(binding.performanceAudio),'audio/wav','performance_audio',shot.start_frame,shot.shot_id);
      if (binding?.motionPrefix) shot.motion_uri = await stageBytes(readFileSync(binding.motionPrefix),'video/mp4','motion_prefix',shot.start_frame,shot.shot_id);
      for (const image of shot.images) image.image_uri = await stage(image.image_uri, image.role, image.frame, shot.shot_id);
      for (const line of shot.dialogue ?? []) if (line.voice_uri)
        line.voice_uri = await stage(line.voice_uri, 'voice_reference', line.frame ?? shot.start_frame, shot.shot_id);
    }
    body.image_uri = shots[0]?.images.find(image => image.role === 'start')?.image_uri;
    if (body.scene_audio && scene.audio) {
      const mime = GENAI_AUDIO_TYPES[path.extname(scene.audio.path).toLowerCase()];
      if (!mime) throw new Error('scene_audio@0: unsupported audio format');
      body.scene_audio.audio_uri = await stageBytes(readFileSync(scene.audio.path),mime,'scene_audio',0);
    }
    wire = JSON.stringify(body);
  }
  return {body, attachments, bodySha256:createHash('sha256').update(wire).digest('hex'), bytes:Buffer.byteLength(wire)};
}

/** Send the full scene to the authenticated validation-only route. A schema pass never authorizes execution. */
async function validateScenePayload(endpoint: string, scene: SceneRequest, model: string, resolution: string, requestId: string) {
  let sent: {bodySha256:string; bytes:number; requestBody?:unknown; attachments?:unknown} | undefined;
  try {
    const {body, attachments, bytes, bodySha256} = await buildSceneWire(scene, model, resolution);
    sent = {bodySha256, bytes, ...(attachments.length ? {requestBody:body, attachments} : {})};
    const result = await requestGenai('POST', endpoint, body, 120000, undefined, undefined, requestId);
    const accepted = z.object({schema_valid:z.literal(true),model:z.literal(model)}).safeParse(result);
    return {endpoint, requestId, ...sent, status:accepted.success ? 'schema_accepted' : 'unverified', result:accepted.data};
  } catch (error) {
    if (error instanceof GenaiRequestError && [400,422].includes(error.httpStatus))
      return {endpoint, requestId, ...sent, status:'schema_rejected', httpStatus:error.httpStatus, detail:error.message};
    return {endpoint, requestId, ...sent, status:'unverified', detail:error instanceof Error ? error.message : String(error)};
  }
}
/** Decide using ALL scene inputs before building any provider fields or saving an executable plan. */
export function mapSceneInputs(request: SceneRequest, tool: string, model?: string, missing: Issue[] = [], resolution?: string) {
  const caps = sceneInputCapabilities(tool);
  if (request.audio?.mode === 'mix') missing.push({input:'audio',frame:0,reason:'Mixing with native sound requires per-shot scene rendering'});
  if (!caps.frameAccurateCuts && !request.modelPacedCuts) missing.push(...request.cuts.map(c => ({ input:'transition', shotId:c.to, frame:c.frame, role:c.transition, reason:'No frame-addressed ' + c.transition + ' boundary' })));
  for (const shot of request.shots) {
    if (!shot.framing || !shot.action) missing.push({input:'direction', shotId:shot.shotId, frame:shot.startFrame,
      reason:'Write the missing English framing/action in story_shot.timeline'});
    if (tool === 'astra_genai_img2video' && request.shots.length > 1 && !request.modelPacedCuts && shot.openingPositions?.length && !caps.shotScopedReferences)
      missing.push({input:'position', role:'opening_positions', shotId:shot.shotId, frame:shot.startFrame, endFrame:shot.endFrame,
        reason:'The renderer has no shot-local opening positions for its subject slots'});
    if (!request.audio && !caps.frameAddressedNativeDialogue) for (const line of shot.dialogue ?? []) {
      if (line.delivery === 'voiceover' || (request.modelPacedCuts || request.shots.length === 1) && line.frame === undefined) continue;
      const scope = {shotId:shot.shotId, frame:line.frame ?? shot.startFrame, endFrame:shot.endFrame, speaker:line.speaker, lineId:line.lineId};
      missing.push({...scope, input:'dialogue', role:line.delivery, reason:line.frame === undefined
        ? 'Native dialogue has no shot-scoped speaker interval' : 'Native dialogue has no frame-addressed onset'});
      if (line.voice && request.shots.length > 1) missing.push({...scope, input:'voice', role:'voice_reference', path:line.voice.path,
        reason:'Voice timbre is bound to a global subject slot, without a shot interval'});
    }
    if (request.shots.length > 1 && !request.modelPacedCuts && shot.sound && !request.audio)
      missing.push({input:'sound', role:'scene_sound', shotId:shot.shotId, frame:shot.startFrame, endFrame:shot.endFrame,
        reason:'No timed native sound cue for this shot on a single scene soundtrack'});
  }
  const pins = request.images.filter(temporal);
  const refs = request.images.filter(p => !temporal(p) && (p.reference?.scope !== 'scene' || p.shotId === request.shotIds[0]));
  for (const ref of refs) if (ref.strength !== undefined && ref.strength !== 1)
    missing.push({input:'reference',role:ref.role,shotId:ref.shotId,frame:ref.frame,path:ref.path,reason:'Individual subject strength is unsupported'});
  const opening = pins.some(p => p.role === 'start' && p.frame === 0);
  const timedLimit = tool === 'astra_genai_desktop_keyframes' ? 10 : 8;
  for (const [index,p] of pins.entries()) {
    if (tool === 'astra_genai_img2video' && !caps.frameAccurateCuts && request.cuts.some(cut => cut.transition === 'hard_cut' &&
        ((p.role === 'start' && p.shotId === cut.to && p.frame === cut.frame) || (p.role === 'end' && p.shotId === cut.from && p.frame === cut.frame - 1))))
      missing.push({input:'image', shotId:p.shotId, frame:p.frame, path:p.path, role:p.role,
        reason:'A temporal pin conditions a frame but cannot enforce this image at a shot boundary'});
    if (caps.timedImages && index >= timedLimit) {
      missing.push({input:'image',shotId:p.shotId,frame:p.frame,path:p.path,role:p.role,reason:'Exceeds the adapter limit of ' + timedLimit + ' timed images'});
      continue;
    }
    if (!caps.timedImages && p.role === 'end' && p.frame === request.frameCount - 1 && caps.endingImage && !opening) {
      missing.push({input:'image',shotId:p.shotId,frame:p.frame,path:p.path,role:p.role,reason:'The last-image slot requires an opening image'});
      continue;
    }
    const endpoint = p.role === 'start' && p.frame === 0 && caps.openingImage ||
      p.role === 'end' && p.frame === request.frameCount - 1 && caps.endingImage;
    if (caps.timedImages || endpoint && (p.strength === undefined || p.strength === 1)) continue;
    missing.push({ input:'image', shotId:p.shotId, frame:p.frame, role:p.role, path:p.path, reason:'No temporal image slot at this frame' });
  }
  if (tool === 'astra_genai_img2video' && !pins.some(p => p.frame === 0 && (p.strength ?? 1) === 1))
    missing.push({input:'image',frame:0,reason:'Gateway I2V requires a full-strength opening image'});
  const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
  if (assets) {
    const issue = assets.validate(refs, model);
    if (issue) missing.push(...(refs.length ? refs : [undefined]).map(p => ({
      input:'reference', shotId:p?.shotId ?? request.shotIds[0], frame:p?.frame ?? 0, path:p?.path, role:p?.role, reason:issue,
    })));
  }
  for (const p of refs) {
    if (p.reference?.scope === 'shot_guide' && tool === 'seedance_reference' && (request.shots.length === 1 || request.modelPacedCuts)) continue;
    if (request.shots.length > 1 && !caps.shotScopedReferences && p.reference?.scope !== 'scene') {
      missing.push({input:'reference', shotId:p.shotId, frame:p.frame, path:p.path, role:p.role, reason:'Subject/reference slots apply across the whole generation'});
      continue;
    }
    if (p.frame === 0 && (assets || tool === 'astra_genai_msr' || tool === 'seedance_reference' && (p.strength ?? 1) === 1)) continue;
    if (tool === 'astra_genai_img2video' && model === 'ltx-2.5-22b-distilled' && p.frame === 0) continue;
    missing.push({ input:'reference', shotId:p.shotId, frame:p.frame, path:p.path, role:p.role, reason:'No compatible subject/reference slot with this frame scope' });
  }
  if (request.audio && !caps.sceneAudio) missing.push({ input:'audio', frame:0, path:request.audio.path, reason:'No continuous supplied soundtrack with these inputs' });
  if (tool === 'astra_genai_img2video' && request.shots.length > 1) {
    const wholeSeconds = request.frameCount % request.fps === 0;
    const onGrid = request.frameCount >= 25 && (request.frameCount - 1) % 8 === 0;
    if (request.frameCount > 361 || !wholeSeconds && !onGrid)
      missing.push({input:'duration', frame:request.frameCount - 1, role:'scene_length',
        reason:'Gateway I2V takes whole seconds or 25–361 frames on the 8k+1 grid; the exact scene length must fit'});
  }
  if (missing.length) throw new SceneInputError(tool, request, missing, model, resolution);
  return { pins, refs, caps };
}

export function timedImageArgs(tool: string, pins: SceneImage[]) {
  const desktop = tool === 'astra_genai_desktop_keyframes';
  const key = desktop ? 'keyframes' : 'images', index = desktop ? 'frameIndex' : 'frameIdx';
  const imageBindings = pins.map((p,i) => ({ ...verifyImageFile(p.path), ...p, id: p.shotId + '-' + i, parameter:key + '[' + i + ']', use:'video', purpose:p.cue ?? p.role, submitted:true }));
  return { args: { [key]: pins.map(p => ({imagePath:p.path, [index]:p.frame, strength:p.strength ?? 1})) }, imageBindings };
}

export function sceneImageBindings(request: SceneRequest, tool: string, bindings: ImageBinding[]) {
  const refs = request.images.filter(image => !temporal(image));
  const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
  let slot = 0;
  return bindings.map(binding => {
    if ('parameter' in binding || !binding.submitted) return binding;
    const endpoint = binding.id === 'start' || binding.id === 'end';
    const index = endpoint ? -1 : refs.findIndex(p => p.path === binding.path && (!p.reference || p.reference.id === binding.id));
    const image = endpoint ? request.images.find(p => p.path === binding.path && p.frame === (binding.id === 'start' ? 0 : request.frameCount - 1))
      : index >= 0 ? refs.splice(index, 1)[0] : undefined;
    if (!image) return binding;
    const parameter = endpoint ? FRAME_FIELDS[tool]?.[binding.id === 'start' ? 0 : 1]
      : tool === 'seedance_reference' ? 'referenceImagePaths[' + slot++ + ']'
      : assets ? assets.parameter + '[' + slot++ + ']' : 'references[' + slot++ + '].imagePath';
    return { ...binding, shotId:image.shotId, frame:image.frame, role:image.role, parameter, character:image.character };
  });
}

/** Map the accepted scene to the existing image/voice adapter pipeline. Never pass the
 * internal scene manifest as unrecognised provider parameters. */
export function bindSceneAdapter(request: SceneRequest, tool: string, model: string | undefined,
  shot: Record<string,unknown>, input: Record<string,unknown>, episode: string, resolution?: string) {
  const { pins, refs, caps } = mapSceneInputs(request, tool, model, [], resolution);
  const args: Record<string,unknown> = {};
  const sceneSeconds = request.frameCount / request.fps;
  for (const field of ['duration','durationSeconds','requiredSeconds']) {
    if (tool.startsWith('seedance_') && field === 'durationSeconds' && input[field] === -1) continue;
    if (input[field] !== undefined && input[field] !== sceneSeconds)
      throw new Error('scene_video_timing: ' + field + ' differs from the authored scene duration');
  }
  if (['numFrames','frames'].some(field => input[field] !== undefined && input[field] !== request.frameCount))
    throw new Error('scene_video_timing: requested frame count differs from the storyboard');
  const { fpsField } = caps;
  if (fpsField) {
    if (input[fpsField] !== undefined && input[fpsField] !== request.fps)
      throw new Error('scene_video_timing: adapter fps differs from storyboard');
    args[fpsField] = request.fps;
  } else if (request.fps !== 24) {
    throw new Error('scene_video_timing: adapter fps is unverified');
  }

  if (request.audio) {
    if (input.allowAudioTruncation === true || Number(input.audioStartTime ?? 0) !== 0 ||
        input.audioMaxDuration !== undefined && input.audioMaxDuration !== sceneSeconds)
      throw new Error('scene_audio_timing: keep the complete scene track at its authored offset');
    if (tool === 'astra_audio2video') {
      if ((request.frameCount - 1) % 8 !== 0)
        throw new SceneInputError(tool,request,[{input:'audio',frame:0,path:request.audio.path,reason:'The frame count of the complete track must fit the 8k+1 frame grid'}]);
      if (input.duration === undefined && input.audioMaxDuration === undefined) args.numFrames = request.frameCount;
    }
    if (input.audioUri || input.audioPath && realpathSync(path.resolve(episode,String(input.audioPath))) !== request.audio.path)
      throw new Error('scene_audio_mismatch: use the storyboard scene track');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','a:0','-show_entries',
      'stream=channels,sample_rate:format=duration','-of','json',request.audio.path], { encoding:'utf8', timeout:10000 }));
    const samples = probe.streams?.[0], seconds = Number(probe.format?.duration);
    if (!samples || !Number.isFinite(seconds) || Math.abs(seconds * request.fps - request.frameCount) >= 0.5)
      throw new Error('scene_audio_timing: supply the scene-length track including lead-in silence');
    if (tool === 'astra_genai_audio2video' && Math.ceil(seconds * request.fps - 1e-8) !== request.frameCount)
      throw new Error('scene_audio_timing: the gateway audio duration places its last frame outside the authored interval');
    if (tool === 'astra_genai_audio2video' && (request.frameCount > 361 || ![1,2].includes(samples.channels) ||
      ![7350,8000,11025,12000,16000,22050,24000,32000,44100,48000,64000,88200,96000].includes(Number(samples.sample_rate))))
      throw new SceneInputError(tool,request,[{input:'audio',path:request.audio.path,frame:0,reason:'A2V requires mono/stereo, an AAC sample rate and a maximum of 361 frames'}]);
    args.audioPath = request.audio.path;
  }

  const gateway = tool === 'astra_genai_img2video' || tool === 'astra_genai_audio2video';
  const start = gateway ? pins.find(p => p.frame === 0 && (p.strength ?? 1) === 1) : pins.find(p => p.role === 'start');
  const end = gateway ? start && pins.find(p => p.frame === request.frameCount - 1 && (p.strength ?? 1) === 1) : pins.find(p => p.role === 'end');
  const intermediate = gateway ? pins.filter(p => p !== start && p !== end) : [];
  const gatewayKeyframes = intermediate.length ? {
    args: { keyframes: intermediate.map(p => ({ imagePath:p.path, frameIdx:p.frame, strength:p.strength ?? 1 })) },
    imageBindings: intermediate.map((p,i) => ({ ...verifyImageFile(p.path), ...p, id:p.shotId + '-keyframe-' + i,
      parameter:'keyframes[' + i + '].imagePath',use:'video',purpose:p.cue ?? p.role,submitted:true })),
  } : undefined;
  const visual = shot.visual as Record<string,unknown> | undefined;
  const positions = (shot.visual as {video?: {openingPositions?: SceneVideoDirection['openingPositions']}} | undefined)?.video?.openingPositions ?? [];
  const subjects = refs.filter(p => !['background','location'].includes(p.role));
  const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
  if (assets && positions.filter(p => p.images.length).length > 1)
    throw new SceneInputError(tool, request, [{input:'reference', shotId:request.shotIds[0], frame:0, reason:'Veo assets must identify the same subject in openingPositions'}]);
  for (const owner of positions) {
    for (const slot of owner.images) {
      if (!subjects[slot - 1]) throw new SceneInputError(tool,request,[{input:'reference',role:'character',
        reason:owner.character + ' names missing subject Image ' + slot}]);
    }
  }
  for (const [i,p] of subjects.entries()) {
    if (p.character && !positions.some(row => row.character === p.character && row.images.includes(i + 1)))
      throw new Error('scene_reference_owner: match ' + p.shotId + ' ' + p.role + ' reference ' + (i+1) + ' to ' + p.character + ' in openingPositions');
  }
  const references = refs.map((p,i) => p.reference ?? { id:'subject-' + i, role:p.role === 'prop' ? 'prop' : 'character', use:'video', path:p.path,
    purpose: [p.character,p.role].filter(Boolean).join(' ') + ' reference only. Use the shot action for entrance timing.' });
  // Subject assets go through the shot binder, which attaches the same ordered
  // reference descriptions and preserve/avoid instructions to the provider prompt.
  const projected = { ...visual, frames: { mode:assets || tool === 'astra_genai_msr' || tool === 'seedance_reference' ? 'reference' : end ? 'first_last' : 'first', start:start?.path, end:end?.path }, references,
    bg:start?.path, imagePair:undefined, lastImagePath:undefined };
  if (caps.timedImages || assets || !request.images.length) {
    const fields = ['images','keyframes','sourceImagePath','lastImagePath','imagePath','imageUri','lastFramePath',
      'firstFramePath','firstFrameImagePath','lastFrameImagePath','lastFrameUri','referenceImagePaths','references'];
    // Saved gateway plans can repeat their two endpoint fields. prepareVideoImages checks
    // them against the storyboard, including the actual bytes for inline I2V images.
    const endpoints = gateway && start ? FRAME_FIELDS[tool] : undefined;
    if (fields.some(k => k in input && !endpoints?.some(field => field === k)))
      throw new Error('image_plan_mismatch: declare video images on their storyboard shots');
  }
  const timedImages = gateway ? (!start ? gatewayKeyframes : undefined) : caps.timedImages ? timedImageArgs(tool, pins) : undefined;
  Object.assign(args, timedImages?.args);
  if (tool.startsWith('astra_genai_desktop_') && !request.audio)
    args.duration = input.duration ?? request.frameCount / request.fps;
  return { args, shot:{...shot,visual:projected}, timedImages, gatewayKeyframes };
}

/** The v2 subject extension and Desktop device matrix can vary by deployment.
 * A static schema alone cannot authorize these combinations. Both calls are read-only. */
export async function checkSceneDeployment(request: SceneRequest, tool: string, args: Record<string,unknown>) {
  const fail = (reason: string): never => {
    const pins = request.images.filter(p => tool !== 'astra_genai_img2video' || !temporal(p));
    const missing: Issue[] = [{input:'deployment',reason}, ...pins.map(p => ({
      input: temporal(p) ? 'image' : 'reference', shotId:p.shotId, frame:p.frame, path:p.path, role:p.role, reason,
    }))];
    if (request.audio) missing.push({input:'audio',frame:0,path:request.audio.path,reason});
    throw new SceneInputError(tool, request, missing);
  };
  if (tool === 'astra_genai_img2video' && Array.isArray(args.references)) {
    const capabilities = await requestGenai('GET','/v1/ltx/msr/capabilities',undefined,15000)
      .catch(() => fail('Cannot verify combined image and reference support'));
    if (z.object({image_conditioning:z.literal(true)}).safeParse(capabilities).success === false)
      fail('Gateway does not advertise combined start frame and subject conditioning');
  }
  if (!tool.startsWith('astra_genai_desktop_')) return;
  const cell = z.object({ fps_to_durations:z.record(z.array(z.number())), aspect_ratios:z.array(z.string()) });
  const catalog = z.object({ active_model:z.string().nullable().optional(), data:z.array(z.object({
    id:z.string(), features:z.array(z.string()), generation_combinations:z.record(cell), audio_combinations:z.record(cell),
    excluded_aspect_combinations:z.array(z.record(z.unknown())).optional(),
  })) }).safeParse(await requestGenai('GET','/v1/ltx/desktop/models',undefined,15000).catch(() => fail('Desktop model catalog unavailable')));
  if (!catalog.success) return fail('Desktop model matrix unavailable');
  const model = catalog.data.data.find(row => row.id === args.model);
  const feature: Record<string,string> = {text:'text-to-video',image:'image-to-video',audio:'audio-to-video',keyframe:'keyframes'};
  const operation = feature[VIDEO_ADAPTERS[tool].operation];
  if (!model?.features.includes(operation) || operation === 'keyframes' && catalog.data.active_model !== args.model)
    return fail('Selected Desktop model does not offer the requested operation or active keyframe pipeline');
  const matrix = operation === 'audio-to-video' ? model.audio_combinations : model.generation_combinations;
  const entry = matrix[String(args.resolution)];
  const durations = entry?.fps_to_durations[String(args.fps)];
  const selection = {...args, audio:false};
  const excluded = model.excluded_aspect_combinations?.some(block => Object.entries(block)
    .every(([key,value]) => (selection as Record<string,unknown>)[key] === value));
  if (!durations?.length || args.aspectRatio !== 'auto' && !entry.aspect_ratios.includes(String(args.aspectRatio)) ||
      typeof args.duration === 'number' && !durations.includes(args.duration) ||
      excluded)
    fail('Selected Desktop model does not offer this resolution, frame rate, duration and aspect ratio');
}
