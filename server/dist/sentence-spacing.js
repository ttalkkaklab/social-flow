/**
 * Fixed sentence pauses for a checked ElevenLabs take.
 *
 * The vendor reads sentences back to back — measured 0.04–0.19 s of quiet between sentences on
 * pundago ep10 (2026-08-31) — so the builder's silencedetect (-37 dB, 0.16 s) misses the boundary,
 * the reveal has no pause to fade inside, and the subtitle cue lands late. The take's own
 * alignment (per-character seconds) says exactly where every sentence ends and the next one
 * starts, so this module cuts the short natural gap and lays digital silence in its place:
 * one fixed pause between sentences, a fixed lead before the first word, and a sidecar the
 * builder reads to pick the right pause without guessing. Not one speech sample is touched.
 */
import { pcmToWav } from './media-utils.js';
export const SPACING_POLICY = 'sentence-spacing-v1';
export const SPACING_DEFAULTS = {
    rateCap: 6.0,
    maxPause: 1.0,
    /** Silence before the first word. The builder keeps 0.10 s of lead, so every card gets the same. */
    lead: 0.14,
    /** Speech kept after a sentence's last letter before the cut — the natural release of the word. */
    tail: 0.12,
    /** Speech kept before the next sentence's first letter — the onset the aligner does not count. */
    head: 0.03,
    /** Linear fade on either side of a cut (seconds). */
    fade: 0.012,
};
/** Walks the RIFF chunk list (the vendor's WAV carries LIST before data) and returns 16-bit PCM. */
export function parseWav(buffer) {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE')
        throw new Error('Not a RIFF/WAVE file');
    let sampleRate = 0, channels = 0, bitsPerSample = 0, format = 0, offset = 12;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === 'fmt ' && body + 16 <= buffer.length) {
            format = buffer.readUInt16LE(body);
            channels = buffer.readUInt16LE(body + 2);
            sampleRate = buffer.readUInt32LE(body + 4);
            bitsPerSample = buffer.readUInt16LE(body + 14);
        }
        else if (id === 'data') {
            if (format !== 1 || bitsPerSample !== 16)
                throw new Error(`Only 16-bit PCM WAV is supported (format ${format}, ${bitsPerSample} bit)`);
            if (channels !== 1)
                throw new Error(`Only mono WAV is supported (${channels} channels)`);
            const end = Math.min(body + size, buffer.length);
            return { sampleRate, channels, bitsPerSample, pcm: buffer.subarray(body, end - ((end - body) & 1)) };
        }
        offset = body + size + (size & 1);
    }
    throw new Error('WAV has no data chunk');
}
const isLetter = (c) => /[\p{L}\p{N}]/u.test(c);
/** Sentences of a script: split after sentence-final punctuation, the punctuation staying with its sentence. */
export function splitSentences(text) {
    return text.split(/(?<=[.?!…]+)\s+/u).map(s => s.trim()).filter(Boolean);
}
/**
 * Finds each segment's letters, in order, inside the alignment's character list. Punctuation,
 * spaces and acting tags are skipped on both sides, so a segment matches however the scene text
 * was joined; a letter that never turns up means the segments are not this take's script.
 */
export function locateSegments(alignment, segments) {
    const chars = alignment.characters, starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
    if (!Array.isArray(chars) || chars.length !== starts.length || chars.length !== ends.length)
        throw new Error('Alignment arrays differ in length');
    let i = 0;
    const out = [];
    for (const [n, segment] of segments.entries()) {
        const letters = [...segment.replace(/\[[^\]]*\]/g, '')].filter(isLetter);
        if (!letters.length)
            throw new Error(`Segment ${n + 1} has no letters`);
        let first = -1, last = -1;
        for (const letter of letters) {
            while (i < chars.length && chars[i] !== letter) {
                // An acting tag the vendor echoed into the alignment ("[whispers]") is not spoken text: skip it whole.
                if (chars[i] === '[') {
                    const close = chars.indexOf(']', i);
                    if (close > i) {
                        i = close + 1;
                        continue;
                    }
                }
                if (isLetter(chars[i]))
                    throw new Error(`Segment ${n + 1} (${segment.slice(0, 20)}…) does not follow the take's text at character ${i}`);
                i++;
            }
            if (i >= chars.length)
                throw new Error(`Segment ${n + 1} (${segment.slice(0, 20)}…) runs past the end of the alignment`);
            if (first < 0)
                first = i;
            last = i;
            i++;
        }
        out.push({ text: segment, chars: letters.length, first, last, start: starts[first], end: ends[last] });
    }
    for (let j = i; j < chars.length; j++) {
        if (chars[j] === '[') {
            const close = chars.indexOf(']', j);
            if (close > j) {
                j = close;
                continue;
            }
        }
        if (isLetter(chars[j]))
            throw new Error('The take speaks more text than the segments cover');
    }
    return out;
}
/** The pause after each sentence but the last: the fixed pause, stretched only when the cue would read too fast. */
export function planGaps(segments, options) {
    const rateCap = options.rateCap ?? SPACING_DEFAULTS.rateCap, maxPause = Math.max(options.pause, options.maxPause ?? SPACING_DEFAULTS.maxPause);
    return segments.slice(0, -1).map(s => {
        const spoken = s.end - s.start;
        // The cue runs from this sentence's first word to the next sentence's first word, then plays
        // playbackSpeed times faster — so the gap has to cover chars × speed / cap minus the speech.
        const needed = (s.chars * options.playbackSpeed) / rateCap - spoken;
        return Math.min(maxPause, Math.max(options.pause, needed));
    });
}
/**
 * Re-spaces one take. Returns a new WAV, the alignment shifted to it, and the sentence table.
 * Speech samples are copied verbatim; only silence is added and the short natural gaps replaced.
 */
export function respace(wavBuffer, alignment, segments, options) {
    const { sampleRate, pcm } = parseWav(wavBuffer);
    const total = pcm.length / 2;
    const toSample = (seconds) => Math.min(total, Math.max(0, Math.round(seconds * sampleRate)));
    const located = locateSegments(alignment, segments);
    const gaps = planGaps(located, options);
    const lead = SPACING_DEFAULTS.lead, tail = SPACING_DEFAULTS.tail, head = SPACING_DEFAULTS.head;
    const fadeN = Math.max(1, Math.round(SPACING_DEFAULTS.fade * sampleRate));
    const pieces = [];
    const cuts = [];
    const fade = SPACING_DEFAULTS.fade;
    const slice = (fromSample, toSampleExclusive, fadeIn, fadeOut) => {
        const out = Buffer.from(pcm.subarray(fromSample * 2, toSampleExclusive * 2));
        const n = out.length / 2;
        if (fadeIn)
            for (let k = 0; k < Math.min(fadeN, n); k++)
                out.writeInt16LE(Math.round(out.readInt16LE(k * 2) * (k / fadeN)), k * 2);
        if (fadeOut)
            for (let k = 0; k < Math.min(fadeN, n); k++) {
                const idx = n - 1 - k;
                out.writeInt16LE(Math.round(out.readInt16LE(idx * 2) * (k / fadeN)), idx * 2);
            }
        return out;
    };
    const silence = (seconds) => Buffer.alloc(Math.round(seconds * sampleRate) * 2);
    // Lead: a fixed run of silence, then the take from just before its first letter.
    const s0 = Math.max(0, located[0].start - head);
    pieces.push(silence(lead));
    let cursor = toSample(s0);
    // The first slice starts inside the lead's quiet; a later slice starts where the previous cut fell.
    let fadeInNext = true;
    const inserted = [];
    for (let k = 0; k < located.length - 1; k++) {
        const natural = located[k + 1].start - located[k].end;
        const target = gaps[k];
        if (natural >= target) {
            inserted.push(0);
            continue;
        }
        // Cut after the word's release but never inside the next sentence's onset: the aligner
        // marks a letter late, so `head` of the natural gap stays in front of it. A gap shorter
        // than `head` keeps all of it (the cut sits on this sentence's last letter).
        const cutAt = Math.max(located[k].end, Math.min(located[k].end + tail, located[k + 1].start - head));
        const add = target - natural;
        const cutSample = toSample(cutAt);
        // This slice ends before inserted silence: fade its tail. Its head was decided at the previous cut.
        pieces.push(slice(cursor, cutSample, fadeInNext, true));
        pieces.push(silence(add));
        cuts.push({ atInput: cutAt, insertedSeconds: add });
        inserted.push(add);
        cursor = cutSample;
        // The next slice may fade in only where the fade would land on the natural gap, never on a letter.
        fadeInNext = located[k + 1].start - cutAt >= fade;
    }
    pieces.push(slice(cursor, total, fadeInNext, false));
    const outPcm = Buffer.concat(pieces);
    const duration = outPcm.length / 2 / sampleRate;
    // A start time on the cut belongs after the inserted silence (the next sentence's first letter);
    // an end time on the cut belongs before it (this sentence's last letter, when the gap was shorter than head).
    const shift = (t, isEnd = false) => {
        let o = lead - s0;
        for (const c of cuts)
            if (isEnd ? t > c.atInput + 1e-6 : t >= c.atInput - 1e-6)
                o += c.insertedSeconds;
        return Math.max(0, Math.round((t + o) * 1000) / 1000);
    };
    const shifted = {
        characters: [...alignment.characters],
        character_start_times_seconds: alignment.character_start_times_seconds.map(t => shift(t)),
        character_end_times_seconds: alignment.character_end_times_seconds.map(t => shift(t, true)),
    };
    const sentences = located.map(s => ({ text: s.text, chars: s.chars, start: shift(s.start), end: shift(s.end, true) }));
    return {
        wav: pcmToWav(outPcm, sampleRate, 1),
        alignment: shifted,
        sentences,
        boundaries: sentences.slice(1).map(s => s.start),
        gaps: gaps.map(g => Math.round(g * 1000) / 1000),
        inserted: inserted.map(g => Math.round(g * 1000) / 1000),
        lead,
        duration: Math.round(duration * 1000) / 1000,
    };
}
