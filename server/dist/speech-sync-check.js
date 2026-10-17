/**
 * Does the picture move with the voice? — the check behind astra_audio2video's reseed.
 *
 * LTX 2.5 audio-to-video sometimes ignores the supplied speech: the character blinks and
 * sways but the mouth never follows the line, and which seeds do this is luck (research
 * 2026-10-17: HF LTX-2.5 discussion #44, Wan2GP #2200). Audio-visual synchrony finds that
 * without a face model (Hershey & Movellan 2000): ffmpeg decodes a small grey proxy and the
 * conditioning WAV, and each 8×8 block's frame-to-frame change is correlated with the
 * per-frame speech loudness. The best block is then compared with the same search run
 * against time-shifted audio, so a clip full of unrelated motion does not pass by chance.
 *
 * Only ffmpeg and node — no OS-specific vision API, no upload, no cost.
 *
 * Ceiling: this sees that some region moves with the voice. Head bobbing in rhythm can pass
 * it; it does not see phonemes, which person's mouth moved, or whose voice it is. Those stay
 * not_reviewed.
 */
import { spawnSync } from 'node:child_process';
const FPS = 24;
const PROXY_WIDTH = 128;
const BLOCK = 8;
const LAGS = [-2, -1, 0, 1, 2, 3, 4]; // picture may trail the voice by a few frames
const NULL_SHIFTS = 12;
const SMOOTH_FRAMES = 5; // ~0.2s: a mouth moves on syllable edges, the voice stays loud between them
const MOTION_CAP = 0.95; // percentile; one cut or subtitle change cannot own a block
const SPEECH_FLOOR_DB = -50; // dBFS; quieter frames are silence
const SPEECH_RANGE_DB = 30; // and anything this far under the loudest frame
const MIN_SPEECH_SECONDS = 1;
/** Best block correlation must clear chance (90th percentile of shifted audio) by this much. */
export const SYNC_MARGIN = 0.1;
export const NOT_REVIEWED = ['phoneme-level lip sync', 'which visible person speaks', 'voice identity'];
const round = (n) => Math.round(n * 1000) / 1000;
function ffmpeg(args) {
    const run = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { maxBuffer: 512 * 1024 * 1024 });
    if (run.error)
        throw new Error(run.error.code === 'ENOENT' ? 'ffmpeg is not installed' : run.error.message);
    if (run.status !== 0)
        throw new Error(`ffmpeg failed: ${String(run.stderr).trim().slice(-300)}`);
    return run.stdout;
}
function probe(video) {
    const run = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', video], { encoding: 'utf8' });
    if (run.error || run.status !== 0)
        throw new Error(`ffprobe could not read ${video}`);
    const json = JSON.parse(run.stdout);
    const picture = (json.streams || []).find((s) => s.codec_type === 'video');
    if (!picture?.width || !picture.height)
        throw new Error(`${video} has no video stream`);
    return { width: picture.width, height: picture.height, seconds: Number(json.format?.duration) || 0,
        audio: (json.streams || []).some((s) => s.codec_type === 'audio') };
}
/** Mean absolute grey change per block between consecutive frames: series[block][frame]. */
function blockMotion(video, width, height) {
    const w = PROXY_WIDTH;
    const h = Math.max(BLOCK, Math.round((height / width) * w / BLOCK) * BLOCK);
    const raw = ffmpeg(['-i', video, '-vf', `fps=${FPS},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
    const size = w * h;
    const frames = Math.floor(raw.length / size);
    const cols = w / BLOCK, rows = h / BLOCK;
    const series = Array.from({ length: cols * rows }, () => new Array(frames).fill(0));
    for (let f = 1; f < frames; f += 1) {
        const cur = f * size, prev = cur - size;
        for (let y = 0; y < h; y += 1) {
            const rowBase = Math.floor(y / BLOCK) * cols;
            for (let x = 0; x < w; x += 1)
                series[rowBase + Math.floor(x / BLOCK)][f] += Math.abs(raw[cur + y * w + x] - raw[prev + y * w + x]);
        }
    }
    return series;
}
/** Per-frame RMS (linear, 0..1) of the audio from `start`, `seconds` long (null = to the end). */
function envelope(audio, start, seconds, streamFromVideo = false) {
    const window = [...(start ? ['-ss', String(start)] : []), ...(seconds !== null ? ['-t', String(seconds)] : [])];
    const pcm = ffmpeg([...window, '-i', audio, ...(streamFromVideo ? ['-map', '0:a:0'] : []), '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-']);
    const samples = Math.floor(pcm.length / 2);
    const out = [];
    for (let f = 0; Math.round(((f + 1) * 16000) / FPS) <= samples; f += 1) {
        const from = Math.round((f * 16000) / FPS), to = Math.round(((f + 1) * 16000) / FPS);
        let sum = 0;
        for (let i = from; i < to; i += 1) {
            const s = pcm.readInt16LE(i * 2) / 32768;
            sum += s * s;
        }
        out.push(Math.sqrt(sum / (to - from)));
    }
    return out;
}
const db = (rms) => 20 * Math.log10(Math.max(rms, 1e-9));
function speechFrames(env) {
    const loudest = Math.max(...env.map(db));
    return env.map((v) => db(v) > Math.max(SPEECH_FLOOR_DB, loudest - SPEECH_RANGE_DB));
}
function pearson(a, b, lag) {
    // a[t] against b[t - lag]
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let t = Math.max(0, lag); t < a.length && t - lag < b.length; t += 1) {
        const x = a[t], y = b[t - lag];
        n += 1;
        sa += x;
        sb += y;
        saa += x * x;
        sbb += y * y;
        sab += x * y;
    }
    if (n < 3)
        return 0;
    const va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
    return va > 0 && vb > 0 ? (sab - (sa * sb) / n) / Math.sqrt(va * vb) : 0;
}
function bestSync(motion, env) {
    let score = -1, lag = 0;
    for (const series of motion)
        for (const l of LAGS) {
            const r = pearson(series, env, l);
            if (r > score) {
                score = r;
                lag = l;
            }
        }
    return { score, lag };
}
function movingMean(series, width) {
    const half = Math.floor(width / 2);
    return series.map((_, i) => {
        let sum = 0, n = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(series.length - 1, i + half); j += 1) {
            sum += series[j];
            n += 1;
        }
        return sum / n;
    });
}
function capped(series) {
    const cap = [...series].sort((a, b) => a - b)[Math.floor(MOTION_CAP * (series.length - 1))] ?? 0;
    return series.map((v) => Math.min(v, cap));
}
/** The synchrony search on its own — exported for the selftest and calibration. */
export function syncMeasure(motion, env) {
    const frames = Math.min(env.length, motion[0]?.length ?? 0);
    // Subtracting the ~1s trend was tried and pulled real LTX refusals up toward the threshold
    // (2026-10-17 calibration), so only the smoothing and the cap stay.
    const clipped = motion.map((s) => movingMean(capped(s.slice(0, frames)), SMOOTH_FRAMES));
    const audio = movingMean(env.slice(0, frames), SMOOTH_FRAMES);
    const { score, lag } = bestSync(clipped, audio);
    const nulls = [];
    for (let j = 1; j <= NULL_SHIFTS; j += 1) {
        const k = Math.round((frames * j) / (NULL_SHIFTS + 1));
        if (Math.min(k, frames - k) < FPS)
            continue;
        nulls.push(bestSync(clipped, [...audio.slice(k), ...audio.slice(0, k)]).score);
    }
    nulls.sort((a, b) => a - b);
    const chance = nulls.length ? nulls[Math.floor(0.9 * (nulls.length - 1))] : 1;
    return { score, chance, margin: score - chance, lag };
}
/**
 * Check one audio2video clip against the WAV that drove it. `audioPath` may be absent (a
 * reused upload id); the clip's own track stands in, and the cut/fidelity checks are skipped.
 */
export function checkSpeechSync(opts) {
    const result = { status: 'not_measured', findings: [], notReviewed: NOT_REVIEWED };
    try {
        const clip = probe(opts.videoPath);
        const start = opts.audioStartTime ?? 0;
        let env;
        if (opts.audioPath) {
            env = envelope(opts.audioPath, start, opts.audioMaxDuration ?? null);
            const active = speechFrames(env);
            const lastSpeech = (active.lastIndexOf(true) + 1) / FPS;
            if (lastSpeech > clip.seconds + 0.1)
                result.findings.push({ kind: 'speech_cut', reseed: false,
                    what: `speech runs to ${round(lastSpeech)}s of the supplied window but the clip ends at ${round(clip.seconds)}s — request enough numFrames (8k+1, at most 193) and pad the WAV with silence, or split the line; another seed will not lengthen it` });
            if (clip.audio) {
                const own = envelope(opts.videoPath, 0, null, true);
                let correlation = -1, lagFrames = 0;
                for (let l = -12; l <= 12; l += 1) {
                    const r = pearson(own, env, l);
                    if (r > correlation) {
                        correlation = r;
                        lagFrames = l;
                    }
                }
                result.audio = { correlation: round(correlation), lagFrames };
                if (correlation < 0.9 || lagFrames !== 0)
                    result.findings.push({ kind: 'audio_mismatch', reseed: false,
                        what: `the clip's own audio is not the supplied WAV (envelope correlation ${round(correlation)} at ${lagFrames} frame(s) offset) — mux the pinned WAV instead of the clip track${lagFrames ? ' and check the mouth timing against it' : ''}` });
            }
            else
                result.audio = null;
        }
        else if (clip.audio) {
            env = envelope(opts.videoPath, 0, null, true);
        }
        else {
            result.reason = 'no local audioPath and no audio track in the clip';
            return result;
        }
        const speechSeconds = speechFrames(env).slice(0, Math.round(clip.seconds * FPS)).filter(Boolean).length / FPS;
        if (speechSeconds < MIN_SPEECH_SECONDS) {
            result.reason = `only ${round(speechSeconds)}s of speech in the window — too little to measure`;
            return result;
        }
        const m = syncMeasure(blockMotion(opts.videoPath, clip.width, clip.height), env);
        result.sync = { score: round(m.score), chance: round(m.chance), margin: round(m.margin), lagFrames: m.lag, speechSeconds: round(speechSeconds) };
        result.status = m.margin >= SYNC_MARGIN ? 'follows_speech' : 'no_sync';
        if (result.status === 'no_sync')
            result.findings.push({ kind: 'lip_sync', reseed: true,
                what: `no region of the picture moves with the speech (best ${round(m.score)} vs chance ${round(m.chance)}, margin under ${SYNC_MARGIN}) — the model likely ignored the voice` });
    }
    catch (error) {
        result.status = 'not_measured';
        result.reason = error instanceof Error ? error.message : String(error);
    }
    return result;
}
