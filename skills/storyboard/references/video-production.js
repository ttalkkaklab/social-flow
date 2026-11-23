(function(root) {
'use strict';
const repairs = [
 {id:'trim', defect:'ending', label:['끝부분 자르기','Trim the ending'], action:'Edit the existing clip; preserve source bytes.', risk:'Check the last action and the next cut.'},
 {id:'mix', defect:'volume', label:['음량 조정','Adjust audio level'], action:'Adjust the existing soundtrack in assembly.', risk:'Check clipping and the neighbouring clips.'},
 {id:'upscale', defect:'resolution', label:['업스케일','Upscale'], action:'Use the selected supported upscaler; retain the original take.', risk:'Upscaling cannot repair wrong identity or action.'},
 {id:'speech', defect:'voice', label:['음성 수정','Repair speech'], action:'Use edit-speech; assess whether dubbing or a new speaking clip is needed.', risk:'Replacing native speech can break lip sync. Do not dub automatically.'},
 {id:'regenerate', defect:'staging', label:['계획 수정 후 재생성','Revise the plan and regenerate'], action:'Fix the earliest wrong layer, then plan a separate attempt under existing authorization.', risk:'A new take can change faces and motion. Retain the previous candidate.'}
];
const obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safePath = x => typeof x === 'string' && x && !/^[\s/\\]|[\x00-\x1f]|^[a-z][a-z0-9+.-]*:/i.test(x) && !x.includes('\\');
function changes(before, after) {
 if (!before) return [];
 return ['prompt','selection','settings','inputs','performance'].filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));
}
// Use the actual adapter when a saved request overrides the board operation.
function generationMode(selection, tool, references, adapters) {
 const adapter=tool && adapters?.find(row=>row.tool===tool);
 const engine=adapter?.engine || selection?.engine, operation=adapter?.operation || selection?.operation;
 if(tool==='astra_genai_msr' || engine==='astra-genai' && operation==='reference')return 'MSR';
 if(engine==='astra-genai' && operation==='image' && Array.isArray(references) && references.some(ref=>
  ref && (ref.role ? ref.role!=='background' && ['video','both'].includes(ref.use) : !ref.background)))return 'MSR';
 return ({image:'I2V',audio:'A2V',text:'T2V',reference:'reference'})[operation] || null;
}
function currentPlan(candidates, sceneNo, ids) {
 const matches=(candidates || []).filter(c=>{
  if(!c.prompt || c.stale!==false && !(c.stale===null && c.boardMatches===true))return false;
  if(sceneNo===undefined)return c.sceneNo===undefined && c.shotId===ids[0];
  return c.sceneNo===sceneNo && Array.isArray(c.shotIds) && c.shotIds.length===ids.length && c.shotIds.every((id,i)=>id===ids[i]);
 });
 return matches.filter(c=>c.selected).pop() || matches.filter(c=>c.stale===false).pop() || matches.pop();
}
function read(directory, board, {verifyInputs=true} = {}) {
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const dir=path.resolve(directory),episode=path.dirname(dir),store=path.join(episode,'.work/video-routing');
 const warnings=[];
 const json=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')warnings.push('Unreadable production record: '+path.basename(file));return null;}};
 const state=json(path.join(store,'state.json')) || {jobs:{}};
 const jobs=obj(state.jobs);
 const sources=[{root:episode,store,jobs}];
 // Finished takes may have been rendered from an episode-local production copy.
 // Keep those records read-only. New jobs and recovery still belong to their original store.
 const archives=json(path.join(store,'archives.json'));
 for(const relative of Array.isArray(archives)?new Set(archives):[]) {
  if(typeof relative!=='string'||!relative.startsWith('.work/')||relative.split('/').some(part=>!part||part==='.'||part==='..')||relative.includes('\\'))continue;
  const root=path.join(episode,relative),archive=path.join(root,'.work/video-routing');
  if(!fs.existsSync(archive))continue;
  const within=path.relative(fs.realpathSync(episode),fs.realpathSync(archive));
  if(!within.startsWith('.work'+path.sep))continue;
  sources.push({root,store:archive,jobs:obj(json(path.join(archive,'state.json'))?.jobs)});
 }
 const win=board || (fs.existsSync(path.join(dir,'scenes.js'))?require('../../autoproduce/references/cost-preview.js').readScenes(path.join(dir,'scenes.js')):{});
 const shots=win.SCENES || [], contexts=new Map(), hashes=new Map();
 const local=file=>{
  if(typeof file!=='string'||!file||/^[a-z][a-z0-9+.-]*:/i.test(file))return null;
  const absolute=path.resolve(dir,file), relative=path.relative(dir,absolute).split(path.sep).join('/');
  // Only episode output files are published as playable candidates. Reference paths are display text.
  const within=path.relative(episode,absolute);
  if(within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within)||!safePath(relative)||!fs.existsSync(absolute))return null;
  const real=path.relative(fs.realpathSync(episode),fs.realpathSync(absolute));
  return real==='..'||real.startsWith('..'+path.sep)||path.isAbsolute(real)?null:relative;
 };
 const adapters=require('../../_shared/video-catalog.json').adapters;
 const current=(shotId,sceneNo)=>{
  const id=JSON.stringify([shotId,sceneNo]);
  if(!contexts.has(id)) {
   try {
    const context=require('../../_shared/video-selection.js').readVideoContext(episode,shotId,sceneNo);
    contexts.set(id,{revision:context.revision,mode:generationMode(context.selection,null,context.shot?.visual?.references,adapters)});
   }catch{contexts.set(id,null);}
  }
  return contexts.get(id);
 };
 const hash=file=>{
  if(!hashes.has(file)) {try{hashes.set(file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));}catch{hashes.set(file,null);}}
  return hashes.get(file);
 };
 const blockedDir=path.join(store,'blocked');
 const blocked=fs.existsSync(blockedDir)?fs.readdirSync(blockedDir).filter(f=>f.endsWith('.json')).map(f=>json(path.join(blockedDir,f))).filter(Boolean):[];
 const candidates=[],archivedJobs=new Map(),planStores=new Map();
 const livePlanIds=new Set(Object.values(jobs).map(job=>job.planId));
 const records=sources.flatMap(source=>{
  const plans=path.join(source.store,'plans');
  return fs.existsSync(plans)?fs.readdirSync(plans).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(file=>({source,file,record:path.join(plans,file)})):[];
 });
 for(const {source,file,record} of records) {
  const plan=json(record);
  if(!plan)continue;
  if(plan.id!==file.slice(0,-5) || path.resolve(plan.episode || '.')!==source.root) {warnings.push('Invalid production plan: '+file);continue;}
  const job=source.jobs[plan.requestId]?.planId===plan.id?source.jobs[plan.requestId]:null;
  if(source.root!==episode) {
   if(job?.status!=='completed'||livePlanIds.has(plan.id)||archivedJobs.has(plan.id))continue;
   archivedJobs.set(plan.id,job);
  }
  planStores.set(plan.id,source.store);
  const args=obj(plan.args),shot=shots.find(s=>s.id===plan.shotId),video=obj(shot?.visual?.video);
  const output=typeof args.outputPath==='string' && typeof args.filename==='string'?path.resolve(args.outputPath,args.filename):null;
  const clip=job?.status==='completed'&&output?local(output):null;
  const receipt=output&&local(output+'.astra-genai.json')?json(output+'.astra-genai.json'):null;
  let endpoint=null;
  if(receipt?.baseUrl) {try{const u=new URL(receipt.baseUrl);if(['http:','https:'].includes(u.protocol))endpoint=u.origin;}catch{/* Unusable endpoint is not evidence. */}}
  const settings=Object.fromEntries(['durationSeconds','duration','numFrames','frameRate','resolution','width','height','generateAudio'].filter(k=>args[k]!==undefined).map(k=>[k,args[k]]));
  const inputs=Object.entries(obj(plan.inputs)).map(([file,sha256])=>({path:path.relative(dir,file).split(path.sep).join('/'),sha256,changed:verifyInputs?hash(file)!==sha256:null}));
  const revision=current(plan.shotId,plan.sceneNo)?.revision ?? null;
  const boardMatches=revision===null?null:revision===plan.contextRevision;
  const stale=boardMatches===false||inputs.some(i=>i.changed===true)?true:boardMatches===null||inputs.some(i=>i.changed===null)?null:false;
  const attached=typeof video.clip==='string'?video.clip:typeof shot?.visual?.clip==='string'?shot.visual.clip:null;
  const selected=Boolean(clip&&attached&&path.resolve(dir,attached)===path.resolve(dir,clip)&&
   (!plan.sceneNo || plan.shotIds.every(id=>{
    const member=shots.find(s=>s.id===id), file=member?.visual?.video?.clip || member?.visual?.clip;
    return typeof file==='string' && path.resolve(dir,file)===path.resolve(dir,clip);
   })));
  candidates.push({...(plan.sceneNo ? {sceneNo:plan.sceneNo,shotIds:plan.shotIds} : {}),boardMatches,planId:plan.id,requestId:plan.requestId,shotId:plan.shotId,purpose:plan.purpose||'unspecified',basedOnRequestId:plan.basedOnRequestId||null,changeNote:plan.changeNote||'',
   createdAt:fs.statSync(record).mtime.toISOString(),startedAt:job?.startedAt||null,updatedAt:job?.updatedAt||null,finishedAt:job?.finishedAt||null,
   status:job?.status||'planned',providerStatus:job?.providerStatus||null,observedAt:job?.observedAt||null,providerId:job?.providerId||receipt?.jobId||null,endpoint,
   selection:plan.selection,generationMode:generationMode(plan.selection,plan.tool,args.references,adapters),settings,prompt:typeof args.prompt==='string'?args.prompt:'',sourcePrompt:plan.sourcePrompt||'',currentPrompt:video.prompt||'',
   inputs,imageBindings:(plan.imageBindings||[]).map(b=>({id:b.id,path:path.relative(dir,b.path).split(path.sep).join('/'),role:b.role,purpose:b.purpose,preserve:b.preserve,avoid:b.avoid,submitted:b.submitted})),
   characterBindings:job?.characterBindings||plan.characterBindings,
   directionBindings:plan.directionBindings||[],voiceContinuity:plan.voiceContinuity?{strategy:plan.voiceContinuity.strategy,speakers:(plan.voiceContinuity.speakers||[]).map(s=>({speaker:s.speaker,audioIndex:s.audioIndex,imageIndices:s.imageIndices,screenBinding:s.screenBinding,reference:s.reference?{path:path.relative(dir,s.reference.path).split(path.sep).join('/'),sha256:s.reference.sha256}:null})),warnings:plan.voiceContinuity.warnings}:null,
   performance:plan.performance||null,warnings:plan.directionWarnings||[],stale,clip,selected,
   cost:{reservedUsd:job?.reserveUsd??plan.quote?.reserveUsd,settledUsd:job?.settledUsd??null,basis:plan.quote?.basis||'unknown'},
   review:selected&&!plan.sceneNo&&video.speechBinding?.quality?.review==='pass'?
    verifyInputs?(video.speechBinding.videoSha256===hash(output)?'pass':'not_reviewed'):'unverified':'not_reviewed',
   recovery:job&&!['completed','failed'].includes(job.status)?{tool:'video_status',episode,requestId:plan.requestId,action:/^astra_genai_/.test(plan.tool)?'refresh':'read'}:null});
 }
 candidates.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.planId.localeCompare(b.planId));
 for(const candidate of candidates) {
  const previous=candidate.basedOnRequestId?candidates.find(c=>planStores.get(c.planId)===planStores.get(candidate.planId)&&c.requestId===candidate.basedOnRequestId&&c.shotId===candidate.shotId&&c.planId!==candidate.planId):null;
  candidate.changes=changes(previous,candidate);
 }
 const unique=status=>new Set(candidates.filter(status).flatMap(c=>c.shotIds||[c.shotId])).size;
 const jobList=[...Object.values(jobs),...archivedJobs.values()];
 const attachedIds=new Set(candidates.filter(c=>c.selected).flatMap(c=>c.shotIds||[c.shotId]));
 for(const shot of shots) {
  const cuts=shot.productionPlan?.cuts;
  if(shot.id&&local(shot.visual?.video?.clip)&&Array.isArray(cuts)&&cuts.some(c=>c?.kind==='generated_video'&&local(c.path)))attachedIds.add(shot.id);
 }
 const sceneModes={},shotModes={};
 for(const scene of win.STRUCTURE?.scenes || []) {
  const members=shots.filter(shot=>shot.scene===scene.no);
  if(!members.length)continue;
  const plan=currentPlan(candidates,scene.no,members.map(shot=>shot.id));
  if(!plan && !members.some(shot=>shot.shot?.render?.mode==='generated_video'))continue;
  const mode=plan?.generationMode || current(members[0].id,scene.no)?.mode;
  if(mode)sceneModes[scene.no]=mode;
 }
 for(const shot of shots) {
  if(!shot.id || shot.scene!=null || !(shot.shot?.render?.mode==='generated_video' || shot.visual?.video || shot.type==='broll' || shot.type==='quote' && shot.visual?.clip))continue;
  const mode=currentPlan(candidates,undefined,[shot.id])?.generationMode || current(shot.id)?.mode;
  if(mode)shotModes[shot.id]=mode;
 }
 return {version:1,storyboardPath:dir,sceneModes,shotModes,asOf:[...candidates.flatMap(c=>[c.createdAt,c.updatedAt,c.observedAt]).filter(Boolean)].sort().at(-1)||null,
  summary:{plannedShots:unique(()=>true),completedShots:unique(c=>c.status==='completed'&&!!c.clip),attachedShots:attachedIds.size,reviewedShots:candidates.some(c=>c.review==='unverified')?null:unique(c=>c.selected&&c.review==='pass'),
   pendingRequests:jobList.filter(j=>!['completed','failed'].includes(j.status)).length,unknownRequests:jobList.filter(j=>j.status==='submission_unknown').length,
   reservedOrSpentUsd:jobList.reduce((n,j)=>n+(j.settledUsd??j.reserveUsd??0),state.openingSpendUsd||0)},candidates,blocked,warnings,repairs};
}
function write(episode) {
 const fs=require('node:fs'),path=require('node:path');
 const dir=path.join(episode,'storyboard');
 if(!fs.existsSync(path.join(dir,'scenes.js')))return;
 const data=read(dir,undefined,{verifyInputs:false}),file=path.join(dir,'video-production-data.js'),tmp=file+'.'+process.pid+'.tmp';
 try {fs.writeFileSync(tmp,'window.VIDEO_PRODUCTION = '+JSON.stringify(data).replace(/</g,'\\u003c')+';\n',{mode:0o600});fs.renameSync(tmp,file);} finally {fs.rmSync(tmp,{force:true});}
}
function render(report,shotId,language,sceneNo) {
 const ko=language==='ko',t=(a,b)=>ko?a:b,items=(report?.candidates||[]).filter(c=>sceneNo === undefined ? !c.sceneNo && c.shotId===shotId : c.sceneNo===sceneNo);
 const problems=(report?.blocked||[]).filter(p=>sceneNo===undefined?p.shotId===shotId:p.sceneNo===sceneNo)
  .map(p=>'<p class="production-review">'+esc([p.shotId,p.character,p.role,p.code].filter(Boolean).join(' · '))+'<br>'+esc(p.message)+'</p>').join('');
 if(!items.length)return problems;
 const labels={planned:t('계획만 저장','Planned'),submitting:t('제출 중','Submitting'),submitted:t('제출됨','Submitted'),submission_unknown:t('결과 확인 필요','Outcome unknown'),completed:t('생성 완료','Completed'),failed:t('실패','Failed')};
 const purpose={draft:t('초안','Draft'),final:t('최종본','Final'),revision:t('수정본','Revision'),unspecified:t('용도 미지정','Unspecified')};
 const row=(label,value)=>'<dt>'+esc(label)+'</dt><dd>'+esc(value ?? '—')+'</dd>';
 const cards=items.map(c=>{
  const elapsed=c.startedAt?Math.round(Math.max(0,(Date.parse(c.finishedAt||c.updatedAt)-Date.parse(c.startedAt))/1000)):null;
  let h='<article class="production-take"><h4>'+esc(purpose[c.purpose]||c.purpose)+' · '+esc(labels[c.status]||c.status)+(c.selected?' · '+t('현재 연결됨','Attached'):'')+'</h4>';
  if(c.clip&&safePath(c.clip))h+='<video controls preload="none" src="'+esc(c.clip)+'"></video>';
  h+='<dl>'+row(t('요청','Request'),c.requestId)+row(t('모델','Model'),[c.selection?.engine,c.selection?.model,c.settings?.resolution||c.selection?.resolution].filter(Boolean).join(' / '))+
   row(t('연결 서버 기록','Recorded endpoint'),c.endpoint)+row(t('로컬 상태 갱신','Local state update'),c.updatedAt)+row(t('서버 상태 확인','Provider observation'),c.observedAt)+row(t('서버가 보고한 상태','Provider status'),c.providerStatus)+row(t('시작 시각','Started'),c.startedAt)+row(t('기록된 경과 시간(초)','Recorded elapsed seconds'),elapsed)+
   row(t('비용(USD)','Cost (USD)'),c.cost.settledUsd===null?t('예약·추정 ','Reserved/estimated ')+c.cost.reservedUsd:c.cost.settledUsd)+row(t('변경 이유','Change note'),c.changeNote)+row(t('이전 후보와 다른 항목','Changed fields'),c.changes.map(key=>ko?({prompt:'프롬프트',selection:'모델 선택',settings:'생성 설정',inputs:'참조 자료',performance:'행동 시간표'}[key]||key):key).join(', '))+'</dl>';
  h+='<p>'+esc(c.stale===true?t('현재 보드와 입력이 달라졌습니다.','The board or inputs have changed.'):c.stale===null?t('현재 보드와의 일치 여부를 확인하지 못했습니다.','Current plan consistency is unknown.'):t('저장된 계획과 일치합니다.','Matches the saved plan.'))+' '+esc(t('생성 완료는 검수 통과를 뜻하지 않습니다.','Generation completion is not a review pass.'))+'</p>';
  if(c.characterBindings?.length)h+='<ul>'+c.characterBindings.map(b=>'<li>'+esc([b.shotId,b.character,b.role,b.media+' '+b.slot,b.asset?.assetId||b.taskId||b.sha256].filter(Boolean).join(' · '))+'</li>').join('')+'</ul>';
  if(c.recovery)h+='<p>'+esc(t('재제출하지 말고 같은 요청을 조회하세요.','Inspect the same request without resubmitting.'))+'</p><pre>'+esc(JSON.stringify(c.recovery,null,2))+'</pre>';
  h+='<details><summary>'+t('실제 요청과 참조 자료','Actual request and references')+'</summary><p>'+t('보드에 작성한 프롬프트','Authored prompt')+'</p><pre>'+esc(c.sourcePrompt)+'</pre><p>'+t('모델에 전달하는 프롬프트','Adapter prompt')+'</p><pre>'+esc(c.prompt)+'</pre><h5>'+t('참조 자료','References')+'</h5><ul>'+c.imageBindings.map(b=>'<li><b>'+esc(b.id)+'</b> · '+esc(b.role)+' · '+esc(b.submitted?t('요청에 포함','Included'):t('직접 전송 안 함','Not sent directly'))+'<br>'+esc(b.purpose)+'<br>'+esc(t('유지: ','Preserve: ')+(b.preserve||[]).join('; '))+'<br>'+esc(t('제외: ','Exclude: ')+(b.avoid||[]).join('; '))+'</li>').join('')+'</ul>'+
   '<h5>'+t('행동·대사 시간표','Performance timeline')+'</h5><p>'+esc(c.performance?.timing||t('시간표 없음','No timeline'))+'</p><ol>'+(c.performance?.performance||[]).map(b=>'<li>'+esc((b.startSeconds??'?')+'–'+(b.endSeconds??'?')+'s · '+(b.character||b.speaker||'')+' · '+(b.videoDirection||b.text||''))+'</li>').join('')+'</ol>'+
   '<details><summary>'+t('설정 전달 경로·음성 연결','Direction and voice mappings')+'</summary><pre>'+esc(JSON.stringify({direction:c.directionBindings,voice:c.voiceContinuity,warnings:c.warnings},null,2))+'</pre></details></details>'+
   (c.clip&&!(c.shotIds?.length>1)?'<details><summary>'+t('에이전트에 전달할 연결 요청','Attachment request for the agent')+'</summary><pre>'+esc(JSON.stringify({tool:'speech_manage',path:report.storyboardPath,action:'attach_video',shotId:c.shotId,videoPath:c.clip},null,2))+'</pre></details>':'')+'</article>';
  return h;
 }).join('');
 return problems+'<details class="production-review"><summary>'+t('생성 후보 · 실제 요청','Takes and actual requests')+' ('+items.length+')</summary><p>'+t('후보를 비교한 뒤 기존 영상 연결 도구로 채택합니다. 이 화면은 파일을 변경하지 않습니다.','Compare takes, then use the existing attachment tool to adopt one. This view does not modify files.')+'</p><div class="production-takes">'+cards+'</div><details><summary>'+t('문제별 수정 방법','Repair options')+'</summary><ul>'+repairs.map(r=>'<li><b>'+esc(r.label[ko?0:1])+'</b> — '+esc(ko?({trim:'기존 영상의 끝부분을 자릅니다. 마지막 동작과 다음 컷 연결을 확인합니다.',mix:'기존 음원을 조정합니다. 클리핑과 앞뒤 영상의 음량을 확인합니다.',upscale:'원본을 보존하고 지원하는 업스케일러를 사용합니다. 얼굴·행동 오류는 고칠 수 없습니다.',speech:'음성을 수정하고 더빙 또는 말하는 클립 재생성을 선택합니다. 더빙은 립싱크를 바꿀 수 있습니다.',regenerate:'처음 잘못된 이미지나 계획을 수정한 뒤 별도 후보를 생성합니다. 이전 후보와 얼굴·움직임을 비교합니다.'}[r.id]):r.action+' '+r.risk)+'</li>').join('')+'</ul></details></details>';
}
function renderSummary(report,language) {
 if(!report?.candidates?.length)return '';
 const ko=language==='ko',s=report.summary;
 return '<section class="production-review"><h3>'+(ko?'영상 제작 현황':'Video production')+'</h3><p>'+
  (ko?'생성 완료 '+s.completedShots+'샷 · 연결 '+s.attachedShots+'샷 · 검수 통과 '+(s.reviewedShots===null?'미확인':s.reviewedShots+'샷')+' · 진행/확인 대기 '+s.pendingRequests+'건 · 결과 불명 '+s.unknownRequests+'건'
     :'Generated '+s.completedShots+' shots · Attached '+s.attachedShots+' · Reviewed '+(s.reviewedShots===null?'unverified':s.reviewedShots)+' · Pending '+s.pendingRequests+' requests · Unknown '+s.unknownRequests)+
  '</p><p>'+(ko?'저장된 상태 기준: ':'Snapshot: ')+esc(report.asOf||'—')+'</p>'+report.warnings.map(w=>'<p>'+esc(w)+'</p>').join('')+'</section>';
}
const api={read,write,render,renderSummary,changes,repairs,generationMode,currentPlan};
if(typeof module==='object'&&module.exports)module.exports=api;else root.VIDEO_PRODUCTION_REVIEW=api;
})(typeof window==='object'?window:globalThis);
