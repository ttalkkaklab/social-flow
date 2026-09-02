#!/usr/bin/env node
/**
 * cost-preview.js — what this episode has already spent, and what its video slots will cost.
 *
 *   cost-preview.js <storyboard dir | scenes.js>            human-readable summary
 *   cost-preview.js <storyboard dir | scenes.js> --json     machine-readable, for SB_DOC.cost
 *   cost-preview.js <storyboard dir | scenes.js> --sbdoc    the SB_DOC.cost block, ready to paste
 *   cost-preview.js --selftest                              pins the routing table and the drift guard
 *
 * ## Why this exists
 *
 * Approval at storyboard §7 is the last free moment. After it, every generated-video
 * slot turns into an API call that bills, and a 4-second b-roll on Veo costs more than
 * every image in the episode put together. So the approval screen has to say two
 * numbers: what has gone out already (images, from the ledger) and what saying yes
 * commits (the video slots, from scenes.js).
 *
 * ## Two files, two jobs
 *
 *   .work/cost-tally.tsv     the actual ledger — what was really spent (cost-tally.md)
 *   .work/cost-forecast.tsv  written here — the projection for this episode's video slots
 *
 * `--json` is the read-only lane and writes neither: board.js calls it once per episode to
 * draw a page, and observing a channel must not change every episode in it.
 *
 * `.work/cost-estimate.tsv` is a third file and belongs to autoproduce §5: a whole-episode
 * projection used only for the cap verdict. This script never reads or writes it, so an
 * unattended run's cap check and a storyboard's approval screen can't clobber each other.
 *
 * ## Prices come from one place and the maths from one calculator
 *
 * The projection is rows in `cost-tally.tsv` format, and the totals come from running
 * `cost-report.sh` — the same calculator the post-hoc report uses, reading the same
 * `prices.tsv`. Nothing here knows a unit price. If the estimate and the bill came from
 * different calculators, the estimate would mean nothing.
 *
 * ## What lands in the forecast — video slots only
 *
 * TTS and music stay out on purpose. `music.lyria-realtime` has no published unit price,
 * so its key is `?` in prices.tsv and the calculator refuses a verdict on any file
 * carrying it (exit 1, by design — a silent $0 shrinks the episode). Putting it in the
 * forecast would make every forecast unreadable. Narration on the local engine is $0.
 * What is left — the video slots — is where saying yes actually spends money.
 *
 * Exit codes follow cost-report.sh so a caller can branch the same way:
 *   0  ok
 *   1  verdict unavailable (unknown key, or a price still unconfirmed)
 *   3  input error (path missing, scenes.js unreadable)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const SELF_DIR = __dirname;
const REPORT_SH = path.join(SELF_DIR, 'cost-report.sh');

function die(msg, code) {
  process.stderr.write('cost-preview: ' + msg + '\n');
  process.exit(code === undefined ? 3 : code);
}

/**
 * Routing table — the route each slot is planned to leave the storyboard on.
 *
 * The source of truth for the rules is ../../produce/references/video-model-selection.md
 * §The four selection rules; what is frozen here is only the price key each route bills on.
 *
 *   b-roll keeps the clip's own sound (produce absolute rule 9) -> Veo. It needs no
 *   reference image, no extension and no 4K, so rule 2 picks the cheapest tier that
 *   qualifies: lite. 1080p is 8s-only, so a 4-second cut still generates and bills 8.
 *
 *   A motion background has its sound discarded by the builder, so silent Seedance wins
 *   with no downside, and it bills the seconds actually requested.
 *
 *   A quote speech clip goes through veo_reference, which refuses the lite model and is
 *   pinned to 8 seconds — so fast is the floor there.
 */
const ROUTES = {
  'broll/veo': {
    key: 'veo.lite.1080p', fixedSeconds: 8,
    why: 'veo_img2video · lite · 1080p generates 8s whatever the cut uses'
  },
  'broll/seedance': {
    key: 'seedance.1-5-pro-audio.1080p',
    why: 'seedance_img2video · generateAudio true — the slot plays the clip\'s own sound'
  },
  'motion/seedance': {
    key: 'seedance.1-5-pro-silent.1080p',
    why: 'seedance_img2video · silent — the builder keeps only the video track'
  },
  'motion/veo': {
    key: 'veo.lite.1080p', fixedSeconds: 8,
    why: 'veo_img2video · lite — the no-ARK_API_KEY fallback route · 1080p is 8s-only'
  },
  'quote/veo': {
    key: 'veo.fast.1080p', fixedSeconds: 8,
    why: 'veo_reference · fast (lite has no reference images) · pinned to 8s'
  },
  /* A footage slide (scenes-schema §footage treatment) carries one generated clip per reveal
     group. The builder keeps only the video track, so the silent Seedance route applies — and
     it bills the seconds each shot asks for. These shots are outside generatedVideoMax; the
     forecast is where their spend becomes visible, and storyboard §5's gate is where it is approved. */
  'footage/seedance': {
    key: 'seedance.1-5-pro-silent.1080p',
    why: 'seedance_img2video · silent — a footage slide clip; the builder keeps only the video track'
  },
  'footage/veo': {
    key: 'veo.lite.1080p', fixedSeconds: 8,
    why: 'veo_img2video · lite — a footage slide clip on the no-ARK_API_KEY route · 1080p is 8s-only'
  }
};

/**
 * Reads scenes.js by evaluating it in a vm sandbox — the same precedent
 * format-resolve.js:readScenes and extract-text.js use. The file is a plain script
 * assigning window.SCENES / window.THEME at top level.
 */
function readScenes(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  } catch (e) {
    die('failed to evaluate scenes.js: ' + (e && e.message));
  }
  if (!Array.isArray(sandbox.window.SCENES)) die('scenes.js has no window.SCENES array');
  return sandbox.window;
}

/**
 * The episode's video slots, in shot order.
 *
 * This function and costFingerprint below decide the same thing — which shots cost money.
 * The fingerprint is duplicated into storyboard-html-template.html so the check strip can
 * tell a stale estimate from a fresh one; --selftest fails if the two copies drift.
 */
function videoSlots(scenes) {
  const slots = [];
  scenes.forEach((shot, i) => {
    const s = shot || {};
    const v = s.visual || {};
    const shotNo = i + 1;
    if (s.type === 'broll') {
      const engine = v.engine === 'seedance' ? 'seedance' : 'veo';
      slots.push({ shot: shotNo, kind: 'broll', engine, duration: Number(s.duration) || 0,
                   label: 'b-roll after scene ' + (s.after === undefined ? '?' : s.after) });
    } else if (v.video) {
      const engine = (v.video.engine || v.engine) === 'veo' ? 'veo' : 'seedance';
      slots.push({ shot: shotNo, kind: 'motion', engine, duration: Number(s.duration) || 0,
                   label: 'motion background' });
    } else if (s.type === 'quote' && v.clip && typeof v.clip === 'object') {
      slots.push({ shot: shotNo, kind: 'quote', engine: 'veo', duration: 8,
                   label: 'speech clip' + (s.speaker ? ' · ' + s.speaker : '') });
    }
    const sl = v.slide;
    if (sl && sl.treatment === 'footage' && Array.isArray(sl.shots)) {
      sl.shots.forEach((sh, j) => {
        const shot = sh || {};
        const engine = (shot.engine || v.engine) === 'veo' ? 'veo' : 'seedance';
        slots.push({ shot: shotNo, kind: 'footage', engine, duration: Number(shot.duration) || 0,
                     label: 'footage clip g' + (shot.group || j + 1) });
      });
    }
  });
  return slots;
}

/* ── DRIFT GUARD ───────────────────────────────────────────────────────────
   storyboard-html-template.html carries costFingerprint verbatim so the check strip can
   recompute it from the live SCENES and compare it against the SB_DOC.cost snapshot.
   Keep the two copies identical — --selftest fails when they drift. */
function costFingerprint(scenes) {
  var parts = [];
  for (var i = 0; i < scenes.length; i++) {
    var s = scenes[i] || {}, v = s.visual || {};
    var slot = null;
    if (s.type === "broll") slot = ["broll", v.engine === "seedance" ? "seedance" : "veo", Number(s.duration) || 0];
    else if (v.video) slot = ["motion", (v.video.engine || v.engine) === "veo" ? "veo" : "seedance", Number(s.duration) || 0];
    else if (s.type === "quote" && v.clip && typeof v.clip === "object") slot = ["quote", "veo", 8];
    if (slot) parts.push((i + 1) + ":" + slot.join("/"));
    var sl = v.slide;
    if (sl && sl.treatment === "footage" && Array.isArray(sl.shots)) {
      for (var j = 0; j < sl.shots.length; j++) {
        var sh = sl.shots[j] || {};
        parts.push((i + 1) + "g" + (sh.group || j + 1) + ":footage/" + ((sh.engine || v.engine) === "veo" ? "veo" : "seedance") + "/" + (Number(sh.duration) || 0));
      }
    }
  }
  return parts.length ? parts.join(",") : "none";
}
/* ── end drift guard ─────────────────────────────────────────────────────── */

/** Turns the slots into cost-tally.tsv rows. */
function forecastRows(slots) {
  return slots.map((slot) => {
    const route = ROUTES[slot.kind + '/' + slot.engine];
    const qty = route.fixedSeconds !== undefined ? route.fixedSeconds : slot.duration;
    return {
      key: route.key,
      qty,
      memo: 'forecast: shot ' + slot.shot + ' ' + slot.label + ' — ' + route.why,
      slot,
      route
    };
  });
}

/**
 * Runs cost-report.sh and reads back the item lines and the total.
 * Parsing the report rather than the price table is what keeps one calculator.
 */
function runReport(tsvPath) {
  const r = spawnSync(REPORT_SH, [tsvPath], { encoding: 'utf8' });
  if (r.error) die('could not run cost-report.sh: ' + r.error.message);
  const out = (r.stdout || '') + (r.stderr || '');
  const items = [];
  let total = 0;
  let unresolved = [];
  out.split('\n').forEach((line) => {
    if (/^!!/.test(line)) { unresolved.push(line.trim()); return; }
    const totalMatch = line.match(/^total\s+([0-9]+(?:\.[0-9]+)?)\s*$/);
    if (totalMatch) { total = parseFloat(totalMatch[1]); return; }
    const item = line.match(/^(\S+)\s+(\S+)\s+([0-9.]+)\s+([0-9.]+)\s+(.*)$/);
    if (item && item[1] !== 'item') {
      items.push({ key: item[1], qty: item[2], unitUsd: parseFloat(item[3]),
                   subtotalUsd: parseFloat(item[4]), note: item[5].trim() });
    }
  });
  return { exit: r.status === null ? 3 : r.status, items, total, unresolved, raw: out };
}

/** Groups report items by price-key family — image / veo / seedance / tts / music. */
function byFamily(items) {
  const acc = {};
  items.forEach((it) => {
    const fam = it.key.split('.')[0];
    acc[fam] = (acc[fam] || 0) + it.subtotalUsd;
  });
  return acc;
}

function usd(n) { return '$' + n.toFixed(2); }

/* ── Per-episode video budget (owner directive 2026-09-03) ──────────────────
   The channel profile's `video_budget_usd` (plugin default 10 — the same default
   check-scenes.js carries in its motion policy) caps what one episode may spend on
   generated video: b-roll, motion backgrounds, quote clips and footage shots, billed and
   projected together. Stills, TTS and music are outside it. Over the budget the verdict
   is `!!` and exit 1 — storyboard §5 fits the board first (footage-lane.md §3 has the
   ladder) and asks the user only for a number that fits. */
const VIDEO_BUDGET_DEFAULT_USD = 10;
const VIDEO_FAMILIES = ['seedance', 'veo'];

function findProfile(startDir) {
  let dir = startDir;
  for (let i = 0; i < 7; i++) {
    const candidate = path.join(dir, 'profile.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Flat frontmatter — the same reader check-scenes.js uses for the motion policy. */
function frontmatter(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return {};
  const out = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (kv) out[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');
  });
  return out;
}

/** null = the profile switched the budget off; otherwise a number (the plugin default when undeclared). */
function videoBudgetOf(profilePath) {
  const raw = profilePath ? frontmatter(profilePath).video_budget_usd : undefined;
  if (raw === undefined || raw === '') return VIDEO_BUDGET_DEFAULT_USD;
  if (raw === 'off' || raw === 'none') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : VIDEO_BUDGET_DEFAULT_USD;
}

function videoSpent(items) {
  return items.filter((it) => VIDEO_FAMILIES.indexOf(String(it.key).split('.')[0]) !== -1)
    .reduce((sum, it) => sum + it.subtotalUsd, 0);
}

function budgetVerdict(spentItems, forecastTotal, budgetUsd) {
  const spent = videoSpent(spentItems);
  const committed = spent + forecastTotal;
  const over = budgetUsd !== null && committed > budgetUsd + 1e-9;
  return { budgetUsd, spent, forecast: forecastTotal, committed, over,
           line: budgetUsd === null ? null
             : (over ? '!! ' : '   ') + 'video budget ' + usd(committed) + ' committed of ' + usd(budgetUsd) +
               (over ? ' — over by ' + usd(committed - budgetUsd) + '; fit the board before generating (footage-lane.md §3)'
                     : ' (' + usd(budgetUsd - committed) + ' headroom for regenerations)') };
}

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };

  // Every route a slot can resolve to has a price key.
  ['broll/veo', 'broll/seedance', 'motion/seedance', 'motion/veo', 'quote/veo', 'footage/seedance', 'footage/veo']
    .forEach((r) => ok('route ' + r + ' has a price key', !!(ROUTES[r] && ROUTES[r].key)));

  // Every price key the routing table names exists in prices.tsv — an invented key
  // would only surface as exit 1 on a real episode.
  const prices = fs.readFileSync(path.join(SELF_DIR, 'prices.tsv'), 'utf8')
    .split('\n').filter((l) => l && !/^\s*#/.test(l))
    .map((l) => l.split('\t')[0].trim());
  Object.keys(ROUTES).forEach((r) => {
    ok('prices.tsv carries ' + ROUTES[r].key, prices.indexOf(ROUTES[r].key) !== -1);
  });

  // Veo bills its generated length, not the used length — a 4s b-roll still bills 8.
  const brollRow = forecastRows([{ shot: 2, kind: 'broll', engine: 'veo', duration: 4, label: 'x' }])[0];
  ok('a 4s Veo b-roll is forecast at 8 seconds', brollRow.qty === 8);
  // Seedance bills the seconds asked for.
  const motionRow = forecastRows([{ shot: 3, kind: 'motion', engine: 'seedance', duration: 6, label: 'x' }])[0];
  ok('a 6s silent Seedance motion background is forecast at 6 seconds', motionRow.qty === 6);

  // Slot detection: a still shot costs nothing, the three paid kinds are caught.
  const sample = [
    { type: 'cover', visual: { picture: 'still' } },
    { type: 'points', duration: 6, visual: { video: { prompt: 'x' } } },
    { type: 'quote', visual: { clip: { prompt: 'x' } } },
    { type: 'points', duration: 5, visual: { clip: '.work/x.mp4' } },
    { type: 'broll', after: 0, duration: 4, visual: {} }
  ];
  const slots = videoSlots(sample);
  ok('the still cover and a string clip path are not billed', slots.length === 3);
  ok('the motion background is detected', slots[0].kind === 'motion' && slots[0].engine === 'seedance');
  ok('the quote speech clip is detected', slots[1].kind === 'quote');
  ok('the b-roll is detected', slots[2].kind === 'broll' && slots[2].engine === 'veo');
  // A footage slide bills one clip per shot, on the silent Seedance route unless the shot says veo.
  const footage = videoSlots([{ type: 'points', visual: { slide: { treatment: 'footage', motion: true,
    shots: [{ group: 1, clip: 'slides/footage/s1-g1.mp4', duration: 5 }, { group: 2, clip: 'slides/footage/s1-g2.mp4', duration: 4, engine: 'veo' }] } } }]);
  ok('footage shots are detected one per clip', footage.length === 2 && footage[0].kind === 'footage' && footage[0].engine === 'seedance' && footage[1].engine === 'veo');
  ok('a 5s footage clip on Seedance is forecast at 5 seconds', forecastRows([footage[0]])[0].qty === 5);

  // the per-episode video budget (2026-09-03)
  const spentItems = [{ key: 'seedance.1-5-pro-silent.1080p', subtotalUsd: 2.09 }, { key: 'image.gpt-image-2.high', subtotalUsd: 0.44 },
                      { key: 'tts.elevenlabs', subtotalUsd: 0.22 }];
  ok('only seedance/veo rows count as video spend', Math.abs(videoSpent(spentItems) - 2.09) < 1e-9);
  const overV = budgetVerdict(spentItems, 12.93, 10);
  ok('spent video plus the forecast over the budget is a !! line', overV.over && /^!! video budget \$15\.02 committed of \$10\.00/.test(overV.line));
  const underV = budgetVerdict(spentItems, 7.5, 10);
  ok('under the budget the line shows the headroom', !underV.over && /headroom/.test(underV.line));
  ok('a profile may switch the budget off', budgetVerdict(spentItems, 50, null).line === null && !budgetVerdict(spentItems, 50, null).over);
  ok('footage shots change the fingerprint',
     costFingerprint([{ type: 'points', visual: { slide: { treatment: 'footage', shots: [{ group: 1, duration: 5 }] } } }]) !== 'none');

  // The fingerprint moves when a slot's engine, length or position changes, and only then.
  const fpA = costFingerprint(sample);
  ok('an episode with no video slots fingerprints as none', costFingerprint([{ type: 'cover' }]) === 'none');
  const swapped = JSON.parse(JSON.stringify(sample));
  swapped[1].duration = 8;
  ok('changing a slot duration changes the fingerprint', costFingerprint(swapped) !== fpA);

  // Drift guard — the template carries the same fingerprint function. Leading indentation
  // differs (the template nests it inside the renderer IIFE), so the comparison strips it;
  // any change to the logic itself still fails here.
  const tpl = path.join(SELF_DIR, '..', '..', 'storyboard', 'references', 'storyboard-html-template.html');
  const deindent = (s) => s.split('\n').map((l) => l.trim()).join('\n');
  if (fs.existsSync(tpl)) {
    const html = deindent(fs.readFileSync(tpl, 'utf8'));
    ok('storyboard-html-template.html carries costFingerprint',
       html.indexOf(deindent(costFingerprint.toString())) !== -1);
  } else {
    process.stderr.write('WARN storyboard-html-template.html not found — drift guard skipped\n');
  }

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('cost-preview selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();

  const wantJson = argv.indexOf('--json') !== -1;
  const wantSbdoc = argv.indexOf('--sbdoc') !== -1;
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: cost-preview.js <storyboard dir | scenes.js> [--json|--sbdoc]');
  if (!fs.existsSync(target)) die('path not found: ' + target);

  const scenesPath = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  if (!fs.existsSync(scenesPath)) die('scenes.js not found: ' + scenesPath);
  const storyboardDir = path.dirname(path.resolve(scenesPath));
  const episodeDir = path.dirname(storyboardDir);
  const workDir = path.join(episodeDir, '.work');

  const win = readScenes(scenesPath);
  const scenes = win.SCENES;

  const slots = videoSlots(scenes);
  const rows = forecastRows(slots);
  const fingerprint = costFingerprint(scenes);

  // Write the projection where the ledger lives, in ledger format — except under --json, which
  // is the read-only lane. board.js calls it for every episode in a channel, and a page that
  // only observes must not leave a new file in a published episode's .work/ to do it. The
  // report cost-report.sh produces still needs a file, so --json gets a temp one.
  const forecastPath = wantJson
    ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cost-preview-')), 'cost-forecast.tsv')
    : path.join(workDir, 'cost-forecast.tsv');
  if (!wantJson) fs.mkdirSync(workDir, { recursive: true });
  const header = [
    '# Projected generated-video spend for this episode — written by cost-preview.js.',
    '# Not the ledger. What was actually spent lives in cost-tally.tsv; this file is what',
    '# approving the storyboard commits. Regenerate it after any change to the video slots.',
    '# fingerprint: ' + fingerprint,
    ''
  ].join('\n');
  fs.writeFileSync(forecastPath,
    header + rows.map((r) => [r.key, r.qty, r.memo].join('\t')).join('\n') + (rows.length ? '\n' : ''));

  const tallyPath = path.join(workDir, 'cost-tally.tsv');
  const spent = fs.existsSync(tallyPath)
    ? runReport(tallyPath)
    : { exit: 0, items: [], total: 0, unresolved: [], raw: '' };
  const forecast = rows.length
    ? runReport(forecastPath)
    : { exit: 0, items: [], total: 0, unresolved: [], raw: '' };

  const spentFamilies = byFamily(spent.items);
  const channelProfile = findProfile(path.dirname(episodeDir));
  const budget = budgetVerdict(spent.items, forecast.total, videoBudgetOf(channelProfile));
  const result = {
    generated: new Date().toISOString().slice(0, 10),
    fingerprint,
    spent: {
      total: spent.total,
      byFamily: spentFamilies,
      images: spentFamilies.image || 0,
      lines: spent.items.length,
      unresolved: spent.unresolved
    },
    forecast: {
      total: forecast.total,
      slots: rows.length,
      rows: rows.map((r) => ({
        shot: r.slot.shot, kind: r.slot.kind, engine: r.slot.engine,
        key: r.key, qty: r.qty, label: r.slot.label, why: r.route.why
      })),
      unresolved: forecast.unresolved
    },
    committed: spent.total + forecast.total,
    videoBudget: { usd: budget.budgetUsd, spentUsd: budget.spent, forecastUsd: budget.forecast,
                   committedUsd: budget.committed, over: budget.over,
                   profile: channelProfile ? path.relative(process.cwd(), channelProfile) : null },
    tally: path.relative(episodeDir, tallyPath),
    // Where the projection belongs, not where this run put it — under --json it went to a
    // temp file that is deleted below.
    forecastFile: path.join('.work', 'cost-forecast.tsv')
  };

  if (wantJson) fs.rmSync(path.dirname(forecastPath), { recursive: true, force: true });

  // Over the video budget is a warn-grade verdict (exit 1): the board is fittable, the money
  // is not yet spent, and storyboard §5 owns the fitting.
  const worstExit = Math.max(spent.exit === 3 ? 0 : spent.exit, forecast.exit === 3 ? 0 : forecast.exit,
                             budget.over ? 1 : 0);

  if (wantJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(worstExit);
  }

  if (wantSbdoc) {
    const block = [
      '  // Cost snapshot — regenerate with',
      '  //   node ${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references/cost-preview.js . --sbdoc',
      '  // The check strip recomputes the fingerprint from SCENES and flags a stale snapshot.',
      '  cost: {',
      '    spentUsd: ' + spent.total.toFixed(4) + ',            // already billed — the .work/cost-tally.tsv ledger',
      '    imagesUsd: ' + (spentFamilies.image || 0).toFixed(4) + ',           // of that, image generation',
      '    forecastUsd: ' + forecast.total.toFixed(4) + ',         // the generated-video slots below, if approved',
      '    slots: ' + rows.length + ',',
      '    videoBudgetUsd: ' + (budget.budgetUsd === null ? 'null' : budget.budgetUsd.toFixed(2)) + ',      // profile video_budget_usd (plugin default 10)',
      '    videoUsd: ' + budget.committed.toFixed(4) + ',           // generated video billed + projected — the number the budget caps',
      '    fingerprint: "' + fingerprint + '",',
      '    asOf: "' + result.generated + '"',
      '  },'
    ].join('\n');
    process.stdout.write(block + '\n');
    process.exit(worstExit);
  }

  const out = [];
  out.push('Episode cost — ' + path.basename(episodeDir));
  out.push('');
  out.push('Already billed (' + result.tally + ')');
  if (!spent.items.length) {
    out.push('  nothing in the ledger yet');
  } else {
    Object.keys(spentFamilies).sort().forEach((fam) => {
      out.push('  ' + fam.padEnd(12) + usd(spentFamilies[fam]));
    });
    out.push('  ' + 'total'.padEnd(12) + usd(spent.total));
  }
  spent.unresolved.forEach((u) => out.push('  ' + u));
  out.push('');
  out.push('Approving commits (' + result.forecastFile + ')');
  if (!rows.length) {
    out.push('  no generated-video slots — nothing more to spend on video');
  } else {
    rows.forEach((r) => {
      const item = forecast.items.find((it) => it.key === r.key);
      const each = item ? item.unitUsd * r.qty : null;
      out.push('  shot ' + String(r.slot.shot).padStart(2) + '  ' + r.slot.label);
      out.push('        ' + r.key + ' × ' + r.qty +
               (each === null ? '' : '  = ' + usd(each)) + '  · ' + r.route.why);
    });
    out.push('  ' + 'total'.padEnd(12) + usd(forecast.total));
  }
  forecast.unresolved.forEach((u) => out.push('  ' + u));
  if (budget.line) {
    out.push('');
    out.push('Video budget (' + (channelProfile ? path.relative(episodeDir, channelProfile) : 'plugin default') + ')');
    out.push('  ' + budget.line.replace(/^   /, ''));
  }
  out.push('');
  out.push('Committed by approval: ' + usd(result.committed) +
           '  (' + usd(spent.total) + ' spent + ' + usd(forecast.total) + ' projected)');
  if (worstExit === 1) {
    out.push('');
    out.push('Verdict incomplete — the !! lines above have to be resolved before these totals');
    out.push('can be read as this episode\'s cost. Carry them onto the approval screen as they are.');
  }
  process.stdout.write(out.join('\n') + '\n');
  process.exit(worstExit);
}

main();
