import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBroadcast,
  checkChannel,
  prepareYoutube,
  activeChatId,
  resumeUnstarted,
  YoutubeChat,
  YoutubeProbe,
  closeBroadcast,
  broadcastStatus,
  cancelUnstarted,
  endBroadcast,
  missingYoutubeEvidence
} from '../dist/live-youtube.js';
import { ChatQueue } from '../dist/live-character.js';
const r = { channelId: 'channel', marker: 'run-test', broadcastId: 'b', streamId: 's' };
const broadcast = {
  id: 'b',
  snippet: { channelId: 'channel', description: 'AI character live session · run-test', liveChatId: 'chat' },
  status: { privacyStatus: 'unlisted', lifeCycleStatus: 'live' },
  contentDetails: { boundStreamId: 's' }
};
test('writes to the live video chat ID even when the broadcast list uses another ID', async () => {
  const video = {
    id: 'b',
    snippet: { channelId: 'channel' },
    liveStreamingDetails: { activeLiveChatId: 'canonical-chat' }
  };
  const api = async (method, resource, params) => {
    assert.equal(method, 'GET');
    assert.equal(resource, 'videos');
    assert.equal(params.id, 'b');
    return { items: [video] };
  };
  assert.equal(await activeChatId(api, r), 'canonical-chat');
  video.snippet.channelId = 'other';
  await assert.rejects(activeChatId(api, r), /owner/);
});
test('refuses another channel, changed visibility and a different bound stream', async () => {
  await assert.rejects(
    checkChannel(async () => ({ items: [{ id: 'other' }] }), 'channel'),
    /mismatch/
  );
  for (const b of [
    { ...broadcast, status: { privacyStatus: 'public' } },
    { ...broadcast, contentDetails: { boundStreamId: 'other' } },
    { ...broadcast, snippet: { channelId: 'channel' } }
  ])
    assert.throws(() => assertBroadcast(b, r), /mismatch/);
});
test('owned unlisted broadcast writes IDs before binding, keeps ingest key out of receipt, closes live broadcast', async () => {
  const receipts = [],
    calls = [];
  let closed = false;
  const api = async (method, name, params, body) => {
    calls.push([method, name, params, body]);
    if (name === 'channels') return { items: [{ id: 'channel' }] };
    if (name === 'liveStreams' && method === 'GET') return { items: [] };
    if (name === 'liveStreams')
      return {
        id: 's',
        snippet: { channelId: 'channel' },
        cdn: { ingestionInfo: { rtmpsIngestionAddress: 'rtmps://host/live2', streamName: 'FAKE-test-key' } }
      };
    if (name === 'liveBroadcasts/transition') {
      closed = true;
      return {};
    }
    if (name === 'liveBroadcasts' && method === 'GET')
      return {
        items: [
          { ...broadcast, status: { ...broadcast.status, lifeCycleStatus: closed ? 'complete' : 'live' } }
        ]
      };
    if (name === 'liveBroadcasts' && method === 'POST') return { ...broadcast, contentDetails: {} };
    return broadcast;
  };
  const receipt = { channelId: 'channel', marker: 'run-test' };
  const dest = await prepareYoutube(api, { madeForKids: false }, 'test', receipt, () =>
    receipts.push({ ...receipt })
  );
  assert.equal(dest.chatId, 'chat');
  assert.deepEqual(
    receipts.map((s) => [s.broadcastId, s.streamId, s.binding]),
    [
      ['b', undefined, undefined],
      ['b', 's', 'pending'],
      ['b', 's', 'confirmed']
    ]
  );
  assert.equal(JSON.stringify(receipts).includes('FAKE-test-key'), false);
  assert.equal(
    calls.find((c) => c[0] === 'POST' && c[1] === 'liveBroadcasts')[3].status.privacyStatus,
    'unlisted'
  );
  assert.equal(await closeBroadcast(api, receipt), 'complete');
});
test('an interrupted bind remains inspectable; explicit cancellation resolves only the unstarted owned broadcast once', async () => {
  for (const state of ['created', 'ready']) {
    const receipt = { ...r, binding: 'pending' };
    let current = {
      ...broadcast,
      status: { ...broadcast.status, lifeCycleStatus: state },
      contentDetails: {}
    };
    let deletes = 0;
    const api = async (method, resource, params) => {
      assert.equal(resource, 'liveBroadcasts');
      assert.equal(params.id, 'b');
      if (method === 'GET') return { items: current ? [current] : [] };
      assert.equal(method, 'DELETE');
      deletes++;
      current = undefined;
    };
    assert.equal(await broadcastStatus(api, receipt), state);
    await assert.rejects(endBroadcast(api, receipt), /remains/);
    assert.equal(deletes, 0);
    current.contentDetails = { boundStreamId: 'foreign' };
    await assert.rejects(
      cancelUnstarted(api, receipt, () => {}),
      /mismatch/
    );
    current.contentDetails = {};
    const phases = [];
    assert.equal(await cancelUnstarted(api, receipt, () => phases.push(receipt.cancellation)), 'cancelled');
    assert.deepEqual(phases, ['requested', 'confirmed']);
    assert.equal(await cancelUnstarted(api, receipt, () => {}), 'cancelled');
    assert.equal(await endBroadcast(api, receipt), 'cancelled');
    assert.equal(deletes, 1);
  }
  await assert.rejects(
    cancelUnstarted(
      async () => ({ items: [broadcast] }),
      r,
      () => {}
    ),
    /unstarted/
  );
});
test('YouTube chat honors polling interval and cursor and ignores non-message events', async () => {
  const pages = [],
    q = new ChatQueue();
  const chat = new YoutubeChat(async (method, name, params) => {
    pages.push(params);
    return {
      nextPageToken: 'next',
      pollingIntervalMillis: 8000,
      items: [
        { id: '1', authorDetails:{displayName:'민지'}, snippet: { type: 'textMessageEvent', displayMessage: 'hello' } },
        { id: '2', snippet: { type: 'userBannedEvent', displayMessage: 'skip' } }
      ]
    };
  }, 'chat');
  assert.equal(await chat.poll(q), 8000);
  await chat.poll(q);
  assert.equal(pages[0].part, 'snippet,authorDetails');
  assert.equal(pages[1].pageToken, 'next');
  assert.deepEqual(q.next(), { source: 'youtube', id: '1', text: 'hello', displayName:'민지' });
  assert.equal(q.next(), undefined);
});
test('resuming a ready room keeps its original key and never creates or takes over an active stream', async () => {
  const ready = { ...broadcast, status: { ...broadcast.status, lifeCycleStatus: 'ready' } };
  const stream = {
    id: 's',
    snippet: { channelId: 'channel' },
    status: { streamStatus: 'ready' },
    cdn: { ingestionInfo: { rtmpsIngestionAddress: 'rtmps://host/live2', streamName: 'fixture-key' } }
  };
  const api = async (method, resource) => {
    assert.equal(method, 'GET');
    return { items: [resource === 'liveStreams' ? stream : ready] };
  };
  const receipt = { ...r, binding: 'confirmed' };
  assert.deepEqual(await resumeUnstarted(api, receipt), {
    url: 'rtmps://host/live2/fixture-key',
    chatId: 'chat'
  });
  stream.status.streamStatus = 'active';
  await assert.rejects(resumeUnstarted(api, receipt), /already receiving/);
  ready.status.lifeCycleStatus = 'live';
  await assert.rejects(resumeUnstarted(api, receipt), /unstarted/);
});
test('a quiet YouTube chat counts only after a successful read and a requested probe must finish', async () => {
  const queue = new ChatQueue();
  const quiet = new YoutubeChat(async () => ({ items: [], pollingIntervalMillis: 6000 }), 'chat');
  assert.equal(await quiet.poll(queue), 6000);
  assert.equal(queue.next(), undefined);
  const quietSession = {
    live: true,
    finalState: 'complete',
    chatReads: 1,
    probeRequested: false,
    probeSpoken: false
  };
  assert.equal(missingYoutubeEvidence(quietSession), undefined);
  assert.ok(missingYoutubeEvidence({ ...quietSession, chatReads: 0 }));
  assert.ok(missingYoutubeEvidence({ ...quietSession, probeRequested: true }));
  assert.equal(
    missingYoutubeEvidence({ ...quietSession, probeRequested: true, probeSpoken: true }),
    undefined
  );
});

test('a probe waits for chat and retries only a definite 404 at most twice', async () => {
  const probe = new YoutubeProbe(0);
  assert.equal(probe.due(1000), false);
  assert.equal(probe.due(20000), true);
  const missing = {
    testMessage: async () => {
      throw Error('YouTube POST liveChat/messages 404 ERROR_UNSPECIFIED');
    }
  };
  for (let i = 0; i < 3; i++) {
    await probe.post(missing, 'question');
    assert.equal(probe.due(Date.now()), false);
    assert.equal(probe.due(Date.now() + 60000), i < 2);
  }
  const ambiguous = new YoutubeProbe(0);
  await assert.rejects(
    ambiguous.post(
      {
        testMessage: async () => {
          throw Error('connection lost');
        }
      },
      'question'
    )
  );
  assert.equal(ambiguous.due(Date.now() + 60000), false);
});
