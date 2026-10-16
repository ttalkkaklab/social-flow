#!/usr/bin/env node
/**
 * pipeline-lint.js — checks the prose mirrors against pipeline.js. Read-only.
 *
 *   pipeline-lint.js            prints diverging rules, exit 1 if any
 *   pipeline-lint.js --list     prints every rule and its verdict
 *   pipeline-lint.js --selftest pins the document parsers
 *
 * Stage hand-offs, reviewer output contracts and media lanes still mirror pipeline.js.
 * Creative guidance does not mirror historical gate counts or section headings.
 * Entrypoints instead link the shared automation policy; this lint never adds an
 * approval requirement or changes the runtime authorization manifest.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { REVIEWERS, LANES, STAGES } = require('./pipeline.js');

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
const guidanceTarget = (src) => typeof src === 'string'
  ? /\[[^\]]*\]\(([^)\s]*automation-guidance\.md)\)/.exec(src)?.[1] || null
  : null;

/**
 * One rule = { name, run() → { ok, got, want } }. Every rule reads the documents itself;
 * nothing here writes.
 */
const RULES = [
  {
    name: 'workflow guidance links resolve',
    run() {
      const missing = [];
      for (const name of ['storyboard', 'produce', 'autoproduce', 'publish']) {
        const rel = SKILL(name), src = read(rel);
        const target = guidanceTarget(src);
        if (!target || path.resolve(ROOT, path.dirname(rel), target) !== path.join(ROOT, 'skills/_shared/automation-guidance.md') || !read('skills/_shared/automation-guidance.md')) missing.push(name);
      }
      return { ok: missing.length === 0, got: missing.join(', ') || 'all resolve',
               want: 'workflow entrypoints link the shared automation guidance' };
    },
  },
  {
    name: 'automation guidance preserves scope and honest review state',
    run() {
      const src = read('skills/_shared/automation-guidance.md') || '';
      const checks = [
        ['requested artifact', /storyboard request ends with a reviewable\s+storyboard/i],
        ['review state', /not_reviewed/.test(src) && /stale/.test(src)],
        ['external authorization', /authorization for new paid calls, external uploads, account changes, publication/i],
        ['existing consent', /Reuse valid prior authorization/i],
      ];
      const missing = checks.filter(([, check]) => typeof check === 'boolean' ? !check : !check.test(src)).map(([name]) => name);
      return { ok: missing.length === 0, got: missing.join(', ') || 'scope and evidence explicit',
               want: 'truthful review state and actual external-action boundaries' };
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
  ok('guidance link resolves a Markdown target', guidanceTarget('[automation guidance](../_shared/automation-guidance.md)') === '../_shared/automation-guidance.md');
  ok('mentioning a policy is not a link', guidanceTarget('automation-guidance.md') === null);
  ok('missing skill has no guidance link', guidanceTarget(null) === null);

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
      process.stderr.write('pipeline-lint: workflow documentation or manifest references diverge\n');
      for (const i of issues) {
        process.stderr.write('  ✗ ' + i.name + ': actual ' + i.got + ' · expected ' + i.want + '\n');
      }
      process.stderr.write('\nFix the reported contract or guidance link; do not restore historical quality gates to satisfy this lint.\n');
    }
    process.exit(1);
  }
  if (!listOnly) process.stdout.write('pipeline-lint: ' + results.length + ' mirrors match\n');
}

if (require.main === module) main();

module.exports = { RULES, tableRows, cells };
