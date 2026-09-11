/* Built into skills/storyboard/references/previz-runtime.js (global PREVIZ_RUNTIME). Runs offline.
   The three.js previz lane (blender-previz.md §6.5): a Workbench-like flat render — grey floor,
   grey proxies, one flat colour per actor, no shadows, no gizmos — of the camera and blocking
   spec in previz-contract.js. Frame n of this page is frame n of the Blender lane's render, so
   the two lanes hand the video model the same clay-model reference. */
import * as THREE from 'three';
import contract from '../skills/storyboard/references/previz-contract.js';

const GREY = 0x8c8c8c, FLOOR = 0x6f6f6f, SKY = 0x5a5f66;

function proxy(a) {
  const group = new THREE.Group();
  const colour = a.color ? new THREE.Color(a.color) : new THREE.Color(GREY);
  const material = new THREE.MeshLambertMaterial({ color: colour });
  const add = (geometry, y) => { const m = new THREE.Mesh(geometry, material); m.position.y = y; group.add(m); return m; };
  if (a.kind === 'person') {
    const h = a.height, r = h * 0.09;
    // Two leg cylinders, a capsule trunk with arm cylinders, a head — a mannequin that reads as a
    // person from any side: legs 0–0.45 h, trunk 0.45–0.83 h, neck gap, head 0.82–1.0 h.
    const legR = h * 0.05, legH = h * 0.45, trunkR = h * 0.11;
    for (const x of [-h * 0.07, h * 0.07]) { const leg = add(new THREE.CylinderGeometry(legR, legR, legH, 16), legH / 2); leg.position.x = x; }
    add(new THREE.CapsuleGeometry(trunkR, h * 0.16, 4, 16), legH + trunkR + h * 0.08);
    for (const x of [-(trunkR + h * 0.04), trunkR + h * 0.04]) { const arm = add(new THREE.CylinderGeometry(h * 0.035, h * 0.035, h * 0.3, 12), legH + h * 0.2); arm.position.x = x; }
    add(new THREE.SphereGeometry(r, 24, 16), h - r);
    // The face side: a small flat nose block marks -Y (Blender front) so a turn is readable.
    const nose = add(new THREE.BoxGeometry(r * 0.5, r * 0.5, r * 0.5), h - r);
    nose.position.z = r; // three.js +z is Blender -Y
  } else if (a.kind === 'box') {
    add(new THREE.BoxGeometry(a.size[0], a.size[2], a.size[1]), a.size[2] / 2);
  } else if (a.kind === 'cylinder') {
    add(new THREE.CylinderGeometry(a.radius, a.radius, a.height, 32), a.height / 2);
  } else if (a.kind === 'sphere') {
    add(new THREE.SphereGeometry(a.radius, 32, 24), a.radius);
  } else {
    const s = a.size || contract.CAR;
    add(new THREE.BoxGeometry(s[0], s[2] * 0.55, s[1]), s[2] * 0.55 / 2);
    const cabin = add(new THREE.BoxGeometry(s[0] * 0.85, s[2] * 0.45, s[1] * 0.5), s[2] * 0.55 + s[2] * 0.45 / 2);
    cabin.position.z = -s[1] * 0.05;
  }
  return group;
}

export function mount(el, spec) {
  const errors = contract.checkSpec(spec);
  if (errors.length) throw new Error(errors.join('; '));
  const { width, height } = spec;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.setClearColor(SKY, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 6, 4); scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: FLOOR }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(contract.fovVertical(spec.camera.lensMm, width, height), width / height, 0.05, 500);
  const actors = spec.actors.map((a) => { const node = proxy(a); node.name = a.name; scene.add(node); return { a, node }; });
  const target = new THREE.Vector3();
  function draw(tMs) {
    const frame = contract.frameAt(spec, tMs);
    const cam = contract.sampleCamera(spec, frame);
    camera.position.fromArray(contract.toThree(cam.position));
    camera.up.set(0, 1, 0);
    camera.lookAt(target.fromArray(contract.toThree(cam.target)));
    for (const { a, node } of actors) {
      const s = contract.sampleActor(a, frame);
      node.position.fromArray(contract.toThree(s.position));
      node.rotation.set(0, s.rotationZDeg * Math.PI / 180, 0);
    }
    renderer.render(scene, camera);
    return frame;
  }
  draw(0);
  if (!renderer.info.render.triangles) throw new Error('previz spec draws nothing');
  return { draw, durationMs: spec.seconds * 1000, size: { w: width, h: height },
    diagnostics: () => ({ actors: actors.length, triangles: renderer.info.render.triangles, fov: camera.fov }),
    dispose() { renderer.dispose(); } };
}
