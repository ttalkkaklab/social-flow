#!/usr/bin/env node
// Apply a reviewed local build only when every target still matches its prepared snapshot.
// Usage: --prepare BUILD TARGET... writes a plan; --apply PLAN installs it with backups.
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
const state = join(homedir(), '.local/state/social-flow-props');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = file => (lstatSync(file).mode & 0o777) + ':' + hash(readFileSync(file));
function inventory(root) {
  const result = {};
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      if (['node_modules', '.git', 'data'].includes(name) || name.startsWith('.env') || /\.(pem|key)$/.test(name)) continue;
      const rel = prefix + name, file = join(dir, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Refusing symbolic link: ' + file);
      if (stat.isDirectory()) walk(file, rel + '/');
      else if (stat.isFile()) result[rel] = fingerprint(file);
    }
  }
  walk(root); return result;
}
const [mode, input, ...paths] = process.argv.slice(2);
mkdirSync(state, { recursive: true });
if (mode === '--prepare') {
  if (!input || !paths.length) throw new Error('Supply a tested build and explicit existing targets.');
  const source = resolve(input), id = new Date().toISOString().replace(/[:.]/g, '-');
  const files = inventory(source);
  const targets = paths.map(path => {
    const target = resolve(path);
    if (!existsSync(target) || lstatSync(target).isSymbolicLink()) throw new Error('Target must be an existing directory: ' + target);
    return { target, before: inventory(target) };
  });
  const plan = join(state, 'plan-' + id + '.json');
  writeFileSync(plan, JSON.stringify({ id, source, files, targets }, null, 2), { flag: 'wx' });
  console.log(plan);
} else if (mode === '--apply') {
  const plan = JSON.parse(readFileSync(input, 'utf8'));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(inventory(plan.source), plan.files)) throw new Error('Build changed after preparation.');
  // Check every target before the first mutation; never silently overwrite another session.
  for (const item of plan.targets) if (!same(inventory(item.target), item.before)) throw new Error('Target changed: ' + item.target);
  const installations = [];
  for (const [i, item] of plan.targets.entries()) {
    const backup = join(state, 'backups', plan.id, String(i));
    cpSync(item.target, backup, { recursive: true, dereference: false });
    for (const [file, digest] of Object.entries(plan.files)) {
      if (item.before[file] === digest) continue;
      const dest = join(item.target, file);
      if (existsSync(dest) && fingerprint(dest) !== item.before[file]) throw new Error('Concurrent edit: ' + dest);
      mkdirSync(dirname(dest), { recursive: true });
      const tmp = dest + '.props-install-' + process.pid;
      try { writeFileSync(tmp, readFileSync(join(plan.source, file)), { flag: 'wx' }); chmodSync(tmp, lstatSync(join(plan.source, file)).mode & 0o777); renameSync(tmp, dest); }
      finally { if (existsSync(tmp)) unlinkSync(tmp); }
    }
    const actual = inventory(item.target);
    for (const [file, digest] of Object.entries(plan.files)) if (actual[file] !== digest) throw new Error('Installed hash mismatch: ' + file);
    installations.push({ target: item.target, backup, verifiedFiles: Object.keys(plan.files).length });
  }
  const report = { installedAt: new Date().toISOString(), source: plan.source, plan: resolve(input), installations };
  writeFileSync(join(state, 'latest-install.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} else throw new Error('Use --prepare BUILD TARGET... or --apply PLAN.');
