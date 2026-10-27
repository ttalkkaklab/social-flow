import { AsyncLocalStorage } from 'node:async_hooks';
export const videoEvents = new AsyncLocalStorage();
export function recordVideoSubmission(id) {
    if (id)
        videoEvents.getStore()?.submitted(id);
}
export function recordVideoTokens(tokens) {
    if (tokens !== undefined)
        videoEvents.getStore()?.usage(tokens);
}
