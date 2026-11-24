import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiveKnowledge, ocrLanguages } from '../dist/live-knowledge.js';

test('an explicit empty knowledge base is valid, missing sources fail, and edits rebuild the searchable index', (t) => {
  const project = mkdtempSync(join(tmpdir(), 'knowledge-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  assert.deepEqual(new LiveKnowledge(project, [], 'ko').search('ginger'), []);
  assert.throws(() => new LiveKnowledge(project, ['missing.txt'], 'ko'));
  writeFileSync(join(project, 'tea.md'), 'Ginger tea is sold in fifteen sachets.');
  const first = new LiveKnowledge(project, ['tea.md'], 'ko');
  assert.equal(first.search('sachets')[0].file, 'tea.md');
  writeFileSync(join(project, 'tea.md'), 'Cinnamon tea comes in ten sachets.');
  const second = new LiveKnowledge(project, ['tea.md'], 'ko');
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.match(second.search('sachets')[0].text, /ten sachets/);
});

test('an unrelated viewer query retrieves no evidence while FAQ drafting may sample the source', t => {
  const project = mkdtempSync(join(tmpdir(), 'source-miss-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  writeFileSync(join(project, 'tea.md'), 'Jasmine tea is sold in sachets.');
  const knowledge = new LiveKnowledge(project, ['tea.md'], 'en');
  assert.deepEqual(knowledge.search('귤값'), []);
  assert.equal(knowledge.sample('귤값', 0).length, 1);
});

test('preparation walks past high-ranking and duplicate-only source batches to reach the chosen count', async t => {
  const { LiveAnswers } = await import('../dist/live-answers.js');
  const project = mkdtempSync(join(tmpdir(), 'faq-sampling-'));
  t.after(() => rmSync(project, {recursive:true,force:true}));
  const files = Array.from({length:16}, (_,i) => {
    const file = 'fact-' + String(i).padStart(2,'0') + '.txt';
    writeFileSync(join(project,file), i < 5 ? 'Tea topic fact ' + i : 'A related fact ' + i);
    return file;
  });
  const knowledge = new LiveKnowledge(project, files, 'en');
  const library = new LiveAnswers([], project, ['tea']);
  const batches = [];
  const rows = await library.plan(10, async (n, _, batch) => {
    batches.push(batch);
    if (batch === 1) return [];
    return knowledge.sample('Tea topic', batch * 5).slice(0,n).map(p => ({questions:[p.file],answer:p.text}));
  });
  assert.equal(rows.length,10);
  assert.deepEqual(batches,[0,1,2]);
});

test('scanned sources use their installed language and script or report the missing pack', () => {
  const installed = ['eng','fra','rus','ara','chi_sim','chi_tra','kor','srp','srp_latn'];
  for (const [language, pack] of [['fr-CA','fra'],['ru','rus'],['ar','ara'],['zh-TW','chi_tra'],
    ['zh-CN','chi_sim'],['ko','kor'],['sr-Latn','srp_latn']]) {
    assert.equal(ocrLanguages(language, installed), pack + '+eng');
  }
  assert.throws(() => ocrLanguages('vi', ['eng']), /vi/);
});
