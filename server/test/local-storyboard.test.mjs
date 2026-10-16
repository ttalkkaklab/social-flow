import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOOLS } from '../dist/tools.js';
import { ROUTES } from '../dist/handlers.js';
import { capabilityStatus } from '../dist/capability-status.js';

test('local storyboard tools remain available without remote integration', () => {
  for (const name of ['storyboard_read', 'storyboard_apply', 'storyboard_check', 'scenario_check', 'location_manage', 'speech_manage']) {
    assert.ok(TOOLS.some(tool => tool.name === name), name);
    assert.equal(typeof ROUTES[name], 'function', name);
  }
  assert.equal(TOOLS.some(tool => tool.name.startsWith('portal_')), false);
  assert.equal(Object.keys(ROUTES).some(name => name.startsWith('portal_')), false);
  assert.equal(TOOLS.some(tool => tool.name === 'storyboard_backups'), false);
  assert.equal('portal' in capabilityStatus(), false);
});

test('generation tools no longer expose upload targets', () => {
  for (const name of ['seedance_text2video', 'seedance_img2video', 'seedance_reference', 'tts_generate_checked', 'blender_render_previz']) {
    const tool = TOOLS.find(tool => tool.name === name);
    assert.ok(tool, name);
    assert.equal('portal' in tool.inputSchema.properties, false, name);
  }
});
