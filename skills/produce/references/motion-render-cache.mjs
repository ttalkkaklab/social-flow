// Optional reuse metadata extends render-proof.json; the source proof remains authoritative.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const proof = createRequire(import.meta.url)('./slide-render-proof.js');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export function runtimeInputs(root) {
  const files = {};
  const walk = dir => { for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:js|mjs|cjs|json|sh)$/.test(entry.name)) files[file] = hash(file);
  }};
  walk(root);
  return files;
}
export function dependencyTracker() {
  const files = {};
  let reason = null;
  return {
    files,
    get reason() { return reason; },
    observe(url) {
      try {
        if (url.startsWith('file:')) {
          const file = fileURLToPath(new URL(url));
          const digest = hash(file);
          if (files[file] && files[file] !== digest) reason = 'dependency changed during capture';
          files[file] = digest;
        } else if (!/^(?:data:|about:blank$)/.test(url)) reason = 'non-local resource: ' + url.split('?')[0];
      } catch { reason = 'unreadable dependency'; }
    },
  };
}
const matches = files => files && Object.entries(files).every(([file, digest]) => fs.existsSync(file) && hash(file) === digest);
export function readCachedRender({html, out, key, dependencies}) {
  try {
    if (dependencies.reason) return null;
    const record = JSON.parse(fs.readFileSync(path.join(out, 'render-proof.json'), 'utf8'));
    const cache = record.cache;
    if (!cache || cache.version !== 1 || stable(cache.key) !== stable(key) || !matches(cache.dependencies)
      || !matches(cache.artifacts)) return null;
    // Newly loaded resources must also occur in the earlier capture's dependency list.
    if (Object.entries(dependencies.files).some(([file, digest]) => cache.dependencies[file] !== digest)) return null;
    if (!record.outputs?.length) return null;
    for (const output of record.outputs) proof.verifyClip(path.join(out, output.file), html, output.group);
    return JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  } catch { return null; }
}
export function writeRenderCache({out, key, dependencies, artifacts}) {
  if (dependencies.reason || !matches(dependencies.files)) return false;
  const file = path.join(out, 'render-proof.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.cache = {version:1, key, dependencies:dependencies.files,
    artifacts:Object.fromEntries(artifacts.map(file => [file, hash(file)]))};
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  return true;
}
