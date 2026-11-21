// Run with an EP01 source episode and a new destination channel directory.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readBoard, serializeBoard, storySceneSchema, storyShotSchema, writeStoryScenes, writeStoryShots } from '../dist/storyboard.js';
import { planVideo } from '../dist/video-routing.js';
import { SceneInputError } from '../dist/scene-video.js';
import { captureScene, readCapture } from '../test/fixtures/scene-capture.mjs';
import assert from 'node:assert/strict';
import { setupProject } from '../test/workflow-fixture.mjs';

const [, ,sourceArg,destinationArg] = process.argv;
if (!sourceArg || !destinationArg) throw new Error('Pass the source EP01 directory and a new destination channel directory');
const source = fs.realpathSync(sourceArg), destination = path.resolve(destinationArg);
if (destination === source || destination.startsWith(source + path.sep)) throw new Error('Keep verification outside the source episode');
const fixture = JSON.parse(fs.readFileSync(new URL('../test/fixtures/ears-up-ep01.json',import.meta.url)));
const board = readBoard(path.join(source,'storyboard')).win;
const sourceShot = board.SCENES[0], scene = board.STRUCTURE.scenes[0];
const contact = 'images/play-contact.png';
const preview = 'board-preview.mp4';
const shots = fixture.shots.flatMap(s => s.timeline.images.map(p => p.path));
const files = ['scenes.js','cast.json',fixture.scene.audio.path, ...shots.map(p => p === contact ? 'images/play.png' : p), preview];
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const digests = () => files.map(f => digest(path.join(source,'storyboard',f)));
const original = digests();
fs.mkdirSync(destination);
const {engine,model,resolution} = {...board.PRODUCTION.videoModel,...sourceShot.visual.video};
const project = setupProject(destination,{video:{engine,model,resolution}});
const episode = path.join(project.paths.episodes,path.basename(source));
const dir = path.join(episode,'storyboard');
fs.mkdirSync(dir,{recursive:true});
for (const file of files.filter(f => f !== preview)) {
  fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});
  fs.copyFileSync(path.join(source,'storyboard',file),path.join(dir,file));
}
// Extract the requested close-up from the contact frame of the existing 720x1280 / 24 fps preview.
const framing = {source:preview, frame:42, crop:{x:482,y:768,width:216,height:384}, output:contact};
execFileSync('ffmpeg',['-nostdin','-v','error','-i',path.join(source,'storyboard',preview),
  '-vf',"select=eq(n\\,42),crop=216:384:482:768",'-frames:v','1',path.join(dir,contact)]);
fs.cpSync(path.resolve(source,'../../assets/characters'), path.resolve(episode,'../../assets/characters'),{recursive:true});
board.SCENES = [];
board.STRUCTURE.nextShotId = 1;
// Preserve episode model selection from the original shot as each new card is authored.
board.PRODUCTION.videoModel = {...board.PRODUCTION.videoModel,...sourceShot.visual.video};
const write = win => fs.writeFileSync(path.join(dir,'scenes.js'),serializeBoard(win,[]));
write(board);
writeStoryScenes(storySceneSchema.parse({path:dir,scenes:[{sequence:board.STRUCTURE.sequences[0].id,
  no:scene.no,place:scene.place,time:scene.time,event:scene.event,summary:scene.summary,videoDirection:fixture.scene}]}));
writeStoryShots(storyShotSchema.parse({path:dir,shots:fixture.shots}));
const authored = readBoard(dir).win;
for (const [i,shot] of authored.SCENES.entries()) {
  const start = shot.timeline.images[0].path;
  shot.visual = {video:sourceShot.visual.video, bg:start, frames:{mode:'first',start},
    character: i === 2 ? ['seorin','mai-an'] : [], bystanders:i === 2 ? ['tu-vi'] : []};
  shot.shot = {size:['ws','cu','fs'][i],angle:'eye',render:sourceShot.shot.render};
  if (i) shot.transition = 'cut';
}
const span = authored.MUSIC.$timeline[0];
span.start = {shotId:authored.SCENES[1].id,atSeconds:0};
span.end = {shotId:authored.SCENES[2].id,atSeconds:'end'};
write(authored);
const blocks = {};
let adapterInput;
for (const operation of ['audio','image','text']) {
  try {
    planVideo({episode,sceneNo:1,operation,requestId:'ep01-dry-'+operation,args:{reserveUsd:0}});
    assert.fail('Production adapter accepted an unsupported scene');
  } catch (err) {
    if (!(err instanceof SceneInputError)) throw err;
    blocks[operation] = {tool:err.tool,executable:false,missing:err.missing};
    if (operation === 'audio') adapterInput = err.sceneRequest;
  }
}
// Serialize the exact input seen by the production A2V mapper at the video_plan boundary.
const capture = await readCapture(captureScene(adapterInput));
assert.deepEqual(capture.images.map(i=>i.frame),[0,42,52,112,191,336]);
assert.deepEqual(capture.images.map(i=>i.sha256),shots.map(p => digest(path.join(dir,p))));
for (const pin of capture.images) {
  const rel = 'images/' + pin.filename;
  if (rel !== contact) assert.equal(pin.sha256, original[files.indexOf(rel)]);
}
assert.equal(capture.audio.sha256,original[2]);
assert.deepEqual(digests(),original);
fs.writeFileSync(path.join(episode,'scene-prompt.txt'),capture.prompt+'\n');
fs.writeFileSync(path.join(episode,'dry-run.json'),JSON.stringify({source,sourceFiles: Object.fromEntries(files.map((f,i)=>[f,original[i]])),
  framing,productionSubmissions:0,offlineRequests:1,adapter:'offline multipart capture',capture,blocks},null,2)+'\n');
console.log(episode);
