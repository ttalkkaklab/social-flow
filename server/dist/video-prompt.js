import { createRequire } from 'node:module';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
const load = createRequire(import.meta.url);
export const videoTextPolicy = () => String(load('../../skills/_shared/scene-acting.js').VIDEO_TEXT_POLICY);
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
const heldMove = /^(?:static|fixed|locked(?:[- ]off)?)(?: (?:camera|frame|shot))?[.!]?$/i;
/** Only exact catalogue moves can be expanded without losing an authored path or action cue. */
export function cameraMoveWords(camera) {
    const movement = text(camera.movement), speed = text(camera.speed), target = text(camera.target);
    if (!movement)
        return '';
    if (heldMove.test(movement))
        return 'The camera holds a static frame.';
    const catalogue = load('../../skills/storyboard/references/film-techniques.js');
    const move = catalogue.entries.find(entry => entry.fields.movement === movement.toLowerCase())?.prompt;
    const pace = { slow: 'slowly', steady: 'steadily', fast: 'quickly' }[speed];
    const travels = load('../../skills/storyboard/references/production-mode.js').travels(camera);
    const ends = travels ? ', with a short pause on the opening and closing pictures' : '';
    if (move) {
        // Some existing targets contain full blocking instructions ("Follow Mochi ...; settle on the bed").
        const path = /[;.!?]\s|^(?:after|when|once|follow|track|pan|tilt|dolly|orbit|keep|start|end)\b/i.test(target);
        const words = move.replace('{target}', () => path || !target ? 'the subject' : target);
        return [sentence('The camera ' + (pace ? pace + ' ' : '') + words +
                (speed && !pace ? ' at a ' + speed + ' pace' : '') + ends), path && sentence(target)].filter(Boolean).join(' ');
    }
    return [sentence('Camera: ' + [speed, movement].filter(Boolean).join(' ') + ends), target && sentence('Camera target: ' + target)].filter(Boolean).join(' ');
}
/** Shot cards are editorial beats. Scope a lone move to its beat and leave conflicting coverage to the scene author. */
export function sceneCameraDirection(members, explicit) {
    function mapped(instruction, value) {
        const binding = { attribute: 'move', value, via: 'prompt', instruction };
        return { instruction, warnings: [], bindings: [binding] };
    }
    if (explicit)
        return mapped(explicit, { source: 'videoDirection.camera' });
    let elapsed = 0;
    const moves = members.flatMap(shot => {
        const camera = object(object(shot.visual).camera), movement = text(camera.movement);
        const start = elapsed;
        elapsed += Number(shot.duration);
        if (!movement || (members.length > 1 && heldMove.test(movement)))
            return [];
        return [{ id: text(shot.id), movement, words: cameraMoveWords(camera), landing: text(camera.end), start, end: elapsed }];
    });
    if (!moves.length)
        return { instruction: '', warnings: [], bindings: [] };
    const first = moves[0];
    const wholeTake = moves.length === members.length && moves.every(m => m.words === first.words && m.landing === first.landing);
    if ((wholeTake || moves.length === 1) && !nonEnglishOutsideQuotes(first.words + ' ' + first.landing)) {
        const end = Number(first.end.toFixed(3));
        const cue = wholeTake ? '' : 'From ' + Number(first.start.toFixed(3)) + ' to ' + end + ' seconds: ';
        const landing = first.landing && sentence((wholeTake ? 'Closing frame: ' : 'By ' + end + ' seconds: ') + first.landing);
        return mapped([cue + first.words, landing].filter(Boolean).join(' '), { source: 'visual.camera', shotIds: moves.map(m => m.id) });
    }
    const cards = moves.map(m => m.id + ' (' + m.movement + ')').join(', ');
    return { instruction: '', bindings: [], warnings: ['scene_camera_unresolved: ' + cards +
                ' — write the intended camera cue and landing for this take in English in story_scene.videoDirection.camera'] };
}
// Clear reversals in common directed moves. Free-form and compound choreography remains advisory.
const directedMoves = [
    /\bpan(?:s|ning)? left\b/i, /\bpan(?:s|ning)? right\b/i,
    /\btilt(?:s|ing)? up(?:wards?)?\b/i, /\btilt(?:s|ing)? down(?:wards?)?\b/i,
    /\b(?:dolly|dollies|push(?:es|ing)?) in\b/i, /\b(?:dolly|dollies) out\b|\bpull(?:s|ing)? (?:back|out)\b/i,
    /\bzoom(?:s|ing)? in\b/i, /\bzoom(?:s|ing)? out\b/i,
    /\b(?:truck|track)(?:s|ing)? (?:parallel|sideways|alongside|laterally)\b/i,
    /\btrack(?:s|ing)? backward\b/i,
    /\b(?:track|follow)(?:s|ing)? (?:\w+ )?(?:from )?behind\b/i,
];
export function sceneVoiceDirection(acting, spoken, legacy = false) {
    const cues = legacy ? [acting?.vocal || acting?.direction] : [acting?.direction, acting?.vocal];
    const seen = new Set();
    return [...cues, ...(acting?.tags || [])].filter((v) => !!v)
        .map(cue => (spoken ? cue.split(spoken).join('the authored line') : cue).trim())
        .filter(cue => {
        const key = cue.toLowerCase().replace(/[.!?\s]+$/, '');
        if (!key || seen.has(key) || nonEnglishOutsideQuotes(cue))
            return false;
        seen.add(key);
        return true;
    }).join(' ');
}
export function scenePromptText(scene, camera, timeline, lines, bindTurns) {
    const dialogue = bindTurns ? [] : lines.filter(l => l.delivery !== 'voiceover')
        .map(l => [sceneVoiceDirection(l.acting, l.tts), l.speaker + ' (' + l.delivery + '): "' + l.tts + '"'].filter(Boolean).join(' '));
    return [scene.emotion, scene.action, scene.sound, camera, scene.oneTake && 'One continuous take. No cuts.', timeline, ...dialogue, videoTextPolicy()]
        .filter(Boolean).join('\n');
}
/** Report clear omissions, holds and reversals in uncompiled prompt text. */
export function cameraDrift(prompt, movement) {
    if (!movement.trim())
        return null;
    const prose = prompt.replace(/"[^"]*"|“[^”]*”|「[^」]*」/g, ' ');
    const clauses = prose.split(/[.!?;\n]+/).map(s => s.trim());
    // Read the camera's predicate. Someone approaching or pushing a cart toward the camera is actor motion.
    const said = clauses.map(s => {
        const imperative = /^(?:(?:do not|never|slowly|steadily|quickly) )*(?:pan|dolly|push in|pull back|crane|tilt|zoom|truck|orbit|track|follow|whip pan)\b/i;
        const camera = /\b(?:(?:static|locked(?:[- ]off)?|fixed) )?camera\b|\bshot (?=tracking|panning|tilting|following|moving|zooming)/i.exec(s);
        const predicate = imperative.test(s) ? s : camera ? s.slice(camera.index) : '';
        return predicate.split(/\s+(?:while|as|so that)\s+/i)[0];
    }).filter(Boolean);
    // A zoom "from a fixed position" still moves; "movements" of the actors is not a camera move.
    const holds = (s) => !/\bzoom/i.test(s) && /^(?:static|locked(?:[- ]off)?|fixed) camera\b|\bcamera[: ]+(?:(?:is|stays?|remains?) |holds? (?:a |the )?)?(?:steady|still|static|fixed|locked|put)\b|\bcamera (?:does not|doesn't|never) moves?\b/i.test(s);
    const moves = /\b(push(?:es|ing)?|pull(?:s|ing)?|dolly|dollies|truck(?:s|ing)?|track(?:s|ing)?|follow(?:s|ing)?|pan(?:s|ning)?|tilt(?:s|ing)?|zoom(?:s|ing)?|crane(?:s)?|pedestal|orbit(?:s|ing)?|arc(?:s)?|circles?|approach(?:es)?|glides?|rises?|lowers?|handheld|body-mounted|whip|moves?|travels?|sweeps?|drifts?|recoils?|rides?|chases?|flies|swings?)\b/i;
    const negated = /^(?:camera[: ]+)?(?:never|do(?:es)? not|doesn't|don't|must not)\b/i;
    const moving = said.filter(s => moves.test(s) && !holds(s) && !negated.test(s));
    if (heldMove.test(movement.trim()))
        return moving.length ? 'contradicted' : null;
    const expected = directedMoves.find(re => re.test(movement));
    if (expected && !moving.some(s => expected.test(s)) &&
        (moving.some(s => directedMoves.some(re => re.test(s))) || said.some(s => negated.test(s) && expected.test(s))))
        return 'contradicted';
    const fixedFrame = /\b(?:preserve|maintain|lock) the (?:opening |original |same )?(?:image )?(?:composition|framing|crop)\b/i;
    if (clauses.some(s => fixedFrame.test(s) && !/\b(?:at first|initially|until|then|first frame only)\b/i.test(s)))
        return 'contradicted';
    if (moving.length)
        return null;
    return said.some(holds) ? 'contradicted' : 'missing';
}
export function shotVisualDirection(shot) {
    const plan = object(shot.shot), camera = object(object(shot.visual).camera);
    const words = load('../../skills/storyboard/references/assemble-bg-prompt.js');
    const views = load('../../skills/storyboard/references/shot-view.js');
    const viewWords = camera.view === undefined ? '' : views.instructions(camera.view);
    const sizes = viewWords ? words.SIZE_WORDS_OBJECT : words.SIZE_WORDS;
    const catalogue = load('../../skills/storyboard/references/film-techniques.js');
    const contract = load('../../skills/storyboard/references/structure-contract.js');
    const picked = (Array.isArray(plan.techniques) ? plan.techniques : []).map(object).map(t => ({
        id: text(t.id), from: text(t.from), to: text(t.to), on: text(t.on), entry: catalogue.byId[text(t.id)],
    }));
    const movement = text(camera.movement), settle = text(camera.end), moveWords = cameraMoveWords(camera);
    const rack = picked.find(t => t.entry?.fields.focus);
    const focusWords = !rack ? '' : sentence(rack.from && rack.to ? `Rack focus from ${rack.from} to ${rack.to}` : `${rack.entry.label.en} from the near subject to the far subject`);
    const sizeWords = sentence(sizes[text(plan.size)] || ''), angleWords = sentence(words.ANGLE_WORDS[text(plan.angle)] || '');
    const framing = sentence([sizes[text(plan.size)], words.ANGLE_WORDS[text(plan.angle)]].filter(Boolean).join(', '));
    const depthWords = plan.depth ? sentence(contract.depthText(plan.depth)) : '';
    // Viewpoint and framing techniques were previously displayed as icons but omitted from shot_prompt.
    const other = picked.filter(t => t.entry && ['camera', 'framing'].includes(t.entry.category) &&
        !t.entry.fields.movement && !t.entry.fields.focus && !t.entry.fields.size && !t.entry.fields.angle && !(viewWords && t.entry.fields.viewpoint));
    const accentWords = other.map(t => sentence(t.entry.fields.accent && t.entry.prompt ? t.entry.prompt.replace('{cue}', t.on || t.entry.fields.cue) : t.entry.instruction));
    const openingView = [viewWords || (text(camera.framing) ? sentence(`Opening composition: ${text(camera.framing)}`) : ''),
        !viewWords && camera.rear && !other.some(t => t.entry.fields.viewpoint === 'rear') ? 'View the subject from behind.' : '',
        !viewWords && camera.pov && !other.some(t => t.entry.fields.viewpoint === 'pov') ? sentence(`Point of view: ${text(camera.pov) || 'the named character'}`) : '',
    ].filter(Boolean);
    return { viewWords, picked, movement, settle, moveWords, rack, focusWords, sizeWords, angleWords, framing, depthWords, other, accentWords, openingView };
}
const directions = () => load('../../skills/storyboard/references/scene-direction.js');
export function resolvedDirection(scene, cards) { return directions().resolve(scene, cards); }
export function withSceneCamera(shot, scenes) { return directions().withCameraDefaults([shot], scenes)[0]; }
export function attributeWords(key, row, camera = {}) {
    if (key === 'camera')
        return row.id || row.source === 'shot'
            ? cameraMoveWords({ ...(row.source === 'shot' ? camera : {}), speed: row.speed, movement: row.source === 'shot' ? row.value : directions().movement(row.id) }) : row.value;
    return nonEnglishOutsideQuotes(row.value) ? '' : sentence(directions().labels[key][1] + ': ' + row.value);
}
export function sceneShotNotes(card) {
    const english = (s) => s && !nonEnglishOutsideQuotes(s) ? s : '';
    const notes = directions().notes(card, cue => Boolean(english(cue)), true);
    const actions = notes.actions.map(english).filter(Boolean);
    return { action: actions.join(' ') || notes.fallback.map(english).find(Boolean) || '', sound: english(notes.sound), blocking: english(notes.blocking),
        end: english(notes.end), beats: [...notes.beats, ...notes.motion].map(english).filter(Boolean) };
}
export function shotVisualWords(shot, rows, common, end, framing) {
    const dir = shotVisualDirection(shot), visual = object(shot.visual), camera = object(visual.camera);
    const expression = expressionWords(shot);
    return [...new Set([framing, dir.framing, ...dir.openingView, dir.focusWords, dir.depthWords, ...dir.accentWords,
            ...Object.entries(rows).filter(([key]) => !common[key]).map(([key, row]) => attributeWords(key, row, camera)),
            dir.settle && sentence('Closing frame: ' + dir.settle), expression && sentence('Expressions: ' + expression),
            end && sentence('End on ' + end)].filter((v) => !!v && !nonEnglishOutsideQuotes(v)))].join(' ');
}
/** Compile the current storyboard values at authoring and request time. Never writes the board. */
export function compileVideoPrompt(shot, source, names = {}, options = {}) {
    const plan = object(shot.shot), visual = object(shot.visual), frames = object(visual.frames), camera = object(visual.camera);
    const msr = frames.mode === 'reference';
    const { viewWords, picked, movement, settle, moveWords, rack, focusWords, sizeWords, angleWords, framing, depthWords, accentWords, openingView } = shotVisualDirection(shot);
    const lines = (Array.isArray(shot.narration) ? shot.narration : []).map(object);
    const mode = options.mode ?? (lines.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen') ? 'native' : 'voiceover');
    const design = object(plan.videoDesign);
    const motion = object(design.motion);
    const states = [...new Set((Array.isArray(motion.beats) ? motion.beats : []).map(beat => text(object(beat).state)).filter(Boolean))];
    const performance = planVideoPerformance(shot, { ...options, mode });
    const acting = load('../../skills/_shared/scene-acting.js');
    const beats = acting.performanceBeats(performance.performance, mode, !msr && !options.bindDialogueSeparately);
    const worn = expressionWords(shot, names);
    // Cast seen without a line and unnamed extras (shot_characters): the opening picture carries them, the prompt keeps them.
    const called = (id) => names[id] && !nonEnglishOutsideQuotes(names[id]) ? names[id] : id;
    const seen = (Array.isArray(visual.bystanders) ? visual.bystanders : []).map(text).filter(Boolean), extras = text(visual.extras);
    // The action is said once: when an action beat carries the same words with its timing, the beat says it.
    const plain = (value) => text(value).replace(/[.\s]+$/, '').toLowerCase();
    const actionInBeat = performance.performance.some(event => event.kind === 'action' && plain(event.videoDirection || event.text) === plain(source.action));
    // Each sentence carries the step at which a prompt over the adapter's limit lets it go: 1 the design notes and
    // visible states, 2 the beats' acting fields (brief beats), 3 the expressions. 0 never goes — the camera move
    // and its closing frame stay, since a prompt rewritten by hand to fit lost exactly those (mochi_bo, 2026-11-20).
    const parts = (step) => [
        msr ? framing : 'Start from the given first frame.',
        msr ? depthWords : '', moveWords, settle ? sentence(`Closing frame: ${settle}`) : '', focusWords,
        // A beat accent (speed ramp, impact shake) names the moment it fires on.
        ...accentWords, ...openingView,
        actionInBeat ? '' : sentence(source.action),
        seen.length ? sentence(`The opening picture also shows ${seen.map(called).join(' and ')}, who ${seen.length > 1 ? 'stay' : 'stays'} in the frame and never speaks`) : '',
        extras ? sentence(`Unnamed people in the frame: ${extras}`) : '',
        ...(step >= 1 ? [] : ['before', 'after', 'continuity'].map(key => text(design[key]) ? sentence(`${key}: ${text(design[key])}`) : '')),
        ...(step >= 1 ? [] : states.filter(state => ![source.action, design.before, design.after, design.continuity].includes(state)).map(state => sentence(`Visible state: ${state}`))),
        !lines.length && beats.length ? 'Perform the planned action without invented speech or voiceover.' : '',
        ...(step >= 2 ? acting.performanceBeats(performance.performance, mode, !msr && !options.bindDialogueSeparately, { brief: true }) : beats),
        // The model's default face is pleasant; the authored state has to be named and held (LTX guide: physical cues, state after the action).
        worn && step < 3 ? sentence(`Expressions, held to the last frame unless the action changes them: ${worn}`) : '',
        frames.mode === 'first_last' ? sentence(`End on the given last frame${source.end ? ': ' + source.end : ''}`) : source.end ? sentence(`End on ${source.end}`) : '',
        sentence(`Audio: ${source.sound ? source.sound + (/\b(music|soundtrack|score|bgm|melody|orchestral|song)\b/i.test(source.sound) ? '' : ', no music') : 'no music'}`),
        acting.VIDEO_TEXT_POLICY,
    ].filter(Boolean);
    const limit = options.maxCharacters, dropped = ['design notes and visible states', 'acting fields of the beats', 'expressions'];
    let step = 0, prompt = parts(0).join(' ');
    while (limit && prompt.length > limit && step < dropped.length)
        prompt = parts(++step).join(' ');
    const fitWarnings = !limit || !step ? [] : [prompt.length > limit
            ? `prompt_over_limit: ${prompt.length} characters after leaving out the ${dropped.slice(0, step).join(', ')}; the adapter takes ${limit}. Shorten the action, end or sound in shot_prompt`
            : `prompt_fitted: left out the ${dropped.slice(0, step).join(', ')} to fit the adapter's ${limit} characters; the camera, action and lines are whole`];
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
            ...performance.warnings, ...fitWarnings,
            ...(cameraDrift([source.action, source.end].filter(Boolean).join('\n'), movement) === 'contradicted'
                ? ['camera_move_contradicted: shot_prompt action or end conflicts with the camera direction. Reconcile the action cue and landing with visual.camera.'] : []),
            // An unchosen move leaves the camera to the model; on mochi_bo 29 of 33 shots of one episode went out so.
            ...(movement ? [] : ['camera_move_unset: no camera move is chosen, so the video model decides the camera — set shot_icons move (camera.static for a deliberate hold)']),
            ...bindings.filter(b => b.value !== undefined && b.via === 'unmapped' && b.attribute !== 'move').map(b => `No prompt mapping for ${b.attribute}: ${JSON.stringify(b.value)}`),
            ...(rack && !(rack.from && rack.to) ? ['the rack focus names no subjects — give focus.from and focus.to in shot_icons'] : []),
        ] };
}
