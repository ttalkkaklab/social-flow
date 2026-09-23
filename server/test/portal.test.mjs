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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
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
      const r = episode.evaluateScenesJs(escape);
      assert.equal(r.meta.stolen, undefined);
      assert.equal(r.meta.stolen2, undefined);
      assert.equal(r.meta.stolen3, undefined);
      assert.equal(JSON.stringify(r).includes('must-not-leak'), false);
      assert.match(String(r.meta.caught ?? r.meta.caught2 ?? ''), /Code generation from strings disallowed/);
      // the local board reader (storyboard_read/apply/check) is the second place a pulled board runs — same room
      const dir = join(root, 'data', 'my-channel', 'episodes', 'ep-escape');
      mkdirSync(join(dir, 'storyboard'), { recursive: true });
      writeFileSync(join(dir, 'storyboard', 'scenes.js'), `${escape}\nconsole.log("boards may log"); window.viaGlobal = typeof globalThis.process;`);
      const board = storyboard.readBoard(join(dir, 'storyboard'));
      assert.equal(board.win.stolen, undefined);
      assert.equal(board.win.viaGlobal, 'undefined');
      assert.equal(JSON.stringify(board.win).includes('must-not-leak'), false);
    } finally {
      delete process.env.REVIEW52_SENTINEL;
    }
  });

  it('a runaway board hits the timeout instead of hanging the server', () => {
    assert.throws(() => episode.evaluateScenesJs('window.SCENES = []; while (true) {}'), /Script execution timed out/);
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

  it('reads a pending render request and submits exact revision and holder', async () => {
    const { impl, calls } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/render-allocation`]: { success:true, data:{ request: {status:'pending'}, bounds:{min:5,max:7}, shots:[] } },
      [`PUT /api/workspaces/lab/episodes/${EPISODE_ID}/render-allocation`]: { success:true, data:{ revisionNo: 4 } },
    });
    const h=portal.portalHandlers(impl);
    const r=await h.renderAllocation({channel:'my-channel',episodeId:EPISODE_ID});
    assert.equal(r.isError,false);
    const assignments=[{id:STORYBOARD_ID,mode:'generated_video',purpose:'live_action',reason:'Visible continuous action'}];
    const args={channel:'my-channel',episodeId:EPISODE_ID,requestId:EPISODE_ID,baseRevisionNo:3,assignments};
    assert.equal(portal.renderAllocationSchema.safeParse(args).success,true);
    assert.equal(portal.renderAllocationSchema.safeParse({...args,requestId:undefined}).success,false);
    await h.renderAllocation(args);
    assert.equal(calls[1].body.sourceHost,'me@box');
    assert.equal(calls[1].body.baseRevisionNo,3);
    assert.deepEqual(calls[1].body.assignments,assignments);
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
    assert.equal(body.episode.id, undefined, 'first save has no recorded episode id');
    assert.equal(body.episode.baseRevisionNo, undefined, 'first save has no base');
    const state = episode.readPortalState(dir);
    assert.equal(state.episodeId, EPISODE_ID);
    assert.equal(state.headRevisionNo, 1);
    assert.equal(state.workspace, 'lab');

    // second save carries the recorded head as baseRevisionNo
    await portal.portalHandlers(impl).storyboardSave({ episodeDir: dir });
    assert.equal(calls[1].body.episode.id, EPISODE_ID);
    assert.equal(calls[1].body.episode.baseRevisionNo, 1);
  });

  it('refuses missing or invalid recorded bases before save/checkpoint send; explicit base recovers', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-missing-base');
    const { impl, calls } = fakeFetch({
      'POST /api/workspaces/lab/storyboards/import': { status: 200, success: true, data: { episodeId: EPISODE_ID, revisionNo: 4 } },
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { status: 201, success: true, data: { revisionNo: 4 } },
    });
    const h = portal.portalHandlers(impl);
    for (const base of [undefined, null, -1, 1.5, '3']) {
      writeFileSync(join(dir, '.portal.json'), JSON.stringify({ episodeId: EPISODE_ID, headRevisionNo: base }));
      const before = readFileSync(join(dir, '.portal.json'), 'utf8');
      for (const run of [() => h.storyboardSave({ episodeDir: dir }), () => h.episodeCheckpoint({ episodeDir: dir, stage: 'board' })]) {
        const r = await run();
        assert.equal(r.isError, true);
        assert.match(r.text, base === undefined ? /Nothing was sent.*mode "side"/ : /Cannot read \.portal\.json/);
        assert.equal(readFileSync(join(dir, '.portal.json'), 'utf8'), before);
      }
    }
    assert.equal(calls.length, 0);
    // A missing base in an otherwise valid record can use an explicit merged base;
    // a wrongly typed recorded base must first be repaired, not bypassed.
    writeFileSync(join(dir, '.portal.json'), JSON.stringify({ episodeId: EPISODE_ID }));
    for (const run of [() => h.storyboardSave({ episodeDir: dir, baseRevisionNo: 3 }), () => h.episodeCheckpoint({ episodeDir: dir, stage: 'board', baseRevisionNo: 3 })]) {
      assert.equal((await run()).isError, false);
    }
    assert.equal(calls[0].body.episode.baseRevisionNo, 3);
    assert.equal(calls[1].body.baseRevisionNo, 3);
    episode.writePortalState(dir, { headRevisionNo: 0 });
    assert.equal((await h.episodeCheckpoint({ episodeDir: dir, stage: 'board' })).isError, false);
    assert.equal(calls[2].body.baseRevisionNo, 0, 'a newly created episode has a valid zero base');
    const remote = await h.episodeCheckpoint({ channel: 'my-channel', episodeId: EPISODE_ID, stage: 'board' });
    assert.equal(remote.isError, true);
    assert.equal(calls.length, 3, 'directory-free checkpoint must explicitly name its base');
  });

  it('restore preserves the local board and base, so the next unmerged checkpoint still conflicts', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-restore');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    const state = readFileSync(join(dir, '.portal.json'), 'utf8');
    const source = readFileSync(join(dir, 'storyboard/scenes.js'), 'utf8');
    const { impl, calls } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/1/restore`]: { success: true, data: { revisionNo: 3, restoredFrom: 1, stage: 'board' } },
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: call => call.body.baseRevisionNo === 3
        ? { success: true, data: { revisionNo: 4 } }
        : { status: 409, success: false, error_code: 'head_moved', error: 'head moved' },
    });
    const h = portal.portalHandlers(impl);
    const restored = await h.episodeRestore({ episodeDir: dir, revisionNo: 1 });
    assert.equal(restored.isError, false, restored.text);
    const result = JSON.parse(restored.text);
    assert.equal(result.revisionNo, 3);
    assert.deepEqual(result.localCopy, { unchanged: true, syncRequired: true });
    assert.match(result.next, /Pull mode "side"/);
    assert.equal(readFileSync(join(dir, '.portal.json'), 'utf8'), state);
    assert.equal(readFileSync(join(dir, 'storyboard/scenes.js'), 'utf8'), source);
    const stale = await h.episodeCheckpoint({ episodeDir: dir, stage: 'board' });
    assert.equal(stale.isError, true);
    assert.match(stale.text, /409 head_moved/);
    assert.equal(calls[1].body.baseRevisionNo, 2);
    assert.equal(readFileSync(join(dir, '.portal.json'), 'utf8'), state);
    const merged = await h.episodeCheckpoint({ episodeDir: dir, stage: 'board', baseRevisionNo: 3 });
    assert.equal(merged.isError, false);
    assert.equal(episode.readPortalState(dir).headRevisionNo, 4);
  });

  it('restore without a local copy keeps the remote result contract and does not create local state', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-restore-unlinked');
    const data = { revisionNo: 3, restoredFrom: 1, stage: 'board' };
    const { impl } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/1/restore`]: { success: true, data },
    });
    const h = portal.portalHandlers(impl);
    const remote = await h.episodeRestore({ channel: 'my-channel', episodeId: EPISODE_ID, revisionNo: 1 });
    assert.equal(remote.isError, false);
    assert.deepEqual(JSON.parse(remote.text), data);
    const local = await h.episodeRestore({ episodeDir: dir, episodeId: EPISODE_ID, revisionNo: 1 });
    assert.equal(local.isError, false);
    assert.equal(existsSync(join(dir, '.portal.json')), false);
  });

  it('conflicting explicit and local episode IDs refuse all shared handlers before any HTTP or writes', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-id-conflict');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    const state = readFileSync(join(dir, '.portal.json'), 'utf8');
    const source = readFileSync(join(dir, 'storyboard/scenes.js'), 'utf8');
    const { impl, calls } = fakeFetch({}); const h = portal.portalHandlers(impl);
    const args = { episodeId: STORYBOARD_ID, episodeDir: join(dir, 'storyboard') };
    const operations = [
      () => h.episodeCheckpoint({ ...args, stage: 'board', baseRevisionNo: 2 }),
      () => h.episodeStatus({ ...args, status: 'produced' }),
      () => h.episodeRestore({ ...args, revisionNo: 1 }),
      () => h.episodeLease({ ...args, action: 'acquire' }),
      () => h.episodeLease({ ...args, action: 'release' }),
      () => h.episodeLease({ ...args, action: 'status' }),
      () => h.episodeRevisions({ ...args, compareTo: 'head' }),
      () => h.renderAllocation(args),
      () => h.renderAllocation({ ...args, assignments: [{ id: EPISODE_ID, mode: 'still_camera', purpose: 'mood', reason: 'still' }] }),
      () => h.scenarioSave({ ...args, candidate: 'D1', markdown: '# test' }),
      () => h.scenarioChoose({ ...args, candidate: 'D1' }),
      () => h.scenarioPull({ ...args, targetDir: dir }),
      () => h.storyboardPull({ episodeId: STORYBOARD_ID, targetDir: dir }),
      () => h.storyboardPull({ episodeId: STORYBOARD_ID, targetDir: dir, mode: 'side' }),
    ];
    for (const run of operations) {
      const out = await run(); assert.equal(out.isError, true, out.text);
      assert.match(out.text, /Episode mismatch.*Nothing was sent or written/);
      assert.equal(calls.length, 0);
      assert.equal(readFileSync(join(dir, '.portal.json'), 'utf8'), state);
      assert.equal(readFileSync(join(dir, 'storyboard/scenes.js'), 'utf8'), source);
    }
  });

  it('scenario source files and pull targets cannot hide a second conflicting local copy', async () => {
    const a = makeEpisodeDir(root, 'my-channel', 'ep-id-a');
    const b = makeEpisodeDir(root, 'my-channel', 'ep-id-b');
    episode.writePortalState(a, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    episode.writePortalState(b, { workspace: 'lab', episodeId: STORYBOARD_ID, headRevisionNo: 2 });
    const candidate = join(b, 'storyboard/candidates/d1.md');
    mkdirSync(join(candidate, '..'), { recursive: true }); writeFileSync(candidate, '# keep this candidate');
    const { impl, calls } = fakeFetch({}); const h = portal.portalHandlers(impl);
    for (const args of [{ episodeDir: a }, { episodeDir: a, episodeId: EPISODE_ID }, { episodeId: EPISODE_ID }]) {
      const saved = await h.scenarioSave({ ...args, candidate: 'D1', file: candidate });
      const pulled = await h.scenarioPull({ ...args, targetDir: b });
      for (const out of [saved, pulled]) { assert.equal(out.isError, true); assert.match(out.text, /Episode mismatch/); }
    }
    assert.equal(calls.length, 0);
    assert.equal(readFileSync(candidate, 'utf8'), '# keep this candidate');
    assert.equal(episode.readPortalState(a).episodeId, EPISODE_ID);
    assert.equal(episode.readPortalState(b).episodeId, STORYBOARD_ID);
  });

  it('matching IDs, inferred IDs, remote-only calls and unlinked targets remain usable', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-id-match');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    const fresh = join(root, 'data/my-channel/episodes/ep-id-new');
    const { impl, calls } = fakeFetch({
      [`PATCH /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { status: 'produced' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, storyboardId: STORYBOARD_ID, headRevisionNo: 2, documents: [] } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenes.js`]: scenesJs(),
    }); const h = portal.portalHandlers(impl);
    for (const args of [{ episodeDir: dir }, { episodeDir: dir, episodeId: EPISODE_ID }, { channel: 'my-channel', episodeId: EPISODE_ID }]) {
      const out = await h.episodeStatus({ ...args, status: 'produced' }); assert.equal(out.isError, false, out.text);
    }
    const pulled = await h.storyboardPull({ episodeId: EPISODE_ID, targetDir: fresh });
    assert.equal(pulled.isError, false, pulled.text);
    assert.equal(episode.readPortalState(fresh).episodeId, EPISODE_ID);
    assert.equal(calls.length, 5);
  });

  it('missing state and valid optional records stay distinct from malformed present fields', () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-state-shapes');
    const file = join(dir, '.portal.json');
    assert.equal(episode.readPortalState(dir), null);
    for (const record of [{ episodeId: EPISODE_ID, holder: 'review@localhost' }, { episodeId: EPISODE_ID }, { episodeId: EPISODE_ID, headRevisionNo: 0 }, { episodeId: EPISODE_ID, headRevisionNo: 2, future: true }]) {
      writeFileSync(file, JSON.stringify(record));
      assert.deepEqual(episode.readPortalState(dir), record);
    }
    const broken = ['{', '', 'null', '[]', '1', '"text"', 'true', '{}', ...[
      { episodeId: undefined, holder: 'review@localhost' }, { episodeId: undefined, headRevisionNo: 0 }, { episodeId: '' }, { episodeId: '   ' },
      { episodeId: 42 }, { episodeId: null }, { workspace: false }, { holder: [] }, { storyboardId: {} }, { updatedAt: 1 },
      { headRevisionNo: null }, { headRevisionNo: '2' }, { headRevisionNo: -1 }, { headRevisionNo: 1.5 }, { headRevisionNo: Number.MAX_SAFE_INTEGER + 1 },
    ].map(value => JSON.stringify({ episodeId: EPISODE_ID, ...value }))];
    for (const source of broken) {
      writeFileSync(file, source);
      assert.throws(() => episode.readPortalState(dir), /Cannot read \.portal\.json/);
      assert.throws(() => episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 0 }), /Cannot read \.portal\.json/);
      assert.equal(readFileSync(file, 'utf8'), source, 'damaged state is never overwritten by the writer');
    }
  });

  it('unreadable metadata or bytes and dangling state links refuse tools without HTTP or overwriting', async (ctx) => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-state-io');
    const file = join(dir, '.portal.json');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 1 });
    const originalState = readFileSync(file, 'utf8');
    const { impl, calls } = fakeFetch({}); const h = portal.portalHandlers(impl);
    for (const method of ['lstatSync', 'readFileSync']) {
      const original = fs[method];
      const mock = ctx.mock.method(fs, method, function (target, ...args) {
        if (String(target) === file) throw Object.assign(new Error('injected EACCES'), { code: 'EACCES' });
        return original.call(this, target, ...args);
      }); syncBuiltinESMExports();
      try {
        const out = await h.storyboardSave({ episodeDir: dir, baseRevisionNo: 1 });
        assert.equal(out.isError, true); assert.match(out.text, /Cannot read \.portal\.json/);
        assert.throws(() => episode.writePortalState(dir, { holder: 'new' }), /Cannot read \.portal\.json/);
      } finally { mock.mock.restore(); syncBuiltinESMExports(); }
      assert.equal(readFileSync(file, 'utf8'), originalState);
    }
    rmSync(file); symlinkSync(join(dir, 'missing-state'), file);
    const out = await h.storyboardSave({ episodeDir: dir });
    assert.equal(out.isError, true); assert.match(out.text, /file exists but is unreadable/);
    assert.throws(() => episode.writePortalState(dir, { episodeId: EPISODE_ID }), /Cannot read/);
    assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
    assert.equal(calls.length, 0);
  });

  it('damaged state reaches non-diagnostic tools as isError before HTTP even with explicit identity and base', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-state-tools');
    const file = join(dir, '.portal.json'), board = join(dir, 'storyboard/scenes.js');
    const before = readFileSync(board, 'utf8');
    const { impl, calls } = fakeFetch({}); const h = portal.portalHandlers(impl);
    for (const source of ['{invalid', JSON.stringify({ episodeId: 7, headRevisionNo: 1 })]) {
      writeFileSync(file, source);
      const args = { episodeDir: dir, episodeId: EPISODE_ID };
      const operations = [
        () => h.storyboardSave({ ...args, baseRevisionNo: 1 }),
        () => h.episodeCheckpoint({ ...args, stage: 'board', baseRevisionNo: 1 }),
        () => h.imagesUpload({ episodeDir: dir, stage: 'board', baseRevisionNo: 1 }),
        () => h.episodeCreate({ episodeDir: dir, storyboardId: STORYBOARD_ID, slug: 'new' }),
        () => h.episodeStatus({ ...args, status: 'produced' }),
        () => h.episodeRestore({ ...args, revisionNo: 1 }),
        () => h.episodeLease({ ...args, action: 'acquire' }),
        () => h.episodeRevisions(args), () => h.renderAllocation(args),
        () => h.scenarioSave({ ...args, candidate: 'D1', markdown: '# test' }),
        () => h.scenarioChoose({ ...args, candidate: 'D1' }),
        () => h.scenarioPull({ ...args, targetDir: dir }),
        () => h.storyboardPull({ episodeId: EPISODE_ID, targetDir: dir }),
      ];
      for (const run of operations) {
        const out = await run(); assert.equal(out.isError, true); assert.match(out.text, /Cannot read \.portal\.json/);
        assert.equal(calls.length, 0); assert.equal(readFileSync(file, 'utf8'), source); assert.equal(readFileSync(board, 'utf8'), before);
      }
    }
  });

  it('lease partial records remain usable while an absent required identity or save base is refused', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-state-partial');
    writeFileSync(join(dir, '.portal.json'), '{}');
    const { impl, calls } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/lease`]: { success: true, data: { holder: 'me@box' } },
      [`PATCH /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { status: 'approved' } },
    }); const h = portal.portalHandlers(impl);
    assert.equal((await h.episodeStatus({ episodeDir: dir, status: 'approved' })).isError, true);
    assert.equal((await h.storyboardSave({ episodeDir: dir })).isError, true);
    assert.equal(calls.length, 0);
    rmSync(join(dir, '.portal.json'));
    const lease = await h.episodeLease({ episodeDir: dir, episodeId: EPISODE_ID, action: 'acquire' });
    assert.equal(lease.isError, false, lease.text);
    const partial = episode.readPortalState(dir); assert.equal(partial.episodeId, EPISODE_ID); assert.equal(partial.headRevisionNo, undefined);
    assert.equal((await h.episodeStatus({ episodeDir: dir, status: 'approved' })).isError, false);
    const before = calls.length;
    assert.equal((await h.episodeCheckpoint({ episodeDir: dir, stage: 'board' })).isError, true);
    assert.equal(calls.length, before);
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

  it('storyboard_pull replace backs up only changed local files before writing portal content', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-pull');
    const sb = join(dir, 'storyboard');
    writeFileSync(join(sb, 'scenes.js'), 'local scenes\n');
    writeFileSync(join(sb, 'storyboard.md'), '# pulled\n');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 6 });
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
    assert.deepEqual(out.replaced, ['scenes.js']);
    assert.match(out.backupDir, /storyboard\/\.portal-local\/.+-r6$/);
    assert.equal(readFileSync(join(out.backupDir, 'scenes.js'), 'utf8'), 'local scenes\n');
    assert.equal(existsSync(join(out.backupDir, 'storyboard.md')), false, 'identical files are not backed up');
    assert.equal(readFileSync(join(dir, 'storyboard', 'storyboard.md'), 'utf8'), '# pulled\n');
    assert.equal(readFileSync(join(dir, 'storyboard', 'scenario.md'), 'utf8'), '# D2\n');
    assert.equal(existsSync(join(dir, 'evil')), false);
    assert.equal(episode.readPortalState(dir).headRevisionNo, 7);
    const unchanged = JSON.parse((await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir })).text);
    assert.equal(unchanged.backupDir, null);
    assert.deepEqual(unchanged.replaced, []);
  });

  it('storyboard_pull side preserves the working copy and .portal.json while refreshing .portal-head', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-side');
    const sb = join(dir, 'storyboard');
    episode.writePortalState(dir, { workspace: 'lab', storyboardId: STORYBOARD_ID, episodeId: EPISODE_ID, headRevisionNo: 6 });
    const scenesBefore = readFileSync(join(sb, 'scenes.js'));
    const storyboardBefore = readFileSync(join(sb, 'storyboard.md'));
    const stateBefore = readFileSync(join(dir, '.portal.json'));
    mkdirSync(join(sb, '.portal-head'), { recursive: true });
    writeFileSync(join(sb, '.portal-head', 'stale.md'), 'remove me');
    const { impl } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: {
        success: true,
        data: {
          id: EPISODE_ID, slug: 'ep-side', title: 'Side', storyboardId: STORYBOARD_ID, sceneCount: 1, stage: 'board', headRevisionNo: 7,
          documents: [{ filename: 'scenes.js' }, { filename: 'storyboard.md' }],
          scenarios: [{ candidate: 'D2', chosen: true }],
        },
      },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenes.js`]: 'window.SCENES = [{ no: 7 }];',
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/documents/storyboard.md`]: '# portal head\n',
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenarios/D2/scenario.md`]: '# portal scenario\n',
    });
    const r = await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir, mode: 'side' });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.equal(out.headRevisionNo, 7);
    assert.equal(out.sideDir, join(sb, '.portal-head'));
    assert.equal(readFileSync(join(sb, 'scenes.js')).equals(scenesBefore), true);
    assert.equal(readFileSync(join(sb, 'storyboard.md')).equals(storyboardBefore), true);
    assert.equal(readFileSync(join(dir, '.portal.json')).equals(stateBefore), true);
    assert.equal(readFileSync(join(out.sideDir, 'scenes.js'), 'utf8'), 'window.SCENES = [{ no: 7 }];');
    assert.equal(readFileSync(join(out.sideDir, 'storyboard.md'), 'utf8'), '# portal head\n');
    assert.equal(readFileSync(join(out.sideDir, 'scenario.md'), 'utf8'), '# portal scenario\n');
    assert.equal(existsSync(join(out.sideDir, 'stale.md')), false);
  });

  it('storyboard_pull side with revision writes only that snapshot and reports its revision number', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-side-rev');
    const sb = join(dir, 'storyboard');
    const { impl, calls } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 'ep-side-rev', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 9, documents: [{ filename: 'storyboard.md' }] } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenes.js`]: 'window.SCENES = [{ no: 3 }];',
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/3`]: { success: true, data: { revisionNo: 3, documents: { 'script.md': 'old script', 'scenes.js': 'ignored' } } },
    });
    const r = await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir, revision: 3, mode: 'side' });
    assert.equal(r.isError, false, r.text);
    const out = JSON.parse(r.text);
    assert.equal(out.headRevisionNo, 3);
    assert.deepEqual(out.written, ['scenes.js', 'script.md']);
    assert.equal(calls.find((c) => c.path.endsWith('/scenes.js')).search, '?revision=3');
    assert.equal(readFileSync(join(out.sideDir, 'script.md'), 'utf8'), 'old script');
    assert.equal(existsSync(join(out.sideDir, 'storyboard.md')), false, "head's documents are not mixed into an old revision");
    assert.equal(existsSync(join(sb, 'script.md')), false, 'side mode does not write into the working copy');
  });

  it('storyboard_pull replace gives consecutive backups different timestamp directories', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-backup-twice');
    const sb = join(dir, 'storyboard');
    const { impl } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 'ep-backup-twice', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 7, documents: [] } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/scenes.js`]: 'portal scenes\n',
    });
    writeFileSync(join(sb, 'scenes.js'), 'local one\n');
    const first = JSON.parse((await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir })).text);
    writeFileSync(join(sb, 'scenes.js'), 'local two\n');
    const second = JSON.parse((await portal.portalHandlers(impl).storyboardPull({ episodeId: EPISODE_ID, targetDir: dir })).text);
    assert.notEqual(first.backupDir, second.backupDir);
    assert.notEqual(first.backupDir.split('/').at(-1).replace(/-r\d+$/, ''), second.backupDir.split('/').at(-1).replace(/-r\d+$/, ''));
    assert.equal(readFileSync(join(first.backupDir, 'scenes.js'), 'utf8'), 'local one\n');
    assert.equal(readFileSync(join(second.backupDir, 'scenes.js'), 'utf8'), 'local two\n');
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
    episode.writePortalState(legacy, { episodeId: EPISODE_ID, headRevisionNo: 1 }); // a record from before the workspace field
    assert.equal((await h.storyboardSave({ episodeDir: legacy })).isError, false);
  });

  it('a 409 head_moved on save or checkpoint carries what moved since the base (loop R3)', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-moved');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 2 });
    const diff = {
      from: { revisionNo: 2 }, to: { revisionNo: 5 }, identical: false,
      scenes: { countA: 3, countB: 4, added: ['4'], removed: [], changed: [{ key: '2', fields: ['narration'] }], reordered: false },
      meta: { added: [], removed: [], changed: ['THEME'] },
      documents: { 'script.md': { status: 'changed', unified: '--- a\n+++ b', truncated: false, linesA: 3, linesB: 4 }, 'research.md': { status: 'same' } },
    };
    const { impl, calls } = fakeFetch({
      'POST /api/workspaces/lab/storyboards/import': { status: 409, success: false, error: 'Episode head moved. Pull and retry.', error_code: 'head_moved', detail: { head: { revisionNo: 5 } } },
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { status: 409, success: false, error: 'Episode head moved. Pull and retry.', error_code: 'head_moved', detail: { head: { revisionNo: 5 } } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/2/diff/5`]: { success: true, data: diff },
    });
    const h = portal.portalHandlers(impl);
    const save = await h.storyboardSave({ episodeDir: dir });
    assert.equal(save.isError, true);
    assert.match(save.text, /portal 409 head_moved/);
    assert.match(save.text, /since your base #2 \(portal head is now #5\): scenes \+1 −0 ~1 \(2\[narration\]\) added 4 · meta ~THEME · documents script.md changed/);
    assert.match(save.text, /re-apply ALL of your changes since #2/);
    assert.match(save.text, /resolve those by hand/);
    const cp = await h.episodeCheckpoint({ stage: 'board', episodeDir: dir });
    assert.equal(cp.isError, true);
    assert.match(cp.text, /portal head is now #5/);
    assert.equal(calls.filter((c) => c.path.endsWith('/diff/5')).length, 2);
    assert.equal(episode.readPortalState(dir).headRevisionNo, 2, 'the local head is not touched by a refused write');
  });

  it('a 409 without a usable diff keeps the plain 409 text; other errors are untouched', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-moved-nodiff');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 2 });
    const { impl } = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { status: 409, success: false, error: 'head moved', error_code: 'head_moved', detail: { head: { revisionNo: 5 } } },
      // no diff route → 404 from the fake portal
    });
    const cp = await portal.portalHandlers(impl).episodeCheckpoint({ stage: 'board', episodeDir: dir });
    assert.equal(cp.isError, true);
    assert.match(cp.text, /portal 409 head_moved: head moved/);
    assert.equal(cp.text.includes('portal head is now'), false);
    const leased = fakeFetch({
      [`POST /api/workspaces/lab/episodes/${EPISODE_ID}/revisions`]: { status: 409, success: false, error: 'leased', error_code: 'leased', detail: { holder: 'x' } },
    });
    const l = await portal.portalHandlers(leased.impl).episodeCheckpoint({ stage: 'board', episodeDir: dir });
    assert.match(l.text, /portal 409 leased/);
  });

  it('episode_revisions compareTo returns the diff with a summary, from revisionNo or the recorded head', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-compare');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 3 });
    const diff = { from: { revisionNo: 3 }, to: { revisionNo: 3 }, identical: true, scenes: { countA: 1, countB: 1, added: [], removed: [], changed: [], reordered: false }, meta: { added: [], removed: [], changed: [] }, documents: {} };
    const { impl, calls } = fakeFetch({
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/3/diff/head`]: { success: true, data: diff },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}/revisions/1/diff/3`]: { success: true, data: { ...diff, from: { revisionNo: 1 }, identical: false } },
    });
    const h = portal.portalHandlers(impl);
    const a = await h.episodeRevisions({ episodeDir: dir, compareTo: 'head' });
    assert.equal(a.isError, false, a.text);
    assert.match(JSON.parse(a.text).summary, /same content/);
    const b = await h.episodeRevisions({ episodeDir: dir, revisionNo: 1, compareTo: 3 });
    assert.equal(JSON.parse(b.text).from.revisionNo, 1);
    assert.equal(calls.length, 2);
    const none = await h.episodeRevisions({ episodeId: EPISODE_ID, channel: 'my-channel', compareTo: 'head' });
    assert.equal(none.isError, true);
    assert.match(none.text, /compareTo needs revisionNo/);
  });

  it('workspace_check with an episodeDir also reports the portal head, lease, sync and pending (loop R5)', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-sync');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 2 });
    const { impl, calls } = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: {
        success: true,
        data: { id: EPISODE_ID, slug: 'ep-sync', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 3, stage: 'board', status: 'draft', lease: { holder: 'other@box', expiresAt: '2026-09-21T23:00:00.000Z', mine: false } },
      },
    });
    const h = portal.portalHandlers(impl);
    const ahead = JSON.parse((await h.workspaceCheck({ episodeDir: dir })).text);
    assert.equal(ahead.sync, 'portal_ahead');
    assert.deepEqual(ahead.portal, { headRevisionNo: 3, stage: 'board', status: 'draft', lease: { holder: 'other@box', until: '2026-09-21T23:00:00.000Z', mine: false } });
    assert.deepEqual(ahead.pending, { sideDir: false, backups: 0 });
    assert.equal(ahead.workspaceMatches, true);
    assert.equal(calls.filter((c) => c.path.endsWith(`/episodes/${EPISODE_ID}`)).length, 1);

    // in sync, no lease, and a half-merged side pull plus two backups lying around
    episode.writePortalState(dir, { headRevisionNo: 3 });
    mkdirSync(join(dir, 'storyboard', '.portal-head'), { recursive: true });
    mkdirSync(join(dir, 'storyboard', '.portal-local', 'a-r1'), { recursive: true });
    mkdirSync(join(dir, 'storyboard', '.portal-local', 'b-r2'), { recursive: true });
    const same = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 's', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 3, stage: 'board', lease: null } },
    });
    const inSync = JSON.parse((await portal.portalHandlers(same.impl).workspaceCheck({ episodeDir: dir })).text);
    assert.equal(inSync.sync, 'in_sync');
    assert.equal(inSync.portal.lease, null);
    assert.deepEqual(inSync.pending, { sideDir: true, backups: 2 });

    // local ahead (a checkpoint the portal lost) and a lease of my own
    episode.writePortalState(dir, { headRevisionNo: 5 });
    const mine = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 's', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 3, lease: { holder: 'me@box', expiresAt: 'x' } } },
    });
    const local = JSON.parse((await portal.portalHandlers(mine.impl).workspaceCheck({ episodeDir: dir })).text);
    assert.equal(local.sync, 'local_ahead');
    assert.match(local.syncWarning, /records head #5 but the portal's head is #3/);
    assert.match(local.syncWarning, /save with baseRevisionNo 3/);
    assert.doesNotMatch(local.syncWarning, /delete .*headRevisionNo to resync/);
    assert.equal(local.portal.lease.mine, false, 'no mine flag from the portal → the holder string alone proves nothing');
    const said = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 's', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 5, lease: { holder: 'me@box', expiresAt: 'x', mine: true } } },
    });
    assert.equal(JSON.parse((await portal.portalHandlers(said.impl).workspaceCheck({ episodeDir: dir })).text).portal.lease.mine, true, 'same key and same holder → mine');
    assert.equal(ahead.syncWarning, undefined);

    // same key, other machine: the portal says mine (same key) but the holder differs → not mine
    const twin = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { id: EPISODE_ID, slug: 's', title: 't', storyboardId: STORYBOARD_ID, headRevisionNo: 5, lease: { holder: 'me@other-box', expiresAt: 'x', mine: true } } },
    });
    const t = JSON.parse((await portal.portalHandlers(twin.impl).workspaceCheck({ episodeDir: dir })).text);
    assert.equal(t.portal.lease.mine, false);
  });

  it('workspace_check keeps answering when the portal lookup fails, has no record, or the workspace mismatches', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-sync-404');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 1 });
    const gone = fakeFetch({ 'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } } }); // episode route → 404
    const r = await portal.portalHandlers(gone.impl).workspaceCheck({ episodeDir: dir });
    assert.equal(r.isError, false);
    const out = JSON.parse(r.text);
    assert.equal(out.portal, null);
    assert.equal(out.sync, 'unknown');
    assert.match(out.portalWarning, /portal 404/);
    assert.equal(out.workspaceMatches, true);

    const fresh = makeEpisodeDir(root, 'my-channel', 'ep-sync-fresh');
    const none = JSON.parse((await portal.portalHandlers(gone.impl).workspaceCheck({ episodeDir: fresh })).text);
    assert.equal(none.copyOf, null);
    assert.equal(none.sync, 'unknown');
    assert.deepEqual(none.pending, { sideDir: false, backups: 0 });

    const other = makeEpisodeDir(root, 'my-channel', 'ep-sync-other');
    episode.writePortalState(other, { workspace: 'other-lab', episodeId: EPISODE_ID, headRevisionNo: 1 });
    const mm = JSON.parse((await portal.portalHandlers(gone.impl).workspaceCheck({ episodeDir: other })).text);
    assert.equal(mm.workspaceMatches, false);
    assert.equal('sync' in mm, false, 'no portal lookup with the wrong key');
  });

  it('workspace_check diagnoses damaged records without trusting their identity or changing files', async () => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-diagnostic');
    const file = join(dir, '.portal.json');
    const board = readFileSync(join(dir, 'storyboard/scenes.js'), 'utf8');
    mkdirSync(join(dir, 'storyboard/.portal-head'), { recursive: true });
    mkdirSync(join(dir, 'storyboard/.portal-local/backup'), { recursive: true });
    for (const source of ['{broken', 'null', JSON.stringify({ episodeId: EPISODE_ID, headRevisionNo: '1' }), '{}']) {
      writeFileSync(file, source);
      const { impl, calls } = fakeFetch({
        'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
        [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { headRevisionNo: 3, lease: { holder: 'me@box', mine: true } } },
      });
      const h = portal.portalHandlers(impl);
      const noId = await h.workspaceCheck({ episodeDir: dir });
      assert.equal(noId.isError, false, noId.text);
      const out = JSON.parse(noId.text);
      assert.equal(out.role, 'member'); assert.equal(out.copyOf, null); assert.equal(out.workspaceMatches, null);
      assert.equal(out.portal, null); assert.equal(out.sync, 'unknown');
      assert.match(out.localWarning, /Cannot read \.portal\.json/); assert.match(out.portalWarning, /episodeId/);
      assert.deepEqual(out.pending, { sideDir: true, backups: 1 });
      assert.equal(calls.length, 1, 'never salvages an ID from invalid state');
      const explicit = await h.workspaceCheck({ episodeDir: dir, episodeId: EPISODE_ID });
      assert.equal(explicit.isError, false, explicit.text);
      const remote = JSON.parse(explicit.text);
      assert.equal(remote.portal.headRevisionNo, 3); assert.equal(remote.portal.lease.mine, true);
      assert.equal(remote.sync, 'unknown'); assert.match(remote.localWarning, /Cannot read/);
      assert.deepEqual(remote.pending, out.pending);
      assert.equal(calls.length, 3); assert.ok(calls.every(c => c.method === 'GET'));
      const save = await h.storyboardSave({ episodeDir: dir, baseRevisionNo: 3 });
      assert.equal(save.isError, true); assert.equal(calls.length, 3, 'diagnosis never relaxes write guards');
      assert.equal(readFileSync(file, 'utf8'), source); assert.equal(readFileSync(join(dir, 'storyboard/scenes.js'), 'utf8'), board);
    }
  });

  it('workspace_check keeps I/O errors and remote errors as separate warnings', async (ctx) => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-diagnostic-io'), file = join(dir, '.portal.json');
    episode.writePortalState(dir, { episodeId: EPISODE_ID, headRevisionNo: 1 });
    const source = readFileSync(file, 'utf8');
    const { impl, calls } = fakeFetch({ 'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } } });
    const h = portal.portalHandlers(impl);
    async function check() {
      const result = await h.workspaceCheck({ episodeDir: dir, episodeId: EPISODE_ID });
      assert.equal(result.isError, false, result.text);
      const out = JSON.parse(result.text);
      assert.match(out.localWarning, /Cannot read/); assert.match(out.portalWarning, /portal 404/);
      assert.equal(out.workspaceMatches, null); assert.equal(out.portal, null); assert.equal(out.sync, 'unknown');
      assert.deepEqual(out.pending, { sideDir: false, backups: 0 });
    }
    for (const method of ['lstatSync', 'readFileSync']) {
      const original = fs[method];
      const mock = ctx.mock.method(fs, method, function(target, ...args) {
        if (String(target) === file) throw Object.assign(new Error('injected'), { code: 'EACCES' });
        return original.call(this, target, ...args);
      }); syncBuiltinESMExports();
      try { await check(); } finally { mock.mock.restore(); syncBuiltinESMExports(); }
      assert.equal(readFileSync(file, 'utf8'), source);
    }
    rmSync(file); symlinkSync(join(dir, 'absent'), file); await check();
    assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
    assert.equal(calls.length, 6); assert.ok(calls.every(c => c.method === 'GET'));
  });

  it('workspace_check supports remote-only and partial records but will not compare conflicting identities', async () => {
    assert.equal(portal.workspaceCheckSchema.parse({ episodeId: EPISODE_ID }).episodeId, EPISODE_ID);
    assert.equal(portal.workspaceCheckSchema.safeParse({ episodeId: 'bad' }).success, false);
    assert.equal(TOOLS.find(t => t.name === 'portal_workspace_check').inputSchema.properties.episodeId.format, 'uuid');
    const { impl, calls } = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { headRevisionNo: 0, lease: null } },
    });
    const h = portal.portalHandlers(impl);
    const remote = JSON.parse((await h.workspaceCheck({ channel: 'my-channel', episodeId: EPISODE_ID })).text);
    assert.equal(remote.portal.headRevisionNo, 0); assert.equal(remote.sync, 'unknown'); assert.equal(remote.localWarning, undefined);
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-diagnostic-partial');
    for (const state of [null, { episodeId: EPISODE_ID }, { episodeId: EPISODE_ID, headRevisionNo: 0 }]) {
      if (state) writeFileSync(join(dir, '.portal.json'), JSON.stringify(state));
      const out = JSON.parse((await h.workspaceCheck({ episodeDir: dir, episodeId: EPISODE_ID })).text);
      assert.equal(out.sync, state?.headRevisionNo === 0 ? 'in_sync' : 'unknown');
      assert.equal(out.portal.headRevisionNo, 0); assert.equal(out.localWarning, undefined);
    }
    const before = calls.length;
    const conflict = JSON.parse((await h.workspaceCheck({ episodeDir: dir, episodeId: STORYBOARD_ID })).text);
    assert.match(conflict.warning, /Episode mismatch/); assert.equal(conflict.portal, undefined);
    writeFileSync(join(dir, '.portal.json'), JSON.stringify({ workspace: 'other', episodeId: EPISODE_ID }));
    const workspace = JSON.parse((await h.workspaceCheck({ episodeDir: dir, episodeId: EPISODE_ID })).text);
    assert.equal(workspace.workspaceMatches, false); assert.equal(workspace.portal, undefined);
    assert.equal(calls.length, before + 2, 'identity mismatches only query /me');
    const both = JSON.parse((await h.workspaceCheck({ episodeDir: dir, episodeId: STORYBOARD_ID })).text);
    assert.match(both.warning, /Workspace mismatch/); assert.match(both.warning, /Episode mismatch/);
    assert.equal(both.workspaceMatches, false); assert.equal(both.portal, undefined);
    assert.equal(calls.length, before + 3, 'simultaneous mismatches still only query /me');
  });

  it('workspace_check distinguishes missing pending entries from unreadable directories and dangling links', async (ctx) => {
    const dir = makeEpisodeDir(root, 'my-channel', 'ep-pending-errors');
    const sb = join(dir, 'storyboard'), side = join(sb, '.portal-head'), backups = join(sb, '.portal-local');
    episode.writePortalState(dir, { workspace: 'lab', episodeId: EPISODE_ID, headRevisionNo: 1 });
    const source = readFileSync(join(dir, '.portal.json'), 'utf8');
    const board = readFileSync(join(sb, 'scenes.js'), 'utf8');
    const { impl, calls } = fakeFetch({
      'GET /api/workspaces/lab/me': { success: true, data: { role: 'member' } },
      [`GET /api/workspaces/lab/episodes/${EPISODE_ID}`]: { success: true, data: { headRevisionNo: 1, lease: null } },
    });
    const h = portal.portalHandlers(impl);
    async function check() {
      const result = await h.workspaceCheck({ episodeDir: dir });
      assert.equal(result.isError, false, result.text);
      const out = JSON.parse(result.text);
      assert.equal(out.sync, 'in_sync'); assert.equal(out.portal.headRevisionNo, 1);
      assert.equal(readFileSync(join(dir, '.portal.json'), 'utf8'), source);
      assert.equal(readFileSync(join(sb, 'scenes.js'), 'utf8'), board);
      return out.pending;
    }
    assert.deepEqual(await check(), { sideDir: false, backups: 0 });
    mkdirSync(side); mkdirSync(join(backups, 'one'), { recursive: true });
    writeFileSync(join(backups, 'not-a-directory.txt'), 'ignored');
    assert.deepEqual(await check(), { sideDir: true, backups: 1 });
    for (const method of ['lstatSync', 'readdirSync']) {
      for (const target of [side, backups]) {
        const original = fs[method];
        const mock = ctx.mock.method(fs, method, function(file, ...args) {
          if (String(file) === target) throw Object.assign(new Error('injected'), { code: 'EACCES' });
          return original.call(this, file, ...args);
        }); syncBuiltinESMExports();
        try {
          const pending = await check(), field = target === side ? 'sideDir' : 'backups';
          assert.equal(pending[field], null); assert.match(pending.warnings[field], /Cannot read/);
          assert.equal(pending[target === side ? 'backups' : 'sideDir'], target === side ? 1 : true);
          assert.deepEqual(Object.keys(pending.warnings), [field]);
        } finally { mock.mock.restore(); syncBuiltinESMExports(); }
      }
    }
    for (const target of [side, backups]) {
      rmSync(target, { recursive: true }); symlinkSync(join(sb, 'missing'), target);
    }
    const broken = await check();
    assert.equal(broken.sideDir, null); assert.equal(broken.backups, null);
    assert.match(broken.warnings.sideDir, /Cannot read/); assert.match(broken.warnings.backups, /Cannot read/);
    assert.equal(fs.lstatSync(side).isSymbolicLink(), true); assert.equal(fs.lstatSync(backups).isSymbolicLink(), true);
    for (const target of [side, backups]) { rmSync(target); writeFileSync(target, 'wrong type'); }
    const wrongType = await check(); assert.equal(wrongType.sideDir, null); assert.equal(wrongType.backups, null);
    assert.ok(calls.every(c => c.method === 'GET'));
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

  it('all fifteen portal tools are defined and routed, and nothing else starts with portal_', () => {
    assert.equal(portal.PORTAL_TOOL_NAMES.length, 15);
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
