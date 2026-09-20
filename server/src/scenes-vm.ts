/**
 * One way to evaluate a `scenes.js` — the browser script that assigns `window.*` blocks —
 * and take its globals out as plain JSON. Used by the local board tools (storyboard.ts
 * `readBoard`) and the portal upload (portal-episode.ts); a board that came back from
 * `portal_storyboard_pull` goes through both.
 *
 * Nothing from the host crosses into the room. The context starts from a null-prototype
 * object, `window` and a silent `console` are created *inside* it, and the only thing that
 * comes out is one JSON string built inside the room. With a host-created `window` the
 * script could walk `window.constructor.constructor("return process")()` up to the host
 * process (review P1 on the portal PR, reproduced with a sentinel env var). Node's `vm` is
 * not a security boundary against a hostile engine; the trust model is that a board a
 * workspace member uploaded is a co-author's code, and this closes the known prototype
 * escape while a non-executing parser stays a follow-up.
 */

import vm from 'node:vm';

export interface EvaluateWindowOptions {
  /** Shown in stack traces of a throwing board. */
  filename?: string;
  /** Wall-clock cap for the script (default 5 s) — a runaway loop throws instead of hanging the server. */
  timeoutMs?: number;
}

/** Evaluate the script and return `window` as plain objects. Throws when the script throws or leaves no window. */
export function evaluateWindowScript(source: string, options: EvaluateWindowOptions = {}): Record<string, unknown> {
  const timeout = options.timeoutMs ?? 5000;
  const context = vm.createContext(Object.create(null) as Record<string, unknown>);
  vm.runInContext('var window = {}; var console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };', context);
  vm.runInContext(source, context, { filename: options.filename, timeout });
  const json: unknown = vm.runInContext('JSON.stringify(window)', context, { timeout });
  if (typeof json !== 'string') throw new Error('the script did not leave a window object');
  const plain: unknown = JSON.parse(json);
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)) throw new Error('the script replaced window with a non-object');
  return plain as Record<string, unknown>;
}
