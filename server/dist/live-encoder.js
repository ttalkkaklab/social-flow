import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { FPS, HEIGHT, mouthLevel, RATE, SAMPLES, WIDTH } from './live-character.js';
export function splitIngest(value) {
    const url = new URL(value);
    const slash = url.pathname.lastIndexOf('/');
    if (url.protocol !== 'rtmps:' ||
        url.username ||
        url.password ||
        url.hash ||
        slash < 1 ||
        slash === url.pathname.length - 1) {
        throw Error('Expected an RTMPS server URL and stream key');
    }
    return {
        base: url.origin === 'null'
            ? 'rtmps://' + url.host + url.pathname.slice(0, slash)
            : url.origin + url.pathname.slice(0, slash),
        key: url.pathname.slice(slash + 1) + url.search
    };
}
function completion(proc, label) {
    const result = new Promise((resolve, reject) => {
        proc.once('error', () => reject(Error(label + ' could not start')));
        proc.once('close', (code) => (code === 0 ? resolve() : reject(Error(label + ' exited ' + code))));
    });
    result.catch(() => { });
    return result;
}
// Hand the private URL to libavformat on a separate descriptor. Its RTMP writer
// accepts encoded FLV bytes directly, preserving packet timestamps and stream keys.
const relayProgram = `
import ctypes
import ctypes.util
import os
import sys

def function(lib, name, result, *args):
    fn = getattr(lib, name)
    fn.argtypes = args
    fn.restype = result
    return fn

def library(name):
    path = ctypes.util.find_library(name)
    if not path:
        raise RuntimeError("Shared FFmpeg library unavailable")
    return ctypes.CDLL(path)

fmt = library("avformat")
util = library("avutil")
ptr, integer, string = ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p
pointer = ctypes.POINTER(ptr)
set_option = function(util, "av_dict_set", integer, pointer, string, string, integer)
free_options = function(util, "av_dict_free", None, pointer)
connect = function(fmt, "avio_open2", integer, pointer, string, integer, ptr, pointer)
write = function(fmt, "avio_write", None, ptr, string, integer)
flush = function(fmt, "avio_flush", None, ptr)
close = function(fmt, "avio_closep", integer, pointer)
function(util, "av_log_set_level", None, integer)(-8)
if sys.argv[1:] == ["check"]:
    sys.exit(0)
ctx, options = ptr(), ptr()
with os.fdopen(3, "rb") as target:
    url = target.read()
set_option(ctypes.byref(options), b"tls_verify", b"1", 0)
set_option(ctypes.byref(options), b"rw_timeout", b"12000000", 0)
cafile = os.environ.get("SSL_CERT_FILE")
if cafile:
    set_option(ctypes.byref(options), b"ca_file", os.fsencode(cafile), 0)
status = connect(ctypes.byref(ctx), url, 2, None, ctypes.byref(options))
free_options(ctypes.byref(options))
if status >= 0:
    print("relay_connected", file=sys.stderr, flush=True)
    try:
        while True:
            data = os.read(0, 65536)
            if not data:
                break
            write(ctx, data, len(data))
            flush(ctx)
    finally:
        status = close(ctypes.byref(ctx))
if status < 0:
    print("relay_failure", status, file=sys.stderr, flush=True)
    sys.exit(1)
`;
const relayPython = () => process.env.SOCIAL_FLOW_LIVE_PYTHON || 'python3';
export function checkLiveRelay() {
    const check = spawnSync(relayPython(), ['-c', relayProgram, 'check'], {
        stdio: 'ignore',
        timeout: 10000
    });
    if (check.status !== 0)
        throw Error('Secure live output needs Python 3 and shared FFmpeg libraries (avformat, avutil). Set SOCIAL_FLOW_LIVE_PYTHON to select an interpreter.');
}
export async function encode(frames, archive, destinations, seconds, signal, pull, log, motion, drain) {
    for (const destination of destinations)
        splitIngest(destination);
    const width = motion?.width ?? WIDTH, height = motion?.height ?? HEIGHT;
    const encoder = spawn('ffmpeg', [
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
        width + 'x' + height,
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
        ...(width === 720 && height === 1280 ? [] : ['-vf', motion ? 'scale=720:1280' : `scale=740:1316,crop=720:1280:x='10+4*sin(t*0.43)':y='18+5*sin(t*0.71)'`]),
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
        width === 720 ? '4500k' : '1700k',
        '-maxrate',
        width === 720 ? '5000k' : '2400k',
        '-bufsize',
        width === 720 ? '9000k' : '3400k',
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
    ], { stdio: ['pipe', 'pipe', 'ignore', 'pipe'] });
    let fault;
    const fail = (e) => {
        fault ??= e;
    };
    const encoded = completion(encoder, 'Character encoder');
    encoded.catch(fail);
    const video = encoder.stdin, audio = encoder.stdio[3];
    video.on('error', fail);
    audio.on('error', fail);
    const recording = createWriteStream(archive, { flags: 'wx', mode: 0o600 });
    recording.on('error', fail);
    const recorded = finished(recording);
    recorded.catch(fail);
    encoder.stdout.pipe(recording);
    const relays = destinations.map((target) => {
        const relay = spawn(relayPython(), ['-c', relayProgram], { stdio: ['pipe', 'ignore', 'pipe', 'pipe'] });
        relay.stderr.on('data', (chunk) => {
            const line = String(chunk);
            if (line.includes('relay_connected'))
                log('relay_connected', {});
            const failure = /relay_failure (-?\d+)/.exec(line);
            if (failure)
                log('relay_error', { code: Number(failure[1]) });
        });
        const key = relay.stdio[3];
        key.on('error', fail);
        key.end(target);
        relay.stdin.on('error', fail);
        encoder.stdout.pipe(relay.stdin);
        const done = completion(relay, 'RTMPS relay');
        done.catch(fail);
        return { relay, done };
    });
    const silence = Buffer.alloc(SAMPLES * 2);
    let active, offset = 0, frame = 0, lastProgress = Date.now();
    const start = performance.now();
    try {
        while (!signal.aborted && (frame < Math.ceil(seconds * FPS) || (drain && (active || drain())))) {
            if (fault)
                throw fault;
            if (video.writableLength > width * height * 3 * 10 || audio.writableLength > RATE * 4) {
                if (Date.now() - lastProgress > 12000)
                    throw Error('Encoder backpressure timeout');
                await sleep(12);
                continue;
            }
            lastProgress = Date.now();
            if (!active) {
                active = pull();
                offset = 0;
                if (active) {
                    motion?.startSpeech();
                    log('speech_start', { source: active.source, id: active.id, text: active.text, frame });
                }
            }
            let pcm = silence;
            if (active) {
                pcm = Buffer.alloc(SAMPLES * 2);
                offset += active.pcm.copy(pcm, 0, offset, offset + pcm.length);
            }
            const blink = frame % (FPS * 4) < 3;
            audio.write(pcm);
            video.write(motion ? motion.next(active?.motion) : frames[(blink ? 4 : 0) + mouthLevel(pcm)]);
            if (active && offset >= active.pcm.length) {
                log('speech_end', { source: active.source, id: active.id, frame, samplesSent: offset / 2, totalSamples: active.pcm.length / 2 });
                if (active.motion)
                    motion?.release(active.motion);
                active = undefined;
            }
            frame++;
            const wait = start + (frame * 1000) / FPS - performance.now();
            if (wait > 0)
                await sleep(wait);
        }
        audio.end();
        video.end();
        const timer = setTimeout(() => {
            encoder.kill('SIGKILL');
            for (const { relay } of relays)
                relay.kill('SIGKILL');
        }, 15000);
        try {
            await Promise.all([encoded, recorded, ...relays.map((r) => r.done)]);
        }
        finally {
            clearTimeout(timer);
        }
        if (fault)
            throw fault;
        log('encoded', { frames: frame, seconds: frame / FPS });
    }
    finally {
        encoder.kill('SIGKILL');
        for (const { relay } of relays)
            relay.kill('SIGKILL');
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
