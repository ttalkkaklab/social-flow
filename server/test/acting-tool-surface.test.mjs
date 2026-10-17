import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOOLS } from '../dist/tools.js';
import { speechManageSchema } from '../dist/speech.js';

test('MCP clients can discover scene acting planning and send the runtime contract', () => {
  const surface = TOOLS.find(tool => tool.name === 'speech_manage').inputSchema;
  assert.ok(surface.properties.action.enum.includes('plan_audio'));
  assert.equal(speechManageSchema.safeParse({ path: '/tmp/board', action: 'plan_audio', lineId: 'd-question' }).success, true);
  const acting = {
    direction: 'quiet question', tags: ['sigh'], context: 'A celebration was mistaken for a job offer.', intent: 'Clarify the misunderstanding.',
    emotion: 'Confused', vocal: 'Quiet question, no sales smile.',
    visual: 'Lower hands and look at the applicant.', leadInSeconds: 0.25, tailOutSeconds: 0.4,
  };
  const exposed = surface.properties.patch.properties.acting;
  assert.deepEqual(Object.keys(exposed.properties).sort(), Object.keys(acting).sort());
  assert.equal(exposed.additionalProperties, false);
  assert.ok(exposed.type.includes('null'));
  for (const value of [acting, null]) {
    assert.equal(speechManageSchema.safeParse({ path: '/tmp/board', action: 'update', lineId: 'd-question', patch: { acting: value } }).success, true);
  }
});

test('MCP acting bounds agree with runtime rejection of invalid direction and timing', () => {
  const properties = TOOLS.find(tool => tool.name === 'speech_manage').inputSchema.properties.patch.properties.acting.properties;
  for (const field of ['context', 'intent', 'emotion', 'vocal', 'visual']) {
    assert.equal(properties[field].minLength, 1);
    assert.equal(properties[field].maxLength, 1000);
    for (const value of ['', 'x'.repeat(1001)]) {
      assert.equal(speechManageSchema.safeParse({ path: '/tmp/board', action: 'update', patch: { acting: { [field]: value } } }).success, false);
    }
  }
  for (const field of ['leadInSeconds', 'tailOutSeconds']) {
    assert.equal(properties[field].minimum, 0);
    assert.equal(properties[field].maximum, 5);
    for (const value of [-0.01, 5.01, Infinity, NaN]) {
      assert.equal(speechManageSchema.safeParse({ path: '/tmp/board', action: 'update', patch: { acting: { [field]: value } } }).success, false);
    }
  }
});

test('host acting evidence is discoverable with explicit request context', () => {
  const review = TOOLS.find(tool => tool.name === 'acting_review');
  assert.ok(review);
  assert.deepEqual(review.inputSchema.required, ['mediaPath', 'direction', 'requestedBy', 'reason']);
  assert.equal(review.inputSchema.additionalProperties, false);
  assert.equal(review.inputSchema.properties.mode.default, 'audiovisual');
  assert.match(review.description, /host LLM/);
  assert.match(review.description, /No external evaluation call/);
  assert.match(review.description, /Unsupported modalities remain unverified/);
});


test('publishing surfaces select clean video and leave YouTube caption upload optional',()=>{
 for(const name of ['instagram_publish','threads_publish']){
  const description=TOOLS.find(tool=>tool.name===name).inputSchema.properties.videoUrl.description;
  assert.match(description,/clean subtitle-free master/);
  assert.doesNotMatch(description,/burning them into the picture is the only way|Provide the burned-in/);
 }
 const youtube=TOOLS.find(tool=>tool.name==='youtube_publish').inputSchema;
 assert.match(youtube.properties.captionFilePath.description,/only when the user requests YouTube subtitles/);
 assert.equal(youtube.required.includes('captionFilePath'),false);
 assert.match(TOOLS.find(tool=>tool.name==='astra_audio2video').inputSchema.properties.prompt.description,/without quoting the spoken dialogue/);
});
