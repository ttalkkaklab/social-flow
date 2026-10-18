import * as THREE from 'three';

// Same dimensions and local -Y facing as location-blender.py build_actors.
export function createActors(entries = []) {
  const group = new THREE.Group();
  const actors = new Map();
  for (const a of entries) {
    const root = new THREE.Group(), head = new THREE.Group();
    root.name = a.id;
    const material = new THREE.MeshLambertMaterial({color:a.color});
    function part(parent, name, position, size, sphere = false) {
      const mesh = new THREE.Mesh(sphere ? new THREE.SphereGeometry(.5,16,8) : new THREE.BoxGeometry(1,1,1), material);
      mesh.position.fromArray(position.map(v=>v*a.height));mesh.scale.fromArray(size.map(v=>v*a.height));
      mesh.name=name;mesh.userData.actorId=a.id;parent.add(mesh);
    }
    for(const x of [.105,-.105]) {
      part(root,'leg',[x,0,.24],[.13,.16,.48]);
      part(root,'foot',[x,-.045,.035],[.14,.25,.07]);
      part(root,'arm',[x*2.05,0,.61],[.09,.12,.32]);
    }
    part(root,'torso',[0,0,.65],[.34,.20,.35],true);
    head.position.z=.91*a.height;root.add(head);
    part(head,'head',[0,0,0],[.18,.17,.18],true);
    part(head,'nose',[0,-.105,0],[.045,.065,.035]);
    const gaze = new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(),1,a.color,.12,.06);
    group.add(root,gaze);actors.set(a.id,{root,head,gaze,spec:a});
  }
  return {group,actors};
}

export function updateActors(model, start, end, t, objects, showGaze=true) {
  const mix=(a,b)=>a+(b-a)*t;
  const poses=start.map(a=>{
    const b=end.find(b=>b.id===a.id)||a;
    const angle=b.rotationZDeg-a.rotationZDeg;
    return {...a,position:a.position.map((v,i)=>mix(v,b.position[i])),rotationZDeg:a.rotationZDeg+angle*t,gazeTarget:t===1?b.gazeTarget:a.gazeTarget};
  });
  for(const a of poses){const {root}=model.actors.get(a.id);root.position.fromArray(a.position);root.rotation.z=THREE.MathUtils.degToRad(a.rotationZDeg);}
  model.group.updateMatrixWorld(true);
  for(const a of poses){
    const {root,head,gaze}=model.actors.get(a.id);
    head.quaternion.identity();
    const origin=head.getWorldPosition(new THREE.Vector3());
    const targetActor=model.actors.get(a.gazeTarget);
    const object=objects.find(o=>o.id===a.gazeTarget);
    const target=targetActor?targetActor.head.getWorldPosition(new THREE.Vector3()):object?new THREE.Vector3(...object.position):null;
    let direction=new THREE.Vector3(0,-1,0).applyQuaternion(root.quaternion),length=.6;
    if(target&&target.distanceTo(origin)>1e-6){
      direction=target.clone().sub(origin).normalize();length=target.distanceTo(origin);
      // Track -Y, with Z up, matching Blender's track quaternion.
      const x=new THREE.Vector3().crossVectors(new THREE.Vector3(0,0,1),direction);
      if(x.lengthSq()<1e-10)x.set(1,0,0);else x.normalize();
      const y=direction.clone().negate(),z=new THREE.Vector3().crossVectors(x,y).normalize();
      const world=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
      head.quaternion.copy(root.quaternion.clone().invert().multiply(world));
    }
    gaze.position.copy(origin);gaze.setDirection(direction);gaze.setLength(length,.12,.06);gaze.visible=showGaze;
  }
  model.group.updateMatrixWorld(true);
}
