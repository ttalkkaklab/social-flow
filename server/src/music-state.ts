import * as fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicJson } from './routing-files.js';

const money = z.number().finite().nonnegative();
export const musicJobSchema = z.object({
  outputFile: z.string(), planId: z.string(), requestId: z.string(), assetId: z.string(), tool: z.string(),
  status: z.enum(['submitting', 'submission_unknown', 'completed', 'failed']),
  ownerPid: z.number().int().positive().optional(), ownerHost: z.string().optional(),
  reserveUsd: money, spentUsd: money.optional(), usage: z.unknown().optional(), providerId: z.string().optional(),
  result: z.record(z.unknown()).optional(), output: z.record(z.unknown()).optional(),
  evidence: z.string().optional(), updatedAt: z.string(),
}).strict();
const stateSchema = z.object({ version: z.literal(1), openingSpendUsd: money, jobs: z.record(musicJobSchema) }).strict();
export type MusicState = z.infer<typeof stateSchema>;
export function readMusicState(directory: string): MusicState | undefined {
  const file = path.join(directory, '.work/music-routing/state.json');
  return fs.existsSync(file) ? stateSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : undefined;
}
function hasHistory(directory: string): boolean {
  const events = path.join(directory, '.work/events.jsonl');
  if (fs.existsSync(events)) for (const line of fs.readFileSync(events, 'utf8').split('\n').filter(Boolean)) {
    if (/^(music_generate|music_elevenlabs_|suno_generate|mlx_music_)/.test(JSON.parse(line).tool || '')) return true;
  }
  const tally = path.join(directory, '.work/cost-tally.tsv');
  return fs.existsSync(tally) && /^music\./m.test(fs.readFileSync(tally, 'utf8'));
}
/** A short exclusive transaction, never a lock around an API call. */
export function musicTransaction<T>(directory: string, openingSpendUsd: number | undefined, update: (state: MusicState) => T): T {
  const folder = path.join(directory, '.work/music-routing');
  fs.mkdirSync(folder, { recursive: true });
  const lock = path.join(folder, 'state.lock');
  let fd: number;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch { throw new Error('music_state_busy: retry local operation; never steal another process lock'); }
  try {
    let state = readMusicState(directory);
    if (!state) {
      if (openingSpendUsd === undefined && hasHistory(directory)) throw new Error('music_history_unreconciled: record openingSpendUsd from existing music receipts');
      state = { version: 1, openingSpendUsd: openingSpendUsd ?? 0, jobs: {} };
    }
    const result = update(state);
    atomicJson(path.join(folder, 'state.json'), stateSchema.parse(state));
    return result;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
