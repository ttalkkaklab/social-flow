#!/usr/bin/env node
'use strict';

// Researched clichés as story material (user directive, 2026-11-18). What the storyboard skill and
// the story_cliche tool share: the tagged catalogue, the rule for when an episode applies clichés,
// the picker that returns a few candidates for a story need, and the reading of a board's record.
// Everything here reports; nothing scores a story. cliche-use.md is the author's guide and
// docs/research/2026-11-18-kdrama-cliches is the evidence behind the catalogue.

const fs = require('node:fs');
const path = require('node:path');

const CATALOG_FILE = path.join(__dirname, 'cliche-catalog.json');

/** The job a cliché does for a story. An author picks by this, not by genre or fame. */
const NEEDS = {
  meet: 'brings two people together for the first time',
  bind: 'keeps people in one space or relationship so they cannot walk away',
  obstacle: 'blocks the relationship or the goal from outside',
  secret: 'creates an information gap: a secret, a hidden identity, a misunderstanding',
  reveal: 'makes the secret come out or turns the situation over',
  parting: 'causes separation or loss',
  reunion: 'brings people back together or restores what was lost',
  closeness: 'shows affection, care or growing intimacy through an act',
  outburst: 'makes anger, shock or grief physical',
  status: 'shows power, wealth, rank or standing at a glance',
  payback: 'delivers revenge, comeuppance or a reversal',
  danger: 'puts life, safety or position at risk',
  rule: 'a genre premise or supernatural rule the story runs on',
  setting: 'tells where and in what situation we are at once',
  closing: 'how an episode or story opens or closes',
  relief: 'releases tension or gets a laugh',
};

/** What kind of thing the cliché is, and the authoring step that chooses it. */
const LAYERS = {
  character: { stage: 'casting', what: 'a character type or relationship archetype' },
  device: { stage: 'synopsis', what: 'a plot-level setup or event that spans scenes' },
  format: { stage: 'synopsis', what: 'how the episode is structured or packaged' },
  scene: { stage: 'scenes', what: 'how one moment is staged' },
  place: { stage: 'scenes', what: 'a place, prop or everyday ritual' },
  line: { stage: 'scenes', what: 'a line of dialogue or a verbal habit' },
  directing: { stage: 'shots', what: 'camera, editing or music treatment' },
};

const GENRES = ['romance', 'family', 'sageuk', 'crime', 'legal', 'medical', 'office', 'revenge', 'school', 'fantasy', 'horror', 'any'];

/** Staging the research found criticised or sanctioned; left out of candidates unless asked for. */
const CAUTIONS = {
  coercion: 'contact or pursuit without consent staged as romance (경향신문 2016, 방송통신심의위원회 2017, Soompi 2015·2019)',
  violence: 'graphic or sexual violence of the kind the broadcast regulator sanctioned (펜트하우스 2021, 황후의 품격)',
};

let cache;
/** The catalogue: `{ version, researchedAt, source, items }`. Ids 1–371 are the research report's numbers. */
function catalog() {
  if (!cache) cache = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  return cache;
}
function find(id) {
  return catalog().items.find(item => item.id === id);
}

// A custom type is described in the user's words, so its detail decides. Documentary hybrids
// reconstruct recorded events and stay on the recommending side.
const STORY_WORDS = /드라마|로맨스|로코|멜로|연애물|코미디|시트콤|상황극|drama|romance|romantic|rom-?com|love story|comedy|sitcom|sketch/i;
const FACT_WORDS = /다큐|docu|르포|reportage/i;

/**
 * When an episode uses clichés (user directive 2026-11-18):
 *   apply — the cliché pass is part of writing: drama, comedy and romance, or a channel that saved "on";
 *   offer — recommend where one would help and apply what the user picks: every other type;
 *   off   — the channel saved "off"; nothing is applied unless the user asks in this episode.
 * `production` is the board's window.PRODUCTION (the episode's snapshot of the saved settings).
 */
function mode(production) {
  const p = production && typeof production === 'object' ? production : {};
  if (p.clicheUse === 'off') return { mode: 'off', why: "the channel's saved choice (production.clicheUse) is off" };
  if (p.clicheUse === 'on') return { mode: 'apply', basis: 'user', why: "the channel's saved choice (production.clicheUse) is on" };
  const type = p.videoType && typeof p.videoType === 'object' ? p.videoType : {};
  const id = typeof type.id === 'string' ? type.id : '';
  const detail = typeof type.detail === 'string' ? type.detail : '';
  if (id === 'drama' || id === 'comedy') return { mode: 'apply', basis: 'default', why: `video type ${id}` };
  if (id === 'custom' && STORY_WORDS.test(detail) && !FACT_WORDS.test(detail))
    return { mode: 'apply', basis: 'default', why: 'a custom video type that names a drama, romance or comedy' };
  return { mode: 'offer', why: id ? `video type ${id}` : 'no saved video type' };
}

// FNV-1a: a stable order per seed, so the same request lists the same candidates and another
// seed (the episode's topic) lists others. Without it every episode would start from the same few.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

function list(value, label, allowed) {
  const items = (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
    .flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean);
  const unknown = items.filter(item => !allowed.includes(item));
  if (unknown.length) throw new Error(`unknown ${label} "${unknown.join(', ')}" — one of: ${allowed.join(', ')}`);
  return [...new Set(items)];
}

/**
 * A few candidates for what the story needs. At least one need is required: the catalogue is
 * never read whole, and a cliché is chosen for the job it does. Production-practice entries
 * never appear; caution entries and ones the channel already used appear only when asked for.
 */
function pick(options = {}) {
  const needs = list(options.needs, 'need', Object.keys(NEEDS));
  if (!needs.length) throw new Error(`name at least one need — one of: ${Object.keys(NEEDS).join(', ')}`);
  const genres = list(options.genres, 'genre', GENRES);
  const layers = list(options.layers, 'layer', Object.keys(LAYERS));
  const exclude = new Set((Array.isArray(options.exclude) ? options.exclude : []).map(Number).filter(Number.isInteger));
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 40) : 12;
  const seed = options.seed === undefined ? '' : String(options.seed);
  const left = { caution: 0, used: 0 };
  const pool = catalog().items.filter((item) => {
    if (item.analysis) return false;
    if (!item.needs.some(need => needs.includes(need))) return false;
    if (layers.length && !layers.includes(item.layer)) return false;
    if (genres.length && !item.genres.includes('any') && !item.genres.some(genre => genres.includes(genre))) return false;
    if (item.caution && !options.includeCaution) { left.caution++; return false; }
    if (exclude.has(item.id)) { left.used++; return false; }
    return true;
  });
  const ranked = pool.map(item => ({ item, order: hash(`${seed}:${item.id}`) })).sort((a, b) => a.order - b.order).map(entry => entry.item);
  // One need at a time, so a need with few entries is not crowded out by one with many.
  const chosen = [];
  for (let round = 0; chosen.length < limit; round++) {
    let added = false;
    for (const need of needs) {
      // An entry's first need is its main job; those come before entries that only also do it.
      const mine = ranked.filter(item => item.needs.includes(need) && !chosen.includes(item))
        .sort((a, b) => (a.needs[0] === need ? 0 : 1) - (b.needs[0] === need ? 0 : 1));
      if (mine.length && chosen.length < limit) { chosen.push(mine[0]); added = true; }
    }
    if (!added) break;
  }
  return {
    needs, pool: pool.length, left,
    candidates: chosen.map(item => ({ ...item, stage: LAYERS[item.layer].stage,
      for: needs.filter(need => item.needs.includes(need)) })),
  };
}

// A hand-edited entry can carry anything as its name; only text is printed.
const useName = use => { const name = typeof use.name === 'string' ? use.name.trim() : ''; return Number.isInteger(use.id) ? `#${use.id}${name ? ` ${name}` : ''}` : `"${name}"`; };

/** A board's cliché record, read safely: a hand-edited block yields what can be read. */
function record(board) {
  const raw = board && typeof board === 'object' ? board.CLICHES : undefined;
  const tracked = !!raw && typeof raw === 'object' && !Array.isArray(raw);
  const uses = tracked && Array.isArray(raw.uses)
    ? raw.uses.filter(use => use && typeof use === 'object' && (Number.isInteger(use.id) || (typeof use.name === 'string' && use.name.trim())))
    : [];
  const none = tracked && typeof raw.none === 'string' && raw.none.trim() ? raw.none.trim() : undefined;
  return { tracked, uses, none };
}

/**
 * The record read against the episode's type: which mode applies, what was decided, which scene
 * references no longer exist, which catalogue entries an earlier episode of the channel used,
 * and which uses sit in the story without the user's pick on a type that only recommends —
 * story_cliche never writes one, so that is a hand edit or a type changed after recording.
 * `earlier` is `[{ id, name, episode }]` from earlierUses().
 */
function reading(board, { earlier = [] } = {}) {
  const { tracked, uses, none } = record(board);
  const applied = uses.filter(use => !use.offered), offered = uses.filter(use => use.offered);
  const scenes = board && board.STRUCTURE && Array.isArray(board.STRUCTURE.scenes) ? board.STRUCTURE.scenes : [];
  const known = new Set(scenes.filter(scene => scene && typeof scene === 'object').map(scene => scene.no));
  const dangling = uses.flatMap(use => (Array.isArray(use.scenes) ? use.scenes : []).filter(no => !known.has(no))
    .map(no => ({ use: useName(use), scene: no })));
  const repeats = applied.filter(use => Number.isInteger(use.id))
    .flatMap(use => earlier.filter(old => old.id === use.id).map(old => ({ id: use.id, name: use.name, episode: old.episode })));
  const m = mode(board && board.PRODUCTION);
  const unpicked = m.mode === 'apply' ? [] : applied.filter(use => use.basis !== 'user').map(useName);
  return {
    ...m, tracked,
    decision: applied.length ? 'use' : none ? 'none' : offered.length ? 'offer' : 'undecided',
    ...(none && !applied.length ? { none } : {}), applied, offered, dangling, repeats, unpicked,
  };
}

/** The record as one or two counted lines for the board digest every write prints. Counts, not targets. */
function digest(board) {
  const r = reading(board);
  if (!r.tracked) return [];
  const where = use => Array.isArray(use.scenes) && use.scenes.length ? ` scene ${use.scenes.join(', ')}` : use.character ? ` ${use.character}` : '';
  const lines = [];
  if (r.decision === 'undecided') {
    if (r.mode === 'apply') lines.push(`clichés: undecided — this episode applies them by default (${r.why}): pick with cliches.js for what the story needs and record with story_cliche, or record none with its reason`);
  } else if (r.decision === 'none') {
    lines.push(`clichés: none — ${r.none}`);
  } else {
    const names = r.applied.map(use => useName(use) + where(use));
    const head = r.applied.length ? `${r.applied.length} in the story (${names.slice(0, 8).join(' · ')}${names.length > 8 ? ` · +${names.length - 8} more` : ''})` : 'none applied';
    lines.push(`clichés: ${head}${r.offered.length ? `, ${r.offered.length} offered — they go in when the user picks them` : ''}`);
  }
  if (r.dangling.length) lines.push(`clichés: ${r.dangling.map(d => `${d.use} names scene ${d.scene}`).join(', ')}, which is not on the board — record the use again with story_cliche`);
  if (r.unpicked.length) lines.push(`clichés: ${r.unpicked.join(', ')} ${r.unpicked.length > 1 ? 'are' : 'is'} in the story without the user's pick, and this episode only recommends (${r.why}) — record ${r.unpicked.length > 1 ? 'them' : 'it'} as offered, or with basis "user" once the user picked`);
  return lines;
}

/**
 * Catalogue entries the channel's other episodes applied: `[{ id, name, episode }]`.
 * `episodesDir` is data/<channel>/episodes; `except` is the current episode's storyboard directory.
 * An unreadable board is skipped — this is a report, and another episode's file is not ours to fix.
 */
function earlierUses(episodesDir, except) {
  const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(episodesDir, { withFileTypes: true }); } catch { return out; }
  const skip = except ? path.resolve(except) : '';
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(episodesDir, entry.name, 'storyboard'), file = path.join(dir, 'scenes.js');
    if (path.resolve(dir) === skip || !fs.existsSync(file)) continue;
    try {
      const win = evaluateWindowScript(fs.readFileSync(file, 'utf8'), { filename: file });
      for (const use of record(win).uses)
        if (!use.offered && Number.isInteger(use.id)) out.push({ id: use.id, ...(typeof use.name === 'string' ? { name: use.name } : {}), episode: entry.name });
    } catch { /* skipped */ }
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────

const USAGE = `usage:
  cliches.js needs                                   the vocabulary: needs, layers, genres
  cliches.js mode <videoTypeId> [detail] [--saved on|off]
  cliches.js pick --need <a,b> [--genre <a,b>] [--layer <a,b>] [--exclude <ids>] [--episodes <dir> [--except <storyboard dir>]]
                  [--seed <text>] [--limit <n>] [--include-caution] [--json]
  cliches.js show <id> [<id> …]                      full entries with example works and evidence
  cliches.js board <storyboard dir|scenes.js>        the reading of a board's record`;

function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const key = arg.slice(2);
    if (['include-caution', 'json'].includes(key)) out[key] = true;
    else if (i + 1 < args.length) out[key] = args[++i];
    else throw new Error(`--${key} needs a value`);
  }
  return out;
}

const line = item => `  #${item.id} ${item.name} / ${item.en} — ${item.layer} (${LAYERS[item.layer].stage}) · ${item.desc}`
  + ` · ${item.genres.join(', ')}${item.caution ? ` · caution: ${item.caution}` : ''}${item.quote ? ' · a quoted line: borrow the pattern, not the words' : ''}`
  + `${item.evidence === 'unverified' ? ' · widely known, no source found' : ''}`;

function main(argv) {
  const [command, ...rest] = argv;
  const args = flags(rest);
  if (command === 'needs') {
    return ['needs — the job a cliché does for the story:', ...Object.entries(NEEDS).map(([id, what]) => `  ${id} — ${what}`),
      'layers — what it is, and the step that chooses it:', ...Object.entries(LAYERS).map(([id, layer]) => `  ${id} — ${layer.what} (${layer.stage})`),
      `genres: ${GENRES.join(', ')}`].join('\n');
  }
  if (command === 'mode') {
    if (!args._[0]) throw new Error(USAGE);
    const m = mode({ videoType: { id: args._[0], ...(args._[1] ? { detail: args._.slice(1).join(' ') } : {}) }, ...(args.saved ? { clicheUse: args.saved } : {}) });
    return `${m.mode} — ${m.why}`;
  }
  if (command === 'pick') {
    const used = args.episodes ? earlierUses(args.episodes, args.except) : [];
    const exclude = [...String(args.exclude || '').split(',').map(Number).filter(Number.isInteger), ...used.map(use => use.id)];
    const limit = args.limit === undefined ? undefined : Number(args.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit is a positive whole number');
    const result = pick({ needs: args.need, genres: args.genre, layers: args.layer, exclude, seed: args.seed, limit, includeCaution: !!args['include-caution'] });
    if (args.json) return JSON.stringify({ ...result, earlier: used }, null, 2);
    const out = [`${result.candidates.length} of ${result.pool} matching${result.left.caution ? ` · ${result.left.caution} caution entr${result.left.caution === 1 ? 'y' : 'ies'} left out (--include-caution only when the story treats the act as wrong or the user asked)` : ''}`
      + `${result.left.used ? ` · ${result.left.used} left out as excluded or used in an earlier episode` : ''}`];
    for (const need of result.needs) {
      const mine = result.candidates.filter(item => item.for[0] === need);
      if (mine.length) out.push(`${need} — ${NEEDS[need]}`, ...mine.map(line));
    }
    if (!result.candidates.length) out.push('  nothing matches — widen the genre or layer, or write the moment without a cliché');
    out.push('Choose for what the story needs; none is a valid choice. Record the choice with story_cliche (id, scenes, shift).');
    return out.join('\n');
  }
  if (command === 'show') {
    const ids = args._.flatMap(value => value.split(',')).map(Number);
    if (!ids.length || ids.some(id => !Number.isInteger(id))) throw new Error(USAGE);
    return ids.map((id) => {
      const item = find(id);
      if (!item) return `#${id} — no such entry`;
      return [line(item).trim(), `  needs: ${item.needs.join(', ')} · evidence: ${item.evidence}`,
        ...(item.works ? [`  example works (years marked † were not in the source): ${item.works}`] : []),
        `  source: ${catalog().source}${id <= catalog().reportEntries ? ` #${id}` : ' (the list of widely known items without a source)'}`].join('\n');
    }).join('\n');
  }
  if (command === 'board') {
    if (!args._[0]) throw new Error(USAGE);
    const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
    const target = path.resolve(args._[0]);
    const file = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
    const win = evaluateWindowScript(fs.readFileSync(file, 'utf8'), { filename: file });
    const episodes = path.dirname(path.dirname(path.dirname(file)));
    return JSON.stringify(reading(win, { earlier: path.basename(episodes) === 'episodes' ? earlierUses(episodes, path.dirname(file)) : [] }), null, 2);
  }
  throw new Error(USAGE);
}

if (require.main === module) {
  try { process.stdout.write(main(process.argv.slice(2)) + '\n'); }
  catch (error) { process.stderr.write(`cliches: ${error.message}\n`); process.exitCode = 2; }
}

module.exports = { NEEDS, LAYERS, GENRES, CAUTIONS, catalog, find, mode, pick, record, reading, digest, earlierUses, main };
