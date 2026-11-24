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
// A spoken line sits inside quotation marks on one line, so a stray mark cannot swallow the lines after it.
const QUOTED = /"[^"\n]*"|“[^”\n]*”|「[^」\n]*」/g;
/** The text outside and inside quotation marks, in order. */
const spans = (text: string) => {
  const parts: {text: string; quoted: boolean}[] = [];
  let at = 0;
  for (const quote of text.matchAll(QUOTED)) {
    parts.push({text: text.slice(at, quote.index), quoted: false}, {text: quote[0], quoted: true});
    at = quote.index! + quote[0].length;
  }
  return [...parts, {text: text.slice(at), quoted: false}];
};
const loneBrace = (text: string) => /[{}]/.test(text.replace(TOKEN, ''));

const word = (text: string) => text.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');

/** Name every numbered input of the final request. `unlabeled` lists pictures a prompt cannot point at. */
export function scenePromptSlots(style: ScenePromptProfile['referenceLabels'], images: readonly PromptImage[] = [], voices: readonly SlotVoice[] = []) {
  const slots: PromptSlot[] = [], unlabeled = new Set<string>();
  const owned = new Map<string, {role: string; label: string}[]>();
  for (const image of images) {
    // Only the reference list is numbered in a prompt. A start, end or timed frame has no label.
    if (image.number === undefined) { if (image.shotId && (image.guide || !image.owner)) unlabeled.add(word(image.shotId) + '.image'); continue; }
    const label = formatReferenceLabel(style, 'image', image.number);
    if (image.owner) owned.set(image.owner, [...owned.get(image.owner) ?? [], {role: word(image.role ?? '') || 'image', label}]);
    else slots.push({key: word((image.guide ? image.shotId : undefined) ?? image.id ?? 'reference' + image.number) + '.image', label});
  }
  for (const [owner, rows] of owned) {
    const seen = new Map<string, number>();
    for (const row of rows) {
      const count = (seen.get(row.role) ?? 0) + 1;
      seen.set(row.role, count);
      slots.push({key: word(owner) + '.' + row.role + (count > 1 ? count : ''), label: row.label});
    }
    // The short name is unambiguous only for a single picture, and it never takes the name of a shot's own picture.
    if (rows.length === 1 && rows[0].role !== 'image' && !unlabeled.has(word(owner) + '.image')) slots.push({key: word(owner) + '.image', label: rows[0].label});
  }
  for (const voice of voices) if (voice.audioIndex) slots.push({key: word(voice.speaker) + '.voice', label: formatReferenceLabel(style, 'audio', voice.audioIndex)});
  // Two inputs that would share a name keep the first, and a name a placeholder cannot spell is not offered;
  // such an input stays a number in the template.
  const keys = new Set<string>();
  return {slots: slots.filter(slot => NAME.test('{' + slot.key + '}') && !keys.has(slot.key) && keys.add(slot.key)),
    unlabeled: [...unlabeled].filter(key => !keys.has(key))};
}

/**
 * Fill the names of an authored prompt with the numbers of the submitted request. Problems are reported; no
 * sentence is reworded or shortened. `composed` is the planner's own prompt for the same request: a line, a
 * sentence or a brace it carries is the board's text, which calibrates what is reported and what is left alone.
 */
export function resolveScenePrompt(template: string, {slots, unlabeled}: ReturnType<typeof scenePromptSlots>,
  checks: {composed?: string; lines?: readonly string[]; sentences?: readonly {code: string; text: string}[];
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
  const body = spans(template).map(span => {
    // A number inside a spoken line is speech. Outside one it is a reference typed by hand.
    if (!span.quoted) for (const [label, key] of named) if (labelPattern(label).test(span.text))
      report('warning', 'label_literal', `"${label}" is written as a number; write {${key}} so it follows the submitted order`);
    return span.text.replace(TOKEN, token => {
      const name = NAME.exec(token), key = name ? name[1] + '.' + name[2] : '', label = labels.get(key);
      // Braces the board itself uses stay as written: always inside a spoken line, elsewhere unless they spell a submitted reference.
      if (board.has(token) && (span.quoted || !label)) return token;
      if (label) return label;
      if (unlabeled.includes(key)) report('error', 'placeholder_unlabeled', `${token} is sent as a timed frame, which this model's prompt cannot name`);
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
export function scenePromptTemplate(prompt: string, {slots}: Pick<ReturnType<typeof scenePromptSlots>, 'slots'>, header = '') {
  const names = new Map<string, string>();
  // A character's single picture has two names; the role name is the one that stays valid when a second picture is added.
  for (const slot of slots) if (!names.has(slot.label)) names.set(slot.label, slot.key);
  const headed = Boolean(header) && prompt.startsWith(header);
  const longestFirst = [...names].sort((a, b) => b[0].length - a[0].length);
  // A spoken line keeps its words, so a number inside quotation marks is never turned into a name.
  const promptTemplate = spans(headed ? prompt.slice(header.length) : prompt).map(span => span.quoted ? span.text
    : longestFirst.reduce((text, [label, key]) => text.replace(labelPattern(label), '{' + key + '}'), span.text)).join('');
  return {promptTemplate, ...(headed ? {promptHeader: header} : {})};
}

/** Compare explicit dialogue turns. Only a voice token in a direct attribution establishes ownership. */
export function assertSceneDialogue(template: string, expected: readonly {speaker?: string; tts?: string}[]): void {
  if (!expected.length) return;
  const wanted = new Set(expected.map(line => line.tts));
  let index = 0;
  let lead = '';
  for (const span of spans(template)) {
    if (!span.quoted) { lead = span.text; continue; }
    const words = span.text.slice(1,-1);
    if (!wanted.has(words)) continue;
    const line = expected[index++];
    if (line?.tts !== words)
      throw new Error('scene_dialogue_mismatch: preserve the approved spoken lines in scene order');
    // An adjacent "with {cast.voice}:" or "({cast.face}, {cast.voice}):" is unambiguous.
    const voice = lead.match(/\{([\p{L}\p{N}_-]+)\.voice\}\s*(?:,\s*off screen)?\)?\s*:\s*$/u);
    if (voice && line.speaker && voice[1] !== line.speaker)
      throw new Error('scene_dialogue_speaker: the voice immediately introducing this line belongs to another character');
  }
  if (index !== expected.length)
    throw new Error('scene_dialogue_mismatch: preserve each approved spoken line verbatim in quotes');
}
