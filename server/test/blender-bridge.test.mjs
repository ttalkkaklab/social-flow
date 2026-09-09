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
    assert.equal(ok.data.fps, 30);
    assert.equal(ok.data.frameEnd, 150);
    assert.equal(ok.data.floor, true);
    assert.deepEqual(ok.data.proxies[0].location, [0, 0, 0]);

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

    const cam = await setCamera(
      blenderCameraSetSchema.parse({
        blendPath,
        lensMm: 35,
        keys: [
          { frame: 1, location: [0, -4, 1.6], target: [0, 0, 1.0] },
          { frame: 12, location: [1.5, -2.5, 0.6], target: [0.3, -0.3, 1.2] },
        ],
      }),
    );
    assert.ok(cam.success, cam.success ? '' : cam.error);
    assert.equal(cam.scene.camera?.name, 'Camera');
    assert.deepEqual(cam.scene.camera?.keyframes, [1, 12]);
    assert.equal(cam.scene.camera?.lensMm, 35);

    const thrown = await animateObject(
      blenderObjectAnimateSchema.parse({
        blendPath,
        object: 'can',
        keys: [
          { frame: 1, location: [0.3, -0.3, 1.2] },
          { frame: 12, location: [1.2, 0.5, 0.8], rotationDeg: [0, 720, 0] },
        ],
      }),
    );
    assert.ok(thrown.success, thrown.success ? '' : thrown.error);
    const can = thrown.scene.objects.find((o) => o.name === 'can');
    assert.deepEqual(can?.keyframes, [1, 12]);

    const read = await readScene(blenderSceneReadSchema.parse({ blendPath }));
    assert.ok(read.success, read.success ? '' : read.error);
    assert.equal(read.scene.frame.start, 1);
    assert.equal(read.scene.frame.end, 12);
    assert.deepEqual(read.scene.camera?.keyframes, [1, 12]);

    const previz = await renderPreviz(blenderRenderPrevizSchema.parse({ blendPath, outputPath: join(dir, 'out'), stills: [1, 12] }));
    assert.ok(previz.success, previz.success ? '' : previz.error);
    assert.equal(previz.frames, 12);
    assert.equal(previz.fps, 24);
    assert.equal(previz.seconds, 0.5);
    assert.ok(existsSync(previz.videoPath) && statSync(previz.videoPath).size > 1000, 'mp4 written');
    assert.equal(previz.stillPaths.length, 2);
    for (const p of previz.stillPaths) assert.ok(existsSync(p) && statSync(p).size > 500, p);

    const missing = await animateObject(blenderObjectAnimateSchema.parse({ blendPath, object: 'ghost', keys: [{ frame: 1, location: [0, 0, 0] }] }));
    assert.ok(!missing.success);
    assert.match(missing.error, /no object named ghost/);
  });
});
