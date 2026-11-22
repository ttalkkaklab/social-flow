import { livePlatformIds, type LivePlatform, type PlatformId, type PlatformOptions } from './live-platform.js';
import { createTikTokPlatform } from './live-tiktok.js';
import { createYoutubePlatform } from './live-youtube-platform.js';

export const livePlatforms = {
  youtube: createYoutubePlatform,
  tiktok: createTikTokPlatform
} satisfies Record<PlatformId, (options: PlatformOptions) => LivePlatform>;

export function selectPlatforms(names: readonly string[]): PlatformId[] {
  for (const name of names) {
    if (!Object.hasOwn(livePlatforms, name))
      throw Error('Unknown live platform ' + name + '. Choose ' + livePlatformIds.join(' or '));
  }
  return livePlatformIds.filter(id => names.includes(id));
}
