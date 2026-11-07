import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MUSIC_ADAPTERS, MUSIC_MODELS, parseMusicArgs } from './music-registry.js';

import { musicTransaction, readMusicState } from './music-state.js';
import { atomicJson, canonicalPath, routingHash, withinDirectory } from './routing-files.js';
import { readMusicMetadata, normalizeMusicFile } from './music-media.js';
import { requireGeminiKey, requireSunoKey, requireElevenLabsKey, mlxServeConfigured, disabledToolPatterns, disabledToolsFile } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { priceOf, recordUsage } from './usage-ledger.js';
import { resumeMusic as resumeSunoTask } from './suno-client.js';
import type { ToolResult } from './handlers.js';

const load = createRequire(import.meta.url);
interface Selection { engine: string; model?: string;  }
interface Context { directory: string; assetId: string; selection: Selection; source: string; revision: string; authorization?: unknown }
const selectionHelper = fileURLToPath(new URL('../../skills/_shared/music-selection.js', import.meta.url));
export const musicContext = (directory: string, assetId: string): Context =>
  (load(selectionHelper) as { readMusicContext(directory: string, assetId: string): Context }).readMusicContext(directory, assetId);
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
export const musicPlanSchema = z.object({ directory: z.string().min(1), assetId: idSchema, requestId: idSchema,
  tool: z.string().optional(),
  reserveUsd: z.number().finite().nonnegative().optional(), args: z.record(z.unknown()).default({}) }).strict();
export const musicExecuteSchema = z.object({ directory: z.string().min(1), planId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const authorizationSchema = z.object({ reference: z.string().min(1), maxUsd: z.number().finite().nonnegative(),
  maxConcurrent: z.number().int().min(1).max(16).default(1), maxAttempts: z.number().int().min(1).max(20).default(3),
  openingSpendUsd: z.number().finite().nonnegative().optional() }).strict();
export interface MusicPlan {
  version: 1; id: string; directory: string; assetId: string; requestId: string; tool: string;
  args: Record<string, unknown>; sourceArgs: Record<string, unknown>; selection: Selection; source: string;
  contextRevision: string; inputs: Record<string, string>; outputFile?: string;
  quote: { reserveUsd: number; basis: string; revision: string };
}
function gate(tool: string): void {
  const state = resolveToolGate(tool, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  if (!state.enabled) throw new Error('music_tool_disabled: ' + state.reason);
}
function environment(tool: string): void {
  gate(tool);
  for (const binary of ['ffmpeg', 'ffprobe']) execFileSync(binary, ['-version'], { timeout: 10000, stdio: 'ignore' });
  const engine = MUSIC_ADAPTERS[tool].engine;
  if (engine === 'lyria') requireGeminiKey();
  if (engine === 'suno-api') requireSunoKey();
  if (engine === 'elevenlabs') requireElevenLabsKey();
  if (engine === 'mlx' && !mlxServeConfigured()) throw new Error('music_provider_unconfigured: MLX Core');
}
function inputFiles(args: Record<string, unknown>, directory: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  const resolve = (file: string) => {
    const resolved = fs.realpathSync(path.resolve(directory, file));
    if (!fs.statSync(resolved).isFile()) throw new Error('music_input_not_file');
    inputs[resolved] = readMusicMetadata(resolved).sha256;
    return resolved;
  };
  if (typeof args.refAudioPath === 'string') args.refAudioPath = resolve(args.refAudioPath);
  return inputs;
}
function bindSelection(tool: string, input: Record<string, unknown>, selection: Selection) {
  const adapter = MUSIC_ADAPTERS[tool];
  if (!adapter || adapter.engine !== selection.engine || (adapter.fixedModel && adapter.fixedModel !== selection.model))
    throw new Error('music_selection_mismatch');
  const args = { ...input };
  if (adapter.modelField) {
    if (args[adapter.modelField] !== undefined && args[adapter.modelField] !== selection.model) throw new Error('music_selection_mismatch: model');
    args[adapter.modelField] = selection.model;
  }
  return args;
}
export function planMusic(raw: unknown): MusicPlan {
  gate('music_plan');
  const input = musicPlanSchema.parse(raw);
  const context = musicContext(input.directory, input.assetId);
  const { selection } = context;
  const tool = input.tool ?? (selection.engine === 'mlx' ? 'mlx_music_generate' :
    MUSIC_MODELS.find(m => m.engine === selection.engine && m.model === selection.model)?.tool);
  if (!tool) throw new Error('music_model_unsupported');
  gate(tool);
  const args = parseMusicArgs(tool, bindSelection(tool, input.args, selection));
  const folder = canonicalPath(path.resolve(context.directory, typeof args.outputPath === 'string' ? args.outputPath : '.work/music'));
  const filename = typeof args.filename === 'string' ? args.filename : `${input.requestId}.wav`;
  if (!filename.endsWith('.wav')) throw new Error('music_output_requires_wav');
  const outputFile = canonicalPath(path.join(folder, filename));
  if (!withinDirectory(context.directory, outputFile)) throw new Error('music_output_outside_directory');
  // Keep raw provider tracks separate, including Suno's two variants. Never lie about an MP3's extension.
  args.outputPath = canonicalPath(path.join(context.directory, '.work/music-routing/raw', input.requestId));
  args.filename = ['music_generate_song', 'music_generate_clip', 'music_elevenlabs_generate', 'suno_generate'].includes(tool) ? 'source.mp3' : 'source.wav';
  if (!withinDirectory(context.directory, String(args.outputPath))) throw new Error('music_raw_output_outside_directory');
  const inputs = inputFiles(args, context.directory);
  if (Object.hasOwn(inputs, outputFile)) throw new Error('music_output_overwrites_input');
  const local = selection.engine === 'mlx';
  if (local ? input.reserveUsd !== undefined && input.reserveUsd !== 0 : !Number.isFinite(input.reserveUsd) || (input.reserveUsd ?? 0) <= 0)
    throw new Error('music_quote_required: positive total provider estimate for API, zero for local; not an invoice cap');
  const quote = { reserveUsd: input.reserveUsd ?? 0, basis: local ? 'Local compute; hardware excluded' : 'Caller estimate including all returned tracks; not a provider invoice cap', revision: '2026-10-18' };
  const body = { version: 1 as const, directory: context.directory, assetId: input.assetId, requestId: input.requestId,
    tool, args, sourceArgs: input.args, selection, source: context.source, contextRevision: context.revision, inputs, outputFile, quote };
  const plan = { ...body, id: routingHash(body) };
  atomicJson(path.join(context.directory, '.work/music-routing/plans', plan.id + '.json'), plan);
  return plan;
}
/** Report the plan without copying the full lyrics into every response. */
export function musicPlanSummary(plan: MusicPlan) {
  const { args, sourceArgs: _source, ...summary } = plan;
  return { ...summary, fields: Object.keys(args), review: 'not_reviewed' };
}
export type MusicDispatch = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
export async function executeMusic(raw: unknown, dispatch: MusicDispatch): Promise<ToolResult> {
  gate('music_execute');
  const input = musicExecuteSchema.parse(raw), directory = fs.realpathSync(input.directory);
  const plan: MusicPlan = JSON.parse(fs.readFileSync(path.join(directory, '.work/music-routing/plans', input.planId + '.json'), 'utf8'));
  const { id, ...body } = plan;
  if (id !== input.planId || routingHash(body) !== id || plan.directory !== directory) throw new Error('music_plan_invalid');
  gate(plan.tool);
  const priorJobs = readMusicState(directory)?.jobs;
  const previous = priorJobs && Object.hasOwn(priorJobs, plan.requestId) ? priorJobs[plan.requestId] : undefined;
  if (previous) {
    if (previous.planId !== id) throw new Error('music_request_id_conflict');
    if (previous.status === 'completed') {
      if (!plan.outputFile || readMusicMetadata(plan.outputFile).sha256 !== previous.output?.sha256) throw new Error('music_cached_output_changed');
      return previous.result as ToolResult;
    }
    throw new Error('music_request_pending: inspect music_status; never resubmit this request ID');
  }
  const context = musicContext(directory, plan.assetId);
  if (context.revision !== plan.contextRevision) throw new Error('music_plan_stale: selection or authorization changed');
  const fresh = planMusic({ directory, assetId: plan.assetId, requestId: plan.requestId, tool: plan.tool, args: plan.sourceArgs, reserveUsd: plan.quote.reserveUsd });
  if (fresh.id !== id) throw new Error('music_plan_stale: inputs or contract changed');
  environment(plan.tool);
  const auth = context.authorization === undefined && plan.quote.reserveUsd === 0
    ? { reference: 'local execution', maxUsd: 0, maxConcurrent: 1, maxAttempts: 3, openingSpendUsd: undefined }
    : authorizationSchema.parse(context.authorization);
  musicTransaction(directory, auth.openingSpendUsd, state => {
    if (Object.hasOwn(state.jobs, plan.requestId)) throw new Error('music_request_pending');
    const jobs = Object.values(state.jobs);
    if (jobs.filter(job => ['submitting', 'submission_unknown'].includes(job.status)).length >= auth.maxConcurrent) throw new Error('music_concurrency_limit');
    if (jobs.reduce((sum, job) => sum + (job.spentUsd ?? job.reserveUsd), state.openingSpendUsd) + plan.quote.reserveUsd > auth.maxUsd + 1e-9) throw new Error('music_budget_exceeded');
    if (jobs.filter(job => job.assetId === plan.assetId).length >= auth.maxAttempts) throw new Error('music_attempt_limit');
    if (jobs.some(job => job.outputFile === plan.outputFile && ['submitting', 'submission_unknown', 'completed'].includes(job.status))) throw new Error('music_output_reserved');
    if (plan.outputFile && fs.existsSync(plan.outputFile)) throw new Error('music_output_exists: choose a new path; do not overwrite prior assets');
    state.jobs[plan.requestId] = { outputFile: plan.outputFile as string, planId: id, requestId: plan.requestId, assetId: plan.assetId, tool: plan.tool,
      status: 'submitting', ownerPid: process.pid, ownerHost: os.hostname(), reserveUsd: plan.quote.reserveUsd, updatedAt: new Date().toISOString() };
  });
  const started = Date.now();
  let ok = false, terminal = false;
  try {
    const result = await dispatch(plan.tool, plan.args);
    const receipt = result.musicReceipt as { usage?: unknown; requestId?: string; audioPath?: string } | undefined;
    // Persist provider evidence even if file verification fails after a billed response.
    musicTransaction(directory, undefined, state => {
      Object.assign(state.jobs[plan.requestId], { usage: receipt?.usage, providerId: receipt?.requestId || undefined,
         updatedAt: new Date().toISOString() });
    });
    if (result.isError) {
      // Only an adapter that saw a definite rejection before any provider task existed marks it terminal.
      terminal = result.terminal === true;
      throw new Error('music_adapter_failed: ' + JSON.stringify(result.content));
    }
    if (!plan.outputFile) throw new Error('music_output_missing');
    const sourceFile = receipt?.audioPath || path.join(String(plan.args.outputPath), String(plan.args.filename));
    if (!withinDirectory(canonicalPath(String(plan.args.outputPath)), canonicalPath(sourceFile))) throw new Error('music_source_outside_request');
    const output = normalizeMusicFile(sourceFile, plan.outputFile);
    const response: ToolResult = { ...result, content: [...result.content, { type: 'text', text: 'Music output: ' + JSON.stringify(output) }], musicReceipt: { ...receipt, output, review: 'not_reviewed' } };
    musicTransaction(directory, undefined, state => {
      Object.assign(state.jobs[plan.requestId], { status: 'completed', output, result: response, updatedAt: new Date().toISOString() });
    });
    ok = true;
    return response;
  } catch (error) {
    musicTransaction(directory, undefined, state => Object.assign(state.jobs[plan.requestId], {
      status: terminal ? 'failed' : 'submission_unknown', evidence: String(error).slice(0, 1500), updatedAt: new Date().toISOString(),
      // A rejected submission created no provider task, so it releases its reservation too.
      ...(terminal ? { spentUsd: 0 } : {}) }));
    throw error;
  } finally {
    recordUsage(plan.outputFile, { ts: new Date().toISOString(), tool: plan.tool, ok, ms: Date.now() - started,
      ...priceOf(plan.tool, plan.args), note: 'Music routing receipt is authoritative; price key is a legacy estimate',
      detail: { requestId: plan.requestId, planId: plan.id, reserveUsd: plan.quote.reserveUsd } });
  }
}
export async function routeLegacyMusic(tool: string, raw: unknown, dispatch: MusicDispatch): Promise<ToolResult> {
  gate(tool);
  const { musicContext: context, ...args } = z.record(z.unknown()).parse(raw);
  if (context !== undefined) {
    const input = musicPlanSchema.pick({ directory: true, assetId: true, requestId: true, reserveUsd: true }).strict().parse(context);
    const plan = planMusic({ ...input, tool, args });
    return executeMusic({ directory: plan.directory, planId: plan.id }, dispatch);
  }
  for (const location of [args.outputPath, process.cwd()].filter(v => typeof v === 'string') as string[]) {
    let dir = canonicalPath(path.resolve(location));
    for (;;) {
      if (fs.existsSync(path.join(dir, '.work/model-settings.json')) || fs.existsSync(path.join(dir, '.social-flow/models.json')) || fs.existsSync(path.join(dir, 'storyboard/scenes.js')))
        throw new Error('music_context_required: pass directory, assetId and requestId for configured production');
      const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
    }
  }
  const parsed = parseMusicArgs(tool, args);
  inputFiles(parsed, process.cwd());
  return dispatch(tool, parsed);
}
/**
 * Finish an interrupted Suno request from its recorded task ID: re-query record-info, download
 * and normalize. It never submits a new generation, so it spends nothing beyond the original task.
 */
export async function resumeMusic(raw: unknown): Promise<ToolResult> {
  gate('music_status');
  const input = z.object({ directory: z.string().min(1), requestId: idSchema, action: z.literal('resume') }).strict().parse(raw);
  const directory = fs.realpathSync(input.directory);
  const jobs = readMusicState(directory)?.jobs;
  const job = jobs && Object.hasOwn(jobs, input.requestId) ? jobs[input.requestId] : undefined;
  if (!job || job.status !== 'submission_unknown' || job.tool !== 'suno_generate' || !job.providerId)
    throw new Error('music_resume_requires_unknown_suno_task: only a submission_unknown suno_generate request with a recorded task ID');
  const plan: MusicPlan = JSON.parse(fs.readFileSync(path.join(directory, '.work/music-routing/plans', job.planId + '.json'), 'utf8'));
  const { id, ...body } = plan;
  if (id !== job.planId || routingHash(body) !== id || !plan.outputFile) throw new Error('music_plan_invalid');
  gate(plan.tool); requireSunoKey();
  const result = await resumeSunoTask(job.providerId, { outputPath: String(plan.args.outputPath), filename: String(plan.args.filename), pickTrack: Number(plan.args.pickTrack ?? 0) });
  if (!result.success || !result.audioPath) {
    musicTransaction(directory, undefined, state => Object.assign(state.jobs[input.requestId], { evidence: String(result.error).slice(0, 1500), updatedAt: new Date().toISOString() }));
    throw new Error('music_resume_failed: ' + result.error);
  }
  if (!withinDirectory(canonicalPath(String(plan.args.outputPath)), canonicalPath(result.audioPath))) throw new Error('music_source_outside_request');
  const output = normalizeMusicFile(result.audioPath, plan.outputFile);
  const response: ToolResult = { content: [{ type: 'text', text: 'Music output: ' + JSON.stringify(output) }],
    musicReceipt: { requestId: job.providerId, audioPath: result.audioPath, output, review: 'not_reviewed' } };
  musicTransaction(directory, undefined, state => {
    if (state.jobs[input.requestId].status !== 'submission_unknown') throw new Error('music_resume_conflict: request changed during resume');
    Object.assign(state.jobs[input.requestId], { status: 'completed', output, result: response, updatedAt: new Date().toISOString() });
  });
  return response;
}
export function musicStatus(raw: unknown) {
  gate('music_status');
  const input = z.object({ directory: z.string().min(1), requestId: idSchema, action: z.enum(['read', 'reconcile']).default('read'),
    executorStopped: z.boolean().optional(), evidence: z.string().min(1).optional(), spentUsd: z.number().finite().nonnegative().optional() }).strict().parse(raw);
  const directory = fs.realpathSync(input.directory);
  if (input.action === 'reconcile') {
    if (!input.evidence || input.spentUsd === undefined) throw new Error('music_reconciliation_requires_billing_evidence');
    musicTransaction(directory, undefined, state => {
      const job = Object.hasOwn(state.jobs, input.requestId) ? state.jobs[input.requestId] : undefined;
      if (!job || !['submitting', 'submission_unknown'].includes(job.status)) throw new Error('music_reconciliation_requires_unknown_terminal_request');
      if (job.status === 'submitting') {
        if (input.executorStopped !== true) throw new Error('music_reconciliation_requires_executor_stopped');
        if (job.ownerHost === os.hostname() && job.ownerPid) {
          try { process.kill(job.ownerPid, 0); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { job.ownerPid = undefined; } else throw error; }
          if (job.ownerPid) throw new Error('music_executor_still_running');
        }
      }
      job.status = 'failed'; job.spentUsd = input.spentUsd; job.evidence = input.evidence;
      job.updatedAt = new Date().toISOString();
    });
  }
  const jobs = readMusicState(directory)?.jobs;
  return jobs && Object.hasOwn(jobs, input.requestId) ? jobs[input.requestId] : { requestId: input.requestId, status: 'not_started' };
}
