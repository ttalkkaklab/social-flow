/**
 * stock_search contract — the four providers normalize to one item shape with a
 * `visual.license` block the storyboard checker accepts, Commons is filtered to licenses an
 * edited monetized cut may carry, and one provider failing never hides the others.
 * Everything runs on a mocked fetch — no network, no keys beyond the two fakes set below.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';

process.env.PEXELS_API_KEY = 'pexels-test-key';
process.env.PIXABAY_API_KEY = 'pixabay-test-key';
const { stockSearch, commonsLicenseAllowed, STOCK_PROVIDERS } = await import('../dist/stock-client.js');
// render-routing.js is a browser/CommonJS dual module — it has no ESM named exports
const { checkLicense } = createRequire(import.meta.url)(path.resolve(import.meta.dirname, '../../skills/storyboard/references/render-routing.js'));

const origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = origFetch; });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const PEXELS_VIDEO = { videos: [{
  id: 1234, url: 'https://www.pexels.com/video/tram-1234/', duration: 12, width: 1080, height: 1920, image: 'https://images.pexels.com/t.jpg',
  user: { name: 'Ana Films', url: 'https://www.pexels.com/@ana' },
  video_files: [
    { link: 'https://videos.pexels.com/hd.mp4', quality: 'hd', width: 1080, height: 1920, file_type: 'video/mp4', fps: 30 },
    { link: 'https://videos.pexels.com/sd.mp4', quality: 'sd', width: 540, height: 960, file_type: 'video/mp4', fps: 30 },
    { link: 'https://videos.pexels.com/x.m3u8', quality: 'hls', file_type: 'application/x-mpegURL' },
  ],
}] };
const PIXABAY_VIDEO = { hits: [{
  id: 55, pageURL: 'https://pixabay.com/videos/id-55/', duration: 9, user: 'kim', tags: 'seoul, street',
  videos: { large: { url: 'https://cdn.pixabay.com/l.mp4', width: 1080, height: 1920, thumbnail: 'https://cdn.pixabay.com/l.jpg' },
            medium: { url: 'https://cdn.pixabay.com/m.mp4', width: 720, height: 1280, thumbnail: 'https://cdn.pixabay.com/m.jpg' } },
}, {
  id: 56, pageURL: 'https://pixabay.com/videos/id-56/', duration: 20, user: 'lee', tags: 'wide',
  videos: { large: { url: 'https://cdn.pixabay.com/w.mp4', width: 1920, height: 1080, thumbnail: '' } },
}] };
const NASA_SEARCH = { collection: { items: [{
  data: [{ nasa_id: 'A11-launch', title: 'Apollo 11 launch', center: 'KSC', description: 'Saturn V lifts off', media_type: 'video' }],
  links: [{ href: 'https://images-assets.nasa.gov/video/A11-launch/A11-launch~thumb.jpg' }],
}] } };
const NASA_ASSET = { collection: { items: [
  { href: 'http://images-assets.nasa.gov/video/A11-launch/A11-launch~medium.mp4' },
  { href: 'http://images-assets.nasa.gov/video/A11-launch/A11-launch~orig.mp4' },
  { href: 'http://images-assets.nasa.gov/video/A11-launch/A11-launch~preview.mp4' },
  { href: 'http://images-assets.nasa.gov/video/A11-launch/A11-launch~thumb.jpg' },
] } };
const commonsPage = (pageid, title, license, shortName, extra = {}) => ({
  pageid, title,
  imageinfo: [{ url: `https://upload.wikimedia.org/${pageid}.webm`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${pageid}.webm`,
    mime: 'video/webm', width: 960, height: 540, duration: 24.1,
    extmetadata: { License: { value: license }, LicenseShortName: { value: shortName }, Artist: { value: '<a href="x">Lt. Strickland</a>' },
      AttributionRequired: { value: /^pd/.test(license) ? 'false' : 'true' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0' }, ...extra } }],
});
const COMMONS = { query: { pages: [
  commonsPage(1, 'File:Seoul 1950.webm', 'pd', 'Public domain'),
  commonsPage(2, 'File:Seoul night.webm', 'cc-by-sa-4.0', 'CC BY-SA 4.0'),
  commonsPage(3, 'File:Tehran drive.webm', 'cc-by-3.0', 'CC BY 3.0', { Attribution: { value: 'Glimpse of Tehran' } }),
  commonsPage(4, 'File:Market.webm', 'cc-by-nc-2.0', 'CC BY-NC 2.0'),
] } };

function mockAll(overrides = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    for (const [prefix, handler] of Object.entries(overrides)) if (u.startsWith(prefix)) return handler(u);
    if (u.startsWith('https://api.pexels.com/videos/search')) return json(PEXELS_VIDEO);
    if (u.startsWith('https://pixabay.com/api/videos/')) return json(PIXABAY_VIDEO);
    if (u.startsWith('https://images-api.nasa.gov/search')) return json(NASA_SEARCH);
    if (u.startsWith('https://images-api.nasa.gov/asset/')) return json(NASA_ASSET);
    if (u.startsWith('https://commons.wikimedia.org/w/api.php')) return json(COMMONS);
    throw new Error('unexpected url ' + u);
  };
}

describe('stock_search normalization', () => {
  it('returns one item shape across the four providers, largest file first, license block first', async () => {
    mockAll();
    const r = await stockSearch({ query: 'seoul street', media: 'video' });
    assert.equal(r.isError, false);
    const out = JSON.parse(r.text);
    assert.deepEqual(Object.keys(out.providers), [...STOCK_PROVIDERS]);
    const by = Object.fromEntries(out.items.map((i) => [i.provider + ':' + i.id, i]));
    const pexels = by['pexels:1234'];
    assert.equal(pexels.files[0].url, 'https://videos.pexels.com/hd.mp4', 'mp4 files sorted by height, HLS dropped');
    assert.equal(pexels.files.length, 2);
    assert.equal(pexels.license.attribution, 'Video by Ana Films on Pexels');
    assert.equal(pexels.license.attributionRequired, false);
    const pixabay = by['pixabay:55'];
    assert.equal(pixabay.width, 1080);
    assert.equal(pixabay.files[0].label, 'large');
    const nasa = by['nasa:A11-launch'];
    assert.equal(nasa.files[0].url, 'https://images-assets.nasa.gov/video/A11-launch/A11-launch~orig.mp4', 'orig first, https, previews dropped');
    assert.equal(nasa.files.length, 2);
    assert.equal(nasa.license.attribution, 'NASA/KSC');
    assert.match(nasa.license.note, /insignia/);
    // every license block passes the storyboard checker unchanged
    for (const item of out.items) assert.deepEqual(checkLicense({ license: item.license }), [], item.provider);
  });

  it('applies orientation, minWidth and duration after the call, per provider limit', async () => {
    mockAll();
    const r = JSON.parse((await stockSearch({ query: 'seoul', media: 'video', orientation: 'portrait', maxDuration: 15 })).text);
    const ids = r.items.map((i) => i.provider + ':' + i.id);
    assert.ok(ids.includes('pixabay:55'));
    assert.ok(!ids.includes('pixabay:56'), 'landscape and 20s dropped');
    assert.ok(ids.includes('nasa:A11-launch'), 'NASA has no dimensions so orientation does not drop it');
    assert.ok(!ids.includes('commons:1'), 'a 960x540 landscape archive clip is dropped by portrait');
  });
});

describe('commons license filter', () => {
  it('keeps public domain, CC0 and plain CC BY only', () => {
    assert.equal(commonsLicenseAllowed('pd', 'Public domain'), true);
    assert.equal(commonsLicenseAllowed('pd-us', ''), true);
    assert.equal(commonsLicenseAllowed('cc-zero', 'CC0'), true);
    assert.equal(commonsLicenseAllowed('cc-by-4.0', 'CC BY 4.0'), true);
    assert.equal(commonsLicenseAllowed('cc-by-2.5-au', ''), true);
    assert.equal(commonsLicenseAllowed('cc-by-sa-4.0', 'CC BY-SA 4.0'), false);
    assert.equal(commonsLicenseAllowed('cc-by-nc-2.0', ''), false);
    assert.equal(commonsLicenseAllowed('cc-by-nd-3.0', ''), false);
    assert.equal(commonsLicenseAllowed('gfdl', 'GFDL'), false);
    assert.equal(commonsLicenseAllowed('', 'Public domain'), true);
    assert.equal(commonsLicenseAllowed('', 'Creative Commons Attribution-Share Alike 4.0'), false);
    assert.equal(commonsLicenseAllowed(undefined, undefined), false);
  });

  it('drops share-alike and non-commercial files, counts them, and builds a CC BY credit', async () => {
    mockAll();
    const r = JSON.parse((await stockSearch({ query: 'seoul', media: 'video', providers: ['commons'], orientation: 'any' })).text);
    assert.equal(r.items.length, 2);
    assert.match(r.providers.commons.note, /^2 file\(s\) dropped/);
    const pd = r.items.find((i) => i.id === '1'), by = r.items.find((i) => i.id === '3');
    assert.equal(pd.license.attributionRequired, false);
    assert.equal(pd.author, 'Lt. Strickland', 'artist html stripped');
    assert.equal(by.license.attributionRequired, true);
    assert.equal(by.license.attribution, 'Glimpse of Tehran, CC BY 3.0, via Wikimedia Commons');
    assert.match(by.license.note, /WebM/);
    assert.deepEqual(checkLicense({ license: by.license }), []);
  });
});

describe('provider isolation', () => {
  it('a failing provider is reported in its own note and the rest still answer', async () => {
    mockAll({ 'https://api.pexels.com/': () => json({ error: 'rate limited' }, 429) });
    const r = await stockSearch({ query: 'seoul', media: 'video' });
    const out = JSON.parse(r.text);
    assert.equal(r.isError, false);
    assert.match(out.providers.pexels.note, /^failed — HTTP 429/);
    assert.equal(out.providers.pexels.count, 0);
    assert.ok(out.items.some((i) => i.provider === 'nasa'));
  });

  it('a missing key skips that provider with a note instead of failing the call', async () => {
    const { pexelsApiKey } = (await import('../dist/config.js')).config;
    assert.equal(pexelsApiKey, 'pexels-test-key');
    mockAll({ 'https://api.pexels.com/': () => json(PEXELS_VIDEO) });
    const config = (await import('../dist/config.js')).config;
    const saved = config.pixabayApiKey;
    config.pixabayApiKey = '';
    try {
      const out = JSON.parse((await stockSearch({ query: 'seoul', media: 'video', providers: ['pixabay', 'nasa'] })).text);
      assert.match(out.providers.pixabay.note, /^skipped — PIXABAY_API_KEY/);
      assert.ok(out.items.every((i) => i.provider === 'nasa'));
    } finally {
      config.pixabayApiKey = saved;
    }
  });

  it('is an error only when every requested provider failed or was skipped', async () => {
    mockAll({ 'https://images-api.nasa.gov/': () => { throw new Error('offline'); } });
    const r = await stockSearch({ query: 'moon', media: 'photo', providers: ['nasa'] });
    assert.equal(r.isError, true);
    assert.match(JSON.parse(r.text).providers.nasa.note, /offline/);
  });
});
