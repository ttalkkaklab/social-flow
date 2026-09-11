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

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface SpacingOptions {
  /** Pause between sentences in the take's own timeline (seconds). */
  pause: number;
  /** The channel's playback factor (speedup.sh) — a cue must still read under rateCap after it. */
  playbackSpeed: number;
  /** Characters per second a subtitle cue may reach after playback (the ship gate is 6.2). */
  rateCap?: number;
  /** A gap is never stretched past this to satisfy rateCap (seconds). */
  maxPause?: number;
}

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

export interface ParsedWav { sampleRate: number; channels: number; bitsPerSample: number; pcm: Buffer }

/** Walks the RIFF chunk list (the vendor's WAV carries LIST before data) and returns 16-bit PCM. */
export function parseWav(buffer: Buffer): ParsedWav {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');
  let sampleRate = 0, channels = 0, bitsPerSample = 0, format = 0, offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buffer.length) {
      format = buffer.readUInt16LE(body); channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4); bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (format !== 1 || bitsPerSample !== 16) throw new Error(`Only 16-bit PCM WAV is supported (format ${format}, ${bitsPerSample} bit)`);
      if (channels !== 1) throw new Error(`Only mono WAV is supported (${channels} channels)`);
      const end = Math.min(body + size, buffer.length);
      return { sampleRate, channels, bitsPerSample, pcm: buffer.subarray(body, end - ((end - body) & 1)) };
    }
    offset = body + size + (size & 1);
  }
  throw new Error('WAV has no data chunk');
}

const isLetter = (c: string): boolean => /[\p{L}\p{N}]/u.test(c);

/** Sentences of a script: split after sentence-final punctuation, the punctuation staying with its sentence. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.?!…]+)\s+/u).map(s => s.trim()).filter(Boolean);
}

export interface LocatedSegment {
  text: string;
  /** Letters and digits — the count the builder and the ship gate use. */
  chars: number;
  /** First and last letter index in the alignment. */
  first: number;
  last: number;
  /** Seconds in the alignment's timeline. */
  start: number;
  end: number;
}

/**
 * Finds each segment's letters, in order, inside the alignment's character list. Punctuation,
 * spaces and acting tags are skipped on both sides, so a segment matches however the scene text
 * was joined; a letter that never turns up means the segments are not this take's script.
 */
export function locateSegments(alignment: Alignment, segments: string[]): LocatedSegment[] {
  const chars = alignment.characters, starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  if (!Array.isArray(chars) || chars.length !== starts.length || chars.length !== ends.length) throw new Error('Alignment arrays differ in length');
  let i = 0;
  const out: LocatedSegment[] = [];
  for (const [n, segment] of segments.entries()) {
    const letters = [...segment.replace(/\[[^\]]*\]/g, '')].filter(isLetter);
    if (!letters.length) throw new Error(`Segment ${n + 1} has no letters`);
    let first = -1, last = -1;
    for (const letter of letters) {
      while (i < chars.length && chars[i] !== letter) {
        if (isLetter(chars[i])) throw new Error(`Segment ${n + 1} (${segment.slice(0, 20)}…) does not follow the take's text at character ${i}`);
        i++;
      }
      if (i >= chars.length) throw new Error(`Segment ${n + 1} (${segment.slice(0, 20)}…) runs past the end of the alignment`);
      if (first < 0) first = i;
      last = i; i++;
    }
    out.push({ text: segment, chars: letters.length, first, last, start: starts[first], end: ends[last] });
  }
  for (let j = i; j < chars.length; j++) if (isLetter(chars[j])) throw new Error('The take speaks more text than the segments cover');
  return out;
}

/** The pause after each sentence but the last: the fixed pause, stretched only when the cue would read too fast. */
export function planGaps(segments: LocatedSegment[], options: SpacingOptions): number[] {
  const rateCap = options.rateCap ?? SPACING_DEFAULTS.rateCap, maxPause = Math.max(options.pause, options.maxPause ?? SPACING_DEFAULTS.maxPause);
  return segments.slice(0, -1).map(s => {
    const spoken = s.end - s.start;
    // The cue runs from this sentence's first word to the next sentence's first word, then plays
    // playbackSpeed times faster — so the gap has to cover chars × speed / cap minus the speech.
    const needed = (s.chars * options.playbackSpeed) / rateCap - spoken;
    return Math.min(maxPause, Math.max(options.pause, needed));
  });
}

export interface SpacedSentence { text: string; chars: number; start: number; end: number }
export interface SpacingResult {
  wav: Buffer;
  alignment: Alignment;
  sentences: SpacedSentence[];
  /** Start of sentences 2..n in the new WAV — what the builder's reveals align to. */
  boundaries: number[];
  gaps: number[];
  /** Digital silence laid in at each boundary (0 where the take already paused long enough). */
  inserted: number[];
  lead: number;
  duration: number;
}

/**
 * Re-spaces one take. Returns a new WAV, the alignment shifted to it, and the sentence table.
 * Speech samples are copied verbatim; only silence is added and the short natural gaps replaced.
 */
export function respace(wavBuffer: Buffer, alignment: Alignment, segments: string[], options: SpacingOptions): SpacingResult {
  const { sampleRate, pcm } = parseWav(wavBuffer);
  const total = pcm.length / 2;
  const toSample = (seconds: number): number => Math.min(total, Math.max(0, Math.round(seconds * sampleRate)));
  const located = locateSegments(alignment, segments);
  const gaps = planGaps(located, options);
  const lead = SPACING_DEFAULTS.lead, tail = SPACING_DEFAULTS.tail, head = SPACING_DEFAULTS.head;
  const fadeN = Math.max(1, Math.round(SPACING_DEFAULTS.fade * sampleRate));

  const pieces: Buffer[] = [];
  const cuts: { atInput: number; insertedSeconds: number }[] = [];
  const slice = (fromSample: number, toSampleExclusive: number, fadeIn: boolean, fadeOut: boolean): Buffer => {
    const out = Buffer.from(pcm.subarray(fromSample * 2, toSampleExclusive * 2));
    const n = out.length / 2;
    if (fadeIn) for (let k = 0; k < Math.min(fadeN, n); k++) out.writeInt16LE(Math.round(out.readInt16LE(k * 2) * (k / fadeN)), k * 2);
    if (fadeOut) for (let k = 0; k < Math.min(fadeN, n); k++) { const idx = n - 1 - k; out.writeInt16LE(Math.round(out.readInt16LE(idx * 2) * (k / fadeN)), idx * 2); }
    return out;
  };
  const silence = (seconds: number): Buffer => Buffer.alloc(Math.round(seconds * sampleRate) * 2);

  // Lead: a fixed run of silence, then the take from just before its first letter.
  const s0 = Math.max(0, located[0].start - head);
  pieces.push(silence(lead));
  let cursor = toSample(s0);
  const inserted: number[] = [];
  for (let k = 0; k < located.length - 1; k++) {
    const natural = located[k + 1].start - located[k].end;
    const target = gaps[k];
    if (natural >= target) { inserted.push(0); continue; }
    const cutAt = located[k].end + Math.min(tail, natural);
    const add = target - natural;
    const cutSample = toSample(cutAt);
    // Every slice starts after silence and this one ends before it: fade both edges of the cut.
    pieces.push(slice(cursor, cutSample, true, true));
    pieces.push(silence(add));
    cuts.push({ atInput: cutAt, insertedSeconds: add });
    inserted.push(add);
    cursor = cutSample;
  }
  pieces.push(slice(cursor, total, true, false));
  const outPcm = Buffer.concat(pieces);
  const duration = outPcm.length / 2 / sampleRate;

  const shift = (t: number): number => {
    let o = lead - s0;
    // A cut placed exactly on the next sentence's first letter belongs before that letter.
    for (const c of cuts) if (t >= c.atInput - 1e-6) o += c.insertedSeconds;
    return Math.max(0, Math.round((t + o) * 1000) / 1000);
  };
  const shifted: Alignment = {
    characters: [...alignment.characters],
    character_start_times_seconds: alignment.character_start_times_seconds.map(shift),
    character_end_times_seconds: alignment.character_end_times_seconds.map(shift),
  };
  const sentences = located.map(s => ({ text: s.text, chars: s.chars, start: shift(s.start), end: shift(s.end) }));
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
