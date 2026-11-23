import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { approvedPortrait, portraitForImage, portraitImage, PortraitError, verifyApprovedPortrait } from './modelark-assets.js';
import { requiredCharacters } from './video-registry.js';
export async function checkRegisteredBindings(bindings) {
    for (const binding of bindings ?? []) {
        if (!binding.asset)
            continue;
        try {
            await verifyApprovedPortrait(binding.asset);
        }
        catch (error) {
            const problem = new PortraitError(error);
            Object.assign(problem.report, { shotId: binding.shotId, character: binding.character, role: binding.role, slot: binding.slot });
            throw problem;
        }
    }
}
export function seedanceBindings(episode, members, args, inputs, images = [], voice, sceneFaces = []) {
    const board = path.join(episode, 'storyboard');
    const output = String(args.outputPath);
    const bindings = [];
    const files = args.referenceImagePaths, audio = args.referenceAudioPaths;
    const videoOffset = args.referenceVideoPaths.length + args.referenceVideoUrls.length;
    for (const member of members) {
        const shotId = String(member.id);
        for (const person of requiredCharacters(member)) {
            const character = person.character;
            for (const [role, panel] of [['face', person.face?.path], [person.bodyView, person.bodyPath]]) {
                if (!panel)
                    continue;
                const file = fs.realpathSync(path.resolve(board, panel));
                const slot = files.indexOf(file) + 1;
                if (!slot)
                    throw new Error('character_inputs_mismatch: ' + shotId + ' ' + character + ' missing ' + role);
                const binding = { shotId, character, role, media: 'Image', slot, sha256: inputs[file] };
                try {
                    const portrait = portraitForImage(file, output, args.realFaceInput === true);
                    if (role === 'face' && (!portrait || path.basename(path.dirname(portrait.identityPath)) !== character ||
                        portraitImage(portrait.identityPath, 'face') !== file))
                        throw new Error('modelark_asset_sheet_required: select the face registered to ' + character);
                    if (portrait)
                        binding.asset = approvedPortrait(portrait.identityPath, portrait.panel ?? 'face', inputs[file]);
                }
                catch (error) {
                    const problem = error instanceof PortraitError ? error : new PortraitError(error);
                    Object.assign(problem.report, { shotId, character, role, slot });
                    throw problem;
                }
                bindings.push(binding);
            }
            if (person.face?.taskId) {
                const face = person.face;
                const file = face.reviewPath && path.resolve(board, face.reviewPath);
                const bytes = file && fs.existsSync(file) && fs.readFileSync(file);
                let review;
                try {
                    review = bytes && JSON.parse(bytes.toString());
                }
                catch { /* Report the unresolved character. */ }
                if (!bytes || review?.providerJob !== face.taskId || review.character !== character || review.status !== 'passed') {
                    const message = 'character_face_review_required: ' + shotId + ' ' + character + ' needs a passed cast continuity review for ' + face.taskId;
                    throw Object.assign(new Error(message), { report: { stage: 'character_inputs', code: 'character_face_review_required',
                            character, shotId, role: 'face', taskId: face.taskId, videoSubmitted: false, message } });
                }
                const index = args.referenceVideoTaskIds.indexOf(face.taskId);
                if (index < 0)
                    throw new Error('character_inputs_mismatch: missing original for ' + character);
                bindings.push({ shotId, character, role: 'face', media: 'Video', slot: videoOffset + index + 1,
                    taskId: face.taskId, reviewSha256: createHash('sha256').update(bytes).digest('hex') });
            }
        }
        const lines = (member.narration ?? []);
        const speakers = new Set(lines.filter(line => line.tts?.trim() && ['on_screen', 'off_screen'].includes(line.delivery ?? '')).map(line => line.speaker));
        for (const character of speakers) {
            const speaker = voice?.speakers.find(s => s.speaker === character);
            if (!speaker?.audioIndex || speaker.reference?.provenance !== 'pinned_settings_and_bytes' ||
                audio[speaker.audioIndex - 1] !== speaker.reference.path) {
                const message = 'character_voice_required: ' + shotId + ' ' + character + ' needs a pinned voice sample';
                throw Object.assign(new Error(message), { report: { stage: 'character_inputs', code: 'character_voice_required',
                        shotId, character, role: 'voice', message, videoSubmitted: false } });
            }
            bindings.push({ shotId, character, role: 'voice', media: 'Audio', slot: speaker.audioIndex, sha256: speaker.reference.sha256 });
        }
    }
    if (!bindings.length)
        return;
    // Keep set and prop slots visible alongside the people they frame.
    for (const [index, file] of files.entries()) {
        if (bindings.some(b => b.media === 'Image' && b.slot === index + 1))
            continue;
        const image = images.find(b => b.parameter === 'referenceImagePaths[' + index + ']' && b.path === file)
            ?? images.find(b => b.path === file && b.submitted);
        const portrait = portraitForImage(file, output, args.realFaceInput === true);
        const face = sceneFaces.find(reference => reference.path === file && reference.character);
        if (portrait && face?.character && path.basename(path.dirname(portrait.identityPath)) === face.character &&
            portraitImage(portrait.identityPath, 'face') === file) {
            bindings.push({ shotId: face.shotId, character: face.character, role: 'face', media: 'Image', slot: index + 1, sha256: inputs[file],
                asset: approvedPortrait(portrait.identityPath, 'face', inputs[file]) });
            continue;
        }
        if (portrait)
            throw new PortraitError(new Error('modelark_asset_ambiguous: assign this additional portrait to its visible character'));
        bindings.push({ shotId: image?.shotId ?? String(members[0].id), role: image?.role ?? 'reference', media: 'Image', slot: index + 1, sha256: inputs[file] });
    }
    for (const binding of bindings) {
        if (!binding.character || binding.role !== 'face')
            continue;
        if (bindings.some(other => other.role === 'face' && other.character !== binding.character &&
            (binding.asset && binding.asset.assetId === other.asset?.assetId || binding.taskId && binding.taskId === other.taskId)))
            throw new Error('character_face_source_ambiguous: face asset shared by different cast members');
    }
    return bindings;
}
