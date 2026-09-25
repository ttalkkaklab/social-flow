import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const scratch = mkdtempSync(path.join(tmpdir(), 'sf-portal-api-contract-'));
process.env.SNS_TOKEN_DIR = scratch;
process.env.TTALKKAKSTORY_API_URL = 'https://portal.test';
process.env.TTALKKAKSTORY_API_KEY = 'tks_contract_test_key';
delete process.env.TTALKKAKSTORY_WORKSPACE;
process.env.TTALKKAKSTORY_HOLDER = 'contract@test';

const contract = await import('../dist/portal-api-contract.js');
const portal = await import('../dist/portal-tools.js');
const { TOOLS } = await import('../dist/tools.js');
const { ROUTES } = await import('../dist/handlers.js');

after(() => rmSync(scratch, { recursive: true, force: true }));

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const parsed = new URL(url);
    if (parsed.pathname === '/api/token') {
      return Response.json({ success: true, data: { workspaceSlug: 'lab', workspaceName: 'Lab', role: 'member' } });
    }
    return handler(parsed, init);
  };
  return { calls, impl };
}

function payload(result) {
  assert.equal(result.isError, undefined, result.content[0]?.text);
  return JSON.parse(result.content[0].text);
}

describe('generated portal API contract', () => {
  it('registers every non-excluded operation once and keeps every exclusion explicit', () => {
    const named = contract.PORTAL_API_CONTRACT.operations.filter((operation) => operation.toolName);
    const excluded = contract.PORTAL_API_CONTRACT.operations.filter((operation) => operation.exclusionReason);
    assert.equal(named.length + excluded.length, contract.PORTAL_API_CONTRACT.operations.length);
    assert.equal(contract.PORTAL_API_TOOL_NAMES.length, named.length);
    assert.equal(new Set(contract.PORTAL_API_TOOL_NAMES).size, named.length);
    for (const name of contract.PORTAL_API_TOOL_NAMES) {
      assert.equal(TOOLS.filter((tool) => tool.name === name).length, 1, name);
      assert.equal(typeof ROUTES[name], 'function', name);
      assert.ok(portal.PORTAL_TOOL_NAMES.includes(name), name);
    }
  });

  it('calls a workspace GET with path and query fields from the exact schema', async () => {
    const { calls, impl } = fakeFetch((url) => {
      assert.equal(url.pathname, '/api/workspaces/lab/scenes/search');
      assert.equal(url.searchParams.get('q'), '등대');
      assert.equal(url.searchParams.get('limit'), '12');
      return Response.json({ success: true, data: { items: [{ id: 'scene-1' }] } });
    });
    const result = payload(await contract.runPortalApiTool(
      'portal_api_scenes_search_get',
      { query: { q: '등대', limit: 12 } },
      impl,
    ));
    assert.equal(result.status, 200);
    assert.equal(result.data.items[0].id, 'scene-1');
    assert.equal(calls[1].init.headers.authorization, 'Bearer tks_contract_test_key');
  });

  it('passes JSON bodies unchanged and supplies the configured holder query', async () => {
    const episodeId = '11111111-1111-4111-8111-111111111111';
    const { impl } = fakeFetch((url, init) => {
      assert.equal(url.pathname, `/api/workspaces/lab/episodes/${episodeId}`);
      assert.equal(url.searchParams.get('holder'), 'contract@test');
      assert.equal(init.method, 'PATCH');
      assert.deepEqual(JSON.parse(init.body), { title: '새 제목', stage: 'board' });
      return Response.json({ success: true, data: { id: episodeId, title: '새 제목' } });
    });
    const result = payload(await contract.runPortalApiTool(
      'portal_api_episodes_episode_patch',
      { episodeId, body: { title: '새 제목', stage: 'board' } },
      impl,
    ));
    assert.equal(result.data.title, '새 제목');
  });

  it('allows bodyless lease release and revision restore exactly as the API contract does', async () => {
    const episodeId = '11111111-1111-4111-8111-111111111111';
    const seen = [];
    const { impl } = fakeFetch((url, init) => {
      seen.push({ path: url.pathname, method: init.method, body: init.body });
      return Response.json({ success: true, data: { ok: true } });
    });
    payload(await contract.runPortalApiTool(
      'portal_api_episodes_episode_lease_delete',
      { episodeId },
      impl,
    ));
    payload(await contract.runPortalApiTool(
      'portal_api_episodes_episode_revisions_revision_restore_post',
      { episodeId, revisionNo: 3 },
      impl,
    ));
    assert.deepEqual(seen, [
      { path: `/api/workspaces/lab/episodes/${episodeId}/lease`, method: 'DELETE', body: undefined },
      { path: `/api/workspaces/lab/episodes/${episodeId}/revisions/3/restore`, method: 'POST', body: undefined },
    ]);
  });

  it('uploads raw bytes with the contract headers', async () => {
    const file = path.join(scratch, 'asset.bin');
    writeFileSync(file, Buffer.from([1, 2, 3, 4]));
    const assetId = '22222222-2222-4222-8222-222222222222';
    const { impl } = fakeFetch((url, init) => {
      assert.equal(url.pathname, `/api/assets/${assetId}/binary`);
      assert.equal(init.method, 'PUT');
      assert.equal(init.headers['content-type'], 'application/octet-stream');
      assert.equal(init.headers['x-asset-sha256'], 'a'.repeat(64));
      assert.deepEqual(Buffer.from(init.body), Buffer.from([1, 2, 3, 4]));
      return Response.json({ success: true, data: { stored: true } });
    });
    const result = payload(await contract.runPortalApiTool(
      'portal_api_assets_asset_binary_put',
      { assetId, file, contentType: 'application/octet-stream', sha256: 'a'.repeat(64) },
      impl,
    ));
    assert.equal(result.data.stored, true);
  });

  it('streams binary GETs to a new absolute file and refuses overwrite', async () => {
    const targetFile = path.join(scratch, 'download.bin');
    const assetId = '33333333-3333-4333-8333-333333333333';
    const { impl } = fakeFetch((url) => {
      assert.equal(url.pathname, `/api/assets/${assetId}/binary`);
      return new Response(Buffer.from('portal-bytes'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    });
    const first = payload(await contract.runPortalApiTool(
      'portal_api_assets_asset_binary_get',
      { assetId, targetFile },
      impl,
    ));
    assert.equal(first.data.byteSize, 12);
    assert.equal(readFileSync(targetFile, 'utf8'), 'portal-bytes');
    const second = await contract.runPortalApiTool(
      'portal_api_assets_asset_binary_get',
      { assetId, targetFile },
      impl,
    );
    assert.equal(second.isError, true);
    assert.match(second.content[0].text, /EEXIST/);
  });

  it('cancels the binary response body when the destination already exists', async () => {
    const targetFile = path.join(scratch, 'occupied.bin');
    writeFileSync(targetFile, 'keep');
    let cancelled = false;
    const body = new ReadableStream({
      pull() {},
      cancel() { cancelled = true; },
    });
    const assetId = '55555555-5555-4555-8555-555555555555';
    const { impl } = fakeFetch(() => new Response(body, { status: 200 }));
    const result = await contract.runPortalApiTool(
      'portal_api_assets_asset_binary_get',
      { assetId, targetFile },
      impl,
    );
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /EEXIST/);
    assert.equal(cancelled, true);
    assert.equal(readFileSync(targetFile, 'utf8'), 'keep');
  });

  it('returns a conditional binary 304 without creating the destination', async () => {
    const targetFile = path.join(scratch, 'not-modified.bin');
    const assetId = '44444444-4444-4444-8444-444444444444';
    const { impl } = fakeFetch((_url, init) => {
      assert.equal(init.headers['if-none-match'], '"same"');
      return new Response(null, { status: 304 });
    });
    const result = payload(await contract.runPortalApiTool(
      'portal_api_assets_asset_binary_get',
      { assetId, targetFile, ifNoneMatch: '"same"' },
      impl,
    ));
    assert.equal(result.status, 304);
    assert.equal(result.data, null);
    assert.equal(existsSync(targetFile), false);
  });

  it('rejects unknown and missing top-level fields before the portal call', async () => {
    const { calls, impl } = fakeFetch(() => Response.json({ success: true, data: {} }));
    const unknown = await contract.runPortalApiTool('portal_api_projects_get', { surprise: true }, impl);
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /Unknown argument/);
    const missing = await contract.runPortalApiTool('portal_api_projects_project_get', {}, impl);
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /Missing required argument/);
    assert.equal(calls.length, 0);
  });

  it('rejects traversal-shaped path fields and relative upload paths before the portal call', async () => {
    const { calls, impl } = fakeFetch(() => Response.json({ success: true, data: {} }));
    const traversal = await contract.runPortalApiTool(
      'portal_api_projects_project_get',
      { projectId: '..' },
      impl,
    );
    assert.equal(traversal.isError, true);
    assert.match(traversal.content[0].text, /Invalid path argument/);
    const relative = await contract.runPortalApiTool(
      'portal_api_assets_asset_binary_put',
      {
        assetId: '22222222-2222-4222-8222-222222222222',
        file: 'asset.bin',
        contentType: 'application/octet-stream',
        sha256: 'a'.repeat(64),
      },
      impl,
    );
    assert.equal(relative.isError, true);
    assert.match(relative.content[0].text, /absolute local path/);
    assert.equal(calls.length, 0);
  });
});
