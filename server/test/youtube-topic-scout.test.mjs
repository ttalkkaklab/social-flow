/**
 * Market topic scout — pure functions only (no network).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractPhrases,
  looksLikeQuestion,
  median,
  parseIsoDurationSeconds,
  scoreKeywords,
  tokenizeTitle,
} from '../dist/youtube-topic-scout.js';

describe('median', () => {
  it('odd length gives the middle value', () => {
    assert.equal(median([10, 30, 20]), 20);
  });
  it('even length averages the middle two', () => {
    assert.equal(median([10, 40, 20, 30]), 25);
  });
  it('an empty array is null', () => {
    assert.equal(median([]), null);
  });
});

describe('parseIsoDurationSeconds', () => {
  it('adds minutes and seconds', () => {
    assert.equal(parseIsoDurationSeconds('PT1M30S'), 90);
  });
  it('reads a shorts-length duration (45s)', () => {
    assert.equal(parseIsoDurationSeconds('PT45S'), 45);
  });
  it('an empty value is null', () => {
    assert.equal(parseIsoDurationSeconds(''), null);
  });
});

describe('tokenizeTitle / extractPhrases', () => {
  it('strips symbols and stop words', () => {
    const tokens = tokenizeTitle('AI 업무 자동화 하는 법! #쇼츠');
    assert.ok(tokens.includes('업무'));
    assert.ok(tokens.includes('자동화'));
    assert.ok(!tokens.includes('쇼츠'));
    assert.ok(!tokens.includes('하는'));
  });
  it('extracts 2-grams', () => {
    const phrases = extractPhrases('맥북 프로 배터리 후기');
    assert.ok(phrases.includes('맥북 프로'));
    assert.ok(phrases.includes('프로 배터리'));
  });
});

describe('looksLikeQuestion', () => {
  it('catches unresolved questions', () => {
    assert.equal(looksLikeQuestion('배터리 시간은 안 알려 주시나요?'), true);
    assert.equal(looksLikeQuestion('잘 보고 갑니다'), false);
  });
});

describe('scoreKeywords', () => {
  it('ranks phrases shared by multiple outliers higher', () => {
    const ranked = scoreKeywords(
      [
        { videoId: 'a', title: 'AI 마케팅 자동화 하는 법', multiplier: 12 },
        { videoId: 'b', title: 'AI 마케팅 자동화 실전', multiplier: 8 },
        { videoId: 'c', title: '엑셀 단축키 모음', multiplier: 6 },
      ],
      10,
    );
    assert.ok(ranked.length > 0);
    assert.equal(ranked[0].phrase, 'ai 마케팅 자동화');
    assert.equal(ranked[0].outlierCount, 2);
    assert.ok(ranked[0].bestMultiplier >= 12);
  });

  it('drops a single token seen in only one video', () => {
    const ranked = scoreKeywords([{ videoId: 'a', title: '유니콘단어만등장', multiplier: 20 }], 10);
    assert.ok(!ranked.some((row) => row.phrase === '유니콘단어만등장'));
  });
});
