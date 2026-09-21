import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
export const decisionSchema = z.object({
    key: z.string().max(200).regex(/^(topic_axis|format|mode|style_preset|production_mode|video_budget_usd|max_attempts|previz_renderer|video_model|scenario_choice|longform_layout|narration_approval|board_approval|queue_stamp|publish_approval|(?:shot_style|video_model|assembly_warning|slide_fallback):[^\s:]{1,150})$/),
    value: z.any().refine(v => v !== undefined && v !== null && JSON.stringify(v).length <= 65536, 'A non-null JSON value up to 64KB is required'),
    options: z.any().optional(),
    chosenBy: z.enum(['user', 'standing', 'auto', 'imported']),
    source: z.string().trim().min(1).max(500), reason: z.string().max(4000).optional(),
    decidedAt: z.string().datetime({ offset: true }).optional(),
});
export const decisionsSchema = z.array(decisionSchema).max(500).refine(a => new Set(a.map(d => d.key)).size === a.length, 'Duplicate decision keys');
export const publicationSchema = z.object({
    platform: z.enum(['youtube', 'instagram', 'threads', 'facebook']), postId: z.string().min(1).max(300),
    permalink: z.string().url().regex(/^https?:\/\//), publishedAt: z.string().datetime({ offset: true }),
    approvedBy: z.string().max(200).optional(), captionHash: z.string().max(200).optional(),
});
export const publicationsSchema = z.array(publicationSchema).max(100);
/** The sidecar also works before scenes.js exists. Explicit arguments override the same file key. */
export function readDecisions(storyboardDir, explicit) {
    const file = path.join(storyboardDir, 'decisions.json');
    const local = existsSync(file) ? decisionsSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : [];
    const merged = new Map(local.map(d => [d.key, d]));
    for (const d of decisionsSchema.parse(explicit ?? []))
        merged.set(d.key, d);
    return decisionsSchema.parse([...merged.values()]);
}
export const DECISION_JSON_SCHEMA = {
    description: 'Actual HITL answer with stable key, JSON value, selection provenance and source skill section', type: 'object', required: ['key', 'value', 'chosenBy', 'source'],
    properties: { key: { type: 'string', description: 'Gate key from the decision contract; per-shot keys end in :stableShotId' }, value: { description: 'Chosen JSON value including model resolution or approval fingerprint' }, options: { description: 'Options and evidence actually presented to the user' }, chosenBy: { description: 'Who made the choice: user, standing authorization, automation or imported file', type: 'string', enum: ['user', 'standing', 'auto', 'imported'] }, source: { description: 'Skill and section where the answer was given', type: 'string' }, reason: { description: 'Actual answer or authorization rationale', type: 'string' }, decidedAt: { description: 'Actual answer time in ISO 8601; omit if unknown', type: 'string', format: 'date-time' } },
};
export const DECISIONS_JSON_SCHEMA = { description: 'HITL answers; merged over storyboard/decisions.json by key, with actual approval evidence', type: 'array', maxItems: 500, items: DECISION_JSON_SCHEMA };
export const PUBLICATIONS_JSON_SCHEMA = { description: 'Actual published platform records, never an instruction to publish', type: 'array', maxItems: 100, items: { type: 'object', required: ['platform', 'postId', 'permalink', 'publishedAt'], properties: { platform: { description: 'Platform actually published to', type: 'string', enum: ['youtube', 'instagram', 'threads', 'facebook'] }, postId: { description: 'Platform post identifier', type: 'string' }, permalink: { description: 'Public HTTP(S) post URL', type: 'string', format: 'uri' }, publishedAt: { description: 'Actual publication time in ISO 8601', type: 'string', format: 'date-time' }, approvedBy: { description: 'Recorded publication approver', type: 'string' }, captionHash: { description: 'Hash of the approved caption', type: 'string' } } } };
