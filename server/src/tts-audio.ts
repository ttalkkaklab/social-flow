/** Mechanical media checks only; these do not evaluate pronunciation or acting. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function decodeSpeechBase64(data: unknown): Buffer {
  if (typeof data !== 'string' || !data.length || data.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new Error('Invalid speech audio base64');
  }
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) throw new Error('Empty speech audio');
  return bytes;
}

export function validateSpeechAudio(bytes: Buffer, extension: string): number {
  extension = extension.toLowerCase();
  if (!bytes.length) throw new Error('Empty speech audio');
  if (extension === 'wav') {
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
        bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) {
      throw new Error('Invalid or truncated speech WAV');
    }
    let byteRate = 0, blockAlign = 0, dataSize = 0, offset = 12;
    for (; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32LE(offset + 4), start = offset + 8;
      if (start + size > bytes.length) throw new Error('Truncated speech WAV chunk');
      const id = bytes.toString('ascii', offset, offset + 4);
      if (id === 'fmt ') {
        if (size < 16 || byteRate) throw new Error('Invalid speech WAV format');
        const format = bytes.readUInt16LE(start), channels = bytes.readUInt16LE(start + 2);
        const rate = bytes.readUInt32LE(start + 4), bits = bytes.readUInt16LE(start + 14);
        byteRate = bytes.readUInt32LE(start + 8); blockAlign = bytes.readUInt16LE(start + 12);
        if (![1, 3].includes(format) || channels < 1 || channels > 8 || rate < 8000 || rate > 192000 ||
            !(format === 3 ? [32, 64] : [8, 16, 24, 32]).includes(bits) || blockAlign !== channels * bits / 8 || byteRate !== rate * blockAlign) {
          throw new Error('Invalid speech WAV encoding');
        }
      }
      if (id === 'data') dataSize += size;
      offset = start + size + (size & 1);
    }
    if (offset !== bytes.length || !byteRate || !dataSize || dataSize % blockAlign !== 0) throw new Error('Invalid speech WAV data');
    return dataSize / byteRate;
  }
  // Compressed formats need demuxing and decoding; metadata alone accepts corrupt payloads.
  const dir = mkdtempSync(join(tmpdir(), 'speech-probe-'));
  try {
    const file = join(dir, `audio.${extension}`);
    writeFileSync(file, bytes);
    const result = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
      'stream=codec_type:format=duration,format_name', '-of', 'json', file],
    { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }));
    const duration = Number(result.format?.duration);
    const names: Record<string, string> = { mp3: 'mp3', ogg: 'ogg', webm: 'webm', aac: 'aac', flac: 'flac' };
    if (!names[extension] || !String(result.format?.format_name).split(',').includes(names[extension]) ||
        !result.streams?.some((s: { codec_type?: string }) => s.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0) {
      throw new Error('Invalid speech audio format or duration');
    }
    const decoded = execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode',
      '-i', file, '-map', '0:a:0', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    const decodedTimes = [...decoded.matchAll(/^out_time_us=(\d+)$/gm)].map(match => Number(match[1]));
    if (!decodedTimes.some(time => Number.isFinite(time) && time > 0)) throw new Error('Speech audio decoded no samples');
    return duration;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function validateSpeechAlignment(value: unknown, duration: number): void {
  if (value == null) return;
  if (typeof value !== 'object') throw new Error('Invalid speech alignment');
  const a = value as Record<string, unknown>;
  const chars = a.characters, starts = a.character_start_times_seconds, ends = a.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends) ||
      chars.length !== starts.length || chars.length !== ends.length) throw new Error('Invalid speech alignment lengths');
  for (let i = 0; i < chars.length; i++) {
    if (typeof chars[i] !== 'string' || typeof starts[i] !== 'number' || typeof ends[i] !== 'number' ||
        !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < 0 || ends[i] < starts[i] ||
        ends[i] > duration + 0.1 || (i > 0 && (starts[i] < starts[i - 1] || ends[i] < ends[i - 1]))) {
      throw new Error('Invalid speech alignment timing');
    }
  }
}

export function validateSpeechSegments(value: unknown, duration: number, inputs: {voice_id: string}[]): void {
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error('Invalid speech voice segments');
  for (const segment of value) {
    if (!segment || typeof segment !== 'object') throw new Error('Invalid speech voice segment');
    const { start_time_seconds: start, end_time_seconds: end, character_start_index: from,
      character_end_index: to, dialogue_input_index: index, voice_id: voice } = segment;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > duration + 0.1 ||
        !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from ||
        !Number.isInteger(index) || index < 0 || index >= inputs.length || inputs[index].voice_id !== voice) {
      throw new Error('Invalid speech voice segment timing or speaker');
    }
  }
}
