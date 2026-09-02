#!/usr/bin/env node
/**
 * pipeline-lint.js — checks the prose mirrors against pipeline.js. Read-only.
 *
 *   pipeline-lint.js            prints diverging rules, exit 1 if any
 *   pipeline-lint.js --list     prints every rule and its verdict
 *   pipeline-lint.js --selftest pins the document parsers
 *
 * ## Why mirrors exist
 *
 * The stage ladder and the gate policy live in pipeline.js as data, and in five SKILL.md
 * sections as prose an agent reads while it works. Neither copy can go: the data is what
 * episode-state.js runs on, and the prose is what teaches the agent how to run a gate.
 * Duplicate bookkeeping always drifts, so this does the checking instead of human eyes —
 * the same arrangement formats.js and format-lint.js already have on the format axis.
 *
 * ## A failure is not necessarily a regression
 *
 * A diverging pair means the two copies disagree, not which one is wrong. Renumbering a
 * section in produce and forgetting the manifest reads the same as adding a gate to the
 * manifest and forgetting the document. A human decides which side to move.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { GATES, REVIEWERS, LANES, STAGES, unattendedGates } = require('./pipeline.js');

const ROOT = path.resolve(__dirname, '../../..');

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
};

const SKILL = (name) => 'skills/' + name + '/SKILL.md';

/**
 * The rows of the first markdown table whose header line matches `headerRe`.
 * Returns the body rows only — the header and the `|---|` separator are dropped.
 */
function tableRows(src, headerRe) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) return null;
  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) break;
    rows.push(lines[i]);
  }
  return rows;
}

/** Cells of one markdown table row, trimmed. */
const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim());

const uniq = (a) => Array.from(new Set(a));
const setEq = (a, b) => a.length === b.length && a.every((x) => b.indexOf(x) !== -1);

/**
 * One rule = { name, run() → { ok, got, want } }. Every rule reads the documents itself;
 * nothing here writes.
 */
const RULES = [
  {
    name: 'autoproduce gate numbers',
    run() {
      const src = read(SKILL('autoproduce'));
      if (src === null) return { ok: false, got: '(file missing)', want: SKILL('autoproduce') };
      // Section headings carry their own gate number: "### 4.5 Copy review gate (gate 6 — …)"
      const found = uniq(Array.from(src.matchAll(/^###[^\n]*\(gate ([0-9]+[a-f]?)\b/gm), (m) => m[1])).sort();
      const want = unattendedGates().map((g) => g.num).sort();
      return { ok: setEq(found, want), got: found.join(' '), want: want.join(' ') };
    },
  },
  {
    name: 'unattended gate count',
    run() {
      const src = read(SKILL('autoproduce'));
      const rows = src && tableRows(src, /^\|\s*What a human used to check\s*\|/);
      const n = rows ? rows.length : -1;
      return { ok: n === unattendedGates().length, got: String(n), want: String(unattendedGates().length) };
    },
  },
  {
    name: 'unattended gate sections',
    run() {
      const src = read(SKILL('autoproduce'));
      const rows = src && tableRows(src, /^\|\s*What a human used to check\s*\|/);
      if (!rows) return { ok: false, got: '(table not found)', want: 'the replacement table' };
      // Every § the table points at, across all of its cells.
      const cited = uniq(Array.from(rows.join('\n').matchAll(/§([\d.]+)/g), (m) => '§' + m[1]));
      const missing = unattendedGates().map((g) => g.section).filter((s) => cited.indexOf(s) === -1);
      return { ok: missing.length === 0, got: missing.length ? 'not cited: ' + missing.join(' ') : 'all cited',
               want: 'every unattended gate section cited in the table' };
    },
  },
  {
    name: 'attended gate headings',
    run() {
      const missing = [];
      for (const g of GATES.filter((x) => !x.num)) {
        const src = read(SKILL(g.skill));
        // "### 7. The build report gate" — the number comes from `section`, the text from `heading`.
        const num = g.section.replace('§', '');
        const re = new RegExp('^###\\s+' + num.replace('.', '\\.') + '\\.\\s+' + g.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'mi');
        if (!src || !re.test(src)) missing.push(g.id + ' (' + g.skill + ' ' + g.section + ')');
      }
      return { ok: missing.length === 0, got: missing.length ? missing.join(', ') : 'all present',
               want: 'every attended gate has its heading' };
    },
  },
  {
    name: 'reviewer table tails',
    run() {
      const src = read(SKILL('platform-guide'));
      const rows = src && tableRows(src, /^\|\s*Outgoing copy\s*\|/);
      if (!rows) return { ok: false, got: '(table not found)', want: 'the adversarial review table' };
      if (!rows.length) return { ok: false, got: '(the table has no rows)', want: 'the adversarial review table' };
      const body = rows.join('\n');
      const tails = uniq(Array.from(body.matchAll(/`([A-Z_]+_REVIEW)`/g), (m) => m[1]));
      const known = REVIEWERS.reduce((a, r) => a.concat(r.tails), []);
      const unknown = tails.filter((t) => known.indexOf(t) === -1);
      // Both directions. A mirror check earns its keep on deletions, so every reviewer the
      // manifest gives a copy surface has to still be named here — dropping a row is the edit
      // that would otherwise pass unseen.
      const copyReviewers = REVIEWERS.filter((r) => r.surfaces.some((s) => /copy/.test(s)));
      const absent = copyReviewers.map((r) => r.id).filter((id) => body.indexOf(id) === -1);
      // The name alone is not the mirror — the tail is what a delegator parses, so strip the
      // tails and the table still says nothing about what to expect back.
      const absentTails = copyReviewers.reduce((a, r) => a.concat(r.tails), [])
                                       .filter((t) => tails.indexOf(t) === -1 && t !== 'PLAN_REVIEW');
      const bad = unknown.map((t) => 'not in the manifest: ' + t)
                         .concat(absent.map((id) => 'missing from the table: ' + id))
                         .concat(absentTails.map((t) => 'tail missing from the table: ' + t));
      return { ok: bad.length === 0, got: bad.length ? bad.join(' · ') : tails.join(' '),
               want: 'every tail in the table is declared, and every copy reviewer is in the table' };
    },
  },
  {
    name: 'reviewer agents exist',
    run() {
      const missing = [];
      for (const r of REVIEWERS) {
        const src = read('agents/' + r.id + '.md');
        if (src === null) { missing.push(r.id + ' (no agent file)'); continue; }
        // The agent has to actually emit the tail it is declared to emit.
        for (const t of r.tails) if (src.indexOf(t) === -1) missing.push(r.id + ' does not mention ' + t);
      }
      return { ok: missing.length === 0, got: missing.length ? missing.join(', ') : 'all present',
               want: 'every reviewer has an agent file emitting its tails' };
    },
  },
  {
    name: 'produce lane routing',
    run() {
      const src = read(SKILL('produce'));
      if (src === null) return { ok: false, got: '(file missing)', want: SKILL('produce') };
      // Each lane's anchor — the token produce §1's routing table uses for that row.
      const anchors = { screencast: /alignment\.json.*portrait/i, mixed: /visual\.source\s*===?\s*"recording"/, generated: /\|\s*anything else\s*\|/i };
      const missing = LANES.filter((l) => !anchors[l.id] || !anchors[l.id].test(src)).map((l) => l.id);
      return { ok: missing.length === 0, got: missing.length ? 'not routed: ' + missing.join(' ') : 'all three routed',
               want: 'produce §1 routes every declared lane' };
    },
  },
  {
    name: 'episode-state consumes the manifest',
    run() {
      const src = read('skills/autoproduce/references/episode-state.js');
      if (src === null) return { ok: false, got: '(file missing)', want: 'episode-state.js' };
      const wired = /require\(['"][^'"]*pipeline\.js['"]\)/.test(src);
      // The ladder used to be a literal array in this file. If it comes back, the manifest is
      // no longer the only copy.
      const literal = /const\s+STAGES\s*=\s*\[\s*'empty'/.test(src);
      return { ok: wired && !literal, got: wired ? (literal ? 'wired, but a literal ladder is back' : 'wired') : 'not wired',
               want: 'requires pipeline.js and keeps no ladder of its own' };
    },
  },
  {
    name: 'stage hand-off commands',
    run() {
      const bad = [];
      for (const s of STAGES) {
        const tpls = typeof s.next === 'string' ? [s.next] : Object.values(s.next);
        for (const t of tpls) {
          for (const m of t.matchAll(/\/social-flow:([a-z-]+)/g)) {
            if (!fs.existsSync(path.join(ROOT, SKILL(m[1])))) bad.push(s.id + ' → ' + m[1]);
          }
        }
      }
      return { ok: bad.length === 0, got: bad.length ? bad.join(', ') : 'all resolve',
               want: 'every next-step command names a skill that exists' };
    },
  },
];

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };

  const md = [
    'text before',
    '| A | B |',
    '|---|---|',
    '| one | two |',
    '| three | four |',
    '',
    'text after',
  ].join('\n');
  const rows = tableRows(md, /^\|\s*A\s*\|/);
  ok('tableRows takes the body rows only', rows.length === 2);
  ok('tableRows stops at the blank line', rows[1] === '| three | four |');
  ok('cells splits a row', cells(rows[0]).join(',') === 'one,two');
  ok('a header that is not there returns null', tableRows(md, /^\|\s*Z\s*\|/) === null);
  ok('setEq ignores order', setEq(['b', 'a'], ['a', 'b']) && !setEq(['a'], ['a', 'b']));

  // The rules have to hold against the repo as it stands — that is the acceptance condition.
  for (const r of RULES) {
    const v = r.run();
    ok('rule holds: ' + r.name, v.ok);
  }

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('pipeline-lint selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const listOnly = argv.indexOf('--list') !== -1;

  const results = RULES.map((r) => Object.assign({ name: r.name }, r.run()));
  const issues = results.filter((r) => !r.ok);

  if (listOnly) {
    for (const r of results) {
      process.stdout.write((r.ok ? '  ' : '✗ ') + r.name.padEnd(34) + ' ' + String(r.got) + '\n');
    }
    process.stdout.write('\n' + results.length + ' rules · ' + issues.length + ' mismatches\n');
  }

  if (issues.length) {
    if (!listOnly) {
      process.stderr.write('pipeline-lint: the prose diverges from pipeline.js\n');
      for (const i of issues) {
        process.stderr.write('  ✗ ' + i.name + ': actual ' + i.got + ' · manifest ' + i.want + '\n');
      }
      process.stderr.write('\nA human decides which side moves — the manifest transcribes the prose, not the other way round.\n');
    }
    process.exit(1);
  }
  if (!listOnly) process.stdout.write('pipeline-lint: ' + results.length + ' mirrors match\n');
}

if (require.main === module) main();

module.exports = { RULES, tableRows, cells };
