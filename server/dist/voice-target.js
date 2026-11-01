import * as nodeModule from 'node:module';
import { z } from 'zod';
export const voiceProfileSchema = z.object({
    vocalGender: z.enum(['female', 'male', 'neutral', 'unspecified']).optional(),
    perceivedAge: z.string().trim().min(1).max(100).optional(),
    baselineDirection: z.string().trim().min(1).max(400).optional(),
}).strict();
export const voiceMetadataSchema = z.object({
    voiceId: z.string().trim().min(1).max(300),
    source: z.enum(['gemini-library', 'gemini-curated', 'elevenlabs']),
    retrievedAt: z.string().datetime(),
    gender: z.string().trim().min(1).max(100).optional(),
    age: z.string().trim().min(1).max(200).optional(),
    pitch: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
}).strict();
export const characterTargetSchema = z.object({
    vocalGender: z.enum(['female', 'male', 'neutral', 'unspecified']),
    perceivedAge: z.string().max(100).nullable(),
    timbre: z.string().max(2000).nullable(), body: z.string().max(2000).nullable().optional(), pace: z.string().max(2000).nullable(),
    register: z.string().max(2000).nullable(), traits: z.array(z.string().max(2000)).max(20),
    habits: z.string().max(2000).nullable(), emotionalRange: z.string().max(2000).nullable(),
});
const shared = () => nodeModule.createRequire(import.meta.url)('../../skills/_shared/voice-target.js');
export const characterVoiceTarget = (source, override = {}) => {
    const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(match => JSON.parse(match[1]));
    const saved = blocks.find(block => block?.character)?.voiceProfile;
    const profile = { ...voiceProfileSchema.parse(saved || {}), ...voiceProfileSchema.parse(override) };
    return shared().characterVoiceTarget(source, profile);
};
export const compareVoiceMetadata = (target, metadata) => shared().compareVoiceMetadata(target, metadata);
