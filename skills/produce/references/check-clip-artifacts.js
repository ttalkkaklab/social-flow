#!/usr/bin/env node
'use strict';
/* What the clip brought back that nobody asked for — burned text, a soundtrack, a spoken line.
 *
 * Veo draws subtitles into the frame (MIT TR, 2025) and Seedance 2.0 burns captions more often
 * in portrait (vendor docs); every audio engine invents speech and music when the prompt leaves
 * room. Until now the only check was the reviewer's eyes. This one is machine-run on the clip
 * itself, right after the call returns and before the clip is accepted into the plan:
 *
 *   text    — one frame per second through tesseract (kor+eng, sparse-text mode). A frame counts
 *             when it has a readable word (2+ Hangul syllables or 3+ letters at 75+ confidence);
 *             a finding needs the word in two frames or two words in one, so a texture that
 *             happens to read as "lll" for one frame does not stop a build.
 *   audio   — ffprobe for a track, R128 integrated loudness for whether anything is on it.
 *             A clip planned silent (generateAudio:false) that carries sound is a finding.
 *   speech  — the local Qwen3-ASR (the same binary build-reel.sh aligns word cues with) on the
 *             clip audio; a transcript with words in it is invented speech on a b-roll, and the
 *             transcript is printed on a quote clip so the caller can compare it to the line.
 *
 * Findings are warnings under HITL (CLAUDE.md, assembly video checks 2026-09-14): the caller
 * shows them, the user decides to regenerate with the artifact negatives or accept. Exit 0
 * when nothing was found, 2 when something was, 1 when the clip could not be read.
 *
 *   node check-clip-artifacts.js <clip.mp4> [--expect silent|sound|speech] [--fps 1]
 *        [--lang kor+eng] [--asr auto|off] [--asr-language Korean] [--json <out.json>]
 *   node check-clip-artifacts.js --selftest
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OCR_CONF = 75;
const SILENT_LUFS = -50;          // an integrated reading under this is a track with nothing on it
const ASR_MODEL = 'Qwen/Qwen3-ASR-0.6B';   // the small one — this is detection, not a transcript to ship
const ASR_BIN = process.env.QWEN3_ASR_BIN || path.join(os.homedir(), '.local', 'bin', 'mlx-qwen3-asr');

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, opts || {}));
  if (r.error && r.error.code === 'ENOENT') throw new Error(cmd + ' is not installed');
  return r;
}

function probe(clip) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', clip]);
  if (r.status !== 0) throw new Error('ffprobe could not read ' + clip + ': ' + (r.stderr || '').trim());
  const j = JSON.parse(r.stdout);
  const types = (j.streams || []).map((s) => s.codec_type);
  return { seconds: Number(j.format && j.format.duration) || 0, video: types.includes('video'), audio: types.includes('audio') };
}

function integratedLufs(clip) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', clip, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = /"input_i"\s*:\s*"(-?[\d.]+|-inf)"/.exec(r.stderr || '');
  if (!m) return null;
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

const WORD_RE = /^(?:[가-힣]{2,}|[A-Za-z]{3,}|[가-힣A-Za-z]{3,})[.,!?…]*$/;
const JUNK_RE = /^(.)\1{2,}$/;   // "lll", "|||" — a texture read as letters

function ocrFrames(clip, fps, lang, workDir) {
  if (!(Number.isFinite(fps) && fps > 0)) throw new Error('--fps must be a positive number');
  const frames = path.join(workDir, 'frames');
  fs.mkdirSync(frames, { recursive: true });
  const r = run('ffmpeg', ['-v', 'error', '-nostdin', '-i', clip, '-vf', `fps=${fps},scale='min(1080,iw)':-2`, path.join(frames, 'f%04d.png')]);
  if (r.status !== 0) throw new Error('ffmpeg could not extract frames: ' + (r.stderr || '').trim());
  const out = [];
  for (const f of fs.readdirSync(frames).sort()) {
    const idx = Number(/f(\d+)\.png/.exec(f)[1]);
    const t = Math.round(((idx - 1) / fps) * 100) / 100;
    const o = run('tesseract', [path.join(frames, f), 'stdout', '-l', lang, '--psm', '11', 'tsv'], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (o.status !== 0) continue;
    const words = [];
    for (const line of (o.stdout || '').split('\n').slice(1)) {
      const c = line.split('\t');
      if (c.length < 12 || c[0] !== '5') continue;
      const conf = Number(c[10]);
      const text = (c[11] || '').trim();
      if (conf < OCR_CONF || !WORD_RE.test(text) || JUNK_RE.test(text)) continue;
      words.push(text.replace(/[.,!?…]+$/, ''));
    }
    if (words.length) out.push({ t, words });
  }
  return out;
}

function textFindings(frames) {
  const seen = new Map();
  frames.forEach((f) => f.words.forEach((w) => seen.set(w.toLowerCase(), (seen.get(w.toLowerCase()) || 0) + 1)));
  const solid = frames.filter((f) => f.words.length >= 2 || f.words.some((w) => seen.get(w.toLowerCase()) >= 2));
  if (!solid.length) return [];
  const span = solid.length === 1 ? `${solid[0].t}s` : `${solid[0].t}–${solid[solid.length - 1].t}s`;
  const sample = Array.from(new Set(solid.flatMap((f) => f.words))).slice(0, 6).join(' ');
  return [{ kind: 'text', what: `text in the frame at ${span} — "${sample}" (${solid.length} of ${frames.length ? frames.length : 0} frames with words). A generated clip carries no type; regenerate with the artifact negatives (subtitles, text, captions, logo, watermark) or crop it out` }];
}

function transcribe(clip, language, workDir) {
  if (!fs.existsSync(ASR_BIN)) return { ran: false, why: `no local ASR at ${ASR_BIN} (uv tool install --python 3.12 "mlx-qwen3-asr[aligner]")` };
  const wav = path.join(workDir, 'clip-audio.wav');
  const x = run('ffmpeg', ['-v', 'error', '-nostdin', '-i', clip, '-vn', '-ac', '1', '-ar', '16000', wav]);
  if (x.status !== 0) return { ran: false, why: 'ffmpeg could not extract the audio' };
  const outDir = path.join(workDir, 'asr');
  fs.mkdirSync(outDir, { recursive: true });
  const r = run(ASR_BIN, [wav, '--model', ASR_MODEL, '--language', language, '-f', 'json', '-o', outDir, '--quiet'], { timeout: 10 * 60 * 1000 });
  const jsonPath = path.join(outDir, 'clip-audio.json');
  if (r.status !== 0 || !fs.existsSync(jsonPath)) {
    const tail = (r.stderr || '').split('\n').filter((l) => l.trim() && !l.includes('%|')).slice(-3).join(' · ');
    return { ran: false, why: 'ASR failed: ' + (tail || `exit ${r.status}`) };
  }
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const text = String(j.text || (j.segments || []).map((s) => s.text || '').join(' ')).trim();
  return { ran: true, text };
}

function hasWords(text) {
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const latin = (text.match(/[A-Za-z]{2,}/g) || []).length;
  return hangul >= 4 || latin >= 2;
}

function check(clip, opts) {
  const info = probe(clip);
  if (!info.video) throw new Error(clip + ' has no video stream');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-artifacts-'));
  const result = { clip, seconds: info.seconds, expect: opts.expect, audio: { present: info.audio, lufs: null }, speech: { ran: false }, text: [], findings: [] };
  try {
    // No tesseract on this machine: the audio and speech checks still run; the text check is
    // reported as skipped rather than failing the whole read.
    try { result.text = ocrFrames(clip, opts.fps, opts.lang, workDir); result.findings.push(...textFindings(result.text)); }
    catch (e) { if (!/tesseract is not installed/.test(e.message)) throw e; result.textSkipped = e.message; }
    if (info.audio) {
      result.audio.lufs = integratedLufs(clip);
      const sounding = result.audio.lufs !== null && result.audio.lufs > SILENT_LUFS;
      if (opts.expect === 'silent' && sounding)
        result.findings.push({ kind: 'audio', what: `a soundtrack at ${result.audio.lufs} LUFS on a clip planned silent (generateAudio:false) — on a card the builder drops it, on a b-roll it would play; the call did not send the audio setting the plan recorded` });
      if (opts.asr !== 'off' && sounding && opts.expect !== 'silent') {
        result.speech = transcribe(clip, opts.asrLanguage, workDir);
        if (result.speech.ran && hasWords(result.speech.text)) {
          if (opts.expect === 'sound')
            result.findings.push({ kind: 'speech', what: `speech in the clip — "${result.speech.text.slice(0, 80)}" — a b-roll plays its own audio under nothing, so this line ships; regenerate with "no speech, no dialogue" in the Audio: sentence` });
        } else if (result.speech.ran && opts.expect === 'speech') {
          result.findings.push({ kind: 'speech', what: 'no words heard on a quote clip — the line the character was to speak is not in the audio' });
        }
      }
    } else if (opts.expect === 'sound' || opts.expect === 'speech') {
      result.findings.push({ kind: 'audio', what: `no audio track on a clip planned with sound (${opts.expect}) — a silent b-roll splices in as digital silence` });
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

function parseArgs(argv) {
  const o = { expect: 'silent', fps: 1, lang: 'kor+eng', asr: 'auto', asrLanguage: 'Korean', json: null, clip: null, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest') o.selftest = true;
    else if (a === '--expect') o.expect = argv[++i];
    else if (a === '--fps') o.fps = Number(argv[++i]);
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--asr') o.asr = argv[++i];
    else if (a === '--asr-language') o.asrLanguage = argv[++i];
    else if (a === '--json') o.json = argv[++i];
    else if (!a.startsWith('--')) o.clip = a;
  }
  if (!['silent', 'sound', 'speech'].includes(o.expect)) throw new Error('--expect is silent | sound | speech');
  return o;
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-artifacts-selftest-'));
  const font = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find((f) => fs.existsSync(f));
  if (!font) throw new Error('selftest needs a TTF font for drawtext');
  const titled = path.join(dir, 'titled.mp4');
  const clean = path.join(dir, 'clean.mp4');
  let r = run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-t', '3', '-i', 'color=c=0x334455:s=720x1280:r=24',
    '-f', 'lavfi', '-t', '3', '-i', 'sine=f=440:r=48000',
    '-vf', `drawtext=fontfile=${font}:text='THE SUBTITLE ARRIVES':fontsize=64:fontcolor=white:x=(w-tw)/2:y=h-200`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', titled]);
  if (r.status !== 0) throw new Error('could not render the titled fixture: ' + r.stderr);
  r = run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-t', '3', '-i', 'color=c=0x334455:s=720x1280:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', clean]);
  if (r.status !== 0) throw new Error('could not render the clean fixture: ' + r.stderr);
  let fails = 0;
  const ok = (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fails++; };
  const a = check(titled, { expect: 'silent', fps: 1, lang: 'kor+eng', asr: 'off' });
  ok('burned text is found', a.findings.some((f) => f.kind === 'text' && /SUBTITLE/.test(f.what)));
  ok('a soundtrack on a clip planned silent is found', a.findings.some((f) => f.kind === 'audio'));
  const b = check(clean, { expect: 'silent', fps: 1, lang: 'kor+eng', asr: 'off' });
  ok('a clean silent clip has no findings', b.findings.length === 0);
  const c = check(clean, { expect: 'sound', fps: 1, lang: 'kor+eng', asr: 'off' });
  ok('a b-roll without an audio track is found', c.findings.some((f) => f.kind === 'audio' && /no audio track/.test(f.what)));
  ok('two frames of the same word count, one frame of one word does not',
     textFindings([{ t: 0, words: ['Hello'] }, { t: 1, words: ['hello'] }]).length === 1 &&
     textFindings([{ t: 0, words: ['lll'] }]).length === 0 && textFindings([{ t: 0, words: ['Hello'] }]).length === 0);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `check-clip-artifacts selftest: ${fails} failed` : 'check-clip-artifacts selftest OK');
  process.exit(fails ? 1 : 0);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selftest) return selftest();
  if (!opts.clip) { console.error('usage: check-clip-artifacts.js <clip.mp4> [--expect silent|sound|speech] [--fps 1] [--lang kor+eng] [--asr auto|off] [--json out.json]'); process.exit(1); }
  const result = check(path.resolve(opts.clip), opts);
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(result, null, 2) + '\n');
  console.log(`${path.basename(result.clip)} · ${result.seconds}s · expected ${result.expect} · audio ${result.audio.present ? (result.audio.lufs === null ? 'present' : result.audio.lufs + ' LUFS') : 'none'} · ${result.text.length} frame(s) with words` +
              (result.speech.ran ? ` · heard "${(result.speech.text || '').slice(0, 60)}"` : result.speech.why ? ` · ASR skipped: ${result.speech.why}` : ''));
  result.findings.forEach((f) => console.log(`⚠ ${f.kind}: ${f.what}`));
  if (!result.findings.length) console.log('clean — nothing the prompt did not ask for');
  process.exit(result.findings.length ? 2 : 0);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
module.exports = { check, textFindings, hasWords };
