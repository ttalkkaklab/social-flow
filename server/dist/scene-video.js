import { fasth3RenderFrames } from './fasth3-omni.js';
// Frame numbers throughout this module are relative to the scene. Shot ends are exclusive.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { openingPrompt, shotTimelineSchema } from './msr-opening.js';
import { resolvedDirection, attributeWords, commonCameraWords, sceneShotNotes, shotVisualParts, shotVisualWords, sceneCameraDirection, scenePromptText, sceneVoiceDirection } from './video-prompt.js';
import { checkVoiceoverDirection, nonEnglishOutsideQuotes } from './prompt-language.js';
import { sceneTimelineWords } from './scene-prompt.js';
import { formatReferenceLabel } from './scene-prompt-profile.js';
export { sceneTimelineWords } from './scene-prompt.js';
import { verifyImageFile } from './image-media.js';
import { HOSTED_VIDEO_ROUTES } from './hosted-video-routes.js';
import { astraGenaiBaseUrl, requestGenai } from './astra-genai-client.js';
import { FRAME_FIELDS, requiredCharacters, sceneInputCapabilities, VIDEO_ADAPTERS } from './video-registry.js';
import { currentSceneVoice } from './video-voice.js';
const load = createRequire(import.meta.url);
const temporal = (image) => ['start', 'keyframe', 'end'].includes(image.role) && !image.reference;
const english = (value) => value && !nonEnglishOutsideQuotes(value) ? value : '';
export function sceneCoverage(members, scene, board, sceneNo = members[0]?.scene) {
    const owner = board?.STRUCTURE?.scenes?.find(s => s.no === sceneNo);
    return resolvedDirection({ directionDefaults: owner?.directionDefaults, videoDirection: scene }, members);
}
export function compileSceneTimeline(raw, scene, episode, board, coverage = sceneCoverage(raw, scene, board), namedReferencesOnly = false, guideMode, guideLimit, concise = false) {
    const render = load('../../skills/storyboard/references/render-routing.js');
    const members = raw;
    const fps = scene.fps ?? 24;
    if (scene.oneTake && members.length !== 1)
        throw new Error('scene_one_take: an uninterrupted camera setup must have one shot');
    const shotIds = members.map(s => s.id);
    if (new Set(shotIds).size !== members.length)
        throw new Error('scene_video_timing: duplicate shot ID');
    let cursor = 0, seconds = 0;
    const images = [];
    const requiredPaths = new Set();
    if (guideLimit !== undefined)
        for (const member of members) {
            for (const ref of render.imageReferences(member))
                if (['both', 'video'].includes(ref.use))
                    requiredPaths.add(ref.path);
        }
    let guideSlots = guideLimit === undefined ? Infinity : Math.max(0, guideLimit - requiredPaths.size - (render.framePlan(members[0]).start ? 1 : 0));
    const guides = [];
    const shots = members.map((member, index) => {
        const { id: shotId, visual } = member;
        const timeline = member.timeline && shotTimelineSchema.parse(member.timeline);
        seconds += member.duration;
        const startFrame = cursor, endFrame = Math.round(seconds * fps);
        const incoming = member.transition && member.transition !== 'cut' ? member.transition : 'hard_cut';
        const transition = timeline?.transition ?? (index === 0 ? 'open' : incoming);
        if (endFrame <= cursor || timeline && (timeline.startFrame !== startFrame || timeline.endFrame !== endFrame) ||
            (transition === 'open') !== (index === 0))
            throw new Error('scene_video_timing: inconsistent frame range or transition on ' + shotId);
        cursor = endFrame;
        const notes = sceneShotNotes(raw[index], concise);
        const shotFraming = shotVisualWords(raw[index], coverage.shots[index], coverage.common, concise ? '' : notes.end, timeline?.framing, concise);
        const framing = shotFraming || (coverage.common.camera ? attributeWords('camera', coverage.common.camera)
            : members.length === 1 ? 'Use the opening composition.' : '');
        const action = [notes.action || (members.length === 1 ? scene.action || scene.emotion : ''), ...notes.beats].filter(Boolean).join(' ');
        const pins = [...(timeline?.images ?? [])];
        for (const pin of scene.keyframes ?? []) {
            if (pin.frame >= startFrame && pin.frame < endFrame)
                pins.push({ ...pin, role: 'keyframe' });
        }
        const frames = render.framePlan(member);
        const legacy = visual?.frames;
        const fallback = legacy?.keyframes === undefined ? legacy?.storyboardKeyframes : undefined;
        for (const pin of fallback ?? []) {
            const frame = pin.startFrame !== undefined && pin.startFrame >= startFrame ? pin.startFrame
                : pin.startSeconds !== undefined ? startFrame + Math.round(pin.startSeconds * fps) : pin.startFrame;
            if (!pin.file || frame === undefined || !Number.isInteger(frame))
                throw new Error('scene_image_timing: malformed storyboardKeyframes on ' + shotId);
            const role = frame === startFrame ? 'start' : pin.file === frames.end ? 'end' : 'keyframe';
            if (!pins.some(p => p.frame === frame && p.path === pin.file))
                pins.push({ path: pin.file, frame, role });
        }
        for (const pin of legacy?.keyframes ?? []) {
            const frame = startFrame + Math.round(pin.atSeconds * fps);
            if (!pins.some(p => p.frame === frame && p.path === pin.image))
                pins.push({ path: pin.image, frame, role: 'keyframe', cue: english(pin.state), strength: pin.strength });
        }
        // Reference-mode display images are not temporal pins. Named video/both assets carry appearance.
        if (frames.start && !(namedReferencesOnly && frames.mode === 'reference') && !pins.some(p => p.role === 'start' && p.path === frames.start))
            pins.push({ path: frames.start, frame: startFrame, role: 'start' });
        if (frames.end && !pins.some(p => p.role === 'end' && p.path === frames.end && (!fallback || p.frame === endFrame - 1)))
            pins.push({ path: frames.end, frame: endFrame - 1, role: 'end' });
        const occupied = new Set();
        const references = render.imageReferences(member).filter((r) => ['video', 'both'].includes(r.use));
        const add = (pin) => {
            if (!Number.isSafeInteger(pin.frame) || pin.frame < startFrame || pin.frame >= endFrame)
                throw new Error('scene_image_timing: ' + shotId + ' ' + pin.path + ' at ' + pin.frame);
            const image = { ...pin, shotId, path: realpathSync(path.resolve(episode, 'storyboard', pin.path)) };
            if (temporal(image)) {
                if (occupied.has(pin.frame))
                    throw new Error('scene_image_conflict: ' + shotId + ' has two temporal images at frame ' + pin.frame);
                occupied.add(pin.frame);
            }
            images.push(image);
        };
        const people = requiredCharacters(raw[index]);
        const ownerOf = (file) => people.find(person => file === person.face?.path || file === person.bodyPath)?.character;
        const claimed = new Set();
        for (const pin of pins.sort((a, b) => a.frame - b.frame)) {
            const ref = ['face', 'outfit'].includes(pin.role) ? references.find(r => r.path === pin.path) : undefined;
            if (ref)
                claimed.add(ref);
            const owner = ref && ownerOf(ref.path);
            if (owner && pin.character && pin.character !== owner)
                throw new Error('scene_reference_owner: ' + shotId + ' assigns ' + ref.path + ' to the wrong character');
            add(ref ? { ...pin, ...(owner ? { character: owner } : {}), reference: ref } : pin);
        }
        for (const ref of references)
            if (!claimed.has(ref))
                add({ path: ref.path, role: ref.scope === 'scene' && ref.id.endsWith('-face') ? 'face' : ref.role, frame: startFrame, reference: ref, ...((ref.character || ownerOf(ref.path)) ? { character: ref.character || ownerOf(ref.path) } : {}) });
        if (member.referenceImage && !pins.some(pin => pin.role === 'start' && pin.frame === startFrame && pin.path === member.referenceImage)) {
            // Distilled I2V accepts a background alongside at least one subject.
            const subjectMissing = guideMode === 'background' && !references.some(ref => !['background', 'location'].includes(ref.role));
            const occupied = guideMode === 'background' && references.some(ref => ['background', 'location'].includes(ref.role));
            const guide = { shotId, path: member.referenceImage, submitted: Boolean(guideMode && guideSlots > 0 && !occupied && !subjectMissing) };
            if (guideMode && guide.submitted) {
                guideSlots--;
                const purpose = index === 0 ? 'Composition for the opening view.' : `Composition for the view after cut ${index}.`;
                const reference = { id: shotId + '-composition', role: guideMode, use: 'video', scope: 'shot_guide', path: member.referenceImage, purpose };
                add({ path: member.referenceImage, role: guideMode, frame: startFrame, reference });
                guides.push(guide);
            }
            else {
                const reason = subjectMissing ? 'The background reference input requires a separate subject reference.' :
                    guideMode ? 'No free composition-reference slot.' : 'The selected operation has no compatible composition-reference input.';
                guides.push({ ...guide, reason });
            }
        }
        // Older approved single-shot plans already bind their narration and voices in
        // the adapter. Preserve their manifest and hash unless a timeline adds a binding.
        const scoped = members.length > 1 || timeline?.openingPositions || timeline?.dialogueCues?.length;
        if (members.length === 1 && timeline?.openingPositions && scene.openingPositions &&
            JSON.stringify(timeline.openingPositions) !== JSON.stringify(scene.openingPositions))
            throw new Error('scene_opening_positions: a single shot and its scene must have the same opening positions');
        let positions = scoped ? timeline?.openingPositions ?? visual?.video?.openingPositions ?? (index === 0 ? scene.openingPositions : undefined) : undefined;
        const blocking = notes.blocking;
        const perspective = !coverage.common.soundPerspective && coverage.shots[index].soundPerspective;
        const sound = [notes.sound, perspective && attributeWords('soundPerspective', perspective)].filter(Boolean).join(' ');
        const ordered = load('../../skills/storyboard/references/scene-direction.js').orderedSpeech;
        const lines = scoped ? ordered(member).filter(line => line.tts?.trim()) : [];
        for (const cue of timeline?.dialogueCues ?? []) {
            if (lines.filter(line => line.id === cue.lineId).length !== 1)
                throw new Error('scene_dialogue_timing: ' + shotId + ' needs one spoken line with id ' + cue.lineId);
        }
        const dialogue = lines.filter(line => line.delivery !== 'voiceover').map(line => {
            const frame = timeline?.dialogueCues?.find(c => c.lineId === line.id)?.frame;
            const warnings = [];
            const nativeVoice = line.delivery !== 'voiceover' && (!scene.audio || scene.audio.mode === 'mix') && scene.dialogueVoice !== 'model_generated';
            const voice = nativeVoice && currentSceneVoice(board, path.join(episode, 'storyboard'), raw[index], line.speaker, warnings);
            const direction = sceneVoiceDirection(line.acting, line.tts);
            return { lineId: line.id, speaker: line.speaker, delivery: line.delivery, text: line.tts,
                ...(direction ? { direction } : {}),
                ...(frame !== undefined ? { frame } : {}), ...(voice ? { voice } : {}),
                ...(warnings.length ? { warnings } : {}) };
        });
        return { shotId, startFrame, endFrame, transition, framing, action,
            ...(timeline?.transitionCue ? { transitionCue: timeline.transitionCue } : {}),
            ...(concise && notes.end ? { closingState: notes.end } : {}),
            ...(positions?.length ? { openingPositions: positions } : {}), ...(blocking ? { blocking } : {}),
            ...(sound ? { sound } : {}), ...(dialogue.length ? { dialogue } : {}) };
    });
    if (scene.keyframes?.some(pin => pin.frame <= 0 || pin.frame >= cursor - 1))
        throw new Error('scene_image_timing: scene keyframes must fall between the opening and ending frames');
    const cuts = shots.slice(1).map(({ shotId, startFrame: frame, transition, transitionCue }, i) => ({ from: shots[i].shotId, to: shotId, frame, transition, ...(transitionCue ? { transitionCue } : {}) }));
    const audio = scene.audio && { ...(scene.audio.mode ? { mode: scene.audio.mode } : {}), path: realpathSync(path.resolve(episode, 'storyboard', scene.audio.path)), startFrame: 0, endFrame: cursor, cues: scene.audio.cues ?? [] };
    if (audio?.cues.some(c => c.frame >= cursor))
        throw new Error('scene_audio_timing: cue outside the scene');
    return { fps, frameCount: cursor, shotIds, shots, images, cuts, ...(guides.length ? { shotReferenceImages: guides } : {}), ...(audio ? { audio } : {}) };
}
/** Older video references point to a registered cast panel but carry no cast ID. */
export function bindRegisteredPanels(scene, episode, board) {
    const cast = board.SB_DOC?.characters ?? [];
    const owners = new Map();
    for (const actor of cast) {
        for (const file of Object.values(actor.panels ?? {})) {
            if (typeof file !== 'string')
                continue;
            const local = path.resolve(episode, 'storyboard', file);
            if (!existsSync(local))
                continue;
            const panel = realpathSync(local);
            const ids = owners.get(panel) ?? new Set();
            ids.add(actor.id);
            owners.set(panel, ids);
        }
    }
    for (const image of scene.images) {
        if (image.role !== 'character' || image.character)
            continue;
        const ids = owners.get(image.path);
        if (ids?.size === 1)
            image.character = [...ids][0];
    }
}
/** Compile once, then present the complete scene to the selected adapter's input mapper. */
export function prepareSceneRequest(sceneNo, members, scene, episode, dialogue, options, mapInputs, board) {
    const coverage = sceneCoverage(members, scene, board, sceneNo);
    const owner = board?.STRUCTURE?.scenes?.find(s => s.no === sceneNo);
    load('../../skills/_shared/scene-cast.js').sceneCast(owner ?? { no: sceneNo }, members);
    const ownsFrames = owner?.frames !== undefined || owner?.speakers !== undefined;
    // GenAI and Seedance pace their own cuts. Frame intervals on the board guide the prompt.
    const modelPacedCuts = members.length > 1 && (options.sceneMode || options.profile?.writer === 'seedance' || ownsFrames &&
        !scene.audio && members.every((card, index) => !card.timeline && (index === 0 || !card.transition || card.transition === 'cut')));
    const cutTiming = options.profile?.cutTiming;
    const directedCuts = cutTiming === 'time_ranges' || cutTiming === 'action_beats';
    const concise = modelPacedCuts && (options.bindDialogue || directedCuts);
    const timeline = compileSceneTimeline(members, scene, episode, board, coverage, options.namedReferencesOnly, options.guideMode, options.guideLimit, concise);
    const fitStep = options.fitStep ?? 0;
    const fitted = fitStep ? fitSceneTimeline(timeline, members, scene, coverage, concise, fitStep) : timeline;
    const common = coverage.common;
    const camera = sceneCameraDirection([], commonCameraWords(common));
    const sharedSound = [scene.sound, common.soundPerspective && attributeWords('soundPerspective', common.soundPerspective)].filter(Boolean).join(' ');
    const directedScene = { ...scene, sound: sharedSound };
    const staging = Object.entries(common).filter(([key]) => !['camera', 'cameraPolicy', 'soundPerspective'].includes(key)).map(([key, row]) => attributeWords(key, row)).filter(Boolean).join(' ');
    const shared = [camera.instruction, staging].filter(Boolean).join(' ');
    const words = sceneTimelineWords(timeline, scene);
    const scopedDialogue = timeline.shots.some(s => s.dialogue?.length);
    const complete = scenePromptText(directedScene, shared, words, dialogue, scopedDialogue);
    const suffix = (value) => [value, options.suffix].filter(Boolean).join(' ');
    const prompt = suffix(openingPrompt(complete, scene.openingPositions));
    const providerTiming = { modelFacing: true, modelPacedCuts, cutTiming, writer: options.profile?.writer,
        wholeSecondShotRanges: options.profile?.wholeSecondShotRanges };
    const providerTimeline = sceneTimelineWords(fitted, scene, {
        ...providerTiming, includeDialogue: !options.bindDialogue,
        describeDelivery: modelPacedCuts && directedCuts && !options.bindDialogue && fitStep < 3,
    });
    const text = scenePromptText(directedScene, shared, providerTimeline, dialogue, options.bindDialogue || scopedDialogue, options.profile);
    const providerPrompt = suffix(options.bindOpening ? text : openingPrompt(text, scene.openingPositions, index => formatReferenceLabel(options.profile?.referenceLabels ?? 'indexed', 'image', index)));
    const request = { sceneNo, prompt, ...timeline, ...(modelPacedCuts ? { modelPacedCuts: true } : {}), ...(options.sceneMode ? { sceneMode: true } : {}), sceneDirection: { emotion: scene.emotion, ...(scene.action ? { action: scene.action } : {}),
            ...(camera.instruction ? { camera: camera.instruction } : {}), ...(staging ? { staging } : {}), ...(scene.oneTake ? { oneTake: true } : {}), ...(sharedSound ? { sound: sharedSound } : {}) } };
    const cards = members;
    const authored = cards.flatMap(card => card.narration ?? []);
    const sharedPicture = [request.sceneDirection, scene.openingPositions];
    checkVoiceoverDirection(sharedPicture, authored);
    const canonical = (value) => value?.normalize('NFKC').toLowerCase().replace(/[’‘]/gu, "'").replace(/[\p{P}\s]+/gu, '');
    for (const { dialogue: turns, ...shot } of timeline.shots) {
        // A physical turn can deliberately repeat the preceding thought. Only its
        // own interval may carry those words as dialogue or physical acting.
        const spoken = new Set(turns?.map(turn => canonical(turn.text)));
        const privateLines = authored.filter(line => line.delivery === 'voiceover' && !spoken.has(canonical(line.tts)));
        const picture = [shot, turns?.map(turn => turn.direction), timeline.images.filter(image => image.shotId === shot.shotId),
            timeline.audio?.cues?.filter(cue => cue.frame >= shot.startFrame && cue.frame < shot.endFrame)];
        checkVoiceoverDirection(picture, privateLines);
        const lines = cards.find(card => card.id === shot.shotId)?.narration ?? [];
        if (!turns?.length && lines.some(line => line.voiceoverKind === 'inner_thought'))
            checkVoiceoverDirection([sharedPicture, picture], lines, true);
    }
    // The image and voice binders add reference labels around this timeline after planning.
    const bindSceneTurns = (prompt, turns, describeDelivery = true) => {
        if (!prompt.includes(providerTimeline) || turns.length !== timeline.shots.reduce((n, shot) => n + (shot.dialogue?.length ?? 0), 0))
            throw new Error('scene_dialogue_binding: the dialogue no longer matches the planned shot sequence');
        return prompt.replace(providerTimeline, () => sceneTimelineWords(fitted, scene, { ...providerTiming, boundTurns: turns, describeDelivery: describeDelivery && fitStep < 3 }));
    };
    return { request, providerPrompt, camera, mapped: mapInputs(request), bindSceneTurns };
}
/**
 * A GenAI scene over its model's prompt cap is composed again with fewer optional words (user's choice 2026-11-25). Step 1
 * says each direction once and shortens the panel sentence; 2 leaves out depth and lighting notes; 3 vocal directions
 * and delivery labels; 4 shot expressions; 5 per-shot sound. Opening evidence, composition, movement, blocking, action
 * beats and closing states stay. If they cannot fit, the plan reports the prompt limit.
 */
export const SCENE_FIT_STEPS = ['repeated sentences and the long panel sentence', 'depth and lighting notes', 'vocal directions and delivery labels',
    'shot expressions', 'per-shot sound'];
function fitSceneTimeline(timeline, members, scene, coverage, concise, step) {
    // Match an entire direction. A phrase quoted or negated in another direction is a separate instruction.
    const body = (text) => text.trim().replace(/[.\s]+$/, '');
    const drop = new Set([...(step >= 2 ? ['depth', 'design'] : []),
        ...(step >= 4 ? ['expression'] : [])]);
    return { ...timeline, shots: timeline.shots.map((shot, index) => {
            const card = members[index], notes = sceneShotNotes(card, concise), said = new Set();
            const keep = (text) => text && !said.has(body(text)) ? (said.add(body(text)), text) : '';
            const framing = shotVisualParts(card, coverage.shots[index], coverage.common, concise ? '' : notes.end, card.timeline?.framing, concise).filter(part => !drop.has(part.kind))
                .map(part => keep(part.text)).filter(Boolean).join(' ');
            const blocking = keep(notes.blocking);
            const action = [keep(notes.action || (members.length === 1 ? scene.action || scene.emotion : '')),
                ...notes.beats.map(keep)].filter(Boolean).join(' ');
            const { blocking: _blocking, sound, closingState, ...rest } = shot;
            const dialogue = step >= 3 ? shot.dialogue?.map(({ direction: _direction, ...line }) => line) : shot.dialogue;
            return { ...rest, framing: framing || shot.framing, action, ...(dialogue ? { dialogue } : {}), ...(blocking ? { blocking } : {}),
                ...(step < 5 && sound ? { sound } : {}), ...(closingState ? { closingState } : {}) };
        }) };
}
export class SceneInputError extends Error {
    tool;
    sceneRequest;
    missing;
    model;
    resolution;
    constructor(tool, sceneRequest, missing, model, resolution) {
        super('scene_inputs_unsupported: ' + tool + ' ' + JSON.stringify(missing));
        this.tool = tool;
        this.sceneRequest = sceneRequest;
        this.missing = missing;
        this.model = model;
        this.resolution = resolution;
    }
}
/** What the deployment's scene mode takes, read from `GET /v1/models`. Nothing of the refused scene is sent. */
export async function inspectSceneInputContract(error) {
    if (error.tool !== 'astra_genai_scene')
        return undefined;
    const address = { baseUrl: astraGenaiBaseUrl(), endpoint: '/v1/generations', mode: 'scene' };
    try {
        const listed = z.object({ data: z.array(z.object({ id: z.string(), scene: z.record(z.unknown()).optional() }).passthrough()) })
            .parse(await requestGenai('GET', '/v1/models', undefined, 10000)).data;
        const scene = listed.find(model => model.id === error.model)?.scene;
        return scene ? { ...address, status: 'verified', scene } : { ...address, status: 'unverified' };
    }
    catch {
        return { ...address, status: 'unverified' };
    }
}
/** Decide using ALL scene inputs before building any provider fields or saving an executable plan. */
export function mapSceneInputs(request, tool, model, missing = [], resolution) {
    const caps = sceneInputCapabilities(tool);
    if (request.audio?.mode === 'mix')
        missing.push({ input: 'audio', frame: 0, reason: 'Mixing with native sound requires per-shot scene rendering' });
    if (!caps.frameAccurateCuts && !request.modelPacedCuts)
        missing.push(...request.cuts.map(c => ({ input: 'transition', shotId: c.to, frame: c.frame, role: c.transition, reason: 'No frame-addressed ' + c.transition + ' boundary' })));
    for (const shot of request.shots) {
        if (!shot.framing || !shot.action)
            missing.push({ input: 'direction', shotId: shot.shotId, frame: shot.startFrame,
                reason: 'Write the missing English framing/action in story_shot.timeline' });
        if (tool === 'astra_genai_img2video' && request.shots.length > 1 && !request.modelPacedCuts && shot.openingPositions?.length && !caps.shotScopedReferences)
            missing.push({ input: 'position', role: 'opening_positions', shotId: shot.shotId, frame: shot.startFrame, endFrame: shot.endFrame,
                reason: 'The renderer has no shot-local opening positions for its subject slots' });
        if (!request.audio && !caps.frameAddressedNativeDialogue)
            for (const line of shot.dialogue ?? []) {
                if (line.delivery === 'voiceover' || (request.modelPacedCuts || request.shots.length === 1) && line.frame === undefined)
                    continue;
                const scope = { shotId: shot.shotId, frame: line.frame ?? shot.startFrame, endFrame: shot.endFrame, speaker: line.speaker, lineId: line.lineId };
                missing.push({ ...scope, input: 'dialogue', role: line.delivery, reason: line.frame === undefined
                        ? 'Native dialogue has no shot-scoped speaker interval' : 'Native dialogue has no frame-addressed onset' });
                if (line.voice && request.shots.length > 1)
                    missing.push({ ...scope, input: 'voice', role: 'voice_reference', path: line.voice.path,
                        reason: 'Voice timbre is bound to a global subject slot, without a shot interval' });
            }
        if (request.shots.length > 1 && !request.modelPacedCuts && shot.sound && !request.audio)
            missing.push({ input: 'sound', role: 'scene_sound', shotId: shot.shotId, frame: shot.startFrame, endFrame: shot.endFrame,
                reason: 'No timed native sound cue for this shot on a single scene soundtrack' });
    }
    const pins = request.images.filter(temporal);
    let refs = request.images.filter(p => !temporal(p) && (p.reference?.scope !== 'scene' || p.shotId === request.shotIds[0]));
    // Scene mode spans every reference over the whole scene, so a shot's own reference joins the scene cast once (user's choice 2026-11-25).
    if (request.sceneMode) {
        const seen = new Set();
        refs = refs.filter(p => !seen.has(p.path) && Boolean(seen.add(p.path)));
    }
    for (const ref of refs)
        if (ref.strength !== undefined && ref.strength !== 1)
            missing.push({ input: 'reference', role: ref.role, shotId: ref.shotId, frame: ref.frame, path: ref.path, reason: 'Individual subject strength is unsupported' });
    const opening = pins.some(p => p.role === 'start' && p.frame === 0);
    const timedLimit = tool === 'astra_genai_desktop_keyframes' ? 10 : 8;
    for (const [index, p] of pins.entries()) {
        // Scene mode opens each shot on its start picture. An ending or a timed picture inside a shot is left out, and the plan names it.
        if (request.sceneMode)
            continue;
        if (tool === 'astra_genai_img2video' && !request.sceneMode && !caps.frameAccurateCuts && request.cuts.some(cut => cut.transition === 'hard_cut' &&
            ((p.role === 'start' && p.shotId === cut.to && p.frame === cut.frame) || (p.role === 'end' && p.shotId === cut.from && p.frame === cut.frame - 1))))
            missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role,
                reason: 'A temporal pin conditions a frame but cannot enforce this image at a shot boundary' });
        if (caps.timedImages && index >= timedLimit) {
            missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'Exceeds the adapter limit of ' + timedLimit + ' timed images' });
            continue;
        }
        if (!caps.timedImages && p.role === 'end' && p.frame === request.frameCount - 1 && caps.endingImage && !opening) {
            missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'The last-image slot requires an opening image' });
            continue;
        }
        const endpoint = p.role === 'start' && p.frame === 0 && (caps.openingImage || VIDEO_ADAPTERS[tool]?.voice === 'reference') ||
            p.role === 'end' && p.frame === request.frameCount - 1 && caps.endingImage;
        if (caps.timedImages || endpoint && (p.strength === undefined || p.strength === 1))
            continue;
        missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, role: p.role, path: p.path, reason: 'No temporal image slot at this frame' });
    }
    if (tool === 'astra_genai_img2video' && !pins.some(p => p.frame === 0 && (p.strength ?? 1) === 1))
        missing.push({ input: 'image', frame: 0, reason: 'Gateway I2V requires a full-strength opening image' });
    if (tool === 'astra_genai_img2video' || tool === 'astra_genai_msr') {
        for (const [background, limit] of [[false, 4], [true, 1]]) {
            const group = refs.filter(ref => ['background', 'location'].includes(ref.role) === background);
            for (const ref of group.slice(limit))
                missing.push({ input: 'reference', role: ref.role, shotId: ref.shotId, frame: ref.frame,
                    path: ref.path, reason: 'MSR accepts at most ' + limit + (background ? ' background' : ' subject references') + ' per render' });
        }
    }
    const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
    if (assets) {
        const issue = assets.validate(refs, model);
        if (issue)
            missing.push(...(refs.length ? refs : [undefined]).map(p => ({
                input: 'reference', shotId: p?.shotId ?? request.shotIds[0], frame: p?.frame ?? 0, path: p?.path, role: p?.role, reason: issue,
            })));
    }
    for (const p of refs) {
        if (request.sceneMode)
            continue;
        if (p.reference?.scope === 'shot_guide' && VIDEO_ADAPTERS[tool]?.voice === 'reference' && tool !== 'astra_genai_msr' && (request.shots.length === 1 || request.modelPacedCuts))
            continue;
        if (request.shots.length > 1 && !caps.shotScopedReferences && p.reference?.scope !== 'scene') {
            missing.push({ input: 'reference', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'Subject/reference slots apply across the whole generation' });
            continue;
        }
        if (p.frame === 0 && (assets || VIDEO_ADAPTERS[tool]?.voice === 'reference' && (p.strength ?? 1) === 1))
            continue;
        if (tool === 'astra_genai_img2video' && model === 'ltx-2.5-22b-distilled' && p.frame === 0)
            continue;
        missing.push({ input: 'reference', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'No compatible subject/reference slot with this frame scope' });
    }
    if (request.audio && !caps.sceneAudio)
        missing.push({ input: 'audio', frame: 0, path: request.audio.path, reason: 'No continuous supplied soundtrack with these inputs' });
    // Scene mode renders the next 8k+1 frames and cuts the clip back, so only the image route needs the exact grid.
    if (tool === 'astra_genai_img2video' && request.shots.length > 1 && !request.sceneMode) {
        const wholeSeconds = request.frameCount % request.fps === 0;
        const onGrid = request.frameCount >= 25 && (request.frameCount - 1) % 8 === 0;
        if (request.frameCount > 361 || !wholeSeconds && !onGrid)
            missing.push({ input: 'duration', frame: request.frameCount - 1, role: 'scene_length',
                reason: 'Gateway I2V takes whole seconds or 25–361 frames on the 8k+1 grid; the exact scene length must fit' });
    }
    if (missing.length)
        throw new SceneInputError(tool, request, missing, model, resolution);
    return { pins, refs, caps };
}
export function timedImageArgs(tool, pins) {
    const desktop = tool === 'astra_genai_desktop_keyframes';
    const key = desktop ? 'keyframes' : 'images', index = desktop ? 'frameIndex' : 'frameIdx';
    const imageBindings = pins.map((p, i) => ({ ...verifyImageFile(p.path), ...p, id: p.shotId + '-' + i, parameter: key + '[' + i + ']', use: 'video', purpose: p.cue ?? p.role, submitted: true }));
    return { args: { [key]: pins.map(p => ({ imagePath: p.path, [index]: p.frame, strength: p.strength ?? 1 })) }, imageBindings };
}
export function sceneImageBindings(request, tool, bindings) {
    const refs = request.images.filter(image => !temporal(image));
    const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
    let slot = 0;
    return bindings.map(binding => {
        if ('parameter' in binding || !binding.submitted)
            return binding;
        const endpoint = binding.id === 'start' || binding.id === 'end';
        const index = endpoint ? -1 : refs.findIndex(p => p.path === binding.path && (!p.reference || p.reference.id === binding.id));
        const image = endpoint ? request.images.find(p => p.path === binding.path && p.frame === (binding.id === 'start' ? 0 : request.frameCount - 1))
            : index >= 0 ? refs.splice(index, 1)[0] : undefined;
        if (!image)
            return binding;
        const listReference = VIDEO_ADAPTERS[tool]?.voice === 'reference' && tool !== 'astra_genai_msr';
        const parameter = listReference ? 'referenceImagePaths[' + slot++ + ']'
            : endpoint && tool === 'astra_genai_msr' ? 'references[' + slot++ + '].imagePath'
                : endpoint ? FRAME_FIELDS[tool]?.[binding.id === 'start' ? 0 : 1]
                    : tool === 'seedance_reference' ? 'referenceImagePaths[' + slot++ + ']'
                        : assets ? assets.parameter + '[' + slot++ + ']' : 'references[' + slot++ + '].imagePath';
        return { ...binding, shotId: image.shotId, frame: image.frame, role: image.role, parameter, character: image.character };
    });
}
/** Map the accepted scene to the existing image/voice adapter pipeline. Never pass the
 * internal scene manifest as unrecognised provider parameters. */
export function bindSceneAdapter(request, tool, model, shot, input, episode, resolution) {
    const { pins, refs, caps } = mapSceneInputs(request, tool, model, [], resolution);
    const args = {};
    const sceneSeconds = request.frameCount / request.fps;
    const renderFrames = tool === 'fasth3_omni_reference'
        ? fasth3RenderFrames(request.frameCount) : request.frameCount;
    if (tool === 'astra_genai_msr' || tool === 'fasth3_omni_reference')
        args.numFrames = renderFrames;
    for (const field of ['duration', 'durationSeconds', 'requiredSeconds']) {
        if (tool.startsWith('seedance_') && field === 'durationSeconds' && input[field] === -1)
            continue;
        if (input[field] !== undefined && input[field] !== sceneSeconds)
            throw new Error('scene_video_timing: ' + field + ' differs from the authored scene duration');
    }
    if (['numFrames', 'frames'].some(field => input[field] !== undefined && input[field] !== renderFrames))
        throw new Error('scene_video_timing: requested frame count differs from the storyboard');
    const { fpsField } = caps;
    if (fpsField) {
        if (input[fpsField] !== undefined && input[fpsField] !== request.fps)
            throw new Error('scene_video_timing: adapter fps differs from storyboard');
        args[fpsField] = request.fps;
    }
    else if (request.fps !== 24) {
        throw new Error('scene_video_timing: adapter fps is unverified');
    }
    if (request.audio) {
        if (input.allowAudioTruncation === true || Number(input.audioStartTime ?? 0) !== 0 ||
            input.audioMaxDuration !== undefined && input.audioMaxDuration !== sceneSeconds)
            throw new Error('scene_audio_timing: keep the complete scene track at its authored offset');
        if (tool === 'astra_audio2video') {
            if ((request.frameCount - 1) % 8 !== 0)
                throw new SceneInputError(tool, request, [{ input: 'audio', frame: 0, path: request.audio.path, reason: 'The frame count of the complete track must fit the 8k+1 frame grid' }]);
            if (input.duration === undefined && input.audioMaxDuration === undefined)
                args.numFrames = request.frameCount;
        }
        if (input.audioUri || input.audioPath && realpathSync(path.resolve(episode, String(input.audioPath))) !== request.audio.path)
            throw new Error('scene_audio_mismatch: use the storyboard scene track');
        const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
            'stream=channels,sample_rate:format=duration', '-of', 'json', request.audio.path], { encoding: 'utf8', timeout: 10000 }));
        const samples = probe.streams?.[0], seconds = Number(probe.format?.duration);
        if (!samples || !Number.isFinite(seconds) || Math.abs(seconds * request.fps - request.frameCount) >= 0.5)
            throw new Error('scene_audio_timing: supply the scene-length track including lead-in silence');
        if (tool === 'astra_genai_audio2video' && Math.ceil(seconds * request.fps - 1e-8) !== request.frameCount)
            throw new Error('scene_audio_timing: the gateway audio duration places its last frame outside the authored interval');
        if (tool === 'astra_genai_audio2video' && (request.frameCount > 361 || ![1, 2].includes(samples.channels) ||
            ![7350, 8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 64000, 88200, 96000].includes(Number(samples.sample_rate))))
            throw new SceneInputError(tool, request, [{ input: 'audio', path: request.audio.path, frame: 0, reason: 'A2V requires mono/stereo, an AAC sample rate and a maximum of 361 frames' }]);
        args.audioPath = request.audio.path;
    }
    const gateway = tool === 'astra_genai_img2video' || tool === 'astra_genai_audio2video';
    const start = gateway ? pins.find(p => p.frame === 0 && (p.strength ?? 1) === 1) : pins.find(p => p.role === 'start');
    // A GenAI scene sends each shot's own start picture with the scene request; the composition takes only the opening.
    const end = request.sceneMode ? undefined : gateway ? start && pins.find(p => p.frame === request.frameCount - 1 && (p.strength ?? 1) === 1) : pins.find(p => p.role === 'end');
    const intermediate = gateway && !request.sceneMode ? pins.filter(p => p !== start && p !== end) : [];
    const gatewayKeyframes = intermediate.length ? {
        args: { keyframes: intermediate.map(p => ({ imagePath: p.path, frameIdx: p.frame, strength: p.strength ?? 1 })) },
        imageBindings: intermediate.map((p, i) => ({ ...verifyImageFile(p.path), ...p, id: p.shotId + '-keyframe-' + i,
            parameter: 'keyframes[' + i + '].imagePath', use: 'video', purpose: p.cue ?? p.role, submitted: true })),
    } : undefined;
    const visual = shot.visual;
    const positions = shot.visual?.video?.openingPositions ?? [];
    const subjects = refs.filter(p => !['background', 'location'].includes(p.role));
    const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
    if (assets && positions.filter(p => p.images.length).length > 1)
        throw new SceneInputError(tool, request, [{ input: 'reference', shotId: request.shotIds[0], frame: 0, reason: 'Veo assets must identify the same subject in openingPositions' }]);
    for (const owner of positions) {
        for (const slot of owner.images) {
            if (!subjects[slot - 1])
                throw new SceneInputError(tool, request, [{ input: 'reference', role: 'character',
                        reason: owner.character + ' names missing subject Image ' + slot }]);
        }
    }
    for (const [i, p] of subjects.entries()) {
        if (p.character && !positions.some(row => row.character === p.character && row.images.includes(i + 1)))
            throw new Error('scene_reference_owner: match ' + p.shotId + ' ' + p.role + ' reference ' + (i + 1) + ' to ' + p.character + ' in openingPositions');
    }
    const references = refs.map((p, i) => p.reference ?? { id: 'subject-' + i, role: p.role === 'prop' ? 'prop' : 'character', use: 'video', path: p.path,
        purpose: [p.character, p.role].filter(Boolean).join(' ') + ' reference only. Use the shot action for entrance timing.' });
    // Subject assets go through the shot binder, which attaches the same ordered
    // reference descriptions and preserve/avoid instructions to the provider prompt.
    const projected = { ...visual, frames: { mode: assets || VIDEO_ADAPTERS[tool]?.voice === 'reference' ? 'reference' : end ? 'first_last' : 'first', start: start?.path, end: end?.path }, references,
        bg: start?.path, imagePair: undefined, lastImagePath: undefined };
    if (caps.timedImages || assets || !request.images.length) {
        const fields = ['images', 'keyframes', 'sourceImagePath', 'lastImagePath', 'imagePath', 'imageUri', 'lastFramePath',
            'firstFramePath', 'firstFrameImagePath', 'lastFrameImagePath', 'lastFrameUri', 'referenceImagePaths', 'references'];
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
    return { args, shot: { ...shot, visual: projected }, timedImages, gatewayKeyframes };
}
/** The v2 subject extension and Desktop device matrix can vary by deployment.
 * A static schema alone cannot authorize these combinations. Both calls are read-only. */
export async function checkSceneDeployment(request, tool, args) {
    const fail = (reason) => {
        const pins = request.images.filter(p => tool !== 'astra_genai_img2video' || !temporal(p));
        const missing = [{ input: 'deployment', reason }, ...pins.map(p => ({
                input: temporal(p) ? 'image' : 'reference', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason,
            }))];
        if (request.audio)
            missing.push({ input: 'audio', frame: 0, path: request.audio.path, reason });
        throw new SceneInputError(tool, request, missing);
    };
    // A GenAI scene is checked whole by POST /v1/generations/validate when it is planned and again before it is submitted.
    if (!tool.startsWith('astra_genai_desktop_'))
        return;
    const cell = z.object({ fps_to_durations: z.record(z.array(z.number())), aspect_ratios: z.array(z.string()) });
    const catalog = z.object({ active_model: z.string().nullable().optional(), data: z.array(z.object({
            id: z.string(), features: z.array(z.string()), generation_combinations: z.record(cell), audio_combinations: z.record(cell),
            excluded_aspect_combinations: z.array(z.record(z.unknown())).optional(),
        })) }).safeParse(await requestGenai('GET', '/v1/ltx/desktop/models', undefined, 15000).catch(() => fail('Desktop model catalog unavailable')));
    if (!catalog.success)
        return fail('Desktop model matrix unavailable');
    const model = catalog.data.data.find(row => row.id === args.model);
    const feature = { text: 'text-to-video', image: 'image-to-video', audio: 'audio-to-video', keyframe: 'keyframes' };
    const operation = feature[VIDEO_ADAPTERS[tool].operation];
    if (!model?.features.includes(operation) || operation === 'keyframes' && catalog.data.active_model !== args.model)
        return fail('Selected Desktop model does not offer the requested operation or active keyframe pipeline');
    const matrix = operation === 'audio-to-video' ? model.audio_combinations : model.generation_combinations;
    const entry = matrix[String(args.resolution)];
    const durations = entry?.fps_to_durations[String(args.fps)];
    const selection = { ...args, audio: false };
    const excluded = model.excluded_aspect_combinations?.some(block => Object.entries(block)
        .every(([key, value]) => selection[key] === value));
    if (!durations?.length || args.aspectRatio !== 'auto' && !entry.aspect_ratios.includes(String(args.aspectRatio)) ||
        typeof args.duration === 'number' && !durations.includes(args.duration) ||
        excluded)
        fail('Selected Desktop model does not offer this resolution, frame rate, duration and aspect ratio');
}
