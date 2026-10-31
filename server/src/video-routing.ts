import { buildFasth3Body, fasth3OmniSchema } from './fasth3-omni.js';
import { localVideoStrategy } from './local-video-models.js';
import { desktopVideoStatus } from './astra-genai-desktop.js';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config, disabledToolPatterns, disabledToolsFile, mlxServeConfigured } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { VIDEO_ADAPTERS, parseVideoArgs } from './video-registry.js';
import { SEEDANCE_MODEL_SPECS } from './seedance-client.js';
import { quoteVideo, type VideoQuote } from './video-pricing.js';
import { atomicJson, videoTransaction } from './video-state.js';
import { priceOf, recordUsage } from './usage-ledger.js';
import { videoEvents } from './video-events.js';
import { getGenaiVideoStatus, genaiMsrSchema, buildGenaiMsrBody, buildGenaiAudioBody, genaiAudioToVideoSchema, genaiMsrVoiceReferences, refreshGenaiMsrVoice } from './astra-genai-video.js';
import { GenaiRequestError } from './astra-genai-client.js';
import { prepareVideoImages, type ImageBinding } from './video-image-inputs.js';
import { prepareVideoVoice, type VoiceContinuity } from './video-voice.js';
import type { ToolResult } from './handlers.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';

const load = createRequire(import.meta.url);
const shared = fileURLToPath(new URL('../../skills/_shared/video-selection.js', import.meta.url));
const modelSettings = fileURLToPath(new URL('../../skills/_shared/model-settings.js', import.meta.url));
/** Channel assets (intro clips, logo motion, growth images) live here; they have no episode or shot. */
const CHANNEL_ASSET_RE = /^data\/[a-z0-9][a-z0-9-]*\/assets(\/|$)/;
interface Selection { engine: string; model?: string; resolution?: string; host?: string; operation?: string }
interface Context {
  episode: string; shotId: string; selection: Selection; source: string; revision: string;
  snapshotRevision: string | null;
  lines: string[][]; production: Record<string, unknown>; board: Record<string, unknown>; shot: Record<string, unknown>;
}
export const routingContext = (episode: string, shotId: string): Context =>
  (load(shared) as { readVideoContext(episode: string, shotId: string): Context }).readVideoContext(episode, shotId);
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
export const videoPlanSchema = z.object({ episode: z.string().min(1), shotId: z.string().min(1), requestId: idSchema,
  operation: z.string().optional(), tool: z.string().optional(), args: z.record(z.unknown()).default({}) }).strict();
export const videoExecuteSchema = z.object({ episode: z.string().min(1), planId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export interface VideoPlan {
  imageBindings?: ImageBinding[];
  version: 1; id: string; episode: string; shotId: string; requestId: string; tool: string;
  args: Record<string, unknown>; selection: Selection; source: string; contextRevision: string;
  inputs: Record<string, string>; quote: VideoQuote; execution: 'server' | 'host_handoff';
  sourceArgs?: Record<string, unknown>; voiceContinuity?: VoiceContinuity;
}
function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function canonical(file: string): string {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  if (parent === file) throw new Error('Cannot resolve path');
  return path.join(canonical(parent), path.basename(file));
}
function inputFiles(args: Record<string, unknown>, episode: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (value: unknown, key: string): unknown => {
    if (Array.isArray(value)) return value.map(v => visit(v, key.endsWith('Paths') ? key.slice(0, -1) : key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, visit(v,k)]));
    if (typeof value === 'string' && key.endsWith('Path') && key !== 'outputPath') {
      const absolute = fs.realpathSync(path.resolve(episode, value));
      if (!fs.statSync(absolute).isFile()) throw new Error('Input is not a regular file: ' + key);
      files[absolute] = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
      return absolute;
    }
    return value;
  };
  Object.assign(args, visit(args, '') as Record<string, unknown>);
  return files;
}
/** A saved engine without a voice lane (Veo, Gemini Omni, Seedance 1.x) left the plugin on 2026-10-31. */
function requireSupportedSelection(selection: Selection): void {
  const retired = selection.engine !== 'host' && !Object.values(VIDEO_ADAPTERS).some(a => a.engine === selection.engine) ||
    selection.engine === 'seedance' && Boolean(selection.model) && !Object.hasOwn(SEEDANCE_MODEL_SPECS, selection.model!);
  if (retired) throw new Error(`video_engine_unsupported: ${selection.engine}${selection.model ? ' ' + selection.model : ''} cannot keep a character's voice ` +
    'and is no longer supported; choose a video model again with project_manage (existing clips stay reusable)');
}
function bindSelection(tool: string, input: Record<string, unknown>, selection: Selection): Record<string, unknown> {
  const adapter = VIDEO_ADAPTERS[tool];
  if (!adapter || adapter.engine !== selection.engine) throw new Error('model_selection_mismatch: tool does not match selected engine');
  const local = localVideoStrategy(tool);
  if (local && selection.model && !local.acceptsModel(selection.model)) throw new Error('model_selection_mismatch: model does not match video adapter');
  const args = { ...input };
  if (tool === 'astra_audio2video') {
    if (args.maxAttempts !== undefined && args.maxAttempts !== 1)
      throw new Error('Managed ASTRA audio permits one submission per request; reconcile it before creating another attempt');
    args.maxAttempts = 1;
  }
  if (selection.model && tool !== 'astra_genai_msr') {
    if (args.model !== undefined && args.model !== selection.model) throw new Error('model_selection_mismatch: model differs from saved selection');
    args.model = selection.model;
  }
  if (selection.resolution && selection.engine === 'astra-genai-desktop' && ['astra_genai_desktop_extend', 'astra_genai_desktop_retake'].includes(tool)) {
    const match = /^(\d+)x(\d+)$/.exec(selection.resolution);
    if (match) {
    const target = { width: Number(match[1]), height: Number(match[2]) };
    if (args.targetResolution !== undefined && JSON.stringify(args.targetResolution) !== JSON.stringify(target)) throw new Error('model_selection_mismatch: targetResolution');
    args.targetResolution = target;
    }
  } else if (selection.resolution && tool !== 'astra_video_retake') {
    if (tool === 'astra_genai_msr' || ['astra','mlx'].includes(selection.engine)) {
      const match = /^(\d+)x(\d+)$/.exec(selection.resolution);
      if (!match) throw new Error('Local selection resolution must be WIDTHxHEIGHT');
      for (const [key, n] of [['width', Number(match[1])], ['height', Number(match[2])]] as const) {
        if (args[key] !== undefined && args[key] !== n) throw new Error('model_selection_mismatch: dimensions');
        args[key] = n;
      }
    } else {
      if (args.resolution !== undefined && args.resolution !== selection.resolution) throw new Error('model_selection_mismatch: resolution');
      args.resolution = selection.resolution;
    }
  }
  return args;
}
export function checkVideoEnvironment(tool: string): void {
  const gate = resolveToolGate(tool, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  if (!gate.enabled) throw new Error('video_tool_disabled: ' + gate.reason);
  const engine = VIDEO_ADAPTERS[tool]?.engine;
  const ready = engine === 'seedance' ? Boolean(config.arkApiKey) : engine === 'astra' ? Boolean(config.astraVideoApiKey) :
    ['astra-genai', 'astra-genai-desktop'].includes(engine) ? Boolean(config.astraGenaiApiKey) : engine === 'mlx' && mlxServeConfigured();
  if (!ready) throw new Error('video_provider_unconfigured: ' + engine);
}
export function planVideo(raw: unknown): VideoPlan {
  const input = videoPlanSchema.parse(raw);
  const context = routingContext(input.episode, input.shotId);
  const { selection } = context;
  requireSupportedSelection(selection);
  // shot_prompt writes the shot's video prompt; a call that names none sends it.
  const authored = (context.shot.visual as { video?: { prompt?: unknown } } | undefined)?.video?.prompt;
  const callArgs = input.args.prompt === undefined && typeof authored === 'string' ? { ...input.args, prompt: authored } : input.args;
  // A saved default operation (an LTX project saves 'reference', i.e. MSR) applies when the call names neither.
  const operation = input.operation ?? (input.tool ? undefined : selection.operation);
  const tool = input.tool || Object.entries(VIDEO_ADAPTERS).find(([name, a]) => a.engine === selection.engine && a.operation === operation && (a.engine !== 'mlx' || !selection.model || localVideoStrategy(name)?.acceptsModel(selection.model)))?.[0];
  if (input.tool && input.operation && VIDEO_ADAPTERS[input.tool]?.operation !== input.operation) throw new Error('Tool and operation disagree');
  if (selection.engine === 'host') {
    if (input.tool) throw new Error('model_selection_mismatch: host has no server adapter');
    const images = prepareVideoImages('host_external', callArgs, context.shot, context.episode);
    const body = { version: 1 as const, episode: context.episode, shotId: input.shotId, requestId: input.requestId,
      tool: 'host_external', args: callArgs, ...(images.imageBindings ? { imageBindings: images.imageBindings, imageHandoff: images.imageHandoff } : {}), selection, source: context.source, contextRevision: context.revision,
      inputs: Object.fromEntries((images.imageBindings ?? []).map(binding => [binding.path, binding.sha256])), quote: { reserveUsd: 0, estimatedUsd: 0, revision: 'host-allowance-v1', basis: 'External host allowance; limits and actual tool schema must be checked by host; not API enforcement' }, execution: 'host_handoff' as const };
    const plan = { ...body, id: hash(body) };
    atomicJson(path.join(context.episode, '.work/video-routing/plans', plan.id + '.json'), plan);
    return plan;
  }
  if (!tool) throw new Error('Selected deployment has no adapter for this operation');
  const images = prepareVideoImages(tool, bindSelection(tool, callArgs, selection), context.shot, context.episode);
  const voice = prepareVideoVoice(tool, images.args, { ...context, msrVoice: genaiMsrVoiceReferences() });
  const args = parseVideoArgs(tool, voice.args);
  const foreign = typeof args.prompt === 'string' ? nonEnglishOutsideQuotes(args.prompt) : null;
  if (foreign) throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks. Write the video prompt in English; only dialogue, inside quotes, uses the video's language.`);
  const output = canonical(path.resolve(context.episode, typeof args.outputPath === 'string' ? args.outputPath : '.work/video'));
  if (!within(context.episode, output)) throw new Error('Video output must stay inside the selected episode');
  args.outputPath = output;
  args.filename ??= `video-${input.requestId}.mp4`;
  const inputs = inputFiles(args, context.episode);
  for (const binding of images.imageBindings ?? []) inputs[binding.path] = binding.sha256;
  if (tool === 'fasth3_omni_reference') buildFasth3Body(fasth3OmniSchema.parse(args));
  if (tool === 'astra_genai_msr') buildGenaiMsrBody(genaiMsrSchema.parse(args));
  if (tool === 'astra_genai_audio2video') buildGenaiAudioBody(genaiAudioToVideoSchema.parse(args));
  if (tool === 'astra_video_retake' && selection.resolution) {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', String(args.sourceVideoPath)], { encoding: 'utf8', timeout: 15_000 }));
    const stream = probe.streams?.[0];
    if (!stream || `${stream.width}x${stream.height}` !== selection.resolution)
      throw new Error('model_selection_mismatch: retake inherits source dimensions; select the source resolution');
  }
  const quote = quoteVideo(tool, args);
  const body = { version: 1 as const, episode: context.episode, shotId: input.shotId, requestId: input.requestId, tool, args,
    ...(images.imageBindings ? { imageBindings: images.imageBindings } : {}),
    sourceArgs: input.args, ...(voice.voiceContinuity ? { voiceContinuity: voice.voiceContinuity } : {}),
    selection, source: context.source, contextRevision: context.revision, inputs, quote, execution: 'server' as const };
  const plan = { ...body, id: hash(body) };
  atomicJson(path.join(context.episode, '.work/video-routing/plans', plan.id + '.json'), plan);
  return plan;
}
interface Authorization { maxUsd: number; maxConcurrent: number; maxAttempts: number; openingSpendUsd?: number }
function authorization(context: Context): Authorization {
  const p = context.production;
  if (p.videoAuthorization !== undefined) {
    const auth = z.object({ reference: z.string().min(1), maxUsd: z.number().finite().nonnegative(),
      maxConcurrent: z.number().int().min(1).max(64).default(1), maxAttempts: z.number().int().min(1).max(20).default(3),
      // Reconciled spend before managed routing, for events whose cost the ledger cannot price.
      openingSpendUsd: z.number().finite().nonnegative().optional() }).strict().parse(p.videoAuthorization);
    return auth;
  }
  const approval = z.object({ kind: z.enum(['user','standing']), reference: z.string().min(1), at: z.string().min(1), quoteFingerprint: z.string().min(1) }).passthrough().parse(p.approval);
  if (!Number.isFinite(Date.parse(approval.at))) throw new Error('Invalid spending approval date');
  const helper = fileURLToPath(new URL('../../skills/autoproduce/references/production-cost.js', import.meta.url));
  const quote = (load(helper) as { quote(board: unknown): { quoteFingerprint: string } }).quote(context.board);
  if (quote.quoteFingerprint !== approval.quoteFingerprint) throw new Error('Existing quote changed; spending authorization does not cover this plan');
  return { maxUsd: z.number().finite().nonnegative().parse(p.videoBudgetUsd), maxConcurrent: 1,
    maxAttempts: z.number().int().min(1).max(5).parse(p.maxAttempts) };
}
export type VideoDispatch = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
// Each shot's video waits for the user's yes to its plan, unless they approved every shot (user directive 2026-10-31).
export const videoApproveSchema = z.object({
  episode: z.string().min(1),
  planIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).optional().describe('Video plans the user approved after seeing each shot\'s prompt, images and cost'),
  auto: z.boolean().optional().describe('true: the user approves every shot\'s video from now on; false: ask before each shot again'),
  request: z.string().trim().min(1).describe('The user\'s own words that gave this approval'),
}).strict().refine(input => input.planIds !== undefined || input.auto !== undefined, 'name planIds or auto');
// shown: the shot's prompt and frames the approved plan used, so the review page can tell a later edit.
// callPrompt: the plan sent a prompt named in its call instead of the shot's stored one. lines: structure-contract.js videoLines.
interface Shown { prompt?: string; callPrompt?: true; start?: string; end?: string; lines?: string[][] }
interface Approvals { auto?: { request: string; at: string }; plans: Record<string, { shotId: string; requestId: string; request: string; at: string; shown?: Shown }> }
const approvalsFile = (episode: string) => path.join(episode, '.work/video-routing/approvals.json');
function readApprovals(episode: string): Approvals {
  return fs.existsSync(approvalsFile(episode)) ? JSON.parse(fs.readFileSync(approvalsFile(episode), 'utf8')) : { plans: {} };
}
// The review page cannot read .work, so storyboard/video-approvals.js carries each shot's latest yes (storyboard-html-template.html).
function writeApprovalView(episode: string, approvals: Approvals) {
  const dir = path.join(episode, 'storyboard');
  if (!fs.existsSync(path.join(dir, 'scenes.js'))) return;
  const shots: Record<string, { planId: string; at: string; shown?: Shown }> = {};
  for (const [planId, entry] of Object.entries(approvals.plans))
    if (!shots[entry.shotId] || entry.at >= shots[entry.shotId].at) shots[entry.shotId] = { planId, at: entry.at, ...(entry.shown ? { shown: entry.shown } : {}) };
  const view = { auto: approvals.auto?.at ?? null, shots };
  fs.writeFileSync(path.join(dir, 'video-approvals.js'), 'window.VIDEO_APPROVALS = ' + JSON.stringify(view).replace(/</g, '\\u003c') + ';\n');
}
export function approveVideo(raw: unknown): Approvals {
  const input = videoApproveSchema.parse(raw), episode = fs.realpathSync(input.episode);
  const approvals = readApprovals(episode), at = new Date().toISOString();
  if (input.auto) approvals.auto = { request: input.request, at };
  else if (input.auto === false) delete approvals.auto;
  for (const id of input.planIds ?? []) {
    const plan: VideoPlan = JSON.parse(fs.readFileSync(path.join(episode, '.work/video-routing/plans', id + '.json'), 'utf8'));
    // A yes covers the plan the user saw; a plan whose shot changed since cannot run (video_execute), so it takes none.
    const context = routingContext(episode, plan.shotId);
    if (context.revision !== plan.contextRevision)
      throw new Error(`video_plan_stale: shot ${plan.shotId}'s frames, prompt, lines or settings changed after this plan — plan it again and show the user the new plan`);
    const visual = (context.shot.visual ?? {}) as { video?: { prompt?: unknown }; frames?: { start?: unknown; end?: unknown } };
    const used = (plan.sourceArgs ?? plan.args).prompt, fromShot = used === undefined || used === visual.video?.prompt;
    const shown = Object.fromEntries(Object.entries({ prompt: fromShot ? visual.video?.prompt : undefined, start: visual.frames?.start, end: visual.frames?.end })
      .filter(([, value]) => typeof value === 'string')) as Shown;
    if (!fromShot) shown.callPrompt = true;
    shown.lines = context.lines;
    approvals.plans[id] = { shotId: plan.shotId, requestId: plan.requestId, request: input.request, at, shown };
  }
  atomicJson(approvalsFile(episode), approvals);
  writeApprovalView(episode, approvals);
  return approvals;
}
export async function executeVideo(raw: unknown, dispatch: VideoDispatch): Promise<ToolResult> {
  const request = videoExecuteSchema.parse(raw), episode = fs.realpathSync(request.episode);
  const plan: VideoPlan = JSON.parse(fs.readFileSync(path.join(episode, '.work/video-routing/plans', request.planId + '.json'), 'utf8'));
  const { id, ...body } = plan;
  if (id !== request.planId || hash(body) !== id || plan.episode !== episode) throw new Error('Invalid video plan');
  if (plan.execution === 'host_handoff') throw new Error('host_handoff_required: use the selected host CLI; no API substitution');
  const approvals = readApprovals(episode);
  if (!approvals.auto && !approvals.plans[id]) throw new Error(`video_approval_required: show the user shot ${plan.shotId}'s prompt, images and cost, ` +
    `then record their yes with video_approve {planIds:["${id}"]}, or auto:true once they approve every shot`);
  const context = routingContext(episode, plan.shotId);
  if (context.revision !== plan.contextRevision) throw new Error('video_plan_stale: the shot\'s frames, prompt, lines, selection or authorization changed');
  if (plan.tool === 'astra_genai_msr') await refreshGenaiMsrVoice();
  const refreshed = planVideo({ episode, shotId: plan.shotId, requestId: plan.requestId, tool: plan.tool, args: plan.sourceArgs ?? plan.args });
  if (refreshed.id !== id) throw new Error('video_plan_stale: inputs, price or adapter contract changed');
  checkVideoEnvironment(plan.tool);
  const auth = authorization(context);
  const cached = videoTransaction(episode, state => {
    const existing = state.jobs[plan.requestId];
    if (existing) {
      if (existing.planId !== id) throw new Error('request_id_conflict: same request ID has a different plan');
      if (existing.status === 'completed') return existing.result as ToolResult;
      if (existing.status === 'failed') throw new Error(`video_request_failed: ${existing.evidence || 'the provider rejected it'}; plan a new requestId to try again`);
      throw new Error(`video_request_pending: ${existing.status}; provider ID ${existing.providerId || 'unknown'}; do not resubmit`);
    }
    const jobs = Object.values(state.jobs);
    const occupied = jobs.filter(job => !['completed', 'failed'].includes(job.status));
    if (occupied.length >= auth.maxConcurrent) throw new Error('video_concurrency_limit: pending jobs include ambiguous submissions');
    const used = jobs.reduce((sum, job) => sum + (job.settledUsd ?? job.reserveUsd), state.openingSpendUsd ?? 0);
    if (used + plan.quote.reserveUsd > auth.maxUsd + 1e-9) throw new Error('video_budget_exceeded');
    if (jobs.filter(job => job.shotId === plan.shotId).length >= auth.maxAttempts) throw new Error('video_attempt_limit');
    state.jobs[plan.requestId] = { planId: id, requestId: plan.requestId, shotId: plan.shotId, tool: plan.tool,
      status: 'submitting', reserveUsd: plan.quote.reserveUsd, updatedAt: new Date().toISOString() };
    return undefined;
  }, auth.openingSpendUsd);
  if (cached) return cached;
  const update = (patch: Record<string, unknown>) => videoTransaction(episode, state => {
    Object.assign(state.jobs[plan.requestId], patch, { updatedAt: new Date().toISOString() });
  });
  // An adapter that proves nothing is running (terminal) closes the request as failed and frees its
  // concurrency slot; a request that never got a provider ID was never billed. Anything else stays
  // submission_unknown until video_status reconciles it.
  const settle = (terminal: boolean, evidence: string, result?: ToolResult) => videoTransaction(episode, state => {
    const job = state.jobs[plan.requestId];
    Object.assign(job, { status: terminal ? 'failed' : 'submission_unknown', evidence, updatedAt: new Date().toISOString() }, result ? { result } : {});
    if (terminal && !job.providerId) job.settledUsd = 0;
  });
  const startedAt = Date.now();
  let ok = false;
  try {
    const result = await videoEvents.run({
      submitted: providerId => videoTransaction(episode, state => {
        const job = state.jobs[plan.requestId];
        job.providerIds = [...new Set([...(job.providerIds ?? []), providerId])];
        job.providerId = providerId; job.status = 'submitted'; job.updatedAt = new Date().toISOString();
      }),
      usage: tokens => { if (!Number.isFinite(tokens) || tokens < 0) throw new Error('Invalid provider usage'); update({ tokens }); },
    }, () => dispatch(plan.tool, plan.args));
    if (result.isError) {
      settle(result.terminal === true, result.content.map(item => item.type === 'text' ? item.text : '').join('\n').slice(0, 1000), result);
      return result;
    }
    videoTransaction(episode, state => {
      const job = state.jobs[plan.requestId];
      if ((job.providerIds?.length ?? 0) > 1) throw new Error('Unexpected multiple provider submissions; reconcile all receipts before completion');
      job.status = 'completed'; job.result = result; job.updatedAt = new Date().toISOString();
      if (job.tokens !== undefined && plan.quote.tokenRate !== undefined) job.settledUsd = job.tokens * plan.quote.tokenRate / 1e6;
      // Unmetered success retains its reservation, explicitly an estimate, never fabricated usage.
    });
    ok = true;
    return result;
  } catch (error) {
    settle(error instanceof GenaiRequestError && error.terminal, (error instanceof Error ? error.message : String(error)).slice(0, 1000));
    throw error;
  }
  finally {
    const price = priceOf(plan.tool, plan.args);
    recordUsage(String(plan.args.outputPath), { ts: new Date().toISOString(), tool: plan.tool, ok,
      ms: Date.now() - startedAt, ...price,
      note: 'Managed routing estimate; authoritative reservations and provider tokens: .work/video-routing/state.json',
      detail: { requestId: plan.requestId, planId: plan.id, reserveUsd: plan.quote.reserveUsd } });
  }
}

/**
 * A channel asset under data/<channel>/assets/ (owner decision 2026-10-18): no episode, no videoContext,
 * but the saved workspace video model still binds the call, and the request is written to
 * data/<channel>/assets/.work/video-requests.jsonl (the episode ledger deliberately skips asset paths).
 */
async function dispatchChannelAsset(tool: string, args: Record<string, unknown>, root: string, output: string, dispatch: VideoDispatch): Promise<ToolResult> {
  const read = (load(modelSettings) as { readSettings(root: string): { status: string; config?: { models?: { video?: Selection } } } }).readSettings(root);
  const selection = read.config?.models?.video;
  if (!selection) throw new Error(`project_setup_required: ${read.status}; save .social-flow/models.json before generating channel assets`);
  requireSupportedSelection(selection);
  const bound = { ...bindSelection(tool, args, selection), outputPath: output };
  const startedAt = Date.now();
  let ok = false;
  try {
    const result = await dispatch(tool, bound);
    ok = !result.isError;
    return result;
  } finally {
    const assets = path.join(root, ...path.relative(root, output).split(path.sep).slice(0, 3));
    const file = path.join(assets, '.work/video-requests.jsonl');
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), kind: 'channel_asset', tool, ok, ms: Date.now() - startedAt,
        ...priceOf(tool, bound), outputPath: output, selection, source: 'workspace_settings' }) + '\n');
    } catch (error) {
      // A record write must never take down a call that already cost money.
      console.error('[social-flow] could not write the channel-asset video record: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

/** Legacy standalone tools remain callable; episode calls cannot bypass selection by using them. */
export async function routeLegacyVideo(tool: string, raw: unknown, dispatch: VideoDispatch): Promise<ToolResult> {
  const gate = resolveToolGate(tool, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  if (!gate.enabled) throw new Error('video_tool_disabled: ' + gate.reason);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return dispatch(tool, raw as Record<string, unknown>);
  const { videoContext, ...args } = raw as Record<string, unknown>;
  if (videoContext !== undefined) {
    const ctx = videoPlanSchema.pick({ episode: true, shotId: true, requestId: true }).strict().parse(videoContext);
    const plan = planVideo({ ...ctx, tool, args });
    return executeVideo({ episode: plan.episode, planId: plan.id }, dispatch);
  }
  const output = canonical(path.resolve(typeof args.outputPath === 'string' ? args.outputPath : process.cwd()));
  let dir = output;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.social-flow/models.json')) && CHANNEL_ASSET_RE.test(path.relative(dir, output).split(path.sep).join('/')))
      return dispatchChannelAsset(tool, args, dir, output, dispatch);
    if (fs.existsSync(path.join(dir, '.work/model-settings.json')) || fs.existsSync(path.join(dir, '.social-flow/models.json')))
      throw new Error('video_context_required: pass episode, shotId and requestId for configured production');
    const parent = path.dirname(dir); if (parent === dir) break; dir = parent;
  }
  // The MCP process may run at a configured workspace even if outputPath points outside it.
  if (fs.existsSync(path.join(process.cwd(), '.social-flow/models.json'))) throw new Error('video_context_required');
  return dispatch(tool, args);
}

/** Read persisted receipts; refresh polls an existing GenAI job; reconcile settles an unknown request from billing evidence. */
export async function videoStatus(raw: unknown) {
  const input = z.object({ episode: z.string().min(1), requestId: idSchema, action: z.enum(['read', 'refresh', 'reconcile']).default('read'),
    executorStopped: z.boolean().optional(), evidence: z.string().min(1).optional(), spentUsd: z.number().finite().nonnegative().optional() }).strict().parse(raw);
  const episode = fs.realpathSync(input.episode);
  const file = path.join(episode, '.work/video-routing/state.json');
  if (!fs.existsSync(file)) return { requestId: input.requestId, status: 'not_started' };
  if (input.action === 'reconcile') {
    // Same contract as image_status: the caller brings the provider's terminal status and the actual charge.
    if (!input.evidence || input.spentUsd === undefined) throw new Error('video_reconciliation_requires_billing_evidence');
    videoTransaction(episode, current => {
      const job = Object.hasOwn(current.jobs, input.requestId) ? current.jobs[input.requestId] : undefined;
      if (!job || job.status === 'completed') throw new Error('video_reconciliation_requires_unknown_terminal_request');
      if (['reserved', 'submitting', 'submitted'].includes(job.status) && input.executorStopped !== true)
        throw new Error('video_reconciliation_requires_executor_stopped: confirm the executing process has exited and the provider job is terminal');
      Object.assign(job, { status: 'failed', settledUsd: input.spentUsd, evidence: input.evidence, updatedAt: new Date().toISOString() });
    });
  }
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const job = state.jobs?.[input.requestId];
  if (input.action === 'refresh' && job) {
    if (job.status === 'failed') throw new Error('video_request_failed: nothing to recover; plan a new requestId');
    if (!job.tool.startsWith('astra_genai_desktop_') && !['astra_genai_text2video', 'astra_genai_img2video', 'astra_genai_audio2video', 'astra_genai_msr'].includes(job.tool)) throw new Error('video_refresh_unsupported: use provider-specific recovery');
    const plan: VideoPlan = JSON.parse(fs.readFileSync(path.join(episode, '.work/video-routing/plans', job.planId + '.json'), 'utf8'));
    const { id, ...body } = plan;
    if (id !== job.planId || hash(body) !== id || plan.episode !== episode || plan.tool !== job.tool) throw new Error('Invalid recovery plan');
    checkVideoEnvironment(plan.tool);
    const receiptPath = path.join(String(plan.args.outputPath), String(plan.args.filename)) + '.astra-genai.json';
    const result = job.tool.startsWith('astra_genai_desktop_') ? await desktopVideoStatus(receiptPath, true) : await getGenaiVideoStatus({ receiptPath, download: true });
    if (job.providerId && result.jobId !== job.providerId) throw new Error('GenAI recovery job ID mismatch');
    if (result.downloaded) {
      const response: ToolResult = { content: [{ type: 'text', text: JSON.stringify({ ...result, receiptPath }) }] };
      videoTransaction(episode, current => Object.assign(current.jobs[input.requestId], { status: 'completed', providerId: result.jobId, result: response, updatedAt: new Date().toISOString() }));
      return videoStatus({ episode, requestId: input.requestId });
    }
    return { ...job, providerStatus: result.status, recovery: 'Poll this same request with action:refresh; do not resubmit.' };
  }
  return job ? { ...job, recovery: job.status === 'completed' ? 'Reuse result; no new generation.' :
    job.status === 'failed' ? 'Closed as failed; its concurrency slot is free. Plan a new requestId to try again.' :
    'Inspect providerId at the selected provider. Keep the reservation until billing and terminal status are reconciled with action:reconcile. Do not change requestId or delete state to retry.' } :
    { requestId: input.requestId, status: 'not_started' };
}
