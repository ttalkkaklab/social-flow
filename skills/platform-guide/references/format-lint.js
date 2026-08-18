#!/usr/bin/env node
/**
 * format-lint.js — checks the inline mirrors against the presets. Read-only.
 *
 *   format-lint.js            prints diverging pairs, exit 1 if any
 *   format-lint.js --list     prints every rule and its actual value (constant inventory)
 *
 * ## Why mirrors exist
 *
 * Browser templates can't read formats.js — there is no <script src> path from
 * data/<channel>/<topic>/ to the plugin root. Shell builders don't load node
 * modules either. So the same constant lives in two places: the preset and the
 * template/builder. Duplicate bookkeeping always drifts, so this linter does
 * the checking instead of human eyes.
 *
 * ## The first run is the inventory
 *
 * If a diverging pair shows up, it's not a regression this work created — it's
 * **drift that was already there**. Whether to fix the mirror or adjust the
 * preset is a human call.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FORMATS } = require('./formats.js');

const ROOT = path.resolve(__dirname, '../../..');
const S = FORMATS['shorts-9x16'];

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
};

/** String-compare with normalized decimal places — 3.0 vs 3 must not count as drift. */
const fix = (v, d) => Number(v).toFixed(d);

/** Derived percent: absolute px / base edge × 100. Font ratios use 4 decimals, the rest 2. */
const pct = (px, base, d = 2) => fix((px / base) * 100, d);
const ratio = (px, base) => fix(px / base, 4);

/**
 * One rule = { name, file, regex, expected value }.
 * The regex's first capture group is the actual value. The expectation derives from the preset.
 */
const RULES = [
  // ── Builder inline defaults (mirror keys) ──────────────────────────
  { name: 'build-reel FPS', file: 'skills/produce/references/build-reel.sh',
    re: /FPS=\$\{FPS:-(\d+)\}/, want: String(S.canvas.fps) },
  { name: 'build-reel MAX_DUR', file: 'skills/produce/references/build-reel.sh',
    re: /MAX_DUR=\$\{MAX_DUR:-([\d.]+)\}/, want: fix(S.pacing.sceneMax, 1) },
  { name: 'build-reel SUB', file: 'skills/produce/references/build-reel.sh',
    re: /\bSUB=\$\{SUB:-(\d)\}/, want: '1' },
  { name: 'build-reel BURN', file: 'skills/produce/references/build-reel.sh',
    re: /BURN=\$\{BURN:-(\d)\}/, want: S.burn ? '1' : '0' },
  { name: 'build-reel ZOOM_SPAN', file: 'skills/produce/references/build-reel.sh',
    re: /ZOOM_SPAN=\$\{ZOOM_SPAN:-([\d.]+)\}/, want: String(S.kenburns.zoomSpan) },
  { name: 'build-reel W', file: 'skills/produce/references/build-reel.sh',
    re: /^W=\$\{W:-(\d+)\}/m, want: String(S.canvas.w) },
  { name: 'build-reel H', file: 'skills/produce/references/build-reel.sh',
    re: /^H=\$\{H:-(\d+)\}/m, want: String(S.canvas.h) },
  { name: 'build-reel ZOOM_BASE', file: 'skills/produce/references/build-reel.sh',
    re: /^ZOOM_BASE=\$\{ZOOM_BASE:-(\d+x\d+)\}/m, want: S.image.zoomBase },
  { name: 'build-screencast W', file: 'skills/produce/references/build-screencast.sh',
    re: /^W=\$\{W:-(\d+)\}/m, want: String(S.canvas.w) },
  { name: 'build-screencast H', file: 'skills/produce/references/build-screencast.sh',
    re: /^H=\$\{H:-(\d+)\}/m, want: String(S.canvas.h) },
  { name: 'build-outro ZOOM_BASE', file: 'skills/produce/references/build-outro.sh',
    re: /^ZOOM_BASE=\$\{ZOOM_BASE:-(\d+x\d+)\}/m, want: S.image.zoomBase },
  { name: 'build-screencast FPS', file: 'skills/produce/references/build-screencast.sh',
    re: /FPS=\$\{FPS:-(\d+)\}/, want: String(S.canvas.fps) },
  { name: 'build-screencast MAX_SCENE', file: 'skills/produce/references/build-screencast.sh',
    re: /MAX_SCENE=\$\{MAX_SCENE:-(\d+)\}/, want: String(S.pacing.recSceneMax) },
  { name: 'build-screencast SHRINK_WARN', file: 'skills/produce/references/build-screencast.sh',
    re: /SHRINK_WARN=\$\{SHRINK_WARN:-([\d.]+)\}/, want: fix(S.guards.shrinkWarn, 1) },
  { name: 'build-screencast TOTAL_HARD', file: 'skills/produce/references/build-screencast.sh',
    re: /BEGIN\{exit !\(t>(\d+)\)\}/, want: String(S.pacing.totalHard) },
  { name: 'capture-frames CAP_W', file: 'skills/produce/references/capture-frames.sh',
    re: /CAP_W="\$\{CAP_W:-(\d+)\}"/, want: String(S.capture.w) },
  { name: 'capture-frames CAP_H', file: 'skills/produce/references/capture-frames.sh',
    re: /CAP_H="\$\{CAP_H:-(\d+)\}"/, want: String(S.capture.h) },

  // ── video-template :root tokens ────────────────────────────────────
  { name: 'video-template --w', file: 'skills/produce/references/video-template.html',
    re: /--w:(\d+)px/, want: String(S.canvas.w) },
  { name: 'video-template --h', file: 'skills/produce/references/video-template.html',
    re: /--h:(\d+)px/, want: String(S.canvas.h) },
  { name: 'video-template --zone-x', file: 'skills/produce/references/video-template.html',
    re: /--zone-x:(\d+)px/, want: String(S.zone.x) },
  { name: 'video-template --zone-top', file: 'skills/produce/references/video-template.html',
    re: /--zone-top:(\d+)px/, want: String(S.zone.top) },
  { name: 'video-template --zone-bottom', file: 'skills/produce/references/video-template.html',
    re: /--zone-bottom:(\d+)px/, want: String(S.zone.bottom) },

  // ── ASS Style — builder inline vs the preset sub block ─────────────
  { name: 'build-reel SUB_SIZE', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_SIZE=\$\{SUB_SIZE:-(\d+)\}/m, want: String(S.sub.fontSize) },
  { name: 'build-reel SUB_ML', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_ML=\$\{SUB_ML:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-reel SUB_MR', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_MR=\$\{SUB_MR:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-reel SUB_MV', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_MV=\$\{SUB_MV:-(\d+)\}/m, want: String(S.sub.marginV) },
  { name: 'build-reel SUB_OUT', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_OUT=\$\{SUB_OUT:-(\d+)\}/m, want: String(S.sub.outline) },
  { name: 'build-reel SUB_SHA', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_SHA=\$\{SUB_SHA:-([\d.]+)\}/m, want: fix(S.sub.shadow, 1) },
  { name: 'build-screencast SUB_SIZE', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_SIZE=\$\{SUB_SIZE:-(\d+)\}/m, want: String(S.sub.fontSize) },
  { name: 'build-screencast SUB_ML', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_ML=\$\{SUB_ML:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-screencast SUB_MR', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_MR=\$\{SUB_MR:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-screencast SUB_MV', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_MV=\$\{SUB_MV:-(\d+)\}/m, want: String(S.sub.marginV) },
  { name: 'build-screencast SUB_OUT', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_OUT=\$\{SUB_OUT:-(\d+)\}/m, want: String(S.sub.outline) },
  { name: 'build-screencast SUB_SHA', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_SHA=\$\{SUB_SHA:-([\d.]+)\}/m, want: fix(S.sub.shadow, 1) },

  // ── Inline defaults created by the stage-4 gates ───────────────────
  { name: 'build-reel OUTRO_ASSET', file: 'skills/produce/references/build-reel.sh',
    re: /^OUTRO_ASSET=\$\{OUTRO_ASSET:-([^}]+)\}/m, want: S.outroAsset },
  { name: 'build-screencast OUTRO_ASSET', file: 'skills/produce/references/build-screencast.sh',
    re: /^OUTRO_ASSET=\$\{OUTRO_ASSET:-([^}]+)\}/m, want: S.outroAsset },
  { name: 'build-reel STRICT_DIM', file: 'skills/produce/references/build-reel.sh',
    re: /^STRICT_DIM=\$\{STRICT_DIM:-(\d)\}/m, want: String(S.guards.strictDim) },
  { name: 'build-screencast STRICT_DIM', file: 'skills/produce/references/build-screencast.sh',
    re: /^STRICT_DIM=\$\{STRICT_DIM:-(\d)\}/m, want: String(S.guards.strictDim) },
  { name: 'splice-clip STRICT_DIM', file: 'skills/produce/references/splice-clip.sh',
    re: /^STRICT_DIM=\$\{STRICT_DIM:-(\d)\}/m, want: String(S.guards.strictDim) },
  { name: 'splice-clip W', file: 'skills/produce/references/splice-clip.sh',
    re: /^W=\$\{W:-(\d+)\}/m, want: String(S.canvas.w) },
  { name: 'splice-clip H', file: 'skills/produce/references/splice-clip.sh',
    re: /H=\$\{H:-(\d+)\}/, want: String(S.canvas.h) },
  // PlayRes now uses the canvas variables directly — if the preset's playResX
  // diverges from canvas.w the subtitle coordinate system splits from the
  // canvas, so that equation is enforced here.
  { name: 'preset playResX == canvas.w', file: 'skills/platform-guide/references/formats.js',
    re: /playResX:\s*(\d+)/, want: String(S.canvas.w) },
  { name: 'preset playResY == canvas.h', file: 'skills/platform-guide/references/formats.js',
    re: /playResY:\s*(\d+)/, want: String(S.canvas.h) },

  // ── storyboard scene-frame template derived percents ───────────────
  { name: 'scene-frame .fzone left/right %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.fzone \{[\s\S]{0,120}?left: ([\d.]+)%/, want: pct(S.zone.x, S.canvas.w) },
  { name: 'scene-frame .fzone top %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.fzone \{[\s\S]{0,160}?top: ([\d.]+)%/, want: pct(S.zone.top, S.canvas.h) },
  { name: 'scene-frame .fzone bottom %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.fzone \{[\s\S]{0,200}?bottom: ([\d.]+)%/, want: pct(S.zone.bottom, S.canvas.h) },
  { name: 'scene-frame .f-sub left %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.f-sub \{[\s\S]{0,120}?left: ([\d.]+)%/, want: pct(S.sub.marginLR, S.canvas.w) },
  { name: 'scene-frame .f-sub bottom %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.f-sub \{[\s\S]{0,180}?bottom: ([\d.]+)%/, want: pct(S.sub.marginV, S.canvas.h) },
  { name: 'scene-frame .f-sub font ratio', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.f-sub \{[\s\S]{0,260}?font-size: calc\(var\(--fw\) \* ([\d.]+)\)/,
    want: ratio(S.sub.fontSize, S.canvas.w) },
  { name: 'scene-frame #fr-probe --fw', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /#fr-probe \{[^}]*--fw:\s*(\d+)px/, want: String(S.canvas.w) },

  // ── Thresholds and dimensions embedded in docs ─────────────────────
  { name: 'screencast-pipeline shrink threshold', file: 'skills/produce/references/screencast-pipeline.md',
    re: /축소 배율 \(>([\d.]+)\)|> ?([\d.]+)\)[^\n]*글씨|\(>([\d.]+)\)/,
    want: fix(S.guards.shrinkWarn, 1), optional: true },
];

// ── The format mirror in storyboard.html's cross-check badge ─────────
//
// The browser has no path to formats.js (the document lives under
// data/<channel>/…), so the template carries a copy. **When that copy drifts,
// the authoring stage gets checked against the old bands and passes anyway** —
// that's how total length 25~45 survived on 2026-08-17. The preset and
// produce said 35~75, but the storyboard side measured the old values, and
// back then the linter only looked at the builder shells, not this template.
// This closes that blind spot.
const SB_TPL = 'skills/storyboard/references/storyboard-html-template.html';

for (const [key, f] of Object.entries(FORMATS)) {
  // Search only inside that format's block — mirror entries have no nested
  // objects, so `[^}]*` can't cross the block
  const blk = `"${key}":\\s*\\{[^}]*`;
  const rule = (field, want) =>
    RULES.push({
      name: `storyboard.html ${key} ${field}`,
      file: SB_TPL,
      re: new RegExp(blk + field + ':\\s*(null|[\\d.]+)'),
      want: String(want),
    });
  const p = f.pacing;
  const rec = f.chaptersRec || null;
  rule('totalMin', p.totalMin);
  rule('totalMax', p.totalMax);
  rule('totalHard', p.totalHard);
  rule('sceneCountMin', p.sceneCountMin);
  rule('sceneCountMax', p.sceneCountMax);
  rule('sceneMax', p.sceneMax);
  rule('recSceneMax', p.recSceneMax === null ? 'null' : p.recSceneMax);
  rule('capCover', p.charCap.cover);
  rule('capBody', p.charCap.body);
  rule('sentMin', p.sentMin);
  rule('sentMax', p.sentMax);
  // slot count = total seconds / 8 (generation is fixed at 8s)
  rule('videoMax', f.video.generatedSecondsMax / 8);
  rule('chapterMin', rec ? rec.min : 'null');
  rule('chapterMax', rec ? rec.targetMax : 'null');
}

// ── video-template landscape layout mirror (&format=wide) ──────────────
//
// Portrait has its `:root` tokens checked against the preset (RULES above),
// but landscape keeps canvas, zone, and a dozen font sizes in one CSS block.
// If that copy drifts from the preset, **only landscape episodes** silently
// draw text in the wrong place — portrait stays fine, so no symptom shows.
//
// The preset holds fonts as ratios (absolute px / 1920), so convert back to
// px here. Rounding is needed because ratios are cut at 4 decimals —
// 0.0771 × 1920 = 148.032.
const VT = 'skills/produce/references/video-template.html';
const WIDE = FORMATS['youtube-long-16x9'];

if (WIDE) {
  // Canvas and zone — search only inside the `:root.wide{…}` block (keep it
  // separate from the default :root tokens)
  const rootWide = (token, want) =>
    RULES.push({
      name: `video-template wide ${token}`,
      file: VT,
      re: new RegExp(':root\\.wide\\{[^}]*' + token + ':(\\d+)px'),
      want: String(want),
    });
  rootWide('--w', WIDE.canvas.w);
  rootWide('--h', WIDE.canvas.h);
  rootWide('--zone-x', WIDE.zone.x);
  rootWide('--zone-top', WIDE.zone.top);
  rootWide('--zone-bottom', WIDE.zone.bottom);

  // Fonts — line-start anchor (`\n` + indent) avoids `.tight2 body.wide .stat{…}`.
  // Without the anchor a shrink step poses as the base value and passes.
  const wideFont = (sel, ratioKey) =>
    RULES.push({
      name: `video-template wide ${ratioKey}`,
      file: VT,
      re: new RegExp('\\n\\s*body\\.wide ' + sel + '\\{font-size:(\\d+)px'),
      want: String(Math.round(WIDE.fonts[ratioKey] * WIDE.canvas.w)),
    });
  wideFont('\\.kicker', 'kicker');
  wideFont('\\.cover-title', 'coverTitle');
  wideFont('\\.stat', 'stat');
  wideFont('\\.stat-label', 'statLabel');
  wideFont('\\.points-title', 'title');
  wideFont('\\.cap \\.t', 'capTitle');
  wideFont('\\.cap \\.d', 'capDesc');
  wideFont('\\.footnote', 'foot');

  // The scene-frame template's landscape frame — these ratios use **frame
  // width** as the base edge, so the preset fonts values apply as-is (both are
  // absolute px / 1920). The zone is in percent, with a different base edge
  // per axis. Compare at 4 decimals — CSS's `.0130` and JS's 0.013 are the
  // same value, and literal string comparison would flag that notation gap as
  // drift.
  const sbWide = (sel, want) =>
    RULES.push({
      name: `scene-frame wide ${sel}`,
      file: SB_TPL,
      re: new RegExp('\\.fr\\.wide ' + sel + '[^}]*?(?:font-size: )?calc\\(var\\(--fw\\) \\* ([\\d.]+)\\)'),
      want: fix(want, 4),
    });
  sbWide('\\.f-title', WIDE.fonts.coverTitle);
  sbWide('\\.f-stat', WIDE.fonts.stat);
  sbWide('\\.f-statlabel', WIDE.fonts.statLabel);
  sbWide('\\.f-ptitle', WIDE.fonts.title);
  sbWide('\\.f-cap \\.t', WIDE.fonts.capTitle);
  sbWide('\\.f-cap \\.d', WIDE.fonts.capDesc);
  sbWide('\\.f-foot', WIDE.fonts.foot);

  const sbZone = (name, re, want) => RULES.push({ name: `scene-frame wide ${name}`, file: SB_TPL, re, want });
  sbZone('zone left %', /\.fr\.wide \.fzone \{ left: ([\d.]+)%/, pct(WIDE.zone.x, WIDE.canvas.w));
  sbZone('zone top %', /\.fr\.wide \.fzone \{[^}]*top: ([\d.]+)%/, pct(WIDE.zone.top, WIDE.canvas.h));
  sbZone('zone bottom %', /\.fr\.wide \.fzone \{[^}]*bottom: ([\d.]+)%/, pct(WIDE.zone.bottom, WIDE.canvas.h));
  // Probe canvas width — the base edge for font ratios; if this drifts, the
  // overflow measurement is wrong wholesale
  sbZone('probe --fw', /probe\.style\.setProperty\("--fw", "(\d+)px"\)/, String(WIDE.canvas.w));
}

/**
 * Cross-check of the ASS header/Style between the two builders. Independent
 * of the preset, they must match **each other** — fix only one and filmed
 * and generated episodes get subtitles in different fonts and positions.
 */
const SUB_KEYS = ['SUB_SIZE', 'SUB_ML', 'SUB_MR', 'SUB_MV', 'SUB_OUT', 'SUB_SHA'];

function crossCheckAss(issues) {
  const a = read('skills/produce/references/build-reel.sh');
  const b = read('skills/produce/references/build-screencast.sh');
  if (!a || !b) return;
  const grab = (src) => {
    const m = src.match(/printf "Style: Sub,%s,([^"]*)"/);
    return m ? m[1] : null;
  };
  const ra = grab(a);
  const rb = grab(b);

  // The inline-default layer — since the Style line became variables
  // (`${SUB_MV}`), string comparison no longer sees the values. If the two
  // builders share the variables but differ in defaults, filmed and generated
  // subtitles sit in different places while the Style lines look identical.
  // This plugs that hole.
  for (const k of SUB_KEYS) {
    const re = new RegExp('^' + k + '=\\$\\{' + k + ':-([\\d.]+)\\}', 'm');
    const va = a.match(re);
    const vb = b.match(re);
    if (!va || !vb) {
      issues.push({ name: `${k} inline default`, got: `reel ${va ? va[1] : '(none)'} · screencast ${vb ? vb[1] : '(none)'}`,
                    want: 'declared in both builders' });
    } else if (va[1] !== vb[1]) {
      issues.push({ name: `${k} inline default cross-check`, got: `build-screencast: ${vb[1]}`, want: `build-reel: ${va[1]}` });
    }
  }

  if (ra === null || rb === null) {
    issues.push({ name: 'ASS Style cross-check', got: '(not found)', want: 'a Style: Sub line in both builders' });
    return;
  }
  if (ra !== rb) {
    issues.push({ name: 'ASS Style cross-check', got: `build-screencast: ${rb}`, want: `build-reel: ${ra}` });
  }
}

function main() {
  const listOnly = process.argv.includes('--list');
  const issues = [];
  const rows = [];

  for (const r of RULES) {
    const src = read(r.file);
    if (src === null) {
      issues.push({ name: r.name, got: '(file missing)', want: r.file });
      continue;
    }
    const m = src.match(r.re);
    // Rules with multiple capture groups use the first one that matched.
    let got = m ? (m.slice(1).find((x) => x !== undefined) ?? null) : null;
    // CSS drops the leading zero (.0537). Don't read that notation gap as drift.
    if (got !== null && /^\.\d+$/.test(got)) got = '0' + got;
    if (got === null) {
      if (!r.optional) issues.push({ name: r.name, got: '(regex mismatch)', want: r.want });
      continue;
    }
    rows.push({ name: r.name, got, want: r.want, ok: got === r.want });
    if (got !== r.want) issues.push({ name: r.name, got, want: r.want });
  }

  crossCheckAss(issues);

  if (listOnly) {
    for (const row of rows) {
      process.stdout.write(
        `${row.ok ? '  ' : '✗ '}${row.name.padEnd(34)} ${String(row.got).padEnd(18)} ${row.ok ? '' : 'want ' + row.want}\n`,
      );
    }
    process.stdout.write(`\n${rows.length} rules · ${issues.length} mismatches\n`);
  }

  if (issues.length) {
    if (!listOnly) {
      process.stderr.write('format-lint: inline mirrors diverge from the presets\n');
      for (const i of issues) {
        process.stderr.write(`  ✗ ${i.name}: actual ${i.got} · preset ${i.want}\n`);
      }
      process.stderr.write(
        '\nA human decides which side is right — fixing the preset can break zero regression.\n',
      );
    }
    process.exit(1);
  }
  if (!listOnly) process.stdout.write(`format-lint: ${rows.length} mirrors match\n`);
}

if (require.main === module) main();

module.exports = { RULES };
