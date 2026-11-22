import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { FONT_ASSETS } = require('../../skills/channel/references/review-fonts.js');
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

test('offline review shows the selected Veo asset slots before and after a tool is recorded', t => {
  const directory = mkdtempSync(join(tmpdir(), 'reference-board-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  storyboardHtml(directory);
  const window = {};
  runInNewContext(readFileSync(join(directory, 'review-files.js'), 'utf8'), {window});
  runInNewContext(readFileSync(join(directory, 'production-mode.js'), 'utf8'), {window});
  const template = readFileSync(join(directory, 'storyboard.html'), 'utf8');
  const select = template.slice(template.indexOf('  function reviewVideoSelection'), template.indexOf('  function clipPromptOf'));
  const lanes = template.slice(template.indexOf('  var REF_LANES ='), template.indexOf('  // The MSR icon'));
  const context = {window, LANG: 'en', shot: {id: 's1', visual: {video: {}}}, fp: {mode: 'reference'}};
  window.REVIEW_VIDEO_SNAPSHOT = {engine: 'ltx-api', model: 'ltx-2-5-pro'};
  const video = {engine: 'veo', model: 'veo-3.1-fast-generate-001', operation: 'reference'};
  window.PRODUCTION = {modelSettings: {overrides: [{scope: 'shot', shotId: 's1', video, request: 'Use Veo references'}]}};
  const lane = () => runInNewContext(select + lanes + '\nrefLane(shot, fp)', context);
  assert.equal(lane().name, 'Veo');
  assert.ok(lane().assetsOnly);
  assert.equal(lane().slots, 3);
  context.shot.visual.video.tool = 'veo_reference';
  assert.equal(lane().slots, 3);
  video.model = 'veo-3.1-lite-generate-001';
  assert.equal(lane().slots, 0);
});

test('a scene owns one video prompt across its shots, with an ordered draft until a matching plan exists', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const functions = template.slice(template.indexOf('  function sceneNoteHead'), template.indexOf("  /* The user's yes"));
  const first = { id: 's0001', duration: 2, timeline: { framing: 'Wide', action: 'Step left' },
    visual: { bgPrompt: 'Paint the plaza', video: { prompt: 'Earlier single-shot prompt' } } };
  const second = { id: 's0002', duration: 1, timeline: { action: 'Clap', transition: 'hard_cut' } };
  const plan = { sceneNo: 1, shotIds: [first.id, second.id], prompt: 'Saved <take>', requestId: 'take-1', stale: false };
  const context = { LANG: 'en', window: { VIDEO_PRODUCTION: { candidates: [plan] } },
    grp: { scene: 1, items: [first, second].map((s, i) => ({ s, i })) }, sc: { videoDirection: { sound: 'Street noise' } },
    first, WIDE: false, REF_LANES: {}, refLane: () => ({ name: 'Test model', slots: 0 }),
    safeSrc: () => '', esc: s => String(s).replaceAll('<', '&lt;'),
    T: { shotCap: n => 'Shot ' + n, sceneNamed: n => 'Scene ' + n }, DOC: {}, OFF_GLYPH: '' };
  const render = expression => runInNewContext(functions + '\n' + expression, context);
  const scene = () => render('sceneVideoPromptHtml(sc, grp)');
  assert.match(scene(), /Saved request plan.*Request take-1<\/p><pre>Saved &lt;take><\/pre>/s);
  for (const candidate of [{ ...plan, stale: true }, { ...plan, stale: null }, { ...plan, shotIds: [second.id, first.id] }]) {
    context.window.VIDEO_PRODUCTION.candidates = [candidate];
    const html = scene();
    assert.match(html, /Storyboard draft.*Street noise.*Shot 1 · 0–2 s.*Step left.*Shot 2 · 2–3 s.*Clap/s);
    assert.doesNotMatch(html, /<details/);
    assert.doesNotMatch(html, /Saved &lt;take>/);
  }
  const notes = render('sceneNotesHtml(grp, "<b>Sound cues</b>", sceneVideoPromptHtml(sc, grp))');
  assert.equal(notes.match(/role="tab"/g).length, 2);
  assert.match(notes, /aria-controls="scene-notes-1-sound" aria-selected="true"/);
  assert.match(notes, /role="tabpanel" id="scene-notes-1-sound"[^>]*><div[^>]*><b>Sound cues<\/b>/);
  assert.match(notes, /role="tabpanel" id="scene-notes-1-prompt"[^>]* hidden>.*Street noise/s);
  assert.doesNotMatch(render('sceneNotesHtml(grp, "Sound only", "")'), /role="tab"/);
  const card = render('shotBodyHtml(first, [], true)');
  assert.match(card, /Image generation details.*Paint the plaza.*Shot direction.*Step left/s);
  assert.doesNotMatch(card, /Earlier single-shot prompt|>Prompt<|>Video prompt</);
  assert.match(render('shotBodyHtml(first, [], false)'), /Earlier single-shot prompt/);
});

test('offline direction icons identify inherited shots and show the middle override in both languages', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url),'utf8');
  const source = template.slice(template.indexOf('  function esc('), template.indexOf('  function copy(')) +
    template.slice(template.indexOf('  function directionAttributes'), template.indexOf('  function sceneVideoPromptHtml'));
  const sc = {directionDefaults:{camera:'camera.static', lighting:'Window "light" <left>', attention:'The clerk.'}, videoDirection:{emotion:'She relaxes.'}};
  const cards = [{}, {visual:{camera:{movement:'dolly in',target:'the letter',speed:'slow'}, expression:{mina:'Narrowed eyes.'}}}, {}];
  cards[1].shot = {techniques:[{id:'camera.rack-focus',from:'the ribbon',to:'the bell'}]};
  cards[1].visual.frames = {mode:'first_last',endState:'The raven closes its claw.'};
  cards[1].timeline = {action:'Inspect the parcel.'};
  cards[1].visual.video = {promptSource:{action:'Press the signet into the wax.'}};
  cards[1].shot.videoDesign = {motion:{beats:[{at:0.8,state:'A crack opens in the wax.'}]}};
  cards[1].narration = [{id:'l1',speaker:'mina',delivery:'on_screen',tts:'Not yet.',acting:{
    intent:'Hide the broken seal.',emotion:'Her fear subsides.',leadInSeconds:1.5,tailOutSeconds:0.75}}];
  const direction = require('../../skills/storyboard/references/scene-direction.js'), film = require('../../skills/storyboard/references/film-techniques.js');
  const rows = direction.resolve(sc,cards);
  for (const lang of ['ko','en']) {
    const context = {LANG:lang, sc, cards, rows, window:{SCENE_DIRECTION:direction,FILM_TECHNIQUES:film},
      camIcon:id=>'<svg data-camera="'+id+'"></svg>'};
    const render = expr => runInNewContext(source+'\n'+expr,context);
    const header = render('directionAttributes(sc,rows.defaults)');
    assert.match(header,/data-camera="camera.static"/);
    assert.match(header,/data-attribute="lighting" aria-label="[^"]+" data-tip="Window &quot;light&quot; &lt;left&gt;"/);
    assert.match(header,/data-attribute="emotion"/);
    const html = cards.map((_,i) => render('directionAttributes(sc,rows.shots['+i+'],cards['+i+'])'));
    for (const group of [header, ...html]) {
      assert.equal(group.replace(/<[^>]+>/g, ''), '', 'only icons appear in the collapsed row');
      const buttons = group.match(/<button\b[^>]*aria-expanded="false"[^>]*><svg\b/g) || [];
      assert.equal(buttons.length, (group.match(/data-attribute=/g) || []).length);
    }
    assert.equal(html.filter(value=>value.includes('camera.static')).length,2);
    assert.match(html[1],/camera.dolly-in/); assert.match(html[1],/slow · the letter/);
    assert.ok(html[1].includes(lang==='ko'?'샷 예외':'Shot override'));
    assert.ok(html[2].includes(lang==='ko'?'씬 기본':'Scene default'));
    assert.match(html[1],/data-attribute="expression"/);
    assert.match(html[1],/data-attribute="end".*The raven closes its claw/);
    assert.match(html[1],/data-attribute="action".*Inspect the parcel.*Press the signet/);
    assert.match(html[1],/data-attribute="beats".*At 0.8 s into this shot: A crack/);
    assert.match(html[1],/Hide the broken seal.*Her fear subsides.*Anticipation 1.5 seconds.*reaction 0.75 seconds/);
    assert.match(html[1],/data-attribute="attention".*From the ribbon to the bell/);
    assert.doesNotMatch(html[1],/The clerk/);
    assert.match(html[2],/The clerk/);
    assert.doesNotMatch(html[1],/camera.static/);
    const still = render('directionAttributes(sc,rows.shots[0],cards[0],true)');
    assert.match(still,/data-attribute="lighting"/);
    assert.doesNotMatch(still,/data-attribute="camera"/);
  }
});

test('the scroll that brings a keyboard-focused icon into view keeps its detail open', () => {
  const html = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = html.indexOf('    function viewportChanged(');
  const listeners = {}, calls = [];
  const window = { innerWidth: 375, innerHeight: 700, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const rect = { top: 540, bottom: 584, left: 24, right: 68 };
  const button = { matches: selector => selector === ':focus-visible', getBoundingClientRect: () => rect };
  runInNewContext(html.slice(start, html.indexOf('  })();', start)), {
    window, box: {}, cur: button, position: r => calls.push(r), hide: () => calls.push('hidden'),
  });
  listeners.scroll({target: window});
  assert.deepEqual(calls, [rect]);
  rect.top = 720; rect.bottom = 764;
  listeners.scroll({target: window});
  assert.deepEqual(calls, [rect, 'hidden']);
});

test('a background export shows the saved scene prompt when the board matches and references are unchecked', t => {
  const episode = mkdtempSync(join(tmpdir(), 'scene-prompt-export-'));
  t.after(() => rmSync(episode, { recursive: true, force: true }));
  const dir = join(episode, 'storyboard'), plans = join(episode, '.work/video-routing/plans');
  mkdirSync(dir); mkdirSync(plans, { recursive: true });
  const sc = { no: 1, videoDirection: { openingPositions: [], camera: 'Hold the wide shot.' } };
  const s = { id: 's0001', scene: 1, duration: 2,
    visual: { frames: { mode: 'first', start: 'start.png' }, video: { engine: 'veo', model: 'veo-3.1-fast-generate-001' } } };
  writeFileSync(join(dir, 'scenes.js'), 'window.SCENES=' + JSON.stringify([s]) +
    ';window.STRUCTURE=' + JSON.stringify({ scenes: [sc] }) + ';');
  const revision = require('../../skills/_shared/video-selection.js').readVideoContext(episode, s.id, 1).revision;
  const id = 'c'.repeat(64), prompt = 'First line\n  indentation and <camera> preserved.';
  const plan = { id, episode, shotId: s.id, sceneNo: 1, shotIds: [s.id], requestId: 'saved-1',
    inputs: { [join(dir, 'start.png')]: 'd'.repeat(64) }, contextRevision: revision, args: { prompt } };
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const source = template.slice(template.indexOf('  function sceneNoteHead'), template.indexOf('  function shotBodyHtml'));
  function exportCard(record) {
    writeFileSync(join(plans, id + '.json'), JSON.stringify(record));
    require('../../skills/storyboard/references/video-production.js').write(episode);
    const snapshot = readFileSync(join(dir, 'video-production-data.js'), 'utf8');
    return runInNewContext(snapshot + source + '\nsceneVideoPromptHtml(sc, grp)', {
      window: {}, sc, grp: { scene: 1, items: [{ i: 0, s }] }, LANG: 'en', T: { shotCap: n => 'Shot ' + n },
      esc: value => String(value).replaceAll('<', '&lt;'),
    });
  }
  assert.match(exportCard(plan), /Saved request · inputs unverified.*<pre>First line\n  indentation and &lt;camera> preserved\.<\/pre>/s);
  const outdated = exportCard({ ...plan, contextRevision: 'older' });
  assert.match(outdated, /Storyboard draft/);
  assert.doesNotMatch(outdated, /First line/);
});

test('localized copy is escaped while media attributes and source stay unchanged', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const source = template.slice(template.indexOf('  function esc(s)'), template.indexOf('  function strip(s)'));
  const CONTENT = require('../../skills/storyboard/references/review-localization.js').reader({ version: 1, sourceLanguage: 'vi', languages: ['vi', 'ja'], entries: [
    { source: 'Xin chào', translations: { ja: '<img src=x onerror=alert(1)>' } },
    { source: '../speech.wav', translations: { ja: 'wrong-path' } },
  ] }, 'ja');
  const result = runInNewContext(source + '\n[copy("Xin chào"), esc("../speech.wav")]', { CONTENT });
  assert.equal(result[0], '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(result[1], '../speech.wav');
});

test('review language survives source typography and prepares the selected font', async () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  window.ReviewTypography.apply(DOC, SCENES);');
  const source = template.slice(start, template.indexOf('  if (fontFailures.length)', start));
  const node = { lang: '', setAttribute(key, value) { this[key] = value; } };
  runInNewContext(source, {
    DOC: { contentLanguage: 'vi' }, SCENES: [], CONTENT: { language: 'ja' },
    app: { querySelectorAll: () => [node] },
    window: { ReviewTypography: { apply: () => { node.lang = 'vi'; } } },
  });
  assert.equal(node.lang, 'ja');
  const loaded = [];
  const context = { document: { documentElement: { lang: 'en' }, fonts: { load: async font => { loaded.push(font); return [{}]; } } } };
  context.window = context;
  runInNewContext(readFileSync(new URL('../../skills/channel/references/review-assets/review-typography.js', import.meta.url), 'utf8'), context);
  await context.ReviewTypography.prepare({ contentLanguage: 'vi' }, [], ['ja', 'zh-Hans']);
  assert.ok(loaded.some(font => font.includes('Noto Sans JP')));
  assert.ok(loaded.some(font => font.includes('Noto Sans SC')));
});

test('bound video displays before assembly, while explicit edit cuts retain their ranges', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  function productionCutsHtml(s)');
  const source = template.slice(start, template.indexOf('  function camOf(s)', start));
  const render = shot => runInNewContext(source + '\nproductionCutsHtml(shot)', {
    shot, LANG: 'en', WIDE: true,
    esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
  });
  const shot = { duration: 2, visual: { video: { clip: '../.work/video/native.mp4' } } };
  for (const productionPlan of [undefined, { cuts: [] }]) {
    const html = render({ ...shot, productionPlan });
    assert.match(html, /<video src="\.\.\/\.work\/video\/native\.mp4" controls/);
    assert.match(html, /class="production-cut-error" hidden/);
    assert.doesNotMatch(html, /ontimeupdate=/); // Full source, never truncate to the authored estimate.
  }
  shot.visual.video.clip = '/Volumes/data/replacement.mp4';
  assert.match(render(shot), /src="\/Volumes\/data\/replacement\.mp4"/);
  shot.productionPlan = { cuts: [
    { kind: 'generated_video', path: '../edit/a.mp4', start: 1, seconds: 2 },
    { kind: 'generated_video', path: '../edit/b.mp4', start: 0, seconds: 3 },
  ] };
  const edit = render(shot);
  assert.equal((edit.match(/<video /g) || []).length, 2);
  assert.match(edit, /data-start="1" data-end="3"/);
  assert.doesNotMatch(edit, /replacement\.mp4/);
  shot.productionPlan.cuts[0].seconds = undefined;
  assert.match(render(shot), /class="production-cut-error">/); // Invalid explicit ranges stay visible.
  assert.equal(render({ visual: { video: { prompt: 'planned only' } } }), '');
  for (const path of ['javascript:evil.mp4', ' https://example.test/x.mp4', '\njavascript:alert(1)//.svg',
    'h\nttps://example.test/x.mp4', '\\\\example.test\\x.mp4', '/\\example.test/x.svg']) {
    assert.doesNotMatch(render({ visual: { video: { clip: path } } }), /<(?:video|a|img)\b/);
    assert.doesNotMatch(render({ productionPlan: { cuts: [{ path, start: 0, seconds: 1 }] } }), /<(?:video|a|img)\b/);
  }
});

test('music lanes show one anchored span across scenes and label the score-free opening', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  var cueAt = []');
  const source = template.slice(start, template.indexOf('  var seqNo =', start));
  const SCENES = [1, 2, 3].map(i => ({ id: 's000' + i }));
  const context = { SCENES, copy: String, sceneNoteHead: (kind, title, status) => status || '', MUSIC: { $timeline: [{ cue: 'piano', start: { shotId: 's0002', atSeconds: 0.8 }, end: { shotId: 's0003', atSeconds: 'end' } }] },
    LANG: 'en', esc: value => String(value), T: {}, window: { STORY: { authoring: 'story-first' } } };
  assert.match(runInNewContext(source + '\nmusicLane([{i:0,s:SCENES[0]}])', context), /No score/);
  // A scene header passes its scene: silence nobody decided reads undecided, a decision shows its reason.
  assert.match(runInNewContext(source + '\nmusicCard([{i:0,s:SCENES[0]}], {no:1})', context), /Music undecided/);
  assert.match(runInNewContext(source + '\nmusicCard([{i:0,s:SCENES[0]}], {no:1,music:{decision:"none",reason:"only the line"}})', context), /No score.*only the line/);
  assert.match(runInNewContext(source + '\nmusicCard([{i:1,s:SCENES[1]}], {no:2,music:{decision:"score",reason:"regret"}})', context), /Scored.*piano.*s0002 \+0.8s → s0003 end.*regret/);
  for (const index of [1, 2]) assert.match(runInNewContext(source + `\nmusicLane([{i:${index},s:SCENES[${index}]}])`, context), /piano \(s0002 \+0.8s → s0003 end\)/);
  context.MUSIC.piano = { asset: 'piano' };
  context.safeSrc = value => value;
  context.window.REVIEW_SCORE_SOURCES = { piano: { asset: 'piano', href: '../../../assets/piano.wav' } };
  context.MUSIC.$timeline[0].sourceStartSeconds = 4;
  SCENES.forEach(s => { s.duration = 2; });
  const sceneCard = (index) => runInNewContext(source + `\nmusicCard([{i:${index},s:SCENES[${index}]}], {}, 2)`, context);
  assert.match(sceneCard(1), /0.8–2 s.*left:40%;width:60%/);
  assert.match(sceneCard(2), /0–2 s.*left:0%;width:100%/);
  assert.match(sceneCard(1), /data-length="1.2" data-skip="0" data-source-start="4"/);
  assert.match(sceneCard(2), /data-length="2" data-skip="1.2" data-source-start="4"/);
  assert.match(sceneCard(2), /<audio preload="metadata" src="\.\.\/\.\.\/\.\.\/assets\/piano.wav"/);
  context.MUSIC.piano.asset = 'changed';
  assert.doesNotMatch(sceneCard(2), /<audio /);
  assert.doesNotMatch(sceneCard(0), /score-track/);
  context.MUSIC.$timeline[0].end.atSeconds = 0;
  assert.doesNotMatch(sceneCard(1), /Continues into next scene/);
  assert.doesNotMatch(sceneCard(2), /score-track/);
  context.MUSIC.$timeline[0].end.atSeconds = 'end';
  context.MUSIC.$timeline[0].start.atSeconds = 2;
  assert.doesNotMatch(sceneCard(1), /score-track/);
  assert.doesNotMatch(sceneCard(2), /Continues from previous scene/);
  context.MUSIC.$timeline[0].start.atSeconds = 'end';
  assert.match(runInNewContext(source + '\nmusicLane([{i:1,s:SCENES[1]}])', context), /No score/);
});

test('offline score players resolve the assigned catalog asset and episode recording', t => {
  const channel = mkdtempSync(join(tmpdir(), 'review-music-'));
  t.after(() => rmSync(channel, {recursive:true,force:true}));
  const episode = join(channel, 'episodes', 'one'), dir = join(episode, 'storyboard');
  mkdirSync(dir, {recursive:true});
  mkdirSync(join(channel, 'assets', 'music'), {recursive:true});
  mkdirSync(join(episode, '.work'));
  writeFileSync(join(channel, 'assets/catalog.md'), '| bgm | original | music/score #1.mp3 | |\n');
  writeFileSync(join(channel, 'assets/music/score #1.mp3'), 'fixture');
  writeFileSync(join(episode, '.work/bgm-turn.wav'), 'fixture');
  const board = { MUSIC: { theme:{asset:'original'}, turn:{prompt:'A piano note'}, missing:{asset:'absent'} } };
  const {content} = require('../../skills/storyboard/references/audience-review-data.js').exportData(board, dir, true);
  const window = {}; runInNewContext(content, {window});
  assert.equal(window.REVIEW_SCORE_SOURCES.theme.href, '../../../assets/music/score%20%231.mp3');
  assert.equal(window.REVIEW_SCORE_SOURCES.turn.href, '../.work/bgm-turn.wav');
  assert.equal(window.REVIEW_SCORE_SOURCES.missing, undefined);
});

test('the scene links its audience cue to the starting shot and distinguishes a silent choice from pending timing', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const source = template.slice(template.indexOf('  var audienceRows ='), template.indexOf('  /* Music lane'));
  const words = [...template.matchAll(/^      audienceSound: (\{[^]*?\}),$/gm)].map(m => runInNewContext('(' + m[1] + ')'));
  const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const effect = { id: 'doubt', sfx: 'bowed-glass', trigger: 'her hand stills', atSeconds: 0.3,
    end: { shotId: 's0002', atSeconds: 'end' }, audience: { intent: 'doubt' } };
  const SCENES = [{ id: 's0001', scene: 1, sound: { effects: [effect] } }, { id: 's0002', scene: 2 }];
  const window = { SCENES, AUDIENCE_SPOTTING: require('../../skills/storyboard/references/audience-spotting.js'),
    STRUCTURE: { scenes: [{ no: 1 }, { no: 2, audienceSound: { decision: 'use', reason: '<hold her gaze>' } },
      { no: 3, audienceSound: { decision: 'none', reason: 'Keep her breath.' } }, { no: 4 }] } };
  const page = (i, labels) => runInNewContext(source + '\naudienceCard(' + (i + 1) + ',audiencePlan.scenes[' + i + '])', {
    SCENES, window, location: { href: 'file:///library/index.html?lang=en#scene-1' },
    sceneNoteHead: (kind, title, status) => title + ' / ' + status, T: { audienceSound: labels, shotCap: n => 'Shot ' + n }, esc, copy: esc,
  });
  assert.match(page(3, words[0]), /decision not recorded/);
  window.STORY = { audienceSoundVersion: 1 };
  assert.match(page(3, words[1]), /관객용 심리음 \/ 미정/);
  assert.match(page(1, words[0]), /use cue.*&lt;hold her gaze&gt;.*<a href="file:\/\/\/library\/index.html\?lang=en#shot-1">Shot 1 · doubt · timing unverified<\/a>/);
  assert.match(page(2, words[0]), /no cue.*Keep her breath/);
});

test('scene audition carries a bounded cue into the next scene and exports playable audio only for placed files', () => {
  const { previews } = require('../../skills/storyboard/references/audience-preview.js');
  const folder = mkdtempSync(join(tmpdir(), 'storyboard-preview-'));
  try {
    const file = join(folder, 'held.wav');
    execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=1',file]);
    const effect = { id:'hesitation', sfx:'held', audience:{intent:'wait'}, atSeconds:.25,
      sourceStartSeconds:.1, end:{shotId:'s0002', atSeconds:.25}, fadeInSeconds:.05, fadeOutSeconds:.05 };
    const board = { SCENES:[
      { id:'s0001', scene:1, duration:.5, sound:{effects:[effect]} },
      { id:'s0002', scene:2, duration:.5 },
      { id:'s0003', scene:3, duration:.5, sound:{effects:[{id:'pending', audience:{intent:'pause'}}]} },
    ] };
    const rows = [{ id:effect.id, shotId:'s0001', status:'placed', source:{available:true,path:file,sha256:'fixture'} },
      { id:'pending', shotId:'s0003', status:'planned', source:{available:false} }];
    assert.equal(previews(board,folder,rows,true).changed.length,2);
    assert.equal(existsSync(join(folder,'audience-previews')), false);
    const { scenes } = previews(board,folder,rows,false);
    assert.deepEqual(Object.values(scenes).map(scene => scene.entries.map(e => [e.start,e.end])),[[[.25,.5]],[[0,.25]],[[undefined,undefined]]]);
    assert.equal(scenes[3].file,undefined);
    const broken = join(folder,'unfinished.wav');writeFileSync(broken,'');
    const pending = previews(board, folder, [{...rows[1], source:{available:true,path:broken}}], false);
    assert.equal(pending.scenes[3].entries[0].sourceHref,null);
    for (const [no, activeHalf] of [[1,1],[2,0]]) {
      const raw = execFileSync('ffmpeg',['-v','error','-i',join(folder,scenes[no].file),'-f','s16le','-']);
      assert.equal(raw.length,48000);
      assert.ok(raw.subarray(activeHalf*24000,activeHalf*24000+24000).some(Boolean));
      assert.ok(raw.subarray((1-activeHalf)*24000,(1-activeHalf)*24000+24000).every(v=>v===0));
    }
    assert.deepEqual(previews(board,folder,rows,true).changed,[]);
  } finally { rmSync(folder,{recursive:true,force:true}); }
});

test('the scene player shows authored listening notes even before there is a playable cue', () => {
  const html = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const player = html.slice(html.indexOf('  function audiencePlayer('), html.indexOf('  /* Music lane'));
  const labels = [...html.matchAll(/^      audienceSound: (\{[^]*?\}),$/gm)].map(m => runInNewContext('(' + m[1] + ')'));
  const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const SCENES = [{ id: 's0001', scene: 1, sound: { audioSource: 'video', effects: [{ id: 'table', delivery: 'native' }] } }];
  const preview = { file: 'audience-previews/scene.wav', entries: [{ shotId: 's0001', id: 'smile', start: .3, end: 1 }] };
  const render = (row, p, lang = 0, previewCurrent = true, copy = esc) => runInNewContext(player + '\naudiencePlayer(1, row)', {
    row, SCENES, window: { AUDIENCE_PREVIEWS: { 1: p } }, previewCurrent, esc, copy, safeSrc: v => v || '',
    T: { audienceSound: labels[lang], sceneNamed: n => 'Scene ' + n, shotCap: n => 'Shot ' + n },
  });
  const row = { decision: 'use', perspective: 'Jin-su', shift: '  <his smile>  ', exit: 'Before the call' };
  for (const [lang, words] of labels.entries()) {
    const pending = render(row, undefined, lang);
    assert.ok(pending.includes('aria-label="' + words.preview + ' · Scene 1"><h4>' + words.preview + '</h4>'));
    for (const [key, text] of [['perspective', 'Jin-su'], ['shift', '&lt;his smile&gt;'], ['exit', 'Before the call']])
      assert.ok(pending.includes('<dt>' + words[key] + '</dt><dd>' + text + '</dd>'));
    assert.doesNotMatch(pending, /<audio|<button|data-cue-|table|<his smile>/);
  }
  const content = require('../../skills/storyboard/references/review-localization.js').reader({
    version: 1, sourceLanguage: 'en', languages: ['en', 'ko'],
    entries: [{ source: '<his smile>', translations: { ko: '<미소를 짓는다>' } }],
  }, 'ko');
  assert.match(render(row, undefined, 0, true, value => esc(content.text(value))), /<dd>&lt;미소를 짓는다&gt;<\/dd>/);
  const stale = render({ decision: 'use', shift: 'current direction', exit: ' ' }, preview, 0, false);
  assert.match(stale, /<dd>current direction<\/dd>/);
  assert.doesNotMatch(stale, /<audio|<button|Cue ending/);
  assert.equal(render({ decision: 'none', shift: 'old direction' }), '');
  assert.equal(render({ decision: 'use', shift: ' ' }), '');
  const legacy = render(undefined, preview);
  assert.match(legacy, /src="audience-previews\/scene\.wav"/);
  assert.match(legacy, /data-cue-start="0.3"/);
  assert.doesNotMatch(legacy, /<dl|table/);
});

test('the cliché strip and scene lanes show what is in the story, the user\'s pick and a recommendation', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  var CLICHES = window.CLICHES');
  const source = template.slice(start, template.indexOf('  // Character count', start));
  // The page's own strings, English first and Korean second in the template.
  const strings = [...template.matchAll(/^      cliche: \{[^]*?^      \},$/gm)].map(m => runInNewContext('({' + m[0].slice(0, -1) + '})').cliche);
  assert.equal(strings.length, 2);
  const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const page = (CLICHES, expression, T = strings[0], STRUCTURE) => runInNewContext(source + '\n' + expression, {
    window: { CLICHES, STRUCTURE }, T: { cliche: T }, esc, copy: esc, CONTENT: { text: s => s }, castName: id => id === 'jun' ? 'Jun' : id });
  const record = { version: 1, uses: [
    { id: 45, name: 'Cash envelope', layer: 'scene', need: 'obstacle', scenes: [3], shift: 'the mother is handed it', basis: 'default' },
    { name: '<img src=x onerror=alert(1)>', need: 'status', character: 'jun', basis: 'user' },
    { id: 9, name: 'Contract romance', need: 'bind', scenes: [3, 4], offered: true, caution: 'coercion', quote: true },
    null, 'x', { shift: 'no id and no name' }] };
  const lane = page(record, 'clicheLane(3)');
  assert.match(lane, /<b>#45 Cash envelope<\/b> <small>obstacle · by default<\/small> <span class="cliche-shift">changed — the mother is handed it<\/span>/);
  assert.match(lane, /class="cliche-chip offered caution"><b>#9 Contract romance<\/b> <small>kept together · recommended · not applied · caution · a quoted line<\/small>/);
  assert.equal(page(record, 'clicheLane(2)'), '');
  const strip = page(record, 'clicheStrip()');
  assert.match(strip, /Clichés <small>2 in the story · 1 recommended, waiting for your pick<\/small>/);
  assert.match(strip, /<b>&lt;img src=x onerror=alert\(1\)&gt;<\/b> <small>status · your pick<\/small><\/span><span>Jun<\/span>/);
  assert.match(strip, /<span>S#3, S#4<\/span>/);
  // A scene the board no longer has is marked, and a use with no recorded basis is not given one.
  const edited = page({ uses: [{ id: 5, name: 'Hand edit', scenes: [9, 3, 3, null, 'x', 1e21] }] }, 'clicheStrip()', strings[0], { scenes: [{ no: 3 }] });
  assert.match(edited, /<small>basis not recorded<\/small>/);
  assert.match(edited, /<span>S#3, S#9 <em class="cliche-missing">not on the board<\/em><\/span>/);
  assert.doesNotMatch(strip, /<img/);
  assert.equal((strip.match(/<li>/g) || []).length, 3, 'entries the page cannot read are skipped');
  // An open record, a declined one, and a board with no record at all.
  assert.match(page({ version: 1, uses: [] }, 'clicheStrip()'), /undecided — nothing is recorded yet/);
  assert.match(page({ version: 1, none: 'one quiet exchange', uses: [] }, 'clicheStatus()'), /^none used — one quiet exchange$/);
  assert.equal(page(undefined, 'clicheStrip()'), '');
  assert.equal(page('yes', 'clicheStrip()'), '');
  assert.match(page(record, 'clicheLane(4)', strings[1]), /한곳에 묶기 · 추천 · 적용 전 · 주의 · 실제 대사/);
  assert.match(page({ uses: [] }, 'clicheStatus()', strings[1]), /^미정/);
});

test('HTML creation and refresh keep one design while preserving episode metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-board-html-'));
  try {
    // No scenes, credentials, or network are required to create the review shell.
    assert.equal(storyboardHtml(dir).length, 28 + FONT_ASSETS.length);
    assert.ok(existsSync(join(dir,'audience-review-data.js')));
    assert.ok(existsSync(join(dir, 'ttalkkak-story.svg')));
    const file = join(dir, 'storyboard.html');
    const original = readFileSync(file, 'utf8');
    const title = '<title>Episode $& — 로컬 검토</title>';
    const metadata = '/* ✎ SB_DOC BEGIN */\nwindow.SB_DOC = { core: "$& keeps its text" };\n/* ✎ SB_DOC END */';
    const edited = original.replace(/^<title>[^]*?<\/title>/m, () => title)
      .replace(/\/\* ✎ SB_DOC BEGIN[^]*?\/\* ✎ SB_DOC END \*\//, () => metadata);
    writeFileSync(file, edited);
    assert.deepEqual(storyboardHtml(dir, true), []);
    writeFileSync(file, edited.replace('--bg: var(--ds-canvas)', '--bg: #000000'));
    writeFileSync(join(dir, 'render-routing.js'), 'stale runtime');
    assert.deepEqual(storyboardHtml(dir, true), ['storyboard.html', 'render-routing.js']);
    storyboardHtml(dir);
    assert.equal(readFileSync(file, 'utf8'), edited);
    assert.deepEqual(storyboardHtml(dir, true), []);
    writeFileSync(file, edited.replace('width=device-width', 'width=1920'));
    assert.deepEqual(storyboardHtml(dir, true), ['storyboard.html']);
    storyboardHtml(dir);
    assert.equal(readFileSync(file, 'utf8'), edited);
    assert.ok(readFileSync(file, 'utf8').includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
    assert.ok(!existsSync(join(dir, 'scenes.js')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check is read-only and malformed existing metadata is preserved for repair', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-board-html-check-'));
  try {
    const dir = join(root, 'storyboard');
    assert.equal(storyboardHtml(dir, true).length, 28 + FONT_ASSETS.length);
    assert.equal(existsSync(dir), false);
    storyboardHtml(dir);
    const file = join(dir, 'storyboard.html');
    const broken = '<title>Keep this</title>\ncustom metadata without markers';
    writeFileSync(file, broken);
    assert.throws(() => storyboardHtml(dir), /SB_DOC/);
    assert.equal(readFileSync(file, 'utf8'), broken);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Board values come from model output and web research; the review page opens in the owner's browser.
test('review HTML never turns javascript: or data: board values into links', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const safeSrc = runInNewContext('(' + template.match(/function safeSrc\(src\) \{[^\n]*\}/)[0] + ')');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:x', 'data:text/html,x', '//evil.example/a.png', 'a\u0000.png'])
    assert.equal(safeSrc(bad), '', bad);
  assert.equal(safeSrc('../media/room.png'), '../media/room.png');
  const start = template.indexOf('  function locationSheetsHtml(');
  const sheets = template.slice(start, template.indexOf('  h += locationSheetsHtml', start));
  const context = { window: {}, LANG: 'ko', esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    doc: { locations: [{ id: 'room', name: 'room', imageUrl: 'javascript:alert(1)', sheetPath: 'data:text/html,unsafe' }] }, shots: [] };
  const render = () => runInNewContext(sheets + '\nlocationSheetsHtml(doc, shots)', context);
  assert.doesNotMatch(render(), /(?:src|href)="(?:javascript|data):/);
  context.doc.locations[0].imageUrl = '../media/room.png';
  assert.match(render(), /src="\.\.\/media\/room\.png"/);
  context.doc.locations[0].panels = { front: '../media/front.png', back: '../media/back.png' };
  assert.match(render(), /src="\.\.\/media\/front\.png"/);
  assert.match(render(), /src="\.\.\/media\/back\.png"/);
  assert.doesNotMatch(render(), /src="\.\.\/media\/room\.png"/);
  context.doc.locations[0].panels.back = 'javascript:alert(1)';
  assert.doesNotMatch(render(), /(?:src|href)="javascript:/);

});
