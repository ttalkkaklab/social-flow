import { manageProject } from './project.js';
import { readImageMetadata, verifyImageFile } from './image-media.js';
import { mlxImageFamily } from './image-models.js';
import { workflowEpisode } from './production-workflow.js';
import { imageContext } from './image-routing.js';
import { readImageState } from './image-state.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
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

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { evaluateWindowScript } from './scenes-vm.js';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';
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
    RENDER_MODES: string[]; PRODUCTION_MODES: string[]; CHARGES_OPEN: string[]; CHARGES_CLOSE: string[]; TRANSITION_RE: RegExp;
  };
  check(win: Board, opts?: { draft?: boolean }): Finding[];
  executionCheck(win: Board): Finding[];
  guidedCheck(win: Board, opts?: { draft?: boolean }): Finding[];
  castOf(shot: unknown): string[] | undefined;
  outlineGaps(win: Board): string[];
  castGaps(win: Board): string[];
  iconGaps(win: Board): string[];
  depthText(depth: unknown): string;
  imageGaps(win: Board): string[];
  promptBasis(shot: unknown, isFocus: (id: string) => boolean): Record<string, unknown>;
  promptDrift(shot: unknown, isFocus: (id: string) => boolean): string[];
  sync(win: Board): number;
  outline(win: Board, level: string): Record<string, unknown>;
  slugOf(scene: { place?: string; time?: string }): string;
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
  cameraDirectionWarnings(scenes: unknown): string[];
}
export function cameraContract(): CameraContract {
  return loadFromHere(join(REFERENCES_DIR, 'production-mode.js')) as CameraContract;
}
interface TechniqueContract {
  VERSION: string;
  entries: Array<Record<string, unknown>>;
  VALUES: Record<string, Record<string, Record<string, unknown>>>;
  byId: Record<string, Record<string, unknown>>;
  guide(attribute: string, value: string): Record<string, unknown> | null;
  validate(value: unknown): string[];
  findings(scene: unknown): string[];
}
export function techniqueContract(): TechniqueContract {
  return loadFromHere(join(REFERENCES_DIR, 'film-techniques.js')) as TechniqueContract;
}
export const techniqueSelectionSchema = z.array(z.object({
  id: nonEmptyTechniqueId(),
  reason: z.string().trim().min(1).describe('Why this technique serves this shot’s information or action'),
  from: z.string().trim().min(1).optional().describe('Rack focus: the subject sharp first, in English'),
  to: z.string().trim().min(1).optional().describe('Rack focus: the subject sharp last, in English'),
}).strict()).superRefine((value, ctx) => {
  for (const message of techniqueContract().validate(value))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});
function nonEmptyTechniqueId() { return z.string().trim().min(1).describe('Stable id from storyboard_read techniqueCatalog'); }


interface MotionThemeContract {
  THEMES: Record<string, unknown>;
  resolveTheme(plan: unknown): unknown;
  applyTheme(scene: Shot, boardTheme?: unknown): Shot;
}
export function motionThemeContract(): MotionThemeContract {
  return loadFromHere(join(REFERENCES_DIR, 'motion-graphics.js')) as MotionThemeContract;
}
export function motionGraphicTypes(): string[] {
  const registry = loadFromHere(join(REFERENCES_DIR, 'motion-graphics.js')) as { TYPES: Record<string, unknown> };
  return Object.keys(registry.TYPES);
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
      HOOK_TYPES: MISSING, HOOK_FORMS: MISSING, ARCS: MISSING, RENDER_MODES: MISSING, PRODUCTION_MODES: MISSING, CHARGES_OPEN: MISSING, CHARGES_CLOSE: MISSING,
      TRANSITION_RE: /^$/ } as Contract['VOCAB'];
  }
}
const V = vocabAtLoad();
const nonEmpty = z.string().trim().min(1);

export const STRUCTURE_VERSION = (() => { try { return contract().VERSION; } catch { return 'structure-v1'; } })();

export const sceneSchema = z
  .object({
    no: z.number().int().positive().describe('Scene number — the value shots point at with `scene`'),
    place: z.string().optional().describe('One place — the slugline location'),
    time: z.string().optional().describe('One continuous stretch of time — 낮 · 밤 · 새벽 · 10년 뒤'),
    event: z.string().optional().describe('The one thing that happens in this scene'),
    charge: z.record(z.unknown()).optional(),
    turn: z.string().optional().describe('What flipped between the open and the close'),
    summary: z.string().optional().describe("The scene's story in one or two sentences; the storyboard scene header shows it"),
    out: nonEmpty.optional().describe('The sentence the scene goes out on — the one that forces a 그런데 or 그래서 into the next scene'),
  })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;

export const sequenceSchema = z
  .object({
    id: nonEmpty.describe('Stable id, e.g. "q1"'),
    title: z.string().optional().describe('The heading the approval page draws'),
    purpose: z.string().optional().describe('The one purpose that binds these scenes — two purposes are two sequences'),
    question: nonEmpty.optional().describe('The dramatic question this stretch opens'),
    payoff: z.number().int().positive().optional().describe('The scene number that answers the question'),
    scenes: z.array(z.number().int().positive()).describe('Scene numbers in playback order'),
  })
  .strict();
export type Sequence = z.infer<typeof sequenceSchema>;

export const structureSchema = z
  .object({
    version: z.literal(STRUCTURE_VERSION),
    nextShotId: z.number().int().positive().optional(),
    sequences: z.array(sequenceSchema),
    scenes: z.array(sceneSchema),
  })
  .strict();
export type Structure = z.infer<typeof structureSchema>;

const coverageSchema = z.object({
  azimuth: z.number().finite().optional().describe('Horizontal camera bearing, 0–180° inside the selected side of the axis'),
  action: z.string().trim().min(1).optional().describe('Visible action that carries this cut when no 30° or two-step change is used'),
}).passthrough();

const lineCrossingSchema = z.object({
  method: z.enum(['camera_move', 'subject_move', 'neutral', 'intentional']),
  from: nonEmpty.describe('The previous space.line value'),
  to: nonEmpty.describe('The new space.line value'),
  reason: nonEmpty.describe('What the viewer sees that makes the new side legible'),
  bridgeShot: z.number().int().positive().optional().describe('Earlier neutral shot number; required only for method "neutral"'),
}).strict();

/** The grammar half of a shot is exact; the visual plan and the machine layer pass through (scenes-schema.md owns them). */
export const compositionSchema = z.record(z.unknown());
export const eyelineSchema = z.object({ matchShot: z.number().int().positive().optional() }).passthrough();
export const depthSchema = z.record(z.unknown());

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
    narration: z.array(z.object({ id: z.string().trim().min(1).optional(), delivery: z.enum(['voiceover', 'on_screen', 'off_screen']).optional(), tts: z.string(), sub: z.string().optional(), speaker: z.string().trim().min(1).optional() }).passthrough()).optional(),
    visual: visualSchema.optional(),
    duration: z.number().positive().optional(),
    scene: z.number().int().positive().optional(),
    sceneSlug: z.string().optional(),
    sequence: z.string().optional(),
    transition: z.string().regex(V.TRANSITION_RE, 'not a join from scenes-schema §scene transition').optional(),
    beat: z.string().optional(),
    arc: z.string().optional(),
    hookType: z.string().optional(),
    hookForm: z.string().optional(),
    chapter: z.string().optional(),
    after: z.number().int().nonnegative().optional(),
    shot: z
      .object({
        techniques: techniqueSelectionSchema.optional(),
        feel: z.string().optional(),
        size: z.string().optional(),
        angle: z.string().optional(),
        why: z.string().optional(),
        info: z.string().optional(),
        infoType: z.string().optional(),
        share: z.string().optional(),
        shareType: z.string().optional(),
        space: z.record(z.unknown()).optional(),
        eyeline: eyelineSchema.optional(),
        composition: compositionSchema.optional(),
        depth: depthSchema.optional(),
        coverage: coverageSchema.optional(),
        lineNeutral: z.literal(true).optional(),
        lineCrossing: z.record(z.unknown()).optional(),
        motionGraphic: z.object({
          version: z.literal(1),
          type: z.string().refine(value => motionGraphicTypes().includes(value), 'unknown motion graphic type'),
          intent: z.string().optional(), reason: z.string().optional(),
          evidence: z.enum(['data', 'recording', 'reenactment', 'metaphor']),
          style: z.object({ palette: z.string().optional(), reason: z.string().optional(),
            theme: z.object({
              id: z.string().refine(value => value === 'auto' || Object.hasOwn(motionThemeContract().THEMES, value), 'unknown motion theme'),
              context: z.enum(['research','software','education','campaign','storytelling','friendly']).optional(),
              reason: z.string().optional(),
            }).passthrough().optional(),
          }).passthrough(),
          beats: z.array(z.object({ at: z.number().min(0).max(1), action: z.string() }).passthrough()).optional(),
          content: z.record(z.unknown()).optional(),
        }).passthrough().optional(),
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
  shotId: z.string().min(1).optional().describe('Stable shot ID to inspect, with its raw plan and neighboring shot IDs'),
  includeTechniques: z.boolean().default(true).describe('Return canonical technique ids, purposes, icons and provider instructions'),
  includeContext: z.boolean().default(true).describe('Include STORY, PRODUCTION and SB_DOC as unverified review context'),
});

/** Read-only diagnostics: generated bytes do not certify production or visual quality. */
function boardReadiness(win: Board, boardDir: string) {
  let root = boardDir, channel: string | undefined;
  for (;;) {
    if (basename(root) === 'episodes') channel = dirname(root);
    if (existsSync(join(root, '.social-flow/models.json')) || dirname(root) === root) break;
    root = dirname(root);
  }
  let configuration: Record<string, unknown>;
  try {
    const project = manageProject({ action: 'status', workspace: root });
    configuration = { status: project.status, missing: project.missing };
  } catch { configuration = { status: 'not_verified' }; }
  const panels = loadFromHere(join(PLUGIN_ROOT, 'skills/channel/references/character-panels.js')) as {
    boardPanelFindings(board: Board, dir: string, channel: string): Array<Record<string, unknown>>;
  };
  const findings = channel ? panels.boardPanelFindings(win, boardDir, channel) : [];
  const document = win.SB_DOC as { characters?: Array<{ id: string; panels?: Record<string, string> }> | Record<string, { panels?: Record<string, string> }> } | undefined;
  const entries = document?.characters ?? [];
  const characters = Array.isArray(entries) ? entries : Object.entries(entries).map(([id, c]) => ({ ...c, id }));
  const assets = characters.flatMap(c => Object.entries(c.panels ?? {}).map(([slot, name]) => {
    const file = typeof name === 'string' && name.trim() ? resolve(boardDir, name) : null;
    const present = !!file && existsSync(file) && statSync(file).isFile();
    let decoding = 'not_verified';
    if (present) { try { verifyImageFile(file!); decoding = 'verified'; } catch { decoding = 'failed'; } }
    return { characterId: c.id, slot, path: file, file: present ? 'present' : 'missing', decoding, visualReview: 'not_reviewed' };
  }));
  return { configuration, assets, references: { status: !channel ? 'not_checked' : findings.length ? 'needs_attention' : 'checked', findings },
    visualReview: 'not_reviewed', note: 'Diagnostics only; no overall production-ready or visual-quality claim.' };
}

/** Read plans and recorded evidence without claiming to have inspected media or validated reviews. */
export function readStoryboard(args: z.infer<typeof storyboardReadSchema>): Record<string, unknown> {
  const { win, file, sha256 } = readBoard(args.path);
  const result = contract().outline(win, args.level);
  result.file = file;
  result.mediaBaseDirectory = dirname(file);
  result.sha256 = sha256;
  result.readiness = boardReadiness(win, dirname(file));
  if (args.includeTechniques !== false) result.techniqueCatalog = {
    version: techniqueContract().VERSION, entries: techniqueContract().entries, guides: techniqueContract().VALUES,
    selections: (win.SCENES || []).map((scene, i) => ({ id: scene.id, no: i + 1,
      techniques: scene.shot?.techniques || [], findings: techniqueContract().findings(scene) })),
  };
  const doc = win.SB_DOC as Record<string, unknown> | undefined;
  if (doc?.props || doc?.propContinuity) result.propSheet = { props: doc.props, continuity: doc.propContinuity };
  result.inspection = { mediaViewed: false, evidenceStatus: 'not_verified',
    note: 'This response reads plans and recorded reviews only. Open referenced assets and verify current evidence before reporting visual quality or review validity.' };
  const continuity = loadFromHere(join(REFERENCES_DIR, 'shot-continuity.js')) as {
    check(board: Board, dir: string): Finding[];
    plan(board: Board, index: number, dir: string): unknown;
  };
  result.continuityFindings = continuity.check(win, dirname(file));
  result.cameraDirectionFindings = cameraContract().cameraDirectionWarnings(win.SCENES).map(what => ({ level: 'warn', where: 'camera direction', what }));
  result.techniqueFindings = (win.SCENES || []).flatMap((scene, index) => techniqueContract().findings(scene).map(what => ({level:'warn', where:'shot '+(index+1), what})));
  if (args.includeContext) result.reviewContext = {
    story: win.STORY || null, production: win.PRODUCTION || null, document: doc || null,
    evidenceStatus: 'not_verified',
  };
  if (args.shotId) {
    const shots = win.SCENES || [];
    const matches = shots.map((shot, index) => ({ shot, index })).filter(item => item.shot.id === args.shotId);
    if (matches.length !== 1) throw new Error(`shotId ${args.shotId}: expected one match, found ${matches.length}`);
    const { shot, index } = matches[0];
    const playback = result.playback as Array<{ id: string | null; no: number }>;
    const position = playback.findIndex(row => row.no === index + 1);
    const neighbor = (i: number) => i >= 0 && playback[i] ? { id: playback[i].id, no: playback[i].no } : null;
    result.selectedShot = { no: index + 1, shot, continuity: continuity.plan(win, index, dirname(file)),
      scene: win.STRUCTURE?.scenes?.find(scene => scene.no === shot.scene) || null,
      playbackPosition: position < 0 ? null : position + 1,
      previous: position < 0 ? null : neighbor(position - 1), next: position < 0 ? null : neighbor(position + 1) };
  }
  return result;
}

export const storyboardCheckSchema = z.object({
  path: z.string().min(1).describe('The storyboard directory, or its scenes.js'),
  draft: z.boolean().default(false).describe('The story pass (storyboard §4a) — machine-layer absences are deferred, not violations'),
});

export const scenarioCheckSchema = z.object({
  path: z.string().min(1).describe('The candidates directory, or its selected scenario.md'),
});

export const productionSchema = z.object({ mode: tuple([...V.PRODUCTION_MODES, 'hook_only', 'stills_only', 'hybrid']).optional(), renderRatioVersion: z.literal(1).optional() }).passthrough();
const globalsSchema = z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'a window.* global is UPPER_CASE'), z.unknown()).superRefine((value, ctx) => {
  if (value.PRODUCTION === undefined) return;
  const parsed = productionSchema.safeParse(value.PRODUCTION);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['PRODUCTION', ...issue.path] });
});

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
  set: z.object({ structure: structureSchema.optional(), shots: z.array(shotSchema).min(1) }).optional()
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
  globals: globalsSchema.optional().describe('Set other window.* blocks — FORMAT, THEME, COMPREHENSION, STORY, PRODUCTION, MUSIC, SFX, VOICE, MOTION_POLICY'),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional().describe('Required for propSheet file edits; use the hash from storyboard_read'),
  propSheet: z.object({
    props: z.array(z.record(z.unknown())),
    continuity: z.record(z.unknown()).optional(),
  }).strict().optional().describe('Replace the prop registry and optional version:1 continuity ledger together. SB_DOC.characters must register every owner and holder. See prop-continuity.md'),
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
  sha256: string;
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
  return { file, header, win, sha256: createHash('sha256').update(src).digest('hex') };
}

/** The order the schema document lists the blocks in; anything else follows alphabetically. */
const GLOBAL_ORDER = ['FORMAT', 'VOICE', 'THEME', 'COMPREHENSION', 'STORY', 'PRODUCTION', 'MOTION_POLICY', 'MUSIC', 'SFX', 'STRUCTURE', 'SCENES'];

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
      for (const issue of parsed.error.issues) out.push({ level: 'bad', where: `shot ${i + 1}`, what: issue.path.length === 1 && issue.path[0] === 'id'
        ? 'id: expected s followed by at least four digits (for example s0001)'
        : `${issue.path.join('.') || '(root)'}: ${issue.message}` });
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
export function applyPatch(win: Board, patch: StoryboardApplyArgs, opts: { outline?: boolean } = {}): { win: Board; findings: Finding[]; synced: number } {
  const next: Board = { ...win };
  if (patch.globals) for (const [k, v] of Object.entries(patch.globals)) {
    if (k === 'SCENES' || k === 'STRUCTURE') throw new Error(`set ${k} through the dedicated fields, not globals`);
    next[k] = v;
  }
  const boardMotionTheme = (next.THEME as Record<string, unknown> | undefined)?.motionGraphicTheme;
  if (boardMotionTheme) motionThemeContract().resolveTheme({ type: 'process', style: { theme: boardMotionTheme } });
  if (patch.propSheet) next.SB_DOC = { ...(next.SB_DOC as Record<string, unknown> ?? {}),
    props: patch.propSheet.props, propContinuity: patch.propSheet.continuity };
  if (patch.set) { if (patch.set.structure) next.STRUCTURE = patch.set.structure; next.SCENES = patch.set.shots.slice(); }
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
  // Any reorder — by position or by id (R7) — has to walk the references; a removeShotIds-only
  // patch used to skip this and leave matchShot pointing at the wrong position (review P2).
  const reordered = Boolean(patch.removeShots || patch.removeShotIds || patch.insertShots);
  for (const source of reordered ? finalOrder : []) {
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
  next.SCENES = shots.map((shot) => shot.shot?.motionGraphic && (shot.shot.motionGraphic.style.theme || (next.THEME as Record<string, unknown> | undefined)?.motionGraphicTheme) ? motionThemeContract().applyTheme({ ...shot }, (next.THEME as Record<string, unknown> | undefined)?.motionGraphicTheme) : { ...shot });  // sync() writes sceneSlug/sequence — never into the caller's objects

  // A prompt rewritten through storyboard_apply no longer comes from its shot_prompt basis (structure-contract.js promptDrift).
  if (!opts.outline) {
    const earlier = new Map(originalShots.map((shot) => [shot.id, shot]));
    next.SCENES = next.SCENES.map((shot) => {
      const video = (shot.visual as { video?: Record<string, unknown> } | undefined)?.video;
      const old = (earlier.get(shot.id)?.visual as { video?: Record<string, unknown> } | undefined)?.video;
      if (!video?.promptBasis || video.prompt === old?.prompt) return shot;
      const { promptBasis: _basis, ...rest } = video;
      return { ...shot, visual: { ...shot.visual, video: rest } } as Shot;
    });
  }
  const findings: Finding[] = [];
  if (!shots.length && !opts.outline) findings.push({ level: 'bad', where: 'board', what: 'the board has no shots' });
  if ((win.STORY as { authoring?: unknown } | undefined)?.authoring === 'story-first' && (next.STORY as { authoring?: unknown } | undefined)?.authoring !== 'story-first')
    findings.push({ level: 'bad', where: 'STORY', what: 'story_order: STORY.authoring "story-first" stays on a board started with story_sequence' });
  if (next.STRUCTURE !== undefined) findings.push(...validateStructure(next.STRUCTURE));
  findings.push(...validateShots(shots));
  let synced = 0;
  if (!findings.some((f) => f.level === 'bad')) {
    synced = contract().sync(next);
    // A write refuses only an unreadable board and the story order (user directive 2026-10-31); storyboard_check
    // runs every other rule on request. A story outline may hold sequences and scenes before its first shot story.
    findings.push(...contract().executionCheck(next).filter((f) => shots.length || !opts.outline || f.where !== 'board'));
  }
  return { win: next, findings, synced };
}

/** storyboard_apply — read, patch, validate, write unless a violation or a dry run. */
export function applyStoryboard(args: StoryboardApplyArgs, opts: { outline?: boolean } = {}): ApplyResult {
  const file = scenesPath(args.path);
  const exists = existsSync(file);
  let header: string[] = [];
  let win: Board = {};
  if (exists) ({ header, win } = readBoard(file));
  else if (!args.set && !opts.outline) throw new Error(`no scenes.js at ${file} — a new board is written with \`set\` (structure + shots)`);
  else if (!opts.outline && workflowEpisode(dirname(file))) throw new Error('story_order: a new episode board starts with story_sequence → story_scene → story_shot');
  else if (!existsSync(dirname(file))) throw new Error(`directory does not exist: ${dirname(file)}`);

  const original = exists ? readFileSync(file, 'utf8') : '';
  const originalHash = createHash('sha256').update(original).digest('hex');
  const previousDoc = win.SB_DOC as Record<string, unknown> | undefined;
  const incomingDoc = args.globals?.SB_DOC as Record<string, unknown> | undefined;
  const changesProps = !!args.propSheet || (!!args.globals && Object.prototype.hasOwnProperty.call(args.globals, 'SB_DOC')
    && ['props', 'propContinuity'].some(key => JSON.stringify(previousDoc?.[key]) !== JSON.stringify(incomingDoc?.[key])));
  if (changesProps && exists && args.expectedSha256 !== originalHash)
    throw new Error('head_moved: propSheet requires the current expectedSha256 from storyboard_read');
  const { win: next, findings, synced } = applyPatch(win, args, opts);
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
    if (changesProps && exists) {
      if (createHash('sha256').update(readFileSync(file)).digest('hex') !== originalHash) throw new Error('head_moved');
      const history = join(dirname(file), '.prop-history'); mkdirSync(history, { recursive: true });
      const backup = join(history, originalHash + '.js');
      if (!existsSync(backup)) writeFileSync(backup, original, { flag: 'wx' });
    }
    writeFileSync(tmp, serializeBoard(next, header), 'utf8');
    renameSync(tmp, file);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw err;
  }
  result.written = true;
  return result;
}

// ── Story outline: sequences → scenes → shot stories (user directive 2026-10-31) ──
// The first storyboard step writes only the story, one layer at a time, through three tools.
// Each layer needs the one above it; dialogue, pictures and prompts come after.

const outlinePath = z.string().min(1).describe('The storyboard directory (scenes.js is created there when missing) or its scenes.js');
export const storySequenceSchema = z.object({
  path: outlinePath,
  sequences: z.array(z.object({
    id: nonEmpty.describe('Stable id, e.g. "q1"'),
    title: nonEmpty.describe('The heading the approval page draws'),
    purpose: nonEmpty.describe('The one purpose that binds its scenes'),
    question: nonEmpty.optional().describe('The dramatic question this stretch opens'),
    payoff: z.number().int().positive().optional().describe('The scene number that answers the question'),
  }).strict()).min(1),
}).strict();
export const storySceneSchema = z.object({
  path: outlinePath,
  scenes: z.array(z.object({
    sequence: nonEmpty.describe('The id of the sequence this scene belongs to — written first with story_sequence'),
    no: z.number().int().positive(),
    place: nonEmpty, time: nonEmpty,
    event: nonEmpty.describe('The one thing that happens in this scene'),
    summary: nonEmpty.describe("The scene's story in one or two sentences"),
    turn: nonEmpty.optional(), out: nonEmpty.optional(),
  }).strict()).min(1),
}).strict();
export const storyShotSchema = z.object({
  path: outlinePath,
  shots: z.array(z.object({
    id: shotIdSchema.optional().describe('Revise this shot; without it a new shot is added at the end of its scene'),
    scene: z.number().int().positive().describe('The scene number — written first with story_scene'),
    summary: nonEmpty.describe('The story this shot tells, in one sentence'),
    title: nonEmpty.optional(),
  }).strict()).min(1),
}).strict();

const emptyStructure = (): Structure => ({ version: STRUCTURE_VERSION, sequences: [], scenes: [] });
function readOutline(path: string): { win: Board; st: Structure } {
  const file = scenesPath(path);
  const win = existsSync(file) ? readBoard(file).win : {};
  return { win, st: win.STRUCTURE ?? emptyStructure() };
}
function writeOutline(path: string, win: Board, structure: Structure, shots?: Shot[]): ApplyResult {
  return applyStoryboard({
    path, draft: true, dryRun: false, structure,
    ...(shots?.length ? { set: { structure, shots } } : {}),
    // A board the story tools start is story-first: every writer keeps its layer order (structure-contract.js).
    ...(win.STORY ? {} : { globals: { STORY: { version: 'story-v2', authoring: 'story-first' } } }),
  }, { outline: true });
}

export function writeStorySequences(args: z.infer<typeof storySequenceSchema>): ApplyResult {
  const { win, st } = readOutline(args.path);
  requireEpisodeCast(args.path, win);
  const sequences = upsertBy(st.sequences, args.sequences.map((q) =>
    ({ ...st.sequences.find((old) => old.id === q.id), ...q, scenes: st.sequences.find((old) => old.id === q.id)?.scenes ?? [] })), 'id');
  // The payoff is one of the sequence's own scenes (storyboard_check); before its scenes exist there is nothing to compare.
  const notes: Finding[] = sequences.filter((q) => q.payoff !== undefined && q.scenes.length && !q.scenes.includes(q.payoff))
    .map((q) => ({ level: 'warn', where: `sequence ${q.id}`, what: `payoff names scene ${q.payoff}, which is outside this sequence — fix it with story_sequence or story_scene` }));
  const result = writeOutline(args.path, win, { ...st, sequences });
  return { ...result, findings: [...result.findings, ...notes] };
}

export function writeStoryScenes(args: z.infer<typeof storySceneSchema>): ApplyResult {
  const { win, st } = readOutline(args.path);
  requireEpisodeCast(args.path, win);
  if (!st.sequences.length) throw new Error('story_order: write the sequences first with story_sequence');
  let { sequences, scenes } = st;
  for (const { sequence, ...scene } of args.scenes) {
    if (!sequences.some((q) => q.id === sequence)) throw new Error(`story_order: sequence ${sequence} does not exist — write it with story_sequence`);
    scenes = upsertBy(scenes, [{ ...scenes.find((old) => old.no === scene.no), ...scene }], 'no');
    sequences = sequences.map((q) => q.id === sequence
      ? (q.scenes.includes(scene.no) ? q : { ...q, scenes: [...q.scenes, scene.no] })
      : { ...q, scenes: q.scenes.filter((no) => no !== scene.no) });
  }
  return writeOutline(args.path, win, { ...st, sequences, scenes });
}

export function writeStoryShots(args: z.infer<typeof storyShotSchema>): ApplyResult {
  const { win, st } = readOutline(args.path);
  requireEpisodeCast(args.path, win);
  if (!st.scenes.length) throw new Error('story_order: write the scenes first with story_scene');
  const order = st.sequences.flatMap((q) => q.scenes);
  const shots: Shot[] = Array.isArray(win.SCENES) ? win.SCENES.slice() : [];
  // A new or moved shot plays after the last shot of its scene or of any earlier scene.
  const endOf = (scene: number) => {
    const rank = order.indexOf(scene);
    let at = 0;
    shots.forEach((shot, i) => { if (shot.scene !== undefined && order.indexOf(shot.scene) <= rank) at = i + 1; });
    return at;
  };
  const origin = new Map<Shot, Shot>();
  for (const { id, ...story } of args.shots) {
    if (!order.includes(story.scene)) throw new Error(`story_order: scene ${story.scene} is not in a sequence — write it with story_scene`);
    if (id) {
      const index = shots.findIndex((shot) => shot.id === id);
      if (index < 0) throw new Error(`story_shot: no shot with id ${id} on this board`);
      const [old] = shots.splice(index, 1), revised = { ...old, ...story };
      origin.set(revised, origin.get(old) ?? old);
      shots.splice(old.scene === story.scene ? index : endOf(story.scene), 0, revised);
      continue;
    }
    shots.splice(endOf(story.scene), 0, { type: 'points', ...story } as Shot);
  }
  // eyeline.matchShot names a position, so it follows its shot through inserts and moves (applyPatch does the same).
  const before = Array.isArray(win.SCENES) ? win.SCENES : [];
  const position = new Map(shots.map((shot, i) => [origin.get(shot) ?? shot, i + 1]));
  const renumbered = shots.map((shot) => {
    const eyeline = shot.shot?.eyeline, target = typeof eyeline?.matchShot === 'number' ? before[eyeline.matchShot - 1] : undefined;
    const at = target ? position.get(target) : undefined;
    return eyeline && at && at !== eyeline.matchShot ? { ...shot, shot: { ...shot.shot, eyeline: { ...eyeline, matchShot: at } } } as Shot : shot;
  });
  return writeOutline(args.path, win, st, renumbered);
}

// Step 2: each shot's characters, then each character's lines (user directive 2026-10-31).
export const shotCharactersSchema = z.object({
  path: outlinePath,
  shots: z.array(z.object({
    id: shotIdSchema,
    characters: z.array(nonEmpty).max(2).refine((ids) => new Set(ids).size === ids.length, 'a character is listed once')
      .describe('Principal characters on screen, subject first; [] when nobody from the cast is on screen'),
  }).strict()).min(1),
}).strict();
export const shotDialogueSchema = z.object({
  path: outlinePath,
  shots: z.array(z.object({
    id: shotIdSchema,
    lines: z.array(z.object({
      id: nonEmpty.optional().describe('Stable line id to revise; omitted ids are assigned'),
      speaker: nonEmpty.describe('The character who speaks — a narrator is a character too'),
      tts: nonEmpty.describe('The spoken line, in the video\'s language'),
      sub: z.string().optional().describe('The written notation when it differs from tts'),
      delivery: z.enum(['voiceover', 'on_screen', 'off_screen']).optional()
        .describe('Default: on_screen for one of the shot\'s characters, voiceover for anyone else'),
    }).strict()).describe('Every line of the shot in spoken order; [] makes it silent'),
  }).strict()).min(1),
}).strict();

// The episode cast (user directive 2026-11-01): storyboard/cast.json names each character's identity.md, and
// every character who can appear on screen has its three sheet panels before the story starts.
const SHEET_VIEWS = ['face', 'front', 'back'];
/** The sheet views a character folder's panels.json does not point at an existing file for. */
function missingPanels(folder: string): string[] {
  let panels: Record<string, { file?: unknown } | undefined> = {};
  try { panels = (JSON.parse(readFileSync(join(folder, 'panels.json'), 'utf8')) as { panels?: typeof panels }).panels ?? {}; } catch { return SHEET_VIEWS; }
  return SHEET_VIEWS.filter((view) => { const file = panels[view]?.file; return typeof file !== 'string' || !file || !existsSync(join(folder, file)); });
}
type CastEntry = { id: string; source?: unknown; voiceOnly?: unknown };
function readCast(storyboardDir: string): CastEntry[] {
  const file = join(storyboardDir, 'cast.json');
  if (!existsSync(file)) return [];
  let list: unknown;
  try { list = (JSON.parse(readFileSync(file, 'utf8')) as { characters?: unknown }).characters; } catch { list = undefined; }
  // An older snapshot keys its characters by id.
  if (list && typeof list === 'object' && !Array.isArray(list)) list = Object.entries(list).map(([id, value]) => ({ ...(value as object), id }));
  if (!Array.isArray(list) || list.some((entry) => typeof (entry as { id?: unknown })?.id !== 'string' || !(entry as { id: string }).id))
    throw new Error('cast_unreadable: storyboard/cast.json needs {"characters":[{"id","source"}]}');
  return list as CastEntry[];
}
/** Refuses a cast entry without its identity.md, or an on-screen character without its face, front and back panels. */
function checkCast(storyboardDir: string, cast: CastEntry[]): void {
  const problems: string[] = [];
  for (const { id, source, voiceOnly } of cast) {
    const identity = typeof source === 'string' && source ? resolve(storyboardDir, source) : '';
    const folder = dirname(identity);
    if (!identity || basename(identity) !== 'identity.md' || basename(folder) !== id || basename(dirname(folder)) !== 'characters'
      || basename(dirname(dirname(folder))) !== 'assets' || !existsSync(identity)) {
      problems.push(`cast_source_missing: ${id} needs source pointing at an existing assets/characters/${id}/identity.md (character_manage)`);
      continue;
    }
    const missing = voiceOnly === true ? [] : missingPanels(folder);
    if (missing.length) problems.push(`character_panel_missing: ${id} has no ${missing.join(', ')} sheet panel (character_panel)`);
  }
  if (problems.length) throw new Error(`${problems.join('; ')} — finish the character sheets before the episode story; a narrator who is never seen takes "voiceOnly": true in cast.json`);
}
/** Inside an episode the story tools wait for a ready cast on a board that is, or is about to become, story-first. */
function requireEpisodeCast(path: string, win: Board): void {
  const dir = dirname(scenesPath(path));
  const story = win.STORY as { authoring?: unknown } | undefined;
  if (!workflowEpisode(dir) || (story && story.authoring !== 'story-first')) return;
  const cast = readCast(dir);
  if (!cast.length) throw new Error('cast_required: an episode story starts after storyboard/cast.json names its characters (storyboard §1)');
  checkCast(dir, cast);
}
/** The episode cast: storyboard/cast.json, checked on a story-first board; an older board also accepts SB_DOC.characters ids. */
function castRegistry(path: string, win: Board): { ids: Set<string>; voiceOnly: Set<string> } {
  const dir = dirname(scenesPath(path));
  const cast = readCast(dir);
  const storyFirst = (win.STORY as { authoring?: unknown } | undefined)?.authoring === 'story-first';
  if (storyFirst) checkCast(dir, cast);
  const ids = new Set(cast.map((entry) => entry.id));
  if (!storyFirst) {
    const list = (win.SB_DOC as { characters?: unknown } | undefined)?.characters;
    const entries = Array.isArray(list) ? list : Object.entries(list ?? {}).map(([id, value]) => ({ ...(value as object), id }));
    for (const entry of entries) if (typeof (entry as { id?: unknown })?.id === 'string') ids.add((entry as { id: string }).id);
  }
  if (!ids.size) throw new Error('cast_required: snapshot the episode cast in storyboard/cast.json first (storyboard §1)');
  return { ids, voiceOnly: new Set(cast.filter((entry) => entry.voiceOnly === true).map((entry) => entry.id)) };
}
function shotIndex(shots: Shot[], id: string, tool: string): number {
  const index = shots.findIndex((shot) => shot.id === id);
  if (index < 0) throw new Error(`${tool}: no shot with id ${id} on this board`);
  return index;
}

export function writeShotCharacters(args: z.infer<typeof shotCharactersSchema>): ApplyResult {
  const { win, st } = readOutline(args.path);
  const gaps = contract().outlineGaps(win);
  if (gaps.length) throw new Error('story_order: finish the story first (story_sequence → story_scene → story_shot) — ' + gaps.join('; '));
  const known = castRegistry(args.path, win);
  const shots = (win.SCENES ?? []).slice();
  const notes: Finding[] = [];
  for (const { id, characters } of args.shots) {
    const index = shotIndex(shots, id, 'shot_characters');
    for (const character of characters) {
      if (!known.ids.has(character)) throw new Error(`cast_unknown: ${character} is not in the episode cast`);
      if (known.voiceOnly.has(character)) throw new Error(`cast_voice_only: ${character} is voiceOnly in cast.json and is never on screen — give them sheet panels and drop voiceOnly first`);
    }
    const visual = (shots[index].visual ?? {}) as Record<string, unknown>;
    const before = contract().castOf(shots[index]);
    // A kept character keeps its { id, scope } entry.
    const scoped = ([] as unknown[]).concat(visual.character ?? []).filter((e): e is { id: string } => !!e && typeof e === 'object');
    const entries = characters.map((character) => scoped.find((e) => e.id === character) ?? character);
    // A character who leaves the frame keeps their lines, now heard off screen; the author revises them if needed.
    const lines = shots[index].narration ?? [];
    const left = [...new Set(lines.filter((line) => line.delivery === 'on_screen' && line.speaker && !characters.includes(line.speaker)).map((line) => line.speaker))];
    // The sheet panels of a character who left go with them — by their sheet folder or the id shot_image gives them
    // (<shot>-<character>-face|front|back); shot_image composes the new cast's.
    const gone = (before ?? []).filter((character) => !characters.includes(character));
    const theirs = (ref: Record<string, unknown>) => gone.some((character) => String(ref.path ?? '').match(/characters\/([^/]+)\//)?.[1] === character
      || ['face', 'front', 'back'].some((view) => ref.id === `${id}-${character}-${view}`));
    const references = Array.isArray(visual.references) && gone.length
      ? (visual.references as Array<Record<string, unknown>>).filter((ref) => ref?.role !== 'character' || !theirs(ref))
      : visual.references;
    shots[index] = { ...shots[index], visual: { ...visual, character: entries.length ? entries : null, ...(references !== visual.references ? { references } : {}) },
      ...(left.length ? { narration: lines.map((line) => line.delivery === 'on_screen' && left.includes(line.speaker) ? { ...line, delivery: 'off_screen' as const } : line) } : {}) };
    if (left.length) notes.push({ level: 'warn', where: id, what: `${left.join(', ')} left the frame, so their on-screen lines are now off_screen — revise them with shot_dialogue if they should change` });
    const back = [...new Set(lines.filter((line) => line.delivery === 'off_screen' && line.speaker && characters.includes(line.speaker)).map((line) => line.speaker))];
    if (back.length) notes.push({ level: 'warn', where: id, what: `${back.join(', ')} ${back.length > 1 ? 'are' : 'is'} in the frame with off_screen lines — set their delivery with shot_dialogue if they speak on screen` });
    if (before && (visual.frames as { start?: unknown } | undefined)?.start && [...before].sort().join() !== [...characters].sort().join())
      notes.push({ level: 'warn', where: id, what: 'the start image shows the previous characters — remake it with shot_image' });
    notes.push(...promptNotes(shots[index]));
  }
  const result = writeOutline(args.path, win, st, shots);
  return { ...result, findings: [...result.findings, ...notes] };
}

export function writeShotDialogue(args: z.infer<typeof shotDialogueSchema>): ApplyResult {
  const { win, st } = readOutline(args.path);
  const known = castRegistry(args.path, win);
  const shots = (win.SCENES ?? []).slice();
  type Line = NonNullable<Shot['narration']>[number];
  const notes: Finding[] = [];
  const used = new Set(shots.flatMap((shot) => (shot.narration ?? []).map((line) => line.id).filter(Boolean)));
  for (const { id, lines } of args.shots) {
    const index = shotIndex(shots, id, 'shot_dialogue');
    const cast = contract().castOf(shots[index]);
    if (!cast) throw new Error(`story_order: set ${id}'s characters with shot_characters before its lines`);
    const old: Line[] = shots[index].narration ?? [];
    for (const line of old) if (line.id) used.delete(line.id);
    const next = lines.map((line, n): Line => {
      if (!known.ids.has(line.speaker)) throw new Error(`cast_unknown: speaker ${line.speaker} is not in the episode cast`);
      const delivery = line.delivery ?? (cast.includes(line.speaker) ? 'on_screen' : 'voiceover');
      if (delivery === 'on_screen' && !cast.includes(line.speaker))
        throw new Error(`story_order: ${line.speaker} speaks on screen in ${id} but is not among its characters — add them with shot_characters`);
      let lineId = line.id;
      for (let k = n + 1; !lineId; k++) if (!used.has(`${id}-l${k}`)) lineId = `${id}-l${k}`;
      if (used.has(lineId)) throw new Error(`shot_dialogue: line id ${lineId} is already used`);
      used.add(lineId);
      // A line revised by its id keeps its acting and audio binding; a changed text makes that audio stale.
      return { ...(line.id ? old.find((o) => o.id === line.id) : undefined), id: lineId, speaker: line.speaker, delivery, tts: line.tts, sub: line.sub };
    });
    shots[index] = { ...shots[index], narration: next };
    notes.push(...promptNotes(shots[index]));
  }
  const result = writeOutline(args.path, win, st, shots);
  return { ...result, findings: [...result.findings, ...notes] };
}

// A video prompt shot_prompt wrote goes stale when what it was written from changes (structure-contract.js promptDrift).
const isFocus = (id: string) => !!(techniqueContract().entries.find((entry) => entry.id === id)?.fields as Record<string, unknown> | undefined)?.focus;
const DRIFT_WORDS: Record<string, string> = { frames: 'frame plan', cast: 'characters', lines: 'on-screen lines', camera: 'camera move', focus: 'focus', framing: 'size, angle or depth' };
function promptNotes(shot: Shot): Finding[] {
  const drift = contract().promptDrift(shot, isFocus);
  return drift.length ? [{ level: 'warn', where: String(shot.id), what: `the video prompt predates a change of ${drift.map((key) => DRIFT_WORDS[key] ?? key).join(', ')} — rewrite it with shot_prompt` }] : [];
}

// Step 3: the attributes the review's icon row shows (user directive 2026-10-31).
const choice = z.object({ id: nonEmpty, reason: nonEmpty }).strict();
// The two routes keep their own pace words (render-routing.md): a video move is seen, a still window crawls.
const VIDEO_SPEEDS = ['slow', 'steady', 'fast'], STILL_SPEEDS = ['very slow', 'slow', 'fast', 'very fast'];
export const shotIconsSchema = z.object({
  path: outlinePath,
  shots: z.array(z.object({
    id: shotIdSchema,
    render: z.object({ mode: tuple(V.RENDER_MODES), purpose: nonEmpty.optional(), reason: nonEmpty }).strict().optional()
      .describe('Render route: shot.render'),
    size: tuple(V.SIZES).optional(),
    why: nonEmpty.optional().describe('Why this size'),
    angle: tuple(V.ANGLES).optional(),
    move: choice.extend({ target: nonEmpty.optional(), speed: z.enum(['very slow', 'slow', 'steady', 'fast', 'very fast']).optional() }).strict().optional()
      .describe('A camera technique with a movement; on a still_camera cut, the still effect (push, pan, focus-in, hold …)'),
    focus: choice.extend({ from: nonEmpty.optional(), to: nonEmpty.optional() }).strict().nullable().optional()
      .describe('A camera technique with a focus field (camera.rack-focus) and the subjects it hands focus between; null removes it'),
    depth: depthSchema.optional(),
    frames: z.object({ mode: z.enum(['first', 'first_last', 'reference']), reason: nonEmpty, endState: nonEmpty.optional() }).strict().optional()
      .describe('Frame plan: reference is MSR (subject images + start image)'),
  }).strict()).min(1),
}).strict();

export function writeShotIcons(args: z.infer<typeof shotIconsSchema>): ApplyResult {
  const { win, st } = readOutline(args.path);
  const gaps = [...contract().outlineGaps(win), ...contract().castGaps(win)];
  if (gaps.length) throw new Error('story_order: write the story and every shot\'s characters first (story_shot → shot_characters) — ' + gaps.join('; '));
  const catalog = Object.fromEntries(techniqueContract().entries.map((entry) => [String(entry.id), entry as { category: string; fields: Record<string, string> }]));
  const field = (id: string, name: string) => catalog[id]?.category === 'camera' ? catalog[id].fields[name] : undefined;
  const shots = (win.SCENES ?? []).slice();
  const notes: Finding[] = [];
  // A 9:16 board gets each chosen value's vertical note back as a warning — advice for the choice, never a refusal.
  const vertical = !/16x9/.test(String(win.FORMAT ?? ''));
  for (const { id, render, size, why, angle, move, focus, depth, frames } of args.shots) {
    const index = shotIndex(shots, id, 'shot_icons');
    const plan = { ...(shots[index].shot ?? {}) } as Record<string, unknown>;
    const visual = { ...(shots[index].visual ?? {}) } as Record<string, unknown>;
    // What shot_image composed the start image from: size, angle, depth and the framing techniques (sourceInstructions).
    const framing = () => JSON.stringify([plan.size, plan.angle, plan.depth, ((Array.isArray(plan.techniques) ? plan.techniques : []) as Array<{ id: string }>)
      .filter((t) => { const entry = catalog[t.id] as { category?: string; fields?: Record<string, unknown> } | undefined;
        return !!entry && (entry.category === 'framing' || !!entry.fields?.focus || !!entry.fields?.viewpoint || !!entry.fields?.angle); }).map((t) => t.id)]);
    const framedBefore = framing();
    const routed: Record<string, unknown> = { ...(plan.render as Record<string, unknown> | undefined), ...render };
    // A new route drops the old route's move: a still cut moves its window (render.camera), any other route moves the camera.
    const previous = (plan.render as { mode?: string } | undefined)?.mode;
    if (render && previous && previous !== render.mode) {
      if (render.mode === 'still_camera') {
        if (Array.isArray(plan.techniques)) plan.techniques = (plan.techniques as Array<{ id: string }>).filter((t) => !field(t.id, 'movement') && !field(t.id, 'focus'));
        const { movement: _movement, speed: _speed, target: _target, ...camera } = (visual.camera ?? {}) as Record<string, unknown>;
        if (visual.camera) visual.camera = Object.keys(camera).length ? camera : undefined;
      } else if (previous === 'still_camera') {
        delete routed.camera;
        if ((routed.motionIntent as { type?: string } | undefined)?.type === 'intentional_still') delete routed.motionIntent;
      }
    }
    if (render) plan.render = routed;
    // why explains the size: a new size without its own why drops the old one.
    if (size && size !== plan.size && !why) delete plan.why;
    if (size) plan.size = size;
    if (why) plan.why = why;
    if (angle) plan.angle = angle;
    if (depth) {
      const errors = contract().validateDepth(depth);
      if (errors.length) throw new Error(`shot_icons ${id}: depth — ${errors.join('; ')}`);
      plan.depth = depth;
    }
    // The prompts quote these words, so another language is refused here rather than later at shot_prompt.
    for (const [name, value] of [['move.target', routed.mode === 'still_camera' ? undefined : move?.target], ['focus.from', focus?.from], ['focus.to', focus?.to]] as Array<[string, string | undefined]>) {
      const foreign = value ? nonEnglishOutsideQuotes(value) : '';
      if (foreign) throw new Error(`video_prompt_language: shot_icons ${id} ${name} has "${foreign}"; write it in English, the image and video prompts quote it`);
    }
    let techniques = (Array.isArray(plan.techniques) ? plan.techniques : []) as Array<{ id: string; reason: string }>;
    if (move && routed.mode === 'still_camera') {
      // A still cut moves the window over the picture (render-routing.js STILL_CAMERA_EFFECTS).
      if (!stillCameraEffectList().includes(move.id)) throw new Error(`shot_icons ${id}: a still_camera move is one of ${stillCameraEffectList().join(', ')}`);
      if (move.speed && !STILL_SPEEDS.includes(move.speed)) throw new Error(`shot_icons ${id}: a still effect's speed is ${STILL_SPEEDS.join(', ')}`);
      // A different effect brings its own target and pace; the same effect keeps what it had unless given.
      const { target: oldTarget, ...still } = (routed.camera ?? {}) as Record<string, unknown>;
      const target = move.target ?? (still.effect === move.id ? oldTarget : undefined);
      const { motionIntent, ...kept } = routed as { motionIntent?: { type?: string } };
      plan.render = { ...kept, camera: { ...still, effect: move.id, reason: move.reason, ...(target !== undefined ? { target } : {}) },
        // A hold is a deliberate still beat, not a missing move (motion-expectation.js intentional_still).
        ...(move.id === 'hold' ? { motionIntent: { type: 'intentional_still', reason: move.reason } } : motionIntent && motionIntent.type !== 'intentional_still' ? { motionIntent } : {}) };
      // The still lane reads its pace from visual.camera.speed (render-routing.md).
      const { speed: oldSpeed, ...lens } = (visual.camera ?? {}) as Record<string, unknown>;
      const speed = move.speed ?? (still.effect === move.id ? oldSpeed : undefined);
      if (speed !== undefined || visual.camera) visual.camera = speed !== undefined ? { ...lens, speed } : Object.keys(lens).length ? lens : undefined;
    } else if (move) {
      const movement = field(move.id, 'movement');
      if (!movement) throw new Error(`shot_icons ${id}: ${move.id} is not a camera move in the technique catalog`);
      if (move.speed && !VIDEO_SPEEDS.includes(move.speed)) throw new Error(`shot_icons ${id}: a camera move's speed is ${VIDEO_SPEEDS.join(', ')}`);
      // The same move: its technique, or — before any move technique was recorded — the authored visual.camera move.
      const prior = String((visual.camera as { movement?: unknown } | undefined)?.movement ?? '').toLowerCase();
      const same = techniques.some((t) => t.id === move.id) || (!techniques.some((t) => field(t.id, 'movement')) && prior.startsWith(movement));
      techniques = [...techniques.filter((t) => !field(t.id, 'movement')), { id: move.id, reason: move.reason }];
      // A different move replaces the old one's speed and target; the same move keeps what it had unless given.
      const { speed: oldSpeed, target: oldTarget, ...camera } = (visual.camera ?? {}) as Record<string, unknown>;
      const speed = move.speed ?? field(move.id, 'speed') ?? (same ? oldSpeed : undefined), target = move.target ?? (same ? oldTarget : undefined);
      // film-techniques.js findings: visual.camera.movement starts with the technique's movement.
      visual.camera = { ...camera, movement: String(camera.movement ?? '').toLowerCase().startsWith(movement) ? camera.movement : movement,
        ...(speed !== undefined ? { speed } : {}), ...(target !== undefined ? { target } : {}) };
    }
    if (focus !== undefined) {
      // A still cut moves its focus with the still effect itself; a focus technique there would reach no prompt.
      if (focus && routed.mode === 'still_camera') throw new Error(`shot_icons ${id}: a still_camera cut moves its focus with the still effect (move rack-focus or focus-in), not a focus technique`);
      if (focus && !field(focus.id, 'focus')) throw new Error(`shot_icons ${id}: ${focus.id} is not a focus technique`);
      if (focus && !(focus.from && focus.to)) notes.push({ level: 'warn', where: id, what: `${focus.id} names no subjects — give from and to, the subject sharp first and the one sharp last, so the video prompt can say what the focus moves between` });
      techniques = [...techniques.filter((t) => !field(t.id, 'focus')), ...(focus ? [focus] : [])];
    }
    if ((move && routed.mode !== 'still_camera') || focus !== undefined) plan.techniques = techniques;
    if (frames) {
      const old = (visual.frames ?? {}) as Record<string, unknown>, next: Record<string, unknown> = { ...old, ...frames };
      // Only a first_last plan carries an end image; any other plan takes it off (the file stays in images/).
      if (frames.mode !== 'first_last') {
        if (typeof old.end === 'string') notes.push({ level: 'warn', where: id, what: `the end image ${old.end} is off the shot — a ${frames.mode} plan has no end image` });
        delete next.end; delete next.endState; delete next.endProps; delete visual.endPrompt;
      }
      // MSR also sends the character panels to the video model (use both); other plans use them for the start image only.
      if ((old.mode === 'reference') !== (frames.mode === 'reference') && Array.isArray(visual.references))
        visual.references = (visual.references as Array<Record<string, unknown>>).map((ref) => ref?.role === 'character' ? { ...ref, use: frames.mode === 'reference' ? 'both' : 'image' } : ref);
      visual.frames = next;
    }
    if ((visual.frames as { start?: unknown } | undefined)?.start && framing() !== framedBefore)
      notes.push({ level: 'warn', where: id, what: 'the start image was made for the previous size, angle, depth or focus — remake it with shot_image' });
    shots[index] = { ...shots[index], shot: plan, visual } as Shot;
    notes.push(...promptNotes(shots[index]));
    if (vertical) {
      const t = techniqueContract(), still = (plan.render as { mode?: string } | undefined)?.mode === 'still_camera';
      const mode = depth ? String((depth as { mode?: unknown }).mode ?? '') : undefined;
      const picks: Array<[string, string | undefined, Record<string, unknown> | null | undefined]> = [
        ['size', size, size ? t.guide('size', size) : null], ['angle', angle, angle ? t.guide('angle', angle) : null],
        ['move', move?.id, move ? (still ? t.guide('still', move.id) : t.byId[move.id]) : null], ['focus', focus?.id, focus ? t.byId[focus.id] : null],
        ['depth', mode, mode ? t.guide('depth', mode) : null]];
      for (const [attribute, value, card] of picks)
        if (value && typeof card?.vertical === 'string') notes.push({ level: 'warn', where: id, what: `9:16 note, ${attribute} ${value}: ${card.vertical}` });
    }
  }
  const result = writeOutline(args.path, win, st, shots);
  return { ...result, findings: [...result.findings, ...notes] };
}

// Step 4: each shot's start image — and an end image when its frame plan is first_last — composed
// from its characters' sheet panels, its place and props (user directive 2026-10-31).
export const shotImageSchema = z.object({
  path: outlinePath,
  id: shotIdSchema,
  frame: z.enum(['start', 'end']).default('start').describe('start: the first image; end: the last image of a first_last shot'),
  prompt: nonEmpty.describe('What the frame shows, in English: who is where, doing what, facing which way, expression and light'),
  location: nonEmpty.optional().describe('SB_DOC.locations id of the place, for the start image; an earlier call\'s choice stays when omitted, and an end image keeps the start\'s place'),
  props: z.array(nonEmpty).optional().describe('SB_DOC.props ids seen in the frame; an earlier call\'s choice stays when omitted'),
  size: z.string().regex(/^\d{3,4}x\d{3,4}$/).optional().describe('Output WIDTHxHEIGHT; default 1536x1024 for a 16:9 board, 1024x1536 otherwise'),
  reserveUsd: z.number().finite().nonnegative().optional(),
}).strict();
type ImageRef = { id: string; path: string; role: string; use: string; purpose: string };
export interface ShotImageRequest {
  episode: string; assetId: string; requestId: string; tool?: string; operation: 'text' | 'edit';
  args: Record<string, unknown>; file: string; inputs: string[]; refs: ImageRef[]; location?: string; locationFrame?: Record<string, unknown>; props: string[]; prompt: string; warnings: Finding[];
}
type ShotFrame = { id: string; name: string; revision: number; manifest: string; manifestSha256: string; stateId: string; camera: { lensMm: number } & Record<string, unknown>;
  blocked: boolean; fingerprint: string; start: { path: string; sha256: string }; end: { path: string; sha256: string }; prompt: string; endPrompt: string; warnings: string[] };
const locationContract = () => loadFromHere(join(REFERENCES_DIR, 'location-assets.js')) as {
  shotFrame(win: Board, index: number, dir: string, o: { manifest: string; cast: string[]; size: unknown; angle: unknown; width: number; height: number }): ShotFrame;
};
// Image models that take several pictures in one request; astra-genai edits one picture, zimage none.
const IMAGE_INPUTS: Record<string, { tool?: string; max: number }> = {
  'gpt-image': { tool: 'gpt_image_img2img', max: 16 }, 'astra-genai-native': { tool: 'astra_genai_image_edit', max: 10 },
  'astra-genai': { tool: 'astra_genai_edit', max: 1 }, zimage: { max: 0 }, host: { max: Infinity },
};
// An MLX edit pack takes the source plus 9 references (Qwen-Image-2.1) or 3 (FLUX.2 klein, Mage-Flow Edit); others do not edit (image-models.ts).
const MLX_INPUTS: Partial<Record<string, number>> = { 'qwen-2.1': 10, 'flux-klein': 4, 'mage-edit': 4 };
const latin = (value: unknown) => typeof value === 'string' && value.trim() && !nonEnglishOutsideQuotes(value) ? value.trim() : '';
const identityCatalog = () => loadFromHere(join(PLUGIN_ROOT, 'skills', '_shared', 'character-identity.js')) as {
  panelPrompt(character: unknown, view: string): { text: string; skipped: string[] };
};
// Two people in one frame: their sheet heights, so the picture keeps the difference the panels cannot show.
function heightSentence(win: Board, ids: string[]): string {
  const heights = ids.map((id) => [id, ((castEntry(win, id)?.character as { physical?: { heightCm?: { status?: string; value?: unknown } } } | undefined)?.physical?.heightCm)] as const)
    .filter(([, field]) => field?.status === 'confirmed' && typeof field.value === 'number').map(([id, field]) => `${id} is ${field!.value} cm tall`);
  return heights.length > 1 ? `Keep their real heights: ${heights.join(' and ')}.` : '';
}
function castEntry(win: Board, id: string): Record<string, unknown> | undefined {
  const list = (win.SB_DOC as { characters?: unknown } | undefined)?.characters;
  const entries = Array.isArray(list) ? list : Object.entries(list ?? {}).map(([key, value]) => ({ ...(value as object), id: key }));
  return entries.find((entry) => (entry as { id?: unknown })?.id === id) as Record<string, unknown> | undefined;
}
/** The sheet panels assets/characters/<id>/panels.json names — face, headless front and back — in MSR order. */
function characterRefs(boardDir: string, win: Board, shotId: string, ids: string[], use: string, warnings: Finding[]): ImageRef[] {
  const views = ids.length === 1 ? ['face', 'front', 'back'].map((view) => [ids[0], view]) : ['face', 'front'].flatMap((view) => ids.map((id) => [id, view]));
  // The sheet the cast check verified (cast.json source) comes first; an older board finds assets/characters/<id> upward.
  const sources = new Map(readCast(boardDir).filter((entry) => typeof entry.source === 'string' && entry.source)
    .map((entry) => [entry.id, dirname(resolve(boardDir, entry.source as string))]));
  const folders = new Map(ids.map((id) => {
    const own = sources.get(id);
    if (own && existsSync(join(own, 'panels.json'))) return [id, own];
    for (let dir = boardDir; ; dir = dirname(dir)) {
      if (existsSync(join(dir, 'assets/characters', id, 'panels.json'))) return [id, join(dir, 'assets/characters', id)];
      if (dirname(dir) === dir) throw new Error(`character_sheet_missing: ${id} has no assets/characters/${id}/panels.json`);
    }
  }));
  return views.flatMap(([id, view]) => {
    const panels = (JSON.parse(readFileSync(join(folders.get(id)!, 'panels.json'), 'utf8')) as { panels?: Record<string, { file?: string }> }).panels ?? {};
    // The sheet panels are required references: a missing view stops the plan rather than dropping it.
    const file = panels[view]?.file;
    if (!file || !existsSync(join(folders.get(id)!, file))) throw new Error(`character_panel_missing: ${id} has no ${view} panel; generate it on the character sheet first`);
    const { text: detail, skipped } = identityCatalog().panelPrompt(castEntry(win, id)?.character, view);
    for (const field of skipped) warnings.push({ level: 'warn', where: shotId, what: `${id}'s ${field} is not English and stays out of the image prompt — write it in English on the character sheet` });
    const purpose = (view === 'face' ? `${id}'s face and hair` : `${id}'s body and outfit, ${view}`) + (detail ? `: ${detail}` : '');
    return [{ id: `${shotId}-${id}-${view}`, path: relative(boardDir, join(folders.get(id)!, file)), role: 'character', use, purpose }];
  });
}
type PropSnap = { propId: string; description: string; references: Array<{ path?: string }>; endReferences: Array<{ path?: string }>;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; visible: boolean; position: string | null; errors: string[] };
const propContinuity = () => loadFromHere(join(REFERENCES_DIR, 'prop-continuity.js')) as {
  snapshot(win: Board, index: number, ids: string[], opts: { lenient: true }): PropSnap[];
};
/**
 * The props a frame shows, through the shared prop ledger: each visible prop's reference drawn in its condition at the
 * opening (start image) or closing (end image) story point, and its description and that state on its Image line.
 * Ledger errors are reported, never refused: a prop with errors in its own entry, history or usage here goes in without a state.
 */
function propRefs(win: Board, index: number, shotId: string, ids: string[], frame: 'start' | 'end', warnings: Finding[]): { refs: ImageRef[]; unseen: string[] } {
  const warn = (what: string) => warnings.push({ level: 'warn', where: shotId, what });
  const entries = new Map(ids.map((id) => [id, docEntry(win, 'props', id)]));
  const refs: ImageRef[] = [], unseen: string[] = [];
  for (const snap of ids.length ? propContinuity().snapshot(win, index, ids, { lenient: true }) : []) {
    const id = snap.propId, entry = entries.get(id)!;
    if (!snap.visible) continue;   // the author hid it in this shot (propUsage visible:false)
    if (snap.errors.length)
      warn(`the prop ledger has errors for the ${id} prop (${snap.errors.join('; ')}), so it goes in without a story state — fix them with storyboard_apply propSheet`);
    const state = frame === 'end' ? snap.after : snap.before, matched = frame === 'end' ? snap.endReferences : snap.references;
    const all = (Array.isArray(entry.references) ? entry.references : []) as Array<{ path?: unknown; version?: unknown; condition?: unknown }>;
    const condition = typeof state?.condition === 'string' && state.condition !== 'unknown' ? state.condition : '';
    // No reference drawn in this condition: the plain imageUrl, else the current version's reference, stands in.
    const imageUrl = typeof entry.imageUrl === 'string' && entry.imageUrl ? entry.imageUrl : undefined;
    const spare = all.find((ref) => typeof ref?.path === 'string' && ref.version === entry.appearanceVersion) ?? all.find((ref) => typeof ref?.path === 'string');
    const file = typeof matched[0]?.path === 'string' ? matched[0].path : imageUrl ?? (spare?.path as string | undefined);
    if (file && !matched.length && condition && all.length)
      warn(`no ${id} reference is drawn as ${condition}, so ${file === imageUrl ? 'its imageUrl' : `its ${typeof spare?.condition === 'string' ? spare.condition + ' ' : ''}reference`} stands in — add one for that condition`);
    const skipped: string[] = [];
    const english = (field: string, value: unknown) => {
      if (typeof value !== 'string' || !value.trim() || value === 'unknown') return '';
      const kept = latin(value); if (!kept) skipped.push(field); return kept;
    };
    const holderId = english('holder', state?.holderId);
    const holder = holderId ? `held by ${holderId}` : state?.holderId === null ? 'not held' : '';
    const place = english('location', state?.location), cond = english('condition', state?.condition), pos = english('position', snap.position);
    const detail = [english('description', snap.description), holder, place && `at ${place}`, cond && `condition ${cond}`, pos && `screen position ${pos}`].filter(Boolean).join('; ');
    if (skipped.length) warn(`the ${id} prop's ${skipped.join(', ')} is not English and stays out of the image prompt — write it in English on the prop sheet`);
    const purpose = `the ${id} prop` + (detail ? `: ${detail}` : '');
    if (file) refs.push({ id: `${shotId}-prop-${id}`, path: file, role: 'prop', use: 'image', purpose });
    else {
      warn(`the ${id} prop has no picture (references or imageUrl), so the model draws it from the prompt alone — add its image to the prop sheet`);
      unseen.push(`Also show ${purpose}.`);
    }
  }
  return { refs, unseen };
}
function docEntry(win: Board, kind: 'locations' | 'props', id: string): Record<string, unknown> {
  const list = (win.SB_DOC as Record<string, unknown> | undefined)?.[kind];
  const entry = (Array.isArray(list) ? list : []).find((item) => (item as { id?: unknown })?.id === id);
  if (!entry) throw new Error(`${kind === 'locations' ? 'location' : 'prop'}_unknown: ${id} is not in SB_DOC.${kind}`);
  return entry as Record<string, unknown>;
}

/** Plan inputs for shot_image: the ordered pictures, the assembled prompt and the adapter arguments. */
export function shotImageRequest(args: z.infer<typeof shotImageSchema>): ShotImageRequest {
  const { win } = readOutline(args.path);
  const shots = win.SCENES ?? [];
  const shot = shots[shotIndex(shots, args.id, 'shot_image')];
  const plan = (shot.shot ?? {}) as Record<string, unknown>, visual = (shot.visual ?? {}) as Record<string, unknown>;
  const frames = (visual.frames ?? {}) as { mode?: string; start?: string; endProps?: unknown };
  if (args.frame === 'start') {
    const gaps = contract().iconGaps(win);
    if (gaps.length) throw new Error('story_order: set every shot\'s icon attributes with shot_icons first — ' + gaps.join('; '));
  } else if (frames.mode !== 'first_last') throw new Error(`story_order: ${args.id} plans ${frames.mode ?? 'no'} frames; an end image belongs to a first_last shot (shot_icons frames)`);
  else if (!frames.start) throw new Error(`story_order: make ${args.id}'s start image before its end image`);
  else if (args.location) throw new Error(`shot_image: ${args.id}'s end image is edited from its start image and keeps its place — remake the start image to change the location`);
  const route = (plan.render as { mode?: string } | undefined)?.mode;
  if (route !== 'still_camera' && route !== 'generated_video')
    throw new Error(`shot_image: ${args.id} is a ${route ?? 'unrouted'} cut; only still_camera and generated_video cuts take a start image`);
  const boardDir = dirname(scenesPath(args.path)), episode = dirname(boardDir);
  const location = args.location ?? (typeof visual.locationId === 'string' ? visual.locationId : undefined);
  // An end image keeps its own props (frames.endProps) — a prop handed over can appear only at the end.
  const recorded = args.frame === 'end' && Array.isArray(frames.endProps) ? frames.endProps : visual.props;
  const props = args.props ?? (Array.isArray(recorded) ? recorded.filter((id): id is string => typeof id === 'string') : []);
  const cast = contract().castOf(shot) ?? [];
  const [width, height] = (args.size ?? (/16x9/.test(String(win.FORMAT ?? '')) ? '1536x1024' : '1024x1536')).split('x').map(Number);
  const entry = location ? docEntry(win, 'locations', location) : undefined, place = entry?.imageUrl;
  const warnings: Finding[] = [];
  // A sheet with a built set (SB_DOC.locations[].manifest) is rendered from this shot's own camera — its size and
  // angle, aimed at its blocked cast — and that render is the picture's composition; the sheet image only gives the look.
  const set = typeof entry?.manifest === 'string' ? locationContract().shotFrame(win, shots.indexOf(shot), boardDir,
    { manifest: entry.manifest, cast, size: plan.size, angle: plan.angle, width, height }) : null;
  if (set) warnings.push(...set.warnings.map((what) => ({ level: 'warn' as const, where: args.id, what })));
  else if (location && args.frame === 'start')
    warnings.push({ level: 'warn', where: args.id, what: `the ${location} sheet names no built set, so Image 1 is its picture at whatever angle that was made, not this shot's camera — build the set (location_manage build) and write its manifest on the sheet for a camera-matched start image` });
  // The renderer has no roll, so a dutch shot's render is level and the prompt alone tilts it.
  const lens = set ? `${set.camera.lensMm} mm lens` : '', dutch = plan.angle === 'dutch';
  const composition: ImageRef[] = set ? [{ id: `${args.id}-set`, path: set[args.frame].path, role: 'composition', use: 'image',
    purpose: args.frame === 'end' ? `the ${set.name} set from the same camera at the end of the shot, where every object${set.blocked ? ' and figure' : ''} stands when it ends`
      : `the ${set.name} set seen from this shot's camera (${lens}): its viewpoint, framing${dutch ? '' : ' and horizon'}, the architecture and where every object${set.blocked ? ' and coloured figure' : ''} stands; its plain unpainted surfaces are placeholders` }] : [];
  const propPictures = propRefs(win, shots.indexOf(shot), args.id, props, args.frame, warnings);
  const refs: ImageRef[] = [
    ...composition,
    ...characterRefs(boardDir, win, args.id, cast, frames.mode === 'reference' ? 'both' : 'image', warnings),
    ...propPictures.refs,
    // MSR takes the start image in its background slot, so the place only conditions the picture.
    ...(typeof place === 'string' ? [{ id: `${args.id}-place`, path: place, role: 'background', use: 'image',
      purpose: set ? `how the ${location} location looks — materials, colours and light only, not its viewpoint or layout` : `the ${location} location` }] : []),
  ];
  // The edit starts from the set render, else the place (or, for an end image, the start image); the rest are references.
  // Beside a set render the place picture comes last and stays out when the saved model has no room for it.
  const look = refs.filter((ref) => ref.role === 'background'), others = refs.filter((ref) => ref.role !== 'background' && ref.role !== 'composition');
  const head = args.frame === 'end' ? [{ path: frames.start!, purpose: 'the opening picture of this shot' }, ...composition] : set ? composition : look;
  let ordered = [...head, ...others, ...(set && args.frame === 'start' ? look : [])];
  if (set && look.length && ordered.length > imageInputLimit(episode, args.id)) {
    ordered = ordered.filter((ref) => !look.includes(ref as ImageRef));
    warnings.push({ level: 'warn', where: args.id, what: `the saved image model has no room for the ${location} sheet picture beside the set render, so the look comes from the style and prompt alone` });
  }
  const inputs = ordered.map((ref) => resolve(boardDir, ref.path));
  for (const file of inputs) if (!existsSync(file)) throw new Error(`image_input_missing: ${file}`);
  const assemble = (loadFromHere(join(REFERENCES_DIR, 'assemble-bg-prompt.js')) as { assemble(opts: Record<string, unknown>): { prompt: string } }).assemble;
  const style = (loadFromHere(join(REFERENCES_DIR, 'production-mode.js')) as { shotStyle(win: Board, index: number): { preset?: string } }).shotStyle(win, shots.indexOf(shot));
  const body = assemble({ ...(args.frame === 'start' ? { size: plan.size, depth: plan.depth, techniques: plan.techniques } : {}), angle: plan.angle,
    style: style.preset ? style : null, scene: args.prompt, noPerson: !cast.length,
    ...(set ? { location: { prompt: args.frame === 'end' ? set.endPrompt : set.prompt, paths: [] } } : {}) }).prompt;
  const roles = ordered.map((ref, i) => `Image ${i + 1} shows ${ref.purpose}.`).join(' ');
  const at = (ref: unknown) => ordered.indexOf(ref as ImageRef) + 1;
  const lock = !set ? '' : args.frame === 'end'
    ? `Move the figures and objects to where Image ${at(composition[0])} shows them and keep Image 1's camera, look and every identity.`
    : `Keep Image 1's camera position, ${lens}${dutch ? '' : ', horizon'} and framing, and keep every object${set.blocked ? ' and figure' : ''} where it stands in Image 1; paint its plain unpainted surfaces as the real place, and continue the place into any flat dark area past the set's edge.`
      + (dutch ? ' Image 1 is level; tilt the whole picture to the dutch angle described below.' : '')
      + (look.some((ref) => ordered.includes(ref)) ? ` Take only materials, colours and light from Image ${at(look[0])}.` : '');
  const prompt = [ordered.length ? 'Compose one picture from these images.' : '', roles, lock, heightSentence(win, cast),
    args.frame === 'end' ? 'This is the last frame of the shot that opens on Image 1: keep its place, light and every identity, and change only what the action changed.' : '',
    ...propPictures.unseen, body.charAt(0).toUpperCase() + body.slice(1)].filter(Boolean).join(' ');

  const call = imageCall({ directory: episode, assetId: args.id, inputs, prompt, width, height, outDir: join(boardDir, 'images'), stem: `${args.id}-${args.frame}`, what: 'this frame' });
  const sent = refs.filter((ref) => ordered.includes(ref));
  const locationFrame = set && args.frame === 'start' ? { set: set.id, revision: set.revision, manifest: set.manifest, manifestSha256: set.manifestSha256, stateId: set.stateId,
    camera: set.camera, blocked: set.blocked, fingerprint: set.fingerprint, start: set.start, end: set.end } : undefined;
  return { episode, assetId: args.id, ...call, refs: sent, ...(location ? { location } : {}), ...(locationFrame ? { locationFrame } : {}), props, prompt, warnings };
}

/**
 * The adapter call for one generated picture with the saved image model: the next free versioned
 * file <outDir>/<stem>-vN.png and the engine's own argument shape, editing from the inputs in order.
 */
// Adapters whose request carries a negative prompt; the others ignore it and the caller says so.
const NEGATIVE_PROMPT_ENGINES = new Set(['astra-genai-native']);
function imageAdapter(selection: { engine: string; model?: string }) {
  return selection.engine === 'mlx' ? { tool: 'mlx_image_edit', max: MLX_INPUTS[mlxImageFamily(selection.model ?? '')] ?? 0 } : IMAGE_INPUTS[selection.engine] ?? { max: 0 };
}
/** How many pictures the saved image model takes in one request. */
export function imageInputLimit(directory: string, assetId: string): number {
  return imageAdapter(imageContext(directory, assetId).selection).max;
}
export function imageCall(o: { directory: string; assetId: string; inputs: string[]; prompt: string; negativePrompt?: string; width: number; height: number; outDir: string; stem: string; what: string }) {
  const { directory, inputs, prompt, width, height } = o;
  const { selection } = imageContext(directory, o.assetId);
  const adapter = imageAdapter(selection);
  if (inputs.length > adapter.max)
    throw new Error(`image_references_unsupported: the saved image model (${selection.engine}${selection.model ? ' ' + selection.model : ''}) takes ${adapter.max} picture(s); ${o.what} composes ${inputs.length}. Choose a model that takes that many with the user (gpt-image up to 16; astra-genai-native or an MLX Qwen-Image-2.1 pack up to 10; MLX FLUX.2 klein or Mage-Flow Edit up to 4).`);
  // GPT Image declares one MIME type for all its source pictures, so a mixed set goes up as PNG copies in <outDir>/inputs/.
  const mimes = selection.engine === 'gpt-image' ? inputs.map((f) => readImageMetadata(f).mimeType) : [];
  const toPng = (f: string) => {
    const out = join(o.outDir, 'inputs', createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16) + '.png');
    if (!existsSync(out)) {
      mkdirSync(dirname(out), { recursive: true });
      try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, out], { timeout: 60_000 }); }
      catch (error) { throw new Error(`image_inputs_mixed_format: GPT Image takes one format per request and ffmpeg could not convert ${f} to PNG (${(error as Error).message.split('\n')[0]}) — save it as PNG`); }
    }
    return out;
  };
  const sent = new Set(mimes).size > 1 ? inputs.map((f, i) => mimes[i] === 'image/png' ? f : toPng(f)) : inputs;
  const jobs = readImageState(directory)?.jobs ?? {};
  let k = 1;
  while (existsSync(join(o.outDir, `${o.stem}-v${k}.png`)) || Object.hasOwn(jobs, `${o.stem}-v${k}`)) k += 1;
  const requestId = `${o.stem}-v${k}`, file = join(o.outDir, `${requestId}.png`);
  mkdirSync(dirname(file), { recursive: true });
  const base64 = (f: string) => readFileSync(f).toString('base64');
  const edit = sent.length > 0, tool = edit ? adapter.tool : undefined;
  const output = { outputPath: dirname(file), filename: basename(file) };
  const args: Record<string, unknown> =
    selection.engine === 'host' ? { prompt, referenceImages: sent, savePath: file, size: `${width}x${height}` }
    : selection.engine === 'gpt-image' ? { prompt, savePath: file, size: `${width}x${height}`, ...(edit ? { sourceImagesBase64: sent.map(base64), sourceMimeType: readImageMetadata(sent[0]).mimeType || 'image/png' } : {}) }
    : selection.engine === 'astra-genai' ? { prompt, size: `${width}*${height}`, ...output, ...(edit ? { mode: 'img2img', imagePath: sent[0] } : {}) }
    : ['mlx', 'zimage'].includes(selection.engine) ? { prompt, width, height, ...output, ...(edit ? { imagePath: sent[0], refImagePaths: sent.slice(1) } : {}) }
    : { prompt, size: `${width}x${height}`, ...output, ...(edit ? { imagePath: sent[0], refImagePaths: sent.slice(1), mode: 'edit' } : {}) };
  const negativeSent = !!o.negativePrompt && NEGATIVE_PROMPT_ENGINES.has(selection.engine);
  // The gateway refuses a negative prompt at guidance 1 (no CFG). ponytail: one value measured on qwen-image-2.1-turbo
  // for the kardum front panel (2.5 kept the head, 4 removed it, about 290 s); make it per model when another one lands.
  if (negativeSent) Object.assign(args, { negativePrompt: o.negativePrompt, guidanceScale: 4 });
  return { requestId, ...(tool ? { tool } : {}), operation: (edit ? 'edit' : 'text') as 'edit' | 'text', args, file, inputs: sent, negativeSent };
}

/** Record a generated (or host-handed) frame on the board: frames.start/bg or frames.end, with its inputs. */
export function recordShotImage(args: z.infer<typeof shotImageSchema>, request: ShotImageRequest): ApplyResult {
  const { win, st } = readOutline(args.path);
  const shots = (win.SCENES ?? []).slice();
  const index = shotIndex(shots, args.id, 'shot_image');
  const visual = { ...(shots[index].visual ?? {}) } as Record<string, unknown>;
  const rel = relative(dirname(scenesPath(args.path)), request.file);
  const frames: Record<string, unknown> = { ...(visual.frames as object | undefined), [args.frame]: rel };
  const notes: Finding[] = [...request.warnings];
  if (args.frame === 'start') {
    Object.assign(visual, { bg: rel, bgPrompt: request.prompt, references: request.refs, props: request.props,
      ...(request.location ? { locationId: request.location } : {}) });
    // The set render the start image was composed from: its camera, inputs and fingerprint.
    if (request.locationFrame) visual.locationFrame = request.locationFrame; else delete visual.locationFrame;
    // An end image is edited from its start image, so a new start takes the old end off the shot; the file stays in images/.
    if (typeof frames.end === 'string') {
      notes.push({ level: 'warn', where: args.id, what: `the end image ${frames.end} was made from the previous start image and is off the shot — remake it with shot_image frame:"end"` });
      delete frames.end;
      delete frames.endProps;
      delete visual.endPrompt;
    }
  } else {
    visual.endPrompt = request.prompt;
    frames.endProps = request.props;
  }
  visual.frames = frames;
  shots[index] = { ...shots[index], visual } as Shot;
  const result = writeOutline(args.path, win, st, shots);
  return { ...result, findings: [...result.findings, ...notes] };
}

// Step 5: the video prompt, written from the shot's icon attributes, lines and the author's English action.
const MUSIC_WORD = /\b(music|soundtrack|score|bgm|melody|orchestral|song)\b/i;
export const shotPromptSchema = z.object({
  path: outlinePath,
  id: shotIdSchema,
  action: nonEmpty.describe('What happens in the shot, in English: the subjects\' movement from the opening picture'),
  end: nonEmpty.optional().describe('The closing picture, in English'),
  sound: nonEmpty.optional().describe('Ambient sound and effects, in English; the shot\'s lines come from shot_dialogue. "no music" is added unless it names music'),
}).strict();

export function writeShotPrompt(args: z.infer<typeof shotPromptSchema>): ApplyResult & { prompt: string } {
  const { win, st } = readOutline(args.path);
  const gaps = contract().imageGaps(win);
  if (gaps.length) throw new Error('story_order: make every shot\'s start image, and the end image a first_last plan needs, with shot_image first — ' + gaps.join('; '));
  const shots = (win.SCENES ?? []).slice();
  const index = shotIndex(shots, args.id, 'shot_prompt');
  const shot = shots[index], plan = (shot.shot ?? {}) as Record<string, unknown>, visual = (shot.visual ?? {}) as Record<string, unknown>;
  const mode = (plan.render as { mode?: string } | undefined)?.mode;
  if (mode !== 'generated_video') throw new Error(`shot_prompt: ${args.id} is a ${mode ?? 'unrouted'} cut; only a generated_video cut takes a video prompt`);
  const frames = (visual.frames ?? {}) as { mode?: string }, msr = frames.mode === 'reference';
  const words = loadFromHere(join(REFERENCES_DIR, 'assemble-bg-prompt.js')) as { SIZE_WORDS: Record<string, string>; ANGLE_WORDS: Record<string, string> };
  const travels = (loadFromHere(join(REFERENCES_DIR, 'production-mode.js')) as { travels(camera: unknown): boolean }).travels;
  const camera = (visual.camera ?? {}) as Record<string, unknown>;
  const movement = String(camera.movement ?? '').trim(), speed = String(camera.speed ?? '').trim();
  type Picked = { id: string; from?: string; to?: string; entry?: { fields?: Record<string, string>; prompt?: string; label?: { en?: string } } };
  const picked = ((plan.techniques ?? []) as Picked[]).map((t) => ({ ...t, entry: techniqueContract().byId[t.id] as Picked['entry'] }));
  // The move technique that matches visual.camera.movement; a movement rewritten by hand falls back to its own words.
  const moveEntry = picked.find((t) => t.entry?.fields?.movement && movement.toLowerCase().startsWith(t.entry.fields.movement))?.entry;
  const rack = picked.find((t) => t.entry?.fields?.focus);
  // A sentence closing on its own quoted line ("Wait.") takes no second period.
  const sentence = (value: string) => {
    const text = value.trim(), capped = text.charAt(0).toUpperCase() + text.slice(1);
    return !text ? '' : /[.!?]["'”’)]+$/.test(capped) ? capped : capped.replace(/[.!?]*$/, '') + '.';
  };
  // The move in the words the video model was shown (film-techniques.js prompt: pushes in, pulls back, pans, tilts
  // upward, static frame), its pace and what it is aimed at; the closing composition the camera pass wrote follows
  // as its own sentence, since it may be a phrase or a whole sentence.
  const target = String(camera.target ?? '').trim(), settle = String(camera.end ?? '').trim();
  for (const [name, value] of [['action', args.action], ['end', args.end], ['sound', args.sound], ['visual.camera.target', target],
    ['visual.camera.end', settle], ['focus.from', rack?.from], ['focus.to', rack?.to]] as Array<[string, string | undefined]>) {
    const foreign = value ? nonEnglishOutsideQuotes(value) : '';
    if (foreign) throw new Error(`video_prompt_language: ${name} has "${foreign}" outside quotation marks; write it in English`);
  }
  const pace = ({ slow: 'slowly', steady: 'steadily', fast: 'quickly' } as Record<string, string>)[speed];
  const ends = travels(camera) ? ', with a short pause on the opening and closing pictures' : '';
  const cameraSentence = !movement ? '' : /^(static|fixed|locked)/i.test(movement) ? 'The camera holds a static frame.'
    : moveEntry?.prompt ? sentence(`The camera ${pace ? pace + ' ' : ''}${moveEntry.prompt.replace('{target}', target || 'the subject')}${speed && !pace ? ` at a ${speed} pace` : ''}${ends}`)
    : sentence(`Camera: ${[speed, movement].filter(Boolean).join(' ')}` + (target ? ` toward ${target}` : '') + ends);
  // MSR pins no frame, so its prompt carries the framing; video_plan adds MSR's lines with their image bindings.
  const prompt = [
    msr ? sentence([words.SIZE_WORDS[String(plan.size)], words.ANGLE_WORDS[String(plan.angle)]].filter(Boolean).join(', ')) : 'Start from the given first frame.',
    msr && plan.depth ? sentence(contract().depthText(plan.depth)) : '',
    cameraSentence,
    settle ? sentence(`Closing frame: ${settle}`) : '',
    !rack ? '' : sentence(rack.from && rack.to ? `Rack focus from ${rack.from} to ${rack.to}` : `${rack.entry?.label?.en ?? 'Rack focus'} from the near subject to the far subject`),
    sentence(args.action),
    ...(msr ? [] : (shot.narration ?? []).filter((line) => line.delivery === 'on_screen' && line.tts).map((line) =>
      sentence(`${latin(String(castEntry(win, String(line.speaker))?.name ?? '')) || line.speaker} says: "${line.tts}"`))),
    frames.mode === 'first_last' ? sentence(`End on the given last frame${args.end ? ': ' + args.end : ''}`) : args.end ? sentence(`End on ${args.end}`) : '',
    // The builder lays the episode bed under every cut; a clip that makes its own music doubles it.
    sentence(`Audio: ${args.sound ? args.sound + (MUSIC_WORD.test(args.sound) ? '' : ', no music') : 'no music'}`),
  ].filter(Boolean).join(' ');
  const foreign = nonEnglishOutsideQuotes(prompt);
  if (foreign) throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks; write action, end and sound in English`);
  shots[index] = { ...shot, visual: { ...visual, video: { ...(visual.video as object | undefined), prompt, promptBasis: contract().promptBasis(shot, isFocus) } } } as Shot;
  const result = writeOutline(args.path, win, st, shots);
  return { ...result, findings: rack && !(rack.from && rack.to) ? [...result.findings, { level: 'warn' as const, where: args.id,
    what: 'the rack focus names no subjects — give focus.from and focus.to in shot_icons' }] : result.findings, prompt };
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
  const seen = new Set<string>();
  const structure = contract().guidedCheck(win, { draft: args.draft }).concat(validateShots(win.SCENES ?? [])).filter(f => {
    const key = f.level + '\0' + f.where + '\0' + f.what;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const argv = [CHECK_SCENES_FILE, file, '--json'];
  if (args.draft) argv.push('--draft');
  let raw = '';
  try {
    raw = execFileSync(process.execPath, argv, { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
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
  if (r.approvalDropped && r.written) lines.push('  the stale `// approved:` line was dropped; existing task authorization is unchanged');
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
