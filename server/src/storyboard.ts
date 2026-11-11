import { readShotVideoTiming } from './video-routing.js';
import { manageProject } from './project.js';
import { readImageMetadata, verifyImageFile } from './image-media.js';
import { gptImageContract, mlxImageFamily } from './image-models.js';
import { workflowEpisode } from './production-workflow.js';
import { imageContext } from './image-routing.js';
import { readImageState } from './image-state.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import { speakerBindingSchema } from './video-voice.js';
import { compileVideoPrompt } from './video-prompt.js';
import { characterPanels } from './video-image-inputs.js';
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

import { createHash, randomUUID } from 'node:crypto';
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

// Capture once at module load: replacing files does not upgrade an existing MCP process.
const runtimeFile = fileURLToPath(import.meta.url);
const runtimeModuleSha256 = createHash('sha256').update(readFileSync(runtimeFile)).digest('hex');
const runtimeLoadedAt = new Date().toISOString();

export interface Finding {
  level: 'bad' | 'warn' | 'later';
  code?: string;
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
    summary: z.string().optional().describe("The scene's story in one sentence; the storyboard scene header shows it"),
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

/** Editorial evidence, not a cut classifier. Keep every playback join for the author's judgment. */
function boundaryReview(win: Board, playback: Array<{ no: number }>, videoTiming: unknown) {
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
  const source = win.SCENES || [];
  const ids = source.map(shot => shot.id);
  const timings = Array.isArray(videoTiming) ? videoTiming : [];
  const acting = loadFromHere(join(PLUGIN_ROOT, 'skills', '_shared', 'scene-acting.js')) as {
    planScenePerformance(shot: Shot, duration: (line: { estimatedSeconds?: number }) => number | null): {
      performance: Array<Record<string, unknown>>; durationSeconds: number | null; warnings: string[];
    };
  };
  const shots = playback.map(({ no }, index) => {
    const shot = source[no - 1];
    const visual = record(shot.visual), plan = record(shot.shot), camera = record(visual.camera);
    const edit = record(shot.edit), design = record(plan.videoDesign);
    const id = text(shot.id), uniqueId = id !== null && ids.filter(value => value === id).length === 1;
    const cast = contract().castOf(shot);
    let performanceTiming: Record<string, unknown>;
    try {
      const legacyAction = text(visual.action) ?? text(design.action);
      const explicit = Array.isArray(shot.performance) && shot.performance.length > 0;
      const clock = !explicit && (legacyAction || !shot.narration?.length)
        ? { performance: [
          ...(legacyAction ? [{ kind: 'action', text: legacyAction, order: 'unresolved' }] : []),
          ...(shot.narration ?? []).map(line => ({ kind: line.delivery === 'voiceover' ? 'narration' : 'dialogue', lineId: line.id, speaker: line.speaker, text: line.tts, delivery: line.delivery, acting: line.acting, order: 'unresolved' })),
        ], durationSeconds: null, warnings: ['No ordered performance: action order and timing remain unresolved.'], timing: 'unknown' }
        : acting.planScenePerformance(shot, line => typeof line.estimatedSeconds === 'number' ? line.estimatedSeconds : null);
      performanceTiming = { ...clock, basis: 'authored_estimates', physicalFeasibility: 'not_reviewed',
        timing: clock.durationSeconds === null ? 'unknown' : 'estimated',
        differsFromStored: typeof shot.duration === 'number' && clock.durationSeconds !== null
          ? Math.abs(shot.duration - clock.durationSeconds) > 0.05 : null };
    } catch (error) {
      performanceTiming = { status: 'unresolved', reason: (error as Error).message, physicalFeasibility: 'not_reviewed' };
    }
    return {
      no, id, playbackPosition: index + 1, identity: uniqueId ? 'stable' : 'missing_or_duplicate',
      scene: typeof shot.scene === 'number' ? shot.scene : null, type: shot.type,
      summary: text(shot.summary), principals: cast ?? null,
      location: text(visual.locationId), camera, size: plan.size ?? null, angle: plan.angle ?? null,
      depth: plan.depth ?? null, eyeline: plan.eyeline ?? null, composition: plan.composition ?? null,
      opening: design.before ?? null, action: visual.action ?? design.action ?? null,
      ending: camera.end ?? design.after ?? null,
      // Preserve line ids, delivery, acting and performance group references, including silent actions.
      narration: shot.narration ?? null, performance: shot.performance ?? null,
      performanceTiming,
      estimatedSeconds: typeof shot.duration === 'number' && Number.isFinite(shot.duration) && shot.duration > 0 ? shot.duration : null,
      timing: uniqueId ? timings.find(row => record(row).shotId === id) ?? null : null,
      storedIncoming: { transition: shot.transition ?? null, reason: text(edit.reason), continuity: text(edit.continuity) },
    };
  });
  // Runs follow playback, including intercuts. Unknown scene ids never imply continuity.
  const sceneRuns: Array<{ scene: number | null; shotIds: Array<string | null>; events: Array<Record<string, unknown>> }> = [];
  for (const shot of shots) {
    let run = sceneRuns.at(-1);
    if (!run || shot.scene === null || run.scene !== shot.scene) {
      run = { scene: shot.scene, shotIds: [], events: [] }; sceneRuns.push(run);
    }
    run.shotIds.push(shot.id);
    const events = shot.performanceTiming.performance;
    if (Array.isArray(events)) run.events.push(...events.map(event => ({ ...record(event), shotId: shot.id })));
    else run.events.push({ shotId: shot.id, status: 'unresolved', reason: shot.performanceTiming.reason });
  }
  const reasons = shots.map(shot => shot.storedIncoming.reason).filter(reason => reason !== null);
  const boundaries = shots.slice(1).map((right, index) => {
    const left = shots[index];
    const spliced = [left, right].some(shot => shot.type === 'broll' || shot.type === 'outro');
    const sameScene = left.scene !== null && right.scene !== null ? left.scene === right.scene : null;
    const sameLocation = left.location !== null && right.location !== null ? left.location === right.location : null;
    const knownCast = left.principals !== null && right.principals !== null;
    const samePrincipals = knownCast ? left.principals!.length === right.principals!.length &&
      left.principals!.every(id => right.principals!.includes(id)) : null;
    const spoken = (lines: unknown) => (Array.isArray(lines) ? lines : []).map(record).filter(line => text(line.tts));
    const last = spoken(left.narration).at(-1), first = spoken(right.narration)[0];
    const lastSpeaker = text(last?.speaker), firstSpeaker = text(first?.speaker);
    const continuingSpeaker = lastSpeaker !== null && firstSpeaker !== null ? lastSpeaker === firstSpeaker : null;
    const signals: string[] = [];
    if (sameScene === true && !spliced) {
      if (continuingSpeaker === true) signals.push('continuing_speaker');
      if (samePrincipals === true && left.principals!.length > 0) signals.push('same_principals');
      const silentAction = (shot: typeof left) => Array.isArray(shot.narration) && shot.narration.length === 0 &&
        (shot.action !== null || (Array.isArray(shot.performance) && shot.performance.some(beat => record(beat).kind === 'action')));
      if (silentAction(left) && silentAction(right)) signals.push('consecutive_silent_actions');
    }
    const reason = right.storedIncoming.reason;
    if (!spliced && reason && reasons.filter(value => value === reason).length >= 3) signals.push('repeated_reason');
    return {
      from: { id: left.id, no: left.no }, to: { id: right.id, no: right.no },
      sameScene, sameLocation, samePrincipals, continuingSpeaker, signals,
      // Inserted footage has its own edit scheduling. A raw-array join is not proof of its playback join.
      incoming: spliced ? null : right.storedIncoming,
      joinEvidence: spliced ? 'inspect_splice_edit' : 'authored_not_verified',
      question: sameScene === false ? 'What time, place or event change motivates this boundary?' :
        'What would a continuous held or motivated moving frame lose here? Preserve an earned reveal, reaction or viewpoint.',
      decision: 'needs_editorial_review',
    };
  });
  return { version: 'shot-boundaries-v1', status: 'not_reviewed', sceneRuns, shots, boundaries,
    note: 'Signals are review prompts, never merge instructions or quality failures. Compare the complete scene, including offscreen action. Recompute a proposed continuous performance and its selected video route before claiming it fits; separate-shot timing is not merged capacity. No files or approvals are changed.' };
}

/** Read plans and recorded evidence without claiming to have inspected media or validated reviews. */
export function readStoryboard(args: z.infer<typeof storyboardReadSchema>): Record<string, unknown> {
  const { win, file, sha256 } = readBoard(args.path);
  const result = contract().outline(win, args.level);
  result.file = file;
  result.mediaBaseDirectory = dirname(file);
  result.sha256 = sha256;
  result.runtime = {
    contract: 'storyboard-integrity-v1', modulePath: runtimeFile,
    loadedAt: runtimeLoadedAt, loadedModuleSha256: runtimeModuleSha256,
    diskModuleSha256: createHash('sha256').update(readFileSync(runtimeFile)).digest('hex'),
    features: ['boundaryReview', 'videoTiming', 'imageFraming', 'editImpact'],
    referenceModules: 'not_verified; module hashes exclude runtime-loaded skills and their require cache',
    note: 'Loaded-module identity, not an install/update action. Compare with the intended build; reconnect after updating.',
  };
  result.readiness = boardReadiness(win, dirname(file));
  result.videoTiming = (win.SCENES || []).filter(shot => shot.shot?.render?.mode === 'generated_video').map(shot => {
    if (shot.visual?.reuse) return { shotId: shot.id, status: 'reused', note: 'Inspect the existing clip; no new generation limit applies.' };
    try {
      if (basename(file) !== 'scenes.js' || basename(dirname(file)) !== 'storyboard') throw new Error('Timing needs the episode storyboard/scenes.js');
      return readShotVideoTiming(dirname(dirname(file)), String(shot.id));
    } catch (error) {
      return { shotId: shot.id, status: 'not_verified', reason: (error as Error).message };
    }
  });
  result.boundaryReview = boundaryReview(win, result.playback as Array<{ no: number }>, result.videoTiming);
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
  result.imageFraming = (win.SCENES || []).filter(shot => (shot.visual as { frames?: { start?: string } } | undefined)?.frames?.start)
    .map(shot => imageFramingStatus(shot, win.FORMAT, dirname(file)));
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

const transitionFields = {
  transition: z.enum(['cut', 'dip', 'dip:white', 'jcut', 'dissolve', 'iris', 'blur', 'zoom',
    'push:l2r', 'push:r2l', 'push:u2d', 'push:d2u', 'whip:l2r', 'whip:r2l', 'whip:u2d', 'whip:d2u']),
  transitionSeconds: z.number().finite().min(.08).max(.8).optional(),
  reason: nonEmpty,
  continuity: nonEmpty.optional(),
};
type TransitionChange = { transition: string; transitionSeconds?: number; reason: string; continuity?: string };
const STILL_JOINS = ['cut', 'dip', 'dip:white'];
const secondsOnMovingJoins = [(v: TransitionChange) => !STILL_JOINS.includes(v.transition) || v.transitionSeconds === undefined,
  'cut and dip do not accept transitionSeconds; dip fades each side for up to 0.30 seconds'] as const;
export const transitionPatchSchema = z.object({
  no: z.number().int().positive().describe('Incoming shot number, 1-based, after removals and inserts'),
  ...transitionFields,
}).strict().refine(...secondsOnMovingJoins);
// shot_icons sets the join out of a shot; it is stored on the next shot's transition, which the builder reads.
const nextTransitionSchema = z.object(transitionFields).strict().refine(...secondsOnMovingJoins);

// Writes the join in front of shots[at] (storyboard_apply transitions, shot_icons next).
function applyTransition(shots: Shot[], at: number, change: TransitionChange): void {
  const source = shots[at];
  if (['broll', 'outro'].includes(source.type)) throw new Error('Spliced shots use their own assembly transition');
  const moving = !STILL_JOINS.includes(change.transition);
  if (moving && !shots.slice(0, at).some(s => !['broll', 'outro'].includes(s.type)))
    throw new Error('First shot cannot carry a previous picture');
  if (moving) {
    const previous = shots[at - 1];
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
  shots[at] = { ...source, transition: change.transition, edit };
}

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
    applyTransition(shots, change.no - 1, change);
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
  // A shot's transition is the join from the shot before it. When an insert, remove or move gives
  // it a different predecessor, the stored join describes a cut that no longer exists: clear it.
  const joinNotes: Finding[] = [];
  const previousOf = (list: Shot[]) => new Map(list.map((shot, i) => [shot.id, i ? list[i - 1].id : undefined]));
  const before = previousOf(originalShots), after = previousOf(shots);
  const priorById = new Map(originalShots.map((shot) => [shot.id, shot]));
  shots = shots.map((shot, i) => {
    const prior = priorById.get(shot.id);
    if (!prior || !shot.transition || transitionTargets.has(i + 1) || shot.transition !== prior.transition
      || before.get(shot.id) === after.get(shot.id)) return shot;
    const { transition, edit: oldEdit, ...rest } = shot;
    const { reason: _reason, continuity: _continuity, transitionSeconds: _seconds, ...edit } = (oldEdit as Record<string, unknown> | undefined) ?? {};
    joinNotes.push({ level: 'warn', where: String(shot.id), what: `the shot before it changed, so its join (${transition}) was cleared — set it again with shot_icons next on the shot that now precedes it` });
    return (Object.keys(edit).length ? { ...rest, edit } : rest) as Shot;
  });
  next.SCENES = shots.map((shot) => shot.shot?.motionGraphic && (shot.shot.motionGraphic.style.theme || (next.THEME as Record<string, unknown> | undefined)?.motionGraphicTheme) ? motionThemeContract().applyTheme({ ...shot }, (next.THEME as Record<string, unknown> | undefined)?.motionGraphicTheme) : { ...shot });  // sync() writes sceneSlug/sequence — never into the caller's objects

  // A prompt rewritten through storyboard_apply no longer comes from its shot_prompt basis (structure-contract.js promptDrift).
  if (!opts.outline) {
    const earlier = new Map(originalShots.map((shot) => [shot.id, shot]));
    next.SCENES = next.SCENES.map((shot) => {
      const video = (shot.visual as { video?: Record<string, unknown> } | undefined)?.video;
      const old = (earlier.get(shot.id)?.visual as { video?: Record<string, unknown> } | undefined)?.video;
      if (!video?.promptBasis || video.prompt === old?.prompt) return shot;
      const { promptBasis: _basis, promptSource: _source, ...rest } = video;
      return { ...shot, visual: { ...shot.visual, video: rest } } as Shot;
    });
  }
  const findings: Finding[] = [...joinNotes, ...editImpact(win, next)];
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

/** Report factual edit effects without guessing intent, deleting assets or blocking creative edits. */
function editImpact(before: Board, after: Board): Finding[] {
  const findings: Finding[] = [];
  const oldShots = before.SCENES ?? [], newShots = after.SCENES ?? [];
  const warn = (code: string, where: string, what: string) => findings.push({ level: 'warn', code, where, what: `${code}: ${what}` });
  const lines = (board: Board) => {
    const shots = board.SCENES ?? [];
    const playback = contract().outline(board, 'shots').playback as Array<{ no: number }>;
    return playback.flatMap(({ no }) => {
      const shot = shots[no - 1], narration = shot.narration ?? [];
      const events = Array.isArray(shot.performance) ? shot.performance.filter(event => event.kind === 'dialogue' || event.kind === 'narration') : [];
      const groups = Array.isArray(shot.performance) ? events.map(event => event.group) : narration.map((_, i) => i + 1);
      const missing = narration.map((_, i) => i + 1).filter(group => !groups.includes(group));
      if (missing.length || groups.some(group => !Number.isInteger(group) || !narration[group - 1]))
        warn('edit_speech_order_unresolved', String(shot.id), 'performance does not resolve every speech group; inspect the ordered lines before changing boundaries.');
      return [...groups, ...missing].map(group => {
        const line = narration[group - 1];
        return line ? { id: line.id, tts: line.tts, speaker: line.speaker, delivery: line.delivery, acting: line.acting }
          : { unresolvedGroup: group };
      });
    });
  };
  const oldLines = lines(before), newLines = lines(after);
  if (oldShots.length && JSON.stringify(oldLines) !== JSON.stringify(newLines)) {
    const missing = oldLines.filter(line => line.id && !newLines.some(next => next.id === line.id)).map(line => line.id);
    warn('edit_speech_changed', 'board', `ordered speech/acting changed${missing.length ? `; removed line ids: ${missing.join(', ')}` : ''}. Check intended wording, order, speakers, delivery and acting; moving intact lines between shots does not trigger this note.`);
  }
  for (const old of oldShots) {
    const current = newShots.find(shot => shot.id === old.id);
    if (!current) {
      const design = old.shot?.videoDesign as { action?: unknown; before?: unknown; after?: unknown } | undefined;
      if (Array.isArray(old.performance) && old.performance.some(event => event.kind === 'action')
        || old.visual?.action || old.visual?.camera || design?.action || design?.before || design?.after)
        warn('edit_action_removed', String(old.id), 'shot removed with performance/visual.action/videoDesign evidence; verify its required actions and physical states survive elsewhere or were deliberately omitted.');
      continue;
    }
    const changed = startImageBasis(old, before.FORMAT) !== startImageBasis(current, after.FORMAT)
      || old.visual?.bgPrompt !== current.visual?.bgPrompt;
    if (changed) {
      warn('edit_staging_changed', String(current.id), 'staging/performance changed; reconcile performance, visual.action, camera endpoints, videoDesign and acting, then re-estimate duration and inspect both joins.');
      const oldVisual = old.visual as Record<string, unknown> | undefined;
      const visual = current.visual as Record<string, unknown> | undefined;
      const oldFrames = oldVisual?.frames as { start?: string } | undefined;
      const frames = visual?.frames as { start?: string } | undefined;
      if (frames?.start && frames.start === oldFrames?.start)
        warn('edit_image_inherited', String(current.id), `retained ${frames.start} after staging changed; inspect opening pose, hands, cast and props before reuse. No media was regenerated.`);
    }
  }
  const doc = after.SB_DOC as { propContinuity?: { events?: Array<{ id?: string; shotIds?: string[] }> } } | undefined;
  for (const event of doc?.propContinuity?.events ?? []) {
    const dangling = event.shotIds?.filter(id => !newShots.some(shot => shot.id === id)) ?? [];
    if (dangling.length) warn('edit_prop_reference', String(event.id ?? 'prop event'), `unresolved shot ids: ${dangling.join(', ')}; retarget the event to the shot that now depicts it.`);
  }
  return findings;
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
  // Keep the review's panel links and the executable MSR references on the same shared sheets.
  const panelIds = [...new Set((next.SCENES ?? []).flatMap(shot => contract().castOf(shot) ?? []))];
  if (panelIds.length && existsSync(join(dirname(file), 'cast.json'))) {
    const sheets = new Map<string, Record<string, string>>();
    for (const id of panelIds) {
      try { sheets.set(id, characterPanels().sheetPanels(dirname(file), [id]).get(id)!); }
      catch (error) { findings.push({ level: 'warn', where: id, what: String(error) }); }
    }
    const doc = (next.SB_DOC ?? {}) as Record<string, unknown>;
    const entries = Array.isArray(doc.characters) ? doc.characters as Array<Record<string, unknown>>
      : Object.entries(doc.characters ?? {}).map(([id, value]) => ({ ...(value as object), id })) as Array<Record<string, unknown>>;
    // The identity (name heading and character JSON) comes from the cast's identity.md, so shot_image and
    // shot_prompt read the sheet's height, appearance and name rather than an empty entry.
    const identities = new Map<string, Record<string, unknown>>();
    // An unreadable identity keeps the entry as it is; character_manage owns that file's shape.
    let cast: CastEntry[] = [];
    try { cast = readCast(dirname(file)); } catch { /* cast_unreadable is reported by the story tools */ }
    for (const { id, source } of cast) {
      if (!panelIds.includes(id) || typeof source !== 'string') continue;
      try {
        const text = readFileSync(resolve(dirname(file), source), 'utf8');
        const heading = /^#\s+(.+?)\s*$/m.exec(text)?.[1];
        identities.set(id, { ...(heading ? { name: heading } : {}), character: identityCatalog().identityCharacter(text, { ready: false }) });
      } catch { /* no JSON identity yet */ }
    }
    const withIdentity = (entry: Record<string, unknown>) => {
      const found = identities.get(String(entry.id));
      return found ? { ...entry, ...(entry.name ? {} : { name: found.name }), character: found.character } : entry;
    };
    next.SB_DOC = { ...doc, characters: [...entries.map(entry => withIdentity(sheets.has(String(entry.id))
      ? { ...entry, panels: { ...(entry.panels as object ?? {}), ...sheets.get(String(entry.id)) } } : entry)),
      ...panelIds.filter(id => sheets.has(id) && !entries.some(entry => entry.id === id)).map(id => withIdentity({ id, panels: sheets.get(id) }))] };
    for (const shot of next.SCENES ?? []) {
      const visual = shot.visual as Record<string, unknown> | undefined;
      if ((visual?.frames as { mode?: string } | undefined)?.mode !== 'reference'
        || !(contract().castOf(shot) ?? []).every(id => sheets.has(id))) continue;
      visual!.references = [...characterPanels().canonicalReferences(dirname(file), String(shot.id), contract().castOf(shot) ?? [], 'both'),
        ...(Array.isArray(visual!.references) ? visual!.references as Array<Record<string, unknown>> : []).filter(ref => ref.role !== 'character')];
    }
  }
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
    summary: nonEmpty.describe("The scene's story in one sentence"),
    turn: nonEmpty.optional(), out: nonEmpty.optional(),
    // The same signs structure-contract.js reads: the value at the open and at the close.
    charge: z.object({ open: z.enum(['+', '-']), close: z.enum(['+', '-', '++', '--']) }).strict().optional(),
  }).strict()).min(1),
}).strict();
export const storyShotSchema = z.object({
  path: outlinePath,
  shots: z.array(z.object({
    id: shotIdSchema.optional().describe('Revise this shot; without it a new shot is added at the end of its scene'),
    scene: z.number().int().positive().describe('The scene number — written first with story_scene'),
    summary: nonEmpty.describe('The story this shot tells, in one sentence'),
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
    if (new Set(lines.map((line) => line.speaker)).size > 1)
      throw new Error(`shot_speaker_limit: ${id} has more than one speaker; split at each speaker change, then set each shot's size and angle`);
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
export interface ShotView {
  subject: string; reason: string; crop: string; mode: string; subjectId?: string; viewerId?: string;
  subjectType?: 'person' | 'object' | 'detail';
  target?: { point: [number, number, number]; span: number };
}
export const shotViewContract = () => loadFromHere(join(REFERENCES_DIR, 'shot-view.js')) as {
  SCHEMA: Record<string, unknown>; validate(view: unknown): string[]; instructions(view: unknown): string;
};
const shotViewSchema = z.custom<ShotView>().superRefine((view, ctx) => {
  for (const message of shotViewContract().validate(view)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});
export const shotIconsSchema = z.object({
  path: outlinePath,
  shots: z.array(z.object({
    id: shotIdSchema,
    render: z.object({ mode: tuple(V.RENDER_MODES), purpose: nonEmpty.refine((v) => renderPurposes().includes(v), (v) => ({ message: `${v} is not a render purpose (render-routing.js PURPOSES)` })).optional(), reason: nonEmpty }).strict().optional()
      .describe('Render route: shot.render'),
    size: tuple(V.SIZES).optional(),
    why: nonEmpty.optional().describe('Why this size'),
    angle: tuple(V.ANGLES).optional(),
    backgroundView: z.enum(['front', 'back']).optional().describe('Opening camera direction relative to the location sheet: front is its establishing view; back is the opposite view, 180 degrees around the same space. Saved as visual.camera.backgroundView; omitted keeps the choice, initially front.'),
    view: shotViewSchema.optional().describe('Content-led opening subject, crop and viewpoint; saved as visual.camera.view'),
    move: choice.extend({ target: nonEmpty.optional(), speed: z.enum(['very slow', 'slow', 'steady', 'fast', 'very fast']).optional() }).strict().optional()
      .describe('A camera technique with a movement; on a still_camera cut, the still effect (push, pan, focus-in, hold …)'),
    focus: choice.extend({ from: nonEmpty.optional(), to: nonEmpty.optional() }).strict().nullable().optional()
      .describe('A camera technique with a focus field (camera.rack-focus) and the subjects it hands focus between; null removes it'),
    depth: depthSchema.optional(),
    frames: z.object({ mode: z.enum(['first', 'first_last', 'reference']), reason: nonEmpty, endState: nonEmpty.optional() }).strict().optional()
      .describe('Frame plan: reference is MSR (subject images + start image)'),
    next: nextTransitionSchema.optional()
      .describe('The join from this shot into the next one, written on the next shot\'s transition'),
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
  for (const { id, render, size, why, angle, view, backgroundView, move, focus, depth, frames, next } of args.shots) {
    const index = shotIndex(shots, id, 'shot_icons');
    const plan = { ...(shots[index].shot ?? {}) } as Record<string, unknown>;
    const visual = { ...(shots[index].visual ?? {}) } as Record<string, unknown>;
    // The image prompt's composition, camera and focus inputs; changed rack endpoints matter even with the same technique id.
    const framing = () => JSON.stringify([plan.size, plan.angle, plan.depth, plan.space, plan.composition, plan.eyeline, visual.camera,
      (plan.render as { camera?: unknown } | undefined)?.camera, ((Array.isArray(plan.techniques) ? plan.techniques : []) as Array<{ id: string; from?: string; to?: string }>)
      .filter((t) => { const entry = catalog[t.id] as { category?: string; fields?: Record<string, unknown> } | undefined;
        return !!entry && (entry.category === 'framing' || !!entry.fields?.focus || !!entry.fields?.viewpoint || !!entry.fields?.angle); }).map((t) => [t.id, t.from, t.to])]);
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
    if (backgroundView) visual.camera = { ...(visual.camera as Record<string, unknown> | undefined), backgroundView };
    if (view) {
      shotViewSchema.parse(view);
      for (const [key, value] of [['subject', view.subject], ['crop', view.crop]]) {
        if (nonEnglishOutsideQuotes(value)) throw new Error(`video_prompt_language: shot_icons ${id} view.${key} must be English`);
      }
      // The structured view replaces old opening prose and flags, not the closing camera.
      const { framing: _framing, rear: _rear, pov: _pov, ...camera } = (visual.camera ?? {}) as Record<string, unknown>;
      visual.camera = { ...camera, view };
      plan.info = view.subject;
      plan.why = view.reason;
    }
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
      notes.push({ level: 'warn', where: id, what: 'the start image was made for the previous size, angle, depth, camera or focus — remake it and any end image with shot_image' });
    shots[index] = { ...shots[index], shot: plan, visual } as Shot;
    if (next) {
      if (index + 1 >= shots.length) throw new Error(`shot_icons ${id}: the last shot has no next shot to join`);
      try { applyTransition(shots, index + 1, next); } catch (error) { throw new Error(`shot_icons ${id} next: ${(error as Error).message}`); }
    }
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
  action: z.enum(['generate', 'complete']).default('generate').describe('generate plans/runs a new image; complete adopts a saved host output without generating'),
  requestId: nonEmpty.optional().describe('The host handoff requestId to complete'),
  frame: z.enum(['start', 'end']).default('start').describe('start: the first image; end: the last image of a first_last shot'),
  prompt: nonEmpty.optional().describe('What the frame shows, in English: who is where, doing what, facing which way, expression and light'),
  editExisting: z.boolean().optional().describe('Edit the saved frame in place conceptually, saving a new version; prompt describes only the change'),
  reframe: z.boolean().optional().describe('With editExisting, reapply the saved start-frame size, crop and viewpoint to correct a generated composition; prompt describes the opening action and correction'),
  sourceCrop: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional()
    .describe('With reframe, an inspected rectangle in source-image pixels, e.g. {x:72,y:64,width:720,height:1280}; must fit the source and match output aspect. It becomes the GenAI composition reference, not the final output.'),
  preserve: nonEmpty.optional().describe('Details to preserve when editExisting is true'),
  location: nonEmpty.optional().describe('SB_DOC.locations id of the place, for the start image; an earlier call\'s choice stays when omitted, and an end image keeps the start\'s place'),
  props: z.array(nonEmpty).optional().describe('SB_DOC.props ids seen in the frame; an earlier call\'s choice stays when omitted'),
  size: z.string().regex(/^\d{3,4}x\d{3,4}$/).optional().describe('Output WIDTHxHEIGHT; default 1536x864 for 16:9, 864x1536 for 9:16. Fixed-size GPT models keep their supported preset with a framing warning.'),
  reserveUsd: z.number().finite().nonnegative().optional(),
}).strict();
type ImageRef = { id: string; path: string; role: string; use: string; purpose: string };
export interface ShotImageRequest {
  episode: string; assetId: string; requestId: string; tool?: string; operation: 'text' | 'edit';
  args: Record<string, unknown>; file: string; inputs: string[]; refs: ImageRef[]; location?: string; locationFrame?: Record<string, unknown>; props: string[]; prompt: string; warnings: Finding[];
  startBasis?: string;
  sourceBasis?: string;
  inputHashes?: Record<string, string>;
  originalInputs?: string[];
  canonicalPanels?: boolean;
}
// Evidence of the inputs used, not a claim that a model obeyed them. Exclude generated bindings.
function startImageBasis(shot: Shot, format: unknown): string {
  const plan = shot.shot ?? {}, visual = (shot.visual ?? {}) as Record<string, unknown>;
  return createHash('sha256').update(JSON.stringify({ format, size: plan.size, angle: plan.angle,
    space: plan.space, composition: plan.composition, eyeline: plan.eyeline, depth: plan.depth,
    techniques: plan.techniques, render: plan.render, camera: visual.camera,
    cast: contract().castOf(shot), location: visual.locationId, locationBinding: plan.location, props: visual.props,
    action: visual.action, videoDesign: plan.videoDesign,
    performance: shot.performance,
    acting: shot.narration?.map(line => (line.acting as { visual?: unknown } | undefined)?.visual),
  })).digest('hex');
}
function imageFramingStatus(shot: Shot, format: unknown, boardDir?: string) {
  const visual = shot.visual as { frames?: { start?: string; startBasis?: string; startPromptSha256?: string }; bgPrompt?: string } | undefined;
  const frames = visual?.frames;
  const availability = !boardDir ? undefined : frames?.start && existsSync(resolve(boardDir, frames.start)) ? 'present' : 'missing';
  const promptHash = typeof visual?.bgPrompt === 'string' ? createHash('sha256').update(visual.bgPrompt).digest('hex') : null;
  const changed = !!frames?.startBasis && frames.startBasis !== startImageBasis(shot, format)
    || !!frames?.startPromptSha256 && frames.startPromptSha256 !== promptHash;
  return { id: shot.id, image: frames?.start, ...(availability ? { availability } : {}), status: changed ? 'stale' : !frames?.startBasis || !frames.startPromptSha256 ? 'unknown' : 'current',
    visualReview: 'not_reviewed', note: 'Current means saved staging and prompt inputs match, not that the image obeys them. Inspect the pixels before reuse.' };
}
type ShotFrame = { id: string; name: string; revision: number; manifest: string; manifestSha256: string; stateId: string; camera: { lensMm: number } & Record<string, unknown>; endCamera: ({ lensMm: number } & Record<string, unknown>) | null;
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
  identityCharacter(source: string, options: { ready: boolean }): Record<string, unknown>;
};
// Two people in one frame: their sheet heights, so the picture keeps the difference the panels cannot show.
function heightSentence(win: Board, ids: string[]): string {
  const heights = ids.map((id) => [id, ((castEntry(win, id)?.character as { physical?: { heightCm?: { status?: string; value?: unknown } } } | undefined)?.physical?.heightCm)] as const)
    .filter(([, field]) => field?.status === 'confirmed' && typeof field.value === 'number' && Number.isFinite(field.value) && field.value > 0)
    .map(([id, field]) => ({ id, cm: field!.value as number }));
  if (heights.length < 2) return '';
  const ordered = [...heights].sort((a, b) => b.cm - a.cm), tall = ordered[0], short = ordered.at(-1)!;
  return `Keep their real heights: ${heights.map(h => `${h.id} is ${h.cm} cm tall`).join(' and ')}. `
    + `${tall.id} is ${Number((tall.cm - short.cm).toFixed(2))} cm taller than ${short.id} (height ratio ${(tall.cm / short.cm).toFixed(3)}). `
    + 'For upright figures at equal camera distance on the same ground plane, preserve that relative scale. Follow the authored depth and pose; do not equalize head levels or compare seated and standing head heights. Independently framed sheet panels do not establish relative scale.';
}
function castEntry(win: Board, id: string): Record<string, unknown> | undefined {
  const list = (win.SB_DOC as { characters?: unknown } | undefined)?.characters;
  const entries = Array.isArray(list) ? list : Object.entries(list ?? {}).map(([key, value]) => ({ ...(value as object), id: key }));
  return entries.find((entry) => (entry as { id?: unknown })?.id === id) as Record<string, unknown> | undefined;
}
/** The sheet panels assets/characters/<id>/panels.json names — face, headless front and back — in MSR order. */
function characterRefs(boardDir: string, win: Board, shotId: string, ids: string[], use: string, warnings: Finding[], concise = false): ImageRef[] {
  return characterPanels().canonicalReferences(boardDir, shotId, ids, use).map(ref => {
    const view = ref.id.split('-').at(-1)!;
    const id = ids.find(id => ref.id === `${shotId}-${id}-${view}`)!;
    if (concise) return ref;
    const { text: detail, skipped } = identityCatalog().panelPrompt(castEntry(win, id)?.character, view);
    for (const field of skipped) warnings.push({ level: 'warn', where: shotId, what: `${id}'s ${field} is not English and stays out of the image prompt — write it in English on the character sheet` });
    return { ...ref, purpose: ref.purpose + (detail ? `: ${detail}` : '') };
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
function shotImageSourceBasis(path: string, id: string, request: ShotImageRequest): string {
  const { win } = readOutline(path);
  const shot = (win.SCENES ?? [])[shotIndex(win.SCENES ?? [], id, 'shot_image')];
  const doc = (win.SB_DOC ?? {}) as Record<string, unknown>;
  const rows = (value: unknown) => Array.isArray(value) ? value as Record<string, unknown>[] : [];
  const ledger = (doc.propContinuity ?? {}) as Record<string, unknown>;
  const assets = { location: rows(doc.locations).find(entry => entry.id === request.location),
    props: rows(doc.props).filter(entry => request.props.includes(String(entry.id))),
    characters: (contract().castOf(shot) ?? []).map(character => castEntry(win, character)),
    continuity: request.props.length ? { version: ledger.version, timelineId: ledger.timelineId,
      initial: rows(ledger.initial).filter(entry => request.props.includes(String(entry.propId))),
      events: rows(ledger.events).filter(entry => request.props.includes(String(entry.propId))) } : undefined };
  const style = (loadFromHere(join(REFERENCES_DIR, 'production-mode.js')) as { shotStyle(win: Board, index: number): unknown }).shotStyle(win, (win.SCENES ?? []).indexOf(shot));
  const panels = request.canonicalPanels ? characterPanels().canonicalReferences(dirname(scenesPath(path)), id, contract().castOf(shot) ?? [], 'image')
    .map(ref => ({ id: ref.id, path: resolve(dirname(scenesPath(path)), ref.path) })) : undefined;
  return createHash('sha256').update(JSON.stringify({ shot, format: win.FORMAT, assets, style, panels })).digest('hex');
}

export function shotImageRequest(args: z.infer<typeof shotImageSchema>): ShotImageRequest {
  if (args.action === 'complete') throw new Error('shot_image_action: use completeShotImage for a host completion');
  if (!args.prompt) throw new Error('shot_image_prompt_required: generate needs prompt');
  const request = buildShotImageRequest({ ...args, prompt: args.prompt });
  const sourceBasis = shotImageSourceBasis(args.path, args.id, request);
  return { ...request, sourceBasis, inputHashes: Object.fromEntries([...new Set([...request.inputs, ...(request.originalInputs ?? [])])].map(file =>
    [file, createHash('sha256').update(readFileSync(file)).digest('hex')])) };
}

function buildShotImageRequest(args: z.infer<typeof shotImageSchema> & { prompt: string }): ShotImageRequest {
  const { win } = readOutline(args.path);
  const shots = win.SCENES ?? [];
  const shot = shots[shotIndex(shots, args.id, 'shot_image')];
  const plan = (shot.shot ?? {}) as Record<string, unknown>, visual = (shot.visual ?? {}) as Record<string, unknown>;
  const frames = (visual.frames ?? {}) as { mode?: string; start?: string; end?: string; endProps?: unknown; startBasis?: string };
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
  const selectedImage = imageContext(episode, args.id).selection;
  const wide = /16x9/.test(String(win.FORMAT ?? ''));
  const fixedSize = selectedImage.engine === 'gpt-image' && !gptImageContract(selectedImage.model ?? 'gpt-image-2')?.flexibleSize;
  const [width, height] = (args.size ?? (fixedSize ? (wide ? '1536x1024' : '1024x1536') : (wide ? '1536x864' : '864x1536'))).split('x').map(Number);
  if (args.preserve && !args.editExisting) throw new Error('image_edit_required: preserve requires editExisting');
  if (args.reframe && (!args.editExisting || args.frame !== 'start')) throw new Error('image_edit_scope: reframe requires editExisting and frame:start');
  if (args.sourceCrop && !args.reframe) throw new Error('image_edit_scope: sourceCrop requires reframe');
  if (args.editExisting) {
    if (args.location || args.props) throw new Error('image_edit_scope: update location and prop metadata before editing; omit location and props here');
    const source = frames[args.frame];
    if (!source) throw new Error(`image_edit_source_missing: ${args.id} has no saved ${args.frame} image`);
    let input = resolve(boardDir, source);
    if (!existsSync(input)) throw new Error(`image_input_missing: ${input}`);
    const metadata = readImageMetadata(input);
    const [editWidth, editHeight] = args.size || args.reframe ? [width, height] : [metadata.width, metadata.height];
    if (args.sourceCrop) {
      const crop = shotImageSchema.shape.sourceCrop.parse(args.sourceCrop)!;
      if (crop.x + crop.width > metadata.width || crop.y + crop.height > metadata.height)
        throw new Error('image_crop_bounds: sourceCrop must fit inside the saved image');
      if (crop.width * editHeight !== crop.height * editWidth)
        throw new Error('image_crop_aspect: sourceCrop must match the output aspect exactly; do not stretch anatomy');
      const stamp = createHash('sha256').update(JSON.stringify({ source: metadata.sha256, crop, width: editWidth, height: editHeight })).digest('hex');
      const prepared = join(boardDir, 'images', 'inputs', `crop-${stamp}.png`);
      mkdirSync(dirname(prepared), { recursive: true });
      const temporary = prepared + '.' + randomUUID() + '.png';
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}:exact=1,scale=${editWidth}:${editHeight}:flags=lanczos`, '-frames:v', '1', temporary], { timeout: 30_000, stdio: 'pipe' });
        renameSync(temporary, prepared);
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
      writeFileSync(prepared + '.source.json', JSON.stringify({ source: input, sourceSha256: metadata.sha256, crop, prepared: readImageMetadata(prepared) }, null, 2));
      input = prepared;
    }
    const framing = args.reframe ? (loadFromHere(join(REFERENCES_DIR, 'assemble-bg-prompt.js')) as {
      frameOptions(scene: Shot, frame: string): Record<string, unknown>; assemble(opts: Record<string, unknown>): { prompt: string };
    }) : undefined;
    const prompt = [args.sourceCrop ? 'Image 1 is already cropped to the required opening composition. Keep its exact frame boundaries and subject scale. Refine image detail and apply the opening action below without widening the view.'
      : args.reframe ? 'Reframe Image 1 to the following opening composition. Zoom and crop the subject to these boundaries; the input image supplies identity, clothing, place and light, not the crop or expression.' : 'Edit Image 1. Change only: ' + args.prompt,
      framing ? framing.assemble({ ...framing.frameOptions(shot, 'start'), scene: args.prompt, noPerson: !cast.length }).prompt : '',
      args.reframe ? 'Preserve the visible subject identity, clothing, environment and rendering style. Apply the authored opening state instead of copying a conflicting state from the input.' : 'Preserve all other visible details, identities, composition, lighting and rendering style unless the requested change requires otherwise.',
      args.preserve ? 'Preserve explicitly: ' + args.preserve : ''].filter(Boolean).join('\n');
    const call = imageCall({ directory: episode, assetId: args.id, inputs: [input], prompt,
      width: editWidth, height: editHeight, outDir: join(boardDir, 'images'), stem: `${args.id}-${args.frame}`, what: 'this frame edit' });
    const warnings: Finding[] = [];
    if (imageFramingStatus(shot, win.FORMAT).status === 'stale') warnings.push({ level: 'warn', where: args.id, what: 'image_framing_stale: this edit inherits an image made from older shot inputs; normal generation rebuilds all current references and framing' });
    if (Math.abs(editWidth / editHeight - (wide ? 16 / 9 : 9 / 16)) > 0.001)
      warnings.push({ level: 'warn', where: args.id, what: `image_aspect_mismatch: ${editWidth}x${editHeight} differs from the delivery aspect; inspect its final crop` });
    return { episode, assetId: args.id, ...call, originalInputs: [resolve(boardDir, source), ...call.originalInputs], refs: (visual.references ?? []) as ImageRef[],
      ...(location ? { location } : {}), ...(visual.locationFrame ? { locationFrame: visual.locationFrame as Record<string, unknown> } : {}), props, prompt,
      startBasis: frames.startBasis,
      warnings };
  }
  const entry = location ? docEntry(win, 'locations', location) : undefined;
  const warnings: Finding[] = [];
  if (Math.abs(width / height - (wide ? 16 / 9 : 9 / 16)) > 0.001)
    warnings.push({ level: 'warn', where: args.id, what: `image_aspect_mismatch: ${width}x${height} differs from the ${wide ? '16:9' : '9:16'} delivery frame; inspect the final crop, including hands and feet, before video generation` });
  const backgroundView = (visual.camera as { backgroundView?: string } | undefined)?.backgroundView ?? 'front';
  const panels = entry?.panels as { front?: string; back?: string } | undefined;
  const selected = backgroundView === 'back' ? panels?.back : panels?.front;
  if (entry && args.frame === 'start' && !entry.manifest && !selected && (backgroundView === 'back' || panels))
    throw new Error(`background_view_missing: ${location} needs its ${backgroundView} panel before generating the opening image; generate or register that direction instead of substituting imageUrl`);
  const place = typeof selected === 'string' && selected ? selected : entry?.imageUrl;
  if (entry && !selected && args.frame === 'start')
    warnings.push({ level: 'warn', where: args.id, what: `background_view_missing: ${location} has no ${backgroundView} panel; ${place ? 'its legacy imageUrl supplies the look' : 'no background image is available'} — generate front and back panels on the location sheet` });
  const view = (visual.camera as { view?: ShotView } | undefined)?.view;
  if (view !== undefined) {
    shotViewSchema.parse(view);
    if (nonEnglishOutsideQuotes(view.subject + ' ' + view.crop)) throw new Error('image_prompt_language: view.subject and view.crop must be English');
  } else if (args.frame === 'start') warnings.push({ level: 'warn', where: args.id, what: 'no content-led opening view: choose the attention subject, crop and viewpoint with shot_icons view before making a new production image; legacy framing is used' });
  // A sheet with a built set (SB_DOC.locations[].manifest) is rendered from this shot's own camera — its size and
  // angle, aimed at its blocked cast — and that render is the picture's composition; the sheet image only gives the look.
  const set = typeof entry?.manifest === 'string' ? locationContract().shotFrame(win, shots.indexOf(shot), boardDir,
    { manifest: entry.manifest, cast, size: plan.size, angle: plan.angle, width, height }) : null;
  if (set) warnings.push(...set.warnings.map((what) => ({ level: 'warn' as const, where: args.id, what })));
  else if (location && args.frame === 'start')
    warnings.push({ level: 'warn', where: args.id, what: `the ${location} sheet names no built set, so its ${backgroundView} view supplies the background; exact framing follows the shot prompt — build the set (location_manage build) and write its manifest on the sheet for a camera-matched start image` });
  // The renderer has no roll, so a dutch shot's render is level and the prompt alone tilts it.
  const lens = set ? `${set.camera.lensMm} mm lens` : '', dutch = plan.angle === 'dutch';
  const composition: ImageRef[] = set && (args.frame === 'start' || set.endCamera) ? [{ id: `${args.id}-set`, path: set[args.frame].path, role: 'composition', use: 'image',
    purpose: args.frame === 'end' ? `the ${set.name} set from the closing camera (${set.endCamera!.lensMm} mm lens), where every object${set.blocked ? ' and figure' : ''} stands when it ends`
      : `the ${set.name} set seen from this shot's camera (${lens}): its viewpoint, framing${dutch ? '' : ' and horizon'}, the architecture and where every object${set.blocked ? ' and coloured figure' : ''} stands; its plain unpainted surfaces are placeholders` }] : [];
  const conciseIdentity = (selectedImage.engine === 'astra-genai-native' && ['qwen-image-fast', 'qwen-image-2.1-turbo'].includes(selectedImage.model ?? ''))
    || (selectedImage.engine === 'mlx' && mlxImageFamily(selectedImage.model ?? '') === 'qwen-2.1');
  const propPictures = propRefs(win, shots.indexOf(shot), args.id, props, args.frame, warnings);
  const refs: ImageRef[] = [
    ...composition,
    ...characterRefs(boardDir, win, args.id, cast, frames.mode === 'reference' ? 'both' : 'image', warnings, conciseIdentity),
    ...propPictures.refs,
    // MSR takes the start image in its background slot, so the place only conditions the picture.
    ...(typeof place === 'string' ? [{ id: `${args.id}-place`, path: place, role: 'background', use: 'image',
      purpose: set ? `how the ${location} location looks — materials, colours and light only, not its viewpoint or layout` : `the ${location} location${selected ? ` with ${backgroundView} directional geography` : ''}; use its appearance and the spatial relationships of visible landmarks, not its frame extent` }] : []),
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
  const imagePrompts = loadFromHere(join(REFERENCES_DIR, 'assemble-bg-prompt.js')) as {
    frameOptions(scene: Shot, frame: string): Record<string, unknown>; assemble(opts: Record<string, unknown>): { prompt: string };
  };
  const style = (loadFromHere(join(REFERENCES_DIR, 'production-mode.js')) as { shotStyle(win: Board, index: number): { preset?: string } }).shotStyle(win, shots.indexOf(shot));
  const authoredOpening = (plan.videoDesign as { before?: unknown } | undefined)?.before;
  const opening = args.frame === 'start' ? latin(authoredOpening) : '';
  if (args.frame === 'start' && authoredOpening && !opening)
    warnings.push({ level: 'warn', code: 'opening_translation_required', where: args.id,
      what: 'opening_translation_required: videoDesign.before is not English; preserve its physical state in the English shot_image prompt.' });
  const body = imagePrompts.assemble({ ...imagePrompts.frameOptions(shot, args.frame),
    ...(args.frame === 'end' && set?.endCamera && JSON.stringify(set.camera) !== JSON.stringify(set.endCamera) ? { omitFraming: true } : {}),
    style: style.preset ? style : null, scene: [opening && `Authored opening state: ${opening}`, args.prompt].filter(Boolean).join(' '), noPerson: !cast.length,
    ...(set ? { location: { prompt: args.frame === 'end' ? set.endPrompt : set.prompt, paths: [] } } : {}) }).prompt;
  const roles = ordered.map((ref, i) => {
    const character = refs.find(r => r.path === ref.path && r.role === 'character');
    const role = !character ? '' : character.id.endsWith('-face')
      ? ' Use only the head and hair above the collar; ignore clothing in this panel.'
      : /-(front|back)$/.test(character.id) ? ' Use this panel for physique and all clothing, including collar, tie and sleeve state.' : '';
    return `Image ${i + 1} shows ${ref.purpose}.${role}`;
  }).join(' ');
  const at = (ref: unknown) => ordered.indexOf(ref as ImageRef) + 1;
  const lock = !set ? (selected && args.frame === 'start'
    ? `Preserve the selected background's ${backgroundView} directional geography and the spatial relationships of visible landmarks. The authored crop, camera height and subject viewpoint control the output; do not copy the background sheet's wide framing. Landmarks outside that crop stay outside the frame. The character sheets supply appearance and identity only; their panel poses do not constrain this shot.`
    : view ? `The location and character sheets supply appearance and identity only. Recompose them to the authored ${args.frame === 'end' ? 'closing' : 'opening'} crop and viewpoint; the sheet pose and camera do not constrain this shot.` : '') : args.frame === 'end'
    ? composition.length ? `Use Image ${at(composition[0])}'s closing camera, lens, framing and final object and figure positions. Image 1 supplies the look and every identity; its opening camera does not constrain this closing view.`
      : `Image 1 supplies the opening appearance and identities. Follow the closing camera direction below while preserving the set's world layout.`
    : `Keep Image 1's camera position, ${lens}${dutch ? '' : ', horizon'} and world layout, and keep every object${set.blocked ? ' and figure' : ''} at its world position in Image 1. The authored composition below controls the final crop, headroom and subject screen placement. Paint its plain unpainted surfaces as the real place, and continue the place into any flat dark area past the set's edge.`
      + (dutch ? ' Image 1 is level; tilt the whole picture to the dutch angle described below.' : '')
      + (look.some((ref) => ordered.includes(ref)) ? ` Take only materials, colours and light from Image ${at(look[0])}.` : '');
  const prompt = [args.frame === 'start' && view ? `Create one opening image with this required crop: ${view.crop}.` : ordered.length ? 'Compose one picture from these images.' : '', roles, lock, heightSentence(win, cast),
    view ? 'Character panels identify the subject; include only the body regions named by the crop. A face reference does not require a face in the output. The opening action determines expression and gaze; do not copy a reference smile when the action asks for a different expression.' : '',
    args.frame === 'end' ? 'This is the last frame of the shot that opens on Image 1: keep its place, light and every identity, applying the planned action, camera landing and final focus.' : '',
    ...propPictures.unseen, body.charAt(0).toUpperCase() + body.slice(1),
    args.frame === 'start' && view ? `Final frame boundaries: ${view.crop}.` : ''].filter(Boolean).join(' ');

  const call = imageCall({ directory: episode, assetId: args.id, inputs, prompt, width, height, outDir: join(boardDir, 'images'), stem: `${args.id}-${args.frame}`, what: 'this frame' });
  const sent = refs.filter((ref) => ordered.includes(ref));
  const locationFrame = set && args.frame === 'start' ? { set: set.id, revision: set.revision, manifest: set.manifest, manifestSha256: set.manifestSha256, stateId: set.stateId,
    camera: set.camera, endCamera: set.endCamera, blocked: set.blocked, fingerprint: set.fingerprint, start: set.start, end: set.end } : undefined;
  const startBasis = startImageBasis({ ...shot, visual: { ...visual, ...(location ? { locationId: location } : {}), props } } as Shot, win.FORMAT);
  return { episode, assetId: args.id, ...call, canonicalPanels: true, refs: sent, ...(location ? { location } : {}), ...(locationFrame ? { locationFrame } : {}), props, prompt, warnings, startBasis };
}

/**
 * The adapter call for one generated picture with the saved image model: the next free versioned
 * file <outDir>/<stem>-vN.png and the engine's own argument shape, editing from the inputs in order.
 */
// Measured panel setting on the local Qwen route; never apply it to another gateway model.
const PANEL_NEGATIVE_GUIDANCE: Record<string, number> = { 'qwen-image-fast': 4, 'qwen-image-2.1-turbo': 4 };
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
  while (existsSync(join(o.outDir, `${o.stem}-v${k}.png`)) || existsSync(join(o.outDir, `${o.stem}-v${k}.pending.json`)) || Object.hasOwn(jobs, `${o.stem}-v${k}`)) k += 1;
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
  const guidance = selection.engine === 'astra-genai-native' ? PANEL_NEGATIVE_GUIDANCE[selection.model ?? ''] : undefined;
  const negativeSent = !!o.negativePrompt && guidance !== undefined;
  if (negativeSent) Object.assign(args, { negativePrompt: o.negativePrompt, guidanceScale: guidance });
  return { requestId, ...(tool ? { tool } : {}), operation: (edit ? 'edit' : 'text') as 'edit' | 'text', args, file, inputs: sent, originalInputs: inputs, negativeSent };
}

/** Keep the immutable host request beside its reserved output, without touching active frames. */
export function deferShotImage(args: z.infer<typeof shotImageSchema>, request: ShotImageRequest): void {
  const file = join(dirname(request.file), `${request.requestId}.pending.json`);
  writeFileSync(file, JSON.stringify({ path: scenesPath(args.path), id: args.id, frame: args.frame, request }, null, 2) + '\n', { flag: 'wx' });
}

export function completeShotImage(args: z.infer<typeof shotImageSchema>): ApplyResult {
  if (!args.requestId || !new RegExp(`^${args.id}-${args.frame}-v[1-9][0-9]*$`).test(args.requestId))
    throw new Error('shot_image_request_required: complete needs the matching handoff requestId and frame');
  if (args.prompt !== undefined || args.editExisting !== undefined || args.reframe !== undefined || args.sourceCrop !== undefined || args.preserve !== undefined || args.location !== undefined || args.props !== undefined || args.size !== undefined || args.reserveUsd !== undefined)
    throw new Error('shot_image_completion_scope: complete uses the saved request; omit generation options');
  const file = join(dirname(scenesPath(args.path)), 'images', `${args.requestId}.pending.json`);
  if (!existsSync(file)) throw new Error('shot_image_request_missing: no saved host handoff');
  const pending = JSON.parse(readFileSync(file, 'utf8')) as { path: string; id: string; frame: string; request: ShotImageRequest; completed?: boolean };
  if (pending.completed) throw new Error('shot_image_already_completed: this handoff was already adopted');
  if (pending.path !== scenesPath(args.path) || pending.id !== args.id || pending.frame !== args.frame || pending.request.requestId !== args.requestId || pending.request.file !== join(dirname(file), `${args.requestId}.png`))
    throw new Error('shot_image_request_mismatch: the handoff belongs to another frame');
  const result = recordShotImage(args, pending.request);
  writeFileSync(file, JSON.stringify({ ...pending, completed: true }, null, 2) + '\n');
  return result;
}

/** Record only a decoded output whose planned inputs still match the board. */
export function recordShotImage(args: z.infer<typeof shotImageSchema>, request: ShotImageRequest): ApplyResult {
  if (!existsSync(request.file)) throw new Error('shot_image_output_missing: generate and save the requested output before completing');
  verifyImageFile(request.file);
  if (request.sourceBasis && request.sourceBasis !== shotImageSourceBasis(args.path, args.id, request))
    throw new Error('shot_image_request_stale: the shot or asset plan changed after generation was requested; keep the output and plan a new request');
  for (const [file, hash] of Object.entries(request.inputHashes ?? {})) {
    if (!existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== hash)
      throw new Error('shot_image_input_changed: a reference changed after generation was requested');
  }
  const { win, st } = readOutline(args.path);
  const shots = (win.SCENES ?? []).slice();
  const index = shotIndex(shots, args.id, 'shot_image');
  const visual = { ...(shots[index].visual ?? {}) } as Record<string, unknown>;
  const rel = relative(dirname(scenesPath(args.path)), request.file);
  const frames: Record<string, unknown> = { ...(visual.frames as object | undefined), [args.frame]: rel };
  const notes: Finding[] = [...request.warnings];
  if (args.frame === 'start') {
    // An edit inherits the source's basis, so a colour correction cannot certify an old crop.
    if (request.startBasis) frames.startBasis = request.startBasis; else delete frames.startBasis;
    frames.startPromptSha256 = createHash('sha256').update(request.prompt).digest('hex');
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
export const shotPromptSchema = z.object({
  path: outlinePath,
  id: shotIdSchema,
  action: nonEmpty.describe('What happens in the shot, in English: the subjects\' movement from the opening picture'),
  end: nonEmpty.optional().describe('The closing picture, in English'),
  sound: nonEmpty.optional().describe('Ambient sound and effects, in English; the shot\'s lines come from shot_dialogue. "no music" is added unless it names music'),
  speakerBindings: z.array(speakerBindingSchema).max(2).optional()
    .describe('MSR speakers as seen in the start image, e.g. [{speaker:"hero",screenPosition:"left",description:"the man in black armor"}]; viewer coordinates, never reference order'),
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
  const speakerBindings = args.speakerBindings ?? [];
  const visibleSpeakers = [...new Set((shot.narration ?? []).filter(line => line.delivery === 'on_screen' && line.tts).map(line => line.speaker))];
  if (msr && visibleSpeakers.length > 1 && visibleSpeakers.some(id => !speakerBindings.some(binding => binding.speaker === id)))
    throw new Error('video_speaker_binding_required: inspect the start image and pass speakerBindings for both on-screen speakers');
  if (new Set(speakerBindings.map(binding => binding.speaker)).size !== speakerBindings.length ||
      new Set(speakerBindings.map(binding => binding.screenPosition)).size !== speakerBindings.length)
    throw new Error('video_speaker_binding_invalid: use one distinct screen position per speaker');
  for (const binding of speakerBindings) {
    if (!castRegistry(args.path, win).ids.has(binding.speaker) || !contract().castOf(shot)?.includes(binding.speaker) || nonEnglishOutsideQuotes(binding.description))
      throw new Error('video_speaker_binding_invalid: bind visible cast members with English appearance descriptions');
  }
  if (msr && [args.action, args.end, args.sound].some(value => value && (shot.narration ?? []).some(line => line.tts && value.includes(line.tts))))
    throw new Error('video_dialogue_embedded: write only action and sound here; shot_dialogue owns the spoken words');
  const source = { action: args.action, ...(args.end ? { end: args.end } : {}), ...(args.sound ? { sound: args.sound } : {}) };
  const rawCast = (win.SB_DOC as { characters?: unknown } | undefined)?.characters;
  const names = Object.fromEntries((Array.isArray(rawCast) ? rawCast : []).map(c => [c.id, String(c.name ?? '')]));
  const compiled = compileVideoPrompt(shot, source, names), { prompt } = compiled;
  const { speakerBindings: _oldBindings, speakerBindingImageSha256: _oldImage, ...priorVideo } = (visual.video ?? {}) as Record<string, unknown>;
  const start = (visual.frames as { start?: string } | undefined)?.start;
  shots[index] = { ...shot, visual: { ...visual, video: { ...priorVideo, prompt, promptSource: source, promptBasis: contract().promptBasis(shot, isFocus),
    ...(speakerBindings.length ? { speakerBindings, speakerBindingImageSha256: createHash('sha256').update(readFileSync(resolve(dirname(scenesPath(args.path)), start!))).digest('hex') } : {}) } } } as Shot;
  const result = writeOutline(args.path, win, st, shots);
  return { ...result, findings: [...result.findings, ...compiled.warnings.map(what => ({ level: 'warn' as const, where: args.id, what }))], prompt };
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
