import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireDataGoKrKey } from './config.js';
import { buildQuery, requestRaw } from './http.js';
/**
 * data.go.kr (Korea open-data portal) client — collecting content seeds from official
 * government data.
 *
 * Four paths, based on measurement (2026-07-29):
 * 1. **Search, detail, and file download need no auth** — selectDataSetList.do (HTML), the
 *    detail page, and the two-step selectFileDataDownload.do all work without a key.
 * 2. **Only odcloud (file-data API) and apis.data.go.kr (standard open API) require a key** —
 *    and the key alone isn't enough: the portal needs a **per-API usage application (활용신청)**
 *    (mostly auto-approved) for the key to be registered against that API.
 *    odcloud -4 = "key not registered for this API".
 * 3. Search and detail are server-rendered HTML, so they're parsed with regexes — a portal
 *    redesign can break parsing, so every parser fails gracefully with "0 results + why".
 * 4. odcloud auth goes in an Authorization: Infuser header — serviceKey never rides in the URL,
 *    which removes the path where an error echo leaks the key into LLM context (serp-client's
 *    philosophy).
 */
const PORTAL_BASE = 'https://www.data.go.kr';
const ODCLOUD_BASE = 'https://api.odcloud.kr/api';
const OPENAPI_BASE = 'https://apis.data.go.kr';
/** The portal can block non-browser UAs, so use an ordinary one (robots targets search bots) */
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
function err(message) {
    return { text: message, isError: true };
}
function maskKey(text) {
    return text.replace(/serviceKey=[^&\s"']+/gi, 'serviceKey=***');
}
/** Strips HTML tags, restores entities, normalizes whitespace */
function stripTags(html) {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
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
/** Extracts the item array from the search-result HTML — returns an empty array if the structure changed */
function parseSearchItems(html) {
    const chunks = html.split(/fn_preview\('/).slice(1);
    const items = [];
    for (const chunk of chunks) {
        const head = chunk.match(/^(\d+)',\s*'([A-Z]+)'/);
        if (!head)
            continue;
        const [, pk, type] = head;
        const body = chunk.slice(0, chunk.indexOf('</li>') === -1 ? undefined : chunk.indexOf('</li>'));
        const title = body.match(/<span class="title">([\s\S]*?)<\/a>/);
        const desc = body.match(/<dd class="ellipsis publicDataDesc">([\s\S]*?)<\/dd>/);
        const formats = [...body.matchAll(/<span class="tagset[^"]*">([\s\S]*?)<\/span>/g)]
            .map((m) => stripTags(m[1]))
            .filter(Boolean);
        const info = {};
        for (const m of body.matchAll(/<span class="tit">([^<]+)<\/span>\s*(?:<span[^>]*>([\s\S]*?)<\/span>|([^<]+))/g)) {
            info[m[1].trim()] = stripTags(m[2] ?? m[3] ?? '');
        }
        items.push(compact({
            publicDataPk: pk,
            type,
            title: title ? stripTags(title[1]) : undefined,
            formats,
            description: desc ? stripTags(desc[1]).slice(0, 300) : undefined,
            org: info['제공기관'],
            updated: info['수정일'],
            keywords: info['키워드'],
            detailUrl: `${PORTAL_BASE}/data/${pk}/${type === 'FILE' ? 'fileData' : 'openapi'}.do`,
        }));
    }
    return items;
}
/** Pulls the per-type totals out of the "(N건)" count in each tab label (omitted if absent) */
function parseTotals(html) {
    const totals = {};
    for (const m of html.matchAll(/(오픈\s*API|파일데이터|표준데이터셋)[^(]{0,30}\(([\d,]+)건\)/g)) {
        totals[m[1].replace(/\s/g, '')] = m[2];
    }
    return Object.keys(totals).length > 0 ? totals : undefined;
}
async function searchOneType(keyword, type, page, perPage) {
    const url = `${PORTAL_BASE}/tcs/dss/selectDataSetList.do${buildQuery({
        keyword,
        dType: type,
        currentPage: page,
        perPage,
    })}`;
    const res = await requestRaw('get', url, { 'User-Agent': BROWSER_UA }, undefined, 20_000);
    if (!res.ok)
        return { error: `data.go.kr search HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    const items = parseSearchItems(res.body);
    return { items, totals: parseTotals(res.body) };
}
export async function searchDatasets(input) {
    const page = input.page ?? 1;
    const perPage = Math.min(input.limit ?? 10, 20);
    const types = input.type ? [input.type] : ['API', 'FILE'];
    const results = await Promise.all(types.map((t) => searchOneType(input.query, t, page, perPage)));
    const out = { query: input.query, page };
    let empty = true;
    for (let i = 0; i < types.length; i++) {
        const r = results[i];
        if ('error' in r) {
            out[types[i]] = r.error;
            continue;
        }
        if (r.items && r.items.length > 0)
            empty = false;
        out[types[i]] = r.items;
        if (r.totals)
            out.totals = { ...out.totals, ...r.totals };
    }
    if (empty) {
        return {
            text: '(no search results — retry with a different query. If it stays at 0, a portal redesign may have broken parsing: ' +
                `check ${PORTAL_BASE}/tcs/dss/selectDataSetList.do?keyword=… directly with WebFetch and report to the user that the server parser needs fixing)`,
            isError: false,
        };
    }
    return { text: JSON.stringify(out, null, 1), isError: false };
}
/** Of the th/td metadata on the detail page, lets through only the labels used to judge a content seed */
const META_LABELS = new Set([
    '분류체계', '제공기관', '관리부서명', 'API 유형', '데이터포맷', '확장자', '업데이트 주기',
    '등록일', '수정일', '비용부과유무', '신청가능 트래픽', '이용허락범위', '키워드', '제공형태',
    '전체 행', '매체유형', '설명',
]);
export async function datasetDetail(input) {
    const pagePath = input.type === 'FILE' ? 'fileData' : 'openapi';
    const url = `${PORTAL_BASE}/data/${input.publicDataPk}/${pagePath}.do`;
    const res = await requestRaw('get', url, { 'User-Agent': BROWSER_UA }, undefined, 20_000);
    if (!res.ok)
        return err(`data.go.kr detail HTTP ${res.status} — check that publicDataPk(${input.publicDataPk}) and type match the search result`);
    const html = res.body;
    const title = html.match(/<title>([^<|]+)/)?.[1]?.trim();
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.trim();
    const meta = {};
    for (const m of html.matchAll(/<th[^>]*>([^<]+)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
        const label = m[1].trim();
        if (!META_LABELS.has(label))
            continue;
        const value = stripTags(m[2]).slice(0, 200);
        if (value && !meta[label])
            meta[label] = value;
    }
    // Attachment download links such as reference docs (no auth) — collects both the URL form and the onclick form
    const docs = [
        ...[...html.matchAll(/fileDownload\.do\?atchFileId=([A-Za-z0-9_]+)&(?:amp;)?fileDetailSn=(\d+)/g)].map((m) => [m[1], m[2]]),
        ...[...html.matchAll(/fn_fileDownload\('([A-Za-z0-9_]+)',\s*'(\d+)'\)/g)].map((m) => [m[1], m[2]]),
    ]
        .slice(0, 3)
        .map(([id, sn]) => `${PORTAL_BASE}/cmm/cmm/fileDownload.do?atchFileId=${id}&fileDetailSn=${sn}`);
    const out = compact({
        publicDataPk: input.publicDataPk,
        type: input.type,
        title,
        description,
        meta,
        detailUrl: url,
        docs: docs.length > 0 ? [...new Set(docs)] : undefined,
    });
    if (input.type === 'FILE') {
        // The uddi of this dataset's latest revision — the page also carries uddis of related
        // datasets, so pin it precisely by pk
        const uddi = html.match(new RegExp(`fileDataDown\\('${input.publicDataPk}',\\s*'([^']+)'`))?.[1];
        if (uddi) {
            out.publicDataDetailPk = uddi;
            out.next = `use datago_file_download(publicDataPk, publicDataDetailPk) to get the original file, or datago_file_fetch for row-level queries if the usage application (활용신청) is in place`;
            out.odcloudPath = `${input.publicDataPk}/v1/${uddi}`;
        }
        else {
            out.warning = 'could not find the download identifier (uddi) — either the page structure changed or this dataset offers no download. Check detailUrl with WebFetch.';
        }
    }
    else {
        // Standard open API — the request URL usually lives in the reference docs, and only some
        // datasets embed a swagger
        const swaggerUrl = html.match(/var swaggerUrl = '([^']+)'/)?.[1];
        const swaggerJson = html.match(/var swaggerJson = `([\s\S]*?)`;/)?.[1]?.trim();
        if (swaggerUrl)
            out.swaggerUrl = swaggerUrl;
        if (swaggerJson) {
            try {
                const sw = JSON.parse(swaggerJson);
                out.endpoint = compact({
                    host: sw.host,
                    basePath: sw.basePath,
                    operations: Object.keys(sw.paths ?? {}).slice(0, 10),
                });
            }
            catch {
                /* a swagger parse failure isn't fatal — point at docs instead */
            }
        }
        const urls = [...new Set([...html.matchAll(/https?:\/\/apis\.data\.go\.kr[^\s"'<>]+/g)].map((m) => m[0]))];
        if (urls.length > 0)
            out.requestUrls = urls.slice(0, 3);
        out.next =
            'For the call path (request URL and parameters), use endpoint/requestUrls if present; otherwise check docs (the usage guide) or detailUrl with WebFetch. ' +
                'Before calling, the portal needs a usage application (활용신청, auto-approved) for this API or datago_api_call will not work.';
    }
    return { text: JSON.stringify(out, null, 1), isError: false };
}
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100MB — cap for content-seed use
/** UTF-8 first, reinterpret as EUC-KR if it's mangled (public CSVs mix the two encodings) */
function decodePreview(buf) {
    const utf8 = buf.toString('utf-8');
    // A � in the last few characters may just be the 4KB cut slicing a multi-byte character, so exclude it from the check
    if (!utf8.slice(0, -4).includes('�'))
        return { encoding: 'utf-8', text: utf8 };
    try {
        return { encoding: 'euc-kr', text: new TextDecoder('euc-kr').decode(buf) };
    }
    catch {
        return { encoding: 'utf-8(corrupted)', text: utf8 };
    }
}
/**
 * Restores the Content-Disposition filename — fetch exposes headers as latin-1 while the portal
 * puts UTF-8 bytes in them as-is. If it's %-encoded (filename*), URI-decode; otherwise
 * reinterpret the latin-1 bytes as UTF-8, and keep the original if the result is mangled.
 */
function fixHeaderEncoding(name) {
    if (/%[0-9a-f]{2}/i.test(name)) {
        try {
            return decodeURIComponent(name);
        }
        catch {
            /* broken %-sequence — fall through to the latin-1 path below */
        }
    }
    const reinterpreted = Buffer.from(name, 'latin1').toString('utf-8');
    return reinterpreted.includes('�') ? name : reinterpreted;
}
function sanitizeFilename(name) {
    return name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'download.bin';
}
export async function downloadFile(input) {
    // Step 1: the download ticket (atchFileId, fileDetailSn) — unauthenticated JSON
    const step1Url = `${PORTAL_BASE}/tcs/dss/selectFileDataDownload.do${buildQuery({
        publicDataPk: input.publicDataPk,
        publicDataDetailPk: input.publicDataDetailPk,
    })}`;
    const step1 = await requestRaw('get', step1Url, { 'User-Agent': BROWSER_UA }, undefined, 20_000);
    if (!step1.ok)
        return err(`download step 1 HTTP ${step1.status}: ${step1.body.slice(0, 200)}`);
    let ticket;
    try {
        ticket = JSON.parse(step1.body);
    }
    catch {
        return err(`failed to parse the download step 1 response — check that publicDataDetailPk(uddi) matches the value from the datago_detail response: ${step1.body.slice(0, 200)}`);
    }
    if (!ticket.status || !ticket.atchFileId) {
        return err('dataset not downloadable — the portal refused the file ticket (login required, provision discontinued, etc.). Check detailUrl in a browser.');
    }
    // Step 2: fetch the actual file (binary — direct fetch instead of requestRaw)
    const fileUrl = `${PORTAL_BASE}/cmm/cmm/fileDownload.do${buildQuery({
        atchFileId: ticket.atchFileId,
        fileDetailSn: ticket.fileDetailSn ?? '1',
    })}`;
    let fileRes;
    try {
        fileRes = await fetch(fileUrl, {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(120_000),
        });
    }
    catch (e) {
        return err(`download step 2 failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!fileRes.ok)
        return err(`download step 2 HTTP ${fileRes.status}`);
    const declared = Number(fileRes.headers.get('content-length') ?? 0);
    if (declared > MAX_DOWNLOAD_BYTES) {
        return err(`the file is ${Math.round(declared / 1024 / 1024)}MB — over the 100MB cap. Raw data this large is overkill for a content seed: query only the rows you need with the odcloud API (datago_file_fetch).`);
    }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD_BYTES)
        return err('the file is over the 100MB cap — query only the rows you need with datago_file_fetch.');
    const cd = fileRes.headers.get('content-disposition') ?? '';
    const rawName = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1] ?? `datago-${input.publicDataPk}.bin`;
    const filename = sanitizeFilename(fixHeaderEncoding(rawName.replace(/"/g, '')));
    const saveDir = input.saveDir ?? join(tmpdir(), 'social-flow-datago');
    await mkdir(saveDir, { recursive: true });
    let savedPath = join(saveDir, filename);
    for (let i = 1; existsSync(savedPath); i++) {
        // Error at the cap — silently overwriting -99 the way it used to loses already-collected files
        if (i >= 100) {
            return err(`there are already 100+ files with the same name in ${saveDir} — clean up saveDir or point at a different directory.`);
        }
        savedPath = join(saveDir, filename.replace(/(\.[^.]*)?$/, `-${i}$1`));
    }
    await writeFile(savedPath, buf);
    const preview = decodePreview(buf.subarray(0, 4096));
    const lines = preview.text.split(/\r?\n/).slice(0, 6);
    return {
        text: JSON.stringify(compact({
            savedPath,
            filename,
            bytes: buf.length,
            encoding: preview.encoding,
            encodingNote: preview.encoding === 'euc-kr' ? 'the file is EUC-KR — convert with iconv -f euc-kr -t utf-8 before Read' : undefined,
            preview: lines,
            note: 'for attribution: write the dataset detail URL and the modified date (the data as-of date) into the research notes',
        }), null, 1),
        isError: false,
    };
}
const ODCLOUD_CODE_HELP = {
    [-1]: 'required parameter missing',
    [-2]: 'not authorized',
    [-3]: 'service not registered — check that odcloudPath(publicDataPk/v1/uddi) matches the value from the datago_detail response (the uddi is needed in full, including the _YYYYMMDDHHMM suffix)',
    [-4]: 'the key is not registered for this API — submit the usage application (활용신청, auto-approved) for that file data on data.go.kr first. Also verify the key under 마이페이지 > 개인 API 인증키 (My Page > Personal API keys). Before the usage application goes through, grabbing the original with datago_file_download (no auth) is faster',
    [-5]: 'traffic exceeded — fall back to datago_file_download for today',
};
export async function fetchFileRows(input) {
    const key = requireDataGoKrKey();
    // Measured: the ':' in a uddi has to pass through literally — encode the segment, then restore only the colon
    const uddiSegment = encodeURIComponent(input.uddi).replace(/%3A/gi, ':');
    const url = `${ODCLOUD_BASE}/${input.publicDataPk}/v1/${uddiSegment}${buildQuery({
        page: input.page ?? 1,
        perPage: Math.min(input.limit ?? 10, 50),
        returnType: 'JSON',
    })}`;
    // The key goes in the Authorization header only — no URL echo path for it to leak through
    const res = await requestRaw('get', url, { Authorization: `Infuser ${key}`, 'User-Agent': BROWSER_UA });
    let json;
    try {
        json = JSON.parse(res.body);
    }
    catch {
        return err(`failed to parse the odcloud response (HTTP ${res.status}): ${maskKey(res.body.slice(0, 300))}`);
    }
    if (typeof json.code === 'number' && json.code < 0) {
        const help = ODCLOUD_CODE_HELP[json.code] ?? String(json.msg ?? '');
        return err(`odcloud ${json.code}: ${help}`);
    }
    if (!res.ok)
        return err(`odcloud HTTP ${res.status}: ${maskKey(res.body.slice(0, 300))}`);
    let text = JSON.stringify(compact({
        page: json.page,
        perPage: json.perPage,
        totalCount: json.totalCount,
        currentCount: json.currentCount,
        data: json.data,
    }), null, 1);
    if (text.length > 12_000) {
        text = `${text.slice(0, 12_000)}\n…(truncated — lower limit, or use page to pull just the rows you need)`;
    }
    return { text, isError: false };
}
/** Common XML/JSON error codes of the standard open API → actionable guidance */
const OPENAPI_AUTH_HELP = 'auth refused — this key is not registered for this API. Check on data.go.kr that the usage application (활용신청, mostly auto-approved and instant) for that API is in place, ' +
    'and that the key under 마이페이지 > 개인 API 인증키 (My Page > Personal API keys) matches DATA_GO_KR_API_KEY. Do not retry before fixing the key.';
const OPENAPI_CODE_HELP = {
    SERVICE_KEY_IS_NOT_REGISTERED_ERROR: OPENAPI_AUTH_HELP,
    DEADLINE_HAS_EXPIRED_ERROR: 'usage period expired — request an extension on the portal',
    LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: 'daily traffic exceeded — no more calls to this API today',
    SERVICE_ACCESS_DENIED_ERROR: 'access denied — check the approval status of the usage application',
    TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: 'key temporarily blocked — check portal notices and the key status',
    NO_OPENAPI_SERVICE_ERROR: 'service path does not exist — compare path against the request URL in the usage guide',
};
export async function callOpenApi(input) {
    const key = requireDataGoKrKey();
    const path = input.path.replace(/^\/+/, '');
    if (path.includes('..') || path.includes('://'))
        return err('path only accepts a route under apis.data.go.kr (e.g. 1360000/VilageFcstInfoService_2.0/getUltraSrtNcst)');
    const url = `${OPENAPI_BASE}/${path}${buildQuery({ ...input.params, serviceKey: key })}`;
    const res = await requestRaw('get', url, { 'User-Agent': BROWSER_UA });
    const body = res.body;
    // For an unregistered key the gateway mixes HTTP 200 + an XML error with a plain "Unauthorized"
    if (/^\s*Unauthorized\s*$/i.test(body))
        return err(`apis.data.go.kr: ${OPENAPI_AUTH_HELP}`);
    const authCode = body.match(/<returnAuthMsg>([A-Z_]+)/)?.[1];
    if (authCode) {
        return err(`apis.data.go.kr ${authCode}: ${OPENAPI_CODE_HELP[authCode] ?? 'see the error-code table in the usage guide'}`);
    }
    if (!res.ok)
        return err(`apis.data.go.kr HTTP ${res.status}: ${maskKey(body.slice(0, 400))}`);
    let text = maskKey(body);
    if (text.length > 8_000) {
        text = `${text.slice(0, 8_000)}\n…(truncated — shrink the response with numOfRows/pageNo-style parameters and query again)`;
    }
    return { text, isError: false };
}
