import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { manageProject } from './project.js';
import { atomicJson, canonicalPath } from './routing-files.js';
import { verifyImageFile } from './image-media.js';

export const STAGES = ['characters', 'text_storyboard', 'props', 'backgrounds', 'image_storyboard'] as const;
const stageSchema = z.enum(STAGES);
const entrySchema = z.object({ id: z.string().min(1), text: z.string().min(1), image: z.string().min(1).optional() }).strict();
const recordSchema = z.object({ stage: stageSchema, entries: z.array(entrySchema), notApplicable: z.string().optional(), hashes: z.record(z.string()).optional() }).strict();
const stateSchema = z.object({ version: z.literal(1), completed: z.array(recordSchema), active: recordSchema.optional() }).strict();
export const workflowSchema = z.object({
  episode: z.string().min(1), action: z.enum(['status', 'begin', 'complete', 'rewind']),
  stage: stageSchema.optional(), entries: z.array(entrySchema).optional(), notApplicable: z.string().optional(),
}).strict();
type State = z.infer<typeof stateSchema>;
const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stateFile = (episode: string) => path.join(episode, '.work/production-workflow.json');

/** Managed episodes cannot opt out by deleting their workflow file. */
export function workflowEpisode(directory: string): string | undefined {
  let dir = canonicalPath(path.resolve(directory));
  for (;;) {
    if (fs.existsSync(stateFile(dir)) || /[/\\]data[/\\][^/\\]+[/\\]episodes[/\\][^/\\]+$/.test(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
function readyProject(episode: string): void {
  let root = episode;
  while (!fs.existsSync(path.join(root, '.social-flow/models.json'))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error('project_setup_required: run project_manage init before authoring');
    root = parent;
  }
  const result = manageProject({ action: 'status', workspace: root });
  if (result.status !== 'ready') throw new Error('project_setup_required: ' + JSON.stringify(result.missing));
}
function read(episode: string): State {
  if (!fs.existsSync(stateFile(episode))) return { version: 1, completed: [] };
  const state = stateSchema.parse(JSON.parse(fs.readFileSync(stateFile(episode), 'utf8')));
  for (const [i, record] of state.completed.entries()) {
    if (record.stage !== STAGES[i] || !record.hashes) throw new Error('workflow_invalid_state');
    validateRecord(record);
    for (const entry of record.entries) {
      for (const file of [entry.text, entry.image].filter(Boolean) as string[]) {
        if (!/^[a-f0-9]{64}$/.test(record.hashes[file] ?? '')) throw new Error('workflow_invalid_state');
      }
    }
  }
  if (state.active && state.active.stage !== STAGES[state.completed.length]) throw new Error('workflow_invalid_state');
  return state;
}
function verifyPrevious(state: State): void {
  for (const record of state.completed) {
    for (const [file, hash] of Object.entries(record.hashes!)) {
      if (!fs.existsSync(file) || digest(file) !== hash) throw new Error(`workflow_stale: rewind ${record.stage}; changed ${file}`);
    }
  }
}
function validateRecord(record: z.infer<typeof recordSchema>): void {
  if (record.notApplicable) {
    if (!['characters', 'props', 'backgrounds'].includes(record.stage) || !record.notApplicable.trim() || record.entries.length) throw new Error('workflow_invalid_not_applicable');
  } else if (!record.entries.length) throw new Error('workflow_empty_stage');
  const ids = new Set<string>();
  for (const entry of record.entries) {
    if (ids.has(entry.id)) throw new Error('workflow_duplicate_asset_id');
    ids.add(entry.id);
    if (record.stage === 'text_storyboard' ? entry.image !== undefined : !entry.image) throw new Error('workflow_artifacts_required: text plus image, text only for text_storyboard');
  }
}
export function manageWorkflow(raw: unknown) {
  const input = workflowSchema.parse(raw), episode = fs.realpathSync(input.episode);
  readyProject(episode);
  const folder = path.join(episode, '.work');
  fs.mkdirSync(folder, { recursive: true });
  const lock = path.join(folder, 'production-workflow.lock');
  let fd: number;
  try { fd = fs.openSync(lock, 'wx'); } catch { throw new Error('workflow_busy: retry after the current transition'); }
  try {
    const state = read(episode);
    if (input.action === 'rewind') {
      const index = STAGES.indexOf(stageSchema.parse(input.stage));
      if (index > state.completed.length) throw new Error('workflow_out_of_order');
      state.completed = state.completed.slice(0, index);
      delete state.active;
    } else {
      verifyPrevious(state);
      if (input.action === 'begin') {
        if (state.active || input.stage !== STAGES[state.completed.length]) throw new Error(`workflow_out_of_order: next ${state.active?.stage ?? STAGES[state.completed.length] ?? 'video'}`);
        const record = { stage: stageSchema.parse(input.stage), entries: (input.entries ?? []).map(entry => ({ ...entry,
          text: canonicalPath(path.resolve(episode, entry.text)), ...(entry.image ? { image: canonicalPath(path.resolve(episode, entry.image)) } : {}),
        })), ...(input.notApplicable ? { notApplicable: input.notApplicable } : {}) };
        validateRecord(record);
        state.active = record;
      } else if (input.action === 'complete') {
        if (!state.active || state.active.stage !== input.stage) throw new Error('workflow_out_of_order: begin this stage first');
        validateRecord(state.active);
        const hashes: Record<string, string> = {};
        for (const entry of state.active.entries) {
          if (!fs.readFileSync(entry.text, 'utf8').trim()) throw new Error('workflow_empty_text: ' + entry.text);
          hashes[entry.text] = digest(entry.text);
          if (entry.image) { verifyImageFile(entry.image); hashes[entry.image] = digest(entry.image); }
        }
        state.completed.push({ ...state.active, hashes });
        delete state.active;
      }
    }
    if (input.action !== 'status') atomicJson(stateFile(episode), state);
    return { ...state, next: state.active?.stage ?? STAGES[state.completed.length] ?? 'video', episode };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
/** Rechecked at planning and execution, before reservations or provider requests. */
export function requireWorkflow(directory: string, kind: 'image' | 'video' | 'text', assetId?: string, outputFile?: string): void {
  const episode = workflowEpisode(directory);
  if (!episode) {
    if (/[/\\]data[/\\][^/\\]+[/\\]assets(?:[/\\]|$)/.test(path.resolve(directory))) readyProject(directory);
    return; // Standalone tools outside managed content keep their contract.
  }
  readyProject(episode);
  const state = read(episode);
  verifyPrevious(state);
  if (kind === 'video') {
    if (state.completed.length !== STAGES.length) throw new Error('workflow_out_of_order: complete image_storyboard before video');
  } else if (kind === 'text') {
    if (!state.completed.length) throw new Error('workflow_out_of_order: complete characters before text_storyboard');
  } else {
    const active = state.active;
    const entry = active?.entries.find(item => item.id === assetId);
    if (!active || active.stage === 'text_storyboard' || !entry?.image) throw new Error('workflow_out_of_order: begin the current image stage and register assetId');
    if (outputFile && canonicalPath(outputFile) !== entry.image) throw new Error('workflow_output_mismatch: use the registered image path');
  }
}

export function workflowRevision(directory: string): string | undefined {
  const episode = workflowEpisode(directory);
  return episode && fs.existsSync(stateFile(episode)) ? digest(stateFile(episode)) : undefined;
}
