/** A storyboard scene as one request of the GenAI gateway's common scene mode
 * (`POST /v1/generations` with `kind:"video"`, `mode:"scene"`).
 *
 * The planner composes a scene's one prompt with numbered references, the way LTX MSR reads them. This module
 * holds the scene adapter's arguments, turns a composed request into them and builds the common body: the cast
 * and references the numbers point at, the shots in order, and the prompt with every number written as a
 * placeholder. The gateway numbers the placeholders itself and adds no sentence. `resolveScenePrompt` predicts
 * its numbering, and `/v1/generations/validate` confirms it before approval and again before submission
 * (user directive 2026-11-25). */
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import sceneLimits from '../../skills/_shared/genai-scene-limits.json' with { type: 'json' };
import path from 'node:path';
import { bareFilenameSchema } from './media-utils.js';
import { scenePromptTemplate } from './scene-prompt.js';
/** Models the gateway runs in scene mode that this plugin plans for. */
export const GENAI_SCENE_MODELS = ['ltx-2.5-22b-distilled'];
/** LTX renders 8k+1 frames in 25..361. A scene renders the next count up and the extra frames belong to its last shot. */
export const GENAI_SCENE_FRAMES = { min: 25, max: 361, step: 8 };
export const genaiSceneFrames = (frames) => Math.max(GENAI_SCENE_FRAMES.min, GENAI_SCENE_FRAMES.step * Math.ceil((frames - 1) / GENAI_SCENE_FRAMES.step) + 1);
/** LTX MSR slots: four subjects, one background, and a voice on subjects 1 and 2. */
const LIMITS = { subjects: 4, backgrounds: 1, voices: 2 };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Use 1-64 characters of A-Z, a-z, 0-9, _ and -');
const role = id.refine(value => !['voice', 'image'].includes(value), 'voice and image name other inputs');
const file = z.string().min(1);
const resolution = z.string().regex(/^[1-9]\d*x[1-9]\d*$/).refine(value => {
    const [w, h] = value.split('x').map(Number), width = Math.ceil(w / 64) * 64, height = Math.ceil(h / 64) * 64;
    return Math.min(w, h) >= 64 && w % 2 === 0 && h % 2 === 0 && Math.max(width, height) <= 1920 && width * height <= 2064384;
}, 'Use even WIDTHxHEIGHT sides of at least 64; rounded-up /64 sides must fit 1920 and 2,064,384 pixels');
export const genaiSceneSchema = z.object({
    model: z.enum(GENAI_SCENE_MODELS),
    prompt: z.string().min(1).max(16000).describe('The whole scene in one prompt. Name inputs with placeholders: {cast.role}, ' +
        '{cast.image} for a cast member with one picture, {cast.voice} and {reference.image}; write {{ and }} for literal braces. The gateway numbers them.'),
    cast: z.array(z.object({
        id, images: z.array(z.object({ role, imagePath: file }).strict()).min(1).max(sceneLimits.maxCharacterImages),
        voicePath: file.optional().describe('Pinned voice sample; it rides on the member\'s first picture.'),
    }).strict()).max(sceneLimits.maxReferencedCharacters, 'scene_cast_exceeded: split scenes with more than two referenced people').default([]),
    references: z.array(z.object({ id, role: z.enum(['background', 'object']), imagePath: file }).strict()).max(9).default([]),
    shots: z.array(z.object({
        id, frames: z.number().int().positive(),
        imagePath: file.optional().describe('The picture the shot opens on. The first is the opening frame; a later one guides the model.'),
        strength: z.number().min(0).max(1).optional(),
    }).strict()).min(1).max(8),
    resolution, fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
    seed: z.number().int().min(0).max(2147483647).optional(),
    generateAudio: z.boolean().default(true).describe('false removes the generated soundtrack from the delivered clip.'),
    reserveUsd: z.number().finite().nonnegative(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use an .mp4 filename').optional(),
}).strict().superRefine((args, ctx) => {
    const issue = (message) => ctx.addIssue({ code: 'custom', message });
    const ids = [...args.cast.map(m => m.id), ...args.references.map(r => r.id), ...args.shots.map(s => s.id)];
    if (new Set(ids).size !== ids.length)
        issue('Cast, reference and shot IDs share one namespace and must be distinct');
    for (const member of args.cast)
        if (new Set(member.images.map(i => i.role)).size !== member.images.length)
            issue(member.id + ': picture roles must be distinct');
    const pictures = args.cast.reduce((n, m) => n + m.images.length, 0);
    if (pictures > sceneLimits.maxCharacterImages)
        issue('scene_character_image_limit: select at most two character pictures across the scene; use one per person for a pair');
    const subjects = pictures + args.references.filter(r => r.role === 'object').length;
    if (subjects < 1 || subjects > LIMITS.subjects)
        issue(`LTX scene mode takes 1..${LIMITS.subjects} cast pictures and object references`);
    if (args.references.filter(r => r.role === 'background').length > LIMITS.backgrounds)
        issue('LTX scene mode takes one background');
    if (args.cast.filter(m => m.voicePath).length > LIMITS.voices)
        issue(`LTX scene mode takes ${LIMITS.voices} voices`);
    if (genaiSceneFrames(sceneFrames(args)) > GENAI_SCENE_FRAMES.max)
        issue(`The scene runs past ${GENAI_SCENE_FRAMES.max} frames`);
});
/** LTX scene mode reads a voice sample after it reserves the job, so a sample it would refuse fails a reserved job. Check first. */
export const GENAI_SCENE_VOICE_SECONDS = 10;
export function checkSceneVoices(args) {
    for (const member of args.cast) {
        if (!member.voicePath)
            continue;
        let seconds = NaN;
        // Only a local regular file is probed, named with the file: protocol so ffprobe reads no other scheme.
        const local = path.resolve(member.voicePath);
        try {
            if (statSync(local).isFile())
                seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'file:' + local], { encoding: 'utf8', timeout: 15_000 }));
        }
        catch { /* An unreadable sample is refused below. */ }
        if (!(seconds > 0))
            throw new Error('scene_voice_unreadable: ' + member.id + '\'s voice sample cannot be read');
        if (seconds > GENAI_SCENE_VOICE_SECONDS)
            throw new Error(`scene_voice_too_long: ${member.id}'s voice sample runs ${seconds.toFixed(1)} s; GenAI scene mode takes at most ${GENAI_SCENE_VOICE_SECONDS} s and conditions on the first 5`);
    }
}
/** The frames the storyboard asks for; the clip is cut back to this after rendering. */
export const sceneFrames = (args) => args.shots.reduce((sum, shot) => sum + shot.frames, 0);
/** How the gateway numbers a scene on LTX: voiced subjects first, then the other subjects in cast order, then the background. */
export function sceneLabels(args) {
    const subjects = [];
    for (const member of args.cast)
        member.images.forEach((image, index) => subjects.push({ key: member.id + '.' + image.role, ...(index === 0 && member.voicePath ? { voice: member.id + '.voice' } : {}) }));
    for (const ref of args.references)
        if (ref.role === 'object')
            subjects.push({ key: ref.id + '.image' });
    const ordered = [...subjects.filter(s => s.voice), ...subjects.filter(s => !s.voice),
        ...args.references.filter(r => r.role === 'background').map(r => ({ key: r.id + '.image' }))];
    const labels = {};
    ordered.forEach((slot, index) => {
        labels[slot.key] = 'Image ' + (index + 1);
        if (slot.voice)
            labels[slot.voice] = 'Audio ' + (index + 1);
    });
    for (const member of args.cast)
        if (member.images.length === 1)
            labels[member.id + '.image'] = labels[member.id + '.' + member.images[0].role];
    return labels;
}
/** The prompt as the model reads it: each placeholder replaced with the gateway's label, `{{`/`}}` read as braces. */
export function resolveScenePrompt(prompt, labels) {
    return prompt.replace(/\{\{|\}\}|\{([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\}|[{}]/g, (token, key) => {
        if (token === '{{' || token === '}}')
            return token[0];
        if (key && labels[key])
            return labels[key];
        throw new Error('placeholder_unresolved: ' + token + ' names no input of this scene');
    });
}
/** The common body. `uri` turns a local file into the URI the request carries. */
export function genaiSceneBody(args, uri) {
    const [width, height] = args.resolution.split('x').map(Number);
    return {
        kind: 'video', model: args.model, mode: 'scene',
        input: {
            prompt: args.prompt,
            cast: args.cast.map(member => ({ id: member.id, images: member.images.map(image => ({ role: image.role, uri: uri(image.imagePath, 'image') })),
                ...(member.voicePath ? { voice: { uri: uri(member.voicePath, 'audio') } } : {}) })),
            references: args.references.map(ref => ({ id: ref.id, role: ref.role, uri: uri(ref.imagePath, 'image') })),
            shots: args.shots.map(shot => ({ id: shot.id, seconds: shot.frames / args.fps,
                ...(shot.imagePath ? { image: { uri: uri(shot.imagePath, 'image'), ...(shot.strength === undefined ? {} : { strength: shot.strength }) } } : {}) })),
        },
        parameters: { width, height, fps: args.fps, ...(args.seed === undefined ? {} : { seed: args.seed }) },
    };
}
/** `POST /v1/generations/validate`: what the gateway compiles the scene to. */
export const sceneValidationSchema = z.object({
    resolved: z.object({ num_frames: z.number().int(), prompt: z.string(), labels: z.record(z.string()),
        shots: z.array(z.object({ id: z.string(), start_frame: z.number().int() }).passthrough()) }).passthrough(),
    warnings: z.array(z.object({ code: z.string() }).passthrough()).default([]),
});
/** Refuse a compilation that differs from the plan: other labels, another clip length or other cut frames. */
export function checkSceneValidation(args, result) {
    const { resolved, warnings } = sceneValidationSchema.parse(result);
    const expected = resolveScenePrompt(args.prompt, sceneLabels(args));
    let start = 0;
    const starts = args.shots.map(shot => { const at = start; start += shot.frames; return { id: shot.id, start_frame: at }; });
    if (resolved.prompt !== expected)
        throw new Error('genai_scene_labels: the gateway numbers this scene differently from the plan');
    if (resolved.num_frames !== genaiSceneFrames(sceneFrames(args)))
        throw new Error('genai_scene_frames: the gateway renders ' + resolved.num_frames + ' frames; the plan expects ' + genaiSceneFrames(sceneFrames(args)));
    if (JSON.stringify(resolved.shots.map(s => ({ id: s.id, start_frame: s.start_frame }))) !== JSON.stringify(starts))
        throw new Error('genai_scene_cuts: the gateway places the shots at other frames than the plan');
    return { prompt: resolved.prompt, numFrames: resolved.num_frames, labels: resolved.labels, warnings };
}
/** Turn the planner's numbered request into scene arguments. The numbers become placeholders named after the
 * cast member and picture role they point at, so the request no longer depends on the order it was composed in. */
export function sceneArgsFromComposed(composed) {
    const keyOf = (label) => composed.slots.find(slot => slot.label === label)?.key;
    const shotIds = new Set(composed.shots.map(shot => shot.id));
    const cast = new Map();
    const references = [];
    const rename = [];
    // Cast, reference and shot IDs share one namespace, and a shot's composition guide is named after its shot.
    const taken = (name) => shotIds.has(name) || cast.has(name) || references.some(ref => ref.id === name);
    const free = (name) => {
        if (!taken(name))
            return name;
        for (let n = 1;; n++)
            if (!taken(name + '-ref' + n))
                return name + '-ref' + n;
    };
    composed.references.forEach((ref, index) => {
        const label = 'Image ' + (index + 1), key = keyOf(label);
        if (!ref.imagePath)
            throw new Error('genai_scene_reference: reference ' + (index + 1) + ' has no local picture');
        const [owner, part] = key ? key.split('.') : ['reference' + (index + 1), 'image'];
        if (ref.background || ref.nonCharacter || !key) {
            const refId = free(owner);
            references.push({ id: refId, role: ref.background ? 'background' : 'object', imagePath: ref.imagePath });
            rename.push({ label, key: refId + '.image' });
            return;
        }
        const member = cast.get(owner) ?? { id: owner, images: [] };
        // `image` names a single picture in scene mode, so a legacy picture without a role is called `picture`.
        const pictureRole = part === 'image' ? 'picture' : part;
        member.images.push({ role: pictureRole, imagePath: ref.imagePath, voiced: Boolean(ref.audioPath) });
        if (ref.audioPath) {
            if (member.voicePath && member.voicePath !== ref.audioPath)
                throw new Error('genai_scene_voice: ' + owner + ' carries two voice samples');
            member.voicePath = ref.audioPath;
            rename.push({ label: 'Audio ' + (index + 1), key: owner + '.voice' });
        }
        cast.set(owner, member);
        rename.push({ label, key: owner + '.' + pictureRole });
    });
    // The voice rides on a member's first picture.
    const members = [...cast.values()].map(member => ({ id: member.id,
        images: [...member.images.filter(i => i.voiced), ...member.images.filter(i => !i.voiced)].map(({ role, imagePath }) => ({ role, imagePath })),
        ...(member.voicePath ? { voicePath: member.voicePath } : {}) }));
    const escaped = composed.prompt.replace(/[{}]/g, brace => brace + brace);
    let prompt = scenePromptTemplate(escaped, { slots: rename }, '', composed.script).promptTemplate;
    const opening = composed.shots[0]?.imagePath;
    if (!members.length && !references.some(ref => ref.role === 'object')) {
        // LTX scene mode needs a subject. A scene without a cast gives its opening picture as one (user's choice, 2026-11-25).
        if (!opening)
            throw new Error('genai_scene_subject: a scene without a cast picture needs an opening image');
        const refId = free('opening');
        references.push({ id: refId, role: 'object', imagePath: opening });
        prompt = '{' + refId + '.image}: the place and objects of the opening view.\n' + prompt;
    }
    return { prompt, cast: members, references, shots: composed.shots.map(shot => ({ ...shot })), keys: rename };
}
