import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createYoutubePlatform } from '../dist/live-youtube-platform.js';

test('YouTube adapter keeps ownership, live readiness, native chat, completion and legacy output', async t => {
  const out = mkdtempSync(join(tmpdir(), 'youtube-adapter-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const controller = new AbortController();
  const channelId = 'owned';
  let state = 'ready', marker, streamId;
  const broadcast = () => ({ id: 'b', snippet: { channelId, liveChatId: 'chat', description: marker },
    status: { lifeCycleStatus: state, privacyStatus: 'unlisted' }, contentDetails: { boundStreamId: streamId } });
  const api = async (verb, path, params, body) => {
    if (path === 'channels') return { items: [{ id: channelId }] };
    if (path === 'liveStreams' && verb === 'GET') return { items: [] };
    if (path === 'liveBroadcasts' && verb === 'POST') {
      marker = body.snippet.description;
      return broadcast();
    }
    if (path === 'liveStreams') return { id: 's', snippet: { channelId },
      cdn: { ingestionInfo: { rtmpsIngestionAddress: 'rtmps://media.example/live', streamName: 'fake-key' } } };
    if (path === 'liveBroadcasts/bind') { streamId = params.streamId; return broadcast(); }
    if (path === 'liveBroadcasts') return { items: [broadcast()] };
    if (path === 'videos') return { items: [{ id: 'b', snippet: { channelId }, liveStreamingDetails: { activeLiveChatId: 'chat' } }] };
    if (path === 'liveChat/messages') return { items: [{ id:'msg', snippet:{ type:'textMessageEvent', displayMessage:'test' } }] };
    if (path === 'liveBroadcasts/transition') { state = 'complete'; return {}; }
    assert.fail(path);
  };
  const p = createYoutubePlatform({ config: { channel: 'test', youtubeChannelId: channelId, madeForKids: false, topic: 'Night reading', speechLanguage:'vi' },
    out, title: 'test', log() {} }, async () => api);
  await p.check(true);
  assert.deepEqual(await p.prepare(controller.signal), { platform:'youtube', url:'rtmps://media.example/live/fake-key' });
  assert.equal(p.ready, false);
  assert.doesNotMatch(readFileSync(join(out, 'youtube.json'), 'utf8'), /fake-key/);
  const saved = JSON.parse(readFileSync(join(out, 'youtube.json'), 'utf8'));
  assert.equal(saved.topic, 'Night reading');
  assert.equal(saved.speechLanguage, 'vi');
  writeFileSync(join(out, 'events.jsonl'), JSON.stringify({event:'youtube_reserved', id:saved.broadcastId}) + '\n');
  const resumedConfig = {channel:'test', youtubeChannelId:channelId, madeForKids:false, topic:'Other topic'};
  const resumed = createYoutubePlatform({config:resumedConfig, resumeFrom:out, out:join(out,'session'), title:'test', log() {}}, async () => api);
  await resumed.check(true);
  assert.equal(resumedConfig.topic, saved.topic);
  assert.equal(resumedConfig.speechLanguage, 'vi');
  const conflicting = createYoutubePlatform({config:{...resumedConfig, speechLanguage:'ja'}, resumeFrom:out,
    out:join(out,'other'), title:'test', log() {}}, async () => assert.fail('Room contacted before language check'));
  await assert.rejects(conflicting.check(true), /reserved broadcast language/);
  state = 'live';
  const intake = [];
  await p.observe({ signal: controller.signal, stop: () => controller.abort(), acceptingUntil: Date.now() + 5000,
    queue: { add(e) { intake.push(e); controller.abort(); return true; } } });
  assert.equal(p.ready, true);
  assert.equal(intake[0].source, 'youtube');
  await p.close('finished');
  assert.equal(p.problem(), undefined);
  assert.deepEqual(p.summary(), { youtubeId:'b', finalState:'complete', probeSpoken:false });
  assert.deepEqual(await p.commands.status(), { id:'b', state:'complete' });
});
