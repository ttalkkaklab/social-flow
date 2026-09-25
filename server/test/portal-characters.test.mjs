/**
 * portal_character_* (#91) — the workspace's characters on a scripted fetch: gating and routing,
 * the query string list sends, get by key, create from identityDir + panel file (project = channel),
 * partial update, tts_set that keeps what the caller leaves out (speed only → voiceId survives),
 * image upload with the sha256 check, delete, and the one-line answer without a key. No network.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const tokenDir = mkdtempSync(join(tmpdir(), 'sf-char-tokens-'));
process.env.SNS_TOKEN_DIR = tokenDir;
for (const k of ['TTALKKAKSTORY_API_URL', 'TTALKKAKSTORY_WORKSPACE', 'TTALKKAKSTORY_API_KEY', 'TTALKKAKSTORY_HOLDER']) delete process.env[k];

const portal = await import('../dist/portal-tools.js');
const chars = await import('../dist/portal-characters.js');
const { TOOLS } = await import('../dist/tools.js');
const { ROUTES } = await import('../dist/handlers.js');

const KEY = 'tks_0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
const ROOT = mkdtempSync(join(tmpdir(), 'sf-char-data-'));
const EPISODE = join(ROOT, 'data', 'lab', 'episodes', 'ep-one');
const IDENTITY = join(ROOT, 'data', 'lab', 'assets', 'characters', 'mina');
const ID = '66666666-6666-4666-8666-666666666666';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const NAMES = ['portal_character_list', 'portal_character_get', 'portal_character_create', 'portal_character_update', 'portal_character_delete', 'portal_character_image_upload', 'portal_character_extra_delete', 'portal_character_tts_set'];

const record = (over = {}) => ({ id: ID, projectId: 'p1', key: 'mina', name: '미나', role: '진행자', appearance: '단발', referenceImageUrl: null,
  tts: { engine: 'elevenlabs', voiceId: 'custom-voice', model: 'eleven_multilingual_v2', speed: 1 }, updatedAt: 'x', ...over });

/** A portal that remembers one character and echoes what it was sent. */
function fakePortal(initial = record()) {
  const calls = [];
  let current = initial;
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body instanceof Uint8Array || Buffer.isBuffer(init.body) ? init.body : init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, search: u.search, body, headers: init.headers ?? {} });
    if (u.pathname === '/api/token') return Response.json({ success: true, data: { workspaceSlug: 'lab', workspaceName: 'Lab', role: 'member' } });
    const base = '/api/workspaces/lab/characters';
    if (u.pathname === base && method === 'GET') {
      const key = u.searchParams.get('key');
      return Response.json({ success: true, data: { items: key && current.key !== key ? [] : [current], hasNext: false } });
    }
    if (u.pathname === base && method === 'POST') { current = record({ ...body, id: ID, projectId: 'p-' + body.project, referenceImageUrl: body.referenceImageUrl ?? null, tts: body.tts ?? null }); return Response.json({ success: true, data: current }, { status: 201 }); }
    if (u.pathname === `${base}/${ID}` && method === 'GET') return Response.json({ success: true, data: current });
    if (u.pathname === `${base}/${ID}` && method === 'PATCH') { current = { ...current, ...body }; return Response.json({ success: true, data: current }); }
    if (u.pathname === `${base}/${ID}` && method === 'DELETE') return Response.json({ success: true, data: { id: ID } });
    if (u.pathname === `${base}/${ID}/image` && method === 'PUT') {
      const url = `https://portal.test${base}/${ID}/image`;
      current = { ...current, referenceImageUrl: url };
      return Response.json({ success: true, data: { id: 'img', sha256: sha(body), mime: init.headers['content-type'], byteSize: body.length, created: true, url } }, { status: 201 });
    }
    return new Response(JSON.stringify({ success: false, error: 'no route' }), { status: 404 });
  };
  return { impl, calls, state: () => current };
}

before(() => {
  mkdirSync(join(tokenDir, 'lab'), { recursive: true });
  writeFileSync(join(tokenDir, 'lab', 'ttalkkakstory.json'), JSON.stringify({ apiUrl: 'https://portal.test', apiKey: KEY }));
  mkdirSync(join(EPISODE, 'storyboard'), { recursive: true });
  mkdirSync(IDENTITY, { recursive: true });
  writeFileSync(join(IDENTITY, 'identity.md'), '# 미나 (Mina)\n\n- **역할**: 진행자\n- **생김새**: 단발, 안경\n');
  writeFileSync(join(IDENTITY, 'face.png'), PNG);
});
after(() => { rmSync(tokenDir, { recursive: true, force: true }); rmSync(ROOT, { recursive: true, force: true }); });

describe('portal_character_* — surface', () => {
  it('all seven are portal-gated and routed; list/get read-only, delete destructive and asks first', () => {
    for (const name of NAMES) {
      assert.ok(portal.PORTAL_TOOL_NAMES.includes(name), `${name} not in PORTAL_TOOL_NAMES`);
      assert.ok(TOOLS.some((t) => t.name === name), `${name} not in TOOLS`);
      assert.equal(typeof ROUTES[name], 'function');
    }
    const t = (n) => TOOLS.find((x) => x.name === n);
    assert.equal(t('portal_character_list').annotations.readOnlyHint, true);
    assert.equal(t('portal_character_get').annotations.readOnlyHint, true);
    assert.equal(t('portal_character_delete').annotations.destructiveHint, true);
    assert.match(t('portal_character_delete').description, /Ask the user/);
    for (const n of NAMES) assert.equal('projectId' in (t(n).inputSchema.properties ?? {}), false, `${n} must not take a project id (#88)`);
  });

  it('answers one line without a key, as a tool error', async () => {
    const { impl } = fakePortal();
    const r = await portal.portalHandlers(impl).characterList({ channel: 'nokey' });
    assert.equal(r.isError, true);
    assert.match(r.text, /No ttalkkakstory portal key/);
  });
});

describe('list · get', () => {
  it('list sends q/key/page off the workspace base and summarizes; episodeDir picks the channel', async () => {
    const { impl, calls } = fakePortal();
    const r = await portal.portalHandlers(impl).characterList({ episodeDir: EPISODE, q: '진행', key: 'mina', page: 2 });
    assert.equal(r.isError, false, r.text);
    const call = calls.find((c) => c.path === '/api/workspaces/lab/characters');
    const sp = new URLSearchParams(call.search);
    assert.equal(sp.get('q'), '진행'); assert.equal(sp.get('key'), 'mina'); assert.equal(sp.get('page'), '2');
    assert.equal(call.headers.authorization, `Bearer ${KEY}`);
    const out = JSON.parse(r.text);
    assert.equal(out.workspace, 'lab');
    assert.deepEqual(Object.keys(out.items[0]).sort(), ['appearance', 'id', 'images', 'imagesComplete', 'key', 'name', 'referenceImageUrl', 'role', 'tts', 'updatedAt']);
  });

  it('get by key uses the list filter, get by id the single route, and neither-or-both is refused', async () => {
    const { impl, calls } = fakePortal();
    const h = portal.portalHandlers(impl);
    assert.equal(JSON.parse((await h.characterGet({ channel: 'lab', key: 'mina' })).text).id, ID);
    assert.ok(calls.some((c) => c.search === '?key=mina'));
    assert.equal(JSON.parse((await h.characterGet({ channel: 'lab', id: ID })).text).name, '미나');
    const missing = await h.characterGet({ channel: 'lab', key: 'nobody' });
    assert.equal(missing.isError, true); assert.match(missing.text, /No character with key "nobody"/);
    assert.throws(() => chars.characterGetSchema.parse({ id: ID, key: 'mina' }), /exactly one/);
    assert.throws(() => chars.characterGetSchema.parse({}), /exactly one/);
  });
});

describe('create', () => {
  it('reads key/name/역할/생김새 off identityDir, files it under project = the channel, then uploads the panel', async () => {
    const { impl, calls } = fakePortal();
    const r = await portal.portalHandlers(impl).characterCreate({ episodeDir: EPISODE, identityDir: IDENTITY, file: join(IDENTITY, 'face.png') });
    assert.equal(r.isError, false, r.text);
    const post = calls.find((c) => c.method === 'POST');
    assert.deepEqual(post.body, { project: 'lab', key: 'mina', name: '미나', role: '진행자', appearance: '단발, 안경' });
    assert.equal('projectId' in post.body, false);
    const put = calls.find((c) => c.method === 'PUT');
    assert.equal(put.path, `/api/workspaces/lab/characters/${ID}/image`);
    assert.equal(put.headers['content-type'], 'image/png');
    const out = JSON.parse(r.text);
    assert.equal(out.created, true); assert.equal(out.project, 'lab');
    assert.match(out.referenceImageUrl, /\/characters\/.*\/image$/);
  });

  it('explicit fields win over identity.md, project overrides the channel, and a bad panel stops before any write', async () => {
    const { impl, calls } = fakePortal();
    const h = portal.portalHandlers(impl);
    await h.characterCreate({ channel: 'lab', identityDir: IDENTITY, name: '미나 2', project: 'other-channel' });
    const post = calls.find((c) => c.method === 'POST');
    assert.equal(post.body.name, '미나 2'); assert.equal(post.body.project, 'other-channel'); assert.equal(post.body.key, 'mina');
    const bad = join(ROOT, 'not-image.png'); writeFileSync(bad, 'nope');
    const before = calls.length;
    const r = await h.characterCreate({ channel: 'lab', name: 'x', file: bad });
    assert.equal(r.isError, true);
    assert.equal(calls.filter((c) => c.method === 'POST').length, calls.slice(0, before).filter((c) => c.method === 'POST').length, 'nothing was created');
  });
});

describe('update · tts_set · image · delete', () => {
  it('update sends only the given fields as PATCH and refuses an empty patch', async () => {
    const { impl, calls } = fakePortal();
    const r = await portal.portalHandlers(impl).characterUpdate({ channel: 'lab', id: ID, role: null, appearance: '긴 머리' });
    assert.equal(r.isError, false, r.text);
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.deepEqual(patch.body, { role: null, appearance: '긴 머리' });
    assert.throws(() => chars.characterUpdateSchema.parse({ id: ID }), /Nothing to change/);
  });

  it('tts_set with speed only keeps the existing voiceId and fills nothing else over it', async () => {
    const { impl, calls } = fakePortal();
    const r = await portal.portalHandlers(impl).characterTtsSet({ channel: 'lab', id: ID, speed: 0.9 });
    assert.equal(r.isError, false, r.text);
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.deepEqual(patch.body, { tts: { engine: 'elevenlabs', voiceId: 'custom-voice', model: 'eleven_multilingual_v2', speed: 0.9 } });
  });

  it('tts_set on a character with no tts block applies the owner defaults, and id alone applies them too', async () => {
    const { impl, calls } = fakePortal(record({ tts: null }));
    const h = portal.portalHandlers(impl);
    await h.characterTtsSet({ channel: 'lab', id: ID, language: 'ko' });
    assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { tts: { ...chars.TTS_DEFAULTS, language: 'ko' } });
    assert.deepEqual(chars.TTS_DEFAULTS, { engine: 'elevenlabs', voiceId: 'L4az9Gb378GIycFl2nAB', model: 'eleven_multilingual_v2', speed: 1 });
    const only = fakePortal(record({ tts: null }));
    await portal.portalHandlers(only.impl).characterTtsSet({ channel: 'lab', id: ID });
    assert.deepEqual(only.calls.find((c) => c.method === 'PATCH').body, { tts: chars.TTS_DEFAULTS });
  });

  it('image upload PUTs the bytes with the sniffed mime and verifies the returned sha256', async () => {
    const { impl, calls } = fakePortal();
    const r = await portal.portalHandlers(impl).characterImageUpload({ channel: 'lab', id: ID, file: join(IDENTITY, 'face.png') });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.equal(out.sha256, sha(PNG)); assert.equal(out.replaced, true); assert.equal(out.mime, 'image/png');
    assert.ok(Buffer.from(calls.find((c) => c.method === 'PUT').body).equals(PNG));

    const lying = fakePortal();
    const orig = lying.impl;
    const r2 = await portal.portalHandlers(async (u, i) => {
      const res = await orig(u, i);
      if (i.method === 'PUT') { const j = await res.json(); j.data.sha256 = 'f'.repeat(64); return Response.json(j, { status: 201 }); }
      return res;
    }).characterImageUpload({ channel: 'lab', id: ID, file: join(IDENTITY, 'face.png') });
    assert.equal(r2.isError, true); assert.match(r2.text, /stored sha256/);
  });

  it('delete calls DELETE on the id and reports it', async () => {
    const { impl, calls } = fakePortal();
    const r = await portal.portalHandlers(impl).characterDelete({ channel: 'lab', id: ID });
    assert.equal(r.isError, false, r.text);
    assert.equal(calls.find((c) => c.method === 'DELETE').path, `/api/workspaces/lab/characters/${ID}`);
    assert.deepEqual(JSON.parse(r.text), { deleted: true, id: ID });
  });
});

describe('character image slots #96', () => {
  const EXTRA = '77777777-7777-4777-8777-777777777777';
  it('preserves slot URLs, extra ids and completeness in list/get', async () => {
    const images = { front: 'front-url', back: 'back-url', face: 'face-url', extra: [{ id: EXTRA, url: 'extra-url', label: 'side', sort: 2 }] };
    const h = portal.portalHandlers(fakePortal(record({ images, imagesComplete: true })).impl);
    const one = JSON.parse((await h.characterGet({ channel: 'lab', id: ID })).text);
    const list = JSON.parse((await h.characterList({ channel: 'lab' })).text);
    assert.deepEqual(one.images, images);
    assert.equal(one.imagesComplete, true);
    assert.equal(one.referenceImageUrl, images.front);
    assert.deepEqual(list.items[0].images, images);
    assert.equal(list.items[0].imagesComplete, true);
  });
  it('routes all views, encodes labels/sort, appends extra with POST and deletes by image id', async () => {
    const calls = [];
    const fallback = fakePortal().impl;
    const h = portal.portalHandlers(async (url, init = {}) => {
      const u = new URL(url);
      if (!u.pathname.includes('/images/')) return fallback(url, init);
      calls.push({ path: u.pathname, query: u.searchParams, method: init.method, body: init.body });
      if (init.method === 'DELETE') return Response.json({ success: true, data: { characterId: ID } });
      return Response.json({ success: true, data: { id: EXTRA, url: `${u.origin}${u.pathname}`, sha256: sha(init.body), mime: 'image/png', byteSize: init.body.length } }, { status: 201 });
    });
    for (const view of ['front', 'back', 'face', 'extra']) {
      const r = await h.characterImageUpload({ channel: 'lab', id: ID, file: join(IDENTITY, 'face.png'), view, label: '옆 & detail', sort: 3 });
      assert.equal(r.isError, false, r.text);
      const out = JSON.parse(r.text);
      assert.equal(out.imageId, EXTRA); assert.equal(out.view, view);
      assert.equal('referenceImageUrl' in out, view === 'front');
      assert.equal(out.replaced, view !== 'extra');
      const last = calls.at(-1);
      assert.equal(last.path, `/api/workspaces/lab/characters/${ID}/images/${view}`);
      assert.equal(last.method, view === 'extra' ? 'POST' : 'PUT');
      assert.equal(last.query.get('label'), '옆 & detail'); assert.equal(last.query.get('sort'), '3');
    }
    const removed = await h.characterExtraDelete({ channel: 'lab', id: ID, imageId: EXTRA });
    assert.equal(removed.isError, false, removed.text);
    assert.equal(calls.at(-1).method, 'DELETE');
    assert.equal(calls.at(-1).path, `/api/workspaces/lab/characters/${ID}/images/extra/${EXTRA}`);
    assert.equal(TOOLS.find(t => t.name === 'portal_character_image_upload').annotations.idempotentHint, false);
  });
  it('refuses unknown views, long labels, invalid sort and image ids before routing', () => {
    for (const over of [{ view: 'left' }, { label: 'a'.repeat(101) }, { sort: -1 }, { sort: 0.5 }]) {
      assert.throws(() => chars.characterImageUploadSchema.parse({ id: ID, file: '/tmp/x.png', ...over }));
    }
    assert.throws(() => chars.characterExtraDeleteSchema.parse({ id: ID, imageId: 'invalid' }));
  });
});
