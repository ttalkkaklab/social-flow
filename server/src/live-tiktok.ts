import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';
import type { ChatMessage } from './live-character.js';
import { splitIngest, type RelayTarget } from './live-encoder.js';
import { saveLiveReceipt, type LivePlatform, type PlatformOptions } from './live-platform.js';

export function tiktokIngest(env: NodeJS.ProcessEnv): RelayTarget {
  const full = env.TIKTOK_LIVE_RTMPS_URL;
  const server = env.TIKTOK_LIVE_SERVER_URL;
  const key = env.TIKTOK_LIVE_STREAM_KEY;
  if (full && (server || key)) throw Error('Choose one TikTok ingest credential format');
  let url: string;
  if (full) url = full;
  else if (server && key) {
    const name = key.split('?')[0];
    if (/[?#\s]/.test(server) || /[\s#]/.test(key) || !name || name.includes('/'))
      throw Error('Invalid TikTok server address or stream key');
    url = server.replace(/\/+$/, '') + '/' + key;
  } else {
    throw Error('Set TIKTOK_LIVE_RTMPS_URL or both TIKTOK_LIVE_SERVER_URL and TIKTOK_LIVE_STREAM_KEY');
  }
  const allowRtmp = !!server && url.startsWith('rtmp://');
  splitIngest(url, allowRtmp);
  return { platform: 'tiktok', url, allowRtmp };
}

function useTerminalCredentials() {
  return process.stdin.isTTY && process.stderr.isTTY && !process.env.TIKTOK_LIVE_RTMPS_URL &&
    !process.env.TIKTOK_LIVE_SERVER_URL && !process.env.TIKTOK_LIVE_STREAM_KEY;
}

// Request the per-broadcast key only after potentially long clip generation. The terminal
// runs in readline's raw mode with a silent output so neither pasted field is echoed.
async function terminalIngest(signal: AbortSignal) {
  const hidden = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input: process.stdin, output: hidden, terminal: true, historySize: 0 });
  const cancelled = new AbortController();
  rl.once('SIGINT', () => cancelled.abort());
  rl.once('close', () => cancelled.abort());
  const options = { signal: AbortSignal.any([signal, cancelled.signal]) };
  try {
    process.stderr.write('Clips ready. Paste the TikTok Server URL (hidden): ');
    const server = await rl.question('', options);
    process.stderr.write('\nPaste the stream key for this broadcast (hidden): ');
    const key = await rl.question('', options);
    return tiktokIngest({ TIKTOK_LIVE_SERVER_URL: server.trim(), TIKTOK_LIVE_STREAM_KEY: key.trim() });
  } finally {
    rl.close();
    hidden.end();
    process.stderr.write('\n');
  }
}

function identifier(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
}

export function tikfinityComment(raw: string, sessionId: string): ChatMessage | undefined {
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  if (payload?.event !== 'chat') return;
  const data = payload.data;
  const id = identifier(data?.msgId ?? data?.common?.msgId);
  if (!id || id.length > 200 || typeof data.comment !== 'string') return;
  const text = data.comment.trim();
  if (!text || text.length > 500) return;
  const user = identifier(data.userId ?? data.user?.userId ?? data.uniqueId ?? data.user?.uniqueId);
  const speaker = user && 'tt-' + createHash('sha256').update(sessionId).update(user).digest('hex').slice(0, 12);
  const displayName = data.nickname ?? data.user?.nickname;
  return { source: 'tiktok', id, text, ...(speaker && { speaker }),
    ...(typeof displayName === 'string' && { displayName: displayName.slice(0, 128) }) };
}

function bridgeAddress() {
  const address = new URL(process.env.TIKTOK_LIVE_TIKFINITY_URL ?? 'ws://localhost:21213/');
  if (address.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) ||
      address.username || address.password || address.search || address.hash)
    throw Error('Use the local TikFinity Desktop WebSocket address');
  return address;
}

export function createTikTokPlatform({ config, out, log }: PlatformOptions): LivePlatform {
  const path = join(out, 'tiktok.json');
  const sessionId = randomUUID();
  let prepared = false;
  let relayConnected = false, chatConnected = false;
  let connections = 0, comments = 0;
  let state = 'prepared';
  const status = () => ({
    platform: 'tiktok', channel: config.channel, sessionId, state, broadcastState: 'unverified',
    relayConnected, chatSource: config.tiktokChat, bridgeConnections: connections, receivedComments: comments,
    ...(config.tiktokChat === 'tikfinity' && { bridgeAvailableAtLastRead: chatConnected })
  });
  const save = () => saveLiveReceipt(path, status());
  return {
    id: 'tiktok',
    get ready() { return relayConnected; },
    acceptsStdin: config.tiktokChat === 'stdin',
    commands: {
      status() {
        const receipt = JSON.parse(readFileSync(path, 'utf8'));
        if (receipt.platform !== 'tiktok' || receipt.channel !== config.channel)
          throw Error('TikTok session belongs to a different channel');
        return receipt;
      }
    },
    check() {
      const target = useTerminalCredentials() ? undefined : tiktokIngest(process.env);
      if (config.tiktokChat === 'tikfinity') bridgeAddress();
      return { tiktok: { transport: target && new URL(target.url).protocol.slice(0, -1),
        chatSource: config.tiktokChat, ingest: target ? 'configured' : 'prompt_after_preparation', broadcastState: 'unverified' } };
    },
    async prepare(signal) {
      const target = useTerminalCredentials() ? await terminalIngest(signal) : tiktokIngest(process.env);
      save();
      prepared = true;
      log('tiktok_prepared', { chatSource: config.tiktokChat });
      return target;
    },
    onEvent(event, fields) {
      if (event === 'chat_received' && fields.source === 'tiktok') { comments++; save(); }
      if (event === 'relay_connected' && fields.platform === 'tiktok') {
        relayConnected = true;
        state = 'relay_connected';
        save();
      }
    },
    async observe({ signal, acceptingUntil, queue }) {
      if (config.tiktokChat !== 'tikfinity') return;
      const address = bridgeAddress();
      const intake = AbortSignal.any([signal, AbortSignal.timeout(Math.max(0, acceptingUntil - Date.now()))]);
      let backoff = 500;
      while (!intake.aborted) {
        await new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(address, { handshakeTimeout: 4000, maxPayload: 1024 * 1024 });
          const stop = () => socket.terminate();
          let failure: Error | undefined;
          // EventEmitter callbacks run outside the observer promise. Deliver journal or
          // queue failures to the runner after closing the socket so every relay is stopped.
          function record(change: () => void) {
            if (failure) return;
            try { change(); }
            catch (error) {
              failure = error instanceof Error ? error : Error('TikTok chat observer failed');
              if (socket.readyState !== WebSocket.CLOSED) stop();
            }
          }
          intake.addEventListener('abort', stop, { once: true });
          socket.once('open', () => record(() => {
            chatConnected = true;
            connections++;
            backoff = 500;
            save();
            log('tiktok_chat_connected', { connections });
          }));
          socket.on('message', (raw, binary) => {
            if (binary || !relayConnected || intake.aborted || Date.now() >= acceptingUntil) return;
            const event = tikfinityComment(raw.toString(), sessionId);
            if (event) record(() => { queue.add(event); });
          });
          // A transport error is followed by close and retried while intake is open.
          socket.on('error', () => {});
          socket.once('close', () => {
            intake.removeEventListener('abort', stop);
            if (!intake.aborted) record(() => {
              if (chatConnected || backoff === 500) log('tiktok_chat_unavailable');
              if (chatConnected) { chatConnected = false; save(); }
            });
            if (failure) reject(failure);
            else resolve();
          });
        });
        if (!intake.aborted) {
          await sleep(backoff, undefined, { signal: intake }).catch(() => {});
          backoff = Math.min(10000, backoff * 2);
        }
      }
    },
    close(outcome) {
      if (!prepared) return;
      state = outcome === 'finished' ? 'encoder_finished' : outcome;
      save();
      log('tiktok_final', status());
    },
    problem() {
      if (state === 'interrupted') return 'encoder interrupted';
      if (!relayConnected) return 'ingest connection was never observed';
      if (config.tiktokChat === 'tikfinity' && !chatConnected) return 'TikFinity chat bridge unavailable';
    },
    summary() { return { tiktok: status() }; }
  };
}
