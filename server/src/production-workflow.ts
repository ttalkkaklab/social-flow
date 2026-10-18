import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { manageProject } from './project.js';
import { atomicJson, canonicalPath } from './routing-files.js';
import { verifyImageFile } from './image-media.js';

export const STAGES = ['characters', 'text_storyboard', 'context_review', 'props', 'backgrounds',
  'camera_review', 'blender_composition', 'image_storyboard', 'image_review', 'video', 'video_review'] as const;
const REVIEWS = ['context_review', 'camera_review', 'image_review', 'video_review'];
const IMAGE_STAGES = ['characters', 'props', 'backgrounds', 'blender_composition', 'image_storyboard'];
const stageSchema = z.enum(STAGES);
const entrySchema = z.object({ id: z.string().min(1), text: z.string().min(1), image: z.string().min(1).optional(), blend: z.string().min(1).optional(), video: z.string().min(1).optional() }).strict();
const recordSchema = z.object({ stage: stageSchema, entries: z.array(entrySchema), notApplicable: z.string().optional(), criteriaHash: z.string().optional(), hashes: z.record(z.string()).optional() }).strict();
const stateSchema = z.object({ version: z.literal(2), completed: z.array(recordSchema), active: recordSchema.optional(), rubrics: z.record(z.string()).default({}) }).strict();
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
  if (!fs.existsSync(stateFile(episode))) return { version: 2, completed: [], rubrics: {} };
  const raw = JSON.parse(fs.readFileSync(stateFile(episode), 'utf8'));
  // Retain preparation only. Legacy image completion is not a review or Blender receipt.
  if (raw.version === 1) {
    raw.completed = (raw.completed ?? []).slice(0, 2);
    delete raw.active;
    raw.version = 2;
  }
  const state = stateSchema.parse(raw);
  for (const [i, record] of state.completed.entries()) {
    if (record.stage !== STAGES[i] || !record.hashes) throw new Error('workflow_invalid_state');
    validateRecord(record);
    for (const entry of record.entries) {
      for (const file of [entry.text, entry.image, entry.blend, entry.video].filter(Boolean) as string[]) {
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
    if (IMAGE_STAGES.includes(record.stage) ? !entry.image : entry.image !== undefined) throw new Error('workflow_artifacts_required: image required only for image stages');
    if (record.stage === 'blender_composition' ? !entry.blend : entry.blend !== undefined) throw new Error('workflow_blender_required');
    if (record.stage === 'video' ? !entry.video : entry.video !== undefined) throw new Error('workflow_video_required');
  }
}
const reviewSchema = z.object({
  stage: z.enum(['context_review', 'camera_review', 'image_review', 'video_review']),
  author: z.string().trim().min(1), reviewer: z.string().trim().min(1),
  independent: z.literal(true), verdict: z.literal('pass'),
  coverage: z.enum(['text', 'images', 'video_playback']),
  criteria: z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  inputs: z.record(z.string().regex(/^[a-f0-9]{64}$/)),
  cutIds: z.array(z.string().min(1)).min(1).optional(),
  observations: z.array(z.string().trim().min(10)).min(1),
  unresolved: z.array(z.string()).length(0),
  audienceRead: z.object({
    blind: z.literal(true), reconstruction: z.string().trim().min(20),
    transitions: z.array(z.object({ from: z.string().min(1), to: z.string().min(1),
      viewerUnderstands: z.string().trim().min(10),
      evidence: z.array(z.object({ path: z.string().min(1), quote: z.string().trim().min(5), cutId: z.string().min(1) }).strict()).min(1),
    }).strict()).min(1),
    missingContext: z.array(z.string()).length(0),
  }).strict().optional(),
}).strict();
function validateInventory(state: State, record: z.infer<typeof recordSchema>): void {
  if (record.stage === 'video') {
    const imageIds = new Set(state.completed.find(item => item.stage === 'image_storyboard')!.entries.map(entry => entry.id));
    if (record.entries.some(entry => !imageIds.has(entry.id))) throw new Error('workflow_unknown_cut');
  }
  const previous = record.stage === 'image_storyboard' ? 'blender_composition' :
    record.stage === 'blender_composition' ? 'camera_review' : undefined;
  if (previous) {
    const ids = state.completed.find(item => item.stage === previous)!.entries.map(entry => entry.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(record.entries.map(entry => entry.id).sort())) throw new Error('workflow_cut_inventory_mismatch');
  }
}
function verifyReview(state: State, stage: string, file: string, hashes: Record<string, string>): void {
  const review = reviewSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (review.stage !== stage || review.author === review.reviewer) throw new Error('workflow_independent_review_required');
  if (stage !== 'context_review') {
    const sourceStage = stage === 'camera_review' ? state.active : state.completed.find(record => record.stage === (stage === 'image_review' ? 'image_storyboard' : 'video'));
    const ids = sourceStage!.entries.map(entry => entry.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify([...(review.cutIds ?? [])].sort())) throw new Error('workflow_review_cut_coverage');
  }
  const coverage = stage === 'video_review' ? 'video_playback' : stage === 'image_review' ? 'images' : 'text';
  if (review.coverage !== coverage) throw new Error('workflow_review_coverage');
  const check = (input: string, hash: string) => {
    if (!path.isAbsolute(input) || digest(input) !== hash) throw new Error('workflow_review_stale');
    hashes[input] = hash;
  };
  check(review.criteria.path, review.criteria.sha256);
  if (state.active?.criteriaHash !== review.criteria.sha256) throw new Error('workflow_rubric_changed');
  if (stage === 'context_review') {
    if (!review.audienceRead) throw new Error('workflow_audience_read_required');
    const texts = state.completed.find(record => record.stage === 'text_storyboard')!.entries.map(entry => entry.text);
    for (const transition of review.audienceRead.transitions) {
      for (const evidence of transition.evidence) {
        if (!texts.includes(evidence.path)) throw new Error('workflow_audience_evidence_required');
        const text = fs.readFileSync(evidence.path, 'utf8');
        if (!text.includes(evidence.quote) || !text.includes(evidence.cutId)) throw new Error('workflow_audience_evidence_required');
      }
    }
  }
  for (const [input, hash] of Object.entries(review.inputs)) check(input, hash);
  const source = stage === 'context_review' ? 'text_storyboard' : stage === 'image_review' ? 'image_storyboard' : stage === 'video_review' ? 'video' : 'text_storyboard';
  for (const [input, hash] of Object.entries(state.completed.find(record => record.stage === source)!.hashes!)) {
    if (review.inputs[input] !== hash) throw new Error('workflow_review_incomplete');
  }
  // Camera review inputs also contain the cut-specific plan, before Blender exists.
  if (stage === 'camera_review' && !Object.keys(review.inputs).some(input => !Object.hasOwn(state.completed.find(record => record.stage === source)!.hashes!, input))) throw new Error('workflow_camera_plan_required');
}
/** Require the Blender composition as a real image input, not prompt prose. */
export function requireCompositionReference(directory: string, assetId: string, args: Record<string, unknown>): void {
  const episode = workflowEpisode(directory);
  if (!episode) return;
  const state = read(episode);
  verifyPrevious(state);
  if (state.active?.stage !== 'image_storyboard') return;
  const image = state.completed.find(record => record.stage === 'blender_composition')!.entries.find(entry => entry.id === assetId)?.image;
  const inputs = [args.imagePath, ...(Array.isArray(args.refImagePaths) ? args.refImagePaths : []),
    ...(Array.isArray(args.referenced_image_paths) ? args.referenced_image_paths : [])];
  if (!image || !inputs.some(input => typeof input === 'string' && canonicalPath(path.resolve(directory, input)) === image)) throw new Error('workflow_composition_reference_required');
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
      // Preserve superseded evidence and findings before invalidating descendants.
      const history = path.join(folder, 'production-workflow-history');
      fs.mkdirSync(history, { recursive: true });
      const reports = Object.fromEntries([...state.completed, ...(state.active ? [state.active] : [])]
        .filter(record => REVIEWS.includes(record.stage)).flatMap(record => record.entries)
        .filter(entry => fs.existsSync(entry.text)).map(entry => [entry.text, fs.readFileSync(entry.text, 'utf8')]));
      atomicJson(path.join(history, `${Date.now()}-${process.hrtime.bigint()}.json`), { state, reports });
      const index = STAGES.indexOf(stageSchema.parse(input.stage));
      if (index > state.completed.length) throw new Error('workflow_out_of_order');
      state.completed = state.completed.slice(0, index);
      delete state.active;
    } else {
      verifyPrevious(state);
      if (input.action === 'begin') {
        if (state.active || input.stage !== STAGES[state.completed.length]) throw new Error(`workflow_out_of_order: next ${state.active?.stage ?? STAGES[state.completed.length] ?? 'done'}`);
        const record = { stage: stageSchema.parse(input.stage), entries: (input.entries ?? []).map(entry => ({ ...entry,
          text: canonicalPath(path.resolve(episode, entry.text)), ...(entry.image ? { image: canonicalPath(path.resolve(episode, entry.image)) } : {}),
          ...(entry.blend ? { blend: canonicalPath(path.resolve(episode, entry.blend)) } : {}),
          ...(entry.video ? { video: canonicalPath(path.resolve(episode, entry.video)) } : {}),
        })), ...(input.notApplicable ? { notApplicable: input.notApplicable } : {}) };
        validateRecord(record);
        if (REVIEWS.includes(record.stage)) {
          const criteria = record.entries.map(entry => JSON.parse(fs.readFileSync(entry.text, 'utf8')).criteria as { path: string; sha256: string });
          if (criteria.some(item => !item || !path.isAbsolute(item.path) || digest(item.path) !== item.sha256) || new Set(criteria.map(item => item.sha256)).size !== 1) throw new Error('workflow_rubric_required');
          if (state.rubrics[record.stage] && state.rubrics[record.stage] !== criteria[0].sha256) throw new Error('workflow_rubric_changed');
          state.rubrics[record.stage] = criteria[0].sha256;
          Object.assign(record, { criteriaHash: criteria[0].sha256 });
        }
        validateInventory(state, record);
        state.active = record;
      } else if (input.action === 'complete') {
        if (!state.active || state.active.stage !== input.stage) throw new Error('workflow_out_of_order: begin this stage first');
        validateRecord(state.active);
        const hashes: Record<string, string> = {};
        for (const entry of state.active.entries) {
          if (!fs.readFileSync(entry.text, 'utf8').trim()) throw new Error('workflow_empty_text: ' + entry.text);
          hashes[entry.text] = digest(entry.text);
          if (REVIEWS.includes(state.active.stage)) verifyReview(state, state.active.stage, entry.text, hashes);
          if (entry.blend) {
            if (path.extname(entry.blend) !== '.blend' || !fs.statSync(entry.blend).size) throw new Error('workflow_blender_required');
            hashes[entry.blend] = digest(entry.blend);
            const receipt = JSON.parse(fs.readFileSync(entry.text, 'utf8'));
            if (receipt.renderer !== 'blender' || receipt.shotId !== entry.id || (!receipt.blend?.path || canonicalPath(receipt.blend.path) !== entry.blend) || receipt.blend?.sha256 !== hashes[entry.blend] || (!receipt.image?.path || canonicalPath(receipt.image.path) !== entry.image) || receipt.image?.sha256 !== digest(entry.image!)) throw new Error('workflow_blender_receipt_required');
          }
          if (entry.video) {
            const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', entry.video], { encoding: 'utf8', timeout: 30000 }));
            if (!probe.streams?.some((stream: { codec_type: string }) => stream.codec_type === 'video') || !(Number(probe.format?.duration) > 0)) throw new Error('workflow_video_invalid');
            hashes[entry.video] = digest(entry.video);
          }
          if (entry.image) { verifyImageFile(entry.image); hashes[entry.image] = digest(entry.image); }
        }
        state.completed.push({ ...state.active, hashes });
        delete state.active;
      }
    }
    if (input.action !== 'status') atomicJson(stateFile(episode), state);
    return { ...state, next: state.active?.stage ?? STAGES[state.completed.length] ?? 'done', episode };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
/** Rechecked at planning and execution, before reservations or provider requests. */
export function requireWorkflow(directory: string, kind: 'image' | 'video' | 'text' | 'delivery' | 'composition', assetId?: string, outputFile?: string): void {
  const episode = workflowEpisode(directory);
  if (!episode) {
    if (/[/\\]data[/\\][^/\\]+[/\\]assets(?:[/\\]|$)/.test(path.resolve(directory))) readyProject(directory);
    return; // Standalone tools outside managed content keep their contract.
  }
  readyProject(episode);
  const state = read(episode);
  verifyPrevious(state);
  if (kind === 'composition') {
    if (state.active?.stage !== 'blender_composition' || (assetId && !state.active.entries.some(entry => entry.id === assetId))) throw new Error('workflow_out_of_order: complete camera_review and begin blender_composition');
  } else if (kind === 'delivery') {
    if (state.completed.length !== STAGES.length) throw new Error('workflow_out_of_order: complete video_review before assembly or delivery');
  } else if (kind === 'video') {
    if (state.active?.stage !== 'video') throw new Error('workflow_out_of_order: complete image_review and begin video');
    if (assetId && !state.active.entries.some(entry => entry.id === assetId)) throw new Error('workflow_unknown_cut');
  } else if (kind === 'text') {
    if (!state.completed.length) throw new Error('workflow_out_of_order: complete characters before text_storyboard');
  } else {
    const active = state.active;
    const entry = active?.entries.find(item => item.id === assetId);
    if (!active || !['characters', 'props', 'backgrounds', 'image_storyboard'].includes(active.stage) || !entry?.image) throw new Error('workflow_out_of_order: begin the current image stage and register assetId');
    if (outputFile && canonicalPath(outputFile) !== entry.image) throw new Error('workflow_output_mismatch: use the registered image path');
  }
}

/** Assembly must consume reviewed bytes, not merely have an unrelated passing receipt. */
export function requireReviewedVideos(directory: string, media: Record<string, string>): void {
  const episode = workflowEpisode(directory);
  if (!episode) return;
  requireWorkflow(directory, 'delivery');
  const video = read(episode).completed.find(record => record.stage === 'video')!;
  const reviewed = new Map(video.entries.map(entry => [entry.video!, video.hashes![entry.video!]]));
  if (!Object.keys(media).length) throw new Error('workflow_delivery_media_required');
  for (const [file, hash] of Object.entries(media)) {
    const absolute = canonicalPath(path.resolve(directory, file));
    if (reviewed.get(absolute) !== hash || digest(absolute) !== hash) throw new Error('workflow_unreviewed_delivery_media: ' + file);
  }
}

export function workflowRevision(directory: string): string | undefined {
  const episode = workflowEpisode(directory);
  return episode && fs.existsSync(stateFile(episode)) ? digest(stateFile(episode)) : undefined;
}
