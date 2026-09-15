/**
 * A character alignment for a take whose engine returns none.
 *
 * ElevenLabs hands back per-character seconds, and the sentence spacing (sentence-spacing.ts)
 * reads them to find where each sentence ends and the next begins. Supertonic, Gemini and the
 * mlx lane return only audio, so their takes used to skip the spacing and the builder fell back
 * to silence detection — which picks a comma pause over a period when the comma pauses longer.
 * The local forced aligner (mlx-qwen3-asr --timestamps) gives word spans for any WAV; this
 * module turns those into the same per-character table, so every engine gets the same fixed
 * sentence pauses and the same `<wav>.sentences.json` the builder cues from.
 *
 * The aligner's words are its own transcript, not the script — a misheard syllable ("활을" →
 * "화를") must not break the table. Script letters are matched to transcript letters by edit
 * distance; a matched letter takes the transcript's time, an unmatched one is interpolated
 * between its neighbours. Sentence boundaries only need the first and last letter of each
 * sentence, and those are almost always matched.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { qwen3AsrTranscribeSchema, transcribeLocal } from './qwen3-asr-client.js';
const isLetter = (c) => /[\p{L}\p{N}]/u.test(c);
/** Every letter of the transcript with its word's span spread evenly across the word. */
export function transcriptLetters(words) {
    const out = [];
    for (const word of words) {
        const letters = [...word.text].filter(isLetter);
        if (!letters.length)
            continue;
        const step = Math.max(0, word.end - word.start) / letters.length;
        letters.forEach((char, i) => out.push({ char, start: word.start + i * step, end: word.start + (i + 1) * step }));
    }
    return out;
}
/**
 * Levenshtein alignment of script letters to transcript letters. Returns, per script letter,
 * the transcript letter it matched (equal character) or -1.
 */
export function matchLetters(script, heard) {
    const n = script.length, m = heard.length;
    if (!n || !m)
        return script.map(() => -1);
    // Full DP table: a scene is a few hundred letters, so n×m stays small.
    const dp = [];
    for (let i = 0; i <= n; i++) {
        dp.push(new Int32Array(m + 1));
        dp[i][0] = i;
    }
    for (let j = 0; j <= m; j++)
        dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (script[i - 1] === heard[j - 1] ? 0 : 1));
        }
    }
    const matched = new Array(n).fill(-1);
    let i = n, j = m;
    while (i > 0 && j > 0) {
        const same = script[i - 1] === heard[j - 1];
        if (dp[i][j] === dp[i - 1][j - 1] + (same ? 0 : 1)) {
            if (same)
                matched[i - 1] = j - 1;
            i--;
            j--;
        }
        else if (dp[i][j] === dp[i - 1][j] + 1)
            i--;
        else
            j--;
    }
    return matched;
}
/**
 * The per-character table for `text` in the take's timeline. Non-letters take their left
 * neighbour's end (the spacing code skips them); an unmatched letter is interpolated between
 * the nearest matched letters, and the table is monotone by construction.
 */
export function alignmentFromWords(text, words) {
    const chars = [...text];
    const letterIdx = chars.map((c, i) => (isLetter(c) ? i : -1)).filter(i => i >= 0);
    const heard = transcriptLetters(words);
    const matched = matchLetters(letterIdx.map(i => chars[i]), heard.map(h => h.char));
    const starts = new Array(chars.length).fill(NaN), ends = new Array(chars.length).fill(NaN);
    let count = 0;
    matched.forEach((h, k) => { if (h >= 0) {
        starts[letterIdx[k]] = heard[h].start;
        ends[letterIdx[k]] = heard[h].end;
        count++;
    } });
    if (!count)
        throw new Error('No script letter matched the transcript');
    // Interpolate unmatched letters between their matched neighbours (edges extend the nearest match).
    let prev = -1;
    for (let k = 0; k <= letterIdx.length; k++) {
        const known = k < letterIdx.length && matched[k] >= 0;
        if (!known && k < letterIdx.length)
            continue;
        const from = prev, to = k < letterIdx.length ? k : letterIdx.length;
        const gapCount = to - from - 1;
        if (gapCount > 0) {
            const t0 = from >= 0 ? ends[letterIdx[from]] : starts[letterIdx[to]];
            const t1 = to < letterIdx.length ? starts[letterIdx[to]] : ends[letterIdx[from]];
            const step = (t1 - t0) / gapCount;
            for (let g = 1; g <= gapCount; g++) {
                const i = letterIdx[from + g];
                starts[i] = t0 + (g - 1) * step;
                ends[i] = t0 + g * step;
            }
        }
        prev = k;
    }
    let cursor = 0;
    for (let i = 0; i < chars.length; i++) {
        if (Number.isNaN(starts[i])) {
            starts[i] = cursor;
            ends[i] = cursor;
        }
        else {
            starts[i] = Math.max(cursor, starts[i]);
            ends[i] = Math.max(starts[i], ends[i]);
            cursor = ends[i];
        }
    }
    const round = (t) => Math.round(t * 1000) / 1000;
    return { alignment: { characters: chars, character_start_times_seconds: starts.map(round), character_end_times_seconds: ends.map(round) }, matched: count, letters: letterIdx.length };
}
/**
 * Runs the local aligner on the WAV and returns the table for `text`. The transcript JSON goes
 * to a scratch directory and is removed; the caller stores what it keeps.
 */
export async function alignmentFromAsr(wav, text, language) {
    if (!existsSync(wav))
        throw new Error(`No WAV at ${wav}`);
    const scratch = mkdtempSync(path.join(tmpdir(), 'asr-align-'));
    try {
        const result = await transcribeLocal(qwen3AsrTranscribeSchema.parse({ audioPath: wav, language, timestamps: true, outputPath: scratch, filename: 'align.json' }));
        if (!result.success || !result.segments?.length)
            throw new Error(result.error || 'The aligner returned no words');
        return { ...alignmentFromWords(text, result.segments), transcript: result.text || '' };
    }
    finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}
