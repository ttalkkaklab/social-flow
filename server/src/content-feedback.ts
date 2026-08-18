/**
 * Recent-post feedback — scores YouTube and Instagram in the same frame
 * (problem → hypothesis → plan).
 *
 * The numbers themselves come from youtube_insights / instagram_insights; this module picks
 * the lever (hook, retention, shares, angle) against the median of the last N episodes and
 * writes an HTML report. It uses no absolute thresholds (nothing like "70% at 30 seconds on
 * YouTube") — the growth playbook is explicit that benchmarks aren't to be used as rules.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { CHANNEL_SLUG_RE } from './config.js';
import { renderFeedbackHtml } from './content-feedback-html.js';
import type { ApiResult } from './http.js';
import { instagramInsights, youtubeInsights } from './sns-client.js';

export type Lever = 'hook' | 'retain' | 'share' | 'angle' | 'pending';
export type Tone = 'ok' | 'watch' | 'fix' | 'pending';

export interface FeedbackStep {
  problem: string;
  hypothesis: string;
  next: string;
  lever: Lever;
}

export interface ReviewedItem {
  id: string;
  title: string;
  permalink: string | null;
  publishedAt: string | null;
  tone: Tone;
  metrics: Record<string, number | null>;
  vsCohort: Record<string, 'above' | 'below' | 'even' | 'na'>;
  steps: FeedbackStep[];
}

export interface PlatformSection {
  platform: 'YOUTUBE' | 'INSTAGRAM';
  available: boolean;
  error?: string;
  account: Record<string, unknown> | null;
  cohort: Record<string, number | null>;
  items: ReviewedItem[];
  notes: string[];
}

export interface FeedbackReport {
  channel: string | null;
  generatedAt: string;
  limit: number;
  days: number;
  htmlPath: string | null;
  youtube: PlatformSection;
  instagram: PlatformSection;
}

export interface ContentFeedbackInput {
  channel?: string;
  /** Number of recent posts per platform (default 5, 1-10) */
  limit?: number;
  /** Aggregation window in days (default 28 — allows for the 2-3 day Analytics delay) */
  days?: number;
  /** HTML save path. Defaults to data/<channel>/growth/review-recent.html */
  outputPath?: string;
}

const GAP = 0.85;
const SHARE_GAP = 0.7;

export function median(values: number[]): number | null {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

/** Scales a 0-1 value to a percentage; leaves it alone if it already is one. */
export function asPercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value * 100;
  return value;
}

export function watchSeconds(msOrSec: number | null | undefined): number | null {
  if (msOrSec == null || !Number.isFinite(msOrSec) || msOrSec < 0) return null;
  return msOrSec > 200 ? msOrSec / 1000 : msOrSec;
}

function vsMedian(value: number | null, mid: number | null, higherIsBetter: boolean): 'above' | 'below' | 'even' | 'na' {
  if (value == null || mid == null || mid === 0) return 'na';
  const ratio = value / mid;
  if (higherIsBetter) {
    if (ratio >= 1 / GAP) return 'above';
    if (ratio <= GAP) return 'below';
    return 'even';
  }
  if (ratio <= GAP) return 'above';
  if (ratio >= 1 / GAP) return 'below';
  return 'even';
}

function worstTone(steps: FeedbackStep[]): Tone {
  if (steps.some((s) => s.lever === 'pending')) return 'pending';
  if (steps.length === 0) return 'ok';
  return steps.length >= 2 ? 'fix' : 'watch';
}

function parseObject(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function analyzeYoutubeVideos(
  videos: Array<Record<string, unknown>>,
  account: Record<string, unknown> | null,
  channelMetrics: Record<string, unknown> | null,
): { items: ReviewedItem[]; cohort: Record<string, number | null>; notes: string[] } {
  const notes = [
    'Shorts swipe-away drop-off is not in the API. Opening pass is read as the engagedViews/views ratio.',
    'Per-episode subscriber conversion is not stable in the video report, so only the channel-window number is recorded.',
    'When only views are low and opening pass and retention are at or above the median, the lever is angle. Do not clone that format — open the next episode title with the problem.',
  ];
  const rows = videos.map((video) => {
    const period = (video.period as Record<string, unknown> | null) ?? null;
    const lifetime = (video.lifetime as Record<string, unknown> | null) ?? {};
    const views = num(period?.views) ?? num(lifetime.views);
    const engaged = num(period?.engagedViews);
    const hook = views && views > 0 && engaged != null ? (engaged / views) * 100 : null;
    const retain = num(period?.averageViewPercentage);
    return { video, period, views, hook, retain };
  });

  const cohort = {
    hook: median(rows.map((r) => r.hook).filter((n): n is number => n != null)),
    retain: median(rows.map((r) => r.retain).filter((n): n is number => n != null)),
    views: median(rows.map((r) => r.views).filter((n): n is number => n != null)),
    channelSubRate: (() => {
      const gained = num(channelMetrics?.subscribersGained);
      const views = num(channelMetrics?.views);
      if (gained == null || views == null || views <= 0) return null;
      return (gained / views) * 100;
    })(),
  };

  const items: ReviewedItem[] = rows.map(({ video, period, views, hook, retain }) => {
    const steps: FeedbackStep[] = [];
    if (!period) {
      steps.push({
        lever: 'pending',
        problem: 'this episode has no Analytics window values yet',
        hypothesis: 'an empty aggregation for 2-3 days after upload is normal',
        next: 'leave it until the next review and look at the same metrics again',
      });
    } else {
      if (hook != null && cohort.hook != null && hook < cohort.hook * GAP) {
        steps.push({
          lever: 'hook',
          problem: `opening pass ${hook.toFixed(0)}% — below the ${cohort.hook.toFixed(0)}% median of the last ${rows.length} episodes`,
          hypothesis: 'the promise made in the title is not visible in the first 1-2 seconds',
          next: 'drop the opening explanation and show the result in the first cut',
        });
      }
      if (retain != null && cohort.retain != null && retain < cohort.retain * GAP) {
        steps.push({
          lever: 'retain',
          problem: `average view ${retain.toFixed(0)}% — below the ${cohort.retain.toFixed(0)}% median`,
          hypothesis: 'new information stops partway through, or one claim runs long',
          next: 'keep a single claim and tighten the gap between cuts',
        });
      }
      const hookOk = hook != null && cohort.hook != null && hook >= cohort.hook * GAP;
      const retainOk = retain != null && cohort.retain != null && retain >= cohort.retain * GAP;
      const viewsLow = views != null && cohort.views != null && views < cohort.views * GAP;
      if (hookOk && retainOk && viewsLow && views != null && cohort.views != null) {
        steps.push({
          lever: 'angle',
          problem: `views ${Math.round(views)} — below the ${Math.round(cohort.views)} median of the last ${rows.length} episodes, while opening pass and retention are at or above the median`,
          hypothesis: 'fans clicked so the metrics look fine, but first-time viewers did not read it as their own problem',
          next: 'open the next episode title and cover with the problem the viewer already feels, not with a method or a tool',
        });
      }
    }
    return {
      id: String(video.videoId ?? ''),
      title: String(video.title ?? '(no title)'),
      permalink: video.permalink ? String(video.permalink) : null,
      publishedAt: video.publishedAt ? String(video.publishedAt) : null,
      tone: worstTone(steps),
      metrics: {
        views,
        hook,
        retain,
        likes: num((period as Record<string, unknown> | null)?.likes) ?? num((video.lifetime as Record<string, unknown> | undefined)?.likes),
        comments: num((period as Record<string, unknown> | null)?.comments) ?? num((video.lifetime as Record<string, unknown> | undefined)?.comments),
      },
      vsCohort: {
        hook: vsMedian(hook, cohort.hook, true),
        retain: vsMedian(retain, cohort.retain, true),
        views: vsMedian(views, cohort.views, true),
      },
      steps,
    };
  });

  if (account && (account as { subscriberCountHidden?: boolean }).subscriberCountHidden) {
    notes.push('The subscriber count is hidden, so treat the channel conversion rate as a rough reference only.');
  }
  return { items, cohort, notes };
}

export function analyzeInstagramMedia(
  media: Array<Record<string, unknown>>,
  limit: number,
): { items: ReviewedItem[]; cohort: Record<string, number | null>; notes: string[] } {
  const notes = [
    'Hook and retention exist for reels only. Photos and carousels go in the table but are not scored.',
    'The platform does not give per-reel follows. Read interest from account profile visits instead.',
  ];
  const reels = media.filter((item) => item.mediaProductType === 'REELS').slice(0, limit);
  const picked = reels.length > 0 ? reels : media.slice(0, limit);

  const rows = picked.map((item) => {
    const metrics = (item.metrics as Record<string, unknown> | null) ?? null;
    const skip = asPercent(num(metrics?.reels_skip_rate));
    const watch = watchSeconds(num(metrics?.ig_reels_avg_watch_time));
    const reach = num(metrics?.reach);
    const shares = num(metrics?.shares);
    const shareRate = reach && reach > 0 && shares != null ? (shares / reach) * 100 : null;
    return { item, metrics, skip, watch, reach, shares, shareRate };
  });

  const reelRows = rows.filter((r) => r.item.mediaProductType === 'REELS' && r.metrics);
  const cohort = {
    skip: median(reelRows.map((r) => r.skip).filter((n): n is number => n != null)),
    watch: median(reelRows.map((r) => r.watch).filter((n): n is number => n != null)),
    shareRate: median(reelRows.map((r) => r.shareRate).filter((n): n is number => n != null)),
    reach: median(reelRows.map((r) => r.reach).filter((n): n is number => n != null)),
  };

  const items: ReviewedItem[] = rows.map(({ item, metrics, skip, watch, reach, shares, shareRate }) => {
    const isReel = item.mediaProductType === 'REELS';
    const steps: FeedbackStep[] = [];
    if (!isReel) {
      steps.push({
        lever: 'pending',
        problem: 'not a reel, so there are no hook or retention metrics',
        hypothesis: 'the platform does not report 3-second drop-off for images and carousels',
        next: 'post the same material again as a reel and look at the skip rate',
      });
    } else if (!metrics) {
      steps.push({
        lever: 'pending',
        problem: 'insights for this episode are empty',
        hypothesis: 'it may have just been posted, or the insights scope may be missing',
        next: 'look at the same episode again a day later',
      });
    } else {
      if (skip != null && cohort.skip != null && skip > cohort.skip / GAP) {
        steps.push({
          lever: 'hook',
          problem: `3-second drop-off ${skip.toFixed(0)}% — above the ${cohort.skip.toFixed(0)}% median of recent reels`,
          hypothesis: 'the promise made by the thumbnail and caption is not visible in the first 3 seconds',
          next: 'prove the result in the first frame and finish the hook within 3 seconds',
        });
      }
      if (watch != null && cohort.watch != null && watch < cohort.watch * GAP) {
        steps.push({
          lever: 'retain',
          problem: `average watch ${watch.toFixed(1)}s — shorter than the ${cohort.watch.toFixed(1)}s median`,
          hypothesis: 'at the same length band, information stops partway through',
          next: 'at the same length, change cuts more often and drop in one new piece of information mid-way',
        });
      }
      if (shareRate != null && cohort.shareRate != null && shareRate < cohort.shareRate * SHARE_GAP && (reach ?? 0) > 0) {
        steps.push({
          lever: 'share',
          problem: `shares against reach ${shareRate.toFixed(2)}% — below the ${cohort.shareRate.toFixed(2)}% median`,
          hypothesis: 'there is no single line worth passing on (a twist, a number, a checklist)',
          next: 'put a sentence someone would forward as-is on one screen',
        });
      }
    }
    return {
      id: String(item.mediaId ?? ''),
      title: String(item.excerpt ?? '(no caption)'),
      permalink: item.permalink ? String(item.permalink) : null,
      publishedAt: item.timestamp ? String(item.timestamp) : null,
      tone: worstTone(steps),
      metrics: {
        views: num(metrics?.views),
        reach,
        skip,
        watch,
        shares,
        shareRate,
        likes: num(metrics?.likes),
      },
      vsCohort: {
        skip: vsMedian(skip, cohort.skip, false),
        watch: vsMedian(watch, cohort.watch, true),
        shareRate: vsMedian(shareRate, cohort.shareRate, true),
      },
      steps,
    };
  });

  return { items, cohort, notes };
}

function defaultHtmlPath(channel: string): string {
  return join(process.cwd(), 'data', channel, 'growth', 'review-recent.html');
}

function resolveHtmlPath(channel: string | undefined, outputPath: string | undefined): string | null {
  if (outputPath) {
    if (outputPath.includes('..')) {
      throw new Error(`Path traversal detected: ${outputPath}`);
    }
    const resolved = isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);
    if (!resolved.toLowerCase().endsWith('.html')) {
      throw new Error(`outputPath must end in .html: ${outputPath}`);
    }
    return resolved;
  }
  if (channel && CHANNEL_SLUG_RE.test(channel)) return defaultHtmlPath(channel);
  return null;
}

export async function contentFeedback(input: ContentFeedbackInput): Promise<ApiResult> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const days = Math.min(Math.max(input.days ?? 28, 7), 365);
  const channel = input.channel ?? null;

  const [ytRes, igRes] = await Promise.all([
    youtubeInsights({ channel: input.channel, days, videoLimit: limit }),
    instagramInsights({ channel: input.channel, days, mediaLimit: Math.min(25, limit * 3) }),
  ]);

  const youtube = sectionFromYoutube(ytRes, limit);
  const instagram = sectionFromInstagram(igRes, limit);

  let htmlPath: string | null = null;
  try {
    htmlPath = resolveHtmlPath(input.channel, input.outputPath);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      body: error instanceof Error ? error.message : String(error),
    };
  }

  const report: FeedbackReport = {
    channel,
    generatedAt: new Date().toISOString(),
    limit,
    days,
    htmlPath,
    youtube,
    instagram,
  };

  if (htmlPath) {
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, renderFeedbackHtml(report), 'utf8');
  }

  return { ok: true, status: 200, body: JSON.stringify(report) };
}

function sectionFromYoutube(res: ApiResult, _limit: number): PlatformSection {
  if (!res.ok) {
    return {
      platform: 'YOUTUBE',
      available: false,
      error: res.body.slice(0, 400),
      account: null,
      cohort: {},
      items: [],
      notes: ['No YouTube token, or the insights scope is missing. Run setup-youtube and reissue with youtube.readonly and yt-analytics.readonly.'],
    };
  }
  const parsed = parseObject(res.body);
  const videos = (parsed?.videos as Array<Record<string, unknown>> | undefined) ?? [];
  const account = (parsed?.account as Record<string, unknown> | undefined) ?? null;
  const metrics = (parsed?.metrics as Record<string, unknown> | undefined) ?? null;
  const analyzed = analyzeYoutubeVideos(videos, account, metrics);
  if (typeof parsed?.videosError === 'string') analyzed.notes.push(String(parsed.videosError));
  return {
    platform: 'YOUTUBE',
    available: true,
    account,
    cohort: analyzed.cohort,
    items: analyzed.items,
    notes: analyzed.notes,
  };
}

function sectionFromInstagram(res: ApiResult, limit: number): PlatformSection {
  if (!res.ok) {
    return {
      platform: 'INSTAGRAM',
      available: false,
      error: res.body.slice(0, 400),
      account: null,
      cohort: {},
      items: [],
      notes: ['No Instagram token, or the instagram_business_manage_insights scope is missing. Reissue with setup-instagram.'],
    };
  }
  const parsed = parseObject(res.body);
  const media = (parsed?.media as Array<Record<string, unknown>> | undefined) ?? [];
  const account = (parsed?.account as Record<string, unknown> | undefined) ?? null;
  const user = (parsed?.user as Record<string, unknown> | undefined) ?? {};
  const analyzed = analyzeInstagramMedia(media, limit);
  const profileViews = num(user.profile_views);
  if (profileViews != null) analyzed.cohort.profileViews = profileViews;
  return {
    platform: 'INSTAGRAM',
    available: true,
    account,
    cohort: analyzed.cohort,
    items: analyzed.items,
    notes: analyzed.notes,
  };
}
