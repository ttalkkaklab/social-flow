/**
 * SNS 이슈 스카우트 — 순수 함수만 (네트워크 없음).
 *
 * URL 정규화 픽스처는 2026-08-18 serp_web_search 실측 결과에서 그대로 가져왔다
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

describe('canonicalPost — 게시물 URL 정규화', () => {
  it('스레드: 슬러그·/media 를 떼고 같은 글을 한 URL 로 모은다', () => {
    const slug = canonicalPost(
      'threads',
      'https://www.threads.com/@kap_writing/post/DcFwgSXH8Yn/ai%EB%A1%9C-%EC%97%85%EB%AC%B4',
    );
    const media = canonicalPost('threads', 'https://www.threads.com/@snapplug.app/post/DcBNlbVCSAi/media');
    assert.deepEqual(slug, { url: 'https://www.threads.com/@kap_writing/post/DcFwgSXH8Yn', author: 'kap_writing' });
    assert.deepEqual(media, { url: 'https://www.threads.com/@snapplug.app/post/DcBNlbVCSAi', author: 'snapplug.app' });
  });
  it('스레드: 프로필 페이지는 글이 아니다', () => {
    assert.equal(canonicalPost('threads', 'https://www.threads.com/@work__zero'), null);
  });
  it('X: /photo/1 을 떼고 x.com 으로 정규화하며 twitter.com 도 받는다', () => {
    assert.deepEqual(canonicalPost('x', 'https://x.com/XAUUSD_GoldEA/status/2089153099135144108/photo/1'), {
      url: 'https://x.com/XAUUSD_GoldEA/status/2089153099135144108',
      author: 'XAUUSD_GoldEA',
    });
    assert.deepEqual(canonicalPost('x', 'https://twitter.com/ffreedomkr/status/2088423096667738201'), {
      url: 'https://x.com/ffreedomkr/status/2088423096667738201',
      author: 'ffreedomkr',
    });
  });
  it('X: /i/status 짧은 주소는 작성자가 없다', () => {
    assert.deepEqual(canonicalPost('x', 'https://x.com/i/status/123'), { url: 'https://x.com/i/status/123', author: null });
  });
  it('X: 프로필은 글이 아니다', () => {
    assert.equal(canonicalPost('x', 'https://x.com/ffreedomkr'), null);
  });
  it('인스타: /p/·/reel/·<user>/reel/ 을 한 꼴로 맞춘다', () => {
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
  it('인스타: 프로필·태그 페이지는 글이 아니다', () => {
    assert.equal(canonicalPost('instagram', 'https://www.instagram.com/hanjin_official/'), null);
    assert.equal(canonicalPost('instagram', 'https://www.instagram.com/explore/tags/ai/'), null);
  });
});

describe('authorFromSource', () => {
  it('"X · user" 꼴에서 작성자를 뽑는다', () => {
    assert.equal(authorFromSource('X · ffreedomkr'), 'ffreedomkr');
    assert.equal(authorFromSource('Instagram · jeong_creator'), 'jeong_creator');
  });
  it('플랫폼 이름만 있으면 null 이다', () => {
    assert.equal(authorFromSource('Threads'), null);
    assert.equal(authorFromSource('Instagram'), null);
    assert.equal(authorFromSource(undefined), null);
  });
});

describe('stripKoParticle — 조사 떼기', () => {
  it('흔한 조사를 어절 끝에서 뗀다', () => {
    assert.equal(stripKoParticle('자동화를'), '자동화');
    assert.equal(stripKoParticle('회사에서는'), '회사');
    assert.equal(stripKoParticle('직장인이'), '직장인');
    assert.equal(stripKoParticle('부업으로'), '부업');
  });
  it('어간이 2자 미만으로 남으면 손대지 않는다', () => {
    assert.equal(stripKoParticle('집에서'), '집에서');
    assert.equal(stripKoParticle('차이'), '차이');
  });
  it('명사 끝 "이" 는 3자에서 뗀 것처럼 보이지 않게 4자부터만 뗀다', () => {
    assert.equal(stripKoParticle('고양이'), '고양이');
    assert.equal(stripKoParticle('어린이'), '어린이');
    assert.equal(stripKoParticle('동영상이'), '동영상');
  });
  it('한글로 끝나지 않으면 그대로다', () => {
    assert.equal(stripKoParticle('claude'), 'claude');
    assert.equal(stripKoParticle('n8n'), 'n8n');
  });
});

describe('tokenizeSnsText / normalizeTokens / phrasesFromTokens', () => {
  it('플랫폼 이름·구어 불용어를 걷어 내고 조사는 어간이 묶음에 있을 때만 뗀다', () => {
    const raw = tokenizeSnsText('요즘 클로드코드로 이것저것 자동화해보는 재미에 푹 빠져 있어요 (Instagram)');
    assert.ok(!raw.includes('요즘'));
    assert.ok(!raw.includes('instagram'));
    assert.ok(!raw.includes('있어요'));
    const tokens = normalizeTokens(raw, new Set([...raw, '클로드코드']));
    assert.ok(tokens.includes('클로드코드'), JSON.stringify(tokens));
    assert.ok(!tokens.includes('클로드코드로'));
  });
  it('어간이 묶음에 없으면 떼지 않는다 — 워크플로가 워크플이 되지 않게', () => {
    const raw = ['워크플로', '전문가', '자동화를'];
    assert.deepEqual(normalizeTokens(raw, new Set([...raw, '자동화'])), ['워크플로', '전문가', '자동화']);
  });
  it('1~3그램을 뽑는다', () => {
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

  it('시드 낱말만으로 된 구는 주제어가 아니다', () => {
    const rows = scoreSnsKeywords(
      [post('threads', 1, 'AI 자동화 시작했어요'), post('x', 2, 'AI 자동화 정리'), post('instagram', 3, 'AI 자동화 특강')],
      seeds,
      10,
    );
    assert.ok(!rows.some((r) => r.phrase === 'ai 자동화' || r.phrase === 'ai' || r.phrase === '자동화'));
  });

  it('여러 플랫폼에 같이 나온 구가 한 플랫폼 여러 글보다 앞선다', () => {
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

  it('한 글에서만 나온 구와 두 글뿐인 한 단어 구는 버린다', () => {
    const rows = scoreSnsKeywords(
      [post('threads', 1, '노션 템플릿 나눔'), post('threads', 2, '노션 단축키'), post('x', 3, '유일한 문장')],
      seeds,
      10,
    );
    assert.ok(!rows.some((r) => r.phrase === '노션'), '두 글뿐인 한 단어 구는 노이즈로 본다');
    assert.ok(!rows.some((r) => r.phrase === '유일한 문장'));
  });

  it('같은 글이 두 시드에서 잡혀도 한 번만 센다', () => {
    const p = post('threads', 1, '클로드코드 플러그인 공개');
    const rows = scoreSnsKeywords([p, { ...p }, post('x', 2, '클로드코드 플러그인 후기')], seeds, 10);
    const cc = rows.find((r) => r.phrase === '클로드코드 플러그인');
    assert.equal(cc.postCount, 2);
  });

  it('긴 구를 골랐으면 그 안의 낱말은 중복으로 뺀다', () => {
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

describe('sns_issue_scout · serp_trending_now 툴 표면', () => {
  const scout = byName.get('sns_issue_scout');
  const trending = byName.get('serp_trending_now');

  it('둘 다 있고 읽기 전용이며 플랫폼 자격증명 게이트 밖이다 (SerpApi 키만 필요)', () => {
    for (const tool of [scout, trending]) {
      assert.ok(tool);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.ok(!(tool.name in SNS_PLATFORM_BY_TOOL));
    }
  });
  it('platforms enum 이 모듈 정본과 같다', () => {
    assert.deepEqual(scout.inputSchema.properties.platforms.items.enum, [...SNS_SCOUT_PLATFORMS]);
  });
  it('설명이 유튜브 배수와 잣대가 다름을 못박는다 — 같은 표에 섞이는 사고를 막는다', () => {
    assert.match(scout.description, /참여량이 없고/);
    assert.match(scout.description, /같은 칸에 섞지 말 것/);
  });
  it('설명이 크레딧 계산식을 알려준다', () => {
    assert.match(scout.description, /플랫폼 수 × 시드 수 × pagesPerQuery/);
    assert.match(trending.description, /크레딧 1건/);
  });
  it('급상승 창은 구글이 정한 넷뿐이다', () => {
    assert.deepEqual(trending.inputSchema.properties.hours.enum, [4, 24, 48, 168]);
    assert.deepEqual(scout.inputSchema.properties.trendingHours.enum, [4, 24, 48, 168]);
  });
  it('스카우트 출력이 keywords·posts 를 요구하고 trending 은 선택이다', () => {
    const req = scout.outputSchema.required;
    assert.ok(req.includes('keywords') && req.includes('posts'));
    assert.ok(!req.includes('trending'));
  });
});
