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

describe('scenes.js realm isolation', () => {
  it('keeps the server and skill evaluator policies aligned', () => {
    assert.deepEqual(skillEvaluator.SCENES_VM_POLICY, SCENES_VM_POLICY);
  });

  for (const [name, evaluate] of evaluators) {
    it(`${name}: returns only JSON data assigned to window`, () => {
      assert.deepEqual(evaluate('window.SCENES = [{ no: 1 }]; window.FORMAT = "shorts";'), {
        SCENES: [{ no: 1 }], FORMAT: 'shorts',
      });
    });

    it(`${name}: blocks window.constructor.constructor`, () => {
      assert.throws(() => evaluate('window.constructor.constructor("return process")()'), /expected "="|only literal/i);
    });

    it(`${name}: blocks this.constructor.constructor`, () => {
      assert.throws(() => evaluate('this.constructor.constructor("return process")()'), /only window/i);
    });

    it(`${name}: rejects sloppy this before execution`, () => {
      assert.throws(() => evaluate('window.RESULT = [this === globalThis, typeof this.process];'), /only literal/i);
    });

    it(`${name}: blocks eval`, () => {
      assert.throws(() => evaluate('eval("window.RESULT = 1")'), /only window/i);
    });

    it(`${name}: rejects an infinite loop before execution`, () => {
      assert.throws(() => evaluate('while (true) {}'), /only window/i);
    });
  }
});
