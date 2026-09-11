/**
 * Public URLs for local files, for the one vendor input that takes no base64.
 *
 * ModelArk reads a reference video from a public URL or an asset:// id only (API reference
 * 1520757), and this pipeline's previz clips are local files. Two ways to get a URL, tried
 * in this order:
 *
 * 1. **Media hosting** — the operator's own endpoint, the same contract as
 *    skills/grow-threads/references/upload-media.sh: `MEDIA_UPLOAD_URL` takes a raw-byte
 *    POST with an `x-api-key` header and answers 201 `{data:{url}}` with an unauthenticated
 *    public GET. The file stays hosted; nothing to close.
 * 2. **Quick tunnel** — no account, no config: the file is served from a loopback HTTP
 *    server under a random path, and `cloudflared tunnel --url` (the trycloudflare.com quick
 *    tunnel) exposes it for the life of the generation task. `close()` tears both down.
 *
 * Either way the URL is fetched back through the public side before it is handed on, so a
 * dead link fails here and not minutes later inside the vendor's queue.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
const MIME = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
};
function uploadConfig() {
    const endpoint = process.env.MEDIA_UPLOAD_URL || process.env.MELEON_MEDIA_URL || '';
    const key = process.env.MEDIA_UPLOAD_API_KEY || process.env.MELEON_MEDIA_API_KEY || '';
    if (!endpoint || !key)
        return null;
    const seconds = Number(process.env.MEDIA_UPLOAD_TIMEOUT || process.env.MELEON_UPLOAD_TIMEOUT || 300);
    return { endpoint, key, timeoutMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 300) * 1000 };
}
/** The public side must answer — the vendor fetches with no credentials, so we fetch the same way. */
async function assertReachable(url, attempts, waitMs) {
    let last = '';
    for (let i = 0; i < attempts; i += 1) {
        try {
            const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
            if (head.ok)
                return;
            // A host that refuses HEAD may still serve GET — ask for one byte.
            const get = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15_000) });
            if (get.ok) {
                await get.body?.cancel();
                return;
            }
            last = `HTTP ${get.status}`;
        }
        catch (error) {
            last = error instanceof Error ? error.message : String(error);
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    throw new Error(`public URL not reachable: ${url} (${last})`);
}
/** Route 1 — POST each file to the operator's hosting endpoint (upload-media.sh contract). */
export async function publishViaUpload(filePaths, config) {
    const urls = [];
    for (const filePath of filePaths) {
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: { 'x-api-key': config.key, 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' },
            body: fs.readFileSync(filePath),
            signal: AbortSignal.timeout(config.timeoutMs),
        });
        const body = await response.text();
        if (response.status !== 201) {
            throw new Error(`media hosting refused ${path.basename(filePath)}: HTTP ${response.status} — ${body.slice(0, 300)}`);
        }
        let url = '';
        try {
            url = String(JSON.parse(body).data?.url || '');
        }
        catch {
            // not JSON — reported below
        }
        if (!/^https?:\/\//.test(url))
            throw new Error(`media hosting answered 201 without data.url — ${body.slice(0, 300)}`);
        await assertReachable(url, 3, 2_000);
        urls.push(url);
    }
    return { urls, how: 'upload', close: async () => undefined };
}
/** A loopback server that serves exactly the listed files, each under a random path. */
export function serveLocally(filePaths) {
    const token = randomBytes(16).toString('hex');
    const routes = filePaths.map((p, i) => `/${token}/${i}/${encodeURIComponent(path.basename(p))}`);
    const byRoute = new Map(routes.map((r, i) => [r, filePaths[i]]));
    const server = http.createServer((req, res) => {
        const file = byRoute.get((req.url || '').split('?')[0]);
        if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
            res.writeHead(404).end();
            return;
        }
        const size = fs.statSync(file).size;
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        let start = 0;
        let end = size - 1;
        if (range) {
            start = Number(range[1]);
            end = range[2] ? Math.min(Number(range[2]), size - 1) : end;
        }
        if (start > end || start >= size) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
            return;
        }
        res.writeHead(range ? 206 : 200, {
            'Content-Type': type,
            'Content-Length': end - start + 1,
            'Accept-Ranges': 'bytes',
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
        });
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        fs.createReadStream(file, { start, end }).pipe(res);
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({ server, port, routes });
        });
    });
}
function closeServer(server) {
    return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
    });
}
/** Route 2 — a cloudflared quick tunnel in front of the loopback server. */
export async function publishViaTunnel(filePaths, cloudflared = 'cloudflared') {
    const { server, port, routes } = await serveLocally(filePaths);
    let child = null;
    const close = async () => {
        if (child && child.exitCode === null)
            child.kill('SIGTERM');
        child = null;
        await closeServer(server);
    };
    try {
        const origin = await new Promise((resolve, reject) => {
            child = spawn(cloudflared, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let log = '';
            const timer = setTimeout(() => reject(new Error(`cloudflared gave no quick-tunnel URL within 60s\n${log.slice(-600)}`)), 60_000);
            const onLine = (chunk) => {
                log += chunk.toString();
                const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(log);
                if (m) {
                    clearTimeout(timer);
                    resolve(m[0]);
                }
            };
            child.stdout?.on('data', onLine);
            child.stderr?.on('data', onLine);
            child.once('error', (error) => {
                clearTimeout(timer);
                reject(new Error(`could not start cloudflared (${error.message}) — install it (brew install cloudflared) or set MEDIA_UPLOAD_URL`));
            });
            child.once('exit', (code) => {
                clearTimeout(timer);
                reject(new Error(`cloudflared exited with code ${code} before the tunnel came up\n${log.slice(-600)}`));
            });
        });
        const urls = routes.map((r) => origin + r);
        // A fresh quick-tunnel host takes a few seconds to resolve from outside, and a lookup that
        // lands before the record exists is cached as a miss by the OS resolver for a while — so
        // the first probe waits, and the window is generous (measured 2026-09-11: curl reached a
        // new host at 10 s; a probe fired at once made Node's fetch fail for the next 30 s).
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        for (const url of urls)
            await assertReachable(url, 30, 3_000);
        console.error(`[media-publish] quick tunnel ${origin} serving ${filePaths.length} file(s)`);
        return { urls, how: 'tunnel', close };
    }
    catch (error) {
        await close();
        throw error;
    }
}
/**
 * Public URLs for local files — hosting when configured, otherwise a quick tunnel.
 * The caller must `close()` once the vendor has finished reading (after the task settles).
 */
export async function publishFiles(filePaths) {
    if (filePaths.length === 0)
        return { urls: [], how: 'upload', close: async () => undefined };
    for (const filePath of filePaths) {
        if (!fs.existsSync(filePath))
            throw new Error(`file to publish not found: ${filePath}`);
    }
    const upload = uploadConfig();
    if (upload)
        return publishViaUpload(filePaths, upload);
    return publishViaTunnel(filePaths);
}
