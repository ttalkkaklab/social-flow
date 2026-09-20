import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROUTES } from '../dist/handlers.js';
import { threadsBodyHash } from '../dist/threads-gate.js';

// All calls use the real MCP routes; network access fails the test immediately.
test('Threads growth and episode gates: real routes, no publishing APIs', async () => {
  const cwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'threads-gate-'));
  const fetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error('Unexpected network call'); };
  process.chdir(temp);
  const invoke = (name, input) => ROUTES[name](input);
  const payload = (result) => JSON.parse(result.content[0].text);
  const body = '맥북을 켰어요. 비밀번호가 생각나지 않아서 커피부터 마셨어요.';
  const base = { channel: 'test', body, readerMessage: '설정을 확인해요', comicElements: ['커피부터 마시는 장면'], purpose: 'empathy', purposeEvidence: body, flow: { hook: '장면', turn: '실수', residue: '공감' }, submitter: 'writer', submitterContext: 'session-1' };
  const dir = join(temp, 'data/test/growth/threads');
  const config = (voice = 95, purpose = 80) => writeFileSync(join(dir, 'gate.json'), JSON.stringify({ voice, purpose, flow: 80 }));
  try {
    for (const key of ['channel', 'body', 'readerMessage', 'comicElements', 'purpose', 'purposeEvidence', 'flow']) {
      const input = { ...base }; delete input[key];
      await assert.rejects(invoke('threads_draft_create', input));
    }
    for (const input of [{ ...base, body: ' ' }, { ...base, comicElements: [] }, { ...base, comicElements: [' '] }, { ...base, channel: '../escape' }]) {
      await assert.rejects(invoke('threads_draft_create', input));
    }
    await assert.rejects(invoke('threads_draft_create', { ...base, purpose: ['info', 'fun'] }));
    await assert.rejects(invoke('threads_draft_create', { ...base, purposeEvidence: '없는 문장' }), /quote not present/);
    await assert.rejects(invoke('threads_draft_create', { ...base, flow: { hook: '시작', turn: '전환' } }));
    const draft = payload(await invoke('threads_draft_create', base));
    const pub = { channel: 'test', caption: body, draftId: draft.draftId, dryRun: true };
    const review = (axis, extra = {}) => ({ ...draft, axis, score: 100, reasons: ['장면이 구체적이에요'], improvements: ['다음 글은 다른 장면을 써요'], reviewer: 'writer', reviewerContext: 'session-1', findings: [{ quote: body, issue: '구체적 장면을 확인했어요', severity: 'pass' }], ...extra });
    for (const key of ['reasons', 'improvements', 'reviewer', 'reviewerContext', 'findings', 'bodyHash']) {
      const input = review('voice'); delete input[key];
      await assert.rejects(invoke('threads_review_submit', input));
    }
    await assert.rejects(invoke('threads_review_submit', review('voice', { findings: [] })));
    await assert.rejects(invoke('threads_review_submit', review('voice', { bodyHash: '0'.repeat(64) })), /hash mismatch/);
    await assert.rejects(invoke('threads_review_submit', review('voice', { findings: [{ quote: '없는 문장', issue: '위조', severity: 'pass' }] })), /quote not present/);
    const receipt = payload(await invoke('threads_review_submit', review('voice', { findings: [{ quote: body.replaceAll(' ', '\n  '), issue: '공백 차이', severity: 'pass' }] })));
    assert.equal(receipt.selfReview, true);
    assert.equal(receipt.sameContext, true);
    await assert.rejects(invoke('threads_publish', pub), /thresholds not configured/);
    config();
    await assert.rejects(invoke('threads_publish', pub), /Missing purpose/);
    await invoke('threads_review_submit', review('purpose', { score: 79 }));
    await assert.rejects(invoke('threads_publish', pub), /below 80/);
    await invoke('threads_review_submit', review('purpose'));
    await assert.rejects(invoke('threads_publish', pub), /Missing flow/);
    await invoke('threads_review_submit', review('flow'));
    await assert.rejects(invoke('threads_publish', { ...pub, caption: body + ' 수정' }), /hash mismatch/);
    await assert.rejects(invoke('threads_publish', { ...pub, channel: 'other' }), /channel mismatch/);
    await assert.rejects(invoke('threads_publish', { channel: 'test', caption: body, dryRun: true }), /Exactly one/);
    await assert.rejects(invoke('threads_publish', { ...pub, episodeRef: 'episode' }), /Exactly one/);
    assert.equal((await invoke('threads_publish', pub)).structuredContent.dryRun, true);
    config(100, 100);
    assert.equal((await invoke('threads_publish', pub)).structuredContent.gatePassed, true);
    writeFileSync(join(dir, 'gate.json'), '{bad');
    await assert.rejects(invoke('threads_publish', pub));
    config();
    // An actual checker failure must block even when all reviews pass.
    const bad = payload(await invoke('threads_draft_create', { ...base, body: '결과는 둘로 나뉩니다.', purposeEvidence: '결과는 둘로 나뉩니다.' }));
    for (const axis of ['voice', 'purpose', 'flow']) await invoke('threads_review_submit', { ...review(axis), ...bad, findings: [{ quote: '결과는 둘로 나뉩니다.', issue: '검사기 차단 검증', severity: 'pass' }] });
    await assert.rejects(invoke('threads_publish', { ...pub, draftId: bad.draftId, caption: '결과는 둘로 나뉩니다.' }), /Style check failed/);
    const replyDraft = payload(await invoke('threads_draft_create', { ...base, surface: 'reply', replyToId: 'parent-1' }));
    await invoke('threads_review_submit', { ...review('voice'), ...replyDraft });
    const replyPub = { ...pub, draftId: replyDraft.draftId, replyToId: 'parent-1' };
    assert.equal((await invoke('threads_publish', replyPub)).structuredContent.dryRun, true);
    await assert.rejects(invoke('threads_publish', { ...replyPub, replyToId: undefined }), /reply target mismatch/);
    await assert.rejects(invoke('threads_review_submit', { ...review('purpose'), ...replyDraft }), /voice review only/);
    const selfReply = '커피는 식기 전에 마셔요.';
    const chainDraft = payload(await invoke('threads_draft_create', { ...base, selfReply }));
    for (const axis of ['voice', 'purpose', 'flow']) await invoke('threads_review_submit', { ...review(axis), ...chainDraft });
    const chainPub = { ...pub, draftId: chainDraft.draftId, selfReply };
    assert.equal((await invoke('threads_publish', chainPub)).structuredContent.dryRun, true);
    await assert.rejects(invoke('threads_publish', { ...chainPub, selfReply: selfReply + ' 수정' }), /hash mismatch/);
    await assert.rejects(invoke('threads_review_submit', { ...review('purpose'), ...chainDraft, findings: [{ quote: selfReply, issue: '자답은 목적 평가 대상 밖', severity: 'pass' }] }), /quote not present/);
    await invoke('threads_review_submit', review('voice', { findings: [{ quote: body, issue: '해결 전 결함', severity: 'P0' }] }));
    await assert.rejects(invoke('threads_publish', pub), /unresolved P0/);
    await invoke('threads_review_submit', review('voice'));
    // Disk mutation cannot retain a review for the old body.
    const file = join(dir, 'drafts', draft.draftId.split('.')[1] + '.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...saved, body: '바뀐 문장이에요.' }));
    await assert.rejects(invoke('threads_review_submit', review('voice')), /hash mismatch/);
    await assert.rejects(invoke('threads_publish', pub), /hash mismatch/);
    assert.equal(threadsBodyHash('가\r\n나 ', ' 답 '), threadsBodyHash('가\n나', '답'));
    assert.notEqual(threadsBodyHash('ab', 'c'), threadsBodyHash('a', 'bc'));
    // Both video episodes and text-only fallback retain their path with exact approval.
    const ep = join(temp, 'data/test/episodes/episode');
    mkdirSync(join(ep, 'storyboard'), { recursive: true });
    writeFileSync(join(ep, 'storyboard/scenes.js'), 'window.SCENES = [];');
    const episodeInput = { channel: 'test', episodeRef: 'episode', caption: body, dryRun: true };
    await assert.rejects(invoke('threads_publish', episodeInput));
    for (const media of [{}, { videoUrl: 'https://example.com/video.mp4' }]) {
      writeFileSync(join(ep, 'threads-publish-approval.json'), JSON.stringify({ approved: true, caption: body, ...media }));
      assert.equal((await invoke('threads_publish', { ...episodeInput, ...media })).structuredContent.dryRun, true);
      await assert.rejects(invoke('threads_publish', { ...episodeInput, ...media, caption: '다른 글이에요.' }), /approval mismatch/);
    }
    await assert.rejects(invoke('threads_publish', { ...episodeInput, episodeRef: '../episode' }));
    const audit = readFileSync(join(dir, 'gate-log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(audit.some(e => e.result === 'rejected'));
    assert.ok(audit.some(e => e.selfReview === true && e.sameContext === true));
    assert.equal(networkCalls, 0);
  } finally {
    process.chdir(cwd);
    globalThis.fetch = fetch;
    rmSync(temp, { recursive: true, force: true });
  }
});
