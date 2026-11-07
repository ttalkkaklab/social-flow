import * as fs from 'node:fs';
import path from 'node:path';
// Namespace import: the bundle banner already declares a top-level `createRequire`.
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { atomicJson, canonicalPath } from './routing-files.js';
/**
 * A progress record, not a gate (user directive 2026-10-31): stages complete in any order and no
 * other tool consults this state. The one check left is the story order a story-v2 text
 * storyboard completes with.
 */
export const STAGES = ['characters', 'text_storyboard', 'context_review', 'props', 'backgrounds',
    'camera_review', 'blender_composition', 'image_storyboard', 'image_review', 'video', 'video_review'];
const stageSchema = z.enum(STAGES);
const entrySchema = z.object({ images: z.array(z.string().min(1)).optional(), id: z.string().min(1), text: z.string().min(1), image: z.string().min(1).optional(), blend: z.string().min(1).optional(), video: z.string().min(1).optional() }).strict();
const recordSchema = z.object({ stage: stageSchema, entries: z.array(entrySchema), notApplicable: z.string().optional(), hashes: z.record(z.string()).optional() }).passthrough();
const stateSchema = z.object({ version: z.literal(2), completed: z.array(recordSchema), active: recordSchema.optional() }).passthrough();
export const workflowSchema = z.object({
    episode: z.string().min(1), action: z.enum(['status', 'begin', 'complete', 'rewind']),
    stage: stageSchema.optional(), entries: z.array(entrySchema).optional(), notApplicable: z.string().optional(),
}).strict();
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stateFile = (episode) => path.join(episode, '.work/production-workflow.json');
/** The episode folder a path belongs to: the one with a workflow record or under data/<channel>/episodes/. */
export function workflowEpisode(directory) {
    let dir = canonicalPath(path.resolve(directory));
    for (;;) {
        if (fs.existsSync(stateFile(dir)) || /[/\\]data[/\\][^/\\]+[/\\]episodes[/\\][^/\\]+$/.test(dir))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
function read(episode) {
    if (!fs.existsSync(stateFile(episode)))
        return { version: 2, completed: [] };
    const raw = JSON.parse(fs.readFileSync(stateFile(episode), 'utf8'));
    return stateSchema.parse({ ...raw, version: 2, completed: raw.completed ?? [] });
}
export function manageWorkflow(raw) {
    const input = workflowSchema.parse(raw), episode = fs.realpathSync(input.episode);
    const folder = path.join(episode, '.work');
    fs.mkdirSync(folder, { recursive: true });
    const lock = path.join(folder, 'production-workflow.lock');
    let fd;
    try {
        fd = fs.openSync(lock, 'wx');
    }
    catch {
        throw new Error('workflow_busy: retry after the current transition');
    }
    try {
        const state = read(episode);
        if (input.action !== 'status' && !input.stage)
            throw new Error('workflow_stage_required');
        const stage = input.stage;
        if (input.action === 'begin') {
            state.active = { stage, entries: (input.entries ?? []).map(entry => ({ ...entry,
                    text: canonicalPath(path.resolve(episode, entry.text)), ...(entry.image ? { image: canonicalPath(path.resolve(episode, entry.image)) } : {}),
                    ...(entry.images ? { images: entry.images.map(file => canonicalPath(path.resolve(episode, file))) } : {}),
                    ...(entry.blend ? { blend: canonicalPath(path.resolve(episode, entry.blend)) } : {}),
                    ...(entry.video ? { video: canonicalPath(path.resolve(episode, entry.video)) } : {}),
                })), ...(input.notApplicable ? { notApplicable: input.notApplicable } : {}) };
        }
        else if (input.action === 'complete') {
            if (state.active?.stage !== stage)
                throw new Error('workflow_out_of_order: begin this stage first');
            if (stage === 'text_storyboard')
                requireStoryOutline(episode);
            const hashes = {};
            for (const entry of state.active.entries)
                for (const file of [entry.text, entry.image, ...(entry.images ?? []), entry.blend, entry.video])
                    if (file && fs.existsSync(file))
                        hashes[file] = digest(file);
            state.completed = [...state.completed.filter(record => record.stage !== stage), { ...state.active, hashes }];
            delete state.active;
        }
        else if (input.action === 'rewind') {
            state.completed = state.completed.filter(record => record.stage !== stage);
            if (state.active?.stage === stage)
                delete state.active;
        }
        if (input.action !== 'status')
            atomicJson(stateFile(episode), state);
        const done = new Set(state.completed.map(record => record.stage));
        return { ...state, next: state.active?.stage ?? STAGES.find(name => !done.has(name)) ?? 'done', episode };
    }
    finally {
        fs.closeSync(fd);
        fs.unlinkSync(lock);
    }
}
/**
 * A story-v2 text storyboard completes only once its story is written sequence → scene → shot story
 * and every shot has its characters (user directive 2026-10-31).
 */
function requireStoryOutline(episode) {
    const file = path.join(episode, 'storyboard/scenes.js');
    if (!fs.existsSync(file))
        return;
    const load = nodeModule.createRequire(import.meta.url);
    const board = load(fileURLToPath(new URL('../../skills/_shared/scenes-vm.js', import.meta.url))).evaluateWindowScript(fs.readFileSync(file, 'utf8'), { filename: file });
    if (board.STORY?.version !== 'story-v2')
        return;
    const contract = load(fileURLToPath(new URL('../../skills/storyboard/references/structure-contract.js', import.meta.url)));
    const gaps = [...contract.outlineGaps(board), ...contract.castGaps(board)];
    if (gaps.length)
        throw new Error('story_outline_required: ' + gaps.join('; '));
}
