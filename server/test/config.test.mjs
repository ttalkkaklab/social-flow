/**
 * config.ts — the .env file under SNS_TOKEN_DIR (the key path for hosts that start the server
 * without a shell: Cowork, Claude Desktop, the ChatGPT desktop app) and the Blender binary lookup.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { blenderBin, loadEnvFile } from '../dist/config.js';

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

// blenderBin() is what capability_status reports under 3d_generation and what bake-blender.py
// spawns — the two must agree on the search order: BLENDER first, then the known install paths.
describe('blenderBin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blender-bin-'));
  const saved = process.env.BLENDER;
  after(() => {
    if (saved === undefined) delete process.env.BLENDER; else process.env.BLENDER = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it('BLENDER env wins when it points at an executable file', () => {
    const fake = join(dir, 'Blender');
    writeFileSync(fake, '#!/bin/sh\n', { mode: 0o755 });
    process.env.BLENDER = fake;
    assert.equal(blenderBin(), fake);
  });

  it('a BLENDER path that exists but cannot be executed is not reported as the binary', () => {
    const fake = join(dir, 'Blender-noexec');
    writeFileSync(fake, '#!/bin/sh\n', { mode: 0o644 });
    process.env.BLENDER = fake;
    assert.notEqual(blenderBin(), fake);
  });

  it('a BLENDER pointing at the app bundle directory is not reported as the binary', () => {
    // The realistic wrong value: /Applications/Blender.app is a directory, and a directory carries the
    // execute bit on unix, so an access(X_OK) test alone would accept it.
    process.env.BLENDER = dir;
    assert.notEqual(blenderBin(), dir);
  });

  it('a missing BLENDER path falls through to the install search, never to the bogus value', () => {
    process.env.BLENDER = '/nonexistent/blender-for-test';
    assert.notEqual(blenderBin(), '/nonexistent/blender-for-test');
  });
});

// npm test loads test/isolate.mjs first, so the developer's keys and ~/.config/social-flow stay out of every test.
it('npm test runs every file on an empty home without the shell\'s provider keys', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(scripts.test, /node --import \.\/test\/isolate\.mjs --test /);
});
