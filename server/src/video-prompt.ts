import { createRequire } from 'node:module';
import { nonEnglishOutsideQuotes } from './prompt-language.js';

const load = createRequire(import.meta.url);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export interface VideoPromptSource { action: string; end?: string; sound?: string }
export interface PerformancePlan {
  performance: Record<string, unknown>[]; durationSeconds: number | null; timing: string; warnings: string[];
}
export interface PromptOptions {
  mode?: string;
  measureAudio?: (line: Record<string, unknown>) => number | null;
  validateLanguage?: boolean;
  /** The adapter's prompt limit. Past it the prompt drops its least needed sentences first; the camera, action, lines and text policy stay. */
  maxCharacters?: number;
}
export function planVideoPerformance(shot: Record<string, unknown>, options: PromptOptions = {}): PerformancePlan {
  const acting = load('../../skills/_shared/scene-acting.js') as {
    planScenePerformance(shot: unknown, measure?: PromptOptions['measureAudio']): PerformancePlan;
  };
  const timeline = acting.planScenePerformance(shot, options.measureAudio);
  return { ...timeline, timing: options.mode === 'native' && timeline.timing === 'needs_audio_duration' ? 'model_timed' : timeline.timing };
}
export interface DirectionBinding {
  attribute: string; value: unknown; via: 'prompt' | 'image' | 'adapter' | 'assembly' | 'guidance' | 'unmapped'; instruction?: string;
}
const sentence = (value: string) => {
  const s = value.trim(), capped = s.charAt(0).toUpperCase() + s.slice(1);
  return !s ? '' : /[.!?]["'”’)]+$/.test(capped) ? capped : capped.replace(/[.!?]*$/, '') + '.';
};

/** Each on-screen character's visible state (shot_characters expression): "id: cue; id: cue", or '' when none is set. */
export function expressionWords(shot: Record<string, unknown>, names: Record<string, string> = {}): string {
  return Object.entries(object(object(shot.visual).expression)).filter(([, cue]) => text(cue))
    .map(([id, cue]) => `${names[id] && !nonEnglishOutsideQuotes(names[id]) ? names[id] : id}: ${text(cue).replace(/[.\s]+$/, '')}`).join('; ');
}

/** How a hand-written prompt treats the board's camera move: 'missing' (no camera move named), 'contradicted'
    (the camera told to hold) or null (named, or the board holds/leaves it unset). Reports only. */
export function cameraDrift(prompt: string, movement: string): 'missing' | 'contradicted' | null {
  if (!movement.trim() || /^(static|fixed|locked)/i.test(movement.trim())) return null;
  const said = prompt.split(/(?<=[.!?])\s+/).filter(s => /\bcamera\b/i.test(s));
  // A zoom "from a fixed position" still moves; "movements" of the actors is not a camera move.
  const holds = (s: string) => !/\bzoom/i.test(s) && /\b(static|locked|lock(?:ed)?[- ]off|stays? (?:steady|still|fixed|locked|put)|does ?n[o']t move|remains? (?:still|fixed|steady)|holds? (?:a |the )?(?:static|still|fixed|steady))\b/i.test(s);
  const moves = /\b(push(?:es|ing)?|pull(?:s|ing)?|dolly|dollies|truck(?:s|ing)?|track(?:s|ing)?|follow(?:s|ing)?|pan(?:s|ning)?|tilt(?:s|ing)?|zoom(?:s|ing)?|crane(?:s)?|pedestal|orbit(?:s|ing)?|arc(?:s)?|circles?|approach(?:es)?|glides?|rises?|lowers?|handheld|whip|moves?|travels?|sweeps?|drifts?)\b/i;
  if (said.some(s => moves.test(s) && !holds(s))) return null;
  return said.some(holds) ? 'contradicted' : 'missing';
}

/** Compile the current storyboard values at authoring and request time. Never writes the board. */
export function compileVideoPrompt(shot: Record<string, unknown>, source: VideoPromptSource, names: Record<string, string> = {}, options: PromptOptions = {}) {
  const plan = object(shot.shot), visual = object(shot.visual), frames = object(visual.frames), camera = object(visual.camera);
  const msr = frames.mode === 'reference';
  const words = load('../../skills/storyboard/references/assemble-bg-prompt.js') as { SIZE_WORDS: Record<string, string>; SIZE_WORDS_OBJECT: Record<string, string>; ANGLE_WORDS: Record<string, string> };
  const views = load('../../skills/storyboard/references/shot-view.js') as { instructions(view: unknown): string };
  const viewWords = camera.view === undefined ? '' : views.instructions(camera.view);
  const sizes = viewWords ? words.SIZE_WORDS_OBJECT : words.SIZE_WORDS;
  const catalogue = load('../../skills/storyboard/references/film-techniques.js') as { byId: Record<string, { category: string; fields: Record<string, string>; prompt?: string; instruction: string; label: { en: string } }> };
  const contract = load('../../skills/storyboard/references/structure-contract.js') as { depthText(value: unknown): string };
  const travels = (load('../../skills/storyboard/references/production-mode.js') as { travels(value: unknown): boolean }).travels;
  const picked = (Array.isArray(plan.techniques) ? plan.techniques : []).map(object).map(t => ({
    id: text(t.id), from: text(t.from), to: text(t.to), on: text(t.on), entry: catalogue.byId[text(t.id)],
  }));
  const movement = text(camera.movement), speed = text(camera.speed), target = text(camera.target), settle = text(camera.end);
  // A movement written without its technique (storyboard_apply, older boards) still takes the catalogue's sentence,
  // not the bare "Camera: dolly in." label: the longest catalogue movement the authored text opens with.
  const move = picked.find(t => t.entry?.fields.movement && movement.toLowerCase().startsWith(t.entry.fields.movement))?.entry
    ?? Object.values(catalogue.byId).filter(e => e.prompt && e.fields.movement && movement.toLowerCase().startsWith(e.fields.movement))
      .sort((a, b) => b.fields.movement.length - a.fields.movement.length)[0];
  const rack = picked.find(t => t.entry?.fields.focus);
  const pace = ({ slow: 'slowly', steady: 'steadily', fast: 'quickly' } as Record<string, string>)[speed];
  const ends = travels(camera) ? ', with a short pause on the opening and closing pictures' : '';
  const moveWords = !movement ? '' : /^(static|fixed|locked)/i.test(movement) ? 'The camera holds a static frame.'
    : move?.prompt ? sentence(`The camera ${pace ? pace + ' ' : ''}${move.prompt.replace('{target}', target || 'the subject')}${speed && !pace ? ` at a ${speed} pace` : ''}${ends}`)
    : sentence(`Camera: ${[speed, movement].filter(Boolean).join(' ')}` + (target ? ` toward ${target}` : '') + ends);
  const focusWords = !rack ? '' : sentence(rack.from && rack.to ? `Rack focus from ${rack.from} to ${rack.to}` : `${rack.entry.label.en} from the near subject to the far subject`);
  const sizeWords = sentence(sizes[text(plan.size)] || ''), angleWords = sentence(words.ANGLE_WORDS[text(plan.angle)] || '');
  const framing = sentence([sizes[text(plan.size)], words.ANGLE_WORDS[text(plan.angle)]].filter(Boolean).join(', '));
  const depthWords = plan.depth ? sentence(contract.depthText(plan.depth)) : '';
  // Viewpoint and framing techniques were previously displayed as icons but omitted from shot_prompt.
  const other = picked.filter(t => t.entry && ['camera', 'framing'].includes(t.entry.category) &&
    !t.entry.fields.movement && !t.entry.fields.focus && !t.entry.fields.size && !t.entry.fields.angle && !(viewWords && t.entry.fields.viewpoint));
  const lines = (Array.isArray(shot.narration) ? shot.narration : []).map(object);
  const mode = options.mode ?? (lines.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen') ? 'native' : 'voiceover');
  const design = object(plan.videoDesign);
  const motion = object(design.motion);
  const states = [...new Set((Array.isArray(motion.beats) ? motion.beats : []).map(beat => text(object(beat).state)).filter(Boolean))];
  const performance = planVideoPerformance(shot, { ...options, mode });
  const acting = load('../../skills/_shared/scene-acting.js') as { performanceBeats(plan: unknown[], mode: string, dialogue: boolean, options?: { brief?: boolean }): string[]; VIDEO_TEXT_POLICY: string };
  const beats = acting.performanceBeats(performance.performance, mode, !msr);
  const worn = expressionWords(shot, names);
  // Cast seen without a line and unnamed extras (shot_characters): the opening picture carries them, the prompt keeps them.
  const called = (id: string) => names[id] && !nonEnglishOutsideQuotes(names[id]) ? names[id] : id;
  const seen = (Array.isArray(visual.bystanders) ? visual.bystanders : []).map(text).filter(Boolean), extras = text(visual.extras);
  // The action is said once: when an action beat carries the same words with its timing, the beat says it.
  const plain = (value: unknown) => text(value).replace(/[.\s]+$/, '').toLowerCase();
  const actionInBeat = performance.performance.some(event => event.kind === 'action' && plain(event.videoDirection || event.text) === plain(source.action));
  // Each sentence carries the step at which a prompt over the adapter's limit lets it go: 1 the design notes and
  // visible states, 2 the beats' acting fields (brief beats), 3 the expressions. 0 never goes — the camera move
  // and its closing frame stay, since a prompt rewritten by hand to fit lost exactly those (mochi_bo, 2026-11-20).
  const parts = (step: number): string[] => [
    msr ? framing : 'Start from the given first frame.',
    msr ? depthWords : '', moveWords, settle ? sentence(`Closing frame: ${settle}`) : '', focusWords,
    // A beat accent (speed ramp, impact shake) names the moment it fires on.
    ...other.map(t => sentence(t.entry.fields.accent && t.entry.prompt ? t.entry.prompt.replace('{cue}', t.on || t.entry.fields.cue) : t.entry.instruction)),
    viewWords || (text(camera.framing) ? sentence(`Opening composition: ${text(camera.framing)}`) : ''),
    !viewWords && camera.rear && !other.some(t => t.entry.fields.viewpoint === 'rear') ? 'View the subject from behind.' : '',
    !viewWords && camera.pov && !other.some(t => t.entry.fields.viewpoint === 'pov') ? sentence(`Point of view: ${text(camera.pov) || 'the named character'}`) : '',
    actionInBeat ? '' : sentence(source.action),
    seen.length ? sentence(`The opening picture also shows ${seen.map(called).join(' and ')}, who ${seen.length > 1 ? 'stay' : 'stays'} in the frame and never speaks`) : '',
    extras ? sentence(`Unnamed people in the frame: ${extras}`) : '',
    ...(step >= 1 ? [] : ['before', 'after', 'continuity'].map(key => text(design[key]) ? sentence(`${key}: ${text(design[key])}`) : '')),
    ...(step >= 1 ? [] : states.filter(state => ![source.action, design.before, design.after, design.continuity].includes(state)).map(state => sentence(`Visible state: ${state}`))),
    !lines.length && beats.length ? 'Perform the planned action without invented speech or voiceover.' : '',
    ...(step >= 2 ? acting.performanceBeats(performance.performance, mode, !msr, { brief: true }) : beats),
    // The model's default face is pleasant; the authored state has to be named and held (LTX guide: physical cues, state after the action).
    worn && step < 3 ? sentence(`Expressions, held to the last frame unless the action changes them: ${worn}`) : '',
    frames.mode === 'first_last' ? sentence(`End on the given last frame${source.end ? ': ' + source.end : ''}`) : source.end ? sentence(`End on ${source.end}`) : '',
    sentence(`Audio: ${source.sound ? source.sound + (/\b(music|soundtrack|score|bgm|melody|orchestral|song)\b/i.test(source.sound) ? '' : ', no music') : 'no music'}`),
    acting.VIDEO_TEXT_POLICY,
  ].filter(Boolean);
  const limit = options.maxCharacters, dropped = ['design notes and visible states', 'acting fields of the beats', 'expressions'];
  let step = 0, prompt = parts(0).join(' ');
  while (limit && prompt.length > limit && step < dropped.length) prompt = parts(++step).join(' ');
  const fitWarnings = !limit || !step ? [] : [prompt.length > limit
    ? `prompt_over_limit: ${prompt.length} characters after leaving out the ${dropped.slice(0, step).join(', ')}; the adapter takes ${limit}. Shorten the action, end or sound in shot_prompt`
    : `prompt_fitted: left out the ${dropped.slice(0, step).join(', ')} to fit the adapter's ${limit} characters; the camera, action and lines are whole`];
  const foreign = nonEnglishOutsideQuotes(prompt);
  if (foreign && options.validateLanguage !== false) throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks; write action and direction in English`);
  const bindings: DirectionBinding[] = [
    { attribute: 'render', value: object(plan.render).mode, via: 'adapter' },
    { attribute: 'size', value: plan.size, via: !sizeWords ? 'unmapped' : msr ? 'prompt' : 'image', instruction: sizeWords },
    { attribute: 'angle', value: plan.angle, via: !angleWords ? 'unmapped' : msr ? 'prompt' : 'image', instruction: angleWords },
    { attribute: 'view', value: camera.view, via: 'prompt', instruction: viewWords },
    { attribute: 'move', value: camera, via: movement ? 'prompt' : 'unmapped', instruction: moveWords },
    { attribute: 'focus', value: rack ? { id: rack.id, from: rack.from, to: rack.to } : undefined, via: 'prompt', instruction: focusWords },
    { attribute: 'depth', value: plan.depth, via: msr ? 'prompt' : 'image', instruction: depthWords },
    { attribute: 'framePlan', value: frames.mode, via: 'adapter' },
    ...picked.map((t): DirectionBinding => ({ attribute: 'technique', value: t.id,
      via: !t.entry ? 'unmapped' : t.entry.category === 'character' ? 'image' : t.entry.category === 'timing' ? 'guidance' :
        t.entry.category === 'framing' || t.entry.fields.angle ? (msr ? 'prompt' : 'image') : 'prompt',
      instruction: t.entry?.instruction })),
    { attribute: 'transition', value: shot.transition, via: 'assembly' },
    ...(beats.length ? [{ attribute: 'performance', value: performance, via: 'prompt' as const, instruction: beats.join('\n') }] : []),
  ];
  return { prompt, performance, directionBindings: bindings.filter(b => b.value !== undefined), warnings: [
    ...performance.warnings, ...fitWarnings,
    // An unchosen move leaves the camera to the model; on mochi_bo 29 of 33 shots of one episode went out so.
    ...(movement ? [] : ['camera_move_unset: no camera move is chosen, so the video model decides the camera — set shot_icons move (camera.static for a deliberate hold)']),
    ...bindings.filter(b => b.value !== undefined && b.via === 'unmapped' && b.attribute !== 'move').map(b => `No prompt mapping for ${b.attribute}: ${JSON.stringify(b.value)}`),
    ...(rack && !(rack.from && rack.to) ? ['the rack focus names no subjects — give focus.from and focus.to in shot_icons'] : []),
  ] };
}
