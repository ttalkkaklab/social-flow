/**
 * Usage ledger — every generation call writes itself down, without anyone remembering to.
 *
 * ## The problem
 *
 * `.work/cost-tally.tsv` is the episode's cost record, and it is written by hand: after each
 * generation call the skill appends a line. That works right up until it doesn't — a session
 * ends mid-run, a regeneration gets batched and forgotten, a retry after a failure never gets
 * a line. The report then shows a total that is too small, and nothing in it says so.
 *
 * The server already knows. It made the call, it knows the model, the resolution and the
 * seconds asked for. So it writes an append-only event line at the moment of the call, and
 * the hand-written tally can be reconciled against it later
 * (`skills/autoproduce/references/events-to-tally.js`).
 *
 * ## Where it writes, and why not somewhere central
 *
 * The server has no idea where `data/` is — credentials come from `~/.config/social-flow` and
 * nothing else tells it about a repository. What it does get is `outputPath`, and for a
 * production call that path is inside the episode. So the episode directory is found by
 * walking up from `outputPath` looking for the one marker only an episode has:
 * `storyboard/scenes.js`. A call with no episode-scoped path writes nothing, which is right —
 * an intro sting or a branding image is not an episode cost.
 *
 * ## It never fails the call
 *
 * A generation call that already spent money must not fail because a log line couldn't be
 * written. Every path here swallows its errors and reports on stderr at most.
 *
 * The ledger line is JSON, one per line, appended with O_APPEND so several sessions writing
 * at once interleave whole lines instead of corrupting each other.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** One recorded call. `key`/`quantity` are the cost-ledger coordinates when they are knowable. */
export interface UsageEvent {
  ts: string;
  tool: string;
  ok: boolean;
  ms: number;
  /** prices.tsv key, or null when the tool's args do not determine the billed amount. */
  key: string | null;
  /** Amount in that key's unit (prices.tsv `unit` column). null alongside a null key. */
  quantity: number | null;
  note?: string;
  detail?: Record<string, string | number | boolean>;
}

/**
 * The marker that says "this is an episode directory".
 *
 * Only an episode has `storyboard/scenes.js`. Channel assets, intro stings and branding runs
 * do not, so they fall out of the episode ledger rather than being filed against whichever
 * episode happens to be nearby.
 */
const EPISODE_MARKER = path.join('storyboard', 'scenes.js');

/** How far up from outputPath to look. `.work/broll/` is two levels; six is slack, not a limit. */
const MAX_WALK_UP = 6;

export function findEpisodeDir(outputPath: string | undefined): string | null {
  if (!outputPath || typeof outputPath !== 'string') return null;
  let dir: string;
  try {
    dir = path.resolve(outputPath);
  } catch {
    return null;
  }
  for (let i = 0; i <= MAX_WALK_UP; i++) {
    try {
      if (existsSync(path.join(dir, EPISODE_MARKER))) return dir;
    } catch {
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Appends one event to `<episode>/.work/events.jsonl`.
 *
 * Returns the file written, or null when there was no episode to write to — callers use that
 * only for tests; a null is a normal outcome, not a failure.
 */
export function recordUsage(outputPath: string | undefined, event: UsageEvent): string | null {
  const episodeDir = findEpisodeDir(outputPath);
  if (!episodeDir) return null;
  const workDir = path.join(episodeDir, '.work');
  const file = path.join(workDir, 'events.jsonl');
  try {
    mkdirSync(workDir, { recursive: true });
    // O_APPEND — concurrent sessions interleave whole lines rather than overwriting.
    appendFileSync(file, JSON.stringify(event) + '\n', { encoding: 'utf8', flag: 'a' });
    return file;
  } catch (error) {
    // A ledger write must never take down a call that already cost money.
    console.error(
      `[social-flow] could not write the usage ledger (${file}): ` +
        (error instanceof Error ? error.message : String(error)),
    );
    return null;
  }
}

/* ── Tool call → price key ────────────────────────────────────────────────────
   This mapping exists nowhere else. prices.tsv holds the unit prices and knows nothing about
   tool arguments; the skills know the arguments but write the key by hand. What follows is the
   translation between them, and `server/test/usage-ledger.test.mjs` checks that every key it
   can emit is a real row in prices.tsv. */

const VEO_TIER: Record<string, string> = {
  'veo-3.1-lite-generate-preview': 'lite',
  'veo-3.1-fast-generate-preview': 'fast',
  'veo-3.1-generate-preview': 'standard',
};

const SEEDANCE_FAMILY: Record<string, string> = {
  'dreamina-seedance-2-5-260628': '2-5',
  'dreamina-seedance-2-0-260128': '2-0',
  'dreamina-seedance-2-0-fast-260128': '2-0-fast',
  'dreamina-seedance-2-0-mini-260615': '2-0-mini',
  'seedance-1-0-pro-250528': '1-0-pro',
  'seedance-1-0-pro-fast-251015': '1-0-pro-fast',
};

const ELEVENLABS_KEY: Record<string, string> = {
  eleven_multilingual_v2: 'tts.elevenlabs',
  eleven_v3: 'tts.elevenlabs',
  eleven_v3_conversational: 'tts.elevenlabs-flash',
  eleven_flash_v2_5: 'tts.elevenlabs-flash',
  eleven_turbo_v2_5: 'tts.elevenlabs-flash',
};

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);

/**
 * Works out the price key and the billed amount from the call's own arguments.
 *
 * Two tools deliberately come back with a null key. ElevenLabs bills a metered character
 * count that sits below the raw text length and only arrives in a response header, and Lyria
 * RealTime has no published unit price at all. Guessing either one would put a number in the
 * ledger that looks measured and isn't — the event still gets written, with a note saying why.
 */
export function priceOf(
  tool: string,
  args: Record<string, unknown>,
): { key: string | null; quantity: number | null; note?: string } {
  if (tool.startsWith('veo_')) {
    const tier = VEO_TIER[str(args.model, 'veo-3.1-fast-generate-preview')];
    const resolution = str(args.resolution, '720p');
    if (!tier) return { key: null, quantity: null, note: `unmapped veo model: ${String(args.model)}` };
    // 1080p and 4k generate 8 seconds whatever was asked for, and veo_reference is pinned to 8.
    const forcedEight = resolution !== '720p' || tool === 'veo_reference';
    const seconds = forcedEight ? 8 : num(args.durationSeconds, 8);
    return { key: `veo.${tier}.${resolution}`, quantity: seconds };
  }

  if (tool.startsWith('seedance_')) {
    const model = str(args.model, 'seedance-1-5-pro-251215');
    const resolution = str(args.resolution, '720p');
    const seconds = num(args.durationSeconds, 5);
    if (model === 'seedance-1-5-pro-251215') {
      // The only model whose price splits on audio — silent is exactly half.
      const audio = args.generateAudio === true;
      return { key: `seedance.1-5-pro-${audio ? 'audio' : 'silent'}.${resolution}`, quantity: seconds };
    }
    const family = SEEDANCE_FAMILY[model];
    if (!family) return { key: null, quantity: seconds, note: `unmapped seedance model: ${model}` };
    return { key: `seedance.${family}.${resolution}`, quantity: seconds };
  }

  if (tool.startsWith('gpt_image_')) {
    const quality = str(args.quality, 'medium');
    return { key: `image.gpt-image-2.${quality}`, quantity: num(args.n, 1) };
  }

  if (tool === 'image_local_generate') {
    return { key: 'image.local', quantity: num(args.n, 1) };
  }

  if (tool === 'tts_local_generate') {
    return { key: 'tts.local', quantity: charUnits(args) };
  }

  if (tool === 'tts_generate' || tool === 'tts_multi_speaker') {
    const model = str(args.model, 'gemini-2.5-flash-preview-tts');
    const tier = model.includes('pro') ? 'pro' : 'flash';
    return { key: `tts.gemini-${tier}`, quantity: charUnits(args) };
  }

  if (tool.startsWith('tts_elevenlabs_')) {
    const key = ELEVENLABS_KEY[str(args.model, 'eleven_multilingual_v2')] ?? null;
    return {
      key,
      quantity: null,
      note:
        'ElevenLabs bills the metered character-cost header, which sits below the raw text ' +
        `length (raw ${rawChars(args)} chars) — read the quantity off the response, not from here`,
    };
  }

  if (tool === 'music_generate_clip') return { key: 'music.lyria-clip', quantity: 1 };
  if (tool === 'music_generate' || tool === 'music_generate_advanced') {
    return {
      key: 'music.lyria-realtime',
      quantity: num(args.durationSeconds, 30),
      note: 'unit price unconfirmed — the report excludes this item rather than counting it as 0',
    };
  }
  if (tool === 'suno_generate') return { key: 'music.suno-generate', quantity: 1 };
  if (tool === 'suno_generate_sound') return { key: 'music.suno-sound', quantity: 1 };
  if (tool === 'suno_generate_lyrics') return { key: 'music.suno-lyrics', quantity: 1 };

  return { key: null, quantity: null };
}

/** The raw character count of whatever text a speech call was given. */
function rawChars(args: Record<string, unknown>): number {
  if (typeof args.text === 'string') return args.text.length;
  if (Array.isArray(args.turns)) {
    return args.turns.reduce(
      (sum: number, t: unknown) =>
        sum + (t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string'
          ? ((t as { text: string }).text).length
          : 0),
      0,
    );
  }
  return 0;
}

/** Speech is priced per 1,000 characters — the unit, not the count (cost-tally.md §Quantity). */
function charUnits(args: Record<string, unknown>): number {
  return Math.round((rawChars(args) / 1000) * 1000) / 1000;
}

/** True for the tools whose calls belong in an episode's cost ledger. */
export function isBillableTool(tool: string): boolean {
  return (
    tool.startsWith('veo_') ||
    tool.startsWith('seedance_') ||
    tool.startsWith('gpt_image_') ||
    tool.startsWith('tts_') ||
    tool.startsWith('music_') ||
    tool.startsWith('suno_generate') ||
    tool === 'image_local_generate'
  );
}
