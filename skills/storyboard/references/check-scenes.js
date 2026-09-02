#!/usr/bin/env node
/**
 * check-scenes.js — the scenes.js contract, checked from the command line.
 *
 *   check-scenes.js <storyboard dir | scenes.js>          the findings
 *   check-scenes.js <...> --json                          machine-readable
 *   check-scenes.js <...> --draft                         the story pass (storyboard §4a)
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
 * No band or count is written here. `format-resolve.js --json` is asked, and its `pacing`
 * block is the source. A fifth copy of those numbers is the last thing this repository needs.
 * Generated-video defaults come from the format preset. A channel profile may override that
 * cap and add a minimum true-motion ratio; scenes.js carries the same policy for the browser
 * check strip, and this CLI verifies that the two copies match.
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
const BEATS = ['hook', 'hooking', 'drip', 'result', 'body', 'turn', 'cta'];
const LONG_FORM_BEATS = ['hooking', 'result', 'body', 'turn'];
const ARCS = ['answer-first', 'story'];
const HOOK_TYPES = ['fear', 'empathy', 'curiosity', 'spoiler'];
const HOOK_FORMS = ['paradox', 'gap', 'payoff', 'identify', 'number', 'secret'];
const TYPES = ['cover', 'hooking', 'points', 'quote', 'broll', 'outro'];
const COMPREHENSION_MODES = ['informational', 'narrative'];
const SLIDE_TREATMENTS = ['editorial', 'photo-action', 'footage'];
const EDITORIAL_ROLES = ['evidence', 'relationship', 'mechanism', 'timeline', 'statistic', 'transition', 'verdict'];
const INFO_TYPES = ['other', 'timeline', 'statistic', 'principle'];
const INFO_ROLE = { timeline: 'timeline', statistic: 'statistic', principle: 'mechanism' };
const INFO_PRIMITIVES = {
  timeline: ['date-enter', 'range-grow', 'event-link'],
  statistic: ['count-up', 'bar-grow', 'dot-fill', 'axis-draw'],
  principle: ['flow-trace', 'node-enter', 'state-transform',
              'shape-enter', 'shape-draw', 'shape-travel'],
};
const ART_MOVES = ['travel', 'rise', 'in', 'drop', 'press', 'none'];
const ART_FILE = /^slides\/assets\/s\d+-[a-z0-9-]+\.(png|jpe?g)$/i;
const TRANSITIONS = ['cut', 'dissolve', 'dip', 'dip:white', 'iris', 'blur', 'zoom'];
const PUSH_RE = /^push:(l2r|r2l|u2d|d2u)$/;
const WHIP_RE = /^whip:(l2r|r2l|u2d|d2u)$/;
/* Joins that say "time or attention moved" — a cut is the honest join inside one scene, so
   these draw the same-scene warning. push/whip/zoom say "the camera moved", which happens
   inside a scene all the time. */
const MOVED_KINDS = ['dissolve', 'dip', 'iris', 'blur'];
const SIZE_RANK = {
  els: 0, ls: 1, ws: 1, fs: 2, mfs: 3, ms: 4, mcu: 5, cu: 6, choker: 7, ecu: 8, insert: 8,
};

function parseTransition(t) {
  if (t == null || t === '') return { kind: 'cut' };
  if (TRANSITIONS.indexOf(t) !== -1) return { kind: t === 'dip:white' ? 'dip' : t, raw: t };
  if (PUSH_RE.test(t)) return { kind: 'push', raw: t };
  if (WHIP_RE.test(t)) return { kind: 'whip', raw: t };
  return null;
}

function isStillCard(scene) {
  const v = (scene && scene.visual) || {};
  if (scene && (scene.type === 'broll' || scene.type === 'outro')) return false;
  if (v.source === 'recording' || v.source === 'screencast' || v.picture === 'recording') return false;
  if (v.slide || v.video || v.clip) return false;
  return true;
}

function spokenText(scene) {
  return (scene && Array.isArray(scene.narration) ? scene.narration : [])
    .map((seg) => String((seg && (seg.sub || seg.tts)) || ''))
    .join(' ');
}

function compactText(value) {
  return String(value || '').replace(/[\s\p{P}\p{S}]/gu, '');
}

function compactLength(value) {
  return Array.from(compactText(value)).length;
}

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

const MOTION_KINDS = ['ai-video', 'recording', 'motion-slide'];
const MOTION_PROFILE_KEYS = [
  'motion_min_true', 'motion_allowed_kinds', 'motion_max_consecutive_stills',
  'motion_max_still_seconds', 'motion_require_action', 'generated_video_max',
];

function scalar(v) {
  if (v === undefined || v === null) return undefined;
  return String(v).trim().replace(/^(["'])(.*)\1$/, '$2');
}

/** Flat frontmatter is enough for the channel motion contract. */
function frontmatter(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return {};
  const out = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (!kv) return;
    out[kv[1]] = scalar(kv[2].replace(/\s+#.*$/, ''));
  });
  return out;
}

function findProfile(scenesPath) {
  let dir = path.dirname(path.resolve(scenesPath));
  for (let i = 0; i < 7; i++) {
    const candidate = path.join(dir, 'profile.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function boolValue(v, fallback, errors, field) {
  if (v === undefined || v === '') return fallback;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  errors.push(`${field} must be true or false`);
  return fallback;
}

function optionalNumber(v, errors, field, integer) {
  if (v === undefined || v === '' || v === 'off' || v === 'none') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
    errors.push(`${field} must be ${integer ? 'a non-negative integer' : 'a non-negative number'} or off`);
    return null;
  }
  return n;
}

function normalizeMotionPolicy(raw, defaultVideoMax, source) {
  const errors = [];
  const profileShape = raw && MOTION_PROFILE_KEYS.some((k) => raw[k] !== undefined);
  const sceneShape = !!raw && !profileShape;
  const pick = (profileKey, sceneKey) => profileShape ? raw[profileKey] : sceneShape ? raw[sceneKey] : undefined;
  const minRaw = scalar(pick('motion_min_true', 'minTrueMotion'));
  let minTrueMotion = null;
  if (minRaw !== undefined && minRaw !== '' && minRaw !== 'off' && minRaw !== 'none') {
    if (minRaw === 'majority') minTrueMotion = 'majority';
    else {
      const n = Number(minRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 1)
        errors.push('motion_min_true/minTrueMotion must be majority, off, or a number above 0 and at most 1');
      else minTrueMotion = n;
    }
  }

  const kindsRaw = pick('motion_allowed_kinds', 'allowedKinds');
  const allowedKinds = (Array.isArray(kindsRaw) ? kindsRaw : scalar(kindsRaw || MOTION_KINDS.join(','))
    .split(','))
    .map((v) => String(v).trim()).filter(Boolean);
  const unknownKinds = allowedKinds.filter((v) => MOTION_KINDS.indexOf(v) === -1);
  if (unknownKinds.length) errors.push(`motion_allowed_kinds/allowedKinds has unknown values: ${unknownKinds.join(', ')}`);

  const maxConsecutiveStills = optionalNumber(
    scalar(pick('motion_max_consecutive_stills', 'maxConsecutiveStills')),
    errors, 'motion_max_consecutive_stills/maxConsecutiveStills', true);
  const maxStillSeconds = optionalNumber(
    scalar(pick('motion_max_still_seconds', 'maxStillSeconds')),
    errors, 'motion_max_still_seconds/maxStillSeconds', false);
  const requireAction = boolValue(
    pick('motion_require_action', 'requireAction'), false, errors,
    'motion_require_action/requireAction');
  const videoOverride = optionalNumber(
    scalar(pick('generated_video_max', 'generatedVideoMax')),
    errors, 'generated_video_max/generatedVideoMax', true);

  return {
    declared: !!raw && (profileShape || sceneShape), source: source || '', errors,
    minTrueMotion, allowedKinds: [...new Set(allowedKinds)].sort(), maxConsecutiveStills,
    maxStillSeconds, requireAction,
    generatedVideoMax: videoOverride === null ? defaultVideoMax : videoOverride,
  };
}

function policyComparable(p) {
  return JSON.stringify({
    minTrueMotion: p.minTrueMotion,
    allowedKinds: p.allowedKinds,
    maxConsecutiveStills: p.maxConsecutiveStills,
    maxStillSeconds: p.maxStillSeconds,
    requireAction: p.requireAction,
    generatedVideoMax: p.generatedVideoMax,
  });
}

function motionKind(scene) {
  const v = (scene && scene.visual) || {};
  if (v.source === 'recording' || v.source === 'screencast' || v.picture === 'recording')
    return 'recording';
  // A footage slide is generated video under drawn marks (scenes-schema §footage treatment) — it
  // counts as ai-video for the true-motion floor, not as an authored plate.
  if (v.slide && v.slide.motion === true && v.slide.treatment === 'footage') return 'ai-video';
  if (v.slide && v.slide.motion === true) return 'motion-slide';
  if (scene && (scene.type === 'broll' || v.video || v.clip)) return 'ai-video';
  return null;
}

/** Rebuilds playback order because b-roll entries live at the array tail and use `after`. */
function playbackShots(scenes) {
  const broll = scenes.map((s, i) => ({ scene: s, index: i }))
    .filter((x) => x.scene.type === 'broll');
  const out = [];
  scenes.forEach((scene, index) => {
    if (scene.type === 'broll' || scene.type === 'outro') return;
    out.push({ scene, index });
    broll.filter((x) => Number(x.scene.after) === index).forEach((x) => out.push(x));
  });
  return out;
}

/**
 * Runs the structural contract. `fmt` is the resolved preset; every band comes from it.
 * Returns findings — `bad` is a violation, `warn` is worth a look, `later` is a machine-layer
 * field the story pass hasn't reached yet.
 *
 * `opts.draft` is storyboard §4a. The story pass has beats, feels, narration and the two hook
 * fields and nothing else, so the checks that only ask whether a machine-layer field has been
 * written yet come back as `later` instead of `bad`. Nothing else moves: a value outside a
 * vocabulary is still a violation in draft mode, and so is every beat-order rule. What §4b's
 * full run has to come back clean on is the same list it always was.
 */
function check(win, fmt, opts) {
  const scenes = win.SCENES;
  const draft = !!(opts && opts.draft);
  const out = [];
  const bad = (where, what) => out.push({ level: 'bad', where, what });
  const machine = (where, what) => out.push({ level: draft ? 'later' : 'bad', where, what });
  const warn = (where, what) => out.push({ level: 'warn', where, what });

  const pacing = fmt.pacing || {};
  const formatVideoMax = fmt.video && Number.isFinite(Number(fmt.video.generatedSecondsMax))
    ? Math.floor(Number(fmt.video.generatedSecondsMax) / 8) : 2;
  const motionPolicy = (opts && opts.policy) || normalizeMotionPolicy(null, formatVideoMax, 'default');
  const main = scenes.filter((s) => s.type !== 'broll' && s.type !== 'outro');
  const cover = scenes.find((s) => s.type === 'cover');
  const isShort = fmt.format !== 'youtube-long-16x9';

  // ── Episode level ──
  if (!cover) bad('episode', 'no cover shot — every episode opens on one');
  if (pacing.shotMin && main.length < pacing.shotMin)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.shotMin}~${pacing.shotMax}`);
  if (pacing.shotMax && main.length > pacing.shotMax)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.shotMin}~${pacing.shotMax}`);

  /* ── Comprehension contract ──
     The promise ledger in storyboard.html is useful to a person but invisible to this CLI.
     This compact contract keeps the governing question, its answer, cross-scene branches,
     and first-use term explanations beside the narration that ships. It is written in §4a,
     before any machine-layer work, so it is a hard authoring check in draft mode too. */
  const comp = win.COMPREHENSION;
  if (!comp || typeof comp !== 'object' || Array.isArray(comp)) {
    bad('episode', 'no window.COMPREHENSION — write the one question, answer, takeaway, branches, and term introductions before the scenes');
  } else {
    if (COMPREHENSION_MODES.indexOf(comp.mode) === -1)
      bad('window.COMPREHENSION', `mode "${comp.mode}" is outside ${COMPREHENSION_MODES.join(' · ')}`);

    ['question', 'answer', 'takeaway'].forEach((field) => {
      if (!String(comp[field] || '').trim())
        bad('window.COMPREHENSION', `${field} is empty — the episode cannot be compressed to one ${field}`);
    });

    const caps = { question: 35, answer: 60, takeaway: 45 };
    if (isShort) Object.keys(caps).forEach((field) => {
      const n = compactLength(comp[field]);
      if (n > caps[field])
        bad('window.COMPREHENSION', `${field} is ${n} characters — short-form cap ${caps[field]}; simplify the thought before shortening the wording`);
    });

    if (!Array.isArray(comp.branches)) {
      bad('window.COMPREHENSION', 'branches must be an array — use [] when the main question has no cross-scene detour');
    } else {
      const maxBranches = isShort ? (comp.mode === 'narrative' ? 1 : 0) : 4;
      if (comp.branches.length > maxBranches)
        bad('window.COMPREHENSION', `${comp.branches.length} cross-scene branches — ${comp.mode || 'informational'} ` +
            `${isShort ? 'short-form' : 'long-form'} cap ${maxBranches}; cut the branch or make it its own episode`);
      comp.branches.forEach((branch, i) => {
        const where = `window.COMPREHENSION.branches[${i}]`;
        if (!branch || typeof branch !== 'object') { bad(where, 'branch is not an object'); return; }
        if (!String(branch.question || '').trim()) bad(where, 'question is empty');
        const open = Number(branch.open), pay = Number(branch.pay);
        if (!Number.isInteger(open) || open < 1 || open > scenes.length) bad(where, `open ${JSON.stringify(branch.open)} is not a shot number`);
        if (!Number.isInteger(pay) || pay < 1 || pay > scenes.length) bad(where, `pay ${JSON.stringify(branch.pay)} is not a shot number`);
        if (Number.isInteger(open) && Number.isInteger(pay) && pay <= open)
          bad(where, 'pay must come after open — a same-shot question is a seam, not a cross-scene branch');
      });
    }

    if (!Array.isArray(comp.terms)) {
      bad('window.COMPREHENSION', 'terms must be an array — use [] when the narration introduces no unfamiliar term');
    } else {
      if (isShort && comp.terms.length > 3)
        bad('window.COMPREHENSION', `${comp.terms.length} unfamiliar terms — short-form cap 3; replace or remove the extras`);
      const allSpoken = scenes.map(spokenText);
      comp.terms.forEach((entry, i) => {
        const where = `window.COMPREHENSION.terms[${i}]`;
        if (!entry || typeof entry !== 'object') { bad(where, 'term is not an object'); return; }
        const term = String(entry.term || '').trim();
        const plain = String(entry.plain || '').trim();
        const firstShot = Number(entry.firstShot);
        if (!term) bad(where, 'term is empty');
        if (!plain) bad(where, 'plain is empty — write the exact easy wording used in that first shot');
        if (term && plain && term === plain) bad(where, 'plain repeats the term instead of explaining it');
        if (!Number.isInteger(firstShot) || firstShot < 1 || firstShot > scenes.length) {
          bad(where, `firstShot ${JSON.stringify(entry.firstShot)} is not a shot number`);
          return;
        }
        if (scenes[firstShot - 1] && ['broll', 'outro'].indexOf(scenes[firstShot - 1].type) !== -1)
          bad(where, `firstShot ${firstShot} has no narration`);
        const actualFirst = term ? allSpoken.findIndex((text) => text.indexOf(term) !== -1) + 1 : 0;
        if (!actualFirst) bad(where, `term "${term}" never appears in narration`);
        else if (actualFirst !== firstShot)
          bad(where, `firstShot says ${firstShot}, but "${term}" first appears in shot ${actualFirst}`);
        if (plain && allSpoken[firstShot - 1] && allSpoken[firstShot - 1].indexOf(plain) === -1)
          bad(where, `plain wording "${plain}" is not spoken in firstShot ${firstShot}`);
      });
    }

    if (!draft && isShort && comp.mode === 'informational') {
      const editorial = scenes.filter((scene) => {
        const slide = scene && scene.visual && scene.visual.slide;
        return slide && slide.motion === true && (slide.kind || 'diagram') === 'diagram' &&
               slide.treatment === 'editorial';
      });
      if (editorial.length < 1)
        bad('episode', 'no editorial HTML frame — a short informational episode needs 1–3 full-frame evidence, relationship, mechanism, timeline, statistic, transition, or verdict scenes');
      else if (editorial.length > 3)
        bad('episode', `${editorial.length} editorial HTML frames — short informational cap 3; keep contrast and give the remaining beats to footage or stills`);
    }
  }

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

  /* ── Playback order ──
     Format picks the skeleton (scenes-schema §playback order).
       short-form   hook → drip (1–n) → cta     — always. `arc` is ignored.
       long-form    two arcs walk one skeleton:
                    answer-first  cover → hooking → result → body → cta
                    story         cover → hooking → body → turn → result → cta
     A short that writes hooking/result/body/turn is a defect, not an alias. An outro asset
     is the CTA on long-form only; a short needs a spoken `beat:"cta"` as the last narrated
     shot. storyboard.html's check strip carries the same rule. */
  if (isShort && cover) {
    if (cover.hookType === 'spoiler')
      bad('cover', 'hookType "spoiler" dumps the ending on a short — use fear · empathy · curiosity; ' +
                  'the last drip is where the answer completes');
    if (cover.hookForm === 'payoff')
      bad('cover', 'hookForm "payoff" dumps the result on a short — use paradox · gap · identify · number · secret');
  }

  if (isShort && cover && comp && typeof comp === 'object' && !Array.isArray(comp)) {
    const ans = compactText(comp.answer);
    if (ans.length >= 8) {
      const hookSpoken = compactText([cover.title, cover.stat, spokenText(cover)].join(' '));
      if (hookSpoken.indexOf(ans) !== -1)
        bad('cover', 'the hook dumps COMPREHENSION.answer — on a short the cover opens a gap, ' +
                    'and the last drip is the first place the answer is complete');
    }
  }

  if (isShort) {
    const mainBeats = scenes.map((s, i) => ({ i: i + 1, beat: s.beat, type: s.type }))
      .filter((s) => s.type !== 'broll' && s.type !== 'outro')
      .map((s) => ({ ...s, beat: s.beat || (s.type === 'cover' ? 'hook' : '') }));
    if (mainBeats.length) {
      if (mainBeats[0].beat !== 'hook')
        bad('episode', 'the hook beat is not the first shot — a short opens on the cover');
      const last = mainBeats[mainBeats.length - 1];
      if (last.beat !== 'cta')
        bad('episode', 'a short ends on a spoken CTA — the last narrated shot is beat:"cta" ' +
                      '(an outro asset is not the spoken close)');
      else if (!spokenText(scenes[last.i - 1]).trim())
        bad('episode', 'a short ends on a spoken CTA — the last narrated shot has no narration');
      const dripCount = mainBeats.filter((s) => s.beat === 'drip').length;
      if (dripCount < 1)
        bad('episode', 'a short has no drip beat — after the hook, 1–n shots pay curiosity in stages ' +
                      '(beat:"drip") before the CTA');
      mainBeats.forEach((s, pos) => {
        if (LONG_FORM_BEATS.indexOf(s.beat) !== -1)
          bad('shot ' + s.i, `beat "${s.beat}" belongs to long-form — a short walks hook → drip → cta`);
        else if (!s.beat)
          bad('shot ' + s.i, 'no beat — a short labels every shot hook · drip · cta');
        else if (s.beat === 'hook' && pos !== 0)
          bad('shot ' + s.i, 'the hook beat is not the first shot — the cover opens the episode');
        else if (s.beat === 'cta' && pos !== mainBeats.length - 1)
          bad('episode', 'a beat comes after the cta — the cta is the very end');
        else if (s.beat === 'drip' && pos === 0)
          bad('shot ' + s.i, 'a short opens on the hook, not a drip');
      });
    }
  } else {
    const beated = scenes.map((s, i) => ({ i: i + 1, beat: s.beat, type: s.type }))
      .filter((s) => s.beat || s.type === 'cover' || s.type === 'outro')
      .map((s) => {
        const inferred = s.beat || (s.type === 'cover' ? 'hook' : 'cta');
        return { ...s, beat: inferred === 'drip' ? 'body' : inferred };
      });

    if (beated.length) {
      const arc = (cover && cover.arc) || 'answer-first';
      const at = (b) => beated.findIndex((s) => s.beat === b);
      const first = { hook: at('hook'), hooking: at('hooking'), result: at('result'),
                      body: at('body'), turn: at('turn'), cta: at('cta') };

      if (first.hook > 0)
        bad('episode', 'the hook beat is not the first shot — the cover opens the episode');
      if (first.hooking === -1)
        warn('episode', 'no hooking beat — the shot after the cover carries the stopped viewer to the result');
      else if (first.hook !== -1 && first.hooking !== first.hook + 1)
        warn('episode', 'hooking is not the shot right after the cover (scenes-schema §hooking)');

      if (first.cta === -1)
        warn('episode', 'no cta beat and no outro — the episode ends without the next value');
      else if (first.cta !== beated.length - 1 && beated.slice(first.cta + 1).some((s) => s.beat !== 'cta'))
        bad('episode', 'a beat comes after the cta — the cta is the very end');

      if (arc === 'story') {
        if (first.turn === -1)
          bad('episode', 'arc "story" with no turn beat — the turn is the moment someone saw it differently, ' +
                         'and the payoff has nothing to land after');
        if (first.result !== -1 && first.turn !== -1 && first.result < first.turn)
          bad('episode', 'the result comes before the turn on a story arc — a payoff shown early closes ' +
                         'the loop and takes away the reason to watch');
        if (first.result !== -1 && first.body !== -1 && first.result < first.body)
          bad('episode', 'the result comes before the body on a story arc — the build has to raise the ' +
                         'tension the payoff answers');
      } else {
        if (first.turn !== -1)
          bad('shot ' + beated[first.turn].i, 'beat "turn" on an answer-first arc — turn is story only');
        if (first.result !== -1 && first.body !== -1 && first.body < first.result)
          bad('episode', 'the body comes before the result on an answer-first arc — method before result ' +
                         'means listening to an explanation without knowing the destination');
        if (first.result === -1)
          warn('episode', 'no result beat on an answer-first arc — the finished thing is never shown properly');
      }
    }
  }

  /* ── Scene transitions — spent, not applied ──
     Absent or `"cut"` is a cut. The builder J-cuts a cut by default (split edit: next line
     starts on the previous last frame). dissolve / dip / iris / blur / zoom / push / whip are
     the visible joins, and a short spends at most two of those however many the vocabulary
     holds — widening it does not widen the budget. scenes-schema §scene transition is the
     contract. */
  const joins = [];
  scenes.forEach((s, i) => {
    if (s.type === 'broll' || s.type === 'outro') return;
    const parsed = parseTransition(s.transition);
    if (s.transition && !parsed)
      bad('shot ' + (i + 1), `transition "${s.transition}" — cut | dissolve | dip | dip:white | ` +
                             'iris | blur | zoom | push:l2r|r2l|u2d|d2u | whip:l2r|r2l|u2d|d2u ' +
                             '(omit = J-cut, cut = smash)');
    else if (parsed && parsed.kind !== 'cut')
      joins.push({ i: i + 1, kind: parsed.kind, raw: parsed.raw || s.transition, scene: s });
  });
  if (joins.length) {
    const longForm = fmt.format === 'youtube-long-16x9';
    const budget = longForm ? Math.max(2, Math.round(main.length / 8)) : 2;
    if (joins.length > budget)
      bad('episode', `${joins.length} scene transitions — a ${longForm ? 'long-form' : 'short'} ` +
                     `spends at most ${budget}. Every boundary softened is the slideshow look`);
    else if (!longForm && joins.length === 2)
      warn('episode', 'two scene transitions in a short — one is usually the whole budget');
    if (joins[0].i <= 2)
      bad('shot ' + joins[0].i, 'a transition on the hook or the shot after it — the first ' +
                                'three seconds have no time to spend');
    joins.forEach((d) => {
      const prev = scenes[d.i - 2], cur = scenes[d.i - 1];
      if (prev && cur && prev.scene !== undefined && prev.scene === cur.scene &&
          MOVED_KINDS.indexOf(d.kind) !== -1)
        warn('shot ' + d.i, `a ${d.kind} inside scene ${cur.scene} — same place and time, ` +
                            'where the cut is the honest join');
    });
  }

  /* Consecutive stills of the same size and angle in one scene read as a jump cut
     (30-degree / two-step-size rule). Filmed cards are the vlog exception. */
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1], cur = scenes[i];
    if (!isStillCard(prev) || !isStillCard(cur)) continue;
    if (prev.scene === undefined || prev.scene !== cur.scene) continue;
    const pr = SIZE_RANK[prev.shot && prev.shot.size];
    const cr = SIZE_RANK[cur.shot && cur.shot.size];
    const pa = (prev.shot && prev.shot.angle) || 'eye';
    const ca = (cur.shot && cur.shot.angle) || 'eye';
    if (pr !== undefined && pr === cr && pa === ca)
      warn('shot ' + (i + 1), 'same size and angle as the previous still in scene ' + cur.scene +
                              ' — a jump cut. Change size by two steps or the angle (directing-grammar §6)');
  }

  // The format owns the default cap; an explicit channel motion policy may raise or lower it.
  const videoSlots = scenes.filter((s) => {
    const v = s.visual || {};
    return s.type === 'broll' || !!v.video;
  });
  if (videoSlots.length > motionPolicy.generatedVideoMax)
    bad('episode', `${videoSlots.length} generated-video slots — b-roll and motion backgrounds ` +
                   `count together and cap at ${motionPolicy.generatedVideoMax} ` +
                   '(channel motion policy; format default applies when the profile has no override)');

  /* ── True motion coverage ──
     A camera move over one image, a caption swap, and a new still do not qualify. The channel
     chooses which real moving sources count, and may require one visible action per shot. */
  if (!draft && (motionPolicy.minTrueMotion !== null ||
                 motionPolicy.maxConsecutiveStills !== null ||
                 motionPolicy.maxStillSeconds !== null || motionPolicy.requireAction)) {
    const played = playbackShots(scenes);
    const allowed = new Set(motionPolicy.allowedKinds);
    const qualifies = (x) => {
      const kind = motionKind(x.scene);
      if (!kind || !allowed.has(kind)) return false;
      return !motionPolicy.requireAction || !!(x.scene.visual && String(x.scene.visual.action || '').trim());
    };

    if (motionPolicy.requireAction) {
      played.forEach((x) => {
        const kind = motionKind(x.scene);
        if (kind && allowed.has(kind) && !(x.scene.visual && String(x.scene.visual.action || '').trim()))
          bad('shot ' + (x.index + 1), `${kind} counts as true motion only with visual.action under this channel policy`);
      });
    }

    const moving = played.filter(qualifies);
    if (motionPolicy.minTrueMotion !== null && played.length) {
      const required = motionPolicy.minTrueMotion === 'majority'
        ? Math.floor(played.length / 2) + 1
        : Math.ceil(played.length * motionPolicy.minTrueMotion);
      if (moving.length < required)
        bad('episode', `${moving.length}/${played.length} true-motion shots — this channel requires at least ${required}; ` +
                       'Ken Burns, camera-only movement, caption swaps, and still-image changes do not count');
    }

    let run = [], worst = [];
    played.forEach((x) => {
      if (qualifies(x)) run = [];
      else {
        run.push(x);
        if (run.length > worst.length) worst = run.slice();
      }
    });
    const runLabels = (list) => list.map((x) => x.index + 1).join('→');
    if (motionPolicy.maxConsecutiveStills !== null && worst.length > motionPolicy.maxConsecutiveStills)
      bad('episode', `${worst.length} consecutive non-motion shots (${runLabels(worst)}) — channel cap ` +
                     `${motionPolicy.maxConsecutiveStills}`);
    if (motionPolicy.maxStillSeconds !== null && worst.length) {
      const seconds = worst.reduce((sum, x) => {
        const n = Number(x.scene.duration);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0);
      if (seconds > motionPolicy.maxStillSeconds)
        bad('episode', `${seconds.toFixed(2)}s consecutive non-motion stretch (${runLabels(worst)}) — channel cap ` +
                       `${motionPolicy.maxStillSeconds}s`);
    }
  }

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
    if (s.type !== 'outro' && s.type !== 'broll' && !String(shot.info || '').trim())
      bad(where, 'no shot.info — nothing says what the viewer newly learns here');
    if (s.type !== 'outro' && s.type !== 'broll') {
      if (!String(shot.infoType || '').trim())
        bad(where, `no shot.infoType — classify the beat as ${INFO_TYPES.join(' · ')} before choosing its visual`);
      else if (INFO_TYPES.indexOf(shot.infoType) === -1)
        bad(where, `shot.infoType "${shot.infoType}" is outside ${INFO_TYPES.join(' · ')}`);
    }

    const slide = v.slide;
    if (slide && slide.motion === true && (slide.kind || 'diagram') === 'diagram') {
      if (!String(slide.treatment || '').trim()) {
        machine(where, 'motion diagram has no slide.treatment — choose editorial when HTML owns the frame, photo-action when the photographed subject itself changes, or footage when generated clips carry the scene under drawn marks');
      } else if (SLIDE_TREATMENTS.indexOf(slide.treatment) === -1) {
        bad(where, `slide.treatment "${slide.treatment}" is outside ${SLIDE_TREATMENTS.join(' · ')}`);
      } else if (slide.treatment === 'editorial') {
        if (EDITORIAL_ROLES.indexOf(slide.role) === -1)
          machine(where, `editorial slide.role "${slide.role}" is outside ${EDITORIAL_ROLES.join(' · ')}`);
        if (!String(slide.motif || '').trim())
          machine(where, 'editorial slide has no motif — name the episode-wide visual device that carries between authored frames');
      } else if (slide.treatment === 'photo-action') {
        if (!String(v.action || '').trim())
          machine(where, 'photo-action slide has no visual.action — name the subject or evidence change, not a camera or overlay move');
        if (!String(slide.plan || '').trim())
          machine(where, 'photo-action slide has no plan — map the subject change to each narration group');
      } else if (slide.treatment === 'footage') {
        /* Footage: one generated clip per reveal group under drawn marks (scenes-schema §footage
           treatment). The clips are paid calls made at storyboard §5, so the plan, the shots and each
           shot's camera and prompt exist before approval. Footage clips do not spend a generatedVideoMax
           slot — the cost panel lists every one and the §5 gate is where the spend is approved. */
        if (!String(v.action || '').trim())
          machine(where, 'footage slide has no visual.action — say what the people or things in the clips do, not what the marks draw');
        if (!String(slide.plan || '').trim())
          machine(where, 'footage slide has no plan — one line per group: what the clip shows and which mark lands on it');
        const shots = Array.isArray(slide.shots) ? slide.shots : null;
        const segs = Array.isArray(s.narration) ? s.narration.length : 0;
        if (!shots || !shots.length) {
          machine(where, 'footage slide has no slide.shots — one clip per reveal group (a sentence may carry two via an A|B sub-reveal)');
        } else {
          if (segs && shots.length < segs)
            bad(where, `footage slide has ${shots.length} shots for ${segs} narration segments — segment ${shots.length + 1} would play on nothing`);
          const groups = new Set();
          shots.forEach((sh, j) => {
            const at = `${where} shots[${j}]`;
            if (!sh || typeof sh !== 'object') { bad(at, 'shot is not an object'); return; }
            const group = Number(sh.group);
            if (!Number.isInteger(group) || group < 1) bad(at, `group ${JSON.stringify(sh.group)} is not a positive integer`);
            else if (groups.has(group)) bad(at, `group ${group} appears twice — one clip per group`);
            else groups.add(group);
            const clip = String(sh.clip || '');
            if (!clip) machine(at, 'no clip — slides/footage/s<shot>-g<group>.mp4, generated at storyboard §5');
            else if (!/^slides\/footage\/s\d+-g\d+[a-z0-9-]*\.(mp4|webm)$/.test(clip))
              bad(at, `clip "${clip}" is outside the slides/footage/s<shot>-g<group>.mp4 convention`);
            if (sh.matte && !/^slides\/footage\/.+\.webm$/.test(String(sh.matte)))
              bad(at, `matte "${sh.matte}" must be a VP9-alpha webm under slides/footage/`);
            const engine = sh.engine || v.engine || 'seedance';
            if (engine !== 'seedance' && engine !== 'veo') bad(at, `engine "${engine}" is not seedance or veo`);
            const dur = Number(sh.duration);
            if (!Number.isFinite(dur) || dur <= 0) machine(at, 'no duration — the seconds requested from the engine (4–12 on seedance, 8 on veo)');
            else if (engine === 'seedance' && (dur < 4 || dur > 12)) bad(at, `duration ${dur}s is outside seedance 1.5 pro\'s 4–12s`);
            else if (engine === 'veo' && dur !== 8) bad(at, `duration ${dur}s — veo generates 8s only`);
            const cam = sh.camera || {};
            ['movement', 'speed', 'framing', 'end'].forEach((slot) => {
              if (!cam[slot]) machine(at, `camera.${slot} is empty — a footage shot leaves the storyboard with all four slots filled`);
            });
            if (!String(sh.prompt || '').trim()) machine(at, 'no prompt — store the assembled clip prompt (assemble-bg-prompt.js --clip)');
            if (!String(sh.audio || '').trim()) machine(at, 'no audio — say what the clip sounds like even though the builder drops it');
            if (!String(sh.mark || '').trim()) machine(at, 'no mark — name the mark that lands on this shot, or "none"');
          });
          for (let g = 1; g <= segs; g++) if (!groups.has(g)) bad(where, `footage slide has no shot for group ${g}`);
        }
      }
    }

    /* Timeline · statistic · principle are semantic routing decisions, not styling hints.
       They cannot fall back to a still, footage, or a photo with animated annotations. The
       authored HTML must expose one declared meaning-bearing primitive for every spoken group;
       render-motion-slide.mjs checks those declarations against the rendered DOM. */
    if (INFO_ROLE[shot.infoType]) {
      const expectedRole = INFO_ROLE[shot.infoType];
      const allowed = INFO_PRIMITIVES[shot.infoType];
      if (!slide) {
        machine(where, `${shot.infoType} beat has no visual.slide — it must be a full-frame seekable HTML animation`);
      } else {
        if ((slide.kind || 'diagram') !== 'diagram')
          machine(where, `${shot.infoType} beat uses kind:"${slide.kind}" — it must use kind:"diagram"`);
        if (slide.motion !== true)
          machine(where, `${shot.infoType} beat has no slide.motion:true — a still frame is not allowed`);
        if (slide.treatment !== 'editorial')
          machine(where, `${shot.infoType} beat uses treatment:"${slide.treatment}" — it must use treatment:"editorial"`);
        if (slide.role !== expectedRole)
          machine(where, `${shot.infoType} beat uses slide.role:"${slide.role}" — expected "${expectedRole}"`);

        const beats = slide.motionBeats;
        const segs = Array.isArray(s.narration) ? s.narration.length : 0;
        if (!Array.isArray(beats) || !beats.length) {
          machine(where, `${shot.infoType} beat has no slide.motionBeats — declare one semantic primitive per narration group`);
        } else {
          const groups = new Map();
          beats.forEach((beat, j) => {
            const at = `${where} motionBeats[${j}]`;
            if (!beat || typeof beat !== 'object' || Array.isArray(beat)) {
              machine(at, 'motion beat is not an object');
              return;
            }
            const group = Number(beat.group);
            if (!Number.isInteger(group) || group < 1) machine(at, `group ${JSON.stringify(beat.group)} is not a positive integer`);
            else groups.set(group, (groups.get(group) || 0) + 1);
            if (allowed.indexOf(beat.primitive) === -1)
              machine(at, `primitive "${beat.primitive}" is outside ${allowed.join(' · ')} for ${shot.infoType}`);
          });
          for (let group = 1; group <= segs; group++) {
            if (!groups.has(group)) machine(where, `slide.motionBeats has no group ${group} for narration[${group - 1}]`);
          }
          groups.forEach((count, group) => {
            if (count > 1) machine(where, `slide.motionBeats repeats group ${group} — one primary movement per narration group`);
          });
          if (shot.infoType === 'principle') {
            const usesShape = beats.some((b) => b && String(b.primitive || '').indexOf('shape-') === 0);
            const hasArts = Array.isArray(slide.arts) && slide.arts.length;
            if (usesShape && !hasArts)
              machine(where, 'principle shape beat has no slide.arts — ink actors sit with h.fig; rules draw the relation');
          }
        }
      }
    }

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
      if (!seg.tts) machine(where, `narration[${j}] has no tts — the engine reads that field`);
      if (!seg.sub) warn(where, `narration[${j}] has no sub — the subtitle falls back to tts spelling`);
    });

    // b-roll's own contract — the parts that break the splice rather than look wrong.
    if (s.type === 'broll') {
      if ((s.narration || []).length)
        bad(where, 'b-roll carries narration — the splice uses the clip\'s own audio (absolute rule 9)');
      if (s.after === undefined || s.after === null) machine(where, 'b-roll has no `after` — nothing says where it cuts in');
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
        if (!cam[slot]) machine(where, `visual.camera.${slot} is empty — a generated shot leaves here with all four filled`);
      });
      const prompt = v.prompt || (v.video && v.video.prompt) ||
                     (v.clip && typeof v.clip === 'object' && v.clip.prompt);
      if (!prompt) machine(where, 'no stored clip prompt — produce sends this verbatim (scenes-schema §clip prompt)');
      if (!v.audio && s.type !== 'quote')
        warn(where, 'no visual.audio — the engine invents a soundtrack under the narration');
    }

    // A slide names its file and everything it will draw. A still slide is not allowed.
    if (v.slide) {
      if (!v.slide.file) machine(where, 'visual.slide has no file');
      if (!v.slide.plan) warn(where, 'visual.slide has no plan — the approval screen approves that line');
      if (v.slide.motion !== true)
        machine(where, 'visual.slide has no motion:true — a still slide is not allowed');
      if (v.slide.arts != null) {
        if (!Array.isArray(v.slide.arts))
          machine(where, 'slide.arts is not an array — [{ file, prompt, group, move }]');
        else v.slide.arts.forEach((a, j) => {
          const at = `${where} slide.arts[${j}]`;
          if (!a || typeof a !== 'object' || Array.isArray(a)) {
            machine(at, 'art is not an object');
            return;
          }
          if (!a.file) machine(at, 'has no file');
          else if (!ART_FILE.test(a.file))
            machine(at, `file "${a.file}" is not slides/assets/s<shot>-<slug>.png`);
          if (a.move && ART_MOVES.indexOf(a.move) === -1)
            machine(at, `move "${a.move}" is outside ${ART_MOVES.join(' · ')}`);
          const group = Number(a.group);
          if (!Number.isInteger(group) || group < 1)
            machine(at, `group ${JSON.stringify(a.group)} is not a positive integer`);
        });
      }
      if ((v.slide.kind || 'diagram') === 'kinetic' &&
          !(Array.isArray(v.slide.arts) && v.slide.arts.length))
        warn(where, 'kinetic has no slide.arts — type-only is valid for a verdict or a cross; a supporting picture uses arts or h.disk');
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
  const fmt = { format: 'shorts-9x16', label: 'test', pacing: { sceneMin: 4, sceneMax: 13, shotMin: 4, shotMax: 7 },
                video: { generatedSecondsMax: 16 } };
  const fmtLong = { format: 'youtube-long-16x9', label: 'test long',
                    pacing: { sceneMin: 6, sceneMax: 20, shotMin: 28, shotMax: 70 },
                    video: { generatedSecondsMax: 40 } };
  const defaultPolicy = normalizeMotionPolicy(null, 2, 'test default');
  const comprehension = {
    mode: 'informational', question: '무엇이 달라졌나요?', answer: '한 가지가 달라졌어요.',
    takeaway: '한 가지만 기억하면 돼요.', branches: [], terms: []
  };
  const run = (scenes, extra, opts) => check(
    Object.assign({ SCENES: scenes, COMPREHENSION: comprehension }, extra || {}), fmt,
    Object.assign({ policy: defaultPolicy }, opts || {}));
  const runLong = (scenes, extra, opts) => check(
    Object.assign({ SCENES: scenes, COMPREHENSION: comprehension }, extra || {}), fmtLong,
    Object.assign({ policy: defaultPolicy }, opts || {}));
  const has = (findings, re) => findings.some((f) => re.test(f.what));
  const bads = (findings) => findings.filter((f) => f.level === 'bad');

  const goodShot = {
    type: 'points', duration: 6, beat: 'drip',
    shot: { feel: 'relief', size: 'mcu', angle: 'eye', info: '한 가지 정보', infoType: 'other' },
    narration: [{ tts: '가', sub: '가' }], visual: {}
  };
  const ctaShot = Object.assign({}, goodShot, { beat: 'cta' });
  const cover = { type: 'cover', duration: 5, beat: 'hook',
                  hookType: 'curiosity', hookForm: 'gap',
                  shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '질문', infoType: 'other' },
                  narration: [{ tts: '가', sub: '가' }],
                  visual: { slide: { file: 'slides/s1-evidence.html', kind: 'diagram', motion: true,
                                     treatment: 'editorial', role: 'evidence', motif: 'signal line',
                                     plan: 'the evidence enters' } } };
  const shortOK = [cover, goodShot, goodShot, ctaShot];

  ok('a clean episode has no violations',
     bads(run(shortOK)).length === 0);
  ok('a missing comprehension contract is a violation',
     has(bads(check({ SCENES: [cover, goodShot, goodShot, goodShot] }, fmt,
                    { policy: defaultPolicy })), /no window\.COMPREHENSION/));
  ok('an informational short cannot carry a cross-scene branch',
     has(bads(run([cover, goodShot, goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       branches: [{ question: '곁가지는?', open: 2, pay: 3 }]
     }) })), /cross-scene branches/));
  ok('a narrative short may carry one cross-scene branch',
     !has(bads(run([cover, goodShot, goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       mode: 'narrative', branches: [{ question: '무슨 일이 생기나요?', open: 2, pay: 3 }]
     }) })), /cross-scene branches/));
  ok('a term has to carry its plain wording in the first shot',
     has(bads(run([cover, Object.assign({}, goodShot, {
       narration: [{ tts: '모굴 계획이에요.', sub: '모굴 계획이에요.' }]
     }), goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       terms: [{ term: '모굴', plain: '기밀 풍선 임무', firstShot: 2 }]
     }) })), /plain wording/));
  ok('a term with its same-shot explanation passes',
     !has(bads(run([cover, Object.assign({}, goodShot, {
       narration: [{ tts: '기밀 풍선 임무인 모굴 계획이에요.', sub: '기밀 풍선 임무인 모굴 계획이에요.' }]
     }), goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       terms: [{ term: '모굴', plain: '기밀 풍선 임무', firstShot: 2 }]
     }) })), /window\.COMPREHENSION\.terms/));
  ok('a narrated shot without shot.info is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', size: 'mcu', angle: 'eye', infoType: 'other' } })])), /no shot\.info/));
  ok('a narrated shot without shot.infoType is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '정보' } })])), /no shot\.infoType/));
  ok('an informational short needs an editorial HTML frame',
     has(bads(run([Object.assign({}, cover, { visual: {} }), goodShot, goodShot, goodShot])), /no editorial HTML frame/));
  ok('a motion diagram declares its treatment',
     has(bads(run([Object.assign({}, cover, { visual: { slide: { motion: true } } }), goodShot, goodShot, goodShot])), /no slide\.treatment/));
  ok('an editorial frame declares role and motif',
     has(bads(run([Object.assign({}, cover, { visual: { slide: { motion: true, treatment: 'editorial' } } }), goodShot, goodShot, goodShot])), /slide\.role|no motif/));
  const semantic = (infoType, role, motionBeats) => Object.assign({}, goodShot, {
    shot: Object.assign({}, goodShot.shot, { infoType }),
    visual: { slide: { file: `slides/s2-${infoType}.html`, kind: 'diagram', motion: true,
      treatment: 'editorial', role, motif: 'signal line', plan: 'one move per group', motionBeats } }
  });
  ok('a timeline beat cannot fall back to a still',
     has(bads(run([cover, Object.assign({}, goodShot, {
       shot: Object.assign({}, goodShot.shot, { infoType: 'timeline' })
     }), goodShot, goodShot])), /timeline beat has no visual\.slide/));
  ok('a statistic beat uses the statistic role',
     has(bads(run([cover, semantic('statistic', 'evidence', [{ group: 1, primitive: 'count-up' }]), goodShot, goodShot])), /expected "statistic"/));
  ok('a principle beat declares every narration group',
     has(bads(run([cover, Object.assign({}, semantic('principle', 'mechanism', [{ group: 1, primitive: 'flow-trace' }]), {
       narration: [{ tts: '하나', sub: '하나' }, { tts: '둘', sub: '둘' }]
     }), goodShot, goodShot])), /no group 2/));
  ok('timeline, statistic, and principle HTML contracts pass',
     ['timeline', 'statistic', 'principle'].every((infoType) => {
       const primitive = INFO_PRIMITIVES[infoType][0];
       return !has(bads(run([cover, semantic(infoType, INFO_ROLE[infoType], [{ group: 1, primitive }]), goodShot, goodShot])),
                   /beat has no|expected|motionBeats|primitive/);
     }));
  ok('a principle shape beat without arts is a violation',
     has(bads(run([cover, semantic('principle', 'mechanism', [{ group: 1, primitive: 'shape-enter' }]), goodShot, goodShot])),
         /no slide\.arts/));
  ok('a principle shape beat with arts passes', (() => {
    const s = semantic('principle', 'mechanism', [{ group: 1, primitive: 'shape-enter' }]);
    s.visual.slide.arts = [{ file: 'slides/assets/s2-actor.png', prompt: 'ink person', group: 1, move: 'rise' }];
    return !has(bads(run([cover, s, goodShot, goodShot])), /primitive|slide\.arts/);
  })());
  ok('a named-state principle may skip arts',
     !has(bads(run([cover, semantic('principle', 'mechanism', [{ group: 1, primitive: 'flow-trace' }]), goodShot, goodShot])),
          /slide\.arts/));
  const footageScene = (over) => Object.assign({}, goodShot, {
    visual: Object.assign({ action: 'riders enter the valley',
      slide: Object.assign({ file: 'slides/s2-valley.html', kind: 'diagram', motion: true, treatment: 'footage',
        plan: '① route into the valley', labels: [],
        shots: [{ group: 1, clip: 'slides/footage/s2-g1.mp4', duration: 5, engine: 'seedance', mark: 'dashed route',
                  camera: { movement: 'dolly in', speed: 'very slow', framing: 'high wide', end: 'road mid-frame' },
                  prompt: 'x', audio: 'wind' }] }, (over && over.slide) || {}) }, (over && over.visual) || {})
  });
  ok('a footage slide with one clip per segment passes',
     !has(bads(run([cover, footageScene(), goodShot, goodShot])), /footage slide|shots\[|slide\.treatment "footage"/));
  ok('a footage slide with fewer shots than segments is a violation',
     has(bads(run([cover, Object.assign({}, footageScene(), { narration: [{ tts: '가', sub: '가' }, { tts: '나', sub: '나' }] }), goodShot, goodShot])),
         /1 shots for 2 narration segments/));
  ok('a footage clip outside the naming convention is caught',
     has(bads(run([cover, footageScene({ slide: { shots: [{ group: 1, clip: 'clips/a.mp4', duration: 5, prompt: 'x', audio: 'y', mark: 'z',
       camera: { movement: 'a', speed: 'b', framing: 'c', end: 'd' } }] } }), goodShot, goodShot])), /outside the slides\/footage/));
  ok('a footage shot with empty camera slots is a violation',
     bads(run([cover, footageScene({ slide: { shots: [{ group: 1, clip: 'slides/footage/s2-g1.mp4', duration: 5, prompt: 'x', audio: 'y', mark: 'z' }] } }),
       goodShot, goodShot])).filter((f) => /camera\./.test(f.what)).length === 4);
  ok('a footage shot outside the seedance duration band is a violation',
     has(bads(run([cover, footageScene({ slide: { shots: [{ group: 1, clip: 'slides/footage/s2-g1.mp4', duration: 2, prompt: 'x', audio: 'y', mark: 'z',
       camera: { movement: 'a', speed: 'b', framing: 'c', end: 'd' } }] } }), goodShot, goodShot])), /outside seedance/));
  ok('footage shots do not spend a generated-video slot',
     !has(bads(run([cover, footageScene(), footageScene(), footageScene()])), /generated-video slots/));
  ok('a footage slide counts as ai-video for the motion floor', motionKind(footageScene()) === 'ai-video');
  ok('an invented arts move is caught',
     has(bads(run([cover, Object.assign({}, goodShot, {
       visual: { slide: { file: 'slides/s2-k.html', kind: 'kinetic', motion: true, plan: 'x',
         arts: [{ file: 'slides/assets/s2-k.png', group: 1, move: 'spin' }] } }
     }), goodShot, goodShot])), /move "spin"/));
  const warns = (findings) => findings.filter((f) => f.level === 'warn');
  ok('a type-only kinetic is a warning, not a violation', (() => {
    const findings = run([cover, Object.assign({}, goodShot, {
      visual: { slide: { file: 'slides/s2-k.html', kind: 'kinetic', motion: true, plan: 'x' } }
    }), goodShot, goodShot]);
    return !has(bads(findings), /slide\.arts/) && has(warns(findings), /no slide\.arts/);
  })());
  ok('a kinetic with arts is quiet on that warning',
     !has(warns(run([cover, Object.assign({}, goodShot, {
       visual: { slide: { file: 'slides/s2-k.html', kind: 'kinetic', motion: true, plan: 'x',
         arts: [{ file: 'slides/assets/s2-k.png', group: 1, move: 'travel' }] } }
     }), goodShot, goodShot])), /no slide\.arts/));
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
  ok('a slide without motion:true is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-x.html', plan: 'a list' } } }), goodShot, goodShot])), /no motion:true/));
  ok('a well-formed b-roll passes', bads(run([cover, goodShot, ctaShot, broll])).length === 0);
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

  // ── scene transitions ──
  const dz = (over) => Object.assign({}, goodShot, over);
  ok('no transition anywhere is clean (the default is a cut)',
     bads(run(shortOK)).length === 0);
  ok('one dissolve is within budget',
     bads(run([cover, goodShot, dz({ transition: 'dissolve' }), ctaShot])).length === 0);
  ok('dip and push are valid joins',
     bads(run([cover, goodShot, dz({ transition: 'dip' }), ctaShot])).length === 0 &&
     bads(run([cover, goodShot, dz({ transition: 'push:l2r' }), ctaShot])).length === 0);
  ok('iris, blur, zoom and whip are valid joins',
     ['iris', 'blur', 'zoom', 'whip:r2l'].every((t) =>
       bads(run([cover, goodShot, dz({ transition: t }), ctaShot])).length === 0));
  ok('whip without a direction is a violation',
     has(bads(run([cover, goodShot, dz({ transition: 'whip' })])), /whip:l2r/));
  ok('two of the new joins still blow the short budget at three',
     has(bads(run([cover, goodShot, dz({ transition: 'iris' }), dz({ transition: 'blur' }),
                   dz({ transition: 'zoom' })])), /spends at most 2/));
  ok('an iris inside one scene is flagged, a whip is not',
     has(run([cover, Object.assign({}, goodShot, { scene: 2 }),
              dz({ transition: 'iris', scene: 2 })]), /same place and time/) &&
     !has(run([cover, Object.assign({}, goodShot, { scene: 2 }),
               dz({ transition: 'whip:r2l', scene: 2 })]), /same place and time/));
  ok('explicit cut is clean',
     bads(run([cover, goodShot, dz({ transition: 'cut' }), ctaShot])).length === 0);
  ok('a value outside the join vocabulary is a violation',
     has(bads(run([cover, goodShot, dz({ transition: 'fade' })])), /cut \| dissolve \| dip/));
  ok('three dissolves in a short is a violation',
     has(bads(run([cover, goodShot, dz({ transition: 'dissolve' }), dz({ transition: 'dissolve' }),
                   dz({ transition: 'dissolve' })])), /spends at most 2/));
  ok('a dissolve on the shot after the hook is a violation',
     has(bads(run([cover, dz({ transition: 'dissolve' }), goodShot])), /no time to spend/));
  ok('a dissolve inside one scene is flagged',
     has(run([cover, Object.assign({}, goodShot, { scene: 2 }),
              dz({ transition: 'dissolve', scene: 2 })]), /same place and time/));
  ok('same size and angle on consecutive stills in one scene is flagged',
     has(run([cover,
              Object.assign({}, goodShot, { scene: 2, shot: { feel: 'a', size: 'ms', angle: 'eye', info: 'one', infoType: 'other' } }),
              Object.assign({}, goodShot, { scene: 2, shot: { feel: 'b', size: 'ms', angle: 'eye', info: 'two', infoType: 'other' } })]),
         /jump cut/));

  // ── playback order ──
  const beat = (b, over) => Object.assign({}, goodShot, { beat: b }, over || {});
  const longCover = Object.assign({}, cover, { arc: 'answer-first' });
  const afOK = [longCover, beat('hooking'), beat('result'), beat('body'), beat('cta')];
  ok('a well-ordered short is hook → drip → cta', bads(run(shortOK)).length === 0);
  ok('a short with no drip is a violation',
     has(bads(run([cover, ctaShot])), /no drip beat/));
  ok('hooking on a short is a violation',
     has(bads(run([cover, beat('hooking'), goodShot, ctaShot])), /belongs to long-form/));
  ok('a short without a spoken CTA is a violation',
     has(bads(run([cover, goodShot, goodShot, goodShot])), /spoken CTA/));
  ok('an outro is not the spoken CTA on a short',
     has(bads(run([cover, goodShot, goodShot, { type: 'outro', visual: {} }])), /spoken CTA/));
  ok('spoiler is forbidden on a short',
     has(bads(run([Object.assign({}, cover, { hookType: 'spoiler' }), goodShot, goodShot, ctaShot])),
         /hookType "spoiler"/));
  ok('payoff is forbidden on a short',
     has(bads(run([Object.assign({}, cover, { hookForm: 'payoff' }), goodShot, goodShot, ctaShot])),
         /hookForm "payoff"/));
  ok('a short cover that speaks the answer is a violation',
     has(bads(run([Object.assign({}, cover, {
       narration: [{ tts: '한 가지가 달라졌어요.', sub: '한 가지가 달라졌어요.' }]
     }), goodShot, goodShot, ctaShot])), /dumps COMPREHENSION\.answer/));
  ok('a beat after the cta on a short is a violation',
     has(bads(run([cover, goodShot, ctaShot, goodShot])), /after the cta/));
  ok('an unlabeled middle shot on a short is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { beat: undefined }), goodShot, ctaShot])),
         /no beat/));
  ok('result on a short is a violation',
     has(bads(run([cover, beat('result'), goodShot, ctaShot])), /belongs to long-form/));
  ok('body on a short is a violation',
     has(bads(run([cover, beat('body'), goodShot, ctaShot])), /belongs to long-form/));
  ok('a short that opens on a drip is a violation',
     has(bads(run([Object.assign({}, cover, { beat: 'drip' }), goodShot, goodShot, ctaShot])),
         /opens on the hook/));
  ok('a mute CTA on a short is a violation',
     has(bads(run([cover, goodShot, goodShot, Object.assign({}, ctaShot, { narration: [] })])),
         /no narration/));
  ok('turn on a short is a violation',
     has(bads(run([cover, beat('turn'), goodShot, ctaShot])), /belongs to long-form/));
  ok('a short with one drip is enough',
     bads(run([cover, goodShot, ctaShot])).length === 0);

  ok('a well-ordered answer-first episode passes', bads(runLong(afOK)).length === 0);
  ok('body before result on answer-first is a violation',
     has(bads(runLong([longCover, beat('hooking'), beat('body'), beat('result'), beat('cta')])),
         /body comes before the result/));
  ok('a turn on an answer-first arc is a violation',
     has(bads(runLong([longCover, beat('hooking'), beat('turn'), beat('result'), beat('cta')])),
         /turn is story only/));
  ok('drip on long-form is read as body',
     bads(runLong([longCover, beat('hooking'), beat('result'), beat('drip'), beat('cta')])).length === 0);

  const st = Object.assign({}, cover, { arc: 'story' });
  const storyOK = [st, beat('hooking'), beat('body'), beat('turn'), beat('result'), beat('cta')];
  ok('a well-ordered story episode passes', bads(runLong(storyOK)).length === 0);
  ok('a story arc with no turn is a violation',
     has(bads(runLong([st, beat('hooking'), beat('body'), beat('result'), beat('cta')])), /no turn beat/));
  ok('the payoff before the turn is a violation',
     has(bads(runLong([st, beat('hooking'), beat('body'), beat('result'), beat('turn'), beat('cta')])),
         /result comes before the turn/));
  ok('a beat after the cta is a violation',
     has(bads(runLong([longCover, beat('hooking'), beat('result'), beat('cta'), beat('body')])),
         /after the cta/));
  ok('an episode with no cta is flagged',
     has(runLong([longCover, beat('hooking'), beat('result'), beat('body')]), /no cta beat/));
  ok('an outro scene counts as the cta on long-form',
     !has(runLong([longCover, beat('hooking'), beat('result'), beat('body'),
                   { type: 'outro', visual: {} }]), /no cta beat/));

  // the combined cap
  const three = [cover, noSlots, noSlots, noSlots];
  ok('more than two generated-video slots is a violation',
     has(bads(run(three)), /cap at 2/));
  const raisedCap = normalizeMotionPolicy({ generatedVideoMax: 4 }, 2, 'fixture');
  ok('a channel policy can raise the generated-video cap',
     !has(bads(run(three, null, { policy: raisedCap })), /cap at/));

  // ── channel true-motion policy ──
  const recorded = (over) => Object.assign({}, goodShot, {
    visual: Object.assign({ picture: 'recording', source: 'recording', action: 'open the box' }, over || {})
  });
  const motionPolicy = normalizeMotionPolicy({
    minTrueMotion: 'majority', allowedKinds: ['ai-video', 'recording'],
    maxConsecutiveStills: 1, maxStillSeconds: 6, requireAction: true, generatedVideoMax: 7,
  }, 2, 'fixture');
  ok('a majority of recorded action shots clears the channel motion policy',
     !has(bads(run([cover, recorded(), recorded(), goodShot, recorded()], null, { policy: motionPolicy })),
          /true-motion|consecutive non-motion|visual\.action/));
  ok('an all-still episode fails the minimum true-motion ratio',
     has(bads(run([cover, goodShot, goodShot, goodShot], null, { policy: motionPolicy })), /true-motion shots/));
  ok('Ken Burns on a still does not count as true motion',
     has(bads(run([cover, Object.assign({}, goodShot, {
       visual: { camera: { movement: 'dolly in' }, action: 'camera approaches' }
     }), goodShot, goodShot], null, { policy: motionPolicy })), /true-motion shots/));
  ok('a qualifying motion shot without visual.action is rejected when action is required',
     has(bads(run([cover, recorded({ action: '' }), recorded(), recorded()], null, { policy: motionPolicy })),
         /only with visual\.action/));
  ok('too many consecutive still shots are rejected',
     has(bads(run([cover, goodShot, recorded(), recorded()], null, { policy: motionPolicy })),
         /consecutive non-motion shots/));
  const secondsPolicy = normalizeMotionPolicy({ maxStillSeconds: 4, generatedVideoMax: 2 }, 2, 'fixture');
  ok('a long still stretch is rejected even without a ratio rule',
     has(bads(run([Object.assign({}, cover, { duration: 5, visual: {} }), recorded()], null, { policy: secondsPolicy })),
         /consecutive non-motion stretch/));
  const allMotionPolicy = normalizeMotionPolicy({
    minTrueMotion: 1, allowedKinds: ['motion-slide'], maxConsecutiveStills: 0,
    maxStillSeconds: 0, requireAction: true, generatedVideoMax: 2,
  }, 2, 'fixture');
  const movingSlide = (base) => Object.assign({}, base, {
    visual: { picture: 'slide', action: 'a hand places one token',
              slide: { motion: true, file: 'slides/s1-test.html', plan: 'the hand places one token' } }
  });
  ok('a zero-still channel accepts motion slides with visible actions',
     !has(bads(run([movingSlide(cover), movingSlide(goodShot)], null, { policy: allMotionPolicy })),
          /true-motion|consecutive non-motion|visual\.action/));
  ok('a zero-still channel rejects one ordinary still',
     has(bads(run([movingSlide(cover), goodShot], null, { policy: allMotionPolicy })),
         /true-motion shots|consecutive non-motion shots/));

  // music cues
  ok('a cue naming nothing in window.MUSIC is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { sound: { cue: 'tense' } })], { MUSIC: { base: {} } })),
         /not in window\.MUSIC/));
  ok('a cue that exists passes',
     !has(bads(run([cover, Object.assign({}, goodShot, { sound: { cue: 'base' } }), ctaShot], { MUSIC: { base: {} } })),
          /not in window\.MUSIC/));

  // ── the story pass (--draft) ──
  // A 4a skeleton: beats, feels, narration sentences, the two hook fields. No tts spelling,
  // no camera slots, no stored prompt — the fields 4b writes.
  const skel = (b) => ({ type: b === 'hook' ? 'cover' : 'points', beat: b,
                         shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '한 가지 정보', infoType: 'other' },
                         narration: [{ sub: '가' }], visual: {} });
  const skelCover = Object.assign(skel('hook'), { hookType: 'fear', hookForm: 'gap' });
  const skeleton = [skelCover, skel('drip'), skel('drip'), skel('cta')];
  ok('a story-pass skeleton passes with --draft',
     bads(run(skeleton, null, { draft: true })).length === 0);
  ok('the same skeleton fails without --draft',
     has(bads(run(skeleton)), /no tts/));
  ok('a deferred check is reported as later, not dropped',
     run(skeleton, null, { draft: true }).filter((f) => f.level === 'later').length === 4);
  ok('a story-layer violation still fails with --draft',
     has(bads(runLong([Object.assign({}, skelCover, { arc: 'story' }), skel('hooking'), skel('body'),
                       skel('result'), skel('turn'), skel('cta')], null, { draft: true })),
         /result comes before the turn/));
  ok('an invented vocabulary value still fails with --draft',
     has(bads(run([skelCover, Object.assign(skel('drip'), { shot: { feel: 'x', size: 'closeup' } }),
                   skel('drip'), skel('cta')], null, { draft: true })), /size "closeup"/));

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
  if (!target) die('usage: check-scenes.js <storyboard dir | scenes.js> [--draft] [--json]');
  if (!fs.existsSync(target)) die('path not found: ' + target);
  const scenesPath = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  if (!fs.existsSync(scenesPath)) die('scenes.js not found: ' + scenesPath);

  const draft = argv.indexOf('--draft') !== -1;
  const win = readScenes(scenesPath);
  const fmt = formatOf(scenesPath);
  const formatVideoMax = fmt.video && Number.isFinite(Number(fmt.video.generatedSecondsMax))
    ? Math.floor(Number(fmt.video.generatedSecondsMax) / 8) : 2;
  const profilePath = findProfile(scenesPath);
  const profileRaw = profilePath ? frontmatter(profilePath) : {};
  const profileHasPolicy = MOTION_PROFILE_KEYS.some((k) => profileRaw[k] !== undefined);
  const profilePolicy = normalizeMotionPolicy(profileHasPolicy ? profileRaw : null, formatVideoMax,
                                               profilePath || 'format default');
  const scenePolicy = normalizeMotionPolicy(win.MOTION_POLICY || null, formatVideoMax, 'window.MOTION_POLICY');
  const effectivePolicy = profileHasPolicy ? profilePolicy
    : normalizeMotionPolicy(null, formatVideoMax, 'format default');
  const findings = check(win, fmt, { draft, policy: effectivePolicy });

  profilePolicy.errors.forEach((what) => findings.push({ level: 'bad', where: 'profile motion policy', what }));
  scenePolicy.errors.forEach((what) => findings.push({ level: draft ? 'later' : 'bad',
                                                       where: 'window.MOTION_POLICY', what }));
  if (profileHasPolicy && !win.MOTION_POLICY) {
    findings.push({ level: draft ? 'later' : 'bad', where: 'window.MOTION_POLICY',
                    what: 'channel profile declares a motion policy — copy it into scenes.js for the browser check strip' });
  } else if (profileHasPolicy && win.MOTION_POLICY &&
             policyComparable(profilePolicy) !== policyComparable(scenePolicy)) {
    findings.push({ level: draft ? 'later' : 'bad', where: 'window.MOTION_POLICY',
                    what: 'scenes.js motion policy does not match profile.md — the channel profile wins' });
  } else if (!profileHasPolicy && win.MOTION_POLICY) {
    findings.push({ level: draft ? 'later' : 'bad', where: 'window.MOTION_POLICY',
                    what: 'scenes.js declares a motion override that profile.md does not authorize' });
  }

  /* The scenario page is an upstream input (storyboard §3.5) — written before the board and
     consumed by §4. If it changed after scenes.js did, the input moved behind its consumer,
     which is the drift `scenario-stage.md`'s freeze rule exists to stop. Clock comparison,
     so it lives here where the paths are, not in check() where the fixtures are. */
  const scenarioPath = path.join(path.dirname(scenesPath), 'scenario.md');
  if (fs.existsSync(scenarioPath) &&
      fs.statSync(scenarioPath).mtimeMs > fs.statSync(scenesPath).mtimeMs) {
    findings.push({ level: 'warn', where: 'episode',
                    what: 'scenario.md is newer than scenes.js — an upstream input changed after ' +
                          'its consumer; the board is the source of truth once §4 opens' });
  }
  const bad = findings.filter((f) => f.level === 'bad');
  const warn = findings.filter((f) => f.level === 'warn');
  const later = findings.filter((f) => f.level === 'later');

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify({
      format: fmt.format, shots: win.SCENES.length, draft,
      violations: bad.length, warnings: warn.length, deferred: later.length, findings
    }, null, 2) + '\n');
    process.exit(bad.length ? 1 : 0);
  }

  const lines = ['scenes.js contract — ' + fmt.label + ' · ' + win.SCENES.length + ' shots' +
                 (draft ? ' · story pass (§4a)' : ''), ''];
  if (!findings.length) {
    lines.push('  Structure, vocabularies and references all check out.');
    lines.push('  Frame overflow, hero-stat width and speech rate are measured against the');
    lines.push('  rendered canvas — open storyboard.html for those.');
  } else {
    // One episode-wide mistake shows up once per shot, and printing it 25 times buries
    // everything else. Same finding, same level → one line naming the shots it hit.
    const groups = new Map();
    bad.concat(warn).forEach((f) => {
      const key = f.level + '\0' + f.what;
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
  if (draft) {
    lines.push('  ' + later.length + ' machine-layer check(s) deferred to §4b — run again without --draft there.');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad.length ? 1 : 0);
}

main();
