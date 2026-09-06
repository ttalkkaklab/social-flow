/**
 * Gemini Omni schema contract — the constraints measured against the live API on 2026-09-06
 * (see the header of omni-client.ts), held here so a later edit cannot quietly widen them.
 * No API is called.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OMNI_MODEL,
  VALID_OMNI_RESOLUTIONS,
  omniEditSchema,
  omniExtendSchema,
  omniImg2VideoSchema,
  omniText2VideoSchema,
} from '../dist/omni-client.js';
import { TOOLS } from '../dist/tools.js';

const toolByName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

test('length is any whole 3-10 seconds, not Veo\'s 4/6/8 grid', () => {
  for (const seconds of [3, 5, 7, 10]) {
    assert.equal(omniText2VideoSchema.parse({ prompt: 'a', durationSeconds: seconds }).durationSeconds, seconds);
  }
  // 11s is refused by the API itself ("exceeds the maximum allowed 10s") — refuse it here first.
  for (const seconds of [2, 11, 8.5]) {
    assert.equal(omniText2VideoSchema.safeParse({ prompt: 'a', durationSeconds: seconds }).success, false, `${seconds}s should not parse`);
  }
  assert.equal(omniText2VideoSchema.parse({ prompt: 'a' }).durationSeconds, 8);
});

test('360p is the draft tier Veo does not have', () => {
  assert.deepEqual([...VALID_OMNI_RESOLUTIONS], ['360p', '720p', '1080p', '4k']);
  assert.equal(omniText2VideoSchema.parse({ prompt: 'a' }).resolution, '720p');
  assert.equal(omniText2VideoSchema.safeParse({ prompt: 'a', resolution: '480p' }).success, false);
});

test('img2video takes one frame, or two to interpolate between', () => {
  const one = omniImg2VideoSchema.parse({ prompt: 'a', sourceImagePath: '/tmp/a.png' });
  assert.equal(one.lastImagePath, undefined);
  const two = omniImg2VideoSchema.parse({ prompt: 'a', sourceImagePath: '/tmp/a.png', lastImagePath: '/tmp/b.png' });
  assert.equal(two.lastImagePath, '/tmp/b.png');
  assert.equal(omniImg2VideoSchema.safeParse({ prompt: 'a' }).success, false);
});

test('extend and edit take exactly one source', () => {
  // The two paths are not interchangeable at the API: an interaction id forbids the task field,
  // a local file requires it. Accepting both at once would send a request that cannot be built.
  for (const schema of [omniExtendSchema, omniEditSchema]) {
    assert.equal(schema.safeParse({ prompt: 'a', previousInteractionId: 'v1_x' }).success, true);
    assert.equal(schema.safeParse({ prompt: 'a', sourceVideoPath: '/tmp/a.mp4' }).success, true);
    assert.equal(schema.safeParse({ prompt: 'a' }).success, false, 'no source should not parse');
    assert.equal(
      schema.safeParse({ prompt: 'a', previousInteractionId: 'v1_x', sourceVideoPath: '/tmp/a.mp4' }).success,
      false,
      'two sources should not parse',
    );
  }
});

test('edit carries no duration — the input clip sets the length', () => {
  const parsed = omniEditSchema.parse({ prompt: 'a', previousInteractionId: 'v1_x' });
  assert.equal('durationSeconds' in parsed, false);
  assert.equal(omniExtendSchema.parse({ prompt: 'a', previousInteractionId: 'v1_x' }).durationSeconds, 8);
});

test('the tool schemas match the client', () => {
  for (const name of ['omni_text2video', 'omni_img2video', 'omni_extend', 'omni_edit']) {
    const tool = toolByName[name];
    assert.ok(tool, `${name} is not registered`);
    assert.deepEqual(tool.inputSchema.properties.resolution.enum, [...VALID_OMNI_RESOLUTIONS]);
  }
  // Ratio is settable only where the API accepts it — extend and edit inherit the input's.
  assert.ok(toolByName.omni_text2video.inputSchema.properties.aspectRatio);
  assert.equal(toolByName.omni_extend.inputSchema.properties.aspectRatio, undefined);
  assert.equal(toolByName.omni_edit.inputSchema.properties.aspectRatio, undefined);
  assert.equal(toolByName.omni_edit.inputSchema.properties.durationSeconds, undefined);
  assert.equal(OMNI_MODEL, 'gemini-omni-1.1-flash');
});
