/** Shared execution boundary for raw tools, auditions and the common speech router. */
import { astraGenaiBaseUrl, requireAstraGenaiKey } from './astra-genai-client.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { disabledToolPatterns, disabledToolsFile, requireElevenLabsKey, requireGeminiKey } from './config.js';
import { resolveToolGate } from './tool-gate.js';
import { resolveTtsModel } from './tts-models.js';
import { validateFilePath } from './media-utils.js';
import { validateSpeechAudio } from './tts-audio.js';
const executionId = new AsyncLocalStorage();
export function withSpeechRequestId(id, run) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id))
        throw new Error('Invalid speech requestId');
    return executionId.run(id, run);
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
function canonical(value) {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
    return JSON.stringify(value);
}
function writeReceipt(file, value) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporary, file);
}
function lock(directory) {
    try {
        mkdirSync(directory);
    }
    catch {
        throw new Error(`Speech execution is busy or interrupted: ${directory}. Inspect its receipt before retrying; locks are never stolen.`);
    }
    return () => rmSync(directory, { recursive: true, force: true });
}
/** Per-user, per-provider-key directory of concurrency slots, one subdirectory per running request. */
export function speechSlotsDir(provider, key) {
    return join(tmpdir(), `social-flow-tts-${process.getuid?.() ?? 'user'}-${digest(provider + key).slice(0, 24)}`);
}
/**
 * A slot whose owner is gone — killed before its finally block ran — would block that provider
 * key forever. The owner's pid is written inside the slot; a slot with no readable pid (killed
 * between mkdir and write) counts as stale only after a minute.
 * ponytail: a recycled pid keeps a dead slot held until that process exits; add a start-time check if that shows up.
 */
function staleSlot(slot) {
    try {
        const pid = Number(readFileSync(join(slot, 'pid'), 'utf8'));
        if (!Number.isInteger(pid) || pid <= 0)
            throw new Error('unreadable pid');
        try {
            process.kill(pid, 0);
            return false;
        }
        catch (error) {
            return error.code === 'ESRCH';
        }
    }
    catch {
        try {
            return Date.now() - statSync(slot).mtimeMs > 60_000;
        }
        catch {
            return false;
        }
    }
}
export async function executeSpeech(generator, args, run) {
    const provider = generator === 'tts_astra_genai' ? 'astra-genai' : generator.startsWith('tts_elevenlabs_') ? 'elevenlabs' : 'gemini';
    const contract = resolveTtsModel(provider, String(args.model));
    if (![contract.single, contract.dialogue].includes(generator))
        throw new Error('Generator does not implement selected TTS model');
    const gate = resolveToolGate(generator, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
    if (!gate.enabled)
        throw new Error(`Selected speech generator is disabled: ${gate.reason}`);
    const key = provider === 'astra-genai' ? requireAstraGenaiKey() : provider === 'gemini' ? requireGeminiKey() : requireElevenLabsKey();
    const id = executionId.getStore() || randomUUID();
    const outputPath = resolve(String(args.outputPath || process.cwd()));
    const extension = String(args.outputFormat || 'wav').startsWith('mp3') ? 'mp3' : 'wav';
    const filename = String(args.filename || `${generator}_${id}.${extension}`);
    if (/[/\\]/.test(filename))
        throw new Error('Speech filename must be a bare filename');
    validateFilePath(filename, { allowedExtensions: ['.' + extension] });
    mkdirSync(outputPath, { recursive: true });
    accessSync(outputPath, constants.W_OK);
    const directory = realpathSync(outputPath), audioPath = join(directory, filename);
    // Resolve aliases before locking; two symlinked directories must share one output lock.
    const stem = audioPath.slice(0, -extname(audioPath).length);
    for (const file of [audioPath, stem + '.alignment.json', audioPath + '.provider-usage.json']) {
        try {
            if (lstatSync(file).isSymbolicLink())
                throw new Error('Speech output must not be a symlink');
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    const runs = join(directory, '.speech-runs');
    mkdirSync(runs, { recursive: true });
    const receiptPath = join(runs, id + '.json');
    const fingerprint = digest(canonical({ generator, ...(provider === 'astra-genai' ? { baseUrl: astraGenaiBaseUrl() } : {}), args: { ...args, outputPath: directory } }));
    const releaseRequest = lock(join(runs, id + '.lock'));
    let releaseOutput, releaseSlot;
    try {
        if (existsSync(receiptPath)) {
            const prior = JSON.parse(readFileSync(receiptPath, 'utf8'));
            if (prior.fingerprint !== fingerprint)
                throw new Error('Speech requestId was already used with different arguments');
            if (prior.status !== 'completed')
                throw new Error('Speech request outcome is uncertain or failed; inspect receipt before a new explicit requestId');
            if (digest(readFileSync(prior.result.audioPath)) !== prior.audioSha256)
                throw new Error('Recorded speech audio changed or is missing');
            for (const artifact of prior.artifacts || []) {
                if (digest(readFileSync(artifact.path)) !== artifact.sha256)
                    throw new Error('Recorded speech sidecar changed or is missing');
            }
            return { ...prior.result, receiptPath, review: 'not_reviewed', replayed: true };
        }
        releaseOutput = lock(stem + '.speech-lock');
        if (provider === 'astra-genai' && existsSync(audioPath))
            throw new Error('Speech output already exists; recover its original requestId before new generation');
        const limit = Number(process.env.SOCIAL_FLOW_TTS_MAX_CONCURRENCY || 2);
        if (!Number.isInteger(limit) || limit < 1 || limit > 32)
            throw new Error('SOCIAL_FLOW_TTS_MAX_CONCURRENCY must be an integer from 1 to 32');
        const slots = speechSlotsDir(provider, key);
        mkdirSync(slots, { recursive: true });
        for (let i = 0; i < limit && !releaseSlot; i++) {
            const slot = join(slots, String(i));
            for (const retry of [false, true]) {
                try {
                    mkdirSync(slot);
                    writeFileSync(join(slot, 'pid'), String(process.pid));
                    releaseSlot = () => rmSync(slot, { recursive: true, force: true });
                    break;
                }
                catch (error) {
                    if (error.code !== 'EEXIST')
                        throw error;
                    if (retry || !staleSlot(slot))
                        break;
                    rmSync(slot, { recursive: true, force: true });
                }
            }
        }
        if (!releaseSlot)
            throw new Error(`Speech provider concurrency limit reached; no request submitted. Slots held by live processes: ${slots}`);
        const record = { version: 1, requestId: id, generator, provider, model: args.model, fingerprint,
            generation: args, startedAt: new Date().toISOString(), review: 'not_reviewed', attempts: 1,
            billingStatus: 'not_an_invoice' };
        writeReceipt(receiptPath, { ...record, status: 'submitting' });
        try {
            const result = await run({ outputPath, filename });
            if (!result.success || !result.audioPath)
                throw new Error(result.error || 'Speech provider returned no audio');
            if (realpathSync(result.audioPath) !== audioPath)
                throw new Error('Speech provider returned an unexpected output path');
            const bytes = readFileSync(audioPath);
            const durationSeconds = validateSpeechAudio(bytes, extname(audioPath).slice(1));
            const artifacts = ['alignmentPath', 'usageReceiptPath'].flatMap(field => {
                const file = result[field];
                if (typeof file !== 'string')
                    return [];
                return [{ path: file, sha256: digest(readFileSync(file)) }];
            });
            const completed = { ...result, receiptPath, attempts: 1, review: 'not_reviewed' };
            writeReceipt(receiptPath, { ...record, status: 'completed', artifacts, audioSha256: digest(bytes), durationSeconds, result: completed });
            return completed;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A failed response does not prove that the provider did not bill the submission.
            writeReceipt(receiptPath, { ...record, status: 'uncertain', error: message });
            return { success: false, error: message, receiptPath, attempts: 1, review: 'not_reviewed' };
        }
    }
    finally {
        releaseSlot?.();
        releaseOutput?.();
        releaseRequest();
    }
}
