/**
 * Tool on/off gate — env plus disabled-tools.json.
 *
 * Does not read process.env. Each case starts from an empty object so a
 * developer-shell leftover SOCIAL_FLOW_* cannot shake this file.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeToolGate,
  isToolEnabled,
  matchesPattern,
  parsePatternList,
  parseToolFlags,
  resolveToolGate,
  toolOverrideVar,
  warnUnknownPatterns,
} from '../dist/tool-gate.js';
import { TOOLS } from '../dist/tools.js';

const NAMES = TOOLS.map((tool) => tool.name);

describe('parsePatternList', () => {
  it('accepts commas and whitespace together', () => {
    assert.deepEqual(parsePatternList('suno_*, veo_text2video  music_generate_clip'), [
      'suno_*',
      'veo_text2video',
      'music_generate_clip',
    ]);
  });

  it('treats empty as unset', () => {
    assert.deepEqual(parsePatternList(undefined), []);
    assert.deepEqual(parsePatternList(''), []);
    assert.deepEqual(parsePatternList('  ,  '), []);
  });
});

describe('matchesPattern', () => {
  it('exact match ignores case', () => {
    assert.equal(matchesPattern('suno_generate', 'suno_generate'), true);
    assert.equal(matchesPattern('suno_generate', 'SUNO_GENERATE'), true);
    assert.equal(matchesPattern('suno_generate', 'suno_credits'), false);
  });

  it('trailing * is prefix only', () => {
    assert.equal(matchesPattern('suno_generate', 'suno_*'), true);
    assert.equal(matchesPattern('suno_credits', 'suno_*'), true);
    assert.equal(matchesPattern('music_generate', 'suno_*'), false);
    assert.equal(matchesPattern('suno_generate', '*'), true);
  });

  it('a star in the middle is not a wildcard', () => {
    assert.equal(matchesPattern('suno_generate', 'suno*generate'), false);
  });
});

describe('default', () => {
  it('every tool is on with no settings', () => {
    const env = {};
    for (const name of NAMES) {
      assert.equal(isToolEnabled(name, env).enabled, true, name);
    }
  });

  it('startup log is short on the default', () => {
    assert.equal(describeToolGate(NAMES, {}), `tool gate default on (${NAMES.length} tools)`);
  });
});

describe('allowlist SOCIAL_FLOW_TOOLS', () => {
  it('turns on only the listed family', () => {
    const env = { SOCIAL_FLOW_TOOLS: 'suno_*' };
    assert.equal(isToolEnabled('suno_generate', env).enabled, true);
    assert.equal(isToolEnabled('suno_credits', env).enabled, true);
    assert.equal(isToolEnabled('music_generate_clip', env).enabled, false);
    assert.equal(isToolEnabled('veo_img2video', env).enabled, false);
  });
});

describe('denylist SOCIAL_FLOW_DISABLE_TOOLS', () => {
  it('turns off only the listed family', () => {
    const env = { SOCIAL_FLOW_DISABLE_TOOLS: 'suno_*,veo_*' };
    assert.equal(isToolEnabled('suno_generate', env).enabled, false);
    assert.equal(isToolEnabled('veo_text2video', env).enabled, false);
    assert.equal(isToolEnabled('music_generate_clip', env).enabled, true);
  });

  it('denylist wins when it overlaps the allowlist', () => {
    const env = { SOCIAL_FLOW_TOOLS: 'suno_*', SOCIAL_FLOW_DISABLE_TOOLS: 'suno_credits' };
    assert.equal(isToolEnabled('suno_generate', env).enabled, true);
    assert.equal(isToolEnabled('suno_credits', env).enabled, false);
  });
});

describe('SOCIAL_FLOW_TOOL_FLAGS', () => {
  it('turns several tools off in one line with name=off', () => {
    const env = { SOCIAL_FLOW_TOOL_FLAGS: 'suno_generate=0,music_generate_clip=off' };
    assert.equal(isToolEnabled('suno_generate', env).enabled, false);
    assert.equal(isToolEnabled('music_generate_clip', env).enabled, false);
    assert.equal(isToolEnabled('suno_credits', env).enabled, true);
  });

  it('exact match beats a prefix flag', () => {
    const env = { SOCIAL_FLOW_TOOL_FLAGS: 'suno_*=off,suno_credits=on' };
    assert.equal(isToolEnabled('suno_generate', env).enabled, false);
    assert.equal(isToolEnabled('suno_credits', env).enabled, true);
  });

  it('rejects a malformed flag', () => {
    assert.throws(() => parseToolFlags('suno_generate'), /name=on\|off/);
    assert.throws(() => isToolEnabled('suno_generate', { SOCIAL_FLOW_TOOL_FLAGS: 'suno_generate' }));
  });
});

describe('per-tool SOCIAL_FLOW_TOOL_<NAME>', () => {
  it('beats the lists — turns one tool back on inside a disabled family', () => {
    const env = {
      SOCIAL_FLOW_DISABLE_TOOLS: 'suno_*',
      [toolOverrideVar('suno_generate')]: '1',
    };
    assert.equal(isToolEnabled('suno_generate', env).enabled, true);
    assert.equal(isToolEnabled('suno_credits', env).enabled, false);
  });

  it('turns one allowlisted tool off', () => {
    const env = {
      SOCIAL_FLOW_TOOLS: 'suno_*',
      [toolOverrideVar('suno_credits')]: 'off',
    };
    assert.equal(isToolEnabled('suno_generate', env).enabled, true);
    assert.equal(isToolEnabled('suno_credits', env).enabled, false);
  });

  it('beats FLAGS too', () => {
    const env = {
      SOCIAL_FLOW_TOOL_FLAGS: 'suno_generate=off',
      [toolOverrideVar('suno_generate')]: 'on',
    };
    assert.equal(isToolEnabled('suno_generate', env).enabled, true);
  });
});

describe('disabled-tools.json union', () => {
  it('JSON denylist hides a tool with no env set', () => {
    const decision = resolveToolGate('seedance_text2video', {
      env: {},
      jsonPatterns: ['seedance_*'],
      jsonFile: '/tmp/disabled-tools.json',
    });
    assert.equal(decision.enabled, false);
    assert.match(decision.reason, /disabled-tools\.json/);
  });

  it('a per-tool env override can turn a JSON-disabled tool back on', () => {
    const decision = resolveToolGate('seedance_text2video', {
      env: { [toolOverrideVar('seedance_text2video')]: 'on' },
      jsonPatterns: ['seedance_*'],
    });
    assert.equal(decision.enabled, true);
  });

  it('env denylist and JSON denylist both hide', () => {
    assert.equal(
      resolveToolGate('suno_generate', { env: { SOCIAL_FLOW_DISABLE_TOOLS: 'suno_*' }, jsonPatterns: [] }).enabled,
      false,
    );
    assert.equal(
      resolveToolGate('suno_generate', { env: {}, jsonPatterns: ['suno_*'] }).enabled,
      false,
    );
  });
});

describe('unknown-pattern warnings', () => {
  it('warns on unknown names and does not kill the server', () => {
    const warnings = warnUnknownPatterns(NAMES, {
      SOCIAL_FLOW_TOOLS: 'suno_*,no_such_tool',
      SOCIAL_FLOW_DISABLE_TOOLS: 'zzz_*',
    });
    assert.ok(warnings.some((line) => /no_such_tool/.test(line)));
    assert.ok(warnings.some((line) => /zzz_\*/.test(line)));
    assert.ok(!warnings.some((line) => /suno_\*/.test(line)));
  });
});

describe('every tool name maps to a gate variable', () => {
  it('uppercase conversion does not collide', () => {
    const vars = NAMES.map((name) => toolOverrideVar(name));
    assert.equal(new Set(vars).size, NAMES.length);
    for (const name of NAMES) {
      assert.match(toolOverrideVar(name), /^SOCIAL_FLOW_TOOL_[A-Z0-9_]+$/);
    }
  });
});
