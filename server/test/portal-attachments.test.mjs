import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { uploadAttachments, restoreAttachments, validateAttachmentPath } from '../dist/portal-attachments.js';

test('attachment round trip preserves duplicate paths, empty files, binary audio and rights; retry sends no blobs', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'attachments81-'));
  try {
    const source = path.join(root, 'source'), target = path.join(root, 'target');
    mkdirSync(path.join(source, '.work'), { recursive: true });
    mkdirSync(path.join(source, 'storyboard'), { recursive: true });
    const files = { '.work/slide.html': Buffer.from('<h1>한글</h1>'), 'storyboard/copy.html': Buffer.from('<h1>한글</h1>'), 'storyboard/audio.m4a': Buffer.from([0, 255, 4, 8]), 'empty.md': Buffer.alloc(0) };
    for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(source, name), bytes);
    const provenance = { tool: 'Suno', planAtGeneration: 'Basic', rightsAtGeneration: 'non-commercial' };
    writeFileSync(path.join(source, '.portal-attachments.json'), JSON.stringify({ 'storyboard/audio.m4a': { provenance } }));
    const saved = new Map(), blobs = new Map(); let sends = 0;
    const client = {
      getEpisode: async () => ({ data: { documents: [] } }),
      listAttachments: async () => ({ data: { items: [...saved.values()] } }),
      uploadAttachment: async (_id, relativePath, bytes, mime, provenance = {}) => {
        sends++;
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        blobs.set(sha256, Buffer.from(bytes));
        const item = { id: randomUUID(), relativePath, sha256, byteSize: bytes.length, mime, provenance };
        saved.set(relativePath, item);
        return { data: item };
      },
      downloadAttachment: async (_id, id) => { const item = [...saved.values()].find(item => item.id === id); return blobs.get(item.sha256); },
    };
    assert.equal((await uploadAttachments(client, 'ep', source)).uploaded, 4);
    assert.equal(blobs.size, 3);
    assert.equal((await uploadAttachments(client, 'ep', source)).unchanged, 4);
    assert.equal(sends, 4);
    assert.equal((await restoreAttachments(client, 'ep', target)).restored, 4);
    for (const [name, bytes] of Object.entries(files)) assert.deepEqual(readFileSync(path.join(target, name)), bytes);
    assert.deepEqual(JSON.parse(readFileSync(path.join(target, '.portal-attachments.json')))['storyboard/audio.m4a'].provenance, provenance);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects traversal, reserved state paths, symlink escapes and corrupt downloads before file writes', async () => {
  for (const name of ['../out', '/absolute', 'a\\b', 'a/../b', '.portal.json', 'storyboard/.portal-local/x', 'C:drive']) assert.throws(() => validateAttachmentPath(name));
  const root = mkdtempSync(path.join(tmpdir(), 'attachments81-'));
  try {
    const target = path.join(root, 'target'), outside = path.join(root, 'outside');
    mkdirSync(target); mkdirSync(outside); symlinkSync(outside, path.join(target, 'link'));
    const item = { id: randomUUID(), relativePath: 'link/x', sha256: 'a'.repeat(64), byteSize: 1 };
    let downloads = 0;
    const client = { getEpisode: async () => ({ data: { documents: [] } }), listAttachments: async () => ({ data: { items: [item] } }), downloadAttachment: async () => { downloads++; return Buffer.from('x'); } };
    await assert.rejects(restoreAttachments(client, 'ep', target), /Symlink/);
    assert.equal(downloads, 0);
    item.relativePath = 'safe.md';
    await assert.rejects(restoreAttachments(client, 'ep', target), /hash mismatch/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('canonical revision paths are excluded from upload and legacy restore including case aliases', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'attachments81-canonical-'));
  try {
    mkdirSync(path.join(root, 'storyboard'));
    const names = ['scenes.js', 'storyboard.md', 'research.md', 'script.md', 'storyboard.html', 'scenario.md', 'custom.md'];
    for (const name of names) writeFileSync(path.join(root, 'storyboard', name), 'revision-owned');
    let writes = 0;
    const client = {
      getEpisode: async () => ({ data: { documents: [{ filename: 'custom.md' }] } }),
      listAttachments: async () => ({ data: { items: [...names, 'SCENES.JS'].map(name => ({ relativePath: `storyboard/${name}`, byteSize: 1 })) } }),
      uploadAttachment: async () => { writes++; throw new Error('must not upload canonical'); },
      downloadAttachment: async () => { throw new Error('must not download canonical'); },
    };
    const result = await uploadAttachments(client, 'ep', root);
    assert.equal(result.complete, true);
    assert.equal(result.uploaded, 0);
    assert.equal(result.skipped.length, names.length);
    assert.equal(writes, 0);
    const restore = await restoreAttachments(client, 'ep', root);
    assert.equal(restore.restored, 0);
    assert.equal(restore.skipped.length, names.length + 1);
    for (const name of names) assert.equal(readFileSync(path.join(root, 'storyboard', name), 'utf8'), 'revision-owned');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
