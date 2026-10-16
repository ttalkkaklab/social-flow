import { test } from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../skills/storyboard/references/structure-contract.js';

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
const warnings = win => contract.check(win, { draft: true }).filter(f => f.level === 'warn').map(f => f.what);

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
