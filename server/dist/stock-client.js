/**
 * stock_search — free, commercially usable photos and clips from four providers, each item
 * carrying the `visual.license` record that check-scenes.js requires on a
 * `visual.source: "stock"` cut (scenes-schema §stock material).
 *
 * Why the record is built here and not by the caller: the license terms are per provider
 * (Pexels License, Pixabay Content License, US government work, a per-file CC tag on
 * Commons), and the storyboard should paste a block it cannot get wrong. Commons is the one
 * provider whose files carry different licenses, so it is filtered to public domain, CC0 and
 * plain CC BY — share-alike would spread to the edited cut and non-commercial is out on a
 * monetized channel (docs/research/2026-09-07-free-stock-sources).
 *
 * Measured 2026-09-07: Pexels and Pixabay need a key; NASA (images-api.nasa.gov) and the
 * Commons MediaWiki API answer without one (Commons asks for a User-Agent).
 */
import { config } from './config.js';
import { buildQuery, requestRaw } from './http.js';
export const STOCK_PROVIDERS = ['pexels', 'pixabay', 'nasa', 'commons'];
export const STOCK_MEDIA = ['video', 'photo'];
export const STOCK_ORIENTATIONS = ['portrait', 'landscape', 'square', 'any'];
/** Schema cap for stock_search.limit — per provider; must match handlers.ts */
export const STOCK_MAX_LIMIT = 30;
/** NASA needs one manifest request per item to learn the file URLs, so its page is smaller */
const NASA_MAX = 10;
const USER_AGENT = 'social-flow-mcp (https://github.com/ttalkkaklab/social-flow)';
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const stripTags = (v) => str(String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' '));
function compact(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null || value === '')
            continue;
        if (Array.isArray(value) && value.length === 0)
            continue;
        out[key] = value;
    }
    return out;
}
/** Pexels sends its key in a header, Pixabay in the query string — an error that quotes the URL must not carry it */
function maskKey(text) {
    return text.replace(/([?&](?:key|api_key)=)[^&\s"')]+/g, '$1***');
}
async function getJson(url, headers = {}) {
    const res = await requestRaw('get', url, headers);
    if (!res.ok)
        throw new Error(maskKey(`HTTP ${res.status}: ${res.body.slice(0, 200)}`));
    try {
        return JSON.parse(res.body);
    }
    catch {
        throw new Error(maskKey(`non-JSON response from ${url}`));
    }
}
/** Orientation is filtered here, after the call: only Pexels and Pixabay photos take it as a parameter */
function orientationOf(width, height) {
    if (!width || !height)
        return undefined;
    if (Math.abs(width - height) / Math.max(width, height) < 0.05)
        return 'square';
    return height > width ? 'portrait' : 'landscape';
}
function keep(item, input) {
    const wanted = input.orientation && input.orientation !== 'any' ? input.orientation : undefined;
    const actual = orientationOf(item.width, item.height);
    if (wanted && actual && actual !== wanted)
        return false;
    if (input.minWidth && item.width && item.width < input.minWidth)
        return false;
    if (item.media === 'video' && item.duration !== undefined) {
        if (input.minDuration !== undefined && item.duration < input.minDuration)
            return false;
        if (input.maxDuration !== undefined && item.duration > input.maxDuration)
            return false;
    }
    return true;
}
// ── Pexels ──────────────────────────────────────────────────────────
const PEXELS_LICENSE = {
    license: 'Pexels License',
    licenseUrl: 'https://www.pexels.com/license/',
    note: 'No credit required. Do not imply endorsement by the people or brands shown, do not show identifiable people in a bad light, no standalone redistribution.',
};
async function pexels(input, media, limit) {
    const key = config.pexelsApiKey;
    if (!key)
        return { items: [], note: 'skipped — PEXELS_API_KEY is not set (https://www.pexels.com/api/)' };
    const orientation = input.orientation && input.orientation !== 'any' ? input.orientation : undefined;
    const base = media === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search';
    const json = (await getJson(base + buildQuery({ query: input.query, orientation, per_page: Math.min(80, limit * 2), locale: input.locale }), { Authorization: key }));
    const rows = (media === 'video' ? json.videos : json.photos) ?? [];
    const items = rows.map((r) => {
        const author = str(r.user?.name) ?? str(r.photographer);
        const authorUrl = str(r.user?.url) ?? str(r.photographer_url);
        const files = media === 'video'
            ? (r.video_files ?? [])
                .filter((f) => !f.file_type || /mp4/i.test(String(f.file_type)))
                .map((f) => compact({ url: String(f.link), width: num(f.width), height: num(f.height), label: str(f.quality), mime: str(f.file_type) }))
                .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
            : [{ url: String(r.src?.original), width: num(r.width), height: num(r.height), label: 'original', mime: 'image/jpeg' },
                { url: String(r.src?.large2x), label: 'large2x (1880w)', mime: 'image/jpeg' }].filter((f) => f.url && f.url !== 'undefined');
        return compact({
            provider: 'pexels', id: String(r.id), media, title: str(r.alt), pageUrl: String(r.url), author,
            width: num(r.width), height: num(r.height), duration: num(r.duration),
            thumbnail: str(r.image) ?? str(r.src?.medium), files,
            license: compact({
                provider: 'pexels', url: String(r.url), ...PEXELS_LICENSE, author, authorUrl,
                attributionRequired: false, attribution: `${media === 'video' ? 'Video' : 'Photo'} by ${author ?? 'a Pexels contributor'} on Pexels`,
                commercial: true, modify: true, retrievedAt: today(),
            }),
        });
    });
    return { items };
}
// ── Pixabay ─────────────────────────────────────────────────────────
const PIXABAY_LICENSE = {
    license: 'Pixabay Content License',
    licenseUrl: 'https://pixabay.com/service/license-summary/',
    note: 'No credit required. Content showing trademarks, logos or brands may not be used commercially in relation to goods and services; no standalone redistribution. AI-generated items are mixed in — read the page before using one on a factual channel.',
};
async function pixabay(input, media, limit) {
    const key = config.pixabayApiKey;
    if (!key)
        return { items: [], note: 'skipped — PIXABAY_API_KEY is not set (https://pixabay.com/api/docs/)' };
    const orientation = input.orientation === 'portrait' ? 'vertical' : input.orientation === 'landscape' ? 'horizontal' : undefined;
    const lang = input.locale && /^[a-z]{2}$/i.test(input.locale) ? input.locale.toLowerCase() : undefined;
    const params = {
        key, q: input.query.slice(0, 100), per_page: Math.max(3, Math.min(200, limit * 2)), safesearch: true, lang,
        ...(media === 'video' ? { video_type: 'film' } : { image_type: 'photo', orientation, min_width: input.minWidth }),
    };
    const base = media === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
    const json = (await getJson(base + buildQuery(params)));
    const items = (json.hits ?? []).map((r) => {
        const author = str(r.user);
        let files, width, height, thumbnail;
        if (media === 'video') {
            const v = (r.videos ?? {});
            files = ['large', 'medium', 'small', 'tiny']
                .filter((k) => str(v[k]?.url))
                .map((k) => compact({ url: String(v[k].url), width: num(v[k].width), height: num(v[k].height), label: k, mime: 'video/mp4' }));
            width = files[0]?.width;
            height = files[0]?.height;
            thumbnail = str(v.medium?.thumbnail) ?? str(v.small?.thumbnail);
        }
        else {
            // imageURL and fullHDURL only appear for keys Pixabay has approved for full access; largeImageURL (1280px) is always there.
            files = [
                r.imageURL && { url: String(r.imageURL), width: num(r.imageWidth), height: num(r.imageHeight), label: 'original', mime: 'image/jpeg' },
                r.fullHDURL && { url: String(r.fullHDURL), label: 'fullHD (1920w)', mime: 'image/jpeg' },
                r.largeImageURL && { url: String(r.largeImageURL), label: 'large (1280w)', mime: 'image/jpeg' },
            ].filter(Boolean);
            width = num(r.imageWidth);
            height = num(r.imageHeight);
            thumbnail = str(r.previewURL);
        }
        return compact({
            provider: 'pixabay', id: String(r.id), media, title: str(r.tags), pageUrl: String(r.pageURL), author,
            width, height, duration: num(r.duration), thumbnail, files,
            license: compact({
                provider: 'pixabay', url: String(r.pageURL), ...PIXABAY_LICENSE, author,
                attributionRequired: false, attribution: `${author ?? 'a Pixabay contributor'} via Pixabay`,
                commercial: true, modify: true, retrievedAt: today(),
            }),
        });
    });
    return { items };
}
// ── NASA Image and Video Library ────────────────────────────────────
const NASA_LICENSE = {
    license: 'NASA media usage guidelines (US government work, not subject to copyright)',
    licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    note: 'Credit NASA. Not usable: the NASA insignia and logotype, names or likenesses of current astronauts and employees on commercial products, anything implying NASA endorsement, and third-party material NASA uses with permission — read the description for embedded third-party credits.',
};
async function nasa(input, media, limit) {
    const page = Math.min(NASA_MAX, limit);
    const search = (await getJson('https://images-api.nasa.gov/search' +
        buildQuery({ q: input.query, media_type: media === 'video' ? 'video' : 'image', page_size: page })));
    const rows = (search.collection?.items ?? []).slice(0, page);
    const manifests = await Promise.all(rows.map(async (r) => {
        const id = str(r.data?.[0]?.nasa_id);
        if (!id)
            return [];
        try {
            const m = (await getJson(`https://images-api.nasa.gov/asset/${encodeURIComponent(id)}`));
            return (m.collection?.items ?? []).map((x) => String(x.href));
        }
        catch {
            return [];
        }
    }));
    const items = rows.map((r, i) => {
        const d = (r.data?.[0] ?? {});
        const id = str(d.nasa_id);
        if (!id)
            return null;
        const hrefs = manifests[i].map((h) => h.replace(/^http:\/\//, 'https://'));
        const rank = (h) => (/~orig\./.test(h) ? 0 : /~large\./.test(h) ? 1 : /~medium\./.test(h) ? 2 : /~small\./.test(h) ? 3 : 9);
        const wanted = media === 'video' ? /\.mp4$/i : /\.(jpe?g|png|tiff?)$/i;
        const files = hrefs
            .filter((h) => wanted.test(h) && !/~thumb|~preview|~mobile|_\d\.jpg$/i.test(h))
            .sort((a, b) => rank(a) - rank(b))
            .map((h) => ({ url: h, label: (h.match(/~([a-z]+)\.[a-z0-9]+$/i) ?? [])[1] ?? 'file', mime: media === 'video' ? 'video/mp4' : 'image/jpeg' }));
        const center = str(d.center);
        const thumb = (r.links ?? []).map((l) => str(l.href)).find(Boolean);
        return compact({
            provider: 'nasa', id, media, title: str(d.title), pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
            author: center ? `NASA/${center}` : 'NASA', thumbnail: thumb, files,
            license: compact({
                provider: 'nasa', url: `https://images.nasa.gov/details/${encodeURIComponent(id)}`, ...NASA_LICENSE,
                author: center ? `NASA/${center}` : 'NASA', attributionRequired: false, attribution: center ? `NASA/${center}` : 'NASA',
                commercial: true, modify: true, retrievedAt: today(),
            }),
        });
    }).filter((x) => !!x);
    return { items, note: limit > NASA_MAX ? `NASA pages ${NASA_MAX} at a time (one manifest request per item); no dimensions are reported, so orientation and minWidth are not applied here` : 'NASA reports no dimensions, so orientation and minWidth are not applied here' };
}
// ── Wikimedia Commons ───────────────────────────────────────────────
/** Public domain, CC0 and plain CC BY (any version, any port). Everything else is dropped and counted. */
export function commonsLicenseAllowed(code, shortName) {
    const c = (code ?? '').toLowerCase().trim();
    if (/-(sa|nc|nd)(-|$)/.test(c))
        return false;
    if (/^(pd|pd-[a-z0-9-]+|cc0|cc-zero)$/.test(c))
        return true;
    if (/^cc-by(-\d+(\.\d+)?)?(-[a-z]{2,3})?$/.test(c))
        return true;
    if (!c) {
        const s = (shortName ?? '').toLowerCase();
        return /public domain|cc0/.test(s) && !/share ?alike|non ?commercial|no ?deriv/.test(s);
    }
    return false;
}
async function commons(input, media, limit) {
    const url = 'https://commons.wikimedia.org/w/api.php' + buildQuery({
        action: 'query', format: 'json', formatversion: 2,
        generator: 'search', gsrnamespace: 6, gsrlimit: Math.min(50, limit * 2),
        gsrsearch: `${media === 'video' ? 'filetype:video' : 'filetype:bitmap'} ${input.query}`,
        prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 1280,
        iiextmetadatafilter: 'LicenseShortName|License|LicenseUrl|Artist|Credit|Attribution|AttributionRequired|UsageTerms|ImageDescription',
    });
    const json = (await getJson(url, { 'User-Agent': USER_AGENT }));
    let dropped = 0;
    const items = [];
    for (const p of (json.query?.pages ?? [])) {
        const ii = (p.imageinfo?.[0] ?? {});
        const meta = (ii.extmetadata ?? {});
        const m = (k) => stripTags(meta[k]?.value);
        const mime = str(ii.mime) ?? '';
        // a photo is a still: GIFs and SVGs on Commons are animations and drawings, not photographs
        if (media === 'video' ? !mime.startsWith('video/') : !/^image\/(jpeg|png|tiff|webp)$/.test(mime))
            continue;
        if (!commonsLicenseAllowed(m('License'), m('LicenseShortName'))) {
            dropped++;
            continue;
        }
        const pageUrl = str(ii.descriptionurl) ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(p.title))}`;
        const author = m('Artist');
        const attributionRequired = String(meta.AttributionRequired?.value ?? '').toLowerCase() === 'true';
        const attribution = m('Attribution') ?? author;
        const license = m('LicenseShortName') ?? m('UsageTerms') ?? 'Public domain';
        const files = [{ url: String(ii.url), width: num(ii.width), height: num(ii.height), label: 'original', mime }];
        if (media === 'photo' && str(ii.thumburl))
            files.push({ url: String(ii.thumburl), width: num(ii.thumbwidth), height: num(ii.thumbheight), label: 'scaled (1280w)', mime });
        items.push(compact({
            provider: 'commons', id: String(p.pageid), media, title: String(p.title).replace(/^File:/, ''), pageUrl, author,
            width: num(ii.width), height: num(ii.height), duration: num(ii.duration) === undefined ? undefined : Math.round(ii.duration * 100) / 100,
            thumbnail: str(ii.thumburl), files,
            license: compact({
                provider: 'commons', url: pageUrl, license, licenseUrl: m('LicenseUrl') ?? 'https://commons.wikimedia.org/wiki/Commons:Licensing',
                author, attributionRequired, attribution: attributionRequired ? `${attribution ?? 'see file page'}, ${license}, via Wikimedia Commons` : undefined,
                commercial: true, modify: true, retrievedAt: today(),
                note: (media === 'video' ? 'WebM/Ogg only — transcode with ffmpeg before the builder. ' : '') +
                    'Personality rights, trademarks and freedom of panorama are separate from the file license; the file page is the source of truth.',
            }),
        }));
    }
    return { items, note: dropped ? `${dropped} file(s) dropped: share-alike, non-commercial or no-derivatives licenses are not usable on an edited, monetized cut` : undefined };
}
// ── Entry ───────────────────────────────────────────────────────────
const RUNNERS = {
    pexels, pixabay, nasa, commons,
};
export async function stockSearch(input) {
    const media = input.media ?? 'video';
    const limit = Math.min(STOCK_MAX_LIMIT, Math.max(1, input.limit ?? 8));
    const providers = input.providers?.length ? input.providers : [...STOCK_PROVIDERS];
    const outcomes = await Promise.all(providers.map(async (name) => {
        try {
            const out = await RUNNERS[name](input, media, limit);
            const items = out.items.filter((item) => keep(item, input)).slice(0, limit);
            return { name, items, note: out.note, failed: false };
        }
        catch (error) {
            return { name, items: [], note: `failed — ${error instanceof Error ? error.message : String(error)}`, failed: true };
        }
    }));
    const items = outcomes.flatMap((o) => o.items);
    const summary = Object.fromEntries(outcomes.map((o) => [o.name, compact({ count: o.items.length, note: o.note })]));
    const allFailed = outcomes.every((o) => o.failed || (o.items.length === 0 && /^skipped/.test(o.note ?? '')));
    return {
        text: JSON.stringify(compact({
            query: input.query, media, orientation: input.orientation ?? 'any', providers: summary,
            note: items.length ? 'Every item carries the visual.license block to store on the cut; download files[0] with curl into storyboard/footage/ (video) or storyboard/images/stock/ (photo). People, logos and brands in frame stay a separate rights question on every provider.'
                : 'No usable results. Try English keywords, orientation "any", another media type, or the manual archives in docs/research/2026-09-07-free-stock-sources/index.html.',
            items,
        }), null, 1),
        isError: allFailed && items.length === 0,
    };
}
