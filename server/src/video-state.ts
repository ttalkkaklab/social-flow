import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicJson } from './routing-files.js';
export { atomicJson } from './routing-files.js';
import { fileURLToPath } from 'node:url';

export interface VideoJob {
  planId: string;
  requestId: string;
  shotId: string;
  tool: string;
  status: 'reserved' | 'submitting' | 'submitted' | 'submission_unknown' | 'completed' | 'failed';
  reserveUsd: number;
  settledUsd?: number;
  tokens?: number;
  providerId?: string;
  providerIds?: string[];
  result?: unknown;
  evidence?: string;
  updatedAt: string;
}
export interface VideoState { version: 1; openingSpendUsd?: number; jobs: Record<string, VideoJob> }
/** Import old video spend exactly once. Unknown historical costs require explicit reconciliation. */
function historicalSpend(episode: string): number {
  const events = path.join(episode, '.work/events.jsonl');
  const tally = path.join(episode, '.work/cost-tally.tsv');
  if (!fs.existsSync(events)) {
    if (fs.existsSync(tally) && fs.readFileSync(tally, 'utf8').trim()) throw new Error('Historical cost tally needs reconciliation before routing migration');
    return 0;
  }
  const prices = new Map(fs.readFileSync(fileURLToPath(new URL('../../skills/autoproduce/references/prices.tsv', import.meta.url)), 'utf8')
    .split('\n').filter(line => line && !line.startsWith('#')).map(line => { const cells = line.split('\t'); return [cells[0], Number(cells[2])] as const; }));
  let total = 0;
  const quantities = new Map<string, number>();
  for (const line of fs.readFileSync(events, 'utf8').split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (['astra_genai_text2img', 'astra_genai_edit', 'astra_genai_image_generate', 'astra_genai_image_edit', 'astra_genai_catalog', 'astra_genai_desktop_status'].includes(event.tool)) continue;
    if (!/^(veo_|seedance_|omni_|mlx_video|ltx_video|fasth3_omni_|astra_)/.test(event.tool || '')) continue;
    const price = prices.get(event.key);
    if (typeof event.quantity !== 'number' || !Number.isFinite(event.quantity) || event.quantity < 0 || price === undefined || !Number.isFinite(price))
      throw new Error('Historical video spend is unknown; reconcile before new spending');
    total += price * event.quantity;
    quantities.set(event.key, (quantities.get(event.key) ?? 0) + event.quantity);
  }
  if (fs.existsSync(tally)) {
    const tallied = new Map<string, number>();
    for (const line of fs.readFileSync(tally, 'utf8').split('\n')) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const [key, quantity] = line.split('\t');
      if (!/^(veo\.|seedance\.|omni\.|video\.)/.test(key)) continue;
      const amount = Number(quantity);
      if (!quantity?.trim() || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid historical video tally');
      tallied.set(key, (tallied.get(key) ?? 0) + amount);
    }
    for (const [key, amount] of tallied) {
      if (amount > (quantities.get(key) ?? 0) + 1e-9) throw new Error('Historical tally has video spending absent from events; reconcile before migration');
    }
  }
  return total;
}

/**
 * A lock left by a crashed process: its owner PID is gone on this host, or it outlived any local transaction.
 * ponytail: two processes that judge the same lock stale at once can both take it; add an atomic rename handoff if that shows up.
 */
function staleLock(lock: string): boolean {
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) return true;
    const [pid, host] = fs.readFileSync(lock, 'utf8').split('@');
    if (host !== os.hostname() || !/^\d+$/.test(pid)) return false;
    try { process.kill(Number(pid), 0); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
  } catch { return false; }
}

/**
 * Short cross-process transaction. Never steal a live lock or hold it during network I/O.
 * openingSpendUsd, when the authorization records one, replaces the historical-event import
 * on the call that creates the state (an explicit reconciliation of unknown past spend).
 */
export function videoTransaction<T>(episode: string, update: (state: VideoState) => T, openingSpendUsd?: number): T {
  const directory = path.join(episode, '.work/video-routing');
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, 'state.lock');
  let fd: number;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch {
    if (!staleLock(lock)) throw new Error('video_state_busy: another transaction holds the lock; retry this local operation');
    fs.rmSync(lock, { force: true });
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch { throw new Error('video_state_busy: another transaction holds the lock; retry this local operation'); }
  }
  fs.writeSync(fd, `${process.pid}@${os.hostname()}`);
  try {
    const file = path.join(directory, 'state.json');
    const state: VideoState = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, openingSpendUsd: openingSpendUsd ?? historicalSpend(episode), jobs: {} };
    if (state.version !== 1 || !state.jobs || typeof state.jobs !== 'object' || Array.isArray(state.jobs)) throw new Error('Invalid video state; repair explicitly');
    if (!Number.isFinite(state.openingSpendUsd ?? 0) || (state.openingSpendUsd ?? 0) < 0) throw new Error('Invalid opening spend');
    for (const job of Object.values(state.jobs)) {
      if (!job || !Number.isFinite(job.reserveUsd) || job.reserveUsd < 0 ||
          (job.settledUsd !== undefined && (!Number.isFinite(job.settledUsd) || job.settledUsd < 0)) ||
          !['reserved','submitting','submitted','submission_unknown','completed','failed'].includes(job.status)) throw new Error('Invalid video job; cannot calculate remaining budget');
    }
    const result = update(state);
    atomicJson(file, state);
    return result;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
