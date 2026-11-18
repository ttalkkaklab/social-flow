import { createRequire } from 'node:module';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
const load = createRequire(import.meta.url);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => typeof value === 'string' ? value.trim() : '';
export function planVideoPerformance(shot, options = {}) {
    const acting = load('../../skills/_shared/scene-acting.js');
    const timeline = acting.planScenePerformance(shot, options.measureAudio);
    return { ...timeline, timing: options.mode === 'native' && timeline.timing === 'needs_audio_duration' ? 'model_timed' : timeline.timing };
}
const sentence = (value) => {
    const s = value.trim(), capped = s.charAt(0).toUpperCase() + s.slice(1);
    return !s ? '' : /[.!?]["'”’)]+$/.test(capped) ? capped : capped.replace(/[.!?]*$/, '') + '.';
};
/** Each on-screen character's visible state (shot_characters expression): "id: cue; id: cue", or '' when none is set. */
export function expressionWords(shot, names = {}) {
    return Object.entries(object(object(shot.visual).expression)).filter(([, cue]) => text(cue))
        .map(([id, cue]) => `${names[id] && !nonEnglishOutsideQuotes(names[id]) ? names[id] : id}: ${text(cue).replace(/[.\s]+$/, '')}`).join('; ');
}
/** Compile the current storyboard values at authoring and request time. Never writes the board. */
export function compileVideoPrompt(shot, source, names = {}, options = {}) {
    const plan = object(shot.shot), visual = object(shot.visual), frames = object(visual.frames), camera = object(visual.camera);
    const msr = frames.mode === 'reference';
    const words = load('../../skills/storyboard/references/assemble-bg-prompt.js');
    const views = load('../../skills/storyboard/references/shot-view.js');
    const viewWords = camera.view === undefined ? '' : views.instructions(camera.view);
    const sizes = viewWords ? words.SIZE_WORDS_OBJECT : words.SIZE_WORDS;
    const catalogue = load('../../skills/storyboard/references/film-techniques.js');
    const contract = load('../../skills/storyboard/references/structure-contract.js');
    const travels = load('../../skills/storyboard/references/production-mode.js').travels;
    const picked = (Array.isArray(plan.techniques) ? plan.techniques : []).map(object).map(t => ({
        id: text(t.id), from: text(t.from), to: text(t.to), on: text(t.on), entry: catalogue.byId[text(t.id)],
    }));
    const movement = text(camera.movement), speed = text(camera.speed), target = text(camera.target), settle = text(camera.end);
    const move = picked.find(t => t.entry?.fields.movement && movement.toLowerCase().startsWith(t.entry.fields.movement))?.entry;
    const rack = picked.find(t => t.entry?.fields.focus);
    const pace = { slow: 'slowly', steady: 'steadily', fast: 'quickly' }[speed];
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
    const acting = load('../../skills/_shared/scene-acting.js');
    const beats = acting.performanceBeats(performance.performance, mode, !msr);
    const worn = expressionWords(shot, names);
    // Cast seen without a line and unnamed extras (shot_characters): the opening picture carries them, the prompt keeps them.
    const called = (id) => names[id] && !nonEnglishOutsideQuotes(names[id]) ? names[id] : id;
    const seen = (Array.isArray(visual.bystanders) ? visual.bystanders : []).map(text).filter(Boolean), extras = text(visual.extras);
    const prompt = [
        msr ? framing : 'Start from the given first frame.',
        msr ? depthWords : '', moveWords, settle ? sentence(`Closing frame: ${settle}`) : '', focusWords,
        // A beat accent (speed ramp, impact shake) names the moment it fires on.
        ...other.map(t => sentence(t.entry.fields.accent && t.entry.prompt ? t.entry.prompt.replace('{cue}', t.on || t.entry.fields.cue) : t.entry.instruction)),
        viewWords || (text(camera.framing) ? sentence(`Opening composition: ${text(camera.framing)}`) : ''),
        !viewWords && camera.rear && !other.some(t => t.entry.fields.viewpoint === 'rear') ? 'View the subject from behind.' : '',
        !viewWords && camera.pov && !other.some(t => t.entry.fields.viewpoint === 'pov') ? sentence(`Point of view: ${text(camera.pov) || 'the named character'}`) : '',
        sentence(source.action),
        seen.length ? sentence(`The opening picture also shows ${seen.map(called).join(' and ')}, who ${seen.length > 1 ? 'stay' : 'stays'} in the frame and never speaks`) : '',
        extras ? sentence(`Unnamed people in the frame: ${extras}`) : '',
        ...['before', 'after', 'continuity'].map(key => text(design[key]) ? sentence(`${key}: ${text(design[key])}`) : ''),
        ...states.filter(state => ![source.action, design.before, design.after, design.continuity].includes(state)).map(state => sentence(`Visible state: ${state}`)),
        !lines.length && beats.length ? 'This is a silent scene. Perform the planned action without invented speech or voiceover.' : '',
        ...beats,
        // The model's default face is pleasant; the authored state has to be named and held (LTX guide: physical cues, state after the action).
        worn ? sentence(`Expressions, held to the last frame unless the action changes them: ${worn}`) : '',
        frames.mode === 'first_last' ? sentence(`End on the given last frame${source.end ? ': ' + source.end : ''}`) : source.end ? sentence(`End on ${source.end}`) : '',
        sentence(`Audio: ${source.sound ? source.sound + (/\b(music|soundtrack|score|bgm|melody|orchestral|song)\b/i.test(source.sound) ? '' : ', no music') : 'no music'}`),
        acting.VIDEO_TEXT_POLICY,
    ].filter(Boolean).join(' ');
    const foreign = nonEnglishOutsideQuotes(prompt);
    if (foreign && options.validateLanguage !== false)
        throw new Error(`video_prompt_language: "${foreign}" sits outside quotation marks; write action and direction in English`);
    const bindings = [
        { attribute: 'render', value: object(plan.render).mode, via: 'adapter' },
        { attribute: 'size', value: plan.size, via: !sizeWords ? 'unmapped' : msr ? 'prompt' : 'image', instruction: sizeWords },
        { attribute: 'angle', value: plan.angle, via: !angleWords ? 'unmapped' : msr ? 'prompt' : 'image', instruction: angleWords },
        { attribute: 'view', value: camera.view, via: 'prompt', instruction: viewWords },
        { attribute: 'move', value: camera, via: movement ? 'prompt' : 'unmapped', instruction: moveWords },
        { attribute: 'focus', value: rack ? { id: rack.id, from: rack.from, to: rack.to } : undefined, via: 'prompt', instruction: focusWords },
        { attribute: 'depth', value: plan.depth, via: msr ? 'prompt' : 'image', instruction: depthWords },
        { attribute: 'framePlan', value: frames.mode, via: 'adapter' },
        ...picked.map((t) => ({ attribute: 'technique', value: t.id,
            via: !t.entry ? 'unmapped' : t.entry.category === 'character' ? 'image' : t.entry.category === 'timing' ? 'guidance' :
                t.entry.category === 'framing' || t.entry.fields.angle ? (msr ? 'prompt' : 'image') : 'prompt',
            instruction: t.entry?.instruction })),
        { attribute: 'transition', value: shot.transition, via: 'assembly' },
        ...(beats.length ? [{ attribute: 'performance', value: performance, via: 'prompt', instruction: beats.join('\n') }] : []),
    ];
    return { prompt, performance, directionBindings: bindings.filter(b => b.value !== undefined), warnings: [
            ...performance.warnings,
            ...bindings.filter(b => b.value !== undefined && b.via === 'unmapped').map(b => `No prompt mapping for ${b.attribute}: ${JSON.stringify(b.value)}`),
            ...(rack && !(rack.from && rack.to) ? ['the rack focus names no subjects — give focus.from and focus.to in shot_icons'] : []),
        ] };
}
