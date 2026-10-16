import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { ttsSchema } from './character-tts.js';
import { actingSchema, compileActing } from './speech-acting.js';
import { elevenLabsGenerateSchema, generateElevenLabsSpeech } from './elevenlabs-client.js';
import { gemini38TtsSchema, generateGemini38Speech, generateSpeech, ttsGenerateSchema } from './tts-client.js';
import { disabledToolPatterns, disabledToolsFile } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { priceOf, recordUsage } from './usage-ledger.js';

const candidate = z.object({ label: z.string().trim().min(1).max(100), reason: z.string().trim().min(1).max(500), tts: ttsSchema.refine(v => !!v.model, 'Choose an explicit model for audition') }).strict();
export const voiceAuditionSchema = z.object({
  action: z.enum(['create', 'read', 'select']), identityPath: z.string().min(1).optional(),
  auditionPath: z.string().min(1).optional(), sampleText: z.string().trim().min(5).max(300).optional(),
  candidates: z.array(candidate).length(3).optional(), acting: actingSchema.optional(),
  candidateId: z.enum(['1', '2', '3']).optional(), userSelection: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((args, ctx) => {
  if (args.action === 'create' && (!args.identityPath || !args.sampleText || !args.candidates))
    ctx.addIssue({ code: 'custom', message: 'create requires identityPath, sampleText and exactly three candidates' });
  if (args.action !== 'create' && !args.auditionPath) ctx.addIssue({ code: 'custom', message: 'auditionPath is required' });
  if (args.action === 'select' && (!args.candidateId || !args.userSelection))
    ctx.addIssue({ code: 'custom', message: 'select requires candidateId and the actual user selection; never auto-select' });
  if (args.candidates) {
    if (new Set(args.candidates.map(c => c.tts.voiceId)).size !== 3) ctx.addIssue({ code: 'custom', message: 'Use three distinct voices' });
    if (new Set(args.candidates.map(c => `${c.tts.engine}/${c.tts.model}/${c.tts.language}`)).size !== 1)
      ctx.addIssue({ code: 'custom', message: 'Compare voices with the same engine, model and language' });
  }
});
type Args = z.infer<typeof voiceAuditionSchema>;
type Candidate = z.infer<typeof candidate> & { id: string; audioPath: string; audioSha256: string; generation: unknown };
interface Audition { version: 1; status: 'generating' | 'ready' | 'selected' | 'failed'; identityPath: string; identitySha256: string; sampleText: string; candidates: Candidate[]; previewPath: string; selected?: { candidateId: string; userSelection: string; at: string; identitySha256: string } }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function save(file: string, value: Audition) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2)); renameSync(temporary, file);
}
function preview(audition: Audition) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Voice audition</title><style>body{font:18px system-ui;max-width:800px;margin:40px auto;padding:24px;color:#17212b;background:#f5f3ee}article{padding:24px;margin:20px 0;background:white;border:1px solid #d8d4cc;border-radius:12px}audio{width:100%}small{color:#52616b}</style><h1>음성 후보 3개</h1><p>같은 대사를 듣고 원하는 후보 번호를 대화창에서 선택하세요. 선택 전에는 캐릭터 음성을 확정하지 않습니다.</p><blockquote>${escape(audition.sampleText)}</blockquote>${audition.candidates.map(c => `<article><h2>${c.id}. ${escape(c.label)}</h2><p>${escape(c.reason)}</p><audio controls preload="metadata" src="candidate-${c.id}.wav"></audio><small>${escape(c.tts.engine)} · ${escape(c.tts.model || '')} · ${escape(c.tts.voiceId)}</small></article>`).join('')}</html>`;
}

/** Create paid previews, or apply only the candidate explicitly selected by the user. */
export async function manageVoiceAudition(args: Args) {
  if (args.action === 'create') {
    const identityPath = resolve(args.identityPath!);
    const source = readFileSync(identityPath, 'utf8');
    const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]) as Record<string, unknown>);
    if (blocks.filter(b => b.character !== undefined).length !== 1) throw new Error('Create the character identity JSON before auditioning; tts may be absent until selection');
    const outputPath = join(dirname(identityPath), 'voice-auditions', randomUUID());
    mkdirSync(outputPath, { recursive: true });
    const auditionPath = join(outputPath, 'audition.json');
    const audition: Audition = { version: 1, status: 'generating', identityPath, identitySha256: hash(source), sampleText: args.sampleText!, candidates: [], previewPath: join(outputPath, 'index.html') };
    save(auditionPath, audition);
    try {
      for (const [index, choice] of args.candidates!.entries()) {
        const id = String(index + 1);
        const compiled = compileActing(args.sampleText!, args.acting, choice.tts);
        const gate = resolveToolGate(compiled.generator, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
        if (!gate.enabled) throw new Error('Audition generator is disabled: ' + compiled.generator + ': ' + gate.reason);
        const generation = { ...compiled.generation, outputPath, filename: `candidate-${id}.wav` };
        const started = Date.now();
        let result: { success: boolean; audioPath?: string; error?: string; characterCost?: number; requestId?: string } | undefined;
        try {
          result = compiled.generator === 'tts_elevenlabs_generate'
            ? await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse(generation))
            : compiled.generator === 'tts_gemini_38' ? await generateGemini38Speech(gemini38TtsSchema.parse(generation))
              : await generateSpeech(ttsGenerateSchema.parse(generation));
        } finally {
          const price = priceOf(compiled.generator, generation);
          const event = { ts: new Date().toISOString(), tool: compiled.generator, ok: result?.success === true, ms: Date.now() - started,
            key: price.key, quantity: result?.characterCost !== undefined ? result.characterCost / 1000 : price.quantity,
            note: 'Character audition candidate ' + id, detail: { model: choice.tts.model || '', voiceId: choice.tts.voiceId, ...(result?.requestId ? { requestId: result.requestId } : {}) } };
          // Character auditions normally live outside episodes; always keep a local spend ledger.
          appendFileSync(join(outputPath, 'events.jsonl'), JSON.stringify(event) + '\n');
          recordUsage(outputPath, event);
        }
        if (!result.success || !result.audioPath) throw new Error(result.error || 'Candidate generation returned no audio');
        const bytes = readFileSync(result.audioPath);
        if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.length <= 44) throw new Error('Candidate must be a nonempty WAV');
        audition.candidates.push({ ...choice, id, audioPath: result.audioPath, audioSha256: hash(bytes), generation: { generator: compiled.generator, arguments: generation, result } });
        save(auditionPath, audition);
      }
      audition.status = 'ready'; writeFileSync(audition.previewPath, preview(audition)); save(auditionPath, audition);
      return { auditionPath, ...audition, instruction: 'Present all three audio players. Wait for the user to choose a candidate, then call select with their actual response.' };
    } catch (error) {
      audition.status = 'failed'; save(auditionPath, audition);
      throw new Error(`Audition incomplete; existing candidates are preserved at ${auditionPath}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const auditionPath = resolve(args.auditionPath!);
  const audition = JSON.parse(readFileSync(auditionPath, 'utf8')) as Audition;
  if (audition.version !== 1) throw new Error('Unsupported audition manifest');
  if (args.action === 'read') return { auditionPath, ...audition };
  if (audition.status !== 'ready' || audition.candidates.length !== 3) throw new Error('Select only from a complete, unselected three-voice audition');
  const chosen = audition.candidates.find(c => c.id === args.candidateId);
  if (!chosen) throw new Error('Unknown candidate');
  const recorded = chosen.generation as { generator?: string; arguments?: Record<string, unknown> };
  const config = ttsSchema.parse(chosen.tts);
  const actual = recorded.arguments || {};
  if ((actual.voiceId || actual.voice || actual.voiceName) !== config.voiceId || actual.model !== config.model ||
      (config.engine === 'elevenlabs' && (recorded.generator !== 'tts_elevenlabs_generate' || actual.languageCode !== config.language || actual.stability !== config.stability || actual.similarity !== config.similarity)) ||
      (config.engine === 'gemini' && !['tts_generate','tts_gemini_38'].includes(recorded.generator || '')))
    throw new Error('Candidate voice settings differ from the recorded generation; create a new audition');
  for (const c of audition.candidates) if (!existsSync(c.audioPath) || hash(readFileSync(c.audioPath)) !== c.audioSha256) throw new Error('Audition audio changed; regenerate or restore original audio before selection');
  const source = readFileSync(audition.identityPath, 'utf8');
  if (hash(source) !== audition.identitySha256) throw new Error('Character identity changed after audition; create a new audition for the current character');
  const selection = { candidateId: chosen.id, userSelection: args.userSelection!, at: new Date().toISOString(), auditionPath, audioSha256: chosen.audioSha256 };
  let replaced = false;
  const next = source.replace(/```json\s*\n([\s\S]*?)```/g, (block, json: string) => {
    const value = JSON.parse(json) as Record<string, unknown>;
    if (!Object.hasOwn(value, 'tts') && !Object.hasOwn(value, 'character')) return block;
    if (replaced) throw new Error('Identity must store character and tts in one JSON block for audition selection');
    replaced = true;
    return '```json\n' + JSON.stringify({ ...value, tts: ttsSchema.parse(chosen.tts), voiceSelection: selection }, null, 2) + '\n```';
  });
  if (!replaced) throw new Error('Missing identity JSON');
  writeFileSync(join(dirname(auditionPath), 'identity-before-selection.md'), source, { flag: 'wx' });
  const temporary = audition.identityPath + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, next); renameSync(temporary, audition.identityPath);
  audition.status = 'selected'; audition.selected = { ...selection, identitySha256: hash(next) }; save(auditionPath, audition);
  return { auditionPath, identityPath: audition.identityPath, tts: chosen.tts, selection, instruction: 'Recompile the character sheet and refresh the review library; existing episode snapshots are unchanged.' };
}
