import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { CHANNEL_SLUG_RE, snsCredentialFile } from './config.js';

const BASE = 'https://open.tiktokapis.com/v2/';
const channelSchema = z.string().regex(CHANNEL_SLUG_RE).describe('Channel slug, e.g. mochi-bo. Never falls back to another channel.');
const handleSchema = z.string().regex(/^[a-zA-Z0-9_.]{1,24}$/);
const clientSchema = z.object({
  client_key: z.string().min(1), client_secret: z.string().min(1),
  redirect_uri: z.string().url(), direct_post_audited: z.boolean().default(false),
});
const tokenSchema = z.object({
  client_key: z.string(), access_token: z.string().min(1), refresh_token: z.string().min(1),
  open_id: z.string().min(1), scope: z.string(), expires_at: z.number().finite(),
  refresh_expires_at: z.number().finite(),
});
type Token = z.infer<typeof tokenSchema>;
const scopeSchema = z.enum(['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.upload', 'video.publish']);
export const tiktokAuthSchema = z.object({
  channel: channelSchema,
  action: z.enum(['start', 'status']).describe('start opens a 10-minute loopback OAuth listener; status reports progress without exposing secrets.'),
  expectedHandle: handleSchema.optional().describe('Required for start: the exact intended handle without @, e.g. mochiandbovn.'),
  scopes: z.array(scopeSchema).min(1).optional().describe('Approved app scopes only. Default: basic + profile + video.upload; read scopes and video.publish are opt-in.'),
}).strict();
export const tiktokChannelSchema = z.object({ channel: channelSchema }).strict();
const requestFields = {
  channel: channelSchema,
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).describe('Stable logical upload ID, e.g. ep01-v1. Reuse after interruption; never invent a new ID to retry an uncertain upload.'),
  videoFilePath: z.string().refine(isAbsolute, 'Absolute file path required').describe('Local MP4/MOV/WebM; ffprobe checks codec, duration, size and frame rate.'),
  expectedOpenId: z.string().min(1).describe('Account open_id from sns_account_check; checked against the live token before sending media.'),
  consent: z.literal(true).describe('User expressly approved uploading this exact video to this account. Setup authorization is insufficient.'),
};
export const tiktokUploadSchema = z.object(requestFields).strict();
export const tiktokPublishSchema = z.object({
  ...requestFields,
  title: z.string().max(2200).describe('User-reviewed caption, up to 2200 UTF-16 units; Vietnamese for mochi-bo.'),
  privacyLevel: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).describe('User must choose from fresh creator_info options. No default.'),
  allowComment: z.boolean().describe('User-selected interaction; present unchecked initially.'),
  allowDuet: z.boolean().describe('User-selected interaction; present unchecked initially.'),
  allowStitch: z.boolean().describe('User-selected interaction; present unchecked initially.'),
  brandOrganic: z.boolean().describe('Creator promotes their own business; show Promotional content label when selected.'),
  brandedContent: z.boolean().describe('Paid third-party promotion; cannot be SELF_ONLY. Show Paid partnership label.'),
  isAigc: z.boolean().describe('AI-generated content disclosure; true for generated Mochi & Bơ videos.'),
  musicUsageAccepted: z.literal(true).describe('User accepted TikTok Music Usage Confirmation for this post.'),
  brandedContentPolicyAccepted: z.boolean().optional().describe('Must be true for brandedContent after user accepts TikTok Branded Content Policy.'),
  coverTimestampMs: z.number().int().nonnegative().optional().describe('Optional video cover position in milliseconds, within the video.'),
}).strict();
export const tiktokStatusSchema = z.object({
  channel: channelSchema,
  requestId: requestFields.requestId,
}).strict();
export const tiktokVideosSchema = z.object({
  channel: channelSchema,
  cursor: z.number().int().nonnegative().optional().describe('Pagination cursor returned by the previous call.'),
  maxCount: z.number().int().min(1).max(20).default(20).describe('Public videos per page, 1–20. Requires video.list.'),
}).strict();

function paths(channel?: string) {
  const token = snsCredentialFile('TIKTOK', channel);
  return { token, client: join(dirname(token), 'tiktok-client.json'), receipts: join(dirname(token), 'tiktok-uploads') };
}
async function json(file: string): Promise<unknown> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new Error(`Missing or invalid TikTok file: ${file}. Run setup-tiktok; never paste credentials in chat.`); }
}
async function atomicJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}
// Cross-process exclusion matters: rotating a refresh token twice loses the valid credential.
async function locked<T>(file: string, run: () => Promise<T>): Promise<T> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  try { await mkdir(lock, { mode: 0o700 }); }
  catch { throw new Error('TikTok operation already locked. Wait for it to finish; after a crash inspect the receipt before removing its lock.'); }
  try { return await run(); } finally { await rm(lock, { recursive: true, force: true }); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid TikTok response');
  return value as Record<string, unknown>;
}
// Do not echo vendor bodies, fetch errors or upload URLs: any can contain credentials.
async function responseJson(response: Response, oauth = false): Promise<Record<string, unknown>> {
  let value: Record<string, unknown>;
  try { value = record(await response.json()); } catch { throw new Error(`TikTok returned invalid JSON (HTTP ${response.status})`); }
  const error = oauth ? value.error : record(value.error ?? {} ).code;
  if (!response.ok || (error && error !== 'ok')) {
    const code = typeof error === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(error) ? error : 'request_failed';
    throw new Error(`TikTok ${code} (HTTP ${response.status}); check app approval, granted scopes or rate limits before retrying.`);
  }
  return oauth ? value : record(value.data);
}
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try { return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(60_000) }); }
  catch { throw new Error('TikTok network request failed; outcome may be unknown. Do not repeat a publish request.'); }
}
async function tokenExchange(client: z.infer<typeof clientSchema>, fields: Record<string, string>, previous?: Token): Promise<Token> {
  const value = await responseJson(await safeFetch(`${BASE}oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: client.client_key, client_secret: client.client_secret, ...fields }),
  }), true);
  const lifetime = z.number().positive().finite();
  const token = tokenSchema.parse({ ...value, client_key: client.client_key,
    expires_at: Date.now() + lifetime.parse(value.expires_in) * 1000,
    refresh_expires_at: Date.now() + lifetime.parse(value.refresh_expires_in) * 1000,
  });
  if (previous && token.open_id !== previous.open_id) throw new Error('TikTok refresh changed account identity; token not replaced.');
  return token;
}
async function credential(channel?: string): Promise<Token> {
  const { token: file, client: clientFile } = paths(channel);
  if (!existsSync(file)) throw new Error(`TikTok credentials missing: ${file}. Run setup-tiktok.`);
  return locked(file, async () => {
    await chmod(file, 0o600);
    let token = tokenSchema.parse(await json(file));
    const client = clientSchema.parse(await json(clientFile));
    await chmod(clientFile, 0o600);
    if (client.client_key !== token.client_key) throw new Error('TikTok client key changed; authorize this channel again.');
    if (token.expires_at <= Date.now() + 60_000) {
      if (token.refresh_expires_at <= Date.now()) throw new Error('TikTok refresh token expired; authorize this channel again.');
      token = await tokenExchange(client, { grant_type: 'refresh_token', refresh_token: token.refresh_token }, token);
      await atomicJson(file, token);
    }
    return token;
  });
}
function requireScopes(token: Token, ...scopes: string[]) {
  const missing = scopes.filter(scope => !token.scope.split(',').includes(scope));
  if (missing.length) throw new Error(`TikTok authorization lacks scopes: ${missing.join(', ')}. Enable them in the app and authorize again.`);
}
async function api(token: Token, endpoint: string, body?: unknown): Promise<Record<string, unknown>> {
  return responseJson(await safeFetch(BASE + endpoint, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
async function userInfo(token: Token) {
  requireScopes(token, 'user.info.basic');
  const fields = ['open_id', 'display_name', 'avatar_url'];
  if (token.scope.split(',').includes('user.info.profile')) fields.push('username', 'profile_deep_link');
  if (token.scope.split(',').includes('user.info.stats')) fields.push('follower_count', 'following_count', 'likes_count', 'video_count');
  const user = record((await api(token, `user/info/?fields=${fields.join(',')}`)).user);
  if (user.open_id !== token.open_id) throw new Error('TikTok account identity mismatch.');
  return user;
}
export async function checkTikTokAccount(channel?: string): Promise<Record<string, unknown>> {
  try {
    const token = await credential(channel);
    return { ok: true, account: await userInfo(token), scopes: token.scope.split(','), expiresAt: new Date(token.expires_at).toISOString() };
  } catch (error) { return { ok: false, reason: error instanceof z.ZodError ? 'Invalid TikTok credential format; run setup-tiktok.' : String(error instanceof Error ? error.message : error) }; }
}

interface AuthSession { status: string; authorizationUrl?: string; reason?: string }
const authSessions = new Map<string, AuthSession>();
export async function tiktokAuth(raw: unknown): Promise<Record<string, unknown>> {
  const input = tiktokAuthSchema.parse(raw);
  const { token: tokenFile, client: clientFile } = paths(input.channel);
  if (input.action === 'status') {
    return { channel: input.channel, clientConfigured: existsSync(clientFile), credentialFile: tokenFile,
      session: authSessions.get(input.channel)?.status ?? 'not_started',
      reason: authSessions.get(input.channel)?.reason, accountCheck: await checkTikTokAccount(input.channel) };
  }
  if (!input.expectedHandle) throw new Error('expectedHandle is required before starting TikTok authorization.');
  const existing = authSessions.get(input.channel);
  if (existing?.status === 'pending' || existing?.status === 'exchanging') return { ...existing };
  const client = clientSchema.parse(await json(clientFile));
  await chmod(clientFile, 0o600);
  const redirect = new URL(client.redirect_uri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw new Error('Use a registered Desktop Login Kit redirect: http://127.0.0.1:PORT/callback/ (no query or fragment).');
  }
  const scopes = [...new Set(input.scopes ?? ['user.info.basic', 'user.info.profile', 'video.upload'])];
  if (!scopes.includes('user.info.basic') || !scopes.includes('user.info.profile')) throw new Error('basic and profile scopes are required to verify the intended handle.');
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.search = new URLSearchParams({ client_key: client.client_key, response_type: 'code', scope: scopes.join(','),
    redirect_uri: client.redirect_uri, state, code_challenge: createHash('sha256').update(verifier).digest('hex'), code_challenge_method: 'S256' }).toString();
  const session: AuthSession = { status: 'pending', authorizationUrl: authUrl.toString() };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const callback = new URL(req.url ?? '/', redirect.origin);
    if (req.method !== 'GET' || req.headers.host !== redirect.host || callback.pathname !== redirect.pathname || callback.searchParams.get('state') !== state) {
      res.writeHead(400); res.end('Invalid OAuth callback.'); return;
    }
    if (session.status !== 'pending') { res.writeHead(409); res.end('Authorization already handled.'); return; }
    session.status = 'exchanging';
    try {
      if (callback.searchParams.has('error') || !callback.searchParams.get('code')) throw new Error('TikTok authorization was denied or returned no code.');
      await locked(tokenFile, async () => {
        const token = await tokenExchange(client, { grant_type: 'authorization_code', code: callback.searchParams.get('code')!, redirect_uri: client.redirect_uri, code_verifier: verifier });
        requireScopes(token, ...scopes);
        const user = await userInfo(token);
        if (user.username !== input.expectedHandle) throw new Error('Authorized TikTok handle does not match expectedHandle; existing credentials preserved.');
        if (existsSync(tokenFile) && tokenSchema.parse(await json(tokenFile)).open_id !== token.open_id) throw new Error('Existing TikTok channel is bound to a different account; credentials preserved.');
        await atomicJson(tokenFile, token);
      });
      session.status = 'connected';
      res.end('Đã kết nối TikTok. Bạn có thể quay lại social-flow.');
    } catch (error) {
      session.status = 'failed';
      session.reason = error instanceof z.ZodError ? 'Invalid TikTok authorization response.' : error instanceof Error ? error.message : 'TikTok authorization failed.';
      res.writeHead(400); res.end('Không thể kết nối TikTok. Kiểm tra trạng thái trong social-flow.');
    } finally { delete session.authorizationUrl; clearTimeout(timer); server.close(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', () => reject(new Error('TikTok OAuth callback port is unavailable.'))); server.listen(Number(redirect.port), '127.0.0.1', resolve); });
  const timer = setTimeout(() => { if (session.status === 'pending') { session.status = 'expired'; delete session.authorizationUrl; } server.close(); }, 10 * 60_000);
  timer.unref(); server.unref();
  authSessions.set(input.channel, session);
  return { channel: input.channel, ...session, expiresInSeconds: 600, credentialFile: tokenFile };
}

export async function tiktokCreatorInfo(raw: unknown) {
  const { channel } = tiktokChannelSchema.parse(raw);
  const token = await credential(channel);
  requireScopes(token, 'video.publish');
  return { account: await userInfo(token), creator: await api(token, 'post/publish/creator_info/query/', {}) };
}
export async function tiktokVideos(raw: unknown) {
  const input = tiktokVideosSchema.parse(raw);
  const token = await credential(input.channel);
  requireScopes(token, 'video.list');
  return api(token, 'video/list/?fields=id,title,video_description,create_time,share_url,duration,view_count,like_count,comment_count,share_count', { max_count: input.maxCount, ...(input.cursor === undefined ? {} : { cursor: input.cursor }) });
}

export function tiktokChunkPlan(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 4_000_000_000) throw new Error('TikTok video size must be 1 byte to 4 GB.');
  const chunkSize = Math.min(size, 10_000_000);
  const totalChunkCount = Math.max(1, Math.floor(size / chunkSize));
  return { chunkSize, totalChunkCount };
}
async function probe(file: string) {
  let stdout: string;
  try { ({ stdout } = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30_000, maxBuffer: 2_000_000 })); }
  catch { throw new Error('Cannot inspect TikTok video; install ffprobe and provide a readable video file.'); }
  const result = JSON.parse(stdout);
  const video = result.streams?.find((stream: { codec_type: string }) => stream.codec_type === 'video');
  const duration = Number(result.format?.duration);
  const [num, den] = String(video?.avg_frame_rate).split('/').map(Number);
  if (!video || !['h264', 'hevc', 'vp8', 'vp9'].includes(video.codec_name) || !Number.isFinite(duration) || duration <= 0 || duration > 600 ||
      !(num / den >= 23 && num / den <= 60) || ![video.width, video.height].every(n => n >= 360 && n <= 4096)) {
    throw new Error('TikTok requires H.264/H.265/VP8/VP9, 23–60 FPS, 360–4096 px on both axes, and at most 10 minutes.');
  }
  return duration;
}
interface Receipt {
  requestId: string; mode: 'upload' | 'direct'; fingerprint: string; openId: string;
  status: string; publishId?: string; failure?: string; updatedAt: string; remote?: Record<string, unknown>;
}
function receiptPath(channel: string, requestId: string) { return join(paths(channel).receipts, `${requestId}.json`); }
export async function tiktokStatus(raw: unknown) {
  const input = tiktokStatusSchema.parse(raw);
  const file = receiptPath(input.channel, input.requestId);
  return locked(file, async () => {
    const receipt = await json(file) as Receipt;
    if (!receipt.publishId) return { ...receipt, next: 'No publish ID was acknowledged. Do not resubmit automatically; inspect TikTok and this receipt.' };
    const token = await credential(input.channel);
    if (token.open_id !== receipt.openId) throw new Error('TikTok receipt belongs to a different account.');
    const remote = await api(token, 'post/publish/status/fetch/', { publish_id: receipt.publishId });
    receipt.remote = remote;
    receipt.updatedAt = new Date().toISOString();
    await atomicJson(file, receipt);
    return { ...receipt, next: remote.status === 'PUBLISH_COMPLETE' ? 'TikTok confirmed processing, not public visibility or the saved cover. Inspect the same post in ego lite; while private, edit and verify its cover, then make it public and verify. Do not re-upload.' : remote.status === 'FAILED' ? 'TikTok processing failed; inspect remote.fail_reason before deciding on a new attempt.' : receipt.mode === 'upload' ? 'Open the TikTok inbox notification and finish as Only you. Then edit and verify the saved cover in ego lite before making the same post public. Inbox delivery is not public publication.' : 'Wait for PUBLISH_COMPLETE to confirm processing, then verify private visibility and the saved cover in ego lite before making the same post public.' };
  });
}
export async function tiktokPublish(raw: unknown, mode: 'upload' | 'direct') {
  const input = mode === 'direct' ? tiktokPublishSchema.parse(raw) : tiktokUploadSchema.parse(raw);
  const file = receiptPath(input.channel, input.requestId);
  return locked(file, async () => {
    const media = await stat(input.videoFilePath);
    if (!media.isFile()) throw new Error('TikTok input is not a regular video file.');
    const mime = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }[extname(input.videoFilePath).toLowerCase()];
    if (!mime) throw new Error('TikTok supports MP4, MOV or WebM files.');
    const { chunkSize, totalChunkCount } = tiktokChunkPlan(media.size);
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(input.videoFilePath)) hash.update(bytes);
    const fingerprint = createHash('sha256').update(JSON.stringify({ mode, input, sha256: hash.digest('hex') })).digest('hex');
    if (existsSync(file)) {
      const previous = await json(file) as Receipt;
      if (previous.fingerprint !== fingerprint) throw new Error('TikTok requestId already belongs to different media or metadata.');
      return { ...previous, reused: true, next: 'Use tiktok_status; the same upload was not submitted again.' };
    }
    const duration = await probe(input.videoFilePath);
    const token = await credential(input.channel);
    requireScopes(token, mode === 'direct' ? 'video.publish' : 'video.upload');
    if (token.open_id !== input.expectedOpenId) throw new Error('TikTok target account mismatch.');
    await userInfo(token);
    let postInfo: Record<string, unknown> | undefined;
    if (mode === 'direct') {
      const direct = tiktokPublishSchema.parse(input);
      const client = clientSchema.parse(await json(paths(input.channel).client));
      const creator = await api(token, 'post/publish/creator_info/query/', {});
      if (!Array.isArray(creator.privacy_level_options) || !creator.privacy_level_options.includes(direct.privacyLevel)) throw new Error('TikTok privacy selection is no longer available; ask the user to choose again.');
      if (!client.direct_post_audited && direct.privacyLevel !== 'SELF_ONLY') throw new Error('Unaudited TikTok clients can only use SELF_ONLY; public posting needs a completed Direct Post audit.');
      if (typeof creator.max_video_post_duration_sec !== 'number' || duration > creator.max_video_post_duration_sec) throw new Error('Video exceeds the current creator duration limit.');
      for (const [enabled, disabled] of [[direct.allowComment, creator.comment_disabled], [direct.allowDuet, creator.duet_disabled], [direct.allowStitch, creator.stitch_disabled]]) {
        if (enabled && disabled !== false) throw new Error('Requested TikTok interaction is disabled in creator settings.');
      }
      if (direct.brandedContent && (direct.privacyLevel === 'SELF_ONLY' || direct.brandedContentPolicyAccepted !== true)) throw new Error('Branded content requires public/friends visibility and acceptance of the Branded Content Policy.');
      if (direct.coverTimestampMs !== undefined && direct.coverTimestampMs >= duration * 1000) throw new Error('Cover timestamp is outside the video.');
      postInfo = { title: direct.title, privacy_level: direct.privacyLevel, disable_comment: !direct.allowComment,
        disable_duet: !direct.allowDuet, disable_stitch: !direct.allowStitch, brand_organic_toggle: direct.brandOrganic,
        brand_content_toggle: direct.brandedContent, is_aigc: direct.isAigc,
        ...(direct.coverTimestampMs === undefined ? {} : { video_cover_timestamp_ms: direct.coverTimestampMs }) };
    }
    const receipt: Receipt = { requestId: input.requestId, mode, fingerprint, openId: token.open_id, status: 'initializing', updatedAt: new Date().toISOString() };
    await atomicJson(file, receipt);
    try {
      const init = await api(token, mode === 'direct' ? 'post/publish/video/init/' : 'post/publish/inbox/video/init/', {
        ...(postInfo ? { post_info: postInfo } : {}), source_info: { source: 'FILE_UPLOAD', video_size: media.size, chunk_size: chunkSize, total_chunk_count: totalChunkCount },
      });
      if (typeof init.publish_id !== 'string' || !init.publish_id) throw new Error('TikTok initialization returned no publish ID.');
      receipt.publishId = init.publish_id; receipt.status = 'uploading';
      await atomicJson(file, receipt);
      const uploadUrl = new URL(String(init.upload_url));
      if (uploadUrl.protocol !== 'https:' || !(uploadUrl.hostname === 'open-upload.tiktokapis.com' || uploadUrl.hostname.endsWith('.tiktokapis.com')) || uploadUrl.username || uploadUrl.password || uploadUrl.port) throw new Error('TikTok returned an untrusted upload destination.');
      const fd = await open(input.videoFilePath, 'r');
      try {
        for (let chunk = 0; chunk < totalChunkCount; chunk++) {
          const current = await stat(input.videoFilePath);
          if (current.size !== media.size || current.mtimeMs !== media.mtimeMs || current.ino !== media.ino) throw new Error('TikTok video file changed after approval.');
          const start = chunk * chunkSize;
          const end = chunk === totalChunkCount - 1 ? media.size : start + chunkSize;
          const bytes = Buffer.alloc(end - start);
          const { bytesRead } = await fd.read(bytes, 0, bytes.length, start);
          if (bytesRead !== bytes.length) throw new Error('TikTok video file changed during upload.');
          const response = await safeFetch(uploadUrl.toString(), { method: 'PUT', headers: { 'Content-Type': mime, 'Content-Length': String(bytes.length), 'Content-Range': `bytes ${start}-${end - 1}/${media.size}` }, body: new Uint8Array(bytes) });
          if (response.status !== (chunk === totalChunkCount - 1 ? 201 : 206)) throw new Error(`TikTok chunk returned HTTP ${response.status}; check status before any retry.`);
          await response.arrayBuffer();
        }
      } finally { await fd.close(); }
      receipt.status = 'processing';
    } catch (error) {
      receipt.status = receipt.publishId ? 'upload_uncertain' : 'submission_unknown';
      receipt.failure = error instanceof Error ? error.message : 'TikTok upload interrupted.';
    }
    receipt.updatedAt = new Date().toISOString();
    await atomicJson(file, receipt);
    return { ...receipt, receiptFile: file, next: 'Use tiktok_status with this requestId. Do not resubmit. Inbox uploads must be finalized as Only you in TikTok. Then edit and verify the saved cover in ego lite before making the same post public.' };
  });
}
