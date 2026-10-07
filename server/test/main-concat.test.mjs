import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const builder = readFileSync(path.join(root, 'skills/produce/references/build-reel.sh'), 'utf8');
const start = builder.indexOf('# ── 9) Main-part concat');
const end = builder.indexOf('# ── 9.5)', start);
assert.ok(start >= 0 && end > start);
const concat = builder.slice(start, end);
const frameGateStart = builder.indexOf('  ACTUAL_FRAMES=$(ffprobe');
const frameGateEnd = builder.indexOf('  if [ "$HANDLE_FRAMES"', frameGateStart);
assert.ok(frameGateStart >= 0 && frameGateEnd > frameGateStart);
const frameGate = builder.slice(frameGateStart, frameGateEnd);
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const audioSamples = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 's16le', '-']);
const frameHashes = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], {encoding: 'utf8'})
  .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_packets',
  '-show_data_hash', 'sha256', '-show_entries', 'stream=time_base,duration_ts,nb_frames:packet=pts,dts,duration,data_hash',
  '-of', 'json', file], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}));

// Reproduce the observed MP4: complete CFR packets/mdhd, but a millisecond edit
// list ends early. This fixture does not depend on a muxer version's rounding.
function shortenEditList(file, milliseconds) {
  const bytes = readFileSync(file);
  let edits = 0;
  function boxes(begin, end) {
    for (let at = begin; at + 8 <= end;) {
      const size = bytes.readUInt32BE(at);
      assert.ok(size >= 8 && at + size <= end);
      const type = bytes.toString('ascii', at + 4, at + 8);
      if (['moov', 'trak', 'edts'].includes(type)) boxes(at + 8, at + size);
      if (type === 'elst') {
        assert.equal(bytes[at + 8], 0);
        assert.equal(bytes.readUInt32BE(at + 12), 1);
        bytes.writeUInt32BE(milliseconds, at + 16);
        edits++;
      }
      at += size;
    }
  }
  boxes(0, bytes.length);
  assert.equal(edits, 1);
  writeFileSync(file, bytes);
}

function fixture(fps, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'main-concat-'));
  const frames = fps + 1, cards = 8;
  try {
    mkdirSync(path.join(dir, 'work'));
    const clip = path.join(dir, 'source.mp4');
    ff(['-f', 'lavfi', '-i', `testsrc2=size=32x32:rate=${fps}`, '-frames:v', String(frames),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
    const original = probe(clip);
    const originalFrames = frameHashes(clip);
    shortenEditList(clip, Math.floor(frames * 1000 / fps));
    assert.deepEqual(probe(clip).packets, original.packets, 'fixture only changes the container edit duration');
    const ids = Array.from({length: cards}, (_, i) => i);
    for (const i of ids) {
      copyFileSync(clip, path.join(dir, `work/v${i}.mp4`));
      ff(['-f', 'lavfi', '-i', `sine=frequency=${220 + i * 37}:sample_rate=48000`, '-af', `atrim=end_sample=${frames * 48000 / fps}`,
        '-c:a', 'pcm_s16le', path.join(dir, `work/n${i}.wav`)]);
    }
    writeFileSync(path.join(dir, 'work/order.txt'), ids.join('\n') + '\n');
    writeFileSync(path.join(dir, 'work/edit-timeline.tsv'), ids.map(i => `${i}\t${i * frames}\t${frames}\tcut\t0\t0\t0`).join('\n') + '\n');
    const run = () => spawnSync('bash', ['-c', `set -euo pipefail
FPS=${fps}
say() { printf '%s\\n' "$1"; }
${concat}`], {cwd: dir, encoding: 'utf8', timeout: 30000});
    fn({dir, clip, originalFrames, fps, frames, cards, run});
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

for (const fps of [24, 30, 60]) test(`main concat preserves ${fps}fps packet clock despite shortened MP4 edit lists`, {timeout: 60000}, () => fixture(fps, ({dir, originalFrames, frames, cards, run}) => {
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /Non-monoton/);
  const video = probe(path.join(dir, 'work/video.mp4'));
  const stream = video.streams[0], [num, den] = stream.time_base.split('/').map(Number);
  const tick = den / (num * fps), count = frames * cards;
  assert.equal(video.packets.length, count);
  const pts = video.packets.map(p => p.pts).sort((a, b) => a - b);
  assert.deepEqual(pts, Array.from({length: count}, (_, i) => i * tick), 'every presentation timestamp stays on the declared frame grid');
  assert.ok(video.packets.every(p => p.duration === tick));
  assert.deepEqual(video.packets.map(p => p.dts), Array.from({length: count}, (_, i) => video.packets[0].dts + i * tick), 'decode timestamps remain continuous');
  assert.equal(stream.duration_ts, count * tick);
  // The concat demuxer's H.264 bitstream filter can repeat parameter sets. The
  // decoded frame hashes verify picture content/order across that repackaging.
  assert.deepEqual(frameHashes(path.join(dir, 'work/video.mp4')), Array.from({length: cards}, () => originalFrames).flat(), 'every decoded frame and its order are unchanged');
  const audio = probe(path.join(dir, 'work/narration.wav')).streams[0];
  assert.equal(audio.time_base, '1/48000');
  assert.equal(audio.duration_ts, count * 48000 / fps, 'narration sample clock is unchanged');
  assert.deepEqual(audioSamples(path.join(dir, 'work/narration.wav')), Buffer.concat(Array.from({length: cards}, (_, i) => audioSamples(path.join(dir, `work/n${i}.wav`)))), 'every audio sample and card order are unchanged');
  assert.match(result.stdout, /drift 0\.0000s/);
}));

test('main concat still stops when rendered frames do not cover the declared audio clock', {timeout: 60000}, () => fixture(30, ({dir, frames, run}) => {
  ff(['-f', 'lavfi', '-i', 'color=red:size=32x32:rate=30', '-frames:v', String(frames - 1),
    '-c:v', 'libx264', path.join(dir, 'work/v7.mp4')]);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /drift over the 2ms tolerance/);
}));

test('main concat rejects a missing declared frame count', {timeout: 60000}, () => fixture(30, ({dir, run}) => {
  writeFileSync(path.join(dir, 'work/edit-timeline.tsv'), '');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /missing frame count for card 0/);
}));

test('the existing per-card frame gate rejects a truncated middle card before concat', {timeout: 60000}, () => fixture(30, ({dir, frames}) => {
  ff(['-f', 'lavfi', '-i', 'color=red:size=32x32:rate=30', '-frames:v', String(frames - 1),
    '-c:v', 'libx264', path.join(dir, 'work/v3.mp4')]);
  const result = spawnSync('bash', ['-c', `set -euo pipefail
IDX=3; FRAMES=${frames}
say() { printf '%s\\n' "$1"; }
${frameGate}`], {cwd: dir, encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 1);
  assert.match(result.stdout, /card 3: rendered 30 frames, expected 31/);
}));
