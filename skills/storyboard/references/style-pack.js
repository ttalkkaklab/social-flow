'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const DEFAULT_PACK = 'tactile-miniature-v1';
const ROLES = ['environment', 'character', 'interaction', 'transport', 'reported_story'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Resolve from the installed package, never from cwd, a developer's home or episode data.
function resolveStylePack({ id = DEFAULT_PACK, role = 'environment' } = {}) {
  if (id !== DEFAULT_PACK) throw new Error('Unknown bundled style pack: ' + id);
  if (!ROLES.includes(role)) throw new Error('Unknown style reference role: ' + role);
  const root = path.resolve(__dirname, '../assets/styles', id);
  const raw = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  const pack = JSON.parse(raw);
  const guidePath = path.join(root, 'STYLE.md');
  const guide = fs.readFileSync(guidePath, 'utf8');
  if (pack.id !== id || pack.version !== 1) throw new Error('Invalid bundled style manifest');
  const entries = pack.references.map(ref => {
    if (path.basename(ref.file) !== ref.file) throw new Error('Style reference must stay inside its pack');
    const file = path.join(root, ref.file);
    if (sha(fs.readFileSync(file)) !== ref.sha256) throw new Error('Style reference checksum mismatch: ' + ref.file);
    return { ...ref, path: file };
  });
  const selected = entries.filter(ref => ref.role === role);
  if (selected.length !== 1) throw new Error('Style role needs exactly one reference: ' + role);
  const digest = sha(raw + '\n' + guide);
  return { id, version: pack.version, role, digest, guidePath, rules: pack.rules,
    referenceImagePaths: selected.map(ref => ref.path),
    binding: { id, version: pack.version, role, digest,
      referenceFiles: selected.map(ref => 'skills/storyboard/assets/styles/' + id + '/' + ref.file) } };
}
module.exports = { DEFAULT_PACK, ROLES, resolveStylePack };
