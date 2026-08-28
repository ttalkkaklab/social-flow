#!/usr/bin/env node
/**
 * check-research.js — did the research actually close before the scenes opened?
 *
 *   check-research.js <storyboard dir | research.md>       the findings
 *   check-research.js <...> --json                          machine-readable
 *   check-research.js --selftest                            pins the rules and the floors
 *
 * ## What this is for
 *
 * The storyboard skill's §2 is a step with an exit, and the exit is a self-check: the same
 * agent that did the searching writes the line saying the searching was enough. That is the
 * one gate in the skill with nobody on the other side of it, and a storyboard authored while
 * the research is still open bends the facts to sentences already written.
 *
 * So this counts what is actually on the page and compares it against what the page claims.
 * The first episode it was run on had a Verified table of 11 rows under a Sufficiency line
 * saying 10 — a small drift, and exactly the kind nobody catches by reading.
 *
 * ## What it reads
 *
 * The `references/storyboard-template.md` §research.md structure:
 *
 *   ## Questions …            one row per question · Status says answered / written off
 *   ## Verified               one row per claim, numbered, with source links
 *   ## Counter-evidence …     one row per key claim, `Claim #` naming which (ranges allowed)
 *   ## Failed verification …  what was excluded and why
 *   ## Sufficiency            the self-reported counts
 *
 * A channel whose profile skips research has no research.md at all, and that is not a defect —
 * the caller decides whether the file was supposed to exist.
 *
 * Exit codes:
 *   0  the research closes
 *   1  it does not (below the floor, a question left open, a self-report that does not match)
 *   3  input error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SELF_DIR = __dirname;
const FORMAT_RESOLVE = path.resolve(SELF_DIR, '..', '..', 'platform-guide', 'references', 'format-resolve.js');

/* ── The floors ──
   The source of truth is the storyboard skill's §2 step 4: three verified claims is the floor
   below which there is no video, a short normally leaves with five or more and a long-form
   with twelve. --selftest reads those numbers back out of SKILL.md, so a change there fails
   here rather than drifting silently. */
const FLOOR_ABSOLUTE = 3;
const FLOOR_SHORT = 5;
const FLOOR_LONG = 12;

function die(msg) {
  process.stderr.write('check-research: ' + msg + '\n');
  process.exit(3);
}

/** Pulls a `## <heading>` section's body out of the document. */
function section(src, re) {
  const lines = src.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && re.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const body = [];
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

/** Markdown table rows, header and separator dropped, split into trimmed cells. */
function rows(body) {
  if (!body) return [];
  return body.split('\n')
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells, i, all) => {
      if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) return false;   // separator
      // The first surviving row is the header — drop it.
      const firstReal = all.findIndex((r) => !r.every((c) => /^:?-+:?$/.test(c) || c === ''));
      return i !== firstReal;
    });
}

/** Expands "1~6", "1-6", "1, 3" into claim numbers. */
function claimNumbers(cell) {
  const out = new Set();
  String(cell || '').split(/[,·]/).forEach((part) => {
    const range = part.trim().match(/^(\d+)\s*[~\-–]\s*(\d+)$/);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) out.add(n);
      return;
    }
    const one = part.trim().match(/^(\d+)$/);
    if (one) out.add(Number(one[1]));
  });
  return out;
}

function formatOf(storyboardDir) {
  const scenes = path.join(storyboardDir, 'scenes.js');
  if (!fs.existsSync(scenes)) return null;
  try {
    return JSON.parse(execFileSync('node', [FORMAT_RESOLVE, scenes, '--json'], { encoding: 'utf8' }));
  } catch (e) {
    return null;
  }
}

function analyse(src, fmt) {
  const out = [];
  const bad = (what) => out.push({ level: 'bad', what });
  const warn = (what) => out.push({ level: 'warn', what });

  // Headings come in both languages. The template is written in English, and roughly half the
  // library authored the document in Korean instead — "검증 표" and "검증 통과" for Verified,
  // "검색 이력" for the search history. Matching only the template's wording reported every
  // Korean log as having no research at all (measured on the whole library, first run).
  const qRows = rows(section(src, /Question|질문/i));
  const vRows = rows(section(src, /^##\s+(Verified|검증\s*(표|통과))/i));
  const cRows = rows(section(src, /Counter-evidence|반증|역검증/i));
  const fRows = rows(section(src, /Failed\s*(verification)?|검증\s*실패|본문\s*금지|제외/i));
  const suffBody = section(src, /Sufficiency|충분성|충족/i) || '';

  // ── Claims ──
  const claims = vRows.filter((r) => /^\**\d+\**$/.test(r[0] || ''))
    .map((r) => ({ n: Number((r[0] || '').replace(/\*/g, '')), cells: r }));
  const claimCount = claims.length;

  const isLong = fmt && fmt.format === 'youtube-long-16x9';
  const aim = isLong ? FLOOR_LONG : FLOOR_SHORT;

  if (!vRows.length) bad('no Verified table — every factual claim maps 1:1 to a row there');
  if (claimCount < FLOOR_ABSOLUTE)
    bad(`${claimCount} verified claim(s) — below the floor of ${FLOOR_ABSOLUTE}. ` +
        'Change the angle or the topic rather than padding the body');
  else if (claimCount < aim)
    warn(`${claimCount} verified claim(s) — a ${isLong ? 'long-form' : 'short'} normally leaves §2 with ${aim} or more`);

  // Every claim carries a basis somewhere in its row. The column layout varies between logs
  // (the template has Source 1 / Source 2; several channels use a single 출처 column), so the
  // whole row is searched rather than fixed positions.
  //
  // A URL is not the only valid basis. A figure measured here (`claude mcp add --help` run
  // locally), a quotation from the document the row above already cited, or an official
  // dataset named by name are all bases — this only fires when the row names nothing at all.
  const BASIS = /https?:\/\/|원문|실측|측정|공식|같은\s*문서|자체\s*실험|1차/;
  claims.forEach((c) => {
    if (!BASIS.test(c.cells.join(' ')))
      warn(`claim ${c.n} names no basis — no link, no measurement, no named source`);
  });

  // ── The self-reported line against the table ──
  const claimed = suffBody.match(/verified claims:\s*\**\s*(\d+)/i);
  if (!claimed) {
    warn('the Sufficiency section does not state a verified-claim count');
  } else if (Number(claimed[1]) !== claimCount) {
    bad(`Sufficiency says ${claimed[1]} verified claims, the Verified table has ${claimCount} — ` +
        'the self-report and the page disagree');
  }

  // ── Questions ──
  if (!qRows.length) {
    bad('no question map — §2 step 1 writes it before the first search, and every row has to ' +
        'end answered or written off');
  } else {
    const open = qRows.filter((r) => {
      const status = (r[r.length - 1] || '').toLowerCase();
      return !/answer|claim|written off|writeoff|written-off|제외|답/.test(status);
    });
    if (open.length)
      bad(`${open.length} question(s) end neither answered nor written off — ` +
          open.slice(0, 3).map((r) => (r[0] || '?')).join(', '));
    const answeredLine = suffBody.match(/questions answered:\s*(\d+)\s*\/\s*(\d+)/i);
    if (answeredLine && Number(answeredLine[2]) !== qRows.length)
      warn(`Sufficiency counts ${answeredLine[2]} questions, the table has ${qRows.length}`);
  }

  // ── Counter-evidence coverage ──
  // Every key claim gets one counter-evidence search (§2 step 2). Ranges count.
  const covered = new Set();
  cRows.forEach((r) => claimNumbers(r[0]).forEach((n) => covered.add(n)));
  if (!cRows.length) {
    bad('no counter-evidence section — every key claim gets one search against itself');
  } else {
    const missing = claims.map((c) => c.n).filter((n) => !covered.has(n));
    if (missing.length)
      warn(`claim(s) ${missing.join(', ')} have no counter-evidence row — ` +
           'a claim nobody searched against is a claim nobody checked');
  }

  if (!fRows.length)
    warn('no "Failed verification → excluded" rows — everything searched for held up, ' +
         'which happens, but it is worth a second look');

  return {
    claims: claimCount, questions: qRows.length, counterRows: cRows.length,
    excluded: fRows.length, floor: FLOOR_ABSOLUTE, aim,
    format: fmt ? fmt.format : null, findings: out
  };
}

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };

  const doc = (parts) => parts.join('\n');
  const good = doc([
    '# t — research & verification log (2026-08-28)',
    '',
    '## Questions this episode has to answer',
    '| # | Question | Why | Status |',
    '|---|---|---|---|',
    '| Q1 | a | hook | answered by claim 1 |',
    '| Q2 | b | stat | written off |',
    '',
    '## Verified',
    '| # | Claim | Source 1 | Source 2 | Tool | Checked | Notes |',
    '|---|---|---|---|---|---|---|',
    '| 1 | x | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
    '| 2 | y | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
    '| 3 | z | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
    '',
    '## Counter-evidence & freshness',
    '| Claim # | Counter | What came back | Freshness | Still current? |',
    '|---|---|---|---|---|',
    '| 1~3 | "x 아니다" | nothing | 1y | yes |',
    '',
    '## Failed verification → excluded',
    '| Claim | Reason |',
    '|---|---|',
    '| q | sources conflict |',
    '',
    '## Sufficiency',
    '',
    'verified claims: **3** (floor 3) · questions answered: 1/2 · written off: Q2.'
  ]);

  const bads = (r) => r.findings.filter((f) => f.level === 'bad');
  const has = (r, re) => r.findings.some((f) => re.test(f.what));

  const g = analyse(good, { format: 'shorts-9x16' });
  ok('a well-formed log has no violations', bads(g).length === 0);
  ok('it counts the claims', g.claims === 3);
  ok('three claims still warns against the short aim of 5', has(g, /normally leaves/));

  ok('below the floor is a violation',
     has(analyse(good.replace(/\| 3 \| z \|.*\n/, '').replace('**3**', '**2**'), null), /below the floor/));

  ok('a self-report that disagrees with the table is a violation',
     has(analyse(good.replace('verified claims: **3**', 'verified claims: **7**'), null),
         /Sufficiency says 7/));

  ok('a question left open is a violation',
     has(analyse(good.replace('| Q2 | b | stat | written off |', '| Q2 | b | stat | searching |'), null),
         /neither answered nor written off/));

  ok('a missing question map is a violation',
     has(analyse(good.replace('## Questions this episode has to answer', '## Notes'), null),
         /no question map/));

  ok('a claim with no counter-evidence row is flagged',
     has(analyse(good.replace('| 1~3 |', '| 1 |'), null), /claim\(s\) 2, 3 have no counter-evidence/));

  ok('a range in the Claim # column covers every claim in it',
     [...claimNumbers('1~6')].length === 6 && claimNumbers('1~6').has(4));
  ok('a comma list is read as separate claims',
     claimNumbers('1, 3').has(1) && claimNumbers('1, 3').has(3) && !claimNumbers('1, 3').has(2));

  ok('a claim naming no basis at all is flagged',
     has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
                              '| 1 | x | - | - | - | - | |'), null),
         /claim 1 names no basis/));
  // A local measurement or a quotation from the row above is a basis, not a gap.
  ok('a measured figure counts as a basis',
     !has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) |', '| 1 | x | --help 로컬 실행 실측 | 같은 공식 문서 원문 |'), null),
          /claim 1 names no basis/));

  // Drift guard — the floors live in the skill, and this file has to agree with it.
  const skill = path.resolve(SELF_DIR, '..', 'SKILL.md');
  if (fs.existsSync(skill)) {
    const s = fs.readFileSync(skill, 'utf8');
    ok('SKILL §2 still says three verified claims is the floor',
       /Three verified claims is the floor/i.test(s));
    ok('SKILL §2 still aims a short at five or more', /\*\*five or more\*\*/.test(s));
    ok('SKILL §2 still aims a long-form at twelve or more', /\*\*twelve or more\*\*/.test(s));
  } else {
    process.stderr.write('WARN storyboard SKILL.md not found — floor drift guard skipped\n');
  }

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('check-research selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: check-research.js <storyboard dir | research.md> [--json]');
  if (!fs.existsSync(target)) die('path not found: ' + target);

  const isDir = fs.statSync(target).isDirectory();
  const file = isDir ? path.join(target, 'research.md') : target;
  if (!fs.existsSync(file))
    die('research.md not found: ' + file +
        ' — a channel whose profile skips research has none, and that is not a defect');

  const fmt = formatOf(isDir ? target : path.dirname(file));
  const result = analyse(fs.readFileSync(file, 'utf8'), fmt);
  const bad = result.findings.filter((f) => f.level === 'bad');
  const warn = result.findings.filter((f) => f.level === 'warn');

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(bad.length ? 1 : 0);
  }

  const lines = ['research.md — ' + result.claims + ' verified claim(s) · ' +
                 result.questions + ' question(s) · ' + result.excluded + ' excluded', ''];
  if (!result.findings.length) {
    lines.push('  The research closes: the floor is met, every question ends answered or');
    lines.push('  written off, and each claim was searched against itself.');
  } else {
    bad.concat(warn).forEach((f) => lines.push('  ' + (f.level === 'bad' ? '!' : '·') + ' ' + f.what));
    lines.push('');
    lines.push('  ' + bad.length + ' violation(s), ' + warn.length + ' to look at.');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad.length ? 1 : 0);
}

main();
