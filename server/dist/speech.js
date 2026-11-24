import { usesGeneratedVoice } from './scene-prompt-profile.js';
import { hasVideoSubjectReferences } from './video-image-inputs.js';
import { assertSpeechRenderCapacity, selectedVideoTool } from './video-routing.js';
import { resolveCharacterVoice } from './video-voice.js';
import { speechVideoCapabilities, VIDEO_ADAPTERS } from './video-registry.js';
/** Model-independent dialogue addressing, revision tracking and media dependencies. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve, join, relative } from 'node:path';
import { z } from 'zod';
import * as nodeModule from 'node:module';
import { execFileSync } from 'node:child_process';
const voiceContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/character-voice.js');
const characterSpeechContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/character-speech.js');
import { readBoard, serializeBoard } from './storyboard.js';
import { actingSchema, compileActing } from './speech-acting.js';
import { resolveTtsModel } from './tts-models.js';
import { ASTRA_VIDEO_MAX_PROMPT_CHARS } from './astra-video-client.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
import { compileVideoPrompt } from './video-prompt.js';
import { refreshVideoReview } from './video-review.js';
const speechSpanContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/speech-span.js');
const audioSignalContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/audio-signal.js');
function requireNativeVideo(file) {
    let signal;
    try {
        // Uppercase V excludes an album cover embedded in an audio file.
        const frame = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-xerror', '-i', file, '-map', '0:V:0',
            '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        if (frame.length !== 1)
            throw new Error('No decoded frame');
        signal = audioSignalContract().inspect(file).status;
    }
    catch {
        throw new Error('native_speech_media_invalid: supply a decodable video with its original audible soundtrack');
    }
    if (signal === 'missing')
        throw new Error('native_speech_missing: the video has no audio stream; regenerate the missing dialogue before attaching this clip');
    if (signal === 'silent')
        throw new Error('native_speech_silent: the decoded soundtrack is below -60 dBFS throughout; regenerate the missing dialogue before attaching this clip');
}
const actingContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/scene-acting.js');
export { actingSchema } from './speech-acting.js';
const delivery = z.enum(['voiceover', 'on_screen', 'off_screen']);
export const speechManageSchema = z.object({
    path: z.string().min(1),
    action: z.enum(['prepare', 'list', 'update', 'attach_audio', 'plan_audio', 'plan_video', 'attach_video', 'retime']),
    shotId: z.string().optional(), lineId: z.string().optional(), speaker: z.string().optional(), query: z.string().optional(),
    expectedRevision: z.string().optional(),
    patch: z.object({ tts: z.string().min(1).optional(), sub: z.string().optional(), speaker: z.string().min(1).optional(), delivery: delivery.optional(), acting: actingSchema.nullable().optional() }).strict().optional(),
    audioPath: z.string().optional(), videoPath: z.string().optional(), tool: z.string().optional(),
    reuse: z.literal('tail_trim').optional(),
    timingPatch: z.object({ speechBoundActions: z.boolean().optional(), actions: z.array(z.tuple([z.number().int().nonnegative(), z.number().finite().positive()])).optional() }).strict().optional(),
    generation: z.object({ generator: z.string().min(1), voiceSettings: z.record(z.unknown()), text: z.string().min(1), language: z.string().min(1).optional(), receiptPath: z.string().min(1).optional() }).strict().optional(),
    capabilities: z.object({ provider: z.string().min(1), model: z.string().min(1), audioConditioning: z.boolean(), lipSync: z.boolean(), postLipSync: z.boolean(), nativeSpeech: z.boolean().optional(), evidence: z.string().min(1) }).strict().optional(),
}).strict();
const hash = (s) => createHash('sha256').update(s).digest('hex');
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const speechContract = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/speech-contract.js');
const videoSeconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
/** Keep the storyboard player on the bound clip without replacing authored multi-cut edits. */
function syncProductionClip(scene, boardDir, videoPath, oldClip, warnings) {
    const production = object(scene.productionPlan), cuts = production.cuts;
    if (Array.isArray(cuts) && cuts.length) {
        const cut = object(cuts[0]);
        if (cuts.length !== 1 || cut.kind !== 'generated_video' || Number(cut.start ?? 0) !== 0
            || typeof oldClip !== 'string' || typeof cut.path !== 'string' || resolve(boardDir, cut.path) !== resolve(boardDir, oldClip)) {
            warnings.push('The bound video changed; the authored production cuts were preserved and need an explicit edit before playback uses this clip.');
            return;
        }
        try {
            if (Math.abs(Number(cut.seconds) - videoSeconds(resolve(boardDir, oldClip))) > 0.05) {
                warnings.push('The existing production cut has an authored duration; it was preserved for an explicit edit.');
                return;
            }
        }
        catch {
            warnings.push('Could not verify the existing production cut duration; it was preserved for an explicit edit.');
            return;
        }
    }
    try {
        const seconds = videoSeconds(videoPath);
        if (!Number.isFinite(seconds) || seconds <= 0)
            throw new Error('Missing video duration');
        scene.productionPlan = { ...production, cuts: [{ kind: 'generated_video', path: relative(boardDir, videoPath), start: 0, seconds }] };
        return seconds;
    }
    catch {
        warnings.push('Could not measure the bound video stream; production cuts were not changed.');
    }
}
// A source soundtrack uses the existing sync edit lane. Keep authored moving
// joins, layered cuts and audio margins on their separate assembly audio.
function bindGeneratedSoundtrack(scene, next, clipSeconds) {
    const { carry } = nodeModule.createRequire(import.meta.url)('../../skills/produce/references/edit-plan.js');
    const edit = object(scene.edit);
    const visual = object(scene.visual);
    const transition = String(scene.transition ?? 'cut');
    if (!clipSeconds || edit.pre || edit.post || visual.slide || visual.reuse !== undefined || object(visual.video).groupPlan ||
        scene.type === 'broll' || scene.type === 'outro' || carry.test(transition) || carry.test(String(next?.transition)) ||
        (transition.startsWith('dip') && edit.pre !== 0))
        return false;
    const start = Number(edit.in ?? 0);
    const end = edit.out ?? (typeof scene.duration === 'number' ? start + scene.duration : clipSeconds);
    if (typeof end !== 'number' || !Number.isFinite(end) || end <= start || end > clipSeconds + 0.001)
        return false;
    if (edit.out === undefined && typeof scene.duration === 'number')
        scene.edit = { ...edit, out: end };
    scene.sound = { ...object(scene.sound), audioSource: 'video' };
    return true;
}
export function speechRevision(line, character) {
    return hash(JSON.stringify(actingContract().speechRevisionPayload(line, character?.tts)));
}
function currentAudio(line, character) {
    try {
        if (line.audio)
            characterSpeechContract().verifiedSpeechGeneration(line.audio.path, line.audio.generation, character?.tts, line);
        return !!line.audio && line.audio.revision === speechRevision(line, character) && line.audio.generation?.text === line.tts &&
            voiceContract().generationVoiceErrors(character?.tts, line.audio.generation, line).length === 0 &&
            existsSync(line.audio.path) && hash(readFileSync(line.audio.path)) === line.audio.sha256;
    }
    catch {
        return false;
    }
}
export function speechAudioPlan(line, character, context) {
    if (character)
        character = characterSpeechContract().characterSpeech(character, context);
    const voice = character?.tts;
    if (!voice)
        throw new Error('Missing pinned character voice');
    // Validate the identity before building raw adapter arguments.
    const validator = nodeModule.createRequire(import.meta.url)('../../skills/_shared/character-voice.js');
    const invalid = validator.voiceErrors(voice);
    if (invalid.length)
        throw new Error(invalid.join('; '));
    const direction = actingContract().directionSupport(voice, line.acting);
    const language = validator.normalizeLanguage(voice.language);
    const compiled = compileActing(line.tts, line.acting || undefined, { ...voice, language });
    const modelContract = resolveTtsModel(String(voice.engine), typeof voice.model === 'string' ? voice.model.trim() : undefined);
    return { ...compiled, capabilities: modelContract, arguments: compiled.generation, expectedText: line.tts, speechRevision: speechRevision(line, character), language, direction, review: 'not_reviewed' };
}
function inspectionAudioPlan(line, character, context) {
    if (!character?.tts)
        return { available: false, warnings: ['Missing pinned character voice'], review: 'not_reviewed' };
    try {
        return { available: true, ...speechAudioPlan(line, character, context) };
    }
    catch (error) {
        return { available: false, warnings: [error instanceof Error ? error.message : String(error)], review: 'not_reviewed' };
    }
}
function audioProvenanceStatus(line, character) {
    if (!line.audio)
        return 'missing';
    if (currentAudio(line, character))
        return 'current';
    const voice = character?.tts;
    const historical = ['supertonic', 'mlx'].includes(String(voice?.engine)) || (voice?.engine === 'elevenlabs' && ['eleven_v3', 'eleven_v3_conversational', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'].includes(String(voice?.model)));
    try {
        if (historical && line.audio.revision === speechRevision(line, character) && line.audio.generation?.text === line.tts && hash(readFileSync(line.audio.path)) === line.audio.sha256)
            return 'preserved_historical_recording_unverified';
    }
    catch { /* An unreadable recording remains listed with its original evidence. */ }
    return 'stale_or_missing';
}
function measuredDuration(line) {
    if (!line.audio || !existsSync(line.audio.path))
        return null;
    try {
        const value = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', line.audio.path], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
        return Number.isFinite(value) && value > 0 ? value : null;
    }
    catch {
        return null;
    }
}
export function speechVideoPlan(input, capabilities, sceneNo) {
    if (!capabilities)
        throw new Error('Supply the selected adapter capabilities and their evidence; never infer support from the model name');
    speechContract().assertNoPostLipSync(capabilities);
    const scene = Array.isArray(input) ? { narration: input } : input;
    const lines = scene.narration || [];
    const onScreen = lines.some(line => line.delivery === 'on_screen');
    // Inner thoughts stay external TTS even when the project's dialogue adapter is MSR.
    const physicalSpeech = lines.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen');
    if (capabilities.nativeSpeech && physicalSpeech && lines.some(line => line.delivery === 'voiceover'))
        throw new Error('msr_speech_route: split physical dialogue and inner thoughts into separate shots; thoughts use image2video with timed TTS');
    const mode = capabilities.nativeSpeech && physicalSpeech ? 'native' : !onScreen ? 'voiceover' : capabilities.audioConditioning ? 'audio_conditioned' : null;
    if (!mode)
        throw new Error('Selected adapter cannot synchronize on-screen dialogue. Select a capable adapter; do not silently change the scene to silent acting');
    const saved = object(object(object(scene.visual).video).promptSource);
    const design = object(object(scene.shot).videoDesign);
    // The preview fits the ASTRA limit as video_plan does, so an over-limit flag means the authored text itself is too long.
    const astra = capabilities.provider.trim().toLowerCase() === 'astra';
    const compiled = compileVideoPrompt(scene, {
        action: typeof saved.action === 'string' ? saved.action : typeof design.action === 'string' ? design.action : '',
        ...(typeof saved.end === 'string' ? { end: saved.end } : {}),
        ...(typeof saved.sound === 'string' ? { sound: saved.sound } : {}),
    }, {}, { mode, measureAudio: line => mode === 'native' ? null : measuredDuration(line), validateLanguage: false,
        ...(astra ? { maxCharacters: ASTRA_VIDEO_MAX_PROMPT_CHARS } : {}) });
    const timeline = compiled.performance;
    const videoPrompt = compiled.prompt;
    const promptLength = astra
        ? { characters: videoPrompt.length, maxCharacters: ASTRA_VIDEO_MAX_PROMPT_CHARS, exceeded: videoPrompt.length > ASTRA_VIDEO_MAX_PROMPT_CHARS }
        : undefined;
    const warnings = [...compiled.warnings];
    const foreign = nonEnglishOutsideQuotes(videoPrompt);
    if (foreign)
        warnings.push(`videoPrompt carries authored text in another language ("${foreign}"); write the video prompt in English before video_plan, which refuses it. Only quoted dialogue keeps the video's language.`);
    if (promptLength?.exceeded)
        warnings.push(`ASTRA video prompt has ${promptLength.characters} characters; the adapter limit is ${promptLength.maxCharacters}. Shorten repeated descriptions or split at a natural action boundary while preserving necessary actions. The plan is unchanged.`);
    const performancePayload = actingContract().scenePerformancePayload(scene);
    const { performance: _performance, narration: _narration, ...reuseContext } = performancePayload;
    return { ...timeline, ...(mode === 'native' && timeline.timing === 'needs_audio_duration' ? { timing: 'model_timed' } : {}), warnings, promptLength, reuseContextRevision: hash(JSON.stringify(reuseContext)), performanceRevision: hash(JSON.stringify(performancePayload)), videoPrompt, textPolicy: 'no_visible_text', boundary: sceneNo === undefined ? 'one_shot_per_generation' : 'one_scene_per_generation',
        instructions: (sceneNo === undefined
            ? 'Generate only this shot. Preserve the ordered actions, addressees and reactions, including silent events. Concurrent actions share their speech interval. Match the source frame to the opening state; do not concatenate other shots sharing a reference image.'
            : 'Use video_plan with sceneNo ' + sceneNo + ' to generate the entire scene once. This card describes its own dialogue and actions within that scene.') + ' ' + actingContract().VIDEO_TEXT_POLICY, mode, provider: capabilities.provider, model: capabilities.model, capabilities, audioFirst: lines.length > 0 && mode !== 'native', lineIds: lines.map(line => line.id), review: 'not_reviewed' };
}
export function manageSpeech(args, options = {}) {
    args = speechManageSchema.parse(args);
    const { file, win, header } = readBoard(args.path);
    const before = readFileSync(file, 'utf8');
    const revision = hash(before);
    const mutates = ['prepare', 'update', 'attach_audio', 'attach_video', 'retime'].includes(args.action);
    if (mutates && args.expectedRevision !== revision)
        throw new Error('Read speech first and supply its current expectedRevision; the storyboard may have changed');
    const doc = object(win.SB_DOC);
    const rawCharacters = doc.characters;
    const voiceWarnings = [];
    const characters = (Array.isArray(rawCharacters) ? rawCharacters : Object.entries(object(rawCharacters)).map(([id, c]) => ({ ...object(c), id })))
        .map(c => resolveCharacterVoice(object(c), { episode: dirname(dirname(file)), board: win, shot: {} }, voiceWarnings));
    const character = (id) => characters.find(c => c.id === id);
    const audioCharacter = (id) => characterSpeechContract().characterSpeech(character(id), { boardDir: dirname(file), board: win });
    const scenes = win.SCENES;
    let changed = false;
    let timing;
    let soundtrack;
    let clearedTrim;
    if (args.timingPatch && args.action !== 'retime')
        throw new Error('timingPatch is only used by retime');
    if (args.reuse && args.action !== 'attach_video')
        throw new Error('reuse is only used by attach_video');
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
            if (args.patch.acting === null)
                delete line.acting;
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
                invalidated = { audio: oldAudio || null, video: Object.keys(video).length && (line.delivery === 'on_screen' || oldDelivery === 'on_screen' || Object.hasOwn(args.patch, 'acting')) || ['audio_conditioned', 'post_lipsync'].includes(String(binding.mode)) ? video : null, edit: true };
                delete line.audio;
                // A native-speech clip voiced the old words itself: the stale video, not new audio, is the follow-up.
                if (binding.mode !== 'native')
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
            const voice = audioCharacter(line.speaker)?.tts;
            const voiceErrors = voiceContract().generationVoiceErrors(voice, args.generation, line);
            if (voiceErrors.length)
                throw new Error('Generation arguments do not match the pinned character voice: ' + voiceErrors.join('; '));
            const bytes = readFileSync(audioPath);
            if (!bytes.length)
                throw new Error('Audio file is empty');
            const generation = characterSpeechContract().verifiedSpeechGeneration(audioPath, args.generation, voice, line, { required: voice?.engine === 'astra-genai' });
            const priorAudio = line.audio;
            const audioHash = hash(bytes), lineRevision = speechRevision(line, character(line.speaker));
            const video = object(object(scene.visual).video), binding = object(video.speechBinding);
            const boundAudio = Array.isArray(binding.audio) ? binding.audio.map(object).find(a => a.lineId === line.id) : undefined;
            if (priorAudio?.sha256 !== audioHash || priorAudio?.revision !== lineRevision || (boundAudio && (boundAudio.sha256 !== audioHash || boundAudio.revision !== lineRevision))) {
                const dependsOnSpeech = binding.mode !== 'native' && (line.delivery === 'on_screen' || ['audio_conditioned', 'post_lipsync'].includes(String(binding.mode)));
                invalidated = { audio: priorAudio || null, video: dependsOnSpeech && Object.keys(video).length ? video : null, edit: true };
                if (invalidated.video)
                    video.speechStatus = 'stale';
            }
            line.audio = { path: audioPath, sha256: audioHash, revision: lineRevision, status: 'not_reviewed', generation };
            line.mediaStatus = 'audio_ready';
        }
        const clock = actingContract().planScenePerformance(scene, measuredDuration);
        timing = { shotId: scene.id, storedSeconds: scene.duration, measuredSeconds: clock.durationSeconds,
            warnings: clock.warnings, nextAction: 'retime', review: 'not_reviewed' };
        changed = true;
    }
    if (args.action === 'retime') {
        const scene = scenes.find(item => item.id === args.shotId);
        if (!scene || args.lineId || args.speaker || args.query)
            throw new Error('Retime one complete shot by shotId');
        for (const line of (scene.narration || [])) {
            if (!currentAudio(line, character(line.speaker)))
                throw new Error('Attach current speech before retiming');
        }
        const contract = nodeModule.createRequire(import.meta.url)('../../skills/_shared/performance-retiming.js');
        const result = contract.retime(scene, args.timingPatch || {}, measuredDuration);
        scene.performance = result.scene.performance;
        scene.duration = result.scene.duration;
        const video = object(object(scene.visual).video);
        if (Object.keys(video).length)
            video.speechStatus = 'stale';
        timing = { shotId: scene.id, previousSeconds: result.previousSeconds, durationSeconds: result.plan.durationSeconds,
            performance: result.plan.performance, warnings: result.plan.warnings,
            nextAction: 'compose_and_prepare_video', review: 'not_reviewed' };
        invalidated = { video, edit: true };
        changed = true;
    }
    if (args.action === 'plan_video' || args.action === 'attach_video') {
        speechContract().assertNoPostLipSync({ tool: args.tool, capabilities: args.capabilities });
        if (args.tool && !Object.hasOwn(VIDEO_ADAPTERS, args.tool))
            throw new Error('video_tool_unknown: ' + args.tool);
        const scene = scenes.find(item => item.id === args.shotId);
        if (!args.shotId || !scene)
            throw new Error('Select one existing shot');
        if (selected.some(({ line }) => !line.id || !line.speaker || !line.delivery))
            throw new Error('Prepare explicit speech before planning video');
        if (args.lineId || args.speaker || args.query)
            throw new Error('Video planning uses all lines in the shot; remove line filters');
        for (const { line } of selected)
            actingSchema.nullable().optional().parse(line.acting);
        const episode = dirname(dirname(file));
        const owner = win.STRUCTURE?.scenes?.find(item => item.no === scene.scene);
        const selectedVideo = object(scene.visual?.video);
        speechContract().assertNoPostLipSync({ direction: owner?.videoDirection, mode: selectedVideo.mode, operation: selectedVideo.operation,
            route: selectedVideo.route, tool: selectedVideo.tool, strategy: selectedVideo.strategy, capabilities: selectedVideo.capabilities,
            postLipSync: selectedVideo.postLipSync, post_lipsync: selectedVideo.post_lipsync });
        const episodeBoard = basename(dirname(file)) === 'storyboard' && basename(file) === 'scenes.js';
        const adapter = args.tool ? VIDEO_ADAPTERS[args.tool] : undefined;
        const requested = adapter && { engine: adapter.engine, operation: adapter.operation,
            model: args.capabilities?.model ?? (args.tool === 'astra_genai_msr' ? 'ltx-2.5-22b-distilled' : undefined) };
        const context = nodeModule.createRequire(import.meta.url)('../../skills/_shared/video-selection.js')
            .speechRenderSelection(win, scene, episodeBoard ? episode : undefined, requested);
        let verified;
        const physical = selected.some(({ line }) => line.tts?.trim() && line.delivery !== 'voiceover');
        if (context && (context.selection.operation || context.route || physical || !args.capabilities || args.action === 'attach_video')) {
            const { selection, route } = context;
            if (args.tool && adapter?.engine !== selection.engine)
                throw new Error('model_selection_mismatch: tool does not match selected engine');
            const tool = selectedVideoTool(selection);
            if ((route || args.tool) && (!tool || args.tool && args.tool !== tool))
                throw new Error('scene_speech_route: the complete scene requires ' + selection.operation);
            const generatedVoice = usesGeneratedVoice(tool, owner?.videoDirection?.dialogueVoice);
            verified = speechVideoCapabilities(selection.engine, selection.model || selection.engine, selection.operation, route ? route.mode === 'reference' : hasVideoSubjectReferences(scene), generatedVoice);
            if (tool && (route || verified.nativeSpeech && !generatedVoice)) {
                assertSpeechRenderCapacity(tool, selection.model, owner, context.cards, route ?? { mode: 'reference' });
            }
        }
        else if (options.registeredNativeAttachment && args.action === 'attach_video' && physical && args.capabilities?.nativeSpeech) {
            throw new Error('video_operation_missing: select the registered video tool to verify its speech capabilities');
        }
        if (verified) {
            if (args.capabilities && (args.capabilities.provider !== verified.provider || args.capabilities.model !== verified.model ||
                args.capabilities.audioConditioning !== verified.audioConditioning || args.capabilities.lipSync !== verified.lipSync || args.capabilities.postLipSync !== verified.postLipSync ||
                Boolean(args.capabilities.nativeSpeech) !== Boolean(verified.nativeSpeech)))
                throw new Error('Caller capabilities disagree with selected adapter registry; use the registered video operation');
            args = { ...args, capabilities: verified };
        }
        plan = speechVideoPlan({ ...scene, narration: selected.map(({ line }) => ({ ...line, audio: currentAudio(line, character(line.speaker)) ? line.audio : undefined })) }, args.capabilities, owner?.videoDirection ? owner.no : undefined);
        const continuityContract = nodeModule.createRequire(import.meta.url)('../../skills/storyboard/references/shot-continuity.js');
        plan = { ...plan, continuity: continuityContract.plan(win, scenes.indexOf(scene), dirname(file)) };
        if (args.action === 'attach_video') {
            if (!args.videoPath)
                throw new Error('videoPath is required');
            const videoPath = resolve(dirname(file), args.videoPath);
            const bytes = readFileSync(videoPath);
            if (!bytes.length)
                throw new Error('Video file is empty');
            const videoSha256 = hash(bytes);
            const receipts = speechContract().episodeVideoReceipts(scenes, dirname(file), videoPath);
            const recordedDriver = speechContract().assertVideoSpeechProvenance(videoPath, videoSha256, { ...plan, sourceShot: scene, boardDir: dirname(file), board: win }, receipts);
            const renderedScene = receipts.sceneRenders.get(videoPath);
            const renderedShot = renderedScene && renderedScene.shots.length > 1 && renderedScene.shots.find(shot => shot.shot_id === scene.id);
            for (const card of scenes) {
                const video = object(card.visual?.video), binding = object(video.speechBinding);
                if (!binding.videoSha256 && !speechContract().hasPostLipSync(binding))
                    continue;
                const source = binding.videoPath ?? video.clip ?? video.src;
                const original = typeof source === 'string' ? resolve(dirname(file), source) : undefined;
                const matches = binding.videoSha256 ? binding.videoSha256 === videoSha256 :
                    original && (original === videoPath || existsSync(original) && hash(readFileSync(original)) === videoSha256);
                if (!matches)
                    continue;
                speechContract().assertNoPostLipSync(binding);
                const other = renderedShot && renderedScene?.shots.find(shot => shot.shot_id === card.id);
                const separateShot = other && renderedShot && (other.end_frame <= renderedShot.start_frame || renderedShot.end_frame <= other.start_frame);
                const separatePicture = separateShot && (binding.mode === 'voiceover' || plan.mode === 'voiceover');
                if (physical && binding.videoSha256 && (binding.provider && binding.provider !== plan.provider ||
                    binding.model && binding.model !== plan.model || binding.mode && binding.mode !== plan.mode && !separatePicture))
                    throw new Error('speech_video_source_mismatch: this video already belongs to a different speech operation or model');
            }
            const native = plan.mode === 'native';
            if (native)
                requireNativeVideo(videoPath);
            const nativeAudio = native ? speechSpanContract().inspect(videoPath) : undefined;
            const sound = object(scene.sound);
            if (native && sound.audioSource === 'speech')
                throw new Error('Native video speech lives in the clip soundtrack; sound.audioSource speech would drop it');
            let driverSha256;
            if (plan.mode === 'audio_conditioned') {
                const signal = audioSignalContract().inspect(videoPath).status;
                if (signal !== 'signal') {
                    driverSha256 = recordedDriver ?? characterSpeechContract().conditioningAudioSha256(videoPath);
                    if (!driverSha256)
                        throw new Error('conditioning_audio_unverified: a silent A2V clip needs its completed generation receipt binding these video bytes to the original conditioning WAV');
                }
            }
            const audio = selected.map(({ line }) => {
                // The clip spoke the line text, so the binding records the line revision; there is no line audio.
                if (native)
                    return { lineId: line.id, revision: speechRevision(line, character(line.speaker)) };
                if (!line.audio || line.audio.revision !== speechRevision(line, character(line.speaker)) || hash(readFileSync(line.audio.path)) !== line.audio.sha256)
                    throw new Error('Generate and attach current speech before binding video');
                const errors = voiceContract().generationVoiceErrors(character(line.speaker)?.tts, line.audio.generation, line);
                if (line.audio.generation.text !== line.tts || errors.length)
                    throw new Error('Speech generation evidence changed: ' + errors.join('; '));
                return { lineId: line.id, sha256: line.audio.sha256, revision: line.audio.revision };
            });
            const generationDriver = plan.mode === 'audio_conditioned' ? recordedDriver ?? driverSha256 : undefined;
            const driverPath = generationDriver && nodeModule.createRequire(import.meta.url)('../../skills/produce/references/compose-speech.js')
                .currentConditioningAudio(scene, dirname(file), { index: scenes.indexOf(scene), timingVersion: doc.performanceTimingVersion,
                driverSha256: generationDriver, includeCardAudio: Boolean(driverSha256), sceneRender: receipts.sceneRenders.get(videoPath),
                sceneCards: scenes.filter(card => card.scene === scene.scene), characters: doc.characters, audioPath: args.audioPath, sceneAudioPath: owner?.videoDirection?.audio?.path });
            const visual = object(scene.visual);
            const video = object(visual.video);
            if ((video.engine && video.engine !== plan.provider) || (video.model && video.model !== plan.model))
                throw new Error('Adapter does not match the selected shot model');
            const priorBinding = object(video.speechBinding);
            const replacement = Boolean(priorBinding.videoSha256 && priorBinding.videoSha256 !== videoSha256);
            const trim = object(scene.edit);
            let sourceEdit = native && replacement ? {} : trim;
            if (renderedShot && renderedScene) {
                const start = renderedShot.start_frame / renderedScene.fps, end = renderedShot.end_frame / renderedScene.fps;
                const kept = replacement ? {} : trim;
                const from = Number(kept.in ?? start), to = Number(kept.out ?? end);
                if (from < start - 1e-6 || to > end + 1e-6 || !(from < to))
                    throw new Error('speech_video_source_mismatch: select a source interval inside the recorded shot');
                sourceEdit = { ...trim, in: from, out: to };
            }
            const performanceSource = native || plan.mode === 'audio_conditioned'
                ? speechContract().videoPerformanceSource(videoPath, Boolean(driverSha256)) : speechContract().externalPictureSource(videoPath);
            if (performanceSource) {
                // Replacing a native clip clears trims measured on its predecessor.
                const candidate = { id: scene.id, narration: scene.narration, edit: sourceEdit,
                    visual: { video: { speechBinding: { mode: plan.mode, videoPath, videoSha256, audio, performanceSource, conditioningAudioSha256: driverSha256 } } } };
                speechContract().assertVideoPerformanceOwnership(scenes, dirname(file), candidate, receipts);
            }
            const performanceChanged = priorBinding.performanceRevision && priorBinding.performanceRevision !== plan.performanceRevision;
            const audioChanged = Array.isArray(priorBinding.audio) && JSON.stringify(priorBinding.audio) !== JSON.stringify(audio);
            const retiming = nodeModule.createRequire(import.meta.url)('../../skills/_shared/performance-retiming.js');
            const tailTrim = args.reuse === 'tail_trim' && priorBinding.videoSha256 === videoSha256 &&
                !audioChanged && Array.isArray(priorBinding.audio) && retiming.prefixCompatible(priorBinding, plan);
            if (args.reuse && !tailTrim)
                throw new Error('Tail trim requires identical bound audio, unchanged speech/action starts and semantics, and a shorter end. Regenerate changed speech or staging.');
            let quality = { review: 'not_reviewed', camera: 'not_reviewed', lipSync: 'not_reviewed' };
            try {
                const receipt = JSON.parse(readFileSync(videoPath + '.astra-job.json', 'utf8'));
                // Bind warnings to these exact bytes; a neighbour's receipt is not evidence.
                if (receipt.sha256 === videoSha256)
                    quality = { ...quality, speechSync: receipt.speechSync || null, selection: receipt.selection || null };
                else if (!receipt.sha256 && receipt.videoPath === videoPath)
                    quality = { ...quality, unverifiedSpeechSync: receipt.speechSync || null, receiptBinding: 'unverified' };
            }
            catch { /* Missing review evidence stays explicit, without blocking usable footage. */ }
            let boundSeconds;
            if (priorBinding.videoSha256 === videoSha256 && (performanceChanged || audioChanged) && !tailTrim) {
                plan.warnings.push('Unchanged video bytes retain their original performance and audio binding; the revised performance or speech has not been generated in this footage.');
                video.speechStatus = 'stale';
                invalidated = { video, edit: true };
            }
            else {
                if (!tailTrim)
                    boundSeconds = syncProductionClip(scene, dirname(file), videoPath, video.clip, plan.warnings);
                // edit.in / edit.out were measured on the clip they trimmed; on other bytes they would cut somewhere else, perhaps into the line.
                const trim = object(scene.edit);
                if (native && replacement && (trim.in !== undefined || trim.out !== undefined)) {
                    const { in: sourceIn, out: sourceOut, ...kept } = trim;
                    scene.edit = kept;
                    clearedTrim = { ...(sourceIn !== undefined ? { in: sourceIn } : {}), ...(sourceOut !== undefined ? { out: sourceOut } : {}),
                        note: 'The previous clip\'s trim was removed: it was measured on other footage. Set the shot duration and a new trim from soundtrack.' };
                }
                if (renderedShot)
                    scene.edit = sourceEdit;
                video.clip = args.videoPath;
                video.speechBinding = { ...plan, audio, videoPath, videoSha256, quality, ...(performanceSource && { performanceSource }),
                    ...(generationDriver && { generationAudioSha256: generationDriver, generationAudioPath: driverPath }), ...(driverSha256 ? { conditioningAudioSha256: driverSha256, conditioningAudioPath: driverPath } : {}),
                    ...(tailTrim ? { reuse: { kind: 'tail_trim', sourcePerformanceRevision: priorBinding.performanceRevision,
                            sourceDurationSeconds: priorBinding.durationSeconds, selectedDurationSeconds: plan.durationSeconds,
                            review: 'not_reviewed' } } : {}) };
                video.speechStatus = 'current';
            }
            if (native) {
                // Where the line sits in the clip: MSR often opens and closes on silent acting. Reported with a trim to listen to, never applied.
                try {
                    const span = nativeAudio?.span;
                    if (span) {
                        const trim = speechSpanContract().suggestTrim(span, scene);
                        soundtrack = { ...span, method: 'audio_energy', review: 'not_reviewed', ...(trim ? { suggestedEdit: trim.edit, suggestedDurationSeconds: trim.durationSeconds,
                                note: 'Silent acting surrounds the line. If the pause is not the story\'s, set these edit.in / edit.out source seconds and the shot duration with storyboard_apply; times inside the shot (sound.effects atSeconds, music starts) then count from the trimmed start. Listen first: loudness can miss a quiet first or last syllable.' } : {}) };
                        if (span.tailSilenceSeconds < 0.1)
                            plan.warnings.push('native_speech_end_at_boundary: audio activity reaches the clip end; inspect the final words for truncation before accepting or trimming. Energy does not verify complete dialogue.');
                    }
                    else {
                        plan.warnings.push('native_speech_audio_unverified: no sustained speech span could be measured; inspect audio presence and dialogue before accepting this clip.');
                    }
                }
                catch { /* advisory measurement; a clip that cannot be decoded is reported elsewhere */ }
                // The clip's soundtrack carries the dialogue, so it is the card's audio.
                scene.sound = { ...sound, audioSource: 'video' };
                for (const { line } of selected)
                    if (line.mediaStatus === 'needs_audio')
                        delete line.mediaStatus;
            }
            else if (plan.mode === 'audio_conditioned') {
                scene.sound = { ...sound, audioSource: driverSha256 ? 'speech' : 'video' };
            }
            else if (selected.length && plan.mode === 'voiceover') {
                scene.sound = { ...sound, audioSource: 'speech' };
            }
            else if (!selected.length && sound.audioSource !== 'speech') {
                let status;
                try {
                    status = audioSignalContract().inspect(videoPath).status;
                }
                catch {
                    plan.warnings.push('Could not decode the bound clip audio; inspect its sound source before assembly.');
                }
                if (status === 'signal' && sound.audioSource === 'video') {
                    const end = object(scene.edit).out;
                    if (typeof end === 'number' && !(end <= (boundSeconds ?? videoSeconds(videoPath)) + 0.001))
                        throw new Error('The replacement cannot cover edit.out; keep the current source or revise the authored trim before attaching it.');
                }
                else if (status === 'signal') {
                    const next = scenes.slice(scenes.indexOf(scene) + 1).find(shot => shot.type !== 'broll' && shot.type !== 'outro');
                    if (!bindGeneratedSoundtrack(scene, next, boundSeconds))
                        plan.warnings.push('This edit does not use the clip as sync footage. Carry its sound into the separate assembly audio or add post effects and ambience.');
                }
                else if (status === 'silent' || status === 'missing') {
                    const reason = status === 'missing' ? 'has no audio stream' : 'has a silent audio stream';
                    if (sound.audioSource === 'video' && (object(scene.edit).out !== undefined ||
                        (Array.isArray(sound.effects) && sound.effects.some(effect => ['native', 'input'].includes(String(object(effect).delivery))))))
                        throw new Error(`The replacement ${reason}; keep the current source or revise the authored soundtrack and trim before attaching it.`);
                    const silentSound = { ...sound };
                    delete silentSound.audioSource;
                    scene.sound = silentSound;
                    plan.warnings.push(`The bound speechless clip ${reason}. Add post effects or ambience before completing the mix.`);
                }
            }
            visual.video = video;
            scene.visual = visual;
            changed = true;
        }
    }
    if (args.action === 'plan_audio' && (!selected.length || selected.some(({ line }) => !line.id || !line.speaker || !line.delivery)))
        throw new Error('Prepare explicit speech before planning audio');
    if (changed) {
        const ids = new Set();
        for (const { scene, line } of all) {
            if (!line.id || ids.has(line.id))
                throw new Error('Dialogue ids must be present and unique');
            ids.add(line.id);
            const actor = character(line.speaker);
            if (actor?.tts)
                continue;
            const owner = win.STRUCTURE?.scenes?.find(item => item.no === scene.scene);
            if (!actor || !['on_screen', 'off_screen'].includes(line.delivery ?? '') || owner?.videoDirection?.dialogueVoice !== 'model_generated')
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
        refreshVideoReview(dirname(dirname(file)));
    }
    const audioPlans = args.action === 'plan_audio' ? selected.map(({ scene, line }) => {
        const result = speechAudioPlan(line, character(line.speaker), { boardDir: dirname(file), board: win });
        const generation = { ...result.generation, ...(result.generator === 'tts_astra_genai' ? {
                speechContext: { path: file, lineId: line.id, expectedRevision: revision },
            } : {}) };
        return { shotId: scene.id, lineId: line.id, ...result, generation, arguments: generation };
    }) : undefined;
    return { revision: hash(readFileSync(file)), changed, invalidated, plan, timing, ...(soundtrack ? { soundtrack } : {}), ...(clearedTrim ? { clearedTrim } : {}), ...(voiceWarnings.length ? { voiceWarnings } : {}), ...(audioPlans ? { audioPlans } : {}), lines: selected.map(({ scene, index, line }) => ({ shot: index + 1, shotId: scene.id, ...line, characterName: character(line.speaker)?.name, voice: character(line.speaker)?.tts, generationPlan: inspectionAudioPlan(line, character(line.speaker), { boardDir: dirname(file), board: win }), audioProvenanceStatus: object(object(object(scene.visual).video).speechBinding).mode === 'native' ? 'native_speech' : audioProvenanceStatus(line, character(line.speaker)), speechRevision: speechRevision(line, character(line.speaker)), audioCurrent: currentAudio(line, character(line.speaker)) })) };
}
