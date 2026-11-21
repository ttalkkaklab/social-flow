import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { type Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { FPS, HEIGHT, mouthLevel, RATE, SAMPLES, WIDTH } from './live-character.js';

export function splitIngest(value: string) {
  const url = new URL(value);
  const slash = url.pathname.lastIndexOf('/');
  if (
    url.protocol !== 'rtmps:' ||
    url.username ||
    url.password ||
    url.hash ||
    slash < 1 ||
    slash === url.pathname.length - 1
  ) {
    throw Error('Expected an RTMPS server URL and stream key');
  }
  return {
    base:
      url.origin === 'null'
        ? 'rtmps://' + url.host + url.pathname.slice(0, slash)
        : url.origin + url.pathname.slice(0, slash),
    key: url.pathname.slice(slash + 1) + url.search
  };
}
function completion(proc: ChildProcess, label: string) {
  const result = new Promise<void>((resolve, reject) => {
    proc.once('error', () => reject(Error(label + ' could not start')));
    proc.once('close', (code) => (code === 0 ? resolve() : reject(Error(label + ' exited ' + code))));
  });
  result.catch(() => {});
  return result;
}
export interface Utterance {
  pcm: Buffer;
  id: string;
  text: string;
  source: string;
}
export async function encode(
  frames: Buffer[],
  archive: string,
  destinations: string[],
  seconds: number,
  signal: AbortSignal,
  pull: () => Utterance | undefined,
  log: (kind: string, info: Record<string, unknown>) => void
) {
  const targets = destinations.map(splitIngest);
  const encoder = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-thread_queue_size',
      '12',
      '-probesize',
      '32',
      '-analyzeduration',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-s',
      WIDTH + 'x' + HEIGHT,
      '-r',
      String(FPS),
      '-i',
      'pipe:0',
      '-thread_queue_size',
      '64',
      '-probesize',
      '32',
      '-analyzeduration',
      '1',
      '-f',
      's16le',
      '-ar',
      String(RATE),
      '-ac',
      '1',
      '-i',
      'pipe:3',
      '-vf',
      `scale=740:1316,crop=720:1280:x='10+4*sin(t*0.43)':y='18+5*sin(t*0.71)'`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
      '-pix_fmt',
      'yuv420p',
      '-g',
      String(FPS * 2),
      '-b:v',
      '1700k',
      '-maxrate',
      '2400k',
      '-bufsize',
      '3400k',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-b:a',
      '96k',
      '-flvflags',
      'no_duration_filesize',
      '-f',
      'flv',
      'pipe:1'
    ],
    { stdio: ['pipe', 'pipe', 'ignore', 'pipe'] }
  );
  let fault: Error | undefined;
  const fail = (e: Error) => {
    fault ??= e;
  };
  const encoded = completion(encoder, 'Character encoder');
  encoded.catch(fail);
  const video = encoder.stdin!,
    audio = encoder.stdio[3] as Writable;
  video.on('error', fail);
  audio.on('error', fail);
  const recording = createWriteStream(archive, { flags: 'wx', mode: 0o600 });
  recording.on('error', fail);
  const recorded = finished(recording);
  recorded.catch(fail);
  encoder.stdout!.pipe(recording);
  const relays = targets.map((target) => {
    // FFmpeg reads the secret from an inherited pipe; stream keys never appear in argv.
    const relay = spawn(
      'ffmpeg',
      [
        '-nostdin',
        '-loglevel',
        'error',
        '-f',
        'flv',
        '-i',
        'pipe:0',
        '-map',
        '0',
        '-c',
        'copy',
        '-f',
        'flv',
        '-rw_timeout',
        '12000000',
        '-fpre',
        '/dev/fd/3',
        target.base + '/live'
      ],
      { stdio: ['pipe', 'ignore', 'ignore', 'pipe'] }
    );
    const key = relay.stdio[3] as Writable;
    key.on('error', fail);
    key.end('rtmp_playpath=' + target.key + '\ntls_verify=1\n');
    relay.stdin!.on('error', fail);
    encoder.stdout!.pipe(relay.stdin!);
    const done = completion(relay, 'RTMPS relay');
    done.catch(fail);
    return { relay, done };
  });
  const silence = Buffer.alloc(SAMPLES * 2);
  let active: Utterance | undefined,
    offset = 0,
    frame = 0,
    lastProgress = Date.now();
  const start = performance.now();
  try {
    while (frame < Math.ceil(seconds * FPS) && !signal.aborted) {
      if (fault) throw fault;
      if (video.writableLength > WIDTH * HEIGHT * 3 * 10 || audio.writableLength > RATE * 4) {
        if (Date.now() - lastProgress > 12000) throw Error('Encoder backpressure timeout');
        await sleep(12);
        continue;
      }
      lastProgress = Date.now();
      if (!active) {
        active = pull();
        offset = 0;
        if (active) log('speech_start', { source: active.source, id: active.id, text: active.text, frame });
      }
      let pcm = silence;
      if (active) {
        pcm = Buffer.alloc(SAMPLES * 2);
        offset += active.pcm.copy(pcm, 0, offset, offset + pcm.length);
      }
      const blink = frame % (FPS * 4) < 3;
      audio.write(pcm);
      video.write(frames[(blink ? 4 : 0) + mouthLevel(pcm)]);
      if (active && offset >= active.pcm.length) {
        log('speech_end', { source: active.source, id: active.id, frame });
        active = undefined;
      }
      frame++;
      const wait = start + (frame * 1000) / FPS - performance.now();
      if (wait > 0) await sleep(wait);
    }
    audio.end();
    video.end();
    const timer = setTimeout(() => {
      encoder.kill('SIGKILL');
      for (const { relay } of relays) relay.kill('SIGKILL');
    }, 15000);
    try {
      await Promise.all([encoded, recorded, ...relays.map((r) => r.done)]);
    } finally {
      clearTimeout(timer);
    }
    if (fault) throw fault;
    log('encoded', { frames: frame, seconds: frame / FPS });
  } finally {
    encoder.kill('SIGKILL');
    for (const { relay } of relays) relay.kill('SIGKILL');
    recording.destroy();
    if (active)
      log('speech_interrupted', {
        source: active.source,
        id: active.id,
        frame,
        samplesSent: offset / 2,
        totalSamples: active.pcm.length / 2
      });
  }
}
