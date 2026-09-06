/* Built into skills/storyboard/references/mesh-runtime.js. Runs entirely offline. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import contract from '../skills/storyboard/references/mesh-contract.js';

export async function mount(el, recipeURL) {
  const response = await fetch(recipeURL);
  if (!response.ok) throw new Error(`mesh recipe HTTP ${response.status}: ${recipeURL}`);
  const recipe = await response.json();
  const errors = contract.checkRecipe(recipe);
  if (errors.length) throw new Error(errors.join('; '));
  const width = el.clientWidth, height = el.clientHeight;
  const lighting = recipe.lighting || {};
  if (!width || !height) throw new Error('mesh viewport has no area');
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting.exposure ?? 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = lighting.environment ?? (recipe.style === 'photoreal3d' ? .8 : .55);
  room.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(recipe.camera.fov, width / height, .01, 200);
  camera.position.fromArray(recipe.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(recipe.camera.target));
  const key = new THREE.DirectionalLight(lighting.keyColor || 0xfff1df, lighting.key ?? 2.5);
  key.position.fromArray(lighting.keyPosition || [-3, 5, 6]); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {left:-5, right:5, top:5, bottom:-5, near:.1, far:30});
  key.shadow.bias = -.0003; key.shadow.normalBias = .025;
  key.shadow.radius = 10; key.shadow.blurSamples = 16;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d6ff, lighting.fill ?? .9); fill.position.set(4, 2, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, lighting.rim ?? 1.5); rim.position.set(1, 4, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({opacity:lighting.shadowOpacity ?? .15}));
  floor.rotation.x = -Math.PI/2; floor.position.y = recipe.floorY ?? -1.4;
  floor.receiveShadow = true; scene.add(floor);
  const targets = new Map(), imports = new Map(), baselines = new Map();
  const manager = new THREE.LoadingManager();
  // GLB images may use loader-created blob URLs. External dependencies are refused.
  const sources = new Set(recipe.nodes.filter(n => n.source).map(n => new URL(n.source, recipeURL).href));
  manager.setURLModifier(url => {
    if (url.startsWith('blob:') || sources.has(new URL(url, recipeURL).href)) return url;
    throw new Error(`GLB must embed its textures and buffers: ${url}`);
  });
  const loader = new GLTFLoader(manager);
  for (const spec of recipe.nodes) {
    let node;
    if (spec.source) {
      const gltf = await loader.loadAsync(new URL(spec.source, recipeURL).href);
      node = gltf.scene;
      imports.set(spec.id, {gltf, mixer:new THREE.AnimationMixer(node)});
    } else if (spec.geometry) {
      const {type, size, bevel} = spec.geometry;
      const geometry = type === 'roundedBox' ? new RoundedBoxGeometry(...size, 4, bevel ?? Math.min(...size)*.12)
        : type === 'sphere' ? new THREE.SphereGeometry(size[0], 48, 32)
        : type === 'cylinder' ? new THREE.CylinderGeometry(...size, 64)
        : new THREE.TorusGeometry(...size, 20, 96);
      const {finish, ...materialSpec} = spec.material || {};
      const material = new THREE.MeshPhysicalMaterial({color:'#c9d8e6', roughness:.3,
        metalness:.12, clearcoat:.3, clearcoatRoughness:.25, ...materialSpec});
      if (finish === 'wood' || finish === 'linen') {
        material.onBeforeCompile = shader => {
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 grainPosition;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\ngrainPosition = position;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 grainPosition;')
            .replace('#include <color_fragment>', '#include <color_fragment>\n' + (finish === 'wood'
              ? 'float grain = sin(grainPosition.x*85.0 + sin(grainPosition.y*8.0 + grainPosition.z*4.0)*2.0); diffuseColor.rgb *= 0.92 + 0.08*grain;'
              : 'float grain = sin(grainPosition.x*180.0)*sin(grainPosition.y*180.0); diffuseColor.rgb *= 0.96 + 0.04*grain;'));
        };
        material.customProgramCacheKey = () => finish;
      }
      node = new THREE.Mesh(geometry, material);
    } else node = new THREE.Group();
    node.name = spec.id;
    const p = contract.poseFor(recipe, {}, spec.id);
    node.position.fromArray(p.position);
    node.rotation.set(...p.rotation.map(v => v*Math.PI/180)); node.scale.fromArray(p.scale);
    node.traverse(n => { if (n.isMesh) {
      n.castShadow = true; n.receiveShadow = true;
      for(const material of Array.isArray(n.material)?n.material:[n.material]){
        const depth=material.userData?.socialFlowMicrorelief;
        if(material.map&&Number.isFinite(depth)&&depth>0&&depth<=.03){material.bumpMap=material.map;material.bumpScale=depth;material.needsUpdate=true;}
      }
    } });
    (targets.get(spec.parent) || scene).add(node); targets.set(spec.id, node);
  }
  for (const binding of recipe.bindings || []) {
    const node = targets.get(binding.asset).getObjectByName(binding.node);
    if (!node) throw new Error(`GLB node missing: ${binding.asset}/${binding.node}`);
    targets.set(binding.id, node);
  }
  for (const [id, node] of targets) baselines.set(id, {position:node.position.clone(), quaternion:node.quaternion.clone(), scale:node.scale.clone()});
  const contacts=(recipe.contactShadows || []).map(spec=>{
    const target=targets.get(spec.target) || scene.getObjectByName(spec.target);
    if(!target) throw new Error('Contact shadow target is missing: '+spec.target);
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      uniforms:{opacity:{value:spec.opacity}},
      vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'precision highp float;varying vec2 v;uniform float opacity;void main(){float d=length((v-.5)*2.);float a=exp(-d*d*4.)*(1.-smoothstep(.65,1.,d));gl_FragColor=vec4(0.,0.,0.,a*opacity);}'
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...spec.size),material);
    mesh.rotation.x=-Math.PI/2;mesh.renderOrder=1;scene.add(mesh);return {mesh,target};
  });
  // Resolve clips before reporting readiness; a misspelled clip must never yield a still render.
  for (const state of recipe.states) for (const [id, clip] of Object.entries(state.clips || {})) {
    const entry = imports.get(id), animation = entry.gltf.animations.find(a => a.name === clip.name);
    if (!animation || clip.time > animation.duration + 1e-6) throw new Error(`invalid GLB clip/time: ${id}/${clip.name}/${clip.time}`);
  }
  const durations = Object.fromEntries(recipe.groups.map(g => [g.group, g.durationMs]));
  const v = new THREE.Vector3(), a = new THREE.Quaternion(), b = new THREE.Quaternion(), e = new THREE.Euler();
  const localPose = (state, id) => {
    if (recipe.nodes.some(n => n.id === id)) return contract.poseFor(recipe, state, id);
    const base = baselines.get(id), p = state.pose?.[id] || {};
    const rotation = new THREE.Euler().setFromQuaternion(base.quaternion);
    return {position:p.position || base.position.toArray(), scale:p.scale || base.scale.toArray(),
      rotation:p.rotation || [rotation.x,rotation.y,rotation.z].map(x => x*180/Math.PI)};
  };
  function draw(group, time) {
    const {from, to, u} = contract.sampleRecipe(recipe, group, time / (durations[group] || 1));
    // Restore every target before posing so out-of-order seeks match a sequential render.
    for (const [id, node] of targets) {
      const base = baselines.get(id); node.position.copy(base.position); node.quaternion.copy(base.quaternion); node.scale.copy(base.scale);
    }
    for (const entry of imports.values()) entry.mixer.stopAllAction();
    for (const [id, clip] of Object.entries(from.clips || {})) {
      const entry = imports.get(id), animation = entry.gltf.animations.find(c => c.name === clip.name);
      const action = entry.mixer.clipAction(animation); action.reset(); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      entry.mixer.setTime(clip.time + (to.clips[id].time - clip.time)*u);
    }
    for (const [id, node] of targets) {
      // Unbound GLB children retain their authored animation. Bindings use explicit local poses.
      if (!recipe.nodes.some(n => n.id === id) && !from.pose?.[id] && !to.pose?.[id]) continue;
      const p = localPose(from, id), q = localPose(to, id);
      node.position.fromArray(p.position).lerp(v.fromArray(q.position), u);
      node.scale.fromArray(p.scale).lerp(v.fromArray(q.scale), u);
      a.setFromEuler(e.set(...p.rotation.map(n => n*Math.PI/180)));
      b.setFromEuler(e.set(...q.rotation.map(n => n*Math.PI/180)));
      node.quaternion.copy(a).slerp(b, u);
    }
    scene.updateMatrixWorld(true);
    for(const contact of contacts){contact.target.getWorldPosition(contact.mesh.position);contact.mesh.position.y=(recipe.floorY??-1.4)+.003;}
    renderer.render(scene, camera);
  }
  draw(0, 0);
  if (!renderer.info.render.triangles || ![...targets.values()].some(n => n.isMesh || n.children.length))
    throw new Error('mesh recipe contains no visible geometry');
  function project(part, point=[0,0,0]) {
    const node=targets.get(part) || scene.getObjectByName(part);
    if (!node || !Array.isArray(point) || point.length!==3 || !point.every(Number.isFinite)) throw new Error('Invalid mesh callout target: '+part);
    const p=node.localToWorld(new THREE.Vector3(...point)).project(camera);
    return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:p.z>=-1&&p.z<=1&&p.x>=-1&&p.x<=1&&p.y>=-1&&p.y<=1};
  }
  el.projectMeshPoint=project;
  return {draw, project, durations, setSegs(map) {for (const k in durations) if (map[k] > 0) durations[k] = map[k];},
    diagnostics:() => ({style:recipe.style, triangles:renderer.info.render.triangles, nodes:targets.size,contactShadows:contacts.length}),
    dispose() {environment.dispose(); renderer.dispose();}};
}
