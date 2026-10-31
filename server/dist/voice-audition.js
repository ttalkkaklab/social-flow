import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { ttsSchema } from './character-tts.js';
import { actingSchema, compileActing } from './speech-acting.js';
import { prepareSpeech } from './tts-adapters.js';
import { disabledToolPatterns, disabledToolsFile } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { meteredPrice, priceOf, recordUsage } from './usage-ledger.js';
import { characterVoiceTarget, compareVoiceMetadata, voiceMetadataSchema, voiceProfileSchema } from './voice-target.js';
const candidate = z.object({ label: z.string().trim().min(1).max(100), reason: z.string().trim().min(1).max(500), tts: ttsSchema.refine(v => !!v.model, 'Choose an explicit model for audition'), metadata: voiceMetadataSchema.optional() }).strict().superRefine((value, ctx) => {
    if (value.metadata && value.metadata.voiceId !== value.tts.voiceId)
        ctx.addIssue({ code: 'custom', path: ['metadata', 'voiceId'], message: 'Metadata must describe this candidate voice ID' });
});
const sampleTurn = z.object({ text: z.string().trim().min(1).max(300), acting: actingSchema.optional() }).strict();
export const voiceAuditionSchema = z.object({
    action: z.enum(['plan', 'create', 'read', 'select']), identityPath: z.string().min(1).optional(),
    auditionPath: z.string().min(1).optional(), sampleText: z.string().trim().min(5).max(300).optional(),
    candidates: z.array(candidate).length(3).optional(), acting: actingSchema.optional(),
    sampleTurns: z.array(sampleTurn).min(2).max(10).optional(),
    voiceProfile: voiceProfileSchema.optional(),
    candidateId: z.enum(['1', '2', '3']).optional(), userSelection: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((args, ctx) => {
    if (args.action === 'create' && (!args.identityPath || !args.sampleText || !args.candidates))
        ctx.addIssue({ code: 'custom', message: 'create requires identityPath, sampleText and exactly three candidates' });
    if (args.action === 'plan' && !args.identityPath)
        ctx.addIssue({ code: 'custom', message: 'plan requires identityPath' });
    if (['read', 'select'].includes(args.action) && !args.auditionPath)
        ctx.addIssue({ code: 'custom', message: 'auditionPath is required' });
    if (args.action === 'select' && (!args.candidateId || !args.userSelection))
        ctx.addIssue({ code: 'custom', message: 'select requires candidateId and the actual user selection; never auto-select' });
    if (args.candidates) {
        if (new Set(args.candidates.map(c => c.tts.voiceId)).size !== 3)
            ctx.addIssue({ code: 'custom', message: 'Use three distinct voices' });
        if (new Set(args.candidates.map(c => `${c.tts.engine}/${c.tts.model}/${c.tts.language}`)).size !== 1)
            ctx.addIssue({ code: 'custom', message: 'Compare voices with the same engine, model and language' });
    }
    if (args.sampleTurns) {
        const normalize = (value) => value.replace(/\s+/g, ' ').trim();
        if (!args.sampleText || normalize(args.sampleTurns.map(turn => turn.text).join(' ')) !== normalize(args.sampleText))
            ctx.addIssue({ code: 'custom', path: ['sampleTurns'], message: 'Turn texts must reproduce sampleText in order, without added or omitted words' });
        if (args.acting)
            ctx.addIssue({ code: 'custom', path: ['acting'], message: 'Use per-turn acting when sampleTurns is present; keep stable identity in voiceDirection' });
        if (args.candidates?.some(choice => choice.tts.engine !== 'gemini' || !choice.tts.model?.startsWith('gemini-3.8-')))
            ctx.addIssue({ code: 'custom', path: ['sampleTurns'], message: 'Per-turn sample acting requires Gemini 3.8 TTS' });
    }
});
const hash = (value) => createHash('sha256').update(value).digest('hex');
const escape = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function compileSample(text, acting, voice, turns) {
    if (!turns)
        return compileActing(text, acting, voice);
    turns = z.array(sampleTurn).min(2).max(10).parse(turns);
    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    if (acting || normalize(turns.map(turn => turn.text).join(' ')) !== normalize(text))
        throw new Error('Sample turns must reproduce sampleText with per-turn acting only');
    if (voice.engine !== 'gemini' || !String(voice.model).startsWith('gemini-3.8-'))
        throw new Error('Per-turn sample acting requires Gemini 3.8 TTS');
    const { directionSupport } = createRequire(import.meta.url)('../../skills/_shared/scene-acting.js');
    if (turns.some(turn => !directionSupport(voice, turn.acting).supported))
        throw new Error('Per-turn resolved vocal style exceeds the Gemini 3.8 limit of 500 characters; shorten the controls');
    const compiled = turns.map(turn => compileActing(turn.text, turn.acting, voice));
    return { generator: 'tts_gemini_38', generation: { ...compiled[0].generation, turns: compiled.flatMap(turn => turn.generation.turns) } };
}
function save(file, value) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(value, null, 2));
    renameSync(temporary, file);
}
function preview(audition) {
    return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Voice audition</title><style>body{font:18px system-ui;max-width:800px;margin:40px auto;padding:24px;color:#17212b;background:#f5f3ee}article{padding:24px;margin:20px 0;background:white;border:1px solid #d8d4cc;border-radius:12px}audio{width:100%}small{color:#52616b}</style><h1>음성 후보 3개</h1><p>같은 대사를 듣고 원하는 후보 번호를 대화창에서 선택하세요. 선택 전에는 캐릭터 음성을 확정하지 않습니다.</p><blockquote>${escape(audition.sampleText)}</blockquote>${audition.candidates.map(c => `<article><h2>${c.id}. ${escape(c.label)}</h2><p>${escape(c.reason)}</p><audio controls preload="metadata" src="candidate-${c.id}.wav"></audio><small>${escape(c.tts.engine)} · ${escape(c.tts.model || '')} · ${escape(c.tts.voiceId)}</small></article>`).join('')}</html>`;
}
/** Create paid previews, or apply only the candidate explicitly selected by the user. */
export async function manageVoiceAudition(args) {
    if (args.action === 'create' || args.action === 'plan') {
        const identityPath = resolve(args.identityPath);
        const source = readFileSync(identityPath, 'utf8');
        const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]));
        if (blocks.filter(b => b.character !== undefined).length !== 1)
            throw new Error('Create the character identity JSON before auditioning; tts may be absent until selection');
        const target = characterVoiceTarget(source, args.voiceProfile);
        const planned = (args.candidates || []).map(choice => {
            if (choice.tts.engine === 'gemini' && !choice.tts.voiceDirection && target.baselineDirection.length > 400) {
                const generationError = 'Derived voice direction exceeds 400 characters; supply a compact voiceProfile.baselineDirection before synthesis';
                if (args.action === 'create')
                    throw new Error(generationError);
                return { ...choice, match: compareVoiceMetadata(target, choice.metadata), compiled: undefined, generationError };
            }
            const tts = ttsSchema.parse({ ...choice.tts, ...(choice.tts.engine === 'gemini' && target.baselineDirection && !choice.tts.voiceDirection ? { voiceDirection: target.baselineDirection } : {}) });
            const compiled = args.sampleText ? compileSample(args.sampleText, args.acting, tts, args.sampleTurns) : undefined;
            return { ...choice, tts, match: compareVoiceMetadata(target, choice.metadata), ...(compiled ? { compiled } : {}) };
        });
        if (args.action === 'plan')
            return { identityPath, identitySha256: hash(source), target, candidates: planned, review: 'not_reviewed', instruction: 'Use provider metadata to choose candidates; unknown attributes require auditioning. No audio generated and identity is unchanged.' };
        const outputPath = join(dirname(identityPath), 'voice-auditions', randomUUID());
        mkdirSync(outputPath, { recursive: true });
        const auditionPath = join(outputPath, 'audition.json');
        const audition = { version: 1, status: 'generating', identityPath, identitySha256: hash(source), sampleText: args.sampleText, candidates: [], target, ...(args.acting ? { acting: args.acting } : {}), ...(args.sampleTurns ? { sampleTurns: args.sampleTurns } : {}), previewPath: join(outputPath, 'index.html') };
        save(auditionPath, audition);
        try {
            for (const [index, choice] of planned.entries()) {
                const id = String(index + 1);
                const compiled = choice.compiled;
                const gate = resolveToolGate(compiled.generator, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
                if (!gate.enabled)
                    throw new Error('Audition generator is disabled: ' + compiled.generator + ': ' + gate.reason);
                const generation = { ...compiled.generation, outputPath, filename: `candidate-${id}.wav` };
                const started = Date.now();
                let result;
                try {
                    result = await prepareSpeech(compiled.generator, generation).run();
                }
                finally {
                    const price = meteredPrice(priceOf(compiled.generator, generation), result);
                    const event = { ts: new Date().toISOString(), tool: compiled.generator, ok: result?.success === true, ms: Date.now() - started,
                        key: price.key, quantity: price.quantity,
                        note: 'Character audition candidate ' + id, detail: { model: choice.tts.model || '', voiceId: choice.tts.voiceId, ...(result?.requestId ? { requestId: result.requestId } : {}) } };
                    // Character auditions normally live outside episodes; always keep a local spend ledger.
                    appendFileSync(join(outputPath, 'events.jsonl'), JSON.stringify(event) + '\n');
                    recordUsage(outputPath, event);
                }
                if (!result.success || !result.audioPath)
                    throw new Error(result.error || 'Candidate generation returned no audio');
                const bytes = readFileSync(result.audioPath);
                if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.length <= 44)
                    throw new Error('Candidate must be a nonempty WAV');
                const { compiled: _compiled, ...record } = choice;
                audition.candidates.push({ ...record, id, audioPath: result.audioPath, audioSha256: hash(bytes), generation: { generator: compiled.generator, arguments: generation, result } });
                save(auditionPath, audition);
            }
            audition.status = 'ready';
            writeFileSync(audition.previewPath, preview(audition));
            save(auditionPath, audition);
            return { auditionPath, ...audition, instruction: 'Present all three audio players. Wait for the user to choose a candidate, then call select with their actual response.' };
        }
        catch (error) {
            audition.status = 'failed';
            save(auditionPath, audition);
            throw new Error(`Audition incomplete; existing candidates are preserved at ${auditionPath}. ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const auditionPath = resolve(args.auditionPath);
    const audition = JSON.parse(readFileSync(auditionPath, 'utf8'));
    if (audition.version !== 1)
        throw new Error('Unsupported audition manifest');
    if (args.action === 'read')
        return { auditionPath, ...audition };
    if (audition.status !== 'ready' || audition.candidates.length !== 3)
        throw new Error('Select only from a complete, unselected three-voice audition');
    const chosen = audition.candidates.find(c => c.id === args.candidateId);
    if (!chosen)
        throw new Error('Unknown candidate');
    const recorded = chosen.generation;
    const config = ttsSchema.parse(chosen.tts);
    const actual = recorded.arguments || {};
    if (audition.target || config.voiceDirection) {
        const expected = compileSample(audition.sampleText, audition.acting, config, audition.sampleTurns);
        const actualRequest = Object.fromEntries(Object.entries(actual).filter(([key]) => !['outputPath', 'filename'].includes(key)));
        if (expected.generator !== recorded.generator || !isDeepStrictEqual(actualRequest, expected.generation))
            throw new Error('Candidate voice settings or acting differ from recorded generation; create a new audition');
    }
    if ((actual.voiceId || actual.voice || actual.voiceName) !== config.voiceId || actual.model !== config.model ||
        (config.engine === 'elevenlabs' && (recorded.generator !== 'tts_elevenlabs_generate' || actual.languageCode !== config.language || actual.stability !== config.stability || actual.similarity !== config.similarity)) ||
        (config.engine === 'gemini' && !['tts_generate', 'tts_gemini_38'].includes(recorded.generator || '')))
        throw new Error('Candidate voice settings differ from the recorded generation; create a new audition');
    for (const c of audition.candidates)
        if (!existsSync(c.audioPath) || hash(readFileSync(c.audioPath)) !== c.audioSha256)
            throw new Error('Audition audio changed; regenerate or restore original audio before selection');
    const source = readFileSync(audition.identityPath, 'utf8');
    if (hash(source) !== audition.identitySha256)
        throw new Error('Character identity changed after audition; create a new audition for the current character');
    const selection = { candidateId: chosen.id, userSelection: args.userSelection, at: new Date().toISOString(), auditionPath, audioSha256: chosen.audioSha256 };
    let replaced = false;
    const next = source.replace(/```json\s*\n([\s\S]*?)```/g, (block, json) => {
        const value = JSON.parse(json);
        if (!Object.hasOwn(value, 'tts') && !Object.hasOwn(value, 'character'))
            return block;
        if (replaced)
            throw new Error('Identity must store character and tts in one JSON block for audition selection');
        replaced = true;
        return '```json\n' + JSON.stringify({ ...value, tts: ttsSchema.parse(chosen.tts), voiceSelection: selection }, null, 2) + '\n```';
    });
    if (!replaced)
        throw new Error('Missing identity JSON');
    writeFileSync(join(dirname(auditionPath), 'identity-before-selection.md'), source, { flag: 'wx' });
    const temporary = audition.identityPath + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, next);
    renameSync(temporary, audition.identityPath);
    audition.status = 'selected';
    audition.selected = { ...selection, identitySha256: hash(next) };
    save(auditionPath, audition);
    return { auditionPath, identityPath: audition.identityPath, tts: chosen.tts, selection, instruction: 'Recompile the character sheet and refresh the review library; existing episode snapshots are unchanged.' };
}
