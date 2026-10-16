import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodePropTransport, decodePropTransport, restorePropSource } from '../dist/prop-transport.js';
import { serializeBoard } from '../dist/storyboard.js';
import { evaluateWindowScript } from '../dist/scenes-vm.js';
import { fixture } from './fixtures/prop-board.mjs';

test('legacy portal transport is byte-preserving without a temporal sheet', () => {
  const source = '// approved: yes\nwindow.SCENES=[];';
  assert.equal(restorePropSource(source), source);
});
test('portal envelope restores unowned props, metadata and shot links without a fake owner', () => {
  const original = fixture(); original.SB_DOC.propContinuity.initial[0].state.ownerId = null;
  original.SB_DOC.title = 'Keep';
  const encoded = encodePropTransport(original);
  assert.deepEqual(encoded.SB_DOC.props, []);
  assert.equal(encoded.SCENES[0].visual.props, undefined);
  const exported = { ...encoded, SB_DOC: { ...encoded.SB_DOC, props: [] } };
  assert.deepEqual(decodePropTransport(exported), original);
  const source = '// approved: user choice\n' + serializeBoard(exported);
  const restored = restorePropSource(source);
  assert.match(restored, /approved: user choice/);
  assert.deepEqual(evaluateWindowScript(restored), original);
});
test('portal rejects unsupported envelope versions and invalid restored custody', () => {
  const encoded = encodePropTransport(fixture()); encoded.SB_DOC.propSheetTransport.version = 2;
  assert.throws(() => decodePropTransport(encoded), /Unsupported/);
  encoded.SB_DOC.propSheetTransport.version = 1;
  encoded.SB_DOC.propSheetTransport.continuity.events[0].from.holderId = 'b';
  assert.throws(() => restorePropSource(serializeBoard(encoded)), /Invalid restored props/);
});
