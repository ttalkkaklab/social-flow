import { DOCUMENT_FILES } from './portal-episode.js';
import { SAFE_DOCUMENT_NAME } from './portal-client.js';
/** Every working path owned by revision/scenario pull; upload and restore share this source. */
export function canonicalPullPaths(episode, written = []) {
    return new Set([...DOCUMENT_FILES, 'scenario.md', ...(episode.documents ?? []).map(d => d.filename), ...written]
        .filter(filename => SAFE_DOCUMENT_NAME.test(filename))
        .map(filename => `storyboard/${filename}`.toLowerCase()));
}
