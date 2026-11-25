import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { astraGenaiBaseUrl } from './astra-genai-client.js';
import { genaiSpeechSchema } from './astra-genai-speech.js';
import { assertSelection } from './adapter-parameters.js';
import { atomicJson, canonicalPath, routingHash } from './routing-files.js';
import { z } from 'zod';
import { episodePathArg, meteredPrice, priceOf, recordUsage } from './usage-ledger.js';
import { prepareSpeech, speechAdapterContracts, SPEECH_GENERATORS, type PreparedSpeech } from './tts-adapters.js';
import { getTtsModels, resolveTtsModel, speechProvider } from './tts-models.js';
import { validateEpisodeSpeech, withSpeechRequestId } from './tts-execution.js';
import { disabledToolPatterns, disabledToolsFile } from './config.js';
import { resolveToolGate } from './tool-gate.js';

const requestId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).describe('Stable take ID within the output directory, e.g. intro-line-r1.');
const directory = z.string().refine(isAbsolute, 'Use an absolute output directory').describe('Absolute speech output directory, e.g. /project/.work/speech.');
const engine = z.enum(['mlx-audio', 'astra-genai', 'gemini', 'elevenlabs']);
export const speechCatalogSchema = z.object({
  engine: engine.optional().describe('Show adapter parameters for one engine, e.g. mlx-audio.'),
  model: z.string().min(1).optional().describe('Limit an engine to one model, e.g. voxcpm2.'),
}).strict().refine(input => !input.model || input.engine, 'model requires engine');
export const speechPlanSchema = z.object({
  directory, requestId,
  engine: engine.optional().describe('Expected speech engine, e.g. mlx-audio. Must match the generator.'),
  model: z.string().min(1).optional().describe('Expected model, e.g. voxcpm2. Must match the resolved generation arguments.'),
  generator: z.enum(SPEECH_GENERATORS).describe('Speech adapter from tts_catalog or plan_audio, e.g. tts_local_voxcpm2.'),
  generation: z.record(z.unknown()).describe('Adapter arguments from plan_audio or the selected generator, including text or turns.'),
  speechContext: genaiSpeechSchema.shape.speechContext.describe('Episode line binding returned by speech_manage plan_audio.'),
}).strict();
export const speechExecuteSchema = z.object({
  directory, planId: z.string().regex(/^[a-f0-9]{64}$/).describe('SHA-256 plan ID returned by tts_plan.'),
}).strict();
export const speechStatusSchema = z.object({directory, requestId}).strict();

export const speechRouteSchema = z.object({
  action: z.enum(['capabilities', 'plan', 'execute']),
  generator: z.enum(SPEECH_GENERATORS).optional(),
  generation: z.record(z.unknown()).optional(),
  requestId: requestId.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action !== 'capabilities' && (!value.generator || !value.generation)) ctx.addIssue({code:'custom',message:'plan/execute require generator and generation'});
  if (value.action === 'execute' && (!value.requestId || !value.generation?.outputPath)) ctx.addIssue({code:'custom',message:'execute requires requestId and generation.outputPath for durable replay protection'});
  if (value.action === 'capabilities' && (value.generator || value.generation || value.requestId)) ctx.addIssue({code:'custom',message:'capabilities takes no generation arguments'});
});

export function speechCatalog(input: unknown = {}) {
  const {engine, model} = speechCatalogSchema.parse(input);
  if (engine) return speechAdapterContracts(engine, model);
  return { models: getTtsModels(), gateway: { generator: 'tts_astra_genai', discovery: 'astra_genai_catalog kind:speech', model: 'explicit deployment alias', review: 'not_reviewed' }, review: 'not_reviewed' };
}

function describePlan(prepared: PreparedSpeech) {
  const model = resolveTtsModel(speechProvider(prepared.generator), String(prepared.args.model));
  const gate = resolveToolGate(prepared.generator, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  return { generator: prepared.generator, generation: prepared.args, capabilities: model,
    enabled: gate.enabled, gateReason: gate.reason, review: 'not_reviewed',
    warnings: model.recommendedDialogueCharacters && prepared.spokenText.length > model.recommendedDialogueCharacters
      ? ['Split long ElevenLabs dialogue at scene boundaries; requests above 2000 characters may terminate early.'] : [],
    cost: { status: 'not_quoted', note: 'Provider usage is recorded when available; this plan neither reserves nor authorizes spending.' } };
}

async function executePrepared(prepared: PreparedSpeech, id: string) {
  const plan = describePlan(prepared);
  if (!plan.enabled) throw new Error('Selected speech generator is disabled: ' + plan.gateReason);
  const started = Date.now();
  const result = await withSpeechRequestId(id, prepared.run);
  if (result.attempts && !result.replayed) {
    const price = meteredPrice(priceOf(prepared.generator, prepared.args), result as { characterCost?: unknown });
    recordUsage(episodePathArg(prepared.args), { ts: new Date().toISOString(), tool: prepared.generator,
      ok: result.success, ms: Date.now() - started, ...price, detail: { model: String(prepared.args.model), requestId: id, receiptPath: result.receiptPath || '' } });
  }
  return result;
}

export async function routeSpeech(input: z.input<typeof speechRouteSchema>) {
  const request = speechRouteSchema.parse(input);
  if (request.action === 'capabilities') return speechCatalog();
  const prepared = prepareSpeech(request.generator!, request.generation);
  return request.action === 'plan' ? describePlan(prepared) : executePrepared(prepared, request.requestId!);
}

function stateFile(directory: string, folder: string, id: string) {
  const file = join(canonicalPath(directory), folder, id + '.json');
  if (canonicalPath(file) !== file) throw new Error('Speech state must be inside its output directory');
  return file;
}

function prepareSavedSpeech(input: z.infer<typeof speechPlanSchema>) {
  const outputPath = canonicalPath(input.directory);
  const args: Record<string, unknown> = { ...input.generation, outputPath };
  if (input.generation.outputPath !== undefined &&
      (typeof input.generation.outputPath !== 'string' || canonicalPath(input.generation.outputPath) !== outputPath))
    throw new Error('Speech plan directory differs from generation.outputPath');
  if (input.generation.requestId !== undefined && input.generation.requestId !== input.requestId)
    throw new Error('Speech plan requestId differs from generation.requestId');

  const adapterBindsLine = input.generator === 'tts_local_voxcpm2' || input.generator === 'tts_astra_genai';
  if (input.speechContext && adapterBindsLine) {
    if (args.speechContext && routingHash(args.speechContext) !== routingHash(input.speechContext))
      throw new Error('Conflicting speech contexts');
    args.speechContext = input.speechContext;
  }
  const prepared = prepareSpeech(input.generator, args);
  assertSelection('tts', {engine: speechProvider(prepared.generator), model: String(prepared.args.model)}, input);
  if (input.speechContext && !adapterBindsLine)
    validateEpisodeSpeech(input.generator, { ...prepared.args, speechContext: input.speechContext });
  return prepared;
}

function pinConditioning(prepared: PreparedSpeech) {
  const args = { ...prepared.args };
  if (prepared.generator === 'tts_local_voxcpm2') {
    for (const [audio, digest] of [['referenceAudio', 'referenceSha256'], ['continuationAudio', 'continuationSha256']]) {
      const file = args[audio];
      if (typeof file !== 'string') continue;
      const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
      if (args[digest] !== undefined && args[digest] !== sha)
        throw new Error('Speech conditioning audio changed: ' + audio);
      args[digest] = sha;
    }
  }
  return args;
}

export function planSpeech(args: unknown) {
  const input = speechPlanSchema.parse(args);
  const prepared = prepareSavedSpeech(input);
  const directory = String(prepared.args.outputPath);
  const plan = { ...input, directory, generation: pinConditioning(prepared),
    ...(input.generator === 'tts_astra_genai' ? { baseUrl: astraGenaiBaseUrl('/v1/audio/') } : {}) };
  const planId = routingHash(plan);
  atomicJson(stateFile(directory, '.speech-plans', planId), plan);
  return { ...describePlan(prepared), generation: plan.generation, directory, requestId: input.requestId, planId };
}

export async function executeSpeechPlan(args: unknown) {
  const { directory, planId } = speechExecuteSchema.parse(args);
  const plan = JSON.parse(readFileSync(stateFile(directory, '.speech-plans', planId), 'utf8'));
  if (routingHash(plan) !== planId || plan.directory !== canonicalPath(directory))
    throw new Error('Speech plan content or directory has changed');
  const { baseUrl, ...request } = plan;
  if (request.generator === 'tts_astra_genai' && baseUrl !== astraGenaiBaseUrl('/v1/audio/'))
    throw new Error('Speech gateway changed since planning');
  const input = speechPlanSchema.parse(request);
  return executePrepared(prepareSavedSpeech(input), input.requestId);
}

export function speechStatus(args: unknown) {
  const { directory, requestId } = speechStatusSchema.parse(args);
  const receiptPath = stateFile(directory, '.speech-runs', requestId);
  let source: string;
  try { source = readFileSync(receiptPath, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { requestId, status: 'not_found' };
    throw error;
  }
  const receipt = JSON.parse(source);
  if (receipt.requestId !== requestId) throw new Error('Speech receipt requestId mismatch');
  return { requestId, receiptPath, status: receipt.status, generator: receipt.generator,
    model: receipt.model, attempts: receipt.attempts, audioPath: receipt.result?.audioPath,
    durationSeconds: receipt.durationSeconds, error: receipt.error };
}
