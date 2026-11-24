import { quotedSegments } from './prompt-language.js';
import type { SceneVideoDirection } from './msr-opening.js';
import type { SceneTimeline } from './scene-video.js';
import { formatReferenceLabel, type ScenePromptProfile } from './scene-prompt-profile.js';

type SceneShot = SceneTimeline['shots'][number];
type Dialogue = NonNullable<SceneShot['dialogue']>;
interface TimelineOptions {
  includeDialogue?: boolean;
  modelFacing?: boolean;
  modelPacedCuts?: boolean;
  boundTurns?: readonly string[];
  describeDelivery?: boolean;
  cutTiming?: ScenePromptProfile['cutTiming'];
  writer?: ScenePromptProfile['writer'];
}

const transitions: Record<string, string> = {
  hard_cut:'cut directly', dissolve:'dissolve to the next view', fade:'fade to the next view',
};

function shotHeading(shot: SceneShot, fps: number, options: TimelineOptions): string {
  const transition = shot.transition.replaceAll('_', ' ');
  if (!options.modelFacing) return `${shot.shotId} [${shot.startFrame}–${shot.endFrame - 1}] ${transition}.`;
  const cut = transitions[shot.transition] ?? transition;
  if (!options.modelPacedCuts)
    return shot.transition === 'open' ? '' : `At ${Number((shot.startFrame / fps).toFixed(3))} seconds, ${cut}.`;
  if (options.writer === 'fastH3' && shot.transition === 'hard_cut') return 'Hard cut to the next camera setup.';
  if (options.writer === 'hostedH3' && shot.transition === 'hard_cut') return 'Cut to the next view.';
  const order = shot.transition === 'open' ? '' : `Then ${cut}.`;
  if (options.cutTiming !== 'time_ranges') return order;
  const seconds = (frame: number) => Number((frame / fps).toFixed(2));
  return [`[${seconds(shot.startFrame)}–${seconds(shot.endFrame)}s]`, order].filter(Boolean).join(' ');
}

function deliveryDirection(lines: Dialogue): string {
  const physical = lines.filter(line => line.delivery !== 'voiceover');
  if (!physical.length) return 'No foreground dialogue.';
  if (physical.every(line => line.delivery === 'off_screen')) return 'The voice stays off screen. Visible mouths stay closed.';
  if (physical.some(line => line.delivery === 'off_screen')) return 'Only on-screen speakers mouth their own lines. Visible mouths stay still for off-screen voices.';
  return 'Only the named on-screen speaker mouths each line. Listeners stay quiet.';
}

/** Render the same ordered shots for the storyboard and the selected provider. Frame ends are exclusive. */
export function sceneTimelineWords(timeline: SceneTimeline, scene: Partial<SceneVideoDirection>, options: TimelineOptions = {}): string {
  const {boundTurns, describeDelivery, modelFacing} = options;
  const timing = (frame: number) => modelFacing ? `At ${Number((frame / timeline.fps).toFixed(3))} seconds` : `Frame ${frame}`;
  const wholeTake = new Set(timeline.shots.length === 1 ? [scene.camera, scene.action, scene.emotion] : []);
  const rows: string[] = [];
  if (!modelFacing) rows.push(`Scene at ${timeline.fps} fps. Frame numbers start at zero.`);
  let turnIndex = 0;
  for (const shot of timeline.shots) {
    const images = timeline.images.filter(image => image.shotId === shot.shotId);
    const cues = images.filter(image => image.cue).map(image => `${timing(image.frame)}: ${image.cue}`);
    const guides = images.flatMap(image => image.reference?.scope === 'shot_guide' ? [image.reference.purpose] : []);
    const lines = shot.dialogue ?? [];
    const spoken: string[] = [];
    for (const line of lines) {
      if (boundTurns) spoken.push(boundTurns[turnIndex++]);
      else if (options.includeDialogue !== false && line.delivery !== 'voiceover') {
        spoken.push([line.frame !== undefined && timing(line.frame) + ':', line.direction,
          `${line.speaker} (${line.delivery}): "${line.text}"`].filter(Boolean).join(' '));
      }
    }
    const duration = Number(((shot.endFrame - shot.startFrame) / timeline.fps).toFixed(2));
    const hold = describeDelivery && options.cutTiming === 'approximate_holds' &&
      `Hold this view for about ${duration} ${duration === 1 ? 'second' : 'seconds'}.`;
    rows.push([
      shotHeading(shot, timeline.fps, options), hold,
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
    for (const cue of timeline.audio.cues) rows.push(`${timing(cue.frame)}: ${cue.action}`);
  }
  return rows.filter(Boolean).join('\n');
}

// ── Authored scene prompts ───────────────────────────────────────────────────
// An author writes the whole provider prompt and names each submitted reference by what it is:
// {miran.face}, {miran.voice}, {hallway.image}, {s2.image}. The numbers a model calls them by
// follow the order of the submitted request, so they are filled in here from the final bindings.
// The GenAI gateway reads the same grammar on its scene mode. The sentences are never reworded.

export interface PromptSlot { key: string; label: string }
export interface PromptIssue { level: 'error' | 'warning'; code: string; detail: string }
/** One submitted picture: its place in the request's numbered reference list, when it has one, and whose it is. */
export interface PromptImage { number?: number; owner?: string; role?: string; id?: string; shotId?: string; guide?: boolean }
interface SlotVoice { speaker: string; audioIndex?: number }

const TOKEN = /\{[^{}\n]*\}/g;
const NAME = /^\{([\p{L}\p{N}_-]+)\.([\p{L}\p{N}_-]+)\}$/u;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A label is its whole number: "Image 1" is not read inside "Image 10", "Image 1.5" or "KeyImage 1". */
const labelPattern = (label: string) => new RegExp('(?<![\\p{L}\\p{N}])' + escaped(label) + '(?!\\d|\\.\\d)', 'gu');
/** The text outside and inside quotation marks, in order. */
const spans = (text: string, lines?: readonly string[]) => {
  const parts: {text: string; quoted: boolean}[] = [];
  let at = 0;
  for (const quote of quotedSegments(text, lines)) {
    parts.push({text: text.slice(at, quote.index), quoted: false}, {text: quote[0], quoted: true});
    at = quote.index! + quote[0].length;
  }
  return [...parts, {text: text.slice(at), quoted: false}];
};
const loneBrace = (text: string) => /[{}]/.test(text.replace(TOKEN, ''));

const word = (text: string) => text.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');

/** Name every numbered input of the final request. `unlabeled` lists pictures a prompt cannot point at. */
export function scenePromptSlots(style: ScenePromptProfile['referenceLabels'], images: readonly PromptImage[] = [], voices: readonly SlotVoice[] = [],
  media: readonly {name: string; role: 'motion' | 'soundtrack'; index: number}[] = []) {
  const slots: PromptSlot[] = [], unlabeled = new Set<string>();
  const owned = new Map<string, {role: string; label: string; id?: string}[]>();
  for (const image of images) {
    // Only the reference list is numbered in a prompt. A start, end or timed frame has no label.
    if (image.number === undefined) { if (image.shotId && (image.guide || !image.owner)) unlabeled.add(word(image.shotId) + '.image'); continue; }
    const label = formatReferenceLabel(style, 'image', image.number);
    if (image.owner) owned.set(image.owner, [...owned.get(image.owner) ?? [], {role: word(image.role ?? '') || 'image', label, id:image.id}]);
    else slots.push({key: word((image.guide ? image.shotId : undefined) ?? image.id ?? 'reference' + image.number) + '.image', label});
  }
  for (const [owner, rows] of owned) {
    for (const row of rows) {
      const repeated = rows.some(other => other !== row && other.role === row.role);
      const role = repeated && row.id ? row.role + '-' + word(row.id) : row.role;
      slots.push({key: word(owner) + '.' + role, label: row.label});
    }
    // The short name is unambiguous only for a single picture, and it never takes the name of a shot's own picture.
    if (rows.length === 1 && rows[0].role !== 'image' && !unlabeled.has(word(owner) + '.image')) slots.push({key: word(owner) + '.image', label: rows[0].label});
  }
  for (const voice of voices) if (voice.audioIndex) slots.push({key: word(voice.speaker) + '.voice', label: formatReferenceLabel(style, 'audio', voice.audioIndex)});
  for (const item of media) slots.push({key: word(item.name) + '.' + item.role,
    label: formatReferenceLabel(style, item.role === 'motion' ? 'video' : 'audio', item.index)});
  const keys = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const {key, label} of slots) {
    if (keys.has(key) && keys.get(key) !== label) ambiguous.add(key);
    keys.set(key, label);
  }
  return {slots: [...keys].filter(([key]) => NAME.test('{' + key + '}') && !ambiguous.has(key)).map(([key,label]) => ({key,label})),
    ambiguous: [...ambiguous], unlabeled: [...unlabeled].filter(key => !keys.has(key))};
}

/**
 * Fill the names of an authored prompt with the numbers of the submitted request. Problems are reported; no
 * sentence is reworded or shortened. `composed` is the planner's own prompt for the same request: a line, a
 * sentence or a brace it carries is the board's text, which calibrates what is reported and what is left alone.
 */
export function resolveScenePrompt(template: string, {slots, unlabeled, ambiguous}: ReturnType<typeof scenePromptSlots>,
  checks: {strictReferences?: boolean; composed?: string; lines?: readonly string[]; sentences?: readonly {code: string; text: string}[];
    limit?: number; schemaLimit?: number; header?: string} = {}) {
  const labels = new Map(slots.map(slot => [slot.key, slot.label]));
  // A label can have two names; the first is the one a report offers.
  const named = new Map<string, string>();
  for (const slot of slots) if (!named.has(slot.label)) named.set(slot.label, slot.key);
  const issues: PromptIssue[] = [], reported = new Set<string>();
  const report = (level: PromptIssue['level'], code: string, detail: string) => {
    if (!reported.has(code + detail)) { reported.add(code + detail); issues.push({level, code, detail}); }
  };
  const board = new Set(checks.composed?.match(TOKEN) ?? []);
  const body = spans(template, checks.lines).map(span => {
    // A number inside a spoken line is speech. Outside one it is a reference typed by hand.
    if (!span.quoted) {
      for (const match of span.text.matchAll(/(?<![\p{L}\p{N}_])(?:<(?:Picture|Audio|Video) \d+>|(?:reference |@)?(?:Image|Audio|Video) \d+)(?!\d|\.\d)/giu)) {
        const label = match[0], key = named.get(label);
        if (!key) report('error', 'reference_unknown', label + ' does not identify a named input in this request');
        else report(checks.strictReferences ? 'error' : 'warning', 'label_literal',
          label + ' depends on input order; use {' + key + '}');
      }
    }
    return span.text.replace(TOKEN, token => {
      const name = NAME.exec(token), key = name ? name[1] + '.' + name[2] : '', label = labels.get(key);
      // Braces the board itself uses stay as written: always inside a spoken line, elsewhere unless they spell a submitted reference.
      if (board.has(token) && (span.quoted || !label)) return token;
      if (label) return label;
      if (ambiguous.includes(key)) report('error', 'placeholder_ambiguous', token + ' matches multiple inputs; give the assets distinct names');
      else if (unlabeled.includes(key)) report('error', 'placeholder_unlabeled', `${token} is sent as a timed frame, which this model's prompt cannot name`);
      else if (name) report('error', 'placeholder_unresolved', `${token} names no submitted reference; available: ${slots.map(slot => '{' + slot.key + '}').join(' ') || 'none'}`);
      else report('error', 'placeholder_unresolved', `${token} is not a reference name; braces are kept for {id.role}, {id.image} and {id.voice}`);
      return token;
    });
  }).join('');
  if (loneBrace(template) && !loneBrace(checks.composed ?? ''))
    report('error', 'placeholder_unresolved', 'a brace stands without its pair; braces are kept for {id.role}, {id.image} and {id.voice}');
  // A fixed header the adapter states ahead of the prompt is part of what the model reads and what the limit counts.
  const header = checks.header ?? '';
  const prompt = body.startsWith(header) ? body : header + body;
  for (const [label, key] of named) if (!labelPattern(label).test(prompt))
    report('warning', 'reference_unmentioned', `{${key}} is submitted and the prompt never names it`);
  for (const line of checks.lines ?? []) if (!prompt.includes(line))
    report('warning', 'line_missing', `the prompt does not carry the authored line "${line}"`);
  for (const sentence of checks.sentences ?? []) if (!prompt.includes(sentence.text))
    report('warning', sentence.code, `the prompt leaves out "${sentence.text}"`);
  const length = [...prompt].length;
  if (checks.limit !== undefined && length > checks.limit)
    report('error', 'prompt_too_long', `${length} characters${header && prompt !== body ? ' with the ' + [...header].length + '-character opening header' : ''}; this model takes ${checks.limit}`);
  // The adapter's own schema counts UTF-16 units, which is more than the characters when some sit outside the basic plane.
  else if (checks.schemaLimit !== undefined && prompt.length > checks.schemaLimit)
    report('error', 'prompt_too_long', `${prompt.length} UTF-16 units; this adapter takes ${checks.schemaLimit}`);
  return {prompt, body, issues};
}

/** The submitted prompt with its numbers turned back into names: what an author edits and sends as `prompt`. */
export function scenePromptTemplate(prompt: string, {slots}: Pick<ReturnType<typeof scenePromptSlots>, 'slots'>, header = '', lines?: readonly string[]) {
  const names = new Map<string, string>();
  // A character's single picture has two names; the role name is the one that stays valid when a second picture is added.
  for (const slot of slots) if (!names.has(slot.label)) names.set(slot.label, slot.key);
  const headed = Boolean(header) && prompt.startsWith(header);
  const longestFirst = [...names].sort((a, b) => b[0].length - a[0].length);
  // A spoken line keeps its words, so a number inside quotation marks is never turned into a name.
  const promptTemplate = spans(headed ? prompt.slice(header.length) : prompt, lines).map(span => span.quoted ? span.text
    : longestFirst.reduce((text, [label, key]) => text.replace(labelPattern(label), '{' + key + '}'), span.text)).join('');
  return {promptTemplate, ...(headed ? {promptHeader: header} : {})};
}

type PromptCast = readonly {speaker: string; name: string}[];

/** Listener names in direct address describe the interaction. Reference tokens always identify their owner. */
function castMentions(text: string, cast: PromptCast): Set<string> {
  const owners = new Set<string>();
  const plain = text.replace(TOKEN, token => {
    const parsed = NAME.exec(token);
    if (parsed && cast.some(person => word(person.speaker) === parsed[1])) owners.add(parsed[1]);
    return ' ';
  });
  for (const person of cast) {
    const aliases = [person.speaker,person.name].filter(Boolean).map(escaped).join('|');
    const mentions = new RegExp('(?<![\\p{L}\\p{N}_-])(?:' + aliases + ')(?![\\p{L}\\p{N}_-])', 'giu');
    if (mentions.test(plain)) owners.add(word(person.speaker));
  }
  return owners;
}

/** Edited stage directions may use a single cast member's slots. Use cast names for interactions.
 * Voice bindings and the labeled cast inventory are compiler-owned. Acting cues belong with the turn.
 */
function changesCastBinding(text: string, cast: PromptCast): boolean {
  if (/^\s*\{[^{}]+\}\s*:/u.test(text)) return true;
  if (!cast.length) return false;
  if (/\b(?:voices?|vocal|timbres?|accents?|voiceprints?)\b/iu.test(text)) return true;
  const owners = castMentions(text,cast);
  const bound = (text.match(TOKEN) ?? []).some(token => cast.some(person => NAME.exec(token)?.[1] === word(person.speaker)));
  if (bound && owners.size > 1) return true;
  const identity = bound || /\b(?:faces?|facial|likeness(?:es)?|portraits?|identit(?:y|ies)|appearances?|roles?|speakers?|performers?|characters?|bodies)\b/iu.test(text);
  const transfer = /\b(?:assign\w*|belongs?|portrays?|impersonat\w*|swap\w*|switch\w*|exchang\w*|revers\w*|trad(?:e|es|ing)|borrow\w*|imitat\w*|stands? in for|doubles? as|takes? on)\b/iu;
  const designate = /\b(?:use|uses|cast|casts)\b.+\s(?:for|as)\s|\b(?:identity|face|likeness)\s+(?:is|of)\s/iu;
  if (identity && transfer.test(text) || (identity || owners.size > 1) && designate.test(text)) return true;
  if (owners.size < 2) return false;
  const names = cast.flatMap(person => [person.speaker,person.name]).filter(Boolean).map(escaped).join('|');
  const actor = '(?<![\\p{L}\\p{N}_-])(?:' + names + ')(?![\\p{L}\\p{N}_-])';
  return new RegExp(actor + '\\s*(?:=|→|->|—|\\b(?:is|as|plays|portrays|represents)\\b)\\s*' + actor,'iu').test(text);

}

/** Native actor and line order come from the approved script. A direction that allocates speech
 * belongs to a quoted turn, including when the author calls the line by its position or function.
 */
function assignsSpokenTurn(text: string, cast: PromptCast): boolean {
  // A beat may be timed against a turn without allocating the turn to anyone.
  text = text.replace(/\b(?:after|before|during|following)\s+(?:the\s+)?(?:first|second|third|fourth|next|last|final|opening|closing)\s+(?:spoken\s+)?(?:lines?|turns?|words?|sentences?)\b/giu,' ')
    .replace(/\banswers?(?:ing)?\s+(?:the |a |her |his )?(?:door|phone|doorbell)\b/giu,' ');
  const speech = /\b(?:dialogue|utterances?|spoken|speakers?|speaking|conversation|monologue|opening (?:words?|line)|closing (?:words?|line)|repl(?:y|ies)|questions?|answers?)\b/iu;
  const ordinal = /\b(?:first|second|third|fourth|next|last|final|opening|closing|previous|later|earlier|\d+(?:st|nd|rd|th)?)\s+(?:[\w-]+\s+){0,2}(?:lines?|turns?|words?|sentences?)\b|\b(?:line|turn|sentence)\s*(?:#?\d+|one|two|three)\b/iu;
  const attributes = /\b(?:says?|asks?|adds?|repl(?:y|ies)|responds?|answers?|whispers?|shouts?|speaks?|murmurs?|yells?|calls?|tells?|mutters?)\b/iu;
  if (ordinal.test(text)) return true;
  if (/\b(?:swap|switch|reverse|reorder|replace|omit|skip|ignore)\w*\b/iu.test(text) &&
      /\b(?:lines?|dialogue|words?|turns?|script|speakers?)\b/iu.test(text)) return true;
  const perform = /\b(?:mouths?|lip[- ]?sync\w*|voices?|recites?|utters?|reads?|delivers?|performs?|sings?)\b/iu;
  if (perform.test(text) && /\b(?:lines?|words?|verses?|sentences?|turns?|dialogue|script|speech)\b/iu.test(text)) return true;
  if (!attributes.test(text) && !speech.test(text)) return false;
  return castMentions(text,cast).size > 0 || /[:,]\s*\S|\b(?:delivers?|speaks?|actor|performer|character|belongs?|assign\w*)\b/iu.test(text);
}

// Parse newly written attributions as a small grammar. Compiled attributions are compared
// verbatim, preserving model-specific delivery and display names. Stage prose belongs before the cue.
function ownsEditedTurn(clause: string, speaker: string, cast: PromptCast): boolean {
  if (/[ⓈⓁⓧ]/u.test(clause)) return false;
  const id = word(speaker);
  let cue = clause.trim().replace(/[:,]$/u,'').trim().replace(TOKEN, token =>
    NAME.exec(token)?.[1] === id ? 'Ⓢ' : 'ⓧ');
  const aliases = new Map<string,string>();
  for (const person of cast) {
    for (const name of [person.speaker,person.name].filter(Boolean)) {
      const key = name.toLowerCase();
      const marker = person.speaker === speaker ? 'Ⓢ' : 'Ⓛ';
      aliases.set(key, aliases.has(key) && aliases.get(key) !== marker ? 'ⓧ' : marker);
    }
  }
  const names = [...aliases.keys()].sort((a,b) => b.length-a.length).map(escaped).join('|');
  if (names) cue = cue.replace(new RegExp('(?<![\\p{L}\\p{N}_-])(?:'+names+')(?![\\p{L}\\p{N}_-])','giu'),
    matched => aliases.get(matched.toLowerCase())!);
  if (!cue.startsWith('Ⓢ') || cue.includes('ⓧ')) return false;
  // Strip only known listener and speaker adjuncts. A relative clause introduces another subject.
  cue = cue.replace(/\s*\((?:Ⓢ|on screen|off screen)(?:,\s*(?:Ⓢ|on screen|off screen))*\)$/iu,'')
    .replace(/,?\s+(?:using|with)\s+Ⓢ$/iu,'')
    .replace(/\s+to\s+Ⓛ$/iu,'')
    .replace(/^Ⓢ\s+(?:looks?|glances?|turns?)\s+(?:at|to|towards?)\s+Ⓛ\s+and\s+/iu,'Ⓢ ')
    .replace(/^Ⓢ\s+waits?(?:\s+(?:by|at|near|beside)\s+(?:the|a)\s+[\p{L}-]+(?:\s+[\p{L}-]+){0,2})?\s+and\s+/iu,'Ⓢ ');
  return /^(?:Ⓢ|Ⓢ\s+(?:says?|asks?|repl(?:y|ies)|answers?|speaks?|whispers?|calls?|shouts?|murmurs?|mutters?|tells?|continues?)(?:\s+\p{L}+ly)?|Ⓢ\s+(?:asks?|tells?|reassures?|greets?|addresses?|thanks?|warns?|comforts?|reminds?)\s+Ⓛ)$/iu.test(cue);
}

/** Check the ordered script before rendering the provider's numbered references. */
export function assertSceneDialogue(template: string, expected: readonly {speaker?: string; tts?: string}[],
  cast: PromptCast, composed: string, nativeDialogue = true): void {
  const script = expected.flatMap(line => line.tts ? [line.tts] : []);
  const visualQuotes = spans(composed,script).filter(span => span.quoted && !script.includes(span.text.slice(1,-1)))
    .map(span => span.text.slice(1,-1));
  const splitSentences = (text: string) => text.trimEnd().replace(/([:—–=])\s*\n\s*/gu,'$1 ').split(/(?:[.!?](?=\s|$)|\n)\s*/u);
  const original = spans(composed,script);
  const approvedDirections = new Set(original.filter(span => !span.quoted)
    .flatMap(span => splitSentences(span.text)).map(text => text.trim()));
  const attributions: string[] = [];
  for (const [i, span] of original.entries()) {
    if (span.quoted && span.text.slice(1,-1) === script[attributions.length])
      attributions.push(splitSentences(original[i-1]?.text ?? '').at(-1)?.trim() ?? '');
  }
  let index = 0;
  let clause = '', wrappedClause = '';
  const parts = spans(template,script);
  for (const [partIndex, span] of parts.entries()) {
    if (!span.quoted) {
      const sentences = splitSentences(span.text);
      wrappedClause = span.text.trimEnd().split(/[.!?](?=\s|$)/u).at(-1)?.trim() ?? '';
      clause = nativeDialogue && parts[partIndex+1]?.quoted ? sentences.pop() ?? '' : '';
      for (const sentence of sentences) {
        const text = sentence.trim();
        if (approvedDirections.has(text)) continue;
        if (changesCastBinding(text,cast))
          throw new Error('scene_dialogue_speaker: preserve cast declarations, use cast names for interactions and keep voice directions with their turn');
        if (nativeDialogue && assignsSpokenTurn(text,cast))
          throw new Error('scene_dialogue_mismatch: put every spoken line in quotes with its approved speaker');
      }
      continue;
    }
    if (!nativeDialogue) continue;
    const words = span.text.slice(1,-1);
    // Limit attribution to this sentence. A period inside a named slot is part of the identifier.
    const visual = visualQuotes.indexOf(words);
    if (visual >= 0 && !/(?:[:,]\s*$|\b(?:says|asks|replies|whispers|speaks)\b)/iu.test(clause)) {
      visualQuotes.splice(visual,1);
      continue;
    }
    const line = expected[index++];
    if (!line || line.tts !== words)
      throw new Error('scene_dialogue_mismatch: keep exactly the approved spoken lines in scene order');
    if (line.speaker && clause.trim() !== attributions[index - 1] && !ownsEditedTurn(clause,line.speaker,cast) &&
        (wrappedClause === clause.trim() || !ownsEditedTurn(wrappedClause,line.speaker,cast)))
      throw new Error('scene_dialogue_speaker: introduce the quote directly with its approved speaker. Put complex blocking in a preceding sentence');
  }
  if (nativeDialogue && index !== expected.length)
    throw new Error('scene_dialogue_mismatch: preserve each approved spoken line verbatim in quotes');
}
