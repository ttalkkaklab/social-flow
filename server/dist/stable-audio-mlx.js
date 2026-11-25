import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { readMusicMetadata } from './music-media.js';
export const STABLE_AUDIO_MEDIUM = 'stabilityai/stable-audio-3-medium';
const run = promisify(execFile);
export const stableAudioSchema = z.object({
    model: z.literal(STABLE_AUDIO_MEDIUM).default(STABLE_AUDIO_MEDIUM),
    prompt: z.string().describe('English music description. An empty string selects unconditional generation.'),
    durationSeconds: z.number().min(1 / 44100).max(380).default(30).describe('Output length in seconds, rounded to a 44.1 kHz sample.'),
    steps: z.number().int().positive().default(8).describe('Pingpong sampling steps. The model was distilled for eight.'),
    seed: z.number().int().nonnegative().safe().optional().describe('Sampling seed. Omit for a random seed.'),
    cfg: z.number().finite().default(1).describe('Classifier-free guidance scale. 1 disables the negative branch.'),
    negativePrompt: z.string().optional().describe('Negative conditioning text. Requires cfg other than 1.'),
    apg: z.number().min(0).max(1).optional().describe('Adaptive projected guidance strength, used when cfg differs from 1.'),
    initAudioPath: z.string().min(1).optional().describe('Source audio for variation or inpainting. Relative to the plan directory.'),
    initNoiseLevel: z.number().finite().min(0.01).optional().describe('Initial noise level. The CLI defaults to 1. For variations try 0.4 to 0.8.'),
    inpaintRange: z.tuple([z.number().nonnegative(), z.number().positive()]).optional().describe('Start and end seconds within the output. Requires initAudioPath.'),
    outputPath: z.string().optional().describe('Output directory for the WAV.'),
    filename: bareFilenameSchema('audio').refine(name => name.toLowerCase().endsWith('.wav'), 'Expected a WAV filename').optional(),
}).strict().superRefine((args, ctx) => {
    if (args.cfg === 1 && (args.negativePrompt !== undefined || args.apg !== undefined))
        ctx.addIssue({ code: 'custom', message: 'negativePrompt and apg require cfg other than 1' });
    if (args.inpaintRange) {
        const [start, end] = args.inpaintRange;
        if (!args.initAudioPath || start >= end || end > args.durationSeconds)
            ctx.addIssue({ code: 'custom', message: 'inpaintRange requires initAudioPath and 0 <= start < end <= durationSeconds' });
    }
});
export function stableAudioRuntime(needsEncoder = false) {
    const configFile = join(homedir(), '.config/social-flow/stable-audio-mlx.json');
    const dir = process.env.STABLE_AUDIO_MLX_DIR ||
        (existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')).directory : undefined);
    if (typeof dir !== 'string' || !isAbsolute(dir))
        throw new Error('Set STABLE_AUDIO_MLX_DIR or the directory in ' + configFile + ' to the absolute optimized/mlx directory');
    const python = join(dir, '.venv/bin/python');
    const script = join(dir, 'scripts/sa3_mlx.py');
    const weights = ['dit_medium_f16.npz', 'same_l_decoder_f32.npz', 't5gemma_f16.npz'];
    if (needsEncoder)
        weights.push('same_l_encoder_f32.npz');
    try {
        accessSync(python, constants.X_OK);
        for (const file of [script, ...weights.map(name => join(dir, 'models/mlx', name))]) {
            if (!statSync(file).isFile())
                throw new Error('Expected a file at ' + file);
            accessSync(file, constants.R_OK);
        }
    }
    catch (error) {
        throw new Error('Stable Audio 3 Medium requires an installed optimized/mlx directory (STABLE_AUDIO_MLX_DIR): ' + String(error));
    }
    return { dir, python, script };
}
export async function generateStableAudio(input) {
    const args = stableAudioSchema.parse(input);
    const runtime = stableAudioRuntime(!!args.initAudioPath);
    const audioPath = resolveOutputFile(args.outputPath || process.cwd(), args.filename ?? `stable_audio_${randomUUID()}.wav`, 'audio');
    const scratch = mkdtempSync(join(dirname(audioPath), '.sa3-'));
    const raw = join(scratch, 'output.wav');
    const seed = args.seed ?? randomInt(2 ** 31);
    const argv = [runtime.script, '--dit', 'medium', '--decoder', 'same-l', '--prompt=' + args.prompt,
        '--seconds', String(args.durationSeconds), '--steps', String(args.steps), '--seed', String(seed),
        '--cfg=' + args.cfg, '--out', raw];
    if (args.negativePrompt !== undefined)
        argv.push('--negative-prompt=' + args.negativePrompt);
    if (args.apg !== undefined)
        argv.push('--apg', String(args.apg));
    if (args.initAudioPath)
        argv.push('--init-audio', resolve(args.initAudioPath));
    if (args.initNoiseLevel !== undefined)
        argv.push('--init-noise-level', String(args.initNoiseLevel));
    if (args.inpaintRange)
        argv.push('--inpaint-range', args.inpaintRange.join(','));
    try {
        await run(runtime.python, argv, { cwd: runtime.dir, env: { ...process.env, HF_HUB_OFFLINE: '1' }, timeout: 30 * 60_000 });
        const output = readMusicMetadata(raw);
        linkSync(raw, audioPath);
        return { ...output, audioPath, model: args.model, seed };
    }
    finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}
