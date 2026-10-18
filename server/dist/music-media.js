import * as fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export function readMusicMetadata(file) {
    const result = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
        'stream=codec_type,sample_rate,channels:format=duration', '-of', 'json', file], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }));
    const audio = result.streams?.find((s) => s.codec_type === 'audio');
    const durationSeconds = Number(result.format?.duration);
    if (!audio || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
        throw new Error('music_output_unusable');
    return { audioPath: file, durationSeconds, sampleRate: Number(audio.sample_rate), channels: Number(audio.channels),
        sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
}
export function normalizeMusicFile(source, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = target + '.' + randomUUID() + '.wav';
    try {
        execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', '-n', '-i', source,
            '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', temporary], { timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        const metadata = readMusicMetadata(temporary);
        fs.linkSync(temporary, target); // Exclusive publication; never overwrite another session's output.
        return { ...metadata, audioPath: target };
    }
    finally {
        fs.rmSync(temporary, { force: true });
    }
}
