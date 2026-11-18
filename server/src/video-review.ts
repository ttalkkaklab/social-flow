import { createRequire } from 'node:module';
import path from 'node:path';

const review = () => createRequire(import.meta.url)('../../skills/storyboard/references/video-production.js') as {
  read(directory: string): Record<string, unknown>;
  write(episode: string): void;
};
export function readVideoProduction(episode: string): Record<string, unknown> {
  return review().read(path.join(episode, 'storyboard'));
}
/** A display export must never turn a paid completion into a retryable failure. */
export function refreshVideoReview(episode: string): void {
  try { review().write(episode); }
  catch { process.stderr.write('Video review export needs a refresh; request receipts remain authoritative.\n'); }
}
