/**
 * `portal_character_*` — the workspace's characters on the portal (#91): list, get, create, update,
 * delete, reference image upload and the TTS block. One tool = one portal route
 * (`/characters`, `/characters/:id`, `/characters/:id/image`), with the local `assets/characters/<id>/`
 * folder as an optional source: `identityDir` reads identity.md the way the import does, and
 * `file` sends one PNG/JPEG/WebP panel. Never a project id — the portal hides that layer (#88);
 * `project` is the channel name and defaults to the channel the key was read off.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readImage } from './portal-images.js';
const channelArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'kebab-case channel slug').optional();
const uuid = z.string().uuid();
const keyArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'lowercase letters, digits or hyphens');
const scope = { channel: channelArg, episodeDir: z.string().optional() };
export const TTS_DEFAULTS = { engine: 'elevenlabs', voiceId: 'L4az9Gb378GIycFl2nAB', model: 'eleven_multilingual_v2', speed: 1 };
export const ttsSchema = z.object({
    engine: z.enum(['gemini', 'supertonic', 'elevenlabs', 'mlx']),
    voiceId: z.string().trim().min(1).max(128),
    model: z.string().trim().min(1).max(128).optional(),
    speed: z.number().min(0.7).max(1.2).optional(),
    language: z.string().trim().min(1).max(32).optional(),
    stylePrompt: z.string().trim().min(1).max(1000).optional(),
});
const fields = {
    key: keyArg.optional(),
    name: z.string().trim().min(1).max(100),
    role: z.string().trim().max(500).optional(),
    appearance: z.string().trim().max(4000).optional(),
    referenceImageUrl: z.string().trim().max(2000).optional(),
    tts: ttsSchema.optional(),
};
export const characterListSchema = z.object({ ...scope, q: z.string().trim().min(1).max(200).optional(), key: keyArg.optional(), page: z.number().int().min(1).max(10000).optional() });
export const characterGetSchema = z.object({ ...scope, id: uuid.optional(), key: keyArg.optional() })
    .refine(a => Number(Boolean(a.id)) + Number(Boolean(a.key)) === 1, 'Pass exactly one of id or key');
export const characterCreateSchema = z.object({
    ...scope,
    project: z.string().trim().min(1).max(100).optional(),
    identityDir: z.string().min(1).optional(),
    file: z.string().min(1).optional(),
    ...fields,
    name: fields.name.optional(),
}).refine(a => a.name || a.identityDir, 'Pass name, or identityDir with an identity.md heading');
export const characterUpdateSchema = z.object({ ...scope, id: uuid, key: keyArg.nullable().optional(), name: fields.name.optional(), role: fields.role.nullable(), appearance: fields.appearance.nullable(), referenceImageUrl: fields.referenceImageUrl.nullable(), tts: ttsSchema.nullable().optional() })
    .refine(a => ['key', 'name', 'role', 'appearance', 'referenceImageUrl', 'tts'].some(k => a[k] !== undefined), 'Nothing to change');
export const characterDeleteSchema = z.object({ ...scope, id: uuid });
export const characterImageUploadSchema = z.object({ ...scope, id: uuid, file: z.string().min(1), view: z.enum(['front', 'back', 'face', 'extra']).optional(), label: z.string().max(100).optional(), sort: z.number().int().min(0).max(2147483647).optional() });
export const characterExtraDeleteSchema = z.object({ ...scope, id: uuid, imageId: uuid });
export const characterTtsSetSchema = z.object({ ...scope, id: uuid, engine: ttsSchema.shape.engine.optional(), voiceId: ttsSchema.shape.voiceId.optional(), model: ttsSchema.shape.model, speed: ttsSchema.shape.speed, language: ttsSchema.shape.language, stylePrompt: ttsSchema.shape.stylePrompt });
/** The identity.md fields the import already reads — heading, **역할**, **생김새**. The folder name is the key. */
export function readIdentity(dir) {
    const folder = path.resolve(dir);
    const file = path.join(folder, 'identity.md');
    const key = path.basename(folder);
    if (!keyArg.safeParse(key).success)
        throw new Error(`identityDir must be assets/characters/<id> with a kebab-case id (got "${key}").`);
    if (!existsSync(file))
        throw new Error(`${file} not found. Nothing was sent.`);
    const text = readFileSync(file, 'utf8');
    const heading = /^#\s+(.+?)\s*(?:\(([^)]*)\))?\s*$/m.exec(text)?.[1]?.trim();
    const role = /\*\*역할\*\*:\s*(.+)/.exec(text)?.[1]?.trim();
    const appearance = /\*\*생김새\*\*:\s*(.+)/.exec(text)?.[1]?.trim();
    return { key, ...(heading ? { name: heading } : {}), ...(role ? { role } : {}), ...(appearance ? { appearance } : {}) };
}
const summarize = (c) => ({
    id: c.id, key: c.key, name: c.name, role: c.role, appearance: c.appearance,
    images: c.images ?? { front: c.referenceImageUrl, back: null, face: null, extra: [] }, imagesComplete: c.imagesComplete ?? false,
    referenceImageUrl: c.images ? c.images.front : c.referenceImageUrl, tts: c.tts, updatedAt: c.updatedAt,
});
export async function listCharacters(client, args) {
    const { data } = await client.listCharacters({ q: args.q, key: args.key, page: args.page });
    return { items: data.items.map(summarize), hasNext: data.hasNext, workspace: client.workspace };
}
async function byKey(client, key) {
    const { data } = await client.listCharacters({ key });
    return data.items[0] ?? null;
}
export async function getCharacter(client, args) {
    const record = args.id ? (await client.getCharacter(args.id)).data : await byKey(client, args.key);
    if (!record)
        throw new Error(`No character with key "${args.key}" in workspace ${client.workspace}.`);
    return summarize(record);
}
export async function createCharacter(client, args, channel) {
    const identity = args.identityDir ? readIdentity(args.identityDir) : undefined;
    const body = {
        project: args.project ?? channel,
        key: args.key ?? identity?.key,
        name: args.name ?? identity?.name,
        role: args.role ?? identity?.role,
        appearance: args.appearance ?? identity?.appearance,
        referenceImageUrl: args.referenceImageUrl,
        tts: args.tts,
    };
    if (!body.name)
        throw new Error(`${args.identityDir}/identity.md has no "# Name" heading — pass name. Nothing was sent.`);
    if (!body.project)
        throw new Error('No channel to file the character under — pass project (the channel name), channel, or episodeDir. Nothing was sent.');
    const image = args.file ? readImage(args.file) : undefined; // validate before any write
    const { data: created } = await client.createCharacter(body);
    let record = created;
    if (image) {
        await client.uploadCharacterImage(created.id, image.bytes, image.mime);
        record = (await client.getCharacter(created.id)).data;
    }
    return { created: true, ...summarize(record), project: body.project };
}
export async function updateCharacter(client, args) {
    const { id: _id, channel: _c, episodeDir: _d, ...patch } = args;
    const { data } = await client.updateCharacter(args.id, patch);
    return summarize(data);
}
export async function deleteCharacter(client, args) {
    await client.deleteCharacter(args.id);
    return { deleted: true, id: args.id };
}
export async function uploadCharacterImage(client, args) {
    const image = readImage(args.file);
    const { status, data } = await client.uploadCharacterImage(args.id, image.bytes, image.mime, args.view, args.label, args.sort);
    if (data.sha256 !== image.sha256)
        throw new Error(`The portal stored sha256 ${data.sha256} but the file is ${image.sha256}. Re-upload.`);
    return { id: args.id, imageId: data.id, view: args.view ?? "front", url: data.url, replaced: args.view !== "extra" && status === 201, sha256: data.sha256, mime: data.mime, byteSize: data.byteSize, ...(args.view === undefined || args.view === "front" ? { referenceImageUrl: data.url } : {}) };
}
/** Fills the owner's defaults (ElevenLabs multilingual v2, speed 1.0) for whatever the caller leaves out; an existing block's fields survive. */
export async function setCharacterTts(client, args) {
    const { data: current } = await client.getCharacter(args.id);
    const existing = current.tts ?? {};
    const tts = ttsSchema.parse({
        ...TTS_DEFAULTS,
        ...existing,
        ...(args.engine ? { engine: args.engine } : {}),
        ...(args.voiceId ? { voiceId: args.voiceId } : {}),
        ...(args.model ? { model: args.model } : {}),
        ...(args.speed !== undefined ? { speed: args.speed } : {}),
        ...(args.language ? { language: args.language } : {}),
        ...(args.stylePrompt ? { stylePrompt: args.stylePrompt } : {}),
    });
    const { data } = await client.updateCharacter(args.id, { tts });
    return { id: data.id, name: data.name, tts: data.tts };
}
export async function deleteCharacterExtraImage(client, args) {
    await client.deleteCharacterExtraImage(args.id, args.imageId);
    return { deleted: true, id: args.id, imageId: args.imageId };
}
