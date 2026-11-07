/**
 * Recent-post feedback — pure scoring and HTML rendering (no network).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeYoutubeVideos,
  watchSeconds,
} from '../dist/content-feedback.js';
import { renderFeedbackHtml } from '../dist/content-feedback-html.js';

describe('median / units', () => {
  it('reads a large watch value as milliseconds', () => {
    assert.equal(watchSeconds(8500), 8.5);
    assert.equal(watchSeconds(8.5), 8.5);
  });
});

describe('YouTube scoring', () => {
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
