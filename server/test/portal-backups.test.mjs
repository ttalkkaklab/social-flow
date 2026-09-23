import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, it } from 'node:test';
import { manageBackups, backupSchema } from '../dist/portal-backups.js';
import { ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(join(tmpdir(), 'backup-retention-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const board = n => `storyboard/.portal-local/2026-09-23T10-00-0${n}-000Z-r${n}`;
const scenario = n => `storyboard/.portal-local/2026-09-23T11-00-0${n}-000Z-scenarios`;
const media = (kind, n) => `${kind === 'images' ? 'storyboard/' : ''}.portal-local/${kind}-00000000-0000-4000-8000-00000000000${n}`;
function file(relative, content = relative) { const p = join(dir, relative); fs.mkdirSync(join(p, '..'), { recursive: true }); fs.writeFileSync(p, content); }
function copies() {
  for (const kind of ['board', 'scenarios', 'images', 'attachments']) for (const n of [1, 2]) {
    const p = kind === 'board' ? board(n) : kind === 'scenarios' ? scenario(n) : media(kind, n);
    file(`${p}/original.md`, `${kind}${n}`);
    fs.utimesSync(join(dir, p), n, n);
  }
}
it('preview lists four backup kinds; apply keeps newest per kind and preserves unrelated files', () => {
  copies(); file('storyboard/.portal-local/personal/note.md'); file('storyboard/.portal-head/scenes.js'); file('.portal.json', 'state'); file('storyboard/scenes.js', 'working');
  const plan = manageBackups({ episodeDir: dir, keep: 1 });
  assert.equal(plan.dryRun, true); assert.equal(plan.entries.length, 8); assert.equal(plan.remove.length, 4); assert.deepEqual(plan.deleted, []);
  assert.ok(plan.entries.every(e => e.files === 1 && e.bytes > 0));
  assert.ok(plan.ignored.includes('storyboard/.portal-local/personal'));
  assert.deepEqual(new Set(plan.remove), new Set([board(1), scenario(1), media('images', 1), media('attachments', 1)]));
  assert.ok(plan.remove.every(p => fs.existsSync(join(dir, p))));
  const applied = manageBackups({ episodeDir: join(dir, 'storyboard'), keep: 1, apply: true, confirm: plan.plan });
  assert.deepEqual(applied.deleted, plan.remove); assert.equal(manageBackups({ episodeDir: dir, keep: 1 }).entries.length, 4);
  for (const p of ['storyboard/.portal-local/personal/note.md', 'storyboard/.portal-head/scenes.js', '.portal.json', 'storyboard/scenes.js']) assert.ok(fs.existsSync(join(dir, p)));
  assert.equal(fs.readFileSync(join(dir, '.portal.json'), 'utf8'), 'state');
});
it('new or edited backup and changed keep invalidate a reviewed plan before any deletion', () => {
  copies(); const plan = manageBackups({ episodeDir: dir, keep: 1 });
  assert.throws(() => manageBackups({ episodeDir: dir, keep: 2, apply: true, confirm: plan.plan }), /changed|match/);
  file(`${board(3)}/new.md`);
  assert.throws(() => manageBackups({ episodeDir: dir, keep: 1, apply: true, confirm: plan.plan }), /changed|match/);
  const updated = manageBackups({ episodeDir: dir, keep: 1 }); file(`${board(1)}/original.md`, 'edited longer contents');
  assert.throws(() => manageBackups({ episodeDir: dir, keep: 1, apply: true, confirm: updated.plan }), /changed|match/);
  assert.ok(updated.entries.every(e => fs.existsSync(join(dir, e.path))));
});
it('unknown names and invalid calendar stamps are protected, not retention candidates', () => {
  for (const p of ['2026-02-30T10-00-00-000Z-r1', 'images-not-a-uuid', 'notes', '2026-09-23T10-00-00-000Z-other']) file(`storyboard/.portal-local/${p}/keep.md`);
  const plan = manageBackups({ episodeDir: dir, keep: 1 }); assert.equal(plan.entries.length, 0); assert.equal(plan.ignored.length, 4); assert.deepEqual(plan.remove, []);
});
for (const where of ['ancestor', 'root', 'nested']) it(`${where} symlink refuses pruning without touching external files`, () => {
  copies(); file('external/keep.md', 'external'); const plan = manageBackups({ episodeDir: dir, keep: 1 });
  if (where === 'ancestor') { fs.renameSync(join(dir, 'storyboard'), join(dir, 'real-board')); fs.symlinkSync(join(dir, 'real-board'), join(dir, 'storyboard')); }
  if (where === 'root') { fs.renameSync(join(dir, 'storyboard/.portal-local'), join(dir, 'real-backups')); fs.symlinkSync(join(dir, 'real-backups'), join(dir, 'storyboard/.portal-local')); }
  if (where === 'nested') fs.symlinkSync(join(dir, 'external'), join(dir, board(1), 'link'));
  assert.throws(() => manageBackups({ episodeDir: dir, keep: 1, apply: true, confirm: plan.plan }), /[Ss]ymlink|Unsafe/);
  assert.equal(fs.readFileSync(join(dir, 'external/keep.md'), 'utf8'), 'external');
});
it('partial deletion failure reports completed paths and stops', t => {
  for (const n of [1, 2, 3]) file(`${board(n)}/original.md`);
  const plan = manageBackups({ episodeDir: dir, keep: 1 }); const original = fs.rmSync; let calls = 0;
  const mock = t.mock.method(fs, 'rmSync', (...args) => { if (++calls === 2) throw new Error('fixture denied'); return original(...args); }); syncBuiltinESMExports();
  try { const result = manageBackups({ episodeDir: dir, keep: 1, apply: true, confirm: plan.plan }); assert.match(result.error, /fixture denied/); assert.deepEqual(result.deleted, [plan.remove[0]]); assert.ok(fs.existsSync(join(dir, plan.remove[1]))); }
  finally { mock.mock.restore(); syncBuiltinESMExports(); }
});
it('MCP route is local without a portal key, preview creates nothing, invalid apply/keep are rejected', async () => {
  const tool = TOOLS.find(t => t.name === 'storyboard_backups'); assert.ok(tool); assert.equal(tool.annotations.openWorldHint, false);
  const before = fs.readdirSync(dir); const result = await ROUTES.storyboard_backups({ episodeDir: dir });
  assert.equal(result.isError, false); assert.equal(JSON.parse(result.content[0].text).dryRun, true); assert.deepEqual(fs.readdirSync(dir), before);
  assert.equal((await ROUTES.storyboard_backups({ episodeDir: dir, keep: 0 })).isError, true);
  assert.equal((await ROUTES.storyboard_backups({ episodeDir: dir, apply: true })).isError, true);
  assert.equal(backupSchema.safeParse({ episodeDir: dir, keep: -1 }).success, false);
});
