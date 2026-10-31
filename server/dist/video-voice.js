import { fasth3VideoAudioCount } from './fasth3-omni.js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { VIDEO_ADAPTERS } from './video-registry.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
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
        confirmed('pace') && `Baseline pace/accent: ${confirmed('pace')}`,
        text(tts.voiceDirection) || text(tts.stylePrompt)].filter(Boolean).join('. ');
}
function voiceReference(character, context, warnings) {
    const declared = object(character.voiceReference);
    if (character.voiceReferenceWarning && !declared.path) {
        warnings.push(`${character.id}: ${character.voiceReferenceWarning}; restore the selected sample instead of substituting an old voice.wav.`);
        return undefined;
    }
    let file = text(declared.path);
    if (file) {
        // Character handoff paths are relative to scenes.js, like other cast assets.
        file = path.resolve(context.episode, 'storyboard', file);
        if (declared.tts && hash(declared.tts) !== hash(character.tts))
            throw new Error(`voice_reference_stale: ${character.id} sample uses different pinned TTS settings`);
    }
    else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(character.id))) {
        let channel = context.episode;
        while (!existsSync(path.join(channel, 'profile.md')) && path.dirname(channel) !== channel)
            channel = path.dirname(channel);
        const identity = path.join(channel, 'assets/characters', text(character.id), 'identity.md');
        const candidate = path.join(path.dirname(identity), 'voice.wav');
        if (existsSync(identity) && existsSync(candidate)) {
            const { identityVoice } = load('../../skills/_shared/character-voice.js');
            if (hash(identityVoice(readFileSync(identity, 'utf8'))) !== hash(character.tts)) {
                warnings.push(`${character.id}: shared voice.wav belongs to different current TTS settings; attach a sample for this episode's pinned voice.`);
                return undefined;
            }
            file = candidate;
        }
    }
    if (!file)
        return undefined;
    const absolute = realpathSync(file), sha256 = fileHash(absolute);
    if (declared.sha256 && declared.sha256 !== sha256)
        throw new Error(`voice_reference_stale: ${character.id} sample bytes changed`);
    const provenance = declared.tts && declared.sha256 ? 'pinned_settings_and_bytes' : 'legacy_sample_unverified';
    if (provenance === 'legacy_sample_unverified')
        warnings.push(`${character.id}: sample identity is unverified; a file name or hash is not a listening review.`);
    return { path: absolute, sha256, provenance };
}
/**
 * Find the MSR subject that shows a speaker from voiceReference.imagePaths. MSR pairs
 * audio_refN with picN for the first two subjects, so the owned picture decides the slot;
 * references are never reordered because the prompt already numbers the images.
 */
function msrSubject(character, refs, context) {
    const owned = object(character.voiceReference).imagePaths;
    const ownedPaths = Array.isArray(owned) ? owned.map(value => realpathSync(path.resolve(context.episode, 'storyboard', String(value)))) : [];
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
function sampleSeconds(file) {
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
    const lines = (Array.isArray(context.shot.narration) ? context.shot.narration : []).map(object).filter(line => text(line.tts));
    const msr = tool === 'astra_genai_msr';
    // MSR speaks on-screen dialogue into its own soundtrack; a speaker's pinned sample, when the
    // gateway takes one, sets the timbre (user directive 2026-10-31). A cut without dialogue is fine.
    if (msr) {
        if (object(context.shot.visual).video && object(object(context.shot.visual).video).voice !== undefined)
            throw new Error('visual.video.voice is retired: MSR uses the speaker\'s voice sample when one is pinned');
        if (lines.some(line => line.delivery !== 'on_screen'))
            throw new Error('msr_dialogue_required: every MSR line is spoken on screen');
    }
    if (!lines.length)
        return { args };
    const doc = object(context.board.SB_DOC), raw = doc.characters;
    const characters = Array.isArray(raw) ? raw.map(object) : Object.entries(object(raw)).map(([id, value]) => ({ ...object(value), id }));
    const visual = object(context.shot.visual);
    const nativeSlot = Boolean(visual.clip) || context.shot.type === 'broll';
    const audible = msr || ((tool !== 'astra_genai_desktop_keyframes' || args.audio === true) && (tool === 'fasth3_omni_reference' ||
        (tool.startsWith('astra_') ? args.generateAudio !== false : args.generateAudio === true)));
    const lane = VIDEO_ADAPTERS[tool]?.voice ?? 'none';
    const supplied = lane === 'supplied';
    const onScreen = lines.some(line => line.delivery === 'on_screen');
    const native = !supplied && audible && (nativeSlot || onScreen);
    // Voice gate (owner directive 2026-10-31): a character the viewer hears or sees speak needs a voice
    // lane. An adapter without one renders only cuts whose lines are external TTS over a non-speaking picture.
    if (lane === 'none' && (native || onScreen))
        throw new Error(`voice_lane_required: ${tool} cannot keep a character's voice. Render this spoken cut with a reference adapter ` +
            `(astra_genai_msr, seedance_reference, fasth3_omni_reference) or an audio2video adapter${onScreen ? '' : ', or set generateAudio:false and keep the lines as TTS voiceover'}.`);
    const reference = native && lane === 'reference';
    const strategy = supplied ? 'supplied_audio' : reference ? 'reference_voice' : 'external_tts';
    const warnings = [];
    const speakers = [];
    const nativeLines = nativeSlot ? lines : lines.filter(line => line.delivery === 'on_screen');
    const ids = [...new Set((native ? nativeLines : lines).map(line => text(line.speaker) || text(doc.narratorCharacterId)))];
    const prompt = [];
    const audioOffset = tool === 'fasth3_omni_reference' && Array.isArray(args.referenceVideoPaths)
        ? fasth3VideoAudioCount(args.referenceVideoPaths.map(file => path.resolve(context.episode, String(file)))) : 0;
    const audioPaths = Array.isArray(args.referenceAudioPaths) ? args.referenceAudioPaths.map(value => realpathSync(path.resolve(context.episode, String(value)))) : [];
    const imagePaths = Array.isArray(args.referenceImagePaths) ? args.referenceImagePaths.map(value => realpathSync(path.resolve(context.episode, String(value)))) : [];
    const msrRefs = msr && Array.isArray(args.references) ? args.references.map(ref => ({ ...object(ref) })) : [];
    const msrAudio = [];
    for (const id of ids) {
        const matches = characters.filter(character => character.id === id);
        if (!id || matches.length !== 1 || !Object.keys(object(matches[0].tts)).length) {
            warnings.push(`Missing unique pinned voice for speaker ${id || '(unspecified)'}; no voice was invented.`);
            continue;
        }
        const character = matches[0];
        const speaker = { speaker: id, name: text(character.name) || id, tts: object(character.tts), description: voiceDescription(character) };
        // Video prompts are English: a non-Latin cast name falls back to the character id
        const label = nonEnglishOutsideQuotes(speaker.name) ? id : speaker.name;
        if (reference && msr) {
            // A pinned sample rides on subject 1 or 2 when the gateway takes samples; otherwise the prompt voices the speaker.
            const { index, slot } = msrSubject(character, msrRefs, context);
            if (index >= 0)
                speaker.imageIndices = [index + 1];
            speaker.reference = voiceReference(character, context, warnings);
            const current = index < 0 ? '' : text(msrRefs[index].audioPath);
            const problem = !speaker.reference ? 'no pinned voice sample'
                : context.msrVoice !== true ? 'the GenAI MSR backend does not accept voice samples (GET /v1/ltx/msr/capabilities)'
                    : index < 0 ? 'no MSR subject image matches voiceReference.imagePaths'
                        : slot > 2 ? `MSR subject ${slot} takes no sample; only subjects 1 and 2 do`
                            : current && current !== speaker.reference.path ? `Image ${index + 1} already carries another speaker's sample` : '';
            if (problem) {
                warnings.push(`${id}: ${problem}; MSR voices this speaker from the prompt.`);
                delete speaker.reference;
            }
            else {
                msrRefs[index].audioPath = speaker.reference.path;
                speaker.audioIndex = slot;
                msrAudio.push(`Audio ${slot}: ${label}'s voice, belongs only to Image ${index + 1}.`);
                const seconds = sampleSeconds(speaker.reference.path);
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
                const marker = String(args.model).includes('2-5') ? '@' : '';
                const images = speaker.imageIndices.map(i => tool === 'fasth3_omni_reference' ? `<Picture ${i}>` : `${marker}Image ${i}`).join(', ');
                const audioLabel = tool === 'fasth3_omni_reference' ? `<Audio ${speaker.audioIndex}>` : `${marker}Audio ${speaker.audioIndex}`;
                prompt.push(`${label} (speaker ${id})${images ? `, shown in ${images},` : ''} uses ${audioLabel} for voice timbre and accent only. Speak the authored shot dialogue, not the sample's words.`);
            }
            else
                warnings.push(`${id}: no pinned voice sample available; reference-voice consistency is not established. Supply character.voiceReference before relying on this voice.`);
        }
        speakers.push(speaker);
        if (native && speaker.description && !(msr && speaker.audioIndex)) {
            if (nonEnglishOutsideQuotes(speaker.description))
                warnings.push(`${id}: supply an English translation of the pinned acoustic description in the authored prompt; video prompts are English only. The original description stays in this plan.`);
            else
                prompt.push(`Stable voice for ${label} (speaker ${id}): ${speaker.description}`);
        }
        if (native && !text(object(character.tts).voiceDirection) && !text(object(character.tts).stylePrompt) && !text(object(object(object(character.character).speech).timbre).value))
            warnings.push(`${id}: no authored acoustic description; the TTS voice ID is not a video-model voice selector.`);
    }
    if (reference && msr) {
        args.references = msrRefs;
        // The prompt is MSR's only script: add each authored line the prompt does not already quote, in order.
        const bySpeaker = new Map(speakers.map(speaker => [speaker.speaker, speaker]));
        const script = lines.filter(line => !String(args.prompt).includes(text(line.tts))).map(line => {
            const id = text(line.speaker) || text(doc.narratorCharacterId), speaker = bySpeaker.get(id);
            const image = speaker?.imageIndices?.[0], audio = speaker?.audioIndex, direction = text(object(line.acting).direction);
            const who = image ? `Image ${image}` : speaker?.name ?? id;
            return `${who} speaks${direction ? ` (${direction})` : ''} with visible lip movement${audio ? ` synchronized with Audio ${audio}` : ''}` +
                ` while the other characters listen silently with their lips closed. ${audio ? `Audio ${audio} (${who})` : who}: "${text(line.tts)}"`;
        });
        prompt.push(...script);
        if (typeof args.prompt === 'string' && msrAudio.length)
            args.prompt = afterImageBlock(args.prompt, msrAudio.sort());
        if (lines.some(line => /[가-힣]/.test(text(line.tts))))
            warnings.push('MSR training captions were English; Korean speech and cross-language voice are not established (arXiv 2609.18393).');
        if (speakers.some(speaker => speaker.audioIndex))
            warnings.push('Reference voice is imitation, not preservation of the original WAV or exact speech timing.');
    }
    else if (reference) {
        args.referenceAudioPaths = audioPaths;
        const mapped = new Set(speakers.map(speaker => speaker.audioIndex));
        if (audioPaths.some((_, i) => !mapped.has(i + 1 + audioOffset)))
            warnings.push('Some supplied audio references have no character mapping; retain their existing role (for example music) explicitly in the prompt.');
        if (speakers.some(speaker => speaker.reference)) {
            prompt.push('Keep the authored visual roles of reference videos, but do not inherit their voices or dialogue. Use the mapped audio references for speaker identity; keep music and effects separate from speech. Keep each speaker assigned to their own voice reference.');
            warnings.push('Reference voice is imitation, not preservation of the original WAV or exact speech timing.');
        }
    }
    if (native) {
        if (!msr)
            prompt.push('Keep these speaker identities unchanged. Apply each line\'s authored emotion separately from stable timbre and accent. Keep non-speaking listeners silent; do not invent dialogue or voiceover.');
        if (speakers.length > 1)
            warnings.push('Multiple speakers: check assignment and turn-taking separately from timbre; short turns reduce ambiguity but are not a guarantee.');
        if (msr)
            warnings.push('MSR renders speech and effects into its own soundtrack; assembly uses it as the cut\'s audio.');
        else if (!nativeSlot)
            warnings.push('visual.video assembly uses the external TTS track. Native voice guidance does not synchronize that WAV; use audio2video for exact supplied-speech staging or the existing visual.clip native-audio slot.');
    }
    if (strategy === 'supplied_audio')
        warnings.push('Use the final composed pinned-voice WAV. ASTRA re-encodes supplied audio; mouth motion and speaker identity remain unreviewed.');
    if (prompt.length && typeof args.prompt === 'string')
        args.prompt += (msr ? '\n\n' : '\n\nVoice continuity guidance:\n') + prompt.join('\n');
    return { args, voiceContinuity: { version: 1, strategy, speakers, warnings,
            revision: hash({ lines, speakers, strategy, performance: context.shot.performance }),
            review: { voiceIdentity: 'not_reviewed', dialogue: 'not_reviewed', speakerAssignment: 'not_reviewed', lipSync: 'not_reviewed' } } };
}
