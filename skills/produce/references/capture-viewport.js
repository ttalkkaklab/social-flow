#!/usr/bin/env node
'use strict';
// Chrome's native headless window can clamp narrow viewports to 500 CSS pixels.
// Render through a private DevTools pipe so the layout viewport, not only the PNG,
// matches the requested size. This helper is used only by capture-frames.sh.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function capture({ chrome, url, output, width, height, alpha = false }) {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 16384))
    throw new Error('Capture width and height must be integers from 1 to 16384');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-capture-'));
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-pipe', '--hide-scrollbars',
    '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let serial = 0, pending = new Map(), buffer = '';
  const fail = error => { for (const request of pending.values()) request.reject(error); pending.clear(); };
  child.on('error', fail);
  const closed = new Promise(resolve => child.once('close', resolve));
  child.once('close', () => fail(new Error('Chrome exited before capture completed')));
  child.stdio[4].setEncoding('utf8');
  child.stdio[3].on('error', fail);
  child.stdio[4].on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const timeout = setTimeout(() => { fail(new Error('Viewport capture timed out')); child.kill('SIGKILL'); }, 20000);
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    if (alpha) await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const navigation = await page('Page.navigate', { url });
    if (navigation.errorText) throw new Error(navigation.errorText);
    const ready = await page('Runtime.evaluate', { awaitPromise: true, returnByValue: true,
      expression: `(async () => {
        if (document.readyState !== 'complete') await new Promise(resolve => addEventListener('load', resolve, {once:true}));
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {width: innerWidth, height: innerHeight, dpr: devicePixelRatio};
      })()` });
    const viewport = ready.result?.value;
    if (!viewport || viewport.width !== width || viewport.height !== height || viewport.dpr !== 1)
      throw new Error('Chrome layout viewport does not match the requested capture');
    const result = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(output, Buffer.from(result.data, 'base64'));
    return viewport;
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await closed;
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

module.exports = { capture };
if (require.main === module) {
  const [chrome, url, output, width, height, alpha] = process.argv.slice(2);
  capture({ chrome, url, output, width: Number(width), height: Number(height), alpha: alpha === '1' })
    .then(viewport => console.log(JSON.stringify(viewport)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
