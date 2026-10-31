import { manageProject } from './project.js';
import { verifyImageFile } from './image-media.js';
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
// Namespace import: the esbuild banner already declares a top-level `createRequire`, and a named
// import of the same identifier makes the bundle a SyntaxError.
const loadFromHere = nodeModule.createRequire(import.meta.url);
let contractCache;
export function contract() {
    if (!contractCache)
        contractCache = loadFromHere(CONTRACT_FILE);
    return contractCache;
}
export function cameraContract() {
    return loadFromHere(join(REFERENCES_DIR, 'production-mode.js'));
}
export function techniqueContract() {
    return loadFromHere(join(REFERENCES_DIR, 'film-techniques.js'));
}
export const techniqueSelectionSchema = z.array(z.object({
    id: nonEmptyTechniqueId(),
    reason: z.string().trim().min(1).describe('Why this technique serves this shot’s information or action'),
}).strict()).superRefine((value, ctx) => {
    for (const message of techniqueContract().validate(value))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});
function nonEmptyTechniqueId() { return z.string().trim().min(1).describe('Stable id from storyboard_read techniqueCatalog'); }
export function motionThemeContract() {
    return loadFromHere(join(REFERENCES_DIR, 'motion-graphics.js'));
}
export function motionGraphicTypes() {
    const registry = loadFromHere(join(REFERENCES_DIR, 'motion-graphics.js'));
    return Object.keys(registry.TYPES);
}
export function renderPurposes() {
    const routing = loadFromHere(join(REFERENCES_DIR, 'render-routing.js'));
    return Object.keys(routing.PURPOSES);
}
export function stillCameraEffectList() {
    const routing = loadFromHere(join(REFERENCES_DIR, 'render-routing.js'));
    return routing.STILL_CAMERA_EFFECTS;
}
// ── Schemas ─────────────────────────────────────────────────────
const tuple = (list) => z.enum(list);
// The schemas are built at module load, so a missing contract file must not take the whole
// server down with it — the three storyboard tools fail at call time (contract() throws) while
// the other tools keep working. The placeholder vocabulary accepts nothing real.
const MISSING = ['__contract-missing__'];
function vocabAtLoad() {
    try {
        return contract().VOCAB;
    }
    catch {
        return { SIZES: MISSING, ANGLES: MISSING, BEATS: MISSING, TYPES: MISSING, INFO_TYPES: MISSING, SHARE_TYPES: MISSING,
            HOOK_TYPES: MISSING, HOOK_FORMS: MISSING, ARCS: MISSING, RENDER_MODES: MISSING, PRODUCTION_MODES: MISSING, CHARGES_OPEN: MISSING, CHARGES_CLOSE: MISSING,
            TRANSITION_RE: /^$/ };
    }
}
const V = vocabAtLoad();
const nonEmpty = z.string().trim().min(1);
export const STRUCTURE_VERSION = (() => { try {
    return contract().VERSION;
}
catch {
    return 'structure-v1';
} })();
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
export const structureSchema = z
    .object({
    version: z.literal(STRUCTURE_VERSION),
    nextShotId: z.number().int().positive().optional(),
    sequences: z.array(sequenceSchema),
    scenes: z.array(sceneSchema),
})
    .strict();
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
                    context: z.enum(['research', 'software', 'education', 'campaign', 'storytelling', 'friendly']).optional(),
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
export const readLevelSchema = z.enum(['outline', 'scenes', 'shots', 'full']);
export const storyboardReadSchema = z.object({
    path: z.string().min(1).describe('The storyboard directory, or its scenes.js'),
    level: readLevelSchema.default('shots').describe('outline = sequences with scene numbers · scenes = scene cards with shot numbers · shots = every shot summarised under its scene · full = the raw shot objects too'),
    shotId: z.string().min(1).optional().describe('Stable shot ID to inspect, with its raw plan and neighboring shot IDs'),
    includeTechniques: z.boolean().default(true).describe('Return canonical technique ids, purposes, icons and provider instructions'),
    includeContext: z.boolean().default(true).describe('Include STORY, PRODUCTION and SB_DOC as unverified review context'),
});
/** Read-only diagnostics: generated bytes do not certify production or visual quality. */
function boardReadiness(win, boardDir) {
    let root = boardDir, channel;
    for (;;) {
        if (basename(root) === 'episodes')
            channel = dirname(root);
        if (existsSync(join(root, '.social-flow/models.json')) || dirname(root) === root)
            break;
        root = dirname(root);
    }
    let configuration;
    try {
        const project = manageProject({ action: 'status', workspace: root });
        configuration = { status: project.status, missing: project.missing };
    }
    catch {
        configuration = { status: 'not_verified' };
    }
    const panels = loadFromHere(join(PLUGIN_ROOT, 'skills/channel/references/character-panels.js'));
    const findings = channel ? panels.boardPanelFindings(win, boardDir, channel) : [];
    const document = win.SB_DOC;
    const entries = document?.characters ?? [];
    const characters = Array.isArray(entries) ? entries : Object.entries(entries).map(([id, c]) => ({ ...c, id }));
    const assets = characters.flatMap(c => Object.entries(c.panels ?? {}).map(([slot, name]) => {
        const file = typeof name === 'string' && name.trim() ? resolve(boardDir, name) : null;
        const present = !!file && existsSync(file) && statSync(file).isFile();
        let decoding = 'not_verified';
        if (present) {
            try {
                verifyImageFile(file);
                decoding = 'verified';
            }
            catch {
                decoding = 'failed';
            }
        }
        return { characterId: c.id, slot, path: file, file: present ? 'present' : 'missing', decoding, visualReview: 'not_reviewed' };
    }));
    return { configuration, assets, references: { status: !channel ? 'not_checked' : findings.length ? 'needs_attention' : 'checked', findings },
        visualReview: 'not_reviewed', note: 'Diagnostics only; no overall production-ready or visual-quality claim.' };
}
/** Read plans and recorded evidence without claiming to have inspected media or validated reviews. */
export function readStoryboard(args) {
    const { win, file, sha256 } = readBoard(args.path);
    const result = contract().outline(win, args.level);
    result.file = file;
    result.mediaBaseDirectory = dirname(file);
    result.sha256 = sha256;
    result.readiness = boardReadiness(win, dirname(file));
    if (args.includeTechniques !== false)
        result.techniqueCatalog = {
            version: techniqueContract().VERSION, entries: techniqueContract().entries,
            selections: (win.SCENES || []).map((scene, i) => ({ id: scene.id, no: i + 1,
                techniques: scene.shot?.techniques || [], findings: techniqueContract().findings(scene) })),
        };
    const doc = win.SB_DOC;
    if (doc?.props || doc?.propContinuity)
        result.propSheet = { props: doc.props, continuity: doc.propContinuity };
    result.inspection = { mediaViewed: false, evidenceStatus: 'not_verified',
        note: 'This response reads plans and recorded reviews only. Open referenced assets and verify current evidence before reporting visual quality or review validity.' };
    const continuity = loadFromHere(join(REFERENCES_DIR, 'shot-continuity.js'));
    result.continuityFindings = continuity.check(win, dirname(file));
    result.cameraDirectionFindings = cameraContract().cameraDirectionWarnings(win.SCENES).map(what => ({ level: 'warn', where: 'camera direction', what }));
    result.techniqueFindings = (win.SCENES || []).flatMap((scene, index) => techniqueContract().findings(scene).map(what => ({ level: 'warn', where: 'shot ' + (index + 1), what })));
    if (args.includeContext)
        result.reviewContext = {
            story: win.STORY || null, production: win.PRODUCTION || null, document: doc || null,
            evidenceStatus: 'not_verified',
        };
    if (args.shotId) {
        const shots = win.SCENES || [];
        const matches = shots.map((shot, index) => ({ shot, index })).filter(item => item.shot.id === args.shotId);
        if (matches.length !== 1)
            throw new Error(`shotId ${args.shotId}: expected one match, found ${matches.length}`);
        const { shot, index } = matches[0];
        const playback = result.playback;
        const position = playback.findIndex(row => row.no === index + 1);
        const neighbor = (i) => i >= 0 && playback[i] ? { id: playback[i].id, no: playback[i].no } : null;
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
    if (value.PRODUCTION === undefined)
        return;
    const parsed = productionSchema.safeParse(value.PRODUCTION);
    if (!parsed.success)
        for (const issue of parsed.error.issues)
            ctx.addIssue({ ...issue, path: ['PRODUCTION', ...issue.path] });
});
export const transitionPatchSchema = z.object({
    no: z.number().int().positive().describe('Incoming shot number, 1-based, after removals and inserts'),
    transition: z.enum(['cut', 'dip', 'dip:white', 'jcut', 'dissolve', 'iris', 'blur', 'zoom',
        'push:l2r', 'push:r2l', 'push:u2d', 'push:d2u', 'whip:l2r', 'whip:r2l', 'whip:u2d', 'whip:d2u']),
    transitionSeconds: z.number().finite().min(.08).max(.8).optional(),
    reason: nonEmpty,
    continuity: nonEmpty.optional(),
}).strict().refine(v => !['cut', 'dip', 'dip:white'].includes(v.transition) || v.transitionSeconds === undefined, 'cut and dip do not accept transitionSeconds; dip fades each side for up to 0.30 seconds');
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
/** Accepts a storyboard directory or the scenes.js inside it. */
export function scenesPath(target) {
    const abs = resolve(target);
    if (basename(abs) === 'scenes.js')
        return abs;
    return join(abs, 'scenes.js');
}
/** Evaluate scenes.js in a sandbox and return its window.* globals plus the leading `//` lines. */
export function readBoard(target) {
    const file = scenesPath(target);
    if (!existsSync(file))
        throw new Error(`no scenes.js at ${file}`);
    if (!statSync(file).isFile())
        throw new Error(`${file} is not a file`);
    const src = readFileSync(file, 'utf8');
    const header = [];
    for (const line of src.split('\n')) {
        if (/^\s*\/\//.test(line))
            header.push(line.trim());
        else if (line.trim())
            break;
    }
    // The room holds nothing from the host — a pulled board is someone else's code (scenes-vm.ts).
    let win;
    try {
        win = evaluateWindowScript(src, { filename: file });
    }
    catch (e) {
        throw new Error(`failed to evaluate ${file}: ${e.message}`);
    }
    if (!Array.isArray(win.SCENES))
        throw new Error(`${file} has no window.SCENES array`);
    return { file, header, win, sha256: createHash('sha256').update(src).digest('hex') };
}
/** The order the schema document lists the blocks in; anything else follows alphabetically. */
const GLOBAL_ORDER = ['FORMAT', 'VOICE', 'THEME', 'COMPREHENSION', 'STORY', 'PRODUCTION', 'MOTION_POLICY', 'MUSIC', 'SFX', 'STRUCTURE', 'SCENES'];
export function serializeBoard(win, header = []) {
    const keys = Object.keys(win).filter((k) => win[k] !== undefined);
    keys.sort((a, b) => {
        const ia = GLOBAL_ORDER.indexOf(a), ib = GLOBAL_ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1)
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
    });
    const lines = header.filter((h) => !/^\/\/\s*approved:/.test(h));
    if (lines.length)
        lines.push('');
    for (const k of keys) {
        const value = k === 'SCENES' && Array.isArray(win[k])
            ? win[k].map((shot) => shot.id === undefined ? shot : ({ id: shot.id, ...shot }))
            : win[k];
        lines.push(`window.${k} = ${JSON.stringify(value, null, 2)};`);
    }
    return lines.join('\n') + '\n';
}
function upsertBy(list, items, key) {
    const out = list.slice();
    for (const item of items) {
        const i = out.findIndex((x) => x[key] === item[key]);
        if (i === -1)
            out.push(item);
        else
            out[i] = item;
    }
    return out;
}
/** Validate every shot against the shot schema; findings, not exceptions, so a board reports all of them at once. */
export function validateShots(shots) {
    const out = [];
    const ids = new Map();
    shots.forEach((s, i) => {
        const parsed = shotSchema.safeParse(s);
        if (!parsed.success) {
            for (const issue of parsed.error.issues)
                out.push({ level: 'bad', where: `shot ${i + 1}`, what: issue.path.length === 1 && issue.path[0] === 'id'
                        ? 'id: expected s followed by at least four digits (for example s0001)'
                        : `${issue.path.join('.') || '(root)'}: ${issue.message}` });
        }
        const id = s && typeof s === 'object' ? s.id : undefined;
        if (typeof id !== 'string')
            return;
        const first = ids.get(id);
        if (first !== undefined)
            out.push({ level: 'bad', where: `shot ${i + 1}`, what: `id: duplicate ${id} (already used by shot ${first})` });
        else
            ids.set(id, i + 1);
    });
    return out;
}
export function validateStructure(structure) {
    const parsed = structureSchema.safeParse(structure);
    if (parsed.success)
        return [];
    return parsed.error.issues.map((issue) => ({ level: 'bad', where: 'structure', what: `${issue.path.join('.') || '(root)'}: ${issue.message}` }));
}
/** Apply a patch in memory — the pure half of storyboard_apply, so a test or an API handler can run it without a file. */
export function applyPatch(win, patch, opts = {}) {
    const next = { ...win };
    if (patch.globals)
        for (const [k, v] of Object.entries(patch.globals)) {
            if (k === 'SCENES' || k === 'STRUCTURE')
                throw new Error(`set ${k} through the dedicated fields, not globals`);
            next[k] = v;
        }
    const boardMotionTheme = next.THEME?.motionGraphicTheme;
    if (boardMotionTheme)
        motionThemeContract().resolveTheme({ type: 'process', style: { theme: boardMotionTheme } });
    if (patch.propSheet)
        next.SB_DOC = { ...(next.SB_DOC ?? {}),
            props: patch.propSheet.props, propContinuity: patch.propSheet.continuity };
    if (patch.set) {
        if (patch.set.structure)
            next.STRUCTURE = patch.set.structure;
        next.SCENES = patch.set.shots.slice();
    }
    if (patch.structure)
        next.STRUCTURE = patch.structure;
    const st = next.STRUCTURE ?? { version: STRUCTURE_VERSION, sequences: [], scenes: [] };
    if (!Array.isArray(st.sequences) || !Array.isArray(st.scenes) || st.scenes.some((sc) => !sc || typeof sc !== 'object')
        || st.sequences.some((q) => !q || typeof q !== 'object' || !Array.isArray(q.scenes)))
        return { win: next, findings: [{ level: 'bad', where: 'structure', what: 'STRUCTURE.sequences and STRUCTURE.scenes are arrays of objects — this board was hand-edited into a shape the tools cannot patch; rewrite it with `set`' }], synced: 0 };
    let sequences = st.sequences.slice();
    let scenes = st.scenes.slice();
    if (patch.sequences)
        sequences = upsertBy(sequences, patch.sequences, 'id');
    if (patch.scenes)
        scenes = upsertBy(scenes, patch.scenes, 'no');
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
        next.STRUCTURE = { version: st.version ?? STRUCTURE_VERSION, ...(st.nextShotId === undefined ? {} : { nextShotId: st.nextShotId }), sequences, scenes }; // an older version is kept so check() reports it, never silently upgraded
    let shots = Array.isArray(next.SCENES) ? next.SCENES.slice() : [];
    // Shots are addressed either by position (shots · insertShots.after · removeShots) or by id
    // (shotsById · insertShots.afterId · removeShotIds, R7) — never both in one patch: a position
    // read before an id-resolved remove is a different shot after it.
    const byPosition = Boolean(patch.shots || patch.removeShots || patch.insertShots?.some((e) => e.after !== undefined));
    const byId = Boolean(patch.shotsById || patch.removeShotIds || patch.insertShots?.some((e) => e.afterId !== undefined));
    if (byPosition && byId)
        throw new Error('address shots by position (shots · after · removeShots) or by id (shotsById · afterId · removeShotIds) in one patch, not both');
    const positionOfId = (id, list, what) => {
        const index = list.findIndex((shot) => shot.id === id);
        if (index < 0)
            throw new Error(`${what}: no shot with id ${id} on this board`);
        return index;
    };
    if (patch.shotsById)
        for (const { id, shot } of patch.shotsById) {
            const index = positionOfId(id, shots, 'shotsById');
            if (shot.id !== undefined && shot.id !== id)
                throw new Error(`shotsById ${id}: the shot carries a different id (${shot.id}) — an id is not renamed through an upsert`);
            shots[index] = { id, ...shot };
        }
    if (patch.shots)
        for (const { no, shot } of patch.shots.slice().sort((a, b) => a.no - b.no)) {
            if (no > shots.length + 1)
                throw new Error(`shot ${no}: the board has ${shots.length} shots — no = ${shots.length + 1} appends`);
            const current = shots[no - 1];
            shots[no - 1] = shot.id === undefined && current?.id !== undefined ? { id: current.id, ...shot } : shot;
        }
    const beforeReorder = shots.slice();
    if (patch.removeShots) {
        const drop = new Set(patch.removeShots);
        for (const no of drop)
            if (no > shots.length)
                throw new Error(`removeShots: there is no shot ${no}`);
        shots = shots.filter((_, i) => !drop.has(i + 1));
    }
    if (patch.removeShotIds) {
        const drop = new Set(patch.removeShotIds.map((id) => positionOfId(id, shots, 'removeShotIds')));
        shots = shots.filter((_, i) => !drop.has(i));
    }
    if (patch.insertShots) {
        // afterId resolves against the board after the removes, like a position does.
        const resolved = patch.insertShots.map((e) => ({
            after: e.after !== undefined ? e.after : positionOfId(e.afterId, shots, 'insertShots.afterId') + 1,
            shots: e.shots,
        }));
        // Highest position first, so earlier inserts don't shift later ones.
        const inserts = resolved.sort((a, b) => b.after - a.after);
        for (const { after, shots: add } of inserts) {
            if (after > shots.length)
                throw new Error(`insertShots: after ${after} is past the last shot (${shots.length})`);
            shots.splice(after, 0, ...add);
        }
    }
    // Existing references name pre-reorder shots. Inserted records use final positions.
    const finalOrder = shots.slice();
    // Any reorder — by position or by id (R7) — has to walk the references; a removeShotIds-only
    // patch used to skip this and leave matchShot pointing at the wrong position (review P2).
    const reordered = Boolean(patch.removeShots || patch.removeShotIds || patch.insertShots);
    for (const source of reordered ? finalOrder : []) {
        if (!beforeReorder.includes(source))
            continue;
        const e = source.shot?.eyeline;
        if (e && typeof e.matchShot === 'number') {
            const target = beforeReorder[e.matchShot - 1];
            const index = finalOrder.indexOf(target);
            if (index < 0)
                throw new Error('eyeline.matchShot target was removed or missing; update the relation in the same patch');
            const position = finalOrder.indexOf(source);
            shots[position] = { ...source, shot: { ...source.shot, eyeline: { ...e, matchShot: index + 1 } } };
        }
    }
    const transitionTargets = new Set();
    for (const change of patch.transitions ?? []) {
        const source = shots[change.no - 1];
        if (!source)
            throw new Error(`transitions: there is no shot ${change.no}`);
        if (transitionTargets.has(change.no))
            throw new Error(`transitions: duplicate shot ${change.no}`);
        transitionTargets.add(change.no);
        if (['broll', 'outro'].includes(source.type))
            throw new Error('Spliced shots use their own assembly transition');
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
        const edit = { ...(source.edit ?? {}), reason: change.reason };
        if (!moving || source.transition !== change.transition)
            delete edit.transitionSeconds;
        if (change.transitionSeconds !== undefined)
            edit.transitionSeconds = change.transitionSeconds;
        if (change.continuity !== undefined)
            edit.continuity = change.continuity;
        if (moving && Number(edit.pre ?? 0) !== 0)
            throw new Error('Moving transitions require edit.pre=0; update the shot timing first');
        shots[change.no - 1] = { ...source, transition: change.transition, edit };
    }
    const originalShots = Array.isArray(win.SCENES) ? win.SCENES : [];
    const numericId = (shot) => typeof shot.id === 'string' && /^s\d{4,}$/.test(shot.id) ? Number(shot.id.slice(1)) : 0;
    const priorCounter = win.STRUCTURE && Number.isInteger(win.STRUCTURE.nextShotId) ? win.STRUCTURE.nextShotId : undefined;
    const requestedCounter = Number.isInteger(st.nextShotId) ? st.nextShotId : undefined;
    let nextShotId = Math.max(priorCounter ?? 0, requestedCounter ?? 0, ...shots.map(numericId).map((id) => id + 1), ...(priorCounter === undefined && requestedCounter === undefined
        ? [Math.max(originalShots.length, ...originalShots.map(numericId)) + 1]
        : []), 1);
    shots = shots.map((shot) => {
        if (shot.id !== undefined)
            return shot;
        const id = `s${String(nextShotId).padStart(4, '0')}`;
        nextShotId += 1;
        return { id, ...shot };
    });
    if (next.STRUCTURE)
        next.STRUCTURE = { ...next.STRUCTURE, nextShotId };
    next.SCENES = shots.map((shot) => shot.shot?.motionGraphic && (shot.shot.motionGraphic.style.theme || next.THEME?.motionGraphicTheme) ? motionThemeContract().applyTheme({ ...shot }, next.THEME?.motionGraphicTheme) : { ...shot }); // sync() writes sceneSlug/sequence — never into the caller's objects
    const findings = [];
    if (!shots.length && !opts.outline)
        findings.push({ level: 'bad', where: 'board', what: 'the board has no shots' });
    if (win.STORY?.authoring === 'story-first' && next.STORY?.authoring !== 'story-first')
        findings.push({ level: 'bad', where: 'STORY', what: 'story_order: STORY.authoring "story-first" stays on a board started with story_sequence' });
    if (next.STRUCTURE !== undefined)
        findings.push(...validateStructure(next.STRUCTURE));
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
export function applyStoryboard(args, opts = {}) {
    const file = scenesPath(args.path);
    const exists = existsSync(file);
    let header = [];
    let win = {};
    if (exists)
        ({ header, win } = readBoard(file));
    else if (!args.set && !opts.outline)
        throw new Error(`no scenes.js at ${file} — a new board is written with \`set\` (structure + shots)`);
    else if (!opts.outline && workflowEpisode(dirname(file)))
        throw new Error('story_order: a new episode board starts with story_sequence → story_scene → story_shot');
    else if (!existsSync(dirname(file)))
        throw new Error(`directory does not exist: ${dirname(file)}`);
    const original = exists ? readFileSync(file, 'utf8') : '';
    const originalHash = createHash('sha256').update(original).digest('hex');
    const previousDoc = win.SB_DOC;
    const incomingDoc = args.globals?.SB_DOC;
    const changesProps = !!args.propSheet || (!!args.globals && Object.prototype.hasOwnProperty.call(args.globals, 'SB_DOC')
        && ['props', 'propContinuity'].some(key => JSON.stringify(previousDoc?.[key]) !== JSON.stringify(incomingDoc?.[key])));
    if (changesProps && exists && args.expectedSha256 !== originalHash)
        throw new Error('head_moved: propSheet requires the current expectedSha256 from storyboard_read');
    const { win: next, findings, synced } = applyPatch(win, args, opts);
    const bad = findings.some((f) => f.level === 'bad');
    const st = next.STRUCTURE;
    const result = {
        file, written: false, created: !exists, approvalDropped: header.some((h) => /^\/\/\s*approved:/.test(h)),
        shots: (next.SCENES ?? []).length, scenes: st ? st.scenes.length : 0, sequences: st ? st.sequences.length : 0,
        synced, findings,
    };
    if (bad || args.dryRun)
        return result;
    // Same-directory temp file + rename: a crash mid-write never leaves a truncated scenes.js behind.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
        if (changesProps && exists) {
            if (createHash('sha256').update(readFileSync(file)).digest('hex') !== originalHash)
                throw new Error('head_moved');
            const history = join(dirname(file), '.prop-history');
            mkdirSync(history, { recursive: true });
            const backup = join(history, originalHash + '.js');
            if (!existsSync(backup))
                writeFileSync(backup, original, { flag: 'wx' });
        }
        writeFileSync(tmp, serializeBoard(next, header), 'utf8');
        renameSync(tmp, file);
    }
    catch (err) {
        try {
            unlinkSync(tmp);
        }
        catch { /* nothing to clean */ }
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
const emptyStructure = () => ({ version: STRUCTURE_VERSION, sequences: [], scenes: [] });
function readOutline(path) {
    const file = scenesPath(path);
    const win = existsSync(file) ? readBoard(file).win : {};
    return { win, st: win.STRUCTURE ?? emptyStructure() };
}
function writeOutline(path, win, structure, shots) {
    return applyStoryboard({
        path, draft: true, dryRun: false, structure,
        ...(shots?.length ? { set: { structure, shots } } : {}),
        // A board the story tools start is story-first: every writer keeps its layer order (structure-contract.js).
        ...(win.STORY ? {} : { globals: { STORY: { version: 'story-v2', authoring: 'story-first' } } }),
    }, { outline: true });
}
export function writeStorySequences(args) {
    const { win, st } = readOutline(args.path);
    const sequences = upsertBy(st.sequences, args.sequences.map((q) => ({ ...st.sequences.find((old) => old.id === q.id), ...q, scenes: st.sequences.find((old) => old.id === q.id)?.scenes ?? [] })), 'id');
    return writeOutline(args.path, win, { ...st, sequences });
}
export function writeStoryScenes(args) {
    const { win, st } = readOutline(args.path);
    if (!st.sequences.length)
        throw new Error('story_order: write the sequences first with story_sequence');
    let { sequences, scenes } = st;
    for (const { sequence, ...scene } of args.scenes) {
        if (!sequences.some((q) => q.id === sequence))
            throw new Error(`story_order: sequence ${sequence} does not exist — write it with story_sequence`);
        scenes = upsertBy(scenes, [{ ...scenes.find((old) => old.no === scene.no), ...scene }], 'no');
        sequences = sequences.map((q) => q.id === sequence
            ? (q.scenes.includes(scene.no) ? q : { ...q, scenes: [...q.scenes, scene.no] })
            : { ...q, scenes: q.scenes.filter((no) => no !== scene.no) });
    }
    return writeOutline(args.path, win, { ...st, sequences, scenes });
}
export function writeStoryShots(args) {
    const { win, st } = readOutline(args.path);
    if (!st.scenes.length)
        throw new Error('story_order: write the scenes first with story_scene');
    const order = st.sequences.flatMap((q) => q.scenes);
    const shots = Array.isArray(win.SCENES) ? win.SCENES.slice() : [];
    for (const { id, ...story } of args.shots) {
        if (!order.includes(story.scene))
            throw new Error(`story_order: scene ${story.scene} is not in a sequence — write it with story_scene`);
        if (id) {
            const index = shots.findIndex((shot) => shot.id === id);
            if (index < 0)
                throw new Error(`story_shot: no shot with id ${id} on this board`);
            shots[index] = { ...shots[index], ...story };
            continue;
        }
        // A new shot plays after the last shot of its scene or of any earlier scene.
        const rank = order.indexOf(story.scene);
        let at = 0;
        shots.forEach((shot, i) => { if (shot.scene !== undefined && order.indexOf(shot.scene) <= rank)
            at = i + 1; });
        shots.splice(at, 0, { type: 'points', ...story });
    }
    return writeOutline(args.path, win, st, shots);
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
/** Character ids the episode can use: SB_DOC.characters on the board and the storyboard/cast.json snapshot. */
function castRegistry(path, win) {
    const ids = new Set();
    const add = (list) => {
        const entries = Array.isArray(list) ? list : Object.entries(list ?? {}).map(([id, value]) => ({ ...value, id }));
        for (const entry of entries)
            if (typeof entry?.id === 'string')
                ids.add(entry.id);
    };
    add(win.SB_DOC?.characters);
    const snapshot = join(dirname(scenesPath(path)), 'cast.json');
    if (existsSync(snapshot))
        add(JSON.parse(readFileSync(snapshot, 'utf8')).characters);
    if (!ids.size)
        throw new Error('cast_required: snapshot the episode cast in storyboard/cast.json first (storyboard §1)');
    return ids;
}
function shotIndex(shots, id, tool) {
    const index = shots.findIndex((shot) => shot.id === id);
    if (index < 0)
        throw new Error(`${tool}: no shot with id ${id} on this board`);
    return index;
}
export function writeShotCharacters(args) {
    const { win, st } = readOutline(args.path);
    const gaps = contract().outlineGaps(win);
    if (gaps.length)
        throw new Error('story_order: finish the story first (story_sequence → story_scene → story_shot) — ' + gaps.join('; '));
    const known = castRegistry(args.path, win);
    const shots = (win.SCENES ?? []).slice();
    for (const { id, characters } of args.shots) {
        const index = shotIndex(shots, id, 'shot_characters');
        for (const character of characters)
            if (!known.has(character))
                throw new Error(`cast_unknown: ${character} is not in the episode cast`);
        const visual = (shots[index].visual ?? {});
        // A kept character keeps its { id, scope } entry.
        const scoped = [].concat(visual.character ?? []).filter((e) => !!e && typeof e === 'object');
        const entries = characters.map((character) => scoped.find((e) => e.id === character) ?? character);
        shots[index] = { ...shots[index], visual: { ...visual, character: entries.length ? entries : null } };
    }
    return writeOutline(args.path, win, st, shots);
}
export function writeShotDialogue(args) {
    const { win, st } = readOutline(args.path);
    const known = castRegistry(args.path, win);
    const shots = (win.SCENES ?? []).slice();
    const used = new Set(shots.flatMap((shot) => (shot.narration ?? []).map((line) => line.id).filter(Boolean)));
    for (const { id, lines } of args.shots) {
        const index = shotIndex(shots, id, 'shot_dialogue');
        const cast = contract().castOf(shots[index]);
        if (!cast)
            throw new Error(`story_order: set ${id}'s characters with shot_characters before its lines`);
        const old = shots[index].narration ?? [];
        for (const line of old)
            if (line.id)
                used.delete(line.id);
        const next = lines.map((line, n) => {
            if (!known.has(line.speaker))
                throw new Error(`cast_unknown: speaker ${line.speaker} is not in the episode cast`);
            const delivery = line.delivery ?? (cast.includes(line.speaker) ? 'on_screen' : 'voiceover');
            if (delivery === 'on_screen' && !cast.includes(line.speaker))
                throw new Error(`story_order: ${line.speaker} speaks on screen in ${id} but is not among its characters — add them with shot_characters`);
            let lineId = line.id;
            for (let k = n + 1; !lineId; k++)
                if (!used.has(`${id}-l${k}`))
                    lineId = `${id}-l${k}`;
            if (used.has(lineId))
                throw new Error(`shot_dialogue: line id ${lineId} is already used`);
            used.add(lineId);
            // A line revised by its id keeps its acting and audio binding; a changed text makes that audio stale.
            return { ...(line.id ? old.find((o) => o.id === line.id) : undefined), id: lineId, speaker: line.speaker, delivery, tts: line.tts, sub: line.sub };
        });
        shots[index] = { ...shots[index], narration: next };
    }
    return writeOutline(args.path, win, st, shots);
}
// Step 3: the attributes the review's icon row shows (user directive 2026-10-31).
const choice = z.object({ id: nonEmpty, reason: nonEmpty }).strict();
export const shotIconsSchema = z.object({
    path: outlinePath,
    shots: z.array(z.object({
        id: shotIdSchema,
        render: z.object({ mode: tuple(V.RENDER_MODES), purpose: nonEmpty.optional(), reason: nonEmpty }).strict().optional()
            .describe('Render route: shot.render'),
        size: tuple(V.SIZES).optional(),
        why: nonEmpty.optional().describe('Why this size'),
        angle: tuple(V.ANGLES).optional(),
        move: choice.extend({ target: nonEmpty.optional() }).strict().optional()
            .describe('A camera technique with a movement; on a still_camera cut, the still effect (push, pan, focus-in …)'),
        focus: choice.nullable().optional().describe('A camera technique with a focus field (camera.rack-focus); null removes it'),
        depth: depthSchema.optional(),
        frames: z.object({ mode: z.enum(['first', 'first_last', 'reference']), reason: nonEmpty, endState: nonEmpty.optional() }).strict().optional()
            .describe('Frame plan: reference is MSR (subject images + start image)'),
    }).strict()).min(1),
}).strict();
export function writeShotIcons(args) {
    const { win, st } = readOutline(args.path);
    const gaps = [...contract().outlineGaps(win), ...contract().castGaps(win)];
    if (gaps.length)
        throw new Error('story_order: write the story and every shot\'s characters first (story_shot → shot_characters) — ' + gaps.join('; '));
    const catalog = Object.fromEntries(techniqueContract().entries.map((entry) => [String(entry.id), entry]));
    const field = (id, name) => catalog[id]?.category === 'camera' ? catalog[id].fields[name] : undefined;
    const shots = (win.SCENES ?? []).slice();
    for (const { id, render, size, why, angle, move, focus, depth, frames } of args.shots) {
        const index = shotIndex(shots, id, 'shot_icons');
        const plan = { ...(shots[index].shot ?? {}) };
        const visual = { ...(shots[index].visual ?? {}) };
        const routed = { ...plan.render, ...render };
        if (render)
            plan.render = routed;
        if (size)
            plan.size = size;
        if (why)
            plan.why = why;
        if (angle)
            plan.angle = angle;
        if (depth) {
            const errors = contract().validateDepth(depth);
            if (errors.length)
                throw new Error(`shot_icons ${id}: depth — ${errors.join('; ')}`);
            plan.depth = depth;
        }
        let techniques = (Array.isArray(plan.techniques) ? plan.techniques : []);
        if (move && routed.mode === 'still_camera') {
            // A still cut moves the window over the picture (render-routing.js STILL_CAMERA_EFFECTS).
            if (!stillCameraEffectList().includes(move.id))
                throw new Error(`shot_icons ${id}: a still_camera move is one of ${stillCameraEffectList().join(', ')}`);
            plan.render = { ...routed, camera: { ...routed.camera, effect: move.id, reason: move.reason, ...(move.target ? { target: move.target } : {}) } };
        }
        else if (move) {
            const movement = field(move.id, 'movement');
            if (!movement)
                throw new Error(`shot_icons ${id}: ${move.id} is not a camera move in the technique catalog`);
            techniques = [...techniques.filter((t) => !field(t.id, 'movement')), { id: move.id, reason: move.reason }];
            const camera = (visual.camera ?? {});
            // film-techniques.js findings: visual.camera.movement starts with the technique's movement.
            visual.camera = { ...camera, movement: String(camera.movement ?? '').toLowerCase().startsWith(movement) ? camera.movement : movement,
                ...(field(move.id, 'speed') ? { speed: field(move.id, 'speed') } : {}), ...(move.target ? { target: move.target } : {}) };
        }
        if (focus !== undefined) {
            if (focus && !field(focus.id, 'focus'))
                throw new Error(`shot_icons ${id}: ${focus.id} is not a focus technique`);
            techniques = [...techniques.filter((t) => !field(t.id, 'focus')), ...(focus ? [focus] : [])];
        }
        if ((move && routed.mode !== 'still_camera') || focus !== undefined)
            plan.techniques = techniques;
        if (frames)
            visual.frames = { ...visual.frames, ...frames };
        shots[index] = { ...shots[index], shot: plan, visual };
    }
    return writeOutline(args.path, win, st, shots);
}
// Step 4: each shot's start image — and an end image when its frame plan is first_last — composed
// from its characters' sheet panels, its place and props (user directive 2026-10-31).
export const shotImageSchema = z.object({
    path: outlinePath,
    id: shotIdSchema,
    frame: z.enum(['start', 'end']).default('start').describe('start: the first image; end: the last image of a first_last shot'),
    prompt: nonEmpty.describe('What the frame shows, in English: who is where, doing what, facing which way, expression and light'),
    location: nonEmpty.optional().describe('SB_DOC.locations id of the place; an earlier call\'s choice stays when omitted'),
    props: z.array(nonEmpty).optional().describe('SB_DOC.props ids seen in the frame; an earlier call\'s choice stays when omitted'),
    size: z.string().regex(/^\d{3,4}x\d{3,4}$/).optional().describe('Output WIDTHxHEIGHT; default 1536x1024 for a 16:9 board, 1024x1536 otherwise'),
    reserveUsd: z.number().finite().nonnegative().optional(),
}).strict();
// Image models that take several pictures in one request; astra-genai edits one picture, zimage none.
const IMAGE_INPUTS = {
    'gpt-image': { tool: 'gpt_image_img2img', max: 16 }, 'astra-genai-native': { tool: 'astra_genai_image_edit', max: 10 },
    mlx: { tool: 'mlx_image_edit', max: 10 }, 'astra-genai': { tool: 'astra_genai_edit', max: 1 }, zimage: { max: 0 }, host: { max: Infinity },
};
const latin = (value) => typeof value === 'string' && value.trim() && !nonEnglishOutsideQuotes(value) ? value.trim() : '';
function castEntry(win, id) {
    const list = win.SB_DOC?.characters;
    const entries = Array.isArray(list) ? list : Object.entries(list ?? {}).map(([key, value]) => ({ ...value, id: key }));
    return entries.find((entry) => entry?.id === id);
}
/** The sheet panels assets/characters/<id>/panels.json names — face, headless front and back — in MSR order. */
function characterRefs(boardDir, win, shotId, ids, use) {
    const views = ids.length === 1 ? ['face', 'front', 'back'].map((view) => [ids[0], view]) : ['face', 'front'].flatMap((view) => ids.map((id) => [id, view]));
    const folders = new Map(ids.map((id) => {
        for (let dir = boardDir;; dir = dirname(dir)) {
            if (existsSync(join(dir, 'assets/characters', id, 'panels.json')))
                return [id, join(dir, 'assets/characters', id)];
            if (dirname(dir) === dir)
                throw new Error(`character_sheet_missing: ${id} has no assets/characters/${id}/panels.json`);
        }
    }));
    return views.flatMap(([id, view]) => {
        const panels = JSON.parse(readFileSync(join(folders.get(id), 'panels.json'), 'utf8')).panels ?? {};
        const file = panels[view]?.file;
        if (!file)
            return [];
        const physical = (castEntry(win, id)?.character?.physical) ?? {};
        const detail = latin(view === 'face' ? physical.appearance?.value : physical.outfit?.value);
        const purpose = (view === 'face' ? `${id}'s face and hair` : `${id}'s outfit, ${view}`) + (detail ? `: ${detail}` : '');
        return [{ id: `${shotId}-${id}-${view}`, path: relative(boardDir, join(folders.get(id), file)), role: 'character', use, purpose }];
    });
}
function docEntry(win, kind, id) {
    const list = win.SB_DOC?.[kind];
    const entry = (Array.isArray(list) ? list : []).find((item) => item?.id === id);
    if (!entry)
        throw new Error(`${kind === 'locations' ? 'location' : 'prop'}_unknown: ${id} is not in SB_DOC.${kind}`);
    return entry;
}
/** Plan inputs for shot_image: the ordered pictures, the assembled prompt and the adapter arguments. */
export function shotImageRequest(args) {
    const { win } = readOutline(args.path);
    const shots = win.SCENES ?? [];
    const shot = shots[shotIndex(shots, args.id, 'shot_image')];
    const plan = (shot.shot ?? {}), visual = (shot.visual ?? {});
    const frames = (visual.frames ?? {});
    if (args.frame === 'start') {
        const gaps = contract().iconGaps(win);
        if (gaps.length)
            throw new Error('story_order: set every shot\'s icon attributes with shot_icons first — ' + gaps.join('; '));
    }
    else if (frames.mode !== 'first_last')
        throw new Error(`story_order: ${args.id} plans ${frames.mode ?? 'no'} frames; an end image belongs to a first_last shot (shot_icons frames)`);
    else if (!frames.start)
        throw new Error(`story_order: make ${args.id}'s start image before its end image`);
    const boardDir = dirname(scenesPath(args.path)), episode = dirname(boardDir);
    const location = args.location ?? (typeof visual.locationId === 'string' ? visual.locationId : undefined);
    const props = args.props ?? (Array.isArray(visual.props) ? visual.props.filter((id) => typeof id === 'string') : []);
    const cast = contract().castOf(shot) ?? [];
    const place = location ? docEntry(win, 'locations', location).imageUrl : undefined;
    const refs = [
        ...characterRefs(boardDir, win, args.id, cast, frames.mode === 'reference' ? 'both' : 'image'),
        ...props.flatMap((id) => {
            const entry = docEntry(win, 'props', id), file = entry.references?.[0]?.path ?? entry.imageUrl;
            return typeof file === 'string' ? [{ id: `${args.id}-prop-${id}`, path: file, role: 'prop', use: 'image', purpose: `the ${id} prop` }] : [];
        }),
        // MSR takes the start image in its background slot, so the place only conditions the picture.
        ...(typeof place === 'string' ? [{ id: `${args.id}-place`, path: place, role: 'background', use: 'image', purpose: `the ${location} location` }] : []),
    ];
    // The edit starts from the place (or, for an end image, the start image); the rest are references.
    const ordered = args.frame === 'end' ? [{ path: frames.start, purpose: 'the opening picture of this shot' }, ...refs.filter((ref) => ref.role !== 'background')]
        : [...refs.filter((ref) => ref.role === 'background'), ...refs.filter((ref) => ref.role !== 'background')];
    const inputs = ordered.map((ref) => resolve(boardDir, ref.path));
    for (const file of inputs)
        if (!existsSync(file))
            throw new Error(`image_input_missing: ${file}`);
    const assemble = loadFromHere(join(REFERENCES_DIR, 'assemble-bg-prompt.js')).assemble;
    const style = loadFromHere(join(REFERENCES_DIR, 'production-mode.js')).shotStyle(win, shots.indexOf(shot));
    const body = assemble({ ...(args.frame === 'start' ? { size: plan.size, depth: plan.depth, techniques: plan.techniques } : {}), angle: plan.angle,
        style: style.preset ? style : null, scene: args.prompt, noPerson: !cast.length }).prompt;
    const roles = ordered.map((ref, i) => `Image ${i + 1} shows ${ref.purpose}.`).join(' ');
    const prompt = [ordered.length ? 'Compose one picture from these images.' : '', roles,
        args.frame === 'end' ? 'This is the last frame of the shot that opens on Image 1: keep its place, light and every identity, and change only what the action changed.' : '',
        body.charAt(0).toUpperCase() + body.slice(1)].filter(Boolean).join(' ');
    const { selection } = imageContext(episode, args.id);
    const adapter = IMAGE_INPUTS[selection.engine] ?? { max: 0 };
    if (inputs.length > adapter.max)
        throw new Error(`image_references_unsupported: the saved image model (${selection.engine}${selection.model ? ' ' + selection.model : ''}) takes ${adapter.max} picture(s); this frame composes ${inputs.length}. Choose a model that takes several pictures (gpt-image, astra-genai-native, mlx) with the user.`);
    const jobs = readImageState(episode)?.jobs ?? {};
    let k = 1;
    while (existsSync(join(boardDir, 'images', `${args.id}-${args.frame}-v${k}.png`)) || Object.hasOwn(jobs, `${args.id}-${args.frame}-v${k}`))
        k += 1;
    const requestId = `${args.id}-${args.frame}-v${k}`, file = join(boardDir, 'images', `${requestId}.png`);
    mkdirSync(dirname(file), { recursive: true });
    const [width, height] = (args.size ?? (/16x9/.test(String(win.FORMAT ?? '')) ? '1536x1024' : '1024x1536')).split('x').map(Number);
    const base64 = (f) => readFileSync(f).toString('base64');
    const edit = inputs.length > 0, tool = edit ? adapter.tool : undefined;
    const output = { outputPath: dirname(file), filename: basename(file) };
    const adapterArgs = selection.engine === 'host' ? { prompt, referenceImages: inputs, savePath: file, size: `${width}x${height}` }
        : selection.engine === 'gpt-image' ? { prompt, savePath: file, size: `${width}x${height}`, ...(edit ? { sourceImagesBase64: inputs.map(base64), sourceMimeType: /\.jpe?g$/i.test(inputs[0]) ? 'image/jpeg' : 'image/png' } : {}) }
            : selection.engine === 'astra-genai' ? { prompt, size: `${width}*${height}`, ...output, ...(edit ? { mode: 'img2img', imagePath: inputs[0] } : {}) }
                : ['mlx', 'zimage'].includes(selection.engine) ? { prompt, width, height, ...output, ...(edit ? { imagePath: inputs[0], refImagePaths: inputs.slice(1) } : {}) }
                    : { prompt, size: `${width}x${height}`, ...output, ...(edit ? { imagePath: inputs[0], refImagePaths: inputs.slice(1), mode: 'edit' } : {}) };
    return { episode, assetId: args.id, requestId, ...(tool ? { tool } : {}), operation: edit ? 'edit' : 'text', args: adapterArgs, file, inputs,
        refs, ...(location ? { location } : {}), props, prompt };
}
/** Record a generated (or host-handed) frame on the board: frames.start/bg or frames.end, with its inputs. */
export function recordShotImage(args, request) {
    const { win, st } = readOutline(args.path);
    const shots = (win.SCENES ?? []).slice();
    const index = shotIndex(shots, args.id, 'shot_image');
    const visual = { ...(shots[index].visual ?? {}) };
    const rel = relative(dirname(scenesPath(args.path)), request.file);
    visual.frames = { ...visual.frames, [args.frame]: rel };
    if (args.frame === 'start')
        Object.assign(visual, { bg: rel, bgPrompt: request.prompt, references: request.refs, props: request.props,
            ...(request.location ? { locationId: request.location } : {}) });
    else
        visual.endPrompt = request.prompt;
    shots[index] = { ...shots[index], visual };
    return writeOutline(args.path, win, st, shots);
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
export function writeShotPrompt(args) {
    const { win, st } = readOutline(args.path);
    const gaps = contract().imageGaps(win);
    if (gaps.length)
        throw new Error('story_order: make every shot\'s start image, and the end image a first_last plan needs, with shot_image first — ' + gaps.join('; '));
    const shots = (win.SCENES ?? []).slice();
    const index = shotIndex(shots, args.id, 'shot_prompt');
    const shot = shots[index], plan = (shot.shot ?? {}), visual = (shot.visual ?? {});
    const mode = plan.render?.mode;
    if (mode !== 'generated_video')
        throw new Error(`shot_prompt: ${args.id} is a ${mode ?? 'unrouted'} cut; only a generated_video cut takes a video prompt`);
    const frames = (visual.frames ?? {}), msr = frames.mode === 'reference';
    const words = loadFromHere(join(REFERENCES_DIR, 'assemble-bg-prompt.js'));
    const travels = loadFromHere(join(REFERENCES_DIR, 'production-mode.js')).travels;
    const camera = (visual.camera ?? {});
    const movement = String(camera.movement ?? '').trim(), speed = String(camera.speed ?? '').trim();
    const focus = (plan.techniques ?? []).map((t) => techniqueContract().entries.find((e) => e.id === t.id))
        .find((e) => e?.fields?.focus);
    const sentence = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/[.!?\s]*$/, '') + '.' : '';
    // MSR pins no frame, so its prompt carries the framing; video_plan adds MSR's lines with their image bindings.
    const prompt = [
        msr ? sentence([words.SIZE_WORDS[String(plan.size)], words.ANGLE_WORDS[String(plan.angle)]].filter(Boolean).join(', ')) : 'Start from the given first frame.',
        msr && plan.depth ? sentence(contract().depthText(plan.depth)) : '',
        !movement ? '' : sentence(/^(static|fixed|locked)/i.test(movement) ? 'Camera: static' : `Camera: ${[speed, movement].filter(Boolean).join(' ')}` +
            (camera.target ? ` toward ${camera.target}` : '') + (travels(camera) ? ', with a short pause on the opening and closing pictures' : '')),
        focus ? sentence(`${focus.label?.en ?? 'Rack focus'} from the near subject to the far subject`) : '',
        sentence(args.action),
        ...(msr ? [] : (shot.narration ?? []).filter((line) => line.delivery === 'on_screen' && line.tts).map((line) => sentence(`${latin(String(castEntry(win, String(line.speaker))?.name ?? '')) || line.speaker} says: "${line.tts}"`))),
        frames.mode === 'first_last' ? sentence(`End on the given last frame${args.end ? ': ' + args.end : ''}`) : args.end ? sentence(`End on ${args.end}`) : '',
        // The builder lays the episode bed under every cut; a clip that makes its own music doubles it.
        sentence(`Audio: ${args.sound ? args.sound + (MUSIC_WORD.test(args.sound) ? '' : ', no music') : 'no music'}`),
    ].filter(Boolean).join(' ');
    const foreign = nonEnglishOutsideQuotes(prompt);
    if (foreign)
        throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks; write action, end and sound in English`);
    shots[index] = { ...shot, visual: { ...visual, video: { ...visual.video, prompt } } };
    return { ...writeOutline(args.path, win, st, shots), prompt };
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
export function checkScenario(args, checkFile = CHECK_SCENARIO_FILE) {
    let raw = '';
    try {
        raw = execFileSync(process.execPath, [checkFile, args.path, '--json'], {
            encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    catch (e) {
        const err = e;
        raw = err.stdout || '';
        if (err.status !== 1 || !raw.trim()) {
            throw new Error(`check-scenario.js failed: ${(err.stderr || err.message).trim()}`);
        }
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`check-scenario.js returned no JSON: ${raw.slice(0, 400)}`);
    }
    return scenarioCheckResultSchema.parse(parsed);
}
/** storyboard_check — the structure rules here plus the full scenes.js contract from check-scenes.js. */
export function checkStoryboard(args) {
    const { file, win } = readBoard(args.path);
    const seen = new Set();
    const structure = contract().guidedCheck(win, { draft: args.draft }).concat(validateShots(win.SCENES ?? [])).filter(f => {
        const key = f.level + '\0' + f.where + '\0' + f.what;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    const argv = [CHECK_SCENES_FILE, file, '--json'];
    if (args.draft)
        argv.push('--draft');
    let raw = '';
    try {
        raw = execFileSync(process.execPath, argv, { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    catch (e) {
        const err = e;
        raw = err.stdout || '';
        if (!raw.trim())
            throw new Error(`check-scenes.js failed: ${(err.stderr || err.message).trim()}`);
    }
    let parsed = {};
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`check-scenes.js returned no JSON: ${raw.slice(0, 400)}`);
    }
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
export function renderFindings(findings) {
    if (!findings.length)
        return '  (none)';
    const mark = { bad: '!', warn: '·', later: '…' };
    return findings.map((f) => `  ${mark[f.level]} ${f.where.padEnd(12)} ${f.what}`).join('\n');
}
export function renderApply(r) {
    const bad = r.findings.filter((f) => f.level === 'bad');
    const head = r.written
        ? `${r.created ? 'Created' : 'Wrote'} ${r.file}`
        : bad.length ? `NOT written — ${bad.length} violation(s) in ${r.file}` : `Dry run — ${r.file} untouched`;
    const lines = [head, `  ${r.sequences} sequence(s) · ${r.scenes} scene(s) · ${r.shots} shot(s) · ${r.synced} shot label(s) synced from the structure`];
    if (r.approvalDropped && r.written)
        lines.push('  the stale `// approved:` line was dropped; existing task authorization is unchanged');
    lines.push('Findings:', renderFindings(r.findings));
    return lines.join('\n');
}
export function renderCheck(r) {
    const lines = [`scenes.js contract — ${r.format} · ${r.shots} shots${r.draft ? ' · story pass (--draft)' : ''}`,
        `  ${r.violations} violation(s), ${r.warnings} to look at${r.draft ? `, ${r.deferred} deferred to §4b` : ''}`,
        'Structure (sequences → scenes → shots):', renderFindings(r.structure),
        'Shot contract (check-scenes.js):', renderFindings(r.contract)];
    return lines.join('\n');
}
