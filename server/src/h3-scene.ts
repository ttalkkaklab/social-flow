import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { genaiSceneSchema, sceneLabels, resolveScenePrompt, type GenaiSceneArgs } from './genai-scene.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import { compileSceneTimeline } from './scene-video.js';
import { assertSceneDialogue } from './scene-prompt.js';
import { currentSceneVoice } from './video-voice.js';
import type { SceneVideoDirection } from './msr-opening.js';
import { videoTextPolicy } from './video-prompt.js';

const load = createRequire(import.meta.url);
type Line = { speaker: string; tts: string; delivery: string; audio?: {path?: string} };


/** The deployed audio encoder accepts 32 kHz. Retain the selected source and hash it with the plan. */
function h3VoiceSample(root: string, source: {path: string; sha256: string}) {
  const rate = execFileSync('ffprobe', ['-v','error','-select_streams','a:0','-show_entries','stream=sample_rate','-of','csv=p=0','file:' + source.path], {encoding:'utf8', timeout:15000}).trim();
  if (rate === '32000') return source.path;
  const folder = path.join(root, '.work/video-routing/voices');
  mkdirSync(folder, {recursive:true});
  const target = path.join(folder, source.sha256 + '-32000.wav');
  if (!existsSync(target)) {
    const tmp = path.join(folder, randomUUID() + '.wav');
    try {
      execFileSync('ffmpeg', ['-nostdin','-v','error','-i','file:' + source.path,'-map','0:a:0','-ac','1','-ar','32000','-c:a','pcm_s16le',tmp], {timeout:30000});
      renameSync(tmp, target);
    } finally { rmSync(tmp, {force:true}); }
  }
  return target;
}

/** A complete storyboard scene, including the shot pictures H3 numbers alongside its cast. */
export function composeH3Scene(episode: string, board: Record<string, unknown>, cards: Record<string, unknown>[],
  direction: SceneVideoDirection, options: Record<string, unknown>, savedPrompt?: string, opening?: string) {
  const timeline = compileSceneTimeline(cards, direction, episode, board);
  const dir = path.join(episode, 'storyboard');
  if (direction.motionReferencePaths?.length || direction.audio || timeline.images.some(pin => pin.role === 'end' || pin.role === 'keyframe') ||
      cards.some(card => (card.timeline as {dialogueCues?:unknown[]} | undefined)?.dialogueCues?.length))
    throw new Error('scene_inputs_unsupported: H3 scene mode takes untimed reference pictures and voice samples. Revise the scene or split it at an existing shot boundary.');
  const cast = new Map<string, GenaiSceneArgs['cast'][number]>();
  const references = new Map<string, GenaiSceneArgs['references'][number]>();
  for (const pin of timeline.images.filter(pin => pin.role !== 'start')) {
    const owner = pin.character ?? pin.reference?.character;
    if (owner) {
      const member = cast.get(owner) ?? {id:owner, images:[]};
      const role = pin.role === 'character' || pin.role === 'bystander' ? 'face' : pin.reference?.id.split('-').at(-1) || pin.role;
      const existing = member.images.find(image => image.role === role);
      if (existing && existing.imagePath !== pin.path) throw new Error('scene_reference_owner: ' + owner + ' has different pictures for ' + role);
      if (!existing) member.images.push({role,imagePath:pin.path});
      cast.set(owner,member);
    } else {
      const id = pin.reference?.id;
      if (!id) throw new Error('scene_reference_owner: name the reference in ' + pin.shotId);
      const role = ['background','location'].includes(pin.role) ? 'background' : 'object';
      const existing = references.get(id);
      if (existing && (existing.imagePath !== pin.path || existing.role !== role)) throw new Error('scene_reference_owner: different pictures share the reference ID ' + id);
      references.set(id, {id, role, imagePath:pin.path});
    }
  }
  type Actor = {id:string; voiceOnly?:boolean};
  const registry = (board.SB_DOC as {characters?: Actor[] | Record<string, Actor>} | undefined)?.characters;
  const actors = Array.isArray(registry) ? registry : Object.entries(registry ?? {}).map(([id, actor]) => ({...actor,id}));
  const external = new Set(actors.filter(person => person.voiceOnly).map(person => person.id));
  const inputs: Record<string,string> = {};
  const warnings: string[] = [];
  const orderedSpeech = load('../../skills/storyboard/references/scene-direction.js').orderedSpeech as (card: unknown) => Line[];
  const turns = cards.map(card => orderedSpeech(card).filter(line => line.tts?.trim() && line.delivery !== 'voiceover' &&
    !(line.delivery === 'off_screen' && external.has(line.speaker) && line.audio?.path)));
  for (const [i, lines] of turns.entries()) for (const line of lines) {
    const member = cast.get(line.speaker);
    if (!member) throw new Error('scene_reference_owner: H3 needs a picture of speaker ' + line.speaker + ' on ' + String(cards[i].id));
    if (member.voicePath) continue;
    const voice = currentSceneVoice(board,dir,cards[i],line.speaker,warnings);
    if (!voice) throw new Error('scene_speech_references: pin the approved voice for ' + line.speaker);
    inputs[voice.path] = voice.sha256;
    member.voicePath = h3VoiceSample(episode,voice);
  }
  if (turns.some(lines => lines.length) && options.generateAudio === false) throw new Error('scene_dialogue_audio_required: H3 must render the spoken lines');
  const shots = timeline.shots.map((shot, i) => {
    const start = timeline.images.find(pin => pin.shotId === shot.shotId && pin.role === 'start');
    const guide = cards[i].referenceImage;
    const composition = typeof guide === 'string' ? realpathSync(path.resolve(dir,guide)) : undefined;
    if (start && composition && start.path !== composition) throw new Error('scene_inputs_unsupported: ' + shot.shotId + ' assigns different start and composition pictures to the same H3 shot.');
    const imagePath = start?.path ?? composition ?? (i === 0 && opening ? realpathSync(path.resolve(dir,opening)) : undefined);
    if (!imagePath) throw new Error('shot_image_required: ' + shot.shotId);
    return {id:shot.shotId,frames:shot.endFrame-shot.startFrame,imagePath,...(start?.strength === undefined ? {} : {strength:start.strength})};
  });
  const face = (id: string) => '{' + id + '.' + cast.get(id)!.images[0].role + '}';
  const linePrompt = (line: Line) => face(line.speaker) + ' speaks in the voice of {' + line.speaker + '.voice}: "' + line.tts + '"';
  const composed = [direction.emotion, direction.action, direction.camera, direction.sound, videoTextPolicy(),
    ...direction.openingPositions.map(row => (cast.has(row.character) ? face(row.character) : row.character) + ': ' + row.position),
    ...timeline.shots.map((shot,i) => ['Follow {' + shot.shotId + '.image} for about ' + (shots[i].frames / timeline.fps).toFixed(2) + ' seconds.',
      shot.framing,shot.action,shot.sound, ...turns[i].map(linePrompt)].filter(Boolean).join(' '))].filter(Boolean).join('\n');
  const prompt = savedPrompt ?? composed;
  const lines = turns.flat();
  assertSceneDialogue(prompt,lines,[...cast.keys()].map(speaker=>({speaker,name:speaker})),composed,true,savedPrompt === direction.prompt);
  const foreign = nonEnglishOutsideQuotes(prompt, lines.map(line => line.tts));
  if (foreign) throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks. Write the video prompt in English; only dialogue, inside quotes, uses the video's language.`);
  const args = genaiSceneSchema.parse({...options,model:'minimax-h3',prompt,cast:[...cast.values()],references:[...references.values()],shots,fps:timeline.fps});
  const labels = sceneLabels(args), modelPrompt = resolveScenePrompt(prompt,labels);
  return {args,timeline,modelPrompt,labels,inputs,warnings};
}
