import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { answer, ChatQueue, liveConfig, loadCharacter, poses, preparedReply, preparedSpeech, synthesize } from './live-character.js';
import { GenaiRequestError } from './astra-genai-client.js';
import { encode, splitIngest } from './live-encoder.js';
import { youtubeApi, checkChannel, prepareYoutube, inspectBroadcast, closeBroadcast, broadcastStatus, cancelUnstarted, endBroadcast, missingYoutubeEvidence, YoutubeChat } from './live-youtube.js';
async function main() {
    const { values: v, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            config: { type: 'string' },
            out: { type: 'string' },
            seconds: { type: 'string', default: '120' },
            youtube: { type: 'boolean' },
            tiktok: { type: 'boolean' },
            title: { type: 'string' },
            'youtube-probe': { type: 'string' }
        }
    });
    const [action] = positionals;
    const recovery = ['status', 'end', 'cancel-unstarted'].includes(action);
    if ((!['check', 'warm', 'run'].includes(action) && !recovery) || !v.config || positionals.length !== 1)
        throw Error('Use check|warm|run|status|end|cancel-unstarted --config file [--out directory] [--youtube] [--tiktok]');
    const cfg = liveConfig.parse(JSON.parse(readFileSync(v.config, 'utf8')));
    const api = v.youtube || recovery ? await youtubeApi(cfg.channel) : undefined;
    if (api && !cfg.youtubeChannelId)
        throw Error('Set youtubeChannelId before connecting');
    const tiktok = v.tiktok ? process.env.TIKTOK_LIVE_RTMPS_URL : undefined;
    if (v.tiktok && !tiktok)
        throw Error('An account-authorized TikTok RTMPS URL is required');
    if (tiktok)
        splitIngest(tiktok);
    if (!v.out && action !== 'warm' && action !== 'check')
        throw Error('Set --out to a unique session directory');
    const out = resolve(v.out ?? '.'), receiptFile = join(out, 'youtube.json');
    const writeReceipt = (r) => {
        const tmp = receiptFile + '.' + randomUUID() + '.tmp';
        writeFileSync(tmp, JSON.stringify(r, null, 2), { mode: 0o600, flag: 'wx' });
        renameSync(tmp, receiptFile);
    };
    if (recovery) {
        const r = JSON.parse(readFileSync(receiptFile, 'utf8'));
        if (r.channelId !== cfg.youtubeChannelId || !r.broadcastId)
            throw Error('No owned broadcast receipt');
        let state;
        if (action === 'end')
            state = await endBroadcast(api, r);
        else if (action === 'cancel-unstarted') {
            state = await cancelUnstarted(api, r, () => {
                if (r.cancellation === 'requested')
                    writeFileSync(join(out, 'cancel-requested'), r.broadcastId, { mode: 0o600, flag: 'wx' });
                writeReceipt(r);
            });
        }
        else
            state = await broadcastStatus(api, r);
        console.log(JSON.stringify({ id: r.broadcastId, state }));
        return;
    }
    const actor = loadCharacter(cfg);
    if (action === 'check') {
        if (api)
            await checkChannel(api, cfg.youtubeChannelId);
        console.log(JSON.stringify({
            localAssetsReady: true,
            character: cfg.character,
            language: actor.language,
            youtubeLiveReadAccess: !!api,
            broadcastCreation: 'untested'
        }));
        return;
    }
    if (action === 'warm') {
        if (api || v.tiktok)
            throw Error('Warm runs locally');
        for (const text of new Set([cfg.opening, ...cfg.reactions.map((r) => r.answer)]))
            await preparedSpeech(cfg, actor, text);
        console.log(JSON.stringify({ warmed: true, character: cfg.character }));
        return;
    }
    const seconds = Number(v.seconds);
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 86400)
        throw Error('Duration must be 5–86400 seconds');
    if (api && (!v.title?.trim() || v.title.length > 100))
        throw Error('Set a YouTube title of 1–100 characters');
    const probe = v['youtube-probe']?.trim();
    if (v['youtube-probe'] !== undefined && (!api || !probe || probe.length > 200))
        throw Error('Invalid YouTube test message');
    if (api)
        await checkChannel(api, cfg.youtubeChannelId);
    mkdirSync(out, { mode: 0o700 }); // Atomic admission: never repeat side effects in an existing session.
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const log = (event, fields = {}) => {
        appendFileSync(join(out, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n', { mode: 0o600 });
    };
    const receipt = { channelId: cfg.youtubeChannelId ?? '', marker: randomUUID() };
    const save = () => writeReceipt(receipt);
    const queue = new ChatQueue(), ready = [];
    let polling, replying;
    let received = 0, failedReplies = 0, unfinishedReplies = 0, spokenReplies = 0;
    const unfinished = (source, id, stage) => {
        if (source !== 'opening')
            unfinishedReplies++;
        log('reply_unfinished', { source, id, stage });
    };
    let ingestLive = false, chatReads = 0, probeId = '', probeSpoken = false, finalState = '';
    const take = () => ready.shift();
    const wait = async (ms) => {
        await sleep(ms, undefined, { signal: controller.signal }).catch(() => { });
    };
    const onLog = (kind, fields) => {
        log(kind, fields);
        if (kind === 'speech_interrupted' && fields.source !== 'opening')
            unfinishedReplies++;
        if (kind === 'speech_end' && fields.source !== 'opening')
            spokenReplies++;
        if (kind === 'speech_end' && probeId && fields.id === probeId && fields.source === 'youtube')
            probeSpoken = true;
    };
    let partial = '', discard = false;
    function receive(bytes) {
        for (const chunk of bytes.split(/(?<=\n)/)) {
            if (!discard) {
                partial += chunk;
                if (partial.length > 1600) {
                    partial = '';
                    discard = true;
                }
            }
            if (!chunk.endsWith('\n'))
                continue;
            try {
                if (!discard && partial.trim()) {
                    const e = JSON.parse(partial);
                    if (e.source === 'operator' || (v.tiktok && e.source === 'tiktok'))
                        queue.add(e);
                }
            }
            catch {
                /* Invalid external messages cannot interrupt the show. */
            }
            partial = '';
            discard = false;
        }
    }
    try {
        const frames = poses(actor.asset, cfg);
        ready.push({
            source: 'opening',
            id: 'opening',
            text: cfg.opening,
            pcm: await preparedSpeech(cfg, actor, cfg.opening, controller.signal)
        });
        if (controller.signal.aborted)
            return;
        let chat;
        const destinations = [];
        if (api) {
            save();
            const target = await prepareYoutube(api, cfg, v.title, receipt, save);
            destinations.push(target.url);
            if (target.chatId)
                chat = new YoutubeChat(api, target.chatId);
            log('youtube_prepared', { id: receipt.broadcastId, privacy: 'unlisted' });
        }
        if (tiktok)
            destinations.push(tiktok);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', receive);
        replying = (async () => {
            while (!controller.signal.aborted) {
                const event = ready.length < 2 && queue.next();
                if (!event) {
                    await wait(100);
                    continue;
                }
                let stage = 'generating';
                try {
                    received++;
                    log('chat_received', { source: event.source, id: event.id, text: event.text });
                    const prepared = preparedReply(cfg, event.text);
                    const text = prepared ?? (await answer(cfg, actor, event.text, controller.signal));
                    log('reply_generated', { source: event.source, id: event.id, prepared: !!prepared });
                    controller.signal.throwIfAborted();
                    stage = 'synthesizing';
                    const pcm = prepared
                        ? await preparedSpeech(cfg, actor, text, controller.signal)
                        : await synthesize(actor, text, controller.signal);
                    controller.signal.throwIfAborted();
                    ready.push({ source: event.source, id: event.id, text, pcm });
                }
                catch (e) {
                    if (controller.signal.aborted) {
                        unfinished(event.source, event.id, stage);
                        break;
                    }
                    failedReplies++;
                    log('reply_failed', {
                        source: event.source,
                        id: event.id,
                        reason: e instanceof GenaiRequestError
                            ? 'gateway_http_' + e.httpStatus
                            : e instanceof Error
                                ? e.name
                                : 'error'
                    });
                }
            }
        })();
        if (api) {
            let liveChat = chat;
            polling = (async () => {
                let sent = false;
                while (!controller.signal.aborted) {
                    let delay = 4000;
                    try {
                        if (!ingestLive || !liveChat) {
                            const b = await inspectBroadcast(api, receipt);
                            if (b.snippet.liveChatId)
                                liveChat ??= new YoutubeChat(api, b.snippet.liveChatId);
                            if (!ingestLive && b.status.lifeCycleStatus === 'live') {
                                ingestLive = true;
                                log('youtube_live', { id: b.id });
                            }
                        }
                        if (ingestLive && liveChat && probe && !sent && !controller.signal.aborted) {
                            sent = true; // A lost response must not post the message twice.
                            probeId = (await liveChat.testMessage(probe)).id;
                            log('youtube_probe', { id: probeId });
                        }
                        if (ingestLive && liveChat && !controller.signal.aborted) {
                            delay = await liveChat.poll(queue);
                            chatReads++;
                            if (chatReads === 1)
                                log('youtube_chat_connected', { id: receipt.broadcastId });
                        }
                    }
                    catch (e) {
                        log('youtube_read_error', { message: e instanceof Error ? e.message : 'failed' });
                    }
                    await wait(delay);
                }
            })();
        }
        await encode(frames, join(out, 'recording.flv'), destinations, seconds, controller.signal, take, onLog);
    }
    catch (e) {
        if (api && !receipt.broadcastId) {
            const message = e instanceof Error ? e.message : '';
            const rejected = /^YouTube POST liveBroadcasts 4(00|01|03) [A-Za-z0-9_]+$/.test(message);
            log('youtube_prepare_failure', {
                definiteRejection: rejected,
                reason: rejected ? message : 'inspect existing marker before retry',
                marker: receipt.marker
            });
        }
        throw e;
    }
    finally {
        stop();
        process.stdin.removeListener('data', receive);
        process.stdin.pause();
        if (api && receipt.broadcastId) {
            try {
                for (let i = 0; i < 8; i++) {
                    finalState = await closeBroadcast(api, receipt);
                    if (finalState === 'complete' || (['created', 'ready'].includes(finalState) && !ingestLive))
                        break;
                    await sleep(2500);
                }
                log('youtube_final', {
                    id: receipt.broadcastId,
                    state: finalState,
                    ingestLive,
                    probeId,
                    probeSpoken
                });
            }
            catch {
                log('youtube_final_unknown', { id: receipt.broadcastId });
            }
        }
        await Promise.allSettled([polling, replying]);
        for (const event of ready)
            unfinished(event.source, event.id, 'awaiting_playback');
        for (let event = queue.next(); event; event = queue.next())
            unfinished(event.source, event.id, 'queued');
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    }
    if (api) {
        const reason = missingYoutubeEvidence({
            live: ingestLive,
            finalState,
            chatReads,
            probeRequested: !!probe,
            probeSpoken
        });
        log('youtube_chat_summary', { id: receipt.broadcastId, successfulReads: chatReads });
        if (reason) {
            log('session_incomplete', { platform: 'youtube', reason });
            throw Error('YouTube ' + reason + '; inspect existing receipt');
        }
    }
    if (failedReplies || unfinishedReplies) {
        log('session_incomplete', { received, failedReplies, unfinishedReplies, spokenReplies });
        throw Error('Some accepted chat replies did not finish; inspect events.jsonl');
    }
    log('session_complete', {
        received,
        failedReplies,
        spokenReplies,
        platforms: [...(api ? ['youtube'] : []), ...(tiktok ? ['tiktok'] : [])]
    });
    console.log(JSON.stringify({
        out,
        ...(receipt.broadcastId ? { youtubeId: receipt.broadcastId, finalState, probeSpoken } : {})
    }));
}
main().catch((e) => {
    console.error(String(e instanceof Error ? e.message : e).replace(/rtmps?:\/\/\S+/gi, '[ingest redacted]'));
    process.exitCode = 1;
});
