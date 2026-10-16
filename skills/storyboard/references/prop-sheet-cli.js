#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const api = require('./prop-continuity.js');

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function run(argv) {
  const [target, ...args] = argv;
  if (!target) throw new Error('Usage: prop-sheet-cli.js <storyboard directory|scenes.js> [--apply sheet.json --expected-sha256 HASH] [--shot N] [--at DAY:ORDER] [--character ID]');
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--apply', '--expected-sha256', '--shot', '--at', '--character'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw new Error('Invalid or duplicate option: ' + args[i]);
    values[args[i]] = args[i + 1];
  }
  const file = path.resolve(path.basename(target) === 'scenes.js' ? target : path.join(target, 'scenes.js'));
  const source = fs.readFileSync(file, 'utf8'), sha256 = hash(source);
  const win = evaluateWindowScript(source, { filename: file });
  if (!Array.isArray(win.SCENES)) throw new Error('Missing SCENES');
  if (values['--apply']) {
    if (values['--expected-sha256'] !== sha256) throw new Error('head_moved: read the board and reconcile before applying');
    const sheet = JSON.parse(fs.readFileSync(values['--apply'], 'utf8'));
    if (!sheet || !Array.isArray(sheet.props) || Object.keys(sheet).some(k => !['props', 'continuity'].includes(k))) throw new Error('Edit file requires props[] and optional continuity');
    const previous = win.SB_DOC || {};
    win.SB_DOC = { ...previous, props: sheet.props, propContinuity: sheet.continuity };
    const findings = api.check(win);
    if (findings.some(f => f.level === 'bad')) throw new Error(JSON.stringify(findings));
    const lock = file + '.props.lock', tmp = file + '.' + process.pid + '.tmp';
    const fd = fs.openSync(lock, 'wx');
    try {
      if (hash(fs.readFileSync(file)) !== sha256) throw new Error('head_moved: the board changed');
      const history = path.join(path.dirname(file), '.prop-history'); fs.mkdirSync(history, { recursive: true });
      const backup = path.join(history, sha256 + '.js');
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, source, { flag: 'wx' });
      const header = source.match(/^(?:\s*\/\/[^\n]*\n)*/)?.[0] || '';
      const clean = header.split('\n').filter(line => !/^\s*\/\/\s*approved:/.test(line)).join('\n');
      const serialized = clean + '\n' + Object.keys(win).map(k => {
        if (!/^[A-Z][A-Z0-9_]*$/.test(k)) throw new Error('Invalid board global: ' + k);
        return 'window.' + k + ' = ' + JSON.stringify(win[k], null, 2) + ';';
      }).join('\n') + '\n';
      fs.writeFileSync(tmp, serialized); fs.renameSync(tmp, file);
      return { written: true, sha256: hash(serialized), backup, findings };
    } finally {
      fs.closeSync(fd); fs.unlinkSync(lock); if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  const findings = api.check(win);
  if (findings.some(f => f.level === 'bad')) return { sha256, findings };
  if (values['--shot']) {
    const n = Number(values['--shot']);
    if (!Number.isInteger(n) || n < 1 || n > win.SCENES.length) throw new Error('Invalid shot number');
    return { sha256, findings, snapshot: api.snapshot(win, n - 1), prompt: api.prompt(win, n - 1) };
  }
  const doc = win.SB_DOC || {};
  if (values['--at']) {
    if (!/^\d+:\d+$/.test(values['--at'])) throw new Error('Story point must be DAY:ORDER');
    const [day, order] = values['--at'].split(':').map(Number);
    const states = (doc.props || []).map(p => ({ propId: p.id, state: api.stateAt(win, p.id, { day, order }) }));
    return { sha256, findings, at: { day, order }, states: states.filter(p => !values['--character'] ||
      p.state.ownerId === values['--character'] || p.state.holderId === values['--character']) };
  }
  return { sha256, findings, sheet: { props: doc.props || [], continuity: doc.propContinuity } };
}
if (require.main === module) {
  try { const result = run(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2)); if (result.findings?.some(f => f.level === 'bad')) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { run };
