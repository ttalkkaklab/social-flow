import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const home = () => path.join(os.homedir(), '.local/share/social-flow/upscale-tools');
const worker = fileURLToPath(new URL('./video-upscale-worker.py', import.meta.url));
const runtime = {
  pythonPath: z.string().min(1).optional().describe('Python executable; e.g. /opt/upscale/venv/bin/python. Defaults to the managed upscale-tools venv, then python3.'),
  modelsDirectory: z.string().min(1).optional().describe('Directory holding the two official realesr-general x4v3 weights; e.g. /opt/upscale/models. Never downloaded automatically.'),
};
export const upscaleStartSchema = z.object({
  adapter: z.enum(['realesrgan', 'lanczos']).describe('Explicit adapter choice. realesrgan is local AI restoration; lanczos is an ordinary resize.'),
  sources: z.array(z.string().min(1)).min(1).max(500).describe('Ordered local video paths; e.g. ["/project/shot01.mp4"]. One output per input; no storyboard edits.'),
  outputDirectory: z.string().min(1).describe('Local output directory; e.g. /project/output/upscale. Each request gets its own job directory.'),
  width: z.number().int().min(2).max(7680).multipleOf(2).optional().describe('Even output width in pixels, e.g. 3840. Supply height too; omit both for 2x.'),
  height: z.number().int().min(2).max(7680).multipleOf(2).optional().describe('Even output height in pixels, e.g. 2160. Supply width too.'),
  fit: z.enum(['contain', 'cover']).default('contain').describe('contain pads to preserve the full frame; cover crops centrally to fill the canvas.'),
  denoiseStrength: z.number().min(0).max(1).default(0.3).describe('Real-ESRGAN general/WDN blend, e.g. 0.3. Only used by realesrgan.'),
  device: z.enum(['auto', 'mps', 'cuda', 'cpu']).default('auto').describe('Local inference device. auto chooses MPS, CUDA, then CPU; never another adapter.'),
  ...runtime,
}).strict().refine(a => (a.width === undefined) === (a.height === undefined), 'Supply width and height together');
export const upscaleControlSchema = z.object({
  action: z.enum(['status', 'cancel', 'resume']).describe('status reads progress; cancel requests a cooperative stop; resume reuses verified completed clips.'),
  jobDirectory: z.string().min(1).describe('Exact jobDirectory returned by video_upscale_start; e.g. /project/output/upscale/job-abc123.'),
}).strict();
const catalogSchema = z.object(runtime).strict();
type Json = Record<string, unknown>;
function read(file: string): Json { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function atomic(file: string, value: unknown) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n'); fs.renameSync(temp, file);
}
function python(request: { pythonPath?: string }) {
  return request.pythonPath ?? (fs.existsSync(path.join(home(), 'venv/bin/python')) ? path.join(home(), 'venv/bin/python') : 'python3');
}
function alive(pid: unknown) {
  if (!Number.isSafeInteger(pid) || Number(pid) <= 0) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
export function upscaleCatalog(args: unknown = {}) {
  const parsed = catalogSchema.parse(args);
  return JSON.parse(execFileSync(python(parsed), [worker, '--catalog', parsed.modelsDirectory ?? path.join(home(), 'models')], { encoding: 'utf8', timeout: 30_000 }));
}
export function upscaleStatus(jobDirectory: string) {
  const dir = fs.realpathSync(jobDirectory);
  const request = read(path.join(dir, 'request.json'));
  if (request.version !== 1 || request.jobDirectory !== dir) throw new Error('Not an upscale job directory');
  const status = read(path.join(dir, 'status.json'));
  const processFile = path.join(dir, 'process.json');
  const processAlive = fs.existsSync(processFile) && alive(read(processFile).pid);
  const active = ['queued', 'running'].includes(String(status.status));
  return { ...status, ...(active && !processAlive ? { status: 'interrupted' } : {}), processAlive, jobDirectory: dir };
}
function launch(dir: string, executable: string) {
  const fd = fs.openSync(path.join(dir, 'worker.log'), 'a');
  try {
    const child = spawn(executable, [worker, '--job', dir], { detached: true, stdio: ['ignore', fd, fd] });
    // Capture asynchronous ENOENT instead of crashing the MCP server.
    child.on('error', error => atomic(path.join(dir, 'status.json'), { status: 'failed', error: error.message }));
    atomic(path.join(dir, 'process.json'), { pid: child.pid ?? null, startedAt: new Date().toISOString() });
    child.unref();
  } finally { fs.closeSync(fd); }
}
export function startUpscale(args: unknown) {
  const parsed = upscaleStartSchema.parse(args);
  const output = path.resolve(parsed.outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  const outputDirectory = fs.realpathSync(output);
  const sources = parsed.sources.map(source => fs.realpathSync(source));
  if (new Set(sources).size !== sources.length) throw new Error('Duplicate source paths');
  const request = { ...parsed, sources, outputDirectory, pythonPath: python(parsed), modelsDirectory: path.resolve(parsed.modelsDirectory ?? path.join(home(), 'models')) };
  // Probe media, runtime and weight hashes before launching expensive work.
  const prepared = JSON.parse(execFileSync(request.pythonPath, [worker, '--prepare'], { input: JSON.stringify(request), encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }));
  const fingerprint = createHash('sha256').update(JSON.stringify(prepared)).digest('hex');
  const dir = path.join(outputDirectory, `job-${fingerprint.slice(0, 24)}`);
  try { fs.mkdirSync(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return upscaleStatus(dir);
  }
  atomic(path.join(dir, 'request.json'), { version: 1, ...prepared, fingerprint, jobDirectory: dir });
  atomic(path.join(dir, 'status.json'), { status: 'queued', completedClips: 0, totalClips: sources.length });
  launch(dir, request.pythonPath);
  return { ...upscaleStatus(dir), fingerprint };
}
export function controlUpscale(args: unknown) {
  const input = upscaleControlSchema.parse(args), dir = fs.realpathSync(input.jobDirectory);
  const status = upscaleStatus(dir);
  if (input.action === 'status') return status;
  if (input.action === 'cancel') {
    if (['queued', 'running'].includes(String(status.status))) fs.writeFileSync(path.join(dir, 'cancel'), 'requested\n');
    return { ...status, cancellationRequested: fs.existsSync(path.join(dir, 'cancel')) };
  }
  // Serialize resume across MCP processes; the worker also holds an OS file lock.
  const lock = path.join(dir, 'resume.lock'); fs.mkdirSync(lock);
  try {
    const latest = upscaleStatus(dir);
    if (latest.processAlive || latest.status === 'completed') return latest;
    const request = read(path.join(dir, 'request.json'));
    fs.rmSync(path.join(dir, 'cancel'), { force: true });
    atomic(path.join(dir, 'status.json'), { ...latest, status: 'queued' });
    launch(dir, String(request.pythonPath));
    return upscaleStatus(dir);
  } finally { fs.rmdirSync(lock); }
}
const schema = (value: z.ZodTypeAny) => zodToJsonSchema(value, { $refStrategy: 'none' }) as Tool['inputSchema'];
export const UPSCALE_TOOLS: Tool[] = [
  { name: 'video_upscale_catalog', title: 'Local video upscale adapters', annotations: { readOnlyHint: true, openWorldHint: false },
    description: 'Inspect local video upscale adapters and installed dependencies.\nUse before an upscale, 4K or sharpen request. Does not download models or render frames. Do NOT use to start processing — use video_upscale_start. Returns adapter ids, capabilities, dependency availability and model paths; availability is a local check, not a quality verdict.', inputSchema: schema(catalogSchema) },
  { name: 'video_upscale_start', title: 'Start local video upscale', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Create a resumable local upscale job for one clip or an ordered batch.\nUse for requested upscale, 4K restoration, 해상도 올리기 or whole-episode 컷 업스케일. Requires FFmpeg and Python; realesrgan also needs PyTorch, Spandrel, Pillow and the two official x4v3 weights. No downloads, paid calls, character settings, frame interpolation, storyboard edits or assembly. Existing sources are never overwritten. Constant-rate SDR video only; original audio packets, frame count and timing are verified. Real-ESRGAN processes native frames at 4x before fitting the output; faces/details still need visual inspection. Do NOT use for status — use video_upscale_job; for generative LTX 2x use astra_video_upscale explicitly. Returns immediately after preflight with jobDirectory, status and clip counts. Identical requests reuse a job; resume interrupted/failed jobs with video_upscale_job. Final receipts contain paths, SHA-256 hashes, dimensions, fps, frame counts and audio verification; review stays not_reviewed.', inputSchema: schema(upscaleStartSchema) },
  { name: 'video_upscale_job', title: 'Inspect or control video upscale job', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Read upscale progress, request cancellation or resume unfinished clips.\nUse for an existing jobDirectory from video_upscale_start. Cancel stops between frames and preserves completed clips; resume verifies source, settings and completed output hashes before reuse. A stopped partial clip restarts at its first frame. Do NOT use to create a job — use video_upscale_start. Returns status, completed/total clips, current frame, elapsed seconds when running, output receipts when complete, or an error. Status does not mean perceptual review passed.', inputSchema: schema(upscaleControlSchema) },
];
