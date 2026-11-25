import {createRequire} from 'node:module';

/**
 * Video prompts are English (owner directive 2026-10-31). Only dialogue keeps the video's own
 * language, and it rides inside quotation marks, so a quoted segment is exempt.
 */
const QUOTED_SEGMENT = /"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|«[^»\n]*»|‘[^\n]*?’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'[^\n]*?'(?![\p{L}\p{N}])/gu;
const delimiters = [['"','"'],['“','”'],['「','」'],['『','』'],['«','»'],['‘','’'],["'","'"]];

/** Match approved words first so embedded quotation marks stay part of their enclosing turn. */
export function quotedSegments(prompt: string, lines: readonly string[] = []) {
  const literals = [...new Set(lines.filter(Boolean))].sort((a,b) => b.length - a.length)
    .flatMap(line => delimiters.map(([open,close]) => (open + line + close).replace(/[$.*+?^{}()|[\]\\]/g,'\\$&')));
  const pattern = literals.length ? new RegExp(literals.join('|') + '|' + QUOTED_SEGMENT.source, 'gu') : QUOTED_SEGMENT;
  return prompt.matchAll(pattern);
}
const NON_LATIN_RUN = /[^\P{L}\p{Script=Latin}]+(?:[ \t]+[^\P{L}\p{Script=Latin}]+)*/u;

/** The first run of non-Latin letters outside quotation marks, or null for an English prompt. */
export function nonEnglishOutsideQuotes(prompt: string, lines: readonly string[] = []): string | null {
  let start = 0;
  for (const quote of quotedSegments(prompt, lines)) {
    const outside = prompt.slice(start,quote.index).match(NON_LATIN_RUN);
    if (outside) return outside[0];
    start = quote.index! + quote[0].length;
  }
  const match = prompt.slice(start).match(NON_LATIN_RUN);
  return match ? match[0] : null;
}

const load = createRequire(import.meta.url);
export function checkVoiceoverDirection(direction: unknown, lines: {id?: unknown; delivery?: unknown; tts?: unknown; voiceoverKind?: unknown}[], compiled = false) {
  const contract = load('../../skills/_shared/voiceover-direction.js');
  contract.checkVoiceoverDirection(direction, lines, compiled);
  if (compiled && lines.some(line => line.voiceoverKind === 'inner_thought') && lines.every(line => line.delivery === 'voiceover'))
    contract.checkThoughtPerformance(direction);
}
