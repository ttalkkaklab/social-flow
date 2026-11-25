import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { evaluateWindowScript } from './scenes-vm.js';
import { validateSpeechAlignment, validateSpeechAudio } from './tts-audio.js';
const load = nodeModule.createRequire(import.meta.url);
const name = z.string().trim().min(1);
const percent = z.number().finite().min(0).max(100);
const digest = z.string().regex(/^[\da-f]{64}$/);
const directionId = z.string().regex(/^D[1-9]\d*$/, 'Use a canonical direction ID, such as D1 or D2.');
const stageSchema = z.enum(['synopsis', 'storyboard']);
const kindSchema = z.enum(['visual', 'speech', 'text', 'sound']);
const cueSchema = z.object({
    start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(), kind: kindSchema, text: name,
}).strict();
const synopsisSchema = z.object({
    direction: directionId, text: name, primaryHookType: name, opening: z.array(cueSchema), payoff: name.optional(),
}).strict();
const policySchema = z.object({
    combined: z.boolean().default(false), editorialCeiling: percent.default(40),
    observedCeiling: percent.optional(), minStarts: z.number().int().positive().optional(),
}).strict();
const ratingSchema = z.object({ score: z.number().int().min(0).max(2), evidence: name.optional() }).strict();
const verdictSchema = z.object({
    reviewerId: name, ratings: z.array(ratingSchema).length(5), reasonToStay: name.optional(), reasonToLeave: name.optional(),
}).strict();
const measurementSchema = z.object({
    source: name, sourceRevision: digest, surface: name, audience: name, window: name,
    definition: z.enum(['ended_before_3s', 'reels_skip_rate', 'other']), starts: z.number().int().nonnegative(),
    endedBefore3: z.number().int().nonnegative().optional(), ratePercent: percent.optional(),
    durationSeconds: z.number().positive(), denominator: name,
}).strict();
const candidateKey = z.object({ direction: directionId, sourceRevision: digest }).strict();
const policyVersion = 'opening-risk-v1';
export const openingReviewSchema = z.object({
    action: z.enum(['prepare', 'record', 'reserve_revision']), stage: stageSchema,
    path: name.optional().describe('Storyboard directory or scenes.js; supply expectedSha256 from storyboard_read.'),
    expectedSha256: digest.optional(), synopses: z.array(synopsisSchema).nonempty().optional(),
    receipt: z.record(z.unknown()).optional().describe('Latest inline receipt from this host, or synopsis handoff when enrolling a board.'),
    runId: name.optional(), startNewRun: z.boolean().optional().describe('Only for a separately requested new review. Requires a distinct run ID, board SHA and current receipt revision.'),
    direction: directionId.optional(), surface: name.optional(), audience: name.optional(), playback: z.enum(['sound_on', 'muted']).optional(),
    language: name.optional(), packaging: name.optional().describe('Only the title or thumbnail description actually visible before playback on this surface.'),
    policy: policySchema.optional(), sourceRevision: digest.optional(), packetDigest: digest.optional(),
    policyVersion: name.optional(), verdicts: z.array(verdictSchema).length(3).optional(), incompleteReason: name.optional(),
    measurement: measurementSchema.optional(), editorialFinding: name.optional().describe('Explain a concrete problem with this revision’s type, facts or payoff, including why it is ineligible for restoration.'), eligibleForRestore: z.boolean().optional().describe('False when the editor found a false payoff, invalid facts or conflicting type.'),
    expectedReceiptRevision: digest.optional(), requestId: name.optional(), candidates: z.array(candidateKey).nonempty().optional(),
}).strict();
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const rows = (v) => Array.isArray(v) ? v.map(obj) : [];
const value = (v) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
const finite = (v) => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
function fail(code, message) { throw new Error('opening_review_' + code + ': ' + message); }
function canonical(input) {
    if (Array.isArray(input))
        return input.map(canonical);
    if (input && typeof input === 'object')
        return Object.fromEntries(Object.entries(input)
            .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
    return input;
}
const sha = (input) => createHash('sha256').update(input).digest('hex');
const hash = (input) => sha(JSON.stringify(canonical(input)));
const fields = (source, keys) => Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
const keys = (...names) => Object.fromEntries(names.map(key => [key, true]));
function project(data, shape) {
    const result = {};
    for (const [key, rule] of Object.entries(shape)) {
        if (!Object.hasOwn(data, key))
            continue;
        const input = data[key];
        if (rule === true)
            result[key] = input;
        else if (Array.isArray(input))
            result[key] = input.map(item => project(obj(item), rule));
        else {
            const nested = project(obj(input), rule);
            if (Object.keys(nested).length)
                result[key] = nested;
        }
    }
    return result;
}
const eventFields = keys('kind', 'text', 'character', 'to', 'group', 'withGroup', 'durationSeconds');
const narrationFields = {
    ...keys('id', 'tts', 'speaker', 'delivery', 'voiceoverKind', 'estimatedSeconds'),
    acting: keys('leadInSeconds', 'tailOutSeconds', 'direction', 'tags'),
    audio: keys('path', 'sha256', 'revision'),
};
const frameFields = keys('start', 'end');
const timelineFields = {
    ...keys('startFrame', 'endFrame', 'transition', 'framing', 'action'),
    dialogueCues: keys('lineId', 'frame'), images: keys('frame', 'cue', 'role', 'path', 'character'),
    openingPositions: keys('character', 'position', 'images'),
};
const shotFields = {
    ...keys('id', 'type', 'after', 'scene', 'duration', 'transition', 'referenceImage'),
    visual: {
        ...keys('action', 'picture', 'overlay', 'bg', 'src', 'locationId', 'source', 'sync', 'clip'),
        frames: frameFields, reuse: keys('source', 'path', 'clip', 'sourceRange'),
        camera: { ...keys('preset', 'move', 'lensMm'), view: { ...keys('mode', 'subject', 'subjectId', 'crop', 'subjectType', 'viewerId'), target: keys('point', 'span') },
            end: keys('x', 'y', 'scale', 'pan', 'tilt', 'zoom', 'focus') },
    },
    shot: {
        ...keys('size', 'angle'), render: keys('mode'),
        composition: keys('mode', 'subject', 'subjectKind', 'position', 'eyeHeight', 'headroom', 'lookRoom', 'movement', 'leadRoom'),
        videoDesign: keys('before', 'action', 'after'),
    },
    edit: keys('in', 'out', 'pre', 'post', 'transitionSeconds'), timeline: timelineFields, performance: eventFields, narration: narrationFields,
    sound: keys('audioSource', 'musicGain'),
};
const effectFields = {
    ...keys('id', 'sfx', 'description', 'trigger', 'atSeconds', 'sourceStartSeconds', 'fadeInSeconds', 'fadeOutSeconds', 'separationLu', 'intensity', 'delivery'),
    end: keys('shotId', 'atSeconds'), audience: keys('intent', 'timingBasis'),
};
const compiledEffect = (effect) => !!effect.audience || effect.delivery === 'native' || effect.delivery === 'input';
const boardFile = (path) => basename(path) === 'scenes.js' ? resolve(path) : resolve(path, 'scenes.js');
const ledgerFile = (path) => join(dirname(boardFile(path)), 'opening-review.json');
function selectedScenario(path) {
    const hooks = load('../../skills/storyboard/references/opening-hook.js');
    const selected = hooks.readSelected(dirname(boardFile(path)));
    if (selected.issue)
        fail('selected_scenario', selected.issue.what);
    if (selected.hash === null)
        return selected;
    if (!selected.direction)
        fail('selected_scenario', 'The selected scenario needs a valid direction.');
    const raw = readFileSync(join(dirname(boardFile(path)), 'scenario.md'), 'utf8');
    if (sha(raw) !== selected.hash)
        fail('stale', 'The selected scenario changed during the read.');
    const { readContract } = load('../../skills/storyboard/references/scenario-v2.js');
    const contract = readContract(raw);
    const beats = rows(contract.beats), acted = beats.filter(beat => rows(beat.events).length), setups = rows(contract.setups);
    // The first and last performed beats and explicitly referenced setup/payoff beats
    // define the handoff. Formatting and unrelated prose do not change its identity.
    const endpoints = new Set([acted[0], acted.at(-1)]);
    for (const setup of setups) {
        for (const index of [setup.open, setup.pay])
            if (typeof index === 'number' && Number.isInteger(index) && index > 0)
                endpoints.add(beats[index - 1]);
    }
    const evidenceHash = hash({ direction: selected.direction, primaryHookType: selected.primaryHookType,
        endpoints: beats.filter(beat => endpoints.has(beat)).map(beat => rows(beat.events).map(event => fields(event, ['kind', 'character', 'to', 'text', 'claims', 'basis']))),
        setups: setups.map(setup => fields(setup, ['open', 'pay', 'detail', 'reinterpretation'])) });
    return { ...selected, evidenceHash };
}
function requireHook(type) {
    const catalog = load('../../skills/storyboard/references/opening-hook.js');
    if (typeof type !== 'string' || !catalog.ids.includes(type))
        fail('hook_type_invalid', 'Select one shipped primaryHookType.');
}
function audiencePacket(ledger) {
    const { audience, surface, language, packaging } = ledger;
    return { audience, surface, language, packaging, playback: ledger.playback ?? 'sound_on', timing: 'authored estimate', cues: [] };
}
function source(direction, packet, missing, snapshot, basis) {
    packet.cues.sort((a, b) => a.start - b.start);
    return { direction, sourceRevision: hash({ basis, packet, missing }), packetDigest: hash(packet), packet, missing: [...new Set(missing)], snapshot };
}
function synopsisSource(synopsis, ledger) {
    requireHook(synopsis.primaryHookType);
    const packet = audiencePacket(ledger), missing = [];
    // The planned rendition may quote just the dialogue within a sentence. Its source
    // still advances from the first sentence, without skipping a later paragraph or beat.
    const openingParagraph = synopsis.text.split(/\r?\n[^\S\r\n]*\r?\n/u, 1)[0];
    const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(openingParagraph)];
    const sourceMap = [];
    let lastSentence = -1, lastOffset = 0, lastTime = -1;
    for (const cue of synopsis.opening) {
        if (cue.end < cue.start || !synopsis.text.includes(cue.text))
            fail('source', 'Each estimated cue must quote the candidate and have an ordered interval.');
        if (cue.start < lastTime)
            fail('source', 'List opening cues in chronological order.');
        lastTime = cue.start;
        if (cue.start >= 3)
            continue;
        const start = openingParagraph.indexOf(cue.text, lastOffset);
        const end = start + cue.text.length;
        const sentence = sentences.findIndex(span => span.index <= start && start < span.index + span.segment.length);
        const endingSentence = sentences.findIndex(span => span.index < end && end <= span.index + span.segment.length);
        if (start < 0 || sentence < 0 || endingSentence < 0 || sentence > lastSentence + 1)
            fail('source', 'Map the opening to consecutive source sentences starting with the first sentence of the synopsis.');
        const prefix = openingParagraph.slice(Math.max(sentences[sentence].index, lastOffset), start);
        const quotedSpeech = cue.kind === 'speech' && /^[^“”‘’"「」『』]*[“‘"「『]\s*$/u.test(prefix);
        if (/[\p{L}\p{N}]/u.test(prefix) && !quotedSpeech)
            fail('source', 'Start at the beginning of the performed clause. Only an attribution before quoted speech may be omitted.');
        lastSentence = endingSentence;
        lastOffset = end;
        sourceMap.push({ start, end, sentence: sentence + 1 });
        if (packet.playback === 'muted' && (cue.kind === 'speech' || cue.kind === 'sound'))
            continue;
        if (cue.end > 3) {
            missing.push('Split the estimated cue at 3.0 seconds and quote only evidence available before the boundary.');
            continue;
        }
        packet.cues.push(cue);
    }
    if (!packet.cues.length)
        missing.push('No documented opening cue in the first three seconds.');
    return source(synopsis.direction, packet, missing, { synopsis, sourceMap }, synopsis);
}
/** Use the saved line's verified WAV and its character clock when a sentence crosses the cutoff. */
function alignedLine(line, directory) {
    const audio = obj(line.audio), path = value(audio.path);
    if (!path || !/\.wav$/i.test(path) || !digest.safeParse(audio.sha256).success || obj(audio.generation).text !== line.tts)
        return;
    const wav = resolve(directory, path), sidecar = wav.replace(/\.wav$/i, '.alignment.json');
    if (!existsSync(wav) || !existsSync(sidecar))
        return;
    try {
        const bytes = readFileSync(wav);
        if (createHash('sha256').update(bytes).digest('hex') !== audio.sha256)
            return;
        const duration = validateSpeechAudio(bytes, 'wav'), document = JSON.parse(readFileSync(sidecar, 'utf8'));
        const alignment = document.alignment;
        if (!alignment || alignment.characters.join('') !== line.tts)
            return;
        validateSpeechAlignment(alignment, duration);
        return { duration, alignment };
    }
    catch {
        return;
    }
}
/** A transcript quotes a specific clip in clip-local seconds. A group crossing a trim or
 * the review boundary has no word timing, so the portion inside cannot be reconstructed. */
function recordedSpeech(shot, records, directory, duration, cardStart, margin, packet, missing) {
    const visual = obj(shot.visual), reuse = obj(visual.reuse), edit = obj(shot.edit);
    const clip = value(reuse.clip) ?? value(visual.clip);
    const uncertain = (why) => missing.push(why + ' on ' + String(shot.id));
    let sourceIn = finite(edit.in) ?? 0;
    if (visual.source !== 'recording' && !reuse.clip || !clip || records.length !== 1 ||
        records[0].source !== clip || rows(shot.narration).length || !Array.isArray(records[0].groups)) {
        uncertain('Recorded speech needs one matching clip transcript and no competing narration');
        return;
    }
    if (packet.playback !== 'muted' && reuse.clip && !(obj(shot.sound).audioSource === 'video' || visual.sync === true)) {
        uncertain('The reused clip transcript has no selected original audio track');
        return;
    }
    if (edit.in !== undefined && finite(edit.in) === undefined) {
        uncertain('Invalid source audio trim');
        return;
    }
    if (sourceIn || edit.out !== undefined) {
        if (sourceIn < 0 || reuse.clip || obj(shot.sound).audioSource !== 'video') {
            uncertain('The transcript trim needs a card that plays its own soundtrack');
            return;
        }
        if (sourceIn > 0) {
            try {
                const { assetPath } = load('../../skills/produce/references/check-production.js');
                const rate = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate',
                    '-of', 'csv=p=0', assetPath(directory, clip)], { encoding: 'utf8', timeout: 3000 }).trim().split('/').map(Number);
                const fps = rate[0] / (rate[1] ?? 1);
                if (!(fps > 0 && Number.isFinite(fps)))
                    throw Error('missing source frame rate');
                // prepare-source-audio advances to the first source frame at or after edit.in.
                sourceIn = Math.ceil(sourceIn * fps - 1e-6) / fps;
            }
            catch {
                uncertain('The transcript needs the resolved source audio trim for this clip');
                return;
            }
        }
        if (edit.out !== undefined && (finite(edit.out) === undefined || Math.abs(Number(edit.out) - sourceIn - duration) > 0.05)) {
            uncertain('The transcript source trim disagrees with the shot duration');
            return;
        }
    }
    const groups = rows(records[0].groups), events = rows(shot.performance);
    const spoken = events.filter(event => event.kind === 'dialogue' || event.kind === 'narration');
    let lastEnd = 0;
    if (!groups.length || groups.some(group => {
        const start = finite(group.start), end = finite(group.end);
        if (!value(group.text) || start === undefined || end === undefined || start < lastEnd || end <= start || reuse.clip && end > duration)
            return true;
        lastEnd = end;
        return false;
    }) || spoken.some(event => {
        const group = typeof event.group === 'number' && Number.isInteger(event.group) && event.group > 0 ? groups[event.group - 1] : undefined;
        return !group || !!event.character && group.speaker !== event.character;
    })) {
        uncertain('Recorded speech groups must identify ordered source intervals and match any attributed performance');
        return;
    }
    const available = Math.min(duration, 3 - cardStart);
    for (const group of packet.playback === 'muted' ? [] : groups) {
        const start = Number(group.start) - sourceIn + margin, end = Number(group.end) - sourceIn + margin;
        if (start >= available || end <= 0)
            continue;
        if (start < 0 || end > available) {
            uncertain('No timed prefix for recorded speech crossing the available interval');
            continue;
        }
        packet.cues.push({ kind: 'speech', text: String(group.text), start: cardStart + start, end: cardStart + end });
    }
    // Recorded actions use the source picture clock. A simultaneous action starts with
    // its actual recorded group. An untimed action cannot borrow a line's duration.
    let actionClock = 0;
    for (const event of events) {
        if (event.kind !== 'action') {
            const group = groups[Number(event.group) - 1];
            if (group)
                actionClock = Number(group.end);
            continue;
        }
        const anchor = groups[Number(event.withGroup) - 1];
        const start = event.withGroup === undefined ? actionClock : finite(anchor?.start);
        const length = finite(event.durationSeconds);
        const end = start !== undefined && length !== undefined && length > 0 ? start + length : finite(anchor?.end);
        if (event.withGroup === undefined)
            actionClock = end;
        if (start !== undefined && start >= sourceIn + available || end !== undefined && end <= sourceIn)
            continue;
        if (start === undefined || end === undefined || start < sourceIn || end > sourceIn + available || !value(event.text)) {
            uncertain('Recorded performance action timing does not establish what is visible in the opening');
            continue;
        }
        packet.cues.push({ kind: 'visual', text: String(event.text), start: cardStart + start - sourceIn, end: cardStart + end - sourceIn });
    }
}
const postSound = () => load('../../skills/storyboard/references/audience-effects.js');
function openingSoundReader(board, directory) {
    const audio = load('../../skills/_shared/audio-signal.js');
    const { assetPath } = load('../../skills/produce/references/check-production.js');
    const frameRates = new Map();
    const inspected = new Map();
    let clock;
    function audible(path, start, window) {
        if (!value(path) || start < 0 || window <= 0)
            return;
        const file = assetPath(directory, String(path));
        if (!existsSync(file))
            return;
        if (!inspected.has(file)) {
            const signal = audio.inspect(file);
            inspected.set(file, { ...signal, hash: createHash('sha256').update(readFileSync(file)).digest('hex') });
        }
        const signal = inspected.get(file);
        const overlap = Math.min(window, signal.duration - start);
        if (signal.status === 'signal' && overlap > 0 && !audio.covers(signal.spans, start, overlap))
            return signal.hash;
    }
    function retainedClip(clip, trim, at, window) {
        const path = assetPath(directory, clip);
        if (!frameRates.has(path)) {
            const fps = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate',
                '-of', 'csv=p=0', path], { encoding: 'utf8', timeout: 3000 }).trim().split('/').map(Number);
            frameRates.set(path, fps[0] / (fps[1] ?? 1));
        }
        const fps = frameRates.get(path);
        if (!(fps > 0 && Number.isFinite(fps) && trim >= 0))
            return;
        return audible(path, Math.ceil(trim * fps - 1e-6) / fps + at, window);
    }
    function sceneTrackMixed(clip, clipHash, driver, shotId) {
        const file = assetPath(directory, clip);
        const { readSceneRequest } = load('../../skills/_shared/scene-speech-receipt.js');
        for (const suffix of ['.astra-genai.json', '.astra-job.json']) {
            if (!existsSync(file + suffix))
                continue;
            const receipt = JSON.parse(readFileSync(file + suffix, 'utf8'));
            if (receipt.sha256 !== clipHash || receipt.operation !== 'scene-to-video')
                continue;
            const wire = readSceneRequest(file, receipt), body = obj(wire.body), track = obj(body.scene_audio);
            if (body.generate_audio === false || track.mode !== 'mix' || !rows(body.shots).some(s => s.shot_id === shotId) ||
                track.start_frame !== 0 || track.end_frame !== body.num_frames)
                continue;
            const uri = value(track.audio_uri), media = rows(wire.attachments).filter(x => x.role === 'scene_audio' && !x.shotId);
            if (uri?.startsWith('genai-file://') && media.length === 1 && media[0].sha256 === driver)
                return true;
            if (uri?.startsWith('data:audio/') && uri.includes(';base64,') &&
                createHash('sha256').update(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')).digest('hex') === driver)
                return true;
        }
        return false;
    }
    return (shot, scene, fps, sceneTime, cardStart, duration, packet, missing, evidence) => {
        if (packet.playback === 'muted')
            return;
        const sound = obj(shot.sound), visual = obj(shot.visual), video = obj(visual.video), binding = obj(video.speechBinding);
        const clip = value(video.clip) ?? value(visual.clip) ?? value(obj(visual.reuse).clip);
        const edit = obj(shot.edit), sourceIn = finite(edit.in) ?? 0, cut = Math.min(duration, 3 - cardStart);
        const clipSelected = sound.audioSource === 'video' && clip && !edit.pre && !edit.post && video.generateAudio !== false && video.speechStatus !== 'stale';
        const issue = (description) => missing.push(description + ' on ' + String(shot.id) + '.');
        const emit = (text, at) => packet.cues.push({ kind: 'sound', text, start: cardStart + at, end: cardStart + at });
        const effects = rows(sound.effects);
        for (const effect of effects) {
            // The final compiler deliberately drops untagged legacy scene effects.
            if (!compiledEffect(effect))
                continue;
            const at = finite(effect.atSeconds), description = value(effect.description);
            if (at !== undefined && at >= cut)
                continue;
            if (!description || !value(effect.trigger) || at === undefined || at < 0) {
                issue('Unresolved effect description, trigger or onset');
                continue;
            }
            try {
                if (effect.audience) {
                    postSound().checkDelivery(shot.id, effect);
                    const levels = { subtle: 10, normal: 6, strong: 3 };
                    const separation = finite(effect.separationLu ?? levels[String(effect.intensity || 'normal')]);
                    if (!value(effect.id) || !value(effect.sfx) || !value(obj(effect.audience).intent) ||
                        effects.filter(other => other.id === effect.id).length !== 1 ||
                        effects.some(other => ['input', 'native'].includes(String(other.delivery)) && other.sfx === effect.sfx) ||
                        separation === undefined || separation < 0 || separation > 30)
                        throw Error('The audience effect cannot be compiled');
                    clock ??= postSound().boardClock(board, directory);
                    clock.bounds(shot.id, effect);
                    const placed = clock.row(shot.id, effect);
                    const window = obj(effect.end).shotId === shot.id && finite(obj(effect.end).atSeconds) !== undefined
                        ? Math.min(cut - at, Number(obj(effect.end).atSeconds) - at) : cut - at;
                    const asset = placed.source;
                    if (placed.status !== 'placed' || !asset.available || !asset.sha256 || asset.derivation?.status === 'invalid' ||
                        audible(asset.path, finite(effect.sourceStartSeconds) ?? 0, window) !== asset.sha256)
                        throw Error('The audience effect needs a current placement and audible source');
                    evidence.push({ effect: effect.id, shot: shot.id, postSource: asset.sha256 });
                }
                else {
                    if (!clipSelected || !clip || !value(effect.trigger))
                        throw Error('This effect needs the retained source-video soundtrack');
                    const clipHash = retainedClip(clip, sourceIn, at, cut - at);
                    if (!clipHash || binding.videoSha256 && binding.videoSha256 !== clipHash)
                        throw Error('The selected clip has no current audible soundtrack in this interval');
                    if (effect.delivery === 'input') {
                        const driverHash = audible(binding.conditioningAudioPath, sourceIn + at, cut - at);
                        if (binding.mode !== 'audio_conditioned' || binding.videoSha256 !== clipHash || !driverHash || driverHash !== binding.conditioningAudioSha256)
                            throw Error('The effect needs the bound supplied soundtrack');
                    }
                    else if (binding.mode === 'audio_conditioned' || video.operation === 'audio')
                        throw Error('Native effects are unavailable on the supplied-track route');
                    evidence.push({ effect: effect.id, shot: shot.id, clipHash });
                }
                emit(description, at);
            }
            catch (error) {
                issue(error.message);
            }
        }
        const track = obj(scene.audio);
        for (const mark of rows(track.cues)) {
            const frame = finite(mark.frame);
            if (frame === undefined || fps <= 0)
                continue;
            const sceneAt = frame / fps, at = sceneAt - sceneTime;
            if (at < 0 || at >= cut)
                continue;
            // Scene cue actions can describe movements driven by a conditioning track.
            // They are not words or identifiable sounds. Credit only audible retained media.
            try {
                if (!clipSelected || !clip)
                    continue;
                const trackHash = audible(track.path, sceneAt, cut - at), clipHash = retainedClip(clip, sourceIn, at, cut - at);
                if (!trackHash || !clipHash || binding.videoSha256 && binding.videoSha256 !== clipHash)
                    continue;
                const retained = track.mode === 'mix' ? sceneTrackMixed(clip, clipHash, trackHash, shot.id) :
                    binding.mode === 'audio_conditioned' && binding.videoSha256 === clipHash && binding.conditioningAudioSha256 === trackHash;
                if (!retained)
                    continue;
                evidence.push({ sceneAudio: trackHash, shot: shot.id, clipHash, frame, mode: track.mode, path: track.path });
                emit('Sound from the retained scene track.', at);
            }
            catch {
                issue('Scene soundtrack retention or timing could not be verified');
            }
        }
    };
}
function boardSource(path, ledger, direction, selected, expectedSha) {
    const file = boardFile(path), raw = readFileSync(file, 'utf8');
    if (expectedSha && sha(raw) !== expectedSha)
        fail('stale', 'Board SHA changed; read the current storyboard.');
    const board = evaluateWindowScript(raw, { filename: file });
    const story = obj(board.STORY), structure = obj(board.STRUCTURE);
    requireHook(story.primaryHookType);
    if (selected.hash !== null && selected.primaryHookType !== story.primaryHookType)
        fail('hook_type_conflict', 'The saved board and selected scenario have different hooks.');
    if (selected.direction && selected.direction !== direction)
        fail('direction', 'The saved scenario selects ' + selected.direction + ' but this review belongs to ' + direction + '.');
    const shots = rows(board.SCENES), owners = rows(structure.scenes);
    const contract = load('../../skills/storyboard/references/structure-contract.js');
    const acting = load('../../skills/_shared/scene-acting.js');
    const ordered = contract.outline(board, 'outline').playback.map(({ no }) => shots[no - 1]);
    const editPlan = load('../../skills/produce/references/edit-plan.js');
    const hooks = load('../../skills/storyboard/references/opening-hook.js');
    const recorded = rows(story.transcripts);
    const readSound = openingSoundReader(board, dirname(file));
    const packet = audiencePacket(ledger), missing = [], openingShots = [], ownerEvidence = [];
    let cursor = 0;
    const sceneClocks = new Map();
    for (const shot of ordered) {
        if (cursor >= 3)
            break;
        const timeline = obj(shot.timeline), visual = obj(shot.visual), plan = obj(shot.shot), design = obj(plan.videoDesign);
        const scene = owners.find(item => item.no === shot.scene), video = obj(scene?.videoDirection);
        const fps = finite(video.fps) ?? 24, startFrame = finite(timeline.startFrame), endFrame = finite(timeline.endFrame);
        const explicit = startFrame !== undefined && endFrame !== undefined && endFrame > startFrame && fps > 0;
        const duration = explicit ? (endFrame - startFrame) / fps : finite(shot.duration);
        const sceneClock = sceneClocks.get(shot.scene) ?? 0;
        if (explicit && (Math.abs(startFrame / fps - sceneClock) > 0.5 / fps ||
            (finite(shot.duration) !== undefined && Math.abs(Number(shot.duration) - duration) > 0.5 / fps))) {
            missing.push('Stored shot and frame timing disagree for ' + String(shot.id));
        }
        const openingShot = project(shot, shotFields);
        if (packet.playback !== 'muted') {
            const effects = rows(obj(shot.sound).effects);
            // Retain actual board indices for leaf-level restoration. Omitted legacy
            // effects must not change the identity of an already reviewed opening.
            const last = effects.map(compiledEffect).lastIndexOf(true);
            if (last >= 0)
                openingShot.sound = { ...obj(openingShot.sound), effects: effects.slice(0, last + 1)
                        .map(effect => compiledEffect(effect) ? project(effect, effectFields) : {}) };
        }
        openingShots.push(openingShot);
        ownerEvidence.push({ scene: shot.scene, fps, frames: project(obj(scene?.frames), frameFields) });
        if (!duration || duration <= 0) {
            missing.push('Missing shot duration at ' + cursor + ' seconds.');
            break;
        }
        const end = cursor + duration, priorCueCount = packet.cues.length;
        const cue = (kind, text, at, until = at) => {
            if (packet.playback === 'muted' && (kind === 'sound' || kind === 'speech'))
                return;
            const content = value(text);
            if (content && at >= cursor && at < Math.min(3, end) && until <= 3 && until >= at)
                packet.cues.push({ kind, text: content, start: at, end: until });
        };
        const first = value(design.before) ?? value(obj(obj(visual.camera).view).subject);
        cue('visual', first, cursor);
        const card = hooks.visibleCardText(board, shot);
        if (card) {
            for (const text of card.first)
                cue('text', text, cursor);
            // The later groups are visible sometime within a completed card. A longer card
            // that crosses the cutoff needs reveal timing before those words can be credited.
            if (end <= 3) {
                for (const text of card.later)
                    cue('text', text, cursor, end);
            }
            else if (card.later.length) {
                missing.push('The later HTML text reveals on ' + String(shot.id) + ' need timing to locate them around 3.0 seconds.');
            }
            Object.assign(openingShots[openingShots.length - 1], project(shot, { ...keys('title', 'kicker', 'stat', 'statLabel', 'speaker', 'role', 'text', 'sub', 'footnote'), bullets: keys('t', 'd') }));
            ownerEvidence.push({ overlayText: card });
        }
        for (const image of rows(timeline.images)) {
            const frame = finite(image.frame);
            if (explicit && frame !== undefined && ['start', 'keyframe', 'end'].includes(String(image.role)))
                cue('visual', image.cue, cursor + (frame - startFrame) / fps);
        }
        readSound(shot, video, fps, sceneClock, cursor, duration, packet, missing, ownerEvidence);
        const sound = obj(shot.sound);
        const performances = rows(shot.performance), lines = rows(shot.narration);
        const shotNo = shots.indexOf(shot) + 1;
        const transcripts = recorded.filter(record => record.shot === shotNo);
        if (transcripts.length)
            ownerEvidence.push({ shot: shotNo, transcripts: transcripts.map(item => project(item, { ...keys('source', 'shot'), groups: keys('speaker', 'text', 'start', 'end') })) });
        const live = visual.source === 'recording' || !!visual.reuse;
        const hasRecordedWords = !!transcripts.length || live && !lines.length && performances.some(event => ['dialogue', 'narration'].includes(String(event.kind)));
        const sync = visual.sync === true || sound.audioSource === 'video';
        let margin = 0, usableSpeechTiming = true;
        if ((lines.length || hasRecordedWords) && packet.playback !== 'muted') {
            try {
                margin = editPlan.narrationPre(obj(shot.edit), String(shot.transition ?? 'cut'), sync);
                if (margin && (sync || /^(jcut|dissolve|iris|blur|zoom|push:|whip:)/.test(String(shot.transition))))
                    throw new Error('A synchronized or carried voice starts at the card boundary');
            }
            catch {
                usableSpeechTiming = false;
                missing.push('Invalid narration pre-roll on ' + String(shot.id));
            }
        }
        if (hasRecordedWords && usableSpeechTiming && (packet.playback !== 'muted' || performances.some(event => event.kind === 'action')))
            recordedSpeech(shot, transcripts, dirname(file), duration, cursor, margin, packet, missing);
        const action = value(timeline.action) ?? value(visual.action) ?? value(design.action);
        if (action && !performances.some(event => event.kind === 'action')) {
            if (end <= 3)
                cue('visual', action, cursor, end);
            else if (!first && !packet.cues.some(item => item.start >= cursor && item.kind === 'visual'))
                missing.push('Separate what is visible before 3.0 seconds from the rest of the shot action.');
        }
        if (!hasRecordedWords && (performances.length || lines.length)) {
            try {
                const aligned = new Map(lines.map(line => [line.id, alignedLine(line, dirname(file))]));
                const clock = acting.planScenePerformance({ ...shot, timelineFps: fps }, line => aligned.get(line.id)?.duration ?? finite(line.estimatedSeconds) ?? acting.estimateSpeech(line.tts, story.language)?.seconds ?? null);
                for (const event of clock.performance) {
                    const speech = event.kind !== 'action';
                    if (speech && (!usableSpeechTiming || packet.playback === 'muted'))
                        continue;
                    const explicitCue = rows(timeline.dialogueCues).find(item => item.lineId === event.lineId);
                    const onsetFrame = finite(explicitCue?.frame);
                    const timedStart = finite(speech ? event.speechStartSeconds : event.startSeconds);
                    let start = timedStart, stop = finite(speech ? event.speechEndSeconds : event.endSeconds);
                    if (speech && explicit && onsetFrame !== undefined) {
                        start = (onsetFrame - startFrame) / fps;
                        if (timedStart !== undefined && stop !== undefined)
                            stop += start - timedStart;
                    }
                    if (speech && start !== undefined) {
                        start += margin;
                        if (stop !== undefined)
                            stop += margin;
                    }
                    if (start === undefined) {
                        missing.push('Unresolved event onset on ' + String(shot.id));
                        continue;
                    }
                    if (cursor + start >= 3)
                        continue;
                    if (stop === undefined || stop > duration + 0.05 || cursor + stop > 3) {
                        const timing = speech && aligned.get(event.lineId)?.alignment;
                        if (timing) {
                            const available = Math.min(3 - cursor, duration) - start;
                            const count = timing.character_end_times_seconds.filter(at => at <= available).length;
                            if (count)
                                cue('speech', timing.characters.slice(0, count).join(''), cursor + start, cursor + start + timing.character_end_times_seconds[count - 1]);
                            continue;
                        }
                        missing.push('No timed prefix for a ' + (speech ? 'spoken' : 'visible') + ' event crossing the available interval on ' + String(shot.id));
                        continue;
                    }
                    cue(speech ? 'speech' : 'visual', event.text, cursor + start, cursor + stop);
                }
            }
            catch {
                missing.push('Performance timing could not be resolved on ' + String(shot.id));
            }
        }
        if (packet.cues.length === priorCueCount)
            missing.push('Supply an observable starting state, action or timed cue for ' + String(shot.id) + '.');
        sceneClocks.set(shot.scene, sceneClock + duration);
        cursor = end;
    }
    if (!packet.cues.length)
        missing.push('No audience-visible or audible evidence in the opening.');
    if (cursor < 3)
        missing.push('The board does not establish a full three-second interval.');
    const payoffScenes = new Set(rows(structure.sequences).map(item => finite(item.payoff)).filter(no => no !== undefined));
    const comprehension = obj(board.COMPREHENSION), payoffRef = obj(story.payoff), endingRef = obj(story.ending);
    const payoffShots = new Set([payoffRef.shot, endingRef.shot, ...rows(comprehension.branches).map(branch => branch.pay)]);
    const payoff = {
        payoffReference: fields(payoffRef, ['shot', 'event', 'quote']), endingReference: fields(endingRef, ['shot', 'event', 'quote']), comprehension: comprehension.answer,
        sequences: rows(structure.sequences).map(item => fields(item, ['id', 'question', 'payoff'])),
        transcripts: recorded.filter(transcript => {
            const no = finite(transcript.shot), shot = no !== undefined && shots[no - 1];
            return shot && (payoffShots.has(no) || typeof shot.scene === 'number' && payoffScenes.has(shot.scene) || shot === ordered.at(-1));
        }).map(item => project(item, { ...keys('shot', 'source'), groups: keys('speaker', 'text', 'start', 'end') })),
        evidence: shots.filter((shot, index) => (typeof shot.scene === 'number' && payoffScenes.has(shot.scene)) || payoffShots.has(index + 1) || shot === ordered.at(-1))
            .map(shot => project(shot, { ...keys('id', 'scene', 'summary'), performance: eventFields, narration: narrationFields,
            visual: keys('action'), timeline: keys('action'), shot: { videoDesign: keys('before', 'action', 'after') } })),
    };
    const snapshot = { openingShots, primaryHookType: story.primaryHookType, sceneEvidence: ownerEvidence };
    const basis = { direction, primaryHookType: story.primaryHookType, selectedScenario: selected.evidenceHash,
        format: board.FORMAT, language: story.language, openingShots, ownerEvidence, payoff };
    return source(direction, packet, missing, snapshot, basis);
}
function same(left, right) { return hash(left) === hash(right); }
function snapshotReceipt(ledger) {
    return { version: 1, ledger, revision: hash(ledger) };
}
function readReceipt(receipt) {
    const envelope = obj(receipt), data = obj(envelope.ledger);
    if (envelope.version !== 1 || envelope.revision !== hash(data) || data.version !== 1 ||
        !name.safeParse(data.runId).success || !name.safeParse(data.surface).success || !name.safeParse(data.audience).success ||
        !Array.isArray(data.current) || !Array.isArray(data.entries) || !Array.isArray(data.reservations) ||
        !policySchema.safeParse(data.policy).success || data.reservations.length > 5)
        fail('receipt', 'Invalid or incomplete review receipt; recover the previous handoff.');
    const reservations = rows(data.reservations);
    if (reservations.some((r, i) => r.slot !== i + 1 || !Array.isArray(r.usedBy) || !Array.isArray(r.candidates) ||
        !stageSchema.safeParse(r.stage).success || !name.safeParse(r.requestId).success) ||
        new Set(reservations.map(r => r.requestId)).size !== reservations.length)
        fail('receipt', 'Invalid round history.');
    return structuredClone(data);
}
function readDisk(path) {
    const file = ledgerFile(path);
    return existsSync(file) ? readReceipt(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
}
function findEntry(ledger, stage, direction, revision) {
    return ledger.entries.find(entry => entry.stage === stage && entry.direction === direction && entry.sourceRevision === revision);
}
function currentEntry(ledger, stage, direction) {
    const current = ledger.current.find(row => row.stage === stage && row.direction === direction);
    return current && findEntry(ledger, stage, direction, current.sourceRevision);
}
function limitFor(ledger, stage) { return stage === 'synopsis' && ledger.policy.combined ? 4 : 5; }
function newLedger(args) {
    if (args.action !== 'prepare' || !args.surface || !args.audience)
        fail('prepare', 'Start with an audience brief and surface.');
    const policy = policySchema.parse(args.policy ?? {});
    if ((policy.observedCeiling === undefined) !== (policy.minStarts === undefined))
        fail('policy', 'Provide observedCeiling and minStarts together.');
    return { version: 1, runId: args.runId ?? randomUUID(), audience: args.audience, surface: args.surface,
        language: args.language, packaging: args.packaging, playback: args.playback ?? 'sound_on', policy, entries: [], current: [], reservations: [] };
}
function checkRun(args, ledger) {
    if ((args.runId && args.runId !== ledger.runId) || (args.surface && args.surface !== ledger.surface) ||
        (args.audience && args.audience !== ledger.audience) || (args.playback && args.playback !== ledger.playback) || (args.language && args.language !== ledger.language) ||
        (args.packaging && args.packaging !== ledger.packaging) || (args.policy && !same(args.policy, ledger.policy)))
        fail('run', 'Run ID, audience, surface and scoring policy must match the saved receipt.');
    if (args.action !== 'prepare' && args.runId !== ledger.runId)
        fail('run', 'Supply the run ID from prepare.');
}
function remember(ledger, stage, item) {
    const previous = currentEntry(ledger, stage, item.direction);
    if (previous?.sourceRevision === item.sourceRevision)
        return previous;
    const typeOf = (entry) => stage === 'synopsis' ? obj(entry.snapshot.synopsis).primaryHookType : entry.snapshot.primaryHookType;
    if (previous && typeOf(previous) !== typeOf(item))
        fail('hook_type_conflict', 'Revisions in this run preserve the selected hook. Start a separately requested run for intentional reselection.');
    const existing = findEntry(ledger, stage, item.direction, item.sourceRevision);
    const reservation = ledger.reservations.find(row => row.stage === stage && !row.usedBy.includes(item.direction) &&
        row.candidates.some(c => c.direction === item.direction && c.sourceRevision === previous?.sourceRevision));
    if (previous?.assessment?.status === 'high' && !reservation && !existing?.assessment?.eligibleForRestore)
        fail('reservation', 'Reserve the high-risk candidate before revising its opening.');
    if (reservation)
        reservation.usedBy.push(item.direction);
    if (!existing)
        ledger.entries.push({ ...item, stage });
    ledger.current = ledger.current.filter(row => row.stage !== stage || row.direction !== item.direction);
    ledger.current.push({ stage, direction: item.direction, sourceRevision: item.sourceRevision });
    return findEntry(ledger, stage, item.direction, item.sourceRevision);
}
function prepare(args, ledger, selected) {
    let sources;
    if (args.stage === 'storyboard') {
        const earlier = ledger.current.filter(row => row.stage === 'synopsis');
        const direction = args.direction ?? selected?.direction ?? ledger.boardDirection ?? (earlier.length === 1 ? earlier[0].direction : undefined) ??
            (earlier.length ? fail('direction', 'Choose the synopsis direction carried into this board.') : 'D1');
        if (ledger.boardDirection && ledger.boardDirection !== direction || earlier.length && !earlier.some(row => row.direction === direction))
            fail('direction', 'Board direction does not match the handoff.');
        ledger.boardDirection = direction;
        sources = [boardSource(args.path, ledger, direction, selected, args.expectedSha256)];
        const synopsis = currentEntry(ledger, 'synopsis', direction);
        if (synopsis && obj(synopsis.snapshot.synopsis).primaryHookType !== sources[0].snapshot.primaryHookType)
            fail('hook_type_conflict', 'The selected synopsis and board use different hooks.');
    }
    else {
        if (!args.synopses?.length)
            fail('source', 'Supply a nonempty inline synopsis batch.');
        if (ledger.boardDirection)
            fail('stage', 'The run has advanced to its storyboard.');
        if (new Set(args.synopses.map(item => item.direction)).size !== args.synopses.length)
            fail('direction', 'Duplicate synopsis direction.');
        const previous = ledger.current.filter(c => c.stage === 'synopsis');
        if (previous.length && args.synopses.some(s => !previous.some(c => c.direction === s.direction)))
            fail('direction', 'A continuation may only revise candidates in its original batch.');
        sources = args.synopses.map(synopsis => synopsisSource(synopsis, ledger));
    }
    const pending = ledger.reservations.filter(row => row.stage === args.stage && row.usedBy.length < row.candidates.length);
    for (const item of sources) {
        const previous = currentEntry(ledger, args.stage, item.direction);
        if (pending.length && previous && previous.sourceRevision !== item.sourceRevision &&
            !pending.some(row => row.candidates.some(c => c.direction === item.direction && c.sourceRevision === previous.sourceRevision)))
            fail('reservation', 'An active reservation covers only its named candidates and source revisions.');
    }
    const packets = sources.map(item => {
        const entry = remember(ledger, args.stage, item);
        return { direction: item.direction, sourceRevision: item.sourceRevision, packetDigest: item.packetDigest,
            packet: item.packet, missing: item.missing, ...editorialEvidence(entry.assessment), status: summary(ledger, args.stage, item.direction, entry).status };
    });
    return { packets, policyVersion };
}
function score(args, ledger, entry) {
    const verdicts = args.verdicts ?? [], observation = args.measurement;
    const requestDigest = hash({ verdicts, observation, incompleteReason: args.incompleteReason, eligibleForRestore: args.eligibleForRestore, editorialFinding: args.editorialFinding });
    if (args.incompleteReason || entry.missing.length) {
        const reasons = [...entry.missing, ...(args.incompleteReason ? [args.incompleteReason] : [])];
        return { status: 'incomplete', findings: reasons.map(cue => ({ at: '0–3 s', cue })), verdicts: [], eligibleForRestore: false, editorialFinding: args.editorialFinding, requestDigest };
    }
    if (verdicts.length !== 3 || new Set(verdicts.map(v => v.reviewerId)).size !== 3)
        fail('reviewers', 'Supply three distinct blind reviewer IDs or an incompleteReason.');
    const usedIds = new Set(ledger.entries.filter(other => other !== entry).flatMap(other => other.assessment?.verdicts.map(v => v.reviewerId) ?? []));
    if (verdicts.some(v => usedIds.has(v.reviewerId)))
        fail('reviewers', 'Use fresh reviewer invocations for each candidate revision.');
    const findings = [];
    for (const verdict of verdicts) {
        if (!verdict.reasonToStay && !verdict.reasonToLeave && !verdict.ratings.some(r => r.score > 0 && r.evidence))
            fail('evidence', 'Each reader must describe at least one witnessed reason to stay or leave.');
        verdict.ratings.forEach((r, i) => {
            if (r.score && !r.evidence)
                fail('evidence', 'Positive rating ' + (i + 1) + ' needs the cue, omission or time.');
            if (r.score)
                findings.push({ at: '0–3 s', cue: r.evidence });
        });
    }
    const totals = verdicts.map(v => v.ratings.reduce((n, r) => n + r.score * 10, 0)).sort((a, b) => a - b);
    const editorial = totals[1];
    let metric = { kind: 'editorial_risk', unit: 'points', value: editorial, ceiling: ledger.policy.editorialCeiling };
    if (observation && observation.endedBefore3 !== undefined && observation.endedBefore3 > observation.starts)
        fail('observation', 'Abandoned starts cannot exceed eligible starts.');
    if (observation && observation.sourceRevision === entry.sourceRevision && observation.surface === ledger.surface &&
        observation.audience === ledger.audience && ledger.policy.observedCeiling !== undefined &&
        observation.starts >= (ledger.policy.minStarts ?? Infinity) && observation.starts > 0 && observation.durationSeconds >= 3) {
        let rate;
        if (observation.definition === 'ended_before_3s' && observation.endedBefore3 !== undefined)
            rate = 100 * observation.endedBefore3 / observation.starts;
        const surface = observation.surface.toLowerCase().replace(/[\s_·-]+/gu, ' ').trim();
        if (observation.definition === 'reels_skip_rate' && /^(?:instagram|ig|인스타그램|인스타) (?:reels|릴스)$/u.test(surface))
            rate = observation.ratePercent;
        if (rate !== undefined)
            metric = { kind: 'observed_abandonment', unit: 'percent', value: rate, ceiling: ledger.policy.observedCeiling };
    }
    return { status: metric.value > metric.ceiling ? 'high' : 'pass', metric, editorial, findings, verdicts, observation,
        eligibleForRestore: args.eligibleForRestore !== false, editorialFinding: args.editorialFinding, requestDigest };
}
function bestEntry(ledger, stage, direction) {
    const eligible = ledger.entries.filter(e => e.stage === stage && e.direction === direction && e.assessment?.eligibleForRestore && e.assessment.metric);
    const pool = eligible.some(entry => entry.assessment.status === 'pass')
        ? eligible.filter(entry => entry.assessment.status === 'pass') : eligible;
    const leaders = new Map();
    for (const entry of pool) {
        const metric = entry.assessment.metric;
        const leader = leaders.get(metric.kind);
        if (!leader || metric.value < leader.assessment.metric.value)
            leaders.set(metric.kind, entry);
    }
    // Only compare the class winners on the common editorial scale. Retain the
    // original revision order so an editorial tie favors the earlier opening.
    return pool.filter(entry => leaders.get(entry.assessment.metric.kind) === entry)
        .sort((left, right) => left.assessment.editorial - right.assessment.editorial)[0];
}
/** Describe leaf-level changes against the latest opening; callers merge them with
 * their current board and use its SHA for the normal storyboard write. */
function recover(best, latest) {
    if (!best)
        return undefined;
    const draft = { sourceRevision: best.sourceRevision, snapshot: best.snapshot };
    if (best.stage !== 'storyboard' || !latest)
        return draft;
    const changes = [];
    const walk = (path, before, after) => {
        if (JSON.stringify(canonical(before)) === JSON.stringify(canonical(after)))
            return;
        if (Array.isArray(before) || Array.isArray(after)) {
            const previous = Array.isArray(before) ? before : [], next = Array.isArray(after) ? after : [];
            for (let i = 0; i < next.length; i++)
                walk([...path, i], previous[i], next[i]);
            for (let i = previous.length - 1; i >= next.length; i--)
                changes.push({ path: [...path, i], operation: 'remove', expected: previous[i] });
            return;
        }
        if ((before && typeof before === 'object') || (after && typeof after === 'object')) {
            const previous = obj(before), next = obj(after);
            for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]))
                walk([...path, key], previous[key], next[key]);
            return;
        }
        changes.push({ path, operation: after === undefined ? 'remove' : 'set', expected: before, value: after });
    };
    const boardRoots = (entry) => {
        const shots = rows(entry.snapshot.openingShots);
        return { openingOrder: shots.map(shot => shot.id), shotsById: Object.fromEntries(shots.map((shot, i) => [String(shot.id ?? 'position-' + (i + 1)), shot])), sceneEvidence: entry.snapshot.sceneEvidence };
    };
    walk([], boardRoots(latest), boardRoots(best));
    return { ...draft, restorePatch: { fromRevision: latest.sourceRevision, toRevision: best.sourceRevision, changes } };
}
function editorialEvidence(assessment) {
    const reviewed = Boolean(assessment?.metric);
    const eligibleForRestore = reviewed && assessment?.eligibleForRestore === true;
    const editorialValidity = reviewed ? (eligibleForRestore ? 'eligible' : 'ineligible') : 'unverified';
    const editorialFinding = assessment?.editorialFinding ?? (editorialValidity === 'ineligible'
        ? 'The editor excluded this revision from restoration. Check its selected type, factual basis and delivered payoff before reuse.' : undefined);
    const witnesses = (assessment?.verdicts ?? []).map(verdict => ({
        reviewerId: verdict.reviewerId, reasonToStay: verdict.reasonToStay,
        reasonToLeave: verdict.reasonToLeave ?? (!verdict.reasonToStay ? verdict.ratings.find(r => r.score > 0)?.evidence : undefined),
    }));
    const findings = [...(assessment?.findings ?? [])];
    for (const witness of witnesses) {
        if (witness.reasonToStay)
            findings.push({ at: '0–3 s', cue: witness.reasonToStay });
        if (witness.reasonToLeave)
            findings.push({ at: '0–3 s', cue: witness.reasonToLeave });
    }
    if (editorialFinding)
        findings.push({ at: 'editorial review', cue: editorialFinding });
    return { eligibleForRestore, editorialValidity, editorialFinding, witnesses,
        findings: [...new Map(findings.map(f => [JSON.stringify([f.at, f.cue]), f])).values()] };
}
function summary(ledger, stage, direction, entry) {
    const verdict = entry?.assessment, best = bestEntry(ledger, stage, direction), used = ledger.reservations.length;
    const pending = ledger.reservations.find(row => row.stage === stage && !row.usedBy.includes(direction) &&
        row.candidates.some(candidate => candidate.direction === direction && candidate.sourceRevision === entry?.sourceRevision));
    const status = verdict?.status === 'high' && !pending && used >= limitFor(ledger, stage) ? 'limit_reached' :
        verdict?.status ?? (entry?.missing.length ? 'incomplete' : 'not_reviewed');
    return { runId: ledger.runId, stage, direction, status, policyVersion, sourceRevision: entry?.sourceRevision, packetDigest: entry?.packetDigest,
        metric: verdict?.metric, ...editorialEvidence(verdict), editsUsed: used, editsRemaining: 5 - used,
        stageEditsRemaining: Math.max(0, limitFor(ledger, stage) - used), pendingSlot: pending?.slot, bestRevision: best?.sourceRevision };
}
function record(args, ledger) {
    if (!args.direction || !args.sourceRevision || !args.packetDigest || args.policyVersion !== policyVersion)
        fail('record', 'Supply direction, prepared source and packet digests, and policy version.');
    const entry = currentEntry(ledger, args.stage, args.direction);
    if (!entry || entry.sourceRevision !== args.sourceRevision || entry.packetDigest !== args.packetDigest)
        fail('stale', 'The packet is no longer the current prepared revision.');
    const result = score(args, ledger, entry);
    if (entry.assessment && entry.assessment.status !== 'incomplete' && result.requestDigest !== entry.assessment.requestDigest)
        fail('conflict', 'A completed blind assessment is immutable.');
    entry.assessment = result;
    const best = bestEntry(ledger, args.stage, args.direction);
    return { ...summary(ledger, args.stage, args.direction, entry), bestDraft: recover(best, entry) };
}
function reserve(args, ledger) {
    if (!args.requestId || !args.candidates?.length || !args.expectedReceiptRevision)
        fail('reserve', 'Supply the request ID, receipt revision and failing candidates.');
    const keys = args.candidates;
    if (new Set(keys.map(row => row.direction)).size !== keys.length ||
        keys.some((item, i) => i > 0 && keys[i - 1].direction > item.direction))
        fail('reserve', 'Supply unique directions sorted by ID.');
    const previous = ledger.reservations.find(row => row.requestId === args.requestId);
    if (previous) {
        if (previous.stage !== args.stage || !same(keys, previous.candidates))
            fail('conflict', 'Request ID was reused with a changed batch.');
        return { slot: previous.slot };
    }
    if (args.expectedReceiptRevision !== hash(ledger))
        fail('stale', 'Receipt revision changed; read the current receipt.');
    for (const c of keys) {
        const entry = currentEntry(ledger, args.stage, c.direction);
        if (entry?.sourceRevision !== c.sourceRevision || entry.assessment?.status !== 'high')
            fail('reserve', 'Only the current assessed high-risk revisions are eligible.');
        if (ledger.reservations.some(r => r.stage === args.stage && r.candidates.some(prior => same(prior, c))))
            fail('conflict', 'This source already has a reserved slot. Reuse the original request ID.');
    }
    const used = ledger.reservations.length;
    if (used >= limitFor(ledger, args.stage)) {
        const bestDrafts = keys.map(c => {
            const best = bestEntry(ledger, args.stage, c.direction);
            return { direction: c.direction, ...recover(best, currentEntry(ledger, args.stage, c.direction)) };
        });
        return { status: 'limit_reached', bestDrafts };
    }
    const slot = used + 1;
    ledger.reservations.push({ slot, requestId: args.requestId, stage: args.stage, candidates: keys, usedBy: [] });
    return { slot };
}
function perform(args, ledger, selected) {
    checkRun(args, ledger);
    if (args.action === 'prepare')
        return prepare(args, ledger, selected);
    if (args.synopses)
        fail('source', 'Prepare changed synopsis text before recording or reserving a revision.');
    if (args.stage === 'storyboard') {
        const direction = ledger.boardDirection ?? fail('prepare', 'Prepare the storyboard first.');
        const current = currentEntry(ledger, 'storyboard', direction);
        const source = boardSource(args.path, ledger, direction, selected, args.expectedSha256);
        if (source.sourceRevision !== current?.sourceRevision)
            fail('stale', 'Storyboard evidence changed. Prepare the new revision.');
    }
    else if (ledger.boardDirection)
        fail('stage', 'The run has advanced to its storyboard.');
    return args.action === 'record' ? record(args, ledger) : reserve(args, ledger);
}
/** Inline calls use the one host's latest receipt; the on-disk ledger serializes board calls across processes. */
export async function runOpeningReview(input) {
    const args = openingReviewSchema.parse(input);
    if ((args.stage === 'storyboard') !== Boolean(args.path) || (args.path && args.synopses))
        fail('source', 'Use path for a storyboard and inline synopses or a receipt for a synopsis.');
    if (args.path && !args.expectedSha256)
        fail('stale', 'Supply the current board SHA from storyboard_read.');
    const incoming = args.receipt ? readReceipt(args.receipt) : undefined;
    const execute = () => {
        const file = args.path && ledgerFile(args.path);
        const disk = file && existsSync(file) ? obj(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
        const existing = disk && readReceipt(disk);
        const history = Array.isArray(disk?.previousRuns) ? disk.previousRuns.slice() : [];
        let restart;
        if (args.startNewRun) {
            if (args.action !== 'prepare' || !existing || !args.runId || !args.expectedReceiptRevision || incoming)
                fail('run', 'Starting a new board run requires the current receipt revision and a new run ID.');
            if (args.runId === existing.runId) {
                if (args.expectedReceiptRevision !== existing.restartedFrom)
                    fail('run', 'Choose a distinct new run ID.');
            }
            else {
                if (hash(existing) !== args.expectedReceiptRevision)
                    fail('stale', 'Current receipt revision changed.');
                if (history.some(old => obj(obj(old).ledger).runId === args.runId))
                    fail('run', 'Choose a previously unused run ID.');
                restart = newLedger(args);
                restart.restartedFrom = args.expectedReceiptRevision;
                history.push(snapshotReceipt(existing));
            }
        }
        if (existing && incoming && hash(incoming) !== hash(existing))
            fail('stale', 'This board already owns a newer receipt.');
        if (!existing && incoming?.boardDirection && args.path)
            fail('receipt', 'Only an inline synopsis receipt can enroll another board.');
        const ledger = restart ?? existing ?? incoming ?? newLedger(args);
        const before = hash(ledger);
        const selected = args.path ? selectedScenario(args.path) : undefined;
        const result = perform(args, ledger, selected), receipt = snapshotReceipt(ledger);
        if (args.path && (!existing || restart || before !== receipt.revision)) {
            const file = ledgerFile(args.path), temp = file + '.' + randomUUID() + '.tmp';
            try {
                writeFileSync(temp, JSON.stringify({ ...receipt, ...(history.length ? { previousRuns: history } : {}) }) + '\n', { mode: 0o600, flag: 'wx' });
                if (sha(readFileSync(boardFile(args.path), 'utf8')) !== args.expectedSha256)
                    fail('stale', 'Board changed while evaluating the review.');
                if (selectedScenario(args.path).hash !== selected?.hash)
                    fail('stale', 'Selected scenario changed while evaluating the review.');
                renameSync(temp, file);
            }
            finally {
                rmSync(temp, { force: true });
            }
        }
        return { runId: ledger.runId, stage: args.stage, editsUsed: ledger.reservations.length, editsRemaining: 5 - ledger.reservations.length,
            receiptRevision: receipt.revision, ...result, ...(!args.path ? { receipt } : {}) };
    };
    if (!args.path)
        return execute();
    const unlock = await lockfile.lock(ledgerFile(args.path), { realpath: false, stale: 30000, retries: { retries: 8, minTimeout: 10, maxTimeout: 200 } });
    try {
        return execute();
    }
    finally {
        await unlock();
    }
}
/** Read-only and synchronous for the workflow and standalone HTML. No source changes are made. */
export function readOpeningReviewSummary(path) {
    try {
        const ledger = readDisk(path);
        if (!ledger?.boardDirection)
            return { stage: 'storyboard', status: 'not_reviewed', ...editorialEvidence() };
        const direction = ledger.boardDirection, entry = currentEntry(ledger, 'storyboard', direction);
        const selected = selectedScenario(path);
        const result = summary(ledger, 'storyboard', direction, entry);
        if (selected.direction && selected.direction !== direction)
            return { ...result, status: 'stale', metric: undefined, ...editorialEvidence(), findings: [{ at: 'scenario.md', cue: 'The selected direction changed to ' + selected.direction + '.' }] };
        const actual = boardSource(path, ledger, direction, selected);
        if (entry?.sourceRevision === actual.sourceRevision)
            return result;
        const restored = findEntry(ledger, 'storyboard', direction, actual.sourceRevision);
        if (restored?.assessment?.eligibleForRestore)
            return summary(ledger, 'storyboard', direction, restored);
        return { ...result, status: 'stale', metric: undefined, ...editorialEvidence(), findings: [], sourceRevision: actual.sourceRevision };
    }
    catch (error) {
        return { stage: 'storyboard', status: 'incomplete', ...editorialEvidence(), findings: [{ at: '0–3 s', cue: error.message }] };
    }
}
