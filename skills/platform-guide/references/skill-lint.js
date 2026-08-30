#!/usr/bin/env node
/**
 * skill-lint.js — the machine check for the skill surface. Read-only.
 *
 *   skill-lint.js             prints violations, exit 1 if any
 *   skill-lint.js --list      prints every rule and what it found
 *   skill-lint.js --selftest  pins the parser, then asserts every rule against the repo
 *
 * ## What it guards, and why each rule exists
 *
 * **The routing surface.** A skill is chosen by its `description`, and the hosts
 * budget that text differently. Claude Code reads the whole thing; codex-cli cuts
 * it at about 76 characters (measured on 0.149.1 — every one of the 18 came back
 * clipped mid-word in `codex debug prompt-input`). So the identity has to be in
 * the opening clause, and two skills must not open the same way.
 *
 * **The tool lanes.** `allowed-tools` is advisory in Claude Code 2.1.251 — a name
 * that resolves to nothing is not refused, it is ignored (measured: a skill whose
 * allowed-tools named one tool still saw all 218). That silence is exactly why
 * this rule exists. Six `chrome-devtools` entries and eighteen `claude-in-chrome`
 * entries survived several releases after those servers were gone from every
 * machine that runs this plugin, because nothing ever failed.
 *
 * **The numbers written into prose.** Four plugin manifests, the server package
 * and the README all state a version or a tool count. Duplicate bookkeeping
 * drifts — `.plugin/plugin.json` sat two releases behind before anyone looked.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(ROOT, 'skills');

/** codex-cli truncates a skill description to this many characters. */
const CODEX_VISIBLE = 76;
/** The cap codex-cli's own skill schema documents. */
const DESCRIPTION_MAX = 1024;
/** Browser automation that is not this project's lane (AGENTS.md §Tool lanes). */
const BANNED_TOOLING = ['claude-in-chrome', 'chrome-devtools'];
/** The only MCP server a skill may name. */
const OWN_MCP_PREFIX = 'mcp__social-flow__';
/**
 * A ceiling on SKILL.md, not a target. produce and storyboard sit near it because
 * most of what they carry runs on every episode — moving that to a reference costs an
 * extra read and saves nothing. What did move out is the conditional work: the video
 * engines and per-slot recipes, the filmed/slide/screencast lanes, the extra subtitle
 * languages. An episode that stays on the common path never opens those files.
 * Ratchet this down when a real conditional block comes out; never raise it to fit
 * new prose.
 */
const SKILL_MAX_LINES = 1350;

/**
 * References whose numbers come from outside and go stale: vendor prices, platform limits,
 * measured player chrome. Each states when it was verified, where the numbers came from, and
 * how often to reopen the sources. Age is reported, not enforced — CI must not go red because
 * a date passed while nobody touched the repo.
 */
const VOLATILE = [
  'skills/grow-threads/references/api-limits.md',
  'skills/autoproduce/references/cost-tiers.md',
  'skills/autoproduce/references/prices.tsv',
  'skills/produce/references/video-model-selection.md',
  'skills/platform-guide/references/platform-playbook.md',
  'skills/platform-guide/references/safezone-landscape.md',
];

const MANIFESTS = [
  '.claude-plugin/plugin.json',
  '.plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.grok-plugin/plugin.json',
];

const read = (abs) => fs.readFileSync(abs, 'utf8');
const exists = (abs) => fs.existsSync(abs);

function skillNames() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

function balanced(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
  }
  return depth === 0;
}

/**
 * Reads the frontmatter shapes this repo actually uses: `key: value`,
 * `key: "value"`, a `key: >` folded block, and a JSON array that may wrap.
 * Not a YAML parser — a YAML parser is not a dependency this script gets to have.
 */
function parseFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!m) return null;
  const lines = m[1].split('\n');
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2];
    if (value === '>' || value === '|') {
      const folded = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        folded.push(lines[++i].trim());
      }
      value = folded.join(value === '>' ? ' ' : '\n');
    } else if (value.startsWith('[')) {
      // A tool array wraps across lines once it gets long.
      while (i + 1 < lines.length && !balanced(value)) value += ' ' + lines[++i].trim();
    } else if (/^".*"$/.test(value)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function allowedTools(fm) {
  if (!fm || typeof fm['allowed-tools'] !== 'string') return null;
  try {
    return JSON.parse(fm['allowed-tools']);
  } catch (err) {
    return undefined; // present but unparseable — rule 6 reports it
  }
}

function loadSkills() {
  return skillNames().map((name) => {
    const file = path.join(SKILLS_DIR, name, 'SKILL.md');
    const body = read(file);
    const fm = parseFrontmatter(body);
    return { name, file, rel: `skills/${name}/SKILL.md`, body, fm, tools: allowedTools(fm) };
  });
}

/** Every file under some skills/<name>/references/, keyed by basename. */
function referenceIndex() {
  const byBase = new Map();
  const all = [];
  for (const skill of skillNames()) {
    const dir = path.join(SKILLS_DIR, skill, 'references');
    if (!exists(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (!fs.statSync(abs).isFile()) continue;
      const rel = `skills/${skill}/references/${entry}`;
      all.push(rel);
      if (!byBase.has(entry)) byBase.set(entry, []);
      byBase.get(entry).push(rel);
    }
  }
  return { byBase, all };
}

/** The files that state the rules quote the banned names, so they are not scanned for them. */
const RULE_SOURCES = new Set(['AGENTS.md', 'skills/platform-guide/references/skill-lint.js']);

/** Text files that may point at a reference: skill docs, other references, agents, root docs. */
function proseFiles() {
  const files = [];
  for (const skill of skillNames()) {
    files.push(path.join(SKILLS_DIR, skill, 'SKILL.md'));
    const dir = path.join(SKILLS_DIR, skill, 'references');
    if (!exists(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (fs.statSync(abs).isFile() && /\.(md|js|mjs|sh|py|html|css|tsv)$/.test(entry)) files.push(abs);
    }
  }
  const agents = path.join(ROOT, 'agents');
  if (exists(agents)) {
    for (const entry of fs.readdirSync(agents)) files.push(path.join(agents, entry));
  }
  for (const doc of ['README.md', 'CLAUDE.md', 'AGENTS.md', '.github/workflows/check.yml']) {
    const abs = path.join(ROOT, doc);
    if (exists(abs)) files.push(abs);
  }
  return files;
}

const REF_MENTION = /references\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

/** Trailing sentence punctuation rides along with the filename — cut it back off. */
const refName = (raw) => raw.replace(/\.+$/, '');

function manifestVersions() {
  const out = {};
  for (const rel of MANIFESTS) out[rel] = JSON.parse(read(path.join(ROOT, rel))).version;
  out['server/package.json'] = JSON.parse(read(path.join(ROOT, 'server/package.json'))).version;
  return out;
}

function serverToolCount() {
  // dist is committed (marketplace installs never build), so this always resolves.
  const { TOOLS } = require(path.join(ROOT, 'server/dist/tools.js'));
  return TOOLS.length;
}

const RULES = [
  {
    name: 'name matches the directory',
    run() {
      const bad = loadSkills()
        .filter((s) => !s.fm || s.fm.name !== s.name)
        .map((s) => `${s.rel}: name=${s.fm ? s.fm.name : '(no frontmatter)'}`);
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: `description within ${DESCRIPTION_MAX} chars`,
    run() {
      const bad = loadSkills()
        .filter((s) => (s.fm.description || '').length > DESCRIPTION_MAX)
        .map((s) => `${s.rel}: ${s.fm.description.length} chars`);
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'description carries no <angle> placeholder',
    run() {
      const bad = [];
      for (const s of loadSkills()) {
        const hits = (s.fm.description || '').match(/<[A-Za-z][\w-]*>/g);
        if (hits) bad.push(`${s.rel}: ${[...new Set(hits)].join(' ')} — write data/[channel]/ instead`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: `first ${CODEX_VISIBLE} chars of a description are unique`,
    run() {
      const seen = new Map();
      const bad = [];
      for (const s of loadSkills()) {
        const head = (s.fm.description || '').slice(0, CODEX_VISIBLE);
        if (seen.has(head)) bad.push(`${s.rel}: same visible opening as ${seen.get(head)}`);
        else seen.set(head, s.rel);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'description opens with the job, not a lead-in',
    run() {
      const leadIn = /^\s*(this skill (should be used|is)|use this skill|you should use)/i;
      const bad = loadSkills()
        .filter((s) => leadIn.test(s.fm.description || ''))
        .map((s) => `${s.rel}: the lead-in eats the ${CODEX_VISIBLE}-char budget codex shows`);
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'allowed-tools names only this plugin\'s MCP server',
    run() {
      const bad = [];
      for (const s of loadSkills()) {
        if (s.tools === undefined) { bad.push(`${s.rel}: allowed-tools is not a JSON array`); continue; }
        if (s.tools === null) continue; // no allowed-tools is allowed
        for (const t of s.tools) {
          if (t.startsWith('mcp__') && !t.startsWith(OWN_MCP_PREFIX)) bad.push(`${s.rel}: ${t}`);
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'no banned browser tooling anywhere',
    run() {
      const bad = [];
      for (const abs of proseFiles()) {
        const rel = path.relative(ROOT, abs);
        if (RULE_SOURCES.has(rel)) continue;
        const text = read(abs);
        for (const banned of BANNED_TOOLING) {
          if (text.includes(banned)) bad.push(`${rel}: ${banned}`);
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'every referenced reference file exists',
    run() {
      const { byBase } = referenceIndex();
      const bad = [];
      for (const abs of proseFiles()) {
        const rel = path.relative(ROOT, abs);
        // A reference file naming itself in its own header is not a link.
        const self = path.basename(abs);
        if (RULE_SOURCES.has(rel)) continue;
        for (const m of read(abs).matchAll(REF_MENTION)) {
          const name = refName(m[1]);
          if (name === self) continue;
          if (!byBase.has(name)) bad.push(`${rel}: references/${name} does not exist`);
        }
      }
      return { ok: bad.length === 0, detail: [...new Set(bad)] };
    },
  },
  {
    name: 'every Contents link lands on a heading',
    run() {
      const anchor = (text) =>
        text
          .trim()
          .toLowerCase()
          .replace(/[`*[\]()（），,.:;/—·"'?!§<>&+|=%$#@~]/g, '')
          .replace(/ /g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-|-$/g, '');
      const bad = [];
      for (const rel of referenceIndex().all) {
        if (!rel.endsWith('.md')) continue;
        const body = read(path.join(ROOT, rel));
        const toc = /^## Contents\n\n((?:.*\n)*?)\n/m.exec(body);
        if (!toc) continue;
        const heads = new Set(
          Array.from(body.matchAll(/^#{2,4} (.+)$/gm), (m) => anchor(m[1])),
        );
        for (const m of toc[1].matchAll(/\]\(#([^)]+)\)/g)) {
          if (!heads.has(m[1])) bad.push(`${rel}: #${m[1]} has no heading`);
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'a long reference carries a Contents list',
    run() {
      const bad = [];
      for (const rel of referenceIndex().all) {
        if (!rel.endsWith('.md') || rel.endsWith('-template.md')) continue;
        const body = read(path.join(ROOT, rel));
        if (body.split('\n').length <= 100) continue;
        const heads = body.match(/^#{2,3} .+$/gm) || [];
        // Under four headings there is nothing to navigate.
        if (heads.length >= 4 && !/^## Contents\s*$/m.test(body)) bad.push(`${rel}: no Contents`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'volatile references carry a freshness line',
    run() {
      const bad = [];
      const stale = [];
      const today = new Date();
      for (const rel of VOLATILE) {
        const body = read(path.join(ROOT, rel));
        const m = /Freshness[^\n]*?verified (\d{4}-\d{2}-\d{2})[\s\S]{0,400}?recheck every (\d+) days/.exec(body);
        if (!m) { bad.push(`${rel}: no parseable freshness line`); continue; }
        const age = Math.round((today - new Date(m[1])) / 86400000);
        if (age > Number(m[2])) stale.push(`${rel}: verified ${m[1]}, ${age} days ago, recheck every ${m[2]}`);
      }
      // Age is reported, never failed on — a calendar must not break a build. `--list` shows it.
      return { ok: bad.length === 0, detail: bad.concat(stale.map((s) => 'due for recheck — ' + s)) };
    },
  },
  {
    name: 'no orphan reference file',
    run() {
      const { all } = referenceIndex();
      // Basename, not the references/ path — a doc may call it `$REF/decisions.sh`
      // and a CI step names it by path from the repo root.
      const bad = [];
      for (const rel of all) {
        const base = path.basename(rel);
        const cited = proseFiles().some(
          (abs) => path.basename(abs) !== base && read(abs).includes(base),
        );
        if (!cited) bad.push(`${rel}: nothing points at it`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: `SKILL.md within ${SKILL_MAX_LINES} lines`,
    run() {
      const bad = [];
      for (const s of loadSkills()) {
        const n = s.body.split('\n').length;
        if (n > SKILL_MAX_LINES) bad.push(`${s.rel}: ${n} lines`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    name: 'manifest versions agree',
    run() {
      const v = manifestVersions();
      const values = [...new Set(Object.values(v))];
      return {
        ok: values.length === 1,
        detail: values.length === 1 ? [] : Object.entries(v).map(([k, x]) => `${k}: ${x}`),
      };
    },
  },
  {
    name: 'the tool count in the prose matches the server',
    run() {
      const n = serverToolCount();
      const bad = [];
      const targets = ['README.md', ...MANIFESTS];
      for (const rel of targets) {
        const text = read(path.join(ROOT, rel));
        for (const line of text.split('\n')) {
          if (line.includes('as of')) continue; // a dated claim about the past, not the count now
          for (const m of line.matchAll(/(\d+)\s+tools\b/g)) {
            if (Number(m[1]) !== n) bad.push(`${rel}: says ${m[1]} tools, server has ${n}`);
          }
        }
        for (const m of text.matchAll(/ships (\d+) tools/g)) {
          if (Number(m[1]) !== n) bad.push(`${rel}: "ships ${m[1]} tools", server has ${n}`);
        }
      }
      return { ok: bad.length === 0, detail: [...new Set(bad)] };
    },
  },
];

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };

  const fixture = [
    '---',
    'name: demo',
    'description: >',
    '  First line.',
    '  Second line.',
    'argument-hint: "[channel] [topic]"',
    'allowed-tools: ["Read", "mcp__social-flow__tts_generate"]',
    '---',
    '',
    '# body',
    '',
  ].join('\n');
  const fm = parseFrontmatter(fixture);
  ok('parses a plain key', fm.name === 'demo');
  ok('folds a > block onto one line', fm.description === 'First line. Second line.');
  ok('strips quotes from a scalar', fm['argument-hint'] === '[channel] [topic]');
  ok('reads the tool array', allowedTools(fm).length === 2);
  ok('no frontmatter returns null', parseFrontmatter('# just a heading\n') === null);
  ok('an unparseable tool array is undefined, not empty',
    allowedTools({ 'allowed-tools': '[not json' }) === undefined);
  ok('a folded block ends at the next key',
    parseFrontmatter('---\ndescription: >\n  a\n  b\nname: x\n---\n').name === 'x');

  const mentions = [...'see references/a.md and skills/x/references/b.md'.matchAll(REF_MENTION)]
    .map((m) => m[1]);
  ok('a reference mention is read by basename', mentions.join(',') === 'a.md,b.md');

  // The rules have to hold against the repo as it stands — that is the acceptance condition.
  for (const r of RULES) ok('rule holds: ' + r.name, r.run().ok);

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('skill-lint selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const listOnly = argv.indexOf('--list') !== -1;

  const results = RULES.map((r) => Object.assign({ name: r.name }, r.run()));
  const issues = results.filter((r) => !r.ok);

  if (listOnly) {
    for (const r of results) {
      process.stdout.write(`${r.ok ? '  ' : '✗ '}${r.name}\n`);
      for (const d of r.detail) process.stdout.write(`      ${d}\n`);
    }
    process.stdout.write(`\n${results.length} rules · ${issues.length} violated\n`);
    return;
  }

  if (issues.length) {
    process.stderr.write('skill-lint: the skill surface breaks its own rules\n');
    for (const r of issues) {
      process.stderr.write(`  ✗ ${r.name}\n`);
      for (const d of r.detail) process.stderr.write(`      ${d}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`skill-lint: ${RULES.length} rules hold across ${skillNames().length} skills\n`);
}

if (require.main === module) main();

module.exports = { RULES, parseFrontmatter, allowedTools, CODEX_VISIBLE, DESCRIPTION_MAX };
