/**
 * The .env file under SNS_TOKEN_DIR — the key path for hosts that start the server
 * without a shell (Cowork, Claude Desktop, the ChatGPT desktop app).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { loadEnvFile } from '../dist/config.js';

describe('env file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-env-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('fills unset, empty and unexpanded variables, never one the shell set', () => {
    const file = join(dir, '.env');
    writeFileSync(file, [
      '# comment',
      'SF_T_UNSET=a',
      'SF_T_EMPTY="b c"',
      "SF_T_TEMPLATE='d'",
      'export SF_T_SET=e',
      'not a line',
      '=bad',
      '',
    ].join('\n'));
    process.env.SF_T_EMPTY = '';
    process.env.SF_T_TEMPLATE = '${SF_T_TEMPLATE:-}';
    process.env.SF_T_ABSENT = '${SF_T_ABSENT}'; // a template the file does not resolve
    process.env.SF_T_SET = 'shell';

    assert.deepEqual(loadEnvFile(file), ['SF_T_UNSET', 'SF_T_EMPTY', 'SF_T_TEMPLATE']);
    assert.equal(process.env.SF_T_UNSET, 'a');
    assert.equal(process.env.SF_T_EMPTY, 'b c');
    assert.equal(process.env.SF_T_TEMPLATE, 'd');
    assert.equal(process.env.SF_T_ABSENT, undefined);
    assert.equal(process.env.SF_T_SET, 'shell');
  });

  it('a missing file fills nothing and is not an error', () => {
    assert.deepEqual(loadEnvFile(join(dir, 'absent')), []);
  });
});
