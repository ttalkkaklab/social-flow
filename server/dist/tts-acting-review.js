import { hostReview } from './host-review.js';
import { z } from 'zod';
import { characterTargetSchema } from './voice-target.js';
export const actingReviewSchema = z.object({
    audioPath: z.string().min(1), expectedText: z.string().trim().min(1).max(4000),
    direction: z.string().trim().min(1).max(2000), language: z.string().default('ko'),
    requestedBy: z.string().trim().min(1).max(1000), outputPath: z.string().min(1),
    characterTarget: characterTargetSchema.optional(),
}).strict();
const score = z.number().finite().min(0).max(100);
const axes = ['accuracy', 'acting', 'naturalness', 'audioQuality', 'characterFit'];
export const ACTING_EVALUATOR_VERSION = 'acting-evidence-v7';
export const ACTING_VERDICT_VERSION = 'acting-verdict-v2';
const observationText = z.string().trim().min(10).refine(value => /[\p{L}\p{N}]/u.test(value) && !/^(?:unknown|not observed|no observation|not assessed|n\/?a|none|unavailable|cannot assess|unable to assess|voice not observed|audio not observed)[.!\s]*$/i.test(value), 'Describe actual observations, not an evidence placeholder');
export const actingVerdictSchema = z.object({
    accuracy: score, acting: score, naturalness: score, audioQuality: score,
    characterFit: score.optional(), observedVoice: z.string().trim().min(10).optional(),
    complete: z.boolean(), confidence: z.number().min(0).max(1), heardText: z.string(),
    evidence: z.string().min(20), confidenceReason: z.string().trim().min(10),
    issues: z.array(z.object({ start: z.number().min(0), end: z.number().min(0),
        axes: z.array(z.enum(axes)).min(1),
        severity: z.enum(['minor', 'major', 'critical']), observation: z.string().min(1), correction: z.string().min(1) }).strict()),
}).strict();
const observedIssueSchema = z.object({
    start: z.number().min(0), end: z.number().min(0),
    severity: z.enum(['minor', 'major', 'critical']), observation: z.string().min(1), correction: z.string().min(1),
}).strict();
const observedAxisSchema = z.object({ evidence: observationText, issues: z.array(observedIssueSchema), score }).strict();
const observedActingSchema = z.object({
    heardText: z.string(), complete: z.boolean(), confidence: z.number().min(0).max(1), confidenceReason: z.string().trim().min(10),
    observedVoice: observationText.optional(),
    axes: z.object({ accuracy: observedAxisSchema, acting: observedAxisSchema, naturalness: observedAxisSchema, audioQuality: observedAxisSchema, characterFit: observedAxisSchema.optional() }).strict(),
}).strict();
/** Preserve the critic's numbers while binding each defect to its observed axis. */
export function parseActingObservation(input) {
    const observed = observedActingSchema.parse(input);
    const observedAxes = axes.filter(axis => observed.axes[axis] !== undefined);
    return actingVerdictSchema.parse({
        ...(observed.observedVoice ? { observedVoice: observed.observedVoice } : {}),
        heardText: observed.heardText, complete: observed.complete, confidence: observed.confidence, confidenceReason: observed.confidenceReason,
        ...Object.fromEntries(observedAxes.map(axis => [axis, observed.axes[axis].score])),
        evidence: observedAxes.map(axis => `${axis}: ${observed.axes[axis].evidence}`).join('\n'),
        issues: observedAxes.flatMap(axis => observed.axes[axis].issues.map(issue => ({ ...issue, axes: [axis] }))),
    });
}
export function actingVerdict(review, seconds) {
    if (review.issues.some(i => i.end < i.start || i.end > seconds + 0.1))
        throw new Error('Review issue timestamps exceed audio');
    const total = Math.round((review.characterFit === undefined
        ? review.accuracy * .25 + review.acting * .30 + review.naturalness * .25 + review.audioQuality * .20
        : review.characterFit * .4 + review.accuracy * .2 + review.acting * .15 + review.naturalness * .15 + review.audioQuality * .1) * 100) / 100;
    const p0 = review.issues.filter(i => i.severity === 'critical').length;
    const consistencyFindings = [];
    for (const issue of review.issues) {
        if (/\bscore[ds]?\b[^.]{0,80}\bcompress(?:ed|ion)?\b|\bper\s+(?:the\s+)?system\s+prompt\b|\bno\s+actual\s+(?:accuracy|audio|audible)[^.]*defects?\b/i.test(issue.observation))
            consistencyFindings.push('Issue cites scoring instructions or the absence of a defect instead of an audible counterexample');
    }
    for (const axis of axes) {
        if (review[axis] === undefined)
            continue;
        const supporting = review.issues.filter(issue => issue.axes?.includes(axis));
        // The published 95 anchor is professionally usable with no required correction.
        // A positive professional-band rating is not itself an observed defect.
        if (review[axis] < 95 && !supporting.length)
            consistencyFindings.push(`${axis}: deduction has no timestamped issue for this axis`);
        else if (review[axis] < 90 && supporting.every(issue => issue.severity === 'minor'))
            consistencyFindings.push(`${axis}: score below 90 conflicts with only minor findings under the stated rubric`);
    }
    // Preserve the model's numbers. Missing evidence invalidates the evaluation,
    // not the audio, and never licenses an automatic score increase or regeneration.
    return { score: total, p0, verdictPolicyVersion: ACTING_VERDICT_VERSION, evaluationStatus: consistencyFindings.length ? 'invalid_evidence' : 'consistent', consistencyFindings,
        verdict: !consistencyFindings.length && review.complete && review.confidence >= .9 && total >= 95 && (review.characterFit === undefined || review.characterFit >= 95) && p0 === 0 && !review.issues.some(i => i.severity === 'major') ? 'PASS' : 'FAIL' };
}
/** Prepare local audio for the host LLM; never call an evaluator API. */
export async function reviewActing(input) {
    const request = actingReviewSchema.parse(input);
    return hostReview({ mediaPath: request.audioPath, mode: 'audio', brief: JSON.stringify(request) });
}
