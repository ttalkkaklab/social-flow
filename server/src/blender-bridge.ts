/**
 * Blender bridge — drives a local Blender the way the Higgsfield Bridge drives it for
 * ChatGPT, without the cloud relay: five tools that read, build, frame, animate and
 * render a previz scene, each one a short `blender --background --python` run.
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
 * moves, who stands where — as numbers. It carries no acting: a video model handed a
 * previz clip copies its whole motion, stiff limbs included, so the previz decides camera
 * and blocking, the image sheets decide appearance, and the prompt decides the acting
 * (skills/storyboard/references/blender-previz.md).
 *
 * Coordinates are Blender's: metres, Z up, +Y away from the front view, angles in
 * degrees. Characters built here face -Y, so a camera at negative Y looking back at the
 * origin sees their front.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { blenderBin } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';

// ── Constants ───────────────────────────────────────────────────

export const BLENDER_PROXY_KINDS = ['person', 'dog', 'car', 'box', 'cylinder', 'sphere'] as const;
export type BlenderProxyKind = (typeof BLENDER_PROXY_KINDS)[number];

export const BLENDER_INTERPOLATIONS = ['LINEAR', 'BEZIER', 'CONSTANT'] as const;
export type BlenderInterpolation = (typeof BLENDER_INTERPOLATIONS)[number];

export const BLENDER_PREVIZ_ENGINES = ['workbench', 'eevee'] as const;
export type BlenderPrevizEngine = (typeof BLENDER_PREVIZ_ENGINES)[number];

export const DEFAULT_PREVIZ_ENGINE: BlenderPrevizEngine = 'workbench';
export const DEFAULT_PREVIZ_WIDTH = 1080;
export const DEFAULT_PREVIZ_HEIGHT = 1920;
export const DEFAULT_PREVIZ_FILENAME = 'previz.mp4';
export const DEFAULT_SCENE_FPS = 30;
export const DEFAULT_FRAME_START = 1;
export const DEFAULT_FRAME_END = 150;
/** 100 s at 30 fps — a previz is a cut, not an episode */
export const MAX_PREVIZ_FRAMES = 3000;
/** Blender object names are capped at 63 bytes */
export const MAX_BLENDER_NAME = 63;

// ── Request schemas ─────────────────────────────────────────────

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const frameNumber = z.number().int().min(0).max(1_000_000);
const blenderName = z
  .string()
  .min(1)
  .max(MAX_BLENDER_NAME)
  .refine((n) => !n.includes('/') && !n.includes('\\'), { message: 'a Blender object name cannot contain path separators' });
const hexColor = z.string().regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex triplet such as #4a90d9');

const blendPath = z
  .string()
  .min(1, 'blendPath is required')
  .refine((p) => !p.includes('..'), { message: 'blendPath must not contain ".."' })
  .refine((p) => extname(p).toLowerCase() === '.blend', { message: 'blendPath must end in .blend' })
  .transform((p) => resolve(p));

export const blenderSceneReadSchema = z.object({ blendPath });
export type BlenderSceneReadRequest = z.infer<typeof blenderSceneReadSchema>;

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
export type BlenderProxySpec = z.infer<typeof proxySchema>;

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
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
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
export type BlenderSceneBuildRequest = z.infer<typeof blenderSceneBuildSchema>;

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
    const frames = new Set<number>();
    for (const [i, k] of data.keys.entries()) {
      const hasTarget = k.target !== undefined;
      const hasRotation = k.rotationDeg !== undefined;
      if (hasTarget === hasRotation) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i], message: 'each key needs exactly one of target (a point the camera looks at) or rotationDeg' });
      }
      if (hasTarget && k.target!.every((v, j) => v === k.location[j])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'target'], message: 'target must differ from location' });
      }
      if (data.keys.length > 1 && k.frame === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: 'with more than one key, every key needs a frame' });
      }
      if (k.frame !== undefined) {
        if (frames.has(k.frame)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: `frame ${k.frame} is keyed twice` });
        frames.add(k.frame);
      }
    }
  });
export type BlenderCameraSetRequest = z.infer<typeof blenderCameraSetSchema>;

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
    const frames = new Set<number>();
    for (const [i, k] of data.keys.entries()) {
      if (k.location === undefined && k.rotationDeg === undefined && k.scale === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i], message: 'a key needs at least one of location, rotationDeg, scale' });
      }
      if (frames.has(k.frame)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keys', i, 'frame'], message: `frame ${k.frame} is keyed twice` });
      frames.add(k.frame);
    }
  });
export type BlenderObjectAnimateRequest = z.infer<typeof blenderObjectAnimateSchema>;

export const blenderRenderPrevizSchema = z
  .object({
    blendPath,
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional().default(DEFAULT_PREVIZ_FILENAME),
    engine: z.enum(BLENDER_PREVIZ_ENGINES).optional().default(DEFAULT_PREVIZ_ENGINE),
    width: z.number().int().min(64).max(4096).optional(),
    height: z.number().int().min(64).max(4096).optional(),
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
      } else if (data.frameEnd - data.frameStart + 1 > MAX_PREVIZ_FRAMES) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frameEnd'], message: `a previz is at most ${MAX_PREVIZ_FRAMES} frames` });
      }
    }
    if (extname(data.filename).toLowerCase() !== '.mp4') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['filename'], message: 'the previz clip is written as .mp4 (H.264)' });
    }
  });
export type BlenderRenderPrevizRequest = z.infer<typeof blenderRenderPrevizSchema>;

// ── Result shapes ───────────────────────────────────────────────

export interface BlenderObjectInfo {
  name: string;
  type: string;
  location: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
  dimensions: [number, number, number];
  parent: string | null;
  keyframes: number[];
}

export interface BlenderCameraInfo {
  name: string;
  location: [number, number, number];
  rotationDeg: [number, number, number];
  lensMm: number;
  fovDeg: number;
  sensorFit: string;
  clip: [number, number];
  keyframes: number[];
}

export interface BlenderSceneSummary {
  blender: string;
  blendPath: string;
  frame: { start: number; end: number; fps: number };
  resolution: [number, number];
  camera: BlenderCameraInfo | null;
  cameras: string[];
  objects: BlenderObjectInfo[];
  /** blender_scene_build only — what this call added */
  built?: Array<{ name: string; kind?: string; objects?: number }>;
  /** blender_camera_set / blender_object_animate only — what this call keyed */
  applied?: { camera?: string; object?: string; keyframes: number[] };
}

const fmt = (v: readonly number[]): string => `(${v.map((x) => (Number.isInteger(x) ? String(x) : x.toFixed(2))).join(', ')})`;

/** The text block every bridge tool returns — one line per object, so the model can name things exactly. */
export function describeScene(scene: BlenderSceneSummary): string {
  const lines: string[] = [];
  lines.push(`Blender ${scene.blender} · ${scene.blendPath}`);
  lines.push(`Frames ${scene.frame.start}–${scene.frame.end} @ ${scene.frame.fps} fps · ${scene.resolution[0]}×${scene.resolution[1]}`);
  if (scene.camera) {
    const c = scene.camera;
    lines.push(
      `Camera: ${c.name} at ${fmt(c.location)} rot ${fmt(c.rotationDeg)} · ${c.lensMm} mm · fov ${c.fovDeg}° · keys [${c.keyframes.join(', ')}]`,
    );
  } else {
    lines.push('Camera: none — run blender_camera_set before rendering');
  }
  if (scene.cameras.length > 1) lines.push(`Cameras in file: ${scene.cameras.join(', ')}`);
  const shown = scene.objects.slice(0, 200);
  lines.push(`Objects (${scene.objects.length}):`);
  for (const o of shown) {
    const keys = o.keyframes.length ? ` keys [${o.keyframes.join(', ')}]` : '';
    const parent = o.parent ? ` ← ${o.parent}` : '';
    lines.push(`  ${o.name} (${o.type}${parent}) at ${fmt(o.location)} rot ${fmt(o.rotationDeg)} dims ${fmt(o.dimensions)}${keys}`);
  }
  if (scene.objects.length > shown.length) lines.push(`  … ${scene.objects.length - shown.length} more`);
  return lines.join('\n');
}

export interface BlenderPrevizResult {
  videoPath: string;
  stillPaths: string[];
  /** requested still frames that fell outside the rendered range and were not written */
  skippedStills: number[];
  engine: BlenderPrevizEngine;
  width: number;
  height: number;
  fps: number;
  frameStart: number;
  frameEnd: number;
  frames: number;
  seconds: number;
  elapsedSeconds: number;
}

export type BridgeResult<T> = ({ success: true } & T) | { success: false; error: string };

// ── Runner ──────────────────────────────────────────────────────

function installHint(detail: string): string {
  return (
    `${detail}\n\n` +
    `The Blender bridge needs Blender 4.2 or newer on this machine:\n` +
    `  brew install --cask blender        (macOS)\n` +
    `or point BLENDER at the executable (BLENDER=/Applications/Blender.app/Contents/MacOS/Blender).\n` +
    `capability_status lists it under 3d_generation once it resolves.`
  );
}

/** Base allowance plus a per-frame budget — Workbench renders a 1080×1920 frame in well under a second, Eevee in a few. */
export function previzTimeoutMs(frames: number, engine: BlenderPrevizEngine): number {
  const perFrame = engine === 'eevee' ? 4_000 : 1_000;
  return Math.min(60 * 60_000, 120_000 + Math.max(frames, 1) * perFrame);
}

const EDIT_TIMEOUT_MS = 180_000;

interface RawBridgeResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  trace?: string;
}

/**
 * One Blender at a time per .blend file. The client runs independent tool calls in
 * parallel, and two Blenders opening, editing and saving the same file at once lose one
 * edit silently (the later save wins with the earlier one's state). Different files still
 * run side by side.
 */
const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const mine = new Promise<void>((r) => {
    release = r;
  });
  const chained = previous.then(() => mine);
  fileLocks.set(key, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (fileLocks.get(key) === chained) fileLocks.delete(key);
  }
}

function runBridge<T>(job: Record<string, unknown> & { blendPath: string }, timeoutMs: number): Promise<BridgeResult<{ result: T }>> {
  return withFileLock(job.blendPath, () => runBridgeUnlocked<T>(job, timeoutMs));
}

async function runBridgeUnlocked<T>(job: Record<string, unknown>, timeoutMs: number): Promise<BridgeResult<{ result: T }>> {
  const blender = blenderBin();
  if (!blender) return { success: false, error: installHint('Blender was not found on this machine.') };

  // Script, job and result all live in a private per-call directory (mkdtemp is 0700), so a
  // shared /tmp cannot hand Blender someone else's script under a predictable name.
  const dir = mkdtempSync(join(tmpdir(), 'blender-bridge-'));
  const script = join(dir, 'bridge.py');
  const jobPath = join(dir, 'job.json');
  const resultPath = join(dir, 'result.json');
  writeFileSync(script, BRIDGE_PY, 'utf-8');
  writeFileSync(jobPath, JSON.stringify({ ...job, resultPath }), 'utf-8');

  try {
    const run = await new Promise<{ code: number | null; timedOut: boolean; tail: string }>((resolveRun) => {
      execFile(
        blender,
        ['--background', '--factory-startup', '--python', script, '--', jobPath],
        { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
        (error, stdout, stderr) => {
          const lines = `${stdout}\n${stderr}`.split('\n').filter((l) => l.trim().length > 0);
          const err = error as (NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: number | string }) | null;
          resolveRun({
            code: err ? (typeof err.code === 'number' ? err.code : null) : 0,
            timedOut: Boolean(err && (err.killed || err.signal === 'SIGTERM')),
            tail: lines.slice(-30).join('\n'),
          });
        },
      );
    });

    if (existsSync(resultPath)) {
      const raw = JSON.parse(readFileSync(resultPath, 'utf-8')) as RawBridgeResult;
      if (raw.ok) return { success: true, result: raw.result as T };
      return { success: false, error: `${raw.error ?? 'Blender reported an error'}${raw.trace ? `\n${raw.trace}` : ''}` };
    }
    if (run.timedOut) {
      return { success: false, error: `Blender did not finish within ${Math.round(timeoutMs / 1000)}s — shorten the frame range, lower the resolution, or raise timeoutSeconds.` };
    }
    return { success: false, error: `Blender exited with code ${run.code ?? 'unknown'} before writing a result:\n${run.tail}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Public operations ───────────────────────────────────────────

export async function readScene(request: BlenderSceneReadRequest): Promise<BridgeResult<{ scene: BlenderSceneSummary }>> {
  if (!existsSync(request.blendPath)) {
    return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
  }
  const r = await runBridge<BlenderSceneSummary>({ op: 'read', blendPath: request.blendPath }, EDIT_TIMEOUT_MS);
  return r.success ? { success: true, scene: r.result } : r;
}

export async function buildScene(request: BlenderSceneBuildRequest): Promise<BridgeResult<{ scene: BlenderSceneSummary }>> {
  for (const imp of request.imports) {
    if (!existsSync(imp.glbPath)) return { success: false, error: `GLB not found: ${imp.glbPath}` };
  }
  if (!request.reset && !existsSync(request.blendPath)) {
    return { success: false, error: `reset is false but ${request.blendPath} does not exist yet — set reset to true to create it.` };
  }
  const r = await runBridge<BlenderSceneSummary>({ op: 'build', ...request }, EDIT_TIMEOUT_MS);
  return r.success ? { success: true, scene: r.result } : r;
}

export async function setCamera(request: BlenderCameraSetRequest): Promise<BridgeResult<{ scene: BlenderSceneSummary }>> {
  if (!existsSync(request.blendPath)) {
    return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
  }
  const r = await runBridge<BlenderSceneSummary>({ op: 'camera', ...request }, EDIT_TIMEOUT_MS);
  return r.success ? { success: true, scene: r.result } : r;
}

export async function animateObject(request: BlenderObjectAnimateRequest): Promise<BridgeResult<{ scene: BlenderSceneSummary }>> {
  if (!existsSync(request.blendPath)) {
    return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
  }
  const r = await runBridge<BlenderSceneSummary>({ op: 'animate', ...request }, EDIT_TIMEOUT_MS);
  return r.success ? { success: true, scene: r.result } : r;
}

export async function renderPreviz(request: BlenderRenderPrevizRequest): Promise<BridgeResult<BlenderPrevizResult>> {
  if (!existsSync(request.blendPath)) {
    return { success: false, error: `blend file not found: ${request.blendPath} — blender_scene_build creates one.` };
  }
  const outputDir = request.outputPath ? resolve(request.outputPath) : join(dirname(request.blendPath), 'previz');
  const videoPath = resolveOutputFile(outputDir, request.filename, 'video');
  // The scene's own range is unknown here, so budget for the cap the script enforces rather
  // than for a guess that would cut a legitimate long render short.
  const framesForTimeout =
    request.frameStart !== undefined && request.frameEnd !== undefined ? request.frameEnd - request.frameStart + 1 : MAX_PREVIZ_FRAMES;
  const timeoutMs = request.timeoutSeconds ? request.timeoutSeconds * 1000 : previzTimeoutMs(framesForTimeout, request.engine);
  const { timeoutSeconds: _t, outputPath: _o, filename: _f, ...rest } = request;
  const r = await runBridge<Omit<BlenderPrevizResult, 'engine' | 'width' | 'height'> & { width: number; height: number }>(
    { op: 'render', ...rest, videoPath, maxFrames: MAX_PREVIZ_FRAMES },
    timeoutMs,
  );
  if (!r.success) return r;
  return { success: true, ...r.result, engine: request.engine };
}

// ── The Blender-side script ─────────────────────────────────────
// Runs inside Blender's own Python. Reads one job JSON (path after "--"), performs one
// operation, writes {"ok": true, "result": …} or {"ok": false, "error": …} to job.resultPath.
// Keep it dependency-free — Blender's Python has no pip here.

export const BRIDGE_PY = String.raw`
# social-flow Blender bridge (inner side) — one job per process, see blender-bridge.ts.
import json, math, os, sys, time, traceback
import bpy
from mathutils import Euler, Vector

PROXY_GRAY = (0.55, 0.55, 0.58, 1.0)
FLOOR_GRAY = (0.32, 0.32, 0.33, 1.0)
WORLD_GRAY = (0.82, 0.82, 0.84)
MARKER = "social_flow_previz"          # scene custom property: this .blend was made by blender_scene_build
MIN_VERSION = (4, 2)
# 4.2–4.5 call the engine BLENDER_EEVEE_NEXT; 5.0 renamed it back
EEVEE = "BLENDER_EEVEE" if bpy.app.version >= (5, 0) else "BLENDER_EEVEE_NEXT"
DEFAULTS = {"fps": 30, "frameStart": 1, "frameEnd": 150, "width": 1080, "height": 1920}


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
    out = []
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
        if out:
            return out
    except AttributeError:
        pass
    try:
        return list(act.fcurves)
    except AttributeError:
        return out


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
        objs.append({
            "name": o.name,
            "type": o.type,
            "location": r3(o.matrix_world.translation),
            "rotationDeg": deg3(o.matrix_world.to_euler("XYZ")),
            "scale": r3(o.scale),
            "dimensions": r3(o.dimensions),
            "parent": o.parent.name if o.parent else None,
            "keyframes": key_frames(o),
        })
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
def person_parts(p, h, mat, root):
    for side, x in (("L", -0.10), ("R", 0.10)):
        cyl(p + ".leg." + side, 0.045 * h, 0.50 * h, (x * h, 0, 0.25 * h), mat, root)
    cyl(p + ".torso", 0.10 * h, 0.34 * h, (0, 0, 0.67 * h), mat, root)
    for side, x in (("L", -0.15), ("R", 0.15)):
        cyl(p + ".arm." + side, 0.03 * h, 0.34 * h, (x * h, 0, 0.66 * h), mat, root)
    ball(p + ".head", 0.07 * h, (0, 0, 0.93 * h), mat, root)
    box(p + ".nose", (0.03 * h, 0.03 * h, 0.03 * h), (0, -0.07 * h, 0.93 * h), mat, root)


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
        person_parts(name, float(spec.get("height") or 1.75), mat, root)
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
    if job["clearExisting"]:
        cam.animation_data_clear()
        d.animation_data_clear()
    cam.rotation_mode = "QUATERNION"
    keys = job["keys"]
    static = len(keys) == 1 and keys[0].get("frame") is None
    # a zoom needs the lens keyed at every pose, or the one lens key holds for the whole move
    zoom = any(k.get("lensMm") is not None for k in keys)
    prev_q = None
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
    # a render that was killed mid-way leaves its private-prefix file behind; sweep before starting
    for stale in os.listdir(out_dir):
        if stale.startswith(".previz-"):
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
    prefix = os.path.join(out_dir, ".previz-%d-" % os.getpid())
    sc.render.filepath = prefix
    t0 = time.time()
    bpy.ops.render.render(animation=True)
    written = sorted(f for f in os.listdir(out_dir) if f.startswith(os.path.basename(prefix)))
    if not written:
        raise RuntimeError("Blender rendered but wrote no video under %s" % out_dir)
    if os.path.exists(video_path):
        os.remove(video_path)
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
