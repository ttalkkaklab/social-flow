import { hasSubjectInput } from './video-image-inputs.js';
import { fasth3VideoAudioCount } from './fasth3-omni.js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { VIDEO_ADAPTERS, VENDOR_REFERENCE_TOOLS, requiredCharacters, referenceLabel } from './video-registry.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import { sceneVoiceDirection } from './video-prompt.js';
import { z } from 'zod';
/** Authored screen coordinates describe the opening image, never reference-array order. */
export const speakerBindingSchema = z.object({
    speaker: z.string().trim().min(1),
    screenPosition: z.enum(['left', 'center', 'right']),
    description: z.string().trim().min(1),
}).strict();
const load = createRequire(import.meta.url);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => typeof value === 'string' ? value.trim() : '';
const stable = (value) => Array.isArray(value) ? value.map(stable) :
    value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])) : value;
const hash = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const fileHash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
/** Reuse authored acoustic traits; never infer a voice from a name, face or TTS ID. */
function voiceDescription(character) {
    const tts = object(character.tts), speech = object(object(character.character).speech);
    const confirmed = (key) => {
        const field = object(speech[key]);
        return field.status === 'confirmed' ? text(field.value) : '';
    };
    return [text(tts.language) && `Language: ${text(tts.language)}`,
        confirmed('timbre') && `Timbre: ${confirmed('timbre')}`,
        confirmed('pace') && `Baseline pace: ${confirmed('pace')}`,
        confirmed('accent') && `Accent: ${confirmed('accent')}`,
        text(tts.voiceDirection) || text(tts.stylePrompt)].filter(Boolean).join('. ');
}
/** The same cast handoff and sample bytes are used when an archived scene reaches assembly. */
export function resolveCharacterVoice(character, context, warnings) {
    return load('../../skills/_shared/scene-voice.js').resolveCharacterVoice(character, path.join(context.episode, 'storyboard'), context.shot, warnings);
}
export function voiceReference(character, context, warnings) {
    return load('../../skills/_shared/scene-voice.js').voiceReference(character, path.join(context.episode, 'storyboard'), warnings);
}
export function currentSceneVoice(board, boardDir, shot, id, warnings) {
    return load('../../skills/_shared/scene-voice.js').currentSceneVoice(board, boardDir, shot, id, warnings);
}
/**
 * Find the MSR subject that shows a speaker from voiceReference.imagePaths. MSR pairs
 * audio_refN with picN for the first two subjects, so the owned picture decides the slot;
 * references are never reordered because the prompt already numbers the images.
 */
function msrSubject(character, refs, context) {
    const owned = object(character.voiceReference).imagePaths;
    let ownedPaths;
    const declared = [].concat(object(context.shot.visual).character ?? [])
        .map(entry => typeof entry === 'string' ? entry : text(object(entry).id));
    const visualReferences = object(context.shot.visual).references;
    const sceneFace = Array.isArray(visualReferences) && visualReferences.some(ref => ref.scope === 'scene' && ref.character === character.id);
    if (sceneFace || requiredCharacters(context.shot).some(person => person.character === character.id)) {
        ownedPaths = owned.map(file => realpathSync(path.resolve(context.episode, 'storyboard', file)));
    }
    else if ((declared.includes(text(character.id)) || context.sceneDirection?.openingPositions.some(p => p.character === character.id && p.images.length)) && existsSync(path.join(context.episode, 'storyboard', 'cast.json'))) {
        const { sheetPanels, canonicalReferences } = load('../../skills/channel/references/character-panels.js');
        const dir = path.join(context.episode, 'storyboard');
        // Planning rebuilt these references from this same registered owner; transport aliases no longer identify the slot.
        const panels = sheetPanels(dir, [text(character.id)]).get(text(character.id));
        const combined = object(object(context.shot.visual).video).referenceLayout === 'combined';
        const files = combined
            ? canonicalReferences(dir, text(context.shot.id), [text(character.id)], 'video', { combined: true }).map(ref => ref.path)
            : Object.values(panels);
        ownedPaths = files.map(file => realpathSync(path.resolve(dir, file)));
    }
    else
        ownedPaths = Array.isArray(owned) ? owned.map(value => realpathSync(path.resolve(context.episode, 'storyboard', String(value)))) : [];
    let subject = 0, index = -1, slot = 0;
    refs.forEach((ref, i) => {
        if (ref.background)
            return;
        subject += 1;
        const file = text(ref.imagePath);
        if (index < 0 && file && ownedPaths.includes(realpathSync(path.resolve(context.episode, file)))) {
            index = i;
            slot = subject;
        }
    });
    return { index, slot };
}
/** Seconds of a voice sample, or undefined when ffprobe cannot read it. */
export function sampleSeconds(file) {
    try {
        const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 15_000 }));
        return Number.isFinite(seconds) ? seconds : undefined;
    }
    catch {
        return undefined;
    }
}
/** The model card's layout puts the reference descriptions first: Audio lines follow the Image lines. */
function afterImageBlock(prompt, lines) {
    const rows = prompt.split('\n');
    let k = 0;
    while (k < rows.length && /^Image \d+[:( ]/.test(rows[k]))
        k += 1;
    rows.splice(k, 0, ...lines);
    return rows.join('\n');
}
/** Prepare provider arguments before schema validation and pricing. No synthesis or uploads. */
export function prepareVideoVoice(tool, input, context) {
    const args = { ...input };
    const ordered = load('../../skills/storyboard/references/scene-direction.js').orderedSpeech;
    const lines = ordered(context.shot).map(object).filter(line => text(line.tts));
    const pinnedMsr = tool === 'astra_genai_img2video' && args.generateAudio !== false &&
        hasSubjectInput(args.references) && lines.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen');
    if (pinnedMsr && lines.some(line => line.delivery === 'voiceover'))
        throw new Error('msr_speech_route: split physical dialogue and inner thoughts into separate shots');
    const msr = tool === 'astra_genai_msr' || pinnedMsr;
    // The hosted reference lanes speak the shot's dialogue from the prompt as MSR does (reference-frame prompts carry no lines).
    const vendor = VENDOR_REFERENCE_TOOLS.includes(tool);
    // MSR renders authored physical dialogue into its own soundtrack; a pinned sample, when the
    // gateway takes one, sets the timbre (user directive 2026-10-31). A cut without dialogue is fine.
    if (msr) {
        if (object(context.shot.visual).video && object(object(context.shot.visual).video).voice !== undefined)
            throw new Error('visual.video.voice is retired: MSR uses the speaker\'s voice sample when one is pinned');
    }
    if (!lines.length)
        return { args };
    const doc = object(context.board.SB_DOC), raw = doc.characters;
    const characters = Array.isArray(raw) ? raw.map(object) : Object.entries(object(raw)).map(([id, value]) => ({ ...object(value), id }));
    const visual = object(context.shot.visual);
    const seedanceDialogue = tool === 'seedance_reference' && lines.some(line => ['on_screen', 'off_screen'].includes(String(line.delivery)));
    const nativeSlot = seedanceDialogue || Boolean(visual.clip) || context.shot.type === 'broll';
    // FastH3 and HeyGen always render a soundtrack; MiniMax does unless generateAudio is false.
    const audible = msr || ((tool !== 'astra_genai_desktop_keyframes' || args.audio === true) && (tool === 'fasth3_omni_reference' || tool.startsWith('heygen_') ||
        (tool.startsWith('astra_') || tool.startsWith('minimax_') ? args.generateAudio !== false : args.generateAudio === true)));
    const lane = msr ? 'reference' : VIDEO_ADAPTERS[tool]?.voice ?? 'none';
    const supplied = lane === 'supplied';
    const onScreen = lines.some(line => line.delivery === 'on_screen');
    const sceneDialogue = context.sceneDirection && lines.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen');
    const nativeAudioRequested = !supplied && audible && (msr || vendor || nativeSlot || onScreen || Boolean(sceneDialogue));
    const native = nativeAudioRequested && lines.some(line => line.delivery !== 'voiceover');
    // Voice gate (owner directive 2026-10-31): a character the viewer hears or sees speak needs a voice
    // lane. An adapter without one renders only cuts whose lines are external TTS over a non-speaking picture.
    if (!context.modelVoice && lane === 'none' && (nativeAudioRequested || onScreen))
        throw new Error(`voice_lane_required: ${tool} cannot keep a character's voice. Render this spoken cut with a reference adapter ` +
            `(astra_genai_msr, seedance_reference, fasth3_omni_reference, minimax_reference, heygen_reference) or an audio2video adapter${onScreen ? '' : ', or set generateAudio:false and keep the lines as TTS voiceover'}.`);
    const reference = native && lane === 'reference';
    const strategy = context.modelVoice ? 'model_generated' : supplied ? 'supplied_audio' : reference ? 'reference_voice' : 'external_tts';
    const warnings = [];
    const speakers = [];
    const physicalLines = lines.filter(line => line.delivery !== 'voiceover');
    const nativeLines = msr || vendor || nativeSlot || sceneDialogue ? physicalLines : physicalLines.filter(line => line.delivery === 'on_screen');
    const ids = [...new Set((native ? nativeLines : lines).map(line => text(line.speaker) || text(doc.narratorCharacterId)))];
    const prompt = [];
    const audioOffset = tool === 'fasth3_omni_reference' && Array.isArray(args.referenceVideoPaths)
        ? fasth3VideoAudioCount(args.referenceVideoPaths.map(file => path.resolve(context.episode, String(file)))) : 0;
    const audioPaths = Array.isArray(args.referenceAudioPaths) ? args.referenceAudioPaths.map(value => realpathSync(path.resolve(context.episode, String(value)))) : [];
    const imagePaths = Array.isArray(args.referenceImagePaths) ? args.referenceImagePaths.map(value => realpathSync(path.resolve(context.episode, String(value)))) : [];
    const msrRefs = msr && Array.isArray(args.references) ? args.references.map(ref => ({ ...object(ref) })) : [];
    const msrAudio = [];
    const screenBindings = msr ? z.array(speakerBindingSchema).max(2).parse(object(visual.video).speakerBindings ?? []) : [];
    if (new Set(screenBindings.map(binding => binding.speaker)).size !== screenBindings.length)
        throw new Error('video_speaker_binding_invalid: each speaker needs one screen binding');
    for (const binding of screenBindings) {
        if (!characters.some(character => character.id === binding.speaker) || nonEnglishOutsideQuotes(binding.description))
            throw new Error('video_speaker_binding_invalid: use a cast id and an English appearance description');
    }
    const visibleSpeakers = [...new Set(nativeLines.filter(line => line.delivery === 'on_screen').map(line => text(line.speaker)))];
    if (msr && context.sceneDirection && visibleSpeakers.some(id => !context.sceneDirection.openingPositions.some(p => p.character === id)))
        throw new Error('openingPositions: describe each speaker in the scene opening');
    if (msr && !context.sceneDirection && visibleSpeakers.length > 1 && visibleSpeakers.some(id => !screenBindings.some(binding => binding.speaker === id)))
        throw new Error('video_speaker_binding_required: set shot_prompt speakerBindings from the start image for every on-screen speaker; left/right mean the viewer\'s left/right, not Image 1/Image 2');
    if (msr && !context.sceneDirection && visibleSpeakers.length > 1 && new Set(screenBindings.filter(binding => visibleSpeakers.includes(binding.speaker)).map(binding => binding.screenPosition)).size !== visibleSpeakers.length)
        throw new Error('video_speaker_binding_invalid: on-screen speakers need distinct screen positions');
    if (msr && screenBindings.length) {
        const start = text(object(visual.frames).start), expected = text(object(visual.video).speakerBindingImageSha256);
        if (expected && (!start || fileHash(path.resolve(context.episode, 'storyboard', start)) !== expected))
            throw new Error('video_speaker_binding_stale: the start image changed; inspect its positions and rewrite shot_prompt speakerBindings');
    }
    for (const id of ids) {
        const matches = characters.filter(character => character.id === id);
        if (!id || matches.length !== 1) {
            warnings.push(`Missing unique storyboard character for speaker ${id || '(unspecified)'}; no voice was invented.`);
            continue;
        }
        const character = resolveCharacterVoice(matches[0], context, warnings);
        if (!context.modelVoice && !Object.keys(object(character.tts)).length) {
            warnings.push(`${id}: no pinned TTS settings in the storyboard or character identity; voice samples were not resolved.`);
            continue;
        }
        const speaker = { speaker: id, name: text(character.name) || id, tts: object(character.tts), description: voiceDescription(character) };
        const screenBinding = screenBindings.find(binding => binding.speaker === id);
        if (screenBinding)
            speaker.screenBinding = screenBinding;
        // Video prompts are English: a non-Latin cast name falls back to the character id
        const label = nonEnglishOutsideQuotes(speaker.name) ? id : speaker.name;
        if (reference && msr) {
            // A pinned sample rides on subject 1 or 2 when the gateway takes samples; otherwise the prompt voices the speaker.
            const { index, slot } = msrSubject(character, msrRefs, context);
            if (index >= 0)
                speaker.imageIndices = [slot];
            speaker.reference = voiceReference(character, context, warnings);
            const current = index < 0 ? '' : text(msrRefs[index].audioPath);
            const problem = !speaker.reference ? 'no pinned voice sample'
                : context.msrVoice !== true ? 'the GenAI scene mode lists no voice samples for this model (GET /v1/models)'
                    : index < 0 ? 'no MSR subject image matches voiceReference.imagePaths'
                        : slot > 2 ? `MSR subject ${slot} takes no sample; only subjects 1 and 2 do`
                            : current && current !== speaker.reference.path ? `Image ${slot} already carries another speaker's sample` : '';
            if (problem) {
                warnings.push(`${id}: ${problem}; MSR voices this speaker from the prompt.`);
                delete speaker.reference;
            }
            else {
                msrRefs[index].audioPath = speaker.reference.path;
                speaker.audioIndex = slot;
                msrAudio.push(`Audio ${slot}: ${label}'s voice, belongs only to Image ${slot}.`);
                const seconds = sampleSeconds(speaker.reference.path);
                if (seconds !== undefined && seconds > 10)
                    throw new Error(id + ': MSR voice samples must be at most 10 seconds');
                if (seconds !== undefined && seconds > 5)
                    warnings.push(`${id}: the voice sample runs ${seconds.toFixed(1)} s; MSR conditions on the first 5 seconds and cuts the rest.`);
            }
        }
        else if (reference) {
            speaker.reference = voiceReference(character, context, warnings);
            if (speaker.reference) {
                let index = audioPaths.indexOf(speaker.reference.path);
                if (index < 0) {
                    index = audioPaths.length;
                    audioPaths.push(speaker.reference.path);
                }
                speaker.audioIndex = index + 1 + audioOffset;
                // Only map images with explicit ownership, never guess from array position.
                const owned = object(character.voiceReference).imagePaths;
                const ownedPaths = Array.isArray(owned) ? owned.map(value => realpathSync(path.resolve(context.episode, 'storyboard', String(value)))) : [];
                speaker.imageIndices = imagePaths.flatMap((file, i) => ownedPaths.includes(file) ? [i + 1] : []);
                if (imagePaths.length && !speaker.imageIndices.length)
                    warnings.push(`${id}: no explicit image ownership matched the request; add voiceReference.imagePaths to bind this speaker to the correct Image N.`);
                const images = speaker.imageIndices.map(i => referenceLabel(tool, 'image', i, args.model)).join(', ');
                const audioLabel = referenceLabel(tool, 'audio', speaker.audioIndex, args.model);
                prompt.push(`${label} (speaker ${id})${images ? `, shown in ${images},` : ''} uses ${audioLabel} for voice timbre${tool === 'fasth3_omni_reference' ? '' : ' and accent'} only. Speak the authored shot dialogue, not the sample's words.`);
            }
            else
                warnings.push(`${id}: no pinned voice sample available; reference-voice consistency is not established. Supply character.voiceReference before relying on this voice.`);
        }
        speakers.push(speaker);
        if (native && speaker.description && !((msr || tool === 'fasth3_omni_reference') && speaker.audioIndex)) {
            if (nonEnglishOutsideQuotes(speaker.description))
                warnings.push(`${id}: supply an English translation of the pinned acoustic description in the authored prompt; video prompts are English only. The original description stays in this plan.`);
            else
                prompt.push(`Stable voice for ${label} (speaker ${id}): ${speaker.description}`);
        }
        if (native && !context.modelVoice && !text(object(character.tts).voiceDirection) && !text(object(character.tts).stylePrompt) && !text(object(object(object(character.character).speech).timbre).value))
            warnings.push(`${id}: no authored acoustic description; the TTS voice ID is not a video-model voice selector.`);
    }
    if (reference && tool === 'fasth3_omni_reference' && !context.modelVoice) {
        for (const line of nativeLines) {
            const id = text(line.speaker) || text(doc.narratorCharacterId);
            const speaker = speakers.find(row => row.speaker === id);
            if (!speaker?.audioIndex || (line.delivery === 'on_screen' && !speaker.imageIndices?.length))
                throw new Error('character_voice_required: FastH3 needs a pinned sample and an owned face for each visible speaker: ' + id);
        }
    }
    /** Every turn with its speaker's picture and sample, in order; the prompt holds the only copy of each line. */
    const turnScript = () => {
        const img = (n) => referenceLabel(tool, 'image', n, args.model), aud = (n) => referenceLabel(tool, 'audio', n, args.model);
        // Narration is the only script authority. A substring cannot establish speaker ownership or turn order.
        const quoted = [...String(args.prompt).matchAll(/"([^"]*)"|“([^”]*)”|「([^」]*)」/g)].map(match => match[1] ?? match[2] ?? match[3]);
        // Older Seedance boards sometimes store the whole script in the provider prompt.
        // Keep it when every authored turn is already quoted once and in order.
        if (tool === 'seedance_reference') {
            const authored = nativeLines.map(line => text(line.tts));
            const embedded = quoted.filter(words => authored.includes(words));
            if (embedded.length === authored.length && embedded.every((words, i) => words === authored[i]))
                return;
        }
        if (nativeLines.some(line => quoted.some(words => words.includes(text(line.tts)))))
            throw new Error('video_dialogue_embedded: keep authored dialogue in shot_dialogue, not args.prompt/action/sound; video_plan compiles every turn with its speaker binding in order');
        const bySpeaker = new Map(speakers.map(speaker => [speaker.speaker, speaker]));
        const owners = object(context.board.STRUCTURE).scenes;
        const owner = Array.isArray(owners) && owners.find(scene => scene.no === context.shot.scene);
        const legacyScene = !context.timed && !owner?.directionDefaults;
        const h3 = tool === 'fasth3_omni_reference';
        const storyLanguage = text(object(context.board.STORY).language);
        const languages = h3 ? new Intl.DisplayNames(['en'], { type: 'language' }) : undefined;
        const script = nativeLines.map((line, turn) => {
            const id = text(line.speaker) || text(doc.narratorCharacterId), speaker = bySpeaker.get(id);
            const image = speaker?.imageIndices?.[0], audio = speaker?.audioIndex, direction = text(object(line.acting).direction);
            const label = nonEnglishOutsideQuotes(speaker?.name ?? '') ? id : speaker?.name ?? id;
            const who = image ? img(image) : label;
            if (h3) {
                const subject = ids.indexOf(id) + 1;
                const language = storyLanguage || text(speaker?.tts.language);
                const languageName = language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) ? languages?.of(language) : undefined;
                const words = text(line.tts);
                if (/<\/?d>/i.test(words))
                    throw new Error('FastH3 dialogue contains a reserved speech delimiter');
                const binding = [image && img(image), audio && aud(audio), line.delivery === 'off_screen' && 'off screen', direction].filter(Boolean).join(', ');
                return `<Subject ${subject}> (${label}${binding ? ', ' + binding : ''}) (S${subject}) says <d>${languageName ? '[' + languageName + '] ' : ''}${words}</d>`;
            }
            if (context.sceneDirection) {
                const owner = context.sceneDirection.openingPositions.find(p => p.character === id);
                const imageSlot = image ?? owner?.images[0];
                const deliveryCue = context.briefDelivery ? '' : sceneVoiceDirection(object(line.acting), text(line.tts), legacyScene);
                const binding = [imageSlot && img(imageSlot), audio && aud(audio), line.delivery === 'off_screen' && 'off screen'].filter(Boolean).join(', ');
                return `${deliveryCue ? deliveryCue + ' ' : ''}${id}${binding ? ' (' + binding + ')' : ''}: "${text(line.tts)}"`;
            }
            if (line.delivery !== 'on_screen') {
                const delivery = line.delivery === 'off_screen' ? 'off screen' : 'in voiceover';
                return `${label} speaks ${delivery}${direction ? ` (${direction})` : ''}${audio ? ` using ${aud(audio)}` : ''}. ` +
                    `Keep the speaking face outside the authored crop; retain any planned hands or body detail. Do not add a portrait or animate any visible mouth during this line. ${audio ? `${aud(audio)} (${label})` : label}: "${text(line.tts)}"`;
            }
            const binding = speaker?.screenBinding;
            const identity = binding ? `${who}, ${label} at SCREEN ${binding.screenPosition.toUpperCase()} (${binding.description})` : `${who} (${label})`;
            return `Turn ${turn + 1}: ${identity} speaks${direction ? ` (${direction})` : ''}${audio ? ` using ${aud(audio)}` : ''}` +
                `. Only this speaker's mouth moves; other visible mouths stay closed. ` +
                `${audio ? `${aud(audio)} (${who})` : who}: "${text(line.tts)}"`;
        });
        if (screenBindings.length)
            prompt.push('Screen positions use the viewer\'s left and right in the opening image. Preserve these positions and each character\'s appearance.');
        if (speakers.length > 1)
            prompt.push('Speak the turns in order, with a brief pause between speakers and no overlapping speech.');
        if (context.bindSceneTurns)
            args.prompt = context.bindSceneTurns(String(args.prompt), script);
        else
            prompt.push(...script);
    };
    if (reference && msr) {
        args.references = msrRefs;
        turnScript();
        if (typeof args.prompt === 'string' && msrAudio.length)
            args.prompt = afterImageBlock(args.prompt, msrAudio.sort());
        const spoken = object(context.board.STORY).language;
        if (typeof spoken === 'string' ? !/^en\b/i.test(spoken) : lines.some(line => /[^\P{L}A-Za-z]/u.test(text(line.tts))))
            warnings.push('MSR training captions were English; speech in another language and cross-language voice are not established (arXiv 2609.18393).');
        if (speakers.some(speaker => speaker.audioIndex))
            warnings.push('Reference voice is imitation, not preservation of the original WAV or exact speech timing.');
    }
    else if (reference) {
        args.referenceAudioPaths = audioPaths;
        if (vendor || tool === 'seedance_reference' || tool === 'fasth3_omni_reference' || context.bindSceneTurns)
            turnScript();
        const mapped = new Set(speakers.map(speaker => speaker.audioIndex));
        if (audioPaths.some((_, i) => !mapped.has(i + 1 + audioOffset)))
            warnings.push('Some supplied audio references have no character mapping; retain their existing role (for example music) explicitly in the prompt.');
        if (speakers.some(speaker => speaker.reference)) {
            if (tool === 'fasth3_omni_reference' && lines.length) {
                prompt.push('Each speaker says each written line once. After the final syllable their lips settle. The rest of the shot contains only the planned action, ambience and effects.');
                warnings.push('Listen past the last line for words copied from the voice sample. Check voiceReferenceCheck in the delivery receipt before comparing speaker identity.');
            }
            prompt.push('Keep the authored visual roles of reference videos, but do not inherit their voices or dialogue. Use the mapped audio references for speaker identity; keep music and effects separate from speech. Keep each speaker assigned to their own voice reference.');
            warnings.push('Reference voice is imitation, not preservation of the original WAV or exact speech timing.');
        }
    }
    if (native) {
        if (context.modelVoice)
            warnings.push('The selected model synthesizes dialogue from the scene prompt. No character voice sample is submitted.');
        if (!msr)
            prompt.push('Keep these speaker identities unchanged. Apply each line\'s authored emotion separately from stable timbre and accent. Keep non-speaking listeners silent; do not invent dialogue or voiceover.');
        if (speakers.length > 1)
            warnings.push('Multiple speakers: check assignment and turn-taking separately from timbre; short turns reduce ambiguity but are not a guarantee.');
        if (msr || vendor)
            warnings.push(`${msr ? 'MSR' : tool} renders speech and effects into its own soundtrack; assembly uses it as the cut's audio.`);
        else if (!nativeSlot && !context.modelVoice)
            warnings.push('Keep the generated soundtrack with its speaking picture. To use a finished recording, generate a fresh audio-to-video take with it.');
    }
    if (strategy === 'supplied_audio')
        warnings.push('Use the final composed pinned-voice WAV. ASTRA re-encodes supplied audio; mouth motion and speaker identity remain unreviewed.');
    if (prompt.length && typeof args.prompt === 'string')
        args.prompt += (msr ? '\n\n' : '\n\nVoice continuity guidance:\n') + prompt.join('\n');
    return { args, voiceContinuity: { version: 1, strategy, speakers, warnings,
            revision: hash({ lines, speakers, strategy, performance: context.shot.performance }),
            review: { voiceIdentity: 'not_reviewed', dialogue: 'not_reviewed', speakerAssignment: 'not_reviewed', lipSync: 'not_reviewed' } } };
}
