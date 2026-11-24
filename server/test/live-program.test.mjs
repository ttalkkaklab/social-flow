import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../dist/config.js';
import { LiveProgram, LiveRenderPool } from '../dist/live-program.js';
import { answer, ChatQueue, continueBroadcast } from '../dist/live-character.js';

test('plan during the opener, displace speculative host clips with chat, then continue the actual exchange', async (t) => {
  const discarded = [], requests = [];
  const program = new LiveProgram(item => discarded.push(item.text));
  const queue = new ChatQueue(event => program.hear(event));
  const item = (source, text) => ({ source, id: text, text, pcm: Buffer.alloc(2) });
  const question = { source: 'youtube', id: 'q1', speaker: 'alice', text: 'Why that book?' };
  const cfg = { character: 'host', channel: 'radio', broadcastConcept: 'Reading at night', chatModel: 'local', reactions: [] };
  const actor = { language: 'en', persona: 'A radio reader.' };
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(JSON.parse(request.messages.at(-1).content));
    return Response.json({choices: [{ message: { content: 'The pages are full of pencil notes.' } }]});
  });
  process.env.ASTRA_GENAI_URL = 'http://localhost.invalid';
  const key = config.astraGenaiApiKey;
  t.after(() => { config.astraGenaiApiKey = key; delete process.env.ASTRA_GENAI_URL; });
  config.astraGenaiApiKey = 'test-only';
  program.ready.push(item('opening', 'Welcome to the library.'), item('host', 'I brought a picture book.'));
  assert.equal(program.take(false), undefined);
  assert.equal(program.canPlanHost, false);
  assert.equal(program.take(true).source, 'opening');
  assert.equal(program.canPlanHost, true);
  const draft = await continueBroadcast(cfg, actor, program.context(), undefined);
  assert.deepEqual(requests[0].context.onAir, [{host: 'Welcome to the library.'}]);
  assert.deepEqual(requests[0].context.scheduledHost, ['I brought a picture book.']);
  program.ready.push(item('host', draft));
  assert.equal(program.take(true).text, 'I brought a picture book.');
  queue.add(question);
  const event = queue.next();
  const reply = await answer(cfg, actor, event.text, undefined, program.context(), event.speaker);
  assert.deepEqual(requests[1].question, {speaker:'alice', text:question.text});
  assert.deepEqual(requests[1].context.recentChat, [requests[1].question]);
  program.queueReply({...item('youtube', reply), question: requests[1].question});
  assert.deepEqual(discarded, [draft]);
  assert.equal(program.take(true).source, 'youtube');
  await continueBroadcast(cfg, actor, program.context(), undefined);
  assert.deepEqual(requests[2].context.onAir.at(-1), {host:reply, answering:requests[1].question});
  assert.deepEqual(requests[2].context.scheduledHost, []);
});

test('a quiet ten-minute show rotates welcomes and topic clips, and admits replies at the next boundary', () => {
  const released = [];
  const program = new LiveProgram(clip => released.push(clip.id));
  const utterance = (source, id) => ({ source, id, text:id, reusable:source === 'standby' || source === 'host' });
  program.addStandby(utterance('standby','welcome'));
  program.addStandby(utterance('standby','listen'));
  program.ready.push(utterance('opening','opening'), utterance('host','book'));
  assert.equal(program.take(false), undefined);
  const played = [];
  for (let seconds = 0; seconds < 600; seconds += 5) {
    if (seconds === 100) program.queueReply(utterance('youtube','answer'));
    if (seconds === 200) program.ready.push(utterance('host','fresh topic'));
    const clip = program.take(true);
    assert.ok(clip);
    assert.notEqual(clip.id, played.at(-1));
    played.push(clip.id);
    program.finish(clip);
  }
  assert.equal(played[20], 'answer');
  assert.equal(played[40], 'fresh topic');
  assert.deepEqual(released,['opening','answer']);
  assert.equal(played.filter(id => id === 'answer').length, 1);
  assert.equal(played.filter(id => id === 'opening').length, 1);
  assert.ok(played.filter(id => id === 'welcome').length > 1);
  assert.equal(program.take(true, false), undefined);
  program.ready.push(utterance('host','follow-up after answer'));
  const waiting = program.take(true, true, true);
  assert.equal(waiting.source, 'standby');
  program.finish(waiting);
  program.queueReply(utterance('youtube','new answer'), true);
  assert.equal(program.take(true, true, true).id, 'new answer');
  assert.equal(program.take(true).id, 'follow-up after answer');
});

test('the configured video slots stay occupied until settled and waiting replies get the next slot', async () => {
  for (const limit of [1,3,4]) {
    const pool = new LiveRenderPool(limit), started = [], gates = [];
    const schedule = (name, viewer = false) => pool.run(viewer, () => {
      started.push(name);
      return new Promise(resolve => gates.push(resolve));
    });
    const jobs = Array.from({length:limit}, (_,i) => schedule('in flight ' + i));
    jobs.push(schedule('future host'), schedule('viewer',true));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(started.length,limit);
    gates.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(started.at(-1),'viewer');
    gates.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(started.at(-1),'future host');
    gates.forEach(resolve => resolve());
    await Promise.all(jobs);
  }
});

test('dropping a failed viewer answer invalidates queued and in-flight host follow-ups', () => {
  const released = [], program = new LiveProgram(clip => released.push(clip.id));
  program.draftingReplies.set('youtube:q', {host:'The blue book.'});
  const version = program.version;
  program.draftingHosts.set('future', 'Another detail about that book.');
  program.ready.push({source:'host', id:'follow-up'}, {source:'youtube', id:'unrelated'});
  program.dropFailedReply('youtube:q');
  assert.notEqual(program.version, version);
  assert.deepEqual(released, ['follow-up']);
  assert.equal(program.draftingHosts.size, 0);
  assert.equal(program.draftingReplies.size, 0);
  assert.equal(program.take(true).id, 'unrelated');
  assert.equal(program.take(true), undefined);
});

test('first named reply airs the address and body together and repeats reuse only the body', async () => {
  const program = new LiveProgram(() => {});
  const clip = { source: 'youtube', id: 'q', text: 'Fifteen bags.', pcm: Buffer.alloc(2) };
  const names = [];
  const render = async name => { names.push(name); return { pcm: Buffer.alloc(2) }; };
  await program.offerReply(clip, '민지 님', render, assert.fail);
  await program.offerReply({ ...clip, id: 'other' }, '수빈 님', render, assert.fail);
  assert.equal(program.readyReplies, 2);
  assert.equal(program.context().scheduledReplies.length, 2);
  assert.deepEqual([program.take(true).text, program.take(true).text, program.take(true).text],
    ['민지 님', clip.text, clip.text]);
  assert.deepEqual(names, ['민지 님']);
  await program.offerReply({ ...clip, text: 'Another answer.' }, '민지 님', async () => { throw Error('render failed'); }, () => {});
  assert.equal(program.take(true).text, 'Another answer.');
});

test('standby shuffles complete FAQ bodies, admits new ones mid-cycle and gives chat the next boundary', async () => {
  const { FaqRotation } = await import('../dist/live-program.js');
  const rotation = new FaqRotation();
  for (const text of ['A', 'B', 'C']) rotation.add(text);
  const first = rotation.next();
  rotation.add('D');
  rotation.add(first);
  const cycle = [first, rotation.next(), rotation.next(), rotation.next()];
  assert.equal(new Set(cycle).size, 4);
  assert.notEqual(rotation.next(), cycle.at(-1));
  const programme = new LiveProgram(() => {});
  programme.faqStandby = { source: 'standby', text: 'A', id: 'faq', replay: true };
  programme.queueReply({ source: 'youtube', text: 'B', id: 'reply' });
  assert.equal(programme.take(true).id, 'reply');
  assert.equal(programme.take(true).id, 'faq');
});
