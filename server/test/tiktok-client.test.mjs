import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync, copyFileSync, openSync, ftruncateSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { snsCredentialFile } from '../dist/config.js';
import { checkTikTokAccount, tiktokAuth, tiktokChunkPlan, tiktokPublish, tiktokStatus, tiktokVideos } from '../dist/tiktok-client.js';

const nativeFetch = globalThis.fetch;
const data = value => new Response(JSON.stringify({ data: value, error: { code: 'ok' } }), { status: 200 });
function fixture(channel, overrides = {}) {
  const tokenFile = snsCredentialFile('TIKTOK', channel);
  mkdirSync(dirname(tokenFile), { recursive: true });
  const token = { client_key: 'client', access_token: 'access-secret', refresh_token: 'refresh-secret', open_id: 'owner', scope: 'user.info.basic,user.info.profile,video.upload,video.publish,video.list', expires_at: Date.now() + 3600_000, refresh_expires_at: Date.now() + 99999999, ...overrides };
  writeFileSync(tokenFile, JSON.stringify(token));
  const clientFile = join(dirname(tokenFile), 'tiktok-client.json');
  writeFileSync(clientFile, JSON.stringify({ client_key: 'client', client_secret: 'client-secret', redirect_uri: 'http://127.0.0.1:3456/callback/' }));
  return { tokenFile, clientFile, token };
}
function mock(t, fn) { globalThis.fetch = fn; t.after(() => { globalThis.fetch = nativeFetch; }); }

// One generated fixture exercises the real ffprobe path; uploads themselves are mocked.
let video;
function videoFile(channel) {
  if (!video) {
    video = join(dirname(snsCredentialFile('TIKTOK', channel)), 'video.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:r=24:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  }
  return video;
}

test('rotation persists replacement token and expiry, never leaks secrets; channel has no fallback', async t => {
  const { tokenFile } = fixture('rotate', { expires_at: 0 });
  let exchanges = 0;
  mock(t, async (url, init) => {
    if (url.endsWith('oauth/token/')) {
      exchanges++;
      assert.equal(init.body.get('refresh_token'), 'refresh-secret');
      return new Response(JSON.stringify({ access_token: 'next-access', refresh_token: 'next-refresh', expires_in: 7200, refresh_expires_in: 15552000, open_id: 'owner', scope: 'user.info.basic' }));
    }
    assert.equal(init.headers.Authorization, 'Bearer next-access');
    return data({ user: { open_id: 'owner', display_name: 'Mochi & Bơ' } });
  });
  const result = await checkTikTokAccount('rotate');
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes('next-access'), false);
  assert.equal(JSON.parse(readFileSync(tokenFile)).refresh_token, 'next-refresh');
  assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  await checkTikTokAccount('rotate');
  assert.equal(exchanges, 1);
  assert.equal((await checkTikTokAccount('missing')).ok, false);
});

test('API-level errors with HTTP 200 are failures and untrusted text is not exposed', async t => {
  fixture('rejected');
  mock(t, async () => new Response(JSON.stringify({ error: { code: 'access_token_invalid', message: 'access-secret' } })));
  const result = await checkTikTokAccount('rejected');
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes('access-secret'));
});

test('chunk plan folds trailing bytes into final chunk and rejects oversized input', () => {
  assert.deepEqual(tiktokChunkPlan(123), { chunkSize: 123, totalChunkCount: 1 });
  assert.deepEqual(tiktokChunkPlan(25_000_001), { chunkSize: 10_000_000, totalChunkCount: 2 });
  assert.deepEqual(tiktokChunkPlan(64_000_001), { chunkSize: 10_000_000, totalChunkCount: 6 });
  assert.throws(() => tiktokChunkPlan(4_000_000_001));
});

test('lost final upload response retains publish ID; retries reuse receipt and status distinguishes inbox from publication', async t => {
  fixture('upload');
  const input = { channel: 'upload', requestId: 'episode-01', expectedOpenId: 'owner', videoFilePath: videoFile('upload'), consent: true };
  let initializations = 0; let puts = 0;
  mock(t, async (url, init) => {
    if (url.includes('user/info')) return data({ user: { open_id: 'owner', username: 'mochiandbovn' } });
    if (url.includes('/inbox/video/init/')) {
      initializations++;
      const body = JSON.parse(init.body);
      assert.equal(body.post_info, undefined);
      assert.equal(body.source_info.total_chunk_count, 1);
      return data({ publish_id: 'pub-1', upload_url: 'https://open-upload.tiktokapis.com/video/?upload_token=secret' });
    }
    if (init.method === 'PUT') {
      puts++;
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.headers['Content-Range'], `bytes 0-${statSync(video).size - 1}/${statSync(video).size}`);
      throw new Error('lost response https://upload-token-secret');
    }
    if (url.includes('status/fetch')) return data({ status: 'SEND_TO_USER_INBOX' });
    throw new Error('Unexpected endpoint');
  });
  const result = await tiktokPublish(input, 'upload');
  assert.equal(result.status, 'upload_uncertain');
  assert.equal(result.publishId, 'pub-1');
  assert.ok(!JSON.stringify(result).includes('upload-token-secret'));
  assert.equal((await tiktokPublish(input, 'upload')).reused, true);
  assert.equal(initializations, 1); assert.equal(puts, 1);
  assert.equal((await tiktokStatus({ channel: 'upload', requestId: input.requestId })).remote.status, 'SEND_TO_USER_INBOX');
  await assert.rejects(tiktokPublish({ ...input, expectedOpenId: 'other' }, 'upload'));
  globalThis.fetch = async (url, init) => {
    if (url.includes('user/info')) return data({ user: { open_id: 'owner' } });
    if (url.includes('/inbox/video/init/')) return data({ publish_id: 'pub-2', upload_url: 'https://open-upload.tiktokapis.com/video/' });
    assert.equal(init.method, 'PUT');
    return new Response('', { status: 201 });
  };
  assert.equal((await tiktokPublish({ ...input, requestId: 'approved-second-post' }, 'upload')).status, 'processing');
});

test('wrong account, disabled interaction, missing consent and unaudited public posts never initialize', async t => {
  fixture('direct');
  let initializations = 0;
  mock(t, async url => {
    if (url.includes('user/info')) return data({ user: { open_id: 'owner' } });
    if (url.includes('creator_info')) return data({ privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], max_video_post_duration_sec: 300, comment_disabled: true, duet_disabled: true, stitch_disabled: true });
    initializations++; throw new Error('Must not initialize');
  });
  const base = { channel: 'direct', requestId: 'no-post', videoFilePath: videoFile('direct'), expectedOpenId: 'owner', consent: true,
    title: 'Một chút thương', privacyLevel: 'SELF_ONLY', allowComment: false, allowDuet: false, allowStitch: false,
    brandOrganic: false, brandedContent: false, isAigc: true, musicUsageAccepted: true };
  for (const change of [{ expectedOpenId: 'other' }, { consent: false }, { privacyLevel: 'PUBLIC_TO_EVERYONE' }, { allowComment: true }, { brandedContent: true }]) {
    await assert.rejects(tiktokPublish({ ...base, ...change }, 'direct'));
  }
  assert.equal(initializations, 0);
});

test('lost init response is durable submission_unknown and never resubmitted', async t => {
  fixture('unknown'); let submits = 0;
  mock(t, async url => {
    if (url.includes('user/info')) return data({ user: { open_id: 'owner' } });
    submits++; throw new Error('response lost');
  });
  const input = { channel: 'unknown', requestId: 'uncertain', videoFilePath: videoFile('unknown'), expectedOpenId: 'owner', consent: true };
  assert.equal((await tiktokPublish(input, 'upload')).status, 'submission_unknown');
  assert.equal((await tiktokPublish(input, 'upload')).reused, true);
  assert.equal((await tiktokStatus({ channel: input.channel, requestId: input.requestId })).publishId, undefined);
  assert.equal(submits, 1);
});

test('OAuth validates state, uses TikTok hex PKCE and refuses wrong handle without replacing tokens', async t => {
  const { tokenFile, clientFile } = fixture('auth');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const redirect = `http://127.0.0.1:${port}/callback/`;
  writeFileSync(clientFile, JSON.stringify({ client_key: 'client', client_secret: 'secret', redirect_uri: redirect }));
  const original = readFileSync(tokenFile, 'utf8');
  let exchanges = 0; let verifier; let username = 'wrong-account';
  mock(t, async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1')) return nativeFetch(url, init);
    if (url.endsWith('oauth/token/')) {
      exchanges++; verifier = init.body.get('code_verifier');
      return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'refresh', expires_in: 7200, refresh_expires_in: 99999, open_id: 'owner', scope: 'user.info.basic,user.info.profile,video.upload' }));
    }
    return data({ user: { open_id: 'owner', username } });
  });
  const auth = await tiktokAuth({ channel: 'auth', action: 'start', expectedHandle: 'mochiandbovn' });
  const params = new URL(auth.authorizationUrl).searchParams;
  assert.equal(params.get('code_challenge').length, 64);
  assert.equal((await nativeFetch(`${redirect}?state=wrong&code=code`)).status, 400);
  assert.equal(exchanges, 0);
  const result = await nativeFetch(`${redirect}?state=${params.get('state')}&code=code`);
  assert.equal(result.status, 400);
  assert.equal(params.get('code_challenge'), createHash('sha256').update(verifier).digest('hex'));
  assert.equal(readFileSync(tokenFile, 'utf8'), original);
  assert.equal((await tiktokAuth({ channel: 'auth', action: 'status' })).session, 'failed');
  username = 'mochiandbovn';
  const retry = await tiktokAuth({ channel: 'auth', action: 'start', expectedHandle: username });
  const state = new URL(retry.authorizationUrl).searchParams.get('state');
  assert.equal((await nativeFetch(`${redirect}?state=${state}&code=second-code`)).status, 200);
  const saved = JSON.parse(readFileSync(tokenFile, 'utf8'));
  assert.equal(saved.open_id, 'owner');
  assert.equal(saved.access_token, 'new');
  assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  assert.equal((await tiktokAuth({ channel: 'auth', action: 'status' })).session, 'connected');
});

test('video list preserves pagination and refuses missing scope before a request', async t => {
  fixture('videos'); let calls = 0;
  mock(t, async (url, init) => { calls++; assert.ok(url.includes('/video/list/')); assert.equal(JSON.parse(init.body).cursor, 123); return data({ videos: [], cursor: 124, has_more: true }); });
  assert.equal((await tiktokVideos({ channel: 'videos', cursor: 123 })).has_more, true);
  fixture('no-scope', { scope: 'user.info.basic' });
  await assert.rejects(tiktokVideos({ channel: 'no-scope' }));
  assert.equal(calls, 1);
});


test('Direct Post sends selected metadata and ordered chunks with trailing bytes only in the last chunk', async t => {
  fixture('chunks');
  const large = join(dirname(snsCredentialFile('TIKTOK', 'chunks')), 'large.mp4');
  copyFileSync(videoFile('chunks'), large);
  const fd = openSync(large, 'r+');
  ftruncateSync(fd, 25_000_001); closeSync(fd);
  const ranges = [];
  mock(t, async (url, init) => {
    if (url.includes('user/info')) return data({ user: { open_id: 'owner' } });
    if (url.includes('creator_info')) return data({ privacy_level_options: ['SELF_ONLY'], max_video_post_duration_sec: 60, comment_disabled: false, duet_disabled: false, stitch_disabled: false });
    if (url.includes('/publish/video/init/')) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.source_info, { source: 'FILE_UPLOAD', video_size: 25_000_001, chunk_size: 10_000_000, total_chunk_count: 2 });
      assert.deepEqual(body.post_info, { title: 'Mochi & Bơ', privacy_level: 'SELF_ONLY', disable_comment: true, disable_duet: true, disable_stitch: true, brand_organic_toggle: false, brand_content_toggle: false, is_aigc: true });
      return data({ publish_id: 'direct-1', upload_url: 'https://open-upload.tiktokapis.com/video/' });
    }
    assert.equal(init.method, 'PUT');
    ranges.push(init.headers['Content-Range']);
    assert.equal(init.body.byteLength, ranges.length === 1 ? 10_000_000 : 15_000_001);
    return new Response('', { status: ranges.length === 1 ? 206 : 201 });
  });
  const result = await tiktokPublish({ channel: 'chunks', requestId: 'direct-chunks', videoFilePath: large, expectedOpenId: 'owner', consent: true,
    title: 'Mochi & Bơ', privacyLevel: 'SELF_ONLY', allowComment: false, allowDuet: false, allowStitch: false,
    brandOrganic: false, brandedContent: false, isAigc: true, musicUsageAccepted: true }, 'direct');
  assert.equal(result.status, 'processing');
  assert.deepEqual(ranges, ['bytes 0-9999999/25000001', 'bytes 10000000-25000000/25000001']);
});
