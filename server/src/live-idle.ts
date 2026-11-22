import { randomInt, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { astraVideoBaseUrl } from './config.js';
import { generateFromImage, resumeVideoResult } from './astra-video-client.js';

const gestures = [
  'Blink once slowly, then rest.',
  'Breathe gently with relaxed shoulders.',
  'Give a barely perceptible nod of acknowledgement.',
  'Listen with a small closed-mouth smile.',
  'Glance very slightly down at chat, then look back.',
  'Soften the eyes for a moment, then settle.',
  'Take a quiet breath through the nose.',
  'Briefly lift the eyebrows in quiet interest.',
  'Hold an attentive gaze and blink once near the end.',
  'Let a subtle smile pass, returning to the resting expression.'
];

export const idleFrameCounts = [73, 81, 89, 97, 105, 113, 81, 89, 97, 105];
export const idleCount = gestures.length;
export const nativeWidth = 736, nativeHeight = 1280, nativeFps = 24;

export function idleRequests(image: string, concept: string) {
  return gestures.map((gesture, i) => ({
    tier: 'fast' as const, firstFramePath: image, lastFramePath: image,
    width: nativeWidth, height: nativeHeight, frameRate: nativeFps,
    numFrames: idleFrameCounts[i], numInferenceSteps: 16, seed: 3821 + i, generateAudio: false,
    prompt: `Broadcast setting: ${concept}. Between answers, the host listens silently, lips gently closed. ${gesture} Match the reference exactly: same person, outfit, background, light, scale, eyeline and chest-up framing. The tripod stays locked. Hands stay at rest. Return to the starting pose.`,
    negativePrompt: 'talking, lip movement, dancing, waving, gesturing, posing, swaying, zoom, pan, cuts, changing light, extra people, text',
  }));
}

export async function prepareIdleClips(image: string, project: string, concept: string, signal: AbortSignal,
  progress: (index: number, path: string) => void) {
  const requests = idleRequests(image, concept);
  const hash = createHash('sha256').update(readFileSync(image)).update(astraVideoBaseUrl());
  for (const {firstFramePath, lastFramePath, ...request} of requests) hash.update(JSON.stringify(request));
  const directory = join(project, '.social-flow', 'live-idle', hash.digest('hex'));
  mkdirSync(directory, {recursive: true, mode: 0o700});
  const paths: string[] = [];
  for (const [index, request] of requests.entries()) {
    signal.throwIfAborted();
    const filename = `listen-${index + 1}.mp4`;
    const path = join(directory, filename);
    const claim = path + '.generating';
    // A persistent claim covers a transport failure between POST and its receipt.
    // A second preview or live session can follow the first accepted job.
    if (!(await resumeVideoResult(path, signal))) {
      try {
        writeFileSync(claim, String(process.pid), { flag: 'wx', mode: 0o600 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const until = Date.now() + 120000;
        while (!existsSync(path + '.astra-job.json')) {
          if (Date.now() >= until) throw Error('Standby submission is unconfirmed: ' + filename);
          const pid = Number(readFileSync(claim, 'utf8'));
          try { process.kill(pid, 0); } catch {
            throw Error('Standby generation stopped before its receipt. Inspect the production queue before retrying ' + filename);
          }
          await sleep(500, undefined, { signal });
        }
      }
      if (!existsSync(path + '.astra-job.json')) {
        try {
          await generateFromImage({...request, outputPath: directory, filename}, signal);
        } finally {
          if (existsSync(path + '.astra-job.json')) rmSync(claim, { force: true });
        }
      } else if (!(await resumeVideoResult(path, signal))) {
        throw Error('Concurrent standby preparation failed for ' + filename);
      }
    }
    signal.throwIfAborted();
    progress(index + 1, path);
    paths.push(path);
  }
  return paths;
}

// Low-resolution RGB samples check framing on every decoded frame. A blink
// changes only a small region; a cut or a different camera changes much more.
export function checkStandbyFraming(samples: Buffer, reference?: Buffer) {
  const size = 24 * 40 * 3;
  if (!samples.length || samples.length % size) throw Error('Incomplete standby framing samples');
  const first = samples.subarray(0, size);
  function distance(a: Buffer, b: Buffer) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Math.abs(a[i] - b[i]);
    return sum / size;
  }
  if (reference && distance(reference, first) > 12) throw Error('Standby clip starts on a different shot');
  let maximum = 0;
  for (let offset = size; offset < samples.length; offset += size) {
    maximum = Math.max(maximum, distance(first, samples.subarray(offset, offset + size)));
  }
  if (maximum === 0) throw Error('Standby clip contains one still frame');
  if (maximum > 32 || distance(first, samples.subarray(-size)) > 12)
    throw Error('Standby clip moves too far from the shared camera framing');
  return Buffer.from(first);
}

// Draw every clip once before reshuffling, including across speaking turns.
export class IdleRotation {
  private bag: number[] = [];
  private last = -1;
  constructor(private count = idleCount) {
    if (!Number.isInteger(count) || count < 2) throw Error('At least two standby clips are required');
  }
  next() {
    if (!this.bag.length) {
      this.bag = Array.from({length: this.count}, (_, i) => i);
      for (let i = this.count - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag[this.count - 1] === this.last) {
        const j = randomInt(this.count - 1);
        [this.bag[j], this.bag[this.count - 1]] = [this.bag[this.count - 1], this.bag[j]];
      }
    }
    return this.last = this.bag.pop()!;
  }
}
