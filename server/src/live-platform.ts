import { randomUUID } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import type { ChatQueue, LiveConfig } from './live-character.js';
import type { RelayTarget } from './live-encoder.js';

export const livePlatformIds = ['youtube', 'tiktok'] as const;
export type PlatformId = typeof livePlatformIds[number];
export type Fields = Record<string, unknown>;
export type RoomCommand = 'reserve' | 'status' | 'end' | 'cancel-unstarted';
export type LiveLog = (event: string, fields?: Fields) => void;

export interface PlatformOptions {
  config: LiveConfig;
  out: string;
  title?: string;
  probe?: string;
  resumeFrom?: string;
  log: LiveLog;
}

export interface LiveObserver {
  signal: AbortSignal;
  stop: () => void;
  acceptingUntil: number;
  queue: Pick<ChatQueue, 'add'>;
}

export interface LivePlatform {
  readonly id: PlatformId;
  readonly ready: boolean;
  readonly acceptsStdin?: boolean;
  check(forRun: boolean): Promise<Fields> | Fields;
  prepare(signal: AbortSignal): Promise<RelayTarget> | RelayTarget;
  observe?(session: LiveObserver): Promise<void>;
  onEvent?(event: string, fields: Fields): void;
  prepareFailed?(error: unknown): void;
  close?(outcome: 'finished' | 'interrupted' | 'failed'): Promise<void> | void;
  problem(): string | undefined;
  summary(): Fields;
  commands: Partial<Record<RoomCommand, () => Promise<Fields> | Fields>>;
}

export function saveLiveReceipt(path: string, receipt: object) {
  const tmp = path + '.' + randomUUID() + '.tmp';
  writeFileSync(tmp, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  renameSync(tmp, path);
}
