#!/usr/bin/env node
/** Scenario input contract, S1–S12. No production values are written.
 * node check-scenario.js <candidates/|scenario.md> [--json] | --selftest
 * Exit 0: no violations, 1: violations, 3: input error.
 * Frontmatter uses the documented YAML subset: scalar fields, anchors mapping,
 * numeric claims arrays, quoted/folded/literal strings. Unsupported syntax fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { IGNORANCE, section, rows, formatOf } = require('./check-research.js');
const ENGINES = ['curiosity', 'fear', 'intrigue', 'comedy'];
const ITEMS = ['주제', '훅', '전개 #1', '전개 #2', '전개 #3', '마무리', 'CTA'];
const BANDS = [null, 60, 130, 150, 150, 100, 40];
const text = v => typeof v === 'string' ? v.trim() : '';
const prose = s => String(s || '').replace(/<!--[^]*?-->/g, '').trim();
const compact = s => prose(s).replace(/\s+/g, ' ');

// A deliberately small YAML reader, independent of node_modules in marketplace installs.
// Never silently accept unknown mapping/list constructs or duplicate keys.
function parseScenario(src) {
  src = src.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = src.match(/^---\n([^]*?)\n---(?:\n|$)/);
  if (!match) return { meta: {}, body: src, errors: ['missing frontmatter'] };
  const lines = match[1].split('\n'), meta = Object.create(null), errors = [];
  function scalar(raw) {
    const s = raw.trim();
    if (s.startsWith('#')) return null;
    if (s.startsWith('"')) {
      const m = s.match(/^("(?:\\.|[^"\\])*")\s*(?:#.*)?$/);
      if (!m) throw Error('invalid quoted string');
      return JSON.parse(m[1]);
    }
    if (s.startsWith("'")) {
      const m = s.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/);
      if (!m) throw Error('invalid quoted string');
      return m[1].replace(/''/g, "'");
    }
    const plain = s.replace(/\s+#.*$/, '').trim();
    if (/^\[/.test(plain)) {
      if (!/^\[\s*(?:\d+(?:\s*,\s*\d+)*)?\s*\]$/.test(plain)) throw Error('claims must be a numeric array');
      return JSON.parse(plain);
    }
    if (/^[{&*!|>]/.test(plain)) throw Error('unsupported YAML value');
    if (!plain || /^(null|~)$/.test(plain)) return null;
    if (/^-?\d+(?:\.\d+)?$/.test(plain)) return Number(plain);
    return plain;
  }
  let anchors = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim() || /^\s*#/.test(lines[i])) continue;
    const m = lines[i].match(/^( *)([a-z][a-z0-9_]*):(?:\s+(.*)|\s*)$/);
    if (!m || (m[1].length && (!anchors || m[1].length !== 2))) {
      errors.push('unsupported frontmatter line ' + (i + 1)); continue;
    }
    const nested = !!m[1].length, key = m[2], raw = m[3] || '';
    if (!nested) anchors = key === 'anchors';
    const dest = nested ? meta.anchors : meta;
    if (!dest || typeof dest !== 'object' || Array.isArray(dest)) { errors.push('anchors must be a mapping'); continue; }
    if (Object.hasOwn(dest, key)) { errors.push('duplicate field ' + key); continue; }
    if (key === 'anchors' && !nested && !raw.replace(/#.*$/, '').trim()) {
      meta.anchors = Object.create(null); continue;
    }
    try {
      const continuation = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) &&
             !/^\s+[a-z][a-z0-9_]*:/.test(lines[i + 1])) continuation.push(lines[++i].trim());
      if (/^[|>]-?\s*(?:#.*)?$/.test(raw)) {
        dest[key] = continuation.join(raw[0] === '>' ? ' ' : '\n');
      } else dest[key] = scalar([raw, ...continuation].join(' '));
    } catch (e) { errors.push(key + ': ' + e.message); }
  }
  return { meta, body: src.slice(match[0].length), errors };
}
function sections(body) {
  const clean = prose(body), matches = [...clean.matchAll(/^##\s+(.+)$/gm)];
  return matches.map((m, i) => ({ header: m[1].trim(), body: clean.slice(m.index + m[0].length,
    i + 1 < matches.length ? matches[i + 1].index : clean.length).trim() }));
}
function researchAt(file) {
  const dir = path.dirname(file);
  return [path.join(dir, 'research.md'), path.join(dir, '..', 'research.md')].find(p => fs.existsSync(p));
}
function researchData(src) {
  const number = s => Number(String(s).replace(/[^\d]/g, ''));
  const table = re => rows(section(src, re));
  const messages = new Map(table(/^##\s+(?:\d+[.)]\s*)?(?:Messages?\b|메시지)/i).map(r =>
    ['M' + number(r[0]), String(r[/^\**\s*W\s*\d+\s*\**$/i.test(r[1]) ? 2 : 1] || '').trim()]));
  const wows = new Set(table(/^##\s+(?:\d+[.)]\s*)?(?:Wows?\b|와우)/i).map(r => 'W' + number(r[0])));
  const claims = new Set(table(/^##\s+(?:\d+[.)]\s*)?(?:[\w가-힣]{1,8}\s)?(?:Verified|검증\s*(?:표|통과))/i)
    .filter(r => /^\**\s*★?\s*\d+\s*★?\s*\**$/.test(r[0])).map(r => number(r[0])));
  const chosen = [...src.matchAll(/(?:Chosen|선택|채택)\s*:\s*\**\s*(D[1-3])\b/gi)].map(m => m[1].toUpperCase());
  return { messages, wows, claims, chosen };
}
function analyse(src, research, opts = {}) {
  const { meta: m, body, errors } = parseScenario(src), findings = [];
  const add = (rule, what, level = 'bad') => findings.push({ level, where: opts.where || 'scenario', what: rule + ' ' + what });
  errors.forEach(e => add('S1', e));
  const required = ['channel','topic','direction','message','wow','wow_type','wow_belief','wow_truth','wow_lands',
    'engine_primary','engine_secondary','reveal','structure','arc','anchors','claims','score','p0','round','frozen'];
  required.forEach(k => {
    if (!Object.hasOwn(m, k)) add('S1', 'missing ' + k);
    else if (!['score','p0','frozen','round','anchors','claims'].includes(k) && !text(m[k])) add('S1', k + ' must be a nonempty string');
  });
  const enums = { direction:['D1','D2','D3'], message:['M1','M2','M3'], wow_type:['반전','숫자','숨은 원인','정체','규모','내 일'],
    wow_lands:ITEMS.slice(2,5), engine_primary:ENGINES, engine_secondary:[...ENGINES,'none'], reveal:['held','spoiler'] };
  Object.entries(enums).forEach(([k, values]) => { if (!values.includes(m[k])) add('S1', k + ' must be ' + values.join('|')); });
  if (!/^W[1-9]\d*$/.test(m.wow || '')) add('S1', 'wow must be W#');
  if (!Number.isInteger(m.round) || m.round < 0) add('S1', 'round must be a nonnegative integer');
  ['score','p0'].forEach(k => { if (m[k] != null && (!Number.isInteger(m[k]) || m[k] < 0 || (k === 'score' && m[k] > 100))) add('S1', k + ' must be empty or a valid nonnegative integer'); });
  const anchors = m.anchors && typeof m.anchors === 'object' && !Array.isArray(m.anchors) ? m.anchors : {};
  ['hook_first','closing_line','forwardable','cta'].forEach(k => { if (!text(anchors[k])) add('S1', 'anchors.' + k + ' must be a nonempty string'); });
  const claims = Array.isArray(m.claims) ? m.claims : [];
  if (!claims.length || claims.some(n => !Number.isInteger(n) || n <= 0)) add('S1', 'claims must be a nonempty array of positive integers');
  if (!research) add('S2', 'research.md not found beside the file or in its parent');
  const r = researchData(research || '');
  if (!r.messages.has(m.message)) add('S2', 'message not found in research: ' + m.message);
  if (!r.wows.has(m.wow)) add('S2', 'wow not found in research: ' + m.wow);
  claims.forEach(n => { if (!r.claims.has(n)) add('S2', 'claim #' + n + ' not found in Verified'); });
  const message = body.match(/^(?:\*\*Message\.\*\*\s*|Message\s*:\s*|메시지\s*:\s*)(.+)$/mi);
  if (!message || message[1].trim() !== r.messages.get(m.message)) add('S2', 'Message line must match research ' + m.message + ' verbatim');
  const truthRefs = [...text(m.wow_truth).matchAll(/#(\d+)/g)].map(x => Number(x[1]));
  if (!text(m.wow_belief) || !text(m.wow_truth) || !truthRefs.length || truthRefs.some(n => !claims.includes(n) || !r.claims.has(n)) || IGNORANCE.test(text(m.wow_truth)))
    add('S3', 'belief and truth required; truth must cite a declared Verified claim and not end on ignorance');
  const parts = sections(body);
  const expected = ['^주제$', ...ITEMS.slice(1).map(s => '^' + s + ' — feel ([+−-]?[0-3]) · (\\S.*)$')];
  if (parts.length !== 7 || expected.some((re, i) => !new RegExp(re).test(parts[i]?.header || '')))
    add('S4', 'exactly seven fixed headings in order, with six feel signs (−3..+3) and feelings, required');
  // Name lookup also measures legacy pages without their feel suffix; it never clears S4.
  const item = name => parts.find(p => p.header === name || p.header.startsWith(name + ' — feel '))?.body || '';
  const feels = ITEMS.slice(1).map(name => {
    const p = parts.find(p => p.header.startsWith(name + ' — feel '));
    const f = p?.header.match(/ — feel ([+−-]?[0-3]) · \S/);
    return f ? Number(f[1].replace('−','-')) : NaN;
  });
  const landing = ITEMS.indexOf(m.wow_lands) - 1;
  if (feels.some(n => !Number.isFinite(n))) add('S5', 'six feel signs could not be read', 'warn');
  else {
    const max = Math.max(...feels), min = Math.min(...feels);
    if (landing < 1 || !feels.slice(0, landing).includes(min) || feels[landing] !== max || feels[4] < max - 1)
      add('S5', 'minimum must precede landing, maximum must be at landing, closing must hold maximum −1 or higher', 'warn');
    if (feels.every((n, i) => i === 0 || n >= feels[i-1])) add('S5', 'monotone rising feel curve', 'warn');
  }
  const words = s => new Set((s.replace(/\(?#\d+\)?/g, '').match(/[\p{L}\p{N}]+/gu) || []));
  const truthWords = words(text(m.wow_truth)), hookWords = words(item('훅'));
  if (m.reveal === 'held' && truthWords.size && [...truthWords].filter(w => hookWords.has(w)).length / truthWords.size >= .6)
    add('S6', 'held hook overlaps 60% or more of truth tokens');
  if (!prose(item(m.wow_lands))) add('S6', 'landing must have a nonempty final sentence');
  if (m.engine_primary === m.engine_secondary) add('S7', 'primary and secondary engines must differ');
  if (IGNORANCE.test(item('주제'))) add('S8', 'topic ends on ignorance');
  [['hook_first','훅'],['closing_line','마무리'],['forwardable','마무리'],['cta','CTA']].forEach(([key,name]) => {
    if (!text(anchors[key]) || !compact(item(name)).includes(compact(anchors[key]))) add('S9', key + ' must occur verbatim in ' + name);
  });
  if (anchors.cta === '없음' && !compact(item('CTA')).replace(/^없음[\s.。:—–-]*/, '').length) add('S9', 'CTA 없음 needs a reason');
  const bodyOnly = prose(body);
  if (/(?:샷|shot|scene)\s*#?\s*\d+|카메라|camera|프롬프트|\bprompt\b|\d+(?:\.\d+)?\s*(?:초|seconds?\b|sec\b)|\b\d+(?:\.\d+)?s\b|글자\s*수|character\s*count|\d+\s*(?:자|chars?\b)/i.test(bodyOnly))
    add('S10', 'shot numbers, cameras, prompts, timing and character counts belong on the board');
  if (/구독|좋아요|\bsubscribe\b|\blike\b/i.test(item('CTA'))) add('S11', 'CTA must not ask for subscriptions or likes');
  if (!opts.long) ITEMS.slice(1).forEach((name, i) => {
    const length = [...compact(item(name))].length, limit = BANDS[i + 1];
    if (length > limit) add('S12', name + ': ' + length + ' characters exceeds short band ' + limit, 'warn');
  });
  if (opts.chosen) {
    if (r.chosen.length !== 1 || r.chosen[0] !== m.direction) add('S12', 'scenario direction must equal research Chosen: D#');
    if (opts.hasScenes && !text(m.frozen)) add('S12', 'scenario.md beside scenes.js requires frozen stamp');
  }
  return { meta:m, findings };
}
function checkPath(target) {
  if (!fs.existsSync(target)) throw Error('path not found: ' + target);
  const directory = fs.statSync(target).isDirectory();
  const files = directory ? ['d1.md','d2.md','d3.md'].map(f => path.join(target, f)) : [target];
  const findings = [], engines = [], directions = [];
  for (const file of files) {
    if (!fs.existsSync(file)) { findings.push({level:'bad', where:file, what:'S7 missing candidate'}); continue; }
    const research = researchAt(file), dir = research ? path.dirname(research) : path.dirname(file);
    const fmt = formatOf(dir);
    const src = fs.readFileSync(file, 'utf8'), m = parseScenario(src).meta;
    const result = analyse(src, research ? fs.readFileSync(research, 'utf8') : null, {
      where:file, long:fmt ? fmt.format === 'youtube-long-16x9' : ['answer-first','story'].includes(m.arc),
      chosen:path.basename(file) === 'scenario.md', hasScenes:fs.existsSync(path.join(path.dirname(file), 'scenes.js'))
    });
    findings.push(...result.findings); engines.push(result.meta.engine_primary); directions.push(result.meta.direction);
  }
  if (directory && (new Set(engines).size !== 3 || !engines.every(e => ENGINES.includes(e)))) findings.push({level:'bad',where:target,what:'S7 d1–d3 require three different primary engines'});
  if (directory && directions.some((d,i) => d !== 'D' + (i+1))) findings.push({level:'bad',where:target,what:'S7 d1–d3 must carry D1–D3 respectively'});
  return { files, violations:findings.filter(f => f.level === 'bad').length, warnings:findings.filter(f => f.level === 'warn').length, findings };
}

// S13 starts as warnings; promotion to P0 requires an explicit policy change.
// The board remains the production source of truth. Legacy pages without anchors skip.
function checkAnchors(win, scenario) {
  const parsed = parseScenario(scenario), m = parsed.meta;
  if (!m.anchors) return [];
  const out = [], warn = what => out.push({level:'warn',where:'scenario',what:'S13 ' + what});
  if (parsed.errors.length) warn('invalid scenario frontmatter: ' + parsed.errors.join('; '));
  const a = m.anchors, scenes = (win.SCENES || []).filter(s => s.type !== 'outro');
  const spoken = s => (s?.narration || []).map(n => text(n.sub || n.tts)).filter(Boolean);
  const cover = scenes.find(s => s.type === 'cover');
  const first = spoken(cover)[0] || '';
  const last = [...scenes].reverse().find(s => spoken(s).length);
  if (!text(a.hook_first) || first !== a.hook_first) warn('cover first narration sentence differs from anchors.hook_first');
  if (!text(a.closing_line) || !spoken(last).join(' ').includes(a.closing_line)) warn('last narrated shot does not contain anchors.closing_line');
  if (!text(a.forwardable) || last?.shot?.share !== a.forwardable) warn('last narrated shot.share differs from anchors.forwardable');
  if (!['held','spoiler'].includes(m.reveal) || (cover?.hookType === 'spoiler') !== (m.reveal === 'spoiler')) warn('cover hookType spoiler and scenario reveal disagree');
  return out;
}
function selftest() {
  const assert = require('assert/strict');
  const fixture = path.join(__dirname, 'fixtures/scenario');
  assert.equal(checkPath(path.join(fixture,'pass/candidates')).violations, 0);
  assert.equal(checkPath(path.join(fixture,'pass/scenario.md')).violations, 0);
  const bad = checkPath(path.join(fixture,'fail/candidates'));
  assert(bad.violations > 0);
  assert(checkPath(path.join(fixture,'fail/scenario.md')).violations > 0);
  const src = fs.readFileSync(path.join(fixture,'pass/candidates/d1.md'),'utf8');
  const research = fs.readFileSync(path.join(fixture,'pass/research.md'),'utf8');
  const has = (s, rule, opts) => analyse(s,research,opts).findings.some(f => f.what.startsWith(rule + ' '));
  assert(has(src.replace('wow_type: 반전','wow_type: wrong'),'S1'));
  assert(has(src.replace('message: M1','message: M9'),'S2'));
  assert(has(src.replace('(#1)',''),'S3'));
  assert(has(src.replace('## CTA','## 다른 항목'),'S4'));
  assert(has(src.replace('feel +3','feel -3'),'S5'));
  assert(has(src.replaceAll('무엇이 바뀔까요?', '힘을 만드는 장치는 없다 힘과 회전수를 맞바꿀 뿐 (#1).'),'S6'));
  assert(has(src.replace('engine_secondary: none','engine_secondary: curiosity'),'S7'));
  assert(has(src.replace('왜 속도가 달라질까?', '정체는 알 수 없다.'),'S8'));
  assert(has(src.replace('  closing_line: "힘을 쓸 곳을 고른다."','  closing_line: "다른 문장"'),'S9'));
  assert(has(src + '\n카메라 프롬프트 샷 3','S10'));
  assert(has(src + '\n구독해 주세요.','S11'));
  assert(has(src + '\n' + '가'.repeat(100),'S12'));
  assert(!has(src + '\n' + '가'.repeat(100),'S12',{long:true}));
  assert(has(src,'S12',{chosen:true,hasScenes:true}));
  assert(has(src.replace('frozen:\n','frozen: # stamped later\n'),'S12',{chosen:true,hasScenes:true}));
  assert.equal(parseScenario(src.replace('wow_type: 반전','wow_type: 반전\nwow_type: 숫자')).errors.length,1);
  const m = parseScenario(src).meta;
  const win = {SCENES:[{type:'cover',hookType:'curiosity',narration:[{sub:m.anchors.hook_first}]},
    {type:'points',narration:[{sub:m.anchors.closing_line}],shot:{share:m.anchors.forwardable}}, {type:'outro'}]};
  assert.equal(checkAnchors(win,src).length,0);
  assert.equal(checkAnchors({SCENES:[]},src).length,3);
  assert.equal(checkAnchors(win,'legacy scenario').length,0);
  assert.equal(checkAnchors(win,src.replace('reveal: held','reveal: spoiler')).length,1);
  const edited = structuredClone(win);
  edited.SCENES[0].narration[0].sub = 'changed';
  assert.equal(checkAnchors(edited,src).length,1);
  edited.SCENES[0].narration[0] = {tts:m.anchors.hook_first};
  assert.equal(checkAnchors(edited,src).length,0);
  edited.SCENES[1].shot.share = 'changed';
  assert.equal(checkAnchors(edited,src).length,1);
  edited.SCENES[1].shot.share = m.anchors.forwardable;
  edited.SCENES[1].narration[0].sub = 'changed';
  assert.equal(checkAnchors(edited,src).length,1);
  assert(has(src.replace('## 주제','카메라 이동\n## 주제'),'S10'));
  assert(has(src.replace('  cta: 없음','  cta: ""'),'S1'));
  assert.equal(parseScenario('---\nanchors: invalid\n  cta: 없음\n---\n').errors.length,1);
  assert.equal(parseScenario('---\nwow_truth: >\n  첫 줄\n  다음 줄 (#1)\n---\n').meta.wow_truth,'첫 줄 다음 줄 (#1)');
  assert.equal(parseScenario('---\nwow_truth: "첫 줄\n  다음 줄 (#1)"\n---\n').meta.wow_truth,'첫 줄 다음 줄 (#1)');
  assert.equal(parseScenario("---\nwow_lands: '전개 #2' # comment\n---\n").meta.wow_lands,'전개 #2');
  const {spawnSync} = require('child_process');
  for (const [name, status] of [['pass',0],['fail',1]]) {
    const run = spawnSync(process.execPath,[__filename,path.join(fixture,name,'candidates'),'--json'],{encoding:'utf8'});
    assert.equal(run.status,status);
    const json = JSON.parse(run.stdout);
    assert.equal(json.files.length,3);
    assert.equal(json.violations,json.findings.filter(f => f.level === 'bad').length);
  }
  assert.equal(spawnSync(process.execPath,[__filename,path.join(fixture,'missing'),'--json']).status,3);
  process.stdout.write('check-scenario selftest: pass (fixtures, S1–S13, legacy skip, long-form bands)\n');
}
function main() {
  const argv = process.argv.slice(2);
  try {
    if (argv.includes('--selftest')) return selftest();
    const targets = argv.filter(a => !a.startsWith('--'));
    if (targets.length !== 1 || argv.some(a => a.startsWith('--') && a !== '--json')) throw Error('usage: check-scenario.js <candidates/|scenario.md> [--json] | --selftest');
    const result = checkPath(targets[0]);
    if (argv.includes('--json')) process.stdout.write(JSON.stringify(result,null,2) + '\n');
    else {
      process.stdout.write('scenario contract — ' + result.files.length + ' file(s)\n');
      result.findings.forEach(f => process.stdout.write('  ' + (f.level === 'bad' ? '!' : '·') + ' ' + f.where + ' ' + f.what + '\n'));
      process.stdout.write(result.violations + ' violation(s), ' + result.warnings + ' to look at.\n');
    }
    process.exitCode = result.violations ? 1 : 0;
  } catch (e) { process.stderr.write('check-scenario: ' + e.message + '\n'); process.exitCode = 3; }
}
module.exports = { parseScenario, analyse, checkPath, checkAnchors, sections, BANDS };
if (require.main === module) main();
