/** Host evidence handoff and historical receipt compatibility helpers. */
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { z } from 'zod';
import { hostReview } from './host-review.js';
import { recordUsage } from './usage-ledger.js';
const exec = promisify(execFile);
export const ACTING_REVIEW_MODEL = process.env.SOCIAL_FLOW_ACTING_REVIEW_MODEL?.trim() || 'gemini-3.8-flash';
const VISUAL_POLICY = 'acting-review-v9';
const AUDIO_POLICY = 'acting-review-v8';
const CINEMATOGRAPHY_POLICY = 'cinematography-review-v1';
// Explicit temporal sampling avoids the SDK's 1 fps default missing brief gestures.
export function actingMediaPart(bytes, probe, mode, focus = 'performance') {
    return { inlineData: { data: bytes.toString('base64'), mimeType: probe.mimeType },
        ...(probe.video && mode !== 'audio' ? { videoMetadata: { fps: focus === 'cinematography' ? 24 : 8 } } : {}) };
}
export const ACTING_REVIEW_ADVISORY = {
    advisoryOnly: true,
    selectionAuthority: 'user',
    interpretation: 'Status and scores describe model judgment, not usability or permission. User preference decides voice casting; do not reject, replace or regenerate a preferred take because of a low score. Perceived age and naturalness are subjective impressions, not measured facts. Report concrete intelligibility defects separately.',
};
const MAX_BYTES = 12 * 1024 * 1024;
export const actingReviewSchema = z.object({
    mediaPath: z.string().min(1), expectedText: z.string().max(8000).default(''),
    direction: z.string().trim().min(20).max(12000),
    mode: z.enum(['audiovisual', 'audio', 'video']).default('audiovisual'),
    focus: z.enum(['performance', 'cinematography']).default('performance'),
    retryTransportFailure: z.boolean().default(false),
    requestedBy: z.string().trim().min(1).max(200), reason: z.string().trim().min(10).max(1000),
}).strict().refine(value => value.focus !== 'cinematography' || value.mode === 'video', {
    message: 'Cinematography focus requires mode video; audio and performance reviews remain separate', path: ['mode'],
});
const AXES = ['situation', 'expression', 'body', 'vocalEmotion', 'speechAccuracy', 'lipSync'];
const CAMERA_AXES = ['camera', 'direction', 'continuity', 'physicalNaturalness', 'facialNaturalness'];
const ALL_AXES = [...AXES, ...CAMERA_AXES];
const score = z.number().finite().min(0).max(100).nullable();
const coverage = z.object({
    observed: z.boolean(), complete: z.boolean(),
    start: z.number().finite().nonnegative().nullable(), end: z.number().finite().nonnegative().nullable(),
    evidence: z.string().trim().max(4000),
}).strict();
export const actingObservationSchema = z.object({
    scores: z.object({ situation: score, expression: score, body: score, vocalEmotion: score, speechAccuracy: score, lipSync: score }).strict(),
    confidence: z.number().finite().min(0).max(1), complete: z.boolean(),
    confidenceReason: z.string().trim().min(1).max(4000),
    audibleSpeech: z.boolean().nullable(),
    visibleCaptions: z.boolean().nullable(),
    audio: coverage, video: coverage,
    cinematography: z.object({
        scores: z.object({ camera: score, direction: score, continuity: score, physicalNaturalness: score, facialNaturalness: score }).strict(),
        evidence: z.object({ camera: coverage, direction: coverage, continuity: coverage, physicalNaturalness: coverage, facialNaturalness: coverage }).strict(),
        limitation: z.string().trim().max(4000),
        facialApplicability: z.enum(['applicable', 'not_applicable']),
        facialApplicabilityReason: z.string().trim().min(10).max(2000),
    }).strict().optional(),
    findings: z.array(z.object({
        start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(),
        axis: z.enum(ALL_AXES), severity: z.enum(['minor', 'major', 'critical']),
        observed: z.string().trim().min(10).max(2000), expected: z.string().trim().min(1).max(2000),
        correction: z.string().trim().min(1).max(2000),
    }).strict()).max(80),
}).strict();
const hash = (data) => createHash('sha256').update(data).digest('hex');
const currentHash = (file) => {
    try {
        const stat = statSync(file);
        return stat.isFile() && stat.size <= MAX_BYTES ? hash(readFileSync(file)) : null;
    }
    catch {
        return null;
    }
};
const usageSchema = z.object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative(), thoughtTokens: z.number().nonnegative() }).strict();
const rejectedObservationSchema = z.object({ json: z.string().max(131072), truncated: z.boolean() }).strict();
function preserveRejectedObservation(value) {
    let json;
    try {
        json = JSON.stringify(value) ?? String(value);
    }
    catch {
        json = '[Observation could not be serialized]';
    }
    return { json: json.slice(0, 131072), truncated: json.length > 131072 };
}
const cachedReceiptSchema = z.object({
    policy: z.string(), model: z.string(), createdAt: z.string(), mediaPath: z.string(),
    mediaSha256: z.string(), directionSha256: z.string(), requestSha256: z.string(),
    request: actingReviewSchema,
    media: z.object({ duration: z.number().positive().max(120), audio: z.boolean(), video: z.boolean(), mimeType: z.string().min(1) }).strict(),
    review: actingObservationSchema.nullable(), rejectedObservation: rejectedObservationSchema.nullable(), usage: usageSchema, costUsd: z.null(),
    sourceChanged: z.boolean().default(false), currentMediaSha256: z.string().nullable().optional(),
    retryOf: z.string().optional(),
    success: z.boolean(), status: z.enum(['pass', 'fail', 'unverified']), score: score,
    failures: z.array(z.string()), evaluatedAxes: z.array(z.enum(ALL_AXES)),
}).strict();
function unverified(failures) {
    return { success: false, status: 'unverified', score: null, failures, evaluatedAxes: [] };
}
export async function probeActingMedia(file) {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type', '-of', 'json', file], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const result = JSON.parse(stdout);
    const formats = (result.format?.format_name || '').split(',');
    const video = result.streams?.some(s => s.codec_type === 'video') === true;
    const audio = result.streams?.some(s => s.codec_type === 'audio') === true;
    const mimeType = formats.includes('mp4') || formats.includes('mov') ? (video ? 'video/mp4' : 'audio/mp4')
        : formats.includes('wav') ? 'audio/wav' : formats.includes('flac') ? 'audio/flac' : formats.includes('mp3') ? 'audio/mpeg' : '';
    if (!mimeType || (video && mimeType !== 'video/mp4'))
        throw new Error('Review supports MP4 video and WAV/FLAC/MP3/M4A audio');
    return { duration: Number(result.format?.duration), audio, video, mimeType };
}
export function actingReviewOutcome(review, probe, request) {
    if (request.focus === 'cinematography')
        return cinematographyOutcome(review, probe);
    if (review.cinematography || review.findings.some(f => !AXES.includes(f.axis)))
        return unverified(['Cinematography evidence cannot substitute for performance review']);
    const failures = [];
    const required = ['situation'];
    if (request.mode !== 'audio')
        required.push('expression', 'body');
    if (request.mode !== 'video' && request.expectedText.trim())
        required.push('vocalEmotion', 'speechAccuracy');
    if (request.mode === 'audiovisual' && request.expectedText.trim())
        required.push('lipSync');
    let verified = review.complete && review.confidence >= 0.9;
    if (!verified)
        failures.push('Incomplete or uncertain observation');
    if (request.mode !== 'audio') {
        if (review.visibleCaptions === null) {
            verified = false;
            failures.push('Presence of rendered captions was not observed');
        }
        else if (review.visibleCaptions)
            failures.push('Rendered subtitles or captions are forbidden in the video');
    }
    if (request.mode !== 'video') {
        if (review.audibleSpeech === null) {
            verified = false;
            failures.push('Presence of speech was not observed');
        }
        else if (review.audibleSpeech && !request.expectedText.trim()) {
            verified = false;
            failures.push('Audible speech requires expectedText to verify its accuracy');
        }
        else if (!review.audibleSpeech && request.expectedText.trim()) {
            failures.push('Expected speech is absent');
        }
    }
    // Optional axes that the critic actually scored remain accountable. Omitting the
    // script cannot hide a poor vocal performance or a visibly bad lip-sync score.
    for (const axis of AXES)
        if (review.scores[axis] !== null && !required.includes(axis))
            required.push(axis);
    for (const track of ['audio', 'video']) {
        const needed = request.mode === 'audiovisual' || request.mode === track;
        const seen = review[track];
        if (seen.observed && seen.evidence.trim().length < 10) {
            verified = false;
            failures.push(`${track} observation lacks evidence`);
        }
        if (!needed && seen.observed) {
            verified = false;
            failures.push(`${track} observation claimed outside requested mode`);
        }
        if (needed && (!seen.observed || !seen.complete || seen.start === null || seen.end === null || seen.start > 0.1 || Math.abs(seen.end - probe.duration) > 0.25)) {
            verified = false;
            failures.push(`${track} coverage incomplete`);
        }
        if (seen.observed && (!probe[track] || seen.start === null || seen.end === null || seen.end < seen.start || seen.end > probe.duration + 0.25)) {
            verified = false;
            failures.push(`Invalid ${track} coverage`);
        }
    }
    const unrequested = request.mode === 'audio' ? ['expression', 'body', 'lipSync']
        : request.mode === 'video' ? ['vocalEmotion', 'speechAccuracy', 'lipSync'] : [];
    if (unrequested.some(axis => review.scores[axis] !== null)) {
        verified = false;
        failures.push('Scores claimed for unrequested modalities');
    }
    for (const axis of required) {
        if (review.scores[axis] === null) {
            verified = false;
            failures.push(`${axis} unobserved`);
        }
        else if (review.scores[axis] < 95) {
            failures.push(`${axis} below 95`);
            if (!review.findings.some(finding => finding.axis === axis)) {
                verified = false;
                failures.push(`${axis} deduction lacks a timestamped finding`);
            }
            else if (review.scores[axis] < 80 && !review.findings.some(finding => finding.axis === axis && finding.severity !== 'minor')) {
                verified = false;
                failures.push(`${axis} score below 80 conflicts with only minor findings`);
            }
        }
    }
    if (review.findings.some(f => f.end < f.start || f.end > probe.duration + 0.25)) {
        verified = false;
        failures.push('Invalid finding timestamps');
    }
    if (review.findings.length)
        failures.push('Observed defects require correction');
    const values = required.map(axis => review.scores[axis]);
    const overall = verified && values.every(v => v !== null) ? Math.min(...values) : null;
    const status = !verified ? 'unverified' : failures.length ? 'fail' : 'pass';
    return { success: status === 'pass', status, score: overall, failures, evaluatedAxes: required };
}
function cinematographyOutcome(review, probe) {
    const cinema = review.cinematography;
    if (!cinema)
        return unverified(['Cinematography observation is missing']);
    const failures = [];
    const required = CAMERA_AXES.filter(axis => axis !== 'facialNaturalness' || cinema.facialApplicability === 'applicable');
    let verified = review.complete && review.confidence >= 0.9;
    if (!verified)
        failures.push('Incomplete or uncertain observation');
    if (review.confidence < 0.9 && !cinema.limitation.trim())
        failures.push('Low confidence lacks a specific viewing limitation');
    if (review.audio.observed || review.audibleSpeech !== null || AXES.some(axis => review.scores[axis] !== null)) {
        verified = false;
        failures.push('Cinematography review cannot certify audio or emotional performance');
    }
    if (!probe.video) {
        verified = false;
        failures.push('No video track');
    }
    const validCoverage = (seen) => seen.observed && seen.complete && seen.evidence.trim().length >= 10
        && seen.start !== null && seen.end !== null && seen.start >= 0 && seen.start <= 0.1
        && seen.end >= seen.start && seen.end <= probe.duration + 0.25 && Math.abs(seen.end - probe.duration) <= 0.25;
    if (!validCoverage(review.video)) {
        verified = false;
        failures.push('video coverage incomplete or unsupported');
    }
    if (review.visibleCaptions === null) {
        verified = false;
        failures.push('Presence of rendered captions was not observed');
    }
    else if (review.visibleCaptions) {
        failures.push('Rendered subtitles or captions are forbidden in the video');
        if (!review.findings.some(f => f.axis === 'direction')) {
            verified = false;
            failures.push('Caption observation lacks a timestamped finding');
        }
    }
    if (cinema.facialApplicability === 'not_applicable' && (cinema.scores.facialNaturalness !== null || cinema.evidence.facialNaturalness.observed
        || review.findings.some(f => f.axis === 'facialNaturalness'))) {
        verified = false;
        failures.push('Inapplicable facial quality cannot claim a score, observation or defect');
    }
    for (const axis of required) {
        const value = cinema.scores[axis];
        if (value === null || !validCoverage(cinema.evidence[axis])) {
            verified = false;
            failures.push(`${axis} unobserved or coverage lacks evidence`);
        }
        if (value !== null && value < 95) {
            failures.push(`${axis} below 95`);
            if (!review.findings.some(f => f.axis === axis)) {
                verified = false;
                failures.push(`${axis} deduction lacks a timestamped finding`);
            }
            else if (value < 80 && !review.findings.some(f => f.axis === axis && f.severity !== 'minor')) {
                verified = false;
                failures.push(`${axis} score below 80 conflicts with only minor findings`);
            }
        }
    }
    if (review.findings.some(f => !CAMERA_AXES.includes(f.axis) || f.end < f.start || f.end > probe.duration + 0.25)) {
        verified = false;
        failures.push('Invalid cinematography finding axis or timestamps');
    }
    if (review.findings.length)
        failures.push('Observed defects require correction');
    const overall = verified ? Math.min(...required.map(axis => cinema.scores[axis])) : null;
    const status = !verified ? 'unverified' : failures.length ? 'fail' : 'pass';
    return { success: status === 'pass', status, score: overall, failures, evaluatedAxes: required };
}
const COVERAGE_JSON = { type: 'object', additionalProperties: false, required: ['observed', 'complete', 'start', 'end', 'evidence'], properties: {
        observed: { type: 'boolean' }, complete: { type: 'boolean' }, start: { type: ['number', 'null'] }, end: { type: ['number', 'null'] }, evidence: { type: 'string', minLength: 0, maxLength: 4000, description: 'Empty is allowed when this modality was not observed. Otherwise describe concrete observed details and times; at least 10 characters.' },
    } };
export const ACTING_RESPONSE_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['scores', 'confidence', 'confidenceReason', 'complete', 'audibleSpeech', 'visibleCaptions', 'audio', 'video', 'findings'], properties: {
        scores: { type: 'object', additionalProperties: false, required: AXES, properties: Object.fromEntries(AXES.map(axis => [axis, { type: ['number', 'null'], minimum: 0, maximum: 100 }])) },
        confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence as a fraction from 0 to 1, such as 0.95. Never a percentage such as 95.' }, complete: { type: 'boolean' }, audibleSpeech: { type: ['boolean', 'null'] }, visibleCaptions: { type: ['boolean', 'null'] }, audio: COVERAGE_JSON, video: COVERAGE_JSON,
        confidenceReason: { type: 'string', minLength: 1, maxLength: 4000, description: 'Specific observed conditions supporting confidence or uncertainty. Name the actual limitation, if any; do not repeat the numeric confidence or invent uncertainty.' },
        findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['start', 'end', 'axis', 'severity', 'observed', 'expected', 'correction'], properties: {
                    start: { type: 'number' }, end: { type: 'number' }, axis: { type: 'string', enum: AXES }, severity: { type: 'string', enum: ['minor', 'major', 'critical'] },
                    observed: { type: 'string', minLength: 10, maxLength: 2000 }, expected: { type: 'string', minLength: 1, maxLength: 2000 }, correction: { type: 'string', minLength: 1, maxLength: 2000 },
                } } },
    } };
export const CINEMATOGRAPHY_RESPONSE_JSON_SCHEMA = {
    ...ACTING_RESPONSE_JSON_SCHEMA,
    required: [...ACTING_RESPONSE_JSON_SCHEMA.required, 'cinematography'],
    properties: { ...ACTING_RESPONSE_JSON_SCHEMA.properties,
        cinematography: { type: 'object', additionalProperties: false,
            required: ['scores', 'evidence', 'limitation', 'facialApplicability', 'facialApplicabilityReason'], properties: {
                scores: { type: 'object', additionalProperties: false, required: CAMERA_AXES,
                    properties: Object.fromEntries(CAMERA_AXES.map(axis => [axis, { type: ['number', 'null'], minimum: 0, maximum: 100 }])) },
                evidence: { type: 'object', additionalProperties: false, required: CAMERA_AXES,
                    properties: Object.fromEntries(CAMERA_AXES.map(axis => [axis, COVERAGE_JSON])) },
                limitation: { type: 'string', description: 'Actual viewing limitation when confidence is below 0.9; empty only if none.' },
                facialApplicability: { type: 'string', enum: ['applicable', 'not_applicable'] },
                facialApplicabilityReason: { type: 'string', minLength: 10,
                    description: 'Explain facial relevance. Not applicable only for intentionally absent/incidental faces, never unreadable relevant faces.' },
            } },
        findings: { ...ACTING_RESPONSE_JSON_SCHEMA.properties.findings, items: {
                ...ACTING_RESPONSE_JSON_SCHEMA.properties.findings.items,
                properties: { ...ACTING_RESPONSE_JSON_SCHEMA.properties.findings.items.properties, axis: { type: 'string', enum: CAMERA_AXES } },
            } },
    },
};
export function cinematographyPrompt(probe, request) {
    return [
        'Independently inspect the entire actual video against this quoted shot/scene brief: ' + JSON.stringify({ direction: request.direction, measuredDuration: probe.duration }),
        'This is a visual cinematography review, not an emotional acting or audio review. Ignore audio. All six legacy performance scores must be null; audibleSpeech=null and audio observed=false, complete=false, null times, empty evidence.',
        'Use five distinct cinematography axes, each 0–100: camera (motivated move or static composition, stable perspective, smooth start/stop without scale pumping); direction (legible staging, action order, shot purpose and edit rhythm); continuity (screen travel, eyelines, actor/prop state and geography within shots and across actual cuts); physicalNaturalness (planted footsteps, weight transfer, stable anatomy, rigid props, grip/contact/release); facialNaturalness (stable identity and plausible face/eye/mouth geometry, not expressive intensity).',
        'A controlled static shot and a brief neutral expression are valid. Do not require expressive facial micro-movements, drama, blinking or gestures in a wide prop action. Facial quality is not_applicable only for an intentional hands/prop insert or a shot where faces are absent/incidental by purpose; explain why and use null facial score plus unobserved evidence. A relevant face too small, obscured or unreadable is applicable but unverified with a null score and a concrete limitation. A complete scene with relevant faces requires applicable facial assessment. Never hide visible facial defects using not_applicable.',
        'Distinguish camera movement from character movement using fixed door posts, window edges or desk corners. Describe observable frame changes and times. Entering from frame-right and continuing toward frame-left is coherent leftward travel, not a direction reversal. A reversal requires observed opposite travel in the connected action. Distinguish intended cuts, occlusion and depth motion from morphing. Track the same hand/prop edge before, during and after contact; report observed displacement rather than inferring a defect from the brief.',
        'The video requests temporal sampling of 24fps, not guaranteed decoded native-frame inspection. Do not claim frame-perfect playback or full-resolution perception without evidence. State uncertainty about subframe contact or unreadable detail. Inspect the entire scene and each cut; an isolated take can establish only within-shot continuity, not unseen adjacent shots. Do not invent missing neighbouring cuts as a defect.',
        'For every applicable axis provide observed/complete time coverage and concrete timestamped evidence of actual framing, motion, landmarks or interaction. Coverage spans the supplied video inspected for that axis. Do not infer positive evidence from the brief. Complete=true only after observing all relevant intervals. Confidence is a fraction 0–1. Below 0.9 requires an actual viewing limitation in limitation and video evidence; do not invent uncertainty or inflate confidence. Uncertainty lowers confidence, not the quality score.',
        'Use fixed anchors: 95 is professionally usable without correction; 90 is a noticeable defect needing correction; below 80 is a distracting defect requiring a major/critical finding on that same axis. List every observed defect, even minor ones, with actual start/end times, concrete observed evidence, expected state and correction. Every score below 95 requires a timestamped finding on that axis. Never invent defects to justify a score, raise scores to satisfy a rule or treat neutral restraint as low quality. No score or confidence target is to be optimized.',
        'Inspect rendered captions or subtitles; physical signs/scene text are not captions. Set visibleCaptions=false only when the supplied video was inspected and none were seen, true with a timestamped direction finding identifying actual location/appearance, or null when uncertain. Never infer captions from a script or hallucinate text. Score only visible actual defects. Return no emotional performance, vocal or lip-sync claims. Unknown evidence remains unverified. Scores are advisory model judgments, not objective measurements. Record real first-to-last inspected coverage. No prior score is supplied. Preserve honest limitations and unfavorable evidence. If no defects are observed, do not invent any.',
    ].join('\n');
}
export function actingReviewTimeout(focus, override = process.env.SOCIAL_FLOW_ACTING_REVIEW_TIMEOUT_MS) {
    if (override === undefined || override.trim() === '')
        return focus === 'cinematography' ? 600000 : 180000;
    const timeout = Number(override);
    if (!Number.isInteger(timeout) || timeout < 30000 || timeout > 900000)
        throw new Error('SOCIAL_FLOW_ACTING_REVIEW_TIMEOUT_MS must be an integer in 30000..900000');
    return timeout;
}
function isTransportFailure(receipt) {
    const transport = /^(?:(?:This|The) operation was aborted[.!]?|(?:Request|Operation|Network|Transport)(?: timed out| timeout)(?: after [0-9]+ ?ms)?[.!]?|ETIMEDOUT)$/i;
    return receipt.status === 'unverified' && !receipt.success && receipt.score === null
        && receipt.review === null && receipt.rejectedObservation === null && !receipt.sourceChanged
        && receipt.evaluatedAxes.length === 0 && receipt.failures.length > 0 && receipt.failures.every(message => transport.test(message));
}
/** Receipts are immutable, including failures: repeat calls cannot fish for a passing score. */
export async function reviewActing(input, deps) {
    const request = actingReviewSchema.parse(input);
    if (!deps)
        return hostReview({ mediaPath: request.mediaPath, mode: request.mode, brief: JSON.stringify(request) });
    actingReviewTimeout(request.focus); // Reject invalid transport configuration before any paid attempt.
    const policy = request.focus === 'cinematography' ? CINEMATOGRAPHY_POLICY : request.mode === 'audio' ? AUDIO_POLICY : VISUAL_POLICY;
    const mediaPath = realpathSync(request.mediaPath);
    const stat = statSync(mediaPath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES)
        throw new Error('Review requires a nonempty media file no larger than 12 MiB');
    const bytes = readFileSync(mediaPath);
    const probe = await deps.probe(mediaPath);
    if (!Number.isFinite(probe.duration) || probe.duration <= 0 || probe.duration > 120)
        throw new Error('Review requires media duration within (0, 120] seconds');
    if (request.mode !== 'video' && !probe.audio)
        throw new Error('Requested audio review requires an audio track');
    if (request.mode !== 'audio' && !probe.video)
        throw new Error('Requested visual review requires a video track');
    const mediaSha256 = hash(bytes);
    if (currentHash(mediaPath) !== mediaSha256)
        throw new Error('Source media changed during probe; review was not sent');
    const directionSha256 = hash(JSON.stringify({ direction: request.direction, expectedText: request.expectedText, mode: request.mode }));
    let requestSha256 = hash(JSON.stringify({ mediaSha256, directionSha256, model: ACTING_REVIEW_MODEL, policy }));
    const directory = path.resolve(deps.cacheDirectory || process.env.SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR?.trim() || path.join(homedir(), '.cache', 'social-flow', 'acting-reviews'));
    let receiptPath = path.join(directory, `${requestSha256}.json`);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const readMatchingReceipt = (file, expectedHash, retryOf) => {
        const cached = cachedReceiptSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
        const cachedDirection = hash(JSON.stringify({ direction: cached.request.direction, expectedText: cached.request.expectedText, mode: cached.request.mode }));
        if (cached.request.focus !== request.focus || cached.policy !== policy || cached.model !== ACTING_REVIEW_MODEL || cached.mediaSha256 !== mediaSha256 ||
            cached.directionSha256 !== directionSha256 || cached.requestSha256 !== expectedHash || cachedDirection !== directionSha256 ||
            cached.retryOf !== retryOf || cached.request.retryTransportFailure !== Boolean(retryOf) ||
            JSON.stringify(cached.media) !== JSON.stringify(probe))
            throw new Error('Cached receipt identity does not match this review');
        return cached;
    };
    let retryOf;
    if (request.retryTransportFailure) {
        if (!existsSync(receiptPath))
            throw new Error('Transport retry requires an existing matching original receipt; no new review was sent');
        const parent = readMatchingReceipt(receiptPath, requestSha256);
        if (!isTransportFailure(parent) || currentHash(mediaPath) !== mediaSha256 ||
            (parent.currentMediaSha256 !== undefined && parent.currentMediaSha256 !== mediaSha256))
            throw new Error('Transport retry requires an unchanged original timeout/abort receipt with no observation; reviewed or rejected observations cannot be rerolled');
        retryOf = requestSha256;
        requestSha256 = hash(JSON.stringify({ retryOf, attempt: 1, policy: 'transport-retry-v1' }));
        receiptPath = path.join(directory, `${requestSha256}.json`);
    }
    if (existsSync(receiptPath)) {
        try {
            const cached = readMatchingReceipt(receiptPath, requestSha256, retryOf);
            const currentMediaSha256 = currentHash(mediaPath);
            const sourceChanged = cached.sourceChanged || currentMediaSha256 !== mediaSha256;
            const outcome = sourceChanged ? unverified(['Source media changed during or after review'])
                : cached.review ? actingReviewOutcome(cached.review, probe, request) : unverified(cached.failures);
            return { ...cached, ...outcome, ...ACTING_REVIEW_ADVISORY, sourceChanged, currentMediaSha256, currentMediaPath: mediaPath, receiptPath, reused: true };
        }
        catch (error) {
            // A corrupt receipt must not silently authorize another bill or a claimed pass.
            return { ...ACTING_REVIEW_ADVISORY, ...unverified([`Invalid cached receipt: ${error instanceof Error ? error.message : String(error)}`]), receiptPath, reused: true };
        }
    }
    const lock = `${receiptPath}.lock`;
    try {
        writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
    }
    catch {
        throw new Error('An identical review is running or was interrupted; inspect its lock instead of issuing another paid review');
    }
    const started = Date.now();
    let usage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };
    let review = null;
    let rejectedObservation = null;
    let result = unverified([]);
    try {
        const response = await deps.evaluate(bytes, probe, request);
        rejectedObservation = preserveRejectedObservation(response.observation);
        usage = usageSchema.parse(response.usage);
        review = actingObservationSchema.parse(response.observation);
        rejectedObservation = null;
        result = actingReviewOutcome(review, probe, request);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'usage' in error)
            usage = error.usage;
        if (error && typeof error === 'object' && 'rejectedObservation' in error)
            rejectedObservation = preserveRejectedObservation(error.rejectedObservation);
        result.failures.push(error instanceof Error ? error.message : String(error));
    }
    const currentMediaSha256 = currentHash(mediaPath);
    const sourceChanged = currentMediaSha256 !== mediaSha256;
    if (sourceChanged)
        result = unverified([...result.failures, 'Source media changed during review; evidence binds only uploaded bytes']);
    try {
        recordUsage(path.dirname(mediaPath), { ts: new Date().toISOString(), tool: 'acting_review', ok: review !== null, ms: Date.now() - started,
            key: null, quantity: null, note: 'Paid Gemini media review; reconcile token billing; unknown cost is not zero', detail: { model: ACTING_REVIEW_MODEL, ...usage } });
    }
    catch (error) {
        console.error('[acting_review] Usage ledger failed; preserving paid review receipt:', error instanceof Error ? error.message : String(error));
    }
    const receipt = { ...result, policy, model: ACTING_REVIEW_MODEL, createdAt: new Date().toISOString(), mediaPath, mediaSha256, directionSha256, requestSha256,
        request: { ...request, mediaPath }, media: probe, review, rejectedObservation, usage, costUsd: null, sourceChanged, currentMediaSha256,
        ...(retryOf ? { retryOf } : {}) };
    const temporary = `${receiptPath}.${randomUUID()}.tmp`;
    try {
        // Preserve the paid response in the lock before committing its final path. A failed
        // write keeps the lock, so an uncertain request never automatically bills again.
        writeFileSync(lock, JSON.stringify({ phase: 'evaluated', receipt }), { flag: 'w' });
        writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
        renameSync(temporary, receiptPath);
    }
    catch (error) {
        try {
            rmSync(temporary, { force: true });
        }
        catch { /* Preserve original write failure. */ }
        throw new Error(`Could not persist paid acting review; preserved lock at ${lock}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        rmSync(lock, { force: true });
    }
    catch {
        console.error(`[acting_review] Receipt saved; stale lock can be removed: ${lock}`);
    }
    return { ...receipt, ...ACTING_REVIEW_ADVISORY, receiptPath, reused: false };
}
