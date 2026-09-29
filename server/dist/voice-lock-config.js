import { z } from 'zod';
export const VOICE_LOCK_MODEL = 'eleven_multilingual_sts_v2';
export const voiceLockConfigSchema = z.object({
    enabled: z.boolean().default(true),
    model: z.literal(VOICE_LOCK_MODEL).default(VOICE_LOCK_MODEL),
    removeBackgroundNoise: z.boolean().default(true),
    referenceAudioUrl: z.string().trim().min(1).max(2000).optional(),
}).strict();
export const VOICE_LOCK_PROPERTY = {
    type: 'object', description: 'Generated-speech voice lock; omitted fields default to enabled, multilingual STS v2 and noise removal. Replace the whole object when supplied.',
    properties: {
        enabled: { type: 'boolean', default: true, description: 'Apply to model-generated speech' },
        model: { type: 'string', enum: [VOICE_LOCK_MODEL], default: VOICE_LOCK_MODEL, description: 'Speech-to-speech model; independent of the TTS model' },
        removeBackgroundNoise: { type: 'boolean', default: true, description: 'Remove background noise from the dialogue input' },
        referenceAudioUrl: { type: 'string', maxLength: 2000, description: 'Portal reference sample URL for preview/comparison; does not create or clone a voice' },
    }, additionalProperties: false,
};
