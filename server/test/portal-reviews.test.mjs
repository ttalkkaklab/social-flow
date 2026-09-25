import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, it } from 'node:test';
const root=mkdtempSync(tmpdir()+'/reviews93-');
process.env.SNS_TOKEN_DIR=root;
process.env.TTALKKAKSTORY_API_URL='https://reviews93.example';
process.env.TTALKKAKSTORY_WORKSPACE='lab';
process.env.TTALKKAKSTORY_API_KEY='tks_0123456789abcdefghijklmnopqrstuvwxyzABCDEF';
process.env.TTALKKAKSTORY_HOLDER='reviewer@device';
const {runReviewTool,REVIEW_TOOLS}=await import('../dist/portal-review-tools.js');
const id='11111111-1111-4111-8111-111111111111';
const review={kind:'board',reviewer:'Critic',score:94,p0:['Missing source'],summary:'Fix the claim',source:'review:event93'};
const decision={key:'board_approval',value:'approved',chosenBy:'user',source:'human:event93'};
after(()=>rmSync(root,{recursive:true,force:true}));
function server(status=200) {
  const calls=[];
  return { calls, fetch:async(url,init={})=>{
    if(url.endsWith('/api/token'))return Response.json({success:true,data:{workspaceSlug:'lab',workspaceName:'Lab',role:'member'}});
    calls.push({url,method:init.method,body:init.body?JSON.parse(init.body):undefined});
    return Response.json(status===200?{success:true,data:{revisionNo:4,headRevisionNo:4,reviews:[review],decisions:[decision]}}:{success:false,error:'Episode head moved',code:'head_moved',detail:{head:{revisionNo:5}}},{status});
  }};
}
it('records explicit decisions and actual reviews with revision and recorder holder',async()=>{
  for(const [name,body] of [['portal_decision_record',{decision}],['portal_review_record',{review}]]){
    const s=server();const result=await runReviewTool(name,{episodeId:id,baseRevisionNo:3,...body},s.fetch);
    assert.notEqual(result.isError,true);assert.equal(s.calls[0].method,'POST');
    assert.deepEqual(s.calls[0].body,{...body,baseRevisionNo:3,sourceHost:'reviewer@device'});
  }
});
it('reads decisions history and review list without sending a write',async()=>{
  for(const name of ['portal_decision_list','portal_review_list']){
    const s=server();await runReviewTool(name,{episodeId:id,...(name==='portal_decision_list'?{history:true}:{})},s.fetch);
    assert.equal(s.calls[0].method,'GET');assert.equal(s.calls[0].body,undefined);
    const url=new URL(s.calls[0].url);
    assert.ok(url.pathname.endsWith(name==='portal_decision_list'?'/decisions':'/reviews'));
    assert.equal(url.searchParams.get('history'),name==='portal_decision_list'?'1':null);
  }
});
it('rejects invalid or revision-less writes before making a request',async()=>{
  for(const args of [{episodeId:id,review},{episodeId:id,baseRevisionNo:0,review:{...review,score:101}},{episodeId:id,baseRevisionNo:0,review:{...review,p0:'none'}}]){
    const s=server();assert.equal((await runReviewTool('portal_review_record',args,s.fetch)).isError,true);assert.equal(s.calls.length,0);
  }
  const s=server();assert.equal((await runReviewTool('portal_decision_record',{episodeId:id,baseRevisionNo:0,decision:{...decision,source:''}},s.fetch)).isError,true);assert.equal(s.calls.length,0);
});
it('surfaces conflicts without retrying or reporting success',async()=>{
  const s=server(409);const result=await runReviewTool('portal_review_record',{episodeId:id,baseRevisionNo:3,review},s.fetch);
  assert.equal(result.isError,true);assert.equal(s.calls.length,1);assert.match(result.content[0].text,/head moved/i);
});
it('advertises human evidence requirements and keeps review separate from approval',()=>{
  assert.match(REVIEW_TOOLS.find(t=>t.name==='portal_decision_record').description,/actual human answer/);
  assert.match(REVIEW_TOOLS.find(t=>t.name==='portal_review_record').description,/separate from human approvals/);
});
