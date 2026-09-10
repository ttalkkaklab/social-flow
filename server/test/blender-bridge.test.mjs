/**
 * Blender bridge — request schemas, the embedded script's syntax, and (when a Blender is
 * installed here) round trips: build → camera → animate → read → render, a posed person,
 * and a motion-capture clip retargeted onto the person's rig.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  BLENDER_PROXY_KINDS,
  BLENDER_RIG_BONES,
  BRIDGE_PY,
  DEFAULT_PREVIZ_ENGINE,
  MAX_PREVIZ_FRAMES,
  animateObject,
  blenderCameraSetSchema,
  blenderMotionImportSchema,
  blenderObjectAnimateSchema,
  blenderPoseKeySchema,
  blenderRenderPrevizSchema,
  blenderSceneBuildSchema,
  blenderSceneReadSchema,
  buildScene,
  describeKeys,
  importMotion,
  poseKey,
  previzTimeoutMs,
  readScene,
  renderPreviz,
  setCamera,
} from '../dist/blender-bridge.js';
import { blenderBin } from '../dist/config.js';

describe('blender bridge schemas', () => {
  it('blendPath must be a .blend without ".." and comes back absolute', () => {
    assert.ok(!blenderSceneReadSchema.safeParse({ blendPath: 'scene.txt' }).success);
    assert.ok(!blenderSceneReadSchema.safeParse({ blendPath: '../x/scene.blend' }).success);
    const ok = blenderSceneReadSchema.safeParse({ blendPath: 'work/scene.blend' });
    assert.ok(ok.success);
    assert.ok(ok.data.blendPath.startsWith('/') || /^[A-Za-z]:\\/.test(ok.data.blendPath));
  });

  it('build fills defaults, rejects duplicate names and a box without size', () => {
    const ok = blenderSceneBuildSchema.safeParse({ blendPath: 's.blend', proxies: [{ name: 'man', kind: 'person' }] });
    assert.ok(ok.success);
    // fps · range · resolution stay undefined here: Blender applies the fresh-scene defaults,
    // and reset:false keeps the file's values when they are omitted
    assert.equal(ok.data.fps, undefined);
    assert.equal(ok.data.frameEnd, undefined);
    assert.equal(ok.data.reset, true);
    assert.equal(ok.data.force, false);
    assert.equal(ok.data.floor, true);
    assert.deepEqual(ok.data.proxies[0].location, [0, 0, 0]);
    assert.ok(!blenderSceneBuildSchema.safeParse({ blendPath: 's.blend', frameStart: 10, frameEnd: 5 }).success);
    assert.ok(!blenderSceneBuildSchema.safeParse({ blendPath: 's.blend', width: 217 }).success, 'odd width is refused before Blender runs');
    assert.ok(!blenderSceneBuildSchema.safeParse({ blendPath: 's.blend', proxies: [{ name: '가'.repeat(22), kind: 'sphere' }] }).success, '66 bytes of UTF-8 is over the 4.x name cap');
    assert.ok(blenderSceneBuildSchema.safeParse({ blendPath: 's.blend', proxies: [{ name: '가'.repeat(21), kind: 'sphere' }] }).success, '63 bytes passes');

    const dupe = blenderSceneBuildSchema.safeParse({
      blendPath: 's.blend',
      proxies: [{ name: 'a', kind: 'person' }, { name: 'a', kind: 'dog' }],
    });
    assert.ok(!dupe.success);
    assert.match(JSON.stringify(dupe.error.issues), /unique/);

    const box = blenderSceneBuildSchema.safeParse({ blendPath: 's.blend', proxies: [{ name: 'crate', kind: 'box' }] });
    assert.ok(!box.success);
    assert.match(JSON.stringify(box.error.issues), /size/);

    const kinds = blenderSceneBuildSchema.safeParse({
      blendPath: 's.blend',
      proxies: BLENDER_PROXY_KINDS.map((kind, i) => ({ name: `p${i}`, kind, size: [1, 1, 1] })),
    });
    assert.ok(kinds.success);
  });

  it('camera keys need target xor rotationDeg, frames when there are several, and no repeats', () => {
    const one = blenderCameraSetSchema.safeParse({ blendPath: 's.blend', keys: [{ location: [0, -5, 1.5], target: [0, 0, 1] }] });
    assert.ok(one.success, 'a single static key needs no frame');
    assert.equal(one.data.interpolation, 'LINEAR');

    const both = blenderCameraSetSchema.safeParse({
      blendPath: 's.blend',
      keys: [{ location: [0, -5, 1.5], target: [0, 0, 1], rotationDeg: [90, 0, 0] }],
    });
    assert.ok(!both.success);

    const noFrame = blenderCameraSetSchema.safeParse({
      blendPath: 's.blend',
      keys: [{ location: [0, -5, 1.5], target: [0, 0, 1] }, { location: [0, -3, 1.5], target: [0, 0, 1] }],
    });
    assert.ok(!noFrame.success);

    const twice = blenderCameraSetSchema.safeParse({
      blendPath: 's.blend',
      keys: [{ frame: 1, location: [0, -5, 1.5], target: [0, 0, 1] }, { frame: 1, location: [0, -3, 1.5], target: [0, 0, 1] }],
    });
    assert.ok(!twice.success);

    const same = blenderCameraSetSchema.safeParse({ blendPath: 's.blend', keys: [{ location: [1, 1, 1], target: [1, 1, 1] }] });
    assert.ok(!same.success, 'target equal to location has no direction');

    const lensAndFov = blenderCameraSetSchema.safeParse({
      blendPath: 's.blend', lensMm: 35, fovDeg: 60, keys: [{ location: [0, -5, 1.5], target: [0, 0, 1] }],
    });
    assert.ok(!lensAndFov.success);
  });

  it('object keys need a channel and a frame each', () => {
    assert.ok(!blenderObjectAnimateSchema.safeParse({ blendPath: 's.blend', object: 'can', keys: [{ frame: 1 }] }).success);
    assert.ok(!blenderObjectAnimateSchema.safeParse({ blendPath: 's.blend', object: 'can', keys: [{ location: [0, 0, 0] }] }).success);
    const ok = blenderObjectAnimateSchema.safeParse({
      blendPath: 's.blend', object: 'can', keys: [{ frame: 1, location: [0, 0, 1] }, { frame: 30, location: [2, 0, 1], scale: 0.5 }],
    });
    assert.ok(ok.success);
  });

  it('render defaults to workbench mp4 and caps the frame count', () => {
    const ok = blenderRenderPrevizSchema.safeParse({ blendPath: 's.blend' });
    assert.ok(ok.success);
    assert.equal(ok.data.engine, DEFAULT_PREVIZ_ENGINE);
    assert.equal(ok.data.filename, 'previz.mp4');
    assert.equal(ok.data.stamp, true);
    assert.ok(!blenderRenderPrevizSchema.safeParse({ blendPath: 's.blend', filename: 'previz.webm' }).success);
    assert.ok(!blenderRenderPrevizSchema.safeParse({ blendPath: 's.blend', frameStart: 1, frameEnd: MAX_PREVIZ_FRAMES + 1 }).success);
    assert.ok(!blenderRenderPrevizSchema.safeParse({ blendPath: 's.blend', filename: '../previz.mp4' }).success);
    assert.ok(!blenderRenderPrevizSchema.safeParse({ blendPath: 's.blend', height: 961 }).success, 'odd height is refused before Blender runs');
  });

  it('the render timeout grows with the frame count and the engine', () => {
    assert.ok(previzTimeoutMs(300, 'eevee') > previzTimeoutMs(300, 'workbench'));
    assert.ok(previzTimeoutMs(3000, 'eevee') <= 60 * 60_000);
  });

  it('pose keys need a frame and at least one body group, and only rig bones in the raw map', () => {
    const ok = blenderPoseKeySchema.safeParse({
      blendPath: 's.blend',
      object: 'dancer',
      keys: [{ frame: 1, pose: { armL: { raise: 90, elbow: 45 } } }, { frame: 30, pose: { hips: { offset: [0, 0, -0.2] }, legL: { knee: 60 } } }],
    });
    assert.ok(ok.success, ok.success ? '' : JSON.stringify(ok.error.issues));
    assert.equal(ok.data.interpolation, 'BEZIER', 'a body eases by default');
    assert.equal(ok.data.clearExisting, true);
    assert.ok(!blenderPoseKeySchema.safeParse({ blendPath: 's.blend', object: 'dancer', keys: [{ frame: 1, pose: {} }] }).success, 'an empty pose keys nothing');
    assert.ok(!blenderPoseKeySchema.safeParse({ blendPath: 's.blend', object: 'dancer', keys: [{ frame: 1, pose: { armL: { swing: 10 } } }] }).success, 'an unknown channel is refused');
    assert.ok(!blenderPoseKeySchema.safeParse({ blendPath: 's.blend', object: 'dancer', keys: [{ frame: 1, pose: { bones: { tail: [0, 0, 10] } } }] }).success, 'a bone the rig does not have is refused');
    assert.ok(blenderPoseKeySchema.safeParse({ blendPath: 's.blend', object: 'dancer', keys: [{ frame: 1, pose: { bones: { [BLENDER_RIG_BONES[6]]: [0, 0, 10] } } }] }).success);
    const twice = blenderPoseKeySchema.safeParse({ blendPath: 's.blend', object: 'dancer', keys: [{ frame: 5, pose: { head: { nod: 10 } } }, { frame: 5, pose: { head: { nod: 20 } } }] });
    assert.ok(!twice.success);
    assert.ok(!blenderPoseKeySchema.safeParse({ blendPath: 's.blend', object: 'dancer', keys: [{ frame: 1, pose: { armL: { raise: 400 } } }] }).success, 'more than a full turn is a typo');
  });

  it('motion import takes .bvh or .fbx, a slice in seconds and a rig-bone map', () => {
    const ok = blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: 'clip.bvh' });
    assert.ok(ok.success);
    assert.equal(ok.data.fromSeconds, 0);
    assert.equal(ok.data.speed, 1);
    assert.equal(ok.data.loop, false);
    assert.equal(ok.data.rootMotion, 'inplace');
    assert.ok(ok.data.motionPath.startsWith('/') || /^[A-Za-z]:\\/.test(ok.data.motionPath), 'the path comes back absolute');
    assert.ok(blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: 'clip.FBX' }).success);
    assert.ok(!blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: 'clip.glb' }).success);
    assert.ok(!blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: '../clip.bvh' }).success);
    assert.ok(!blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: 'clip.bvh', fromSeconds: 5, toSeconds: 5 }).success, 'an empty slice');
    assert.ok(!blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: 'clip.bvh', boneMap: { tail: 'Tail' } }).success, 'only rig bones can be mapped');
    assert.ok(blenderMotionImportSchema.safeParse({ blendPath: 's.blend', object: 'dancer', motionPath: 'clip.bvh', boneMap: { 'thigh.L': 'LeftUpLeg' }, speed: 1.5, loop: true }).success);
  });

  it('long key lists collapse to a range in the summary', () => {
    assert.equal(describeKeys([1, 12, 20]), 'keys [1, 12, 20]');
    assert.equal(describeKeys(Array.from({ length: 151 }, (_, i) => i + 1)), 'keys 1–151 (151)');
    assert.equal(describeKeys([]), '');
  });
});

/**
 * A ten-frame Biovision clip in the vocabulary CMU and Mixamo share: T-pose at the first
 * frame, the left arm dropping to the side by the last, the hips walking 50 units forward.
 * Units are centimetres; the figure faces the file's +Z, which the importer turns to -Y.
 */
function syntheticBvh() {
  const joint = (name, offset, children) =>
    `JOINT ${name}\n{\nOFFSET ${offset}\nCHANNELS 3 Zrotation Xrotation Yrotation\n${children}\n}`;
  const end = (offset) => `End Site\n{\nOFFSET ${offset}\n}`;
  const arm = (side, s) =>
    joint(`${side}Shoulder`, `${3 * s} 15 0`, joint(`${side}Arm`, `${12 * s} 0 0`, joint(`${side}ForeArm`, `${28 * s} 0 0`, joint(`${side}Hand`, `${25 * s} 0 0`, end(`${10 * s} 0 0`)))));
  const leg = (side, s) => joint(`${side}UpLeg`, `${9 * s} 0 0`, joint(`${side}Leg`, '0 -42 0', joint(`${side}Foot`, '0 -40 0', end('0 -8 15'))));
  const hierarchy =
    `HIERARCHY\nROOT Hips\n{\nOFFSET 0 90 0\nCHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation\n` +
    joint('Spine', '0 10 0', joint('Chest', '0 20 0', joint('Neck', '0 20 0', joint('Head', '0 8 0', end('0 15 0'))) + '\n' + arm('Left', 1) + '\n' + arm('Right', -1))) +
    '\n' + leg('Left', 1) + '\n' + leg('Right', -1) + '\n}\n';
  // channel order follows the hierarchy: Hips(6) Spine Chest Neck Head LShoulder LArm LForeArm LHand RShoulder RArm RForeArm RHand LUpLeg LLeg LFoot RUpLeg RLeg RFoot (3 each)
  const lines = [];
  for (let f = 0; f < 10; f++) {
    const u = f / 9;
    const values = [0, 0, 50 * u, 0, 0, 0]; // hips: walk forward along +Z
    for (let j = 0; j < 18; j++) {
      const isLeftArm = j === 5; // LeftArm: T-pose (along +X) → hanging (-90° about Z)
      values.push(isLeftArm ? -90 * u : 0, 0, 0);
    }
    lines.push(values.map((v) => v.toFixed(4)).join(' '));
  }
  return `${hierarchy}MOTION\nFrames: 10\nFrame Time: 0.033333\n${lines.join('\n')}\n`;
}

describe('embedded bridge script', () => {
  it('has no template-literal escapes and parses as Python', () => {
    assert.ok(!BRIDGE_PY.includes('`'), 'a backtick would end the template literal');
    assert.ok(!BRIDGE_PY.includes('${'), 'a ${ would interpolate inside the template literal');
    let python = '';
    for (const candidate of ['python3', 'python']) {
      try {
        execFileSync(candidate, ['-c', 'import sys'], { stdio: 'ignore' });
        python = candidate;
        break;
      } catch {
        // try the next name
      }
    }
    if (!python) return; // no interpreter here — Blender compiles it in the round trip below
    execFileSync(python, ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], { input: BRIDGE_PY, stdio: ['pipe', 'ignore', 'pipe'] });
  });
});

describe('blender round trip', { skip: !blenderBin() && 'no Blender on this machine' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'blender-bridge-test-'));
  const blendPath = join(dir, 'scene.blend');
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('builds, frames, animates, reads back and renders a short previz', async () => {
    const built = await buildScene(
      blenderSceneBuildSchema.parse({
        blendPath,
        fps: 24,
        frameStart: 1,
        frameEnd: 12,
        width: 216,
        height: 384,
        proxies: [
          { name: 'man', kind: 'person', location: [0, 0, 0], rotationZDeg: 20 },
          { name: 'dog', kind: 'dog', location: [1.2, 0.5, 0], color: '#c8a45a' },
          { name: 'can', kind: 'cylinder', radius: 0.035, height: 0.12, location: [0.3, -0.3, 1.2], color: '#d0342c' },
        ],
      }),
    );
    assert.ok(built.success, built.success ? '' : built.error);
    assert.ok(existsSync(blendPath));
    const names = built.scene.objects.map((o) => o.name);
    assert.ok(names.includes('man') && names.includes('dog') && names.includes('can') && names.includes('Floor'), names.join(','));
    assert.equal(built.scene.frame.fps, 24);
    assert.deepEqual(built.scene.resolution, [216, 384]);
    // a person is a root, a 19-bone armature and one mannequin mesh that stands the given height
    const rig = built.scene.objects.find((o) => o.name === 'man.rig');
    assert.ok(rig && rig.type === 'ARMATURE' && rig.bones === BLENDER_RIG_BONES.length && rig.parent === 'man', JSON.stringify(rig));
    const body = built.scene.objects.find((o) => o.name === 'man.body');
    assert.ok(body && body.type === 'MESH' && body.parent === 'man.rig', JSON.stringify(body));
    assert.ok(Math.abs(body.dimensions[2] - 1.75) < 0.02, `the mannequin is as tall as its height: ${body.dimensions[2]}`);
    assert.ok(!names.some((n) => n.startsWith('man.') && n !== 'man.rig' && n !== 'man.body'), 'no loose limb pieces');

    // extending keeps fps, range and resolution when they are omitted
    const extended = await buildScene(blenderSceneBuildSchema.parse({ blendPath, reset: false, proxies: [{ name: 'crate', kind: 'box', size: [0.5, 0.5, 0.5], location: [-1, 0, 0] }] }));
    assert.ok(extended.success, extended.success ? '' : extended.error);
    assert.equal(extended.scene.frame.fps, 24);
    assert.deepEqual([extended.scene.frame.start, extended.scene.frame.end], [1, 12]);
    assert.deepEqual(extended.scene.resolution, [216, 384]);
    assert.ok(extended.scene.objects.some((o) => o.name === 'crate') && extended.scene.objects.some((o) => o.name === 'man'));

    // the camera move and the object move arrive in parallel — the same file must serialize them, not lose one
    const [cam, thrown] = await Promise.all([
      setCamera(
        blenderCameraSetSchema.parse({
          blendPath,
          lensMm: 35,
          keys: [
            { frame: 1, location: [0, -4, 1.6], target: [0, 0, 1.0] },
            { frame: 12, location: [1.5, -2.5, 0.6], target: [0.3, -0.3, 1.2], lensMm: 50 },
          ],
        }),
      ),
      animateObject(
        blenderObjectAnimateSchema.parse({
          blendPath,
          object: 'can',
          keys: [
            { frame: 1, location: [0.3, -0.3, 1.2] },
            { frame: 12, location: [1.2, 0.5, 0.8], rotationDeg: [0, 720, 0] },
          ],
        }),
      ),
    ]);
    assert.ok(cam.success, cam.success ? '' : cam.error);
    assert.equal(cam.scene.camera?.name, 'Camera');
    assert.deepEqual(cam.scene.camera?.keyframes, [1, 12]);
    assert.ok(thrown.success, thrown.success ? '' : thrown.error);
    assert.deepEqual(thrown.scene.objects.find((o) => o.name === 'can')?.keyframes, [1, 12]);

    const read = await readScene(blenderSceneReadSchema.parse({ blendPath }));
    assert.ok(read.success, read.success ? '' : read.error);
    assert.equal(read.scene.frame.start, 1);
    assert.equal(read.scene.frame.end, 12);
    assert.deepEqual(read.scene.camera?.keyframes, [1, 12], 'camera keys survived the parallel object edit');
    assert.equal(read.scene.camera?.lensMm, 35, 'at frame 1 the lens is the camera lens, not the frame-12 zoom');
    assert.deepEqual(read.scene.objects.find((o) => o.name === 'can')?.keyframes, [1, 12], 'object keys survived the parallel camera edit');
    // the camera's own object line reports only the object's keys — the lens key on the camera data does not leak into it
    assert.deepEqual(read.scene.objects.find((o) => o.name === 'Camera')?.keyframes, [1, 12]);

    // layering keys onto an existing move keeps the old ones and continues from them
    const layered = await setCamera(blenderCameraSetSchema.parse({ blendPath, clearExisting: false, keys: [{ frame: 20, location: [-2, -3, 1.2], target: [0, 0, 1] }] }));
    assert.ok(layered.success, layered.success ? '' : layered.error);
    assert.deepEqual(layered.scene.camera?.keyframes, [1, 12, 20]);
    assert.equal(layered.scene.frame.end, 20, 'a key past the range extends it');
    const back = await setCamera(blenderCameraSetSchema.parse({ blendPath, lensMm: 35, keys: [
      { frame: 1, location: [0, -4, 1.6], target: [0, 0, 1.0] },
      { frame: 12, location: [1.5, -2.5, 0.6], target: [0.3, -0.3, 1.2], lensMm: 50 },
    ] }));
    assert.ok(back.success);

    // the layered key above grew the scene to 20 frames; render the 12-frame slice explicitly
    const previz = await renderPreviz(blenderRenderPrevizSchema.parse({ blendPath, outputPath: join(dir, 'out'), frameStart: 1, frameEnd: 12, stills: [1, 12, 40] }));
    assert.ok(previz.success, previz.success ? '' : previz.error);
    assert.equal(previz.frames, 12);
    assert.equal(previz.fps, 24);
    assert.equal(previz.seconds, 0.5);
    assert.ok(existsSync(previz.videoPath) && statSync(previz.videoPath).size > 1000, 'mp4 written');
    assert.equal(previz.stillPaths.length, 2);
    assert.deepEqual(previz.skippedStills, [40]);
    for (const p of previz.stillPaths) assert.ok(existsSync(p) && statSync(p).size > 500, p);

    const missing = await animateObject(blenderObjectAnimateSchema.parse({ blendPath, object: 'ghost', keys: [{ frame: 1, location: [0, 0, 0] }] }));
    assert.ok(!missing.success);
    assert.match(missing.error, /no object named ghost/);
  });

  it('poses a person by channel and reports where the hands and feet went', async () => {
    const blend = join(dir, 'pose.blend');
    const built = await buildScene(blenderSceneBuildSchema.parse({ blendPath: blend, fps: 24, frameEnd: 24, width: 128, height: 224, proxies: [{ name: 'dancer', kind: 'person', height: 1.6 }] }));
    assert.ok(built.success, built.success ? '' : built.error);
    const posed = await poseKey(
      blenderPoseKeySchema.parse({
        blendPath: blend,
        object: 'dancer',
        keys: [
          { frame: 1, pose: { armL: {}, armR: {}, legL: {}, hips: {} } },
          { frame: 24, pose: { armL: { raise: 90, elbow: 90 }, armR: { side: 90 }, legL: { raise: 60, knee: 60 }, hips: { offset: [0, 0, -0.1] }, torso: { bow: 20 } } },
        ],
      }),
    );
    assert.ok(posed.success, posed.success ? '' : posed.error);
    const a = posed.scene.applied;
    assert.deepEqual(a.keyframes, [1, 24]);
    assert.ok(a.bones.includes('upper_arm.L') && a.bones.includes('forearm.L') && a.bones.includes('shin.L') && a.bones.includes('spine') && a.bones.includes('hips'), a.bones.join(','));
    assert.ok(!a.bones.includes('head'), 'an absent group keys nothing');
    const t = a.tails;
    // left arm forward with a bent elbow: the hand rises above the elbow and sits in front of the body
    assert.ok(t['hand.L'][1] < -0.2 && t['hand.L'][2] > 1.1, `hand.L ${t['hand.L']}`);
    // right arm out to the side: the hand is far out on -X (the figure's right) at shoulder height
    assert.ok(t['hand.R'][0] < -0.5 && Math.abs(t['hand.R'][2] - 0.82 * 1.6) < 0.2, `hand.R ${t['hand.R']}`);
    // a marching step — thigh up 60, knee 60 leaves the shin vertical: the toe clears the floor
    assert.ok(t['foot.L'][2] > 0.08, `foot.L ${t['foot.L']}`);
    assert.ok(t['foot.R'][2] < 0.05, `foot.R stays down ${t['foot.R']}`);
    const rig = posed.scene.objects.find((o) => o.name === 'dancer.rig');
    assert.deepEqual(rig.keyframes, [1, 24]);

    // the root still moves the whole figure; the pose rides along
    const walked = await animateObject(blenderObjectAnimateSchema.parse({ blendPath: blend, object: 'dancer', keys: [{ frame: 1, location: [0, 0, 0] }, { frame: 24, location: [1, 0, 0] }] }));
    assert.ok(walked.success, walked.success ? '' : walked.error);
    assert.deepEqual(walked.scene.objects.find((o) => o.name === 'dancer.rig')?.keyframes, [1, 24], 'the body keys survive a root move');

    // a fresh call (clearExisting true) puts the bones it does not key back at rest — the
    // right arm that was out to the side hangs again, not frozen where the last call left it
    const again = await poseKey(blenderPoseKeySchema.parse({ blendPath: blend, object: 'dancer', keys: [{ frame: 1, pose: { head: { nod: 20 } } }] }));
    assert.ok(again.success, again.success ? '' : again.error);
    assert.ok(Math.abs(again.scene.applied.tails['hand.R'][0] + 0.12 * 1.6) < 0.05 && again.scene.applied.tails['hand.R'][2] < 0.7, `hand.R hangs after a fresh call ${again.scene.applied.tails['hand.R']}`);
    assert.ok(again.scene.applied.tails['foot.L'][2] < 0.05, `foot.L is down again ${again.scene.applied.tails['foot.L']}`);

    const notRigged = await poseKey(blenderPoseKeySchema.parse({ blendPath, object: 'dog', keys: [{ frame: 1, pose: { head: { nod: 10 } } }] }));
    assert.ok(!notRigged.success);
    assert.match(notRigged.error, /has no rig/);
  });

  it('retargets a Biovision clip onto the person, scaled, faced and floored', async () => {
    const blend = join(dir, 'motion.blend');
    const clip = join(dir, 'tpose-drop.bvh');
    writeFileSync(clip, syntheticBvh(), 'utf-8');
    const built = await buildScene(blenderSceneBuildSchema.parse({ blendPath: blend, fps: 30, frameEnd: 30, width: 128, height: 224, proxies: [{ name: 'actor', kind: 'person', height: 1.75 }] }));
    assert.ok(built.success, built.success ? '' : built.error);

    const first = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip }));
    assert.ok(first.success, first.success ? '' : first.error);
    const m = first.scene.applied.motion;
    for (const [canon, src] of Object.entries({ hips: 'Hips', spine: 'Spine', chest: 'Chest', neck: 'Neck', head: 'Head', 'shoulder.L': 'LeftShoulder', 'upper_arm.L': 'LeftArm', 'forearm.L': 'LeftForeArm', 'hand.L': 'LeftHand', 'thigh.R': 'RightUpLeg', 'shin.R': 'RightLeg', 'foot.R': 'RightFoot' })) {
      assert.equal(m.mapped[canon], src, `${canon} should take ${src}: ${JSON.stringify(m.mapped)}`);
    }
    assert.deepEqual(m.unmapped, [], 'every rig bone found a source bone');
    assert.equal(m.sourceBones, 19);
    assert.ok(m.frames >= 9 && m.frames <= 11, `ten source frames bake to about ten keys: ${m.frames}`);
    assert.equal(first.scene.applied.keyframes[0], 1);
    // the clip's leg is 82 units, the figure's 0.45 × 1.75 m
    assert.ok(Math.abs(m.heightRatio - (0.45 * 1.75) / 82) < 0.0005, `scale ${m.heightRatio}`);
    assert.ok(Math.abs(m.yawDeg) < 1, `the file already faces -Y: ${m.yawDeg}`);
    // first frame is a T-pose: the left hand is far out on +X at shoulder height, feet on the floor
    const t0 = first.scene.applied.tails;
    assert.ok(t0['hand.L'][0] > 0.6 && Math.abs(t0['hand.L'][2] - 0.82 * 1.75) < 0.15, `hand.L ${t0['hand.L']}`);
    assert.ok(t0['hand.R'][0] < -0.6, `hand.R ${t0['hand.R']}`);
    assert.ok(Math.abs(t0['foot.L'][2]) < 0.05 && Math.abs(t0['foot.R'][2]) < 0.05, `feet on the floor ${t0['foot.L']} ${t0['foot.R']}`);
    assert.ok(Math.abs(t0['head'][2] - 1.75) < 0.12, `head near the top ${t0['head']}`);
    const rig = first.scene.objects.find((o) => o.name === 'actor.rig');
    assert.ok(rig.keyframes.length >= 9 && rig.keyframes[0] === 1, `baked keys ${rig.keyframes}`);
    assert.ok(!first.scene.objects.some((o) => o.name === 'Hips' || o.name.includes('tpose-drop')), 'the source skeleton is gone after the bake');

    // by the last frame the left arm has dropped, the right is still out; in place, the walk
    // has not moved the figure — with full root motion it has
    const t1 = first.scene.applied.tailsEnd;
    assert.ok(t1['hand.L'][2] < 0.75 && Math.abs(t1['hand.L'][0]) < 0.35, `hand.L hangs ${t1['hand.L']}`);
    assert.ok(t1['hand.R'][0] < -0.6, `hand.R still out ${t1['hand.R']}`);
    assert.ok(Math.abs(t1['head'][1]) < 0.15, `in place, the head stays over the origin: ${t1['head']}`);
    const travelled = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip, rootMotion: 'full' }));
    assert.ok(travelled.success, travelled.success ? '' : travelled.error);
    assert.ok(travelled.scene.applied.tailsEnd['head'][1] < -0.3, `with full root motion the walk carries the figure forward (-Y): ${travelled.scene.applied.tailsEnd['head']}`);
    // a slice that starts near the end is a single baked frame, already in the dropped pose
    const late = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip, fromSeconds: 0.29 }));
    assert.ok(late.success, late.success ? '' : late.error);
    assert.equal(late.scene.applied.motion.frames, 1);
    assert.ok(late.scene.applied.tails['hand.L'][2] < 0.75, `hand.L hangs from the first baked frame ${late.scene.applied.tails['hand.L']}`);

    // loop fills the scene's range; speed shortens the bake
    const looped = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip, loop: true, frameStart: 1 }));
    assert.ok(looped.success, looped.success ? '' : looped.error);
    assert.equal(looped.scene.applied.motion.frames, 30);
    const fast = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip, speed: 2 }));
    assert.ok(fast.success, fast.success ? '' : fast.error);
    assert.ok(fast.scene.applied.motion.frames <= 6, `double speed halves the keys: ${fast.scene.applied.motion.frames}`);

    // an accent layered on the baked clip takes over a window, not one frame: with ease 3 at
    // frame 5 the upper arm's clip keys at 3, 4, 6, 7 go and the key at 5 is the accent — and
    // the leg key this call adds at 7 is the leg's, so it does not save the arm's clip key at 7
    const whole = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip }));
    assert.ok(whole.success, whole.success ? '' : whole.error);
    const accent = await poseKey(blenderPoseKeySchema.parse({ blendPath: blend, object: 'actor', clearExisting: false, ease: 3, keys: [{ frame: 5, pose: { armL: { raise: 170 } } }, { frame: 7, pose: { legL: { knee: 30 } } }] }));
    assert.ok(accent.success, accent.success ? '' : accent.error);
    assert.ok(accent.scene.applied.tails['hand.L'][2] > 1.9 || accent.scene.applied.keyframes[0] === 5, 'the accent frame is keyed');
    const reached = await poseKey(blenderPoseKeySchema.parse({ blendPath: blend, object: 'actor', clearExisting: false, ease: 0, keys: [{ frame: 5, pose: { armL: { raise: 170 } } }] }));
    assert.ok(reached.success && reached.scene.applied.tails['hand.L'][2] > 1.9, `the accent is reached: ${JSON.stringify(reached.success && reached.scene.applied.tails)}`);
    assert.ok(accent.scene.objects.find((o) => o.name === 'actor.rig').keyframes.length >= 9, 'the clip keys on the other bones stay');
    const keyProbe = [
      'import bpy',
      'o = bpy.data.objects["actor.rig"]; ad = o.animation_data; act = ad.action; fcs = []',
      'try:',
      '    for layer in act.layers:',
      '        for strip in layer.strips:',
      '            bag = strip.channelbag(ad.action_slot)',
      '            if bag is not None: fcs.extend(bag.fcurves)',
      'except Exception:',
      '    fcs = list(act.fcurves)',
      'fc = [f for f in fcs if f.data_path == \'pose.bones["upper_arm.L"].rotation_quaternion\'][0]',
      'print("KEYS", len(fc.keyframe_points), sorted(int(round(k.co[0])) for k in fc.keyframe_points))',
    ].join('\n');
    const keyCount = execFileSync(blenderBin(), ['--background', '--factory-startup', blend, '--python-expr', keyProbe], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n')
      .find((l) => l.startsWith('KEYS'));
    assert.ok(keyCount && !/\b[3467]\b/.test(keyCount.split('[')[1]) && / 5[,\]]/.test(keyCount), `window (2, 8) cleared around the accent: ${keyCount}`);

    // an FBX keeps the file's frame rate: exported at 30 fps, it lands in a 24 fps cut at the
    // right speed and leaves the scene's fps alone
    const fbx = join(dir, 'tpose-drop.fbx');
    execFileSync(
      blenderBin(),
      ['--background', '--factory-startup', '--python-expr',
        // the exporter bakes the scene's frame range, so pin it to the clip's ten frames
        `import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nsc=bpy.context.scene\nsc.render.fps=30\nsc.frame_start=1\nsc.frame_end=10\nbpy.ops.import_anim.bvh(filepath=${JSON.stringify(clip)}, target="ARMATURE", frame_start=1, use_fps_scale=True, update_scene_fps=False, update_scene_duration=False)\nbpy.ops.export_scene.fbx(filepath=${JSON.stringify(fbx)}, bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False, add_leaf_bones=False)`],
      { stdio: 'ignore' },
    );
    assert.ok(existsSync(fbx), 'Blender exported the FBX fixture');
    const slow = join(dir, 'motion24.blend');
    const built24 = await buildScene(blenderSceneBuildSchema.parse({ blendPath: slow, fps: 24, frameEnd: 24, width: 128, height: 224, proxies: [{ name: 'actor', kind: 'person', height: 1.75 }] }));
    assert.ok(built24.success, built24.success ? '' : built24.error);
    const fromFbx = await importMotion(blenderMotionImportSchema.parse({ blendPath: slow, object: 'actor', motionPath: fbx }));
    assert.ok(fromFbx.success, fromFbx.success ? '' : fromFbx.error);
    assert.equal(fromFbx.scene.frame.fps, 24, 'the scene keeps its own fps after an FBX import');
    assert.equal(fromFbx.scene.applied.motion.sourceFps, 30);
    assert.ok(fromFbx.scene.applied.motion.frames >= 7 && fromFbx.scene.applied.motion.frames <= 9, `ten 30-fps frames are about eight 24-fps keys: ${fromFbx.scene.applied.motion.frames}`);
    assert.ok(Math.abs(fromFbx.scene.applied.motion.sourceSeconds - 0.333) < 0.05, `clip length in seconds ${fromFbx.scene.applied.motion.sourceSeconds}`);
    assert.ok(fromFbx.scene.applied.tails['hand.L'][0] > 0.6, `the FBX pose arrives too: ${fromFbx.scene.applied.tails['hand.L']}`);

    const wrongMap = await importMotion(blenderMotionImportSchema.parse({ blendPath: blend, object: 'actor', motionPath: clip, boneMap: { 'thigh.L': 'NoSuchBone' } }));
    assert.ok(!wrongMap.success);
    assert.match(wrongMap.error, /NoSuchBone/);
    const notRigged = await importMotion(blenderMotionImportSchema.parse({ blendPath, object: 'can', motionPath: clip }));
    assert.ok(!notRigged.success);
    assert.match(notRigged.error, /has no rig/);
  });

  it('two files rendering into one folder keep their own private files', async () => {
    const a = join(dir, 'a.blend');
    const b = join(dir, 'b.blend');
    const out = join(dir, 'shared');
    for (const p of [a, b]) {
      const r = await buildScene(blenderSceneBuildSchema.parse({ blendPath: p, fps: 24, frameEnd: 6, width: 128, height: 224, proxies: [{ name: 'p', kind: 'sphere' }] }));
      assert.ok(r.success, r.success ? '' : r.error);
      const c = await setCamera(blenderCameraSetSchema.parse({ blendPath: p, keys: [{ location: [0, -3, 1], target: [0, 0, 0.5] }] }));
      assert.ok(c.success, c.success ? '' : c.error);
    }
    const [ra, rb] = await Promise.all([
      renderPreviz(blenderRenderPrevizSchema.parse({ blendPath: a, outputPath: out, filename: 'a.mp4', stills: [] })),
      renderPreviz(blenderRenderPrevizSchema.parse({ blendPath: b, outputPath: out, filename: 'b.mp4', stills: [] })),
    ]);
    assert.ok(ra.success, ra.success ? '' : ra.error);
    assert.ok(rb.success, rb.success ? '' : rb.error);
    assert.ok(existsSync(join(out, 'a.mp4')) && existsSync(join(out, 'b.mp4')));
  });

  it('refuses to reset a .blend it did not make unless forced', async () => {
    const foreign = join(dir, 'foreign.blend');
    execFileSync(blenderBin(), ['--background', '--factory-startup', '--python-expr', `import bpy; bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(foreign)})`], { stdio: 'ignore' });
    assert.ok(existsSync(foreign));
    const refused = await buildScene(blenderSceneBuildSchema.parse({ blendPath: foreign, proxies: [{ name: 'p', kind: 'sphere' }] }));
    assert.ok(!refused.success);
    assert.match(refused.error, /not made by blender_scene_build/);
    const forced = await buildScene(blenderSceneBuildSchema.parse({ blendPath: foreign, force: true, proxies: [{ name: 'p', kind: 'sphere' }] }));
    assert.ok(forced.success, forced.success ? '' : forced.error);
    assert.ok(forced.scene.objects.some((o) => o.name === 'p'));
    const again = await buildScene(blenderSceneBuildSchema.parse({ blendPath: foreign, proxies: [{ name: 'q', kind: 'sphere' }] }));
    assert.ok(again.success, 'a file this lane made can be reset without force');
  });
});
