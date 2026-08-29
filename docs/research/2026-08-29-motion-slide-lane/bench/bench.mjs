// 상주 페이지 + WAAPI seek + 스크린샷 처리량·결정성 벤치
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const N = parseInt(process.argv[2] || '90', 10);     // 프레임 수 (30fps × 3초)
const OUT = process.argv[3] || path.join(HERE, 'frames');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(HERE, 'card.html'));
await page.evaluate(() => document.fonts.ready);

const t0 = performance.now();
let anims = 0;
const hashes = [];
for (let i = 0; i < N; i++) {
  anims = await page.evaluate(t => window.__seek(t), i * 1000 / 30);
  const f = path.join(OUT, `f${String(i).padStart(4, '0')}.png`);
  await page.screenshot({ path: f });
  hashes.push(createHash('md5').update(readFileSync(f)).digest('hex').slice(0, 8));
}
const dt = (performance.now() - t0) / 1000;
await browser.close();
const distinct = new Set(hashes).size;
console.log(JSON.stringify({ frames: N, seconds: +dt.toFixed(2), fps: +(N / dt).toFixed(1), animations: anims, distinctFrames: distinct, firstHash: hashes[0], lastHash: hashes[N - 1] }));
