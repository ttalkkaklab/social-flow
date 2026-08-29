#!/usr/bin/env node
/**
 * episode-state.js — where this episode is, and what the next move is.
 *
 *   episode-state.js <episode dir>              one episode, human-readable
 *   episode-state.js <episode dir> --json       the same, machine-readable
 *   episode-state.js <channel dir> --all        every episode in the channel, one line each
 *   episode-state.js --selftest                 pins the stage rules
 *
 * ## Why this exists
 *
 * An episode runs across days and sessions — storyboard on Tuesday, filming on Wednesday,
 * produce on Friday. When a session ends mid-run, nothing says where it stopped. The state
 * is real, but it is scattered: a frontmatter `status`, two comment lines at the top of
 * scenes.js, whatever happens to be sitting in `.work/`, whether `output/video/video.mp4`
 * exists. Working out "what now" means opening the directory and judging.
 *
 * ## It derives, it does not store
 *
 * There is deliberately no state file. `storyboard.md`'s `status` frontmatter is already the
 * gate the next skill reads, and a second copy of it would drift from the first — that is the
 * disease `format-lint.js` exists to police. So this reads what the skills already write and
 * works the stage out from that. Nothing to keep in step, nothing to go stale, and it is
 * still right after a crash, a `git checkout`, or a hand-edit.
 *
 * ## What "blocked" means
 *
 * The stage is what has been *finished*. `next` is the command to run. `blocked` is a
 * promise the directory makes that it hasn't kept — a storyboard marked approved with three
 * filmed scenes and no footage, images planned and never generated, a queue marker saying
 * ready with no video. Those are the states that quietly stall an episode for a week.
 *
 * Exit codes:
 *   0  ok
 *   1  the episode is blocked (see `blocked`) — a caller can branch on this
 *   3  input error (path missing, not an episode directory)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function die(msg) {
  process.stderr.write('episode-state: ' + msg + '\n');
  process.exit(3);
}

const exists = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };
// The speed pass (produce §7.5) writes its own line into build-report.txt. An episode whose
// report has no such line shipped the un-sped build to output/ — subtitles included, on a
// timeline that no longer matches the picture. null = no report to read, so no verdict.
const hasSpeedMarker = (p) => {
  try { return /── speedup x/.test(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
};
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

function lsCount(dir, re) {
  if (!isDir(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => re.test(f)).length;
}

/** The frontmatter block at the top of storyboard.md — the gate the next skill reads. */
function frontmatter(file) {
  if (!exists(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

/** scenes.js, plus the two approval comment lines the storyboard skill writes at §7. */
function readScenes(file) {
  if (!exists(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  let win = {};
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
    win = sandbox.window;
  } catch (e) {
    return { broken: e && e.message };
  }
  const approved = (src.match(/^\s*\/\/\s*approved:\s*(.+)$/m) || [])[1];
  const review = (src.match(/^\s*\/\/\s*review:\s*(.+)$/m) || [])[1];
  return {
    scenes: Array.isArray(win.SCENES) ? win.SCENES : [],
    format: win.FORMAT || 'shorts-9x16',
    voice: win.VOICE || null,
    approved: approved ? approved.trim() : null,
    review: review ? review.trim() : null
  };
}

/**
 * What the scenes say this episode needs before it can be built.
 *
 * Image files are collected by **the path each scene names**, not by a filename convention.
 * Real episodes name them `scene-1-1.png`, `s1-wakeup.png`, or build the path in an
 * expression — assuming `scene-<n>.png` reports every one of those as missing.
 */
function requirements(scenes) {
  const req = { imageFiles: [], slideFiles: [], footageFiles: [], videoSlots: 0, filmed: 0 };
  const addImage = (p) => {
    if (typeof p === 'string' && p && req.imageFiles.indexOf(p) === -1) req.imageFiles.push(p);
  };
  scenes.forEach((s) => {
    const v = s.visual || {};
    if (v.source === 'recording' || v.picture === 'recording') {
      req.filmed++;
      if (v.clip && typeof v.clip === 'string') req.footageFiles.push(v.clip);
    }
    if (v.slide && v.slide.file) req.slideFiles.push(v.slide.file);
    addImage(v.bg);
    addImage(v.src);                                  // a b-roll's source still
    (s.narration || []).forEach((n) => addImage(n && n.img));
    if (s.type === 'broll' || v.video || (s.type === 'quote' && v.clip && typeof v.clip === 'object'))
      req.videoSlots++;
  });
  return req;
}

/**
 * The stage ladder. Each rung is finished when its `done` holds; the episode's stage is the
 * last finished rung, and `next` belongs to the first unfinished one.
 */
function stageOf(ep) {
  const fm = ep.frontmatter || {};
  const sc = ep.scenesData;
  const status = (fm.status || '').toLowerCase();

  if (!ep.has.storyboardDir || !sc) return 'empty';
  if (sc.broken) return 'broken';
  if (status === 'published' || ep.has.publishLog) return 'published';
  if (status === 'produced' || ep.has.video) return 'produced';
  if (status === 'approved' || sc.approved) return 'approved';
  if (ep.has.scenes) return 'drafted';
  return 'empty';
}

function nextStep(ep, stage) {
  const ch = ep.channel, tp = ep.topic;
  switch (stage) {
    case 'empty':     return '/social-flow:storyboard ' + ch + ' ' + tp;
    case 'broken':    return 'scenes.js does not evaluate — fix it before anything reads it';
    case 'drafted':   return 'finish the storyboard and take it to the §7 approval gate';
    case 'approved':  return ep.req && ep.req.filmed
                             ? 'film what script.md lists, then /social-flow:produce ' + ch + ' ' + tp
                             : '/social-flow:produce ' + ch + ' ' + tp;
    case 'produced':  return '/social-flow:publish ' + ch + ' ' + tp;
    case 'published': return 'done — /social-flow:review-recent ' + ch + ' reads how it did';
    default:          return '';
  }
}

/** Promises the directory has made and not kept. These are what stall an episode silently. */
function blockers(ep, stage) {
  const out = [];
  const sc = ep.scenesData, req = ep.req, fm = ep.frontmatter || {};
  if (!sc || sc.broken) return out;

  if (stage === 'approved' || stage === 'produced') {
    const missingFootage = req.footageFiles.filter((f) => !exists(path.join(ep.dir, f)));
    if (missingFootage.length)
      out.push(missingFootage.length + ' filmed scene file(s) not saved yet — ' +
               missingFootage.slice(0, 3).join(', ') + (missingFootage.length > 3 ? ' …' : ''));
    const missingSlides = req.slideFiles.filter((f) => !exists(path.join(ep.dir, 'storyboard', f)));
    if (missingSlides.length)
      out.push(missingSlides.length + ' slide file(s) not authored yet (storyboard §8) — ' +
               missingSlides.slice(0, 3).join(', ') + (missingSlides.length > 3 ? ' …' : ''));
  }

  if (stage !== 'empty' && stage !== 'broken' && stage !== 'drafted') {
    const missingImages = req.imageFiles
      .filter((f) => !exists(path.join(ep.dir, 'storyboard', f)));
    if (missingImages.length)
      out.push(missingImages.length + ' of ' + req.imageFiles.length +
               ' scene image(s) the scenes name are not on disk — ' +
               missingImages.slice(0, 3).join(', ') + (missingImages.length > 3 ? ' …' : ''));
  }

  // A queue marker is a standing instruction to a growth loop. Pointing it at a video that
  // does not exist is the one that costs a publishing slot.
  Object.keys(fm).forEach((k) => {
    if (/^queue_/.test(k) && fm[k] === 'ready' && !ep.has.video)
      out.push(k + ': ready but there is no output/video/video.mp4');
  });

  if (stage === 'produced' && !ep.has.platformText.length)
    out.push('video is built but no per-platform text was written');

  if (ep.has.tally && ep.has.video && !ep.has.costReport)
    out.push('the episode built without a cost report (produce §10)');

  // Not on a published episode — that video is already out, and a blocker there is noise.
  if (stage !== 'published' && ep.has.video && ep.has.spedUp === false)
    out.push('output/ holds the un-sped build — the required speed pass never ran ' +
             '(produce §7.5: speedup.sh, then copy the -fast set)');

  return out;
}

function inspect(episodeDir) {
  const dir = path.resolve(episodeDir);
  const sbDir = path.join(dir, 'storyboard');
  const work = path.join(dir, '.work');
  const outDir = path.join(dir, 'output');

  const ep = {
    dir,
    topic: path.basename(dir),
    channel: path.basename(path.dirname(path.dirname(dir))),
    has: {
      storyboardDir: isDir(sbDir),
      scenes: exists(path.join(sbDir, 'scenes.js')),
      research: exists(path.join(sbDir, 'research.md')),
      storyboardMd: exists(path.join(sbDir, 'storyboard.md')),
      storyboardHtml: exists(path.join(sbDir, 'storyboard.html')),
      script: exists(path.join(sbDir, 'script.md')),
      images: lsCount(path.join(sbDir, 'images'), /^scene-\d+\.png$/i),
      slides: lsCount(path.join(sbDir, 'slides'), /\.html$/i),
      footage: lsCount(path.join(dir, 'footage'), /\.(mp4|mov|m4v)$/i),
      video: exists(path.join(outDir, 'video', 'video.mp4')),
      subs: exists(path.join(outDir, 'video', 'subs.srt')),
      cover: exists(path.join(outDir, 'video', 'cover.jpg')),
      costReport: exists(path.join(outDir, 'video', 'cost-report.txt')),
      spedUp: hasSpeedMarker(path.join(outDir, 'video', 'build-report.txt')),
      publishLog: exists(path.join(outDir, 'publish-log.md')),
      tally: exists(path.join(work, 'cost-tally.tsv')),
      forecast: exists(path.join(work, 'cost-forecast.tsv')),
      decisions: exists(path.join(work, 'decisions.tsv')),
      platformText: ['threads', 'instagram', 'facebook', 'youtube']
        .filter((p) => isDir(path.join(outDir, p)))
    }
  };

  ep.frontmatter = frontmatter(path.join(sbDir, 'storyboard.md')) || {};
  ep.scenesData = readScenes(path.join(sbDir, 'scenes.js'));
  ep.req = ep.scenesData && !ep.scenesData.broken
    ? requirements(ep.scenesData.scenes)
    : { imageFiles: [], slideFiles: [], footageFiles: [], videoSlots: 0, filmed: 0 };

  ep.stage = stageOf(ep);
  ep.next = nextStep(ep, ep.stage);
  ep.blocked = blockers(ep, ep.stage);
  return ep;
}

const STAGES = ['empty', 'drafted', 'approved', 'produced', 'published'];

function render(ep) {
  const L = [];
  L.push(ep.channel + ' / ' + ep.topic);
  L.push('');
  const idx = STAGES.indexOf(ep.stage);
  L.push('  stage   ' + (ep.stage === 'broken' ? 'broken' : STAGES.map(
    (s, i) => (i === idx ? '[' + s + ']' : i < idx ? s : '·' + s)).join('  ')));
  L.push('  next    ' + ep.next);
  if (ep.scenesData && ep.scenesData.broken) L.push('  error   scenes.js: ' + ep.scenesData.broken);
  L.push('');

  const sc = ep.scenesData || {};
  const parts = [];
  if (sc.scenes) parts.push(sc.scenes.length + ' shots');
  if (sc.format) parts.push(sc.format);
  if (ep.req.filmed) parts.push(ep.req.filmed + ' filmed');
  if (ep.req.videoSlots) parts.push(ep.req.videoSlots + ' video slot' + (ep.req.videoSlots > 1 ? 's' : ''));
  if (parts.length) L.push('  ' + parts.join(' · '));

  const made = [];
  if (ep.has.research) made.push('research');
  if (ep.has.images) made.push(ep.has.images + ' image' + (ep.has.images > 1 ? 's' : ''));
  if (ep.has.slides) made.push(ep.has.slides + ' slide' + (ep.has.slides > 1 ? 's' : ''));
  if (ep.has.footage) made.push(ep.has.footage + ' footage file' + (ep.has.footage > 1 ? 's' : ''));
  if (ep.has.video) made.push('video.mp4');
  if (ep.has.platformText.length) made.push(ep.has.platformText.join('/'));
  if (made.length) L.push('  ' + made.join(' · '));

  const ledgers = [];
  if (ep.has.tally) ledgers.push('cost ledger');
  if (ep.has.forecast) ledgers.push('cost forecast');
  if (ep.has.decisions) ledgers.push('decision log');
  if (ledgers.length) L.push('  ' + ledgers.join(' · '));
  if (sc.approved) L.push('  approved ' + sc.approved + (sc.review ? '  ·  ' + sc.review : ''));

  if (ep.blocked.length) {
    L.push('');
    L.push('  blocked');
    ep.blocked.forEach((b) => L.push('    · ' + b));
  }
  return L.join('\n');
}

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };
  const base = {
    dir: '/x/data/ch/episodes/tp', topic: 'tp', channel: 'ch',
    has: { storyboardDir: true, scenes: true, video: false, publishLog: false,
           platformText: [], tally: false, costReport: false },
    frontmatter: {}, scenesData: { scenes: [], approved: null },
    req: { imageFiles: [], slideFiles: [], footageFiles: [], videoSlots: 0, filmed: 0 }
  };
  const at = (over) => stageOf(Object.assign({}, base, over));

  ok('scenes.js alone is drafted', at({}) === 'drafted');
  ok('no storyboard directory is empty',
     at({ has: Object.assign({}, base.has, { storyboardDir: false }) }) === 'empty');
  ok('an unparseable scenes.js is broken', at({ scenesData: { broken: 'x' } }) === 'broken');
  ok('the approval comment alone promotes to approved',
     at({ scenesData: { scenes: [], approved: '2026-08-28' } }) === 'approved');
  ok('frontmatter status approved promotes too', at({ frontmatter: { status: 'approved' } }) === 'approved');
  ok('a built video is produced even without the frontmatter flip',
     at({ has: Object.assign({}, base.has, { video: true }) }) === 'produced');
  ok('a publish log is published', at({ has: Object.assign({}, base.has, { publishLog: true }) }) === 'published');
  // The frontmatter is a claim; the file on disk outranks nothing but is read first for
  // published/produced, so a status that runs ahead of the artifacts still reads as that stage
  // and the blocker list is what says the artifacts are missing.
  ok('status published with no artifacts still reads published',
     at({ frontmatter: { status: 'published' } }) === 'published');

  // requirements(): which shots need what
  const req = requirements([
    { type: 'cover', visual: { bg: 'images/scene-1-1.png' } },
    { type: 'points', visual: { source: 'recording', clip: 'footage/s2-demo.mp4' } },
    { type: 'points', visual: { slide: { file: 'slides/s3-flow.html' } } },
    { type: 'points', visual: { bg: 'images/s4-odd.png', video: { prompt: 'x' } } },
    { type: 'broll', visual: { src: 'images/b5-src.png' } },
    { type: 'quote', visual: { clip: { prompt: 'x' } } }
  ]);
  ok('the filmed scene is counted and its file named',
     req.filmed === 1 && req.footageFiles[0] === 'footage/s2-demo.mp4');
  ok('the slide file is collected', req.slideFiles[0] === 'slides/s3-flow.html');
  ok('three paid video slots are counted', req.videoSlots === 3);
  // Images are collected by the path the scene names — episodes really do use
  // scene-1-1.png, s1-wakeup.png, and paths built in an expression.
  ok('image paths are taken from the scenes, whatever they are named',
     req.imageFiles.join(',') === 'images/scene-1-1.png,images/s4-odd.png,images/b5-src.png');
  ok('a shot that names no image contributes none', req.imageFiles.indexOf(undefined) === -1);

  // blockers(): a ready queue marker pointing at nothing
  const b = blockers(Object.assign({}, base, {
    frontmatter: { status: 'produced', queue_threads: 'ready' },
    has: Object.assign({}, base.has, { video: false })
  }), 'produced');
  ok('a ready queue marker with no video is a blocker',
     b.some((x) => /queue_threads/.test(x)));

  const sped = (v) => blockers(Object.assign({}, base, {
    has: Object.assign({}, base.has, { video: true, spedUp: v })
  }), 'produced');
  ok('a built video with no speed-pass marker is a blocker',
     sped(false).some((x) => /un-sped/.test(x)));
  ok('the marker present clears it', !sped(true).some((x) => /un-sped/.test(x)));
  ok('no build report to read makes no claim', !sped(null).some((x) => /un-sped/.test(x)));
  ok('a published episode is past the point of blocking on it',
     !blockers(Object.assign({}, base, {
       has: Object.assign({}, base.has, { video: true, spedUp: false })
     }), 'published').some((x) => /un-sped/.test(x)));

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('episode-state selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const wantJson = argv.indexOf('--json') !== -1;
  const wantAll = argv.indexOf('--all') !== -1;
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: episode-state.js <episode dir | channel dir --all> [--json]');
  if (!isDir(target)) die('not a directory: ' + target);

  if (wantAll) {
    const epRoot = isDir(path.join(target, 'episodes')) ? path.join(target, 'episodes') : target;
    if (!isDir(epRoot)) die('no episodes/ under ' + target);
    const eps = fs.readdirSync(epRoot)
      .map((d) => path.join(epRoot, d)).filter(isDir).sort()
      .map(inspect);
    if (wantJson) {
      process.stdout.write(JSON.stringify(eps.map((e) => ({
        channel: e.channel, topic: e.topic, stage: e.stage, next: e.next, blocked: e.blocked
      })), null, 2) + '\n');
    } else {
      const w = Math.max.apply(null, eps.map((e) => e.topic.length).concat([5]));
      eps.forEach((e) => {
        process.stdout.write(e.topic.padEnd(w) + '  ' + e.stage.padEnd(10) +
          (e.blocked.length ? '  ⚑ ' + e.blocked.length + ' blocked' : '') + '\n');
      });
      const stuck = eps.filter((e) => e.blocked.length);
      process.stdout.write('\n' + eps.length + ' episode(s)' +
        (stuck.length ? ', ' + stuck.length + ' blocked — open one to see why' : '') + '\n');
    }
    process.exit(eps.some((e) => e.blocked.length) ? 1 : 0);
  }

  const ep = inspect(target);
  if (wantJson) {
    process.stdout.write(JSON.stringify({
      channel: ep.channel, topic: ep.topic, stage: ep.stage, next: ep.next,
      blocked: ep.blocked, has: ep.has, requirements: ep.req,
      approved: ep.scenesData ? ep.scenesData.approved : null,
      review: ep.scenesData ? ep.scenesData.review : null,
      format: ep.scenesData ? ep.scenesData.format : null
    }, null, 2) + '\n');
  } else {
    process.stdout.write(render(ep) + '\n');
  }
  process.exit(ep.blocked.length ? 1 : 0);
}

main();
