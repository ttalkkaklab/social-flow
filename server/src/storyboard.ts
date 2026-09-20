/**
 * Storyboard module — the sequence → scene → shot data behind four tools
 * (storyboard_read · storyboard_apply · storyboard_check · scenario_check).
 *
 * ## One module, two doors
 *
 * The LLM edits a board through MCP today; a web client will edit the same board through
 * an HTTP API later. Both go through this file — zod schemas for the three units, a patch
 * that upserts any mix of them in one call, the structural rules, and the file adapter —
 * so the API is a second handler over the same functions, not a second implementation.
 *
 * ## Storage stays `scenes.js`
 *
 * produce reads `window.SCENES` flat and by index (`images/scene-N.png`, `frame.html?i=n`),
 * so the file keeps that shape. The hierarchy lives beside it in `window.STRUCTURE` and the
 * per-shot labels (`scene`, `sceneSlug`, `sequence`) are derived from it on every write.
 * The file is evaluated in a VM sandbox the way check-scenes.js and cost-preview.js read it;
 * writing serialises every `window.*` global back as JSON, keeping the leading `//` header
 * lines except `// approved:` — an edited board is no longer the approved one.
 *
 * The rules themselves live in skills/storyboard/references/structure-contract.js, shared
 * with check-scenes.js (node) and the approval page (browser); this module loads that file
 * at runtime from the plugin tree, the same way the bundle finds the skills it ships with.
 */

import { execFileSync } from 'node:child_process';
import { evaluateWindowScript } from './scenes-vm.js';
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ── Plugin tree ─────────────────────────────────────────────────

/** dist/bundle.js and dist/storyboard.js sit at the same depth — two up is the plugin root. */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REFERENCES_DIR = join(PLUGIN_ROOT, 'skills', 'storyboard', 'references');
export const CONTRACT_FILE = join(REFERENCES_DIR, 'structure-contract.js');
export const CHECK_SCENES_FILE = join(REFERENCES_DIR, 'check-scenes.js');
export const CHECK_SCENARIO_FILE = join(REFERENCES_DIR, 'check-scenario.js');

export interface Finding {
  level: 'bad' | 'warn' | 'later';
  where: string;
  what: string;
}

interface Contract {
  VERSION: string;
  COMPOSITION_SCHEMA: Record<string, unknown>;
  validateComposition(value: unknown): string[];
  EYELINE_SCHEMA: Record<string, unknown>;
  validateEyeline(value: unknown): string[];
  DEPTH_SCHEMA: Record<string, unknown>;
  validateDepth(value: unknown): string[];
  VOCAB: {
    SIZES: string[]; ANGLES: string[]; TYPES: string[]; BEATS: string[]; INFO_TYPES: string[];
    SHARE_TYPES: string[]; HOOK_TYPES: string[]; HOOK_FORMS: string[]; ARCS: string[];
    RENDER_MODES: string[]; CHARGES_OPEN: string[]; CHARGES_CLOSE: string[]; TRANSITION_RE: RegExp;
  };
  check(win: Board, opts?: { draft?: boolean }): Finding[];
  sync(win: Board): number;
  outline(win: Board, level: string): Record<string, unknown>;
  slugOf(scene: { place: string; time: string }): string;
}

// Namespace import: the esbuild banner already declares a top-level `createRequire`, and a named
// import of the same identifier makes the bundle a SyntaxError.
const loadFromHere = nodeModule.createRequire(import.meta.url);
let contractCache: Contract | undefined;
export function contract(): Contract {
  if (!contractCache) contractCache = loadFromHere(CONTRACT_FILE) as Contract;
  return contractCache;
}

/** Camera discovery and input validation use the same contract as the planner. */
interface CameraContract {
  CAMERA_INPUT_SCHEMA: Record<string, unknown>;
  ALL_LOOKS: string[];
  cameraInputErrors(value: unknown): string[];
}
export function cameraContract(): CameraContract {
  return loadFromHere(join(REFERENCES_DIR, 'production-mode.js')) as CameraContract;
}
export function renderPurposes(): string[] {
  const routing = loadFromHere(join(REFERENCES_DIR, 'render-routing.js')) as { PURPOSES: Record<string, string> };
  return Object.keys(routing.PURPOSES);
}
export function stillCameraEffectList(): string[] {
  const routing = loadFromHere(join(REFERENCES_DIR, 'render-routing.js')) as { STILL_CAMERA_EFFECTS: string[] };
  return routing.STILL_CAMERA_EFFECTS;
}

// ── Schemas ─────────────────────────────────────────────────────

const tuple = (list: string[]) => z.enum(list as [string, ...string[]]);
// The schemas are built at module load, so a missing contract file must not take the whole
// server down with it — the three storyboard tools fail at call time (contract() throws) while
// the other tools keep working. The placeholder vocabulary accepts nothing real.
const MISSING = ['__contract-missing__'];
function vocabAtLoad(): Contract['VOCAB'] {
  try { return contract().VOCAB; }
  catch {
    return { SIZES: MISSING, ANGLES: MISSING, BEATS: MISSING, TYPES: MISSING, INFO_TYPES: MISSING, SHARE_TYPES: MISSING,
      HOOK_TYPES: MISSING, HOOK_FORMS: MISSING, ARCS: MISSING, RENDER_MODES: MISSING, CHARGES_OPEN: MISSING, CHARGES_CLOSE: MISSING,
      TRANSITION_RE: /^$/ } as Contract['VOCAB'];
  }
}
const V = vocabAtLoad();
const nonEmpty = z.string().trim().min(1);

export const STRUCTURE_VERSION = (() => { try { return contract().VERSION; } catch { return 'structure-v1'; } })();

export const sceneSchema = z
  .object({
    no: z.number().int().positive().describe('Scene number — the value shots point at with `scene`'),
    place: nonEmpty.describe('One place — the slugline location'),
    time: nonEmpty.describe('One continuous stretch of time — 낮 · 밤 · 새벽 · 10년 뒤'),
    event: nonEmpty.describe('The one thing that happens in this scene'),
    charge: z.object({
      open: tuple(V.CHARGES_OPEN).describe('Value at the open: "+" or "-"'),
      close: tuple(V.CHARGES_CLOSE).describe('Value at the close: "+", "-", or deeper into the same pole "++" / "--"'),
    }),
    turn: nonEmpty.describe('What flipped between the open and the close'),
    out: nonEmpty.optional().describe('The sentence the scene goes out on — the one that forces a 그런데 or 그래서 into the next scene'),
  })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;

export const sequenceSchema = z
  .object({
    id: nonEmpty.describe('Stable id, e.g. "q1"'),
    title: nonEmpty.describe('The heading the approval page draws'),
    purpose: nonEmpty.describe('The one purpose that binds these scenes — two purposes are two sequences'),
    question: nonEmpty.optional().describe('The dramatic question this stretch opens'),
    payoff: z.number().int().positive().optional().describe('The scene number that answers the question'),
    scenes: z.array(z.number().int().positive()).min(1).describe('Scene numbers in playback order'),
  })
  .strict();
export type Sequence = z.infer<typeof sequenceSchema>;

export const structureSchema = z
  .object({
    version: z.literal(STRUCTURE_VERSION),
    nextShotId: z.number().int().positive().optional(),
    sequences: z.array(sequenceSchema).min(1),
    scenes: z.array(sceneSchema).min(1),
  })
  .strict();
export type Structure = z.infer<typeof structureSchema>;

const coverageSchema = z.object({
  azimuth: z.number().finite().min(0).max(180).optional().describe('Horizontal camera bearing, 0–180° inside the selected side of the axis'),
  action: z.string().trim().min(1).optional().describe('Visible action that carries this cut when no 30° or two-step change is used'),
}).strict().refine((value) => value.azimuth !== undefined || value.action !== undefined, 'coverage names an azimuth or the action that carries the cut');

const lineCrossingSchema = z.object({
  method: z.enum(['camera_move', 'subject_move', 'neutral', 'intentional']),
  from: nonEmpty.describe('The previous space.line value'),
  to: nonEmpty.describe('The new space.line value'),
  reason: nonEmpty.describe('What the viewer sees that makes the new side legible'),
  bridgeShot: z.number().int().positive().optional().describe('Earlier neutral shot number; required only for method "neutral"'),
}).strict();

/** The grammar half of a shot is exact; the visual plan and the machine layer pass through (scenes-schema.md owns them). */
export const compositionSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  for (const message of contract().validateComposition(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const eyelineSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  for (const message of contract().validateEyeline(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const depthSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  for (const message of contract().validateDepth(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const cameraSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  for (const message of cameraContract().cameraInputErrors(value))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});
const visualSchema = z.object({ camera: cameraSchema.optional() }).passthrough();

/** The stable shot id storyboard_apply assigns (R6): `s` + four or more digits. */
export const shotIdSchema = z.string().regex(/^s\d{4,}$/);

export const shotSchema = z
  .object({
    id: shotIdSchema.optional(),
    type: tuple(V.TYPES),
    title: z.string().optional(),
    narration: z.array(z.object({ tts: z.string(), sub: z.string().optional() }).passthrough()).optional(),
    visual: visualSchema.optional(),
    duration: z.number().positive().optional(),
    scene: z.number().int().positive().optional(),
    sceneSlug: z.string().optional(),
    sequence: z.string().optional(),
    transition: z.string().regex(V.TRANSITION_RE, 'not a join from scenes-schema §scene transition').optional(),
    beat: tuple(V.BEATS).optional(),
    arc: tuple(V.ARCS).optional(),
    hookType: tuple(V.HOOK_TYPES).optional(),
    hookForm: tuple(V.HOOK_FORMS).optional(),
    chapter: z.string().optional(),
    after: z.number().int().positive().optional(),
    shot: z
      .object({
        feel: z.string().optional(),
        size: tuple(V.SIZES).optional(),
        angle: tuple(V.ANGLES).optional(),
        why: z.string().optional(),
        info: z.string().optional(),
        infoType: tuple(V.INFO_TYPES).optional(),
        share: z.string().optional(),
        shareType: tuple(V.SHARE_TYPES).optional(),
        space: z.record(z.unknown()).optional(),
        eyeline: eyelineSchema.optional(),
        composition: compositionSchema.optional(),
        depth: depthSchema.optional(),
        coverage: coverageSchema.optional(),
        lineNeutral: z.literal(true).optional(),
        lineCrossing: lineCrossingSchema.optional(),
        render: z.object({ mode: tuple(V.RENDER_MODES), purpose: z.string().optional(), reason: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    sound: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type Shot = z.infer<typeof shotSchema>;

export const readLevelSchema = z.enum(['outline', 'scenes', 'shots', 'full']);

export const storyboardReadSchema = z.object({
  path: z.string().min(1).describe('The storyboard directory, or its scenes.js'),
  level: readLevelSchema.default('shots').describe('outline = sequences with scene numbers · scenes = scene cards with shot numbers · shots = every shot summarised under its scene · full = the raw shot objects too'),
});

export const storyboardCheckSchema = z.object({
  path: z.string().min(1).describe('The storyboard directory, or its scenes.js'),
  draft: z.boolean().default(false).describe('The story pass (storyboard §4a) — machine-layer absences are deferred, not violations'),
});

export const scenarioCheckSchema = z.object({
  path: z.string().min(1).describe('The candidates directory, or its selected scenario.md'),
});

const globalsSchema = z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'a window.* global is UPPER_CASE'), z.unknown());

export const transitionPatchSchema = z.object({
  no: z.number().int().positive().describe('Incoming shot number, 1-based, after removals and inserts'),
  transition: z.enum(['cut', 'dip', 'dip:white', 'jcut', 'dissolve', 'iris', 'blur', 'zoom',
    'push:l2r', 'push:r2l', 'push:u2d', 'push:d2u', 'whip:l2r', 'whip:r2l', 'whip:u2d', 'whip:d2u']),
  transitionSeconds: z.number().finite().min(.08).max(.8).optional(),
  reason: nonEmpty,
  continuity: nonEmpty.optional(),
}).strict().refine(v => !['cut', 'dip', 'dip:white'].includes(v.transition) || v.transitionSeconds === undefined,
  'cut and dip do not accept transitionSeconds; dip fades each side for up to 0.30 seconds');

export const storyboardApplySchema = z.object({
  path: z.string().min(1).describe('The storyboard directory (scenes.js is created there when missing), or its scenes.js'),
  draft: z.boolean().default(false).describe('The story pass (storyboard §4a) — camera-continuity records (lineCrossing, coverage) are deferred, not violations'),
  set: z.object({ structure: structureSchema, shots: z.array(shotSchema).min(1) }).optional()
    .describe('Replace the whole board — the structure and every shot. The way a new board is written'),
  structure: structureSchema.optional().describe('Replace window.STRUCTURE only'),
  sequences: z.array(sequenceSchema).optional().describe('Upsert sequences by id'),
  scenes: z.array(sceneSchema).optional().describe('Upsert scenes by no'),
  shots: z.array(z.object({ no: z.number().int().positive(), shot: shotSchema })).optional()
    .describe('Upsert shots by 1-based position; no = length + 1 appends'),
  shotsById: z.array(z.object({ id: shotIdSchema, shot: shotSchema })).optional()
    .describe('Replace shots by their stable id (R6); the shot keeps that id. An unknown id is an error, nothing is written'),
  insertShots: z.array(z.object({
    after: z.number().int().min(0).optional(),
    afterId: shotIdSchema.optional(),
    shots: z.array(shotSchema).min(1),
  }).refine((e) => (e.after === undefined) !== (e.afterId === undefined), { message: 'give exactly one of after (position) or afterId (shot id)' })).optional()
    .describe('Insert shots after a 1-based position (0 = at the start) or after the shot with afterId. Later positions shift'),
  transitions: z.array(transitionPatchSchema).min(1).optional().describe('Change only incoming transitions; dip fades through black. Keeps narration and visuals intact'),
  removeShots: z.array(z.number().int().positive()).optional().describe('1-based positions to drop, resolved before the insert'),
  removeShotIds: z.array(shotIdSchema).min(1).optional().describe('Shot ids to drop, resolved before the insert'),
  removeScenes: z.array(z.number().int().positive()).optional(),
  removeSequences: z.array(z.string()).optional(),
  globals: globalsSchema.optional().describe('Set other window.* blocks — FORMAT, THEME, COMPREHENSION, STORY, PRODUCTION, MUSIC, VOICE, MOTION_POLICY'),
  dryRun: z.boolean().default(false).describe('Validate and report, write nothing'),
});
export type StoryboardApplyArgs = z.infer<typeof storyboardApplySchema>;

// ── File adapter ────────────────────────────────────────────────

export type Board = Record<string, unknown> & { SCENES?: Shot[]; STRUCTURE?: Structure; FORMAT?: string };

/** Accepts a storyboard directory or the scenes.js inside it. */
export function scenesPath(target: string): string {
  const abs = resolve(target);
  if (basename(abs) === 'scenes.js') return abs;
  return join(abs, 'scenes.js');
}

export interface BoardFile {
  file: string;
  header: string[];
  win: Board;
}

/** Evaluate scenes.js in a sandbox and return its window.* globals plus the leading `//` lines. */
export function readBoard(target: string): BoardFile {
  const file = scenesPath(target);
  if (!existsSync(file)) throw new Error(`no scenes.js at ${file}`);
  if (!statSync(file).isFile()) throw new Error(`${file} is not a file`);
  const src = readFileSync(file, 'utf8');
  const header: string[] = [];
  for (const line of src.split('\n')) {
    if (/^\s*\/\//.test(line)) header.push(line.trim());
    else if (line.trim()) break;
  }
  // The room holds nothing from the host — a pulled board is someone else's code (scenes-vm.ts).
  let win: Board;
  try {
    win = evaluateWindowScript(src, { filename: file }) as Board;
  } catch (e) {
    throw new Error(`failed to evaluate ${file}: ${(e as Error).message}`);
  }
  if (!Array.isArray(win.SCENES)) throw new Error(`${file} has no window.SCENES array`);
  return { file, header, win };
}

/** The order the schema document lists the blocks in; anything else follows alphabetically. */
const GLOBAL_ORDER = ['FORMAT', 'VOICE', 'THEME', 'COMPREHENSION', 'STORY', 'PRODUCTION', 'MOTION_POLICY', 'MUSIC', 'STRUCTURE', 'SCENES'];

export function serializeBoard(win: Board, header: string[] = []): string {
  const keys = Object.keys(win).filter((k) => win[k] !== undefined);
  keys.sort((a, b) => {
    const ia = GLOBAL_ORDER.indexOf(a), ib = GLOBAL_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  const lines = header.filter((h) => !/^\/\/\s*approved:/.test(h));
  if (lines.length) lines.push('');
  for (const k of keys) {
    const value = k === 'SCENES' && Array.isArray(win[k])
      ? (win[k] as Shot[]).map((shot) => shot.id === undefined ? shot : ({ id: shot.id, ...shot }))
      : win[k];
    lines.push(`window.${k} = ${JSON.stringify(value, null, 2)};`);
  }
  return lines.join('\n') + '\n';
}

// ── Patch ───────────────────────────────────────────────────────

export interface ApplyResult {
  file: string;
  written: boolean;
  created: boolean;
  approvalDropped: boolean;
  shots: number;
  scenes: number;
  sequences: number;
  synced: number;
  findings: Finding[];
}

function upsertBy<T extends Record<string, unknown>>(list: T[], items: T[], key: keyof T): T[] {
  const out = list.slice();
  for (const item of items) {
    const i = out.findIndex((x) => x[key] === item[key]);
    if (i === -1) out.push(item); else out[i] = item;
  }
  return out;
}

/** Validate every shot against the shot schema; findings, not exceptions, so a board reports all of them at once. */
export function validateShots(shots: unknown[]): Finding[] {
  const out: Finding[] = [];
  const ids = new Map<string, number>();
  shots.forEach((s, i) => {
    const parsed = shotSchema.safeParse(s);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) out.push({ level: 'bad', where: `shot ${i + 1}`, what: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
    }
    const id = s && typeof s === 'object' ? (s as Record<string, unknown>).id : undefined;
    if (typeof id !== 'string') return;
    const first = ids.get(id);
    if (first !== undefined) out.push({ level: 'bad', where: `shot ${i + 1}`, what: `id: duplicate ${id} (already used by shot ${first})` });
    else ids.set(id, i + 1);
  });
  return out;
}

export function validateStructure(structure: unknown): Finding[] {
  const parsed = structureSchema.safeParse(structure);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({ level: 'bad' as const, where: 'structure', what: `${issue.path.join('.') || '(root)'}: ${issue.message}` }));
}

/** Apply a patch in memory — the pure half of storyboard_apply, so a test or an API handler can run it without a file. */
export function applyPatch(win: Board, patch: StoryboardApplyArgs): { win: Board; findings: Finding[]; synced: number } {
  const next: Board = { ...win };
  if (patch.globals) for (const [k, v] of Object.entries(patch.globals)) {
    if (k === 'SCENES' || k === 'STRUCTURE') throw new Error(`set ${k} through the dedicated fields, not globals`);
    next[k] = v;
  }
  if (patch.set) { next.STRUCTURE = patch.set.structure; next.SCENES = patch.set.shots.slice(); }
  if (patch.structure) next.STRUCTURE = patch.structure;

  const st: Structure = next.STRUCTURE ?? { version: STRUCTURE_VERSION, sequences: [], scenes: [] };
  if (!Array.isArray(st.sequences) || !Array.isArray(st.scenes) || st.scenes.some((sc) => !sc || typeof sc !== 'object')
      || st.sequences.some((q) => !q || typeof q !== 'object' || !Array.isArray(q.scenes)))
    return { win: next, findings: [{ level: 'bad', where: 'structure', what: 'STRUCTURE.sequences and STRUCTURE.scenes are arrays of objects — this board was hand-edited into a shape the tools cannot patch; rewrite it with `set`' }], synced: 0 };
  let sequences = st.sequences.slice();
  let scenes = st.scenes.slice();
  if (patch.sequences) sequences = upsertBy(sequences, patch.sequences, 'id');
  if (patch.scenes) scenes = upsertBy(scenes, patch.scenes, 'no');
  if (patch.removeScenes) {
    const drop = new Set(patch.removeScenes);
    scenes = scenes.filter((sc) => !drop.has(sc.no));
    sequences = sequences.map((q) => ({ ...q, scenes: q.scenes.filter((no) => !drop.has(no)) }));
  }
  if (patch.removeSequences) {
    const drop = new Set(patch.removeSequences);
    sequences = sequences.filter((q) => !drop.has(q.id));
  }
  if (patch.sequences || patch.scenes || patch.removeScenes || patch.removeSequences || next.STRUCTURE)
    next.STRUCTURE = { version: st.version ?? STRUCTURE_VERSION, ...(st.nextShotId === undefined ? {} : { nextShotId: st.nextShotId }), sequences, scenes };  // an older version is kept so check() reports it, never silently upgraded

  let shots: Shot[] = Array.isArray(next.SCENES) ? next.SCENES.slice() : [];
  // Shots are addressed either by position (shots · insertShots.after · removeShots) or by id
  // (shotsById · insertShots.afterId · removeShotIds, R7) — never both in one patch: a position
  // read before an id-resolved remove is a different shot after it.
  const byPosition = Boolean(patch.shots || patch.removeShots || patch.insertShots?.some((e) => e.after !== undefined));
  const byId = Boolean(patch.shotsById || patch.removeShotIds || patch.insertShots?.some((e) => e.afterId !== undefined));
  if (byPosition && byId) throw new Error('address shots by position (shots · after · removeShots) or by id (shotsById · afterId · removeShotIds) in one patch, not both');
  const positionOfId = (id: string, list: Shot[], what: string): number => {
    const index = list.findIndex((shot) => shot.id === id);
    if (index < 0) throw new Error(`${what}: no shot with id ${id} on this board`);
    return index;
  };
  if (patch.shotsById) for (const { id, shot } of patch.shotsById) {
    const index = positionOfId(id, shots, 'shotsById');
    if (shot.id !== undefined && shot.id !== id) throw new Error(`shotsById ${id}: the shot carries a different id (${shot.id}) — an id is not renamed through an upsert`);
    shots[index] = { id, ...shot };
  }
  if (patch.shots) for (const { no, shot } of patch.shots.slice().sort((a, b) => a.no - b.no)) {
    if (no > shots.length + 1) throw new Error(`shot ${no}: the board has ${shots.length} shots — no = ${shots.length + 1} appends`);
    const current = shots[no - 1];
    shots[no - 1] = shot.id === undefined && current?.id !== undefined ? { id: current.id, ...shot } : shot;
  }
  const beforeReorder = shots.slice();
  if (patch.removeShots) {
    const drop = new Set(patch.removeShots);
    for (const no of drop) if (no > shots.length) throw new Error(`removeShots: there is no shot ${no}`);
    shots = shots.filter((_, i) => !drop.has(i + 1));
  }
  if (patch.removeShotIds) {
    const drop = new Set(patch.removeShotIds.map((id) => positionOfId(id, shots, 'removeShotIds')));
    shots = shots.filter((_, i) => !drop.has(i));
  }
  if (patch.insertShots) {
    // afterId resolves against the board after the removes, like a position does.
    const resolved = patch.insertShots.map((e) => ({
      after: e.after !== undefined ? e.after : positionOfId(e.afterId as string, shots, 'insertShots.afterId') + 1,
      shots: e.shots,
    }));
    // Highest position first, so earlier inserts don't shift later ones.
    const inserts = resolved.sort((a, b) => b.after - a.after);
    for (const { after, shots: add } of inserts) {
      if (after > shots.length) throw new Error(`insertShots: after ${after} is past the last shot (${shots.length})`);
      shots.splice(after, 0, ...add);
    }
  }
  // Existing references name pre-reorder shots. Inserted records use final positions.
  const finalOrder = shots.slice();
  for (const source of patch.removeShots || patch.insertShots ? finalOrder : []) {
    if (!beforeReorder.includes(source)) continue;
    const e = source.shot?.eyeline;
    if (e && typeof e.matchShot === 'number') {
      const target = beforeReorder[e.matchShot - 1];
      const index = finalOrder.indexOf(target);
      if (index < 0) throw new Error('eyeline.matchShot target was removed or missing; update the relation in the same patch');
      const position = finalOrder.indexOf(source);
      shots[position] = { ...source, shot: { ...source.shot, eyeline: { ...e, matchShot: index + 1 } } };
    }
  }
  const transitionTargets = new Set<number>();
  for (const change of patch.transitions ?? []) {
    const source = shots[change.no - 1];
    if (!source) throw new Error(`transitions: there is no shot ${change.no}`);
    if (transitionTargets.has(change.no)) throw new Error(`transitions: duplicate shot ${change.no}`);
    transitionTargets.add(change.no);
    if (['broll', 'outro'].includes(source.type)) throw new Error('Spliced shots use their own assembly transition');
    const moving = !['cut', 'dip', 'dip:white'].includes(change.transition);
    if (moving && !shots.slice(0, change.no - 1).some(s => !['broll', 'outro'].includes(s.type)))
      throw new Error('First shot cannot carry a previous picture');
    if (moving) {
      const previous = shots[change.no - 2];
      if (!previous || ['broll', 'outro'].includes(previous.type))
        throw new Error('A moving carry cannot bridge an inserted recording; choose cut or dip');
      if (previous.visual?.reuse !== undefined)
        throw new Error('Reused clips cannot supply outgoing live handles; choose cut or dip');
      if (previous.visual?.sync === true || source.visual?.sync === true)
        throw new Error('Sync footage requires cut or dip, not a moving carry');
    }
    const edit = { ...(source.edit as Record<string, unknown> ?? {}), reason: change.reason } as Record<string, unknown>;
    if (!moving || source.transition !== change.transition) delete edit.transitionSeconds;
    if (change.transitionSeconds !== undefined) edit.transitionSeconds = change.transitionSeconds;
    if (change.continuity !== undefined) edit.continuity = change.continuity;
    if (moving && Number(edit.pre ?? 0) !== 0) throw new Error('Moving transitions require edit.pre=0; update the shot timing first');
    shots[change.no - 1] = { ...source, transition: change.transition, edit };
  }
  const originalShots = Array.isArray(win.SCENES) ? win.SCENES : [];
  const numericId = (shot: Shot): number => typeof shot.id === 'string' && /^s\d{4,}$/.test(shot.id) ? Number(shot.id.slice(1)) : 0;
  const priorCounter = win.STRUCTURE && Number.isInteger(win.STRUCTURE.nextShotId) ? win.STRUCTURE.nextShotId : undefined;
  const requestedCounter = Number.isInteger(st.nextShotId) ? st.nextShotId : undefined;
  let nextShotId = Math.max(
    priorCounter ?? 0,
    requestedCounter ?? 0,
    ...shots.map(numericId).map((id) => id + 1),
    ...(priorCounter === undefined && requestedCounter === undefined
      ? [Math.max(originalShots.length, ...originalShots.map(numericId)) + 1]
      : []),
    1,
  );
  shots = shots.map((shot) => {
    if (shot.id !== undefined) return shot;
    const id = `s${String(nextShotId).padStart(4, '0')}`;
    nextShotId += 1;
    return { id, ...shot };
  });
  if (next.STRUCTURE) next.STRUCTURE = { ...next.STRUCTURE, nextShotId };
  next.SCENES = shots.map((shot) => ({ ...shot }));  // sync() writes sceneSlug/sequence — never into the caller's objects

  const findings: Finding[] = [];
  if (!shots.length) findings.push({ level: 'bad', where: 'board', what: 'the board has no shots' });
  if (next.STRUCTURE === undefined) findings.push({ level: 'bad', where: 'structure', what: 'no window.STRUCTURE — write the sequences and scenes (set, structure, sequences + scenes)' });
  else findings.push(...validateStructure(next.STRUCTURE));
  findings.push(...validateShots(shots));
  let synced = 0;
  if (!findings.some((f) => f.level === 'bad')) {
    synced = contract().sync(next);
    findings.push(...contract().check(next, { draft: patch.draft }));
  }
  return { win: next, findings, synced };
}

/** storyboard_apply — read, patch, validate, write unless a violation or a dry run. */
export function applyStoryboard(args: StoryboardApplyArgs): ApplyResult {
  const file = scenesPath(args.path);
  const exists = existsSync(file);
  let header: string[] = [];
  let win: Board = {};
  if (exists) ({ header, win } = readBoard(file));
  else if (!args.set) throw new Error(`no scenes.js at ${file} — a new board is written with \`set\` (structure + shots)`);
  else if (!existsSync(dirname(file))) throw new Error(`directory does not exist: ${dirname(file)}`);

  const { win: next, findings, synced } = applyPatch(win, args);
  const bad = findings.some((f) => f.level === 'bad');
  const st = next.STRUCTURE;
  const result: ApplyResult = {
    file, written: false, created: !exists, approvalDropped: header.some((h) => /^\/\/\s*approved:/.test(h)),
    shots: (next.SCENES ?? []).length, scenes: st ? st.scenes.length : 0, sequences: st ? st.sequences.length : 0,
    synced, findings,
  };
  if (bad || args.dryRun) return result;
  // Same-directory temp file + rename: a crash mid-write never leaves a truncated scenes.js behind.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, serializeBoard(next, header), 'utf8');
    renameSync(tmp, file);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw err;
  }
  result.written = true;
  return result;
}

// ── Check ───────────────────────────────────────────────────────

export interface CheckResult {
  file: string;
  format: string;
  shots: number;
  draft: boolean;
  structure: Finding[];
  contract: Finding[];
  violations: number;
  warnings: number;
  deferred: number;
}

export interface ScenarioCheckResult {
  files: string[];
  violations: number;
  warnings: number;
  findings: Array<{ level: 'bad' | 'warn'; where: string; what: string }>;
}

const scenarioCheckResultSchema = z.object({
  files: z.array(z.string()),
  violations: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  findings: z.array(z.object({
    level: z.enum(['bad', 'warn']),
    where: z.string(),
    what: z.string(),
  })),
});

/** scenario_check — run check-scenario.js and preserve its JSON contract. Exit 1 is a
 * valid result with P0 findings; exit 3 is an invalid target and becomes a tool error. */
export function checkScenario(
  args: z.infer<typeof scenarioCheckSchema>,
  checkFile = CHECK_SCENARIO_FILE,
): ScenarioCheckResult {
  let raw = '';
  try {
    raw = execFileSync(process.execPath, [checkFile, args.path, '--json'], {
      encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message: string };
    raw = err.stdout || '';
    if (err.status !== 1 || !raw.trim()) {
      throw new Error(`check-scenario.js failed: ${(err.stderr || err.message).trim()}`);
    }
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`check-scenario.js returned no JSON: ${raw.slice(0, 400)}`); }
  return scenarioCheckResultSchema.parse(parsed);
}

/** storyboard_check — the structure rules here plus the full scenes.js contract from check-scenes.js. */
export function checkStoryboard(args: z.infer<typeof storyboardCheckSchema>): CheckResult {
  const { file, win } = readBoard(args.path);
  const structure = contract().check(win, { draft: args.draft }).concat(validateShots(win.SCENES ?? []));
  const argv = [CHECK_SCENES_FILE, file, '--json'];
  if (args.draft) argv.push('--draft');
  let raw = '';
  try {
    raw = execFileSync(process.execPath, argv, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    raw = err.stdout || '';
    if (!raw.trim()) throw new Error(`check-scenes.js failed: ${(err.stderr || err.message).trim()}`);
  }
  let parsed: { format?: string; findings?: Finding[] } = {};
  try { parsed = JSON.parse(raw) as typeof parsed; } catch { throw new Error(`check-scenes.js returned no JSON: ${raw.slice(0, 400)}`); }
  // check-scenes.js already runs the structure rules; keep them in their own list and drop the duplicates.
  const dup = new Set(structure.map((f) => f.level + '\0' + f.where + '\0' + f.what));
  const rest = (parsed.findings ?? []).filter((f) => !dup.has(f.level + '\0' + f.where + '\0' + f.what));
  const all = structure.concat(rest);
  return {
    file, format: parsed.format ?? String(win.FORMAT ?? 'shorts-9x16'), shots: (win.SCENES ?? []).length, draft: args.draft,
    structure, contract: rest,
    violations: all.filter((f) => f.level === 'bad').length,
    warnings: all.filter((f) => f.level === 'warn').length,
    deferred: all.filter((f) => f.level === 'later').length,
  };
}

// ── Rendering for the tool results ──────────────────────────────

export function renderFindings(findings: Finding[]): string {
  if (!findings.length) return '  (none)';
  const mark = { bad: '!', warn: '·', later: '…' } as const;
  return findings.map((f) => `  ${mark[f.level]} ${f.where.padEnd(12)} ${f.what}`).join('\n');
}

export function renderApply(r: ApplyResult): string {
  const bad = r.findings.filter((f) => f.level === 'bad');
  const head = r.written
    ? `${r.created ? 'Created' : 'Wrote'} ${r.file}`
    : bad.length ? `NOT written — ${bad.length} violation(s) in ${r.file}` : `Dry run — ${r.file} untouched`;
  const lines = [head, `  ${r.sequences} sequence(s) · ${r.scenes} scene(s) · ${r.shots} shot(s) · ${r.synced} shot label(s) synced from the structure`];
  if (r.approvalDropped && r.written) lines.push('  the `// approved:` line was dropped — an edited board is approved again at the HITL gate');
  lines.push('Findings:', renderFindings(r.findings));
  return lines.join('\n');
}

export function renderCheck(r: CheckResult): string {
  const lines = [`scenes.js contract — ${r.format} · ${r.shots} shots${r.draft ? ' · story pass (--draft)' : ''}`,
                 `  ${r.violations} violation(s), ${r.warnings} to look at${r.draft ? `, ${r.deferred} deferred to §4b` : ''}`,
                 'Structure (sequences → scenes → shots):', renderFindings(r.structure),
                 'Shot contract (check-scenes.js):', renderFindings(r.contract)];
  return lines.join('\n');
}
