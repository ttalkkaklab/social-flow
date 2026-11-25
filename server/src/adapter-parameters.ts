/** One shape for the media catalogs: an engine's adapters with their parameters as
 * JSON Schema, the names every adapter of that media type shares apart from an adapter's own
 * (user directive 2026-11-25). The adapter's zod schema stays the only definition. */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Names that mean the same on every adapter of the type that takes them. */
export const COMMON_PARAMETERS = {
  video: ['prompt', 'negativePrompt', 'model', 'resolution', 'seed', 'generateAudio', 'outputPath', 'filename'],
  image: ['prompt', 'negativePrompt', 'model', 'size', 'seed', 'outputPath', 'filename'],
  tts: ['model', 'text', 'outputPath', 'filename'],
  music: ['prompt', 'model', 'seed', 'outputPath', 'filename'],
} as const;
export type MediaKind = keyof typeof COMMON_PARAMETERS;

interface ObjectSchema { type: 'object'; properties: Record<string, unknown>; required: string[] }

export function adapterParameters(schema: z.ZodTypeAny, kind: MediaKind): { common: ObjectSchema; options: ObjectSchema } {
  const json = zodToJsonSchema(schema, { $refStrategy: 'none' }) as { properties?: Record<string, unknown>; required?: string[] };
  const shared: readonly string[] = COMMON_PARAMETERS[kind];
  const part = (common: boolean): ObjectSchema => ({ type: 'object',
    properties: Object.fromEntries(Object.entries(json.properties ?? {}).filter(([name]) => shared.includes(name) === common)),
    required: (json.required ?? []).filter(name => shared.includes(name) === common) });
  return { common: part(true), options: part(false) };
}

/** The catalog rows a registry matched to `asked` (an engine, and an operation or model when named), each with its parameter schema. */
export function adapterContracts<Row extends { tool: string }>(kind: MediaKind, rows: readonly Row[],
  adapters: Readonly<Record<string, { schema: z.ZodTypeAny }>>, asked: Record<string, string | undefined>) {
  const named = Object.fromEntries(Object.entries(asked).filter(([, value]) => value !== undefined));
  if (!rows.length) throw new Error(`${kind}_adapter_unsupported: no installed adapter for ${Object.values(named).join(' ')}`);
  return { version: 1, ...named, adapters: rows.map(row => ({ ...row, parameters: adapterParameters(adapters[row.tool].schema, kind) })) };
}

/** A plan follows the saved selection. `engine` and `model` on a plan call state what the caller expects and never change it. */
export function assertSelection(kind: MediaKind, selection: { engine?: string; model?: string }, expected: { engine?: string; model?: string }) {
  for (const field of ['engine', 'model'] as const)
    if (expected[field] !== undefined && expected[field] !== selection[field])
      throw new Error(`${kind === 'video' ? 'model' : kind}_selection_mismatch: ${field} ${expected[field]} differs from the saved ${selection[field] ?? 'selection'}. ` +
        'Change the saved selection with project_manage; a plan never switches it');
}
