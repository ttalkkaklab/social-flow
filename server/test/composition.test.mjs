import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { contract, shotSchema } from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const C = contract();
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
test('composition schema rejects invalid values and requires face and exception fields', () => {
 for (const c of [null, [], {}, plan({eyeHeight: 2}), plan({eyeHeight: NaN}), plan({position:'top'}), plan({headroom:'na'}), plan({extra:true}), {mode:'intentional'}, {mode:'none'}, {mode:'none',reason:'x',position:'left'}])
  assert.equal(shotSchema.safeParse(shot(c)).success, false, JSON.stringify(c));
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
test('composition MCP schema is shared across every write route', () => {
 const p=TOOLS.find(t=>t.name==='storyboard_apply').inputSchema.properties;
 for(const s of [p.set.properties.shots.items,p.shots.items.properties.shot,p.insertShots.items.properties.shots.items])
  assert.deepEqual(s.properties.shot.properties.composition,C.COMPOSITION_SCHEMA);
});
test('composition reaches image prompt and respects none', () => {
 const {assemble}=require('../../skills/storyboard/references/assemble-bg-prompt.js');
 assert.match(assemble({scene:'A waits',composition:plan()}).prompt,/eyes 33% from top/);
 assert.doesNotMatch(assemble({scene:'A waits',composition:{mode:'none',reason:'No face'}}).prompt,/headroom/);
});
