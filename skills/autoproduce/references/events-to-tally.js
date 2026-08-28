#!/usr/bin/env node
/**
 * events-to-tally.js — checks the hand-written ledger against what the server actually did.
 *
 *   events-to-tally.js <episode dir>              the comparison
 *   events-to-tally.js <episode dir> --tsv        the missing lines, in cost-tally.tsv format
 *   events-to-tally.js <episode dir> --json       machine-readable
 *
 * ## Two records of the same money
 *
 * `.work/cost-tally.tsv` is written by hand — after each generation call a skill appends a
 * line. `.work/events.jsonl` is written by the MCP server at the moment of the call, without
 * anyone deciding to. When the two agree, the tally is trustworthy. When they don't, the
 * difference is the interesting part:
 *
 *   **missing** — the server made a call that never reached the tally. A session that ended
 *   mid-run, a regeneration nobody wrote down, a retry after a failure. The episode cost more
 *   than the report says.
 *
 *   **extra** — the tally claims spend the server has no record of. Usually a call made before
 *   the ledger existed, or by hand outside the pipeline. Worth a look, not an alarm.
 *
 * ## Why it doesn't just replace the tally
 *
 * The server can't see everything. ElevenLabs bills a metered character count that only comes
 * back in a response header, and produce sometimes trims or discards what it generated — facts
 * that belong in a memo a person wrote. So the events are the check, and the tally stays the
 * record. `--tsv` prints the lines that are missing so they can be appended and read once.
 *
 * Exit codes:
 *   0  the two agree (or there is nothing to compare)
 *   1  the tally is short — the server recorded calls that never reached it
 *   3  input error
 */

'use strict';

const fs = require('fs');
const path = require('path');

function die(msg) {
  process.stderr.write('events-to-tally: ' + msg + '\n');
  process.exit(3);
}

/** Reads events.jsonl, skipping lines a crash left half-written. */
function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); } catch (e) { /* a torn line is not a reason to stop */ }
  });
  return out;
}

/** Reads cost-tally.tsv into {key, qty} rows. */
function readTally(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 2)
    .map((c) => ({ key: c[0].trim(), qty: parseFloat(c[1]), memo: (c[2] || '').trim() }))
    .filter((r) => r.key && Number.isFinite(r.qty));
}

const sumByKey = (rows, keyOf, qtyOf) => {
  const acc = {};
  rows.forEach((r) => {
    const k = keyOf(r);
    if (!k) return;
    acc[k] = (acc[k] || 0) + (qtyOf(r) || 0);
  });
  return acc;
};

const round = (n) => Math.round(n * 1000) / 1000;

function main() {
  const argv = process.argv.slice(2);
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: events-to-tally.js <episode dir> [--tsv|--json]');
  const work = fs.existsSync(path.join(target, '.work'))
    ? path.join(target, '.work')
    : (path.basename(target) === '.work' ? target : null);
  if (!work) die('no .work/ under ' + target);

  const events = readEvents(path.join(work, 'events.jsonl'));
  const tally = readTally(path.join(work, 'cost-tally.tsv'));

  // Only successful calls with a key and a quantity can be compared. A failed call is kept in
  // the events file on purpose (it may still have been billed), but it is reported separately
  // rather than silently added to what the tally owes.
  const comparable = events.filter((e) => e.ok && e.key && typeof e.quantity === 'number');
  const unpriced = events.filter((e) => e.ok && (!e.key || typeof e.quantity !== 'number'));
  const failed = events.filter((e) => !e.ok);

  const fromEvents = sumByKey(comparable, (e) => e.key, (e) => e.quantity);
  const fromTally = sumByKey(tally, (r) => r.key, (r) => r.qty);

  const keys = Array.from(new Set(Object.keys(fromEvents).concat(Object.keys(fromTally)))).sort();
  const rows = keys.map((k) => {
    const server = round(fromEvents[k] || 0);
    const written = round(fromTally[k] || 0);
    return { key: k, server, written, delta: round(server - written) };
  });
  const short = rows.filter((r) => r.delta > 0.0005);
  const over = rows.filter((r) => r.delta < -0.0005);

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify({
      events: events.length, comparable: comparable.length,
      unpriced: unpriced.length, failed: failed.length,
      rows, missing: short, extra: over
    }, null, 2) + '\n');
    process.exit(short.length ? 1 : 0);
  }

  if (argv.indexOf('--tsv') !== -1) {
    short.forEach((r) => {
      process.stdout.write([r.key, r.delta,
        'backfill: recorded by the server, absent from the tally'].join('\t') + '\n');
    });
    process.exit(short.length ? 1 : 0);
  }

  const out = [];
  out.push('Ledger check — the hand-written tally against what the server recorded');
  out.push('');
  if (!events.length) {
    out.push('  events.jsonl is empty or absent — nothing to check against.');
    out.push('  The server writes it on every generation call whose outputPath sits inside');
    out.push('  this episode. An older episode simply predates it.');
    process.stdout.write(out.join('\n') + '\n');
    process.exit(0);
  }
  out.push('  ' + 'key'.padEnd(34) + 'server'.padStart(10) + 'tally'.padStart(10) + 'delta'.padStart(10));
  out.push('  ' + '-'.repeat(64));
  rows.forEach((r) => {
    out.push('  ' + r.key.padEnd(34) + String(r.server).padStart(10) +
             String(r.written).padStart(10) + String(r.delta).padStart(10));
  });
  out.push('');
  if (short.length) {
    out.push('  The tally is short on ' + short.length + ' key(s) — the server made calls that');
    out.push('  never reached it. Append them with --tsv, then rerun cost-report.sh.');
  } else if (over.length) {
    out.push('  The tally claims more than the server recorded on ' + over.length + ' key(s).');
    out.push('  Usually a call made outside the pipeline, or one that predates the events file.');
  } else {
    out.push('  The two agree.');
  }
  if (unpriced.length)
    out.push('  ' + unpriced.length + ' call(s) the server could not price (ElevenLabs metering, ' +
             'Lyria RealTime) — those stay hand-written.');
  if (failed.length)
    out.push('  ' + failed.length + ' failed call(s) recorded but not counted — check whether any was billed.');

  process.stdout.write(out.join('\n') + '\n');
  process.exit(short.length ? 1 : 0);
}

main();
