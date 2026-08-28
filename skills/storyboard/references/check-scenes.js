#!/usr/bin/env node
/**
 * check-scenes.js — the scenes.js contract, checked from the command line.
 *
 *   check-scenes.js <storyboard dir | scenes.js>          the findings
 *   check-scenes.js <...> --json                          machine-readable
 *   check-scenes.js --selftest                            pins the rules
 *
 * ## Why a CLI checker when storyboard.html already has a check strip
 *
 * The check strip is excellent and it is the wrong shape for two jobs. It runs in a browser,
 * so a person has to open the document to see it — which means an unattended run can't consult
 * it, and neither can a reviewer agent, and neither can a build that is about to spend twelve
 * minutes on capture. This runs the structural half of the same contract with an exit code.
 *
 * **It does not duplicate the strip's measurements.** Frame overflow, hero-stat width and
 * speech rate are computed against a rendered canvas, and re-implementing them here would
 * create exactly the mirror drift `format-lint.js` exists to police. What it checks is the
 * structure — fields that must exist, values that must come from a fixed vocabulary, and
 * references that must resolve. Those are the ones that break a build rather than look wrong.
 *
 * ## Every format constant comes from the preset
 *
 * Not one band, cap or count is written here. `format-resolve.js --json` is asked, and its
 * `pacing` block is the source. A fifth copy of those numbers is the last thing this
 * repository needs.
 *
 * Exit codes:
 *   0  no violations (warnings may still be printed)
 *   1  at least one violation
 *   3  input error, or scenes.js does not evaluate
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SELF_DIR = __dirname;
const FORMAT_RESOLVE = path.resolve(SELF_DIR, '..', '..', 'platform-guide', 'references', 'format-resolve.js');

function die(msg) {
  process.stderr.write('check-scenes: ' + msg + '\n');
  process.exit(3);
}

/* ── Vocabularies ──
   The source of truth for these words is directing-grammar.md (§size, §angle) and
   scenes-schema.md (§camera, §playback order, §the four opening strategies, §the six hook
   forms). They are vocabularies, not measurements — a value outside them is a typo or an
   invented word, and produce or the assembler will reject it later at a worse moment. */
const SIZES = ['els', 'ls', 'ws', 'fs', 'mfs', 'ms', 'mcu', 'cu', 'choker', 'ecu', 'insert',
               'two', 'three', 'ots', 'pov', 'back', 'cutaway', 'reaction'];
const ANGLES = ['eye', 'low', 'high', 'dutch', 'overhead', 'ground', 'over'];
const BEATS = ['hook', 'hooking', 'result', 'body', 'turn', 'cta'];
const ARCS = ['answer-first', 'story'];
const HOOK_TYPES = ['fear', 'empathy', 'curiosity', 'spoiler'];
const HOOK_FORMS = ['paradox', 'gap', 'payoff', 'identify', 'number', 'secret'];
const TYPES = ['cover', 'hooking', 'points', 'quote', 'broll', 'outro'];

function readScenes(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  } catch (e) {
    die('scenes.js does not evaluate: ' + (e && e.message));
  }
  if (!Array.isArray(sandbox.window.SCENES)) die('scenes.js has no window.SCENES array');
  return sandbox.window;
}

/** The format contract, straight from the preset — never a copy kept here. */
function formatOf(scenesPath) {
  try {
    const out = execFileSync('node', [FORMAT_RESOLVE, scenesPath, '--json'], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    die('format-resolve.js could not read the format: ' + (e && e.message));
  }
}

/**
 * Runs the structural contract. `fmt` is the resolved preset; every band comes from it.
 * Returns findings — `bad` is a violation, `warn` is worth a look.
 */
function check(win, fmt) {
  const scenes = win.SCENES;
  const out = [];
  const bad = (where, what) => out.push({ level: 'bad', where, what });
  const warn = (where, what) => out.push({ level: 'warn', where, what });

  const pacing = fmt.pacing || {};
  const main = scenes.filter((s) => s.type !== 'broll' && s.type !== 'outro');
  const cover = scenes.find((s) => s.type === 'cover');

  // ── Episode level ──
  if (!cover) bad('episode', 'no cover shot — every episode opens on one');
  if (pacing.shotMin && main.length < pacing.shotMin)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.shotMin}~${pacing.shotMax}`);
  if (pacing.shotMax && main.length > pacing.shotMax)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.shotMin}~${pacing.shotMax}`);

  if (cover) {
    if (cover.arc && ARCS.indexOf(cover.arc) === -1)
      bad('cover', `arc "${cover.arc}" is outside ${ARCS.join(' · ')}`);
    if (cover.hookType && HOOK_TYPES.indexOf(cover.hookType) === -1)
      bad('cover', `hookType "${cover.hookType}" is outside ${HOOK_TYPES.join(' · ')}`);
    if (cover.hookForm && HOOK_FORMS.indexOf(cover.hookForm) === -1)
      bad('cover', `hookForm "${cover.hookForm}" is outside ${HOOK_FORMS.join(' · ')}`);
    if (!cover.hookType) warn('cover', 'no hookType — an opening with none of the four strategies');
    if (!cover.hookForm) warn('cover', 'no hookForm — the shape of the first line was never picked');
  }

  // The generated-video cap is a user directive, and the number lives in the preset.
  const videoSlots = scenes.filter((s) => {
    const v = s.visual || {};
    return s.type === 'broll' || !!v.video;
  });
  if (videoSlots.length > 2)
    bad('episode', `${videoSlots.length} generated-video slots — b-roll and motion backgrounds ` +
                   'count together and cap at 2 (scenes-schema §motion background)');

  // ── Shot level ──
  const brollAfters = [];
  scenes.forEach((s, i) => {
    const n = i + 1;
    const where = 'shot ' + n;
    const v = s.visual || {};
    const shot = s.shot || {};

    if (!s.type) { bad(where, 'no type'); return; }
    if (TYPES.indexOf(s.type) === -1) bad(where, `type "${s.type}" is outside ${TYPES.join(' · ')}`);

    if (s.beat && BEATS.indexOf(s.beat) === -1)
      bad(where, `beat "${s.beat}" is outside ${BEATS.join(' · ')}`);
    if (shot.size && SIZES.indexOf(shot.size) === -1)
      bad(where, `shot.size "${shot.size}" is not a size word (directing-grammar §size)`);
    if (shot.angle && ANGLES.indexOf(shot.angle) === -1)
      bad(where, `shot.angle "${shot.angle}" is not an angle word (directing-grammar §angle)`);
    if (s.type !== 'outro' && !shot.feel)
      warn(where, 'no shot.feel — the camera was chosen without saying what it should make anyone feel');

    // Scene length against the preset band.
    const dur = Number(s.duration);
    if (s.type !== 'outro') {
      if (!Number.isFinite(dur) || dur <= 0) {
        if (s.type !== 'broll') warn(where, 'no duration');
      } else if (pacing.sceneMin && (dur < pacing.sceneMin || dur > pacing.sceneMax)) {
        warn(where, `duration ${dur}s — the ${fmt.label} band is ${pacing.sceneMin}~${pacing.sceneMax}s`);
      }
    }

    // Narration segments — the tts spelling is what the engine actually reads.
    (s.narration || []).forEach((seg, j) => {
      if (!seg || typeof seg !== 'object') { bad(where, `narration[${j}] is not an object`); return; }
      if (!seg.tts) bad(where, `narration[${j}] has no tts — the engine reads that field`);
      if (!seg.sub) warn(where, `narration[${j}] has no sub — the subtitle falls back to tts spelling`);
    });

    // b-roll's own contract — the parts that break the splice rather than look wrong.
    if (s.type === 'broll') {
      if ((s.narration || []).length)
        bad(where, 'b-roll carries narration — the splice uses the clip\'s own audio (absolute rule 9)');
      if (s.after === undefined || s.after === null) bad(where, 'b-roll has no `after` — nothing says where it cuts in');
      else {
        if (brollAfters.indexOf(s.after) !== -1)
          bad(where, `two b-roll slots share after: ${s.after} — the insert order is undefined`);
        brollAfters.push(s.after);
        const target = scenes[s.after];
        if (!target) bad(where, `after: ${s.after} points at no scene`);
        else if (target.type === 'quote')
          bad(where, `after: ${s.after} is a quote scene — it has no background photo to use as the source`);
      }
      if (!v.src) warn(where, 'b-roll has no src — the source still is what the previous scene showed');
    }

    // Every shot that becomes a generated video leaves the storyboard with its prompt stored
    // and its four camera slots filled — the storyboard is where that is still free to fix.
    const isGenerated = s.type === 'broll' || !!v.video ||
                        (s.type === 'quote' && v.clip && typeof v.clip === 'object');
    if (isGenerated) {
      const cam = v.camera || {};
      ['movement', 'speed', 'framing', 'end'].forEach((slot) => {
        if (!cam[slot]) bad(where, `visual.camera.${slot} is empty — a generated shot leaves here with all four filled`);
      });
      const prompt = v.prompt || (v.video && v.video.prompt) ||
                     (v.clip && typeof v.clip === 'object' && v.clip.prompt);
      if (!prompt) bad(where, 'no stored clip prompt — produce sends this verbatim (scenes-schema §clip prompt)');
      if (!v.audio && s.type !== 'quote')
        warn(where, 'no visual.audio — the engine invents a soundtrack under the narration');
    }

    // A slide names its file and everything it will draw.
    if (v.slide) {
      if (!v.slide.file) bad(where, 'visual.slide has no file');
      if (!v.slide.plan) warn(where, 'visual.slide has no plan — the approval screen approves that line');
    }

    // A music cue that names nothing leaves the bed where it was, silently.
    if (s.sound && s.sound.cue) {
      const cues = win.MUSIC && typeof win.MUSIC === 'object' ? Object.keys(win.MUSIC) : [];
      if (cues.indexOf(s.sound.cue) === -1)
        bad(where, `sound.cue "${s.sound.cue}" is not in window.MUSIC — the bed stays where it was`);
    }
  });

  return out;
}

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };
  const fmt = { label: 'test', pacing: { sceneMin: 4, sceneMax: 13, shotMin: 4, shotMax: 7 } };
  const run = (scenes, extra) => check(Object.assign({ SCENES: scenes }, extra || {}), fmt);
  const has = (findings, re) => findings.some((f) => re.test(f.what));
  const bads = (findings) => findings.filter((f) => f.level === 'bad');

  const goodShot = {
    type: 'points', duration: 6, beat: 'body',
    shot: { feel: 'relief', size: 'mcu', angle: 'eye' },
    narration: [{ tts: '가', sub: '가' }], visual: {}
  };
  const cover = { type: 'cover', duration: 5, beat: 'hook', arc: 'answer-first',
                  hookType: 'curiosity', hookForm: 'gap',
                  shot: { feel: 'x', size: 'mcu', angle: 'eye' },
                  narration: [{ tts: '가', sub: '가' }], visual: {} };

  ok('a clean episode has no violations',
     bads(run([cover, goodShot, goodShot, goodShot])).length === 0);
  ok('a missing cover is a violation', has(bads(run([goodShot])), /no cover/));
  ok('an invented size word is caught',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', size: 'closeup' } })])), /size "closeup"/));
  ok('an invented angle word is caught',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', angle: 'tilted' } })])), /angle "tilted"/));
  ok('an invented beat is caught',
     has(bads(run([cover, Object.assign({}, goodShot, { beat: 'middle' })])), /beat "middle"/));
  ok('a hookForm outside the six is caught',
     has(bads(run([Object.assign({}, cover, { hookForm: 'shock' })])), /hookForm "shock"/));

  // narration
  ok('a narration segment with no tts is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { narration: [{ sub: '가' }] })])), /no tts/));

  // b-roll
  const broll = { type: 'broll', after: 0, duration: 4, narration: [],
                  shot: { feel: 'x', size: 'mcu', angle: 'eye' },
                  visual: { src: 'images/scene-1.png', prompt: 'p', audio: 'a',
                            camera: { movement: 'dolly in', speed: 'slow', framing: 'chest-up', end: 'centred' } } };
  ok('a well-formed b-roll passes', bads(run([cover, goodShot, broll])).length === 0);
  ok('b-roll carrying narration is a violation',
     has(bads(run([cover, goodShot, Object.assign({}, broll, { narration: [{ tts: 'x', sub: 'x' }] })])),
         /uses the clip's own audio/));
  ok('two b-roll slots on the same after is a violation',
     has(bads(run([cover, goodShot, broll, Object.assign({}, broll)])), /share after/));
  ok('b-roll after a quote scene is a violation',
     has(bads(run([Object.assign({}, cover, { type: 'quote' }), cover,
                   Object.assign({}, broll, { after: 0 })])), /quote scene/));

  // generated video
  const noSlots = Object.assign({}, goodShot, { visual: { video: { prompt: 'p' }, audio: 'a' } });
  ok('a generated shot with empty camera slots is a violation',
     bads(run([cover, noSlots])).filter((f) => /visual\.camera\./.test(f.what)).length === 4);
  ok('a generated shot with no stored prompt is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, {
       visual: { video: {}, audio: 'a',
                 camera: { movement: 'a', speed: 'b', framing: 'c', end: 'd' } } })])),
       /no stored clip prompt/));

  // the combined cap
  const three = [cover, noSlots, noSlots, noSlots];
  ok('more than two generated-video slots is a violation',
     has(bads(run(three)), /cap at 2/));

  // music cues
  ok('a cue naming nothing in window.MUSIC is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { sound: { cue: 'tense' } })], { MUSIC: { base: {} } })),
         /not in window\.MUSIC/));
  ok('a cue that exists passes',
     !has(bads(run([cover, Object.assign({}, goodShot, { sound: { cue: 'base' } })], { MUSIC: { base: {} } })),
          /not in window\.MUSIC/));

  // Bands come from the preset, never from this file.
  const src = fs.readFileSync(__filename, 'utf8');
  ok('no length band is hardcoded here',
     !/sceneMin\s*[:=]\s*\d/.test(src.replace(/pacing:\s*\{[^}]*\}/g, '')));

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('check-scenes selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: check-scenes.js <storyboard dir | scenes.js> [--json]');
  if (!fs.existsSync(target)) die('path not found: ' + target);
  const scenesPath = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  if (!fs.existsSync(scenesPath)) die('scenes.js not found: ' + scenesPath);

  const win = readScenes(scenesPath);
  const fmt = formatOf(scenesPath);
  const findings = check(win, fmt);
  const bad = findings.filter((f) => f.level === 'bad');
  const warn = findings.filter((f) => f.level === 'warn');

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify({
      format: fmt.format, shots: win.SCENES.length,
      violations: bad.length, warnings: warn.length, findings
    }, null, 2) + '\n');
    process.exit(bad.length ? 1 : 0);
  }

  const lines = ['scenes.js contract — ' + fmt.label + ' · ' + win.SCENES.length + ' shots', ''];
  if (!findings.length) {
    lines.push('  Structure, vocabularies and references all check out.');
    lines.push('  Frame overflow, hero-stat width and speech rate are measured against the');
    lines.push('  rendered canvas — open storyboard.html for those.');
  } else {
    // One episode-wide mistake shows up once per shot, and printing it 25 times buries
    // everything else. Same finding, same level → one line naming the shots it hit.
    const groups = new Map();
    bad.concat(warn).forEach((f) => {
      const key = f.level + ' ' + f.what;
      const g = groups.get(key) || { level: f.level, what: f.what, wheres: [] };
      g.wheres.push(f.where);
      groups.set(key, g);
    });
    groups.forEach((g) => {
      const mark = g.level === 'bad' ? '!' : '·';
      if (g.wheres.length === 1) {
        lines.push('  ' + mark + ' ' + g.wheres[0].padEnd(10) + ' ' + g.what);
      } else {
        const shown = g.wheres.slice(0, 6).join(', ') + (g.wheres.length > 6 ? ` … +${g.wheres.length - 6}` : '');
        lines.push('  ' + mark + ' ×' + String(g.wheres.length).padEnd(8) + ' ' + g.what);
        lines.push('  ' + ' '.repeat(11) + shown);
      }
    });
    lines.push('');
    lines.push('  ' + bad.length + ' violation(s), ' + warn.length + ' to look at.');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad.length ? 1 : 0);
}

main();
