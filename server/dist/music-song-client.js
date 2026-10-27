/** Official song APIs. A request is submitted once; uncertain failures are reconciled by music routing. */
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { requireGeminiKey, requireElevenLabsKey, elevenLabsBaseUrl } from './config.js';
import { bareFilenameSchema, saveAudioFile } from './media-utils.js';
const files = { outputPath: z.string().optional(), filename: bareFilenameSchema('audio').optional() };
export const lyriaSongSchema = z.object({
    model: z.enum(['lyria-3-clip-preview', 'lyria-3.5']).default('lyria-3.5'),
    prompt: z.string().min(1), lyrics: z.string().min(1).optional(),
    instrumental: z.boolean().default(true), ...files,
}).strict().superRefine((v, ctx) => {
    if (v.instrumental && v.lyrics)
        ctx.addIssue({ code: 'custom', message: 'Instrumental music cannot include lyrics' });
});
const chunk = z.object({
    text: z.string().max(6132), durationMs: z.number().int().min(3000).max(120000),
    positiveStyles: z.array(z.string().min(1)).max(50), negativeStyles: z.array(z.string().min(1)).max(50),
    contextAdherence: z.enum(['low', 'medium', 'high']).optional(),
}).strict().superRefine((v, ctx) => {
    const lines = v.text.split('\n');
    if (lines.length > 30 || lines.some(line => line.length > 200))
        ctx.addIssue({ code: 'custom', message: 'Each chunk allows 30 lines of at most 200 characters' });
});
export const elevenMusicSchema = z.object({
    modelId: z.enum(['music_v2', 'music_v2_5']).default('music_v2_5'),
    prompt: z.string().min(1).max(4100).optional(),
    compositionPlan: z.object({ chunks: z.array(chunk).min(1).max(30) }).strict().optional(),
    musicLengthMs: z.number().int().min(3000).max(600000).optional(),
    forceInstrumental: z.boolean().optional(), seed: z.number().int().min(0).max(2147483647).optional(),
    storeForInpainting: z.boolean().default(false), ...files,
}).strict().superRefine((v, ctx) => {
    if (!!v.prompt === !!v.compositionPlan)
        ctx.addIssue({ code: 'custom', message: 'Use exactly one of prompt or compositionPlan' });
    if (v.prompt && v.seed !== undefined)
        ctx.addIssue({ code: 'custom', message: 'seed requires compositionPlan' });
    if (v.compositionPlan && (v.musicLengthMs !== undefined || v.forceInstrumental !== undefined))
        ctx.addIssue({ code: 'custom', message: 'Length and forceInstrumental require prompt mode' });
    if (v.compositionPlan && v.compositionPlan.chunks.reduce((sum, c) => sum + c.durationMs, 0) > 600000)
        ctx.addIssue({ code: 'custom', message: 'Composition exceeds 10 minutes' });
});
export async function generateLyriaSong(raw) {
    const a = lyriaSongSchema.parse(raw);
    const input = a.prompt + (a.instrumental ? '\nInstrumental only, no vocals.' : '\nGenerate sung vocals.') + (a.lyrics ? '\nLyrics:\n' + a.lyrics : '');
    const client = new GoogleGenAI({ apiKey: requireGeminiKey() });
    const result = await client.interactions.create({ model: a.model, input }, { maxRetries: 0, timeout: 600000 });
    const blocks = (result.steps ?? []).flatMap(step => step.type === 'model_output' ? step.content ?? [] : []);
    const audio = blocks.find(b => b.type === 'audio' && b.data);
    if (!audio || audio.type !== 'audio' || !audio.data)
        throw new Error('Lyria returned no audio');
    if (audio.mime_type && !['audio/mp3', 'audio/mpeg'].includes(audio.mime_type))
        throw new Error('Unexpected Lyria audio format: ' + audio.mime_type);
    return { audioPath: saveAudioFile(a.outputPath || process.cwd(), a.filename || 'music.mp3', Buffer.from(audio.data, 'base64')),
        providerId: result.id, model: a.model, lyrics: blocks.filter(b => b.type === 'text').map(b => b.text).join('\n') };
}
export async function generateElevenMusic(raw) {
    const { outputPath, filename, ...a } = elevenMusicSchema.parse(raw);
    const body = {
        model_id: a.modelId, prompt: a.prompt, music_length_ms: a.musicLengthMs,
        force_instrumental: a.forceInstrumental, seed: a.seed, store_for_inpainting: a.storeForInpainting,
        composition_plan: a.compositionPlan ? { chunks: a.compositionPlan.chunks.map(c => ({
                text: c.text, duration_ms: c.durationMs, positive_styles: c.positiveStyles,
                negative_styles: c.negativeStyles, context_adherence: c.contextAdherence,
            })) } : undefined,
    };
    const response = await fetch(`${elevenLabsBaseUrl()}/v1/music?output_format=mp3_48000_192`, {
        method: 'POST', headers: { 'xi-api-key': requireElevenLabsKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(600000),
    });
    if (!response.ok)
        throw new Error(`Eleven Music HTTP ${response.status}: ${(await response.text()).slice(0, 1200)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length)
        throw new Error('Eleven Music returned empty audio');
    return { audioPath: saveAudioFile(outputPath || process.cwd(), filename || 'music.mp3', bytes),
        providerId: response.headers.get('song-id'), model: body.model_id };
}
