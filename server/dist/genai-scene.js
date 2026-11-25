/** The GenAI gateway's per-shot scene route (`/v1/ltx/v2/scene-to-video`).
 *
 * scene-video.ts compiles a storyboard scene into a `SceneRequest`. This module is the
 * only place that knows what the gateway does with one: the route's addresses, what a
 * deployment advertises, the request body's field names, and the validate and submit
 * calls. Frame numbers are relative to the scene and shot ends are exclusive. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { videoTextPolicy } from './video-prompt.js';
import { GENAI_AUDIO_TYPES, GenaiRequestError, genaiAudioUri, genaiSourceUri, requestGenai } from './astra-genai-client.js';
import { GENAI_MSR_INLINE_MAX_BYTES, uploadGenaiFile } from './astra-genai-upload.js';
const load = createRequire(import.meta.url);
export const SCENE_ROUTE = '/v1/ltx/v2/scene-to-video';
/** The idempotency key of a plan's scene job. The receipt and the status lookup use the same one. */
export const sceneRequestId = (planId) => 'scene-' + planId;
/** The reference slots of one shot, which planning checks before a gateway is asked. An advertised number replaces its default. */
export const SCENE_LIMITS = { subjects: 4, backgrounds: 1, voiceSpeakers: 2 };
const BACKGROUND_ROLES = ['background', 'location'];
const TEMPORAL_ROLES = ['start', 'keyframe', 'end'];
const count = z.number().int().positive();
// The first three keys are required. Every other key is optional, because a gateway deployed
// before 2026-11-24 reports no limits or seed, and a malformed one reads as absent.
// The gateway adds keys under version 1 and never renames.
const capabilitiesSchema = z.object({
    version: z.literal(1), execution: z.literal('per_shot'),
    transitions: z.array(z.string()).refine(values => values.includes('hard_cut')),
    execution_modes: z.array(z.string()).optional(),
    motion_prefix: z.boolean().optional(), timed_dialogue: z.string().nullish(),
    scene_audio_modes: z.record(z.string()).optional().catch(undefined),
    limits: z.object({
        shots: z.object({ min: count, max: count }),
        shot_frames: z.object({ max: count }),
        references: z.object({ subjects: count, backgrounds: z.number().int().nonnegative() }),
        voice: z.object({ speakers_per_shot: z.number().int().nonnegative() }),
    }).partial().optional().catch(undefined),
    seed: z.array(z.string()).optional().catch(undefined),
});
export function parseSceneCapabilities(response) {
    const body = capabilitiesSchema.parse(response);
    const limits = body.limits ?? {};
    return {
        executionModes: body.execution_modes ?? ['per_shot'],
        motionPrefix: body.motion_prefix === true, timedDialogue: body.timed_dialogue ?? null,
        audioModes: body.scene_audio_modes ?? {},
        limits: {
            subjects: limits.references?.subjects ?? SCENE_LIMITS.subjects, backgrounds: limits.references?.backgrounds ?? SCENE_LIMITS.backgrounds,
            voiceSpeakers: limits.voice?.speakers_per_shot ?? SCENE_LIMITS.voiceSpeakers,
            ...(limits.shots ? { shots: limits.shots } : {}), ...(limits.shot_frames ? { shotFrames: limits.shot_frames.max } : {}),
        },
        seedModes: body.seed ?? [],
    };
}
export async function readSceneCapabilities() {
    return parseSceneCapabilities(await requestGenai('GET', SCENE_ROUTE + '/capabilities', undefined, 15_000));
}
/** A dev-model scene whose supplied track drives the picture, instead of being mixed under native sound. */
const conditionedBy = (scene, model) => Boolean(model === 'ltx-2.5-22b-dev' && scene.audio && scene.audio.mode !== 'mix');
/** The gateway mode that renders one shot. Its name is what `seedModes` lists. */
function renderMode(scene, shotId, conditioned) {
    if (conditioned)
        return 'audio2video';
    return scene.images.some(image => image.shotId === shotId && !TEMPORAL_ROLES.includes(image.role)) ? 'msr' : 'generate';
}
/** Compare a compiled scene with what this deployment accepts, before any file is uploaded.
 * The gateway's validation stays the authority; this names the shot and the limit in our terms. */
export function sceneRequestIssues(scene, capabilities, options = {}) {
    const { limits } = capabilities, issues = [];
    if (limits.shots && (scene.shots.length < limits.shots.min || scene.shots.length > limits.shots.max))
        issues.push(`scene ${scene.sceneNo}: ${scene.shots.length} shots; one scene job renders ${limits.shots.min}–${limits.shots.max}`);
    for (const shot of scene.shots) {
        const at = shot.shotId + '@' + shot.startFrame;
        const frames = shot.endFrame - shot.startFrame;
        if (limits.shotFrames !== undefined && frames > limits.shotFrames)
            issues.push(`${at} length: ${frames} frames; a shot renders at most ${limits.shotFrames}`);
        const references = scene.images.filter(image => image.shotId === shot.shotId && !TEMPORAL_ROLES.includes(image.role));
        const backgrounds = references.filter(image => BACKGROUND_ROLES.includes(image.role)).length;
        if (references.length - backgrounds > limits.subjects || backgrounds > limits.backgrounds)
            issues.push(`${at} references: ${references.length - backgrounds} subjects and ${backgrounds} backgrounds; a shot takes ${limits.subjects} and ${limits.backgrounds}`);
        const voiced = new Set((shot.dialogue ?? []).filter(line => line.voice).map(line => line.speaker));
        if (voiced.size > limits.voiceSpeakers)
            issues.push(`${at} voice: ${voiced.size} voiced speakers; a shot takes ${limits.voiceSpeakers}`);
        const binding = options.bindings?.find(item => item.shotId === shot.shotId);
        const mode = renderMode(scene, shot.shotId, conditionedBy(scene, options.model));
        if (binding?.seed !== undefined && !capabilities.seedModes.includes(mode))
            issues.push(`${at} seed: this gateway does not take a seed for ${mode} rendering`);
    }
    return issues;
}
/** Build the request body. Files ride inline until the body is too large, a guide file is bound or `stageFiles` asks; then each is uploaded once. */
export async function buildSceneWire(scene, model, resolution, stageFiles = false, bindings, execution) {
    const attachments = [];
    const conditioned = conditionedBy(scene, model);
    const shots = scene.shots.map(shot => {
        const binding = bindings?.find(item => item.shotId === shot.shotId);
        const guidance = binding?.guidance;
        const images = scene.images.filter(image => image.shotId === shot.shotId).map(image => ({
            frame: image.frame, role: image.role, character: image.character, cue: image.cue, strength: image.strength,
            ...(image.reference ? { reference_id: image.reference.id, purpose: image.reference.purpose } : {}),
            image_uri: genaiSourceUri(undefined, image.path),
        }));
        let delivery;
        if (scene.silentPicture || !shot.dialogue?.length && !conditioned)
            delivery = 'All visible mouths stay closed. No speech or vocalization.';
        else if (shot.dialogue?.length && shot.dialogue.every(line => line.delivery === 'off_screen'))
            delivery = 'All visible mouths stay closed while the off-screen speaker talks.';
        return { ...(binding?.motionPrefix ? { motion_uri: '' } : {}),
            ...(binding?.performanceAudio ? { performance_uri: '' } : {}), shot_id: shot.shotId, start_frame: shot.startFrame, end_frame: shot.endFrame,
            ...(guidance ? { negative_prompt: guidance.negativePrompt, guidance_scale: guidance.guidanceScale } : {}),
            ...(shot.transition === 'open' ? {} : { transition: shot.transition }),
            description: [shot.framing, shot.action, delivery, videoTextPolicy()].filter(Boolean).join(' '), opening_positions: shot.openingPositions,
            blocking: shot.blocking, audio: shot.sound === scene.sceneDirection?.sound ? undefined : shot.sound, images,
            dialogue: shot.dialogue?.map(line => ({ id: line.lineId, speaker: line.speaker, text: line.text, delivery: line.delivery,
                direction: line.direction, frame: conditioned ? undefined : line.frame, ...(line.voice ? { voice_uri: genaiAudioUri(undefined, line.voice.path) } : {}) })),
            ...(binding?.seed !== undefined ? { seed: binding.seed } : {}),
        };
    });
    const direction = scene.sceneDirection;
    const prompt = direction ? [direction.emotion, direction.action, direction.camera, direction.staging, direction.sound, direction.oneTake && 'One continuous take. No cuts.'].filter(Boolean).join(' ') : '';
    const trackBytes = scene.audio ? statSync(scene.audio.path).size : 0;
    if (trackBytes > 32 * 1024 * 1024)
        throw new Error('scene_audio@0: exceeds the 32 MiB gateway upload limit');
    const stageTrack = Boolean(scene.audio && (stageFiles || trackBytes * 4 / 3 > GENAI_MSR_INLINE_MAX_BYTES));
    const body = { ...(execution && execution !== 'per_shot' ? { execution } : {}), model, resolution, fps: scene.fps, num_frames: scene.frameCount, generate_audio: true, prompt: prompt || 'Follow the ordered storyboard shots.',
        image_uri: shots[0]?.images.find(image => image.role === 'start')?.image_uri, shots,
        ...(scene.audio ? { scene_audio: { ...(scene.audio.mode ? { mode: scene.audio.mode } : {}), audio_uri: stageTrack ? '' : genaiAudioUri(undefined, scene.audio.path), start_frame: scene.audio.startFrame,
                end_frame: scene.audio.endFrame, cues: scene.audio.cues } } : {}) };
    let wire = JSON.stringify(body);
    if (stageFiles || stageTrack || bindings?.some(b => b.motionPrefix || b.performanceAudio) || Buffer.byteLength(wire) > GENAI_MSR_INLINE_MAX_BYTES) {
        const staged = new Map();
        const stageBytes = async (bytes, mime, role, frame, shotId) => {
            const sha256 = createHash('sha256').update(bytes).digest('hex');
            const id = staged.get(sha256) ?? await uploadGenaiFile(bytes, mime);
            if (!id)
                throw new Error('Gateway could not stage the original ' + role + ' file for validation');
            staged.set(sha256, id);
            attachments.push({ shotId, role, frame, sha256, bytes: bytes.length });
            return id;
        };
        const stage = (uri, role, frame, shotId) => stageBytes(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'), uri.slice(5, uri.indexOf(';')), role, frame, shotId);
        for (const shot of shots) {
            const binding = bindings?.find(b => b.shotId === shot.shot_id);
            if (binding?.performanceAudio) {
                const wav = load('../../skills/_shared/scene-speech-receipt.js').performanceWav(binding.performanceAudio, shot.end_frame - shot.start_frame, scene.fps);
                shot.performance_uri = await stageBytes(wav, 'audio/wav', 'performance_audio', shot.start_frame, shot.shot_id);
            }
            if (binding?.motionPrefix)
                shot.motion_uri = await stageBytes(readFileSync(binding.motionPrefix), 'video/mp4', 'motion_prefix', shot.start_frame, shot.shot_id);
            for (const image of shot.images)
                image.image_uri = await stage(image.image_uri, image.role, image.frame, shot.shot_id);
            for (const line of shot.dialogue ?? [])
                if (line.voice_uri)
                    line.voice_uri = await stage(line.voice_uri, 'voice_reference', line.frame ?? shot.start_frame, shot.shot_id);
        }
        body.image_uri = shots[0]?.images.find(image => image.role === 'start')?.image_uri;
        if (body.scene_audio && scene.audio) {
            const mime = GENAI_AUDIO_TYPES[path.extname(scene.audio.path).toLowerCase()];
            if (!mime)
                throw new Error('scene_audio@0: unsupported audio format');
            body.scene_audio.audio_uri = await stageBytes(readFileSync(scene.audio.path), mime, 'scene_audio', 0);
        }
        wire = JSON.stringify(body);
    }
    return { body, attachments, bodySha256: createHash('sha256').update(wire).digest('hex'), bytes: Buffer.byteLength(wire) };
}
/** Send the full scene to the authenticated validation-only route. A schema pass never authorizes execution. */
export async function validateScenePayload(endpoint, scene, model, resolution, requestId) {
    let sent;
    try {
        const { body, attachments, bytes, bodySha256 } = await buildSceneWire(scene, model, resolution);
        sent = { bodySha256, bytes, ...(attachments.length ? { requestBody: body, attachments } : {}) };
        const result = await requestGenai('POST', endpoint, body, 120000, undefined, undefined, requestId);
        const accepted = z.object({ schema_valid: z.literal(true), model: z.literal(model) }).safeParse(result);
        return { endpoint, requestId, ...sent, status: accepted.success ? 'schema_accepted' : 'unverified', result: accepted.data };
    }
    catch (error) {
        if (error instanceof GenaiRequestError && [400, 422].includes(error.httpStatus))
            return { endpoint, requestId, ...sent, status: 'schema_rejected', httpStatus: error.httpStatus, detail: error.message };
        return { endpoint, requestId, ...sent, status: 'unverified', detail: error instanceof Error ? error.message : String(error) };
    }
}
/** Run every gateway check on the staged body. Nothing is reserved or rendered. */
export async function validateSceneBody(body, requestId, expected) {
    const result = await requestGenai('POST', SCENE_ROUTE + '/validate', body, 120000, undefined, undefined, requestId);
    const checked = z.object({ schema_valid: z.literal(true), model: z.literal(expected.model), shots: z.literal(expected.shots),
        execution: z.enum(['per_shot', 'single_msr']).optional() }).parse(result);
    if (expected.execution === 'auto' && !checked.execution ||
        expected.execution && expected.execution !== 'auto' && (checked.execution ?? 'per_shot') !== expected.execution)
        throw new Error('scene_render_selection: gateway did not validate the planned execution mode');
    return checked.execution ?? 'per_shot';
}
/** Submit the scene job. The gateway returns the same job for a repeated `requestId` with the same body. */
export async function submitSceneBody(body, requestId) {
    const response = await requestGenai('POST', SCENE_ROUTE, body, 120000, undefined, undefined, requestId);
    return z.object({ id: z.string().min(1), request_id: z.literal(requestId) }).parse(response);
}
