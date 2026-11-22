import { livePlatformIds } from './live-platform.js';
import { createTikTokPlatform } from './live-tiktok.js';
import { createYoutubePlatform } from './live-youtube-platform.js';
export const livePlatforms = {
    youtube: createYoutubePlatform,
    tiktok: createTikTokPlatform
};
export function selectPlatforms(names) {
    for (const name of names) {
        if (!Object.hasOwn(livePlatforms, name))
            throw Error('Unknown live platform ' + name + '. Choose ' + livePlatformIds.join(' or '));
    }
    return livePlatformIds.filter(id => names.includes(id));
}
