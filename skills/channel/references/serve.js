#!/usr/bin/env node
/**
 * serve.js — the channel browser: pick a channel at the top, then storyboards or
 * characters in the left nav, served over HTTP straight from data/.
 *
 *   serve.js <data root>                  http://127.0.0.1:8390/
 *   serve.js <data root> --port 8400      another port
 *   serve.js <data root> --host 0.0.0.0   reachable from other machines (see below)
 *   serve.js <data root> --open           …and open it in the browser
 *   serve.js --selftest                   pins the API shape and the path guard
 *
 * ## Why a server here, when board.js insists on a file
 *
 * board.js is one channel's status on one static page — a file is the right shape for it.
 * This is different: it spans every channel, the lists change every time a skill runs, and
 * the things it shows (storyboard.html, scene images, character panels, voice.wav) live
 * where they are. storyboard.html only ever references its neighbours by relative path —
 * `./scenes.js`, `images/…`, `../../../assets/characters/<id>/…` — so serving data/ as
 * the static root opens it exactly as file:// would, and pundago's site already does that.
 *
 * ## What it reads (and never writes)
 *
 *   data/<slug>/profile.md                          channel name·status (frontmatter)
 *   data/<slug>/episodes/<topic>/storyboard/        title (storyboard.md H1), status·created
 *                                                   (frontmatter), format (scenes.js), images/
 *   ../../autoproduce/references/episode-state.js   stage · next · blocked, per channel
 *   data/<slug>/assets/characters/<id>/             identity.md, every image, voice.wav
 *   data/<slug>/assets/catalog.md                   the character row's note
 *
 * Nothing is cached — a page reload reads the disk again. Binds 127.0.0.1 by default:
 * data/ holds research, growth state and .work/ intermediates, so exposing it beyond the
 * machine is a decision, not a default. Path segments starting with "." are never served
 * (.work/, images/.v1-discarded/, .git).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const vm = require('vm');
const { execFileSync, spawn } = require('child_process');

const SELF_DIR = __dirname;
const EPISODE_STATE = path.join(SELF_DIR, '..', '..', 'autoproduce', 'references', 'episode-state.js');
// Same convention as server/src/config.ts CHANNEL_SLUG_RE — kebab-case only, so a slug can
// never carry a path separator into path.join.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
const DEFAULT_PORT = 8390;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.tsv': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
};

function die(msg) {
  process.stderr.write('serve: ' + msg + '\n');
  process.exit(3);
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
// A directory can be unreadable (mode 0111) or vanish between the stat and the read — a
// produce run rewriting images/ while the page is open does exactly that. Read it as empty.
const readdir = (p) => { try { return fs.readdirSync(p); } catch (e) { return []; } };
// Dot entries (.work/, images/.v1-discarded/, .DS_Store) are neither listed nor served.
const listDirs = (p) => (isDir(p) ? readdir(p).filter((d) => !d.startsWith('.') && isDir(path.join(p, d))).sort() : []);
const listFiles = (p) => (isDir(p) ? readdir(p).filter((f) => !f.startsWith('.') && isFile(path.join(p, f))).sort() : []);

/** True when target still sits inside base once both are resolved. The lexical prefix test
 *  reads a path as text, and a symlink is not text — the JSON readers walk the same tree
 *  /files/ serves, so they owe the same question. */
function insideReal(base, target) {
  try {
    const rb = fs.realpathSync(base), rt = fs.realpathSync(target);
    return rt === rb || rt.startsWith(rb + path.sep);
  } catch (e) { return false; }
}

/** readText, but only for a file that still sits inside base once symlinks are resolved.
 *  Guarding the directory is not enough — one storyboard.md pointing out is one arbitrary
 *  read, and the JSON routes hand the whole file back. */
const readInside = (base, file) => (insideReal(base, file) ? readText(file) : null);

/* ── readers ─────────────────────────────────────────────────────────────── */

/** Frontmatter as key → value. A trailing "# comment" on a value is dropped — real
 *  storyboard.md files carry `status: produced   # v7.1 …`. */
function frontmatter(src) {
  const out = {};
  if (!src) return out;
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return out;
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) return;
    out[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

/** The first "# heading" line, without the hashes. */
function firstHeading(src) {
  const m = src ? src.match(/^#\s+(.+?)\s*$/m) : null;
  return m ? m[1].trim() : null;
}

/** The first prose paragraph after the H1 — one line, clipped. */
function firstParagraph(src, max) {
  if (!src) return null;
  const body = src.replace(/^---[\s\S]*?\n---\s*/, '').split(/\r?\n/);
  let seenHeading = false;
  const buf = [];
  for (const line of body) {
    if (/^#\s/.test(line)) { if (seenHeading) break; seenHeading = true; continue; }
    if (!line.trim()) { if (buf.length) break; continue; }
    if (/^[-*|>]/.test(line.trim()) && !buf.length) continue;
    buf.push(line.trim());
  }
  const text = buf.join(' ').replace(/\*\*/g, '').replace(/`/g, '');
  if (!text) return null;
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/** Runs episode-state.js --all --json. Exit 1 is normal (a blocked episode), exit 3 with no
 *  stdout means the channel has no episodes/ — both come back as a plain array. */
function episodeStates(channelDir) {
  if (!isDir(path.join(channelDir, 'episodes'))) return [];
  let out;
  try {
    out = execFileSync(process.execPath, [EPISODE_STATE, channelDir, '--all', '--json'],
      { encoding: 'utf8', maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    out = e && e.stdout ? e.stdout : '';
  }
  try { const v = JSON.parse(out); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function channelDir(root, slug) {
  return path.join(root, slug);
}

/** Every directory under data/ that looks like a channel — a slug-shaped name holding a
 *  profile.md, episodes/ or assets/. Stray files at the root (a screenshot, README.md)
 *  and directories in another naming are skipped. */
function listChannels(root) {
  return listDirs(root)
    .filter((slug) => SLUG_RE.test(slug))
    .map((slug) => {
      const dir = channelDir(root, slug);
      const hasProfile = isFile(path.join(dir, 'profile.md'));
      if (!hasProfile && !isDir(path.join(dir, 'episodes')) && !isDir(path.join(dir, 'assets'))) return null;
      const profileText = readInside(dir, path.join(dir, 'profile.md'));
      const fm = frontmatter(profileText);
      return {
        slug,
        name: fm.name || slug,
        status: fm.status || null,
        // `hasProfile` decides whether the channel is listed at all; what the badge reports
        // is whether the profile could actually be read (a symlink out is refused).
        profile: profileText !== null,
        // The same predicate the two list routes apply — otherwise the badge counts an
        // episode the page will not show.
        storyboards: listDirs(path.join(dir, 'episodes'))
          .filter((t) => isDir(path.join(dir, 'episodes', t, 'storyboard'))
                      && insideReal(dir, path.join(dir, 'episodes', t, 'storyboard'))).length,
        // Through the lister, not a directory count — it also drops a character dir with
        // neither an identity sheet nor an image, and the badge has to match the page.
        characters: listCharacters(root, slug).length,
      };
    })
    .filter(Boolean);
}

const TITLE_SUFFIX_RE = /\s*[—–-]?\s*(storyboard|스토리보드)\s*$/i;
// `series: 소셜 페이지 만들기 (1/3)` → the playlist name and the episode's place in it
const SERIES_PART_RE = /^(.*?)\s*[(（]\s*(\d+\s*\/\s*\d+)\s*[)）]\s*$/;

/** The playlist an episode belongs to — the frontmatter `series:` line (the same line
 *  pundago's site reads for its tabs). null when the line is absent. */
function seriesOf(fm) {
  const raw = (fm.series || '').trim();
  if (!raw) return { series: null, seriesPart: null };
  const m = raw.match(SERIES_PART_RE);
  return m ? { series: m[1].trim() || raw, seriesPart: m[2].replace(/\s+/g, '') } : { series: raw, seriesPart: null };
}

/** The card's cover: the first scene's own image as scenes.js names it (real episodes call
 *  it scene-1.png, scene-1-1.png or s1-wakeup.png), else the first file under images/.
 *  Returned relative to the storyboard directory, only when the file is there. */
function coverImage(sb, scenesSrc) {
  const okPath = (p) => typeof p === 'string' && p && !p.split('/').some((s) => !s || s.startsWith('.')) &&
    isFile(path.join(sb, p)) && IMAGE_RE.test(p);
  if (scenesSrc) {
    const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
    sandbox.globalThis = sandbox;
    try {
      vm.runInNewContext(scenesSrc, sandbox, { timeout: 2000 });
      const scenes = Array.isArray(sandbox.window.SCENES) ? sandbox.window.SCENES : [];
      for (const s of scenes) {
        const v = (s && s.visual) || {};
        const first = (s && s.narration || []).map((n) => n && n.img).find(okPath);
        const pick = [v.bg, v.src, first].find(okPath);
        if (pick) return pick;
      }
    } catch (e) { /* a broken scenes.js falls through to the directory listing */ }
  }
  const first = listFiles(path.join(sb, 'images')).find((f) => IMAGE_RE.test(f));
  return first ? 'images/' + first : null;
}

function listStoryboards(root, slug) {
  const dir = channelDir(root, slug);
  const epRoot = path.join(dir, 'episodes');
  const states = new Map(episodeStates(dir).map((s) => [s.topic, s]));
  return listDirs(epRoot)
    .filter((topic) => isDir(path.join(epRoot, topic, 'storyboard'))
                    && insideReal(dir, path.join(epRoot, topic, 'storyboard')))
    .sort().reverse()
    .map((topic) => {
      const sb = path.join(epRoot, topic, 'storyboard');
      const md = readInside(dir, path.join(sb, 'storyboard.md'));
      const fm = frontmatter(md);
      const scenes = readInside(dir, path.join(sb, 'scenes.js'));
      const fmt = scenes ? (scenes.match(/window\.FORMAT\s*=\s*["']([^"']+)["']/) || [])[1] : null;
      const heading = firstHeading(md);
      const st = states.get(topic) || {};
      const base = '/files/' + slug + '/episodes/' + encodeURIComponent(topic) + '/storyboard/';
      const cover = coverImage(sb, scenes);
      const { series, seriesPart } = seriesOf(fm);
      return {
        topic,
        title: heading ? heading.replace(TITLE_SUFFIX_RE, '').trim() || topic : topic,
        status: fm.status || null,
        created: fm.created || null,
        series,
        seriesPart,
        format: fmt || null,
        cover: cover ? base + cover.split('/').map(encodeURIComponent).join('/') : null,
        images: listFiles(path.join(sb, 'images')).filter((f) => IMAGE_RE.test(f)).length,
        has: {
          html: isFile(path.join(sb, 'storyboard.html')),
          research: isFile(path.join(sb, 'research.md')),
          script: isFile(path.join(sb, 'script.md')),
          scenes: !!scenes,
        },
        stage: st.stage || null,
        next: st.next || null,
        blocked: st.blocked || [],
        href: base + 'storyboard.html',
      };
    });
}

/** catalog.md rows of kind "character": id → note. */
function catalogNotes(dir) {
  const notes = new Map();
  const src = readInside(dir, path.join(dir, 'assets', 'catalog.md'));
  if (!src) return notes;
  src.split(/\r?\n/).forEach((line) => {
    if (!line.trim().startsWith('|')) return;
    const cells = line.split('|').map((c) => c.trim());
    // "| kind | id | path | note |" splits into ["", kind, id, path, note, ""]
    if (cells.length >= 5 && cells[1] === 'character') notes.set(cells[2], cells[4] || '');
  });
  return notes;
}

// Panel order — face, then front, then back, which is the order the reference set is handed
// to a generation call (video-model-selection §6) and the order a person reads a model sheet.
// Naming is not uniform across channels, so the rank is read off the filename: anything
// carrying face/head is the face, anything carrying back/rear is the rear, everything else
// (body, front, front-body, real, three-quarter) is a front view. Within one rank the
// shorter name wins, because a variant earns its length from a suffix — head-closeup.png
// comes before head-closeup-pre-led.png, so a card shows the canonical panel, not an old take.
function panelRank(file) {
  const n = file.toLowerCase();
  if (/(^|[^a-z])(face|head)([^a-z]|$)/.test(n)) return 0;
  if (/(^|[^a-z])(back|rear)([^a-z]|$)/.test(n)) return 2;
  return 1;
}

const byPanel = (a, b) =>
  panelRank(a) - panelRank(b) || a.length - b.length || a.localeCompare(b);

function characterEntry(root, slug, id, notes) {
  const dir = path.join(channelDir(root, slug), 'assets', 'characters', id);
  if (!isDir(dir) || !insideReal(channelDir(root, slug), dir)) return null;
  const identity = readInside(channelDir(root, slug), path.join(dir, 'identity.md'));
  // Real panel sets are not uniform — face/body/back per the contract, front.png before it,
  // real.png for the live-action one, head-closeup-*.png for a series — so every image
  // file in the directory is listed, and subdirectories (voice-audition/) are left alone.
  const images = listFiles(dir).filter((f) => IMAGE_RE.test(f)).sort(byPanel);
  if (!identity && !images.length) return null;
  const base = '/files/' + slug + '/assets/characters/' + encodeURIComponent(id) + '/';
  return {
    id,
    // "# 휴머노이드 주인공 (humanoid) — **`RH-01`**" → "휴머노이드 주인공 — RH-01"
    name: (firstHeading(identity) || id).replace(/\*\*|`/g, '')
      .replace(/\s*\(([^()]+)\)/g, (m, s) => (s.trim() === id ? '' : m)).trim() || id,
    summary: firstParagraph(identity, 160),
    note: notes.get(id) || null,
    images: images.map((f) => ({ file: f, href: base + encodeURIComponent(f) })),
    voice: isFile(path.join(dir, 'voice.wav')) ? base + 'voice.wav' : null,
    identity: !!identity,
    href: base,
  };
}

function listCharacters(root, slug) {
  const dir = channelDir(root, slug);
  const notes = catalogNotes(dir);
  return listDirs(path.join(dir, 'assets', 'characters'))
    .map((id) => characterEntry(root, slug, id, notes))
    .filter(Boolean);
}

function characterDetail(root, slug, id) {
  const entry = characterEntry(root, slug, id, catalogNotes(channelDir(root, slug)));
  if (!entry) return null;
  const identity = readInside(channelDir(root, slug), path.join(channelDir(root, slug), 'assets', 'characters', id, 'identity.md'));
  return Object.assign({}, entry, { identityText: identity });
}

/* ── static files ────────────────────────────────────────────────────────── */

/** /files/<slug>/<rest> → absolute path inside <root>/<slug>, or null. Every segment is
 *  checked after decoding: empty, ".", "..", and anything starting with "." are refused,
 *  and the resolved path must still sit under the channel directory. */
function safeResolve(root, urlPath) {
  const parts = urlPath.split('/').slice(2); // drop "" and "files"
  if (parts.length < 2) return null;
  let decoded;
  try { decoded = parts.map((p) => decodeURIComponent(p)); } catch (e) { return null; }
  const slug = decoded[0];
  if (!SLUG_RE.test(slug)) return null;
  const rest = decoded.slice(1);
  if (rest.some((seg) => !seg || seg.startsWith('.') || seg.includes('/') || seg.includes('\\') || seg.includes('\0'))) return null;
  const base = path.resolve(root, slug);
  const target = path.resolve(base, ...rest);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  // The lexical test above reads the path as text, so a symlink inside the channel directory
  // still points wherever it points. Resolve both sides and ask again.
  let realBase, realTarget;
  try { realBase = fs.realpathSync(base); realTarget = fs.realpathSync(target); }
  catch (e) { return e.code === 'ENOENT' ? target : null; }
  if (realTarget !== realBase && !realTarget.startsWith(realBase + path.sep)) return null;
  return target;
}

/** One file, with single-range support — Safari asks `bytes=0-1` before it plays
 *  <audio>/<video> and stalls on a plain 200. */
function sendFile(req, res, file) {
  let st;
  try { st = fs.statSync(file); } catch (e) { return sendText(res, 404, 'not found'); }
  if (!st.isFile()) return sendText(res, 404, 'not found');
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  const range = req.headers.range && req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : Math.max(0, st.size - parseInt(range[2], 10));
    let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
    if (end >= st.size) end = st.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
      return res.end();
    }
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
    headers['Content-Length'] = end - start + 1;
    res.writeHead(206, headers);
    return pipeFile(res, fs.createReadStream(file, { start, end }));
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  pipeFile(res, fs.createReadStream(file));
}

/** The headers are already out by the time a read can fail, so there is no status left to
 *  send — drop the connection instead. Without the listener the 'error' event is unhandled
 *  and takes the whole server down with it. */
function pipeFile(res, stream) {
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

/* ── the shell page ──────────────────────────────────────────────────────── */

// String.raw: the page script below carries regexes and '\n' literals that must reach the
// browser untouched — a plain template literal would eat the backslashes.
const SHELL = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>social-flow</title>
<style>
  :root { --bg:#f6f7f9; --panel:#fff; --ink:#1b1f27; --mute:#6b7280; --line:#e5e7eb; --accent:#0a69fe; --warn:#b45309; --bad:#b91c1c; --ok:#047857; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR",sans-serif; }
  header { display:flex; align-items:center; gap:16px; height:52px; padding:0 20px; background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:2; }
  header .brand { font-weight:700; letter-spacing:.02em; }
  header select { font:inherit; padding:5px 10px; border:1px solid var(--line); border-radius:6px; background:#fff; min-width:200px; }
  header .meta { color:var(--mute); font-size:12px; }
  .layout { display:grid; grid-template-columns:200px 1fr; min-height:calc(100vh - 52px); }
  nav { background:var(--panel); border-right:1px solid var(--line); padding:16px 0; }
  nav a { display:block; padding:9px 20px; color:var(--ink); text-decoration:none; }
  nav a.on { background:#eef4ff; color:var(--accent); font-weight:600; border-right:2px solid var(--accent); }
  nav a .n { float:right; color:var(--mute); font-size:12px; }
  main { padding:20px 24px; min-width:0; }
  main.frame { padding:0; display:flex; flex-direction:column; }
  h1 { font-size:18px; margin:0 0 14px; }
  h1 small { color:var(--mute); font-weight:400; font-size:13px; margin-left:8px; }
  .crumb { color:var(--mute); font-size:12px; margin-bottom:6px; }
  .crumb a { color:var(--accent); text-decoration:none; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:12px; color:var(--mute); font-weight:600; background:#fafafa; }
  tr:last-child td { border-bottom:0; }
  td.topic { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; color:var(--mute); white-space:nowrap; }
  td a { color:var(--ink); text-decoration:none; font-weight:600; }
  td a:hover { color:var(--accent); }
  .badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; font-weight:600; background:#eee; color:#444; white-space:nowrap; }
  .badge.draft, .badge.drafted, .badge.empty { background:#f3f4f6; color:#4b5563; }
  .badge.approved { background:#e0ecff; color:#1d4ed8; }
  .badge.produced { background:#fef3c7; color:var(--warn); }
  .badge.published { background:#d1fae5; color:var(--ok); }
  .badge.blocked, .badge.broken, .badge.superseded { background:#fee2e2; color:var(--bad); }
  .blocked { color:var(--bad); font-size:12px; margin-top:4px; }
  .empty { color:var(--mute); padding:40px 0; text-align:center; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; }
  .grid.sb { grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; text-decoration:none; color:inherit; display:block; }
  a.card:hover { border-color:var(--accent); }
  /* The whole picture, never a crop — character panels are portrait, covers are 9:16 or 16:9 */
  .card .thumb { aspect-ratio:3/4; background:#1b1f27; display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:12px; overflow:hidden; }
  .card .thumb.wide { aspect-ratio:16/9; }
  .card .thumb.tall { aspect-ratio:9/16; }
  .card .thumb img { width:100%; height:100%; object-fit:contain; }
  .card .body { padding:10px 12px; }
  .card .name { font-weight:600; }
  .card .id { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:var(--mute); }
  .card .note { font-size:12px; color:var(--mute); margin-top:4px; }
  .card .voice { font-size:11px; color:var(--ok); margin-top:4px; }
  .card .badges { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 4px; }
  .card .meta { font-size:12px; color:var(--mute); }
  .card .series { font-size:12px; color:var(--accent); margin-top:2px; }
  .card .blocked { margin-top:6px; }
  .tabs { display:flex; gap:4px; flex-wrap:wrap; border-bottom:1px solid var(--line); margin:0 0 16px; }
  .tabs a { padding:8px 12px; margin-bottom:-1px; color:var(--mute); text-decoration:none; border-bottom:2px solid transparent; white-space:nowrap; }
  .tabs a .n { font-size:11px; margin-left:4px; color:var(--mute); }
  .tabs a.on { color:var(--accent); font-weight:600; border-bottom-color:var(--accent); }
  .tabs a.on .n { color:var(--accent); }
  /* character detail — hero (media + head) on top, the identity document below */
  .ch-hero { display:grid; grid-template-columns:360px minmax(0,1fr); gap:28px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:22px; }
  .ch-media .main { aspect-ratio:3/4; background:#1b1f27; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:12px; }
  .ch-media .main img { width:100%; height:100%; object-fit:contain; }
  .ch-media .cap { font:11px ui-monospace,Menlo,monospace; color:var(--mute); text-align:center; margin-top:6px; }
  .ch-media .thumbs { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
  .ch-media .thumbs button { width:54px; height:70px; padding:0; border:2px solid transparent; border-radius:6px; background:#1b1f27; overflow:hidden; cursor:pointer; }
  .ch-media .thumbs button.on { border-color:var(--accent); }
  .ch-media .thumbs img { width:100%; height:100%; object-fit:contain; display:block; }
  .ch-head h1 { font-size:26px; line-height:1.25; margin:2px 0 6px; }
  .ch-head .id { font:12px ui-monospace,Menlo,monospace; color:var(--mute); }
  .ch-head .lead { font-size:15px; line-height:1.6; color:#374151; margin:16px 0 14px; max-width:60ch; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { font-size:12px; padding:3px 10px; border:1px solid var(--line); border-radius:999px; background:#fafafa; color:#374151; }
  .chip.ok { border-color:#a7f3d0; background:#ecfdf5; color:var(--ok); }
  .chip.off { color:var(--mute); }
  .ch-voice { margin-top:22px; max-width:520px; }
  .ch-voice .lab { font-size:12px; font-weight:600; color:var(--mute); margin-bottom:4px; }
  audio { width:100%; display:block; }
  .doc { max-width:820px; margin:26px 4px 48px; font-size:14.5px; line-height:1.75; color:#1f2937; }
  .doc h2 { font-size:17px; margin:32px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  .doc h3 { font-size:15px; margin:22px 0 6px; }
  .doc h4, .doc h5, .doc h6 { font-size:14px; margin:16px 0 4px; }
  .doc p { margin:0 0 12px; }
  .doc ul, .doc ol { margin:0 0 12px; padding-left:22px; }
  .doc li { margin:3px 0; }
  .doc li > ul, .doc li > ol { margin:4px 0 0; }
  .doc code { font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace; background:#f1f3f5; border-radius:4px; padding:1px 5px; }
  .doc pre { background:#1b1f27; color:#e5e7eb; padding:12px 14px; border-radius:8px; overflow:auto; font-size:12.5px; line-height:1.55; }
  .doc pre code { background:none; color:inherit; padding:0; }
  .doc table { width:auto; margin:0 0 14px; font-size:13px; }
  .doc blockquote { margin:0 0 12px; padding:6px 14px; border-left:3px solid var(--line); color:var(--mute); }
  .doc hr { border:0; border-top:1px solid var(--line); margin:22px 0; }
  .doc img { max-width:100%; border-radius:6px; }
  .doc strong { font-weight:650; }
  .doc a { color:var(--accent); }
  .doc .empty { padding:24px 0; text-align:left; }
  .frame .bar { display:flex; align-items:center; gap:12px; padding:8px 16px; background:var(--panel); border-bottom:1px solid var(--line); font-size:13px; }
  .frame .bar a { color:var(--accent); text-decoration:none; }
  .frame iframe { flex:1; border:0; width:100%; min-height:calc(100vh - 52px - 41px); background:#fff; }
  @media (max-width:900px) { .ch-hero { grid-template-columns:1fr; } .ch-media { max-width:360px; } }
  @media (max-width:720px) { .layout { grid-template-columns:1fr; } nav { display:flex; padding:0; } nav a.on { border-right:0; border-bottom:2px solid var(--accent); } }
</style>
</head>
<body>
<header>
  <span class="brand">social-flow</span>
  <select id="channel" aria-label="channel"></select>
  <span class="meta" id="channel-meta"></span>
  <span style="flex:1"></span>
  <select id="lang" aria-label="language"></select>
</header>
<div class="layout">
  <nav id="nav"></nav>
  <main id="main"><div class="empty">Loading…</div></main>
</div>
<script>
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // UI strings. This page is part of a plugin published to people who don't read Korean,
  // so every visible string lives here rather than inline in the render functions.
  // Language comes from ?lang= if present, else the browser's, else English — and English
  // is the fallback for a missing key, so a half-translated dictionary degrades to English
  // words rather than to an undefined.
  // A language's own name, written in that language — never translated, so it sits beside
  // the dictionary rather than inside each entry.
  var LANG_LABELS = { en: 'English', ko: '한국어' };

  var STRINGS = {
    en: {
      loading: 'Loading…', storyboards: 'Storyboards', characters: 'Characters',
      all: 'All', noPlaylist: 'No playlist', list: 'List', openNewTab: 'Open in new tab',
      episodes: function (n) { return n + (n === 1 ? ' episode' : ' episodes'); },
      cast: function (n) { return n + (n === 1 ? ' character' : ' characters'); },
      images: function (n) { return n + (n === 1 ? ' image' : ' images'); },
      noStoryboards: function (slug) { return 'No storyboards yet — /social-flow:storyboard ' + slug + ' <topic>'; },
      noneInPlaylist: 'No episodes in this playlist yet',
      storyboardNotFound: function (id) { return 'Storyboard ' + id + ' not found'; },
      noCharacters: function (slug) { return 'No characters registered — data/' + slug + '/assets/characters/&lt;id&gt;/identity.md'; },
      characterNotFound: function (id) { return 'Character ' + id + ' not found'; },
      noChannels: 'No channel directories under data/',
      noCover: 'no cover', noImage: 'no image', noFormat: 'format not set',
      noHtml: 'no storyboard.html', noProfile: 'no profile.md',
      noVoice: 'no voice', noIdentity: 'no identity.md',
      voiceLabel: 'Voice — voice.wav',
      identityMissing: 'No identity.md — this character has images only',
      channel: 'Channel', language: 'Language',
      stage: { empty: 'empty', drafted: 'drafted', approved: 'approved',
               produced: 'produced', published: 'published', broken: 'broken' }
    },
    ko: {
      loading: '불러오는 중…', storyboards: '스토리보드', characters: '캐릭터',
      all: '전체', noPlaylist: '재생목록없음', list: '목록', openNewTab: '새 창에서 열기',
      episodes: function (n) { return n + '편'; },
      cast: function (n) { return n + '명'; },
      images: function (n) { return '그림 ' + n + '장'; },
      noStoryboards: function (slug) { return '아직 스토리보드가 없어요 — /social-flow:storyboard ' + slug + ' <주제>'; },
      noneInPlaylist: '이 재생목록엔 아직 회차가 없어요',
      storyboardNotFound: function (id) { return id + ' 스토리보드를 못 찾았어요'; },
      noCharacters: function (slug) { return '등록된 캐릭터가 없어요 — data/' + slug + '/assets/characters/&lt;id&gt;/identity.md'; },
      characterNotFound: function (id) { return id + ' 캐릭터를 못 찾았어요'; },
      noChannels: 'data/ 아래에 채널 디렉토리가 없어요',
      noCover: '커버 없음', noImage: '그림 없음', noFormat: '포맷 미정',
      noHtml: 'storyboard.html 없음', noProfile: 'profile.md 없음',
      noVoice: '목소리 없음', noIdentity: 'identity.md 없음',
      voiceLabel: '목소리 — voice.wav',
      identityMissing: 'identity.md 가 없어요 — 이 캐릭터는 그림만 있어요',
      channel: '채널', language: '언어',
      stage: { empty: '비어 있음', drafted: '초안', approved: '승인',
               produced: '제작됨', published: '게시됨', broken: '깨짐' }
    }
  };

  function pickLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && STRINGS[q]) return q;
    try {
      var stored = localStorage.getItem('social-flow.lang');
      if (stored && STRINGS[stored]) return stored;
    } catch (e) { /* private mode, blocked storage — fall through to the browser's */ }
    var nav = (navigator.languages || [navigator.language || 'en']);
    for (var i = 0; i < nav.length; i++) {
      var base = String(nav[i]).toLowerCase().split('-')[0];
      if (STRINGS[base]) return base;
    }
    return 'en';
  }

  var LANG = pickLang();
  // English backs every key, so an untranslated entry shows an English word, not undefined.
  var T = Object.assign({}, STRINGS.en, STRINGS[LANG] || {});
  var STAGE = T.stage;
  var SECTIONS = [['storyboards', T.storyboards], ['characters', T.characters]];
  document.documentElement.lang = LANG;
  var channels = [];
  var sel = document.getElementById('channel');
  var langSel = document.getElementById('lang');
  var nav = document.getElementById('nav');
  var main = document.getElementById('main');
  var meta = document.getElementById('channel-meta');

  // #/<slug>/<section>[/<item>][?tab=all|none|s:<series>]
  function route() {
    var raw = location.hash.replace(/^#\/?/, '').split('?');
    var h = raw[0].split('/').map(decodeURIComponent);
    var tab = new URLSearchParams(raw[1] || '').get('tab') || 'all';
    return { slug: h[0] || '', section: h[1] || 'storyboards', item: h[2] || '', tab: tab };
  }
  function href(slug, section, item, tab) {
    return '#/' + [slug, section].concat(item ? [item] : []).map(encodeURIComponent).join('/') +
      (tab && tab !== 'all' ? '?tab=' + encodeURIComponent(tab) : '');
  }
  function go(slug, section, item) { location.hash = href(slug, section, item, ''); }
  function api(p) { return fetch(p).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + p); return r.json(); }); }

  function badge(v) { return v ? '<span class="badge ' + esc(v) + '">' + esc(STAGE[v] || v) + '</span>' : '—'; }

  function renderNav(ch, section) {
    nav.innerHTML = SECTIONS.map(function (s) {
      var n = ch ? ch[s[0]] : '';
      return '<a href="#/' + esc(ch ? ch.slug : '') + '/' + s[0] + '" class="' + (section === s[0] ? 'on' : '') + '">' + s[1] + '<span class="n">' + esc(n) + '</span></a>';
    }).join('');
  }

  function renderStoryboards(r, ch) {
    main.className = '';
    return api('/api/channels/' + r.slug + '/storyboards').then(function (rows) {
      if (r.item) return renderStoryboardFrame(r, rows);
      var h = '<h1>' + esc(T.storyboards) + ' <small>' + esc(ch.name) + ' · ' + esc(T.episodes(rows.length)) + '</small></h1>';
      if (!rows.length) { main.innerHTML = h + '<div class="empty">' + esc(T.noStoryboards(r.slug)) + '</div>'; return; }
      // playlist tabs — all · one per series (in order of newest episode) · no playlist
      var series = [];
      rows.forEach(function (s) { if (s.series && series.indexOf(s.series) === -1) series.push(s.series); });
      var noneCount = rows.filter(function (s) { return !s.series; }).length;
      var tabs = [{ key: 'all', label: T.all, n: rows.length }].concat(series.map(function (name) {
        return { key: 's:' + name, label: name, n: rows.filter(function (s) { return s.series === name; }).length };
      })).concat([{ key: 'none', label: T.noPlaylist, n: noneCount }]);
      var tab = tabs.some(function (t) { return t.key === r.tab; }) ? r.tab : 'all';
      h += '<div class="tabs">' + tabs.map(function (t) {
        return '<a href="' + esc(href(r.slug, 'storyboards', '', t.key)) + '" class="' + (t.key === tab ? 'on' : '') + '">' + esc(t.label) + '<span class="n">' + t.n + '</span></a>';
      }).join('') + '</div>';
      var shown = rows.filter(function (s) { return tab === 'all' || (tab === 'none' ? !s.series : s.series === tab.slice(2)); });
      if (!shown.length) { main.innerHTML = h + '<div class="empty">' + esc(T.noneInPlaylist) + '</div>'; return; }
      h += '<div class="grid sb">';
      shown.forEach(function (s) {
        var wide = /16x9|landscape/i.test(s.format || '');
        var tag = s.has.html ? 'a' : 'div';
        h += '<' + tag + ' class="card"' + (s.has.html ? ' href="' + esc(href(r.slug, 'storyboards', s.topic, tab)) + '"' : '') + '>' +
          '<div class="thumb ' + (wide ? 'wide' : 'tall') + '">' + (s.cover ? '<img src="' + esc(s.cover) + '" alt="' + esc(s.topic) + '" loading="lazy">' : esc(T.noCover)) + '</div>' +
          '<div class="body"><div class="name">' + esc(s.title) + '</div><div class="id">' + esc(s.topic) + '</div>' +
          '<div class="badges">' + badge(s.status) + badge(s.stage) + (s.has.html ? '' : '<span class="badge">' + esc(T.noHtml) + '</span>') + '</div>' +
          '<div class="meta">' + esc(s.format || T.noFormat) + ' · ' + esc(T.images(s.images)) + (s.created ? ' · ' + esc(s.created) : '') + '</div>' +
          (s.series ? '<div class="series">▶ ' + esc(s.series) + (s.seriesPart ? ' · ' + esc(s.seriesPart) : '') + '</div>' : '') +
          (s.blocked.length ? '<div class="blocked">⚑ ' + s.blocked.map(esc).join('<br>') + '</div>' : '') +
          '</div></' + tag + '>';
      });
      main.innerHTML = h + '</div>';
    });
  }

  function renderStoryboardFrame(r, rows) {
    var s = rows.filter(function (x) { return x.topic === r.item; })[0];
    if (!s) { main.innerHTML = '<div class="empty">' + esc(T.storyboardNotFound(r.item)) + '</div>'; return; }
    main.className = 'frame';
    main.innerHTML = '<div class="bar"><a href="' + esc(href(r.slug, 'storyboards', '', r.tab)) + '">← ' + esc(T.list) + '</a><strong>' + esc(s.title) + '</strong>' +
      badge(s.status) + '<span style="flex:1"></span><a href="' + esc(s.href) + '" target="_blank" rel="noopener">' + esc(T.openNewTab) + ' ↗</a></div>' +
      '<iframe src="' + esc(s.href) + '" title="' + esc(s.title) + '"></iframe>';
  }

  function renderCharacters(r, ch) {
    main.className = '';
    if (r.item) return renderCharacter(r, ch);
    return api('/api/channels/' + r.slug + '/characters').then(function (rows) {
      var h = '<h1>' + esc(T.characters) + ' <small>' + esc(ch.name) + ' · ' + esc(T.cast(rows.length)) + '</small></h1>';
      if (!rows.length) { main.innerHTML = h + '<div class="empty">' + T.noCharacters(esc(r.slug)) + '</div>'; return; }
      h += '<div class="grid">';
      rows.forEach(function (c) {
        h += '<a class="card" href="#/' + esc(r.slug) + '/characters/' + encodeURIComponent(c.id) + '">' +
          '<div class="thumb">' + (c.images.length ? '<img src="' + esc(c.images[0].href) + '" alt="' + esc(c.id) + '" loading="lazy">' : esc(T.noImage)) + '</div>' +
          '<div class="body"><div class="name">' + esc(c.name) + '</div><div class="id">' + esc(c.id) + ' · ' + esc(T.images(c.images.length)) + '</div>' +
          (c.note ? '<div class="note">' + esc(c.note) + '</div>' : (c.summary ? '<div class="note">' + esc(c.summary) + '</div>' : '')) +
          (c.voice ? '<div class="voice">● voice.wav</div>' : '') + '</div></a>';
      });
      main.innerHTML = h + '</div>';
    });
  }

  /* identity.md → HTML. Enough markdown for what the identity files use — headings, paragraphs,
     nested lists, tables, fenced code, quotes, rules, bold, inline code, links and images.
     Text is escaped first; relative links resolve against the character directory. */
  function md(src, base) {
    var lines = src.replace(/\r/g, '').split('\n');
    if (lines[0] === '---') { var fmEnd = lines.indexOf('---', 1); if (fmEnd > 0) lines = lines.slice(fmEnd + 1); }
    var out = [], i = 0, firstH1 = true;
    var BLOCK = /^(#{1,6}\s|\x60\x60\x60|\s*\||\s*>|\s*([-*+]|\d+[.)])\s+|(-{3,}|\*{3,}|_{3,})\s*$)/;
    function link(u) { return /^(https?:)?\/\//.test(u) || u.charAt(0) === '/' || u.charAt(0) === '#' ? u : base + u; }
    function inline(t) {
      t = esc(t);
      t = t.replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, a, u) { return '<img src="' + link(u) + '" alt="' + a + '" loading="lazy">'; });
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, a, u) { return '<a href="' + link(u) + '" target="_blank" rel="noopener">' + a + '</a>'; });
      return t;
    }
    function cells(r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); }
    function table(rows) {
      var head = cells(rows[0]);
      var body = rows.slice(1).filter(function (r) { return !/^\s*\|?\s*:?-{2,}/.test(r); });
      return '<table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        body.map(function (r) { return '<tr>' + cells(r).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    function list() {
      var items = [];
      while (i < lines.length) {
        var l = lines[i], m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m) { items.push({ ind: m[1].replace(/\t/g, '  ').length, ord: /\d/.test(m[2]), text: [m[3]] }); i++; continue; }
        if (l.trim() && items.length && /^\s+/.test(l) && !/^\s*\|/.test(l)) { items[items.length - 1].text.push(l.trim()); i++; continue; }
        break;
      }
      var h = '', stack = [];
      items.forEach(function (it) {
        while (stack.length && it.ind < stack[stack.length - 1].ind) h += '</li></' + stack.pop().tag + '>';
        if (!stack.length || it.ind > stack[stack.length - 1].ind) { var tag = it.ord ? 'ol' : 'ul'; stack.push({ ind: it.ind, tag: tag }); h += '<' + tag + '><li>' + inline(it.text.join(' ')); }
        else h += '</li><li>' + inline(it.text.join(' '));
      });
      while (stack.length) h += '</li></' + stack.pop().tag + '>';
      return h;
    }
    while (i < lines.length) {
      var l = lines[i], m;
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/))) { var lv = m[1].length; i++; if (lv === 1 && firstH1) { firstH1 = false; continue; } out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>'); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\x60\x60\x60/.test(l)) { var code = []; i++; while (i < lines.length && !/^\x60\x60\x60/.test(lines[i])) code.push(lines[i++]); i++; out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); continue; }
      if (/^\s*\|/.test(l)) { var rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]); out.push(table(rows)); continue; }
      if (/^\s*>/.test(l)) { var q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, '')); out.push('<blockquote>' + md(q.join('\n'), base) + '</blockquote>'); continue; }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) { out.push(list()); continue; }
      var p = [];
      while (i < lines.length && lines[i].trim() && !BLOCK.test(lines[i])) p.push(lines[i++].trim());
      if (!p.length) { i++; continue; }
      out.push('<p>' + inline(p.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  function renderCharacter(r, ch) {
    return api('/api/channels/' + r.slug + '/characters/' + encodeURIComponent(r.item)).then(function (c) {
      var first = c.images[0];
      var h = '<div class="crumb"><a href="#/' + esc(r.slug) + '/characters">' + esc(T.characters) + '</a> / ' + esc(c.id) + '</div><div class="ch-hero"><div class="ch-media">';
      h += '<div class="main">' + (first ? '<img id="ch-main" src="' + esc(first.href) + '" alt="' + esc(first.file) + '">' : esc(T.noImage)) + '</div>' +
        '<div class="cap" id="ch-cap">' + esc(first ? first.file : '') + '</div>';
      if (c.images.length > 1) h += '<div class="thumbs">' + c.images.map(function (im, k) {
        return '<button type="button" class="' + (k === 0 ? 'on' : '') + '" data-src="' + esc(im.href) + '" data-file="' + esc(im.file) + '" title="' + esc(im.file) + '"><img src="' + esc(im.href) + '" alt="" loading="lazy"></button>';
      }).join('') + '</div>';
      h += '</div><div class="ch-head"><div class="id">' + esc(ch.name) + ' · assets/characters/' + esc(c.id) + '/</div><h1>' + esc(c.name) + '</h1>';
      var lead = c.note || c.summary;
      if (lead) h += '<p class="lead">' + esc(lead) + '</p>';
      h += '<div class="chips"><span class="chip">' + esc(T.images(c.images.length)) + '</span>' +
        (c.voice ? '<span class="chip ok">● voice.wav</span>' : '<span class="chip off">' + esc(T.noVoice) + '</span>') +
        (c.identity ? '<span class="chip">identity.md</span>' : '<span class="chip off">' + esc(T.noIdentity) + '</span>') + '</div>';
      if (c.voice) h += '<div class="ch-voice"><div class="lab">' + esc(T.voiceLabel) + '</div><audio controls preload="metadata" src="' + esc(c.voice) + '"></audio></div>';
      h += '</div></div>';
      h += '<article class="doc">' + (c.identityText ? md(c.identityText, c.href) : '<div class="empty">' + esc(T.identityMissing) + '</div>') + '</article>';
      main.innerHTML = h;
    }).catch(function () { main.innerHTML = '<div class="empty">' + esc(T.characterNotFound(r.item)) + '</div>'; });
  }

  // thumbnail → main picture
  main.addEventListener('click', function (e) {
    var b = e.target.closest('.ch-media .thumbs button');
    if (!b) return;
    var img = document.getElementById('ch-main'), cap = document.getElementById('ch-cap');
    if (img) { img.src = b.getAttribute('data-src'); img.alt = b.getAttribute('data-file'); }
    if (cap) cap.textContent = b.getAttribute('data-file');
    b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
  });

  function render() {
    var r = route();
    if (!channels.length) { main.innerHTML = '<div class="empty">' + esc(T.noChannels) + '</div>'; renderNav(null, ''); return; }
    var ch = channels.filter(function (c) { return c.slug === r.slug; })[0];
    if (!ch) { go(channels[0].slug, r.section, ''); return; }
    sel.value = ch.slug;
    meta.textContent = (ch.status ? ch.status + ' · ' : '') + 'data/' + ch.slug + (ch.profile ? '' : ' · ' + T.noProfile);
    renderNav(ch, r.section);
    var p = r.section === 'characters' ? renderCharacters(r, ch) : renderStoryboards(r, ch);
    if (p) p.catch(function (e) { main.className = ''; main.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }

  sel.addEventListener('change', function () { go(sel.value, route().section, ''); });

  // Language picker. The choice is stored and applied by reloading with ?lang= — the
  // strings are read once at startup into T, so re-rendering in place would leave the
  // header and the nav on the old language.
  langSel.innerHTML = Object.keys(STRINGS).map(function (code) {
    return '<option value="' + esc(code) + '"' + (code === LANG ? ' selected' : '') + '>' +
      esc(LANG_LABELS[code] || code) + '</option>';
  }).join('');
  langSel.addEventListener('change', function () {
    try { localStorage.setItem('social-flow.lang', langSel.value); } catch (e) { /* blocked storage — the query string still carries it */ }
    var u = new URL(location.href);
    u.searchParams.set('lang', langSel.value);
    location.href = u.toString();
  });

  window.addEventListener('hashchange', render);
  api('/api/channels').then(function (list) {
    channels = list;
    sel.innerHTML = list.map(function (c) { return '<option value="' + esc(c.slug) + '">' + esc(c.name) + (c.name !== c.slug ? ' (' + esc(c.slug) + ')' : '') + '</option>'; }).join('');
    render();
  }).catch(function (e) { main.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
})();
</script>
</body>
</html>
`;

/* ── router ──────────────────────────────────────────────────────────────── */

function createApp(root) {
  return function handle(req, res) {
    try { return route(root, req, res); } catch (e) {
      // One unreadable file costs one request; the server stays up. Surviving quietly is
      // the wrong half of that — a real bug in a reader would look like a missing file.
      process.stderr.write('serve: ' + req.url + ' — ' + ((e && e.stack) || e) + '\n');
      if (res.headersSent) return res.destroy();
      return sendText(res, 500, 'error');
    }
  };
}

function route(root, req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'method not allowed');
    let urlPath;
    try { urlPath = new URL(req.url, 'http://localhost').pathname; } catch (e) { return sendText(res, 400, 'bad url'); }

    if (urlPath === '/' || urlPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(SHELL);
    }
    if (urlPath === '/api/channels') return sendJson(res, 200, listChannels(root));

    const m = urlPath.match(/^\/api\/channels\/([^/]+)\/(storyboards|characters)(?:\/([^/]+))?$/);
    if (m) {
      const slug = m[1];
      if (!SLUG_RE.test(slug) || !isDir(channelDir(root, slug))) return sendJson(res, 404, { error: 'no such channel: ' + slug });
      if (m[2] === 'storyboards') {
        if (m[3]) return sendJson(res, 404, { error: 'storyboards has no item route — open /files/…/storyboard.html' });
        return sendJson(res, 200, listStoryboards(root, slug));
      }
      if (!m[3]) return sendJson(res, 200, listCharacters(root, slug));
      let id;
      try { id = decodeURIComponent(m[3]); } catch (e) { return sendJson(res, 400, { error: 'bad id' }); }
      if (id.startsWith('.') || id.includes('/') || id.includes('\\')) return sendJson(res, 404, { error: 'no such character' });
      const detail = characterDetail(root, slug, id);
      return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'no such character: ' + id });
    }

    if (urlPath.startsWith('/files/')) {
      const file = safeResolve(root, urlPath);
      if (!file) return sendText(res, 404, 'not found');
      return sendFile(req, res, file);
    }
    return sendText(res, 404, 'not found');
}

function listen(root, host, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createApp(root));
    server.on('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

/* ── selftest ────────────────────────────────────────────────────────────── */

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-selftest-'));
  const w = (rel, body) => {
    const p = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  // alpha — a full channel; beta — no profile.md, no episodes/, one character with no image;
  // Bad_Name and a stray png at the root must not show up as channels.
  w('alpha/profile.md', '---\nname: 알파\nslug: alpha\nstatus: active\n---\n# 알파\n');
  w('alpha/assets/catalog.md', '| kind | id | path | note |\n|---|---|---|---|\n| character | hero | characters/hero | 주인공 — 파란 로봇 |\n');
  w('alpha/assets/characters/hero/identity.md', '# 히어로 (hero)\n\n채널 마스코트. 파란 로봇이에요.\n\n- **참조 그림**: face.png\n');
  // written back-first on purpose: readdir sorts them back·body·face, so a passing
  // panel-order check can only come from the sort, not from the directory listing
  w('alpha/assets/characters/hero/back.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  w('alpha/assets/characters/hero/body.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  w('alpha/assets/characters/hero/face.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  w('alpha/assets/characters/hero/head-closeup-old.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  w('alpha/assets/characters/hero/voice.wav', Buffer.from('RIFF0000WAVEfmt '));
  w('alpha/assets/characters/hero/voice-audition/take-1.wav', 'x');
  w('alpha/assets/characters/lineup.png', 'x');
  w('alpha/episodes/20260101-one/storyboard/storyboard.md', '---\nchannel: alpha\ntopic: 20260101-one\nstatus: produced   # v2 · pass\ncreated: 2026-01-01\n---\n\n# 첫 회차 — 제목 — Storyboard\n');
  w('alpha/episodes/20260101-one/storyboard/scenes.js', 'window.FORMAT = "shorts-9x16";\nwindow.SCENES = [{ type: "cover", scene: 1, visual: { bg: "images/scene-1.png" } }];\n');
  w('alpha/episodes/20260101-one/storyboard/storyboard.html', '<script src="./scenes.js"></script>');
  w('alpha/episodes/20260101-one/storyboard/images/scene-1.png', 'x');
  w('alpha/episodes/20260101-one/storyboard/images/.v1-discarded/scene-1.png', 'x');
  w('alpha/episodes/20260102-two/storyboard/storyboard.md', '---\nstatus: draft\nseries: 시리즈 A (2/3)\n---\n# 둘째\n');
  w('alpha/episodes/no-storyboard/.work/x', 'x');
  w('beta/assets/characters/rob/identity.md', '# 롭\n\n그림 없는 캐릭터.\n');
  w('Bad_Name/profile.md', '---\nname: nope\n---\n');
  w('stray.png', 'x');

  let fails = 0;
  const ok = (name, cond) => { process.stdout.write((cond ? '  ok   ' : '  FAIL ') + name + '\n'); if (!cond) fails++; };
  const raw = (server, reqPath, headers) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: server.address().port, path: reqPath, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.end();
  });
  const json = (server, p) => raw(server, p).then((r) => ({ status: r.status, body: r.body.length ? JSON.parse(r.body.toString('utf8')) : null }));

  return listen(tmp, '127.0.0.1', 0).then(async (server) => {
    try {
      const ch = await json(server, '/api/channels');
      ok('channels: alpha and beta only, slug-shaped directories', ch.status === 200 && ch.body.map((c) => c.slug).join(',') === 'alpha,beta');
      ok('channel name from profile.md, slug fallback without one',
        ch.body[0].name === '알파' && ch.body[1].name === 'beta' && ch.body[1].profile === false);
      ok('channel counts', ch.body[0].storyboards === 2 && ch.body[0].characters === 1 && ch.body[1].storyboards === 0);

      const sb = await json(server, '/api/channels/alpha/storyboards');
      ok('storyboards: newest first, only dirs holding storyboard/', sb.status === 200 && sb.body.map((s) => s.topic).join(',') === '20260102-two,20260101-one');
      const one = sb.body[1];
      ok('title strips the " — Storyboard" suffix', one.title === '첫 회차 — 제목');
      ok('status drops the trailing comment', one.status === 'produced');
      ok('format from scenes.js, image count skips dot directories', one.format === 'shorts-9x16' && one.images === 1);
      ok('cover is the first scene\'s image as scenes.js names it', one.cover === '/files/alpha/episodes/20260101-one/storyboard/images/scene-1.png');
      ok('no scenes.js and no images → no cover', sb.body[0].cover === null);
      ok('series from frontmatter, with the (n/m) part split off', sb.body[0].series === '시리즈 A' && sb.body[0].seriesPart === '2/3');
      ok('no series line → null (the 재생목록없음 tab)', one.series === null && one.seriesPart === null);
      ok('stage from episode-state', one.stage === 'produced' && Array.isArray(one.blocked));
      ok('href points at the served storyboard.html', one.href === '/files/alpha/episodes/20260101-one/storyboard/storyboard.html');
      ok('a channel with no episodes/ answers []', (await json(server, '/api/channels/beta/storyboards')).body.length === 0);

      const cs = await json(server, '/api/channels/alpha/characters');
      ok('characters: directories only (lineup.png skipped)', cs.status === 200 && cs.body.length === 1 && cs.body[0].id === 'hero');
      const hero = cs.body[0];
      ok('name from identity.md H1 without the "(id)" tail', hero.name === '히어로');
      ok('images list files only (voice-audition/ ignored)', hero.images.length === 4);
      ok('panels sort face → front → back, shorter name first within a rank',
        hero.images.map((im) => im.file).join(' ') === 'face.png head-closeup-old.png body.png back.png');
      ok('the card thumbnail is the face panel', hero.images[0].file === 'face.png');
      ok('voice.wav and the catalog note', hero.voice === '/files/alpha/assets/characters/hero/voice.wav' && hero.note === '주인공 — 파란 로봇');
      ok('summary is the first paragraph', hero.summary === '채널 마스코트. 파란 로봇이에요.');
      const rob = await json(server, '/api/channels/beta/characters');
      ok('a character with identity.md and no image still lists', rob.body.length === 1 && rob.body[0].images.length === 0);
      const detail = await json(server, '/api/channels/alpha/characters/hero');
      ok('character detail carries identity.md text', detail.status === 200 && /히어로/.test(detail.body.identityText));
      ok('unknown character → 404', (await json(server, '/api/channels/alpha/characters/nobody')).status === 404);
      ok('unknown channel → 404', (await json(server, '/api/channels/zeta/characters')).status === 404);

      const html = await raw(server, '/files/alpha/episodes/20260101-one/storyboard/storyboard.html');
      ok('storyboard.html served as text/html', html.status === 200 && /text\/html/.test(html.headers['content-type']));
      ok('scenes.js next to it served too', (await raw(server, '/files/alpha/episodes/20260101-one/storyboard/scenes.js')).status === 200);
      ok('relative climb to a character panel resolves', (await raw(server, '/files/alpha/episodes/20260101-one/storyboard/../../../assets/characters/hero/face.png')).status === 200);
      ok('dot directories are refused', (await raw(server, '/files/alpha/episodes/20260101-one/storyboard/images/.v1-discarded/scene-1.png')).status === 404);
      ok('.work/ is refused', (await raw(server, '/files/alpha/episodes/no-storyboard/.work/x')).status === 404);
      ok('traversal out of the channel is refused', (await raw(server, '/files/alpha/../stray.png')).status === 404
        && (await raw(server, '/files/alpha/%2e%2e/stray.png')).status === 404
        && (await raw(server, '/files/alpha/..%2fstray.png')).status === 404);
      ok('a non-slug channel segment is refused', (await raw(server, '/files/Bad_Name/profile.md')).status === 404);
      ok('the channel root itself is not a file', (await raw(server, '/files/alpha/')).status === 404);

      const range = await raw(server, '/files/alpha/assets/characters/hero/voice.wav', { Range: 'bytes=0-3' });
      ok('Range → 206 with Content-Range', range.status === 206 && range.headers['content-range'] === 'bytes 0-3/16' && range.body.toString() === 'RIFF');
      ok('unsatisfiable Range → 416', (await raw(server, '/files/alpha/assets/characters/hero/voice.wav', { Range: 'bytes=99-' })).status === 416);
      const shell = (await raw(server, '/')).body.toString();
      ok('shell page at /', /<select id="channel"/.test(shell));
      // The page script travels inside a template literal — a backslash eaten on the way
      // makes the whole page a blank "불러오는 중…". Parse it the way the browser will.
      ok('shell page script parses', (shell.match(/<script>([\s\S]*?)<\/script>/g) || []).every((block) => {
        try { new vm.Script(block.replace(/^<script>|<\/script>$/g, '')); return true; } catch (e) { process.stdout.write('       ' + e.message + '\n'); return false; }
      }));
      // The page ships to people who don't read Korean, so no visible string may be
      // hardcoded outside the STRINGS dictionary. Checked by cutting the dictionary out
      // of the script and looking for Hangul in what remains.
      ok('no Hangul outside the STRINGS dictionary', (() => {
        const script = (shell.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
        const a = script.indexOf('var LANG_LABELS = {');
        const b = script.indexOf('function pickLang()');
        if (a < 0 || b < 0) return false;
        const rest = script.slice(0, a) + script.slice(b);
        const stray = rest.match(/[가-힣]+/g);
        if (stray) process.stdout.write('       stray: ' + stray.slice(0, 5).join(' ') + '\n');
        return !stray;
      })());
      // Every key English defines must exist in every other language, or that language
      // silently falls back mid-page and the UI reads half-translated.
      ok('every language covers the English key set', (() => {
        const script = (shell.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
        const m = script.match(/var STRINGS = (\{[\s\S]*?\n  \});/);
        if (!m) return false;
        const dict = new vm.Script('(' + m[1] + ')').runInNewContext({});
        const want = Object.keys(dict.en);
        return Object.keys(dict).every((code) => {
          const missing = want.filter((k) => !(k in dict[code]));
          if (missing.length) process.stdout.write('       ' + code + ' missing: ' + missing.join(',') + '\n');
          return !missing.length;
        });
      })());
      ok('the language picker is in the shell', /<select id="lang"/.test(shell));
      ok('POST refused', await new Promise((resolve) => {
        const r = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/channels', method: 'POST' }, (res) => resolve(res.statusCode === 405));
        r.end();
      }));
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    process.stdout.write(fails ? fails + ' failed\n' : 'selftest ok\n');
    process.exit(fails ? 1 : 0);
  }).catch((e) => die(e && e.stack || String(e)));
}

/* ── main ────────────────────────────────────────────────────────────────── */

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const flag = (name, dflt) => { const i = argv.indexOf(name); return i === -1 ? dflt : argv[i + 1]; };
  const skip = new Set(['--port', '--host'].map((f) => argv.indexOf(f) + 1).filter((i) => i > 0));
  const target = argv.filter((a, i) => !a.startsWith('--') && !skip.has(i))[0];
  if (!target) die('usage: serve.js <data root> [--port N] [--host H] [--open]');
  const root = path.resolve(target);
  if (!isDir(root)) die('not a directory: ' + root);
  if (!isFile(EPISODE_STATE)) die('episode-state.js not found at ' + EPISODE_STATE);
  // `--host` last on the line, or an unset shell variable, hands back undefined/'' — and
  // listen() reads either as every interface, with the warning below never firing.
  const host = flag('--host', '127.0.0.1') || die('--host needs a value');
  const port = parseInt(flag('--port', String(DEFAULT_PORT)), 10);
  if (Number.isNaN(port)) die('--port needs a number');

  listen(root, host, port).then((server) => {
    // An IPv6 literal needs brackets in a URL — `http://::1:8390/` is not an address.
    const shown = host === '0.0.0.0' ? '127.0.0.1' : (host.includes(':') ? '[' + host + ']' : host);
    const url = 'http://' + shown + ':' + server.address().port + '/';
    const channels = listChannels(root);
    process.stdout.write(url + '\n' + channels.length + ' channel(s): ' + channels.map((c) => c.slug).join(' ') + '\n');
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') process.stderr.write('serve: listening on ' + host + ' — data/ is readable by anyone who can reach this port\n');
    if (argv.indexOf('--open') !== -1) {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      const p = spawn(opener, [url], { stdio: 'ignore', detached: true });
      p.on('error', () => {});   // no opener on this host — the URL is already printed
      p.unref();
    }
  }).catch((e) => die(e && e.code === 'EADDRINUSE' ? 'port ' + port + ' is taken — pass --port' : (e && e.message) || String(e)));
}

main();
