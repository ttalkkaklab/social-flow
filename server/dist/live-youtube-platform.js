import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { saveLiveReceipt } from './live-platform.js';
import { activeChatId, broadcastStatus, cancelUnstarted, checkChannel, closeBroadcast, endBroadcast, inspectBroadcast, missingYoutubeEvidence, prepareYoutube, resumeUnstarted, youtubeApi, YoutubeChat, YoutubeProbe } from './live-youtube.js';
export function createYoutubePlatform(options, openApi = youtubeApi) {
    const { config, out, title, probe, resumeFrom, log } = options;
    const channelId = config.youtubeChannelId;
    if (!channelId)
        throw Error('Set youtubeChannelId before connecting');
    const receiptFile = join(out, 'youtube.json');
    let receipt = { channelId, marker: randomUUID(), topic: config.topic, speechLanguage: config.speechLanguage, faqCount: options.faqCount, knowledgeFingerprint: options.knowledgeFingerprint };
    const save = () => saveLiveReceipt(receiptFile, receipt);
    let client;
    const connect = () => client ??= openApi(config.youtubeCredentialChannel ?? config.channel);
    let ownsRun = !resumeFrom;
    let ingestLive = false, chatReads = 0, probeId = '', probeSpoken = false;
    let finalState = '', endedEarly = false, chatQuotaExhausted = false;
    let chat;
    function checkedTitle() {
        if (!title?.trim() || title.length > 100)
            throw Error('Set a YouTube title of 1–100 characters');
        return title;
    }
    function readOwned(dir) {
        const saved = JSON.parse(readFileSync(join(dir, 'youtube.json'), 'utf8'));
        if (saved.channelId !== channelId || !saved.broadcastId)
            throw Error('No owned broadcast receipt');
        return saved;
    }
    function readResume(dir) {
        receipt = readOwned(dir);
        const journal = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n');
        const closed = journal.some(line => {
            const event = JSON.parse(line);
            return event.id === receipt.broadcastId && (event.event === 'youtube_reserved' ||
                (event.event === 'youtube_final' && event.state === 'ready' && event.ingestLive === false));
        });
        if (!closed)
            throw Error('The prior encoder has not confirmed an unstarted shutdown');
        if (receipt.topic)
            config.topic = receipt.topic;
        if (receipt.speechLanguage && config.speechLanguage && receipt.speechLanguage !== config.speechLanguage)
            throw Error('The selected speechLanguage differs from the reserved broadcast language.');
        config.speechLanguage ??= receipt.speechLanguage;
        receipt.speechLanguage ??= config.speechLanguage;
    }
    async function recover(action) {
        receipt = readOwned(out);
        const api = await connect();
        let state;
        if (action === 'end')
            state = await endBroadcast(api, receipt);
        else if (action === 'cancel-unstarted') {
            state = await cancelUnstarted(api, receipt, () => {
                if (receipt.cancellation === 'requested')
                    writeFileSync(join(out, 'cancel-requested'), receipt.broadcastId, { mode: 0o600, flag: 'wx' });
                save();
            });
        }
        else
            state = await broadcastStatus(api, receipt);
        return { id: receipt.broadcastId, state };
    }
    return {
        id: 'youtube',
        get ready() { return ingestLive; },
        async check(forRun) {
            if (forRun) {
                checkedTitle();
                if (resumeFrom)
                    readResume(resumeFrom);
            }
            await checkChannel(await connect(), channelId);
            return { youtubeLiveReadAccess: true };
        },
        commands: {
            async reserve() {
                const name = checkedTitle();
                const api = await connect();
                mkdirSync(out, { mode: 0o700 });
                receipt.scheduledStartTime = options.scheduledStartTime;
                save();
                await prepareYoutube(api, config, name, receipt, save);
                log('youtube_reserved', { id: receipt.broadcastId });
                return { id: receipt.broadcastId, privacy: 'unlisted', state: 'reserved' };
            },
            status: () => recover('status'),
            end: () => recover('end'),
            'cancel-unstarted': () => recover('cancel-unstarted')
        },
        async prepare() {
            const api = await connect();
            let target;
            if (resumeFrom) {
                target = await resumeUnstarted(api, receipt);
                writeFileSync(join(resumeFrom, 'resume-claimed'), out, { flag: 'wx', mode: 0o600 });
                ownsRun = true;
                save();
            }
            else {
                const name = checkedTitle();
                save();
                target = await prepareYoutube(api, config, name, receipt, save);
            }
            if (target.chatId)
                chat = new YoutubeChat(api, target.chatId);
            log('youtube_prepared', { id: receipt.broadcastId, privacy: 'unlisted' });
            return { platform: 'youtube', url: target.url };
        },
        prepareFailed(error) {
            if (receipt.broadcastId)
                return;
            const message = error instanceof Error ? error.message : '';
            const rejected = /^YouTube POST liveBroadcasts 4(00|01|03) [A-Za-z0-9_]+$/.test(message);
            log('youtube_prepare_failure', {
                definiteRejection: rejected, reason: rejected ? message : 'inspect existing marker before retry',
                marker: receipt.marker
            });
        },
        async observe({ signal, stop, acceptingUntil, queue }) {
            const api = await connect();
            let liveChat = chat;
            let tester;
            let canonical = false;
            while (!signal.aborted) {
                let delay = 4000;
                try {
                    if (!ingestLive || !liveChat) {
                        const b = await inspectBroadcast(api, receipt);
                        if (b.snippet.liveChatId)
                            liveChat ??= new YoutubeChat(api, b.snippet.liveChatId);
                        if (!ingestLive && b.status.lifeCycleStatus === 'live') {
                            ingestLive = true;
                            if (probe)
                                tester = new YoutubeProbe(Date.now());
                            log('youtube_live', { id: b.id });
                        }
                    }
                    if (ingestLive && !canonical) {
                        const id = await activeChatId(api, receipt);
                        if (id) {
                            liveChat = new YoutubeChat(api, id);
                            canonical = true;
                        }
                    }
                    if (ingestLive && liveChat && Date.now() < acceptingUntil && !signal.aborted) {
                        delay = await liveChat.poll(queue, (id, text, author) => {
                            if (probe && !probeId && text === probe && author === receipt.channelId) {
                                probeId = id;
                                log('youtube_probe_observed', { id });
                            }
                        });
                        chatReads++;
                        chatQuotaExhausted = false;
                        if (chatReads === 1)
                            log('youtube_chat_connected', { id: receipt.broadcastId });
                        if (canonical && probe && !probeId && tester?.due(Date.now()) && !signal.aborted) {
                            const posted = await tester.post(liveChat, probe);
                            if (posted) {
                                probeId = posted;
                                log('youtube_probe', { id: posted });
                            }
                            else {
                                canonical = false;
                                log('youtube_probe_not_ready', { id: receipt.broadcastId });
                            }
                        }
                    }
                }
                catch (e) {
                    if (e instanceof Error && e.message.includes('403 quotaExceeded')) {
                        if (!chatQuotaExhausted)
                            log('youtube_chat_quota_exhausted');
                        chatQuotaExhausted = true;
                        delay = 300000;
                    }
                    if (!signal.aborted &&
                        e instanceof Error &&
                        e.message === 'YouTube GET liveChat/messages 403 liveChatEnded' &&
                        (await broadcastStatus(api, receipt).catch(() => '')) === 'complete') {
                        endedEarly = true;
                        log('youtube_ended_early', { id: receipt.broadcastId });
                        stop();
                    }
                    log('youtube_read_error', { message: e instanceof Error ? e.message : 'failed' });
                }
                await sleep(delay, undefined, { signal }).catch(() => { });
            }
        },
        onEvent(event, fields) {
            if (event === 'speech_end' && !fields.address && probeId && fields.id === probeId && fields.source === 'youtube')
                probeSpoken = true;
        },
        async close() {
            if (!receipt.broadcastId || !ownsRun)
                return;
            try {
                const api = await connect();
                for (let i = 0; i < 8; i++) {
                    finalState = await closeBroadcast(api, receipt);
                    if (finalState === 'complete' || (['created', 'ready'].includes(finalState) && !ingestLive))
                        break;
                    await sleep(2500);
                }
                log('youtube_final', { id: receipt.broadcastId, state: finalState, ingestLive, probeId, probeSpoken });
            }
            catch {
                log('youtube_final_unknown', { id: receipt.broadcastId });
            }
            log('youtube_chat_summary', { id: receipt.broadcastId, successfulReads: chatReads });
        },
        problem() {
            if (endedEarly)
                return 'broadcast ended before the encoder finished';
            return missingYoutubeEvidence({
                live: ingestLive, finalState, chatReads, probeRequested: !!probe, probeSpoken
            }) ?? (chatQuotaExhausted ? 'chat quota exhausted' : undefined);
        },
        summary() { return { youtubeId: receipt.broadcastId, finalState, probeSpoken }; }
    };
}
