// Manual installed-package test: node server/test/installed-props-smoke.mjs CACHE_ROOT
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture } from './fixtures/prop-board.mjs';

const root = resolve(process.argv[2]);
const dir = mkdtempSync(join(tmpdir(), 'sf-installed-props-'));
const cli = join(root, 'skills/storyboard/references/prop-sheet-cli.js');
const run = args => JSON.parse(execFileSync(process.execPath, [cli, dir, ...args], {encoding:'utf8'}));
const client = new Client({name:'prop-install-verifier',version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,args:[join(root,'server/dist/bundle.js')],
  env:{PATH:process.env.PATH || '',HOME:process.env.HOME || '',SOCIAL_FLOW_TOOLS:'storyboard_read,storyboard_apply,storyboard_check'},stderr:'pipe'});
try {
  const win = fixture();
  win.STRUCTURE = {version:'structure-v1',sequences:[{id:'q1',title:'Loan',purpose:'Track watch',scenes:[1]}],scenes:[{no:1,place:'Room',time:'Day',event:'Loan',charge:{open:'-',close:'+'},turn:'Possession A to B'}]};
  win.SCENES.forEach((s,i)=>Object.assign(s,{scene:1,beat:i?'cta':'hook',shot:{size:i?'cu':'ls',angle:'eye',feel:'calm',info:'Watch '+i,infoType:'other'}}));
  writeFileSync(join(dir,'scenes.js'), '// approved: original\n' + Object.entries(win).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
  const first=run([]); assert.equal(first.findings.filter(f=>f.level==='bad').length,0);
  assert.equal(run(['--shot','1']).snapshot[0].after.holderId,'b');
  const edit=join(dir,'edit.json'); writeFileSync(edit,JSON.stringify(first.sheet));
  const saved=run(['--apply',edit,'--expected-sha256',first.sha256]);
  assert.ok(saved.written);assert.match(readFileSync(saved.backup,'utf8'),/approved: original/);
  await client.connect(transport);
  const listed=await client.listTools();
  const tool=listed.tools.find(t=>t.name==='storyboard_apply');assert.ok(tool?.inputSchema.properties.propSheet);
  const result=await client.callTool({name:'storyboard_read',arguments:{path:dir,level:'full'}});
  assert.ok(!result.isError);const read=JSON.parse(result.content.find(c=>c.type==='text').text);
  assert.equal(read.sha256,saved.sha256);assert.equal(read.propSheet.continuity.version,1);
  const invalid=structuredClone(read.propSheet);invalid.continuity.events[0].from.holderId='b';
  const rejected=await client.callTool({name:'storyboard_apply',arguments:{path:dir,propSheet:invalid,expectedSha256:read.sha256,draft:true,dryRun:true}});
  assert.equal(rejected.isError,true);assert.match(JSON.stringify(rejected),/Stale from/);
  assert.equal(run([]).sha256,saved.sha256);
  const valid=structuredClone(read.propSheet); valid.props[0].description='Updated silver watch';
  const written=await client.callTool({name:'storyboard_apply',arguments:{path:dir,propSheet:valid,expectedSha256:read.sha256,draft:true}});
  assert.ok(!written.isError,JSON.stringify(written));
  assert.match(readFileSync(join(dir,'scenes.js'),'utf8'),/Updated silver watch/);
  assert.ok(readFileSync(join(dir,'.prop-history',read.sha256+'.js'),'utf8'));
  const stale=await client.callTool({name:'storyboard_apply',arguments:{path:dir,propSheet:valid,expectedSha256:read.sha256,draft:true}});
  assert.equal(stale.isError,true); assert.match(JSON.stringify(stale),/head_moved/);
  console.log(JSON.stringify({root,passed:true,checks:['installed CLI state query','atomic write and backup','bundled MCP initialize/listTools','MCP propSheet schema','MCP read hash and ledger','MCP refuses invalid transfer without writing','MCP valid write and backup','MCP rejects stale hash']}));
} finally {await client.close();rmSync(dir,{recursive:true,force:true});}
