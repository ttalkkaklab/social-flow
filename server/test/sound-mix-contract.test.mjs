import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const refs = fileURLToPath(new URL('../../skills/produce/references/', import.meta.url));
const checker = fileURLToPath(new URL('../../skills/storyboard/references/check-scenes.js', import.meta.url));
const { MIX_FIELDS, mixFindings } = require(join(refs, 'sound-mix-contract.js'));
const build = readFileSync(join(refs, 'build-reel.sh'), 'utf8');
const defaults = build.slice(build.indexOf('BGM_SEP=${'), build.indexOf('XFADE=${'));
const mixStage = build.slice(build.indexOf('BGMGATE=""'), build.indexOf('# 10c)'));
const fadeStart = build.split('\n').find(line => line.startsWith('FOUT=$('));

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${bin}: ${result.error || result.stderr || result.stdout}`);
  return result;
}
function set(mix, field, value) {
  const keys = field.split('.');
  const target = keys.length === 1 ? mix : (mix[keys[0]] ??= {});
  target[keys.at(-1)] = value;
  return mix;
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mix-bounds-'));
  mkdirSync(join(dir, 'work')); mkdirSync(join(dir, 'channel'));
  return dir;
}
function compile(dir, mix) {
  writeFileSync(join(dir, 'scenes.js'), `window.MUSIC={$mix:${JSON.stringify(mix)}};window.SCENES=[{type:"cover",duration:3}];`);
  return spawnSync(process.execPath, [join(refs, 'compile-sound-plan.js'), join(dir, 'scenes.js'), join(dir, 'work'), join(dir, 'channel')], { encoding: 'utf8' });
}

test('$mix checker and compiler share every numeric boundary and reject malformed values before writes', () => {
  const dir = fixture();
  try {
    for (const [field, , min, max] of MIX_FIELDS) {
      for (const [value, accepted] of [[min, true], [max, true], [min - 0.01, false], [max + 0.01, false], [null, false], [true, false], ['', false]]) {
        const mix = set({}, field, value);
        const result = compile(dir, mix);
        assert.equal(result.status === 0, accepted, `${field}=${value}: ${result.stderr}`);
        const checked = spawnSync(process.execPath, [checker, join(dir, 'scenes.js'), '--draft', '--json'], { encoding: 'utf8' });
        const findings = JSON.parse(checked.stdout).findings.filter(f => f.where === 'window.MUSIC.$mix');
        assert.equal(findings.length === 0, accepted, `${field}=${value}: ${JSON.stringify(findings)}`);
      }
      assert.ok(mixFindings(set({}, field, Infinity)).length, field);
      if (field.endsWith('Seconds')) {
        assert.notEqual(compile(dir, set({}, field, 1e-7)).status, 0, field);
        assert.notEqual(compile(dir, set({}, field, 1e-6)).status, 0, field);
        assert.equal(compile(dir, set({}, field, 0.001)).status, 0, field);
      }
    }
    const before = readFileSync(join(dir, 'work/sound.env'), 'utf8');
    assert.notEqual(compile(dir, { ducking: { ratio: 21 } }).status, 0);
    assert.equal(readFileSync(join(dir, 'work/sound.env'), 'utf8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('declared filter bounds fit the installed FFmpeg consumer ranges', () => {
  for (const [filter, options] of [
    ['loudnorm', { targetLufs: 'I', truePeakDbtp: 'TP' }],
    ['sidechaincompress', { 'ducking.ratio': 'ratio', 'ducking.attackMs': 'attack', 'ducking.releaseMs': 'release' }],
  ]) {
    const help = command('ffmpeg', ['-hide_banner', '-h', `filter=${filter}`]);
    for (const [field, option] of Object.entries(options)) {
      const range = new RegExp(`^\\s+${option}\\s+.*\\(from ([\\d.-]+) to ([\\d.-]+)\\)`, 'm').exec(help.stdout + help.stderr);
      assert.ok(range, `${filter}.${option}`);
      const [, , min, max] = MIX_FIELDS.find(row => row[0] === field);
      assert.ok(min >= Number(range[1]) && max <= Number(range[2]), field);
    }
  }
});

test('every compiled minimum and maximum runs through the builder audio filter graph', () => {
  const dir = fixture();
  try {
    command('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-ac', '2', join(dir, 'work/narration.wav')]);
    for (const file of ['bed.wav', 'amb.wav']) writeFileSync(join(dir, 'work', file), readFileSync(join(dir, 'work/narration.wav')));
    writeFileSync(join(dir, 'work/cardstart.tsv'), '0\t0\n1\t0.5\n');
    writeFileSync(join(dir, 'work/bgmgate.list'), '1\t1.5\n');
    const script = `set -e\nsay() { :; }\n. work/sound.env\n${defaults}\nNT=3\nSFXIN=""\nAMBIN="-i work/amb.wav"\n${fadeStart}\n${mixStage}`;
    for (const [field, , min, max] of MIX_FIELDS) {
      for (const value of field.endsWith('Seconds') ? [min, 0.001, max] : [min, max]) {
        const mix = set({}, field, value);
        assert.equal(compile(dir, mix).status, 0);
        command('bash', ['-c', script], { cwd: dir });
        const pcm = command('ffmpeg', ['-v', 'error', '-i', 'work/mix.wav', '-f', 'f32le', '-'], { cwd: dir, encoding: null }).stdout;
        let audible = false;
        for (let i = 0; i < pcm.length; i += 4) {
          const sample = pcm.readFloatLE(i);
          assert.ok(Number.isFinite(sample), `${field}=${value}`);
          audible ||= Math.abs(sample) > 0.001;
        }
        assert.ok(audible, `${field}=${value}: mix must retain the narration`);
      }
    }
    assert.equal(compile(dir, { silenceRampSeconds: 0, endingFadeSeconds: 0, hook: { releaseSeconds: 0 } }).status, 0);
    command('bash', ['-c', script], { cwd: dir });
    const pcm = command('ffmpeg', ['-v', 'error', '-i', 'work/bed-ducked.wav', '-f', 'f32le', '-'], { cwd: dir, encoding: null }).stdout;
    const energy = (start, end) => {
      let total = 0;
      for (let i = Math.ceil(start * 48000 * 2); i < Math.floor(end * 48000 * 2); i++) total += Math.abs(pcm.readFloatLE(i * 4));
      return total;
    };
    assert.equal(energy(1.1, 1.4), 0, 'zero ramp still silences the requested music window');
    assert.ok(energy(2.7, 2.9) > 1, 'zero ending fade must keep the bed audible at the tail');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cue crossfade and bed/ambience separation boundaries use the real bed compiler', () => {
  const dir = fixture();
  try {
    command('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=24', '-ac', '2', join(dir, 'cue.wav')]);
    writeFileSync(join(dir, 'cues.tsv'), `0\t${join(dir, 'cue.wav')}\n12\t${join(dir, 'cue.wav')}\n`);
    for (const crossfade of [0, 0.001, 10]) {
      for (const separation of [0, 30]) {
        command('bash', [join(refs, 'bgm-bed.sh'), join(dir, 'bed.wav'), '24', String(-16 - separation), join(dir, 'cues.tsv')], { env: { ...process.env, BGM_CUE_XF: String(crossfade) } });
        const duration = Number(command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, 'bed.wav')]).stdout);
        assert.ok(Math.abs(duration - 24) < 0.01, `crossfade=${crossfade}: ${duration}`);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
