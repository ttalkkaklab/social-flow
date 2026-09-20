import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { SCENES_VM_POLICY, evaluateWindowScript } from '../dist/scenes-vm.js';

const require = createRequire(import.meta.url);
const skillEvaluator = require('../../skills/_shared/scenes-vm.js');

const evaluators = [
  ['server', evaluateWindowScript],
  ['skills', skillEvaluator.evaluateWindowScript],
];

const COMPATIBILITY_SOURCE = `
// EP07-style local helpers and syntax used by published storyboards.
const line = (tts, sub = tts) => [{ tts, sub }];
const still = (bg, ...labels) => ({ bg, labels });
window.SCENES = [{
  score: -2,
  escaped: "line\\nquote: \\"ok\\"",
  duplicate: "old",
  duplicate: "new",
  narration: line("voice"),
  visual: still("harbor", "fog"),
},];
/* trailing comments are accepted */
window.FORMAT = "shorts";
`;

const COMPATIBILITY_RESULT = {
  SCENES: [{
    score: -2,
    escaped: 'line\nquote: "ok"',
    duplicate: 'new',
    narration: [{ tts: 'voice', sub: 'voice' }],
    visual: { bg: 'harbor', labels: ['fog'] },
  }],
  FORMAT: 'shorts',
};

describe('scenes.js realm isolation', () => {
  it('keeps server and skill policies and compatibility behavior aligned', () => {
    assert.deepEqual(skillEvaluator.SCENES_VM_POLICY, SCENES_VM_POLICY);
    const serverResult = evaluateWindowScript(COMPATIBILITY_SOURCE);
    const skillResult = skillEvaluator.evaluateWindowScript(COMPATIBILITY_SOURCE);
    assert.deepEqual(serverResult, COMPATIBILITY_RESULT);
    assert.deepEqual(skillResult, COMPATIBILITY_RESULT);
    assert.deepEqual(skillResult, serverResult);
  });

  for (const [name, evaluate] of evaluators) {
    it(`${name}: returns only JSON data assigned to window`, () => {
      assert.deepEqual(evaluate('window.SCENES = [{ no: 1 }]; window.FORMAT = "shorts";'), {
        SCENES: [{ no: 1 }], FORMAT: 'shorts',
      });
    });

    it(`${name}: blocks window.constructor.constructor`, () => {
      assert.throws(
        () => evaluate('window.constructor.constructor("return process")()'),
        /Code generation from strings disallowed|eval and Function are disabled/i,
      );
    });

    it(`${name}: blocks this.constructor.constructor`, () => {
      assert.throws(
        () => evaluate('this.constructor.constructor("return process")()'),
        /Code generation from strings disallowed|eval and Function are disabled/i,
      );
    });

    it(`${name}: keeps sloppy this inside the isolated realm`, () => {
      assert.deepEqual(evaluate('window.RESULT = [this === globalThis, typeof this.process];'), {
        RESULT: [true, 'undefined'],
      });
    });

    it(`${name}: blocks eval`, () => {
      assert.throws(
        () => evaluate('eval("window.RESULT = 1")'),
        /Code generation from strings disallowed|eval and Function are disabled/i,
      );
    });

    it(`${name}: interrupts an infinite loop`, () => {
      assert.throws(() => evaluate('while (true) {}', { timeoutMs: 20 }), /timed out/i);
    });

    it(`${name}: reports line and column with the accepted contract`, () => {
      assert.throws(
        () => evaluate('window.SCENES = [];\nFunction("return 1")()', { filename: 'ep07/scenes.js' }),
        /ep07\/scenes\.js:2:\d+:[\s\S]*Allowed syntax:/,
      );
    });
  }
});
