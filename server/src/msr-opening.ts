import { z } from 'zod';
import { nonEnglishOutsideQuotes } from './prompt-language.js';

export const openingPositionsSchema = z.array(z.object({
  character: z.string().trim().min(1).describe('Cast ID, or an English character name for a standalone render.'),
  images: z.array(z.number().int().min(1).max(4)).describe('1-based subject image numbers for this person, including clothing panels. Use [] for a bystander without a reference.'),
  position: z.string().trim().min(1).refine(value => !nonEnglishOutsideQuotes(value), 'Describe the opening position in English')
    .describe('Where the viewer sees this person at the start: side, depth, posture or orientation, and a visible landmark. Describe an off-screen start explicitly.'),
}).strict(), { required_error: 'openingPositions required: inspect the opening image and describe each character and its reference images' }).describe('Required with MSR references. Identify every character in the opening scene, including silent listeners. Use [] only for a character-free scene.');
export type OpeningPosition = z.infer<typeof openingPositionsSchema>[number];

const sceneText = z.string().trim().min(1).refine(value => !nonEnglishOutsideQuotes(value), 'Write scene direction in English');
const frame = z.number().int().nonnegative();
export const shotTimelineSchema = z.object({
  startFrame: frame, endFrame: frame.describe('Exclusive end, in zero-based scene frames.'),
  transition: z.enum(['open', 'hard_cut', 'dissolve', 'fade']),
  framing: sceneText, action: sceneText,
  openingPositions: openingPositionsSchema.optional().describe('Positions at this shot opening. Image numbers refer to this shot’s subject references.'),
  dialogueCues: z.array(z.object({
    lineId: z.string().trim().min(1), frame,
  }).strict()).optional().describe('Exact speech onsets in scene frames for authored narration lines. Omit for model-paced speech.'),
  images: z.array(z.object({
    path: z.string().trim().min(1), frame, role: z.enum(['start', 'keyframe', 'end', 'face', 'outfit']),
    character: z.string().trim().min(1).optional(), cue: sceneText.optional(),
    strength: z.number().min(0).max(1).optional(),
  }).strict()).optional(),
}).strict().superRefine((shot, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (shot.startFrame >= shot.endFrame) issue('Shot needs a positive frame interval');
  const lines = new Set<string>();
  for (const cue of shot.dialogueCues ?? []) {
    if (cue.frame < shot.startFrame || cue.frame >= shot.endFrame) issue('Dialogue cue outside its shot: ' + cue.lineId);
    if (lines.has(cue.lineId)) issue('Repeated dialogue cue: ' + cue.lineId);
    lines.add(cue.lineId);
  }
  for (const image of shot.images ?? []) {
    if (image.frame < shot.startFrame || image.frame >= shot.endFrame) issue('Image frame outside its shot: ' + image.path);
    if (image.role === 'start' && image.frame !== shot.startFrame) issue('Start image must anchor the first frame of its shot');
    if (['face', 'outfit'].includes(image.role) && !image.character) issue('Identify the owner of a face or outfit reference');
  }
});
export const sceneShotBindingsSchema = z.array(z.object({
  shotId:z.string().min(1), openingPositions:openingPositionsSchema.optional(),
  framing:sceneText.optional(), action:sceneText.optional(),
  keyframes:z.array(z.object({path:z.string().trim().min(1),frame,strength:z.number().min(0).max(1).optional()}).strict()).min(1).max(7).optional(),
  guidance:z.object({negativePrompt:sceneText,guidanceScale:z.number().gt(1).max(10)}).strict().optional(),
  motionPrefix:z.string().trim().min(1).optional().describe('Absolute path to the approved MP4 camera-motion prefix.'),
  performanceAudio:z.string().trim().min(1).optional().describe('Absolute path to a shot-timed 48 kHz stereo PCM WAV.'),
  dialogueCues:z.array(z.object({lineId:z.string().min(1),frame:z.number().int().nonnegative()}).strict()).optional(),
  references:z.array(z.object({id:z.string().min(1),character:z.string().min(1),role:z.enum(['face','outfit','character'])}).strict()).optional(),
}).strict()).min(1);
export const sceneVideoDirectionSchema = z.object({
  openingPositions: openingPositionsSchema,
  fps: z.number().int().positive().optional().describe('Frames per second on the scene timeline; defaults to 24.'),
  oneTake: z.boolean().optional().describe('True only for an explicitly requested uninterrupted shot.'),
  audio: z.object({
    mode:z.enum(['conditioning','mix']).optional().describe('Condition generation by default, or mix this track once with native shot sound.'),
    path: z.string().trim().min(1).describe('Scene-length track from frame zero, including any lead-in silence.'),
    cues: z.array(z.object({ frame, action: sceneText }).strict()).optional(),
  }).strict().optional(),
  emotion: sceneText.describe('The emotional change, naming each participant. For a factual scene give its visible subject and purpose.'),
  action: sceneText.optional().describe('Only story-essential movement, tied to the same visible landmark as the opening position.'),
  sound: sceneText.optional().describe('Room tone or sound from an essential action.'),
  camera: sceneText.optional().describe('Shared camera direction. Each shot keeps its own framing and incoming transition.'),
}).strict();
export type SceneVideoDirection = z.infer<typeof sceneVideoDirectionSchema>;

export function openingPrompt(prompt: string, positions: OpeningPosition[] = []): string {
  if (!positions.length) return prompt;
  const header = positions.map(({ character, images, position }) => {
    const refs = images.map(index => 'Image ' + index).join(', ');
    return character + (refs ? ' (' + refs + ')' : '') + ': ' + position;
  });
  const prefix = 'Opening frame, from the viewer’s perspective:\n' + header.join('\n') + '\n\n';
  return prompt.startsWith(prefix) ? prompt : prefix + prompt;
}

export function validateOpening(prompt: string, positions: OpeningPosition[] | undefined,
  references: { background: boolean; nonCharacter?: boolean; audioUri?: string; audioPath?: string }[], issue: (message: string) => void, maxChars = 2000) {
  if (!positions) { issue('openingPositions required: match each character to the opening frame and their subject images'); return; }
  const subjects = references.filter(ref => !ref.background);
  const mapped = new Set<number>();
  const names = new Set<string>();
  for (const { character, images } of positions) {
    if (names.has(character)) issue('openingPositions: list each character once');
    names.add(character);
    for (const index of images) {
      if (!subjects[index - 1] || subjects[index - 1].nonCharacter || mapped.has(index))
        issue('openingPositions: invalid, non-character or repeated subject Image ' + index);
      mapped.add(index);
    }
  }
  subjects.forEach((ref, i) => {
    if (!mapped.has(i + 1) && (!ref.nonCharacter || ref.audioPath || ref.audioUri))
      issue('openingPositions: identify the character in Image ' + (i + 1) + ' or mark an object reference nonCharacter:true');
  });
  if ([...openingPrompt(prompt, positions)].length > maxChars)
    issue('The prompt including openingPositions exceeds ' + maxChars + ' characters; shorten the action or placement descriptions');
}
