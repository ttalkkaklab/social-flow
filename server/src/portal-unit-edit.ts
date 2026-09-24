/** Unit edits preserve unknown fields; the caller checks the complete resulting board. */
import { z } from 'zod';
import { applyPatch, contract, transitionPatchSchema, type Board, type Shot } from './storyboard.js';

export const unitEditSchema = z.object({
  episodeId: z.string().uuid(), channel: z.string().optional(),
  baseRevisionNo: z.number().int().nonnegative().optional(),
  id: z.string().optional(), no: z.number().int().positive().optional(),
  sequenceId: z.string().optional(), shotId: z.string().optional(),
  targetSequenceId: z.string().optional(), targetSceneNo: z.number().int().positive().optional(), shotIds: z.array(z.string()).optional(),
  index: z.number().int().nonnegative().optional(),
  value: z.record(z.unknown()).optional(), key: z.string().optional(),
  order: z.array(z.union([z.string(), z.number().int()])).optional(),
  cascade: z.boolean().optional(), moveScenes: z.boolean().optional(), draft: z.boolean().default(true),
  note: z.string().max(500).optional(),
  // Atomic companion records let a new sequence include its first scenes and shots.
  globals: z.record(z.unknown()).optional(),
  scenes: z.array(z.record(z.unknown())).optional(), shots: z.array(z.record(z.unknown())).optional(),
}).strict();
export type UnitArgs = z.infer<typeof unitEditSchema>;
type Obj = Record<string, unknown>;
export function object(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Obj;
}
export function merge(base: unknown, patch: Obj): Obj {
  const out: Obj = base && typeof base === 'object' && !Array.isArray(base) ? { ...base as Obj } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe property');
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(out[key], value as Obj) : value;
  }
  return out;
}
function ordered<T>(items: T[], order: Array<string | number> | undefined, key: (item: T) => string | number): T[] {
  if (!order || order.length !== items.length || new Set(order).size !== items.length || items.some(v => !order.includes(key(v))))
    throw new Error('order must contain every current identifier exactly once');
  return order.map(id => items.find(v => key(v) === id)!);
}
export const META_KEYS = ['THEME','COMPREHENSION','STORY','PRODUCTION','MOTION_POLICY','STRUCTURE','PREVIZ','SLIDE_OBJECTS','MUSIC','VOICE'] as const;
export function editUnit(input: Board, area: string, action: string, args: UnitArgs): { board: Board; value: unknown } {
  const board = structuredClone(input);
  if (args.globals) {
    if (['get','list'].includes(action)) throw new Error('Read operations do not accept globals');
    for (const [key,value] of Object.entries(args.globals)) {
      if (!META_KEYS.includes(key as typeof META_KEYS[number]) || key === 'STRUCTURE') throw new Error('Unknown companion meta key');
      board[key] = merge(board[key], object(value));
    }
  }
  const read = action === 'get' || action === 'list';
  const st = board.STRUCTURE ?? { version: 'structure-v1', sequences: [], scenes: [] };
  let shots = board.SCENES ?? [];
  let value: unknown;
  const needValue = () => { if (!args.value) throw new Error('value is required'); return args.value; };
  const requireItem = <T>(item: T | undefined): T => { if (item === undefined) throw new Error('Unit not found'); return item; };
  if (area.startsWith('episode_')) {
    const key = area === 'episode_music' ? 'MUSIC' : area === 'episode_voice' ? 'VOICE' : args.key;
    if (!META_KEYS.includes(key as typeof META_KEYS[number])) throw new Error('Unknown meta key');
    value = board[key!] ?? null;
    if (!read) { board[key!] = merge(value, needValue()); value = board[key!]; }
  } else if (area === 'sequence' || area === 'scene' || area === 'shot') {
    let list: Obj[] = area === 'sequence' ? st.sequences : area === 'scene' ? st.scenes : shots;
    const key = area === 'scene' ? 'no' : 'id';
    const id = area === 'scene' ? args.no : args.id;
    if (['get','update','delete'].includes(action) && id === undefined) throw new Error(`${key} is required`);
    const index = list.findIndex(item => item[key] === id);
    if (action === 'list') value = list;
    else if (action === 'get') value = requireItem(list[index]);
    else if (action === 'reorder') list = ordered(list, args.order, item => item[key] as string | number);
    else if (action === 'create') {
      const item = needValue();
      if (list.some(v => v[key] === item[key]) && item[key] !== undefined) throw new Error('Duplicate identifier');
      if (area !== 'shot' && item[key] === undefined) throw new Error(`${key} is required`);
      const at = args.index ?? list.length;
      if (at > list.length) throw new Error('index past last unit');
      if (area === 'sequence' && args.moveScenes) {
        if (!Array.isArray(item.scenes)) throw new Error('sequence.scenes must be an array');
        for (const sequence of st.sequences) sequence.scenes = sequence.scenes.filter(no => !(item.scenes as number[]).includes(no));
      }
      list.splice(at, 0, item);
      if (area === 'scene') {
        const sequence = requireItem(st.sequences.find(q => q.id === args.sequenceId));
        sequence.scenes.push(item.no as number);
        const rank = new Map(list.map((scene,i) => [scene.no,i]));
        sequence.scenes.sort((a,b) => rank.get(a)! - rank.get(b)!);
        for (const id of args.shotIds ?? []) requireItem(shots.find(shot => shot.id === id)).scene = item.no as number;
      }
      value = item;
    } else if (action === 'update') {
      const old = requireItem(list[index]);
      const patch = needValue();
      if (patch[key] !== undefined && patch[key] !== old[key]) throw new Error('Identifiers cannot be renamed');
      list[index] = merge(old, patch); value = list[index];
    } else if (action === 'delete') {
      const old = requireItem(list[index]);
      const drop = area === 'sequence' ? old.scenes as number[] : area === 'scene' ? [old.no as number] : [];
      const transfer = area === 'sequence' && args.targetSequenceId || area === 'scene' && args.targetSceneNo;
      if (area === 'sequence' && args.targetSequenceId) {
        if (args.targetSequenceId === id) throw new Error('Cannot transfer to the deleted sequence');
        requireItem(st.sequences.find(q => q.id === args.targetSequenceId)).scenes.push(...drop);
      }
      if (area === 'scene' && args.targetSceneNo) {
        if (args.targetSceneNo === id) throw new Error('Cannot transfer to the deleted scene');
        requireItem(st.scenes.find(scene => scene.no === args.targetSceneNo));
        for (const shot of shots) if (drop.includes(shot.scene!)) shot.scene = args.targetSceneNo;
      }
      if (!transfer && !args.cascade && (area === 'sequence' && drop.length || area === 'scene' && shots.some(s => drop.includes(s.scene!)))) throw new Error('Children exist; cascade:true is required');
      if (drop.length && !(area === 'sequence' && transfer)) {
        st.scenes = st.scenes.filter(s => !drop.includes(s.no));
        st.sequences = st.sequences.map(q => ({ ...q, scenes: q.scenes.filter(no => !drop.includes(no)) }));
        shots = shots.filter(s => !drop.includes(s.scene!));
      }
      list = list.filter((_, i) => i !== index); value = old;
    } else throw new Error('Unknown action');
    if (!read) {
      if (area === 'sequence') st.sequences = list as typeof st.sequences;
      if (area === 'scene') st.scenes = list as typeof st.scenes;
      if (area === 'shot') shots = list as Shot[];
      if (args.scenes) st.scenes.push(...args.scenes as typeof st.scenes);
      if (args.shots) shots.push(...args.shots as Shot[]);
      if (area === 'scene' && action === 'reorder') {
        const rank = new Map(st.scenes.map((s, i) => [s.no, i]));
        st.sequences.forEach(q => q.scenes.sort((a,b) => rank.get(a)! - rank.get(b)!));
      }
      if ((area === 'sequence' || area === 'scene') && ['create','reorder'].includes(action)) {
        const order = st.sequences.flatMap(q => q.scenes);
        st.scenes.sort((a,b) => order.indexOf(a.no) - order.indexOf(b.no));
        shots.sort((a,b) => order.indexOf(a.scene!) - order.indexOf(b.scene!));
      }
      board.STRUCTURE = st; board.SCENES = shots;
    }
  } else {
    if (!args.shotId) throw new Error('shotId is required');
    const shot = requireItem(shots.find(s => s.id === args.shotId));
    if (area === 'shot_narration') {
      let lines = shot.narration ?? [];
      if (action === 'list') value = lines;
      else if (action === 'get') value = requireItem(lines[args.index!]);
      else if (action === 'create') {
        const line = needValue(); const at = args.index ?? lines.length;
        if (at > lines.length) throw new Error('index past last narration line');
        lines.splice(at, 0, line as typeof lines[number]); value = line;
      } else if (action === 'reorder') lines = ordered(lines.map((line,index) => ({line,index})), args.order, item => item.index).map(item => item.line);
      else { const old = requireItem(lines[args.index!]); if (action === 'delete') lines.splice(args.index!,1); else lines[args.index!] = merge(old, needValue()) as typeof lines[number]; value = lines[args.index!] ?? null; }
      if (!read) shot.narration = lines;
    } else if (area === 'shot_transition') {
      value = { transition: shot.transition, edit: shot.edit };
      if (!read) {
        const patch = needValue();
        const applied = applyPatch(board, { path: '', dryRun: false, draft: args.draft, transitions: [transitionPatchSchema.parse({ no: shots.indexOf(shot)+1, ...patch })] });
        if (applied.findings.some(f => f.level === 'bad')) throw new Error(JSON.stringify(applied.findings));
        return { board: applied.win, value: patch };
      }
    } else if (area === 'shot_sound') {
      value = { sound: shot.sound, effect: shot.effect };
      if (!read) { const patch = needValue(); for (const key of Object.keys(patch)) if (!['sound','effect'].includes(key)) throw new Error('Only sound and effect are accepted'); Object.assign(shot, merge(shot, patch)); value = { sound: shot.sound, effect: shot.effect }; }
    } else {
      const key = area === 'shot_camera' ? 'camera' : area === 'shot_slide' ? 'slide' : area === 'shot_background' ? 'bgPrompt' : undefined;
      if (!key) throw new Error('Unknown shot field');
      shot.visual ??= {};
      value = shot.visual[key] ?? null;
      if (!read) {
        const patch = needValue();
        if (key === 'bgPrompt') { if (typeof patch.bgPrompt !== 'string') throw new Error('value.bgPrompt must be a string'); shot.visual.bgPrompt = patch.bgPrompt; }
        else shot.visual[key] = merge(value, patch);
        value = shot.visual[key];
      }
    }
  }
  if (!read) {
    // Rebase positional eyeline references after removals and every kind of reorder.
    for (const shot of board.SCENES ?? []) {
      const old = input.SCENES?.find(s => s.id && s.id === shot.id);
      const line = shot.shot?.eyeline;
      if (old && line && typeof line.matchShot === 'number') {
        const target = input.SCENES?.[line.matchShot - 1];
        const at = board.SCENES!.findIndex(s => s.id === target?.id);
        if (at < 0) throw new Error('Removed eyeline target; repair the relation first');
        line.matchShot = at + 1;
      }
    }
    if (board.STRUCTURE) contract().sync(board);
  }
  return { board, value: value ?? null };
}
