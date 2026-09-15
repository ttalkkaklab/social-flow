import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignmentFromWords, matchLetters, transcriptLetters } from '../dist/asr-alignment.js';
import { locateSegments, respace } from '../dist/sentence-spacing.js';
import { pcmToWav } from '../dist/media-utils.js';

// The aligner's word list for a two-sentence take, with one misheard syllable (활을 → 화를).
const words = [
  { text: '그는', start: 0.5, end: 0.9 }, { text: '활을', start: 0.9, end: 1.4 }, { text: '잡았어요.', start: 1.4, end: 2.2 },
  { text: '누구도', start: 2.6, end: 3.0 }, { text: '말이', start: 3.0, end: 3.3 }, { text: '없었습니다.', start: 3.3, end: 4.2 },
];
const script = '그는 활을 잡았어요. 누구도 말이 없었습니다.';

test('transcript letters spread a word\'s span evenly and skip punctuation', () => {
  const letters = transcriptLetters([{ text: '잡았어요.', start: 1.0, end: 2.0 }]);
  assert.deepEqual(letters.map(l => l.char), ['잡', '았', '어', '요']);
  assert.equal(letters[0].start, 1.0); assert.equal(letters[3].end, 2.0); assert.equal(letters[1].start, 1.25);
});

test('script letters match the transcript by edit distance, a misheard syllable stays unmatched', () => {
  const heard = [...'그는화를잡았어요'];
  const matched = matchLetters([...'그는활을잡았어요'], heard);
  assert.deepEqual(matched, [0, 1, -1, -1, 4, 5, 6, 7]);
  assert.deepEqual(matchLetters([...'가나'], []), [-1, -1]);
});

test('the table covers every script character, is monotone, and sentence boundaries land on the words', () => {
  const heard = words.map(w => ({ ...w, text: w.text.replace('활을', '화를') }));
  const { alignment, matched, letters } = alignmentFromWords(script, heard);
  assert.equal(alignment.characters.length, [...script].length);
  assert.equal(letters, 18); assert.equal(matched, 16);
  const starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  for (let i = 1; i < starts.length; i++) { assert.ok(starts[i] >= starts[i - 1]); assert.ok(ends[i] >= starts[i]); }
  const located = locateSegments(alignment, ['그는 활을 잡았어요.', '누구도 말이 없었습니다.']);
  assert.equal(located[0].start, 0.5); assert.equal(located[0].end, 2.2);
  assert.equal(located[1].start, 2.6); assert.equal(located[1].end, 4.2);
  // The unmatched letter sits between its neighbours, never outside the word.
  const idx = [...script].indexOf('활');
  assert.ok(starts[idx] >= 0.9 && ends[idx] <= 1.4);
});

test('a take aligned this way gets the same fixed pause as a vendor-aligned one', () => {
  const sampleRate = 24000, seconds = 4.5;
  const pcm = Buffer.alloc(seconds * sampleRate * 2);
  for (let i = 0; i < seconds * sampleRate; i++) { const t = i / sampleRate; const speaking = (t >= 0.5 && t < 2.2) || (t >= 2.6 && t < 4.2); pcm.writeInt16LE(speaking ? Math.round(6000 * Math.sin(t * 2000)) : 0, i * 2); }
  const { alignment } = alignmentFromWords(script, words);
  const result = respace(pcmToWav(pcm, sampleRate, 1), alignment, ['그는 활을 잡았어요.', '누구도 말이 없었습니다.'], { pause: 0.5, playbackSpeed: 1 });
  assert.deepEqual(result.gaps, [0.5]);
  assert.ok(Math.abs(result.inserted[0] - 0.1) < 0.02, `inserted ${result.inserted[0]}`);
  assert.ok(Math.abs(result.sentences[1].start - result.sentences[0].end - 0.5) < 0.02);
});

test('an empty transcript is a refusal, not a silent table', () => {
  assert.throws(() => alignmentFromWords(script, [{ text: '...', start: 0, end: 1 }]), /No script letter matched/);
});
