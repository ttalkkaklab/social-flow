import { zodToJsonSchema } from 'zod-to-json-schema';
/** Names that mean the same on every adapter of the type that takes them. */
export const COMMON_PARAMETERS = {
    video: ['prompt', 'negativePrompt', 'model', 'resolution', 'seed', 'generateAudio', 'outputPath', 'filename'],
    image: ['prompt', 'negativePrompt', 'model', 'size', 'seed', 'outputPath', 'filename'],
    music: ['prompt', 'model', 'seed', 'outputPath', 'filename'],
};
export function adapterParameters(schema, kind) {
    const json = zodToJsonSchema(schema, { $refStrategy: 'none' });
    const shared = COMMON_PARAMETERS[kind];
    const part = (common) => ({ type: 'object',
        properties: Object.fromEntries(Object.entries(json.properties ?? {}).filter(([name]) => shared.includes(name) === common)),
        required: (json.required ?? []).filter(name => shared.includes(name) === common) });
    return { common: part(true), options: part(false) };
}
/** The catalog rows a registry matched to `asked` (an engine, and an operation or model when named), each with its parameter schema. */
export function adapterContracts(kind, rows, adapters, asked) {
    const named = Object.fromEntries(Object.entries(asked).filter(([, value]) => value !== undefined));
    if (!rows.length)
        throw new Error(`${kind}_adapter_unsupported: no installed adapter for ${Object.values(named).join(' ')}`);
    return { version: 1, ...named, adapters: rows.map(row => ({ ...row, parameters: adapterParameters(adapters[row.tool].schema, kind) })) };
}
/** A plan follows the saved selection. `engine` and `model` on a plan call state what the caller expects and never change it. */
export function assertSelection(kind, selection, expected) {
    for (const field of ['engine', 'model'])
        if (expected[field] !== undefined && expected[field] !== selection[field])
            throw new Error(`${kind === 'video' ? 'model' : kind}_selection_mismatch: ${field} ${expected[field]} differs from the saved ${selection[field] ?? 'selection'}. ` +
                'Change the saved selection with project_manage; a plan never switches it');
}
