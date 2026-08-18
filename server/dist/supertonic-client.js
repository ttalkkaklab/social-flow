/**
 * Supertonic 3 on-device TTS client — invokes a local Python runtime as a subprocess.
 *
 * The **second speech path**, sitting alongside Gemini TTS (tts-client.ts). Network,
 * API key, and quota all drop out; in exchange, a local Python runtime and 385MB of
 * weights are required.
 *
 * Division of labor between the two paths (per the 2026-08-11 field study —
 * docs/research/2026-08-11-local-tts-and-commercial-api):
 *   - Narration body        → this one. 6.3x real-time on CPU alone, zero cost per episode
 *   - Emotionally acted read → tts_generate (Gemini). Only that side takes acting direction via stylePrompt
 *
 * ## Why a subprocess
 *
 * Supertonic is an ONNX Runtime-based Python package with no Node bindings. The
 * measured fixed overhead is ~1.8s interpreter startup + 0.12s import + 0.52s
 * model load, so spawning a fresh process per call still lands at 2~3s per scene.
 * A resident worker or HTTP server would cut that overhead to once, but takes on
 * lifecycle management and port contention (this repo assumes multiple concurrent
 * sessions) — until the need is proven by measurement, a stateless subprocess is
 * the right call.
 *
 * ## Why an inline snippet instead of the CLI
 *
 * The `supertonic tts` CLI does the same synthesis, but it prints human-oriented
 * progress messages to stdout and **doesn't return the audio duration**. The
 * produce pipeline checks duration per scene, so that would mean an extra ffprobe
 * run. Calling via the snippet yields the synthesis result as a single JSON line —
 * parsing is sturdy and the duration comes for free.
 *
 * Not keeping the snippet in a separate .py file is also deliberate — because of
 * `files: ["dist"]` in package.json, loose files don't ship in the npm package,
 * producing a setup that works locally and breaks in the installed copy.
 */
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { supertonicPython } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
/**
 * The 10 built-in voices.
 *
 * Unlike TTS_VOICES on the Gemini side, **no character labels are attached** — the
 * vendor published no trait table, so descriptions like "calm" or "bright" would
 * be made up. Exposing the fact that the names mean only gender and a number is
 * the honest move, and once the channel profile assigns one there's no picking
 * to do anyway.
 */
export const SUPERTONIC_VOICE_NAMES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
/** Matches the upstream CLI default — the same arguments producing different results would surprise. */
export const DEFAULT_SUPERTONIC_VOICE = 'M1';
/**
 * The 31 languages supported by supertonic-3, plus the no-language fallback `na`.
 *
 * The upstream default is `na`, but this server **defaults to `ko`.** The Korean
 * channel pipeline is the main use, and `ko` must be explicit for the shorter
 * Korean chunk length (120 chars) to apply — leaving it at `na` gets the 300-char
 * chunking, which mangles sentences.
 */
export const SUPERTONIC_LANGUAGES = [
    'ko', 'en', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
    'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na',
];
export const DEFAULT_SUPERTONIC_LANGUAGE = 'ko';
/** Upstream defaults (config.py) — changing them here makes the tone diverge from CLI-produced audio. */
export const DEFAULT_SUPERTONIC_SPEED = 1.05;
export const DEFAULT_SUPERTONIC_STEPS = 8;
/** Fixed output spec — Gemini TTS is 24kHz, so mixing the two in one video breaks concatenation. */
export const SUPERTONIC_SAMPLE_RATE = 44_100;
/**
 * Input cap.
 *
 * The model itself takes up to 100k characters and chunks internally, but we use
 * the same line as the Gemini side (16,000 chars) — one scene's narration is a few
 * hundred characters, and anything longer is usually a script that wasn't split
 * into scenes. Differing caps would bite when swapping one path for the other.
 */
export const MAX_SUPERTONIC_INPUT_CHARS = 16_000;
/**
 * Subprocess timeout.
 *
 * 6x real-time is the measured figure, but it swings hard with machine load (we
 * saw it drop to 1.1x at load 21). 60s of startup slack plus 60ms per character,
 * cut off at 15 minutes.
 */
function timeoutFor(textLength) {
    return Math.min(15 * 60_000, 60_000 + textLength * 60);
}
// ── Request schema ───────────────────────────────────────────────
export const supertonicGenerateSchema = z.object({
    text: z
        .string()
        .min(1, 'Text is required')
        .max(MAX_SUPERTONIC_INPUT_CHARS, `Text exceeds ${MAX_SUPERTONIC_INPUT_CHARS} characters; split the script by scene`),
    voice: z.enum(SUPERTONIC_VOICE_NAMES).optional().default(DEFAULT_SUPERTONIC_VOICE),
    lang: z.enum(SUPERTONIC_LANGUAGES).optional().default(DEFAULT_SUPERTONIC_LANGUAGE),
    speed: z.number().min(0.7).max(2.0).optional().default(DEFAULT_SUPERTONIC_SPEED),
    steps: z.number().int().min(1).max(100).optional().default(DEFAULT_SUPERTONIC_STEPS),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
// ── Python snippet ───────────────────────────────────────────────
/**
 * The synthesis snippet.
 *
 * Arguments go through argv — interpolating the text into the code would let
 * quotes, newlines, and backslashes become Python source verbatim, which breaks,
 * or at worst becomes arbitrary code.
 *
 * `synthesize` returns `(wav, duration_array)`, and since both elements are
 * ndarrays it's easy to misread the second as a sample rate. We compute the
 * duration directly from the sample count to remove that trap.
 */
const SYNTH_SNIPPET = `
import json, sys, time
args = json.loads(sys.argv[1])
try:
    import numpy as np
    from supertonic import TTS
except ImportError as e:
    print(json.dumps({"ok": False, "kind": "missing_package", "error": str(e)}))
    sys.exit(0)

t0 = time.time()
try:
    tts = TTS(model="supertonic-3")
    style = tts.get_voice_style(args["voice"])
    wav, _ = tts.synthesize(
        args["text"], voice_style=style, lang=args["lang"],
        speed=args["speed"], total_steps=args["steps"],
    )
    tts.save_audio(wav, args["out"])
    samples = int(np.asarray(wav).reshape(-1).size)
    print(json.dumps({
        "ok": True, "samples": samples,
        "duration": round(samples / 44100.0, 3),
        "elapsed": round(time.time() - t0, 2),
    }))
except Exception as e:
    print(json.dumps({"ok": False, "kind": "synthesis", "error": f"{type(e).__name__}: {e}"}))
`;
/** Turn a Python execution failure into guidance the user can act on. */
function installHint(detail) {
    return (`${detail}\n\n` +
        `Local TTS requires a Python runtime and the Supertonic package:\n` +
        `  pip install supertonic\n` +
        `If it's installed in a virtualenv, point SUPERTONIC_PYTHON at that interpreter ` +
        `(e.g. SUPERTONIC_PYTHON=/path/to/.venv/bin/python).\n` +
        `The first call downloads 385MB of weights to ~/.cache/supertonic3 (about 24s).\n` +
        `Until it's installed, use tts_generate (Gemini TTS) — that one only needs an API key.`);
}
// ── Synthesis ────────────────────────────────────────────────────
/** Single-speaker local synthesis — narration, voiceover */
export async function generateLocalSpeech(request) {
    const python = supertonicPython();
    const outFile = resolveOutputFile(request.outputPath || process.cwd(), request.filename || `supertonic_${Date.now()}.wav`, 'audio');
    const payload = JSON.stringify({
        text: request.text,
        voice: request.voice,
        lang: request.lang,
        speed: request.speed,
        steps: request.steps,
        out: outFile,
    });
    console.error(`[Supertonic] Synthesizing locally... (voice: ${request.voice}, lang: ${request.lang}, ${request.text.length} chars)`);
    let stdout;
    try {
        stdout = await new Promise((resolve, reject) => {
            execFile(python, ['-c', SYNTH_SNIPPET, payload], { timeout: timeoutFor(request.text.length), maxBuffer: 1024 * 1024 }, (error, out, errOut) => {
                if (error) {
                    // ENOENT = the interpreter itself is missing. Anything else means Python
                    // died (the snippet swallows exceptions, so landing here usually means a
                    // timeout or a failure before the import stage).
                    const code = error.code;
                    if (code === 'ENOENT') {
                        reject(new Error(installHint(`Python interpreter not found: "${python}"`)));
                        return;
                    }
                    reject(new Error(installHint(`${error.message}\n${errOut.trim()}`.trim())));
                    return;
                }
                resolve(out);
            });
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Supertonic] Error: ${message.split('\n')[0]}`);
        return { success: false, error: message };
    }
    let result;
    try {
        result = JSON.parse(stdout.trim().split('\n').pop() || '');
    }
    catch {
        return { success: false, error: `Unexpected output from the local TTS runtime:\n${stdout.slice(0, 500)}` };
    }
    if (!result.ok) {
        const detail = result.error || 'unknown error';
        // Only a missing package gets the install guidance — stacking install steps
        // onto a synthesis failure buries the cause.
        return {
            success: false,
            error: result.kind === 'missing_package' ? installHint(detail) : detail,
        };
    }
    console.error(`[Supertonic] Audio saved to: ${outFile} (${result.duration}s in ${result.elapsed}s)`);
    return {
        success: true,
        audioPath: outFile,
        voice: request.voice,
        lang: request.lang,
        durationSeconds: result.duration,
        sampleRate: SUPERTONIC_SAMPLE_RATE,
        elapsedSeconds: result.elapsed,
    };
}
