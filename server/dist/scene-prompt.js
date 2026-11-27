import { SceneEditGrammar } from './scene-edit-grammar.js';
import { quotedSegments } from './prompt-language.js';
import { formatReferenceLabel } from './scene-prompt-profile.js';
const transitions = {
    hard_cut: 'cut directly', dissolve: 'dissolve to the next view', fade: 'fade to the next view',
    whip_pan: 'whip-pan into the next view', foreground_wipe: 'cut to the next view while the foreground fills the frame',
    dip: 'dip to black before the next view', 'dip:white': 'dip to white before the next view',
    jcut: 'bring in sound from the next shot before cutting to its picture',
    iris: 'reveal the next view through a circular iris', blur: 'blur into the next view', zoom: 'zoom into the next view',
};
const transitionDirections = { l2r: 'left to right', r2l: 'right to left', u2d: 'top to bottom', d2u: 'bottom to top' };
const numberedHeadings = (stage) => [...stage.matchAll(/^Shot (\d+):[ \t]*(\[\d+[–-]\d+s\])?[ \t]*/gmu)];
const stageText = (prompt, lines) => spans(prompt, lines).map(span => span.quoted ? '\u0000' : span.text).join('');
export function sceneTransitionWords(shot, prefix = '') {
    if (shot.transition === 'open')
        return '';
    const [kind, side] = shot.transition.split(':');
    const direction = transitionDirections[side];
    const directional = direction && (kind === 'whip' || kind === 'push') &&
        `${kind === 'whip' ? 'whip-pan' : 'push the frame'} ${direction} into the next view`;
    const cut = transitions[shot.transition] ?? (directional || shot.transition.replaceAll('_', ' '));
    const sentence = prefix ? prefix + cut : cut[0].toUpperCase() + cut.slice(1);
    return sentence + '.' + (shot.transitionCue ? ' ' + shot.transitionCue.replace(/[.!?]+$/, '') + '.' : '');
}
/** A saved prompt owns its wording. Surface a storyboard cue the author should check after an override. */
export function sceneTransitionWarnings(cuts, authoredPrompt, lines) {
    if (authoredPrompt === undefined)
        return [];
    const sentences = (value) => value.split(/(?:[.!?](?=\s|$)|\n)\s*/u)
        .map(part => part.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(?:then |at [\d.]+ seconds, )/, ''))
        .filter(Boolean);
    const stage = stageText(authoredPrompt, lines);
    const headings = numberedHeadings(stage);
    const numbered = headings.length === cuts.length + 1 && headings.every((match, i) => !i || Number(match[1]) > Number(headings[i - 1][1]));
    const shotRows = stage.split('\n').flatMap(row => [...row.matchAll(/\bFollow \{([^{}.]+)\.image\}/gu)]
        .map(match => ({ id: match[1], row })));
    const unnumbered = headings.length || shotRows.length ? [] : sentences(stage);
    let next = 0;
    return cuts.flatMap((cut, i) => {
        if (cut.transition === 'hard_cut' && !cut.transitionCue)
            return [];
        const words = sceneTransitionWords(cut);
        const expected = sentences(words);
        const heading = headings[i + 1];
        const h3Rows = shotRows.filter(row => row.id === cut.to);
        const scoped = numbered || shotRows.length > 0;
        const parts = numbered ? sentences(stage.slice(heading.index + heading[0].length, headings[i + 2]?.index))
            : h3Rows.length === 1 ? sentences(h3Rows[0].row) : unnumbered;
        const at = parts.findIndex((_, index) => index >= (scoped ? 0 : next) &&
            expected.every((sentence, offset) => sentence === parts[index + offset]));
        if (at >= 0) {
            next = at + expected.length;
            return [];
        }
        return [`scene_transition_cue_unconfirmed: ${cut.to} (${cut.transition}) uses an authored prompt. Verify that it describes this storyboard direction: ${words}`];
    });
}
// The numbered label of a storyboard shot. Where the planner numbers shots, an author may keep, drop or renumber it.
const shotLabel = /^Shot \d+:\s*/u;
function shotHeading(shot, fps, options, number) {
    const transition = shot.transition.replaceAll('_', ' ');
    if (!options.modelFacing)
        return `${shot.shotId} [${shot.startFrame}–${shot.endFrame - 1}] ${transition}.` +
            (shot.transitionCue ? ' ' + shot.transitionCue : '');
    if (!options.modelPacedCuts)
        return sceneTransitionWords(shot, `At ${Number((shot.startFrame / fps).toFixed(3))} seconds, `);
    // The 2.0 guide recommends Shot 1, Shot 2 identifiers and calls precise timing unstable. The 2.5 guide reads either.
    if (options.writer === 'seedance' && number) {
        const range = options.wholeSecondShotRanges ? `[${shot.startFrame / fps}–${shot.endFrame / fps}s]` : '';
        return [`Shot ${number}:`, range, sceneTransitionWords(shot)].filter(Boolean).join(' ');
    }
    if (options.writer === 'fastH3' && shot.transition === 'hard_cut' && !shot.transitionCue)
        return 'Hard cut to the next camera setup.';
    if (options.writer === 'hostedH3' && shot.transition === 'hard_cut' && !shot.transitionCue)
        return 'Cut to the next view.';
    const order = sceneTransitionWords(shot, 'Then ');
    if (options.cutTiming !== 'time_ranges')
        return order;
    const seconds = (frame) => Number((frame / fps).toFixed(2));
    return [`[${seconds(shot.startFrame)}–${seconds(shot.endFrame)}s]`, order].filter(Boolean).join(' ');
}
function deliveryDirection(lines) {
    const physical = lines.filter(line => line.delivery !== 'voiceover');
    if (!physical.length)
        return 'No foreground dialogue.';
    if (physical.every(line => line.delivery === 'off_screen'))
        return 'The voice stays off screen. Visible mouths stay closed.';
    if (physical.some(line => line.delivery === 'off_screen'))
        return 'Only on-screen speakers mouth their own lines. Visible mouths stay still for off-screen voices.';
    return 'Only the named on-screen speaker mouths each line. Listeners stay quiet.';
}
/** Render the same ordered shots for the storyboard and the selected provider. Frame ends are exclusive. */
export function sceneTimelineWords(timeline, scene, options = {}) {
    const { boundTurns, describeDelivery, modelFacing } = options;
    const timing = (frame) => modelFacing ? `At ${Number((frame / timeline.fps).toFixed(3))} seconds` : `Frame ${frame}`;
    const wholeTake = new Set(timeline.shots.length === 1 ? [scene.camera, scene.action, scene.emotion] : []);
    const rows = [];
    const headingOptions = options.wholeSecondShotRanges && timeline.shots.some(shot => shot.startFrame % timeline.fps || shot.endFrame % timeline.fps)
        ? { ...options, wholeSecondShotRanges: false } : options;
    if (!modelFacing)
        rows.push(`Scene at ${timeline.fps} fps. Frame numbers start at zero.`);
    let turnIndex = 0;
    for (const [index, shot] of timeline.shots.entries()) {
        const images = timeline.images.filter(image => image.shotId === shot.shotId);
        const cues = images.filter(image => image.cue).map(image => `${timing(image.frame)}: ${image.cue}`);
        const guides = images.flatMap(image => image.reference?.scope === 'shot_guide' ? [image.reference.purpose] : []);
        const lines = shot.dialogue ?? [];
        const spoken = [];
        for (const line of lines) {
            if (boundTurns)
                spoken.push(boundTurns[turnIndex++]);
            else if (options.includeDialogue !== false && line.delivery !== 'voiceover') {
                spoken.push([line.frame !== undefined && timing(line.frame) + ':', line.direction,
                    `${line.speaker} (${line.delivery}): "${line.text}"`].filter(Boolean).join(' '));
            }
        }
        const duration = Number(((shot.endFrame - shot.startFrame) / timeline.fps).toFixed(2));
        const hold = describeDelivery && options.cutTiming === 'approximate_holds' &&
            `Hold this view for about ${duration} ${duration === 1 ? 'second' : 'seconds'}.`;
        const positions = (shot.openingPositions || []).filter(person => index !== 0 ||
            !scene.openingPositions?.some(initial => initial.character === person.character && initial.position === person.position));
        const opening = positions.map(person => person.character + ': ' + person.position.replace(/[.!?]+$/, '') + '.').join(' ');
        rows.push([
            shotHeading(shot, timeline.fps, headingOptions, timeline.shots.length > 1 ? index + 1 : undefined), hold,
            opening && 'At the start of this shot, ' + opening,
            ...[shot.framing, shot.blocking, shot.action].filter(value => value && !wholeTake.has(value)),
            ...cues, ...guides, shot.sound && shot.sound !== scene.sound && 'Sound: ' + shot.sound,
            describeDelivery && deliveryDirection(lines), ...spoken,
            shot.closingState && 'End on ' + shot.closingState,
        ].filter(Boolean).join(' '));
    }
    if (timeline.audio) {
        rows.push(modelFacing && options.writer === 'recorded'
            ? 'Follow the supplied recording from the opening. Time visible speech and reactions to its words and pauses.'
            : modelFacing ? 'Play one continuous soundtrack from the opening.' : 'Play one continuous scene track from frame 0.');
        for (const cue of timeline.audio.cues)
            rows.push(`${timing(cue.frame)}: ${cue.action}`);
    }
    return rows.filter(Boolean).join('\n');
}
const TOKEN = /\{[^{}\n]*\}/g;
const NAME = /^\{([\p{L}\p{N}_-]+)\.([\p{L}\p{N}_-]+)\}$/u;
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A label is its whole number: "Image 1" is not read inside "Image 10", "Image 1.5" or "KeyImage 1". */
const labelPattern = (label) => new RegExp('(?<![\\p{L}\\p{N}])' + escaped(label) + '(?!\\d|\\.\\d)', 'gu');
/** The text outside and inside quotation marks, in order. */
const spans = (text, lines) => {
    const parts = [];
    let at = 0;
    for (const quote of quotedSegments(text, lines)) {
        parts.push({ text: text.slice(at, quote.index), quoted: false }, { text: quote[0], quoted: true });
        at = quote.index + quote[0].length;
    }
    return [...parts, { text: text.slice(at), quoted: false }];
};
const loneBrace = (text) => /[{}]/.test(text.replace(TOKEN, ''));
const word = (text) => text.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
/** Name every numbered input of the final request. `unlabeled` lists pictures a prompt cannot point at. */
export function scenePromptSlots(style, images = [], voices = [], media = []) {
    const slots = [], unlabeled = new Set();
    const owned = new Map();
    for (const image of images) {
        // Only the reference list is numbered in a prompt. A start, end or timed frame has no label.
        if (image.number === undefined) {
            if (image.shotId && (image.guide || !image.owner))
                unlabeled.add(word(image.shotId) + '.image');
            continue;
        }
        const label = formatReferenceLabel(style, 'image', image.number);
        if (image.owner)
            owned.set(image.owner, [...owned.get(image.owner) ?? [], { role: word(image.role ?? '') || 'image', label, id: image.id }]);
        else
            slots.push({ key: word((image.guide ? image.shotId : undefined) ?? image.id ?? 'reference' + image.number) + '.image', label });
    }
    for (const [owner, rows] of owned) {
        for (const row of rows) {
            const repeated = rows.some(other => other !== row && other.role === row.role);
            const role = repeated && row.id ? row.role + '-' + word(row.id) : row.role;
            slots.push({ key: word(owner) + '.' + role, label: row.label });
        }
        // The short name is unambiguous only for a single picture, and it never takes the name of a shot's own picture.
        if (rows.length === 1 && rows[0].role !== 'image' && !unlabeled.has(word(owner) + '.image'))
            slots.push({ key: word(owner) + '.image', label: rows[0].label });
    }
    for (const voice of voices)
        if (voice.audioIndex)
            slots.push({ key: word(voice.speaker) + '.voice', label: formatReferenceLabel(style, 'audio', voice.audioIndex) });
    for (const item of media)
        slots.push({ key: word(item.name) + '.' + item.role,
            label: formatReferenceLabel(style, item.role === 'motion' ? 'video' : 'audio', item.index) });
    const keys = new Map();
    const ambiguous = new Set();
    for (const { key, label } of slots) {
        if (keys.has(key) && keys.get(key) !== label)
            ambiguous.add(key);
        keys.set(key, label);
    }
    return { slots: [...keys].filter(([key]) => NAME.test('{' + key + '}') && !ambiguous.has(key)).map(([key, label]) => ({ key, label })),
        ambiguous: [...ambiguous], unlabeled: [...unlabeled].filter(key => !keys.has(key)) };
}
/**
 * Fill the names of an authored prompt with the numbers of the submitted request. Problems are reported; no
 * sentence is reworded or shortened. `composed` is the planner's own prompt for the same request: a line, a
 * sentence or a brace it carries is the board's text, which calibrates what is reported and what is left alone.
 */
export function resolveScenePrompt(template, { slots, unlabeled, ambiguous }, checks = {}) {
    const labels = new Map(slots.map(slot => [slot.key, slot.label]));
    // A label can have two names; the first is the one a report offers.
    const named = new Map();
    for (const slot of slots)
        if (!named.has(slot.label))
            named.set(slot.label, slot.key);
    const issues = [], reported = new Set();
    const report = (level, code, detail) => {
        if (!reported.has(code + detail)) {
            reported.add(code + detail);
            issues.push({ level, code, detail });
        }
    };
    const board = new Set(checks.composed?.match(TOKEN) ?? []);
    const body = spans(template, checks.lines).map(span => {
        // A number inside a spoken line is speech. Outside one it is a reference typed by hand.
        if (!span.quoted) {
            for (const match of span.text.matchAll(/(?<![\p{L}\p{N}_])(?:<(?:Picture|Audio|Video) \d+>|(?:reference |@)?(?:Image|Audio|Video) \d+)(?!\d|\.\d)/giu)) {
                const label = match[0], key = named.get(label);
                if (!key)
                    report('error', 'reference_unknown', label + ' does not identify a named input in this request');
                else
                    report(checks.strictReferences ? 'error' : 'warning', 'label_literal', label + ' depends on input order; use {' + key + '}');
            }
        }
        return span.text.replace(TOKEN, token => {
            const name = NAME.exec(token), key = name ? name[1] + '.' + name[2] : '', label = labels.get(key);
            // Braces the board itself uses stay as written: always inside a spoken line, elsewhere unless they spell a submitted reference.
            if (board.has(token) && (span.quoted || !label))
                return token;
            if (label)
                return label;
            if (ambiguous.includes(key))
                report('error', 'placeholder_ambiguous', token + ' matches multiple inputs; give the assets distinct names');
            else if (unlabeled.includes(key))
                report('error', 'placeholder_unlabeled', `${token} is sent as a timed frame, which this model's prompt cannot name`);
            else if (name)
                report('error', 'placeholder_unresolved', `${token} names no submitted reference; available: ${slots.map(slot => '{' + slot.key + '}').join(' ') || 'none'}`);
            else
                report('error', 'placeholder_unresolved', `${token} is not a reference name; braces are kept for {id.role}, {id.image} and {id.voice}`);
            return token;
        });
    }).join('');
    if (loneBrace(template) && !loneBrace(checks.composed ?? ''))
        report('error', 'placeholder_unresolved', 'a brace stands without its pair; braces are kept for {id.role}, {id.image} and {id.voice}');
    // A fixed header the adapter states ahead of the prompt is part of what the model reads and what the limit counts.
    const header = checks.header ?? '';
    const prompt = body.startsWith(header) ? body : header + body;
    for (const [label, key] of named)
        if (!labelPattern(label).test(prompt))
            report('warning', 'reference_unmentioned', `{${key}} is submitted and the prompt never names it`);
    for (const line of checks.lines ?? [])
        if (!prompt.includes(line))
            report('warning', 'line_missing', `the prompt does not carry the authored line "${line}"`);
    for (const sentence of checks.sentences ?? [])
        if (!prompt.includes(sentence.text))
            report('warning', sentence.code, `the prompt leaves out "${sentence.text}"`);
    const length = [...prompt].length;
    if (checks.limit !== undefined && length > checks.limit)
        report('error', 'prompt_too_long', `${length} characters${header && prompt !== body ? ' with the ' + [...header].length + '-character opening header' : ''}; this model takes ${checks.limit}`);
    // The adapter's own schema counts UTF-16 units, which is more than the characters when some sit outside the basic plane.
    else if (checks.schemaLimit !== undefined && prompt.length > checks.schemaLimit)
        report('error', 'prompt_too_long', `${prompt.length} UTF-16 units; this adapter takes ${checks.schemaLimit}`);
    return { prompt, body, issues };
}
/** The submitted prompt with its numbers turned back into names: the editable storyboard prompt. */
export function scenePromptTemplate(prompt, { slots }, header = '', lines) {
    const names = new Map();
    // A character's single picture has two names; the role name is the one that stays valid when a second picture is added.
    for (const slot of slots)
        if (!names.has(slot.label))
            names.set(slot.label, slot.key);
    const headed = Boolean(header) && prompt.startsWith(header);
    const longestFirst = [...names].sort((a, b) => b[0].length - a[0].length);
    // A spoken line keeps its words, so a number inside quotation marks is never turned into a name.
    const promptTemplate = spans(headed ? prompt.slice(header.length) : prompt, lines).map(span => span.quoted ? span.text
        : longestFirst.reduce((text, [label, key]) => text.replace(labelPattern(label), '{' + key + '}'), span.text)).join('');
    return { promptTemplate, ...(headed ? { promptHeader: header } : {}) };
}
/** Check the ordered script before rendering the provider's numbered references. */
export function assertSceneDialogue(template, expected, cast, composed, nativeDialogue = true, storyboardDirections = false) {
    const script = expected.flatMap(line => line.tts ? [line.tts] : []);
    const splitSentences = (text) => text.trimEnd().replace(/([:—–=])\s*\n\s*/gu, '$1 ').split(/(?:[.!?](?=\s|$)|\n)\s*/u);
    const original = spans(composed, script);
    const headings = numberedHeadings(stageText(composed, script));
    const numbered = headings.length > 0;
    const range = /^\[\d+–\d+s\]/u;
    const approvedRanges = new Set(headings.flatMap(match => match[2] ? [match[2]] : []));
    if (approvedRanges.size) {
        const authored = numberedHeadings(stageText(template, script));
        const ordered = authored.length === headings.length && authored.every((match, i) => !i || Number(match[1]) > Number(authored[i - 1][1]));
        let prior = -1;
        for (const [i, match] of authored.entries()) {
            if (!match[2])
                continue;
            const corresponding = ordered ? i : headings.findIndex(heading => heading[1] === match[1]);
            if (corresponding <= prior || match[2] !== headings[corresponding]?.[2])
                throw new Error('scene_direction_unverified: ' + match[0].trim() + ' changes the approved time range of this shot');
            prior = corresponding;
        }
    }
    const unlabel = (text) => {
        const trimmed = text.trim();
        if (!numbered || !shotLabel.test(trimmed))
            return trimmed;
        const body = trimmed.replace(shotLabel, '');
        const timing = body.match(range)?.[0];
        return timing && approvedRanges.has(timing) ? body.slice(timing.length).trimStart() : body;
    };
    const approvedDirections = new Set(original.filter(span => !span.quoted)
        .flatMap(span => splitSentences(span.text)).map(unlabel));
    // A draft written before shots were numbered keeps the sentence the planner then wrote between them.
    if (numbered)
        approvedDirections.add('Then cut directly');
    const attributions = [];
    const visualQuotes = [];
    for (const [i, span] of original.entries()) {
        if (!span.quoted)
            continue;
        const words = span.text.slice(1, -1);
        const lead = unlabel(splitSentences(original[i - 1]?.text ?? '').at(-1) ?? '');
        if (nativeDialogue && words === script[attributions.length])
            attributions.push(lead);
        else
            visualQuotes.push({ words, lead });
    }
    const grammar = new SceneEditGrammar(cast);
    let index = 0;
    let clause = '', wrappedClause = '';
    const parts = spans(template, script);
    for (const [partIndex, span] of parts.entries()) {
        if (!span.quoted) {
            const sentences = splitSentences(span.text);
            wrappedClause = unlabel(span.text.trimEnd().split(/[.!?](?=\s|$)/u).at(-1) ?? '');
            clause = parts[partIndex + 1]?.quoted ? unlabel(sentences.pop() ?? '') : '';
            for (const sentence of sentences) {
                const text = unlabel(sentence);
                if (!text || approvedDirections.has(text) || storyboardDirections)
                    continue;
                grammar.checkStageDirection(text, nativeDialogue);
            }
            continue;
        }
        const words = span.text.slice(1, -1);
        const visual = visualQuotes.findIndex(quote => quote.words === words && quote.lead === clause.trim());
        if (visual >= 0) {
            visualQuotes.splice(visual, 1);
            continue;
        }
        if (!nativeDialogue) {
            if (cast.length)
                throw new Error('scene_dialogue_mismatch: preserve quoted material and its attribution from the storyboard');
            continue;
        }
        const line = expected[index++];
        if (!line || line.tts !== words)
            throw new Error('scene_dialogue_mismatch: keep exactly the approved spoken lines in scene order');
        if (line.speaker && clause.trim() !== attributions[index - 1] && !grammar.ownsTurn(clause, line.speaker, line.delivery) &&
            (wrappedClause === clause.trim() || !grammar.ownsTurn(wrappedClause, line.speaker, line.delivery)))
            throw new Error('scene_dialogue_speaker: introduce the quote directly with its approved speaker. Put complex blocking in a preceding sentence');
    }
    if (nativeDialogue && index !== expected.length)
        throw new Error('scene_dialogue_mismatch: preserve each approved spoken line verbatim in quotes');
}
