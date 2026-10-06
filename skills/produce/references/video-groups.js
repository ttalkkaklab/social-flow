#!/usr/bin/env node
'use strict';
// One source contract for schema, manifest, rendering and post-build verification.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const asset=(board,file)=>path.resolve(file.startsWith('.work/')?path.dirname(board):board,file);
function declaration(scene,{mode}={}) {
  const p=scene.visual?.video?.groupPlan;
  if(p===undefined)return null;
  const bad=message=>{throw new Error('video group plan: '+message);};
  if(mode!==undefined && mode!=='full_video')bad('requires full_video');
  if(scene.visual?.slide || scene.visual?.reuse || scene.visual?.sync || ['broll','outro'].includes(scene.type))bad('requires a plain generated-video card');
  if(scene.shot?.render?.mode!=='generated_video')bad('requires generated_video render mode');
  if(scene.edit?.in!==undefined && scene.edit.in!==0)bad('card edit.in must be zero; use each group in');
  if(!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).some(k=>!['fps','bodyFrames','groups'].includes(k)))bad('expected fps, bodyFrames and groups');
  if(!Number.isSafeInteger(p.fps)||p.fps<=0||48000%p.fps!==0)bad('fps must divide the 48000Hz audio clock');
  if(!Number.isSafeInteger(p.bodyFrames)||p.bodyFrames<=0)bad('bodyFrames must be positive integer frames');
  if(!Array.isArray(scene.narration)||!scene.narration.length || !Array.isArray(p.groups)||p.groups.length!==scene.narration.length)bad('one group per narration segment is required');
  p.groups.forEach((g,j)=>{
    if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!['segment','startFrame','clip','sha256','in'].includes(k)))bad('unknown or malformed group field');
    if(g.segment!==j)bad('segment order must match narration');
    if(!Number.isSafeInteger(g.startFrame)||g.startFrame<0||g.startFrame>=p.bodyFrames||(!j&&g.startFrame!==0)||(j&&g.startFrame<=p.groups[j-1].startFrame))bad('startFrame must start at zero and strictly increase inside the body');
    if(typeof g.clip!=='string'||!g.clip.trim()||/[\t\r\n|@]/.test(g.clip)||g.clip.includes('::')||/^https?:/.test(g.clip)||!/\.(mp4|mov|m4v|webm)$/i.test(g.clip))bad('clip must be a local video path without manifest wrappers');
    if(typeof g.sha256!=='string'||!/^([a-f0-9]{64})$/.test(g.sha256))bad('source SHA256 is required');
    if(typeof g.in!=='number'||!Number.isFinite(g.in)||g.in<0)bad('in must be nonnegative source seconds');
  });
  return p;
}
function compile(scene,board,{fps,bodyFrames,handleFrames=0,mode}={}) {
  const p=declaration(scene,{mode});if(!p)return null;
  fps=fps??p.fps;bodyFrames=bodyFrames??p.bodyFrames;
  if(fps!==p.fps||bodyFrames!==p.bodyFrames)throw new Error('video group plan: actual audio/body frame clock differs from the declaration');
  if(!Number.isSafeInteger(handleFrames)||handleFrames<0)throw new Error('video group plan: invalid live handle frames');
  const groups=p.groups.map((g,j)=>{
    const file=asset(board,g.clip);
    if(!fs.statSync(file).isFile()||hash(file)!==g.sha256)throw new Error('video group plan: source SHA256 differs: '+file);
    const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=duration,width,height,avg_frame_rate,r_frame_rate','-of','json',file],{encoding:'utf8'})).streams?.[0];
    const seconds=Number(stream?.duration);
    const [num,den]=String(stream?.avg_frame_rate).split('/').map(Number),sourceFps=num/den;
    if(stream?.avg_frame_rate!==stream?.r_frame_rate||!Number.isFinite(sourceFps)||sourceFps<=0)throw new Error('video group plan: source frame rate is not measurable');
    // Start at the first source frame at or after the requested trim, never before it.
    const sourceIn=Math.ceil(g.in*sourceFps-1e-6)/sourceFps;
    const frames=(p.groups[j+1]?.startFrame??bodyFrames)-g.startFrame+(j===p.groups.length-1?handleFrames:0);
    if(!Number.isFinite(seconds)||seconds<=0||seconds+1e-5<sourceIn+frames/fps)throw new Error('video group plan: source is too short including trim and live handle: '+file);
    return {...g,file,frames,endFrame:g.startFrame+frames,sourceIn,sourceFps,seconds,width:stream.width,height:stream.height};
  });
  return {fps,bodyFrames,handleFrames,groups};
}
function checkManifest(scene,board,work,rows,options={}) {
  const plan=compile(scene,board,options);if(!plan)return null;
  if(rows.length!==plan.groups.length)throw new Error('video group plan: manifest segment count differs');
  rows.forEach((r,j)=>{
    if(r.length!==5 || r[1]!==String(j)||!r[2]||/[|@]/.test(r[2])||r[2].includes('::')||path.resolve(work,r[2])!==plan.groups[j].file)throw new Error('video group plan: manifest source/order differs from declared group');
  });
  return plan;
}
function render(work,board,card,fps,bodyFrames,handleFrames) {
  const win=require('../../_shared/scenes-vm.js').evaluateWindowScript(fs.readFileSync(path.join(board,'scenes.js'),'utf8'));
  const scene=win.SCENES[card];if(!scene)throw new Error('video group plan: missing card');
  const plan=compile(scene,board,{fps,bodyFrames,handleFrames,mode:win.PRODUCTION?.mode??null});if(!plan)return;
  const edit=JSON.parse(fs.readFileSync(path.join(work,'edit-plan.json'),'utf8')).shots.find(p=>p.card===card);
  if(!edit||edit.in!==0||handleFrames!==Math.ceil(edit.handle*fps-1e-6))throw new Error('video group plan: live handle differs from compiled edit plan');
  const cards=fs.readFileSync(path.join(work,'cards.resolved.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t')).filter(r=>r[0]===String(card));
  if(cards.length!==1||cards[0][3]!=='none')throw new Error('video group plan: plain video card requires zoom=none');
  const rows=fs.readFileSync(path.join(work,'segs.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t')).filter(r=>r[0]===String(card));
  checkManifest(scene,board,work,rows,{fps,bodyFrames,handleFrames});
  fs.writeFileSync(path.join(work,'work',`groups${card}.json`),JSON.stringify(plan,null,2)+'\n');
  console.log(plan.groups.map(g=>[g.file,g.sourceIn,g.frames,g.startFrame].join('\t')).join('\n'));
}
function verifyRendered(work,board,scenes,proof) {
  const edits=JSON.parse(fs.readFileSync(path.join(work,'edit-plan.json'),'utf8')).shots;
  const checks=[];
  scenes.forEach((s,card)=>{
    if(!declaration(s))return;
    const p=s.visual.video.groupPlan,edit=edits.find(e=>e.card===card);
    const expected=compile(s,board,{handleFrames:Math.ceil(edit.handle*p.fps-1e-6)});
    if(JSON.stringify(expected)!==JSON.stringify(proof.groupPlans?.[card]))throw new Error('video group plan: missing or stale build provenance');
    const record=path.join(work,'work',`groups${card}.json`);
    if(JSON.stringify(JSON.parse(fs.readFileSync(record,'utf8')))!==JSON.stringify(expected))throw new Error('video group plan: runtime source/trim/clock differs from checked inputs');
    const output=path.join(work,'work',`v${card}.mp4`);
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,avg_frame_rate,width,height','-of','json',output],{encoding:'utf8'})).streams[0];
    const [num,den]=probe.avg_frame_rate.split('/').map(Number);
    if(+probe.nb_read_frames!==p.bodyFrames||num/den!==p.fps)throw new Error('video group plan: rendered body clock differs');
    // Match build-reel's input trim, PTS reset and fps conversion before selecting
    // an output frame. Seeking to sourceIn + index/fps selects a different source
    // frame when the source and output clocks differ, especially at group EOF.
    const frame=(file,index,group)=>{
      const input=group?['-ss',String(group.sourceIn),'-t',(group.frames/p.fps).toFixed(9)]:[];
      const transform=group?`scale=${probe.width}:${probe.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${probe.width}:${probe.height},setpts=PTS-STARTPTS,fps=${p.fps},trim=end_frame=${group.frames},setpts=PTS-STARTPTS,settb=AVTB,setsar=1,format=yuv420p,`:'';
      return execFileSync('ffmpeg',['-v','error',...input,'-i',file,'-frames:v','1','-vf',transform+`select=eq(n\\,${index}),scale=80:46,format=gray`,'-fps_mode','passthrough','-f','rawvideo','-'],{maxBuffer:1024*1024});
    };
    const samples=[];
    for(const g of expected.groups){
      const end=Math.min(p.bodyFrames,g.endFrame),mid=Math.floor((g.startFrame+end-1)/2),at=mid/p.fps;
      if(at<edit.join+.1 || (['black','white'].includes(edit.enter)&&at<.4) || (['black','white'].includes(edit.exit)&&at>(p.bodyFrames/p.fps)-.4))throw new Error('video group plan: group has no interior frame outside the card transition; replan the cut');
      for(const [kind,index] of [['first',g.startFrame],['middle',mid],['last',end-1]]){
        const time=index/p.fps;
        if(time<edit.join || (['black','white'].includes(edit.enter)&&time<.4) || (['black','white'].includes(edit.exit)&&time>(p.bodyFrames/p.fps)-.4)){
          samples.push({segment:g.segment,kind,at:time,coveredByCardTransition:true});continue;
        }
        const sourceAt=g.sourceIn+(index-g.startFrame)/p.fps;
        const sourceOutputFrame=index-g.startFrame;
        const a=frame(output,index),b=frame(g.file,sourceOutputFrame,g);
        if(a.length!==80*46||a.length!==b.length)throw new Error('video group plan: cannot inspect rendered source frame');
        let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);diff/=a.length;
        if(diff>15)throw new Error('video group plan: rendered group differs from declared trimmed source at card '+card+' segment '+g.segment);
        samples.push({segment:g.segment,kind,at:time,sourceAt,sourceOutputFrame,meanPixelError:diff});
      }
    }
    if(expected.handleFrames){
      const handle=path.join(work,'work',`handle${card}.mp4`);
      const h=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,avg_frame_rate','-of','json',handle],{encoding:'utf8'})).streams[0];
      const [n,d]=h.avg_frame_rate.split('/').map(Number);
      if(+h.nb_read_frames!==expected.handleFrames||n/d!==p.fps)throw new Error('video group plan: rendered live handle clock differs');
      const g=expected.groups.at(-1);
      for(const index of new Set([0,Math.floor((expected.handleFrames-1)/2),expected.handleFrames-1])){
        const local=index/p.fps,sourceAt=g.sourceIn+(p.bodyFrames-g.startFrame)/p.fps+local;
        const sourceOutputFrame=p.bodyFrames-g.startFrame+index;
        const a=frame(handle,index),b=frame(g.file,sourceOutputFrame,g);
        if(a.length!==80*46||a.length!==b.length)throw new Error('video group plan: cannot inspect live handle frame');
        let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);diff/=a.length;
        if(diff>15)throw new Error('video group plan: rendered live handle differs from declared trimmed source');
        samples.push({segment:g.segment,kind:'outgoing-live-handle',frame:index,at:local,sourceAt,sourceOutputFrame,meanPixelError:diff});
      }
    }
    checks.push({card,runtimeSha256:hash(record),samples});
  });
  return checks;
}
module.exports={declaration,compile,checkManifest,render,verifyRendered,hash,asset};
if(require.main===module){try{
  const [work,board,card,fps,frames,handle]=process.argv.slice(2);
  render(path.resolve(work),path.resolve(board),Number(card),Number(fps),Number(frames),Number(handle));
}catch(e){console.error(e.message);process.exitCode=1;}}
