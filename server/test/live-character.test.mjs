import { PassThrough } from 'node:stream';
import { listenChatInput } from '../dist/live-character.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatQueue, mouthLevel, liveConfig, RATE, synthesize } from '../dist/live-character.js';
import { pcmToWav } from '../dist/media-utils.js';

test('chat deduplicates per platform, caps pending events and refuses malformed messages', () => {
  const q = new ChatQueue(),
    first = { source: 'youtube', id: '42', text: 'shade?' };
  assert.ok(q.add(first));
  assert.equal(q.add(first), false);
  assert.ok(q.add({ ...first, source: 'tiktok' }));
  assert.equal(q.add({ ...first, source: 'bogus' }), false);
  assert.equal(q.add({ ...first, id: 'huge', text: 'x'.repeat(501) }), false);
  for (let i = 0; i < 6; i++) assert.ok(q.add({ ...first, id: String(i) }));
  assert.equal(q.add({ ...first, id: 'overflow' }), false);
  assert.deepEqual(q.next(), first);
  assert.equal(q.next().source, 'tiktok');
});
test('chat resumes the paused credential input and detaches when the session ends', async () => {
  const input = new PassThrough();
  input.pause();
  const queue = new ChatQueue();
  const stop = listenChatInput(input, source => source === 'tiktok', queue);
  const write = (source, id) => input.write(JSON.stringify({ source, id, text: 'hello' }) + '\n');
  write('youtube', 'wrong-room');
  write('tiktok', 'viewer-1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queue.next()?.id, 'viewer-1');
  stop();
  write('tiktok', 'after-session');
  assert.equal(input.isPaused(), true);
  assert.equal(queue.pending, 0);
  input.destroy();
});

test('audio frame loudness drives multiple distinct mouth positions', () => {
  const levels = [0, 800, 2300, 11000].map((v) => {
    const b = Buffer.alloc(2000);
    for (let i = 0; i < b.length; i += 2) b.writeInt16LE(v, i);
    return mouthLevel(b);
  });
  assert.deepEqual(levels, [0, 1, 2, 3]);
});

test('speech accepts a complete 30-second utterance and rejects one extra sample before playback', async (t) => {
  const url = process.env.ASTRA_GENAI_SPEECH_URL;
  const key = process.env.ASTRA_GENAI_SPEECH_API_KEY;
  t.after(() => {
    if (url === undefined) delete process.env.ASTRA_GENAI_SPEECH_URL;
    else process.env.ASTRA_GENAI_SPEECH_URL = url;
    if (key === undefined) delete process.env.ASTRA_GENAI_SPEECH_API_KEY;
    else process.env.ASTRA_GENAI_SPEECH_API_KEY = key;
  });
  process.env.ASTRA_GENAI_SPEECH_URL = 'http://localhost.invalid';
  process.env.ASTRA_GENAI_SPEECH_API_KEY = 'test-only';
  let samples = RATE * 30;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(pcmToWav(Buffer.alloc(samples * 2, 64), RATE, 1), {
        headers: { 'content-type': 'audio/wav' }
      })
  );
  const speaker = { model: 'test', voice: 'test' };
  assert.equal((await synthesize(speaker, 'boundary')).length, samples * 2);
  samples++;
  await assert.rejects(synthesize(speaker, 'over boundary'), /30-second/);
});
test('live config rejects offsets outside the canvas and path traversal in channel slug', () => {
  const cfg = {
    project: '/tmp',
    channel: 'test',
    character: 'actor',
    mouth: { x: 0.5, y: 0.45, width: 0.08, height: 0.04 },
    opening: 'Hello',
    chatModel: 'local'
  };
  assert.ok(liveConfig.safeParse(cfg).success);
  assert.ok(
    liveConfig.safeParse({ ...cfg, speechLanguage: 'ko', youtubeCredentialChannel: 'destination' }).success
  );
  assert.equal(liveConfig.safeParse({ ...cfg, youtubeCredentialChannel: '../other' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, speechLanguage: 'ko; override' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, channel: '../secrets' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, mouth: { ...cfg.mouth, x: 1.1 } }).success, false);
});

test('a prepared question matches NFC case and punctuation, free-form questions go to the model', async () => {
  const { preparedReply } = await import('../dist/live-character.js');
  const config = { reactions: [{ questions: ['Chào Mochi!'], answer: 'Chào bạn!' }] };
  assert.equal(preparedReply(config, 'chào Mochi'.normalize('NFD')), 'Chào bạn!');
  assert.equal(preparedReply(config, 'Chào Mochi! Áo bạn màu gì?'), undefined);
});

test('room topic opens in Korean with a comment invitation and audience-wide welcome clips', async () => {
  const {broadcastLines} = await import('../dist/live-character.js');
  const raw = {project:'/tmp',channel:'test',character:'host',chatModel:'local',topic:'잠들기 전에 읽는 책'};
  const cfg = liveConfig.parse(raw);
  assert.equal(cfg.maxConcurrentVideos,3);
  assert.equal(liveConfig.parse({...raw,maxConcurrentVideos:1}).maxConcurrentVideos,1);
  assert.equal(liveConfig.safeParse({...raw,maxConcurrentVideos:0}).success,false);
  const lines = await broadcastLines(cfg, {language:'ko-KR'});
  assert.ok(lines.opening.includes(raw.topic) && lines.opening.includes('댓글'));
  assert.ok(lines.standby.includes('안녕하세요. 지금 입장하신 분들 환영해요.'));
  assert.equal(new Set(lines.standby).size,2);
  const legacy = {...raw,topic:undefined,opening:'Welcome back.',standbyLines:['Welcome.','Please join us.']};
  assert.deepEqual(await broadcastLines(legacy,{language:'en'}),{opening:legacy.opening,standby:legacy.standbyLines});
});

test('a paraphrase searches a bounded shortlist, a miss is learnable and a private answer is single-use', async t => {
  const { LiveAnswers } = await import('../dist/live-answers.js');
  const { planViewerReply } = await import('../dist/live-character.js');
  const { config } = await import('../dist/config.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const project = mkdtempSync(join(tmpdir(), 'viewer-plan-'));
  const key = config.astraGenaiApiKey;
  t.after(() => { config.astraGenaiApiKey = key; rmSync(project, { recursive: true, force: true }); });
  config.astraGenaiApiKey = 'fixture';
  const library = new LiveAnswers(Array.from({ length: 25 }, (_, i) => ({
    questions: ['What is in package ' + i + '?'], answer: 'Package ' + i + ' contains tea.'
  })), project, ['tea']);
  const knowledge = { passages: [{file:'source',text:'Brew tea at 70 degrees.'}], search: () => [{file:'source',text:'Brew tea at 70 degrees.'}] };
  const inputs = [];
  const outputs = ['package, contents', '[USE 1]', 'temperature', '[SAVE] Brew at 70 degrees.', 'SUPPORTED',
    'delivery', '[ONCE] Please check your order confirmation.', 'UNKNOWN', 'package', '[USE 999]', 'Please check the label.', 'UNKNOWN', 'temperature', '[SAVE] Brew at 90 degrees.'];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    inputs.push(JSON.parse(JSON.parse(init.body).messages.at(-1).content));
    return Response.json({choices:[{message:{content:outputs.shift()}}]});
  });
  const plan = text => planViewerReply({ character:'host', channel:'demo', chatModel:'local', reactions:[] },
    { language:'en', persona:'tea host' }, library, { text, speaker:'viewer' }, {}, true, new AbortController().signal, knowledge);
  const hotkey = await planViewerReply({ reactions: [{questions:['Sound check?'],answer:'Audible.'}] },
    {}, library, {text:'SOUND CHECK!'}, {}, true, new AbortController().signal);
  assert.equal(hotkey.text, 'Audible.');
  assert.equal(inputs.length, 0);
  library.remember('Which package contains tea?', 'A different product is packaged loose.', join(project, 'old.mp4'));
  const hit = await plan('Which package contains tea?');
  assert.equal(hit.text, inputs[1].answers[0].answer);
  assert.equal(hit.matched, true);
  assert.equal(inputs[1].answers.length, 8);
  assert.equal(inputs[0].answers, undefined);
  const miss = await plan('How hot should the water be?');
  assert.equal(miss.learn, true);
  assert.equal(library.exact('How hot should the water be?'), undefined);
  assert.equal((await plan('When will my order arrive?')).learn, false);
  assert.equal((await plan('What does this packet say?')).learn, false);
  assert.deepEqual(inputs.at(-1).knowledge, knowledge.passages);
  const unsupported = await plan('Should it be 90 degrees?');
  assert.equal(unsupported.learn, false);
  assert.doesNotMatch(unsupported.text, /90/);
  assert.deepEqual(outputs, []);
});

test('FAQ drafting checks the same source grounds before a body can enter preflight', async t => {
  const { draftExpectedAnswers } = await import('../dist/live-character.js');
  const { config } = await import('../dist/config.js');
  const key = config.astraGenaiApiKey;
  t.after(() => { config.astraGenaiApiKey = key; });
  config.astraGenaiApiKey = 'fixture';
  const passages = [{ file:'tea.txt', text:'Brew tea at 70 degrees.' }];
  const replies = [JSON.stringify([
    { question:'How hot?', answer:'Brew at 900 degrees.' },
    { question:'What colour?', answer:'This tea is blue.' },
    { question:'What temperature?', answer:'Brew at 70 degrees.' }
  ]), 'UNKNOWN', 'SUPPORTED'];
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ choices:[{message:{content:replies.shift()}}] }));
  const result = await draftExpectedAnswers({topic:'tea',chatModel:'local'}, {language:'en',persona:'host'},
    {passages,sample:()=>passages}, 3, [], new AbortController().signal);
  assert.deepEqual(result, [{questions:['What temperature?'],answer:'Brew at 70 degrees.'}]);
  assert.deepEqual(replies, []);
});

test('a Vietnamese show uses its selected language for the opening, FAQ, chat and native video with Korean sources', async t => {
  const { broadcastLines, draftExpectedAnswers, planViewerReply } = await import('../dist/live-character.js');
  const { spokenVideoRequest } = await import('../dist/live-native.js');
  const { config } = await import('../dist/config.js');
  const key = config.astraGenaiApiKey;
  t.after(() => { config.astraGenaiApiKey = key; });
  config.astraGenaiApiKey = 'fixture';
  const cfg = liveConfig.parse({ project:'/fixture', channel:'tea', character:'host', chatModel:'local',
    topic:'Trà hoa', speechLanguage:'vi', knowledgeLanguage:'ko', standbyLines:['Xin chào.', 'Mời bạn ngồi.'] });
  const actor = {language:cfg.speechLanguage, persona:'Tea host'};
  const source = {file:'tea.txt', text:'꽃차는 따뜻하게 마셔요.'};
  const knowledge = {passages:[source], sample:()=>[source], search:()=>[source]};
  const line = 'Uống trà khi còn ấm.';
  const replies = ['Hôm nay mình nói về trà hoa.', JSON.stringify([{question:'Uống trà thế nào?', answer:line}]),
    'SUPPORTED', 'trà, 꽃차', '[SAVE] ' + line, 'SUPPORTED'];
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    messages.push(JSON.parse(init.body).messages);
    return Response.json({choices:[{message:{content:replies.shift()}}]});
  });
  const signal = new AbortController().signal;
  const opening = await broadcastLines(cfg, actor, signal);
  const rows = await draftExpectedAnswers(cfg, actor, knowledge, 1, [], signal);
  const reply = await planViewerReply(cfg, actor, {empty:true,search:()=>[]},
    {text:'Uống lúc nào?'}, {}, false, signal, knowledge);
  assert.match(opening.opening, /trà hoa/);
  assert.equal(rows[0].answer, line);
  assert.equal(reply.text, line);
  assert.ok(messages.every(([system]) => /\bvi\b/.test(system.content)));
  assert.equal(JSON.parse(messages[3][1].content).sourceLanguage, 'ko');
  assert.match(spokenVideoRequest(actor, 'Locked shot.', reply.text).prompt, /in Vietnamese/);
  assert.deepEqual(replies, []);
});
