// cliches.js — the tagged catalogue, the mode rule, the picker and the reading of a board's record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const file = require.resolve('../../skills/storyboard/references/cliches.js');
const C = require(file);

test('every catalogue entry carries tags the picker and the review page can read', () => {
  const { items, reportEntries } = C.catalog();
  assert.equal(reportEntries, 371);
  // Ids 1–371 are the research report's numbers, each present once.
  assert.deepEqual(items.slice(0, 371).map(item => item.id), Array.from({ length: 371 }, (_, i) => i + 1));
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  for (const item of items) {
    const where = `#${item.id}`;
    for (const key of ['name', 'en', 'desc']) assert.ok(typeof item[key] === 'string' && item[key].trim(), `${where} ${key}`);
    assert.ok(Object.hasOwn(C.LAYERS, item.layer), `${where} layer ${item.layer}`);
    assert.ok(item.needs.length >= 1 && item.needs.length <= 3 && item.needs.every(need => Object.hasOwn(C.NEEDS, need)), `${where} needs ${item.needs}`);
    assert.ok(item.genres.length >= 1 && item.genres.every(genre => C.GENRES.includes(genre)), `${where} genres ${item.genres}`);
    assert.ok(item.caution === undefined || Object.hasOwn(C.CAUTIONS, item.caution), `${where} caution`);
    assert.ok(['body', 'wiki', 'community', 'snippet', 'unverified'].includes(item.evidence), `${where} evidence`);
    assert.equal(item.evidence === 'unverified', item.id > reportEntries, `${where} evidence against its id`);
  }
});

test('drama, comedy and romance apply; other types offer; a saved choice overrides the type', () => {
  const mode = production => C.mode(production).mode;
  assert.deepEqual(C.mode({ videoType: { id: 'drama' } }), { mode: 'apply', basis: 'default', why: 'video type drama' });
  assert.equal(mode({ videoType: { id: 'comedy' } }), 'apply');
  assert.equal(mode({ videoType: { id: 'custom', detail: '로맨스 숏폼, 인물이 직접 말한다' } }), 'apply');
  assert.equal(mode({ videoType: { id: 'custom', detail: 'Romantic comedy sketches' } }), 'apply');
  // A documentary hybrid reconstructs recorded events: it recommends.
  assert.equal(mode({ videoType: { id: 'custom', detail: 'Documentary with acted drama scenes' } }), 'offer');
  assert.equal(mode({ videoType: { id: 'custom', detail: '여행 기록' } }), 'offer');
  for (const id of ['documentary', 'explainer', 'tutorial', 'review', 'interview', 'vlog', 'advertisement', 'music_video'])
    assert.equal(mode({ videoType: { id } }), 'offer', id);
  assert.equal(mode(undefined), 'offer');
  assert.deepEqual(C.mode({ videoType: { id: 'explainer' }, clicheUse: 'on' }).basis, 'user');
  assert.equal(mode({ videoType: { id: 'explainer' }, clicheUse: 'on' }), 'apply');
  assert.equal(mode({ videoType: { id: 'drama' }, clicheUse: 'off' }), 'off');
});

test('pick returns a few candidates for the named need and leaves caution and practice entries out', () => {
  const { items } = C.catalog();
  const result = C.pick({ needs: ['obstacle', 'reveal'], seed: 'ep1' });
  assert.ok(result.candidates.length > 0 && result.candidates.length <= 12);
  for (const item of result.candidates) {
    assert.ok(item.needs.some(need => ['obstacle', 'reveal'].includes(need)), `#${item.id}`);
    assert.ok(!item.caution && !item.analysis, `#${item.id}`);
    assert.equal(item.stage, C.LAYERS[item.layer].stage);
  }
  // Both needs get candidates even though one has far more entries.
  for (const need of ['obstacle', 'reveal']) assert.ok(result.candidates.some(item => item.for[0] === need), need);
  // The same request lists the same candidates; another seed starts from others.
  assert.deepEqual(C.pick({ needs: ['obstacle', 'reveal'], seed: 'ep1' }).candidates.map(i => i.id), result.candidates.map(i => i.id));
  assert.notDeepEqual(C.pick({ needs: ['obstacle', 'reveal'], seed: 'ep2' }).candidates.map(i => i.id), result.candidates.map(i => i.id));

  const flagged = items.find(item => item.caution && !item.analysis);
  const need = flagged.needs[0];
  const all = { needs: [need], limit: 40, layers: [flagged.layer], genres: flagged.genres.filter(g => g !== 'any') };
  const without = C.pick(all), withCaution = C.pick({ ...all, includeCaution: true });
  assert.ok(without.left.caution >= 1);
  assert.ok(!without.candidates.some(item => item.caution));
  assert.equal(withCaution.pool, without.pool + without.left.caution);

  const first = result.candidates[0].id;
  assert.ok(!C.pick({ needs: ['obstacle', 'reveal'], seed: 'ep1', exclude: [first] }).candidates.some(item => item.id === first));
  assert.ok(C.pick({ needs: ['setting'], layers: ['place'], limit: 3 }).candidates.every(item => item.layer === 'place'));
  assert.equal(C.pick({ needs: ['setting'], limit: 3 }).candidates.length, 3);
  assert.throws(() => C.pick({}), /name at least one need/);
  assert.throws(() => C.pick({ needs: ['fame'] }), /unknown need "fame"/);
  assert.throws(() => C.pick({ needs: ['meet'], genres: ['western'] }), /unknown genre "western"/);
});

test('a board record reads as undecided, used, offered or none, and the digest prints it as counts', () => {
  const drama = { videoType: { id: 'drama' } };
  const scenes = { scenes: [{ no: 1 }, { no: 2 }] };
  // No record: a board written before the record existed is not asked to go back.
  assert.deepEqual(C.digest({ PRODUCTION: drama, STRUCTURE: scenes }), []);
  assert.equal(C.reading({ PRODUCTION: drama }).decision, 'undecided');
  assert.match(C.digest({ PRODUCTION: drama, CLICHES: { version: 1, uses: [] } })[0], /^clichés: undecided — this episode applies them by default \(video type drama\)/);
  // An open record on a type that only recommends says nothing.
  assert.deepEqual(C.digest({ PRODUCTION: { videoType: { id: 'explainer' } }, CLICHES: { version: 1, uses: [] } }), []);

  const board = { PRODUCTION: drama, STRUCTURE: scenes, CLICHES: { version: 1, uses: [
    { id: 45, name: 'A', scenes: [2], basis: 'default' }, { name: 'custom', character: 'jun', basis: 'user' },
    { id: 9, name: 'B', offered: true, scenes: [7] }, null, 'x', { shift: 'no id and no name' }] } };
  const r = C.reading(board, { earlier: [{ id: 45, name: 'A', episode: 'e0' }, { id: 9, name: 'B', episode: 'e0' }] });
  assert.deepEqual([r.decision, r.applied.length, r.offered.length], ['use', 2, 1]);
  assert.deepEqual(r.repeats, [{ id: 45, name: 'A', episode: 'e0' }]);          // an offered entry is not a repeat
  assert.deepEqual(r.dangling, [{ use: '#9 B', scene: 7 }]);
  assert.deepEqual(r.unpicked, []);
  // The same record on a type that only recommends: the use with no user's pick is named, the picked one is not.
  const moved = { ...board, PRODUCTION: { videoType: { id: 'documentary' } } };
  assert.deepEqual(C.reading(moved).unpicked, ['#45 A']);
  assert.match(C.digest(moved).at(-1), /^clichés: #45 A is in the story without the user's pick, and this episode only recommends \(video type documentary\)/);
  assert.deepEqual(C.digest(board), ['clichés: 2 in the story (#45 A scene 2 · "custom" jun), 1 offered — they go in when the user picks them',
    'clichés: #9 B names scene 7, which is not on the board — record the use again with story_cliche']);
  assert.deepEqual(C.digest({ CLICHES: { uses: [{ id: 9, name: 'B', offered: true }] } }), ['clichés: none applied, 1 offered — they go in when the user picks them']);
  assert.deepEqual(C.digest({ PRODUCTION: drama, CLICHES: { none: 'one quiet exchange', uses: [] } }), ['clichés: none — one quiet exchange']);
  // A hand-edited block reads as what can be read instead of throwing.
  assert.equal(C.reading({ CLICHES: 'yes' }).tracked, false);
  assert.equal(C.reading({ CLICHES: { uses: 'all' }, STRUCTURE: { scenes: 'x' } }).decision, 'undecided');
  assert.deepEqual(C.digest({ PRODUCTION: drama, CLICHES: { uses: [{ id: 2, name: 7, scenes: 'x' }] } }), ['clichés: 1 in the story (#2)']);
});

test("earlier episodes' applied clichés are found, and the picker CLI leaves them out", (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cliche-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const board = (topic, source) => { const dir = join(root, 'episodes', topic, 'storyboard'); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'scenes.js'), source); return dir; };
  const pool = C.pick({ needs: ['obstacle'], limit: 40 }).candidates.map(item => item.id);
  const [used, offered] = pool;
  board('e1', `window.SCENES=[];window.CLICHES=${JSON.stringify({ uses: [{ id: used, name: 'A', basis: 'default' }, { id: offered, name: 'B', offered: true }, { name: 'custom' }] })};`);
  board('e2', 'window.SCENES = [;');                                             // unreadable: skipped
  const current = board('e3', `window.SCENES=[];window.CLICHES=${JSON.stringify({ uses: [{ id: pool[2], name: 'C' }] })};`);
  const episodes = join(root, 'episodes');
  assert.deepEqual(C.earlierUses(episodes, current), [{ id: used, name: 'A', episode: 'e1' }]);
  assert.deepEqual(C.earlierUses(join(root, 'missing')), []);
  // On the command line a path that is not a directory would turn repeat detection off unnoticed.
  assert.throws(() => C.main(['pick', '--need', 'obstacle', '--episodes', join(root, 'missing')]), /--episodes: no directory at/);

  const out = JSON.parse(C.main(['pick', '--need', 'obstacle', '--limit', '40', '--episodes', episodes, '--except', current, '--json']));
  assert.ok(!out.candidates.some(item => item.id === used));
  assert.ok(out.candidates.some(item => item.id === offered));
  assert.equal(out.left.used, 1);
  assert.match(C.main(['mode', 'custom', '로맨스', '숏폼', '--saved', 'off']), /^off — /);
  assert.match(C.main(['show', String(used)]), new RegExp(`^#${used} .*\\n  needs: .*evidence: `));
  assert.match(C.main(['needs']), /obstacle — blocks the relationship or the goal from outside/);
  assert.deepEqual(JSON.parse(C.main(['board', current])).applied.map(use => use.id), [pool[2]]);
  // One spawned run: a bad request exits 2 with the vocabulary on stderr.
  assert.throws(() => execFileSync(process.execPath, [file, 'pick', '--need', 'fame'], { stdio: 'pipe' }),
    error => error.status === 2 && /unknown need "fame" — one of: meet, bind/.test(String(error.stderr)));
});
