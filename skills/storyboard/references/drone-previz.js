#!/usr/bin/env node
'use strict';
// Prepare camera data only. Rendering and paid generation keep their existing approvals.
const fs = require('fs'), path = require('path');
const MODE = require('./production-mode.js');
const CONTRACT = require('./previz-contract.js');
const { readScenes } = require('../../autoproduce/references/cost-preview.js');

function prepare(scene, { width=1080, height=1920, fps=24 }={}) {
  const camera = scene.visual?.camera;
  if (!MODE.isDrone(camera)) throw new Error('Choose visual.camera.preset drone-flythrough');
  const slots = MODE.droneSlots(camera), normalized = {...camera, ...slots};
  const planned = {...scene, visual:{...scene.visual, camera:normalized}};
  const errors = MODE.droneSceneErrors(planned,{draft:true});
  if (errors.length) throw new Error(errors.join('; '));
  if (scene.duration > camera.trajectory.seconds) throw new Error('The drone trajectory is shorter than its scene');
  const spec = {fps, seconds:camera.trajectory.seconds, width, height,
    camera:MODE.droneCameraKeys(normalized,fps), actors:camera.trajectory.proxies};
  const problems = CONTRACT.checkSpec(spec);
  if (problems.length) throw new Error(problems.join('; '));
  return {camera:normalized, spec,
    // Supply blendPath when calling blender_camera_set on the authored proxy scene.
    blenderCamera:{lensMm:spec.camera.lensMm, interpolation:'LINEAR', clearExisting:true,
      keys:spec.camera.keys.map(({position,...k})=>({...k,location:position}))},
    previzCamera:{movement:slots.movement, trajectoryBinding:MODE.droneBinding(normalized)}};
}
function page(spec) {
  const template = fs.readFileSync(path.join(__dirname,'previz-template.html'),'utf8');
  const start = template.indexOf('  window.PREVIZ = {'), end = template.indexOf('\n</script>',start);
  if(start<0||end<0) throw new Error('Missing PREVIZ template markers');
  return template.slice(0,start)+'  window.PREVIZ = '+JSON.stringify(spec,null,2).replace(/</g,'\\u003c')+';'+template.slice(end);
}
module.exports={prepare,page};
if(require.main===module) {
  try {
    const args=process.argv.slice(2), target=args[0], shot=Number(args[args.indexOf('--shot')+1]);
    const out=args.includes('--out')?args[args.indexOf('--out')+1]:null;
    if(!target||!args.includes('--shot')||!Number.isInteger(shot)||shot<1||!out) throw new Error('usage: drone-previz.js <storyboard directory|scenes.js> --shot N --out <new directory>');
    const scenes=fs.statSync(target).isDirectory()?path.join(target,'scenes.js'):target, win=readScenes(scenes);
    if(!win.SCENES?.[shot-1]) throw new Error('Shot does not exist');
    const result=prepare(win.SCENES[shot-1], win.FORMAT==='youtube-long-16x9'?{width:1920,height:1080}:{});
    if(fs.existsSync(out)) throw new Error('Output directory already exists; use a new revision directory');
    fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out,'camera-plan.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(out,'previz.html'),page(result.spec));
    for(const file of ['previz-contract.js','previz-runtime.js']) fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
    console.log(JSON.stringify({directory:path.resolve(out),page:'previz.html',plan:'camera-plan.json',status:'prepared; not rendered'},null,2));
  } catch(e) {console.error('drone-previz: '+e.message);process.exitCode=1;}
}
