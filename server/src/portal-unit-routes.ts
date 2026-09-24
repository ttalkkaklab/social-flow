import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { z } from 'zod';
import { portalClientFor, describePortalError, type FetchLike, type PortalClient } from './portal-client.js';
import { evaluateWindowScript } from './scenes-vm.js';
import { checkStoryboard, applyPatch, type Board } from './storyboard.js';
import { editUnit, unitEditSchema, object } from './portal-unit-edit.js';
import { UNIT_NAMES, UNIT_TOOL_NAMES } from './portal-unit-tools.js';

const apiArgs = z.object({
  channel:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(), episodeId:z.string().uuid().optional(), storyboardId:z.string().uuid().optional(),
  id:z.string().uuid().optional(), value:z.record(z.unknown()).optional(), query:z.string().min(1).optional(),
  candidate:z.enum(['D1','D2','D3']).optional(), file:z.string().optional(), kind:z.enum(['music','sfx']).optional(),
  baseRevisionNo:z.number().int().nonnegative().optional(),
}).strict();
function required<T>(value:T|undefined, field:string):T { if(value===undefined) throw new Error(`${field} is required`); return value; }
export async function runPortalUnit(name:string, raw:unknown, fetchImpl?:FetchLike) {
  try {
    const args = UNIT_NAMES.includes(name) ? unitEditSchema.parse(raw) : apiArgs.parse(raw);
    const client = await portalClientFor(args.channel, fetchImpl);
    if (!client) throw new Error('No portal workspace key is configured.');
    const value = UNIT_NAMES.includes(name) ? await boardOperation(client,name,unitEditSchema.parse(raw)) : await apiOperation(client,name,apiArgs.parse(raw));
    return { content:[{type:'text' as const,text:JSON.stringify(value,null,2)}], isError:typeof value === 'object' && value !== null && 'saved' in value && value.saved === false };
  } catch(error) { return {content:[{type:'text' as const,text:describePortalError(error)}], isError:true}; }
}
async function boardOperation(client:PortalClient,name:string,args:z.infer<typeof unitEditSchema>) {
  const suffix=name.slice(7), split=suffix.lastIndexOf('_'), area=suffix.slice(0,split), action=suffix.slice(split+1);
  const {data:episode}=await client.getEpisode(args.episodeId);
  const head=episode.headRevisionNo ?? 0;
  const read=['get','list'].includes(action);
  if(!read && args.baseRevisionNo!==head) throw new Error(`head_moved: expected ${args.baseRevisionNo}, current ${head}. Read and reconcile before retrying.`);
  // One detail response contains the head and its raw meta/shots; do not mix separate head reads.
  const detail=episode as unknown as Record<string,unknown>;
  const meta=object(detail.meta ?? {});
  const board:Board={...meta, SB_DOC:{...object(meta.SB_DOC ?? {}),backgrounds:detail.backgrounds,props:detail.props,characters:detail.characters,narratorCharacterId:detail.narratorCharacterId},SCENES:(detail.scenes as Array<{extra:never}>).map(s=>s.extra)};
  // Legacy boards without ids receive deterministic ids at this observed head.
  // A later write persists them under the same optimistic revision guard.
  const identified = (board.SCENES ?? []).some(shot => !shot.id)
    ? applyPatch(board,{path:'',dryRun:false,draft:args.draft}).win : board;
  const result=editUnit(identified,area,action,args);
  if(read) return {headRevisionNo:head,value:result.value};
  const normalized=applyPatch(result.board,{path:'',dryRun:false,draft:args.draft});
  if(normalized.findings.some(f=>f.level==='bad')) throw new Error(`Board not saved: ${JSON.stringify(normalized.findings)}`);
  const source=Object.entries(normalized.win).map(([key,value])=>`window[${JSON.stringify(key)}] = ${JSON.stringify(value)};`).join('\n');
  const checked=evaluateWindowScript(source);
  const dir=mkdtempSync(join(tmpdir(),'portal-unit-'));
  try {
    const file=join(dir,'scenes.js'); writeFileSync(file,source);
    // Companion source documents are needed by the same checker used for local boards.
    for(const doc of episode.documents ?? []) if(['scenario.md','script.md'].includes(doc.filename)) writeFileSync(join(dir,doc.filename),await client.document(args.episodeId,doc.filename));
    const chosen=episode.scenarios?.find(s=>s.chosen);
    if(chosen) writeFileSync(join(dir,'scenario.md'),await client.scenarioMd(args.episodeId,chosen.candidate));
    const check=checkStoryboard({path:file,draft:args.draft});
    if(check.violations) return {saved:false,headRevisionNo:head,check};
    const {SCENES,SB_DOC,...nextMeta}=checked;
    // SB_DOC is metadata too; keep extensions such as imported registries.
    const {data}=await client.checkpoint(args.episodeId,{stage:episode.stage ?? 'board',baseRevisionNo:head,sourceHost:client.holder,note:args.note ?? name,scenes:SCENES,backgrounds:object(SB_DOC).backgrounds,props:object(SB_DOC).props,meta:{...nextMeta,SB_DOC},characters:object(SB_DOC).characters,narratorCharacterId:object(SB_DOC).narratorCharacterId});
    return {saved:true,...data,check,localCopy:{unchanged:true,syncRequired:true}};
  } finally {rmSync(dir,{recursive:true,force:true});}
}
async function apiOperation(c:PortalClient,name:string,a:z.infer<typeof apiArgs>) {
  const suffix=name.slice(7),at=suffix.lastIndexOf('_'),area=suffix.slice(0,at),action=suffix.slice(at+1);
  const body=()=>required(a.value,'value');
  const ep=()=>required(a.episodeId,'episodeId');
  const sb=()=>required(a.storyboardId,'storyboardId');
  const id=()=>required(a.id,'id');
  if(area==='storyboard') return (await c.request(action==='get'?'GET':action==='create'?'POST':action==='update'?'PATCH':'DELETE',`/storyboards${action==='create'?'':`/${sb()}`}`,['create','update'].includes(action)?body():undefined)).data;
  if(area==='episode') {
    if(action==='list') return (await c.listEpisodes(sb())).data;
    if(action==='get') return (await c.getEpisode(ep())).data;
    return (await c.request(action==='update'?'PATCH':'DELETE',`/episodes/${ep()}`,action==='update'?body():undefined)).data;
  }
  if(area==='scene' && action==='search') return (await c.request('GET',`/scenes/search?q=${encodeURIComponent(required(a.query,'query'))}`)).data;
  if(area==='scenario') return (await c.request('DELETE',`/episodes/${ep()}/scenarios/${required(a.candidate,'candidate')}`)).data;
  if(area==='render_allocation') return (await c.request('POST',`/episodes/${ep()}/render-allocation`,{...body(),baseRevisionNo:required(a.baseRevisionNo,'baseRevisionNo'),sourceHost:c.holder})).data;
  if(area==='episode_audio') {
    const file=required(a.file,'file'),kind=required(a.kind,'kind');
    const mime=extname(file).toLowerCase()==='.wav'?'audio/wav':extname(file).toLowerCase()==='.mp3'?'audio/mpeg':null;
    if(!mime) throw new Error('Audio must be a WAV or MP3 file');
    const bytes=readFileSync(file);
    if(!bytes.length || bytes.length>10*1024*1024) throw new Error('Audio must be 1 byte..10 MiB');
    return (await c.uploadMedia(ep(),kind,bytes,mime)).data;
  }
  if(area==='background'||area==='prop') {
    const plural=area==='background'?'backgrounds':'props';
    const registry=object((await c.request('GET',`/storyboards/${sb()}/registry`)).data);
    if(action==='register'||action==='unregister') return (await c.request(action==='register'?'POST':'DELETE',`/storyboards/${sb()}/registry`,{kind:area,entityId:id()})).data;
    const entries=registry[plural] as Array<{entityId:string}>;
    if(action==='list') return entries;
    if(action==='get') {
      const response=(await c.request('GET',`/projects/${registry.projectId}/${plural}`)).data;
      const rows=Array.isArray(response)?response:object(response)[plural] as Array<{id:string}>;
      return required(rows.find((row:{id:string})=>row.id===id() && entries.some(e=>e.entityId===row.id)),area);
    }
    if(action==='create') {
      return (await c.request('POST',`/storyboards/${sb()}/registry`,{kind:area,value:body()})).data;
    }
    if(!entries.some(e=>e.entityId===id())) throw new Error('Entity is not registered on this storyboard');
    return (await c.request(action==='update'?'PATCH':'DELETE',`/${plural}/${id()}`,action==='update'?body():undefined)).data;
  }
  throw new Error('Unknown portal tool');
}
export const UNIT_ROUTES=Object.fromEntries(UNIT_TOOL_NAMES.map(name=>[name,(args:unknown)=>runPortalUnit(name,args)]));
