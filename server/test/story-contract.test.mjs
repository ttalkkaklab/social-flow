import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkStory, storyHash, storySpeech } = require(path.join(root, 'story-contract.js'));
const ref = shot => ({ shot, group: 1, quote: ['Why is the box moving?', 'The table shakes.', 'A fan moves the table.', 'Check the table before the box.'][shot - 1] });
function fixture() {
  const w = { COMPREHENSION: { question: 'Why?', answer: 'A fan.', takeaway: 'Check the support.' },
    SCENES: [1, 2, 3, 4].map(i => ({ type: i === 1 ? 'cover' : 'points',
      beat: i === 1 ? 'hook' : i === 4 ? 'cta' : 'drip', narration: [{ tts: ref(i).quote, sub: ref(i).quote }] })),
    STORY: { version: 'story-v1', kind: 'fiction', viewerNeed: 'Solve the moving-box puzzle',
      thesis: 'Check the table before the box.', basis: 'An explicitly fictional demonstration',
      opening: ref(1), payoff: ref(3), ending: ref(4), endingReason: 'Return to the initial mistaken attribution',
      cta: 'none', beats: [1, 2, 3, 4].map(shot => ({ shot, change: `New clue ${shot}`, necessity: `Required step ${shot}` })) }
  };
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning', 'progression', 'payoff', 'grounding'].map(k => [k, { reason: `${k} evidence in fictional premise`, refs: [ref(3)] }])) };
  return w;
}
test('story contract permits an earned close without CTA and no numeric score', () => {
  assert.deepEqual(checkStory(fixture()), []);
});
test('draft requires plan but does not require completed review', () => {
  const w = fixture(); delete w.STORY.review;
  assert.deepEqual(checkStory(w, { requireReview: false }), []);
  assert.match(checkStory(w).join(), /review is required/);
  delete w.STORY;
  assert.match(checkStory(w, { requireReview: false }).join(), /requires version/);
});
test('rejects missing message, scene purpose, duplicate or omitted scenes', () => {
  for (const key of ['thesis', 'basis', 'viewerNeed', 'endingReason']) {
    const w = fixture(); w.STORY[key] = '';
    assert.match(checkStory(w).join(), new RegExp(key));
  }
  const w = fixture(); w.STORY.beats[1].shot = 1; w.STORY.beats[0].necessity = '';
  assert.match(checkStory(w).join(), /unique narrated shot/);
  assert.match(checkStory(w).join(), /necessity/);
  w.STORY.beats.pop(); assert.match(checkStory(w).join(), /one row/);
});
test('rejects fabricated evidence, invalid indices and an ending before payoff', () => {
  const w = fixture(); w.STORY.payoff.quote = 'invented';
  assert.match(checkStory(w).join(), /not in the referenced narration/);
  w.STORY.payoff = { ...ref(3), group: 0 };
  assert.match(checkStory(w).join(), /1-based/);
  w.STORY.payoff = ref(3); w.STORY.ending = ref(2);
  assert.match(checkStory(w).join(), /cannot precede/);
});
test('the payoff lands in the opening group only when the cover states the result', () => {
  // A short-form cover may state the result, so the reveal can sit in the first spoken group
  // and payoff and opening are then the same reference. The licence is the cover's own
  // hookType/hookForm, the same pair the approval page's promise ledger reads — an ordinary
  // cover that pays itself is still refused.
  const w = fixture(); w.STORY.payoff = ref(1); w.STORY.review.hash = storyHash(w);
  assert.match(checkStory(w).join(' '), /STORY\.payoff must follow the opening/);
  w.SCENES[0].hookType = 'spoiler'; w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);
  delete w.SCENES[0].hookType; w.SCENES[0].hookForm = 'payoff'; w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);
  // Playing it ahead of the opening still trips the opening check and the ordering check.
  w.STORY.opening = ref(2); w.STORY.review.hash = storyHash(w);
  const errors = checkStory(w).join(' ');
  assert.match(errors, /first spoken group/);
  assert.match(errors, /STORY\.payoff cannot precede the opening/);
});
test('an optional ask must follow the payoff with its own reason', () => {
  const w = fixture(); w.STORY.cta = 'question'; w.STORY.ask = ref(2);
  assert.match(checkStory(w).join(), /must follow the paid promise/);
  assert.match(checkStory(w).join(), /ctaReason/);
  w.STORY.ask = ref(4); w.STORY.ctaReason = 'Invite a related observation';
  w.STORY.review.hash = storyHash(w); assert.deepEqual(checkStory(w), []);
});
test('review requires all four evidenced judgments; score cannot waive unresolved failures', () => {
  for (const key of ['meaning', 'progression', 'payoff', 'grounding']) {
    const w = fixture(); delete w.STORY.review[key];
    assert.match(checkStory(w).join(), new RegExp(key));
  }
  const w = fixture(); w.STORY.review.score = 100; w.STORY.review.unresolved = ['No supported conclusion'];
  assert.match(checkStory(w).join(), /empty unresolved/);
  w.STORY.review.unresolved = []; w.STORY.review.verdict = 'fail';
  assert.match(checkStory(w).join(), /must pass/);
});
test('narration, subtitles, order, screen copy and thesis invalidate the review; camera does not', () => {
  for (const mutate of [w => w.SCENES[1].narration[0].tts += ' changed',
    w => w.SCENES[1].narration[0].sub += ' changed', w => w.SCENES.reverse(),
    w => w.SCENES[0].title = 'Different promise', w => w.STORY.thesis += ' changed',
    w => w.COMPREHENSION.answer += ' changed']) {
    const w = fixture(); mutate(w); assert.match(checkStory(w).join(), /stale/);
  }
  const w = fixture(); w.SCENES[0].visual = { action: 'camera move' };
  assert.deepEqual(checkStory(w), []);
});
test('malformed fields fail without throwing', () => {
  for (const value of [null, [], 4, 'invalid']) {
    const w = fixture(); w.STORY.review = value;
    assert.ok(checkStory(w).length);
    w.STORY = value; assert.ok(checkStory(w).length);
  }
  const w = fixture(); w.STORY.beats = [null]; assert.ok(checkStory(w).length);
});
test('opening and ending identify actual boundary groups, not an interior sentence', () => {
  const w = fixture();
  w.SCENES[0].narration.unshift({tts: 'An unrelated preamble'}); w.STORY.opening.group = 2;
  assert.match(checkStory(w).join(), /first spoken group/);
  w.SCENES[3].narration.push({tts: 'Another last line'});
  assert.match(checkStory(w).join(), /last spoken group/);
});
test('mixed live speech is reviewed and hashed without adding TTS narration', () => {
  const w = fixture(); w.SCENES[2].narration = [];
  w.SCENES[2].visual = { source: 'recording', clip: 'footage/demo.mp4' };
  w.STORY.transcripts = [{shot: 3, source: 'footage/demo.mp4', groups: [{text: ref(3).quote, start: 0, end: 2}]}];
  w.STORY.review.hash = storyHash(w); assert.deepEqual(checkStory(w), []);
  assert.deepEqual(w.SCENES[2].narration, []);
  w.STORY.transcripts[0].groups[0].text += ' Changed.';
  assert.match(checkStory(w).join(), /stale/);
  w.STORY.transcripts[0].groups[0].start = -1;
  assert.match(checkStory(w).join(), /ordered timed speech/);
  w.STORY.transcripts[0].source = 'wrong.mp4';
  assert.match(checkStory(w).join(), /matching clip/);
});
test('recorded insert speech uses playback order, not the broll array position', () => {
  const w = fixture();
  w.SCENES.push({type: 'broll', after: 0, narration: [], visual: {source: 'recording', clip: 'footage/insert.mp4'}});
  w.STORY.transcripts = [{shot: 5, source: 'footage/insert.mp4', groups: [{text: 'A real observation.', start: 0, end: 1}]}];
  w.STORY.beats.push({shot: 5, change: 'Observation', necessity: 'Shows the initial condition'});
  w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);
  assert.deepEqual(storySpeech(w).map(x => x.shot), [1, 5, 2, 3, 4]);
});
test('CLI gates block missing plans in draft and missing review in full production', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'story-contract-'));
  try {
    const file = path.join(dir, 'scenes.js');
    const write = w => writeFileSync(file, Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const run = (script, ...args) => spawnSync(process.execPath, [path.join(root, script), dir, ...args], { encoding: 'utf8' });
    const w = fixture(); write(w);
    assert.equal(run('check-story.js').status, 0);
    assert.equal(run('check-story.js', '--hash').stdout.trim(), storyHash(w));
    assert.match(run('check-story.js', '--text').stdout, /^1\. Why is the box moving\?/);
    assert.deepEqual(JSON.parse(run('check-story.js', '--map').stdout).map(x => x.shot), [1, 2, 3, 4]);
    delete w.STORY.review; write(w);
    assert.equal(run('check-story.js', '--draft').status, 0);
    assert.equal(run('check-story.js').status, 1);
    assert.match(run('check-scenes.js', '--json').stdout, /review is required/);
    delete w.STORY; write(w);
    const result = run('check-scenes.js', '--draft', '--json');
    assert.equal(result.status, 1); assert.match(result.stdout, /requires version story-v1/);
    writeFileSync(file, 'invalid syntax'); assert.equal(run('check-story.js').status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The forwardable close is `shot.share` in scenes.js, not a STORY reference — no share trigger
// is routed through ref(), so this guard stays as strict as it reads.
test('a quote too short to identify the line is refused', () => {
  const w = fixture();
  w.STORY.opening = { shot: 1, group: 1, quote: '?' };
  assert.match(checkStory(w).join(' '), /STORY\.opening quote is too short/);
  // The measure is the line the quote was found in, not the shorter of tts/sub: a five-word
  // subtitle must not vouch for a long spoken sentence.
  const long = 'Why is the box moving across the table all by itself right now?';
  w.SCENES[0].narration = [{ tts: long, sub: 'the box' }];
  w.STORY.opening = { shot: 1, group: 1, quote: 'the box' };
  assert.match(checkStory(w).join(' '), /STORY\.opening quote is too short/);
  w.STORY.opening = { shot: 1, group: 1, quote: 'Why is the box moving across' };
  assert.ok(!checkStory(w).some(e => /STORY\.opening quote/.test(e)));
});

test('rewriting slide copy invalidates the review hash', () => {
  const w = fixture();
  const before = storyHash(w);
  w.SCENES[1].visual = { slide: { labels: ['34 closures'] } };
  assert.notEqual(storyHash(w), before);
  const withLabels = storyHash(w);
  w.SCENES[1].visual.slide.subject = { kind: 'data', changes: [] };
  assert.notEqual(storyHash(w), withLabels);
});

test('imported original speech uses trimmed-file times and binds the story review to imported bytes',()=>{
 const w=fixture(),s=w.SCENES[0];s.duration=5;s.narration=[];
 s.visual={reuse:{clip:'clips/old-hook.mp4',sha256:'a'.repeat(64),sourceEpisode:'archived',sourceRange:{start:10,end:15}}};
 w.STORY.transcripts=[{shot:1,source:s.visual.reuse.clip,groups:[{start:0,end:4,text:ref(1).quote}]}];
 w.STORY.review.hash=storyHash(w);assert.deepEqual(checkStory(w),[]);
 s.visual.reuse.sha256='b'.repeat(64);assert.match(checkStory(w).join(),/stale|hash/);
 w.STORY.review.hash=storyHash(w);w.STORY.transcripts[0].groups[0].end=6;
 assert.match(checkStory(w).join(),/ordered timed speech/);
});

// person-short.md — one person, one turn, a cut per sentence, an opening inside the event.
test('a person short opens without the name or a year, one sentence a shot, closing after the turn', () => {
  const w = fixture(); w.STORY.person = { name: 'Kim', aliases: ['Mr. Kim'] };
  w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);
  const person = (mutate) => { const x = fixture(); x.STORY.person = { name: 'Kim', aliases: ['Mr. Kim'] }; mutate(x); x.STORY.review.hash = storyHash(x); return checkStory(x).join(' '); };
  assert.match(person(x => { x.SCENES[0].narration[0].tts = 'Mr. Kim asks why the box moves.'; x.STORY.opening.quote = 'Mr. Kim asks why'; }), /names the person/);
  assert.match(person(x => { x.SCENES[0].narration[0].sub = '1592년 the box moved.'; x.STORY.opening.quote = 'Why is the box moving?'; }), /carries a year/);
  assert.match(person(x => { x.SCENES[0].narration[0].tts = 'In the 16세기 a box moved.'; x.STORY.opening.quote = 'Why is the box moving?'; }), /carries a year/);
  assert.match(person(x => { x.SCENES[0].hookType = 'spoiler'; }), /first cut is a scene/);
  assert.match(person(x => { x.STORY.payoff = ref(4); }), /cannot share a group/);
  assert.match(person(x => { x.SCENES[1].narration.push({ tts: 'A second sentence.', sub: 'A second sentence.' }); }), /shot 2 speaks 2 sentences/);
  assert.match(person(x => { x.STORY.person = { name: '' }; }), /requires a name/);
  assert.match(person(x => { x.STORY.person = { name: 'Kim', aliases: 'Mr. Kim' }; }), /requires a name/);
  // A number that is not a date passes — "40개" is a count and "40년 동안" a span, not a year.
  assert.equal(person(x => { x.SCENES[0].narration[0].tts = '40개 boxes are moving.'; x.STORY.opening.quote = '40개 boxes are moving'; }), '');
  assert.equal(person(x => { x.SCENES[0].narration[0].tts = '40년 동안 the box moved.'; x.STORY.opening.quote = '40년 동안 the box'; }), '');
  // A one-character alias would match half the language; two sentences in one group is one shot too many.
  assert.match(person(x => { x.STORY.person = { name: 'Kim', aliases: ['이'] }; }), /at least two characters/);
  assert.match(person(x => { x.SCENES[1].narration[0].tts = 'The table shakes. It shakes again.'; }), /packs two sentences/);
  assert.equal(person(x => { x.SCENES[1].narration[0].tts = 'The table shakes 3.5 times.'; }), '');
  // A number-led cover is the result in a costume; a span or an age is scene texture, not a date.
  assert.match(person(x => { x.SCENES[0].hookForm = 'number'; }), /hookForm:"number"/);
  const opens = (line) => (x) => { x.SCENES[0].narration[0] = { tts: line, sub: line }; x.STORY.opening.quote = line; };
  // Spans: a marker, or a particle and a finite past span verb — three digits only.
  for (const span of ['성벽이 300년째 그 자리에 서 있어요.', '500년 동안 아무도 열지 않은 문이에요.', '100년 넘게 버틴 성벽이 있어요.',
                      '그 뒤로 500년이 흘렀어요.', '족히 500년은 흘렀어요.', '지은 지 100년이 넘었어요.', '300년만 버텼어요, 이 성벽은.',
                      '500년가량 잠겨 있던 문이에요.', '300년 남짓 버틴 성벽이에요.'])
    assert.equal(person(opens(span)), '', span);
  // Years: four digits always; three digits with 되다, 지나다, or an attributive verb before a noun.
  for (const year of ['1592년이 지나 봄이 왔어요.', '1592년 지난 뒤였어요.', '1592년 된 거예요.', '드디어 1592년이 됐어요.',
                      '1592년 넘은 성벽이었어요.', '1592년이 흘렀어요.', '1000년 동안 닫힌 문이에요.',
                      '문이 닫힌 지 100년이 지났어요.', '100년 묵은 성벽 앞이에요.', '918년 넘은 탑이었어요.', '300년을 버틴 성벽이에요.'])
    assert.match(person(opens(year)), /carries a year/, year);
  assert.match(person(opens('1592년 옥포 앞바다에 배가 떠 있어요.')), /carries a year/);
  assert.match(person(opens('1950. 6. 25. 새벽에 배가 떠 있어요.')), /carries a year/);
  assert.match(person(opens('1950-06-25 새벽에 배가 떠 있어요.')), /carries a year/);
  assert.equal(person(opens('1200.5킬로를 걸어온 남자예요.')), '');
  assert.match(person(opens('16세기 어느 항구에 배가 떠 있어요.')), /carries a year/);
  // A particle alone does not make a span — the verb does.
  for (const year of ['1592년이 밝았어요.', '드디어 1592년이 시작됐어요.', '역사는 1592년을 기억해요.', '그 해 1592년을 잊지 못했어요.',
                      '그렇게 1592년이 된 거예요.', '새해가 밝아 1592년이 된 순간이었어요.'])
    assert.match(person(opens(year)), /carries a year/, year);
  // An ellipsis pause, an embedded question and a quoted question with its attribution are one
  // sentence; a ? closes a sentence only after a polite finite ending (요·죠).
  const says = (line) => (x) => { x.SCENES[1].narration[0] = { tts: line, sub: line }; };
  for (const one of ['설마… 진짜일까 싶었어요.', '설마... 진짜일까 싶어서 다시 봤어요.', '1950. 6. 25. 새벽에 배가 떠 있어요.', 'B.C. 500년 무렵의 성벽이에요.', '대체 무슨 일이야? 하고 그가 중얼거렸어요.', '그게 사실일까? 궁금했어요.',
                     '그가 살아있을까? 싶었어요.', '설마 진짜일까? 싶어서 다시 봤어요.', '불이야! 하고 그가 소리쳤어요.',
                     '대체 무슨 일일까요? 하고 그가 중얼거렸어요.', '그게 사실일까요? 궁금했어요.', '만수는 왜요? 하고 되물었어요.',
                     '배가 진짜 왔을까요? 하고 다들 물었어요.', '그는 "괜찮아요?" 하고 물었어요.', '괜찮아? 물었어요.', '정말요? 되물었죠.', '불이야! 소리 질렀어요.'])
    assert.equal(person(says(one)), '', one);
  for (const two of ['무슨 일이었을까요? 아무도 몰랐어요.', '정말이죠? 아무도 안 믿었어요.', '왜 그랬을까요?! 아무도 몰라요.',
                     '무슨 일이야? 아무도 몰랐어요.', '정말 갈 거니? 걱정했어요.', '아까 왜 그랬어? 나중에 물었죠.'])
    assert.match(person(says(two)), /packs two sentences/, two);
});
test('the person-short fixture passes the draft gate and fails once the name moves into the opening', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'person-short-'));
  try {
    const src = path.join(root, 'person-short-fixture.js');
    const run = (file, ...args) => spawnSync(process.execPath, [path.join(root, 'check-story.js'), file, ...args], { encoding: 'utf8' });
    assert.equal(run(src, '--draft').status, 0, run(src, '--draft').stdout);
    assert.equal(run(src, '--text').stdout.trim().split('\n').length, 9);
    const broken = path.join(dir, 'scenes.js');
    writeFileSync(broken, readFileSync(src, 'utf8').replace(/한 남자가 성냥/g, '박만수가 성냥'));
    const out = run(broken, '--draft');
    assert.equal(out.status, 1); assert.match(out.stdout, /names the person/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the thesis is a present-tense message heard after the payoff, not the payoff line, a figure, a moral or the name', () => {
  // scenario-stage §The message: the M# sentence in the narration's words — it stays true with
  // the names gone (present tense, no figure, no command), the viewer hears it at or after the
  // payoff, and it is not the reversal line said again. The person short adds the name test.
  const w = fixture();
  w.STORY.thesis = 'The fan moved the table.'; w.SCENES[3].narration[0] = { tts: 'The fan moved the table.', sub: 'The fan moved the table.' };
  w.STORY.ending = { shot: 4, group: 1, quote: 'The fan moved the table.' };
  w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);   // English has no Korean tense ending to read; heard after the payoff, and not the payoff line
  const ko = (thesis, said = thesis) => {
    const k = fixture(); k.STORY.thesis = thesis;
    k.SCENES[3].narration[0] = { tts: said, sub: said }; k.STORY.ending = { shot: 4, group: 1, quote: said };
    k.STORY.review.hash = storyHash(k); return checkStory(k).join(' ');
  };
  assert.equal(ko('작은 부탁이 큰 이유는 그 뒤에 법이 서 있어서예요'), '');
  assert.match(ko('임금은 그 법에 예외를 냈어요'), /past tense/);
  assert.match(ko('쌀 60섬의 값은 때가 정해요'), /carries a figure/);
  assert.match(ko('규칙을 짚어 보세요'), /commands/);
  assert.match(ko('작은 부탁이 큰 이유는 법이 서 있어서예요', '다른 문장이 나가요'), /heard by no spoken group/);
  const early = fixture(); early.STORY.thesis = 'Why is the box moving?'; early.STORY.review.hash = storyHash(early);
  assert.match(checkStory(early).join(' '), /heard by no spoken group at or after the payoff/);
  const same = fixture(); same.STORY.thesis = 'A fan moves the table.'; same.STORY.review.hash = storyHash(same);
  assert.match(checkStory(same).join(' '), /restates the payoff line/);
  const stated = fixture(); stated.STORY.themeStated = ref(2); stated.STORY.review.hash = storyHash(stated);
  assert.deepEqual(checkStory(stated), []);
  stated.STORY.themeStated = ref(4); stated.STORY.review.hash = storyHash(stated);
  assert.match(checkStory(stated).join(' '), /themeStated must be spoken before the payoff/);

});
test('a person short refuses a thesis that names the person', () => {
  const file = path.join(root, 'person-short-fixture.js');
  const src = readFileSync(file, 'utf8').replace('thesis: "배 한 척을 돌리는 불빛은 집 한 채 값이에요"', 'thesis: "만수의 불빛은 집 한 채 값이에요"')
    .replace('배 한 척을 돌리는 불빛은 집 한 채 값이에요."', '만수의 불빛은 집 한 채 값이에요."');
  const dir = mkdtempSync(path.join(tmpdir(), 'person-'));
  writeFileSync(path.join(dir, 'scenes.js'), src);
  const r = spawnSync('node', [path.join(root, 'check-story.js'), dir, '--draft'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /thesis names the person/);
});
