/**
 * portal_assets_search · portal_assets_get — the global asset library (#87) on a scripted fetch.
 * The query string the search sends, the summary it returns, get with and without download,
 * the sha256 check on a downloaded file, the same-file skip, the refuse-to-overwrite, and the
 * one-line answer without a key. No network.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const tokenDir = mkdtempSync(join(tmpdir(), 'sf-assets-tokens-'));
process.env.SNS_TOKEN_DIR = tokenDir;
for (const k of ['TTALKKAKSTORY_API_URL', 'TTALKKAKSTORY_WORKSPACE', 'TTALKKAKSTORY_API_KEY', 'TTALKKAKSTORY_HOLDER']) delete process.env[k];

const portal = await import('../dist/portal-tools.js');
const assets = await import('../dist/portal-assets.js');
const { TOOLS } = await import('../dist/tools.js');
const { ROUTES } = await import('../dist/handlers.js');
const { checkLicense } = createRequire(import.meta.url)(path.resolve(import.meta.dirname, '../../skills/storyboard/references/render-routing.js'));

const KEY = 'tks_0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
const ROOT = mkdtempSync(join(tmpdir(), 'sf-assets-data-'));
const EPISODE = join(ROOT, 'data', 'lab', 'episodes', 'ep-one');
const VIDEO_ID = '44444444-4444-4444-8444-444444444444';
const MUSIC_ID = '55555555-5555-4555-8555-555555555555';
const VIDEO = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(3000, 7)]);
const sha = (b) => createHash('sha256').update(b).digest('hex');

const video = { id: VIDEO_ID, sha256: sha(VIDEO), sourceId: 'gv-2026-0912-0007', type: 'video', category: 'city-night', categoryKo: '도시 야경', title: null,
  descKo: '비 내리는 도시 야경', descEn: 'rainy city night', tagsKo: ['야경'], tagsEn: ['night'], prompt: 'p', mime: 'video/mp4', byteSize: VIDEO.length,
  durationMs: 8000, width: 1080, height: 1920, aspect: '9:16', extra: {}, binary: { ready: true, storedAt: '2026-09-24T03:00:00Z' },
  urls: { play: `/api/assets/${VIDEO_ID}/binary`, download: `/api/assets/${VIDEO_ID}/binary?download=1` }, createdAt: 'x', updatedAt: 'x' };
const music = { ...video, id: MUSIC_ID, sourceId: 'bgm-upbeat-01', type: 'music', mime: 'audio/mp4', width: null, height: null, aspect: null, binary: { ready: false, storedAt: null } };

function fakeFetch(bodyBytes = VIDEO) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, search: u.search, headers: init.headers ?? {} });
    if (u.pathname === '/api/token') return Response.json({ success: true, data: { workspaceSlug: 'lab', workspaceName: 'Lab', role: 'member' } });
    if (u.pathname === '/api/assets') return Response.json({ success: true, data: { items: [video, music], page: 1, limit: 24, total: 2, hasNext: false } });
    if (u.pathname === `/api/assets/${VIDEO_ID}`) return Response.json({ success: true, data: video });
    if (u.pathname === `/api/assets/${MUSIC_ID}`) return Response.json({ success: true, data: music });
    if (u.pathname === `/api/assets/${VIDEO_ID}/binary`) return new Response(new Uint8Array(bodyBytes), { status: 200, headers: { 'content-type': 'video/mp4' } });
    return new Response(JSON.stringify({ success: false, error: 'no route' }), { status: 404 });
  };
  return { impl, calls };
}

before(() => {
  mkdirSync(join(tokenDir, 'lab'), { recursive: true });
  writeFileSync(join(tokenDir, 'lab', 'ttalkkakstory.json'), JSON.stringify({ apiUrl: 'https://portal.test', apiKey: KEY }));
  mkdirSync(join(EPISODE, 'storyboard'), { recursive: true });
});
after(() => { rmSync(tokenDir, { recursive: true, force: true }); rmSync(ROOT, { recursive: true, force: true }); });

describe('portal_assets_* — listing and routing', () => {
  it('both tools are portal-gated, routed, and read-only where they should be', () => {
    for (const name of ['portal_assets_search', 'portal_assets_get']) {
      assert.ok(portal.PORTAL_TOOL_NAMES.includes(name), `${name} not in PORTAL_TOOL_NAMES`);
      assert.ok(TOOLS.some((t) => t.name === name), `${name} not in TOOLS`);
      assert.equal(typeof ROUTES[name], 'function');
    }
    assert.equal(TOOLS.find((t) => t.name === 'portal_assets_search').annotations.readOnlyHint, true);
  });
});

describe('portal_assets_search', () => {
  it('sends the contract query string off the root (not the workspace base) and summarizes items', async () => {
    const { impl, calls } = fakeFetch();
    const r = await portal.portalHandlers(impl).assetsSearch({ channel: 'lab', query: '야경 비', tags: ['night', '비'], tagsMode: 'all', type: ['video', 'music'], aspect: ['9:16'], minDurationMs: 1000, sort: 'newest', limit: 5 });
    assert.equal(r.isError, false, r.text);
    const call = calls.find((c) => c.path === '/api/assets');
    const sp = new URLSearchParams(call.search);
    assert.equal(sp.get('q'), '야경 비');
    assert.equal(sp.get('tags'), 'night,비');
    assert.equal(sp.get('tagsMode'), 'all');
    assert.equal(sp.get('type'), 'video,music');
    assert.equal(sp.get('aspect'), '9:16');
    assert.equal(sp.get('minDurationMs'), '1000');
    assert.equal(sp.get('limit'), '5');
    assert.equal(call.headers.authorization, `Bearer ${KEY}`);
    const out = JSON.parse(r.text);
    assert.equal(out.total, 2);
    assert.deepEqual(Object.keys(out.items[0]).sort(), ['aspect', 'byteSize', 'category', 'categoryKo', 'descEn', 'descKo', 'durationMs', 'height', 'id', 'mime', 'ready', 'sourceId', 'tagsEn', 'tagsKo', 'title', 'type', 'width']);
    assert.equal(out.items[1].ready, false);
  });

  it('reads the channel off episodeDir and answers one line without a key', async () => {
    const { impl, calls } = fakeFetch();
    const r = await portal.portalHandlers(impl).assetsSearch({ episodeDir: EPISODE, query: 'night' });
    assert.equal(r.isError, false, r.text);
    assert.ok(calls.some((c) => c.path === '/api/assets'));
    const none = await portal.portalHandlers(impl).assetsSearch({ channel: 'nokey', query: 'night' });
    assert.equal(none.isError, true);
    assert.match(none.text, /No ttalkkakstory portal key/);
  });
});

describe('portal_assets_get', () => {
  it('without download returns the record and a license block the storyboard checker accepts', async () => {
    const { impl } = fakeFetch();
    const r = await portal.portalHandlers(impl).assetsGet({ channel: 'lab', id: VIDEO_ID });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.equal(out.asset.prompt, 'p');
    assert.equal(out.license.provider, 'ttalkkakstory');
    assert.equal(out.license.url, `https://portal.test/api/assets/${VIDEO_ID}/binary`);
    assert.deepEqual(checkLicense({ license: out.license }), []);
    assert.ok(!existsSync(join(EPISODE, 'storyboard', 'footage')));
  });

  it('download writes footage/s<shot>-portal-<sourceId>.mp4, verifies sha256, and skips an identical file next time', async () => {
    const { impl, calls } = fakeFetch();
    const r = await portal.portalHandlers(impl).assetsGet({ channel: 'lab', id: VIDEO_ID, episodeDir: EPISODE, download: true, shot: 4 });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.equal(out.clip, 'footage/s4-portal-gv-2026-0912-0007.mp4');
    assert.equal(out.downloaded, true);
    assert.ok(readFileSync(join(EPISODE, 'storyboard', out.clip)).equals(VIDEO));
    assert.equal(calls.filter((c) => c.path.endsWith('/binary')).length, 1);
    const again = JSON.parse((await portal.portalHandlers(impl).assetsGet({ channel: 'lab', id: VIDEO_ID, episodeDir: join(EPISODE, 'storyboard'), download: true, shot: 4 })).text);
    assert.equal(again.downloaded, false);
    assert.equal(calls.filter((c) => c.path.endsWith('/binary')).length, 1, 'the second call must not download');
    writeFileSync(join(EPISODE, 'storyboard', out.clip), 'something else');
    const refused = await portal.portalHandlers(impl).assetsGet({ channel: 'lab', id: VIDEO_ID, episodeDir: EPISODE, download: true, shot: 4 });
    assert.equal(refused.isError, true);
    assert.match(refused.text, /exists with different contents/);
  });

  it('a body that does not match the declared sha256 leaves nothing on disk', async () => {
    const { impl } = fakeFetch(Buffer.alloc(VIDEO.length, 1));
    const r = await portal.portalHandlers(impl).assetsGet({ channel: 'lab', id: VIDEO_ID, episodeDir: EPISODE, download: true });
    assert.equal(r.isError, true);
    assert.match(r.text, /sha256/);
    assert.ok(!existsSync(join(EPISODE, 'storyboard', 'footage', 'portal-gv-2026-0912-0007.mp4')));
  });

  it('metadata-only assets refuse download; music goes to .work/portal', async () => {
    const { impl } = fakeFetch();
    const r = await portal.portalHandlers(impl).assetsGet({ channel: 'lab', id: MUSIC_ID, episodeDir: EPISODE, download: true });
    assert.equal(r.isError, true);
    assert.match(r.text, /metadata only/);
    assert.deepEqual(assets.assetTarget(music), { relative: '.work/portal/bgm-upbeat-01.m4a' });
    assert.equal(assets.assetTarget({ ...video, type: 'image', mime: 'image/png' }).clip, 'images/stock/portal-gv-2026-0912-0007.png');
  });
});
