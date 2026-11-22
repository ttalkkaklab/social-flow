import { randomInt, randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
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
export function idleRequests(image, concept) {
    return gestures.map((gesture, i) => ({
        tier: 'fast', firstFramePath: image, lastFramePath: image,
        width: nativeWidth, height: nativeHeight, frameRate: nativeFps,
        numFrames: idleFrameCounts[i], numInferenceSteps: 16, seed: 3821 + i, generateAudio: false,
        prompt: `Broadcast setting: ${concept}. Between answers, the host listens silently, lips gently closed. ${gesture} Match the reference exactly: same person, outfit, background, light, scale, eyeline and chest-up framing. The tripod stays locked. Hands stay at rest. Return to the starting pose.`,
        negativePrompt: 'talking, lip movement, dancing, waving, gesturing, posing, swaying, zoom, pan, cuts, changing light, extra people, text',
    }));
}
const lastStandbyAttempt = 4;
export function idleRetake(request, index, concept, attempt) {
    const candidate = {
        ...request, seed: request.seed + attempt * 1009, strength: attempt === 1 ? 0.94 : 0.85,
        prompt: `Broadcast setting: ${concept}. In one locked chest-up shot the host silently lowers the chin and turns slightly to read a monitor below the lens. The shoulders follow, the eyes track a line on screen, then the head rises smoothly to meet the camera again. ${gestures[index]} The head is moving from the start, midway the change in pose is clearly visible, and the return takes the rest of the shot. Relaxed pace, lips closed, hands at rest, same person, clothes, lighting and scale as both references.`,
    };
    if (attempt >= 2) {
        // With identical first/last conditioning some models hold the portrait.
        // Generate the outward half of a quiet gesture; retrace its real frames to the exact anchor.
        candidate.lastFramePath = undefined;
        const half = (request.numFrames + 1) / 2;
        candidate.numFrames = 1 + Math.ceil((half - 1) / 8) * 8;
        candidate.prompt = `Broadcast setting: ${concept}. Fixed portrait of the same silent seated host. From the first frame the head slowly turns to one side and lowers toward the chat monitor. Shoulders follow visibly as the host leans slightly forward to read. Continuous calm motion, eyes following the screen, lips closed, fixed camera and light. ${gestures[index]}`;
    }
    if (attempt >= 3) {
        const side = attempt === 3 ? 'left' : 'right';
        candidate.prompt = `Broadcast setting: ${concept}. The same host sits upright and listens in the reference framing. A chat monitor is just ${side} of the lens at eye level. The eyes move there and the head slowly turns a few degrees in place. A quiet breath lifts the shoulders slightly. Keep the chin level, nose near the center and the complete face in view throughout. Continuous gentle movement, closed lips, steady tripod, same background, outfit and lighting.`;
    }
    return candidate;
}
export async function prepareIdleClips(image, project, concept, signal, progress) {
    const requests = idleRequests(image, concept);
    const hash = createHash('sha256').update(readFileSync(image)).update(astraVideoBaseUrl());
    for (const { firstFramePath, lastFramePath, ...request } of requests)
        hash.update(JSON.stringify(request));
    const directory = join(project, '.social-flow', 'live-idle', hash.digest('hex'));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const paths = [];
    let reference;
    for (const [index, request] of requests.entries()) {
        for (let attempt = 0;; attempt++) {
            signal.throwIfAborted();
            const returning = attempt >= 2;
            const candidate = attempt === 0 ? request : idleRetake(request, index, concept, attempt);
            const variant = attempt ? '-moving-' + createHash('sha256').update(JSON.stringify([candidate.seed, candidate.prompt, candidate.strength, ...(returning ? [candidate.numFrames] : [])])).digest('hex').slice(0, 12) : '';
            const filename = `listen-${index + 1}${variant}.mp4`;
            const source = await fetchIdle(candidate, directory, returning ? 'outward-' + filename : filename, signal);
            const path = returning ? await returnToAnchor(source, join(directory, filename), request.numFrames, signal) : source;
            const { stdout } = await execute('ffmpeg', ['-v', 'error', '-nostdin', '-i', path, '-an',
                '-vf', 'crop=720:1280:8:0,scale=24:40:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { signal, encoding: 'buffer', maxBuffer: 512 * 1024 });
            try {
                const anchor = checkStandbyFraming(stdout, reference);
                reference ??= anchor;
            }
            catch (error) {
                if (!(error instanceof StandbyQualityError) || attempt >= lastStandbyAttempt)
                    throw error;
                continue;
            }
            paths.push(path);
            progress(index + 1, path);
            break;
        }
    }
    return paths;
}
async function returnToAnchor(source, path, count, signal) {
    if (existsSync(path))
        return path;
    const half = (count + 1) / 2;
    const filter = `[0:v]split[a][b];[a]trim=end_frame=${half},setpts=PTS-STARTPTS[f];`
        + `[b]trim=end_frame=${half - 1},reverse,setpts=PTS-STARTPTS[r];[f][r]concat=n=2:v=1:a=0`;
    const tmp = path + '.' + randomUUID() + '.mp4';
    try {
        await execute('ffmpeg', ['-v', 'error', '-nostdin', '-i', source, '-an', '-filter_complex', filter,
            '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', tmp], { signal });
        renameSync(tmp, path);
        return path;
    }
    finally {
        rmSync(tmp, { force: true });
    }
}
async function fetchIdle(request, directory, filename, signal) {
    const path = join(directory, filename);
    const claim = path + '.generating';
    // A persistent claim covers a transport failure between POST and its receipt.
    // A second preview or live session can follow the first accepted job.
    if (!(await resumeVideoResult(path, signal))) {
        try {
            writeFileSync(claim, String(process.pid), { flag: 'wx', mode: 0o600 });
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
            const until = Date.now() + 120000;
            while (!existsSync(path + '.astra-job.json')) {
                if (Date.now() >= until)
                    throw Error('Standby submission is unconfirmed: ' + filename);
                const pid = Number(readFileSync(claim, 'utf8'));
                try {
                    process.kill(pid, 0);
                }
                catch {
                    throw Error('Standby generation stopped before its receipt. Inspect the production queue before retrying ' + filename);
                }
                await sleep(500, undefined, { signal });
            }
        }
        if (!existsSync(path + '.astra-job.json')) {
            try {
                await generateFromImage({ ...request, outputPath: directory, filename }, signal);
            }
            finally {
                if (existsSync(path + '.astra-job.json'))
                    rmSync(claim, { force: true });
            }
        }
        else if (!(await resumeVideoResult(path, signal))) {
            throw Error('Concurrent standby preparation failed for ' + filename);
        }
    }
    return path;
}
class StandbyQualityError extends Error {
}
// Low-resolution RGB samples check framing on every decoded frame. A blink
// changes only a small region; a cut or a different camera changes much more.
export function checkStandbyFraming(samples, reference) {
    const size = 24 * 40 * 3;
    if (!samples.length || samples.length % size)
        throw Error('Incomplete standby framing samples');
    const first = samples.subarray(0, size);
    function distance(a, b) {
        let sum = 0;
        for (let i = 0; i < size; i++)
            sum += Math.abs(a[i] - b[i]);
        return sum / size;
    }
    if (reference && distance(reference, first) > 12)
        throw new StandbyQualityError('Standby clip starts on a different shot');
    let maximum = 0, stillFrames = 0;
    let previous = first;
    let anchor = first;
    for (let offset = size; offset < samples.length; offset += size) {
        const frame = samples.subarray(offset, offset + size);
        maximum = Math.max(maximum, distance(first, frame));
        // A listener can move their head against the same studio background.
        let corners = 0;
        for (let y = 0; y < 8; y++)
            for (const x of [0, 1, 2, 21, 22, 23]) {
                const i = (y * 24 + x) * 3;
                for (let c = 0; c < 3; c++)
                    corners += Math.abs(first[i + c] - frame[i + c]);
            }
        if (corners / (8 * 6 * 3) > 18 || distance(previous, frame) > 24)
            throw new StandbyQualityError('Standby clip cuts away from the shared camera framing');
        previous = frame;
        // Count moving pixels on the subject at thumbnail scale. Small codec noise
        // and changes in the studio background must not qualify a held shot.
        let moved = 0;
        for (let y = 4; y < 35 && moved < 12; y++) {
            for (let x = 3; x < 21; x++) {
                const i = (y * 24 + x) * 3;
                if (Math.abs(anchor[i] - frame[i]) + Math.abs(anchor[i + 1] - frame[i + 1]) +
                    Math.abs(anchor[i + 2] - frame[i + 2]) >= 12)
                    moved++;
            }
        }
        if (moved >= 12) {
            anchor = frame;
            stillFrames = 0;
        }
        else if (++stillFrames >= nativeFps)
            throw new StandbyQualityError('Standby host stays still for a second');
    }
    if (maximum === 0)
        throw new StandbyQualityError('Standby clip contains one still frame');
    if (maximum > 45 || distance(first, samples.subarray(-size)) > 12)
        throw new StandbyQualityError('Standby clip moves too far from the shared camera framing');
    return Buffer.from(first);
}
// Draw every clip once before reshuffling, including across speaking turns.
export class IdleRotation {
    count;
    bag = [];
    last = -1;
    constructor(count = idleCount) {
        this.count = count;
        if (!Number.isInteger(count) || count < 2)
            throw Error('At least two standby clips are required');
    }
    next() {
        if (!this.bag.length) {
            this.bag = Array.from({ length: this.count }, (_, i) => i);
            for (let i = this.count - 1; i > 0; i--) {
                const j = randomInt(i + 1);
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
            if (this.bag[this.count - 1] === this.last) {
                const j = randomInt(this.count - 1);
                [this.bag[j], this.bag[this.count - 1]] = [this.bag[this.count - 1], this.bag[j]];
            }
        }
        return this.last = this.bag.pop();
    }
}
