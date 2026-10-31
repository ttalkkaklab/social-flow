import { buildNativeImageBody, recoverNativeImage } from './astra-genai-native-image.js';
import { GenaiRequestError } from './astra-genai-client.js';
import { workflowEpisode } from './production-workflow.js';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { IMAGE_ADAPTERS, parseImageArgs } from './image-registry.js';
import { imageQuote, imageUsageUsd } from './image-pricing.js';
import { imageTransaction, readImageState } from './image-state.js';
import { atomicJson, canonicalPath, routingHash, withinDirectory } from './routing-files.js';
import { readImageMetadata, verifyImageFile } from './image-media.js';
import { config, mfluxZImageBin, mlxServeConfigured, disabledToolPatterns, disabledToolsFile } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { priceOf, recordUsage } from './usage-ledger.js';
import type { ToolResult } from './handlers.js';
import { GenaiImageOutputError, recoverGenaiImage, buildGenaiImageBody, genaiImageSchema, genaiImageEditSchema } from './astra-genai-image.js';

const load = createRequire(import.meta.url);
interface Selection { engine: string; model?: string; quality?: string; host?: string }
interface Context { directory: string; assetId: string; selection: Selection; source: string; revision: string; authorization?: unknown }
const selectionHelper = fileURLToPath(new URL('../../skills/_shared/image-selection.js', import.meta.url));
export const imageContext = (directory: string, assetId: string): Context =>
  (load(selectionHelper) as { readImageContext(directory: string, assetId: string): Context }).readImageContext(directory, assetId);
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
export const imagePlanSchema = z.object({ directory: z.string().min(1), assetId: idSchema, requestId: idSchema,
  operation: z.enum(['text', 'edit', 'variation']).optional(), tool: z.string().optional(),
  reserveUsd: z.number().finite().nonnegative().optional(), args: z.record(z.unknown()).default({}) }).strict();
export const imageExecuteSchema = z.object({ directory: z.string().min(1), planId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const authorizationSchema = z.object({ reference: z.string().min(1), maxUsd: z.number().finite().nonnegative(),
  maxConcurrent: z.number().int().min(1).max(16).default(1), maxAttempts: z.number().int().min(1).max(20).default(3),
  openingSpendUsd: z.number().finite().nonnegative().optional() }).strict();
export interface ImagePlan {
  version: 1; id: string; directory: string; assetId: string; requestId: string; tool: string;
  args: Record<string, unknown>; sourceArgs: Record<string, unknown>; selection: Selection; source: string;
  contextRevision: string; inputs: Record<string, string>; outputFile?: string;
  quote: ReturnType<typeof imageQuote>; execution: 'server' | 'host_handoff';
}
function gate(tool: string): void {
  const state = resolveToolGate(tool, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  if (!state.enabled) throw new Error('image_tool_disabled: ' + state.reason);
}
function environment(tool: string): void {
  gate(tool);
  const engine = IMAGE_ADAPTERS[tool].engine;
  if (engine === 'gpt-image' && !config.openaiApiKey) throw new Error('image_provider_unconfigured: OPENAI_API_KEY');
  if (['astra-genai', 'astra-genai-native'].includes(engine) && !config.astraGenaiApiKey) throw new Error('image_provider_unconfigured: ASTRA_GENAI_API_KEY');
  if (engine === 'mlx' && !mlxServeConfigured()) throw new Error('image_provider_unconfigured: MLX Core');
  if (engine === 'zimage') {
    const bin = mfluxZImageBin();
    const found = bin.includes(path.sep) ? fs.existsSync(bin) : (process.env.PATH || '').split(path.delimiter).some(dir => fs.existsSync(path.join(dir, bin)));
    if (!found) throw new Error('image_provider_unconfigured: mflux');
  }
}
function inputFiles(args: Record<string, unknown>, directory: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  const resolve = (file: string) => {
    const resolved = fs.realpathSync(path.resolve(directory, file));
    if (!fs.statSync(resolved).isFile()) throw new Error('image_input_not_file');
    inputs[resolved] = readImageMetadata(resolved).sha256;
    return resolved;
  };
  if (typeof args.imagePath === 'string') args.imagePath = resolve(args.imagePath);
  if (typeof args.maskPath === 'string') args.maskPath = resolve(args.maskPath);
  if (Array.isArray(args.refImagePaths)) args.refImagePaths = args.refImagePaths.map(v => resolve(String(v)));
  return inputs;
}
function bindSelection(tool: string, input: Record<string, unknown>, selection: Selection) {
  if (IMAGE_ADAPTERS[tool]?.engine !== selection.engine) throw new Error('image_selection_mismatch: engine');
  const args = { ...input };
  for (const field of ['model', 'quality'] as const) {
    const selected = selection[field];
    if (selected === undefined) continue;
    if (args[field] !== undefined && args[field] !== selected) throw new Error('image_selection_mismatch: ' + field);
    args[field] = selected;
  }
  return args;
}
export function planImage(raw: unknown): ImagePlan {
  gate('image_plan');
  const input = imagePlanSchema.parse(raw);
  const context = imageContext(input.directory, input.assetId);
  const { selection } = context;
  let tool = input.tool;
  if (!tool) tool = Object.keys(IMAGE_ADAPTERS).find(name => IMAGE_ADAPTERS[name].engine === selection.engine &&
    IMAGE_ADAPTERS[name].operation === (input.operation === 'variation' ? 'text' : input.operation));
  let args = { ...input.args }, outputFile: string | undefined;
  if (selection.engine === 'host') {
    if (input.tool) throw new Error('image_selection_mismatch: host has no MCP adapter');
    tool = 'host_external';
  } else {
    if (!tool) throw new Error('image_operation_unsupported');
    gate(tool);
    const expected = IMAGE_ADAPTERS[tool]?.operation;
    if (input.operation && expected !== (input.operation === 'variation' ? 'text' : input.operation)) throw new Error('image_operation_mismatch');
    args = parseImageArgs(tool, bindSelection(tool, args, selection));
    if (input.operation === 'variation' && (selection.engine !== 'mlx' || !args.imagePath)) throw new Error('image_variation_requires_source');
    const ext = args.outputFormat === 'jpeg' ? 'jpg' : String(args.outputFormat || 'png');
    if (selection.engine === 'gpt-image') {
      outputFile = canonicalPath(path.resolve(context.directory, typeof args.savePath === 'string' ? args.savePath : `.work/images/${input.requestId}.${ext}`));
      args.savePath = outputFile;
    } else {
      const folder = canonicalPath(path.resolve(context.directory, typeof args.outputPath === 'string' ? args.outputPath : '.work/images'));
      args.outputPath = folder; args.filename ??= `${input.requestId}.png`;
      outputFile = canonicalPath(path.join(folder, String(args.filename)));
    }
    const extension = path.extname(outputFile).toLowerCase();
    if (!(selection.engine === 'gpt-image' ? (ext === 'jpg' ? ['.jpg', '.jpeg'] : ['.' + ext]) : ['.png']).includes(extension)) throw new Error('image_output_extension_mismatch');
    if (!withinDirectory(context.directory, outputFile)) throw new Error('image_output_outside_directory');
  }
  const inputs = selection.engine === 'host' ? {} : inputFiles(args, context.directory);
  if (selection.engine === 'astra-genai-native') buildNativeImageBody(args, tool === 'astra_genai_image_edit');
  if (selection.engine === 'astra-genai')
    buildGenaiImageBody((tool === 'astra_genai_edit' ? genaiImageEditSchema : genaiImageSchema).parse(args));
  if (outputFile && Object.hasOwn(inputs, outputFile)) throw new Error('image_output_overwrites_input');
  const quote = imageQuote(selection.engine, selection.model, input.reserveUsd);
  const body = { version: 1 as const, directory: context.directory, assetId: input.assetId, requestId: input.requestId,
    tool: tool as string, args, sourceArgs: input.args, selection, source: context.source, contextRevision: context.revision,
    inputs, ...(outputFile ? { outputFile } : {}), quote, execution: selection.engine === 'host' ? 'host_handoff' as const : 'server' as const };
  const plan = { ...body, id: routingHash(body) };
  atomicJson(path.join(context.directory, '.work/image-routing/plans', plan.id + '.json'), plan);
  return plan;
}
/** Do not send base64 source images back into the agent context. */
export function imagePlanSummary(plan: ImagePlan) {
  const { args, sourceArgs: _source, ...summary } = plan;
  return { ...summary, fields: Object.keys(args), review: 'not_reviewed' };
}
function imageExecutionResult(plan: ImagePlan, status: string, receipt?: { usage?: unknown; requestId?: string }, output?: unknown) {
  return { version: 1, status, outputPath: plan.outputFile ?? null, requestId: plan.requestId,
    providerId: receipt?.requestId ?? null, usage: receipt?.usage ?? null, output: output ?? null,
    readiness: { file: output ? 'verified' : 'not_verified', decoding: output ? 'verified' : 'not_verified',
      configuration: 'selection_validated', references: 'not_checked', visualReview: 'not_reviewed' } };
}
export type ImageDispatch = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
export async function executeImage(raw: unknown, dispatch: ImageDispatch): Promise<ToolResult> {
  gate('image_execute');
  const input = imageExecuteSchema.parse(raw), directory = fs.realpathSync(input.directory);
  const plan: ImagePlan = JSON.parse(fs.readFileSync(path.join(directory, '.work/image-routing/plans', input.planId + '.json'), 'utf8'));
  const { id, ...body } = plan;
  if (id !== input.planId || routingHash(body) !== id || plan.directory !== directory) throw new Error('image_plan_invalid');
  if (plan.execution === 'host_handoff') throw new Error('host_handoff_required: call the selected host tool, never substitute an API');
  gate(plan.tool);
  const priorJobs = readImageState(directory)?.jobs;
  const previous = priorJobs && Object.hasOwn(priorJobs, plan.requestId) ? priorJobs[plan.requestId] : undefined;
  if (previous) {
    if (previous.planId !== id) throw new Error('image_request_id_conflict');
    if (previous.status === 'completed') {
      if (!plan.outputFile || readImageMetadata(plan.outputFile).sha256 !== previous.output?.sha256) throw new Error('image_cached_output_changed');
      const cached = previous.result as ToolResult;
      return { ...cached, structuredContent: imageExecutionResult(plan, 'completed', { usage: previous.usage, requestId: previous.providerId }, previous.output) };
    }
    throw new Error('image_request_pending: inspect image_status; never resubmit this request ID');
  }
  const context = imageContext(directory, plan.assetId);
  if (context.revision !== plan.contextRevision) throw new Error('image_plan_stale: selection or authorization changed');
  const fresh = planImage({ directory, assetId: plan.assetId, requestId: plan.requestId, tool: plan.tool, args: plan.sourceArgs, reserveUsd: plan.quote.reserveUsd });
  if (fresh.id !== id) throw new Error('image_plan_stale: inputs or contract changed');
  environment(plan.tool);
  const auth = context.authorization === undefined && plan.quote.reserveUsd === 0
    ? { reference: 'local execution', maxUsd: 0, maxConcurrent: 1, maxAttempts: 3, openingSpendUsd: undefined }
    : authorizationSchema.parse(context.authorization);
  imageTransaction(directory, auth.openingSpendUsd, state => {
    if (Object.hasOwn(state.jobs, plan.requestId)) throw new Error('image_request_pending');
    const jobs = Object.values(state.jobs);
    if (jobs.filter(job => ['submitting', 'submission_unknown'].includes(job.status)).length >= auth.maxConcurrent) throw new Error('image_concurrency_limit');
    if (jobs.reduce((sum, job) => sum + (job.spentUsd ?? job.reserveUsd), state.openingSpendUsd) + plan.quote.reserveUsd > auth.maxUsd + 1e-9) throw new Error('image_budget_exceeded');
    if (jobs.filter(job => job.assetId === plan.assetId).length >= auth.maxAttempts) throw new Error('image_attempt_limit');
    if (jobs.some(job => job.outputFile === plan.outputFile && ['submitting', 'submission_unknown', 'completed'].includes(job.status))) throw new Error('image_output_reserved');
    if (plan.outputFile && fs.existsSync(plan.outputFile)) throw new Error('image_output_exists: choose a new path; do not overwrite prior assets');
    state.jobs[plan.requestId] = { outputFile: plan.outputFile as string, planId: id, requestId: plan.requestId, assetId: plan.assetId, tool: plan.tool,
      status: 'submitting', ownerPid: process.pid, ownerHost: os.hostname(), reserveUsd: plan.quote.reserveUsd, updatedAt: new Date().toISOString() };
  });
  const started = Date.now();
  let ok = false, providerCompleted = false;
  try {
    const result = await dispatch(plan.tool, plan.args);
    const receipt = result.imageReceipt as { usage?: unknown; requestId?: string } | undefined;
    // Persist provider evidence even if file verification fails after a billed response.
    imageTransaction(directory, undefined, state => {
      Object.assign(state.jobs[plan.requestId], { usage: receipt?.usage, providerId: receipt?.requestId,
        spentUsd: imageUsageUsd(plan.selection.model || '', receipt?.usage), updatedAt: new Date().toISOString() });
    });
    if (result.isError) throw new Error('image_adapter_failed: ' + JSON.stringify(result.content));
    providerCompleted = true;
    if (!plan.outputFile) throw new Error('image_output_missing');
    const output = verifyImageFile(plan.outputFile);
    const response: ToolResult = { ...result, structuredContent: imageExecutionResult(plan, 'completed', receipt, output), content: result.content.filter(item => item.type !== 'image'), imageReceipt: { ...receipt, output, review: 'not_reviewed' } };
    imageTransaction(directory, undefined, state => {
      Object.assign(state.jobs[plan.requestId], { status: 'completed', output, result: response, updatedAt: new Date().toISOString() });
    });
    ok = true;
    return response;
  } catch (error) {
    const status = providerCompleted || error instanceof GenaiImageOutputError || (error instanceof GenaiRequestError && error.terminal) ? 'failed' : 'submission_unknown';
    const message = error instanceof Error ? error.message : String(error);
    imageTransaction(directory, undefined, state => Object.assign(state.jobs[plan.requestId], {
      status, evidence: message, updatedAt: new Date().toISOString(),
      ...(error instanceof GenaiImageOutputError ? { providerId: error.requestId, usage: error.usage } : {}),
    }));
    const job = readImageState(directory)?.jobs[plan.requestId];
    return { isError: true, content: [{ type: 'text', text: message }],
      structuredContent: { ...imageExecutionResult(plan, status, { usage: job?.usage, requestId: job?.providerId }), error: message } };
  } finally {
    recordUsage(plan.outputFile, { ts: new Date().toISOString(), tool: plan.tool, ok, ms: Date.now() - started,
      ...priceOf(plan.tool, plan.args), note: 'Image routing receipt is authoritative; price key is a legacy estimate',
      detail: { requestId: plan.requestId, planId: plan.id, reserveUsd: plan.quote.reserveUsd } });
  }
}
export async function routeLegacyImage(tool: string, raw: unknown, dispatch: ImageDispatch): Promise<ToolResult> {
  gate(tool);
  const { imageContext: context, ...args } = z.record(z.unknown()).parse(raw);
  if (context !== undefined) {
    const input = imagePlanSchema.pick({ directory: true, assetId: true, requestId: true, reserveUsd: true }).strict().parse(context);
    const plan = planImage({ ...input, tool, args });
    return executeImage({ directory: plan.directory, planId: plan.id }, dispatch);
  }
  for (const location of [args.savePath, args.outputPath, process.cwd()].filter(v => typeof v === 'string') as string[]) {
    if (workflowEpisode(location)) throw new Error('image_context_required: use the episode workflow');
    let dir = canonicalPath(path.resolve(location));
    for (;;) {
      if (fs.existsSync(path.join(dir, '.work/model-settings.json')) || fs.existsSync(path.join(dir, '.social-flow/models.json')) || fs.existsSync(path.join(dir, 'storyboard/scenes.js')))
        throw new Error('image_context_required: pass directory, assetId and requestId for configured production');
      const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
    }
  }
  const parsed = parseImageArgs(tool, args);
  inputFiles(parsed, process.cwd());
  return dispatch(tool, parsed);
}
export function imageStatus(raw: unknown) {
  gate('image_status');
  const input = z.object({ directory: z.string().min(1), requestId: idSchema, action: z.enum(['read', 'reconcile', 'refresh']).default('read'),
    executorStopped: z.boolean().optional(), evidence: z.string().min(1).optional(), spentUsd: z.number().finite().nonnegative().optional() }).strict().parse(raw);
  const directory = fs.realpathSync(input.directory);
  if (input.action === 'refresh') return refreshGenaiImage(directory, input.requestId);
  if (input.action === 'reconcile') {
    if (!input.evidence || input.spentUsd === undefined) throw new Error('image_reconciliation_requires_billing_evidence');
    imageTransaction(directory, undefined, state => {
      const job = Object.hasOwn(state.jobs, input.requestId) ? state.jobs[input.requestId] : undefined;
      if (!job || !['submitting', 'submission_unknown', 'failed'].includes(job.status)) throw new Error('image_reconciliation_requires_unknown_terminal_request');
      if (job.status === 'submitting') {
        if (input.executorStopped !== true) throw new Error('image_reconciliation_requires_executor_stopped');
        if (job.ownerHost === os.hostname() && job.ownerPid) {
          try { process.kill(job.ownerPid, 0); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { job.ownerPid = undefined; } else throw error; }
          if (job.ownerPid) throw new Error('image_executor_still_running');
        }
      }
      job.status = 'failed'; job.spentUsd = input.spentUsd; job.evidence = input.evidence;
      job.updatedAt = new Date().toISOString();
    });
  }
  const jobs = readImageState(directory)?.jobs;
  return jobs && Object.hasOwn(jobs, input.requestId) ? jobs[input.requestId] : { requestId: input.requestId, status: 'not_started' };
}

async function refreshGenaiImage(directory: string, requestId: string) {
  const state = readImageState(directory);
  const job = state?.jobs[requestId];
  if (!job || !['astra_genai_text2img', 'astra_genai_edit', 'astra_genai_image_generate', 'astra_genai_image_edit'].includes(job.tool)) throw new Error('image_refresh_unsupported: requires an existing GenAI image request');
  const plan: ImagePlan = JSON.parse(fs.readFileSync(path.join(directory, '.work/image-routing/plans', job.planId + '.json'), 'utf8'));
  const { id, ...body } = plan;
  if (id !== job.planId || routingHash(body) !== id || plan.directory !== directory || plan.outputFile !== job.outputFile || plan.tool !== job.tool)
    throw new Error('image_recovery_plan_invalid');
  gate(plan.tool);
  const receipt = await (job.tool.startsWith('astra_genai_image_') ? recoverNativeImage : recoverGenaiImage)(job.outputFile + '.astra-genai.json');
  if (receipt.imagePath !== job.outputFile) throw new Error('image_recovery_output_mismatch');
  const result: ToolResult = { content: [{ type: 'text', text: JSON.stringify(receipt) }], imageReceipt: receipt,
    structuredContent: imageExecutionResult(plan, 'completed', receipt, receipt.output) };
  imageTransaction(directory, undefined, current => Object.assign(current.jobs[requestId], {
    status: 'completed', result, output: receipt.output, providerId: receipt.requestId, usage: receipt.usage,
    updatedAt: new Date().toISOString(),
  }));
  return readImageState(directory)!.jobs[requestId];
}
