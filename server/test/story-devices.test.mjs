import assert from 'node:assert/strict';
import test from 'node:test';
import { ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';

const situation = 'A manager claims the junior’s work before the promotion meeting.';
const call = async (name, args) => JSON.parse((await ROUTES[name](args)).content[0].text);

test('story intensity adapts its beats to the pressure, level and format', async () => {
  const quiet = await call('story_intensity_plan', { situation, pressure: 'power' });
  const elevated = await call('story_intensity_plan', {
    situation, pressure: 'power', level: 'heightened', format: 'long',
  });
  const mistaken = await call('story_intensity_plan', { situation, pressure: 'misreading' });
  assert.equal(quiet.situation, situation);
  assert.equal(quiet.level, 'restrained');
  assert.equal(quiet.format, 'short');
  assert.notEqual(quiet.beats.escalation, elevated.beats.escalation);
  assert.notEqual(quiet.pacing, elevated.pacing);
  assert.notEqual(quiet.audienceQuestion, mistaken.audienceQuestion);

  const tool = TOOLS.find(({ name }) => name === 'story_intensity_plan');
  const pressures = tool.inputSchema.properties.pressure.enum;
  const devices = await Promise.all(
    pressures.map((pressure) => call(tool.name, { situation, pressure })),
  );
  assert.equal(devices.length, 10);
  assert.equal(new Set(devices.map(({ nameKo }) => nameKo)).size, 10);
  assert.ok(devices.every(({ beats }) => beats.setup && beats.escalation && beats.consequence));
});

test('story catharsis offers all fifteen patterns, a goal filter or one explicit pattern', async () => {
  const tool = TOOLS.find(({ name }) => name === 'story_catharsis_plan');
  const all = await call(tool.name, { situation });
  assert.equal(all.candidates.length, 15);
  assert.deepEqual(
    all.candidates.map(({ id }) => id), tool.inputSchema.properties.pattern.enum,
  );

  const truth = await call(tool.name, { situation, goal: 'truth' });
  assert.deepEqual(
    truth.candidates.map(({ id }) => id),
    ['record-reveal', 'speaking-out', 'identity-reveal'],
  );
  const boundary = await call(tool.name, { situation, goal: 'truth', pattern: 'boundary' });
  assert.deepEqual(boundary.candidates.map(({ id }) => id), ['boundary']);
  assert.ok(boundary.candidates[0].payoff);
  await assert.rejects(ROUTES[tool.name]({ situation, pattern: 'invented' }), /pattern/);
});
