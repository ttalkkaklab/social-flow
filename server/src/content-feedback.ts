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
    '쇼츠 스와이프 이탈률은 API 에 없다. 초반 통과는 engagedViews/조회 비율로 본다.',
    '편당 구독 전환은 영상 리포트가 안정적이지 않아 채널 구간 숫자만 적는다.',
    '조회만 낮고 초반 통과·유지가 중앙 이상이면 각도 레버다. 그 형식을 복제하지 말고 다음 편 제목을 문제로 연다.',
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
        problem: '이 편의 Analytics 구간 값이 아직 없다',
        hypothesis: '업로드 후 2~3일은 집계가 비는 것이 정상이다',
        next: '다음 리뷰까지 두고 같은 지표로 다시 본다',
      });
    } else {
      if (hook != null && cohort.hook != null && hook < cohort.hook * GAP) {
        steps.push({
          lever: 'hook',
          problem: `초반 통과 ${hook.toFixed(0)}% — 최근 ${rows.length}편 중앙 ${cohort.hook.toFixed(0)}%보다 낮다`,
          hypothesis: '첫 1~2초에 제목에서 한 약속이 안 보인다',
          next: '오프닝 설명을 빼고 첫 컷에서 결과를 바로 보여 준다',
        });
      }
      if (retain != null && cohort.retain != null && retain < cohort.retain * GAP) {
        steps.push({
          lever: 'retain',
          problem: `평균 시청 ${retain.toFixed(0)}% — 중앙 ${cohort.retain.toFixed(0)}%보다 낮다`,
          hypothesis: '중간에 새 정보가 끊기거나 한 주장이 길다',
          next: '주장 하나만 남기고 컷 간격을 좁힌다',
        });
      }
      const hookOk = hook != null && cohort.hook != null && hook >= cohort.hook * GAP;
      const retainOk = retain != null && cohort.retain != null && retain >= cohort.retain * GAP;
      const viewsLow = views != null && cohort.views != null && views < cohort.views * GAP;
      if (hookOk && retainOk && viewsLow && views != null && cohort.views != null) {
        steps.push({
          lever: 'angle',
          problem: `조회 ${Math.round(views)} — 최근 ${rows.length}편 중앙 ${Math.round(cohort.views)}보다 낮다. 초반 통과·유지는 중앙과 같거나 높다`,
          hypothesis: '팬이 눌러 지표는 좋은데 처음 보는 사람은 자기 일로 안 읽었다',
          next: '다음 편 제목·커버를 방법·도구가 아니라 그 사람이 이미 느끼는 문제로 연다',
        });
      }
    }
    return {
      id: String(video.videoId ?? ''),
      title: String(video.title ?? '(제목 없음)'),
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
    notes.push('구독자 수가 숨김이라 채널 전환율은 참고만 한다.');
  }
  return { items, cohort, notes };
}

export function analyzeInstagramMedia(
  media: Array<Record<string, unknown>>,
  limit: number,
): { items: ReviewedItem[]; cohort: Record<string, number | null>; notes: string[] } {
  const notes = [
    '훅·유지는 릴스에만 있다. 사진·캐러셀은 표에 올리되 채점하지 않는다.',
    '릴스별 팔로우는 플랫폼이 안 준다. 계정 프로필 방문으로 관심을 본다.',
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
        problem: '릴스가 아니라 훅·유지 지표가 없다',
        hypothesis: '이미지·캐러셀은 3초 이탈을 플랫폼이 안 준다',
        next: '같은 소재를 릴스로 다시 올려 스킵률을 본다',
      });
    } else if (!metrics) {
      steps.push({
        lever: 'pending',
        problem: '이 편의 인사이트가 비어 있다',
        hypothesis: '막 올렸거나 인사이트 스코프가 빠졌을 수 있다',
        next: '하루 뒤에 같은 편을 다시 본다',
      });
    } else {
      if (skip != null && cohort.skip != null && skip > cohort.skip / GAP) {
        steps.push({
          lever: 'hook',
          problem: `3초 이탈 ${skip.toFixed(0)}% — 최근 릴스 중앙 ${cohort.skip.toFixed(0)}%보다 높다`,
          hypothesis: '첫 3초에 썸네일·캡션 약속이 안 보인다',
          next: '첫 프레임에서 결과를 증명하고 후킹을 3초 안에 끝낸다',
        });
      }
      if (watch != null && cohort.watch != null && watch < cohort.watch * GAP) {
        steps.push({
          lever: 'retain',
          problem: `평균 시청 ${watch.toFixed(1)}초 — 중앙 ${cohort.watch.toFixed(1)}초보다 짧다`,
          hypothesis: '같은 길이대에서 중간에 정보가 끊긴다',
          next: '같은 길이에서 컷을 더 자주 바꾸고 중간에도 새 정보를 하나씩 넣는다',
        });
      }
      if (shareRate != null && cohort.shareRate != null && shareRate < cohort.shareRate * SHARE_GAP && (reach ?? 0) > 0) {
        steps.push({
          lever: 'share',
          problem: `도달 대비 공유 ${shareRate.toFixed(2)}% — 중앙 ${cohort.shareRate.toFixed(2)}%보다 낮다`,
          hypothesis: '넘길 한 줄(반전·숫자·체크리스트)이 없다',
          next: '화면 한 장에 남이 그대로 보낼 문장을 넣는다',
        });
      }
    }
    return {
      id: String(item.mediaId ?? ''),
      title: String(item.excerpt ?? '(캡션 없음)'),
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
      throw new Error(`outputPath 는 .html 이어야 한다: ${outputPath}`);
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
      notes: ['유튜브 토큰 또는 인사이트 스코프가 없다. setup-youtube 후 youtube.readonly · yt-analytics.readonly 로 재발급한다.'],
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
      notes: ['인스타 토큰 또는 instagram_business_manage_insights 스코프가 없다. setup-instagram 으로 재발급한다.'],
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
