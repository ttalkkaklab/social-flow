import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  openSync,
  closeSync,
  readSync,
  statSync,
  rmSync,
  realpathSync
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { FPS, WIDTH, HEIGHT, type LiveConfig } from './live-character.js';

const AVATAR_FPS = 25;
const FRAME_BYTES = WIDTH * HEIGHT * 3;
function differentPixels(a: Buffer, b: Buffer) {
  let changed = 0;
  for (let offset = 0; offset < FRAME_BYTES; offset += 3 * 97)
    if (
      Math.abs(a[offset] - b[offset]) +
        Math.abs(a[offset + 1] - b[offset + 1]) +
        Math.abs(a[offset + 2] - b[offset + 2]) >
      27
    )
      changed++;
  return changed;
}

// Each rendered answer starts on the first frame of the driving performance.
// Returning to that pose before speech starts keeps head and shoulders continuous.
export function cycleFrame(step: number, count: number) {
  const period = 2 * count - 2;
  const phase = step % period;
  return phase < count ? phase : period - phase;
}
export class MotionFrames {
  readonly count: number;
  private file: number;
  constructor(
    private path: string,
    private remove = false,
    private frameBytes = FRAME_BYTES
  ) {
    this.count = statSync(path).size / this.frameBytes;
    if (!Number.isInteger(this.count) || this.count < 1) throw Error('Incomplete motion frame data');
    this.file = openSync(path, 'r');
  }
  at(index: number) {
    const frame = Buffer.allocUnsafe(this.frameBytes);
    if (readSync(this.file, frame, 0, frame.length, index * this.frameBytes) !== frame.length)
      throw Error('Motion frame unavailable');
    return frame;
  }
  close() {
    if (this.file < 0) return;
    closeSync(this.file);
    this.file = -1;
    if (this.remove) rmSync(this.path, { force: true });
  }
}
export class MotionAvatar {
  private directory = mkdtempSync(join(tmpdir(), 'social-flow-avatar-'));
  private cursor = 0;
  private shots: MotionFrames[] = [];
  private shot = 0;
  constructor(config: LiveConfig) {
    try {
      const root = realpathSync(config.project);
      const video = join(this.directory, 'performance.mp4');
      const convert = (args: string[]) => {
        const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { timeout: 90000 });
        if (r.status !== 0) throw Error('Cannot prepare character performance video');
      };
      for (const [i, clip] of [config.motionVideo!, ...config.idleVideos].entries()) {
        const source = realpathSync(resolve(root, clip));
        if (!source.startsWith(root + sep)) throw Error('Motion video outside character project');
        const normalized = i === 0 ? video : join(this.directory, 'camera-' + i + '.mp4');
        const idle = join(this.directory, 'camera-' + i + '.rgb');
        convert([
          '-i',
          source,
          '-t',
          '30',
          '-an',
          '-vf',
          `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${AVATAR_FPS},setsar=1`,
          '-c:v',
          'libx264',
          '-crf',
          '14',
          normalized
        ]);
        convert(['-i', normalized, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', idle]);
        const shot = new MotionFrames(idle);
        this.shots.push(shot);
        if (shot.count < AVATAR_FPS) throw Error('Provide at least one second of moving performance footage');
        let reference = shot.at(0),
          lastChange = 0;
        for (let frame = 5; frame < shot.count; frame += 5) {
          const sample = shot.at(frame);
          if (differentPixels(sample, reference) > 14) {
            reference = sample;
            lastChange = frame;
          } else if (frame - lastChange >= AVATAR_FPS)
            throw Error('The driving video holds a still frame for a second');
        }
        if (!lastChange) throw Error('The driving video contains only a still frame');
      }
    } catch (e) {
      this.close();
      throw e;
    }
  }
  startSpeech() {
    this.cursor = 0;
    this.shot = 0;
  }
  next(speech?: MotionFrames) {
    let step = Math.floor((this.cursor++ * AVATAR_FPS) / FPS);
    if (speech) return speech.at(Math.min(step, speech.count - 1));
    if (this.shots.length > 1 && step >= this.shots[this.shot].count) {
      this.shot = (this.shot + 1) % this.shots.length;
      this.cursor = 1;
      step = 0;
    }
    const shot = this.shots[this.shot];
    return shot.at(cycleFrame(step, shot.count));
  }
  async render(_pcm: Buffer, _signal: AbortSignal): Promise<never> {
    throw Error('post_lipsync_forbidden: generate a new speaking take for the live character');
  }
  release(frames: MotionFrames) {
    frames.close();
  }
  close() {
    for (const shot of this.shots) shot.close();
    rmSync(this.directory, { recursive: true, force: true });
  }
}
