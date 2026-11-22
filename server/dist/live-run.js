import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { answer, ChatQueue, listenChatInput, continueBroadcast, liveConfig, loadCharacter, preparedReply } from './live-character.js';
import { GenaiRequestError, requestGenai } from './astra-genai-client.js';
import { checkLiveRelay, encode } from './live-encoder.js';
import { prepareIdleClips, idleCount } from './live-idle.js';
import { NativeTalk, talkPrompt } from './live-native.js';
import { liveStartChoice, liveStartChoices } from './live-options.js';
import { LiveProgram, isReply } from './live-program.js';
import { livePlatformIds } from './live-platform.js';
import { livePlatforms, selectPlatforms } from './live-platform-registry.js';
async function main() {
    const { values: v, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            config: { type: 'string' },
            out: { type: 'string' },
            seconds: { type: 'string', default: '120' },
            platform: { type: 'string', multiple: true },
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
        throw Error('Use choices|check|warm|prepare-idle|reserve|run|status|end|cancel-unstarted --config file [--out directory] [--platform youtube|tiktok] [--youtube] [--tiktok]');
    const selected = selectPlatforms([
        ...(v.platform ?? []), ...(v.youtube ? ['youtube'] : []), ...(v.tiktok ? ['tiktok'] : [])
    ]);
    const destination = selected.length > 0;
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
    if (!v.out && !['warm', 'check', 'prepare-idle'].includes(action))
        throw Error('Set --out to a unique session directory');
    const out = resolve(v.out ?? '.');
    const platforms = [];
    const log = (event, fields = {}) => {
        appendFileSync(join(out, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n', { mode: 0o600 });
        for (const platform of platforms)
            platform.onEvent?.(event, fields);
    };
    const ids = recovery && !destination
        ? livePlatformIds.filter(id => existsSync(join(out, id + '.json')))
        : selected;
    if (recovery && !destination && !ids.length)
        throw Error('No broadcast receipt in the session directory');
    const probe = v['youtube-probe']?.trim();
    if (v['youtube-probe'] !== undefined && (action !== 'run' || start !== 'ready' ||
        !ids.includes('youtube') || !probe || probe.length > 200))
        throw Error('Invalid YouTube test message');
    if (v['resume-from'] && (action !== 'run' || !ids.includes('youtube') || start !== 'ready' || cfg.madeForKids !== false))
        throw Error('Resume requires a YouTube run with live chat enabled');
    if (['warm', 'prepare-idle'].includes(action) && destination)
        throw Error('Prepare clips locally');
    const options = { config: cfg, out, title: v.title, probe,
        resumeFrom: v['resume-from'] && resolve(v['resume-from']), log };
    if ((recovery || action === 'reserve') && ids.length !== 1)
        throw Error('Choose one --platform for room management');
    if (start !== 'preview')
        platforms.push(...ids.map(id => livePlatforms[id](options)));
    if (recovery || action === 'reserve') {
        if (action === 'reserve' && start !== 'ready')
            throw Error('Reserve requires --start ready');
        const command = platforms[0].commands[action];
        if (!command)
            throw Error(platforms[0].id + ' does not support ' + action + ' via API. Use the platform LIVE controls.');
        console.log(JSON.stringify(await command()));
        return;
    }
    const checks = { youtubeLiveReadAccess: false };
    if (platforms.length)
        checkLiveRelay();
    for (const platform of platforms)
        Object.assign(checks, await platform.check(action === 'run'));
    const actor = loadCharacter(cfg, action === 'prepare-idle' ? 'standby' : 'native');
    const concept = cfg.broadcastConcept ?? (cfg.talkPrompt ?? cfg.persona ?? talkPrompt).slice(0, 600);
    if (action === 'prepare-idle') {
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
    if (action === 'check') {
        const caps = await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15000);
        if (!caps?.image_conditioning || !caps.voice_references)
            throw Error('GenAI needs image conditioning and subject voice references for live dialogue');
        console.log(JSON.stringify({
            localAssetsReady: true,
            liveStart: liveStartChoices,
            character: cfg.character,
            language: actor.language,
            ...checks,
            broadcastCreation: 'untested'
        }));
        return;
    }
    if (action === 'warm') {
        const renderer = new NativeTalk(actor, cfg.project, cfg.talkPrompt ?? talkPrompt);
        try {
            for (const text of new Set([cfg.opening, ...cfg.reactions.map(r => r.answer)])) {
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
    mkdirSync(out, { mode: 0o700 }); // Atomic admission: never repeat side effects in an existing session.
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const motion = new NativeTalk(actor, cfg.project, cfg.talkPrompt ?? talkPrompt, log);
    const program = new LiveProgram(clip => { if (clip.motion)
        motion.release(clip.motion); });
    const { ready } = program;
    const queue = new ChatQueue(event => {
        program.hear(event);
        received++;
        log('chat_received', { source: event.source, id: event.id, text: event.text });
    });
    const observers = [];
    const opened = [];
    let observerError;
    let outcome = 'failed';
    let replying, hosting;
    let acceptingUntil = Infinity, renderingReply = false;
    let speculative;
    let hostLine = 0;
    let received = 0, failedReplies = 0, unfinishedReplies = 0, spokenReplies = 0;
    const unfinished = (source, id, stage) => {
        if (isReply(source))
            unfinishedReplies++;
        log('reply_unfinished', { source, id, stage });
    };
    const take = () => {
        const waiting = platforms.find(platform => !platform.ready);
        if (waiting && Date.now() >= acceptingUntil)
            throw Error(waiting.id + ' was not ready before the session deadline');
        return program.take(!waiting, Date.now() < acceptingUntil);
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
    };
    let stopInput;
    const wake = platforms.length > 0 && process.platform === 'darwin'
        ? spawn('/usr/bin/caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' })
        : undefined;
    wake?.on('error', () => log('sleep_prevention_unavailable', {}));
    try {
        log('idle_pool_preparing', { total: idleCount });
        await motion.prepareIdle(concept, controller.signal, log);
        let renderInFlight;
        async function performance(text, signal = controller.signal) {
            while (renderInFlight)
                await renderInFlight.catch(() => { });
            signal.throwIfAborted();
            const job = motion.render(text, signal);
            renderInFlight = job;
            try {
                return await job;
            }
            finally {
                if (renderInFlight === job)
                    renderInFlight = undefined;
            }
        }
        async function prepareHost(preflight, signal = controller.signal) {
            const version = program.version;
            const context = program.context();
            const id = 'host-' + (hostLine + 1);
            const stale = () => signal.aborted || (!preflight && (Date.now() >= acceptingUntil || version !== program.version));
            log('host_generation_started', { id, onAir: context.onAir.length, upcoming: context.scheduledHost.length });
            const text = await continueBroadcast(cfg, actor, context, cfg.hostLines[hostLine], signal);
            const previous = [...context.scheduledHost, ...context.onAir.map(turn => turn.host)];
            if (previous.some(line => line.trim() === text))
                throw Error('Host repeated a recent line');
            if (stale())
                return;
            const clip = await performance(text, signal);
            if (stale()) {
                motion.release(clip.motion);
                return;
            }
            ready.push({ source: 'host', id, text, ...clip });
            hostLine++;
            log('host_segment_ready', { id, preflight });
        }
        log('native_opening_preparing', liveStartChoices);
        ready.push({ source: 'opening', id: 'opening', text: cfg.opening, ...await performance(cfg.opening) });
        await prepareHost(true);
        if (controller.signal.aborted)
            return;
        const destinations = [];
        for (const platform of platforms) {
            controller.signal.throwIfAborted();
            opened.push(platform);
            try {
                destinations.push(await platform.prepare(controller.signal));
            }
            catch (error) {
                platform.prepareFailed?.(error);
                throw error;
            }
        }
        controller.signal.throwIfAborted();
        stopInput = listenChatInput(process.stdin, source => Date.now() < acceptingUntil &&
            (source === 'operator' || platforms.some(p => p.acceptsStdin && p.id === source)), queue);
        acceptingUntil = Date.now() + seconds * 1000;
        hosting = (async () => {
            while (!controller.signal.aborted && Date.now() < acceptingUntil) {
                try {
                    if (program.canPlanHost && !queue.pending && !renderingReply) {
                        speculative = new AbortController();
                        try {
                            await prepareHost(false, AbortSignal.any([controller.signal, speculative.signal]));
                        }
                        catch (error) {
                            if (!speculative.signal.aborted)
                                throw error;
                        }
                        finally {
                            speculative = undefined;
                        }
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
            while (!controller.signal.aborted) {
                const event = program.readyReplies < 2 && queue.next();
                if (!event) {
                    await wait(50);
                    continue;
                }
                let stage = 'generating';
                try {
                    renderingReply = true;
                    const prepared = preparedReply(cfg, event.text);
                    const selective = event.source !== 'operator' && !(event.source === 'youtube' && event.text === probe);
                    const text = await answer(cfg, actor, event.text, controller.signal, program.context(), event.speaker, selective);
                    if (selective && text === '[SKIP]') {
                        log('chat_skipped', { source: event.source, id: event.id });
                        continue;
                    }
                    speculative?.abort();
                    log('reply_generated', { source: event.source, id: event.id, prepared: text === prepared });
                    controller.signal.throwIfAborted();
                    stage = 'generating_av';
                    const clip = await performance(text);
                    program.queueReply({ source: event.source, id: event.id, text, ...clip,
                        question: { speaker: event.speaker, text: event.text } });
                }
                catch (e) {
                    if (controller.signal.aborted) {
                        unfinished(event.source, event.id, stage);
                        break;
                    }
                    failedReplies++;
                    log('reply_failed', {
                        source: event.source,
                        id: event.id, stage,
                        reason: e instanceof GenaiRequestError
                            ? 'gateway_http_' + e.httpStatus
                            : e instanceof Error
                                ? e.name
                                : 'error'
                    });
                }
                finally {
                    renderingReply = false;
                }
            }
        })();
        const observation = {
            signal: controller.signal, stop, acceptingUntil,
            queue: { add: (event) => !controller.signal.aborted && Date.now() < acceptingUntil && queue.add(event) }
        };
        for (const platform of platforms) {
            if (!platform.observe)
                continue;
            observers.push(platform.observe(observation).catch(error => {
                observerError = error instanceof Error ? error : Error(platform.id + ' observer failed');
                stop();
            }));
        }
        await encode([], join(out, 'recording.flv'), destinations, seconds, controller.signal, take, onLog, motion, () => renderingReply || queue.pending > 0 || ready.some(e => isReply(e.source)));
        if (observerError)
            throw observerError;
        outcome = controller.signal.aborted ? 'interrupted' : 'finished';
    }
    finally {
        stop();
        stopInput?.();
        await Promise.allSettled(observers);
        const [closures] = await Promise.all([
            Promise.allSettled(opened.map(async (platform) => platform.close?.(outcome))),
            Promise.allSettled([replying, hosting])
        ]);
        wake?.kill();
        motion.close();
        for (const event of ready)
            if (isReply(event.source))
                unfinished(event.source, event.id, 'awaiting_playback');
        for (let event = queue.next(); event; event = queue.next())
            unfinished(event.source, event.id, 'queued');
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
        for (const result of closures)
            if (result.status === 'rejected')
                throw result.reason;
    }
    if (observerError)
        throw observerError;
    for (const platform of platforms) {
        const reason = platform.problem();
        if (reason) {
            log('session_incomplete', { platform: platform.id, reason });
            throw Error(platform.id + ' ' + reason + '; inspect existing receipt');
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
        platforms: platforms.map(platform => platform.id)
    });
    console.log(JSON.stringify({
        out,
        ...Object.assign({}, ...platforms.map(platform => platform.summary()))
    }));
}
main().catch((e) => {
    console.error(String(e instanceof Error ? e.message : e).replace(/rtmps?:\/\/\S+/gi, '[ingest redacted]'));
    process.exitCode = 1;
});
