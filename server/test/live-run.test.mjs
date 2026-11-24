import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('bundled CLI enforces intake order and computes a buffered estimate before room creation', (t) => {
  const project = mkdtempSync(join(tmpdir(), 'live-intake-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const file = join(project, 'live.json');
  const cfg = { project, character: 'host', channel: 'demo', opening: 'Hello', chatModel: 'test' };
  const run = (action, ...args) => {
    writeFileSync(file, JSON.stringify(cfg));
    return spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../dist/character-live.bundle.js', import.meta.url)),
        action,
        '--config',
        file,
        ...args
      ],
      { encoding: 'utf8' }
    );
  };
  assert.match(run('estimate').stderr, /broadcast topic/);
  cfg.topic = 'Tea';
  assert.match(run('estimate').stderr, /knowledge files/);
  cfg.knowledgeBase = [];
  assert.equal(JSON.parse(run('knowledge').stdout).passages, 0);
  assert.match(run('estimate').stderr, /--faq-count/);
  assert.match(run('estimate', '--faq-count', '20').stderr, /--faq-count/);
  const dir = join(project, 'data/demo/assets/characters/host');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(project, '.social-flow'), { recursive: true });
  writeFileSync(join(project, '.social-flow/models.json'), JSON.stringify({ languages: { speech: 'en' } }));
  writeFileSync(join(dir, 'identity.md'), ['```json', '{}', '```'].join('\n'));
  writeFileSync(join(dir, 'panels.json'), '{"panels":{"face":{"file":"panel.png"}}}');
  writeFileSync(join(dir, 'panel.png'), 'fixture');
  writeFileSync(join(dir, 'voice.wav'), 'fixture');
  const result = run('estimate', '--faq-count', '30');
  assert.equal(result.status, 0, result.stderr);
  const estimate = JSON.parse(result.stdout);
  assert.equal(estimate.faqCount, 30);
  assert.ok(Date.parse(estimate.expectedStartTime) > Date.now() + estimate.generationSeconds * 1000);
});
