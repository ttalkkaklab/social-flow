import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'portal-artifacts-'));
process.env.SNS_TOKEN_DIR = join(root, 'tokens');
for (const key of ['TTALKKAKSTORY_API_URL', 'TTALKKAKSTORY_WORKSPACE', 'TTALKKAKSTORY_API_KEY', 'TTALKKAKSTORY_HOLDER']) delete process.env[key];
const { syncEpisodeArtifacts, recordPublication } = await import('../dist/portal-artifacts.js');
const { writePortalState } = await import('../dist/portal-episode.js');
const { TOOLS } = await import('../dist/tools.js');
const episodeId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';
const dir = join(root, 'data', 'channel', 'episodes', 'ep');

function credential() {
  const target = join(root, 'tokens', 'channel');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'ttalkkakstory.json'), JSON.stringify({ apiUrl: 'https://portal.test', apiKey: 'tks_artifacts' }));
}

function server() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url), method = init.method ?? 'GET';
    if (parsed.pathname === '/api/token') return Response.json({ success: true, data: { workspaceSlug: 'lab', workspaceName: 'Lab', role: 'member' } });
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ method, path: parsed.pathname, body });
    if (parsed.pathname.endsWith('/media')) return Response.json({ success: true, data: { id: mediaId, kind: 'image', sha256: 'x', mime: 'image/jpeg', byteSize: body.length } }, { status: 201 });
    if (parsed.pathname.endsWith('/artifacts')) return Response.json({ success: true, data: body });
    if (parsed.pathname.endsWith('/publications')) return Response.json({ success: true, data: { publications: [body] } }, { status: 201 });
    return Response.json({ success: false, error: 'missing route' }, { status: 404 });
  };
  return { fetch, calls };
}

beforeEach(() => {
  rmSync(join(root, 'tokens'), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'output', 'youtube'), { recursive: true });
  mkdirSync(join(dir, 'output', 'instagram'), { recursive: true });
  mkdirSync(join(dir, 'output', 'video'), { recursive: true });
  mkdirSync(join(dir, '.work'), { recursive: true });
  writePortalState(dir, { workspace: 'lab', episodeId, headRevisionNo: 1 });
});
after(() => rmSync(root, { recursive: true, force: true }));

describe('portal episode artifacts and publication record', () => {
  it('reads platform files, uploads one cover and prices the actual tally', async () => {
    credential();
    writeFileSync(join(dir, 'output', 'youtube', 'meta.md'), '## title\n첫 제목\n\n## description\n두 번째 훅 #Shorts\n\n## tags\n#Shorts, #역사\n\n## publish\npublic\n');
    writeFileSync(join(dir, 'output', 'instagram', 'caption.md'), '인스타 문구 #역사');
    writeFileSync(join(dir, 'output', 'video', 'cover.jpg'), 'jpeg fixture');
    writeFileSync(join(dir, '.work', 'cost-tally.tsv'), 'image.local\t2\tproduce: local\nimage.gpt-image-2.high\t1\tproduce: cover\n');
    const s = server();
    const result = await syncEpisodeArtifacts({ episodeDir: dir, uploadCover: true }, s.fetch);
    assert.equal(result.outputs.length, 2);
    assert.equal(result.outputs[0].title, '첫 제목');
    assert.equal(result.outputs[0].coverMediaId, mediaId);
    assert.deepEqual(result.outputs[1].hashtags, ['#역사']);
    assert.equal(result.costs.complete, true);
    assert.ok(result.costs.actualUsd > 0);
    assert.deepEqual(s.calls.map(call => `${call.method} ${call.path.split('/').at(-1)}`), ['POST media', 'PUT artifacts']);
  });

  it('records the exact permanent link and exposes both MCP tools', async () => {
    credential(); const s = server();
    const result = await recordPublication({ episodeDir: dir, platform: 'youtube', postId: 'abc', permalink: 'https://youtu.be/abc', approvedBy: 'owner', publishedAt: '2026-09-24T00:00:00.000Z' }, s.fetch);
    assert.equal(result.publications[0].permalink, 'https://youtu.be/abc');
    for (const name of ['portal_episode_artifacts_sync', 'portal_publication_record']) assert.ok(TOOLS.some(tool => tool.name === name));
  });
});
