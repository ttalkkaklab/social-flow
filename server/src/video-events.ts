import { AsyncLocalStorage } from 'node:async_hooks';

/** Provider receipts must be durable before polling; this also works across concurrent calls. */
export interface VideoEventSink {
  submitted(id: string): void;
  usage(tokens: number): void;
}
export const videoEvents = new AsyncLocalStorage<VideoEventSink>();
export function recordVideoSubmission(id: string | undefined): void {
  if (id) videoEvents.getStore()?.submitted(id);
}
export function recordVideoTokens(tokens: number | undefined): void {
  if (tokens !== undefined) videoEvents.getStore()?.usage(tokens);
}
