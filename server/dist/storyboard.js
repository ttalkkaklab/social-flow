/**
 * Storyboard module — the sequence → scene → shot data behind three tools
 * (storyboard_read · storyboard_apply · storyboard_check).
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
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { z } from 'zod';
// ── Plugin tree ─────────────────────────────────────────────────
/** dist/bundle.js and dist/storyboard.js sit at the same depth — two up is the plugin root. */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REFERENCES_DIR = join(PLUGIN_ROOT, 'skills', 'storyboard', 'references');
export const CONTRACT_FILE = join(REFERENCES_DIR, 'structure-contract.js');
export const CHECK_SCENES_FILE = join(REFERENCES_DIR, 'check-scenes.js');
const loadFromHere = createRequire(import.meta.url);
let contractCache;
export function contract() {
    if (!contractCache)
        contractCache = loadFromHere(CONTRACT_FILE);
    return contractCache;
}
// ── Schemas ─────────────────────────────────────────────────────
const tuple = (list) => z.enum(list);
const V = contract().VOCAB;
const nonEmpty = z.string().trim().min(1);
export const STRUCTURE_VERSION = contract().VERSION;
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
export const structureSchema = z
    .object({
    version: z.literal(STRUCTURE_VERSION),
    sequences: z.array(sequenceSchema).min(1),
    scenes: z.array(sceneSchema).min(1),
})
    .strict();
/** The grammar half of a shot is exact; the visual plan and the machine layer pass through (scenes-schema.md owns them). */
export const shotSchema = z
    .object({
    type: tuple(V.TYPES),
    title: z.string().optional(),
    narration: z.array(z.object({ tts: z.string(), sub: z.string().optional() }).passthrough()).optional(),
    visual: z.record(z.unknown()).optional(),
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
        info: z.string().optional(),
        infoType: tuple(V.INFO_TYPES).optional(),
        share: z.string().optional(),
        shareType: tuple(V.SHARE_TYPES).optional(),
        space: z.record(z.unknown()).optional(),
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
});
export const storyboardCheckSchema = z.object({
    path: z.string().min(1).describe('The storyboard directory, or its scenes.js'),
    draft: z.boolean().default(false).describe('The story pass (storyboard §4a) — machine-layer absences are deferred, not violations'),
});
const globalsSchema = z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'a window.* global is UPPER_CASE'), z.unknown());
export const storyboardApplySchema = z.object({
    path: z.string().min(1).describe('The storyboard directory (scenes.js is created there when missing), or its scenes.js'),
    set: z.object({ structure: structureSchema, shots: z.array(shotSchema).min(1) }).optional()
        .describe('Replace the whole board — the structure and every shot. The way a new board is written'),
    structure: structureSchema.optional().describe('Replace window.STRUCTURE only'),
    sequences: z.array(sequenceSchema).optional().describe('Upsert sequences by id'),
    scenes: z.array(sceneSchema).optional().describe('Upsert scenes by no'),
    shots: z.array(z.object({ no: z.number().int().positive(), shot: shotSchema })).optional()
        .describe('Upsert shots by 1-based position; no = length + 1 appends'),
    insertShots: z.array(z.object({ after: z.number().int().min(0), shots: z.array(shotSchema).min(1) })).optional()
        .describe('Insert shots after a 1-based position (0 = at the start). Later positions shift'),
    removeShots: z.array(z.number().int().positive()).optional().describe('1-based positions to drop, resolved before the insert'),
    removeScenes: z.array(z.number().int().positive()).optional(),
    removeSequences: z.array(z.string()).optional(),
    globals: globalsSchema.optional().describe('Set other window.* blocks — FORMAT, THEME, COMPREHENSION, STORY, PRODUCTION, MUSIC, VOICE, MOTION_POLICY'),
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
    const win = {};
    const sandbox = { window: win, console: { log() { }, warn() { }, error() { } } };
    sandbox.globalThis = sandbox;
    try {
        vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
    }
    catch (e) {
        throw new Error(`failed to evaluate ${file}: ${e.message}`);
    }
    if (!Array.isArray(win.SCENES))
        throw new Error(`${file} has no window.SCENES array`);
    return { file, header, win };
}
/** The order the schema document lists the blocks in; anything else follows alphabetically. */
const GLOBAL_ORDER = ['FORMAT', 'VOICE', 'THEME', 'COMPREHENSION', 'STORY', 'PRODUCTION', 'MOTION_POLICY', 'MUSIC', 'STRUCTURE', 'SCENES'];
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
    for (const k of keys)
        lines.push(`window.${k} = ${JSON.stringify(win[k], null, 2)};`);
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
    shots.forEach((s, i) => {
        const parsed = shotSchema.safeParse(s);
        if (parsed.success)
            return;
        for (const issue of parsed.error.issues)
            out.push({ level: 'bad', where: `shot ${i + 1}`, what: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
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
export function applyPatch(win, patch) {
    const next = { ...win };
    if (patch.globals)
        for (const [k, v] of Object.entries(patch.globals)) {
            if (k === 'SCENES' || k === 'STRUCTURE')
                throw new Error(`set ${k} through the dedicated fields, not globals`);
            next[k] = v;
        }
    if (patch.set) {
        next.STRUCTURE = patch.set.structure;
        next.SCENES = patch.set.shots.slice();
    }
    if (patch.structure)
        next.STRUCTURE = patch.structure;
    const st = next.STRUCTURE ?? { version: STRUCTURE_VERSION, sequences: [], scenes: [] };
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
        next.STRUCTURE = { version: STRUCTURE_VERSION, sequences, scenes };
    let shots = Array.isArray(next.SCENES) ? next.SCENES.slice() : [];
    if (patch.shots)
        for (const { no, shot } of patch.shots) {
            if (no > shots.length + 1)
                throw new Error(`shot ${no}: the board has ${shots.length} shots — no = ${shots.length + 1} appends`);
            shots[no - 1] = shot;
        }
    if (patch.removeShots) {
        const drop = new Set(patch.removeShots);
        for (const no of drop)
            if (no > shots.length)
                throw new Error(`removeShots: there is no shot ${no}`);
        shots = shots.filter((_, i) => !drop.has(i + 1));
    }
    if (patch.insertShots) {
        // Highest position first, so earlier inserts don't shift later ones.
        const inserts = patch.insertShots.slice().sort((a, b) => b.after - a.after);
        for (const { after, shots: add } of inserts) {
            if (after > shots.length)
                throw new Error(`insertShots: after ${after} is past the last shot (${shots.length})`);
            shots.splice(after, 0, ...add);
        }
    }
    next.SCENES = shots;
    const findings = [];
    if (!shots.length)
        findings.push({ level: 'bad', where: 'board', what: 'the board has no shots' });
    if (next.STRUCTURE === undefined)
        findings.push({ level: 'bad', where: 'structure', what: 'no window.STRUCTURE — write the sequences and scenes (set, structure, sequences + scenes)' });
    else
        findings.push(...validateStructure(next.STRUCTURE));
    findings.push(...validateShots(shots));
    let synced = 0;
    if (!findings.some((f) => f.level === 'bad')) {
        synced = contract().sync(next);
        findings.push(...contract().check(next));
    }
    return { win: next, findings, synced };
}
/** storyboard_apply — read, patch, validate, write unless a violation or a dry run. */
export function applyStoryboard(args) {
    const file = scenesPath(args.path);
    const exists = existsSync(file);
    let header = [];
    let win = {};
    if (exists)
        ({ header, win } = readBoard(file));
    else if (!args.set)
        throw new Error(`no scenes.js at ${file} — a new board is written with \`set\` (structure + shots)`);
    else if (!existsSync(dirname(file)))
        throw new Error(`directory does not exist: ${dirname(file)}`);
    const { win: next, findings, synced } = applyPatch(win, args);
    const bad = findings.some((f) => f.level === 'bad');
    const st = next.STRUCTURE;
    const result = {
        file, written: false, created: !exists, approvalDropped: header.some((h) => /^\/\/\s*approved:/.test(h)),
        shots: (next.SCENES ?? []).length, scenes: st ? st.scenes.length : 0, sequences: st ? st.sequences.length : 0,
        synced, findings,
    };
    if (bad || args.dryRun)
        return result;
    writeFileSync(file, serializeBoard(next, header), 'utf8');
    result.written = true;
    return result;
}
/** storyboard_check — the structure rules here plus the full scenes.js contract from check-scenes.js. */
export function checkStoryboard(args) {
    const { file, win } = readBoard(args.path);
    const structure = contract().check(win);
    const argv = [CHECK_SCENES_FILE, file, '--json'];
    if (args.draft)
        argv.push('--draft');
    let raw = '';
    try {
        raw = execFileSync(process.execPath, argv, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
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
        lines.push('  the `// approved:` line was dropped — an edited board is approved again at the HITL gate');
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
