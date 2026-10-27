import { z } from 'zod';
import { episodePathArg, priceOf, recordUsage } from './usage-ledger.js';
import { prepareSpeech, SPEECH_GENERATORS } from './tts-adapters.js';
import { getTtsModels, resolveTtsModel } from './tts-models.js';
import { withSpeechRequestId } from './tts-execution.js';
import { disabledToolPatterns, disabledToolsFile } from './config.js';
import { resolveToolGate } from './tool-gate.js';

export const speechRouteSchema = z.object({
  action: z.enum(['capabilities', 'plan', 'execute']),
  generator: z.enum(SPEECH_GENERATORS).optional(),
  generation: z.record(z.unknown()).optional(),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action !== 'capabilities' && (!value.generator || !value.generation)) ctx.addIssue({code:'custom',message:'plan/execute require generator and generation'});
  if (value.action === 'execute' && (!value.requestId || !value.generation?.outputPath)) ctx.addIssue({code:'custom',message:'execute requires requestId and generation.outputPath for durable replay protection'});
  if (value.action === 'capabilities' && (value.generator || value.generation || value.requestId)) ctx.addIssue({code:'custom',message:'capabilities takes no generation arguments'});
});

/** Plans expose capabilities, not creative approval gates or assumed voice quality. */
export async function routeSpeech(input: z.input<typeof speechRouteSchema>) {
  const request = speechRouteSchema.parse(input);
  if (request.action === 'capabilities') return { models: getTtsModels(), review: 'not_reviewed' };
  const prepared = prepareSpeech(request.generator!, request.generation);
  const model = resolveTtsModel(prepared.generator.startsWith('tts_elevenlabs_') ? 'elevenlabs' : 'gemini', String(prepared.args.model));
  const gate = resolveToolGate(prepared.generator, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
  const plan = { generator: prepared.generator, generation: prepared.args, capabilities: model,
    enabled: gate.enabled, gateReason: gate.reason, review: 'not_reviewed',
    warnings: model.recommendedDialogueCharacters && prepared.spokenText.length > model.recommendedDialogueCharacters
      ? ['Split long ElevenLabs dialogue at scene boundaries; requests above 2000 characters may terminate early.'] : [],
    cost: { status: 'not_quoted', note: 'Provider usage is recorded when available; this plan neither reserves nor authorizes spending.' } };
  if (request.action === 'plan') return plan;
  if (!gate.enabled) throw new Error('Selected speech generator is disabled: ' + gate.reason);
  const started = Date.now();
  const result = await withSpeechRequestId(request.requestId!, prepared.run);
  if (result.attempts && !result.replayed) {
    const price = priceOf(prepared.generator, prepared.args);
    recordUsage(episodePathArg(prepared.args), { ts: new Date().toISOString(), tool: prepared.generator,
      ok: result.success, ms: Date.now() - started, ...price, detail: { model: String(prepared.args.model), requestId: request.requestId!, receiptPath: result.receiptPath || '' } });
  }
  return result;
}
