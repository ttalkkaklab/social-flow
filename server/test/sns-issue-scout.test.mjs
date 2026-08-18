/**
 * SNS issue scout — pure functions only (no network).
 *
 * The URL-normalization fixtures come verbatim from a 2026-08-18 serp_web_search run
 * (site:threads.com / site:x.com / site:instagram.com "AI 자동화", gl=kr, recency=week).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  authorFromSource,
  canonicalPost,
  normalizeTokens,
  phrasesFromTokens,
  scoreSnsKeywords,
  SNS_SCOUT_PLATFORMS,
  stripKoParticle,
  tokenizeSnsText,
} from '../dist/sns-issue-scout.js';
import { SNS_PLATFORM_BY_TOOL, TOOLS } from '../dist/tools.js';

const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));

describe('canonicalPost — post URL normalization', () => {
  it('Threads: strips the slug and /media so one post lands on one URL', () => {
    const slug = canonicalPost(
      'threads',
      'https://www.threads.com/@kap_writing/post/DcFwgSXH8Yn/ai%EB%A1%9C-%EC%97%85%EB%AC%B4',
    );
    const media = canonicalPost('threads', 'https://www.threads.com/@snapplug.app/post/DcBNlbVCSAi/media');
    assert.deepEqual(slug, { url: 'https://www.threads.com/@kap_writing/post/DcFwgSXH8Yn', author: 'kap_writing' });
    assert.deepEqual(media, { url: 'https://www.threads.com/@snapplug.app/post/DcBNlbVCSAi', author: 'snapplug.app' });
  });
  it('Threads: a profile page is not a post', () => {
    assert.equal(canonicalPost('threads', 'https://www.threads.com/@work__zero'), null);
  });
  it('X: strips /photo/1, normalizes to x.com, and accepts twitter.com too', () => {
    assert.deepEqual(canonicalPost('x', 'https://x.com/XAUUSD_GoldEA/status/2089153099135144108/photo/1'), {
      url: 'https://x.com/XAUUSD_GoldEA/status/2089153099135144108',
      author: 'XAUUSD_GoldEA',
    });
    assert.deepEqual(canonicalPost('x', 'https://twitter.com/ffreedomkr/status/2088423096667738201'), {
      url: 'https://x.com/ffreedomkr/status/2088423096667738201',
      author: 'ffreedomkr',
    });
  });
  it('X: the /i/status short form has no author', () => {
    assert.deepEqual(canonicalPost('x', 'https://x.com/i/status/123'), { url: 'https://x.com/i/status/123', author: null });
  });
  it('X: a profile is not a post', () => {
    assert.equal(canonicalPost('x', 'https://x.com/ffreedomkr'), null);
  });
  it('Instagram: brings /p/, /reel/, and <user>/reel/ into one form', () => {
    assert.deepEqual(canonicalPost('instagram', 'https://www.instagram.com/p/Db_6hWVE1Bf/'), {
      url: 'https://www.instagram.com/p/Db_6hWVE1Bf/',
      author: null,
    });
    assert.deepEqual(canonicalPost('instagram', 'https://www.instagram.com/ssolfa8_8/reel/Db7_ZL7pq18/'), {
      url: 'https://www.instagram.com/reel/Db7_ZL7pq18/',
      author: 'ssolfa8_8',
    });
    assert.deepEqual(canonicalPost('instagram', 'https://www.instagram.com/reels/Db75gzgv78p/'), {
      url: 'https://www.instagram.com/reel/Db75gzgv78p/',
      author: null,
    });
  });
  it('Instagram: profile and tag pages are not posts', () => {
    assert.equal(canonicalPost('instagram', 'https://www.instagram.com/hanjin_official/'), null);
    assert.equal(canonicalPost('instagram', 'https://www.instagram.com/explore/tags/ai/'), null);
  });
});

describe('authorFromSource', () => {
  it('pulls the author out of the "X · user" form', () => {
    assert.equal(authorFromSource('X · ffreedomkr'), 'ffreedomkr');
    assert.equal(authorFromSource('Instagram · jeong_creator'), 'jeong_creator');
  });
  it('is null when only the platform name is there', () => {
    assert.equal(authorFromSource('Threads'), null);
    assert.equal(authorFromSource('Instagram'), null);
    assert.equal(authorFromSource(undefined), null);
  });
});

describe('stripKoParticle — particle stripping', () => {
  it('strips common particles off the end of a word', () => {
    assert.equal(stripKoParticle('자동화를'), '자동화');
    assert.equal(stripKoParticle('회사에서는'), '회사');
    assert.equal(stripKoParticle('직장인이'), '직장인');
    assert.equal(stripKoParticle('부업으로'), '부업');
  });
  it('leaves the word alone when under 2 characters of stem would remain', () => {
    assert.equal(stripKoParticle('집에서'), '집에서');
    assert.equal(stripKoParticle('차이'), '차이');
  });
  it('strips the noun-final "이" only from 4 characters up, so 3-character words stay whole', () => {
    assert.equal(stripKoParticle('고양이'), '고양이');
    assert.equal(stripKoParticle('어린이'), '어린이');
    assert.equal(stripKoParticle('동영상이'), '동영상');
  });
  it('leaves anything not ending in Hangul as it is', () => {
    assert.equal(stripKoParticle('claude'), 'claude');
    assert.equal(stripKoParticle('n8n'), 'n8n');
  });
});

describe('tokenizeSnsText / normalizeTokens / phrasesFromTokens', () => {
  it('clears out platform names and spoken stop words, stripping particles only when the stem is in the batch', () => {
    const raw = tokenizeSnsText('요즘 클로드코드로 이것저것 자동화해보는 재미에 푹 빠져 있어요 (Instagram)');
    assert.ok(!raw.includes('요즘'));
    assert.ok(!raw.includes('instagram'));
    assert.ok(!raw.includes('있어요'));
    const tokens = normalizeTokens(raw, new Set([...raw, '클로드코드']));
    assert.ok(tokens.includes('클로드코드'), JSON.stringify(tokens));
    assert.ok(!tokens.includes('클로드코드로'));
  });
  it('does not strip when the stem is missing from the batch — so 워크플로 never becomes 워크플', () => {
    const raw = ['워크플로', '전문가', '자동화를'];
    assert.deepEqual(normalizeTokens(raw, new Set([...raw, '자동화'])), ['워크플로', '전문가', '자동화']);
  });
  it('extracts 1~3-grams', () => {
    const phrases = phrasesFromTokens(['클로드코드', '플러그인', '공개']);
    assert.ok(phrases.includes('클로드코드 플러그인'));
    assert.ok(phrases.includes('클로드코드 플러그인 공개'));
    assert.equal(phrases.length, 6);
  });
});

describe('scoreSnsKeywords', () => {
  const post = (platform, id, text) => ({
    platform,
    url: `https://example.com/${platform}/${id}`,
    author: null,
    title: text,
    snippet: '',
    matchedQueries: ['AI 자동화'],
  });
  const seeds = ['AI 자동화'];

  it('a phrase made only of seed words is not a topic phrase', () => {
    const rows = scoreSnsKeywords(
      [post('threads', 1, 'AI 자동화 시작했어요'), post('x', 2, 'AI 자동화 정리'), post('instagram', 3, 'AI 자동화 특강')],
      seeds,
      10,
    );
    assert.ok(!rows.some((r) => r.phrase === 'ai 자동화' || r.phrase === 'ai' || r.phrase === '자동화'));
  });

  it('a phrase appearing across several platforms outranks several posts on one platform', () => {
    const rows = scoreSnsKeywords(
      [
        post('threads', 1, '클로드코드 플러그인 공개'),
        post('x', 2, '클로드코드 플러그인 써 봄'),
        post('threads', 3, 'n8n 워크플로 팁'),
        post('threads', 4, 'n8n 워크플로 실수'),
      ],
      seeds,
      10,
    );
    const cc = rows.find((r) => r.phrase === '클로드코드 플러그인');
    const n8n = rows.find((r) => r.phrase === 'n8n 워크플로');
    assert.ok(cc && n8n, JSON.stringify(rows));
    assert.equal(cc.postCount, 2);
    assert.equal(cc.platformCount, 2);
    assert.equal(cc.score, 2.5);
    assert.equal(n8n.score, 2);
    assert.ok(rows.indexOf(cc) < rows.indexOf(n8n));
    assert.deepEqual(cc.platforms, ['threads', 'x']);
  });

  it('drops a phrase seen in only one post, and a single-word phrase seen in only two', () => {
    const rows = scoreSnsKeywords(
      [post('threads', 1, '노션 템플릿 나눔'), post('threads', 2, '노션 단축키'), post('x', 3, '유일한 문장')],
      seeds,
      10,
    );
    assert.ok(!rows.some((r) => r.phrase === '노션'), 'a single-word phrase from only two posts counts as noise');
    assert.ok(!rows.some((r) => r.phrase === '유일한 문장'));
  });

  it('counts one post once even when two seeds catch it', () => {
    const p = post('threads', 1, '클로드코드 플러그인 공개');
    const rows = scoreSnsKeywords([p, { ...p }, post('x', 2, '클로드코드 플러그인 후기')], seeds, 10);
    const cc = rows.find((r) => r.phrase === '클로드코드 플러그인');
    assert.equal(cc.postCount, 2);
  });

  it('drops the words inside a longer phrase already picked as duplicates', () => {
    const rows = scoreSnsKeywords(
      [post('threads', 1, '클로드코드 플러그인 공개'), post('x', 2, '클로드코드 플러그인 후기'), post('instagram', 3, '클로드코드 플러그인 정리')],
      seeds,
      10,
    );
    assert.ok(rows.some((r) => r.phrase === '클로드코드 플러그인'));
    assert.ok(!rows.some((r) => r.phrase === '클로드코드'));
    assert.ok(!rows.some((r) => r.phrase === '플러그인'));
  });
});

describe('sns_issue_scout · serp_trending_now tool surface', () => {
  const scout = byName.get('sns_issue_scout');
  const trending = byName.get('serp_trending_now');

  it('both exist, are read-only, and sit outside the platform credential gate (SerpApi key only)', () => {
    for (const tool of [scout, trending]) {
      assert.ok(tool);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.ok(!(tool.name in SNS_PLATFORM_BY_TOOL));
    }
  });
  it('the platforms enum matches the module source of truth', () => {
    assert.deepEqual(scout.inputSchema.properties.platforms.items.enum, [...SNS_SCOUT_PLATFORMS]);
  });
  it('the description nails down that the yardstick differs from the YouTube multiplier — it stops the two being mixed into one table', () => {
    assert.match(scout.description, /no engagement counts/);
    assert.match(scout.description, /never mix it into the same table/);
  });
  it('the description spells out the credit formula', () => {
    assert.match(scout.description, /Credits = platforms × seeds × pagesPerQuery/);
    assert.match(trending.description, /One call = one SerpApi credit/);
  });
  it('there are only the four trending windows Google fixed', () => {
    assert.deepEqual(trending.inputSchema.properties.hours.enum, [4, 24, 48, 168]);
    assert.deepEqual(scout.inputSchema.properties.trendingHours.enum, [4, 24, 48, 168]);
  });
  it('the scout output requires keywords and posts, with trending optional', () => {
    const req = scout.outputSchema.required;
    assert.ok(req.includes('keywords') && req.includes('posts'));
    assert.ok(!req.includes('trending'));
  });
});
