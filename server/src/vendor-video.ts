/**
 * Common layer for hosted video vendors (LTX API, MiniMax H3, HeyGen Video 1): one submit,
 * a durable provider ID, polling and the download. Each vendor module supplies only its own
 * body, endpoints and status mapping. The paid POST is never repeated: once it was sent,
 * only the vendor's explicit 4xx answer proves no job exists (terminal).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { recordVideoSubmission } from './video-events.js';
import { resolveOutputFile } from './media-utils.js';

export class VendorHttpError extends Error {
  constructor(message: string, readonly status: number, readonly terminal: boolean) { super(message); }
}

/** A JSON call; 4xx except timeout/conflict/rate states means the vendor refused it. */
export async function vendorJson(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 120_000) });
  const body = await response.text();
  if (!response.ok) {
    const terminal = response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status);
    throw new VendorHttpError(`HTTP ${response.status}: ${body.slice(0, 500)}`, response.status, terminal);
  }
  try { return JSON.parse(body) as Record<string, unknown>; }
  catch { throw new VendorHttpError(`Non-JSON response: ${body.slice(0, 200)}`, response.status, false); }
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
};
export function mediaType(file: string, allowed: readonly string[]): string {
  const ext = path.extname(file).toLowerCase();
  if (!allowed.includes(ext) || !MIME[ext]) throw new Error(`Unsupported input ${path.basename(file)}; use ${allowed.join(', ')}`);
  return MIME[ext];
}
/** Local file → data URI under a size cap, read on the file or, for a vendor that measures the base64 text, on the encoding. */
export function dataUri(file: string, allowed: readonly string[], maxBytes: number, measure: 'file' | 'encoded' = 'file'): string {
  const type = mediaType(file, allowed);
  const raw = fs.statSync(file).size, size = measure === 'encoded' ? 4 * Math.ceil(raw / 3) : raw;
  if (size > maxBytes) throw new Error(`${path.basename(file)} is ${(size / 1048576).toFixed(1)} MB${measure === 'encoded' ? ' once base64-encoded' : ''}; this vendor takes at most ${(maxBytes / 1048576).toFixed(0)} MB inline`);
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

export type VendorPoll = { state: 'running' } | { state: 'failed'; error: string } | { state: 'done'; url: string; meta?: Record<string, unknown> }
  | { state: 'done'; bytes: Buffer; meta?: Record<string, unknown> };
export interface VendorJob {
  vendor: string;
  submit(): Promise<string>;
  poll(id: string): Promise<VendorPoll>;
  outputPath: string;
  filename: string;
  intervalMs?: number;
  maxPolls?: number;
}
export type VendorResult =
  | { success: true; videoPath: string; providerId: string; meta: Record<string, unknown> }
  | { success: false; error: string; terminal: boolean; providerId?: string };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runVendorJob(job: VendorJob): Promise<VendorResult> {
  // Path validation before the paid call: a bad filename found after the job finishes wastes it.
  let target: string;
  try { target = resolveOutputFile(job.outputPath, job.filename, 'video'); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error), terminal: true }; }
  let id: string;
  try { id = await job.submit(); }
  catch (error) {
    // A POST that never got an answer may still have created a job; only an explicit refusal is terminal.
    return { success: false, error: `${job.vendor} submission failed: ${error instanceof Error ? error.message : String(error)}`,
      terminal: error instanceof VendorHttpError && error.terminal };
  }
  recordVideoSubmission(id);
  const maxPolls = job.maxPolls ?? 180, interval = job.intervalMs ?? 10_000;
  let retried = false;
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    await sleep(interval);
    let status: VendorPoll;
    // One failed status read waits for the next poll; only the GET repeats, never the paid POST.
    try { status = await job.poll(id); retried = false; }
    catch (error) {
      if (retried) return { success: false, error: `${job.vendor} status check failed: ${error instanceof Error ? error.message : String(error)}`, terminal: false, providerId: id };
      retried = true; continue;
    }
    if (status.state === 'running') continue;
    if (status.state === 'failed') return { success: false, error: `${job.vendor} job ${id} failed: ${status.error}`, terminal: true, providerId: id };
    return saveVendorOutput(status, target, id);
  }
  return { success: false, error: `${job.vendor} job ${id} still running after ${(maxPolls * interval) / 60_000} minutes; check it at the vendor and settle the request with video_status action:reconcile — do not resubmit`, terminal: false, providerId: id };
}

/** Downloads and recovery publish a complete file atomically, even if the process is interrupted. */
export async function saveVendorOutput(status: Extract<VendorPoll, { state: 'done' }>, target: string, id: string, verify?: (file: string) => Promise<void>): Promise<VendorResult> {
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    let bytes: Buffer;
    if ('bytes' in status) bytes = status.bytes;
    else {
      const download = await fetch(status.url, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!download.ok) throw new Error('HTTP ' + download.status);
      bytes = Buffer.from(await download.arrayBuffer());
    }
    if (!bytes.length) throw new Error('empty video');
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    if (verify) await verify(temporary);
    fs.renameSync(temporary, target);
    return { success: true, videoPath: target, providerId: id, meta: status.meta ?? {} };
  } catch (error) {
    return { success: false, terminal: false, providerId: id, error: 'Output download or save failed: ' + String(error) + '; recover the existing job, do not resubmit' };
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
