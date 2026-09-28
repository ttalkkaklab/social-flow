import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { channelSync } from '../dist/portal-channel-sync.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function fakeClient() {
  let profile = null;
  const files = new Map();
  const client = {
    workspace: 'lab',
    async requestRaw(request) {
      const url = new URL(`https://portal.test${request.path}`);
      if (request.method === 'GET' && url.pathname === '/projects') return { status: 200, data: [{ id: PROJECT_ID, name: 'sample' }] };
      if (request.method === 'GET' && url.pathname === `/projects/${PROJECT_ID}`) return { status: 200, data: { id: PROJECT_ID, name: 'sample' } };
      if (url.pathname === `/projects/${PROJECT_ID}/profile`) {
        if (request.method === 'GET') {
          if (!profile) { const error = new Error('not found'); error.status = 404; throw error; }
          return { status: 200, data: profile };
        }
        const body = request.body;
        if (profile && body.baseSha256 !== profile.sha256) { const error = new Error('profile conflict'); error.status = 409; throw error; }
        profile = { content: body.content, sha256: body.sha256 };
        return { status: 200, data: profile };
      }
      if (url.pathname === `/projects/${PROJECT_ID}/attachments`) {
        if (request.method === 'GET') return { status: 200, data: { items: [...files.values()].map(({ bytes, ...item }) => item) } };
        const relativePath = url.searchParams.get('path');
        const existing = [...files.values()].find((item) => item.relativePath === relativePath);
        if (existing && url.searchParams.get('baseSha256') !== existing.sha256) throw new Error('attachment conflict');
        const bytes = Buffer.from(request.body);
        const item = { id: existing?.id ?? randomUUID(), relativePath, sha256: digest(bytes), byteSize: bytes.length, mime: request.contentType, provenance: {}, bytes };
        files.set(item.id, item);
        return { status: existing ? 200 : 201, data: item };
      }
      const attachment = [...files.values()].find((item) => url.pathname === `/projects/${PROJECT_ID}/attachments/${item.id}`);
      if (attachment && request.method === 'GET') {
        writeFileSync(request.targetFile, attachment.bytes, { flag: 'wx' });
        return { status: 200, data: { targetFile: request.targetFile, byteSize: attachment.byteSize } };
      }
      if (attachment && request.method === 'DELETE') {
        if (url.searchParams.get('sha256') !== attachment.sha256) throw new Error('delete conflict');
        files.delete(attachment.id);
        return { status: 200, data: { id: attachment.id } };
      }
      throw new Error(`unexpected ${request.method} ${request.path}`);
    },
  };
  return { client, files, get profile() { return profile; }, set profile(value) { profile = value; } };
}

test('push, unchanged retry and blank-root pull preserve profile and shared asset hashes', async () => {
  const previous = process.cwd();
  const source = mkdtempSync(path.join(tmpdir(), 'channel-sync-source-'));
  const target = mkdtempSync(path.join(tmpdir(), 'channel-sync-target-'));
  const remote = fakeClient();
  try {
    process.chdir(source);
    mkdirSync('data/sample/assets/outro', { recursive: true });
    writeFileSync('data/sample/profile.md', '# sample\n');
    writeFileSync('data/sample/assets/outro/end.mp4', Buffer.from([0, 1, 2, 3]));
    const first = await channelSync(remote.client, { action: 'push', channel: 'sample' });
    assert.equal(first.uploaded, 1);
    const second = await channelSync(remote.client, { action: 'push', channel: 'sample' });
    assert.equal(second.unchanged, 1);

    process.chdir(target);
    const pulled = await channelSync(remote.client, { action: 'pull', channel: 'sample', projectId: PROJECT_ID });
    assert.equal(pulled.pulled, 1);
    assert.equal(readFileSync('data/sample/profile.md', 'utf8'), '# sample\n');
    assert.deepEqual(readFileSync('data/sample/assets/outro/end.mp4'), Buffer.from([0, 1, 2, 3]));
    const state = JSON.parse(readFileSync('data/sample/.portal-channel.json', 'utf8'));
    assert.equal(state.workspace, 'lab'); assert.equal(state.projectId, PROJECT_ID);
  } finally { process.chdir(previous); rmSync(source, { recursive: true, force: true }); rmSync(target, { recursive: true, force: true }); }
});

test('a later attachment conflict is detected before an earlier profile write', async () => {
  const previous = process.cwd();
  const root = mkdtempSync(path.join(tmpdir(), 'channel-sync-preflight-'));
  const remote = fakeClient();
  try {
    process.chdir(root);
    mkdirSync('data/sample/assets/branding', { recursive: true });
    writeFileSync('data/sample/profile.md', '# base\n');
    writeFileSync('data/sample/assets/branding/logo.png', Buffer.from('base'));
    await channelSync(remote.client, { action: 'push', channel: 'sample' });
    const logo = [...remote.files.values()][0];
    const elsewhere = Buffer.from('remote edit');
    remote.files.set(logo.id, { ...logo, bytes: elsewhere, sha256: digest(elsewhere), byteSize: elsewhere.length });
    writeFileSync('data/sample/profile.md', '# local edit\n');
    writeFileSync('data/sample/assets/branding/logo.png', Buffer.from('local edit'));
    await assert.rejects(channelSync(remote.client, { action: 'push', channel: 'sample' }), /attachment conflict/);
    assert.equal(remote.profile.content, '# base\n');
  } finally { process.chdir(previous); rmSync(root, { recursive: true, force: true }); }
});

test('push refuses to overwrite a remote addition that is absent from the local base', async () => {
  const previous = process.cwd();
  const root = mkdtempSync(path.join(tmpdir(), 'channel-sync-remote-addition-'));
  const remote = fakeClient();
  try {
    process.chdir(root);
    mkdirSync('data/sample/assets/sfx', { recursive: true });
    writeFileSync('data/sample/profile.md', '# sample\n');
    await channelSync(remote.client, { action: 'push', channel: 'sample' });

    const remoteBytes = Buffer.from('device B');
    const remoteItem = {
      id: randomUUID(), relativePath: 'assets/sfx/ding.wav', sha256: digest(remoteBytes),
      byteSize: remoteBytes.length, mime: 'audio/wav', provenance: {}, bytes: remoteBytes,
    };
    remote.files.set(remoteItem.id, remoteItem);
    writeFileSync('data/sample/assets/sfx/ding.wav', Buffer.from('device A'));

    await assert.rejects(channelSync(remote.client, { action: 'push', channel: 'sample' }), /attachment conflict/);
    assert.equal(remote.files.get(remoteItem.id).sha256, digest(remoteBytes));
    assert.deepEqual(remote.files.get(remoteItem.id).bytes, remoteBytes);
  } finally { process.chdir(previous); rmSync(root, { recursive: true, force: true }); }
});

test('push refuses two-sided changes and never deletes a remote file without the matching base hash', async () => {
  const previous = process.cwd();
  const root = mkdtempSync(path.join(tmpdir(), 'channel-sync-conflict-'));
  const remote = fakeClient();
  try {
    process.chdir(root);
    mkdirSync('data/sample/assets/branding', { recursive: true });
    writeFileSync('data/sample/profile.md', '# one\n');
    writeFileSync('data/sample/assets/branding/logo.png', Buffer.from('one'));
    writeFileSync('data/sample/assets/branding/remove.png', Buffer.from('remove'));
    await channelSync(remote.client, { action: 'push', channel: 'sample' });

    const logo = [...remote.files.values()].find((item) => item.relativePath === 'assets/branding/logo.png');
    const changed = Buffer.from('changed elsewhere');
    remote.files.set(logo.id, { ...logo, bytes: changed, sha256: digest(changed), byteSize: changed.length });
    rmSync('data/sample/assets/branding/logo.png');
    rmSync('data/sample/assets/branding/remove.png');

    const remoteOnly = Buffer.from('remote-only');
    const remoteOnlyItem = { id: randomUUID(), relativePath: 'assets/sfx/new.wav', sha256: digest(remoteOnly), byteSize: remoteOnly.length, mime: 'audio/wav', provenance: {}, bytes: remoteOnly };
    remote.files.set(remoteOnlyItem.id, remoteOnlyItem);
    writeFileSync('data/sample/profile.md', '# local two\n');
    remote.profile = { content: '# remote two\n', sha256: digest('# remote two\n') };
    await assert.rejects(channelSync(remote.client, { action: 'push', channel: 'sample' }), /profile conflict/);
    assert.equal(remote.files.has(remoteOnlyItem.id), true);

    remote.profile = { content: '# one\n', sha256: digest('# one\n') };
    const pushed = await channelSync(remote.client, { action: 'push', channel: 'sample' });
    assert.equal(remote.files.has(remoteOnlyItem.id), true, 'remote additions without a base are preserved');
    assert.equal(remote.files.has(logo.id), true, 'a remotely changed file is not deleted');
    assert.equal(pushed.deleted, 1, 'an absent file is deleted only when its remote hash still matches the base');
    assert.equal(pushed.preserved, 2);
    assert.equal(existsSync('data/sample/.portal-channel.json'), true);
  } finally { process.chdir(previous); rmSync(root, { recursive: true, force: true }); }
});
