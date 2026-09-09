/**
 * Blender bridge — request schemas, the embedded script's syntax, and (when a Blender is
 * installed here) one round trip: build → camera → animate → read → render.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  BLENDER_PROXY_KINDS,
  BRIDGE_PY,
  DEFAULT_PREVIZ_ENGINE,
  MAX_PREVIZ_FRAMES,
  animateObject,
  blenderCameraSetSchema,
  blenderObjectAnimateSchema,
  blenderRenderPrevizSchema,
  blenderSceneBuildSchema,
  blenderSceneReadSchema,
  buildScene,
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
});

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
    const man = built.scene.objects.find((o) => o.name === 'man.head');
    assert.ok(man && Math.abs(man.location[2] - 0.93 * 1.75) < 0.01, 'the head sits at 0.93 of the height');

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
