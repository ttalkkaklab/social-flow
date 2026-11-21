import { createRequire } from 'node:module';
import path from 'node:path';
const review = () => createRequire(import.meta.url)('../../skills/storyboard/references/video-production.js');
export function readVideoProduction(episode) {
    return review().read(path.join(episode, 'storyboard'));
}
/** A display export must never turn a paid completion into a retryable failure. */
export function refreshVideoReview(episode) {
    try {
        review().write(episode);
    }
    catch {
        process.stderr.write('Video review export needs a refresh; request receipts remain authoritative.\n');
    }
}
export function refreshAudienceReview(boardDirectory) {
    try {
        const data = createRequire(import.meta.url)('../../skills/storyboard/references/audience-review-data.js');
        data.refresh(boardDirectory);
    }
    catch {
        process.stderr.write('Audience audio preview needs a refresh.\n');
    }
}
