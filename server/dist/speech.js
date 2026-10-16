/** Model-independent dialogue addressing, revision tracking and media dependencies. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { z } from 'zod';
import * as nodeModule from 'node:module';
const voiceContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/character-voice.js');
import { readBoard, serializeBoard } from './storyboard.js';
const delivery = z.enum(['voiceover', 'on_screen', 'off_screen']);
export const speechManageSchema = z.object({
    path: z.string().min(1),
    action: z.enum(['prepare', 'list', 'update', 'attach_audio', 'plan_video', 'attach_video']),
    shotId: z.string().optional(), lineId: z.string().optional(), speaker: z.string().optional(), query: z.string().optional(),
    expectedRevision: z.string().optional(),
    patch: z.object({ tts: z.string().min(1).optional(), sub: z.string().optional(), speaker: z.string().min(1).optional(), delivery: delivery.optional() }).strict().optional(),
    audioPath: z.string().optional(), videoPath: z.string().optional(),
    generation: z.object({ generator: z.string().min(1), voiceSettings: z.record(z.unknown()), text: z.string().min(1), language: z.string().min(1).optional() }).strict().optional(),
    capabilities: z.object({ provider: z.string().min(1), model: z.string().min(1), audioConditioning: z.boolean(), lipSync: z.boolean(), postLipSync: z.boolean(), evidence: z.string().min(1) }).strict().optional(),
}).strict();
const hash = (s) => createHash('sha256').update(s).digest('hex');
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export function speechRevision(line, character) {
    return hash(JSON.stringify({ tts: line.tts, sub: line.sub, speaker: line.speaker, delivery: line.delivery, voice: character?.tts }));
}
export function speechVideoPlan(lines, capabilities) {
    if (!capabilities)
        throw new Error('Supply the selected adapter capabilities and their evidence; never infer support from the model name');
    const onScreen = lines.some(line => line.delivery === 'on_screen');
    const mode = !onScreen ? 'voiceover' : capabilities.audioConditioning && capabilities.lipSync ? 'audio_conditioned' : capabilities.postLipSync ? 'post_lipsync' : null;
    if (!mode)
        throw new Error('Selected adapter cannot synchronize on-screen dialogue. Select a capable adapter; do not silently change the scene to silent acting');
    return { mode, provider: capabilities.provider, model: capabilities.model, capabilities, audioFirst: onScreen, lineIds: lines.map(line => line.id), review: 'not_reviewed' };
}
export function manageSpeech(args) {
    const { file, win, header } = readBoard(args.path);
    const before = readFileSync(file, 'utf8');
    const revision = hash(before);
    const mutates = ['prepare', 'update', 'attach_audio', 'attach_video'].includes(args.action);
    if (mutates && args.expectedRevision !== revision)
        throw new Error('Read speech first and supply its current expectedRevision; the storyboard may have changed');
    const doc = object(win.SB_DOC);
    const rawCharacters = doc.characters;
    const characters = (Array.isArray(rawCharacters) ? rawCharacters : Object.entries(object(rawCharacters)).map(([id, c]) => ({ ...object(c), id })));
    const character = (id) => characters.find(c => c.id === id);
    const scenes = win.SCENES;
    let changed = false;
    if (args.action === 'prepare') {
        const needsNarrator = object(win.STORY).version !== 'story-v2' || scenes.some(scene => (scene.narration || []).some(line => !line.speaker));
        if ((needsNarrator || doc.narratorCharacterId !== undefined) &&
            (typeof doc.narratorCharacterId !== 'string' || !character(doc.narratorCharacterId)))
            throw new Error('Set SB_DOC.characters and narratorCharacterId before preparing speech without explicit speakers; no voice is invented');
        let next = Math.max(0, ...scenes.map(s => Number(String(s.id || '').replace(/^s/, '')) || 0));
        for (const scene of scenes) {
            scene.id ||= 's' + String(++next).padStart(4, '0');
            for (const line of (scene.narration || [])) {
                line.id ||= 'd-' + randomUUID();
                line.speaker ||= doc.narratorCharacterId;
                line.delivery ||= line.speaker === doc.narratorCharacterId ? 'voiceover' : 'on_screen';
            }
        }
        if (win.STRUCTURE)
            win.STRUCTURE.nextShotId = Math.max(win.STRUCTURE.nextShotId || 1, next + 1);
        doc.speechPlanVersion = 1;
        win.SB_DOC = doc;
        changed = true;
    }
    const all = scenes.flatMap((scene, index) => (scene.narration || []).map(line => ({ scene, index, line })));
    const selected = all.filter(({ scene, line }) => (!args.shotId || scene.id === args.shotId) && (!args.lineId || line.id === args.lineId) && (!args.speaker || line.speaker === args.speaker || character(line.speaker)?.name === args.speaker) && (!args.query || (line.tts + ' ' + (line.sub || '')).includes(args.query)));
    let invalidated;
    let plan;
    if (args.action === 'update' || args.action === 'attach_audio') {
        if (!args.lineId || selected.length !== 1)
            throw new Error('Select exactly one stable lineId; list candidates for an ambiguous request');
        const { scene, line } = selected[0];
        if (args.action === 'update') {
            if (!args.patch || !Object.keys(args.patch).length)
                throw new Error('A non-empty dialogue patch is required');
            if (args.patch.speaker && !character(args.patch.speaker))
                throw new Error('Unknown speaker id');
            const prior = speechRevision(line, character(line.speaker));
            const oldAudio = line.audio;
            const oldDelivery = line.delivery;
            Object.assign(line, args.patch);
            if (args.patch.speaker && object(win.STORY).version === 'story-v2') {
                const group = (scene.narration || []).indexOf(line) + 1;
                for (const event of Array.isArray(scene.performance) ? scene.performance : []) {
                    const performance = object(event);
                    if (performance.group === group && ['dialogue', 'narration'].includes(String(performance.kind)))
                        performance.character = line.speaker;
                }
            }
            if (speechRevision(line, character(line.speaker)) !== prior) {
                const video = object(object(scene.visual).video);
                const binding = object(video.speechBinding);
                invalidated = { audio: oldAudio || null, video: Object.keys(video).length && (line.delivery === 'on_screen' || oldDelivery === 'on_screen') || ['audio_conditioned', 'post_lipsync'].includes(String(binding.mode)) ? video : null, edit: true };
                delete line.audio;
                line.mediaStatus = 'needs_audio';
                if (invalidated.video)
                    video.speechStatus = 'stale';
                scene.speechRevision = (Number(scene.speechRevision) || 0) + 1;
            }
        }
        else {
            if (!args.audioPath)
                throw new Error('audioPath is required');
            const audioPath = resolve(dirname(file), args.audioPath);
            if (!args.generation || args.generation.text !== line.tts)
                throw new Error('Attach the actual generation arguments and exact line text');
            const voice = character(line.speaker)?.tts;
            const voiceErrors = voiceContract().generationVoiceErrors(voice, args.generation);
            if (voiceErrors.length)
                throw new Error('Generation arguments do not match the pinned character voice: ' + voiceErrors.join('; '));
            const bytes = readFileSync(audioPath);
            if (!bytes.length)
                throw new Error('Audio file is empty');
            const priorAudio = line.audio;
            const audioHash = hash(bytes), lineRevision = speechRevision(line, character(line.speaker));
            const video = object(object(scene.visual).video), binding = object(video.speechBinding);
            const boundAudio = Array.isArray(binding.audio) ? binding.audio.map(object).find(a => a.lineId === line.id) : undefined;
            if (priorAudio?.sha256 !== audioHash || priorAudio?.revision !== lineRevision || (boundAudio && (boundAudio.sha256 !== audioHash || boundAudio.revision !== lineRevision))) {
                const dependsOnSpeech = line.delivery === 'on_screen' || ['audio_conditioned', 'post_lipsync'].includes(String(binding.mode));
                invalidated = { audio: priorAudio || null, video: dependsOnSpeech && Object.keys(video).length ? video : null, edit: true };
                if (invalidated.video)
                    video.speechStatus = 'stale';
            }
            line.audio = { path: audioPath, sha256: audioHash, revision: lineRevision, status: 'not_reviewed', generation: args.generation };
            line.mediaStatus = 'audio_ready';
        }
        changed = true;
    }
    if (args.action === 'plan_video' || args.action === 'attach_video') {
        if (!args.shotId || !selected.length)
            throw new Error('Select one shot with speech');
        if (selected.some(({ line }) => !line.id || !line.speaker || !line.delivery))
            throw new Error('Prepare explicit speech before planning video');
        if (args.lineId || args.speaker || args.query)
            throw new Error('Video planning uses all lines in the shot; remove line filters');
        plan = speechVideoPlan(selected.map(s => s.line), args.capabilities);
        if (args.action === 'attach_video') {
            if (!args.videoPath)
                throw new Error('videoPath is required');
            const videoPath = resolve(dirname(file), args.videoPath);
            const bytes = readFileSync(videoPath);
            if (!bytes.length)
                throw new Error('Video file is empty');
            const audio = selected.map(({ line }) => {
                if (!line.audio || line.audio.revision !== speechRevision(line, character(line.speaker)) || hash(readFileSync(line.audio.path)) !== line.audio.sha256)
                    throw new Error('Generate and attach current speech before binding video');
                return { lineId: line.id, sha256: line.audio.sha256, revision: line.audio.revision };
            });
            const visual = object(selected[0].scene.visual);
            const video = object(visual.video);
            if ((video.engine && video.engine !== plan.provider) || (video.model && video.model !== plan.model))
                throw new Error('Adapter does not match the selected shot model');
            video.clip = args.videoPath;
            video.speechBinding = { ...plan, audio, videoPath, videoSha256: hash(bytes) };
            video.speechStatus = 'current';
            visual.video = video;
            selected[0].scene.visual = visual;
            changed = true;
        }
    }
    if (changed) {
        const ids = new Set();
        for (const { line } of all) {
            if (!line.id || ids.has(line.id))
                throw new Error('Dialogue ids must be present and unique');
            ids.add(line.id);
            if (!character(line.speaker)?.tts)
                throw new Error(`Missing pinned voice for ${line.speaker}`);
        }
        const work = resolve(dirname(file), '../.work/speech-history');
        mkdirSync(work, { recursive: true });
        const backup = join(work, revision + '.js');
        if (!existsSync(backup))
            writeFileSync(backup, before);
        const nextSource = serializeBoard(win, header);
        // Refuse to overwrite edits made since the read, even in the same invocation.
        if (hash(readFileSync(file)) !== revision)
            throw new Error('Storyboard changed during speech edit');
        const tmp = file + '.' + randomUUID() + '.tmp';
        writeFileSync(tmp, nextSource);
        renameSync(tmp, file);
    }
    return { revision: hash(readFileSync(file)), changed, invalidated, plan, lines: selected.map(({ scene, index, line }) => ({ shot: index + 1, shotId: scene.id, ...line, characterName: character(line.speaker)?.name, voice: character(line.speaker)?.tts, speechRevision: speechRevision(line, character(line.speaker)), audioCurrent: !!line.audio && line.audio.revision === speechRevision(line, character(line.speaker)) && existsSync(line.audio.path) && hash(readFileSync(line.audio.path)) === line.audio.sha256 })) };
}
