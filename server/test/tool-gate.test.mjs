import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isToolEnabled, resolveToolGate, toolOverrideVar } from '../dist/tool-gate.js';
import { TOOLS } from '../dist/tools.js';

test('every tool starts enabled and has a distinct override variable', () => {
  const variables = new Set();
  for (const { name } of TOOLS) {
    assert.equal(isToolEnabled(name, {}).enabled, true, name);
    const variable = toolOverrideVar(name);
    assert.match(variable, /^SOCIAL_FLOW_TOOL_[A-Z0-9_]+$/);
    assert.ok(!variables.has(variable), variable);
    variables.add(variable);
  }
});

test('environment lists accept exact names and trailing wildcards, with deny taking precedence', () => {
  const env = {
    SOCIAL_FLOW_TOOLS: 'SUNO_* veo_text2video, music_credits',
    SOCIAL_FLOW_DISABLE_TOOLS: 'suno_credits,veo_*',
  };
  assert.equal(isToolEnabled('suno_generate', env).enabled, true);
  assert.equal(isToolEnabled('suno_credits', env).enabled, false);
  assert.equal(isToolEnabled('veo_text2video', env).enabled, false);
  assert.equal(isToolEnabled('music_credits', env).enabled, true);
  assert.equal(isToolEnabled('music_generate_clip', env).enabled, false);

  for (const [pattern, enabled] of [['*', true], ['SUNO_GENERATE', true], ['suno*generate', false], [' , ', true]]) {
    assert.equal(isToolEnabled('suno_generate', { SOCIAL_FLOW_TOOLS: pattern }).enabled, enabled, pattern);
  }
});

test('file patterns match case-sensitively and support a trailing wildcard', () => {
  for (const [pattern, enabled] of [['seedance_*', false], ['seedance_reference', false], ['*', false],
    ['SEEDANCE_*', true], ['seedance*reference', true], ['suno_*', true]]) {
    const decision = resolveToolGate('seedance_reference', { env: {}, jsonPatterns: [pattern], jsonFile: '/tmp/disabled-tools.json' });
    assert.equal(decision.enabled, enabled, pattern);
    if (!enabled) assert.match(decision.reason, /disabled-tools\.json/);
  }
});

test('per-tool overrides take precedence over flags, lists and the persistent denylist', () => {
  const env = {
    SOCIAL_FLOW_DISABLE_TOOLS: 'suno_*',
    SOCIAL_FLOW_TOOL_FLAGS: 'suno_*=off,suno_credits=on',
    SOCIAL_FLOW_TOOL_SUNO_GENERATE: '1',
  };
  const enabled = name => resolveToolGate(name, { env, jsonPatterns: ['suno_*'] }).enabled;
  assert.equal(enabled('suno_generate'), true);
  assert.equal(enabled('suno_credits'), true);
  delete env.SOCIAL_FLOW_TOOL_SUNO_GENERATE;
  assert.equal(enabled('suno_generate'), false);
  delete env.SOCIAL_FLOW_TOOL_FLAGS;
  assert.equal(enabled('suno_credits'), false);
});

test('a malformed flag is rejected at the tool gate', () => {
  assert.throws(() => isToolEnabled('suno_generate', { SOCIAL_FLOW_TOOL_FLAGS: 'suno_generate' }), /name=on\|off/);
});
