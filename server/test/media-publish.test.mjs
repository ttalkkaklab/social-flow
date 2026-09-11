import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveLocally, publishViaUpload, publishViaTunnel } from '../dist/media-publish.js';

const tmp = mkdtempSync(join(tmpdir(), 'sf-publish-'));
const clip = join(tmp, 'previz.mp4');
writeFileSync(clip, Buffer.from('0123456789abcdef'));

describe('media-publish — public URLs for the vendor\'s video input', () => {
  it('the loopback server serves only the listed files, with HEAD and byte ranges', async () => {
    const { server, port, routes } = await serveLocally([clip]);
    try {
      assert.equal(routes.length, 1);
      assert.match(routes[0], /^\/[0-9a-f]{32}\/0\/previz\.mp4$/);
      const base = `http://127.0.0.1:${port}`;
      const head = await fetch(base + routes[0], { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-type'), 'video/mp4');
      assert.equal(head.headers.get('content-length'), '16');
      const range = await fetch(base + routes[0], { headers: { Range: 'bytes=4-7' } });
      assert.equal(range.status, 206);
      assert.equal(await range.text(), '4567');
      assert.equal(range.headers.get('content-range'), 'bytes 4-7/16');
      const whole = await fetch(base + routes[0]);
      assert.equal(await whole.text(), '0123456789abcdef');
      assert.equal((await fetch(base + '/nope/0/previz.mp4')).status, 404);
      assert.equal((await fetch(base + routes[0], { method: 'POST' })).status, 404);
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });

  it('the hosting route POSTs raw bytes with the key and trusts only a reachable 201 data.url', async () => {
    const seen = [];
    const { server, port } = await new Promise((resolve) => {
      const s = http.createServer((req, res) => {
        if (req.method === 'POST') {
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            seen.push({ key: req.headers['x-api-key'], type: req.headers['content-type'], bytes: Buffer.concat(chunks).length });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: { url: `http://127.0.0.1:${port}/hosted/previz.mp4` } }));
          });
          return;
        }
        res.writeHead(req.url === '/hosted/previz.mp4' ? 200 : 404).end();
      });
      let port = 0;
      s.listen(0, '127.0.0.1', () => { port = s.address().port; resolve({ server: s, port }); });
    });
    try {
      const out = await publishViaUpload([clip], { endpoint: `http://127.0.0.1:${port}/api/media`, key: 'k', timeoutMs: 5000 });
      assert.equal(out.how, 'upload');
      assert.deepEqual(out.urls, [`http://127.0.0.1:${port}/hosted/previz.mp4`]);
      assert.deepEqual(seen, [{ key: 'k', type: 'video/mp4', bytes: 16 }]);
      await out.close();
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });

  it('the hosting route refuses a non-201 answer and an answer without a URL', async () => {
    const { server, port } = await new Promise((resolve) => {
      const s = http.createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          if (req.url === '/refuse') { res.writeHead(413).end('over the cap'); return; }
          res.writeHead(201, { 'Content-Type': 'application/json' }).end('{"data":{}}');
        });
      });
      s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
    });
    try {
      await assert.rejects(publishViaUpload([clip], { endpoint: `http://127.0.0.1:${port}/refuse`, key: 'k', timeoutMs: 5000 }), /HTTP 413/);
      await assert.rejects(publishViaUpload([clip], { endpoint: `http://127.0.0.1:${port}/nourl`, key: 'k', timeoutMs: 5000 }), /without data\.url/);
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });

  it('the tunnel route names both ways out when cloudflared is missing, and leaves no server behind', async () => {
    await assert.rejects(publishViaTunnel([clip], join(tmp, 'no-such-cloudflared')), /could not start cloudflared.*MEDIA_UPLOAD_URL/);
  });
});

process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
