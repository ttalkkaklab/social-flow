/**
 * ttalkkakstory portal by workspace API key — credential resolution, the client's
 * bearer/envelope contract, the episode payload, the tool handlers on a fake fetch,
 * and the ListTools gate. No network: every portal answer is scripted here.
 *
 * SNS_TOKEN_DIR is pointed at a temp directory *before* config.js loads (it reads the
 * env at import), and the TTALKKAKSTORY_* env is cleared so a developer-shell value
 * cannot make "no key" cases pass or fail by accident.
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

const tokenDir = mkdtempSync(join(tmpdir(), 'sf-portal-tokens-'));
process.env.SNS_TOKEN_DIR = tokenDir;
for (const k of ['TTALKKAKSTORY_API_URL', 'TTALKKAKSTORY_WORKSPACE', 'TTALKKAKSTORY_API_KEY', 'TTALKKAKSTORY_HOLDER']) {
  delete process.env[k];
}

const config = await import('../dist/config.js');
const client = await import('../dist/portal-client.js');
const episode = await import('../dist/portal-episode.js');
const portal = await import('../dist/portal-tools.js');
const { TOOLS } = await import('../dist/tools.js');
const { ROUTES } = await import('../dist/handlers.js');
const storyboard = await import('../dist/storyboard.js');

const KEY = 'tks_0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const STORYBOARD_ID = '22222222-2222-4222-8222-222222222222';

function writeCredential(file, body) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
}

function clearTokenDir() {
  rmSync(tokenDir, { recursive: true, force: true });
  mkdirSync(tokenDir, { recursive: true });
}

/** A scripted fetch — records every call, answers from a route table. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const u = new URL(url);
    const key = `${method} ${u.pathname}`;
    calls.push({ method, url, path: u.pathname, search: u.search, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
    const answer = routes[key];
    if (!answer) return new Response(JSON.stringify({ success: false, error: `no route ${key}` }), { status: 404 });
    const out = typeof answer === 'function' ? answer(calls[calls.length - 1]) : answer;
    if (typeof out === 'string') return new Response(out, { status: 200, headers: { 'content-type': 'text/plain' } });
    const { status = 200, ...envelope } = out;
    return new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });
  };
  return { impl, calls };
}

function scenesJs(extra = '') {
  return `// ep-one — The first episode (draft)
window.FORMAT = "shorts-9x16";
window.THEME = { preset: "cinematic-miniature" };
window.SB_DOC = { characters: { mina: {} } };
window.SCENES = [
  { no: 1, narration: "one", visual: { character: "mina" } },
  { no: 2, narration: "two", visual: { character: [{ id: "bo" }] } },
];
${extra}`;
}

/** data/<channel>/episodes/<topic>/storyboard with a board and the documents. */
function makeEpisodeDir(root, channel = 'my-channel', topic = 'ep-one') {
  const dir = join(root, 'data', channel, 'episodes', topic);
  const sb = join(dir, 'storyboard');
  mkdirSync(sb, { recursive: true });
  writeFileSync(join(sb, 'scenes.js'), scenesJs());
  writeFileSync(join(sb, 'storyboard.md'), `---\nchannel: ${channel}\ntopic: ${topic}\nstatus: approved\n---\n# The First Episode — Storyboard\n\nbody\n`);
  writeFileSync(join(sb, 'research.md'), '# research\n');
  const identity = join(root, 'data', channel, 'assets', 'characters', 'mina');
  mkdirSync(identity, { recursive: true });
  writeFileSync(join(identity, 'identity.md'), '# Mina (미나)\n\n- **역할**: host\n- **생김새**: short hair\n');
  return dir;
}

describe('portal credential resolution', () => {
  beforeEach(clearTokenDir);
  after(() => rmSync(tokenDir, { recursive: true, force: true }));

  it('nothing configured → null, and the portal_* tools are gated off', () => {
    assert.equal(config.portalCredential('my-channel'), null);
    assert.equal(config.portalCredential(), null);
    assert.equal(config.portalConfigured(), false);
  });

  it('the channel file wins over the flat file; a channel without a file falls through to flat', () => {
    writeCredential(config.portalCredentialFile(), { apiUrl: 'https://flat.example/', workspace: 'flat', apiKey: KEY });
    writeCredential(config.portalCredentialFile('my-channel'), { apiUrl: 'https://ch.example', workspace: 'lab', apiKey: KEY, holder: 'me@here' });
    const perChannel = config.portalCredential('my-channel');
    assert.equal(perChannel.workspace, 'lab');
    assert.equal(perChannel.holder, 'me@here');
    assert.equal(perChannel.source, config.portalCredentialFile('my-channel'));
    const fallthrough = config.portalCredential('other-channel');
    assert.equal(fallthrough.workspace, 'flat');
    assert.equal(fallthrough.source, config.portalCredentialFile());
    assert.equal(config.portalConfigured(), true);
  });

  it('a channel file alone (no flat file) still gates the tools on', () => {
    writeCredential(config.portalCredentialFile('my-channel'), { apiUrl: 'https://ch.example', workspace: 'lab', apiKey: KEY });
    assert.equal(config.portalConfigured(), true);
    assert.equal(config.portalCredential(), null, 'no channel and no flat file → nothing, not the channel file');
  });

  it('env is the last resort and only when all three are set', () => {
    process.env.TTALKKAKSTORY_API_URL = 'https://env.example';
    process.env.TTALKKAKSTORY_WORKSPACE = 'envws';
    try {
      assert.equal(config.portalCredential(), null, 'two of three env vars is not a credential');
      assert.equal(config.portalConfigured(), false);
      process.env.TTALKKAKSTORY_API_KEY = KEY;
      const c = config.portalCredential('my-channel');
      assert.equal(c.source, 'env');
      assert.equal(c.workspace, 'envws');
      assert.equal(config.portalConfigured(), true);
    } finally {
      delete process.env.TTALKKAKSTORY_API_URL;
      delete process.env.TTALKKAKSTORY_WORKSPACE;
      delete process.env.TTALKKAKSTORY_API_KEY;
    }
  });

  it('a present but broken file throws instead of falling through to another workspace', () => {
    writeCredential(config.portalCredentialFile(), { apiUrl: 'https://flat.example', workspace: 'flat', apiKey: KEY });
    writeCredential(config.portalCredentialFile('my-channel'), { apiUrl: 'https://ch.example', workspace: 'lab' });
    assert.throws(() => config.portalCredential('my-channel'), /missing apiKey/);
    writeFileSync(config.portalCredentialFile('my-channel'), '{not json');
    assert.throws(() => config.portalCredential('my-channel'), /not valid JSON/);
  });

  it('a malformed file never echoes its contents — the offending text is part of the key (review P2)', () => {
    writeFileSync(config.portalCredentialFile(), `{ "apiUrl": "https://x", "workspace": "w", "apiKey": ${KEY} }`);
    assert.throws(
      () => config.portalCredential(),
      (error) => {
        assert.match(error.message, /not valid JSON/);
        assert.equal(error.message.includes(KEY.slice(4, 16)), false, 'error message leaks the key');
        return true;
      },
    );
  });

  it('an unreadable channel file stops the lookup — it does not fall through to the flat workspace (review P1)', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return t.skip('root ignores file modes');
    writeCredential(config.portalCredentialFile(), { apiUrl: 'https://flat.example', workspace: 'flat', apiKey: KEY });
    const file = config.portalCredentialFile('my-channel');
    writeCredential(file, { apiUrl: 'https://ch.example', workspace: 'lab', apiKey: KEY });
    chmodSync(file, 0o000);
    try {
      assert.throws(() => config.portalCredential('my-channel'), /could not be read \(EACCES\)/);
    } finally {
      chmodSync(file, 0o600);
    }
    // a directory where the file should be is the same kind of failure
    rmSync(file);
    mkdirSync(file);
    assert.throws(() => config.portalCredential('my-channel'), /could not be read \(EISDIR\)/);
  });

  it('snake_case keys are accepted too (api_url · api_key)', () => {
    writeCredential(config.portalCredentialFile(), { api_url: 'https://flat.example', workspace: 'flat', api_key: KEY });
    assert.equal(config.portalCredential().apiKey, KEY);
  });

  it('a channel slug that is not kebab-case is refused (path assembly)', () => {
    assert.throws(() => config.portalCredentialFile('../etc'), /Invalid channel slug/);
  });
});

describe('channel from the episode path', () => {
  it('reads data/<channel>/episodes/<topic> and its storyboard/', () => {
    assert.equal(episode.channelOfEpisodeDir('/x/data/my-channel/episodes/ep-one'), 'my-channel');
    assert.equal(episode.channelOfEpisodeDir('/x/data/my-channel/episodes/ep-one/storyboard'), 'my-channel');
    assert.equal(episode.channelOfEpisodeDir('/x/data/my-channel/episodes/ep-one/storyboard/'), 'my-channel');
  });
  it('anything else is undefined — no guessing', () => {
    assert.equal(episode.channelOfEpisodeDir('/x/somewhere/ep-one'), undefined);
    assert.equal(episode.channelOfEpisodeDir('/x/data/Bad_Slug/episodes/ep'), undefined);
    assert.equal(episode.channelOfEpisodeDir(undefined), undefined);
  });
});

describe('portal client', () => {
  const credential = { apiUrl: 'https://story.example/', workspace: 'lab', apiKey: KEY, source: 'test' };

  it('sends the bearer, unwraps the envelope, and scopes every path under the workspace', async () => {
    const { impl, calls } = fakeFetch({ 'GET /api/workspaces/lab/me': { success: true, data: { workspace: 'lab', role: 'member' } } });
    const c = client.createPortalClient(credential, impl);
    const { status, data } = await c.me();
    assert.equal(status, 200);
    assert.equal(data.role, 'member');
    assert.equal(calls[0].headers.authorization, `Bearer ${KEY}`);
    assert.equal(c.base, 'https://story.example/api/workspaces/lab');
    assert.equal(c.holder.startsWith('tks_0123@'), true, 'holder is <key prefix>@<host>');
  });

  it('a failed envelope becomes a PortalError carrying status, code and the 409 detail', async () => {
    const { impl } = fakeFetch({
      'POST /api/workspaces/lab/episodes/e1/revisions': { status: 409, success: false, error: 'head moved', error_code: 'head_moved', detail: { headRevisionNo: 4 } },
    });
    const c = client.createPortalClient(credential, impl);
    await assert.rejects(c.checkpoint('e1', { stage: 'board' }), (error) => {
      assert.equal(error.name, 'PortalError');
      assert.equal(error.status, 409);
      assert.equal(error.code, 'head_moved');
      assert.deepEqual(error.detail, { headRevisionNo: 4 });
      assert.match(client.describePortalError(error), /portal 409 head_moved: head moved\n\{"headRevisionNo":4\}/);
      return true;
    });
  });

  it('a non-JSON body and an unreachable host are reported with the status, not thrown raw', async () => {
    const c = client.createPortalClient(credential, async () => new Response('<html>', { status: 502 }));
    await assert.rejects(c.me(), /portal answered 502 without a JSON body/);
    const down = client.createPortalClient(credential, async () => {
      throw new Error('ECONNREFUSED');
    });
    await assert.rejects(down.me(), (error) => error.status === 502 && /unreachable/.test(error.message));
  });

  it('writes that the portal must attribute carry the holder as a query parameter', async () => {
    const { impl, calls } = fakeFetch({
      'PATCH /api/workspaces/lab/episodes/e1': { success: true, data: {} },
      'POST /api/workspaces/lab/episodes/e1/scenarios/D2/choose': { success: true, data: {} },
    });
    const c = client.createPortalClient({ ...credential, holder: 'me@box' }, impl);
    await c.updateEpisode('e1', { status: 'produced' });
    await c.chooseScenario('e1', 'D2');
    assert.equal(calls[0].search, '?holder=me%40box');
    assert.equal(calls[1].search, '?holder=me%40box');
    assert.deepEqual(calls[0].body, { status: 'produced' });
  });
});

describe('episode payload', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-portal-episode-'));
  after(() => rmSync(root, { recursive: true, force: true }));

  it('evaluates scenes.js in an isolated room and separates shots, meta and SB_DOC', () => {
    const r = episode.evaluateScenesJs(scenesJs());
    assert.equal(r.scenes.length, 2);
    assert.equal(r.meta.FORMAT, 'shorts-9x16');
    assert.deepEqual(r.sbDoc, { characters: { mina: {} } });
    assert.equal('SCENES' in r.meta, false);
    assert.throws(() => episode.evaluateScenesJs('window.X = 1'), /no window.SCENES/);
    assert.throws(() => episode.evaluateScenesJs('require("fs")'), 'the room has no require');
  });

  it('a board cannot climb out of the room to the host process (review P1 — prototype escape)', () => {
    process.env.REVIEW52_SENTINEL = 'must-not-leak';
    try {
      const escape = `
        window.SCENES = [];
        try { window.stolen = window.constructor.constructor("return process")().env.REVIEW52_SENTINEL; } catch (e) { window.caught = String(e); }
        try { window.stolen2 = this.constructor.constructor("return process")().env.REVIEW52_SENTINEL; } catch (e) { window.caught2 = String(e); }
        try { window.stolen3 = (function(){ return this; })().process; } catch (e) { window.caught3 = String(e); }
      `;
      assert.throws(() => episode.evaluateScenesJs(escape), /only window/i);
      // the local board reader (storyboard_read/apply/check) is the second place a pulled board runs — same room
      const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-escape');
      mkdirSync(join(dir, 'storyboard'), { recursive: true });
      writeFileSync(join(dir, 'storyboard', 'scenes.js'), `${escape}\nconsole.log("boards may log"); window.viaGlobal = typeof globalThis.process;`);
      assert.throws(() => storyboard.readBoard(join(dir, 'storyboard')), /only window/i);
    } finally {
      delete process.env.REVIEW52_SENTINEL;
    }
  });

  it('a runaway board is rejected before execution', () => {
    assert.throws(() => episode.evaluateScenesJs('window.SCENES = []; while (true) {}'), /only window/i);
  });

  it('reads the storyboard.md head and strips the " — Storyboard" suffix from the title', () => {
    const h = episode.readStoryboardMd('---\nchannel: c\nstatus: draft\n---\n# Title Here — Storyboard\n');
    assert.deepEqual(h, { channel: 'c', topic: null, status: 'draft', title: 'Title Here' });
  });

  it('builds the import payload — project from the channel, status from storyboard.md, characters with identity', () => {
    const dir = makeEpisodeDir(root);
    const p = episode.buildImportPayload(dir);
    assert.deepEqual(p.project, { name: 'my-channel' });
    assert.equal(p.episode.slug, 'ep-one');
    assert.equal(p.episode.title, 'The First Episode');
    assert.equal(p.episode.status, 'approved');
    assert.equal(p.episode.format, 'shorts-9x16');
    assert.deepEqual(p.episode.meta.SB_DOC, { characters: { mina: {} } });
    assert.equal(p.scenes.length, 2);
    assert.deepEqual(p.characters, [
      { id: 'mina', name: 'Mina', role: 'host', appearance: 'short hair' },
      { id: 'bo' },
    ]);
    assert.deepEqual(p.documents.map((d) => d.filename), ['storyboard.md', 'research.md', 'scenes.js']);
    const same = episode.buildImportPayload(join(dir, 'storyboard'));
    assert.equal(same.episode.slug, 'ep-one', 'the storyboard/ path resolves to the episode');
  });

  it('falls back to the scenes.js header comment for the title when storyboard.md is missing', () => {
    const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-two');
    mkdirSync(join(dir, 'storyboard'), { recursive: true });
    writeFileSync(join(dir, 'storyboard', 'scenes.js'), '// ep-two — Second One (v2)\nwindow.SCENES = [];\n');
    const p = episode.buildImportPayload(dir, { storyboard: 'Series A', project: 'proj' });
    assert.equal(p.episode.title, 'Second One');
    assert.deepEqual(p.storyboard, { title: 'Series A' });
    assert.deepEqual(p.project, { name: 'proj' });
    assert.equal(p.episode.status, undefined);
  });

  it('.portal.json lives in the episode directory and merges on write', () => {
    const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-three');
    mkdirSync(join(dir, 'storyboard'), { recursive: true });
    assert.equal(episode.readPortalState(dir), null);
    episode.writePortalState(join(dir, 'storyboard'), { episodeId: 'e', headRevisionNo: 1 });
    episode.writePortalState(dir, { holder: 'h' });
    const s = episode.readPortalState(dir);
    assert.equal(s.episodeId, 'e');
    assert.equal(s.headRevisionNo, 1);
    assert.equal(s.holder, 'h');
    assert.ok(existsSync(join(dir, '.portal.json')));
    assert.equal(existsSync(join(dir, 'storyboard', '.portal.json')), false);
  });
});

describe('portal_* handlers on a scripted portal', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-portal-handlers-'));
  before(() => {
    clearTokenDir();
    writeCredential(config.portalCredentialFile('my-channel'), { apiUrl: 'https://story.example', workspace: 'lab', apiKey: KEY, holder: 'me@box' });
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
    clearTokenDir();
  });

  it('with no key for the channel (and no flat file) every tool answers the one-line fallback, isError', async () => {
    const h = portal.portalHandlers(async () => {
      throw new Error('must not be called');
    });
    const r = await h.workspaceCheck({ channel: 'no-key-channel' });
    assert.equal(r.isError, true);
    assert.match(r.text, /No ttalkkakstory portal key configured/);
    assert.match(r.text, /no-key-channel\/ttalkkakstory\.json/);
    const save = await h.storyboardSave({ episodeDir: join(root, 'data', 'no-key-channel', 'episodes', 'x') });
    assert.equal(save.isError, true);
    assert.match(save.text, /No ttalkkakstory portal key/);
  });

  it('workspace_check names the channel, workspace, source file and holder next to the portal answer', async () => {
    const { impl } = fakeFetch({ 'GET /api/workspaces/lab/me': { success: true, data: { role: 'member', workspaceId: 'w' } } });
    const r = await portal.portalHandlers(impl).workspaceCheck({ channel: 'my-channel' });
    assert.equal(r.isError, false);
    const out = JSON.parse(r.text);
    assert.equal(out.channel, 'my-channel');
    assert.equal(out.workspace, 'lab');
    assert.equal(out.source, config.portalCredentialFile('my-channel'));
    assert.equal(out.holder, 'me@box');
    assert.equal(out.role, 'member');
  });

  it('storyboard_save reads the channel off the path, uploads the board, and writes .portal.json', async () => {
    const dir = makeEpisodeDir(root);
    const { impl, calls } = fakeFetch({
      'POST /api/workspaces/lab/storyboards/import': { status: 201, success: true, data: { storyboardId: STORYBOARD_ID, episodeId: EPISODE_ID, revisionNo: 1, url: '/lab/storyboards/s/episodes/e' } },
    });
    const r = await portal.portalHandlers(impl).storyboardSave({ episodeDir: dir, note: 'approved' });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.equal(out.result, 'created');
    assert.equal(out.pageUrl, 'https://story.example/lab/storyboards/s/episodes/e');
    assert.deepEqual(out.uploaded, { scenes: 2, characters: ['mina', 'bo'], documents: ['storyboard.md', 'research.md', 'scenes.js'] });
    const body = calls[0].body;
    assert.equal(body.episode.sourceHost, 'me@box');
    assert.equal(body.episode.status, 'approved');
    assert.equal(body.episode.baseRevisionNo, undefined, 'first save has no base');
    const state = episode.readPortalState(dir);
    assert.equal(state.episodeId, EPISODE_ID);
    assert.equal(state.headRevisionNo, 1);
    assert.equal(state.workspace, 'lab');

    // second save carries the recorded head as baseRevisionNo
    await portal.portalHandlers(impl).storyboardSave({ episodeDir: dir });
    assert.equal(calls[1].body.episode.baseRevisionNo, 1);
  });

  it('a 409 from the portal comes back as one isError line with the detail, not a thrown error', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-409');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 2 });
    const { impl } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { status: 409, success: false, error: 'head moved', error_code: 'head_moved', detail: { headRevisionNo: 5 } },
    });
    const r = await portal.portalHandlers(impl).episodeCheckpoint({ stage: 'board', episodeDir: dir });
    assert.equal(r.isError, true);
    assert.match(r.text, /portal 409 head_moved/);
    assert.match(r.text, /"headRevisionNo":5/);
    assert.equal(episode.readPortalState(dir).headRevisionNo, 2, 'a refused checkpoint does not move the local head');
  });

  it('episode_checkpoint sends shots + documents from the directory and base from .portal.json', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-cp');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 3 });
    const { impl, calls } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { status: 201, success: true, data: { revisionNo: 4, stage: 'board' } },
    });
    const r = await portal.portalHandlers(impl).episodeCheckpoint({ stage: 'board', episodeDir: dir, note: 'n' });
    assert.equal(r.isError, false, r.text);
    const body = calls[0].body;
    assert.equal(body.baseRevisionNo, 3);
    assert.equal(body.sourceHost, 'me@box');
    assert.equal(body.scenes.length, 2);
    assert.deepEqual(body.documents.map((d) => d.filename), ['storyboard.md', 'research.md', 'scenes.js']);
    assert.equal(JSON.parse(r.text).result, 'new revision');
    assert.equal(episode.readPortalState(dir).headRevisionNo, 4);
  });

  it('storyboard_pull writes scenes.js, the documents and the chosen scenario, skipping unsafe names', async () => {
    const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-pull');
    const { impl } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: {
        success: true,
        data: {
          id: EPISODE_ID, slug: 'ep-pull', title: 'Pulled', storyboardId: STORYBOARD_ID, sceneCount: 1, stage: 'board', headRevisionNo: 7,
          documents: [{ filename: 'scenes.js' }, { filename: 'storyboard.md' }, { filename: '../evil' }, { filename: '.' }],
          scenarios: [{ candidate: 'D1', chosen: false }, { candidate: 'D2', chosen: true }],
        },
      },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenes.js`]: 'window.SCENES = [{ no: 1 }];',
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/documents/storyboard.md`]: '# pulled\n',
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenarios/D2/scenario.md`]: '# D2\n',
    });
    const r = await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.deepEqual(out.written, ['scenes.js', 'storyboard.md', 'scenario.md']);
    assert.equal(readFileSync(join(dir, 'storyboard', 'storyboard.md'), 'utf8'), '# pulled\n');
    assert.equal(readFileSync(join(dir, 'storyboard', 'scenario.md'), 'utf8'), '# D2\n');
    assert.equal(existsSync(join(dir, 'evil')), false);
    assert.equal(episode.readPortalState(dir).headRevisionNo, 7);
  });

  it('a named revision pulls that snapshot only and pins the local head to it', async () => {
    const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-rev');
    const { impl, calls } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 'ep-rev', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 9, documents: [{ filename: 'storyboard.md' }] } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenes.js`]: 'window.SCENES = [];',
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/3`]: { success: true, data: { revisionNo: 3, documents: { 'script.md': 'old script', 'scenes.js': 'ignored' } } },
    });
    const r = await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir, revision: 3 });
    assert.equal(r.isError, false, r.text);
    assert.deepEqual(JSON.parse(r.text).written, ['scenes.js', 'script.md']);
    assert.equal(calls.find((c) => c.path.endsWith('/scenes.js')).search, '?revision=3');
    assert.equal(existsSync(join(dir, 'storyboard', 'storyboard.md')), false, "head's documents are not mixed into an old revision");
    assert.equal(episode.readPortalState(dir).headRevisionNo, 3);
  });

  it('episode_lease acquire records the holder; status and release go through with the same holder', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-lease');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 0 });
    const { impl, calls } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/lease`]: { success: true, data: { holder: 'me@box', expiresAt: 'later' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/lease`]: { success: true, data: { lease: null } },
      [`DELETE /api/workspaces/lab/episodes/${EPISODE_ID}/lease`]: { success: true, data: { released: true } },
    });
    const h = portal.portalHandlers(impl);
    const a = await h.episodeLease({ action: 'acquire', episodeDir: dir, ttlMinutes: 30 });
    assert.equal(a.isError, false, a.text);
    assert.deepEqual(calls[0].body, { holder: 'me@box', ttlMinutes: 30 });
    assert.equal(episode.readPortalState(dir).holder, 'me@box');
    const s = await h.episodeLease({ action: 'status', episodeDir: dir });
    assert.equal(JSON.parse(s.text).holder, 'me@box');
    const rel = await h.episodeLease({ action: 'release', episodeDir: dir, force: true });
    assert.equal(rel.isError, false);
    assert.deepEqual(calls[2].body, { holder: 'me@box', force: true });
  });

  it('a tool that needs an episode id and has neither the argument nor .portal.json says so', async () => {
    const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-noid');
    mkdirSync(dir, { recursive: true });
    const r = await portal.portalHandlers(async () => {
      throw new Error('must not be called');
    }).episodeRevisions({ episodeDir: dir });
    assert.equal(r.isError, true);
    assert.match(r.text, /episodeId is missing/);
  });

  it('scenario_save finds the episode from candidates/dN.md and uploads the page; scenario_pull writes the set', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-scn');
    episode.writePortalState(dir, { episodeId: EPISODE_ID });
    const cand = join(dir, 'storyboard', 'candidates');
    mkdirSync(cand, { recursive: true });
    writeFileSync(join(cand, 'd1.md'), '# d1 page\n');
    const { impl, calls } = fakeFetch({
      [`PUT /api/workspaces/lab/episodes/${EPISODE_ID}/scenarios/D1`]: { status: 201, success: true, data: { candidate: 'D1', chosen: true, findings: [], updatedAt: 'now' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenarios`]: {
        success: true,
        data: { scenarios: [
          { candidate: 'D1', chosen: true, markdown: '# d1 page\n', findings: [], meta: { score: 96, p0: 0 } },
          { candidate: 'D2', chosen: false, markdown: '# d2\n', findings: [{}] },
        ] },
      },
    });
    const h = portal.portalHandlers(impl);
    const saved = await h.scenarioSave({ candidate: 'D1', file: join(cand, 'd1.md'), chosen: true });
    assert.equal(saved.isError, false, saved.text);
    assert.deepEqual(calls[0].body, { markdown: '# d1 page\n', sourceHost: 'me@box', chosen: true });
    assert.equal(JSON.parse(saved.text).result, 'created');

    const pulled = await h.scenarioPull({ targetDir: dir });
    assert.equal(pulled.isError, false, pulled.text);
    const out = JSON.parse(pulled.text);
    assert.deepEqual(out.written, ['storyboard/candidates/d1.md', 'storyboard/scenario.md', 'storyboard/candidates/d2.md']);
    assert.deepEqual(out.scenarios[0], { candidate: 'D1', chosen: true, score: 96, p0: 0, findings: 0 });
    assert.equal(readFileSync(join(dir, 'storyboard', 'scenario.md'), 'utf8'), '# d1 page\n');
  });

  it('a directory recorded as another workspace\'s copy is refused by every writing tool, and passes by none of the reads (loop R1)', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-other-ws');
    episode.writePortalState(dir, { workspace: 'other-lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    const { impl, calls } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { success: true, data: { revisions: [] } },
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
    });
    const h = portal.portalHandlers(impl);
    const writes = [
      () => h.storyboardSave({ episodeDir: dir }),
      () => h.storyboardPull({ episodeId: EPISODE_ID, targetDir: dir }),
      () => h.episodeStatus({ episodeDir: dir, status: 'produced' }),
      () => h.episodeCreate({ storyboardId: STORYBOARD_ID, slug: 'x', title: 'x', episodeDir: dir }),
      () => h.episodeCheckpoint({ stage: 'board', episodeDir: dir }),
      () => h.episodeRestore({ revisionNo: 1, episodeDir: dir }),
      () => h.episodeLease({ action: 'acquire', episodeDir: dir }),
      () => h.scenarioSave({ candidate: 'D1', episodeDir: dir, markdown: '# d1' }),
      () => h.scenarioSave({ candidate: 'D1', file: join(dir, 'storyboard', 'candidates', 'd1.md') }),
      () => h.scenarioPull({ targetDir: dir }),
      () => h.scenarioChoose({ candidate: 'D1', episodeDir: dir }),
    ];
    for (const call of writes) {
      const r = await call();
      assert.equal(r.isError, true, call.toString());
      assert.match(r.text, /Workspace mismatch/);
      assert.match(r.text, /"other-lab"/);
      assert.match(r.text, /"lab"/);
    }
    assert.equal(calls.length, 0, 'nothing reached the portal');
    assert.equal(episode.readPortalState(dir).headRevisionNo, 2, 'the record is untouched');

    const read = await h.episodeRevisions({ episodeDir: dir });
    assert.equal(read.isError, false, 'reading with the other key only asks the portal, which answers for itself');

    const check = await h.workspaceCheck({ episodeDir: dir });
    assert.equal(check.isError, false);
    const out = JSON.parse(check.text);
    assert.equal(out.workspaceMatches, false);
    assert.deepEqual(out.copyOf, { workspace: 'other-lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    assert.match(out.warning, /Workspace mismatch/);
    assert.equal(out.channel, 'my-channel', 'the channel came off the path');
  });

  it('a matching or absent workspace record passes the guard', async () => {
    const same = makeEpisodeDir(root, 'my-channel', 'ep-same-ws');
    episode.writePortalState(same, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 0 });
    const fresh = makeEpisodeDir(root, 'my-channel', 'ep-fresh');
    const { impl } = fakeFetch({
      'POST /api/workspaces/lab/storyboards/import': { status: 200, success: true, data: { storyboardId: STORYBOARD_ID, episodeId: EPISODE_ID, revisionNo: 1, url: '/u' } },
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
    });
    const h = portal.portalHandlers(impl);
    assert.equal((await h.storyboardSave({ episodeDir: same })).isError, false);
    assert.equal((await h.storyboardSave({ episodeDir: fresh })).isError, false);
    const check = await h.workspaceCheck({ episodeDir: same });
    assert.equal(JSON.parse(check.text).workspaceMatches, true);
    const legacy = makeEpisodeDir(root, 'my-channel', 'ep-legacy');
    episode.writePortalState(legacy, { episodeId: EPISODE_ID }); // a record from before the workspace field
    assert.equal((await h.storyboardSave({ episodeDir: legacy })).isError, false);
  });

  it('episode_status refuses an empty patch before touching the portal', async () => {
    const r = await portal.portalHandlers(async () => {
      throw new Error('must not be called');
    }).episodeStatus({ episodeId: EPISODE_ID, channel: 'my-channel' });
    assert.equal(r.isError, true);
    assert.match(r.text, /one of status · stage · title/);
  });
});

describe('portal tool surface', () => {
  const names = new Set(TOOLS.map((t) => t.name));

  it('all thirteen portal tools are defined and routed, and nothing else starts with portal_', () => {
    assert.equal(portal.PORTAL_TOOL_NAMES.length, 13);
    for (const name of portal.PORTAL_TOOL_NAMES) {
      assert.ok(names.has(name), `${name} not in TOOLS`);
      assert.equal(typeof ROUTES[name], 'function', `${name} not routed`);
    }
    const stray = [...names].filter((n) => n.startsWith('portal_') && !portal.PORTAL_TOOL_NAMES.includes(n));
    assert.deepEqual(stray, []);
  });

  it('the two tools that overwrite local files are marked destructive and say HITL; the rest are not', () => {
    for (const name of ['portal_storyboard_pull', 'portal_scenario_pull']) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.equal(tool.annotations.destructiveHint, true, name);
      assert.match(tool.description, /HITL/);
    }
    for (const name of portal.PORTAL_TOOL_NAMES.filter((n) => !n.endsWith('_pull'))) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.notEqual(tool.annotations.destructiveHint, true, `${name} must not read as destructive — it writes the portal, never deletes`);
    }
  });

  it('every tool that takes an episodeDir describes that the channel (key) is read off its path', () => {
    for (const tool of TOOLS.filter((t) => portal.PORTAL_TOOL_NAMES.includes(t.name))) {
      const props = tool.inputSchema.properties ?? {};
      const dirArg = props.episodeDir ?? props.targetDir;
      if (!dirArg) continue;
      assert.match(dirArg.description, /channel|key/i, `${tool.name}: the directory argument does not say it picks the key`);
    }
  });

  it('a routed call with no key answers the fallback line as a tool error, not a protocol error', async () => {
    clearTokenDir();
    const r = await ROUTES.portal_workspace_check({ channel: 'nobody' });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /No ttalkkakstory portal key configured/);
  });
});
