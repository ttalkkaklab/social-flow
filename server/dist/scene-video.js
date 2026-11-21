// Frame numbers throughout this module are relative to the scene. Shot ends are exclusive.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { openingPrompt, shotTimelineSchema } from './msr-opening.js';
import { cameraMoveWords, sceneCameraDirection, scenePromptText } from './video-prompt.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import { verifyImageFile } from './image-media.js';
import { VEO_CONSTRAINTS } from './veo-video.js';
import { requestGenai } from './astra-genai-client.js';
import { FRAME_FIELDS, sceneInputCapabilities, VIDEO_ADAPTERS } from './video-registry.js';
const load = createRequire(import.meta.url);
const temporal = (image) => ['start', 'keyframe', 'end'].includes(image.role) && !image.reference;
const english = (value) => value && !nonEnglishOutsideQuotes(value) ? value : '';
export function compileSceneTimeline(raw, scene, episode) {
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
        const move = cameraMoveWords(visual?.camera ?? {});
        const crop = visual?.camera?.view?.crop;
        const landing = english(visual?.camera?.end);
        const camera = timeline?.framing ?? [member.shot?.size, member.shot?.angle, english(crop)].filter(Boolean).join(' ');
        const framing = [camera, move, landing && 'Closing frame: ' + landing].filter(Boolean).join(' ') || (members.length === 1 ? scene.camera || 'Hold the opening composition.' : '');
        const existingAction = [visual?.video?.promptSource?.action, visual?.action, member.summary, visual?.video?.prompt].map(english).find(Boolean);
        const action = timeline?.action ?? existingAction ?? (members.length === 1 ? scene.action || scene.emotion : '');
        const pins = [...(timeline?.images ?? [])];
        const frames = render.framePlan(member);
        const legacy = visual?.frames;
        for (const pin of legacy?.storyboardKeyframes ?? []) {
            if (!pin.file || !Number.isInteger(pin.startFrame))
                throw new Error('scene_image_timing: malformed storyboardKeyframes on ' + shotId);
            const role = pin.startFrame === startFrame ? 'start' : pin.file === frames.end ? 'end' : 'keyframe';
            if (!pins.some(p => p.frame === pin.startFrame && p.path === pin.file))
                pins.push({ path: pin.file, frame: pin.startFrame, role });
        }
        for (const pin of legacy?.keyframes ?? []) {
            const frame = startFrame + Math.round(pin.atSeconds * fps);
            if (!pins.some(p => p.frame === frame && p.path === pin.image))
                pins.push({ path: pin.image, frame, role: 'keyframe', cue: english(pin.state), strength: pin.strength });
        }
        if (frames.start && !pins.some(p => p.role === 'start' && p.path === frames.start))
            pins.push({ path: frames.start, frame: startFrame, role: 'start' });
        if (frames.end && !pins.some(p => p.role === 'end' && p.path === frames.end))
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
        const claimed = new Set();
        for (const pin of pins.sort((a, b) => a.frame - b.frame)) {
            const ref = ['face', 'outfit'].includes(pin.role) ? references.find(r => r.path === pin.path) : undefined;
            if (ref)
                claimed.add(ref);
            add(ref ? { ...pin, reference: ref } : pin);
        }
        for (const ref of references)
            if (!claimed.has(ref))
                add({ path: ref.path, role: ref.role, frame: startFrame, reference: ref });
        return { shotId, startFrame, endFrame, transition, framing, action };
    });
    const cuts = shots.slice(1).map(({ shotId, startFrame: frame, transition }, i) => ({ from: shots[i].shotId, to: shotId, frame, transition }));
    const audio = scene.audio && { path: realpathSync(path.resolve(episode, 'storyboard', scene.audio.path)), startFrame: 0, endFrame: cursor, cues: scene.audio.cues ?? [] };
    if (audio?.cues.some(c => c.frame >= cursor))
        throw new Error('scene_audio_timing: cue outside the scene');
    return { fps, frameCount: cursor, shotIds, shots, images, cuts, ...(audio ? { audio } : {}) };
}
export function sceneTimelineWords(t) {
    return [`Scene at ${t.fps} fps. Frame numbers start at zero.`, ...t.shots.map(s => {
            const cues = t.images.filter(p => p.shotId === s.shotId && p.cue).map(p => `Frame ${p.frame}: ${p.cue}`);
            return [`${s.shotId} [${s.startFrame}–${s.endFrame - 1}] ${s.transition.replaceAll('_', ' ')}. ${s.framing}`, s.action, ...cues].filter(Boolean).join(' ');
        }), ...(t.audio ? ['Play one continuous scene track from frame 0.', ...t.audio.cues.map(c => `Frame ${c.frame}: ${c.action}`)] : [])].join('\n');
}
/** Compile once, then present the complete scene to the selected adapter's input mapper. */
export function prepareSceneRequest(sceneNo, members, scene, episode, dialogue, options, mapInputs) {
    const timeline = compileSceneTimeline(members, scene, episode);
    const camera = sceneCameraDirection([], scene.camera);
    const words = sceneTimelineWords(timeline);
    const complete = scenePromptText(scene, camera.instruction, words, dialogue, false);
    const suffix = (value) => [value, options.suffix].filter(Boolean).join(' ');
    const prompt = suffix(openingPrompt(complete, scene.openingPositions));
    const text = options.bindDialogue ? scenePromptText(scene, camera.instruction, words, dialogue, true) : complete;
    const providerPrompt = suffix(options.bindOpening ? text : openingPrompt(text, scene.openingPositions));
    const request = { sceneNo, prompt, ...timeline };
    return { request, providerPrompt, camera, mapped: mapInputs(request) };
}
export class SceneInputError extends Error {
    tool;
    sceneRequest;
    missing;
    constructor(tool, sceneRequest, missing) {
        super('scene_inputs_unsupported: ' + tool + ' ' + JSON.stringify(missing));
        this.tool = tool;
        this.sceneRequest = sceneRequest;
        this.missing = missing;
    }
}
/** Decide using ALL scene inputs before building any provider fields or saving an executable plan. */
export function mapSceneInputs(request, tool, model) {
    const caps = sceneInputCapabilities(tool);
    const missing = caps.frameAccurateCuts ? [] : request.cuts.map(c => ({ input: 'transition', shotId: c.to, frame: c.frame, reason: 'No frame-addressed ' + c.transition + ' boundary' }));
    for (const shot of request.shots) {
        if (!shot.framing || !shot.action)
            missing.push({ input: 'direction', shotId: shot.shotId, frame: shot.startFrame,
                reason: 'Write the missing English framing/action in story_shot.timeline' });
    }
    const pins = request.images.filter(temporal), refs = request.images.filter(p => !temporal(p));
    const opening = pins.some(p => p.role === 'start' && p.frame === 0);
    const timedLimit = tool === 'astra_genai_desktop_keyframes' ? 10 : 8;
    for (const [index, p] of pins.entries()) {
        if (caps.timedImages && index >= timedLimit) {
            missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'Exceeds the adapter limit of ' + timedLimit + ' timed images' });
            continue;
        }
        if (!caps.timedImages && p.role === 'end' && p.frame === request.frameCount - 1 && caps.endingImage && !opening) {
            missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'The last-image slot requires an opening image' });
            continue;
        }
        const endpoint = p.role === 'start' && p.frame === 0 && caps.openingImage ||
            p.role === 'end' && p.frame === request.frameCount - 1 && caps.endingImage;
        if (caps.timedImages || endpoint && (p.strength === undefined || p.strength === 1))
            continue;
        missing.push({ input: 'image', shotId: p.shotId, frame: p.frame, role: p.role, path: p.path, reason: 'No temporal image slot at this frame' });
    }
    if (request.audio && tool === 'astra_genai_audio2video' && model !== 'ltx-2.5-22b-dev')
        missing.push({ input: 'audio', frame: 0, path: request.audio.path, reason: 'This gateway A2V operation requires ltx-2.5-22b-dev' });
    for (const [index, p] of refs.entries()) {
        if (tool === 'veo_reference' && model && index < (VEO_CONSTRAINTS[model]?.maxAssetImages ?? 0) &&
            p.frame === 0 && ['face', 'outfit', 'character'].includes(p.role))
            continue;
        if (tool === 'astra_genai_img2video' && model === 'ltx-2.5-22b-distilled' && p.frame === 0)
            continue;
        missing.push({ input: 'reference', shotId: p.shotId, frame: p.frame, path: p.path, role: p.role, reason: 'No compatible subject/reference slot with this frame scope' });
    }
    if (request.audio && !caps.sceneAudio)
        missing.push({ input: 'audio', frame: 0, path: request.audio.path, reason: 'No continuous supplied soundtrack with these inputs' });
    if (missing.length)
        throw new SceneInputError(tool, request, missing);
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
    let slot = 0;
    return bindings.map(binding => {
        if ('parameter' in binding || !binding.submitted)
            return binding;
        const endpoint = binding.id === 'start' || binding.id === 'end';
        const index = endpoint ? -1 : refs.findIndex(p => p.path === binding.path && (!p.reference || p.reference.id === binding.id));
        const image = endpoint ? request.images.find(p => p.role === binding.id && p.path === binding.path)
            : index >= 0 ? refs.splice(index, 1)[0] : undefined;
        if (!image)
            return binding;
        const parameter = endpoint ? FRAME_FIELDS[tool]?.[binding.id === 'start' ? 0 : 1] : 'references[' + slot++ + '].imagePath';
        return { ...binding, shotId: image.shotId, frame: image.frame, role: image.role, parameter, character: image.character };
    });
}
/** Map the accepted scene to the existing image/voice adapter pipeline. Never pass the
 * internal scene manifest as unrecognised provider parameters. */
export function bindSceneAdapter(request, tool, model, shot, input, episode) {
    const { pins, refs, caps } = mapSceneInputs(request, tool, model);
    const args = {};
    const sceneSeconds = request.frameCount / request.fps;
    for (const field of ['duration', 'durationSeconds', 'requiredSeconds']) {
        if (input[field] !== undefined && input[field] !== sceneSeconds)
            throw new Error('scene_video_timing: ' + field + ' differs from the authored scene duration');
    }
    if (['numFrames', 'frames'].some(field => input[field] !== undefined && input[field] !== request.frameCount))
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
    const start = pins.find(p => p.role === 'start'), end = pins.find(p => p.role === 'end');
    const visual = shot.visual;
    const positions = shot.visual?.video?.openingPositions ?? [];
    const subjects = refs.filter(p => p.role !== 'background');
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
    const references = refs.map((p, i) => p.reference ?? { id: 'subject-' + i, role: 'character', use: 'video', path: p.path,
        purpose: p.character + ' ' + p.role + ' reference only. Use the shot action for entrance timing.' });
    const projected = { ...visual, frames: { mode: end ? 'first_last' : 'first', start: start?.path, end: end?.path }, references,
        bg: start?.path, imagePair: undefined, lastImagePath: undefined };
    if (caps.timedImages || tool === 'veo_reference' || !request.images.length) {
        const fields = ['images', 'keyframes', 'sourceImagePath', 'lastImagePath', 'imagePath', 'imageUri', 'lastFramePath',
            'firstFramePath', 'firstFrameImagePath', 'lastFrameImagePath', 'lastFrameUri', 'referenceImagePaths', 'references'];
        if (fields.some(k => k in input))
            throw new Error('image_plan_mismatch: declare video images on their storyboard shots');
    }
    const timedImages = tool === 'veo_reference' ? {
        args: { referenceImagePaths: refs.map(p => p.path) },
        imageBindings: refs.map((p, i) => ({ ...verifyImageFile(p.path), ...p, id: p.reference?.id ?? 'subject-' + i,
            parameter: 'referenceImagePaths[' + i + ']', use: 'video', purpose: p.cue ?? p.role, submitted: true })),
    } : caps.timedImages ? timedImageArgs(tool, pins) : undefined;
    Object.assign(args, timedImages?.args);
    if ((tool.startsWith('astra_genai_desktop_') && !request.audio) || tool === 'astra_genai_text2video')
        args.duration = input.duration ?? request.frameCount / request.fps;
    return { args, shot: { ...shot, visual: projected }, timedImages };
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
    if (tool === 'astra_genai_img2video' && Array.isArray(args.references)) {
        const capabilities = await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15000)
            .catch(() => fail('Cannot verify combined image and reference support'));
        if (z.object({ image_conditioning: z.literal(true) }).safeParse(capabilities).success === false)
            fail('Gateway does not advertise combined start frame and subject conditioning');
    }
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
