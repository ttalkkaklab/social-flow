/**
 * Recent-post feedback — pure scoring and HTML rendering (no network).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeInstagramMedia,
  analyzeYoutubeVideos,
  asPercent,
  median,
  watchSeconds,
} from '../dist/content-feedback.js';
import { escapeHtml, renderFeedbackHtml } from '../dist/content-feedback-html.js';

describe('median / units', () => {
  it('with an even count it is the average of the middle two', () => {
    assert.equal(median([1, 3, 5, 7]), 4);
  });
  it('an empty array is null', () => {
    assert.equal(median([]), null);
  });
  it('scales 0-1 up to a percentage', () => {
    assert.equal(asPercent(0.41), 41);
    assert.equal(asPercent(41), 41);
  });
  it('reads a large watch value as milliseconds', () => {
    assert.equal(watchSeconds(8500), 8.5);
    assert.equal(watchSeconds(8.5), 8.5);
  });
});

describe('YouTube scoring', () => {
  const videos = [
    {
      videoId: 'a',
      title: '잘 된 편',
      permalink: 'https://youtu.be/a',
      publishedAt: '2026-08-01T00:00:00Z',
      lifetime: { views: 1000, likes: 10, comments: 1 },
      period: { views: 1000, engagedViews: 800, averageViewPercentage: 60 },
    },
    {
      videoId: 'b',
      title: '훅이 죽은 편',
      permalink: 'https://youtu.be/b',
      publishedAt: '2026-08-02T00:00:00Z',
      lifetime: { views: 900, likes: 4, comments: 0 },
      period: { views: 900, engagedViews: 200, averageViewPercentage: 55 },
    },
    {
      videoId: 'c',
      title: '집계 전',
      permalink: 'https://youtu.be/c',
      publishedAt: '2026-08-16T00:00:00Z',
      lifetime: { views: 12, likes: 0, comments: 0 },
      period: null,
    },
  ];

  it('attaches the hook lever when opening pass is below the median', () => {
    const { items } = analyzeYoutubeVideos(videos, { subscriberCount: 10 }, { views: 2000, subscribersGained: 4 });
    const weak = items.find((i) => i.id === 'b');
    assert.ok(weak);
    assert.equal(weak.tone, 'watch');
    assert.ok(weak.steps.some((s) => s.lever === 'hook'));
  });

  it('is pending when there is no period', () => {
    const { items } = analyzeYoutubeVideos(videos, {}, {});
    const fresh = items.find((i) => i.id === 'c');
    assert.equal(fresh.tone, 'pending');
  });

  it('is the angle lever when hook and retention hold up and only views are low', () => {
    const pack = [
      {
        videoId: 'wide',
        title: '퍼진 편',
        permalink: 'https://youtu.be/wide',
        publishedAt: '2026-08-01T00:00:00Z',
        lifetime: { views: 2000, likes: 20, comments: 4 },
        period: { views: 2000, engagedViews: 1400, averageViewPercentage: 55 },
      },
      {
        videoId: 'fan',
        title: '팬만 본 편',
        permalink: 'https://youtu.be/fan',
        publishedAt: '2026-08-02T00:00:00Z',
        lifetime: { views: 200, likes: 12, comments: 3 },
        period: { views: 200, engagedViews: 160, averageViewPercentage: 58 },
      },
      {
        videoId: 'mid',
        title: '중간 편',
        permalink: 'https://youtu.be/mid',
        publishedAt: '2026-08-03T00:00:00Z',
        lifetime: { views: 1800, likes: 15, comments: 2 },
        period: { views: 1800, engagedViews: 1260, averageViewPercentage: 54 },
      },
    ];
    const { items } = analyzeYoutubeVideos(pack, { subscriberCount: 80 }, { views: 4000, subscribersGained: 6 });
    const fan = items.find((i) => i.id === 'fan');
    assert.ok(fan);
    assert.ok(fan.steps.some((s) => s.lever === 'angle'));
    assert.equal(fan.tone, 'watch');
    const wide = items.find((i) => i.id === 'wide');
    assert.ok(wide.steps.every((s) => s.lever !== 'angle'));
  });

  it('leaves the share lever alone when no episode reports shares', () => {
    const { items, cohort } = analyzeYoutubeVideos(videos, { subscriberCount: 10 }, { views: 2000, subscribersGained: 4 });
    assert.equal(cohort.shareRate, null);
    assert.ok(items.every((i) => i.steps.every((s) => s.lever !== 'share')));
  });

  it('is the share lever when shares against engaged views fall below the median', () => {
    // Same opening pass, retention and views across the batch, so only the share rate can move
    const pack = [
      {
        videoId: 'loud',
        title: '많이 퍼진 편',
        permalink: 'https://youtu.be/loud',
        publishedAt: '2026-08-01T00:00:00Z',
        lifetime: { views: 1000, likes: 30, comments: 5 },
        period: { views: 1000, engagedViews: 500, averageViewPercentage: 55, shares: 30 },
      },
      {
        videoId: 'even',
        title: '보통 편',
        permalink: 'https://youtu.be/even',
        publishedAt: '2026-08-02T00:00:00Z',
        lifetime: { views: 1000, likes: 25, comments: 4 },
        period: { views: 1000, engagedViews: 500, averageViewPercentage: 55, shares: 25 },
      },
      {
        videoId: 'quiet',
        title: '아무도 안 보낸 편',
        permalink: 'https://youtu.be/quiet',
        publishedAt: '2026-08-03T00:00:00Z',
        lifetime: { views: 1000, likes: 22, comments: 3 },
        period: { views: 1000, engagedViews: 500, averageViewPercentage: 55, shares: 5 },
      },
    ];
    const { items, cohort } = analyzeYoutubeVideos(pack, { subscriberCount: 80 }, { views: 4000, subscribersGained: 6 });
    assert.equal(cohort.shareRate, 5);

    const quiet = items.find((i) => i.id === 'quiet');
    assert.equal(quiet.metrics.shares, 5);
    assert.equal(quiet.metrics.shareRate, 1);
    assert.equal(quiet.vsCohort.shareRate, 'below');
    assert.equal(quiet.tone, 'watch');
    const share = quiet.steps.find((s) => s.lever === 'share');
    assert.ok(share);
    assert.match(share.problem, /shares against engaged views/);

    const loud = items.find((i) => i.id === 'loud');
    assert.ok(loud.steps.every((s) => s.lever !== 'share'));
    assert.equal(loud.tone, 'ok');
  });

  it('does not bill a weak opening twice: the share rate is per engaged view, not per view', () => {
    // Every episode is shared by 2% of the people who got past the opening. Only the opening differs.
    const pack = [1, 2, 3].map((n) => ({
      videoId: `steady${n}`,
      title: `평범한 편 ${n}`,
      permalink: `https://youtu.be/steady${n}`,
      publishedAt: `2026-08-0${n}T00:00:00Z`,
      lifetime: { views: 20000, likes: 100, comments: 10 },
      period: { views: 20000, engagedViews: 14000, averageViewPercentage: 55, shares: 280 },
    }));
    pack.push({
      videoId: 'weakhook',
      title: '앞이 약한 편',
      permalink: 'https://youtu.be/weakhook',
      publishedAt: '2026-08-04T00:00:00Z',
      lifetime: { views: 20000, likes: 90, comments: 8 },
      period: { views: 20000, engagedViews: 7000, averageViewPercentage: 55, shares: 140 },
    });
    const { items, cohort } = analyzeYoutubeVideos(pack, { subscriberCount: 80 }, { views: 80000, subscribersGained: 40 });
    assert.equal(cohort.shareRate, 2);

    const weak = items.find((i) => i.id === 'weakhook');
    assert.equal(weak.metrics.shareRate, 2);
    assert.equal(weak.vsCohort.shareRate, 'even');
    assert.deepEqual(weak.steps.map((s) => s.lever), ['hook']);
    assert.equal(weak.tone, 'watch');
  });

  it('says so in the notes when half the batch reported no shares, instead of a 0.00% median', () => {
    const pack = [
      [1200, 0],
      [900, 0],
      [2400, 12],
      [1100, 0],
      [1500, 9],
    ].map(([views, shares], i) => ({
      videoId: `s${i}`,
      title: `새 채널 ${i}`,
      permalink: `https://youtu.be/s${i}`,
      publishedAt: `2026-08-0${i + 1}T00:00:00Z`,
      lifetime: { views, likes: 2, comments: 0 },
      period: { views, engagedViews: views * 0.6, averageViewPercentage: 55, shares },
    }));
    const { items, cohort, notes } = analyzeYoutubeVideos(pack, { subscriberCount: 30 }, { views: 7100, subscribersGained: 5 });
    assert.equal(cohort.shareRate, null);
    assert.ok(notes.some((n) => /no shares/.test(n) && /share lever is off/.test(n)));
    assert.ok(items.every((i) => i.steps.every((s) => s.lever !== 'share')));

    // The funnel prints a dash for the missing median rather than a measured-looking 0.00%
    const html = renderFeedbackHtml({
      channel: 'demo',
      generatedAt: '2026-08-20T00:00:00Z',
      limit: 5,
      days: 28,
      htmlPath: null,
      youtube: { platform: 'YOUTUBE', available: true, account: { subscriberCount: 30, videoCount: 5 }, cohort, items, notes },
      instagram: { platform: 'INSTAGRAM', available: false, error: 'no token', account: null, cohort: {}, items: [], notes: [] },
    });
    assert.match(html, /<strong>Shares<\/strong>\s*<em>—<\/em>/);
    assert.ok(!/<strong>Shares<\/strong>\s*<em>0\.00%<\/em>/.test(html));
  });
});

describe('Instagram scoring', () => {
  const media = [
    {
      mediaId: '1',
      mediaProductType: 'REELS',
      excerpt: '잔류 좋은 릴스',
      permalink: 'https://instagram.com/p/1',
      timestamp: '2026-08-01T00:00:00Z',
      metrics: { reach: 1000, reels_skip_rate: 0.2, ig_reels_avg_watch_time: 9000, shares: 40, views: 1200 },
    },
    {
      mediaId: '2',
      mediaProductType: 'REELS',
      excerpt: '3초에 나감',
      permalink: 'https://instagram.com/p/2',
      timestamp: '2026-08-02T00:00:00Z',
      metrics: { reach: 800, reels_skip_rate: 0.7, ig_reels_avg_watch_time: 3000, shares: 2, views: 900 },
    },
    {
      mediaId: '3',
      mediaProductType: 'FEED',
      excerpt: '사진',
      permalink: 'https://instagram.com/p/3',
      timestamp: '2026-08-03T00:00:00Z',
      metrics: { reach: 200, likes: 10 },
    },
  ];

  it('is the hook lever when drop-off is above the median', () => {
    const { items } = analyzeInstagramMedia(media, 5);
    const skippy = items.find((i) => i.id === '2');
    assert.ok(skippy.steps.some((s) => s.lever === 'hook'));
  });

  it('when reels exist, feed photos are left out and only reels are scored', () => {
    const { items } = analyzeInstagramMedia(media, 5);
    assert.deepEqual(items.map((i) => i.id), ['1', '2']);
  });

  it('with no reels, a feed photo is pending', () => {
    const { items } = analyzeInstagramMedia([media[2]], 5);
    assert.equal(items[0].tone, 'pending');
  });
});

describe('HTML report', () => {
  it('has the YouTube and Instagram sections plus the funnel and charts', () => {
    const html = renderFeedbackHtml({
      channel: 'demo',
      generatedAt: '2026-08-16T12:00:00.000Z',
      limit: 5,
      days: 28,
      htmlPath: '/tmp/x.html',
      youtube: {
        platform: 'YOUTUBE',
        available: true,
        account: { subscriberCount: 12, videoCount: 8 },
        cohort: { hook: 50, retain: 40, views: 100, shareRate: 1.2, channelSubRate: 0.2 },
        items: [
          {
            id: 'a',
            title: '샘플',
            permalink: 'https://youtu.be/a',
            publishedAt: '2026-08-01T00:00:00Z',
            tone: 'watch',
            metrics: { views: 100, hook: 30, retain: 40, shares: 1, shareRate: 1 },
            vsCohort: { hook: 'below', retain: 'even', views: 'even', shareRate: 'even' },
            steps: [
              {
                lever: 'hook',
                problem: '초반 통과가 낮다',
                hypothesis: '첫 컷이 설명이다',
                next: '결과를 먼저 보여 준다',
              },
            ],
          },
        ],
        notes: ['테스트'],
      },
      instagram: {
        platform: 'INSTAGRAM',
        available: false,
        account: null,
        cohort: {},
        items: [],
        notes: ['토큰 없음'],
      },
    });
    assert.match(html, /id="youtube"/);
    assert.match(html, /id="instagram"/);
    assert.match(html, /class="funnel"/);
    assert.match(html, /class="chart"/);
    assert.match(html, /class="rail"/);
    assert.match(html, /What to change next episode/);
    assert.match(html, /against engaged views/);
    assert.match(html, /Share rate/);
    assert.equal(escapeHtml('<x>'), '&lt;x&gt;');
  });
});
