import { createHash } from 'node:crypto';
import { loadYoutubeClient, exchangeYoutubeAccessToken } from './sns-client.js';
import { type LiveConfig, ChatQueue } from './live-character.js';

interface Broadcast {
  id: string;
  snippet: { channelId: string; liveChatId?: string; description?: string; actualStartTime?: string };
  status: { lifeCycleStatus: string; privacyStatus: string };
  contentDetails?: { boundStreamId?: string };
}
interface Stream {
  id: string;
  snippet: { channelId: string };
  cdn: { ingestionInfo: { rtmpsIngestionAddress: string; streamName: string } };
}
export interface YoutubeReceipt {
  channelId: string;
  marker: string;
  broadcastId?: string;
  streamId?: string;
  binding?: 'pending' | 'confirmed';
  cancellation?: 'requested' | 'confirmed';
}
type Api = <T>(verb: string, resource: string, params: Record<string, string>, body?: unknown) => Promise<T>;

export async function youtubeApi(channel: string): Promise<Api> {
  const { client } = await loadYoutubeClient(channel);
  if (!client) throw Error('Channel YouTube OAuth credentials unavailable');
  let token = '',
    expires = 0;
  return async (verb, resource, params, body) => {
    if (Date.now() >= expires) {
      const auth = await exchangeYoutubeAccessToken(client);
      if (!auth.token) throw Error('YouTube OAuth refresh failed');
      token = auth.token;
      expires = Date.now() + 50 * 60_000;
    }
    const url = new URL('https://www.googleapis.com/youtube/v3/' + resource);
    url.search = new URLSearchParams(params).toString();
    const r = await fetch(url, {
      method: verb,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(18000)
    });
    if (!r.ok) {
      const error = (await r.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
      throw Error(
        `YouTube ${verb} ${resource} ${r.status} ${error.error?.errors?.[0]?.reason ?? 'requestFailed'}`
      );
    }
    return r.status === 204 ? undefined : await r.json();
  };
}
export async function checkChannel(api: Api, id: string) {
  const mine = await api<{ items: { id: string }[] }>('GET', 'channels', { part: 'id', mine: 'true' });
  if (mine.items.length !== 1 || mine.items[0].id !== id) throw Error('YouTube channel identity mismatch');
  await api('GET', 'liveStreams', { part: 'id', mine: 'true', maxResults: '1' });
}
export async function prepareYoutube(
  api: Api,
  config: LiveConfig,
  title: string,
  receipt: YoutubeReceipt,
  save: () => void
) {
  await checkChannel(api, receipt.channelId);
  if (config.madeForKids === undefined) throw Error('Explicit audience declaration required');
  if (config.madeForKids) throw Error('YouTube disables live chat for made-for-kids broadcasts');
  const b = await api<Broadcast>(
    'POST',
    'liveBroadcasts',
    { part: 'snippet,status,contentDetails' },
    {
      snippet: {
        title,
        description: 'AI character live session · ' + receipt.marker,
        scheduledStartTime: new Date().toISOString()
      },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: config.madeForKids },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        latencyPreference: 'low',
        monitorStream: { enableMonitorStream: false }
      }
    }
  );
  receipt.broadcastId = b.id;
  save();
  assertBroadcast(b, receipt);
  const stream = await api<Stream>(
    'POST',
    'liveStreams',
    { part: 'id,snippet,cdn,contentDetails' },
    {
      snippet: { title: 'Character live ' + receipt.marker },
      cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
      contentDetails: { isReusable: false }
    }
  );
  receipt.streamId = stream.id;
  receipt.binding = 'pending';
  save();
  if (stream.snippet.channelId !== receipt.channelId) throw Error('YouTube stream owner mismatch');
  const bound = await api<Broadcast>('POST', 'liveBroadcasts/bind', {
    part: 'id,snippet,status,contentDetails',
    id: b.id,
    streamId: stream.id
  });
  assertBroadcast(bound, receipt);
  receipt.binding = 'confirmed';
  save();
  return ingestTarget(stream, bound.snippet.liveChatId ?? b.snippet.liveChatId);
}
function ingestTarget(stream: Stream, chatId?: string) {
  const info = stream.cdn.ingestionInfo;
  if (!info.rtmpsIngestionAddress.startsWith('rtmps://') || !info.streamName)
    throw Error('Secure YouTube ingest unavailable');
  return { url: info.rtmpsIngestionAddress + '/' + info.streamName, chatId };
}
export async function resumeUnstarted(api: Api, receipt: YoutubeReceipt) {
  const b = await inspectBroadcast(api, receipt);
  if (
    receipt.cancellation ||
    receipt.binding !== 'confirmed' ||
    !receipt.streamId ||
    b.status.lifeCycleStatus !== 'ready' ||
    b.snippet.actualStartTime
  )
    throw Error('Only an owned, unstarted, bound broadcast can be resumed');
  const page = await api<{ items: (Stream & { status: { streamStatus: string } })[] }>('GET', 'liveStreams', {
    part: 'id,snippet,cdn,status',
    id: receipt.streamId
  });
  const s = page.items[0];
  if (
    !s ||
    s.id !== receipt.streamId ||
    s.snippet.channelId !== receipt.channelId ||
    !['ready', 'inactive'].includes(s.status.streamStatus)
  )
    throw Error('Owned stream is unavailable or already receiving');
  return ingestTarget(s, b.snippet.liveChatId);
}
export async function activeChatId(api: Api, receipt: YoutubeReceipt) {
  const result = await api<{
    items: {
      id: string;
      snippet: { channelId: string };
      liveStreamingDetails?: { activeLiveChatId?: string };
    }[];
  }>('GET', 'videos', { part: 'snippet,liveStreamingDetails', id: receipt.broadcastId! });
  const video = result.items[0];
  if (video && (video.id !== receipt.broadcastId || video.snippet.channelId !== receipt.channelId))
    throw Error('Live chat video owner mismatch');
  return video?.liveStreamingDetails?.activeLiveChatId;
}
export function assertBroadcast(b: Broadcast | undefined, receipt: YoutubeReceipt, allowUnbound = false) {
  const bound = b?.contentDetails?.boundStreamId;
  const unstarted =
    b && ['created', 'ready'].includes(b.status.lifeCycleStatus) && !b.snippet.actualStartTime;
  if (
    !b ||
    b.id !== receipt.broadcastId ||
    b.snippet.channelId !== receipt.channelId ||
    b.status.privacyStatus !== 'unlisted' ||
    !receipt.marker ||
    b.snippet.description !== 'AI character live session · ' + receipt.marker ||
    (bound !== receipt.streamId && !(allowUnbound && !bound && unstarted))
  )
    throw Error('Broadcast ownership, visibility or stream binding mismatch');
}
async function lookupBroadcast(api: Api, r: YoutubeReceipt) {
  const page = await api<{ items: Broadcast[] }>('GET', 'liveBroadcasts', {
    id: r.broadcastId!,
    part: 'snippet,status,contentDetails'
  });
  return page.items[0];
}
export async function inspectBroadcast(api: Api, r: YoutubeReceipt, allowUnbound = false) {
  const b = await lookupBroadcast(api, r);
  assertBroadcast(b, r, allowUnbound);
  return b;
}
export async function broadcastStatus(api: Api, r: YoutubeReceipt) {
  const b = await lookupBroadcast(api, r);
  if (!b && r.cancellation) return 'cancelled';
  assertBroadcast(b, r, true);
  return b.status.lifeCycleStatus;
}
export async function cancelUnstarted(api: Api, r: YoutubeReceipt, save: () => void) {
  const b = await lookupBroadcast(api, r);
  if (!b && r.cancellation) return 'cancelled';
  assertBroadcast(b, r, true);
  if (!['created', 'ready'].includes(b.status.lifeCycleStatus) || b.snippet.actualStartTime)
    throw Error('Only an unstarted owned broadcast can be cancelled');
  if (r.cancellation) throw Error('Cancellation already submitted; inspect status before any further action');
  r.cancellation = 'requested';
  save();
  await api('DELETE', 'liveBroadcasts', { id: b.id });
  if (await lookupBroadcast(api, r)) throw Error('Cancellation not yet confirmed; inspect status');
  r.cancellation = 'confirmed';
  save();
  return 'cancelled';
}
export async function closeBroadcast(api: Api, r: YoutubeReceipt) {
  const state = await broadcastStatus(api, r);
  if (state !== 'live' && state !== 'testing') return state;
  try {
    await api('POST', 'liveBroadcasts/transition', {
      id: r.broadcastId!,
      broadcastStatus: 'complete',
      part: 'status'
    });
  } catch (error) {
    // Ingest auto-stop can win the same transition.
    if ((await broadcastStatus(api, r)) === 'complete') return 'complete';
    throw error;
  }
  return await broadcastStatus(api, r);
}
export async function endBroadcast(api: Api, r: YoutubeReceipt) {
  const state = await closeBroadcast(api, r);
  if (state !== 'complete' && state !== 'cancelled')
    throw Error(
      'Broadcast remains ' +
        state +
        '; inspect status. Use cancel-unstarted only to remove an unstarted session.'
    );
  return state;
}
export function missingYoutubeEvidence({
  live,
  finalState,
  chatReads,
  probeRequested,
  probeSpoken
}: {
  live: boolean;
  finalState: string;
  chatReads: number;
  probeRequested: boolean;
  probeSpoken: boolean;
}) {
  if (!live) return 'live state was never observed';
  if (finalState !== 'complete') return 'broadcast closure was not confirmed';
  if (!chatReads) return 'no successful live chat read';
  if (probeRequested && !probeSpoken) return 'test message did not finish speaking';
  return undefined;
}
export class YoutubeProbe {
  private attempts = 0;
  private next: number;
  constructor(liveAt: number) {
    this.next = liveAt + 20_000;
  }
  due(now: number) {
    return now >= this.next && this.attempts < 3;
  }
  async post(chat: YoutubeChat, text: string) {
    this.attempts++;
    this.next = Infinity; // An uncertain write must never be repeated.
    try {
      return (await chat.testMessage(text)).id;
    } catch (e) {
      if (!(e instanceof Error && /^YouTube POST liveChat\/messages 404 /.test(e.message))) throw e;
      this.next = Date.now() + 30_000;
      return undefined;
    }
  }
}
export class YoutubeChat {
  private cursor?: string;
  constructor(
    private api: Api,
    private id: string
  ) {}
  async poll(queue: Pick<ChatQueue, 'add'>, observe?: (id: string, text: string, author?: string) => void) {
    const data = await this.api<{
      items: { id: string; snippet: { type: string; displayMessage?: string; authorChannelId?: string } }[];
      nextPageToken: string;
      pollingIntervalMillis: number;
    }>('GET', 'liveChat/messages', {
      part: 'snippet',
      liveChatId: this.id,
      ...(this.cursor ? { pageToken: this.cursor } : {})
    });
    for (const message of data.items ?? []) {
      if (['textMessageEvent', 'superChatEvent'].includes(message.snippet.type)) {
        if (message.snippet.displayMessage)
          observe?.(message.id, message.snippet.displayMessage, message.snippet.authorChannelId);
        const author = message.snippet.authorChannelId;
        queue.add({ source: 'youtube', id: message.id, text: message.snippet.displayMessage,
          ...(author && { speaker: 'yt-' + createHash('sha256').update(this.id).update(author).digest('hex').slice(0, 12) }) });
      }
    }
    this.cursor = data.nextPageToken;
    return Math.max(1000, data.pollingIntervalMillis || 5000);
  }
  async testMessage(text: string) {
    return this.api<{ id: string }>(
      'POST',
      'liveChat/messages',
      { part: 'snippet' },
      {
        snippet: { liveChatId: this.id, type: 'textMessageEvent', textMessageDetails: { messageText: text } }
      }
    );
  }
}
