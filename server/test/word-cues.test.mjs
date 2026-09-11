import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const script = path.resolve(import.meta.dirname, '../../skills/produce/references/word-cues.py');
const run = (sentence, ...extra) => {
  const r = spawnSync('python3', [script, '0', '3', '0', '3', '0.3', sentence, ...extra], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const TAG = '{\\c&H0055FF&}';
test('subtitle accent colours only the year and the named person', () => {
  const out = run('1592년 이순신이 배를 돌렸어요', '--accent', 'ff5500', '--accent-words', '이순신');
  assert.match(out, new RegExp(TAG.replace(/[\\{}&]/g, '\\$&') + '1592년\\{\\\\r\\}'));
  assert.match(out, /이순신이\{\\r\}/);
  assert.doesNotMatch(out, /\{\\c&H0055FF&\}배를/);
  assert.match(out, /accent #ff5500/);
});
test('a spaced year colours both words, a decimal and a span colour nothing', () => {
  const spaced = run('그 1592 년 봄이었어요', '--accent', 'ff5500');
  assert.match(spaced, /\{\\c&H0055FF&\}1592\{\\r\}/);
  assert.match(spaced, /\{\\c&H0055FF&\}년\{\\r\}/);
  for (const plain of ['1200.5킬로를 걸었어요', '300년 동안 닫힌 문이에요'])
    assert.doesNotMatch(run(plain, '--accent', 'ff5500'), /\\c&H/);
});
test('without --accent the cue lines carry no override tags', () => {
  assert.doesNotMatch(run('1592년 이순신이 배를 돌렸어요'), /\\c&H/);
});
