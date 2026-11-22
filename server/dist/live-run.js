import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { answer, broadcastLines, ChatQueue, continueBroadcast, liveConfig, loadCharacter, preparedReply } from './live-character.js';
import { GenaiRequestError, requestGenai } from './astra-genai-client.js';
import { checkLiveRelay, encode, splitIngest } from './live-encoder.js';
import { prepareIdleClips, idleCount } from './live-idle.js';
import { NativeTalk, openingParts, talkPrompt } from './live-native.js';
import { liveStartChoice, liveStartChoices } from './live-options.js';
import { LiveProgram, LiveRenderPool, isReply } from './live-program.js';
import { youtubeApi, checkChannel, prepareYoutube, activeChatId, resumeUnstarted, inspectBroadcast, closeBroadcast, broadcastStatus, cancelUnstarted, endBroadcast, missingYoutubeEvidence, YoutubeChat, YoutubeProbe } from './live-youtube.js';
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
            start: { type: 'string' },
            'youtube-probe': { type: 'string' },
            'resume-from': { type: 'string' }
        }
    });
    const [action] = positionals;
    if (action === 'choices' && positionals.length === 1) {
        console.log(JSON.stringify(liveStartChoices));
        return;
    }
    const recovery = ['status', 'end', 'cancel-unstarted'].includes(action);
    if ((!['check', 'warm', 'prepare-idle', 'run', 'reserve'].includes(action) && !recovery) || !v.config || positionals.length !== 1)
        throw Error('Use choices|check|warm|prepare-idle|reserve|run|status|end|cancel-unstarted --config file [--out directory] [--youtube] [--tiktok]');
    const destination = v.youtube || v.tiktok;
    const start = action === 'run' || action === 'reserve'
        ? await liveStartChoice(v.start ?? (action === 'run' && !destination ? 'preview' : undefined))
        : undefined;
    if (start === 'cancel') {
        console.log(JSON.stringify({ state: 'cancelled' }));
        return;
    }
    if (start === 'ready' && !destination)
        throw Error('Choose a live destination or --start preview');
    const cfg = liveConfig.parse(JSON.parse(readFileSync(v.config, 'utf8')));
    if (v['resume-from'] && (action !== 'run' || !v.youtube || start !== 'ready' || cfg.madeForKids !== false))
        throw Error('Resume requires a YouTube run with live chat enabled');
    const api = (v.youtube && start !== 'preview') || recovery ? await youtubeApi(cfg.youtubeCredentialChannel ?? cfg.channel) : undefined;
    if (api && !cfg.youtubeChannelId)
        throw Error('Set youtubeChannelId before connecting');
    const tiktok = v.tiktok && start !== 'preview' ? process.env.TIKTOK_LIVE_RTMPS_URL : undefined;
    if (v.tiktok && start !== 'preview' && !tiktok)
        throw Error('An account-authorized TikTok RTMPS URL is required');
    if (tiktok)
        splitIngest(tiktok);
    if (!v.out && !['warm', 'check', 'prepare-idle'].includes(action))
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
    if (action === 'reserve') {
        if (!api || !v.youtube || v.tiktok || start !== 'ready' || !v.title?.trim() || v.title.length > 100)
            throw Error('Reserve needs --youtube, --start ready and a YouTube title of 1–100 characters');
        mkdirSync(out, { mode: 0o700 });
        const receipt = { channelId: cfg.youtubeChannelId, marker: randomUUID(), topic: cfg.topic };
        writeReceipt(receipt);
        await prepareYoutube(api, cfg, v.title, receipt, () => writeReceipt(receipt));
        appendFileSync(join(out, 'events.jsonl'), JSON.stringify({
            at: new Date().toISOString(), event: 'youtube_reserved', id: receipt.broadcastId
        }) + '\n', { mode: 0o600 });
        console.log(JSON.stringify({ id: receipt.broadcastId, privacy: 'unlisted', state: 'reserved' }));
        return;
    }
    const actor = loadCharacter(cfg, action === 'prepare-idle' ? 'standby' : 'native');
    const concept = cfg.broadcastConcept ?? (cfg.talkPrompt ?? cfg.persona ?? talkPrompt).slice(0, 600);
    if (action === 'prepare-idle') {
        if (destination)
            throw Error('Prepare standby clips without a live destination');
        const controller = new AbortController();
        const stop = () => controller.abort();
        process.once('SIGTERM', stop);
        process.once('SIGINT', stop);
        try {
            const paths = await prepareIdleClips(actor.asset, cfg.project, concept, controller.signal, index => console.error(`Standby clips ready: ${index}/${idleCount}`));
            console.log(JSON.stringify({ count: paths.length, paths }));
        }
        finally {
            process.removeListener('SIGTERM', stop);
            process.removeListener('SIGINT', stop);
        }
        return;
    }
    if (api || tiktok)
        checkLiveRelay();
    if (action === 'check') {
        if (api)
            await checkChannel(api, cfg.youtubeChannelId);
        const caps = await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15000);
        if (!caps?.image_conditioning || !caps.voice_references)
            throw Error('GenAI needs image conditioning and subject voice references for live dialogue');
        console.log(JSON.stringify({
            localAssetsReady: true,
            liveStart: liveStartChoices,
            maxConcurrentVideos: cfg.maxConcurrentVideos,
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
        const renderer = new NativeTalk(actor, cfg.project, cfg.talkPrompt ?? talkPrompt);
        try {
            const { opening, standby } = await broadcastLines(cfg, actor);
            for (const text of new Set([...openingParts(opening, actor.language), ...standby, ...cfg.reactions.map(r => r.answer)])) {
                const { motion } = await renderer.render(text, new AbortController().signal);
                renderer.release(motion);
            }
        }
        finally {
            renderer.close();
        }
        console.log(JSON.stringify({ warmed: true, character: cfg.character, provider: 'astra-genai' }));
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
    const prior = v['resume-from'] ? resolve(v['resume-from']) : undefined;
    const receipt = prior
        ? JSON.parse(readFileSync(join(prior, 'youtube.json'), 'utf8'))
        : { channelId: cfg.youtubeChannelId ?? '', marker: randomUUID(), topic: cfg.topic };
    if (prior && (receipt.channelId !== cfg.youtubeChannelId || !receipt.broadcastId))
        throw Error('Resume receipt does not belong to this channel');
    if (prior) {
        if (receipt.topic)
            cfg.topic = receipt.topic;
        const journal = readFileSync(join(prior, 'events.jsonl'), 'utf8').trim().split('\n');
        const closed = journal.some((line) => {
            const e = JSON.parse(line);
            return (e.id === receipt.broadcastId && (e.event === 'youtube_reserved' ||
                (e.event === 'youtube_final' && e.state === 'ready' && e.ingestLive === false)));
        });
        if (!closed)
            throw Error('The prior encoder has not confirmed an unstarted shutdown');
    }
    let ownsRun = !prior;
    const save = () => writeReceipt(receipt);
    const motion = new NativeTalk(actor, cfg.project, cfg.talkPrompt ?? talkPrompt, log);
    const program = new LiveProgram(clip => { if (clip.motion)
        motion.release(clip.motion); });
    const { ready } = program;
    const queue = new ChatQueue(event => {
        program.hear(event);
        received++;
        log('chat_received', { source: event.source, id: event.id, text: event.text });
    });
    let polling, replying, hosting;
    let acceptingUntil = Infinity, planningReply = false;
    const pendingHost = new Set();
    const pendingReplies = new Set();
    const speakerOrder = new Map();
    let hostLine = 0;
    let received = 0, failedReplies = 0, unfinishedReplies = 0, spokenReplies = 0;
    const unfinished = (source, id, stage) => {
        if (isReply(source))
            unfinishedReplies++;
        log('reply_unfinished', { source, id, stage });
    };
    let ingestLive = false, chatReads = 0, probeId = '', probeSpoken = false, finalState = '', endedEarly = false, chatQuotaExhausted = false;
    const take = () => {
        const roomLive = !api || ingestLive;
        if (!roomLive && Date.now() >= acceptingUntil)
            throw Error('YouTube did not report live before the session deadline');
        const awaitingAnswer = planningReply || pendingReplies.size > 0 || queue.pending > 0;
        return program.take(roomLive, Date.now() < acceptingUntil || awaitingAnswer, awaitingAnswer);
    };
    const wait = async (ms) => {
        await sleep(ms, undefined, { signal: controller.signal }).catch(() => { });
    };
    const onLog = (kind, fields) => {
        log(kind, fields);
        if (kind === 'speech_interrupted' && isReply(String(fields.source)))
            unfinishedReplies++;
        if (kind === 'speech_end' && isReply(String(fields.source)))
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
                    if (Date.now() < acceptingUntil && (e.source === 'operator' || (tiktok && e.source === 'tiktok')))
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
    const wake = (api || tiktok) && process.platform === 'darwin'
        ? spawn('/usr/bin/caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' })
        : undefined;
    wake?.on('error', () => log('sleep_prevention_unavailable', {}));
    try {
        log('idle_pool_preparing', { total: idleCount });
        await motion.prepareIdle(concept, controller.signal, log);
        const pool = new LiveRenderPool(cfg.maxConcurrentVideos);
        const signal = controller.signal;
        let hostOrder = Promise.resolve();
        let orderedVersion = -1;
        async function prepareHost(preflight) {
            const version = program.version;
            const context = program.context();
            const id = 'host-' + (hostLine + 1);
            const stale = () => signal.aborted || (!preflight && (Date.now() >= acceptingUntil || version !== program.version));
            // After a conversation, alternate contextual follow-ups with independent radio segments.
            const reusable = !context.scheduledReplies.length &&
                (!context.recentChat.length || (hostLine % 2 === 0 && !context.onAir.at(-1)?.answering));
            log('host_generation_started', { id, onAir: context.onAir.length, upcoming: context.scheduledHost.length });
            const text = await continueBroadcast(cfg, actor, context, cfg.hostLines[hostLine], signal, reusable);
            if (stale())
                return;
            if ([...context.scheduledHost, ...context.onAir.map(turn => turn.host)].includes(text))
                throw Error('Host repeated a recent line');
            hostLine++;
            program.draftingHosts.set(id, text);
            const previous = orderedVersion === version ? hostOrder : Promise.resolve();
            orderedVersion = version;
            const render = pool.run(false, async () => {
                if (!stale())
                    return motion.render(text, signal);
            });
            const job = Promise.all([previous, render]).then(([, clip]) => {
                if (!clip)
                    return;
                if (stale()) {
                    motion.release(clip.motion);
                    log('host_segment_discarded', { id, version });
                    return;
                }
                ready.push({ source: 'host', id, text, reusable, ...clip });
                log('host_segment_ready', { id, preflight });
            });
            hostOrder = job.catch(() => { });
            const tracked = job.catch(error => {
                if (preflight)
                    throw error;
                if (!signal.aborted)
                    log('host_line_unavailable', { id, reason: error instanceof Error ? error.name : 'error' });
            }).finally(() => {
                pendingHost.delete(tracked);
                program.draftingHosts.delete(id);
            });
            pendingHost.add(tracked);
            if (preflight)
                await tracked;
        }
        log('native_opening_preparing', { ...liveStartChoices, maxConcurrentVideos: pool.limit, topic: cfg.topic });
        const { opening, standby } = await broadcastLines(cfg, actor, signal);
        const prepared = await Promise.allSettled([
            (async () => {
                for (const [index, text] of openingParts(opening, actor.language).entries()) {
                    const clip = await pool.run(false, () => motion.render(text, signal));
                    ready.push({ source: 'opening', id: index ? 'opening-' + (index + 1) : 'opening', text, ...clip });
                }
                await prepareHost(true);
            })(),
            ...standby.map(async (text, index) => {
                const clip = await pool.run(false, () => motion.render(text, signal));
                program.addStandby({ source: 'standby', id: 'welcome-' + (index + 1), text, reusable: true, ...clip });
            })
        ]);
        for (const result of prepared)
            if (result.status === 'rejected')
                throw result.reason;
        if (controller.signal.aborted)
            return;
        let chat;
        const destinations = [];
        if (api) {
            let target;
            if (prior) {
                target = await resumeUnstarted(api, receipt);
                writeFileSync(join(prior, 'resume-claimed'), out, { flag: 'wx', mode: 0o600 });
                ownsRun = true;
                save();
            }
            else {
                save();
                target = await prepareYoutube(api, cfg, v.title, receipt, save);
            }
            destinations.push(target.url);
            if (target.chatId)
                chat = new YoutubeChat(api, target.chatId);
            log('youtube_prepared', { id: receipt.broadcastId, privacy: 'unlisted' });
        }
        if (tiktok)
            destinations.push(tiktok);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', receive);
        acceptingUntil = Date.now() + seconds * 1000;
        hosting = (async () => {
            while (!controller.signal.aborted && Date.now() < acceptingUntil) {
                try {
                    const hostCapacity = Math.max(1, pool.limit - 1);
                    if (program.canPlanHost && !queue.pending && pendingHost.size < hostCapacity
                        && pendingHost.size + ready.length < Math.max(2, pool.limit)) {
                        await prepareHost(false);
                    }
                }
                catch (error) {
                    if (!controller.signal.aborted) {
                        log('host_line_unavailable', { reason: error instanceof Error ? error.name : 'error' });
                        await wait(5000);
                    }
                }
                await wait(50);
            }
        })();
        replying = (async () => {
            while (!signal.aborted) {
                const event = program.readyReplies + pendingReplies.size < 8 && queue.next();
                if (!event) {
                    await wait(50);
                    continue;
                }
                planningReply = true;
                const key = event.source + ':' + event.id;
                const speaker = event.source + ':' + (event.speaker ?? '');
                const question = { speaker: event.speaker, text: event.text };
                let stage = 'generating';
                const failure = (error) => {
                    if (signal.aborted) {
                        unfinished(event.source, event.id, stage);
                        return;
                    }
                    failedReplies++;
                    const reason = error instanceof GenaiRequestError ? 'gateway_http_' + error.httpStatus
                        : error instanceof Error ? error.name : 'error';
                    log('reply_failed', { source: event.source, id: event.id, stage, reason });
                };
                try {
                    const prepared = preparedReply(cfg, event.text);
                    const selective = event.source !== 'operator' && event.text !== probe;
                    const text = prepared ?? await answer(cfg, actor, event.text, signal, program.context(), event.speaker, selective);
                    if (selective && text === '[SKIP]') {
                        log('chat_skipped', { source: event.source, id: event.id });
                        continue;
                    }
                    program.changeContext();
                    program.draftingReplies.set(key, { host: text, answering: question });
                    log('reply_generated', { source: event.source, id: event.id, prepared: !!prepared });
                    stage = 'generating_av';
                    const render = async () => {
                        const cached = prepared && await motion.cached(text, signal);
                        if (cached)
                            return cached;
                        return pool.run(true, () => {
                            signal.throwIfAborted();
                            return motion.render(text, signal);
                        });
                    };
                    const previous = speakerOrder.get(speaker);
                    const job = Promise.allSettled([previous, render()]).then(([, result]) => {
                        if (result.status === 'rejected')
                            throw result.reason;
                        program.queueReply({ source: event.source, id: event.id, text, question, ...result.value }, true);
                    }).catch(failure);
                    const tracked = job.finally(() => {
                        pendingReplies.delete(tracked);
                        program.draftingReplies.delete(key);
                        if (speakerOrder.get(speaker) === tracked)
                            speakerOrder.delete(speaker);
                    });
                    pendingReplies.add(tracked);
                    speakerOrder.set(speaker, tracked);
                }
                catch (error) {
                    failure(error);
                }
                finally {
                    planningReply = false;
                }
            }
        })();
        if (api) {
            let liveChat = chat;
            polling = (async () => {
                let tester;
                let canonical = false;
                while (!controller.signal.aborted) {
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
                        if (ingestLive && liveChat && Date.now() < acceptingUntil && !controller.signal.aborted) {
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
                            if (canonical && probe && !probeId && tester?.due(Date.now()) && !controller.signal.aborted) {
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
                        if (!controller.signal.aborted &&
                            e instanceof Error &&
                            e.message === 'YouTube GET liveChat/messages 403 liveChatEnded' &&
                            (await broadcastStatus(api, receipt).catch(() => '')) === 'complete') {
                            endedEarly = true;
                            log('youtube_ended_early', { id: receipt.broadcastId });
                            stop();
                        }
                        log('youtube_read_error', { message: e instanceof Error ? e.message : 'failed' });
                    }
                    await wait(delay);
                }
            })();
        }
        await encode([], join(out, 'recording.flv'), destinations, seconds, controller.signal, take, onLog, motion, () => planningReply || pendingReplies.size > 0 || queue.pending > 0 || ready.some(e => isReply(e.source)), clip => program.finish(clip));
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
        if (api && receipt.broadcastId && ownsRun) {
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
        await Promise.allSettled([polling, replying, hosting]);
        await Promise.allSettled([...pendingHost, ...pendingReplies]);
        wake?.kill();
        motion.close();
        for (const event of ready)
            if (isReply(event.source))
                unfinished(event.source, event.id, 'awaiting_playback');
        for (let event = queue.next(); event; event = queue.next())
            unfinished(event.source, event.id, 'queued');
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    }
    if (api) {
        const reason = endedEarly
            ? 'broadcast ended before the encoder finished'
            : missingYoutubeEvidence({
                live: ingestLive,
                finalState,
                chatReads,
                probeRequested: !!probe,
                probeSpoken
            });
        log('youtube_chat_summary', { id: receipt.broadcastId, successfulReads: chatReads });
        if (reason || chatQuotaExhausted) {
            const problem = reason ?? 'chat quota exhausted';
            log('session_incomplete', { platform: 'youtube', reason: problem });
            throw Error('YouTube ' + problem + '; inspect existing receipt');
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
