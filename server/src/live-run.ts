import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  answer,
  ChatQueue,
  liveConfig,
  loadCharacter,
  poses,
  preparedReply,
  preparedSpeech,
  synthesize
} from './live-character.js';
import { GenaiRequestError } from './astra-genai-client.js';
import { checkLiveRelay, encode, splitIngest, type Utterance } from './live-encoder.js';
import { prepareIdleClips, idleCount } from './live-idle.js';
import { NativeTalk, nativeLauncher, talkPrompt } from './live-native.js';
import { liveStartChoice, liveStartChoices } from './live-options.js';
import { MotionAvatar } from './live-motion.js';
import {
  youtubeApi,
  checkChannel,
  prepareYoutube,
  activeChatId,
  resumeUnstarted,
  inspectBroadcast,
  closeBroadcast,
  broadcastStatus,
  cancelUnstarted,
  endBroadcast,
  missingYoutubeEvidence,
  YoutubeChat,
  YoutubeProbe,
  type YoutubeReceipt
} from './live-youtube.js';

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
    throw Error(
      'Use choices|check|warm|prepare-idle|reserve|run|status|end|cancel-unstarted --config file [--out directory] [--youtube] [--tiktok]'
    );
  const destination = v.youtube || v.tiktok;
  const start = (action === 'run' || action === 'reserve') && (destination || v.start) ? await liveStartChoice(v.start) : undefined;
  if (start === 'cancel') { console.log(JSON.stringify({ state: 'cancelled' })); return; }
  if (start === 'ready' && !destination) throw Error('Choose a live destination or --start preview');
  const cfg = liveConfig.parse(JSON.parse(readFileSync(v.config, 'utf8')));
  if (v['resume-from'] && (action !== 'run' || !v.youtube || start !== 'ready' || cfg.madeForKids !== false))
    throw Error('Resume requires a YouTube run with live chat enabled');
  const api =
    (v.youtube && start !== 'preview') || recovery ? await youtubeApi(cfg.youtubeCredentialChannel ?? cfg.channel) : undefined;
  if (api && !cfg.youtubeChannelId) throw Error('Set youtubeChannelId before connecting');
  const tiktok = v.tiktok && start !== 'preview' ? process.env.TIKTOK_LIVE_RTMPS_URL : undefined;
  if (v.tiktok && start !== 'preview' && !tiktok) throw Error('An account-authorized TikTok RTMPS URL is required');
  if (tiktok) splitIngest(tiktok);
  if (!v.out && !['warm', 'check', 'prepare-idle'].includes(action))
    throw Error('Set --out to a unique session directory');
  const out = resolve(v.out ?? '.'),
    receiptFile = join(out, 'youtube.json');
  const writeReceipt = (r: YoutubeReceipt) => {
    const tmp = receiptFile + '.' + randomUUID() + '.tmp';
    writeFileSync(tmp, JSON.stringify(r, null, 2), { mode: 0o600, flag: 'wx' });
    renameSync(tmp, receiptFile);
  };
  if (recovery) {
    const r: YoutubeReceipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
    if (r.channelId !== cfg.youtubeChannelId || !r.broadcastId) throw Error('No owned broadcast receipt');
    let state: string;
    if (action === 'end') state = await endBroadcast(api!, r);
    else if (action === 'cancel-unstarted') {
      state = await cancelUnstarted(api!, r, () => {
        if (r.cancellation === 'requested')
          writeFileSync(join(out, 'cancel-requested'), r.broadcastId!, { mode: 0o600, flag: 'wx' });
        writeReceipt(r);
      });
    } else state = await broadcastStatus(api!, r);
    console.log(JSON.stringify({ id: r.broadcastId, state }));
    return;
  }
  if (action === 'reserve') {
    if (!api || !v.youtube || v.tiktok || start !== 'ready' || !v.title?.trim() || v.title.length > 100)
      throw Error('Reserve needs --youtube, --start ready and a YouTube title of 1–100 characters');
    mkdirSync(out, { mode: 0o700 });
    const receipt: YoutubeReceipt = { channelId: cfg.youtubeChannelId!, marker: randomUUID() };
    writeReceipt(receipt);
    await prepareYoutube(api, cfg, v.title, receipt, () => writeReceipt(receipt));
    appendFileSync(join(out, 'events.jsonl'), JSON.stringify({
      at: new Date().toISOString(), event: 'youtube_reserved', id: receipt.broadcastId
    }) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ id: receipt.broadcastId, privacy: 'unlisted', state: 'reserved' }));
    return;
  }
  const actor = loadCharacter(cfg);
  const concept = cfg.broadcastConcept ?? (cfg.talkPrompt ?? cfg.persona ?? talkPrompt).slice(0, 600);
  if (action === 'prepare-idle') {
    if (destination) throw Error('Prepare standby clips without a live destination');
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
  if (api || tiktok) checkLiveRelay();
  if (action === 'check') {
    if (api) await checkChannel(api, cfg.youtubeChannelId!);
    console.log(
      JSON.stringify({
        localAssetsReady: true,
        liveStart: liveStartChoices,
        character: cfg.character,
        language: actor.language,
        youtubeLiveReadAccess: !!api,
        broadcastCreation: 'untested'
      })
    );
    return;
  }
  if (action === 'warm') {
    if (api || v.tiktok) throw Error('Warm runs locally');
    for (const text of new Set([cfg.opening, ...cfg.hostLines, ...cfg.reactions.map((r) => r.answer)]))
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
  if (api) await checkChannel(api, cfg.youtubeChannelId!);
  mkdirSync(out, { mode: 0o700 }); // Atomic admission: never repeat side effects in an existing session.
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const log = (event: string, fields: Record<string, unknown> = {}) => {
    appendFileSync(
      join(out, 'events.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n',
      { mode: 0o600 }
    );
  };
  const prior = v['resume-from'] ? resolve(v['resume-from']) : undefined;
  const receipt: YoutubeReceipt = prior
    ? JSON.parse(readFileSync(join(prior, 'youtube.json'), 'utf8'))
    : { channelId: cfg.youtubeChannelId ?? '', marker: randomUUID() };
  if (prior && (receipt.channelId !== cfg.youtubeChannelId || !receipt.broadcastId))
    throw Error('Resume receipt does not belong to this channel');
  if (prior) {
    const journal = readFileSync(join(prior, 'events.jsonl'), 'utf8').trim().split('\n');
    const closed = journal.some((line) => {
      const e = JSON.parse(line);
      return (
        e.id === receipt.broadcastId && (e.event === 'youtube_reserved' ||
          (e.event === 'youtube_final' && e.state === 'ready' && e.ingestLive === false))
      );
    });
    if (!closed) throw Error('The prior encoder has not confirmed an unstarted shutdown');
  }
  let ownsRun = !prior;
  const save = () => writeReceipt(receipt);
  const queue = new ChatQueue(),
    ready: Utterance[] = [];
  let polling: Promise<void> | undefined, replying: Promise<void> | undefined;
  let motion: MotionAvatar | NativeTalk | undefined;
  let acceptingUntil = Infinity, renderingReply = false;
  let hostLine = 0,
    playing = false,
    lastSpeech = Date.now();
  const countsAsReply = (source: string) => source !== 'opening' && source !== 'host';
  let received = 0,
    failedReplies = 0,
    unfinishedReplies = 0,
    spokenReplies = 0;
  const unfinished = (source: string, id: string, stage: string) => {
    if (countsAsReply(source)) unfinishedReplies++;
    log('reply_unfinished', { source, id, stage });
  };
  let ingestLive = false,
    chatReads = 0,
    probeId = '',
    probeSpoken = false,
    finalState = '',
    endedEarly = false;
  const take = () => {
    if (ready[0]?.source === 'opening') {
      // Keep the encoder moving during YouTube's ingest handshake. The first
      // words should reach viewers once the room has actually gone live.
      if (api && !ingestLive) {
        if (Date.now() >= acceptingUntil) throw Error('YouTube did not report live before the session deadline');
        return undefined;
      }
      return ready.shift();
    }
    const viewer = ready.findIndex(
      (utterance) => utterance.source === 'youtube' || utterance.source === 'tiktok'
    );
    return viewer < 0 ? ready.shift() : ready.splice(viewer, 1)[0];
  };
  const wait = async (ms: number) => {
    await sleep(ms, undefined, { signal: controller.signal }).catch(() => {});
  };
  const onLog = (kind: string, fields: Record<string, unknown>) => {
    log(kind, fields);
    if (kind === 'speech_start') playing = true;
    if (kind === 'speech_end') {
      lastSpeech = Date.now();
      playing = false;
    }
    if (kind === 'speech_interrupted' && countsAsReply(String(fields.source))) unfinishedReplies++;
    if (kind === 'speech_end' && countsAsReply(String(fields.source))) spokenReplies++;
    if (kind === 'speech_end' && probeId && fields.id === probeId && fields.source === 'youtube')
      probeSpoken = true;
  };
  let partial = '',
    discard = false;
  function receive(bytes: string) {
    for (const chunk of bytes.split(/(?<=\n)/)) {
      if (!discard) {
        partial += chunk;
        if (partial.length > 1600) {
          partial = '';
          discard = true;
        }
      }
      if (!chunk.endsWith('\n')) continue;
      try {
        if (!discard && partial.trim()) {
          const e = JSON.parse(partial);
          if (Date.now() < acceptingUntil && (e.source === 'operator' || (tiktok && e.source === 'tiktok'))) queue.add(e);
        }
      } catch {
        /* Invalid external messages cannot interrupt the show. */
      }
      partial = '';
      discard = false;
    }
  }
  const wake =
    (api || tiktok) && process.platform === 'darwin'
      ? spawn('/usr/bin/caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' })
      : undefined;
  wake?.on('error', () => log('sleep_prevention_unavailable', {}));
  try {
    if (start) {
      nativeLauncher();
      motion = new NativeTalk(actor.asset, cfg.project, cfg.talkPrompt ?? talkPrompt);
    }
    else if (cfg.motionVideo) motion = new MotionAvatar(cfg);
    const frames = motion ? [] : poses(actor.asset, cfg);
    if (motion instanceof NativeTalk) {
      log('idle_pool_preparing', { total: idleCount });
      await motion.prepareIdle(concept, controller.signal, log);
    }
    const openingPcm = await preparedSpeech(cfg, actor, cfg.opening, controller.signal);
    if (start) log('native_opening_preparing', liveStartChoices);
    ready.push({
      source: 'opening',
      id: 'opening',
      text: cfg.opening,
      pcm: openingPcm,
      motion: motion instanceof NativeTalk ? await motion.render(openingPcm, controller.signal, true) : await motion?.render(openingPcm, controller.signal)
    });
    if (controller.signal.aborted) return;
    let chat: YoutubeChat | undefined;
    const destinations: string[] = [];
    if (api) {
      let target;
      if (prior) {
        target = await resumeUnstarted(api, receipt);
        writeFileSync(join(prior, 'resume-claimed'), out, { flag: 'wx', mode: 0o600 });
        ownsRun = true;
        save();
      } else {
        save();
        target = await prepareYoutube(api, cfg, v.title!, receipt, save);
      }
      destinations.push(target.url);
      if (target.chatId) chat = new YoutubeChat(api, target.chatId);
      log('youtube_prepared', { id: receipt.broadcastId, privacy: 'unlisted' });
    }
    if (tiktok) destinations.push(tiktok);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', receive);
    acceptingUntil = Date.now() + seconds * 1000;
    replying = (async () => {
      const deadline = Date.now() + seconds * 1000;
      while (!controller.signal.aborted) {
        const event = ready.length < 2 && queue.next();
        if (!event) {
          if (
            !playing &&
            !ready.length &&
            hostLine < cfg.hostLines.length &&
            Date.now() - lastSpeech >= 9000 &&
            deadline - Date.now() > 25000
          ) {
            const text = cfg.hostLines[hostLine++];
            try {
              const pcm = await preparedSpeech(cfg, actor, text, controller.signal);
              const rendered = await motion?.render(pcm, controller.signal);
              ready.push({ source: 'host', id: 'host-' + hostLine, text, pcm, motion: rendered });
            } catch {
              log('host_line_unavailable', { id: 'host-' + hostLine });
            }
          }
          await wait(100);
          continue;
        }
        let stage = 'generating';
        try {
          renderingReply = true;
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
          stage = 'animating';
          const performance = await motion?.render(pcm, controller.signal);
          ready.push({ source: event.source, id: event.id, text, pcm, motion: performance });
        } catch (e) {
          if (controller.signal.aborted) {
            unfinished(event.source, event.id, stage);
            break;
          }
          failedReplies++;
          log('reply_failed', {
            source: event.source,
            id: event.id,
            reason:
              e instanceof GenaiRequestError
                ? 'gateway_http_' + e.httpStatus
                : e instanceof Error
                  ? e.name
                  : 'error'
          });
        } finally { renderingReply = false; }
      }
    })();
    if (api) {
      let liveChat = chat;
      polling = (async () => {
        let tester: YoutubeProbe | undefined;
        let canonical = false;
        while (!controller.signal.aborted) {
          let delay = 4000;
          try {
            if (!ingestLive || !liveChat) {
              const b = await inspectBroadcast(api, receipt);
              if (b.snippet.liveChatId) liveChat ??= new YoutubeChat(api, b.snippet.liveChatId);
              if (!ingestLive && b.status.lifeCycleStatus === 'live') {
                ingestLive = true;
                if (probe) tester = new YoutubeProbe(Date.now());
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
              if (chatReads === 1) log('youtube_chat_connected', { id: receipt.broadcastId });
              if (canonical && probe && !probeId && tester?.due(Date.now()) && !controller.signal.aborted) {
                const posted = await tester.post(liveChat, probe);
                if (posted) {
                  probeId = posted;
                  log('youtube_probe', { id: posted });
                } else {
                  canonical = false;
                  log('youtube_probe_not_ready', { id: receipt.broadcastId });
                }
              }
            }
          } catch (e) {
            if (
              !controller.signal.aborted &&
              e instanceof Error &&
              e.message === 'YouTube GET liveChat/messages 403 liveChatEnded' &&
              (await broadcastStatus(api, receipt).catch(() => '')) === 'complete'
            ) {
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
    await encode(
      frames,
      join(out, 'recording.flv'),
      destinations,
      seconds,
      controller.signal,
      take,
      onLog,
      motion,
      start ? () => renderingReply || queue.pending > 0 || ready.some(e => countsAsReply(e.source)) : undefined
    );
  } catch (e) {
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
  } finally {
    stop();
    process.stdin.removeListener('data', receive);
    process.stdin.pause();
    if (api && receipt.broadcastId && ownsRun) {
      try {
        for (let i = 0; i < 8; i++) {
          finalState = await closeBroadcast(api, receipt);
          if (finalState === 'complete' || (['created', 'ready'].includes(finalState) && !ingestLive)) break;
          await sleep(2500);
        }
        log('youtube_final', {
          id: receipt.broadcastId,
          state: finalState,
          ingestLive,
          probeId,
          probeSpoken
        });
      } catch {
        log('youtube_final_unknown', { id: receipt.broadcastId });
      }
    }
    await Promise.allSettled([polling, replying]);
    wake?.kill();
    motion?.close();
    for (const event of ready) unfinished(event.source, event.id, 'awaiting_playback');
    for (let event = queue.next(); event; event = queue.next()) unfinished(event.source, event.id, 'queued');
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
  console.log(
    JSON.stringify({
      out,
      ...(receipt.broadcastId ? { youtubeId: receipt.broadcastId, finalState, probeSpoken } : {})
    })
  );
}
main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/rtmps?:\/\/\S+/gi, '[ingest redacted]'));
  process.exitCode = 1;
});
