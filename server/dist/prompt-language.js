import { createRequire } from 'node:module';
/**
 * Video prompts are English (owner directive 2026-10-31). Only dialogue keeps the video's own
 * language, and it rides inside quotation marks, so a quoted segment is exempt.
 */
const QUOTED_SEGMENT = /"[^"]*"|“[^”]*”|「[^」]*」/g;
const NON_LATIN_RUN = /[^\P{L}\p{Script=Latin}]+(?:[ \t]+[^\P{L}\p{Script=Latin}]+)*/u;
/** The first run of non-Latin letters outside quotation marks, or null for an English prompt. */
export function nonEnglishOutsideQuotes(prompt) {
    const match = prompt.replace(QUOTED_SEGMENT, ' ').match(NON_LATIN_RUN);
    return match ? match[0] : null;
}
const load = createRequire(import.meta.url);
export function checkVoiceoverDirection(direction, lines, compiled = false) {
    const contract = load('../../skills/_shared/voiceover-direction.js');
    contract.checkVoiceoverDirection(direction, lines, compiled);
    if (compiled && lines.some(line => line.voiceoverKind === 'inner_thought') && lines.every(line => line.delivery === 'voiceover'))
        contract.checkThoughtPerformance(direction);
}
