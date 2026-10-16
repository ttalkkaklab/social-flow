import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { capture } = require('../../skills/produce/references/capture-viewport.js');
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('narrow captures render at 390 CSS pixels rather than clipping a 500px layout', { skip: !existsSync(chrome) }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sf-viewport-test-'));
  try {
    const html = path.join(directory, 'input.html'), output = path.join(directory, 'output.png');
    writeFileSync(html, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#eee}</style><p>모바일 캡처</p>');
    const result = await capture({ chrome, url: pathToFileURL(html).href, output, width: 390, height: 844 });
    assert.deepEqual(result, { width: 390, height: 844, dpr: 1 });
    const png = readFileSync(output);
    assert.equal(png.readUInt32BE(16), 390);
    assert.equal(png.readUInt32BE(20), 844);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('viewport capture rejects invalid dimensions before launching Chrome', async () => {
  await assert.rejects(capture({ chrome, width: 0, height: 844 }), /integers from 1 to 16384/);
});
