import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const CRUD = ['list','get','create','update','delete','reorder'];
const specs: Array<[string,string[]]> = [
  ['sequence',CRUD], ['scene',CRUD], ['shot',CRUD], ['shot_narration',CRUD],
  ...['episode_meta','episode_music','episode_voice','shot_camera','shot_background','shot_slide','shot_sound','shot_transition'].map(area => [area,['get','update']] as [string,string[]]),
];
export const UNIT_NAMES = specs.flatMap(([area, actions]) => actions.map(action => `portal_${area}_${action}`));
const simple: Record<string,string[]> = {
  storyboard: ['create','get','update','delete'], episode: ['list','get','update','delete'],
  background: ['list','get','create','update','delete','register','unregister'],
  prop: ['list','get','create','update','delete','register','unregister'],
  scenario: ['delete'], render_allocation: ['create'], scene: ['search'], episode_audio: ['upload'],
};
export const EXTRA_NAMES = Object.entries(simple).flatMap(([area, actions]) => actions.map(action => `portal_${area}_${action}`));
export const UNIT_TOOL_NAMES = [...UNIT_NAMES, ...EXTRA_NAMES];
const properties = {
  channel: { type: 'string', description: 'Credential channel slug; no project input.' },
  episodeId: { type: 'string', format: 'uuid' }, storyboardId: { type: 'string', format: 'uuid' },
  baseRevisionNo: { type: 'integer', minimum: 0, description: 'Head revision returned by the last read; required on unit writes.' },
  id: { type: 'string', description: 'Sequence/shot stable id, or registry entity UUID.' },
  no: { type: 'integer', minimum: 1, description: 'Story scene number.' },
  sequenceId: { type: 'string', description: 'Parent sequence for a new story scene.' },
  shotId: { type: 'string' }, index: { type: 'integer', minimum: 0, description: 'Zero-based insertion position, or narration line index.' },
  value: { type: 'object', additionalProperties: true, description: 'Field patch; nested objects merge, arrays replace. Transition: {transition,reason,transitionSeconds?,continuity?}. Sound: {sound?,effect?}. Background prompt: {bgPrompt}. Other settings use their direct object.' },
  key: { type: 'string', description: 'Episode meta key: THEME, COMPREHENSION, STORY, PRODUCTION, MOTION_POLICY, STRUCTURE, PREVIZ, SLIDE_OBJECTS, MUSIC, VOICE.' },
  order: { type: 'array', items: { anyOf: [{type:'string'},{type:'integer'}] }, description: 'Every identifier exactly once; narration uses zero-based indexes.' },
  targetSequenceId: {type:'string',description:'On sequence deletion, explicitly transfer its scenes to this sequence instead of deleting them.'},
  targetSceneNo: {type:'integer',minimum:1,description:'On scene deletion, explicitly transfer its shots to this scene instead of deleting them.'},
  shotIds: {type:'array',items:{type:'string'},description:'On scene creation, explicitly move these existing shots into the new scene.'},
  moveScenes: {type:'boolean',description:'On sequence creation, explicitly move listed existing scenes out of their old sequences.'},
  cascade: { type: 'boolean', description: 'Explicitly remove children too.' },
  draft: { type: 'boolean', default: true }, note: { type: 'string' },
  globals: { type: 'object', additionalProperties: true, description: 'Companion meta patch, e.g. update STORY.beats and numbered quotes atomically when inserting or deleting narration. Other keys and review fields are preserved.' },
  scenes: { type: 'array', items: {type:'object', additionalProperties:true}, description: 'Companion scene records for atomic sequence creation.' },
  shots: { type: 'array', items: {type:'object', additionalProperties:true}, description: 'Companion shots for an atomic structural edit.' },
  query: { type: 'string', description: 'Search narration, subtitles, titles and background prompts.' }, candidate: { type: 'string', enum:['D1','D2','D3'] },
  file: { type: 'string' }, kind: { type: 'string', enum:['music','sfx'] },
};
const descriptions: Record<string,string> = {
  episodeId:'Portal episode UUID.', storyboardId:'Portal playlist UUID.', shotId:'Stable source shot id (s0001), not the database row UUID.',
  draft:'Run the draft contract; machine-layer requirements are deferred by the standard checker.', note:'Revision note.',
  candidate:'Scenario candidate to delete.', file:'Absolute path to an existing WAV or MP3 file.', kind:'Audio media kind.',
};
const described = Object.fromEntries(Object.entries(properties).map(([key, spec]) => [key,{...spec,description: 'description' in spec ? spec.description : descriptions[key]}]));
export const UNIT_TOOLS: Tool[] = UNIT_TOOL_NAMES.map(name => {
  const read = /_(get|list|search)$/.test(name), unit = UNIT_NAMES.includes(name), remove = /_delete$/.test(name);
  const suffix=name.slice(7), pos=suffix.lastIndexOf('_'), area=suffix.slice(0,pos), action=suffix.slice(pos+1);
  const keys = ['channel']; const required: string[]=[];
  const add=(key:string,mandatory=false)=>{keys.push(key);if(mandatory)required.push(key)};
  if(unit) {
    add('episodeId',true);
    if(!read){add('baseRevisionNo',true);add('draft');add('note');add('globals');}
    if(area==='episode_meta')add('key',true);
    if(area.startsWith('shot_'))add('shotId',true);
    if(area==='shot_narration' && !['list','create','reorder'].includes(action))add('index',true);
    if(['shot_narration','shot','scene','sequence'].includes(area) && action==='create')add('index');
    if(area==='sequence' && action==='create')add('moveScenes');
    if(['sequence','shot'].includes(area) && ['get','update','delete'].includes(action))add('id',true);
    if(area==='scene' && ['get','update','delete'].includes(action))add('no',true);
    if(action==='create'||action==='update')add('value',true);
    if(action==='reorder')add('order',true);
    if(['sequence','scene'].includes(area) && action==='delete'){add('cascade');add(area==='sequence'?'targetSequenceId':'targetSceneNo');}
    if(['sequence','scene'].includes(area) && action==='create'){add('scenes');add('shots');}
    if(area==='scene'&&action==='create'){add('sequenceId',true);add('shotIds');}
  } else {
    if(area==='storyboard'&&action!=='create'||['background','prop'].includes(area)||area==='episode'&&action==='list')add('storyboardId',true);
    if(['episode','scenario','render_allocation','episode_audio'].includes(area)&&!(area==='episode'&&action==='list'))add('episodeId',true);
    if(['background','prop'].includes(area)&&!['list','create'].includes(action))add('id',true);
    if(['create','update'].includes(action))add('value',true);
    if(area==='render_allocation')add('baseRevisionNo',true);
    if(area==='scenario')add('candidate',true);
    if(area==='episode_audio'){add('file',true);add('kind',true);}
    if(area==='scene')add('query',true);
  }
  return {
    name, title:name.slice(7).replaceAll('_',' '),
    description: `${name.replaceAll('_',' ')}. ${unit ? 'Reads return headRevisionNo. Edits validate the complete board with scenes-vm and storyboard_check, then checkpoint with lease and revision conflict checks. Local files are untouched. New structure must include enough companion scenes/shots/globals to pass the contract.' : 'Workspace-scoped portal operation. Pass API fields in value; registry operations infer the project from storyboardId. Playlist create value: {title,characterId}; episode update: {title?,status?,stage?}; background create: {name,description?,imageUrl?}; prop create also needs characterId.'}${remove ? ' ⚠️ HITL: never call without user authorization to delete this resource.' : ''}`,
    annotations: read ? {readOnlyHint:true,openWorldHint:true} : {readOnlyHint:false,destructiveHint:remove,idempotentHint:false,openWorldHint:true},
    inputSchema:{type:'object',properties:Object.fromEntries(keys.map(key=>[key,described[key]])) as Tool['inputSchema']['properties'],required,additionalProperties:false},
  };
});
