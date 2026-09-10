/**
 * Blender bridge — drives a local Blender the way the Higgsfield Bridge drives it for
 * ChatGPT, without the cloud relay: seven tools that read, build, frame, animate, pose,
 * retarget and render a previz scene, each one a short `blender --background --python` run.
 *
 * ## Why a subprocess per call
 *
 * The MCP server and Blender live on the same machine, so there is nothing to relay.
 * Every tool call spawns Blender headless with the bridge script below, opens the .blend
 * file, applies one edit, saves, and writes a JSON result — measured 1.2 s for a scene
 * read on an M4 Max. No add-on to install, no GUI that has to be running, no login. The
 * .blend file on disk is the session state, so a conversation like "lower the camera to
 * 1.2 m" is one more call that re-opens the file. Same pattern as bake-blender.py (the
 * outer runner spawns, the inner side is Blender's own Python) — this module is the
 * server-side twin of that script's runner, so the two find the same binary (config.ts
 * blenderBin) and speak the same 5.x API names.
 *
 * ## What previz is for
 *
 * A previz clip is grey proxies and a camera path, rendered with Workbench in seconds.
 * It pins what a prompt cannot — where the camera is, how high, how wide, how long it
 * moves, who stands where — as numbers. A person proxy is a jointed mannequin on a
 * 19-bone armature (hips · spine · chest · neck · head, shoulder · upper arm · forearm ·
 * hand and thigh · shin · foot per side), so a cut whose content is the body — a dance, a
 * gesture, a fall — carries its timing too: blender_pose_key writes poses in plain
 * channels (raise, elbow, knee, bow …) and blender_motion_import retargets a BVH or FBX
 * motion-capture clip onto the mannequin. Appearance still belongs to the image sheets
 * and the prompt (skills/storyboard/references/blender-previz.md).
 *
 * Coordinates are Blender's: metres, Z up, +Y away from the front view, angles in
 * degrees. Characters built here face -Y, so a camera at negative Y looking back at the
 * origin sees their front, and a character's own left is +X.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { blenderBin } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
// ── Constants ───────────────────────────────────────────────────
export const BLENDER_PROXY_KINDS = ['person', 'dog', 'car', 'box', 'cylinder', 'sphere'];
export const BLENDER_INTERPOLATIONS = ['LINEAR', 'BEZIER', 'CONSTANT'];
export const BLENDER_PREVIZ_ENGINES = ['workbench', 'eevee'];
export const DEFAULT_PREVIZ_ENGINE = 'workbench';
export const DEFAULT_PREVIZ_WIDTH = 1080;
export const DEFAULT_PREVIZ_HEIGHT = 1920;
export const DEFAULT_PREVIZ_FILENAME = 'previz.mp4';
export const DEFAULT_SCENE_FPS = 30;
export const DEFAULT_FRAME_START = 1;
export const DEFAULT_FRAME_END = 150;
/** 100 s at 30 fps — a previz is a cut, not an episode */
export const MAX_PREVIZ_FRAMES = 3000;
/** Blender 4.x caps an ID name at 63 bytes of UTF-8 (5.0 raised it) — measured in bytes, not characters */
export const MAX_BLENDER_NAME = 63;
/** The person proxy's armature, parents first — the names blender_pose_key's raw `bones` map and boneMap use */
export const BLENDER_RIG_BONES = [
    'hips', 'spine', 'chest', 'neck', 'head',
    'shoulder.L', 'upper_arm.L', 'forearm.L', 'hand.L',
    'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R',
    'thigh.L', 'shin.L', 'foot.L',
    'thigh.R', 'shin.R', 'foot.R',
];
export const BLENDER_POSE_GROUPS = ['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR'];
export const BLENDER_MOTION_FORMATS = ['.bvh', '.fbx'];
export const BLENDER_ROOT_MOTIONS = ['inplace', 'full'];
// ── Request schemas ─────────────────────────────────────────────
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const frameNumber = z.number().int().min(0).max(1_000_000);
const blenderName = z
    .string()
    .min(1)
    .refine((n) => Buffer.byteLength(n, 'utf8') <= MAX_BLENDER_NAME, { message: `a Blender object name is at most ${MAX_BLENDER_NAME} bytes of UTF-8` })
    .refine((n) => !n.includes('/') && !n.includes('\\'), { message: 'a Blender object name cannot contain path separators' });
/** H.264 wants even dimensions; catch it here rather than after a Blender spawn */
const evenPixels = (min) => z.number().int().min(min).max(4096).multipleOf(2, 'must be an even number of pixels (H.264)');
const hexColor = z.string().regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex triplet such as #4a90d9');
const blendPath = z
    .string()
    .min(1, 'blendPath is required')
    .refine((p) => !p.includes('..'), { message: 'blendPath must not contain ".."' })
    .refine((p) => extname(p).toLowerCase() === '.blend', { message: 'blendPath must end in .blend' })
    .transform((p) => resolve(p));
export const blenderSceneReadSchema = z.object({ blendPath });
const proxySchema = z.object({
    name: blenderName,
    kind: z.enum(BLENDER_PROXY_KINDS),
    location: vec3.optional().default([0, 0, 0]),
    rotationZDeg: z.number().optional().default(0),
    height: z.number().positive().max(100).optional(),
    radius: z.number().positive().max(100).optional(),
    size: vec3.optional(),
    color: hexColor.optional(),
});
const importSchema = z.object({
    glbPath: z
        .string()
        .min(1)
        .refine((p) => !p.includes('..'), { message: 'glbPath must not contain ".."' })
        .refine((p) => ['.glb', '.gltf'].includes(extname(p).toLowerCase()), { message: 'glbPath must end in .glb or .gltf' })
        .transform((p) => resolve(p)),
    name: blenderName,
    location: vec3.optional().default([0, 0, 0]),
    rotationDeg: vec3.optional().default([0, 0, 0]),
    scale: z.number().positive().optional().default(1),
});
// fps · frame range · resolution carry no zod default on purpose: a fresh scene (reset:true)
// gets the constants inside Blender, and reset:false keeps whatever the file already has
// unless the caller names a new value.
export const blenderSceneBuildSchema = z
    .object({
    blendPath,
    reset: z.boolean().optional().default(true),
    force: z.boolean().optional().default(false),
    fps: z.number().int().min(1).max(120).optional(),
    frameStart: frameNumber.optional(),
    frameEnd: frameNumber.optional(),
    width: evenPixels(64).optional(),
    height: evenPixels(64).optional(),
    floor: z.boolean().optional().default(true),
    floorSize: z.number().positive().max(10_000).optional().default(40),
    proxies: z.array(proxySchema).max(100).optional().default([]),
    imports: z.array(importSchema).max(50).optional().default([]),
})
    .superRefine((data, ctx) => {
    if (data.frameStart !== undefined && data.frameEnd !== undefined && data.frameEnd < data.frameStart) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frameEnd'], message: 'frameEnd must not be before frameStart' });
    }
    const names = [...data.proxies.map((p) => p.name), ...data.imports.map((i) => i.name)];
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proxies'], message: `object names must be unique — repeated: ${[...new Set(dupes)].join(', ')}` });
    }
    for (const [i, p] of data.proxies.entries()) {
        if (p.kind === 'box' && p.size === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proxies', i, 'size'], message: 'a box proxy needs size [x, y, z] in metres' });
        }
    }
});
const cameraKeySchema = z.object({
    frame: frameNumber.optional(),
    location: vec3,
    target: vec3.optional(),
    rotationDeg: vec3.optional(),
    lensMm: z.number().min(1).max(1000).optional(),
});
export const blenderCameraSetSchema = z
    .object({
    blendPath,
    name: blenderName.optional().default('Camera'),
    lensMm: z.number().min(1).max(1000).optional(),
    fovDeg: z.number().min(1).max(179).optional(),
    keys: z.array(cameraKeySchema).min(1).max(500),
    interpolation: z.enum(BLENDER_INTERPOLATIONS).optional().default('LINEAR'),
    clearExisting: z.boolean().optional().default(true),
})
    .superRefine((data, ctx) => {
    if (data.lensMm !== undefined && data.fovDeg !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fovDeg'], message: 'give lensMm or fovDeg, not both' });
    }
    const frames = new Set();
    for (const [i, k] of data.keys.entries()) {
        const hasTarget = k.target !== undefined;
        const hasRotation = k.rotationDeg !== undefined;
        if (hasTarget === hasRotation) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i], message: 'each key needs exactly one of target (a point the camera looks at) or rotationDeg' });
        }
        if (hasTarget && k.target.every((v, j) => v === k.location[j])) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'target'], message: 'target must differ from location' });
        }
        if (data.keys.length > 1 && k.frame === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: 'with more than one key, every key needs a frame' });
        }
        if (k.frame !== undefined) {
            if (frames.has(k.frame))
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: `frame ${k.frame} is keyed twice` });
            frames.add(k.frame);
        }
    }
});
const objectKeySchema = z.object({
    frame: frameNumber,
    location: vec3.optional(),
    rotationDeg: vec3.optional(),
    scale: z.union([z.number().positive(), vec3]).optional(),
});
export const blenderObjectAnimateSchema = z
    .object({
    blendPath,
    object: blenderName,
    keys: z.array(objectKeySchema).min(1).max(1000),
    interpolation: z.enum(BLENDER_INTERPOLATIONS).optional().default('LINEAR'),
    clearExisting: z.boolean().optional().default(true),
})
    .superRefine((data, ctx) => {
    const frames = new Set();
    for (const [i, k] of data.keys.entries()) {
        if (k.location === undefined && k.rotationDeg === undefined && k.scale === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i], message: 'a key needs at least one of location, rotationDeg, scale' });
        }
        if (frames.has(k.frame))
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: `frame ${k.frame} is keyed twice` });
        frames.add(k.frame);
    }
});
// Pose channels are degrees in the figure's own frame (it faces -Y, its left is +X); a group
// that is present keys every bone it covers, with omitted channels at 0 (the rest pose).
const poseDeg = z.number().min(-360).max(360);
const armPoseSchema = z.object({ raise: poseDeg.optional(), side: poseDeg.optional(), twist: poseDeg.optional(), elbow: poseDeg.optional() }).strict();
const legPoseSchema = z.object({ raise: poseDeg.optional(), side: poseDeg.optional(), knee: poseDeg.optional(), ankle: poseDeg.optional() }).strict();
const torsoPoseSchema = z.object({ bow: poseDeg.optional(), lean: poseDeg.optional(), turn: poseDeg.optional() }).strict();
const headPoseSchema = z.object({ nod: poseDeg.optional(), tilt: poseDeg.optional(), turn: poseDeg.optional() }).strict();
const hipsPoseSchema = z.object({ offset: vec3.optional(), bow: poseDeg.optional(), lean: poseDeg.optional(), turn: poseDeg.optional() }).strict();
const poseSchema = z
    .object({
    hips: hipsPoseSchema.optional(),
    torso: torsoPoseSchema.optional(),
    head: headPoseSchema.optional(),
    armL: armPoseSchema.optional(),
    armR: armPoseSchema.optional(),
    legL: legPoseSchema.optional(),
    legR: legPoseSchema.optional(),
    bones: z.record(z.enum(BLENDER_RIG_BONES), vec3).optional(),
})
    .strict();
const poseKeyEntrySchema = z.object({ frame: frameNumber, pose: poseSchema });
export const blenderPoseKeySchema = z
    .object({
    blendPath,
    object: blenderName,
    keys: z.array(poseKeyEntrySchema).min(1).max(1000),
    interpolation: z.enum(BLENDER_INTERPOLATIONS).optional().default('BEZIER'),
    clearExisting: z.boolean().optional().default(true),
})
    .superRefine((data, ctx) => {
    const frames = new Set();
    for (const [i, k] of data.keys.entries()) {
        // an empty group ({}) is meaningful — it keys that part of the body at rest
        if (Object.values(k.pose).every((v) => v === undefined)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'pose'], message: `a pose needs at least one of ${BLENDER_POSE_GROUPS.join(', ')} or bones` });
        }
        if (frames.has(k.frame))
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: `frame ${k.frame} is keyed twice` });
        frames.add(k.frame);
    }
});
const motionPath = z
    .string()
    .min(1, 'motionPath is required')
    .refine((p) => !p.includes('..'), { message: 'motionPath must not contain ".."' })
    .refine((p) => BLENDER_MOTION_FORMATS.includes(extname(p).toLowerCase()), { message: `motionPath must end in ${BLENDER_MOTION_FORMATS.join(' or ')}` })
    .transform((p) => resolve(p));
export const blenderMotionImportSchema = z
    .object({
    blendPath,
    object: blenderName,
    motionPath,
    frameStart: frameNumber.optional(),
    fromSeconds: z.number().min(0).max(36_000).optional().default(0),
    toSeconds: z.number().positive().max(36_000).optional(),
    speed: z.number().min(0.1).max(10).optional().default(1),
    loop: z.boolean().optional().default(false),
    rootMotion: z.enum(BLENDER_ROOT_MOTIONS).optional().default('inplace'),
    boneMap: z.record(z.enum(BLENDER_RIG_BONES), z.string().min(1).max(255)).optional(),
    clearExisting: z.boolean().optional().default(true),
})
    .superRefine((data, ctx) => {
    if (data.toSeconds !== undefined && data.toSeconds <= data.fromSeconds) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toSeconds'], message: 'toSeconds must be after fromSeconds' });
    }
});
export const blenderRenderPrevizSchema = z
    .object({
    blendPath,
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional().default(DEFAULT_PREVIZ_FILENAME),
    engine: z.enum(BLENDER_PREVIZ_ENGINES).optional().default(DEFAULT_PREVIZ_ENGINE),
    width: evenPixels(64).optional(),
    height: evenPixels(64).optional(),
    fps: z.number().int().min(1).max(120).optional(),
    frameStart: frameNumber.optional(),
    frameEnd: frameNumber.optional(),
    stills: z.array(frameNumber).max(24).optional(),
    stamp: z.boolean().optional().default(true),
    samples: z.number().int().min(1).max(256).optional().default(16),
    timeoutSeconds: z.number().int().min(30).max(3600).optional(),
})
    .superRefine((data, ctx) => {
    if (data.frameStart !== undefined && data.frameEnd !== undefined) {
        if (data.frameEnd < data.frameStart) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frameEnd'], message: 'frameEnd must not be before frameStart' });
        }
        else if (data.frameEnd - data.frameStart + 1 > MAX_PREVIZ_FRAMES) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frameEnd'], message: `a previz is at most ${MAX_PREVIZ_FRAMES} frames` });
        }
    }
    if (extname(data.filename).toLowerCase() !== '.mp4') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['filename'], message: 'the previz clip is written as .mp4 (H.264)' });
    }
});
const fmt = (v) => `(${v.map((x) => (Number.isInteger(x) ? String(x) : x.toFixed(2))).join(', ')})`;
/** A baked motion keys every frame; listing 900 numbers helps nobody, so long lists collapse to a range. */
export function describeKeys(keys) {
    if (keys.length === 0)
        return '';
    if (keys.length > 12)
        return `keys ${keys[0]}–${keys[keys.length - 1]} (${keys.length})`;
    return `keys [${keys.join(', ')}]`;
}
/** The one-line landmark report after a pose or motion call — hands, feet and head in world metres. */
export function describeTails(tails) {
    if (!tails)
        return '';
    return Object.entries(tails)
        .map(([bone, p]) => `${bone} ${fmt(p)}`)
        .join(' · ');
}
/** The text block every bridge tool returns — one line per object, so the model can name things exactly. */
export function describeScene(scene) {
    const lines = [];
    lines.push(`Blender ${scene.blender} · ${scene.blendPath}`);
    lines.push(`Frames ${scene.frame.start}–${scene.frame.end} @ ${scene.frame.fps} fps · ${scene.resolution[0]}×${scene.resolution[1]}`);
    if (scene.camera) {
        const c = scene.camera;
        lines.push(`Camera: ${c.name} at ${fmt(c.location)} rot ${fmt(c.rotationDeg)} · ${c.lensMm} mm · fov ${c.fovDeg}° · keys [${c.keyframes.join(', ')}]`);
    }
    else {
        lines.push('Camera: none — run blender_camera_set before rendering');
    }
    if (scene.cameras.length > 1)
        lines.push(`Cameras in file: ${scene.cameras.join(', ')}`);
    const shown = scene.objects.slice(0, 200);
    lines.push(`Objects (${scene.objects.length}):`);
    for (const o of shown) {
        const keys = o.keyframes.length ? ` ${describeKeys(o.keyframes)}` : '';
        const parent = o.parent ? ` ← ${o.parent}` : '';
        const bones = o.bones !== undefined ? `, ${o.bones} bones` : '';
        lines.push(`  ${o.name} (${o.type}${bones}${parent}) at ${fmt(o.location)} rot ${fmt(o.rotationDeg)} dims ${fmt(o.dimensions)}${keys}`);
    }
    if (scene.objects.length > shown.length)
        lines.push(`  … ${scene.objects.length - shown.length} more`);
    return lines.join('\n');
}
// ── Runner ──────────────────────────────────────────────────────
function installHint(detail) {
    return (`${detail}\n\n` +
        `The Blender bridge needs Blender 4.2 or newer on this machine:\n` +
        `  brew install --cask blender        (macOS)\n` +
        `or point BLENDER at the executable (BLENDER=/Applications/Blender.app/Contents/MacOS/Blender).\n` +
        `capability_status lists it under 3d_generation once it resolves.`);
}
/** Base allowance plus a per-frame budget — Workbench renders a 1080×1920 frame in well under a second, Eevee in a few. */
export function previzTimeoutMs(frames, engine) {
    const perFrame = engine === 'eevee' ? 4_000 : 1_000;
    return Math.min(60 * 60_000, 120_000 + Math.max(frames, 1) * perFrame);
}
const EDIT_TIMEOUT_MS = 180_000;
/** A retarget steps every target frame and keys 19 bones each — a 3000-frame cap at a few ms a frame */
const MOTION_TIMEOUT_MS = 600_000;
/**
 * One Blender at a time per .blend file. The client runs independent tool calls in
 * parallel, and two Blenders opening, editing and saving the same file at once lose one
 * edit silently (the later save wins with the earlier one's state). Different files still
 * run side by side.
 */
const fileLocks = new Map();
async function withFileLock(key, fn) {
    const previous = fileLocks.get(key) ?? Promise.resolve();
    let release = () => { };
    const mine = new Promise((r) => {
        release = r;
    });
    const chained = previous.then(() => mine);
    fileLocks.set(key, chained);
    await previous;
    try {
        return await fn();
    }
    finally {
        release();
        if (fileLocks.get(key) === chained)
            fileLocks.delete(key);
    }
}
function runBridge(job, timeoutMs) {
    return withFileLock(job.blendPath, () => runBridgeUnlocked(job, timeoutMs));
}
async function runBridgeUnlocked(job, timeoutMs) {
    const blender = blenderBin();
    if (!blender)
        return { success: false, error: installHint('Blender was not found on this machine.') };
    // Script, job and result all live in a private per-call directory (mkdtemp is 0700), so a
    // shared /tmp cannot hand Blender someone else's script under a predictable name.
    const dir = mkdtempSync(join(tmpdir(), 'blender-bridge-'));
    const script = join(dir, 'bridge.py');
    const jobPath = join(dir, 'job.json');
    const resultPath = join(dir, 'result.json');
    writeFileSync(script, BRIDGE_PY, 'utf-8');
    writeFileSync(jobPath, JSON.stringify({ ...job, resultPath }), 'utf-8');
    try {
        const run = await new Promise((resolveRun) => {
            execFile(blender, ['--background', '--factory-startup', '--python', script, '--', jobPath], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, (error, stdout, stderr) => {
                const lines = `${stdout}\n${stderr}`.split('\n').filter((l) => l.trim().length > 0);
                const err = error;
                resolveRun({
                    code: err ? (typeof err.code === 'number' ? err.code : null) : 0,
                    timedOut: Boolean(err && (err.killed || err.signal === 'SIGTERM')),
                    tail: lines.slice(-30).join('\n'),
                });
            });
        });
        if (existsSync(resultPath)) {
            const raw = JSON.parse(readFileSync(resultPath, 'utf-8'));
            if (raw.ok)
                return { success: true, result: raw.result };
            return { success: false, error: `${raw.error ?? 'Blender reported an error'}${raw.trace ? `\n${raw.trace}` : ''}` };
        }
        if (run.timedOut) {
            return { success: false, error: `Blender did not finish within ${Math.round(timeoutMs / 1000)}s — shorten the frame range, lower the resolution, or raise timeoutSeconds.` };
        }
        return { success: false, error: `Blender exited with code ${run.code ?? 'unknown'} before writing a result:\n${run.tail}` };
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
// ── Public operations ───────────────────────────────────────────
export async function readScene(request) {
    if (!existsSync(request.blendPath)) {
        return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
    }
    const r = await runBridge({ op: 'read', blendPath: request.blendPath }, EDIT_TIMEOUT_MS);
    return r.success ? { success: true, scene: r.result } : r;
}
export async function buildScene(request) {
    for (const imp of request.imports) {
        if (!existsSync(imp.glbPath))
            return { success: false, error: `GLB not found: ${imp.glbPath}` };
    }
    if (!request.reset && !existsSync(request.blendPath)) {
        return { success: false, error: `reset is false but ${request.blendPath} does not exist yet — set reset to true to create it.` };
    }
    const r = await runBridge({ op: 'build', ...request }, EDIT_TIMEOUT_MS);
    return r.success ? { success: true, scene: r.result } : r;
}
export async function setCamera(request) {
    if (!existsSync(request.blendPath)) {
        return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
    }
    const r = await runBridge({ op: 'camera', ...request }, EDIT_TIMEOUT_MS);
    return r.success ? { success: true, scene: r.result } : r;
}
export async function animateObject(request) {
    if (!existsSync(request.blendPath)) {
        return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
    }
    const r = await runBridge({ op: 'animate', ...request }, EDIT_TIMEOUT_MS);
    return r.success ? { success: true, scene: r.result } : r;
}
export async function poseKey(request) {
    if (!existsSync(request.blendPath)) {
        return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
    }
    const r = await runBridge({ op: 'pose', ...request }, EDIT_TIMEOUT_MS);
    return r.success ? { success: true, scene: r.result } : r;
}
export async function importMotion(request) {
    if (!existsSync(request.blendPath)) {
        return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
    }
    if (!existsSync(request.motionPath))
        return { success: false, error: `motion file not found: ${request.motionPath}` };
    const r = await runBridge({ op: 'motion', ...request, maxFrames: MAX_PREVIZ_FRAMES }, MOTION_TIMEOUT_MS);
    return r.success ? { success: true, scene: r.result } : r;
}
export async function renderPreviz(request) {
    if (!existsSync(request.blendPath)) {
        return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
    }
    const outputDir = request.outputPath ? resolve(request.outputPath) : join(dirname(request.blendPath), 'previz');
    const videoPath = resolveOutputFile(outputDir, request.filename, 'video');
    // The scene's own range is unknown here, so budget for the cap the script enforces rather
    // than for a guess that would cut a legitimate long render short.
    const framesForTimeout = request.frameStart !== undefined && request.frameEnd !== undefined ? request.frameEnd - request.frameStart + 1 : MAX_PREVIZ_FRAMES;
    const timeoutMs = request.timeoutSeconds ? request.timeoutSeconds * 1000 : previzTimeoutMs(framesForTimeout, request.engine);
    const { timeoutSeconds: _t, outputPath: _o, filename: _f, ...rest } = request;
    const r = await runBridge({ op: 'render', ...rest, videoPath, maxFrames: MAX_PREVIZ_FRAMES }, timeoutMs);
    if (!r.success)
        return r;
    return { success: true, ...r.result, engine: request.engine };
}
// ── The Blender-side script ─────────────────────────────────────
// Runs inside Blender's own Python. Reads one job JSON (path after "--"), performs one
// operation, writes {"ok": true, "result": …} or {"ok": false, "error": …} to job.resultPath.
// Keep it dependency-free — Blender's Python has no pip here.
export const BRIDGE_PY = String.raw `
# social-flow Blender bridge (inner side) — one job per process, see blender-bridge.ts.
import json, math, os, re, sys, time, traceback
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

PROXY_GRAY = (0.55, 0.55, 0.58, 1.0)
FLOOR_GRAY = (0.32, 0.32, 0.33, 1.0)
WORLD_GRAY = (0.82, 0.82, 0.84)
MARKER = "social_flow_previz"          # scene custom property: this .blend was made by blender_scene_build
MIN_VERSION = (4, 2)
# 4.2–4.5 call the engine BLENDER_EEVEE_NEXT; 5.0 renamed it back
EEVEE = "BLENDER_EEVEE" if bpy.app.version >= (5, 0) else "BLENDER_EEVEE_NEXT"
DEFAULTS = {"fps": 30, "frameStart": 1, "frameEnd": 150, "width": 1080, "height": 1920}
RIG_SUFFIX = ".rig"
BODY_SUFFIX = ".body"
UP = Vector((0.0, 0.0, 1.0))
DOWN = Vector((0.0, 0.0, -1.0))
FORWARD = Vector((0.0, -1.0, 0.0))     # every figure faces -Y; its left hand is at +X

# The person rig, parents first. Head and tail are fractions of the figure's height in the
# armature's own space (feet at z = 0); the left side is listed and the right is mirrored.
RIG_LEFT = [
    ("hips", None, (0.0, 0.0, 0.50), (0.0, 0.0, 0.56)),
    ("spine", "hips", (0.0, 0.0, 0.56), (0.0, 0.0, 0.70)),
    ("chest", "spine", (0.0, 0.0, 0.70), (0.0, 0.0, 0.84)),
    ("neck", "chest", (0.0, 0.0, 0.84), (0.0, 0.0, 0.88)),
    ("head", "neck", (0.0, 0.0, 0.88), (0.0, 0.0, 1.00)),
    ("shoulder.L", "chest", (0.03, 0.0, 0.82), (0.12, 0.0, 0.82)),
    ("upper_arm.L", "shoulder.L", (0.12, 0.0, 0.82), (0.12, 0.0, 0.64)),
    ("forearm.L", "upper_arm.L", (0.12, 0.0, 0.64), (0.12, 0.0, 0.48)),
    ("hand.L", "forearm.L", (0.12, 0.0, 0.48), (0.12, 0.0, 0.40)),
    ("thigh.L", "hips", (0.055, 0.0, 0.50), (0.055, 0.0, 0.27)),
    ("shin.L", "thigh.L", (0.055, 0.0, 0.27), (0.055, 0.0, 0.05)),
    ("foot.L", "shin.L", (0.055, 0.0, 0.05), (0.055, -0.10, 0.01)),
]
AXIAL = ("hips", "spine", "chest", "neck", "head")
LANDMARKS = ("hand.L", "hand.R", "foot.L", "foot.R", "head")

# The mannequin: a rigid piece per bone, joint balls on the parent bone so the child turns
# around them. (bone, kind, size, centre) with sizes and centres as fractions of height.
BODY_LEFT = [
    ("hips", "cyl", (0.095, 0.10), (0.0, 0.0, 0.55)),
    ("spine", "cyl", (0.085, 0.12), (0.0, 0.0, 0.63)),
    ("chest", "cyl", (0.105, 0.14), (0.0, 0.0, 0.77)),
    ("neck", "cyl", (0.028, 0.05), (0.0, 0.0, 0.86)),
    ("head", "ball", (0.07,), (0.0, 0.0, 0.93)),
    ("head", "box", (0.03, 0.03, 0.03), (0.0, -0.07, 0.93)),          # nose: the front marker
    ("shoulder.L", "ball", (0.038,), (0.12, 0.0, 0.82)),
    ("upper_arm.L", "cyl", (0.03, 0.15), (0.12, 0.0, 0.73)),
    ("upper_arm.L", "ball", (0.032,), (0.12, 0.0, 0.64)),              # elbow
    ("forearm.L", "cyl", (0.026, 0.13), (0.12, 0.0, 0.56)),
    ("hand.L", "box", (0.035, 0.02, 0.08), (0.12, 0.0, 0.44)),
    ("hips", "ball", (0.05,), (0.055, 0.0, 0.50)),                    # hip joint
    ("thigh.L", "cyl", (0.05, 0.19), (0.055, 0.0, 0.385)),
    ("thigh.L", "ball", (0.045,), (0.055, 0.0, 0.27)),                # knee
    ("shin.L", "cyl", (0.04, 0.18), (0.055, 0.0, 0.16)),
    ("foot.L", "box", (0.06, 0.15, 0.04), (0.055, -0.04, 0.02)),
]


def right_of(name):
    return name[:-2] + ".R" if name.endswith(".L") else name


def mirror_x(p):
    return (-p[0], p[1], p[2])


RIG_BONES = []
for _name, _parent, _head, _tail in RIG_LEFT:
    RIG_BONES.append((_name, _parent, _head, _tail))
    if _name.endswith(".L"):
        RIG_BONES.append((right_of(_name), right_of(_parent), mirror_x(_head), mirror_x(_tail)))

BODY_PARTS = []
for _bone, _kind, _size, _centre in BODY_LEFT:
    BODY_PARTS.append((_bone, _kind, _size, _centre))
    # a side bone's piece and the hip joint ball (bone "hips", off centre) both get a mirror
    if _bone.endswith(".L") or _centre[0] != 0.0:
        BODY_PARTS.append((right_of(_bone), _kind, _size, mirror_x(_centre)))

# Source-rig vocabularies for the retarget: normalised token strings (lower case, separators
# and a "left/right" token removed) → canonical bone. Order matters — the first match wins.
SYNONYMS = [
    ("hips", ("hips", "hip", "pelvis")),
    ("neck", ("neck", "neck1", "neck01")),
    ("head", ("head",)),
    ("shoulder", ("clavicle", "collar", "shoulder")),
    ("upper_arm", ("upperarm", "uparm", "arm", "humerus")),
    ("forearm", ("forearm", "lowerarm", "elbow", "radius")),
    ("hand", ("hand", "wrist")),
    ("thigh", ("upleg", "upperleg", "thigh", "femur", "hip")),
    ("shin", ("leg", "lowerleg", "shin", "calf", "knee", "tibia")),
    ("foot", ("foot", "ankle")),
]
SPINE_RE = re.compile(r"^(spine\d*|lowerback|chest|upperback|torso|abdomen)$")
NOISE_TOKENS = {"joint", "bone", "bip", "bip01", "bip001", "mixamorig", "def", "org", "mch", "b", "jnt"}
SIDE_TOKENS = {"l": "L", "left": "L", "r": "R", "right": "R", "lft": "L", "rgt": "R"}


def job_path():
    argv = sys.argv
    if "--" not in argv:
        raise RuntimeError("job path missing after --")
    return argv[argv.index("--") + 1]


def r3(v, n=4):
    return [round(float(x), n) for x in v]


def deg3(e):
    return [round(math.degrees(x), 3) for x in e]


def rad3(v):
    return [math.radians(float(x)) for x in v]


def open_blend(path):
    if not os.path.isfile(path):
        raise RuntimeError("blend file not found: %s (blender_scene_build creates one)" % path)
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)


def save_blend(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


# ── animation helpers (slotted actions in 4.4+, legacy fcurves before) ─────

def fcurves_of(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    # 4.4+: an action holds one slot per animated ID (a camera object and its camera data
    # share one action), so read only this ID's channelbag or the object's keys leak into
    # the data's report. Older Blender has one flat fcurve list.
    try:
        slot = ad.action_slot
        out = []
        if slot is not None:
            for layer in act.layers:
                for strip in layer.strips:
                    bag = strip.channelbag(slot)
                    if bag is not None:
                        out.extend(bag.fcurves)
        return out
    except (AttributeError, TypeError):
        pass
    try:
        return list(act.fcurves)
    except AttributeError:
        return []


def key_frames(idblock):
    frames = set()
    for fc in fcurves_of(idblock):
        for kp in fc.keyframe_points:
            frames.add(int(round(kp.co[0])))
    return sorted(frames)


def set_interpolation(idblock, mode):
    for fc in fcurves_of(idblock):
        for kp in fc.keyframe_points:
            kp.interpolation = mode


def extend_frame_range(sc, frames):
    if not frames:
        return
    sc.frame_start = min(sc.frame_start, min(frames))
    sc.frame_end = max(sc.frame_end, max(frames))


# ── scene summary ──────────────────────────────────────────────────────────

def summary(path):
    sc = bpy.context.scene
    objs = []
    for o in bpy.data.objects:
        info = {
            "name": o.name,
            "type": o.type,
            "location": r3(o.matrix_world.translation),
            "rotationDeg": deg3(o.matrix_world.to_euler("XYZ")),
            "scale": r3(o.scale),
            "dimensions": r3(o.dimensions),
            "parent": o.parent.name if o.parent else None,
            "keyframes": key_frames(o),
        }
        if o.type == "ARMATURE":
            info["bones"] = len(o.data.bones)
        objs.append(info)
    cam = sc.camera
    cam_info = None
    if cam is not None:
        d = cam.data
        cam_info = {
            "name": cam.name,
            "location": r3(cam.matrix_world.translation),
            "rotationDeg": deg3(cam.matrix_world.to_euler("XYZ")),
            "lensMm": round(d.lens, 3),
            "fovDeg": round(math.degrees(d.angle), 3),
            "sensorFit": d.sensor_fit,
            "clip": [round(d.clip_start, 4), round(d.clip_end, 2)],
            "keyframes": sorted(set(key_frames(cam)) | set(key_frames(d))),
        }
    return {
        "blender": bpy.app.version_string,
        "blendPath": path,
        "frame": {"start": sc.frame_start, "end": sc.frame_end, "fps": sc.render.fps},
        "resolution": [sc.render.resolution_x, sc.render.resolution_y],
        "camera": cam_info,
        "cameras": [o.name for o in bpy.data.objects if o.type == "CAMERA"],
        "objects": objs,
    }


# ── materials and primitives ───────────────────────────────────────────────

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, default):
    if not h:
        return default
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def material(name, rgba):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    m.diffuse_color = rgba
    bsdf = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = 0.6
    return m


def finish(o, name, mat, parent):
    o.name = name
    if o.data is not None:
        o.data.name = name
        if hasattr(o.data, "materials"):
            o.data.materials.append(mat)
    o.parent = parent
    return o


def cyl(name, radius, depth, location, mat, parent, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location, rotation=rotation, vertices=24)
    return finish(bpy.context.object, name, mat, parent)


def ball(name, radius, location, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=24, ring_count=12)
    o = finish(bpy.context.object, name, mat, parent)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    return o


def box(name, size, location, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    o = finish(bpy.context.object, name, mat, parent)
    o.scale = (size[0], size[1], size[2])
    return o


def empty(name, display_size=0.25):
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = display_size
    bpy.context.scene.collection.objects.link(root)
    return root


# Every proxy faces -Y (Blender's front view looks along +Y), so a nose block marks the front.
# A person is an armature (name.rig) under the root empty and one mannequin mesh (name.body)
# deformed by it: each rigid piece is weighted 100 % to one bone, so the figure bends at the
# joints and nowhere else — a wooden drawing mannequin, not a skinned character.
def person_rig(name, h, root):
    arm = bpy.data.armatures.new(name + RIG_SUFFIX)
    rig = bpy.data.objects.new(name + RIG_SUFFIX, arm)
    bpy.context.scene.collection.objects.link(rig)
    rig.parent = root
    arm.display_type = "OCTAHEDRAL"
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, parent, head, tail in RIG_BONES:
        eb = arm.edit_bones.new(bname)
        eb.head = Vector(head) * h
        eb.tail = Vector(tail) * h
        d = (eb.tail - eb.head).normalized()
        # roll only decides how the bone is drawn in Blender's own UI — poses here are
        # figure-axis rotations converted per bone, so any perpendicular reference will do
        eb.align_roll(UP if abs(d.y) > 0.5 else FORWARD)
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


def person_body(name, h, mat, rig):
    me = bpy.data.meshes.new(name + BODY_SUFFIX)
    body = bpy.data.objects.new(name + BODY_SUFFIX, me)
    bpy.context.scene.collection.objects.link(body)
    groups = {}
    for b in rig.data.bones:
        groups[b.name] = body.vertex_groups.new(name=b.name).index
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    for bone, kind, size, centre in BODY_PARTS:
        at = Matrix.Translation(Vector(centre) * h)
        if kind == "cyl":
            made = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20,
                                         radius1=size[0] * h, radius2=size[0] * h, depth=size[1] * h, matrix=at)
        elif kind == "ball":
            made = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=size[0] * h, matrix=at)
        else:
            made = bmesh.ops.create_cube(bm, size=1.0, matrix=at @ Matrix.Diagonal((size[0] * h, size[1] * h, size[2] * h, 1.0)))
        gi = groups[bone]
        faces = set()
        for v in made["verts"]:
            v[deform][gi] = 1.0
            if kind == "ball":
                faces.update(v.link_faces)
        for f in faces:
            f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    body.parent = rig
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    return body


# ── posing: figure-axis rotations → bone-local quaternions ─────────────────

def rot(axis, deg):
    return Matrix.Rotation(math.radians(float(deg)), 3, axis)


def rot_zyx(turn, lean, bow):
    # bow about X first, then lean about Y, then turn about Z — all in the figure's frame
    return rot("Z", turn) @ rot("Y", lean) @ rot("X", bow)


def aim_from_down(direction):
    # the smallest rotation that takes a hanging limb (0, 0, -1) to the direction
    d = Vector(direction)
    if d.length < 1e-9:
        return Matrix.Identity(3)
    d.normalize()
    if (d + DOWN).length < 1e-6:
        return rot("X", 180)      # straight up: go the forward way round
    return DOWN.rotation_difference(d).to_matrix()


def limb_world(ch, sx):
    # raise: forward and up (90 = horizontal in front, 180 = straight up); side: out from the
    # body (90 = horizontal to the side); sx is +1 for the figure's left, -1 for its right
    a = math.radians(float(ch.get("raise", 0) or 0))
    s = math.radians(float(ch.get("side", 0) or 0))
    d = Vector((sx * math.sin(s), -math.sin(a), -math.cos(a) * math.cos(s)))
    w = aim_from_down(d)
    t = float(ch.get("twist", 0) or 0)
    if t and d.length > 1e-9:
        w = Matrix.Rotation(math.radians(t * sx), 3, d.normalized()) @ w
    return w


def pose_to_bones(pose):
    # → [(bone, world rotation 3x3 in the figure frame, hips offset or None)]
    out = []
    hp = pose.get("hips")
    if hp is not None:
        off = hp.get("offset") or (0.0, 0.0, 0.0)
        out.append(("hips", rot_zyx(hp.get("turn", 0) or 0, hp.get("lean", 0) or 0, hp.get("bow", 0) or 0), [float(x) for x in off]))
    t = pose.get("torso")
    if t is not None:
        half = rot_zyx((t.get("turn", 0) or 0) / 2.0, (t.get("lean", 0) or 0) / 2.0, (t.get("bow", 0) or 0) / 2.0)
        out.append(("spine", half, None))
        out.append(("chest", half, None))
    hd = pose.get("head")
    if hd is not None:
        half = rot_zyx((hd.get("turn", 0) or 0) / 2.0, (hd.get("tilt", 0) or 0) / 2.0, (hd.get("nod", 0) or 0) / 2.0)
        out.append(("neck", half, None))
        out.append(("head", half, None))
    for side, sx in (("L", 1.0), ("R", -1.0)):
        arm = pose.get("arm" + side)
        if arm is not None:
            out.append(("upper_arm." + side, limb_world(arm, sx), None))
            out.append(("forearm." + side, rot("X", -float(arm.get("elbow", 0) or 0)), None))
        leg = pose.get("leg" + side)
        if leg is not None:
            out.append(("thigh." + side, limb_world(leg, sx), None))
            out.append(("shin." + side, rot("X", float(leg.get("knee", 0) or 0)), None))
            out.append(("foot." + side, rot("X", float(leg.get("ankle", 0) or 0)), None))
    for bname, e in (pose.get("bones") or {}).items():
        out.append((bname, rot_zyx(e[2], e[1], e[0]), None))
    return out


def find_rig(name):
    o = bpy.data.objects.get(name)
    if o is None:
        names = ", ".join(sorted(x.name for x in bpy.data.objects if x.parent is None))
        raise RuntimeError("no object named %s — top-level objects: %s" % (name, names))
    if o.type == "ARMATURE":
        return (o.parent or o), o
    for c in o.children:
        if c.type == "ARMATURE":
            return o, c
    raise RuntimeError("%s has no rig — only person proxies are jointed; blender_object_animate moves other things whole" % name)


def set_bone_rotation(rig, bname, world, prev):
    # local = rest^-1 · world · rest, so a rotation stated in the figure's axes lands on the bone
    b = rig.data.bones.get(bname)
    if b is None:
        raise RuntimeError("the rig has no bone %s — bones: %s" % (bname, ", ".join(x.name for x in rig.data.bones)))
    rest = b.matrix_local.to_3x3()
    q = (rest.inverted() @ world @ rest).to_quaternion()
    pq = prev.get(bname)
    if pq is not None and pq.dot(q) < 0:
        q.negate()
    prev[bname] = q.copy()
    pb = rig.pose.bones[bname]
    pb.rotation_quaternion = q
    return pb


def landmark_tails(rig, frame):
    bpy.context.scene.frame_set(int(frame))
    out = {}
    for bname in LANDMARKS:
        pb = rig.pose.bones.get(bname)
        if pb is not None:
            out[bname] = r3(rig.matrix_world @ pb.tail, 3)
    return out


def op_pose(job):
    sc = bpy.context.scene
    root, rig = find_rig(job["object"])
    prev = {}
    if job["clearExisting"]:
        rig.animation_data_clear()
    else:
        existing = key_frames(rig)
        if existing:
            sc.frame_set(max(existing))
            for pb in rig.pose.bones:
                prev[pb.name] = pb.rotation_quaternion.copy()
    frames = []
    touched = set()
    for k in job["keys"]:
        f = int(k["frame"])
        frames.append(f)
        for bname, world, offset in pose_to_bones(k["pose"]):
            pb = set_bone_rotation(rig, bname, world, prev)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f, group=bname)
            if offset is not None:
                rest = rig.data.bones[bname].matrix_local.to_3x3()
                pb.location = rest.inverted() @ Vector(offset)
                pb.keyframe_insert(data_path="location", frame=f, group=bname)
            touched.add(bname)
    set_interpolation(rig, job["interpolation"])
    extend_frame_range(sc, frames)
    tails = landmark_tails(rig, max(frames))
    sc.frame_current = sc.frame_start
    return {"object": root.name, "rig": rig.name, "keyframes": sorted(set(frames)), "bones": sorted(touched), "tails": tails}


# ── motion capture retarget ────────────────────────────────────────────────

def tokens_of(name):
    # "mixamorig:LeftForeArm" → ("L", "forearm"); "UpperLeg_R" → ("R", "upperleg"); "Chest" → (None, "chest")
    s = name.split(":")[-1]
    s = re.sub(r"^([LR])([A-Z][a-z])", r"\1 \2", s)          # LHip → L Hip
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)             # camelCase → words
    parts = [t for t in re.split(r"[^A-Za-z0-9]+", s.lower()) if t]
    side = None
    body = []
    for t in parts:
        if t in SIDE_TOKENS and side is None:
            side = SIDE_TOKENS[t]
        elif t in NOISE_TOKENS:
            continue
        else:
            body.append(t)
    return side, "".join(body)


def bone_depth(src, name):
    b = src.data.bones.get(name)
    d = 0
    while b is not None and b.parent is not None:
        b = b.parent
        d += 1
    return d


def match_bones(src, override):
    # canonical → source bone name. Side bones need a side token; the axial chain must have
    # none; a bone whose name ends in end/nub/top/tip is a leaf marker, not a joint.
    found = {}
    scored = []
    for b in src.data.bones:
        side, body = tokens_of(b.name)
        if not body or body.endswith(("end", "nub", "top", "tip")):
            continue
        scored.append((b.name, side, body))
    for canon, words in SYNONYMS:
        sided = canon not in AXIAL
        for w in words:
            for n, side, body in scored:
                if body != w or (sided and side is None) or (not sided and side is not None):
                    continue
                key = canon + "." + side if sided else canon
                found.setdefault(key, n)
    # the spine chain: every spine-family bone without a side, root first — the first is the
    # spine, the last (when there are several) the chest
    spines = sorted([n for n, side, body in scored if side is None and SPINE_RE.match(body)], key=lambda n: bone_depth(src, n))
    if spines:
        found.setdefault("spine", spines[0])
        if len(spines) > 1:
            found.setdefault("chest", spines[-1])
    # SMPL-style names call the upper arm "Shoulder" and the clavicle "Collar"
    used = set(found.values())
    for side in ("L", "R"):
        if "upper_arm." + side not in found:
            for n, s, body in scored:
                if s == side and body == "shoulder" and n not in used:
                    found["upper_arm." + side] = n
                    used.add(n)
                    break
    for canon, n in (override or {}).items():
        found[canon] = n
    return found


def frame_from(up, side):
    # a 3x3 with columns (side, up, forward) — the axial bones' rest frame, so it is the pose
    y = Vector(up)
    if y.length < 1e-9:
        y = UP.copy()
    y.normalize()
    x = Vector(side) - Vector(side).dot(y) * y
    if x.length < 1e-6:
        x = UP.cross(y) if abs(y.dot(UP)) < 0.99 else Vector((1.0, 0.0, 0.0))
    x.normalize()
    z = x.cross(y)
    m = Matrix((x, y, z))
    m.transpose()
    return m


def joint_positions(src, S, mapping, Y):
    # world heads (joints) of the mapped source bones and, where the bone has length, tails —
    # turned by the facing correction Y
    heads = {}
    tails = {}
    for c, m in mapping.items():
        pb = src.pose.bones[m]
        heads[c] = Y @ (S @ pb.head)
        if (pb.tail - pb.head).length > 1e-6:
            tails[c] = Y @ (S @ pb.tail)
    return heads, tails


def pose_targets(J, T):
    # → {bone: 3x3 pose rotation in the figure frame}. The axial chain gets a full frame (up
    # from the joint above, side from the hip or shoulder line); a limb bone gets the smallest
    # turn of its rest direction onto the joint-to-joint direction.
    def diff(a, b):
        if a in J and b in J and (J[b] - J[a]).length > 1e-6:
            return J[b] - J[a]
        return None
    side_hips = diff("thigh.R", "thigh.L")
    side_chest = diff("shoulder.R", "shoulder.L") or diff("upper_arm.R", "upper_arm.L")
    if side_hips is None and side_chest is None:
        side_hips = Vector((1.0, 0.0, 0.0))
    sides = {
        "hips": side_hips or side_chest,
        "spine": (side_hips + side_chest) if (side_hips is not None and side_chest is not None) else (side_hips or side_chest),
        "chest": side_chest or side_hips,
        "neck": side_chest or side_hips,
        "head": side_chest or side_hips,
    }
    out = {}
    dirs = {}
    for i, c in enumerate(AXIAL):
        if c not in J:
            continue
        above = None
        for n in AXIAL[i + 1:]:
            if n in J:
                above = n
                break
        if above is not None:
            up = J[above] - J[c]
        elif c in T:
            up = T[c] - J[c]
        else:
            below = None
            for n in reversed(AXIAL[:i]):
                if n in J:
                    below = n
                    break
            up = (J[c] - J[below]) if below is not None else UP.copy()
        out[c] = frame_from(up, sides[c])
    for side in ("L", "R"):
        for a, b in (("shoulder", "upper_arm"), ("upper_arm", "forearm"), ("forearm", "hand"), ("thigh", "shin"), ("shin", "foot")):
            d = diff(a + "." + side, b + "." + side)
            if d is not None:
                dirs[a + "." + side] = d
        for end in ("hand", "foot"):
            c = end + "." + side
            if c in J and c in T:
                dirs[c] = T[c] - J[c]
    return out, dirs


def op_motion(job):
    sc = bpy.context.scene
    root, rig = find_rig(job["object"])
    path = job["motionPath"]
    fps = float(sc.render.fps)
    before_objects = set(o.name for o in bpy.data.objects)
    before_actions = set(a.name for a in bpy.data.actions)
    before_arms = set(a.name for a in bpy.data.armatures)
    before_meshes = set(m.name for m in bpy.data.meshes)
    frame_before = (sc.frame_start, sc.frame_end)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".bvh":
        # the importer retimes the file's frame time to the scene fps and starts at frame 1
        bpy.ops.import_anim.bvh(filepath=path, target="ARMATURE", global_scale=1.0, frame_start=1, use_fps_scale=True,
                                update_scene_fps=False, update_scene_duration=False, use_cyclic=False,
                                rotate_mode="NATIVE", axis_forward="-Z", axis_up="Y")
    else:
        bpy.ops.import_scene.fbx(filepath=path, use_anim=True, anim_offset=1.0, ignore_leaf_bones=False,
                                 automatic_bone_orientation=False, global_scale=1.0)
    sc.frame_start, sc.frame_end = frame_before
    keep_actions = set()

    def cleanup():
        for o in list(bpy.data.objects):
            if o.name not in before_objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions):
            if a.name not in before_actions and a.name not in keep_actions:
                bpy.data.actions.remove(a)
        for a in list(bpy.data.armatures):
            if a.name not in before_arms and a.users == 0:
                bpy.data.armatures.remove(a)
        for m in list(bpy.data.meshes):
            if m.name not in before_meshes and m.users == 0:
                bpy.data.meshes.remove(m)

    try:
        sources = [o for o in bpy.data.objects if o.name not in before_objects and o.type == "ARMATURE"
                   and o.animation_data is not None and o.animation_data.action is not None]
        if not sources:
            raise RuntimeError("no animated armature in %s — the file needs a skeleton with keyframes (BVH, or an FBX with animation)" % path)
        src = sources[0]
        act = src.animation_data.action
        first, last = act.frame_range
        first = int(math.floor(first))
        last = int(math.ceil(last))
        src_seconds = (last - first + 1) / fps
        src_names = [b.name for b in src.data.bones]
        mapping = match_bones(src, job.get("boneMap"))
        for canon, n in list(mapping.items()):
            if n not in src.data.bones:
                raise RuntimeError("boneMap names %s for %s, but the file has no such bone — bones: %s" % (n, canon, ", ".join(src_names)))
        if "hips" not in mapping:
            raise RuntimeError("no hips/pelvis bone recognised in %s — pass boneMap (bones: %s)" % (path, ", ".join(src_names)))

        # slice and timing: source frames are already at the scene fps
        f0 = first + float(job.get("fromSeconds") or 0) * fps
        f1 = min(float(last), first + float(job["toSeconds"]) * fps) if job.get("toSeconds") is not None else float(last)
        if f0 > float(last):
            raise RuntimeError("fromSeconds %.2f is past the end of the clip (%.2f s)" % (float(job.get("fromSeconds") or 0), src_seconds))
        if f1 < f0:
            raise RuntimeError("the slice is empty — toSeconds must be after fromSeconds")
        speed = float(job["speed"])
        start = int(job["frameStart"]) if job.get("frameStart") is not None else sc.frame_start
        span = (f1 - f0) / speed
        end = max(sc.frame_end, start) if job["loop"] else start + int(math.floor(span))
        n = end - start + 1
        if n > int(job["maxFrames"]):
            raise RuntimeError("%d frames to bake; a previz is at most %d — pass fromSeconds/toSeconds or speed" % (n, int(job["maxFrames"])))

        S = src.matrix_world.copy()
        rest_ours = {b.name: b.matrix_local.copy() for b in rig.data.bones}

        # the first frame decides the facing correction and the scale
        sc.frame_set(int(f0), subframe=f0 - int(f0))
        J0, T0 = joint_positions(src, S, mapping, Matrix.Identity(3))
        yaw = 0.0
        for lc, rc in (("thigh.L", "thigh.R"), ("shoulder.L", "shoulder.R"), ("upper_arm.L", "upper_arm.R")):
            if lc in J0 and rc in J0:
                side = J0[lc] - J0[rc]
                fwd = side.cross(UP)
                if fwd.length > 1e-6:
                    yaw = math.atan2(FORWARD.y, FORWARD.x) - math.atan2(fwd.y, fwd.x)
                break
        Y = Matrix.Rotation(yaw, 3, "Z")

        # scale by leg length (pose-independent), else by the trunk
        def our_len(c):
            b = rig.data.bones[c]
            return (b.tail_local - b.head_local).length
        ratio = None
        for side in ("L", "R"):
            t, s, f = "thigh." + side, "shin." + side, "foot." + side
            if t in J0 and s in J0 and f in J0:
                theirs = (J0[s] - J0[t]).length + (J0[f] - J0[s]).length
                if theirs > 1e-6:
                    ratio = (our_len(t) + our_len(s)) / theirs
                    break
        if ratio is None:
            chain = [c for c in AXIAL if c in J0]
            theirs = sum((J0[chain[i + 1]] - J0[chain[i]]).length for i in range(len(chain) - 1))
            ours = sum(our_len(c) for c in chain[:-1]) if len(chain) > 1 else 0.0
            if theirs < 1e-6 or ours < 1e-6:
                raise RuntimeError("cannot scale %s to the figure — neither a leg nor a trunk chain was matched (bones: %s)" % (path, ", ".join(src_names)))
            ratio = ours / theirs
        hips0 = Y @ J0["hips"]

        # the floor is the lowest the feet get in the slice, so the figure stands on z = 0 and a
        # crouch at the first frame does not sink the whole clip
        def lowest(J, T):
            zs = [J[c].z for c in ("foot.L", "foot.R", "shin.L", "shin.R") if c in J] + [T[c].z for c in ("foot.L", "foot.R") if c in T]
            return min(zs) if zs else None
        floor_src = None
        probe = f0
        while probe <= f1:
            sc.frame_set(int(math.floor(probe)), subframe=probe - math.floor(probe))
            z = lowest(*joint_positions(src, S, mapping, Y))
            if z is not None and (floor_src is None or z < floor_src):
                floor_src = z
            probe += max(1.0, (f1 - f0) / 120.0)
        hips_rest_z = rest_ours["hips"].translation.z

        if job["clearExisting"]:
            rig.animation_data_clear()
        order = [b.name for b in rig.data.bones]        # armature order is parents first
        prev = {}
        keyed = set()
        hips_rest = rest_ours["hips"].to_3x3()
        rest_dir = {c: (rest_ours[c].to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized() for c in order}
        for t in range(start, end + 1):
            fsrc = f0 + (t - start) * speed
            if job["loop"] and f1 > f0:
                fsrc = f0 + math.fmod(fsrc - f0, f1 - f0)
            fsrc = min(fsrc, f1)
            sc.frame_set(int(math.floor(fsrc)), subframe=fsrc - math.floor(fsrc))
            J, T = joint_positions(src, S, mapping, Y)
            frames3, dirs = pose_targets(J, T)
            posed = {}
            for c in order:
                Rb = rest_ours[c].to_3x3()
                parent = rig.data.bones[c].parent
                if c in frames3:
                    Pt = frames3[c]
                elif c in dirs:
                    Pt = rest_dir[c].rotation_difference(dirs[c].normalized()).to_matrix() @ Rb
                elif parent is not None:
                    Pt = posed[parent.name] @ rest_ours[parent.name].to_3x3().inverted() @ Rb
                else:
                    Pt = Rb
                posed[c] = Pt
                if c not in frames3 and c not in dirs:
                    continue
                if parent is not None:
                    local = (posed[parent.name] @ rest_ours[parent.name].to_3x3().inverted() @ Rb).inverted() @ Pt
                else:
                    local = Rb.inverted() @ Pt
                q = local.to_quaternion()
                pq = prev.get(c)
                if pq is not None and pq.dot(q) < 0:
                    q.negate()
                prev[c] = q.copy()
                pb = rig.pose.bones[c]
                pb.rotation_quaternion = q
                pb.keyframe_insert(data_path="rotation_quaternion", frame=t, group=c)
                keyed.add(c)
            d = (J["hips"] - hips0) * ratio
            if floor_src is not None:
                d.z = (J["hips"].z - floor_src) * ratio - hips_rest_z
            if job["rootMotion"] == "inplace":
                d.x = 0.0
                d.y = 0.0
            pb = rig.pose.bones["hips"]
            pb.location = hips_rest.inverted() @ d
            pb.keyframe_insert(data_path="location", frame=t, group="hips")
        if rig.animation_data is not None and rig.animation_data.action is not None:
            keep_actions.add(rig.animation_data.action.name)
        set_interpolation(rig, "LINEAR")
        extend_frame_range(sc, [start, end])
        unmapped = [c for c in order if c not in keyed]
        info = {
            "source": path,
            "sourceBones": len(src_names),
            "sourceSeconds": round(src_seconds, 3),
            "fromSeconds": round((f0 - first) / fps, 3),
            "toSeconds": round((f1 - first) / fps, 3),
            "speed": speed,
            "loop": bool(job["loop"]),
            "rootMotion": job["rootMotion"],
            "mapped": dict(sorted((c, mapping[c]) for c in mapping if c in keyed)),
            "unmapped": unmapped,
            "frames": n,
            "heightRatio": round(ratio, 5),
            "yawDeg": round(math.degrees(yaw), 2),
        }
    finally:
        cleanup()
    tails = landmark_tails(rig, start)
    tails_end = landmark_tails(rig, end)
    sc.frame_current = sc.frame_start
    return {"object": root.name, "rig": rig.name, "keyframes": [start, end], "bones": sorted(keyed), "tails": tails, "tailsEnd": tails_end, "motion": info}


def dog_parts(p, h, mat, root):
    box(p + ".body", (0.45 * h, 1.0 * h, 0.45 * h), (0, 0, 0.60 * h), mat, root)
    for side, x in (("L", -0.15), ("R", 0.15)):
        for end, y in (("front", -0.32), ("back", 0.32)):
            cyl(p + ".leg." + end + side, 0.06 * h, 0.40 * h, (x * h, y * h, 0.20 * h), mat, root)
    ball(p + ".head", 0.20 * h, (0, -0.62 * h, 0.72 * h), mat, root)
    box(p + ".nose", (0.10 * h, 0.12 * h, 0.08 * h), (0, -0.82 * h, 0.70 * h), mat, root)


def car_parts(p, mat, root):
    dark = material("proxy-tyre", (0.08, 0.08, 0.08, 1.0))
    box(p + ".body", (1.8, 4.4, 0.6), (0, 0, 0.55), mat, root)
    box(p + ".cabin", (1.6, 2.2, 0.5), (0, 0.2, 1.10), mat, root)
    for side, x in (("L", -0.85), ("R", 0.85)):
        for end, y in (("front", -1.4), ("back", 1.4)):
            cyl(p + ".wheel." + end + side, 0.33, 0.22, (x, y, 0.33), dark, root, rotation=(0.0, math.pi / 2, 0.0))


def make_proxy(spec):
    name = spec["name"]
    if bpy.data.objects.get(name) is not None:
        raise RuntimeError("an object named %s already exists in this scene" % name)
    kind = spec["kind"]
    mat = material("proxy-" + name, hex_rgba(spec.get("color"), PROXY_GRAY))
    root = empty(name)
    if kind == "person":
        h = float(spec.get("height") or 1.75)
        person_body(name, h, mat, person_rig(name, h, root))
    elif kind == "dog":
        dog_parts(name, float(spec.get("height") or 0.55), mat, root)
    elif kind == "car":
        car_parts(name, mat, root)
        size = spec.get("size")
        if size:
            root.scale = (size[0] / 1.8, size[1] / 4.4, size[2] / 1.45)
    elif kind == "box":
        size = spec["size"]
        box(name + ".mesh", size, (0, 0, size[2] / 2.0), mat, root)
    elif kind == "cylinder":
        radius = float(spec.get("radius") or 0.5)
        height = float(spec.get("height") or 1.0)
        cyl(name + ".mesh", radius, height, (0, 0, height / 2.0), mat, root)
    elif kind == "sphere":
        radius = float(spec.get("radius") or 0.5)
        ball(name + ".mesh", radius, (0, 0, radius), mat, root)
    else:
        raise RuntimeError("unknown proxy kind %s" % kind)
    root.location = Vector([float(x) for x in spec.get("location", (0, 0, 0))])
    root.rotation_euler = Euler((0.0, 0.0, math.radians(float(spec.get("rotationZDeg", 0)))), "XYZ")
    return root


def import_glb(imp):
    name = imp["name"]
    if bpy.data.objects.get(name) is not None:
        raise RuntimeError("an object named %s already exists in this scene" % name)
    before = set(o.name for o in bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=imp["glbPath"])
    new = [o for o in bpy.data.objects if o.name not in before]
    if not new:
        raise RuntimeError("nothing was imported from %s" % imp["glbPath"])
    root = empty(name, 0.5)
    for o in new:
        if o.parent is None or o.parent.name in before:
            o.parent = root
    root.location = Vector([float(x) for x in imp["location"]])
    root.rotation_euler = Euler(rad3(imp["rotationDeg"]), "XYZ")
    s = float(imp["scale"])
    root.scale = (s, s, s)
    return {"name": name, "objects": len(new)}


def ensure_world(sc):
    if sc.world is None:
        sc.world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    sc.world.color = WORLD_GRAY
    if sc.world.use_nodes and sc.world.node_tree:
        bg = sc.world.node_tree.nodes.get("Background")
        if bg is not None:
            bg.inputs[0].default_value = (WORLD_GRAY[0], WORLD_GRAY[1], WORLD_GRAY[2], 1.0)
            bg.inputs[1].default_value = 1.0


# ── operations ─────────────────────────────────────────────────────────────

def op_build(job):
    path = job["blendPath"]
    exists = os.path.isfile(path)
    fresh = job["reset"] or not exists
    if job["reset"] and exists and not job.get("force"):
        # refuse to wipe a .blend this lane did not make — a hand-authored file is not previz scratch
        open_blend(path)
        if not bpy.context.scene.get(MARKER):
            raise RuntimeError("%s was not made by blender_scene_build — refusing to overwrite it; pass force:true to replace it, or reset:false to add to it" % path)
    if fresh:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    else:
        open_blend(path)
    sc = bpy.context.scene
    sc[MARKER] = 1
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.length_unit = "METERS"
    sc.unit_settings.scale_length = 1.0

    def given(key):
        return job.get(key) is not None

    def value(key):
        return job[key] if given(key) else DEFAULTS[key]

    # a fresh scene takes the defaults; an extended one keeps its values unless the caller names new ones
    if fresh or given("fps"):
        sc.render.fps = int(value("fps"))
        sc.render.fps_base = 1.0
    if fresh or given("frameStart"):
        sc.frame_start = int(value("frameStart"))
    if fresh or given("frameEnd"):
        sc.frame_end = int(value("frameEnd"))
    if sc.frame_end < sc.frame_start:
        raise RuntimeError("frameEnd %d is before frameStart %d" % (sc.frame_end, sc.frame_start))
    sc.frame_current = sc.frame_start
    if fresh or given("width"):
        sc.render.resolution_x = int(value("width"))
    if fresh or given("height"):
        sc.render.resolution_y = int(value("height"))
    sc.render.resolution_percentage = 100
    ensure_world(sc)
    if job["floor"] and bpy.data.objects.get("Floor") is None:
        bpy.ops.mesh.primitive_plane_add(size=float(job["floorSize"]), location=(0, 0, 0))
        finish(bpy.context.object, "Floor", material("floor", FLOOR_GRAY), None)
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
        sun.data.energy = 3.0
        sun.data.angle = math.radians(5)
        sun.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(35)), "XYZ")
        sc.collection.objects.link(sun)
    built = []
    for imp in job["imports"]:
        built.append(import_glb(imp))
    for spec in job["proxies"]:
        make_proxy(spec)
        built.append({"name": spec["name"], "kind": spec["kind"]})
    save_blend(path)
    res = summary(path)
    res["built"] = built
    return res


def look_at_quat(location, target):
    d = Vector(target) - Vector(location)
    if d.length < 1e-9:
        d = Vector((0.0, 1.0, 0.0))
    return d.to_track_quat("-Z", "Y")


def op_camera(job):
    sc = bpy.context.scene
    name = job["name"]
    cam = bpy.data.objects.get(name)
    if cam is not None and cam.type != "CAMERA":
        raise RuntimeError("%s exists but is a %s, not a camera" % (name, cam.type))
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        sc.collection.objects.link(cam)
    sc.camera = cam
    d = cam.data
    d.sensor_fit = "AUTO"
    d.clip_start = 0.05
    d.clip_end = 2000.0
    if job.get("lensMm") is not None:
        d.lens = float(job["lensMm"])
    elif job.get("fovDeg") is not None:
        d.angle = math.radians(float(job["fovDeg"]))
    prev_q = None
    if job["clearExisting"]:
        cam.animation_data_clear()
        d.animation_data_clear()
    else:
        # continue the hemisphere from the last existing key, or the first new key may take the long way round
        existing = key_frames(cam)
        if existing:
            sc.frame_set(max(existing))
            # the stored key, sign and all — a matrix-derived quaternion is sign-normalised and
            # could sit on the opposite hemisphere from a key this lane negated for continuity
            prev_q = cam.rotation_quaternion.copy() if cam.rotation_mode == "QUATERNION" else cam.matrix_basis.to_quaternion()
    cam.rotation_mode = "QUATERNION"
    keys = job["keys"]
    static = len(keys) == 1 and keys[0].get("frame") is None
    # a zoom needs the lens keyed at every pose, or the one lens key holds for the whole move
    zoom = any(k.get("lensMm") is not None for k in keys)
    frames = []
    for k in keys:
        loc = Vector([float(x) for x in k["location"]])
        if k.get("target") is not None:
            q = look_at_quat(loc, [float(x) for x in k["target"]])
        else:
            q = Euler(rad3(k["rotationDeg"]), "XYZ").to_quaternion()
        # keep the quaternion on the same hemisphere as the previous key, or the
        # interpolation takes the long way round between two nearly equal poses
        if prev_q is not None and prev_q.dot(q) < 0:
            q.negate()
        prev_q = q.copy()
        cam.location = loc
        cam.rotation_quaternion = q
        if k.get("lensMm") is not None:
            d.lens = float(k["lensMm"])
        if not static:
            f = int(k["frame"])
            frames.append(f)
            cam.keyframe_insert(data_path="location", frame=f)
            cam.keyframe_insert(data_path="rotation_quaternion", frame=f)
            if zoom:
                d.keyframe_insert(data_path="lens", frame=f)
    if not static:
        set_interpolation(cam, job["interpolation"])
        set_interpolation(d, job["interpolation"])
        extend_frame_range(sc, frames)
    sc.frame_current = sc.frame_start
    return {"camera": cam.name, "keyframes": sorted(frames)}


def op_animate(job):
    sc = bpy.context.scene
    o = bpy.data.objects.get(job["object"])
    if o is None:
        names = ", ".join(sorted(x.name for x in bpy.data.objects if x.parent is None))
        raise RuntimeError("no object named %s — top-level objects: %s" % (job["object"], names))
    if job["clearExisting"]:
        o.animation_data_clear()
    o.rotation_mode = "XYZ"
    frames = []
    for k in job["keys"]:
        f = int(k["frame"])
        frames.append(f)
        if k.get("location") is not None:
            o.location = Vector([float(x) for x in k["location"]])
            o.keyframe_insert(data_path="location", frame=f)
        if k.get("rotationDeg") is not None:
            o.rotation_euler = Euler(rad3(k["rotationDeg"]), "XYZ")
            o.keyframe_insert(data_path="rotation_euler", frame=f)
        if k.get("scale") is not None:
            s = k["scale"]
            o.scale = (float(s), float(s), float(s)) if not isinstance(s, list) else tuple(float(x) for x in s)
            o.keyframe_insert(data_path="scale", frame=f)
    set_interpolation(o, job["interpolation"])
    extend_frame_range(sc, frames)
    sc.frame_current = sc.frame_start
    return {"object": o.name, "keyframes": sorted(frames)}


def configure_stamp(sc, on, height):
    r = sc.render
    r.use_stamp = bool(on)
    if not on:
        return
    for attr in ("use_stamp_date", "use_stamp_time", "use_stamp_render_time", "use_stamp_filename",
                 "use_stamp_scene", "use_stamp_memory", "use_stamp_hostname", "use_stamp_marker",
                 "use_stamp_sequencer_strip", "use_stamp_note", "use_stamp_frame_range"):
        if hasattr(r, attr):
            setattr(r, attr, False)
    r.use_stamp_frame = True
    r.use_stamp_camera = True
    r.use_stamp_lens = True
    r.use_stamp_labels = True
    r.stamp_font_size = max(12, int(height) // 45)
    r.stamp_foreground = (1.0, 1.0, 1.0, 1.0)
    r.stamp_background = (0.0, 0.0, 0.0, 0.5)


def op_render(job):
    sc = bpy.context.scene
    if sc.camera is None:
        raise RuntimeError("the scene has no active camera — run blender_camera_set first")
    engine = job["engine"]
    if job.get("width") is not None:
        sc.render.resolution_x = int(job["width"])
    if job.get("height") is not None:
        sc.render.resolution_y = int(job["height"])
    sc.render.resolution_percentage = 100
    if job.get("fps") is not None:
        sc.render.fps = int(job["fps"])
        sc.render.fps_base = 1.0
    start = int(job["frameStart"]) if job.get("frameStart") is not None else sc.frame_start
    end = int(job["frameEnd"]) if job.get("frameEnd") is not None else sc.frame_end
    if end < start:
        raise RuntimeError("frameEnd %d is before frameStart %d" % (end, start))
    n = end - start + 1
    if n > int(job["maxFrames"]):
        raise RuntimeError("%d frames asked for; a previz is at most %d — split the cut or pass frameStart/frameEnd" % (n, int(job["maxFrames"])))
    sc.frame_start = start
    sc.frame_end = end
    ensure_world(sc)
    sc.render.film_transparent = False
    if engine == "eevee":
        sc.render.engine = EEVEE
        sc.eevee.taa_render_samples = int(job["samples"])
    else:
        sc.render.engine = "BLENDER_WORKBENCH"
        sh = sc.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_cavity = True
        sh.show_object_outline = True
        sh.show_shadows = True
        sh.shadow_intensity = 0.4
        sh.show_specular_highlight = True
        try:
            sh.background_type = "WORLD"
        except Exception:
            pass
        sc.display.render_aa = "8"
    configure_stamp(sc, job["stamp"], sc.render.resolution_y)

    video_path = job["videoPath"]
    out_dir = os.path.dirname(video_path)
    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(video_path))[0]
    # sweep before starting: a killed render leaves its private-prefix file, and a failed one
    # must not leave last time's mp4 and stills where they read as this time's result. Only
    # this stem's files — another .blend rendering into the same folder keeps its own.
    private = ".previz-%s-" % stem
    for stale in os.listdir(out_dir):
        if stale.startswith(private) or stale == os.path.basename(video_path) or (stale.startswith(stem + "-f") and stale.endswith(".png")):
            os.remove(os.path.join(out_dir, stale))
    ims = sc.render.image_settings
    if hasattr(ims, "media_type"):      # 5.0+; 4.x picks video from file_format alone
        ims.media_type = "VIDEO"
    ims.file_format = "FFMPEG"
    ims.color_mode = "RGB"
    ff = sc.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "MEDIUM"
    ff.ffmpeg_preset = "GOOD"
    ff.gopsize = max(1, min(int(sc.render.fps), 30))
    ff.audio_codec = "NONE"
    # Blender appends the frame range to a video file name, so render to a private prefix
    # and move the one file it writes to the name the caller asked for.
    prefix = os.path.join(out_dir, private + "%d-" % os.getpid())
    sc.render.filepath = prefix
    t0 = time.time()
    bpy.ops.render.render(animation=True)
    written = sorted(f for f in os.listdir(out_dir) if f.startswith(os.path.basename(prefix)))
    if not written:
        raise RuntimeError("Blender rendered but wrote no video under %s" % out_dir)
    os.replace(os.path.join(out_dir, written[-1]), video_path)
    for extra in written[:-1]:
        os.remove(os.path.join(out_dir, extra))

    stills = job.get("stills")
    if stills is None:
        mid = start + (end - start) // 2
        stills = sorted(set([start, mid, end]))
    still_paths = []
    skipped = []
    if hasattr(ims, "media_type"):
        ims.media_type = "IMAGE"
    ims.file_format = "PNG"
    ims.color_mode = "RGB"
    for f in stills:
        f = int(f)
        if f < start or f > end:
            skipped.append(f)
            continue
        sc.frame_set(f)
        p = os.path.join(out_dir, "%s-f%04d.png" % (stem, f))
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        still_paths.append(p)
    elapsed = time.time() - t0
    return {
        "videoPath": video_path,
        "stillPaths": still_paths,
        "skippedStills": skipped,
        "width": sc.render.resolution_x,
        "height": sc.render.resolution_y,
        "fps": sc.render.fps,
        "frameStart": start,
        "frameEnd": end,
        "frames": n,
        "seconds": round(n / float(sc.render.fps), 3),
        "elapsedSeconds": round(elapsed, 2),
    }


def main():
    job = json.load(open(job_path(), encoding="utf-8"))
    out = {"ok": False, "error": "no operation ran"}
    try:
        if bpy.app.version < MIN_VERSION:
            raise RuntimeError("Blender %s is older than %d.%d — the bridge needs 4.2 or newer (brew upgrade --cask blender)"
                               % (bpy.app.version_string, MIN_VERSION[0], MIN_VERSION[1]))
        op = job["op"]
        path = job["blendPath"]
        if op == "read":
            open_blend(path)
            res = summary(path)
        elif op == "build":
            res = op_build(job)
        elif op == "camera":
            open_blend(path)
            info = op_camera(job)
            save_blend(path)
            res = summary(path)
            res["applied"] = info
        elif op == "animate":
            open_blend(path)
            info = op_animate(job)
            save_blend(path)
            res = summary(path)
            res["applied"] = info
        elif op == "pose":
            open_blend(path)
            info = op_pose(job)
            save_blend(path)
            res = summary(path)
            res["applied"] = info
        elif op == "motion":
            open_blend(path)
            info = op_motion(job)
            save_blend(path)
            res = summary(path)
            res["applied"] = info
        elif op == "render":
            open_blend(path)
            res = op_render(job)
        else:
            raise RuntimeError("unknown op %s" % op)
        out = {"ok": True, "result": res}
    except Exception as e:
        out = {"ok": False, "error": str(e), "trace": traceback.format_exc()[-2500:]}
    with open(job["resultPath"], "w", encoding="utf-8") as fh:
        json.dump(out, fh)


main()
`;
