import { z } from 'zod';
import * as nodeModule from 'node:module';

/** Scene performance is independent of a character's persistent voice identity. */
export const actingSchema = z.object({
  direction: z.string().trim().min(1).max(500).regex(/^[^<>\[\]|\r\n]+$/, 'Use plain delivery direction, without tag markup').optional(),
  tags: z.array(z.string().trim().min(1).max(60).regex(/^[A-Za-z][A-Za-z ,'-]*$/, 'Use bare English vocal tag names')).max(6).optional(),
}).strict();
export type SpeechActing = z.infer<typeof actingSchema>;

/** Compile explicit acting into the selected provider's supported request fields. */
export function compileActing(text: string, acting: SpeechActing | undefined, voice: Record<string, unknown>): { generator: string; generation: Record<string, unknown> } {
  const shared = nodeModule.createRequire(import.meta.url)('../../skills/_shared/speech-contract.js') as { compileActing(text: string, acting: SpeechActing, voice: Record<string, unknown>): { generator: string; generation: Record<string, unknown> } };
  return shared.compileActing(text, actingSchema.parse(acting || {}), voice);
}
