import { createHash } from 'node:crypto';
import { loadYoutubeClient, exchangeYoutubeAccessToken } from './sns-client.js';
export async function youtubeApi(channel) {
    const { client } = await loadYoutubeClient(channel);
    if (!client)
        throw Error('Channel YouTube OAuth credentials unavailable');
    let token = '', expires = 0;
    return async (verb, resource, params, body) => {
        if (Date.now() >= expires) {
            const auth = await exchangeYoutubeAccessToken(client);
            if (!auth.token)
                throw Error('YouTube OAuth refresh failed');
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
            const error = (await r.json().catch(() => ({})));
            throw Error(`YouTube ${verb} ${resource} ${r.status} ${error.error?.errors?.[0]?.reason ?? 'requestFailed'}`);
        }
        return r.status === 204 ? undefined : await r.json();
    };
}
export async function checkChannel(api, id) {
    const mine = await api('GET', 'channels', { part: 'id', mine: 'true' });
    if (mine.items.length !== 1 || mine.items[0].id !== id)
        throw Error('YouTube channel identity mismatch');
    await api('GET', 'liveStreams', { part: 'id', mine: 'true', maxResults: '1' });
}
export async function prepareYoutube(api, config, title, receipt, save) {
    await checkChannel(api, receipt.channelId);
    if (config.madeForKids === undefined)
        throw Error('Explicit audience declaration required');
    if (config.madeForKids)
        throw Error('YouTube disables live chat for made-for-kids broadcasts');
    const b = await api('POST', 'liveBroadcasts', { part: 'snippet,status,contentDetails' }, {
        snippet: {
            title,
            description: 'AI character live session · ' + receipt.marker,
            scheduledStartTime: receipt.scheduledStartTime ?? new Date().toISOString()
        },
        status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: config.madeForKids },
        contentDetails: {
            enableAutoStart: true,
            enableAutoStop: true,
            enableDvr: true,
            latencyPreference: 'low',
            monitorStream: { enableMonitorStream: false }
        }
    });
    receipt.broadcastId = b.id;
    save();
    assertBroadcast(b, receipt);
    const stream = await api('POST', 'liveStreams', { part: 'id,snippet,cdn,contentDetails' }, {
        snippet: { title: 'Character live ' + receipt.marker },
        cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
        contentDetails: { isReusable: false }
    });
    receipt.streamId = stream.id;
    receipt.binding = 'pending';
    save();
    if (stream.snippet.channelId !== receipt.channelId)
        throw Error('YouTube stream owner mismatch');
    const bound = await api('POST', 'liveBroadcasts/bind', {
        part: 'id,snippet,status,contentDetails',
        id: b.id,
        streamId: stream.id
    });
    assertBroadcast(bound, receipt);
    receipt.binding = 'confirmed';
    save();
    return ingestTarget(stream, bound.snippet.liveChatId ?? b.snippet.liveChatId);
}
function ingestTarget(stream, chatId) {
    const info = stream.cdn.ingestionInfo;
    if (!info.rtmpsIngestionAddress.startsWith('rtmps://') || !info.streamName)
        throw Error('Secure YouTube ingest unavailable');
    return { url: info.rtmpsIngestionAddress + '/' + info.streamName, chatId };
}
export async function resumeUnstarted(api, receipt) {
    const b = await inspectBroadcast(api, receipt);
    if (receipt.cancellation ||
        receipt.binding !== 'confirmed' ||
        !receipt.streamId ||
        b.status.lifeCycleStatus !== 'ready' ||
        b.snippet.actualStartTime)
        throw Error('Only an owned, unstarted, bound broadcast can be resumed');
    const page = await api('GET', 'liveStreams', {
        part: 'id,snippet,cdn,status',
        id: receipt.streamId
    });
    const s = page.items[0];
    if (!s ||
        s.id !== receipt.streamId ||
        s.snippet.channelId !== receipt.channelId ||
        !['ready', 'inactive'].includes(s.status.streamStatus))
        throw Error('Owned stream is unavailable or already receiving');
    return ingestTarget(s, b.snippet.liveChatId);
}
export async function activeChatId(api, receipt) {
    const result = await api('GET', 'videos', { part: 'snippet,liveStreamingDetails', id: receipt.broadcastId });
    const video = result.items[0];
    if (video && (video.id !== receipt.broadcastId || video.snippet.channelId !== receipt.channelId))
        throw Error('Live chat video owner mismatch');
    return video?.liveStreamingDetails?.activeLiveChatId;
}
export function assertBroadcast(b, receipt, allowUnbound = false) {
    const bound = b?.contentDetails?.boundStreamId;
    const unstarted = b && ['created', 'ready'].includes(b.status.lifeCycleStatus) && !b.snippet.actualStartTime;
    if (!b ||
        b.id !== receipt.broadcastId ||
        b.snippet.channelId !== receipt.channelId ||
        b.status.privacyStatus !== 'unlisted' ||
        !receipt.marker ||
        b.snippet.description !== 'AI character live session · ' + receipt.marker ||
        (bound !== receipt.streamId && !(allowUnbound && !bound && unstarted)))
        throw Error('Broadcast ownership, visibility or stream binding mismatch');
}
async function lookupBroadcast(api, r) {
    const page = await api('GET', 'liveBroadcasts', {
        id: r.broadcastId,
        part: 'snippet,status,contentDetails'
    });
    return page.items[0];
}
export async function inspectBroadcast(api, r, allowUnbound = false) {
    const b = await lookupBroadcast(api, r);
    assertBroadcast(b, r, allowUnbound);
    return b;
}
export async function broadcastStatus(api, r) {
    const b = await lookupBroadcast(api, r);
    if (!b && r.cancellation)
        return 'cancelled';
    assertBroadcast(b, r, true);
    return b.status.lifeCycleStatus;
}
export async function cancelUnstarted(api, r, save) {
    const b = await lookupBroadcast(api, r);
    if (!b && r.cancellation)
        return 'cancelled';
    assertBroadcast(b, r, true);
    if (!['created', 'ready'].includes(b.status.lifeCycleStatus) || b.snippet.actualStartTime)
        throw Error('Only an unstarted owned broadcast can be cancelled');
    if (r.cancellation)
        throw Error('Cancellation already submitted; inspect status before any further action');
    r.cancellation = 'requested';
    save();
    await api('DELETE', 'liveBroadcasts', { id: b.id });
    if (await lookupBroadcast(api, r))
        throw Error('Cancellation not yet confirmed; inspect status');
    r.cancellation = 'confirmed';
    save();
    return 'cancelled';
}
export async function closeBroadcast(api, r) {
    const state = await broadcastStatus(api, r);
    if (state !== 'live' && state !== 'testing')
        return state;
    try {
        await api('POST', 'liveBroadcasts/transition', {
            id: r.broadcastId,
            broadcastStatus: 'complete',
            part: 'status'
        });
    }
    catch (error) {
        // Ingest auto-stop can win the same transition.
        if ((await broadcastStatus(api, r)) === 'complete')
            return 'complete';
        throw error;
    }
    return await broadcastStatus(api, r);
}
export async function endBroadcast(api, r) {
    const state = await closeBroadcast(api, r);
    if (state !== 'complete' && state !== 'cancelled')
        throw Error('Broadcast remains ' +
            state +
            '; inspect status. Use cancel-unstarted only to remove an unstarted session.');
    return state;
}
export function missingYoutubeEvidence({ live, finalState, chatReads, probeRequested, probeSpoken }) {
    if (!live)
        return 'live state was never observed';
    if (finalState !== 'complete')
        return 'broadcast closure was not confirmed';
    if (!chatReads)
        return 'no successful live chat read';
    if (probeRequested && !probeSpoken)
        return 'test message did not finish speaking';
    return undefined;
}
export class YoutubeProbe {
    attempts = 0;
    next;
    constructor(liveAt) {
        this.next = liveAt + 20_000;
    }
    due(now) {
        return now >= this.next && this.attempts < 3;
    }
    async post(chat, text) {
        this.attempts++;
        this.next = Infinity; // An uncertain write must never be repeated.
        try {
            return (await chat.testMessage(text)).id;
        }
        catch (e) {
            if (!(e instanceof Error && /^YouTube POST liveChat\/messages 404 /.test(e.message)))
                throw e;
            this.next = Date.now() + 30_000;
            return undefined;
        }
    }
}
export class YoutubeChat {
    api;
    id;
    cursor;
    constructor(api, id) {
        this.api = api;
        this.id = id;
    }
    async poll(queue, observe) {
        const data = await this.api('GET', 'liveChat/messages', {
            part: 'snippet,authorDetails',
            liveChatId: this.id,
            ...(this.cursor ? { pageToken: this.cursor } : {})
        });
        for (const message of data.items ?? []) {
            if (['textMessageEvent', 'superChatEvent'].includes(message.snippet.type)) {
                if (message.snippet.displayMessage)
                    observe?.(message.id, message.snippet.displayMessage, message.snippet.authorChannelId);
                const author = message.snippet.authorChannelId;
                queue.add({ source: 'youtube', id: message.id, text: message.snippet.displayMessage,
                    ...(message.authorDetails?.displayName && { displayName: message.authorDetails.displayName.slice(0, 128) }),
                    ...(author && { speaker: 'yt-' + createHash('sha256').update(this.id).update(author).digest('hex').slice(0, 12) }) });
            }
        }
        this.cursor = data.nextPageToken;
        return Math.max(1000, data.pollingIntervalMillis || 5000);
    }
    async testMessage(text) {
        return this.api('POST', 'liveChat/messages', { part: 'snippet' }, {
            snippet: { liveChatId: this.id, type: 'textMessageEvent', textMessageDetails: { messageText: text } }
        });
    }
}
