// Explicit installed-package exercise; no generation or paid review.
// node server/test/installed-acting-smoke.mjs CACHE_ROOT
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(process.argv[2]);
const dir = mkdtempSync(join(tmpdir(), 'sf-acting-install-'));
const client = new Client({ name:'installed-acting-regression', version:'1.0.0' });
const transport = new StdioClientTransport({ command:process.execPath, args:[join(root,'server/dist/bundle.js')],
  env:{PATH:process.env.PATH || '',HOME:process.env.HOME || '',SOCIAL_FLOW_TOOLS:'speech_manage,acting_review,host_review'}, stderr:'pipe' });
const checks = [];
async function call(args, errorPattern) {
  const result = await client.callTool({name:'speech_manage',arguments:{path:dir,...args}});
  const body = result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  if (errorPattern) { assert.equal(result.isError,true); assert.match(body,errorPattern); return; }
  assert.ok(!result.isError,body); return JSON.parse(body);
}
try {
  const voice = {engine:'gemini',model:'gemini-2.5-flash-preview-tts',voiceId:'Kore',language:'ko',speed:1,stylePrompt:'Bright cheerful sales presenter.'};
  const win = {STORY:{version:'story-v2'},SB_DOC:{characters:[{id:'host',tts:voice}]},SCENES:[
    {id:'s0021',type:'points',narration:[{id:'s021-line',speaker:'host',delivery:'on_screen',tts:'무슨 합격이요?',sub:'무슨 합격이요?'}],visual:{video:{engine:'astra',model:'ltx-2.5'}}},
    {id:'s0019',type:'points',narration:[{id:'s019-line',speaker:'host',delivery:'on_screen',tts:'완판입니다!',sub:'완판입니다!'}]}
  ]};
  writeFileSync(join(dir,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  await client.connect(transport);
  const listed = (await client.listTools()).tools;
  assert.ok(listed.find(t=>t.name==='speech_manage').inputSchema.properties.patch.properties.acting);
  assert.ok(listed.find(t=>t.name==='acting_review'));
  checks.push('fresh bundled MCP exposes acting and opt-in review');
  let current = await call({action:'list'});
  const originalOther = current.lines[1];
  const acting={context:'The guest asks if he passed a job interview during a cooking broadcast.',intent:'Ask what he means.',emotion:'Quiet genuine puzzlement.',vocal:'Natural Korean medium female voice; small questioning rise, no sales enthusiasm.',visual:'Hands resting separately, look toward guest at screen left.',leadInSeconds:.25,tailOutSeconds:.4};
  current=await call({action:'update',lineId:'s021-line',expectedRevision:current.revision,patch:{acting}});
  const planned=await call({action:'plan_audio',lineId:'s021-line'});
  const plan=planned.audioPlans[0];
  assert.equal(plan.arguments.voiceName,'Kore');assert.equal(plan.arguments.model,voice.model);
  assert.match(plan.arguments.stylePrompt,/genuine puzzlement/);assert.doesNotMatch(plan.arguments.stylePrompt,/cheerful sales/);
  checks.push('installed direction changes affect plan while identity stays fixed');
  const audio=join(dir,'take.wav');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=300:duration=1','-ac','1','-ar','24000',audio]);
  assert.ok(listed.find(t=>t.name==='host_review'));
  const handoff=await client.callTool({name:'host_review',arguments:{mediaPath:audio,mode:'audio',brief:'Inspect this exact voice only with native host audio capabilities.'}});
  assert.ok(!handoff.isError);
  const evidence=JSON.parse(handoff.content.find(c=>c.type==='text').text);
  assert.equal(evidence.status,'not_reviewed');assert.equal(evidence.externalEvaluationCalls,0);assert.equal(evidence.score,null);
  checks.push('installed host review prepares evidence without external judgment or invented score');
  const generation={generator:plan.generator,voiceSettings:plan.arguments,language:plan.language,text:'무슨 합격이요?'};
  await call({action:'attach_audio',lineId:'s021-line',expectedRevision:current.revision,audioPath:audio,generation:{...generation,voiceSettings:{...plan.arguments,stylePrompt:voice.stylePrompt}}},/style|direction/i);
  await call({action:'attach_audio',lineId:'s021-line',expectedRevision:current.revision,audioPath:audio,generation:{...generation,voiceSettings:{...plan.arguments,voiceName:'Charon'}}},/voice|pinned/i);
  current=await call({action:'attach_audio',lineId:'s021-line',expectedRevision:current.revision,audioPath:audio,generation});
  assert.equal(current.lines[0].audioCurrent,true);
  checks.push('installed attachment accepts resolved style and rejects wrong voice/old style');
  const capabilities={provider:'astra',model:'ltx-2.5',audioConditioning:true,lipSync:true,postLipSync:false,evidence:'Installed adapter accepts supplied audio.'};
  const video=await call({action:'plan_video',shotId:'s0021',capabilities});
  assert.equal(video.plan.boundary,'one_shot_per_generation');assert.equal(video.plan.performance.length,1);
  assert.equal(video.plan.performance[0].acting.visual,acting.visual);
  assert.ok(Math.abs(video.plan.durationSeconds-1.65)<.01);
  checks.push('installed video plan shares acting and measured anticipation/reaction time');
  const clip=join(dir,'clip.mp4');writeFileSync(clip,'binding fixture, not visual review');
  current=await call({action:'attach_video',shotId:'s0021',expectedRevision:current.revision,videoPath:clip,capabilities});
  current=await call({action:'update',lineId:'s021-line',expectedRevision:current.revision,patch:{acting:{...acting,emotion:'Restrained disbelief.'}}});
  assert.ok(current.invalidated.video);assert.equal(current.lines[0].audioCurrent,false);
  const other=(await call({action:'list',lineId:'s019-line'})).lines[0];
  assert.equal(other.speechRevision,originalOther.speechRevision);
  checks.push('acting-only edit invalidates dependent media and preserves other line');
  console.log(JSON.stringify({root,passed:true,checks,bundleSha256:createHash('sha256').update(readFileSync(join(root,'server/dist/bundle.js'))).digest('hex'),server:client.getServerVersion()}));
} finally { await client.close();rmSync(dir,{recursive:true,force:true}); }
