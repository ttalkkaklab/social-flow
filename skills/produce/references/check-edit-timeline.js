#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const probe=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,avg_frame_rate','-of','json',f],{encoding:'utf8'})).streams[0];
function frame(file,time){return execFileSync('ffmpeg',['-v','error','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=80:46,format=gray','-f','rawvideo','-'],{maxBuffer:1024*1024});}
function difference(a,b){
  if(a.length!==80*46||b.length!==a.length)throw new Error('Cannot decode edit boundary frame');
  let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;
}
function check(work){
  const plan=JSON.parse(fs.readFileSync(path.join(work,'edit-plan.json'),'utf8'));
  if(plan.cardsSha256!==hash(path.join(work,'cards.resolved.tsv')))throw new Error('Compiled edit plan changed during assembly');
  const rows=fs.readFileSync(path.join(work,'work/edit-timeline.tsv'),'utf8').trim().split('\n').map(l=>l.split('\t'));
  if(rows.length!==plan.shots.length)throw new Error('Missing rendered edit boundaries');
  const master=path.join(work,'reel.mp4'),seams=path.join(work,'work/seams');fs.mkdirSync(seams,{recursive:true});
  const reportFile=path.join(work,'build-report.txt');
  const fade=fs.existsSync(reportFile)?fs.readFileSync(reportFile,'utf8').match(/outro splice: black fade ([\d.]+)s @ ([\d.]+)s/):null;
  const fadeDuration=fade?Number(fade[1]):0,fadeStart=fade?Number(fade[2]):Infinity;
  const samples=[];let offset=0;let timelineFps=null;
  rows.forEach((r,k)=>{
    const p=plan.shots[k],file=path.join(work,'work',`v${p.card}.mp4`),m=probe(file);
    const [num,den]=m.avg_frame_rate.split('/').map(Number),fps=num/den;
    if(timelineFps!==null && Math.abs(timelineFps-fps)>.00001)throw new Error('Cards have different frame rates');
    timelineFps=fps;
    const [id,start,frames,enter,join,handle,sourceIn]=r;
    const expectedHandle=Math.ceil(p.handle*fps-1e-6);
    if(!Number.isFinite(fps)||fps<=0||+id!==p.card||+start!==offset||+frames!==+m.nb_frames||+frames<=0||enter!==p.enter||+join!==p.join||+handle!==expectedHandle||+sourceIn!==p.in)
      throw new Error('Rendered edit differs from the source plan at card '+p.card+': '+JSON.stringify({row:r,plan:p,media:m,offset,expectedHandle}));
    if(k){
      const at=offset/fps,checks=[];
      // Inspect the applied transition and the incoming picture after it. These frames
      // catch an alternate exporter that concatenated the original clips instead.
      for(const local of [Math.min(.1,(+frames-1)/fps),Math.min(p.join+.1,(+frames-1)/fps)]){
        const reference=frame(file,local),globalTime=at+local;
        // The final output applies an episode-wide fade to black before its shared outro.
        if(fadeDuration && globalTime>=fadeStart){
          const gain=Math.max(0,1-(globalTime-fadeStart)/fadeDuration);
          for(let i=0;i<reference.length;i++)reference[i]=Math.round(reference[i]*gain);
        }
        const error=difference(frame(master,globalTime),reference);
        if(error>5)throw new Error('Master bypassed the rendered transition at card '+p.card);
        checks.push({at:at+local,meanPixelError:error});
      }
      const clip=path.join(seams,`${String(k).padStart(3,'0')}-${p.transition.replace(':','-')}.mp4`);
      execFileSync('ffmpeg',['-v','error','-y','-ss',String(Math.max(0,at-.65)),'-i',master,'-t',String(Math.min(1.6,.65+(+frames/fps))),'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac',clip]);
      let handleMotion=null;
      if(p.join){
        const prev=plan.shots[k-1],h=path.join(work,'work',`handle${prev.card}.mp4`),hm=probe(h);
        if(+hm.nb_frames!==Math.ceil(p.join*fps-1e-6))throw new Error('Missing live outgoing frames before card '+p.card);
        handleMotion=difference(frame(h,0),frame(h,Math.max(0,(+hm.nb_frames-1)/fps)));
      }
      samples.push({card:p.card,at,transition:p.transition,checks,handleMotion,
        reviewRequired:handleMotion!==null&&handleMotion<.5?'Little visible motion in outgoing handle; inspect playback':'Inspect action, eyeline, sound and visual continuity',clip:path.relative(work,clip)});
    }
    offset+=+frames;
  });
  const result={version:1,masterSha256:hash(master),editPlanSha256:hash(path.join(work,'edit-plan.json')),timelineSha256:hash(path.join(work,'work/edit-timeline.tsv')),samples};
  fs.writeFileSync(path.join(work,'edit-check.json'),JSON.stringify(result,null,2)+'\n');return result;
}
module.exports={check,difference};
if(require.main===module){try{check(path.resolve(process.argv[2]||'.'));console.log('Rendered edit boundaries verified; inspect work/seams/ playback.');}catch(e){console.error(e.message);process.exitCode=1;}}
