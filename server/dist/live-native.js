import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { RATE, SAMPLES, mouthLevel } from './live-character.js';
import { IdleRotation, idleCount, idleFrameCounts, nativeWidth, nativeHeight, prepareIdleClips } from './live-idle.js';
import { MotionFrames } from './live-motion.js';
import { generateGenaiVideo } from './astra-genai-video.js';
import { astraGenaiBaseUrl } from './astra-genai-client.js';
const execute = promisify(execFile);
const { estimateSpeechSeconds } = createRequire(import.meta.url)('../../skills/_shared/scene-acting.js');
export const talkPrompt = 'Locked chest-up portrait. The host faces the lens with relaxed shoulders. Keep the camera, light and background fixed.';
function speechFrames(text, language) {
    const seconds = estimateSpeechSeconds(text, language) ?? Math.max(2, Array.from(text).length / 7);
    return Math.max(49, 1 + 8 * Math.ceil(((seconds + 0.65) * 24 - 1) / 8));
}
export function openingParts(text, language) {
    if (speechFrames(text, language) <= 361)
        return [text];
    const parts = [];
    let current = '';
    for (const { segment } of new Intl.Segmenter(language, { granularity: 'word' }).segment(text)) {
        const units = speechFrames(segment, language) > 361 ? Array.from(segment) : [segment];
        for (const unit of units) {
            if (current.trim() && speechFrames(current + unit, language) > 361) {
                parts.push(current.trim());
                current = '';
            }
            current += unit;
        }
    }
    if (current.trim())
        parts.push(current.trim());
    return parts;
}
export function spokenVideoRequest(actor, direction, text) {
    const language = new Intl.DisplayNames(['en'], { type: 'language' }).of(actor.language) ?? actor.language;
    const numFrames = speechFrames(text, actor.language);
    if (numFrames > 361)
        throw Error('Live dialogue exceeds one GenAI clip. Use a shorter line.');
    return {
        model: 'ltx-2.5-22b-distilled', resolution: '720x1280', fps: 24, numFrames, generateAudio: true,
        imagePath: actor.asset, references: [{ imagePath: actor.asset, audioPath: actor.voiceSample }],
        openingPositions: [{ character: 'Host', images: [1], position: 'Centered in the portrait, facing the viewer in the original framing.' }],
        prompt: [direction, actor.voiceDirection, 'Use Image 1 and its voice sample for the same speaker and vocal timbre.',
            'One continuous take, no music, other speakers or on-screen text. The host starts speaking immediately,'
                + ' with natural lip movement and finishes the line before the shot ends.',
            'The only words spoken, in ' + language + ', are ' + JSON.stringify(text) + '.'].filter(Boolean).join(' '),
        reserveUsd: 0
    };
}
export class NativeTalk {
    actor;
    project;
    prompt;
    log;
    width = 720;
    height = nativeHeight;
    dir = mkdtempSync(join(tmpdir(), 'native-talk-'));
    frames = new Set();
    downloads = new Map();
    idle = [];
    rotation = new IdleRotation();
    shot = -1;
    idleIndex = 0;
    speechIndex = 0;
    onIdle;
    constructor(actor, project, prompt, log) {
        this.actor = actor;
        this.project = project;
        this.prompt = prompt;
        this.log = log;
    }
    async decode(clip, signal) {
        const info = await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
            'stream=width,height,r_frame_rate', '-of', 'json', clip], { signal });
        const stream = JSON.parse(info.stdout).streams?.[0];
        if (![this.width, nativeWidth].includes(stream?.width) || stream.height !== nativeHeight || stream.r_frame_rate !== '24/1')
            throw Error('Unexpected native video geometry or frame rate');
        const filter = 'crop=720:1280';
        const rgb = join(this.dir, randomUUID() + '.rgb');
        try {
            await execute('ffmpeg', ['-v', 'error', '-nostdin', '-i', clip, '-an', '-vf', filter,
                '-pix_fmt', 'rgb24', '-f', 'rawvideo', rgb], { signal });
            const frames = new MotionFrames(rgb, true, this.width * this.height * 3);
            this.frames.add(frames);
            return frames;
        }
        catch (error) {
            rmSync(rgb, { force: true });
            throw error;
        }
    }
    async prepareIdle(concept, signal, log) {
        const paths = await prepareIdleClips(this.actor.asset, this.project, concept, signal, (index) => log('idle_clip_prepared', { index, total: idleCount }));
        for (const [i, path] of paths.entries()) {
            const frames = await this.decode(path, signal);
            if (frames.count !== idleFrameCounts[i])
                throw Error('Standby clip has an unexpected frame count');
            this.idle.push(frames);
        }
        this.onIdle = (index) => log('idle_clip_playing', { index: index + 1 });
        log('idle_pool_ready', { count: this.idle.length });
    }
    videoInput(text) {
        const request = spokenVideoRequest(this.actor, this.prompt, text);
        const key = createHash('sha256').update(astraGenaiBaseUrl()).update(JSON.stringify(request))
            .update(readFileSync(this.actor.asset)).update(readFileSync(this.actor.voiceSample)).digest('hex');
        const outputPath = join(this.project, '.social-flow', 'live-genai');
        return { ...request, outputPath, filename: key + '.mp4' };
    }
    async cached(text, signal) {
        const input = this.videoInput(text);
        const receipt = join(input.outputPath, input.filename) + '.astra-genai.json';
        if (!existsSync(receipt) || JSON.parse(readFileSync(receipt, 'utf8')).status !== 'completed')
            return;
        return this.render(text, signal);
    }
    async render(text, signal) {
        const input = this.videoInput(text);
        const { outputPath } = input;
        mkdirSync(outputPath, { recursive: true, mode: 0o700 });
        const started = Date.now();
        // Identical replies share the remote job, but each playout owns its own decoded frames.
        let download = this.downloads.get(input.filename);
        if (!download) {
            download = generateGenaiVideo('image-to-video', input, signal)
                .finally(() => this.downloads.delete(input.filename));
            this.downloads.set(input.filename, download);
        }
        const result = await download;
        signal.throwIfAborted();
        if (!result.downloaded || !result.videoPath)
            throw Error('GenAI dialogue video is still pending: ' + result.receiptPath);
        const speech = await this.readSpeech(result.videoPath, signal);
        this.log?.('genai_speech_ready', { jobId: result.jobId, receiptPath: result.receiptPath, elapsedMs: Date.now() - started,
            frames: speech.motion.count, samples: speech.pcm.length / 2 });
        return speech;
    }
    async readSpeech(file, signal) {
        const { stdout: audio } = await execute('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0',
            '-vn', '-ac', '1', '-af', 'aresample=' + RATE + ':async=1:first_pts=0', '-f', 's16le', 'pipe:1'], { encoding: 'buffer', signal, maxBuffer: RATE * 2 * 20 });
        if (!mouthLevel(audio))
            throw Error('GenAI dialogue soundtrack is silent');
        const motion = await this.decode(file, signal);
        const bytes = motion.count * SAMPLES * 2;
        // Preserve ending syllables. The encoder holds the final frame while trailing samples play.
        if (Math.abs(audio.length - bytes) > RATE * 2 * 0.1) {
            this.release(motion);
            throw Error('GenAI speech and video durations differ');
        }
        const pcm = audio.length < bytes ? Buffer.concat([audio, Buffer.alloc(bytes - audio.length)]) : audio;
        return { pcm, motion };
    }
    startSpeech() { this.speechIndex = 0; this.shot = -1; }
    next(speech) {
        if (speech)
            return speech.at(Math.min(this.speechIndex++, speech.count - 1));
        if (this.idle.length !== idleCount)
            throw Error('Standby pool has not finished preparing');
        if (this.shot === -1 || this.idleIndex >= this.idle[this.shot].count) {
            this.shot = this.rotation.next();
            this.idleIndex = 0;
            this.onIdle?.(this.shot);
        }
        return this.idle[this.shot].at(this.idleIndex++);
    }
    release(frames) { frames.close(); this.frames.delete(frames); }
    close() {
        for (const frames of this.frames)
            frames.close();
        rmSync(this.dir, { recursive: true, force: true });
    }
}
