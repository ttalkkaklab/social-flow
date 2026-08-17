/**
 * 시장 주제 스카우트 — 순수 함수만 (네트워크 없음).
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
  it('홀수는 가운데 값이다', () => {
    assert.equal(median([10, 30, 20]), 20);
  });
  it('짝수는 가운데 둘의 평균이다', () => {
    assert.equal(median([10, 40, 20, 30]), 25);
  });
  it('빈 배열은 null 이다', () => {
    assert.equal(median([]), null);
  });
});

describe('parseIsoDurationSeconds', () => {
  it('분·초를 더한다', () => {
    assert.equal(parseIsoDurationSeconds('PT1M30S'), 90);
  });
  it('쇼츠 길이(45초)를 읽는다', () => {
    assert.equal(parseIsoDurationSeconds('PT45S'), 45);
  });
  it('빈 값은 null 이다', () => {
    assert.equal(parseIsoDurationSeconds(''), null);
  });
});

describe('tokenizeTitle / extractPhrases', () => {
  it('기호와 불용어를 걷어 낸다', () => {
    const tokens = tokenizeTitle('AI 업무 자동화 하는 법! #쇼츠');
    assert.ok(tokens.includes('업무'));
    assert.ok(tokens.includes('자동화'));
    assert.ok(!tokens.includes('쇼츠'));
    assert.ok(!tokens.includes('하는'));
  });
  it('2그램을 뽑는다', () => {
    const phrases = extractPhrases('맥북 프로 배터리 후기');
    assert.ok(phrases.includes('맥북 프로'));
    assert.ok(phrases.includes('프로 배터리'));
  });
});

describe('looksLikeQuestion', () => {
  it('미해결 질문을 잡는다', () => {
    assert.equal(looksLikeQuestion('배터리 시간은 안 알려 주시나요?'), true);
    assert.equal(looksLikeQuestion('잘 보고 갑니다'), false);
  });
});

describe('scoreKeywords', () => {
  it('여러 아웃라이어에 겹친 구를 위로 올린다', () => {
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

  it('한 영상에서만 나온 한 토큰은 버린다', () => {
    const ranked = scoreKeywords([{ videoId: 'a', title: '유니콘단어만등장', multiplier: 20 }], 10);
    assert.ok(!ranked.some((row) => row.phrase === '유니콘단어만등장'));
  });
});
