import { bindRegisteredPanels, bindSceneCards, buildSceneWire, prepareSceneRequest, bindSceneAdapter, checkSceneDeployment, compileSceneTimeline, sceneCoverage, mapSceneInputs, sceneImageBindings, sceneTimelineWords, type SceneRequest } from './scene-video.js';
import { desktopGatewayKey } from './astra-genai-client.js';
import { openingPrompt, sceneShotBindingsSchema, sceneVideoDirectionSchema, type SceneVideoDirection, type OpeningPosition } from './msr-opening.js';
import { buildFasth3Body, fasth3OmniSchema } from './fasth3-omni.js';
import { localVideoStrategy } from './local-video-models.js';
import { desktopAudioWindow, desktopVideoStatus } from './astra-genai-desktop.js';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config, disabledToolPatterns, disabledToolsFile, mlxServeConfigured } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { framesForSeconds } from './astra-video-client.js';
import { assessVideoDuration, DURATION_TOOLS, resolveVideoDuration } from './video-duration.js';
import { VIDEO_ADAPTERS, VENDOR_REFERENCE_TOOLS, parseVideoArgs, videoPromptLimit } from './video-registry.js';
import { ltxApiAudioSeconds } from './ltx-api-video.js';
import { HOSTED_VIDEO_ROUTES } from './hosted-video-routes.js';
import { buildMinimaxBody, minimaxImg2VideoSchema, minimaxReferenceSchema } from './minimax-video.js';
import { checkHeygenInputs, heygenImg2VideoSchema, heygenReferenceSchema } from './heygen-video.js';
import { pollSeedanceTask, probeVideo, verifySeedanceVideo, SEEDANCE_MODEL_SPECS } from './seedance-client.js';
import { saveVendorOutput } from './vendor-video.js';
import { resolveOutputFile } from './media-utils.js';
import { quoteVideo, type VideoQuote } from './video-pricing.js';
import { atomicJson, videoTransaction } from './video-state.js';
import { priceOf, recordUsage } from './usage-ledger.js';
import { recordVideoSubmission, videoEvents } from './video-events.js';
import { msrOutputContract, genaiMsrPromptLimit, checkGenaiVideoOptions, getGenaiVideoStatus, genaiMsrSchema, buildGenaiMsrBody, buildGenaiAudioBody, genaiAudioToVideoSchema, genaiMsrVoiceReferences, refreshGenaiMsrVoice, genaiV2Resolution } from './astra-genai-video.js';
import { astraGenaiBaseUrl, GenaiRequestError, pollGenaiJob, requestGenai } from './astra-genai-client.js';
import { hasSubjectInput, hasVideoSubjectReferences, prepareVideoImages, registeredVideoSubjects, type ImageBinding } from './video-image-inputs.js';
import { prepareVideoVoice, type VoiceContinuity } from './video-voice.js';
import type { ToolResult } from './handlers.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import { attributeWords, sceneShotNotes, shotVisualWords, withSceneCamera, cameraDrift, cameraMoveWords, compileVideoPrompt, sceneCameraDirection, scenePromptText, type DirectionBinding, type VideoPromptSource } from './video-prompt.js';
import { readVideoProduction, refreshVideoReview } from './video-review.js';
import { requireReadyProject } from './project.js';

const load = createRequire(import.meta.url);
const shared = fileURLToPath(new URL('../../skills/_shared/video-selection.js', import.meta.url));
const modelSettings = fileURLToPath(new URL('../../skills/_shared/model-settings.js', import.meta.url));
/** Channel assets (intro clips, logo motion, growth images) live here; they have no episode or shot. */
const CHANNEL_ASSET_RE = /^data\/[a-z0-9][a-z0-9-]*\/assets(\/|$)/;
interface Selection { engine: string; model?: string; resolution?: string; host?: string; operation?: string }
interface Context {
  sceneNo?: number; timed?: boolean; shotIds?: string[]; sceneDirection?: SceneVideoDirection; sceneMembers?: Record<string, unknown>[];
  episode: string; shotId: string; selection: Selection; source: string; revision: string;
  snapshotRevision: string | null;
  lines: string[][]; production: Record<string, unknown>; board: Record<string, unknown>; shot: Record<string, unknown>;
}
export function routingContext(episode: string, shotId?: string, sceneNo?: number): Context {
  const reader = load(shared) as {
    readVideoContext(episode: string, shotId?: string, sceneNo?: number): Context;
    MissingSceneDirection: new (...args: never[]) => Error & {members: Record<string,unknown>[]; selection: Selection; board: Record<string,unknown>};
  };
  try { return reader.readVideoContext(episode, shotId, sceneNo); }
  catch (error) {
    if (sceneNo === undefined || !(error instanceof reader.MissingSceneDirection)) throw error;
    // Older storyboards still have ordered cards. Show their inputs in the refusal
    // without inventing scene direction, approving a plan or rewriting the board.
    const timeline = compileSceneTimeline(error.members, {}, episode, error.board);
    const request = {...timeline, sceneNo, prompt:sceneTimelineWords(timeline, {})};
    mapSceneInputs(request, selectedVideoTool(error.selection) ?? error.selection.engine, error.selection.model,
      [{input:'direction', role:'scene_direction', shotId:timeline.shotIds[0], frame:0, reason:error.message}]);
    throw error;
  }
}
function selectedVideoTool(selection: Selection, operation = selection.operation): string | undefined {
  return Object.entries(VIDEO_ADAPTERS).find(([name, a]) => a.engine === selection.engine && a.operation === operation &&
    (a.engine !== 'mlx' || !selection.model || localVideoStrategy(name)?.acceptsModel(selection.model)))?.[0];
}

/** The same source coverage and duration grid inform authoring and the executable plan. */
function shotVideoTiming(context: Context, tool: string, args: Record<string, unknown>) {
  const { shot } = context;
  let coverage: { requiredSeconds: number } | undefined;
  if (context.sceneNo !== undefined) {
    coverage = { requiredSeconds: Number(shot.duration) };
  } else if (shot.duration !== undefined) {
    const edit = load(fileURLToPath(new URL('../../skills/produce/references/edit-plan.js', import.meta.url))).preview(context.board.SCENES, { videoWarningsApproved: true });
    const cards = context.board.SCENES as {id?: string; shot?: {id?: string}}[];
    const index = cards.findIndex(card => String(card.id ?? card.shot?.id) === context.shotId);
    const timing = load(fileURLToPath(new URL('../../skills/_shared/video-duration.js', import.meta.url)));
    const planned = edit.find((entry: { card: number }) => entry.card === index);
    // edit.in on a card that plays its clip soundtrack trims the clip it has; a new clip owes no extra head.
    const ownVoice = (shot.sound as { audioSource?: string } | undefined)?.audioSource === 'video';
    coverage = timing.shotTiming(shot, { edit: ownVoice && planned ? { ...planned, in: 0 } : planned });
  }
  if (args.requiredSeconds !== undefined && (typeof args.requiredSeconds !== 'number' || !Number.isFinite(args.requiredSeconds) || args.requiredSeconds <= 0))
    throw new Error('requiredSeconds must be finite positive seconds');
  const speech = VIDEO_ADAPTERS[tool]?.voice === 'reference' &&
    (shot.narration as Array<{ delivery?: string }> | undefined)?.some(line => line.delivery !== 'voiceover')
    ? nativeSpeechTiming(shot, (context.board.STORY as { language?: unknown } | undefined)?.language) : undefined;
  const required = coverage || args.requiredSeconds !== undefined || speech
    ? Math.max(coverage?.requiredSeconds ?? 0, args.requiredSeconds as number ?? 0, speech?.estimatedSeconds ?? 0) : undefined;
  return { ...assessVideoDuration(tool, args, required), basis: 'planned' as const, coverage,
    ...(speech ? { speech } : {}),
    note: 'Fit of authored source coverage, not measured performance or generated output. Recheck after speech/action timing or generation changes.' };
}

/**
 * Estimate the complete performance before selecting a native-speech duration.
 * Uncalibrated language rates remain estimates; generated dialogue still needs review.
 */
function nativeSpeechTiming(shot: Record<string, unknown>, language?: unknown) {
  const acting = load(fileURLToPath(new URL('../../skills/_shared/scene-acting.js', import.meta.url))) as {
    planScenePerformance(shot: unknown, duration: (line: { tts?: string }) => number | null): { durationSeconds: number | null };
    estimateSpeech(text: unknown, language?: unknown): { seconds: number; calibrated: boolean } | null;
  };
  let estimatedSeconds: number | null, unmeasuredRate = false;
  try {
    estimatedSeconds = acting.planScenePerformance(shot, line => {
      const estimate = acting.estimateSpeech(line.tts, language);
      if (estimate && !estimate.calibrated) unmeasuredRate = true;
      return estimate?.seconds ?? null;
    }).durationSeconds;
  } catch { return undefined; }
  // An untimed standalone action or a line with nothing to say leaves the clock open: nothing to compare.
  if (estimatedSeconds === null || !(estimatedSeconds > 0)) return undefined;
  return { estimatedSeconds, ...(unmeasuredRate ? { speechRate: 'uncalibrated' as const } : {}) };
}

function nativeSpeechFit(shot: Record<string, unknown>, requestedSeconds: number, limits: NonNullable<ReturnType<typeof assessVideoDuration>['limits']>, language?: unknown) {
  const timing = nativeSpeechTiming(shot, language);
  if (!timing) return undefined;
  const { estimatedSeconds, speechRate } = timing;
  const unmeasuredRate = speechRate === 'uncalibrated';
  let shortest: { requestedSeconds: number; numFrames?: number; durationSeconds?: number };
  try { shortest = load(fileURLToPath(new URL('../../skills/_shared/video-duration.js', import.meta.url))).minimumDuration(estimatedSeconds, limits); }
  catch { return undefined; }
  const round = (n: number) => Math.round(n * 100) / 100;
  const excessSeconds = round(requestedSeconds - estimatedSeconds);
  const request = shortest.numFrames !== undefined ? `numFrames ${shortest.numFrames}` : `durationSeconds ${shortest.durationSeconds}`;
  // Only the Korean rate was fitted on measured clips: another language's shortest request is a guess to check against a made clip.
  return { estimatedSeconds, ...(unmeasuredRate ? { speechRate: 'uncalibrated' as const } : {}), requestedSeconds: round(requestedSeconds), excessSeconds,
    shortestRequest: { ...(shortest.numFrames !== undefined ? { numFrames: shortest.numFrames } : { durationSeconds: shortest.durationSeconds }), seconds: round(shortest.requestedSeconds) },
    ...(excessSeconds > SPEECH_SLACK_SECONDS && shortest.requestedSeconds < requestedSeconds - 1e-6 ? {
      warning: `The request runs ${round(requestedSeconds)}s; the lines and timed actions need about ${estimatedSeconds}s. The model plays the other ${excessSeconds}s as silent acting, usually before the line. ` +
        `${request} (${round(shortest.requestedSeconds)}s) covers them. A pause the story needs belongs in the performance as a timed action or the line's leadInSeconds/tailOutSeconds.` +
        (unmeasuredRate ? ' The speaking rate for this language is not measured on made clips: time the line on one clip before shortening the others.' : '') } : {}) };
}
/** Slack a line keeps: under this the measured clips opened on the line; from 2 s they opened on 1.4 s of silence. */
const SPEECH_SLACK_SECONDS = 0.5;

/** No generation, image preparation, prompt or credentials needed to inspect shot limits. */
export function readShotVideoTiming(episode: string, shotId: string) {
  const context = routingContext(episode, shotId);
  requireSupportedSelection(context.selection);
  const video = (context.shot.visual as { video?: Record<string, unknown> } | undefined)?.video ?? {};
  const tool = selectedVideoTool(context.selection);
  const args = tool ? bindSelection(tool, video, context.selection) : video;
  return { shotId, selection: context.selection, source: context.source,
    ...shotVideoTiming(context, tool ?? 'unresolved', args) };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
export const videoPlanSchema = z.object({ episode: z.string().min(1), shotId: z.string().min(1).optional(), sceneNo: z.number().int().positive().optional(), requestId: idSchema,
  validateScenePayload: z.boolean().optional(), sceneRendering:z.literal('per_shot').optional(), shotBindings:sceneShotBindingsSchema.optional(),
  purpose: z.enum(['draft', 'final', 'revision']).optional(),
  basedOnRequestId: idSchema.optional(), changeNote: z.string().min(1).max(1000).optional(),
  maxCostUsd: z.number().nonnegative().finite().optional(),
  operation: z.string().optional(), tool: z.string().optional(), args: z.record(z.unknown()).default({}) }).strict().refine(v => Boolean(v.shotId) !== (v.sceneNo !== undefined), 'Choose sceneNo or shotId');
export const videoExecuteSchema = z.object({ episode: z.string().min(1), planId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export interface VideoPlan {
  sceneNo?: number; shotIds?: string[]; sceneDurationSeconds?: number; sceneRendering?: 'per_shot'; shotBindings?: z.infer<typeof sceneShotBindingsSchema>;
  purpose?: 'draft' | 'final' | 'revision'; basedOnRequestId?: string; changeNote?: string;
  imageBindings?: ImageBinding[]; sceneRequest?: SceneRequest;
  version: 1; id: string; episode: string; shotId: string; requestId: string; tool: string;
  args: Record<string, unknown>; selection: Selection; source: string; contextRevision: string;
  inputs: Record<string, string>; quote: VideoQuote; execution: 'server' | 'host_handoff';
  maxCostUsd?: number; sourceArgs?: Record<string, unknown>; voiceContinuity?: VoiceContinuity;
  sourcePrompt?: string;
  directionBindings?: DirectionBinding[]; directionWarnings?: string[];
  durationPlan?: ReturnType<typeof shotVideoTiming>;
  speechFit?: NonNullable<ReturnType<typeof nativeSpeechFit>>;
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
/** Keep retired deployments out of new plans, including indirect selections through the host. */
function requireSupportedSelection(selection: Selection): void {
  if (selection.engine === 'host' && selection.model?.startsWith('veo-'))
    throw new Error('model_selection_mismatch: Google Cloud Veo requires the veo engine');
  if (selection.engine === 'veo' && !Object.hasOwn(HOSTED_VIDEO_ROUTES.veo_img2video.modelConstraints, selection.model ?? ''))
    throw new Error('video_engine_unsupported: select a current Google Cloud Veo model from video_catalog. Gemini Developer API Veo previews are retired.');
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
      // Preserve the selected size; historical v2 presets can be invalid on the live backend.
      const resolution = selection.engine === 'astra-genai' ? genaiV2Resolution(selection.resolution) : selection.resolution;
      if (args.resolution !== undefined && args.resolution !== resolution) throw new Error(`model_selection_mismatch: resolution (expected ${resolution})`);
      args.resolution = resolution;
    }
  }
  return args;
}
export function checkVideoEnvironment(tool: string): void {
  const gate = resolveToolGate(tool, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  if (!gate.enabled) throw new Error('video_tool_disabled: ' + gate.reason);
  const engine = VIDEO_ADAPTERS[tool]?.engine;
  const ready = HOSTED_VIDEO_ROUTES[tool] ? HOSTED_VIDEO_ROUTES[tool].configured() : engine === 'seedance' ? Boolean(config.arkApiKey) : engine === 'astra' ? Boolean(config.astraVideoApiKey) :
    engine === 'astra-genai-desktop' ? Boolean(desktopGatewayKey()) : engine === 'astra-genai' ? Boolean(config.astraGenaiApiKey) :
    engine === 'minimax' ? Boolean(config.minimaxApiKey) : engine === 'heygen' ? Boolean(config.heygenApiKey) : engine === 'mlx' && mlxServeConfigured();
  if (!ready) throw new Error('video_provider_unconfigured: ' + engine);
}
function saveVideoPlan(plan: VideoPlan) {
  const file = path.join(plan.episode, '.work/video-routing/plans', plan.id + '.json');
  if (!fs.existsSync(file)) atomicJson(file, plan);
  refreshVideoReview(plan.episode);
  return plan;
}
const sceneRoute = '/v1/ltx/v2/scene-to-video';
function planOutputContract(plan:VideoPlan) {
  if (plan.sceneRendering && plan.sceneRequest) return msrOutputContract('scene-to-video', {
    resolution:plan.selection.resolution, fps:plan.sceneRequest.fps, numFrames:plan.sceneRequest.frameCount,
  });
  const operation = plan.tool === 'astra_genai_msr' ? 'msr' : plan.tool === 'astra_genai_img2video' ? 'image-to-video' : '';
  return msrOutputContract(operation, plan.args);
}
async function checkCompletedMedia(plan:VideoPlan, jobId?:string) {
  if (plan.selection.engine === 'seedance' && jobId) {
    const target = resolveOutputFile(String(plan.args.outputPath), String(plan.args.filename), 'video');
    try { await verifySeedanceVideo(target); }
    catch { throw new Error('video_output_unverified: run video_status with action refresh to recover the existing Seedance job'); }
    return;
  }
  const expected = planOutputContract(plan);
  if (!expected) return;
  const target = resolveOutputFile(String(plan.args.outputPath), String(plan.args.filename), 'video');
  const result = await getGenaiVideoStatus({receiptPath:target + '.astra-genai.json',download:true}, expected, {target, jobId, fingerprint:plan.sceneRendering ? plan.id : undefined});
  if (!result.downloaded) throw new Error('Completed video has no verified local output');
}
async function validateShotRenderPlan(plan: VideoPlan) {
  const capabilities = await requestGenai('GET', sceneRoute + '/capabilities', undefined, 15_000);
  z.object({version:z.literal(1), execution:z.literal('per_shot'), transitions:z.array(z.string()).refine(values=>values.includes('hard_cut'))}).parse(capabilities);
  const guides = z.object({motion_prefix:z.boolean().optional(),timed_dialogue:z.string().nullish()}).parse(capabilities);
  for (const binding of plan.shotBindings ?? []) {
    if (binding.motionPrefix && !guides.motion_prefix || binding.performanceAudio && guides.timed_dialogue !== 'supplied_performance')
      throw new Error('scene_render_guide: ' + binding.shotId + ' requests an unavailable performance or motion guide');
  }
  if (plan.sceneRequest?.audio) {
    const mode = plan.sceneRequest.audio.mode ?? 'conditioning';
    const contract = z.object({scene_audio_modes:z.record(z.string())}).safeParse(capabilities);
    if (!contract.success || contract.data.scene_audio_modes[mode] !== plan.selection.model)
      throw new Error('scene_audio@0: gateway does not advertise ' + mode + ' for the selected model');
  }
  const prepared = await buildSceneWire(plan.sceneRequest!, String(plan.selection.model), String(plan.selection.resolution), true, plan.shotBindings);
  const validation = await requestGenai('POST', sceneRoute + '/validate', prepared.body, 120000, undefined, undefined, 'scene-' + plan.id);
  z.object({schema_valid:z.literal(true), model:z.literal(String(plan.selection.model)), shots:z.literal(plan.shotIds!.length)}).parse(validation);
  return prepared;
}

async function executeShotRenderPlan(plan: VideoPlan, prepared:Awaited<ReturnType<typeof validateShotRenderPlan>>): Promise<ToolResult> {
  const target = resolveOutputFile(String(plan.args.outputPath), String(plan.args.filename), 'video');
  const receiptPath = target + '.astra-genai.json';
  fs.mkdirSync(path.dirname(target), {recursive:true});
  const receipt = {version:1, operation:'scene-to-video', baseUrl:astraGenaiBaseUrl(),
    fingerprint:plan.id, expected:planOutputContract(plan), videoPath:target, requestId:'scene-' + plan.id, status:'submitting'};
  fs.writeFileSync(receiptPath, JSON.stringify(receipt), {flag:'wx', mode:0o600});
  atomicJson(target + '.scene-request.json', prepared);
  const response = await requestGenai('POST', sceneRoute, prepared.body, 120000, undefined, undefined, 'scene-' + plan.id);
  const accepted = z.object({id:z.string().min(1),request_id:z.literal(receipt.requestId)}).parse(response);
  atomicJson(receiptPath, {...receipt,jobId:accepted.id,status:'submitted'});
  recordVideoSubmission(accepted.id);
  const result = await pollGenaiJob(() => getGenaiVideoStatus({receiptPath, download:true}), 'Poll this scene request with video_status.');
  return {content:[{type:'text',text:JSON.stringify({...result,receiptPath})}]};
}

type PlanInput = z.infer<typeof videoPlanSchema>;

function resolvePlanContext(input: PlanInput) {
  requireReadyProject(input.episode, { allowVideoSnapshot: true });
  let context = routingContext(input.episode, input.shotId, input.sceneNo);
  if (input.shotId && context.shot.scene !== undefined) {
    const sceneNo = Number(context.shot.scene);
    const owner = (context.board.STRUCTURE as {scenes?: {no:number; videoDirection?: SceneVideoDirection; directionDefaults?: unknown}[]})?.scenes?.find(s => s.no === sceneNo);
    const members = (context.board.SCENES as {scene?: number; timeline?: unknown; visual?: {frames?: {storyboardKeyframes?: unknown; keyframes?: unknown}}}[])
      .filter(shot => shot.scene === sceneNo);
    const timed = (owner?.videoDirection && (members.length > 1 || owner.directionDefaults)) || owner?.videoDirection?.oneTake || owner?.videoDirection?.audio || owner?.videoDirection?.fps ||
      members.some(shot => shot.timeline || shot.visual?.frames?.storyboardKeyframes || owner?.videoDirection && shot.visual?.frames?.keyframes);
    if (timed) {
      if (members.length !== 1) throw new Error('scene_video_scope: plan the timed shot and its scene inputs with sceneNo ' + sceneNo);
      context = routingContext(input.episode, undefined, sceneNo);
    }
  }
  requireSupportedSelection(context.selection);
  if (input.tool && VIDEO_ADAPTERS[input.tool]?.engine !== context.selection.engine)
    throw new Error('model_selection_mismatch: tool does not match selected engine');
  if (input.tool && input.operation && VIDEO_ADAPTERS[input.tool]?.operation !== input.operation)
    throw new Error('Tool and operation disagree');
  const tool = input.tool ?? selectedVideoTool(context.selection, input.operation ?? context.selection.operation);
  return { context, tool };
}

export async function planManagedVideo(raw: unknown) {
  const input = videoPlanSchema.parse(raw);
  const resolved = resolvePlanContext(input);
  const { context, tool } = resolved;
  if (context.selection.engine === 'astra-genai' && (tool === 'astra_genai_msr' || tool === 'astra_genai_img2video'))
    await refreshGenaiMsrVoice();
  const plan = buildVideoPlan(input, resolved, false);
  if (plan.sceneRendering) { await validateShotRenderPlan(plan); return saveVideoPlan(plan); }
  await checkGenaiVideoOptions(plan.tool, plan.args);
  if (plan.sceneRequest) await checkSceneDeployment(plan.sceneRequest, plan.tool, plan.args);
  return saveVideoPlan(plan);
}

export function planVideo(raw: unknown, persist = true): VideoPlan {
  const input = videoPlanSchema.parse(raw);
  return buildVideoPlan(input, resolvePlanContext(input), persist);
}

function buildVideoPlan(input: PlanInput, {context, tool}: ReturnType<typeof resolvePlanContext>, persist: boolean): VideoPlan {
  const sourceArgs = input.args;
  input = { ...input, sceneNo: context.sceneNo };
  // Gateway pricing needs a declared reservation. Hosted adapters compute their quote
  // from the catalogue and must never receive this accounting field on the wire.
  if (context.selection.engine === 'astra-genai' && input.maxCostUsd !== undefined && input.args.reserveUsd === undefined)
    input = { ...input, args: { ...input.args, reserveUsd: input.maxCostUsd } };
  const quoteFor = (tool: string, args: Record<string, unknown>) => {
    const quote = quoteVideo(tool, args);
    if (input.maxCostUsd !== undefined && quote.reserveUsd > input.maxCostUsd)
      throw new Error('video_quote_exceeded: selected adapter requires $' + quote.reserveUsd + ', request maximum is $' + input.maxCostUsd);
    return quote;
  };
  const scene = context.sceneDirection && sceneVideoDirectionSchema.parse(context.sceneDirection);
  const take = { ...(input.maxCostUsd !== undefined ? {maxCostUsd:input.maxCostUsd} : {}), ...(scene ? { sceneNo: context.sceneNo, sceneDurationSeconds: Number(context.shot.duration), shotIds: context.shotIds } : {}), ...(input.purpose ? { purpose: input.purpose } : {}), ...(input.basedOnRequestId ? { basedOnRequestId: input.basedOnRequestId } : {}), ...(input.changeNote ? { changeNote: input.changeNote } : {}) };
  if (input.basedOnRequestId) {
    const directory = path.join(context.episode, '.work/video-routing/plans');
    const parent = input.basedOnRequestId !== input.requestId && fs.existsSync(directory) && fs.readdirSync(directory)
      .filter(file => /^[a-f0-9]{64}\.json$/.test(file)).some(file => {
        const plan = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as VideoPlan;
        return plan.requestId === input.basedOnRequestId && plan.shotId === context.shotId && plan.sceneNo === input.sceneNo && plan.episode === context.episode;
      });
    if (!parent) throw new Error('video_parent_missing: name a different existing request for this shot');
  }
  const { selection } = context;
  if (selection.engine === 'seedance') {
    const { seedanceMedia } = load(shared);
    const media: Record<string, unknown> = seedanceMedia(context.shot);
    for (const key of ['referenceVideoPaths', 'referenceAudioPaths']) {
      const paths = media[key];
      if (Array.isArray(paths)) media[key] = paths.map(file => path.resolve(context.episode, 'storyboard', file));
    }
    input = { ...input, args: { ...media, ...input.args } };
  }
  const lines = (context.shot.narration as Array<{ speaker?: string; delivery?: string; tts?: string }> | undefined ?? [])
    .filter(line => line.tts?.trim());
  if (!scene && new Set(lines.map(line => line.speaker)).size > 1)
    throw new Error('shot_speaker_limit: split speaker changes into separate shots, then set each shot\'s framing and camera angle');
  if (selection.engine === 'veo' && lines.some(line => line.delivery !== 'voiceover'))
    throw new Error('voice_lane_required: Veo generates scene sound but cannot condition dialogue on a character voice. Use the selected LTX audio or reference route for spoken cuts.');
  if (input.shotBindings && !input.sceneRendering) throw new Error('scene_render_bindings: select per_shot rendering');
  if (input.sceneRendering) {
    const conditioned = scene?.audio && scene.audio.mode !== 'mix';
    const tool = conditioned ? 'astra_genai_audio2video' : 'astra_genai_img2video';
    if (!scene || !context.sceneMembers || !input.sceneNo || selection.engine !== 'astra-genai' ||
        selection.model !== (conditioned ? 'ltx-2.5-22b-dev' : 'ltx-2.5-22b-distilled') || !selection.resolution || selectedVideoTool(selection) !== tool ||
        input.tool && input.tool !== tool || input.operation && input.operation !== (conditioned ? 'audio' : 'image'))
      throw new Error('scene_render_selection: use saved dev audio-to-video for conditioning or distilled I2V for native or mixed sound');
    const settings = z.object({reserveUsd:z.number().nonnegative().finite(), outputPath:z.string().optional(),
      filename:z.string().optional()}).strict().parse(input.args);
    const {request} = prepareSceneRequest(input.sceneNo,bindSceneCards(context.sceneMembers,input.shotBindings),scene,context.episode,lines,
      {bindDialogue:false,bindOpening:false,suffix:'',shotScoped:true}, () => undefined, context.board);
    bindRegisteredPanels(request, context.episode, context.board);
    const missing: string[] = [];

    for (const shot of request.shots) {
      const binding = input.shotBindings?.find(b=>b.shotId === shot.shotId);
      const at = shot.shotId + '@' + shot.startFrame;
      if (!shot.framing || !shot.action) missing.push(at + ' direction: supply framing and action');
      if (shot.transition !== 'open' && shot.transition !== 'hard_cut') missing.push(at + ' transition: ' + shot.transition);
      const refs = request.images.filter(p => p.shotId === shot.shotId && (p.reference || ['face','outfit'].includes(p.role)));
      const subjects = refs.filter(p => !['location','background'].includes(p.role));
      for (const p of refs) if (conditioned || p.strength !== undefined && p.strength !== 1)
        missing.push(at + ' ' + p.role + ': ' + (conditioned ? 'A2V cannot bind subject references' : 'individual reference strength is unsupported'));
      for (const line of shot.dialogue ?? []) {
        const label = shot.shotId + '@' + (line.frame ?? shot.startFrame) + ' ' + line.lineId + ' ' + line.speaker;
        if (line.frame !== undefined && !binding?.performanceAudio)
          missing.push(label + ' performance_audio: supply a timed WAV to lock speech to the opening frame');
        if (line.warnings?.length || line.delivery === 'voiceover')
          missing.push(label + ' voice: ' + (line.warnings?.join(' ') ?? line.delivery));
        if (line.voice && !subjects.slice(0,2).some(p => p.character === line.speaker))
          missing.push(label + ' voice_reference: the speaker needs a matching panel in the first two reference slots');
      }
    }
    if (missing.length) throw new Error('scene_render_inputs_unsupported:\n' + missing.join('\n'));
    const files = [...(request.audio ? [request.audio.path] : []),...request.images.map(p=>p.path),...request.shots.flatMap(s=>(s.dialogue ?? []).flatMap(d=>d.voice ? [d.voice.path] : []))];
    for (const binding of input.shotBindings ?? []) {
      for (const file of [binding.motionPrefix,binding.performanceAudio]) {
        if (!file) continue;
        if (!path.isAbsolute(file) || fs.statSync(file).size > 32 * 1024 * 1024)
          throw new Error('scene_render_guide: supply an absolute path to a file of at most 32 MiB for ' + binding.shotId);
        files.push(file);
      }
    }
    const inputs = Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    const outputPath = canonical(path.resolve(context.episode,settings.outputPath ?? '.work/video'));
    if (!within(context.episode,outputPath)) throw new Error('video_output_outside_episode');
    const filename = settings.filename ?? 'video-'+input.requestId+'.mp4';
    resolveOutputFile(outputPath,filename,'video');
    const args = {model:selection.model,resolution:selection.resolution, prompt:request.prompt, reserveUsd:settings.reserveUsd,outputPath,filename};
    const body = {...take, version:1 as const, episode:context.episode, shotId:context.shotId, requestId:input.requestId,
      sceneRendering:input.sceneRendering, ...(input.shotBindings ? {shotBindings:input.shotBindings} : {}), sceneRequest:request, tool, args, sourceArgs:input.args, inputs, selection,
      source:context.source, contextRevision:context.revision,quote:quoteFor(tool,args),execution:'server' as const};
    const plan = {...body,id:hash(body)};
    if (persist) throw new Error('scene_render_validation: use video_plan to validate deployed renderer inputs before approval');
    return plan;
  }
  if (tool === 'astra_genai_msr' && (!lines.length || lines.some(line => line.delivery === 'voiceover')))
    throw new Error('msr_speech_route: silent and voiceover/inner-thought shots use image2video with external timed TTS for voiceover; split mixed deliveries first');
  if (scene && lines.some(l => l.delivery === 'voiceover') && lines.some(l => l.delivery !== 'voiceover'))
    throw new Error('scene_video_mixed_delivery: keep voiceover on its external track and separate it from native dialogue');
  // The hosted reference lanes take spoken shots only, as MSR does; silent and voiceover shots use the image lane.
  if (tool && VENDOR_REFERENCE_TOOLS.includes(tool) && (!lines.length || lines.some(line => line.delivery === 'voiceover')))
    throw new Error(`reference_speech_route: ${tool} renders a shot whose character speaks; plan silent and voiceover/inner-thought shots with operation:"image" and external timed TTS for voiceover; split mixed deliveries first`);
  const visual = context.shot.visual as { frames?: { mode?: string; start?: string }; references?: Array<Record<string, unknown>>; video?: { prompt?: unknown; promptSource?: VideoPromptSource } } | undefined;
  const silentPicture = !lines.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen');
  const supportsAudioToggle = tool === 'astra_genai_img2video' || Boolean(tool && HOSTED_VIDEO_ROUTES[tool]?.soundtrack);
  // Voiceover pictures use their own timed speech track.
  const sound = context.shot.sound as { audioSource?: string } | undefined;
  const writtenAudio = input.args.prompt ?? visual?.video?.promptSource?.sound ?? visual?.video?.prompt;
  const requestsSilence = /(?:^|\bAudio:\s*)silent\b/i.test(String(writtenAudio ?? '').trim());
  const generateAudio = input.args.generateAudio ?? (sound?.audioSource !== 'speech' && !requestsSilence);
  const includeEffects = supportsAudioToggle && lines.length === 0 && generateAudio === true;
  // Apply the standing MSR-to-I2V rule to old reference-frame boards without rewriting their media.
  let shot = tool === 'astra_genai_img2video' && silentPicture && visual?.frames?.mode === 'reference'
    ? { ...context.shot, visual: { ...visual, frames: { mode: 'first', start: visual.frames.start },
      references: visual.references ?? [] } } : context.shot;
  const video = visual?.video;
  const rawCast = (context.board.SB_DOC as { characters?: unknown } | undefined)?.characters;
  const names = Object.fromEntries((Array.isArray(rawCast) ? rawCast : []).map(c => [c.id, String(c.name ?? '')]));
  const performanceInputs: Record<string, string> = {};
  const mode = silentPicture ? 'voiceover' : tool && VIDEO_ADAPTERS[tool]?.voice === 'supplied' ? 'audio_conditioned' : 'native';
  const measureAudio = (line: Record<string, unknown>): number | null => {
    const audio = line.audio as { path?: string; sha256?: string } | undefined;
    if (mode === 'native' || !audio?.path || !audio.sha256) return null;
    const file = path.resolve(context.episode, 'storyboard', audio.path);
    if (!fs.existsSync(file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== audio.sha256) return null;
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8', timeout: 10000 }));
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    performanceInputs[file] = audio.sha256;
    return seconds;
  };
  const timedSubject = scene && context.sceneMembers?.some(member =>
    (member.timeline as {images?: {role:string}[]} | undefined)?.images?.some(p => ['face','outfit'].includes(p.role)));
  const subjectReferences = Boolean(timedSubject || hasVideoSubjectReferences(shot));
  const imageWithReferences = tool === 'astra_genai_img2video' && (subjectReferences || hasSubjectInput(input.args.references));
  const bindDialogueSeparately = (imageWithReferences || tool === 'seedance_reference') && !silentPicture && input.args.generateAudio !== false;
  const silentSuffix = silentPicture && (supportsAudioToggle || tool === 'minimax_img2video' || tool === 'heygen_img2video')
    ? `No speech or vocalization. All visible mouths stay closed; ${includeEffects
      ? 'include natural ambience for the location and sound effects from the visible actions.'
      : 'perform the planned silent action.'}` : '';
  // The board prompt is compiled to the adapter's own limit, so it can go out as written: hand-shortened
  // prompts can discard a planned move, as in mochi_bo EP05 s0015.
  const promptLimit = tool === 'astra_genai_msr' || imageWithReferences ? genaiMsrPromptLimit()
    : tool === 'astra_genai_img2video' ? 2000 : tool ? videoPromptLimit(tool) : undefined;
  const compileFor = (budget: number | undefined) => compileVideoPrompt(withSceneCamera(shot, (context.board.STRUCTURE as {scenes?: unknown})?.scenes), video!.promptSource!, names, { mode, measureAudio, bindDialogueSeparately,
    ...(budget ? { maxCharacters: budget - (silentSuffix ? silentSuffix.length + 1 : 0) } : {}) });
  let compiled = !scene && input.args.prompt === undefined && video?.promptSource ? compileFor(promptLimit) : undefined;
  const withPrompt = (prompt: unknown) => {
    const args = input.args.prompt === undefined && typeof prompt === 'string' ? { ...input.args, prompt } : input.args;
    return silentSuffix ? { ...args, ...(supportsAudioToggle ? { generateAudio: includeEffects } : {}),
      prompt: [args.prompt, silentSuffix].filter(Boolean).join(' ') } : args;
  };
  let callArgs = withPrompt(compiled?.prompt ?? video?.prompt);
  if (scene && (input.args.prompt !== undefined || input.args.shots !== undefined))
    throw new Error('scene_video_prompt: edit story_scene.videoDirection and the authored dialogue to revise the scene');
  const members = context.sceneMembers ?? [];
  const bindTurns = Boolean(bindDialogueSeparately || tool === 'astra_genai_msr' || tool && VENDOR_REFERENCE_TOOLS.includes(tool));
  const bindOpening = tool === 'astra_genai_msr' || tool === 'astra_genai_img2video' && subjectReferences;
  const prepared = scene && context.timed ? prepareSceneRequest(context.sceneNo!, members, scene, context.episode, lines,
    { bindDialogue:bindTurns, bindOpening, suffix:silentSuffix, namedReferencesOnly:tool === 'seedance_reference' || Boolean(tool && HOSTED_VIDEO_ROUTES[tool]?.subjectAssets) }, request => bindSceneAdapter(request, tool ?? 'host_external', selection.model, shot, input.args, context.episode, selection.resolution), context.board) : undefined;
  const sceneRequest = prepared?.request;
  const legacyCoverage = scene && !prepared ? sceneCoverage(members, scene, context.board, context.sceneNo) : undefined;
  const sceneCamera = prepared?.camera ?? (legacyCoverage && sceneCameraDirection([], legacyCoverage.common.camera
    ? attributeWords('camera', legacyCoverage.common.camera) : undefined));
  const timedImages = prepared?.mapped.timedImages;
  if (scene) {
    if (prepared) {
      shot = prepared.mapped.shot;
      callArgs = { ...withPrompt(''), ...prepared.mapped.args, prompt:prepared.providerPrompt };
    }
    else {
      const coverage = legacyCoverage!;
      const notes = sceneShotNotes(members[0]);
      const details = [...Object.entries(coverage.common).filter(([key]) => key !== 'camera').map(([key,row]) => attributeWords(key,row)),
        shotVisualWords(members[0], coverage.shots[0], coverage.common, notes.end), notes.blocking, notes.action, ...notes.beats,
        notes.sound && 'Sound: ' + notes.sound].filter(Boolean);
      const sceneText = scenePromptText(scene, sceneCamera?.instruction, [...new Set(details)].join(' '), lines, bindTurns);
      callArgs = withPrompt(bindOpening ? sceneText : openingPrompt(sceneText, scene.openingPositions));
    }
  }
  // Scene notes describe staging. The authored provider prompt carries reference indices
  // and edit instructions which can be absent from the story or the scene's emotional arc.
  if (scene && selection.engine === 'seedance' && members.length === 1) {
    const member = members[0].visual as {video?: {prompt?: string}} | undefined;
    const stored = member?.video?.prompt?.trim();
    const direction = String(callArgs.prompt ?? '');
    if (stored && !direction.includes(stored)) callArgs = { ...callArgs, prompt: [stored, direction].filter(Boolean).join('\n') };
  }
  if (tool === 'seedance_reference' && !silentPicture) {
    if (input.args.generateAudio === false) throw new Error('scene_dialogue_audio_required: this shot has native spoken dialogue');
    callArgs = { ...callArgs, generateAudio: true };
  }
  const sourcePrompt = scene ? String(callArgs.prompt) : typeof video?.prompt === 'string' ? video.prompt : '';
  const boardCamera = (shot.visual as { camera?: Record<string, unknown> } | undefined)?.camera ?? {};
  const rawPrompt = input.args.prompt ?? video?.prompt;
  const drift = !scene && !compiled && typeof rawPrompt === 'string' ? cameraDrift(rawPrompt, String(boardCamera.movement ?? '')) : null;
  const driftWarning = drift ? [`camera_move_${drift}: the ${input.args.prompt === undefined ? 'saved' : 'explicit'} prompt ${drift === 'missing' ? 'omits' : 'contradicts'} the planned move. Board direction: ${cameraMoveWords(boardCamera)}`] : [];
  const directionOf = (c: typeof compiled) => c ? { sourcePrompt, directionBindings: c.directionBindings, directionWarnings: c.warnings, performance: c.performance } :
    { sourcePrompt, directionWarnings: [input.args.prompt !== undefined ? 'Explicit args.prompt bypasses storyboard direction compilation; inspect the submitted prompt against the icons.' :
      'Legacy prompt has no promptSource; rewrite it with shot_prompt to compile current icons at request time.', ...driftWarning] };
  let direction = sceneCamera ? { sourcePrompt, directionWarnings: sceneCamera.warnings,
    ...(sceneCamera.bindings.length ? { directionBindings: sceneCamera.bindings } : {}) } : directionOf(compiled);
  if (selection.engine === 'host') {
    if (input.tool) throw new Error('model_selection_mismatch: host has no server adapter');
    const images = prepareVideoImages('host_external', callArgs, context.shot, context.episode, context.sceneMembers);
    const body = { ...take, version: 1 as const, episode: context.episode, shotId: context.shotId, requestId: input.requestId,
      tool: 'host_external', args: callArgs, ...(sceneRequest ? {sceneRequest} : {}), ...direction, ...(images.imageBindings ? { imageBindings: images.imageBindings, imageHandoff: images.imageHandoff } : {}), selection, source: context.source, contextRevision: context.revision,
      inputs: { ...Object.fromEntries((images.imageBindings ?? []).map(binding => [binding.path, binding.sha256])), ...performanceInputs }, quote: { reserveUsd: 0, estimatedUsd: 0, revision: 'host-allowance-v1', basis: 'External host allowance; limits and actual tool schema must be checked by host; not API enforcement' }, execution: 'host_handoff' as const };
    const plan = { ...body, id: hash(body) };
    return persist ? saveVideoPlan(plan) : plan;
  }
  if (!tool) throw new Error('Selected deployment has no adapter for this operation');
  let bound = bindSelection(tool, callArgs, selection);

  if (selection.engine === 'seedance' && bound.ratio === undefined && context.board.FORMAT === 'shorts-9x16' &&
      (tool === 'seedance_text2video' || tool === 'seedance_reference' && bound.omniReferenceTaskType === 'reference'))
    bound.ratio = '9:16';
  if (selection.engine === 'veo' && bound.aspectRatio === undefined && context.board.FORMAT === 'shorts-9x16') bound.aspectRatio = '9:16';
  const durationPlan = shotVideoTiming(context, tool, bound);
  if (tool === 'seedance_reference' && bound.omniReferenceTaskType === 'edit' && bound.durationSeconds === undefined) {
    bound.durationSeconds = -1;
    delete bound.requiredSeconds; // The finished edit must still cover the plan.
  }
  if (durationPlan.status === 'split_required')
    throw new Error(`video_duration_exceeded: ${context.shotId} needs ${durationPlan.requiredSeconds}s; ${tool} allows ${durationPlan.maxSeconds}s. Split at a meaningful performance boundary; never truncate or switch models.`);
  // GenAI I2V's live backend owns the maximum; its integer duration must still cover the shot.
  if ((tool === 'astra_genai_img2video' || tool === 'astra_genai_text2video') && durationPlan.requiredSeconds !== undefined) {
    if (bound.requiredSeconds !== undefined) {
      if (['duration', 'durationSeconds', 'numFrames', 'frames', 'autoDuration', 'audioMaxDuration'].some(key => bound[key] !== undefined))
        throw new Error('requiredSeconds is mutually exclusive with exact duration arguments; supply the shot need or an exact request, not both');
      delete bound.requiredSeconds;
    }
    if (typeof bound.duration === 'number' && bound.duration < durationPlan.requiredSeconds)
      throw new Error(`video_duration_short: ${context.shotId} needs ${durationPlan.requiredSeconds}s but the request covers ${bound.duration}s`);
    if (sceneRequest && bound.duration == null && bound.numFrames === undefined &&
        !Number.isInteger(sceneRequest.frameCount / sceneRequest.fps))
      bound.numFrames = sceneRequest.frameCount;
    if (typeof bound.numFrames === 'number') {
      if (bound.numFrames / Number(bound.fps ?? 24) < durationPlan.requiredSeconds)
        throw new Error('video_duration_short: numFrames does not cover the shot at the selected fps');
    } else bound.duration ??= Math.ceil(durationPlan.requiredSeconds);
  }
  // Legacy boards without a duration keep their exact request. Timed new shots cannot fall back to a short adapter default.
  if (durationPlan.status === 'fits' && VIDEO_ADAPTERS[tool].voice !== 'supplied' && (DURATION_TOOLS as readonly string[]).includes(tool)) {
    const exact = ['duration', 'durationSeconds', 'numFrames', 'frames', 'autoDuration', 'audioMaxDuration'].some(key => bound[key] !== undefined);
    if (!exact) bound = resolveVideoDuration(tool, { ...bound, requiredSeconds: durationPlan.requiredSeconds }).args;
  }
  const bindImages = (args: Record<string, unknown>) => {
    if (timedImages) return { args, imageBindings: timedImages.imageBindings };
    if (sceneRequest && !sceneRequest.images.length) return { args, imageBindings: undefined };
    const images = prepareVideoImages(tool, args, shot, context.episode);
    const extra = prepared?.mapped.gatewayKeyframes;
    if (!extra) return images;
    return { args: { ...images.args, ...extra.args }, imageBindings: [...(images.imageBindings ?? []), ...extra.imageBindings] };
  };
  let images = bindImages(bound);
  let voice = prepareVideoVoice(tool, images.args, { ...context, shot, msrVoice: genaiMsrVoiceReferences() });
  // Reference descriptions and Audio lines (MSR) come after the compile; when they push the prompt over the limit,
  // the board prompt is compiled once more into the room they leave.
  const submittedLength = typeof voice.args.prompt === 'string' ? openingPrompt(voice.args.prompt, voice.args.openingPositions as OpeningPosition[] | undefined).length : 0;
  if (compiled && promptLimit && typeof bound.prompt === 'string' && submittedLength > promptLimit) {
    compiled = compileFor(promptLimit - (submittedLength - bound.prompt.length));
    bound = { ...bound, prompt: withPrompt(compiled.prompt).prompt };
    direction = directionOf(compiled);
    images = bindImages(bound);
    voice = prepareVideoVoice(tool, images.args, { ...context, shot, msrVoice: genaiMsrVoiceReferences() });
  }
  const args = parseVideoArgs(tool, voice.args);
  const adaptiveDuration = selection.engine === 'seedance' && args.durationSeconds === -1;
  if (sceneRequest && !sceneRequest.audio && !adaptiveDuration) {
    const frames = typeof args.numFrames === 'number' ? args.numFrames : typeof args.durationSeconds === 'number'
      ? Math.round(args.durationSeconds * sceneRequest.fps) : typeof args.duration === 'number' ? Math.round(args.duration * sceneRequest.fps) : undefined;
    if (frames !== undefined && frames !== sceneRequest.frameCount)
      throw new Error('scene_video_timing: adapter ends at frame ' + (frames - 1) + ', storyboard ends at ' + (sceneRequest.frameCount - 1));
  }
  if (Array.isArray(args.openingPositions)) args.prompt = openingPrompt(String(args.prompt), args.openingPositions as OpeningPosition[]);
  if (VIDEO_ADAPTERS[tool].voice === 'supplied' && typeof args.audioPath === 'string' && durationPlan.requiredSeconds !== undefined) {
    const sourceSeconds = ltxApiAudioSeconds(path.resolve(context.episode, args.audioPath));
    const fps = Number(args.fps ?? args.frameRate ?? 24);
    let playable = sourceSeconds;
    if (tool === 'astra_audio2video') {
      const window = Math.min(sourceSeconds - Number(args.audioStartTime ?? 0), Number(args.audioMaxDuration ?? Infinity));
      playable = Math.min(window, args.numFrames === undefined ? (8 * Math.floor((window * fps - 1) / 8) + 1) / fps : Number(args.numFrames) / fps);
    } else if (tool === 'astra_genai_desktop_audio2video') {
      playable = desktopAudioWindow(args, sourceSeconds).playbackSeconds;
    }
    if (playable + 0.001 < durationPlan.requiredSeconds)
      throw new Error(`video_duration_short: ${context.shotId} needs ${durationPlan.requiredSeconds}s but its supplied audio covers ${playable.toFixed(3)}s of video`);
  }
  if (!adaptiveDuration && durationPlan.status === 'fits') {
    const fps = durationPlan.limits?.frameRate ?? 1;
    const frames = typeof args.numFrames === 'number' ? args.numFrames : typeof args.duration === 'number' && durationPlan.limits?.frameRate
      ? framesForSeconds(args.duration, fps) : undefined;
    const requested = frames !== undefined ? frames / fps : args.durationSeconds;
    if (typeof requested === 'number' && requested < durationPlan.requiredSeconds!)
      throw new Error(`video_duration_short: ${context.shotId} needs ${durationPlan.requiredSeconds}s but the request covers ${requested}s. Use requiredSeconds or revise the shot timing.`);
  }
  // Seconds this request plays: an exact frame count, a duration, or the adapter's own default.
  const playFps = durationPlan.limits?.frameRate, playFrames = typeof args.numFrames === 'number' ? args.numFrames
    : typeof args.duration === 'number' && playFps ? framesForSeconds(args.duration, playFps) : tool === 'astra_genai_msr' ? 121 : undefined;
  const playSeconds = playFrames !== undefined && playFps ? playFrames / playFps : typeof args.durationSeconds === 'number' ? args.durationSeconds : undefined;
  const speechFit = VIDEO_ADAPTERS[tool].voice === 'reference' && playSeconds !== undefined && playSeconds > 0 && durationPlan.limits && lines.some(line => line.delivery !== 'voiceover')
    ? nativeSpeechFit(shot, playSeconds, durationPlan.limits, (context.board.STORY as { language?: unknown } | undefined)?.language) : undefined;
  const foreign = typeof args.prompt === 'string' ? nonEnglishOutsideQuotes(args.prompt) : null;
  if (foreign) throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks. Write the video prompt in English; only dialogue, inside quotes, uses the video's language.`);
  const output = canonical(path.resolve(context.episode, typeof args.outputPath === 'string' ? args.outputPath : '.work/video'));
  if (!within(context.episode, output)) throw new Error('Video output must stay inside the selected episode');
  args.outputPath = output;
  args.filename ??= `video-${input.requestId}.mp4`;
  const inputs = { ...inputFiles(args, context.episode), ...performanceInputs };
  const assets = HOSTED_VIDEO_ROUTES[tool]?.subjectAssets;
  if (assets) {
    const paths = args[assets.parameter] as string[];
    const registry = registeredVideoSubjects(context.board, context.episode, paths);
    const refs = paths.map(file => {
      const pin = sceneRequest?.images.find(image => image.path === file);
      const binding = images.imageBindings?.find(image => image.path === file);
      return {path:file, role:pin?.role ?? binding?.role ?? 'continuity', character:pin?.character};
    });
    const positions = (shot.visual as {video?: {openingPositions?: OpeningPosition[]}} | undefined)?.video?.openingPositions;
    const issue = assets.validate(refs, selection.model, positions?.filter(p => p.images?.length).map(p => p.character), registry);
    if (issue) throw new Error('image_plan_unsupported: ' + issue);
  }
  for (const binding of images.imageBindings ?? []) inputs[binding.path] = binding.sha256;
  if (tool === 'fasth3_omni_reference') buildFasth3Body(fasth3OmniSchema.parse(args));
  if (tool === 'astra_genai_msr') buildGenaiMsrBody(genaiMsrSchema.parse(args));
  if (tool === 'astra_genai_audio2video') buildGenaiAudioBody(genaiAudioToVideoSchema.parse(args));
  // Vendor bodies are built once here so file types, sizes and sample lengths fail before money is reserved.
  HOSTED_VIDEO_ROUTES[tool]?.preflight(args);
  if (tool === 'minimax_img2video') buildMinimaxBody(minimaxImg2VideoSchema.parse(args));
  if (tool === 'minimax_reference') buildMinimaxBody(minimaxReferenceSchema.parse(args));
  if (tool === 'heygen_img2video') checkHeygenInputs(heygenImg2VideoSchema.parse(args));
  if (tool === 'heygen_reference') checkHeygenInputs(heygenReferenceSchema.parse(args));
  if (tool === 'astra_video_retake' && selection.resolution) {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', String(args.sourceVideoPath)], { encoding: 'utf8', timeout: 15_000 }));
    const stream = probe.streams?.[0];
    if (!stream || `${stream.width}x${stream.height}` !== selection.resolution)
      throw new Error('model_selection_mismatch: retake inherits source dimensions; select the source resolution');
  }
  const quote = quoteFor(tool, args);
  const body = { ...take, ...(sceneRequest ? { sceneRequest: { ...sceneRequest, prompt:String(args.prompt) } } : {}),
    version: 1 as const, episode: context.episode, shotId: context.shotId, requestId: input.requestId, tool, args,
    ...(images.imageBindings ? { imageBindings: sceneRequest ? sceneImageBindings(sceneRequest, tool, images.imageBindings) : images.imageBindings } : {}),
    sourceArgs: selection.engine === 'seedance' ? sourceArgs : input.args, durationPlan, ...(selection.engine === 'veo' ? { providerProject: config.googleCloudProject } : {}), ...(speechFit ? { speechFit } : {}), ...direction, ...(voice.voiceContinuity ? { voiceContinuity: voice.voiceContinuity } : {}),
    selection, source: context.source, contextRevision: context.revision, inputs, quote, execution: 'server' as const };
  const plan = { ...body, id: hash(body) };
  return persist ? saveVideoPlan(plan) : plan;
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
interface Approvals { auto?: { request: string; at: string }; plans: Record<string, { sceneNo?: number; shotId: string; requestId: string; request: string; at: string; shown?: Shown }> }
const approvalsFile = (episode: string) => path.join(episode, '.work/video-routing/approvals.json');
function readApprovals(episode: string): Approvals {
  return fs.existsSync(approvalsFile(episode)) ? JSON.parse(fs.readFileSync(approvalsFile(episode), 'utf8')) : { plans: {} };
}
// The review page cannot read .work, so storyboard/video-approvals.js carries each shot's latest yes (storyboard-html-template.html).
function writeApprovalView(episode: string, approvals: Approvals) {
  const dir = path.join(episode, 'storyboard');
  if (!fs.existsSync(path.join(dir, 'scenes.js'))) return;
  const shots: Record<string, { planId: string; requestId?: string; at: string; shown?: Shown }> = {};
  const scenes: typeof shots = {};
  for (const [planId, entry] of Object.entries(approvals.plans)) {
    const group = entry.sceneNo === undefined ? shots : scenes;
    const key = String(entry.sceneNo ?? entry.shotId);
    if (!group[key] || entry.at >= group[key].at) group[key] = { planId, ...(entry.sceneNo !== undefined ? {requestId: entry.requestId} : {}), at: entry.at, ...(entry.shown ? { shown: entry.shown } : {}) };
  }
  const view = { auto: approvals.auto?.at ?? null, shots, scenes };
  fs.writeFileSync(path.join(dir, 'video-approvals.js'), 'window.VIDEO_APPROVALS = ' + JSON.stringify(view).replace(/</g, '\\u003c') + ';\n');
}
export function approveVideo(raw: unknown): Approvals {
  const input = videoApproveSchema.parse(raw), episode = fs.realpathSync(input.episode);
  requireReadyProject(episode, { allowVideoSnapshot: true });
  const approvals = readApprovals(episode), at = new Date().toISOString();
  if (input.auto) approvals.auto = { request: input.request, at };
  else if (input.auto === false) delete approvals.auto;
  for (const id of input.planIds ?? []) {
    const plan: VideoPlan = JSON.parse(fs.readFileSync(path.join(episode, '.work/video-routing/plans', id + '.json'), 'utf8'));
    // A yes covers the plan the user saw; a plan whose shot changed since cannot run (video_execute), so it takes none.
    const context = routingContext(episode, plan.shotId, plan.sceneNo);
    const changedSceneInput = plan.sceneNo !== undefined && Object.entries(plan.inputs).some(([file, digest]) =>
      !fs.existsSync(file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== digest);
    if (context.revision !== plan.contextRevision || changedSceneInput)
      throw new Error(`video_plan_stale: shot ${plan.shotId}'s frames, prompt, lines or settings changed after this plan — plan it again and show the user the new plan`);
    const visual = (context.shot.visual ?? {}) as { video?: { prompt?: unknown }; frames?: { start?: unknown; end?: unknown } };
    const used = (plan.sourceArgs ?? plan.args).prompt, fromShot = used === undefined || used === visual.video?.prompt;
    const shown = Object.fromEntries(Object.entries({ prompt: fromShot ? visual.video?.prompt : undefined, start: visual.frames?.start, end: visual.frames?.end })
      .filter(([, value]) => typeof value === 'string')) as Shown;
    if (plan.sceneNo !== undefined) shown.prompt = String(plan.args.prompt);
    if (!fromShot || plan.sceneNo !== undefined) shown.callPrompt = true;
    shown.lines = context.lines;
    approvals.plans[id] = { ...(plan.sceneNo === undefined ? {} : { sceneNo: plan.sceneNo }), shotId: plan.shotId, requestId: plan.requestId, request: input.request, at, shown };
  }
  atomicJson(approvalsFile(episode), approvals);
  writeApprovalView(episode, approvals);
  return approvals;
}
async function adaptiveSeedanceOutputError(plan: VideoPlan): Promise<string | undefined> {
  const seconds = plan.durationPlan?.requiredSeconds;
  if (plan.selection.engine !== 'seedance' || plan.args.durationSeconds !== -1 || seconds === undefined) return;
  const output = resolveOutputFile(String(plan.args.outputPath), String(plan.args.filename), 'video');
  const media = await probeVideo(output);
  if (!media) throw new Error('video_output_unverified: could not measure the downloaded Seedance video');
  if (media.seconds + 0.001 < seconds)
    return `video_duration_short: ${plan.shotId} needs ${seconds}s but the downloaded edit covers ${media.seconds}s`;
  if (plan.sceneRequest && Math.round(media.seconds * plan.sceneRequest.fps) !== plan.sceneRequest.frameCount)
    return 'scene_video_timing: the adaptive output differs from the authored scene frame count';
}

export async function executeVideo(raw: unknown, dispatch: VideoDispatch): Promise<ToolResult> {
  const request = videoExecuteSchema.parse(raw), episode = fs.realpathSync(request.episode);
  requireReadyProject(episode, { allowVideoSnapshot: true });
  const plan: VideoPlan = JSON.parse(fs.readFileSync(path.join(episode, '.work/video-routing/plans', request.planId + '.json'), 'utf8'));
  const { id, ...body } = plan;
  if (id !== request.planId || hash(body) !== id || plan.episode !== episode) throw new Error('Invalid video plan');
  if (plan.execution === 'host_handoff') throw new Error('host_handoff_required: use the selected host CLI; no API substitution');
  const approvals = readApprovals(episode);
  if (!approvals.auto && !approvals.plans[id]) throw new Error(`video_approval_required: show the user shot ${plan.shotId}'s prompt, images and cost, ` +
    `then record their yes with video_approve {planIds:["${id}"]}, or auto:true once they approve every shot`);
  const context = routingContext(episode, plan.shotId, plan.sceneNo);
  if (context.revision !== plan.contextRevision) throw new Error('video_plan_stale: the shot\'s frames, prompt, lines, selection or authorization changed');
  if (plan.tool === 'astra_genai_msr' || (plan.tool === 'astra_genai_img2video' && plan.voiceContinuity?.strategy === 'reference_voice')) await refreshGenaiMsrVoice();
  const refreshed = planVideo({ episode, ...(plan.sceneNo !== undefined ? {sceneNo: plan.sceneNo} : {shotId: plan.shotId}), requestId: plan.requestId, sceneRendering:plan.sceneRendering, shotBindings:plan.shotBindings, maxCostUsd:plan.maxCostUsd, tool: plan.tool, args: plan.sourceArgs ?? plan.args, purpose: plan.purpose, basedOnRequestId: plan.basedOnRequestId, changeNote: plan.changeNote }, false);
  if (refreshed.id !== id) throw new Error('video_plan_stale: inputs, price or adapter contract changed');
  if (plan.sceneRequest && !plan.sceneRendering) await checkSceneDeployment(plan.sceneRequest, plan.tool, plan.args);
  checkVideoEnvironment(plan.tool);
  const auth = authorization(context);
  let stagedScene;
  if (plan.sceneRendering) {
    const stateFile = path.join(episode,'.work/video-routing/state.json');
    const existing = fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile,'utf8')).jobs?.[plan.requestId];
    if (!existing) stagedScene = await validateShotRenderPlan(plan);
  }
  const cached = videoTransaction(episode, state => {
    const existing = state.jobs[plan.requestId];
    if (existing) {
      if (existing.planId !== id) throw new Error('request_id_conflict: same request ID has a different plan');
      if (existing.status === 'completed') return {result:existing.result as ToolResult, providerId:existing.providerId};
      if (existing.status === 'failed') throw new Error(`video_request_failed: ${existing.evidence || 'the provider rejected it'}; plan a new requestId to try again`);
      throw new Error(`video_request_pending: ${existing.status}; provider ID ${existing.providerId || 'unknown'}; do not resubmit`);
    }
    const jobs = Object.values(state.jobs);
    const target = path.resolve(String(plan.args.outputPath), String(plan.args.filename));
    const priorPlans: VideoPlan[] = jobs.map(job => JSON.parse(fs.readFileSync(
      path.join(episode, '.work/video-routing/plans', job.planId + '.json'), 'utf8')));
    if (fs.existsSync(target) || priorPlans.some(previous =>
      path.resolve(String(previous.args.outputPath), String(previous.args.filename)) === target))
      throw new Error('video_output_conflict: use a unique filename for each candidate; preserve existing takes');
    const occupied = jobs.filter(job => !['completed', 'failed'].includes(job.status));
    if (occupied.length >= auth.maxConcurrent) throw new Error('video_concurrency_limit: pending jobs include ambiguous submissions');
    const used = jobs.reduce((sum, job) => sum + (job.settledUsd ?? job.reserveUsd), state.openingSpendUsd ?? 0);
    if (used + plan.quote.reserveUsd > auth.maxUsd + 1e-9) throw new Error('video_budget_exceeded');
    for (const shotId of plan.shotIds ?? [plan.shotId]) {
      const attempts = priorPlans.filter(previous => (previous.shotIds ?? [previous.shotId]).includes(shotId)).length;
      if (attempts >= auth.maxAttempts) throw new Error('video_attempt_limit: ' + shotId);
    }
    state.jobs[plan.requestId] = { planId: id, requestId: plan.requestId, shotId: plan.shotId, tool: plan.tool,
      status: 'submitting', reserveUsd: plan.quote.reserveUsd, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return undefined;
  }, auth.openingSpendUsd);
  if (cached) { await checkCompletedMedia(plan,cached.providerId); return cached.result; }
  const update = (patch: Record<string, unknown>) => videoTransaction(episode, state => {
    Object.assign(state.jobs[plan.requestId], patch, { updatedAt: new Date().toISOString() });
  });
  // An adapter that proves nothing is running (terminal) closes the request as failed and frees its
  // concurrency slot; a request that never got a provider ID was never billed. Anything else stays
  // submission_unknown until video_status reconciles it.
  const settle = (terminal: boolean, evidence: string, result?: ToolResult) => videoTransaction(episode, state => {
    const job = state.jobs[plan.requestId];
    if (job.status === 'completed' || job.status === 'failed') return;
    Object.assign(job, { status: terminal ? 'failed' : 'submission_unknown', ...(terminal ? { finishedAt: new Date().toISOString() } : {}), evidence, updatedAt: new Date().toISOString() }, result ? { result } : {});
    if (terminal && !job.providerId) job.settledUsd = 0;
    else if (terminal && job.tokens !== undefined && plan.quote.tokenRate !== undefined) job.settledUsd = job.tokens * plan.quote.tokenRate / 1e6;
  });
  const startedAt = Date.now();
  let ok = false, portraitPreflightBlocked = false;
  try {
    const result = await videoEvents.run({
      submitted: providerId => videoTransaction(episode, state => {
        const job = state.jobs[plan.requestId];
        job.providerIds = [...new Set([...(job.providerIds ?? []), providerId])];
        job.providerId = providerId; job.status = 'submitted'; job.updatedAt = new Date().toISOString();
      }),
      usage: tokens => {
        if (!Number.isFinite(tokens) || tokens < 0) throw new Error('Invalid provider usage');
        update({ tokens, ...(plan.quote.tokenRate !== undefined ? {settledUsd: tokens * plan.quote.tokenRate / 1e6} : {}) });
      },
    }, () => plan.sceneRendering ? executeShotRenderPlan(plan,stagedScene!) : dispatch(plan.tool, plan.args));
    if (result.isError) {
      if (plan.selection.engine==='seedance' && result.structuredContent?.stage==='modelark_portrait' && result.structuredContent.videoSubmitted===false) {
        videoTransaction(episode,state=>{
          const job=state.jobs[plan.requestId];
          if (!job || job.providerId || job.status!=='submitting') throw new Error('video_request_pending: reconcile provider submission before retrying');
          delete state.jobs[plan.requestId];
        });
        portraitPreflightBlocked=true;
        return result;
      }
      settle(result.terminal === true, result.content.map(item => item.type === 'text' ? item.text : '').join('\n').slice(0, 1000), result);
      return result;
    }
    const durationError = await adaptiveSeedanceOutputError(plan);
    if (durationError) {
      const rejected: ToolResult = { isError: true, content: [{ type: 'text', text: durationError }] };
      settle(true, durationError, rejected);
      return rejected;
    }
    videoTransaction(episode, state => {
      const job = state.jobs[plan.requestId];
      if ((job.providerIds?.length ?? 0) > 1) throw new Error('Unexpected multiple provider submissions; reconcile all receipts before completion');
      job.status = 'completed'; job.result = result; job.updatedAt = new Date().toISOString(); job.finishedAt = job.updatedAt;
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
      ms: Date.now() - startedAt, ...price, ...(portraitPreflightBlocked ? {quantity:0} : {}),
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

/** Direct adapters use an episode plan or the selected project's channel asset directory. */
export async function routeLegacyVideo(tool: string, raw: unknown, dispatch: VideoDispatch): Promise<ToolResult> {
  const gate = resolveToolGate(tool, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  if (!gate.enabled) throw new Error('video_tool_disabled: ' + gate.reason);
  const { videoContext, ...args } = z.record(z.unknown()).parse(raw);
  if (videoContext !== undefined) {
    const ctx = z.object({ episode: z.string().min(1), shotId: z.string().min(1), requestId: idSchema }).strict().parse(videoContext);
    const plan = await planManagedVideo({ ...ctx, tool, args });
    return executeVideo({ episode: plan.episode, planId: plan.id }, dispatch);
  }
  if (typeof args.outputPath !== 'string' || !args.outputPath.trim())
    throw new Error('project_setup_required: provide the selected project’s output path or an episode videoContext');
  const output = canonical(path.resolve(args.outputPath));
  const { workspace: root } = requireReadyProject(output);
  if (CHANNEL_ASSET_RE.test(path.relative(root, output).split(path.sep).join('/')))
    return dispatchChannelAsset(tool, args, root, output, dispatch);
  throw new Error('video_context_required: supply the episode or a channel asset output');
}

/** Read persisted receipts; refresh polls an existing provider job; reconcile settles an unknown request from billing evidence. */
export async function videoStatus(raw: unknown): Promise<Record<string, unknown>> {
  const input = z.object({ episode: z.string().min(1), requestId: idSchema.optional(), action: z.enum(['read', 'refresh', 'reconcile']).default('read'),
    executorStopped: z.boolean().optional(), evidence: z.string().min(1).optional(), spentUsd: z.number().finite().nonnegative().optional() }).strict().parse(raw);
  const episode = fs.realpathSync(input.episode);
  if (!input.requestId) {
    if (input.action !== 'read') throw new Error('requestId is required to refresh or reconcile');
    return readVideoProduction(episode);
  }
  const requestId = input.requestId;
  const file = path.join(episode, '.work/video-routing/state.json');
  if (!fs.existsSync(file)) return { requestId: input.requestId, status: 'not_started' };
  if (input.action === 'reconcile') {
    // Same contract as image_status: the caller brings the provider's terminal status and the actual charge.
    if (!input.evidence || input.spentUsd === undefined) throw new Error('video_reconciliation_requires_billing_evidence');
    videoTransaction(episode, current => {
      const job = Object.hasOwn(current.jobs, requestId) ? current.jobs[requestId] : undefined;
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
    const seedance = job.tool.startsWith('seedance_');
    if (job.status === 'completed' && !seedance && !['astra_genai_msr','astra_genai_img2video','astra_genai_audio2video'].includes(job.tool)) return job;
    const hosted = HOSTED_VIDEO_ROUTES[job.tool];
    if (!hosted && !seedance && !job.tool.startsWith('astra_genai_desktop_') && !['astra_genai_text2video', 'astra_genai_img2video', 'astra_genai_audio2video', 'astra_genai_msr'].includes(job.tool)) throw new Error('video_refresh_unsupported: use provider-specific recovery');
    const plan: VideoPlan = JSON.parse(fs.readFileSync(path.join(episode, '.work/video-routing/plans', job.planId + '.json'), 'utf8'));
    const { id, ...body } = plan;
    if (id !== job.planId || hash(body) !== id || plan.episode !== episode || plan.tool !== job.tool) throw new Error('Invalid recovery plan');
    if (job.status === 'completed') {
      if (!seedance) { await checkCompletedMedia(plan,job.providerId); return job; }
      const target = resolveOutputFile(String(plan.args.outputPath), String(plan.args.filename), 'video');
      try { await verifySeedanceVideo(target); return job; }
      catch {
        videoTransaction(episode, current => {
          const item = current.jobs[requestId];
          if (item.status === 'completed') {
            item.status = 'submission_unknown';
            item.evidence = 'Saved Seedance video is missing or unreadable; recover using its provider ID';
            delete item.finishedAt;
          }
        });
        return videoStatus(input);
      }
    }
    checkVideoEnvironment(plan.tool);
    if (hosted || seedance) {
      if (!job.providerId) return { ...job, recovery: 'No provider job ID is recorded. Reconcile with the provider before retrying.' };
      const observed = seedance ? await pollSeedanceTask(job.providerId) : await hosted.poll(plan.args, job.providerId);
      if (observed.state === 'running') return { ...job, providerStatus: 'running' };
      const target = resolveOutputFile(String(plan.args.outputPath), String(plan.args.filename), 'video');
      if (seedance) {
        const tokens = observed.state === 'failed' ? 0 : observed.meta?.completionTokens;
        if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 && plan.quote.tokenRate !== undefined) {
          const settledUsd = tokens * plan.quote.tokenRate / 1e6;
          videoTransaction(episode, current => {
            const item = current.jobs[requestId];
            if (item.status !== 'failed' && item.status !== 'completed') Object.assign(item, {tokens, settledUsd});
          });
        }
      }
      const output = observed.state === 'done' ? await saveVendorOutput(observed, target, job.providerId, seedance ? verifySeedanceVideo : undefined) : null;
      if (output && !output.success) return { ...await videoStatus({episode, requestId}), recovery: output.error };
      const durationError = output && await adaptiveSeedanceOutputError(plan);
      videoTransaction(episode, current => {
        const item = current.jobs[requestId];
        if (item.status === 'completed' || item.status === 'failed') return;
        const now = new Date().toISOString();
        Object.assign(item, { updatedAt: now, finishedAt: now }, observed.state === 'failed' || durationError
          ? { status: 'failed', evidence: observed.state === 'failed' ? observed.error : durationError }
          : { status: 'completed', result: { content: [{ type: 'text', text: JSON.stringify(output) }] } });
      });
      return videoStatus({ episode, requestId });
    }
    const receiptPath = path.join(String(plan.args.outputPath), String(plan.args.filename)) + '.astra-genai.json';
    let result;
    try {
      result = job.tool.startsWith('astra_genai_desktop_') ? await desktopVideoStatus(receiptPath, true) : await getGenaiVideoStatus({ receiptPath, download: true }, planOutputContract(plan), {target:path.join(String(plan.args.outputPath),String(plan.args.filename)),jobId:job.providerId,fingerprint:plan.sceneRendering ? plan.id : undefined});
    } catch (error) {
      if (!plan.sceneRendering || !(error instanceof GenaiRequestError && error.terminal && error.httpStatus === 200)) throw error;
      const {jobId} = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (!jobId || job.providerId && jobId !== job.providerId) throw new Error('GenAI recovery job ID mismatch');
      videoTransaction(episode, current => {
        const item = current.jobs[requestId];
        if (item.status === 'completed' || item.status === 'failed') return;
        const now = new Date().toISOString();
        Object.assign(item, {providerId:jobId, status:'failed', evidence:error.message, updatedAt:now, finishedAt:now});
      });
      return videoStatus({episode, requestId});
    }
    if (job.providerId && result.jobId !== job.providerId) throw new Error('GenAI recovery job ID mismatch');
    videoTransaction(episode, current => Object.assign(current.jobs[requestId], { providerId:result.jobId, providerStatus: result.status, observedAt: new Date().toISOString() }));
    if (result.downloaded) {
      const response: ToolResult = { content: [{ type: 'text', text: JSON.stringify({ ...result, receiptPath }) }] };
      videoTransaction(episode, current => Object.assign(current.jobs[requestId], { status: 'completed', providerId: result.jobId, result: response, updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }));
      return videoStatus({ episode, requestId: input.requestId });
    }
    return { ...job, providerStatus: result.status, recovery: 'Poll this same request with action:refresh; do not resubmit.' };
  }
  return job ? { ...job, recovery: job.status === 'completed' ? 'Reuse result; no new generation.' :
    job.status === 'failed' ? 'Closed as failed; its concurrency slot is free. Plan a new requestId to try again.' :
    'Inspect providerId at the selected provider. Keep the reservation until billing and terminal status are reconciled with action:reconcile. Do not change requestId or delete state to retry.' } :
    { requestId: input.requestId, status: 'not_started' };
}
