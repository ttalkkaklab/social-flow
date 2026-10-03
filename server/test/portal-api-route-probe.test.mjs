import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

const scratch = mkdtempSync(path.join(tmpdir(), 'sf-portal-api-all-'));
process.env.SNS_TOKEN_DIR = scratch;
process.env.TTALKKAKSTORY_API_URL = 'https://portal.test';
process.env.TTALKKAKSTORY_API_KEY = 'tks_all_operations_key';
delete process.env.TTALKKAKSTORY_WORKSPACE;
process.env.TTALKKAKSTORY_HOLDER = 'all-operations@test';

const contract = await import('../dist/portal-api-contract.js');
const uploadFile = path.join(scratch, 'upload.bin');
writeFileSync(uploadFile, 'probe');

after(() => rmSync(scratch, { recursive: true, force: true }));

function valueFor(key, schema = {}) {
  if (key === 'body' || key === 'query') return {};
  if (key === 'file') return uploadFile;
  if (key === 'contentType') return 'application/octet-stream';
  if (key === 'sha256') return 'a'.repeat(64);
  if (key === 'range') return 'bytes=0-3';
  if (key === 'ifRange' || key === 'ifNoneMatch') return '"probe"';
  if (key === 'provenance') return {};
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return {};
  return key.toLowerCase().includes('id')
    ? '11111111-1111-4111-8111-111111111111'
    : 'probe';
}

function argsFor(operation, index) {
  const properties = operation.inputSchema.properties ?? {};
  const args = {};
  for (const key of operation.inputSchema.required ?? []) args[key] = valueFor(key, properties[key]);
  for (const key of operation.path.matchAll(/\[([^\]]+)\]/g)) {
    args[key[1]] ??= valueFor(key[1], properties[key[1]]);
  }
  if (operation.bodyEncoding === 'raw') args.file = uploadFile;
  if (operation.response === 'binary' && operation.method !== 'HEAD') {
    args.targetFile = path.join(scratch, `download-${index}.bin`);
  }
  return args;
}

describe('generated portal API operation wiring', () => {
  it('routes all 101 named operations through their declared method and path', async () => {
    const seen = [];
    let tokenResolved = false;
    const fetchImpl = async (input, init = {}) => {
      const url = new URL(input);
      if (!tokenResolved && url.pathname === '/api/token') {
        tokenResolved = true;
        return Response.json({ success: true, data: { workspaceSlug: 'lab', workspaceName: 'Lab', role: 'member' } });
      }
      seen.push({ pathname: url.pathname, method: init.method });
      const operation = contract.PORTAL_API_OPERATIONS[seen.length - 1];
      if (operation.response === 'binary') return new Response(Buffer.from('probe'));
      if (operation.response === 'text') return new Response('probe');
      return Response.json({ success: true, data: { ok: true } });
    };

    // 사본 크기 단정 — 「사본이 내가 아는 그 사본이다」, 곧 드리프트 경보다. 리터럴이어야 뜻이
    // 선다. 이 값은 계산한 것이 아니라 **다시 들여온 사본에서 센 값**이다:
    //   python3 -c "import json;o=json.load(open('server/src/portal-api-contract.json'))['operations'];print(sum(1 for x in o if x.get('toolName')))"
    // 포털 계약이 늘면 이 수도 그 자리에서 다시 세어 적는다. `>=` 류로 느슨하게 두면 다음
    // 드리프트를 못 잡는다 — 97 이 101 로, 101 이 110 으로 벌어진 것이 그 기제다.
    assert.equal(contract.PORTAL_API_OPERATIONS.length, 110);
    for (const [index, operation] of contract.PORTAL_API_OPERATIONS.entries()) {
      const name = `portal_${operation.toolName}`;
      const result = await contract.runPortalApiTool(name, argsFor(operation, index), fetchImpl);
      assert.equal(result.isError, undefined, `${name}: ${result.content[0]?.text}`);
      const expectedPath = operation.path.replace(/\[([^\]]+)\]/g, (_, key) => encodeURIComponent(argsFor(operation, index)[key]));
      assert.deepEqual(seen[index], {
        pathname: `${operation.scope === 'workspace' ? '/api/workspaces/lab' : ''}${expectedPath}`,
        method: operation.method,
      }, name);
    }
    // 전수 단정 — 「모든 연산을 실제로 찔렀다」다. 수를 베끼지 않고 그것을 직접 말한다.
    assert.equal(seen.length, contract.PORTAL_API_OPERATIONS.length);
  });
});
