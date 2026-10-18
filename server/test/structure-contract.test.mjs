import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { applyPatch, contract, shotSchema, storyboardApplySchema } from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
import structure from '../../skills/storyboard/references/structure-contract.js';
const require = createRequire(import.meta.url);
const { assemble } = require('../../skills/storyboard/references/assemble-bg-prompt.js');
const C = contract();

describe('composition', () => {
  const plan = extra => ({ mode: 'standard', subject: 'A', subjectKind: 'face', position: 'left', eyeHeight: .33, headroom: 'natural', lookRoom: 'right', movement: 'stationary', leadRoom: 'none', ...extra });
  const shot = c => ({ type: 'points', scene: 1, shot: { size: 'mcu', ...(c === undefined ? {} : { composition: c }) } });
  const bad = xs => C.checkCompositions(xs, false).filter(f => f.level === 'bad');
  test('composition legacy, scene enrollment and draft behavior', () => {
   assert.equal(C.checkCompositions([shot()], false)[0].level, 'warn');
   assert.ok(bad([shot(plan()), shot()]).length);
   assert.ok(C.checkCompositions([shot(plan()), shot()], true).some(f => f.level === 'later'));
   assert.deepEqual(bad([shot({mode:'none',reason:'Landscape'})]), []);
   assert.deepEqual(C.checkCompositions([{type:'points',shot:{size:'ls'}}],false), []);
  });
  test('composition schema accepts creative departures but rejects nonobjects and requires face and exception fields', () => {
   for (const c of [null, [], {}, plan({eyeHeight: 2}), plan({eyeHeight: NaN}), plan({position:'top'}), plan({headroom:'na'}), plan({extra:true}), {mode:'intentional'}, {mode:'none'}, {mode:'none',reason:'x',position:'left'}])
    assert.equal(shotSchema.safeParse(shot(c)).success, c !== null && !Array.isArray(c), JSON.stringify(c));
   for (const key of ['eyeHeight','headroom','lookRoom']) { const c=plan();delete c[key];assert.ok(C.validateComposition(c).length); }
   assert.equal(shotSchema.safeParse(shot(plan())).success, true);
   assert.deepEqual(C.validateComposition({mode:'standard',subject:'car',subjectKind:'object',position:'left',movement:'right',leadRoom:'right'}), []);
  });
  test('gaze and travel can oppose; intentional direction departures require reason', () => {
   const s=shot(plan({movement:'left',leadRoom:'left'}));
   s.shot.eyeline={mode:'look',subject:'A',horizontal:'right'};
   assert.deepEqual(bad([s]), []);
   s.shot.composition.leadRoom='right'; assert.ok(bad([s]).length);
   s.shot.composition.mode='intentional';s.shot.composition.reason='Pursuit';assert.deepEqual(bad([s]), []);
   s.shot.composition.subject='B';assert.ok(bad([s]).length);
  });
  test('upper thirds and crop conventions are advisory, explicit layout conflict warns', () => {
   assert.deepEqual(bad([shot(plan({eyeHeight:.7,headroom:'cropped'}))]), []);
   const s=shot(plan());s.shot.space={layout:'A on the right third'};
   assert.ok(C.checkCompositions([s],false).some(f=>f.what.includes('layout')));
   const x=shot(plan({subject:'A[1]'})); x.shot.space={layout:'A[1] on the right third'};
   assert.ok(C.checkCompositions([x],false).some(f=>f.what.includes('layout')));
  });
  test('composition reaches image prompt and respects none', () => {
   assert.match(assemble({scene:'A waits',composition:plan()}).prompt,/eyes 33% from top/);
   assert.doesNotMatch(assemble({scene:'A waits',composition:{mode:'none',reason:'No face'}}).prompt,/headroom/);
  });
});

describe('depth', () => {
  const shallow = extra => ({ mode: 'shallow', reads: 1, focus: "A's eyes", ...extra });
  const deep = extra => ({ mode: 'deep', reads: 3, planes: ['the cup', 'A at the table', 'the window'], ...extra });
  const shot = (d, size = 'mcu') => ({ type: 'points', scene: 1, shot: { size, ...(d === undefined ? {} : { depth: d }) } });
  const bad = xs => C.checkDepths(xs, false).filter(f => f.level === 'bad');
  const warns = xs => C.checkDepths(xs, false).filter(f => f.level === 'warn');
  test('depth legacy, scene enrollment and draft behavior', () => {
   assert.equal(C.checkDepths([shot()], false)[0].level, 'warn');
   assert.ok(bad([shot(shallow()), shot()]).length);
   assert.ok(C.checkDepths([shot(shallow()), shot()], true).some(f => f.level === 'later'));
   assert.deepEqual(C.checkDepths([shot({ mode: 'none', reason: 'Flat graphic' })], false), []);
   assert.deepEqual(C.checkDepths([{ type: 'points', shot: { size: 'ls' } }], false), []);
   assert.ok(C.depthNeeded({ type: 'points', shot: { size: 'ls', render: { mode: 'still_camera', camera: { effect: 'rack-focus' } } } }));
   assert.equal(C.depthNeeded({ type: 'points', shot: { size: 'cu', render: { mode: 'object_html' } } }), false);
  });
  test('deep focus cannot ride a still-camera focus effect', () => {
   const s = shot(deep(), 'ms'); s.shot.render = { mode: 'still_camera', camera: { effect: 'focus-in' } };
   assert.ok(bad([s]).some(f => /focus-in/.test(f.what)));
   s.shot.depth = shallow(); assert.deepEqual(bad([s]), []);
  });
  test('depth cross-checks warn on faces, partners and sound perspective', () => {
   const face = shot(shallow({ focus: 'the hands' })); face.shot.composition = { mode: 'standard', subject: 'A', subjectKind: 'face', position: 'left', eyeHeight: .33, headroom: 'natural', lookRoom: 'right', movement: 'stationary', leadRoom: 'none' };
   assert.ok(warns([face]).some(f => /eyes/.test(f.what)));
   assert.ok(warns([shot(shallow(), 'two')]).some(f => /partner/.test(f.what)));
   assert.ok(warns([shot(deep({ sound: 'near' }))]).some(f => /sound/.test(f.what)));
   assert.deepEqual(warns([shot(shallow({ sound: 'near' }))]), []);
  });
  test('depth reaches image prompt and respects none', () => {
   assert.match(assemble({ scene: 'A waits', depth: shallow() }).prompt, /Shallow depth of field: only A's eyes is sharp/);
   assert.match(assemble({ scene: 'A waits', depth: deep() }).prompt, /Deep focus: the cup, A at the table, the window/);
   assert.doesNotMatch(assemble({ scene: 'A waits', depth: { mode: 'none', reason: 'Flat' } }).prompt, /focus/);
  });
});

describe('eyeline', () => {
  const eye = (extra = {}) => ({ mode: 'exchange', subject: 'A', target: 'B', horizontal: 'right', vertical: 'up', targetDistance: 'near', matchShot: 2, ...extra });
  const shot = (eyeline) => ({ type: 'points', scene: 1, shot: { size: 'mcu', space: { line: 'A left, B right' }, ...(eyeline === undefined ? {} : { eyeline }) } });
  const pair = () => [shot(eye()), shot(eye({ subject: 'B', target: 'A', horizontal: 'left', vertical: 'down', matchShot: 1 }))];
  const errors = shots => C.checkEyelines(shots, false).filter(f => f.level === 'bad');
  test('legacy gaps warn; unrelated cuts omit; enrolled gaze cuts require records; draft defers', () => {
    assert.equal(C.checkEyelines([shot(undefined)], false)[0].level, 'warn');
    assert.deepEqual(C.checkEyelines([{ type: 'points', shot: { size: 'ls' } }], false), []);
    const xs = pair(); delete xs[1].shot.eyeline;
    assert.ok(errors(xs).length);
    assert.ok(C.checkEyelines(xs, true).every(f => f.level === 'later'));
    assert.deepEqual(errors([shot({ mode: 'none', reason: 'Axis follows cart motion' })]), []);
  });
  test('exchange checks actor pairs, horizontal and vertical direction and distance', () => {
    assert.deepEqual(errors(pair()), []);
    for (const change of [{ horizontal: 'right' }, { vertical: 'up' }, { targetDistance: 'far' }, { target: 'C' }, { mode: 'look' }]) {
      const xs = pair(); Object.assign(xs[1].shot.eyeline, change); assert.ok(errors(xs).length);
    }
  });
  test('POV and reaction link the same owner and target, missing reaction warns', () => {
    const base = eye({ mode: 'look' }); delete base.matchShot;
    const xs = [shot(base), shot({ ...base, mode: 'pov', matchShot: 1 }), shot({ ...base, mode: 'reaction', matchShot: 2 })];
    assert.deepEqual(C.checkEyelines(xs, false), []);
    assert.ok(C.checkEyelines(xs.slice(0, 2), false).some(f => f.level === 'warn'));
    xs[2].shot.eyeline.matchShot = 1; assert.ok(errors(xs).length);
  });
  test('references reject self, absent target and cross-scene links', () => {
    for (const n of [1, 3]) { const xs = pair(); xs[0].shot.eyeline.matchShot = n; assert.ok(errors(xs).length); }
    const xs = pair(); xs[1].scene = 2; assert.ok(errors(xs).length);
  });
  test('insert remaps references without mutating input and removal refuses dangling references', () => {
    const win = { SCENES: pair() }, before = JSON.stringify(win);
    const r = applyPatch(win, storyboardApplySchema.parse({ path: 'unused', insertShots: [{ after: 0, shots: [{ type: 'points', scene: 1, shot: { size: 'ls' } }] }] }));
    assert.equal(r.win.SCENES[1].shot.eyeline.matchShot, 3);
    assert.equal(r.win.SCENES[2].shot.eyeline.matchShot, 2);
    assert.equal(JSON.stringify(win), before);
    assert.throws(() => applyPatch(win, storyboardApplySchema.parse({ path: 'unused', removeShots: [2] })), /target was removed/);
  });
  test('removeShotIds remaps references like a positional remove and refuses a dropped target (R7)', () => {
    const ids = (xs) => xs.map((s, i) => ({ ...s, id: `s000${i + 1}` }));
    // [s0001, s0002, s0003(matchShot:2)] — dropping s0001 by id must move the reference to 1, not leave it at 2 (itself).
    const base = { SCENES: ids([shot(undefined), shot(undefined), shot(eye({ mode: 'reaction', subject: 'B', target: 'A', matchShot: 2 }))]) };
    const r = applyPatch(base, storyboardApplySchema.parse({ path: 'unused', removeShotIds: ['s0001'] }));
    assert.deepEqual(r.win.SCENES.map((s) => s.id), ['s0002', 's0003']);
    assert.equal(r.win.SCENES[1].shot.eyeline.matchShot, 1);
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'unused', removeShotIds: ['s0002'] })), /target was removed/);
  });
  test('source prompts use eyeline but skip none', () => {
    assert.match(assemble({ size: 'mcu', eyeline: eye() }).prompt, /A looks at B, screen-right, up, target distance near/);
    assert.doesNotMatch(assemble({ size: 'ls', eyeline: { mode: 'none', reason: 'landscape' } }).prompt, /No gaze/);
  });
  test('draft rejects a supplied dangling reference while omitted creative metadata stays optional', () => {
    const xs = pair(); xs[0].shot.eyeline.matchShot = 9;
    const STRUCTURE = { version: 'structure-v1', sequences: [{ id: 'q1', title: 'Conversation', purpose: 'Will B answer?', scenes: [1] }], scenes: [{ no: 1, place: 'Kitchen', time: 'Day', event: 'B refuses the request', charge: { open: '+', close: '-' }, turn: 'A loses trust' }] };
    const r = applyPatch({ SCENES: xs, STRUCTURE }, storyboardApplySchema.parse({ path: 'unused', draft: true }));
    assert.ok(r.findings.some(f => f.level === 'bad' && f.what.includes('matchShot')));
  });
  test('shared target and explicit artistic exceptions do not impose reciprocal gaze', () => {
    const a = eye({ mode: 'shared', target: 'door' });
    const b = eye({ mode: 'shared', subject: 'B', target: 'door', vertical: 'level', matchShot: 1 });
    assert.deepEqual(errors([shot(a), shot(b)]), []);
    b.target = 'window'; assert.ok(errors([shot(a), shot(b)]).length);
    const intentional = eye({ mode: 'intentional', reason: 'The cut deliberately disorients the viewer' });
    assert.deepEqual(errors([shot(intentional), shot({ mode: 'lens', subject: 'B' })]), []);
  });
});

test('composition, depth and eyeline MCP schemas are shared across every write route', () => {
  const p = TOOLS.find(t => t.name === 'storyboard_apply').inputSchema.properties;
  for (const s of [p.set.properties.shots.items, p.shots.items.properties.shot, p.insertShots.items.properties.shots.items]) {
    const fields = s.properties.shot.properties;
    assert.equal(fields.composition.additionalProperties, true);
    assert.equal(fields.depth.additionalProperties, true);
    assert.equal(fields.eyeline.properties.matchShot.minimum, 1);
  }
});

describe('story-v2 performance warnings', () => {
  function fixture(version = 'story-v2') {
    const events = ['아이가 열린 문 앞에 선다.', '아이가 문을 닫는다.'];
    return {
      STORY: { version }, COMPREHENSION: { takeaway: 'Trust takes time and costs something.' },
      STRUCTURE: { version: 'structure-v1', sequences: [{ id: 'q1', title: 'Doors', purpose: 'A choice', scenes: [1, 2, 3, 4, 5] }],
        scenes: [1, 2, 3, 4, 5].map(no => ({ no, place: '방' + no, time: '낮',
          event: events[1], turn: '열린 문 → 닫힌 문', charge: { open: '-', close: '+' }, out: events[1] })) },
      SCENES: [1, 2, 3, 4, 5].map((scene, i) => ({ id: 's' + String(scene).padStart(4, '0'), scene, type: 'points', beat: i ? 'drip' : 'hook',
        duration: 4, narration: [], performance: events.map(text => ({ kind: 'action', character: 'child', text })),
        visual: { action: events.join(' ') },
        shot: { size: 'ls', angle: 'eye', feel: '불안', info: 'Door choice ' + scene, infoType: 'other',
          render: { mode: 'still_camera' }, space: { layout: '넓은 방 전체와 탁자.' } } })) };
  }
  const warnings = win => structure.check(win, { draft: true }).filter(f => f.level === 'warn').map(f => f.what);

  test('story-v2 silent performance does not force a spoken moral, two-shot scene or spoken turn labels', () => {
    const current = warnings(fixture());
    assert.ok(!current.some(w => /COMPREHENSION.takeaway|one shot — coverage|no line.*pole|turn.*in no line|drawn by no shot|no matching layout/.test(w)), current.join('\n'));
    const legacy = warnings(fixture('story-v1'));
    assert.ok(legacy.some(w => /COMPREHENSION.takeaway/.test(w)));
    assert.ok(legacy.some(w => /one shot — coverage/.test(w)));
    assert.ok(legacy.some(w => /turn.*in no line/.test(w)));
  });

  test('story-v2 still reports genuine charge mismatch, missing event plan and invalid size/layout', () => {
    const win = fixture();
    win.SCENES[0].shot.feel = '안도';
    win.SCENES[0].shot.space.layout = '얼굴 클로즈업';
    win.STRUCTURE.scenes[0].event = '기차가 철교 위에서 폭발한다.';
    const found = warnings(win);
    assert.ok(found.some(w => /charge.open.*first shot.*안도/.test(w)));
    assert.ok(found.some(w => /no matching layout, visual action or ordered performance/.test(w)));
    assert.ok(found.some(w => /size.*layout is a close view/.test(w)));
  });

  test('story-v2 checks the order of action and resolved speech within a single shot', () => {
    const win = fixture();
    win.STRUCTURE.scenes[0].turn = '거절 → 수락';
    win.SCENES[0].narration = [{ speaker: 'child', tts: '수락' }];
    win.SCENES[0].performance = [{ kind: 'dialogue', character: 'child', group: 1 }, { kind: 'action', character: 'child', text: '거절' }];
    assert.ok(warnings(win).some(w => /reversed evidence in ordered performance/.test(w)));
    win.SCENES[0].performance.reverse();
    assert.ok(!warnings(win).some(w => /reversed evidence in ordered performance/.test(w)));
    win.SCENES[0].performance = [{ kind: 'dialogue', character: 'child', group: 99 }];
    assert.ok(warnings(win).some(w => /no readable ordered performance/.test(w)));
  });

  test('showing an object to a character is a concrete action, not an explanatory summary', () => {
    const win = fixture(); win.STRUCTURE.scenes[0].event = '장석주가 수첩의 붉은 문을 경찰에게 보여 준다.';
    assert.ok(!warnings(win).some(w => /붉은 문.*says what the viewer learns/.test(w)));
    win.STRUCTURE.scenes[0].event = '통치의 원리를 보여 준다.';
    assert.ok(warnings(win).some(w => /통치의 원리.*says what the viewer learns/.test(w)));
  });
});

describe('shot ids', () => {
  const board = ids => ({ SCENES: ids.map(id => ({ ...(id === undefined ? {} : { id }), type: 'points', narration: [] })) });
  const idFindings = findings => findings.filter(f => /^id:/.test(f.what));
  test('shared ID syntax matches the server for defined IDs, including spliced shots and absent structure', () => {
    const invalid = ['return', 's123', 42, null, '', 's0001x', 'S0001'];
    const win = board(invalid); win.SCENES[0].type = 'broll';
    const original = JSON.stringify(win);
    const findings = idFindings(structure.check(win, { draft: true }));
    assert.equal(findings.length, invalid.length);
    assert.ok(findings.every(f => f.level === 'bad'));
    assert.equal(JSON.stringify(win), original);
    assert.deepEqual(idFindings(structure.check(board([undefined, 's0001', 's12345']), { draft: true })), []);
    const duplicate = idFindings(structure.check(board(['s0002', 's0002']), { draft: true }));
    assert.equal(duplicate.length, 1);
    assert.equal(duplicate[0].where, 'shot 2');
    assert.match(duplicate[0].what, /duplicate s0002 \(already used by shot 1\)/);
  });
});
