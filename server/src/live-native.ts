import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { RATE, SAMPLES } from './live-character.js';
import { IdleRotation, idleCount, idleFrameCounts, nativeWidth, nativeHeight, prepareIdleClips } from './live-idle.js';
import { MotionFrames } from './live-motion.js';
import { pcmToWav } from './media-utils.js';

const execute = promisify(execFile);
const worker = fileURLToPath(new URL('../live-native-720.py', import.meta.url));
export function nativeLauncher() {
  if (process.env.SOCIAL_FLOW_LIVE_A2V_COMMAND) return process.env.SOCIAL_FLOW_LIVE_A2V_COMMAND;
  if (process.env.SOCIAL_FLOW_LIVE_GPU_HOST && process.env.SOCIAL_FLOW_LIVE_GPU_PYTHON)
    return fileURLToPath(new URL('../live-native-ssh.py', import.meta.url));
  throw Error('Configure the production CUDA launcher or the GPU SSH host and Python interpreter');
}
export const talkPrompt = 'A locked chest-up portrait of the same character in the reference, looking into the lens. The host speaks quietly in sync with the supplied voice. Relaxed shoulders and hands. Keep the camera, light and background fixed.';

// Let the model move off its fixed reference pose before the first audible syllable.
// Decode only the frames corresponding to the original PCM for playout.
export function nativeSpeechTiming(pcm: Buffer) {
  const bytesPerFrame = SAMPLES * 2;
  const speechFrames = Math.ceil(pcm.length / bytesPerFrame);
  const leadFrames = 4;
  const modelFrames = 1 + 8 * Math.ceil((leadFrames + speechFrames - 1) / 8);
  const modelPcm = Buffer.alloc(modelFrames * bytesPerFrame);
  pcm.copy(modelPcm, leadFrames * bytesPerFrame);
  return { leadFrames, speechFrames, modelFrames, modelPcm };
}

export class NativeTalk {
  readonly width = 720;
  readonly height = nativeHeight;
  private dir = mkdtempSync(join(tmpdir(), 'native-talk-'));
  private frames = new Set<MotionFrames>();
  private idle: MotionFrames[] = [];
  private rotation = new IdleRotation();
  private shot = -1;
  private idleIndex = 0;
  private speechIndex = 0;
  private onIdle?: (index: number) => void;

  constructor(private image: string, private project: string, private prompt: string,
    private log?: (kind: string, fields: Record<string, unknown>) => void) {}

  private async decode(clip: string, signal: AbortSignal, timing?: ReturnType<typeof nativeSpeechTiming>, start = timing?.leadFrames ?? 0) {
    const info = await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', clip], { signal });
    const stream = JSON.parse(info.stdout).streams?.[0];
    if (stream?.width !== nativeWidth || stream.height !== nativeHeight || stream.r_frame_rate !== '24/1')
      throw Error('Unexpected native video geometry or frame rate');
    if (timing && Number(stream.nb_frames) !== timing.modelFrames)
      throw Error('Native render and conditioning audio have different frame counts');
    const filter = timing
      ? `trim=start_frame=${start}:end_frame=${start + timing.speechFrames},crop=720:1280:8:0`
      : 'crop=720:1280:8:0';
    const rgb = join(this.dir, randomUUID() + '.rgb');
    try {
      await execute('ffmpeg', ['-v', 'error', '-nostdin', '-i', clip, '-an', '-vf', filter,
        '-pix_fmt', 'rgb24', '-f', 'rawvideo', rgb], { signal });
      const frames = new MotionFrames(rgb, true, this.width * this.height * 3);
      this.frames.add(frames);
      return frames;
    } catch (error) {
      rmSync(rgb, { force: true });
      throw error;
    }
  }

  async prepareIdle(concept: string, signal: AbortSignal, log: (kind: string, fields: Record<string, unknown>) => void) {
    const paths = await prepareIdleClips(this.image, this.project, concept, signal,
      (index) => log('idle_clip_prepared', { index, total: idleCount }));
    for (const [i, path] of paths.entries()) {
      const frames = await this.decode(path, signal);
      if (frames.count !== idleFrameCounts[i]) throw Error('Standby clip has an unexpected frame count');
      this.idle.push(frames);
    }
    this.onIdle = (index) => log('idle_clip_playing', { index: index + 1 });
    log('idle_pool_ready', { count: this.idle.length });
  }

  async render(pcm: Buffer, signal: AbortSignal, words: string, cachePrepared = false) {
    const launcher = nativeLauncher();
    const timing = nativeSpeechTiming(pcm);
    const wav = pcmToWav(timing.modelPcm, RATE, 1);
    const prompt = this.prompt + ' The speaker says exactly ' + JSON.stringify(words)
      + '. Match lip closures, vowels and pauses to the supplied recording. Keep the lips at rest during silence.';
    const key = createHash('sha256').update(readFileSync(worker)).update(readFileSync(this.image))
      .update(prompt).update(wav).digest('hex');
    const cache = join(this.project, '.social-flow', 'live-openings');
    const cached = join(cache, key + '.mp4');
    const prefix = join(this.dir, randomUUID());
    const clip = cachePrepared && existsSync(cached) ? cached : prefix + '.mp4';
    const audio = prefix + '.wav';
    writeFileSync(audio, wav, { mode: 0o600 });
    try {
      if (clip !== cached) {
        await execute(launcher, [worker, '--audio', audio, '--image', resolve(this.image),
          '--output', clip, '--prompt', prompt], { signal, timeout: 1800000, maxBuffer: 2 * 1024 * 1024 });
      }
      let start = timing.leadFrames;
      const model = process.env.SOCIAL_FLOW_LIVE_LANDMARKER || process.env.MUSETALK_LANDMARKER;
      if (model) {
        const python = process.env.SOCIAL_FLOW_AVATAR_PYTHON || 'python3';
        const tracker = fileURLToPath(new URL('../live-mouth-timing.py', import.meta.url));
        const result = await execute(python, [tracker, '--video', clip, '--audio', audio, '--model', model,
          '--lead', String(start), '--count', String(timing.speechFrames)], { signal, timeout: 120000 });
        start = JSON.parse(result.stdout).start;
        if (!Number.isInteger(start) || start < 0 || start + timing.speechFrames > timing.modelFrames)
          throw Error('Mouth timing exceeds the rendered frame handles');
      }
      this.log?.('native_speech_timing', { measured: !!model, videoOffsetFrames: start - timing.leadFrames,
        frames: timing.speechFrames, samples: pcm.length / 2 });
      const frames = await this.decode(clip, signal, timing, start);
      if (frames.count !== timing.speechFrames) throw Error('Native clip does not cover its voice track');
      if (cachePrepared && clip !== cached) {
        mkdirSync(cache, { recursive: true, mode: 0o700 });
        const tmp = join(cache, key + '.' + randomUUID() + '.tmp');
        try { writeFileSync(tmp, readFileSync(clip), { mode: 0o600 }); renameSync(tmp, cached); }
        finally { rmSync(tmp, { force: true }); }
      }
      return frames;
    } finally {
      if (clip !== cached) rmSync(clip, { force: true });
      rmSync(audio, { force: true });
    }
  }
  startSpeech() { this.speechIndex = 0; this.shot = -1; }
  next(speech?: MotionFrames) {
    if (speech) return speech.at(Math.min(this.speechIndex++, speech.count - 1));
    if (this.idle.length !== idleCount) throw Error('Standby pool has not finished preparing');
    if (this.shot === -1 || this.idleIndex >= this.idle[this.shot].count) {
      this.shot = this.rotation.next();
      this.idleIndex = 0;
      this.onIdle?.(this.shot);
    }
    return this.idle[this.shot].at(this.idleIndex++);
  }
  release(frames: MotionFrames) { frames.close(); this.frames.delete(frames); }
  close() {
    for (const frames of this.frames) frames.close();
    rmSync(this.dir, { recursive: true, force: true });
  }
}
