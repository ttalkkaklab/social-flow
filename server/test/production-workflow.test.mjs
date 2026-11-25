import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manageProject } from '../dist/project.js';
import { manageWorkflow } from '../dist/production-workflow.js';
import { setupProject } from './workflow-fixture.mjs';

test('text storyboard completion checks the stored hook and reports an unreviewed opening honestly', t => {
  const workspace = mkdtempSync(join(tmpdir(), 'sf-hook-workflow-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  setupProject(workspace);
  const { episode } = manageProject({ action: 'episode', workspace, topic: 'dumplings' });
  const boardDir = join(episode, 'storyboard');
  mkdirSync(boardDir, { recursive: true });
  const file = join(boardDir, 'scenes.js');
  const stage = { episode, stage: 'text_storyboard' };
  const saveStory = story => writeFileSync(file, 'window.SCENES = [];\nwindow.STORY = ' + JSON.stringify(story) + ';\n');

  saveStory({ version: 'story-v1', hookContractVersion: 1 });
  manageWorkflow({ ...stage, action: 'begin' });
  assert.throws(() => manageWorkflow({ ...stage, action: 'complete' }), /hook_type_required/);
  assert.equal(manageWorkflow({ episode, action: 'status' }).active.stage, stage.stage);

  saveStory({ version: 'story-v1', hookContractVersion: 1, primaryHookType: 'cause_mystery' });
  const finished = manageWorkflow({ ...stage, action: 'complete' });
  assert.equal(finished.openingReview.status, 'not_reviewed');
  assert.equal(finished.completed.at(-1).stage, stage.stage);

  saveStory({ version: 'story-v1' });
  manageWorkflow({ ...stage, action: 'begin' });
  assert.equal(manageWorkflow({ ...stage, action: 'complete' }).openingReview, undefined);
});
