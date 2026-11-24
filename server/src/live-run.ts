import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  planViewerReply,
  draftExpectedAnswers,
  broadcastLines,
  ChatQueue,
  listenChatInput,
  continueBroadcast,
  liveConfig,
  loadCharacter
} from './live-character.js';
import { GenaiRequestError, requestGenai } from './astra-genai-client.js';
import { checkLiveRelay, encode, type RelayTarget } from './live-encoder.js';
import { prepareIdleClips, idleCount, idleCacheReady } from './live-idle.js';
import { NativeTalk, fitsLiveShot, openingParts, talkPrompt } from './live-native.js';
import { liveSpeechLanguage, liveStartChoice, liveStartChoices, liveFaqCount } from './live-options.js';
import { atomicJson } from './routing-files.js';
import { faqPassagesPerBatch, LiveKnowledge } from './live-knowledge.js';
import { LiveAnswers, spokenAddress } from './live-answers.js';
import { FaqRotation, LiveProgram, LiveRenderPool, isReply } from './live-program.js';
import { livePlatformIds, type LivePlatform, type RoomCommand } from './live-platform.js';
import { livePlatforms, selectPlatforms } from './live-platform-registry.js';

async function main() {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      out: { type: 'string' },
      seconds: { type: 'string', default: '120' },
      'faq-count': { type:'string' },
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
  if ((!['knowledge', 'estimate', 'check', 'warm', 'prepare-idle', 'run', 'reserve'].includes(action) && !recovery) || !v.config || positionals.length !== 1)
    throw Error(
      'Use choices|knowledge|estimate|check|warm|prepare-idle|reserve|run|status|end|cancel-unstarted --config file [--out directory] [--platform youtube|tiktok] [--youtube] [--tiktok]'
    );
  const selected = selectPlatforms([
    ...(v.platform ?? []), ...(v.youtube ? ['youtube'] : []), ...(v.tiktok ? ['tiktok'] : [])
  ]);
  const destination = selected.length > 0;
  const startsShow = action === 'run' || action === 'reserve';
  const startFlag = v.start ?? (action === 'run' && !destination ? 'preview' : undefined);
  const promptStart = startsShow && startFlag === undefined && process.stdin.isTTY && process.stderr.isTTY;
  let start = startsShow && !promptStart ? await liveStartChoice(startFlag) : undefined;
  if (start === 'cancel') { console.log(JSON.stringify({ state: 'cancelled' })); return; }
  const resumed = v['resume-from'] && join(resolve(v['resume-from']), 'youtube.json');
  const receipt = resumed && existsSync(resumed) ? JSON.parse(readFileSync(resumed, 'utf8')) : undefined;
  const session = JSON.parse(readFileSync(v.config, 'utf8'));
  if (startsShow || ['knowledge', 'estimate', 'warm'].includes(action)) {
    const existing = session.speechLanguage ?? receipt?.speechLanguage;
    const language = await liveSpeechLanguage(existing);
    if (receipt?.speechLanguage && language !== receipt.speechLanguage)
      throw Error('The selected speechLanguage differs from the reserved broadcast language.');
    session.speechLanguage = language;
    if (existing === undefined) atomicJson(v.config, session);
  }
  if (promptStart) {
    start = await liveStartChoice();
    if (start === 'cancel') { console.log(JSON.stringify({ state: 'cancelled' })); return; }
  }
  if (start === 'ready' && !destination) throw Error('Choose a live destination or --start preview');
  const cfg = liveConfig.parse(session);
  if (!v.out && !['knowledge', 'estimate', 'warm', 'check', 'prepare-idle'].includes(action))
    throw Error('Set --out to a unique session directory');
  const out = resolve(v.out ?? '.');
  const platforms: LivePlatform[] = [];
  const log = (event: string, fields: Record<string, unknown> = {}) => {
    appendFileSync(join(out, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n', { mode: 0o600 });
    for (const platform of platforms) platform.onEvent?.(event, fields);
  };
  const ids = recovery && !destination
    ? livePlatformIds.filter(id => existsSync(join(out, id + '.json')))
    : selected;
  if (recovery && !destination && !ids.length) throw Error('No broadcast receipt in the session directory');
  const probe = v['youtube-probe']?.trim();
  if (v['youtube-probe'] !== undefined && (action !== 'run' || start !== 'ready' ||
      !ids.includes('youtube') || !probe || probe.length > 200)) throw Error('Invalid YouTube test message');
  if (v['resume-from'] && (action !== 'run' || !ids.includes('youtube') || start !== 'ready' || cfg.madeForKids !== false))
    throw Error('Resume requires a YouTube run with live chat enabled');
  if (['warm', 'prepare-idle'].includes(action) && destination) throw Error('Prepare clips locally');
  const intake = start === 'ready' || ['knowledge','estimate'].includes(action) || (action === 'warm' && !!v['faq-count']);
  if (intake && !cfg.topic) throw Error('Ask for the broadcast topic and save it as topic.');
  if (intake && cfg.knowledgeBase === undefined) throw Error('Ask for knowledge files or directories. Save knowledgeBase: [] for an explicit choice of no sources.');
  const paths = recovery ? [] : cfg.knowledgeBase ?? [];
  const sourceLanguage = !paths.length ? 'und' : cfg.knowledgeLanguage ?? cfg.speechLanguage ??
    JSON.parse(readFileSync(join(cfg.project, '.social-flow/models.json'), 'utf8')).languages?.speech;
  if (!sourceLanguage) throw Error('Set the project or session speech language for knowledge extraction.');
  const knowledge = new LiveKnowledge(cfg.project, paths, sourceLanguage);
  if (action === 'knowledge') {
    console.log(JSON.stringify({speechLanguage:cfg.speechLanguage, topic:cfg.topic, sources:cfg.knowledgeBase, passages:knowledge.passages.length, fingerprint:knowledge.fingerprint}));
    return;
  }
  const count = intake || v['faq-count'] ? await liveFaqCount(v['faq-count'] ?? receipt?.faqCount?.toString()) : undefined;
  if (receipt?.faqCount && (receipt.faqCount !== count || receipt.topic !== cfg.topic || receipt.knowledgeFingerprint !== knowledge.fingerprint))
    throw Error('Reserved topic, knowledge or FAQ count differs from this session.');
  const estimateActor = count && loadCharacter(cfg,'native');
  const scope = (actor: ReturnType<typeof loadCharacter>) => ['grounded-faq-v2', cfg.channel, cfg.character, actor.identityHash, actor.language,
    cfg.topic, cfg.opening, cfg.broadcastConcept, cfg.persona, cfg.hostLines, cfg.reactions, knowledge.fingerprint];
  const answerLibrary = (actor: ReturnType<typeof loadCharacter>) =>
    new LiveAnswers(cfg.reactions, cfg.project, scope(actor), text => fitsLiveShot(text, actor.language));
  let estimate;
  if (count && estimateActor) {
    const estimator = new NativeTalk(estimateActor,cfg.project,cfg.talkPrompt ?? talkPrompt);
    try {
      const catalog = answerLibrary(estimateActor);
      const concept = cfg.broadcastConcept ?? (cfg.talkPrompt ?? cfg.persona ?? talkPrompt).slice(0,600);
      const idle = idleCacheReady(estimateActor.asset,cfg.project,concept) ? 0 : idleCount;
      let spoken = 4;
      if (['ko','en'].includes(estimateActor.language.split('-')[0])) {
        const {opening,standby} = await broadcastLines(cfg,estimateActor);
        spoken = 1 + [...openingParts(opening,estimateActor.language), ...standby].filter(text => !estimator.hasCompleted(text)).length;
      }
      estimate = { ...catalog.estimate(count,text=>estimator.hasCompleted(text),idle + spoken), speechLanguage:estimateActor.language };
      console.error(JSON.stringify({event:'preparation_estimate',...estimate}));
    } finally { estimator.close(); }
    if (action === 'estimate') { console.log(JSON.stringify(estimate)); return; }
  }
  const options = { config: cfg, out, title: v.title, probe, faqCount:count, knowledgeFingerprint:knowledge.fingerprint, scheduledStartTime:estimate?.expectedStartTime,
    resumeFrom: v['resume-from'] && resolve(v['resume-from']), log };
  if ((recovery || action === 'reserve') && ids.length !== 1)
    throw Error('Choose one --platform for room management');
  if (start !== 'preview') platforms.push(...ids.map(id => livePlatforms[id](options)));
  if (recovery || action === 'reserve') {
    if (action === 'reserve' && start !== 'ready') throw Error('Reserve requires --start ready');
    const command = platforms[0].commands[action as RoomCommand];
    if (!command) throw Error(platforms[0].id + ' does not support ' + action + ' via API. Use the platform LIVE controls.');
    console.log(JSON.stringify(await command()));
    return;
  }
  const checks: Record<string, unknown> = { youtubeLiveReadAccess: false };
  if (platforms.length) checkLiveRelay();
  for (const platform of platforms) Object.assign(checks, await platform.check(action === 'run'));
  const actor = loadCharacter(cfg, action === 'prepare-idle' ? 'standby' : 'native');
  const concept = cfg.broadcastConcept ?? (cfg.talkPrompt ?? cfg.persona ?? talkPrompt).slice(0, 600);
  if (action === 'prepare-idle') {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    try {
      const paths = await prepareIdleClips(actor.asset, cfg.project, concept, controller.signal,
        index => console.error(`Standby clips ready: ${index}/${idleCount}`));
      console.log(JSON.stringify({ count: paths.length, paths }));
    } finally {
      process.removeListener('SIGTERM', stop);
      process.removeListener('SIGINT', stop);
    }
    return;
  }
  if (action === 'check') {
    const caps = await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15000) as {
      image_conditioning?: boolean; voice_references?: boolean
    };
    if (!caps?.image_conditioning || !caps.voice_references) throw Error('GenAI needs image conditioning and subject voice references for live dialogue');
    console.log(
      JSON.stringify({
        localAssetsReady: true,
        liveStart: liveStartChoices,
        maxConcurrentVideos: cfg.maxConcurrentVideos,
        character: cfg.character,
        language: actor.language,
        ...checks,
        broadcastCreation: 'untested'
      })
    );
    return;
  }
  async function prepareFaq(renderer: NativeTalk, library: LiveAnswers, selectedCount: number, signal: AbortSignal,
    report: (ready: number, cached: boolean, file: string, text: string) => void) {
    let ready = 0;
    return library.prepare(selectedCount,
      (needed, existing, batchIndex) => draftExpectedAnswers(cfg, actor, knowledge, needed, existing, signal, batchIndex * faqPassagesPerBatch),
      async text => {
        signal.throwIfAborted();
        const started = Date.now();
        const cached = renderer.hasCompleted(text);
        const clip = await renderer.render(text, signal);
        renderer.release(clip.motion);
        if (!cached) library.recordDuration((Date.now() - started) / 1000);
        report(++ready, cached, renderer.fileFor(text), text);
      }, text => renderer.hasCompleted(text), Math.max(3, Math.ceil(knowledge.passages.length / faqPassagesPerBatch)));
  }
  if (action === 'warm') {
    const renderer = new NativeTalk(actor, cfg.project, cfg.talkPrompt ?? talkPrompt);
    try {
      const { opening, standby } = await broadcastLines(cfg, actor);
      for (const text of new Set([...openingParts(opening, actor.language), ...standby, ...(count ? [] : cfg.reactions.map(r => r.answer))])) {
        const {motion} = await renderer.render(text, new AbortController().signal);
        renderer.release(motion);
      }
      if (count) await prepareFaq(renderer, answerLibrary(actor), count,
        new AbortController().signal, ready => console.error(`FAQ videos ready: ${ready}/${count}`));
    } finally { renderer.close(); }
    console.log(JSON.stringify({ warmed:true, character:cfg.character, provider:'astra-genai' }));
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
  const program = new LiveProgram(clip => { if (clip.motion) motion.release(clip.motion); });
  const library = answerLibrary(actor);
  const faqRotation = new FaqRotation();
  const answerOrder = new Map<string, Promise<void>>();
  const { ready } = program;
  const queue = new ChatQueue(event => {
    program.hear(event);
    received++;
    log('chat_received', { source: event.source, id: event.id, text: event.text });
  });
  const observers: Promise<void>[] = [];
  const opened: LivePlatform[] = [];
  let observerError: Error | undefined;
  let outcome: 'finished' | 'interrupted' | 'failed' = 'failed';
  let replying: Promise<void> | undefined, hosting: Promise<void> | undefined;
  let acceptingUntil = Infinity, planningReply = false;
  const pendingHost = new Set<Promise<void>>();
  const pendingReplies = new Set<Promise<void>>();
  const speakerOrder = new Map<string, Promise<void>>();
  let hostLine = 0;
  let received = 0,
    failedReplies = 0,
    unfinishedReplies = 0,
    spokenReplies = 0;
  const unfinished = (source: string, id: string, stage: string) => {
    if (isReply(source)) unfinishedReplies++;
    log('reply_unfinished', { source, id, stage });
  };
  const take = () => {
    const waiting = platforms.find(platform => !platform.ready);
    if (waiting && Date.now() >= acceptingUntil) throw Error(waiting.id + ' was not ready before the session deadline');
    const awaitingAnswer = planningReply || pendingReplies.size > 0 || queue.pending > 0;
    return program.take(!waiting, Date.now() < acceptingUntil || awaitingAnswer, awaitingAnswer);
  };
  const wait = async (ms: number) => {
    await sleep(ms, undefined, { signal: controller.signal }).catch(() => {});
  };
  const onLog = (kind: string, fields: Record<string, unknown>) => {
    log(kind, fields);
    if (kind === 'speech_interrupted' && !fields.address && isReply(String(fields.source))) unfinishedReplies++;
    if (kind === 'speech_end' && !fields.address && isReply(String(fields.source))) spokenReplies++;
  };
  let stopInput: (() => void) | undefined;
  const wake =
    platforms.length > 0 && process.platform === 'darwin'
      ? spawn('/usr/bin/caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' })
      : undefined;
  wake?.on('error', () => log('sleep_prevention_unavailable', {}));
  try {
    log('idle_pool_preparing', { total: idleCount });
    await motion.prepareIdle(concept, controller.signal, log);
    const pool = new LiveRenderPool(cfg.maxConcurrentVideos);
    const signal = controller.signal;
    let hostOrder: Promise<void> = Promise.resolve();
    let orderedVersion = -1;
    async function prepareHost(preflight: boolean) {
      const version = program.version;
      const context = program.context();
      const id = 'host-' + (hostLine + 1);
      const stale = () => signal.aborted || (!preflight && (Date.now() >= acceptingUntil || version !== program.version));
      // After a conversation, alternate contextual follow-ups with independent radio segments.
      const reusable = !context.scheduledReplies.length &&
        (!context.recentChat.length || (hostLine % 2 === 0 && !context.onAir.at(-1)?.answering));
      log('host_generation_started', { id, onAir: context.onAir.length, upcoming: context.scheduledHost.length });
      const text = await continueBroadcast(cfg, actor, context, cfg.hostLines[hostLine], signal, reusable, knowledge);
      if (stale()) return;
      if ([...context.scheduledHost, ...context.onAir.map(turn => turn.host)].includes(text))
        throw Error('Host repeated a recent line');
      hostLine++;
      program.draftingHosts.set(id, text);
      const previous = orderedVersion === version ? hostOrder : Promise.resolve();
      orderedVersion = version;
      const render = pool.run(false, async () => {
        if (!stale()) return motion.render(text, signal);
      });
      const job = Promise.all([previous, render]).then(([, clip]) => {
        if (!clip) return;
        if (stale()) {
          motion.release(clip.motion);
          log('host_segment_discarded', { id, version });
          return;
        }
        ready.push({ source: 'host', id, text, reusable, ...clip });
        log('host_segment_ready', { id, preflight });
      });
      hostOrder = job.catch(() => {});
      const tracked = job.catch(error => {
        if (preflight) throw error;
        if (!signal.aborted) log('host_line_unavailable', { id, reason: error instanceof Error ? error.name : 'error' });
      }).finally(() => {
        pendingHost.delete(tracked);
        program.draftingHosts.delete(id);
      });
      pendingHost.add(tracked);
      if (preflight) await tracked;
    }
    log('native_opening_preparing', { ...liveStartChoices, maxConcurrentVideos: pool.limit, speechLanguage:actor.language, topic: cfg.topic });
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
    for (const result of prepared) if (result.status === 'rejected') throw result.reason;
    if (controller.signal.aborted) return;
    if (count) {
      await prepareFaq(motion, library, count, signal,
        (ready, cached, videoPath, text) => {
          faqRotation.add(text);
          log('faq_video_ready', { ready, count, cached, videoPath });
        });
      log('faq_pool_ready',{count});
    }
    const destinations: RelayTarget[] = [];
    for (const platform of platforms) {
      controller.signal.throwIfAborted();
      opened.push(platform);
      try { destinations.push(await platform.prepare(controller.signal)); }
      catch (error) { platform.prepareFailed?.(error); throw error; }
    }
    controller.signal.throwIfAborted();
    stopInput = listenChatInput(process.stdin, source => Date.now() < acceptingUntil &&
      (source === 'operator' || platforms.some(p => p.acceptsStdin && p.id === source)), queue);
    acceptingUntil = Date.now() + seconds * 1000;
    observers.push((async () => {
      while (!signal.aborted && Date.now() < acceptingUntil) {
        if (!program.faqStandby) {
          const text = faqRotation.next();
          if (text) {
            try {
              const clip = await motion.cached(text, signal);
              if (clip) program.faqStandby = { ...clip, source: 'standby', id: 'faq-standby', text, replay: true };
            } catch (error) {
              if (!signal.aborted) log('faq_standby_unavailable', { reason: error instanceof Error ? error.name : 'error' });
            }
            if (!program.faqStandby) await wait(1000);
          }
        }
        await wait(100);
      }
    })());
    hosting = (async () => {
      while (!controller.signal.aborted && Date.now() < acceptingUntil) {
        try {
          const hostCapacity = Math.max(1, pool.limit - 1);
          if (!pool.paused && program.canPlanHost && !queue.pending && pendingHost.size < hostCapacity
              && pendingHost.size + ready.length < Math.max(2, pool.limit)) {
            await prepareHost(false);
          }
        } catch (error) {
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
        if (!event) { await wait(50); continue; }
        planningReply = true;
        const key = event.source + ':' + event.id;
        const speaker = event.source + ':' + (event.speaker ?? '');
        const question = { speaker: event.speaker, text: event.text };
        let stage = 'generating';
        const failure = (error: unknown) => {
          program.dropFailedReply(key);
          if (signal.aborted) { unfinished(event.source, event.id, stage); return; }
          failedReplies++;
          const reason = error instanceof GenaiRequestError ? 'gateway_http_' + error.httpStatus
            : error instanceof Error ? error.name : 'error';
          log('reply_failed', { source: event.source, id: event.id, stage, reason });
        };
        try {
          const selective = event.source !== 'operator' && !(event.source === 'youtube' && event.text === probe);
          const {text, matched, learn} = await planViewerReply(cfg, actor, library, event, program.context(), selective, signal, knowledge);
          if (selective && text === '[SKIP]') {
            log('chat_skipped', { source: event.source, id: event.id });
            continue;
          }
          program.changeContext();
          program.draftingReplies.set(key, { host: text, answering: question });
          log('reply_generated', { source: event.source, id: event.id, matched });
          stage = 'generating_av';
          const previous = speakerOrder.get(speaker);
          const previousAnswer = answerOrder.get(text);
          const render = async () => {
            const cached = await motion.cached(text, signal);
            return cached ?? pool.run(true, () => motion.render(text, signal));
          };
          const job = Promise.allSettled([previous, previousAnswer, render()] as const).then(async ([,,result]) => {
            if (result.status === 'rejected') throw result.reason;
            const body = {source:event.source, id:event.id, text, question, ...result.value};
            try {
              if (learn) {
                library.remember(event.text, text, motion.fileFor(text));
                faqRotation.add(text);
              }
              await program.offerReply(body, spokenAddress(event.displayName, actor.language),
                async name => await motion.cached(name, signal) ?? pool.run(true, () => motion.render(name, signal)),
                error => {
                  signal.throwIfAborted();
                  log('reply_address_unavailable', { source: event.source, id: event.id, reason: error instanceof Error ? error.name : 'error' });
                });
            } catch (error) {
              motion.release(body.motion);
              throw error;
            }
          }).catch(failure);
          const tracked = job.finally(() => {
            pendingReplies.delete(tracked);
            if (speakerOrder.get(speaker) === tracked) speakerOrder.delete(speaker);
            if (answerOrder.get(text) === tracked) answerOrder.delete(text);
            program.draftingReplies.delete(key);
          });
          answerOrder.set(text, tracked);
          pendingReplies.add(tracked);
          speakerOrder.set(speaker, tracked);
        } catch (error) {
          failure(error);
        } finally {
          planningReply = false;
        }
      }
    })();
    const observation = {
      signal: controller.signal, stop, acceptingUntil,
      queue: { add: (event: unknown) => !controller.signal.aborted && Date.now() < acceptingUntil && queue.add(event) }
    };
    for (const platform of platforms) {
      if (!platform.observe) continue;
      observers.push(platform.observe(observation).catch(error => {
        observerError = error instanceof Error ? error : Error(platform.id + ' observer failed');
        stop();
      }));
    }
    await encode(
      [],
      join(out, 'recording.flv'),
      destinations,
      seconds,
      controller.signal,
      take,
      onLog,
      motion,
      () => planningReply || pendingReplies.size > 0 || queue.pending > 0 || ready.some(e => isReply(e.source)),
      clip => program.finish(clip)
    );
    if (observerError) throw observerError;
    if (pool.paused) throw pool.paused;
    outcome = controller.signal.aborted ? 'interrupted' : 'finished';
  } finally {
    stop();
    stopInput?.();
    await Promise.allSettled(observers);
    const [closures] = await Promise.all([
      Promise.allSettled(opened.map(async platform => platform.close?.(outcome))),
      Promise.allSettled([replying, hosting])
    ]);
    await Promise.allSettled([...pendingHost, ...pendingReplies]);
    wake?.kill();
    motion.close();
    for (const event of ready) if (!event.address && isReply(event.source)) unfinished(event.source, event.id, 'awaiting_playback');
    for (let event = queue.next(); event; event = queue.next()) unfinished(event.source, event.id, 'queued');
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    for (const result of closures) if (result.status === 'rejected') throw result.reason;
  }
  if (observerError) throw observerError;
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
  console.log(
    JSON.stringify({
      out,
      ...Object.assign({}, ...platforms.map(platform => platform.summary()))
    })
  );
}
main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/rtmps?:\/\/\S+/gi, '[ingest redacted]'));
  process.exitCode = 1;
});
