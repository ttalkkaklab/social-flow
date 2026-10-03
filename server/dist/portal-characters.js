import { voiceLockConfigSchema } from './voice-lock-config.js';
/**
 * `portal_character_*` — the workspace's characters on the portal (#91): list, get, create, update,
 * delete, reference image upload and the TTS block. One tool = one portal route
 * (`/characters`, `/characters/:id`, `/characters/:id/image`), with the local `assets/characters/<id>/`
 * folder as an optional source: `identityDir` reads identity.md the way the import does, and
 * `file` sends one PNG/JPEG/WebP panel. Never a project id — the portal hides that layer (#88);
 * `project` is the channel name and defaults to the channel the key was read off.
 *
 * Reads name that layer too: one `key` can exist in several projects, so `project` narrows a
 * lookup and every summary carries `projectId` so the caller can see which one it got. Without
 * `project` the lookup stays workspace-wide, but a `key` matching more than one project throws
 * instead of picking by order — the one documented key caller decides create-or-reuse from the
 * answer (skills/channel/references/portal-characters.md), so a quiet pick becomes a wrong write.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readImage } from './portal-images.js';
const channelArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'kebab-case channel slug').optional();
const uuid = z.string().uuid();
const keyArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'lowercase letters, digits or hyphens');
const scope = { channel: channelArg, episodeDir: z.string().optional() };
/** The project layer, named not identified (#88) — one arg shared by create and the two reads so they cannot drift apart again. */
const projectArg = z.string().trim().min(1).max(100);
export const TTS_DEFAULTS = { engine: 'elevenlabs', voiceId: 'L4az9Gb378GIycFl2nAB', model: 'eleven_multilingual_v2', speed: 1 };
export const ttsSchema = z.object({
    voiceLock: voiceLockConfigSchema.optional(),
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
export const characterListSchema = z.object({ ...scope, project: projectArg.optional(), q: z.string().trim().min(1).max(200).optional(), key: keyArg.optional(), page: z.number().int().min(1).max(10000).optional() });
export const characterGetSchema = z.object({ ...scope, project: projectArg.optional(), id: uuid.optional(), key: keyArg.optional() })
    .refine(a => Number(Boolean(a.id)) + Number(Boolean(a.key)) === 1, 'Pass exactly one of id or key')
    .refine(a => !(a.project && a.id), 'project narrows a key lookup; an id is already exact. Drop one.');
export const characterCreateSchema = z.object({
    ...scope,
    project: projectArg.optional(),
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
export const characterTtsSetSchema = z.object({ ...scope, id: uuid, voiceLock: voiceLockConfigSchema.optional(), engine: ttsSchema.shape.engine.optional(), voiceId: ttsSchema.shape.voiceId.optional(), model: ttsSchema.shape.model, speed: ttsSchema.shape.speed, language: ttsSchema.shape.language, stylePrompt: ttsSchema.shape.stylePrompt });
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
    id: c.id, projectId: c.projectId, key: c.key, name: c.name, role: c.role, appearance: c.appearance,
    images: c.images ?? { front: c.referenceImageUrl, back: null, face: null, extra: [] }, imagesComplete: c.imagesComplete ?? false,
    referenceImageUrl: c.images ? c.images.front : c.referenceImageUrl, tts: c.tts, updatedAt: c.updatedAt,
});
/**
 * `project` (a channel name) to the id the portal filters by. Exact match on the name; a workspace
 * with two same-named projects is itself ambiguous, so it throws rather than guess.
 *
 * The name↔id layer is one capped read: the portal answers `GET /projects` with
 * `desc(updatedAt)` and `limit: 200` and the route takes no query at all — no paging, no name
 * filter (ttalkkaklab `src/features/project/dal.ts:12-18`, `projects/[…]/route.ts:9-12`; read off
 * `origin/main`·`origin/dev`, which carry the same value). So past that cap a name cannot be
 * resolved through this path, and a project nobody has touched lately is the one that falls out.
 * That is a real ceiling for a `project`-only `list` — there is no candidate set to work back from.
 * A read that carries a `key` does have one (`GET /projects/{projectId}` is uncapped), and the PR
 * body records why that reverse lookup was not taken. Until then: never state the miss as more
 * than this read saw.
 */
async function resolveProjectId(client, project) {
    const { data: projects } = await client.listProjects();
    const matches = projects.filter(p => p.name === project);
    if (matches.length === 1) {
        const id = matches[0].id?.trim();
        // An empty projectId is "no filter" on the portal side (characters schema takes z.literal("")),
        // and the query builder drops empty values — so a blank id here would quietly widen the read
        // back to the whole workspace. Refuse instead.
        if (!id)
            throw new Error(`The portal returned project "${project}" with no id, so the read cannot be narrowed to it. Nothing was read.`);
        return id;
    }
    const names = projects.map(p => p.name).sort();
    if (matches.length === 0) {
        throw new Error(`No project named "${project}" among the ${names.length} most recently updated projects of ` +
            `workspace ${client.workspace}: ${names.join(', ')}. That list is the whole read — the portal ` +
            `caps it and offers no paging — so a project left untouched for longer can sit outside it.`);
    }
    throw new Error(`Workspace ${client.workspace} has ${matches.length} projects named "${project}" in this read (${matches.map(p => p.id).join(', ')}) — it cannot be named unambiguously. Ask the portal owner to rename one.`);
}
/**
 * Names for an ambiguity message; ids alone if the project list cannot be read. Candidates past the
 * project cap above degrade to their id here (`?? c.projectId`) rather than go missing.
 */
async function projectNames(client) {
    try {
        const { data: projects } = await client.listProjects();
        return new Map(projects.map((p) => [p.id, p.name]));
    }
    catch {
        return new Map();
    }
}
export async function listCharacters(client, args) {
    const projectId = args.project ? await resolveProjectId(client, args.project) : undefined;
    const { data } = await client.listCharacters({ projectId, q: args.q, key: args.key, page: args.page });
    return { items: data.items.map(summarize), hasNext: data.hasNext, workspace: client.workspace, ...(args.project ? { project: args.project, projectId } : {}) };
}
/**
 * One record for a key. With a projectId the portal returns at most one. Without one, several
 * projects can hold the same key — then the order decides, so this refuses to pick.
 *
 * The candidate read is one page (the portal's character page size is 24), so the count in the
 * message is "at least" whenever `hasNext` says more are behind it. The verdict itself does not
 * depend on the page: `key` is a `where` clause, applied before the LIMIT, so every candidate the
 * first page holds really matches and two of them are already enough to refuse. A page that cut
 * the set can only understate how many projects share the key, never hide the sharing.
 */
async function byKey(client, key, projectId, project) {
    const { data } = await client.listCharacters({ key, projectId });
    if (data.items.length <= 1)
        return data.items[0] ?? null;
    const counted = data.hasNext ? `at least ${data.items.length}` : `${data.items.length}`;
    const page = data.hasNext ? ' Only the first page of candidates was read, so there may be more.' : '';
    // Narrowed and still several — one project holds duplicate keys, so only an id can pick.
    if (project) {
        throw new Error(`Project "${project}" holds ${counted} characters with key "${key}" (ids ${data.items.map(c => c.id).join(', ')}). Pass id — nothing was read.${page}`);
    }
    const names = await projectNames(client);
    const where = data.items.map(c => `${names.get(c.projectId) ?? c.projectId} (id ${c.id})`).sort().join(' · ');
    throw new Error(`Key "${key}" exists in ${counted} projects of workspace ${client.workspace}: ${where}. ` +
        `Pass project (the channel name) or id to say which one — nothing was read from the wrong one.${page}`);
}
export async function getCharacter(client, args) {
    const projectId = args.project ? await resolveProjectId(client, args.project) : undefined;
    const record = args.id ? (await client.getCharacter(args.id)).data : await byKey(client, args.key, projectId, args.project);
    if (!record) {
        throw new Error(args.project
            ? `No character with key "${args.key}" in project "${args.project}" of workspace ${client.workspace}.`
            : `No character with key "${args.key}" in workspace ${client.workspace}.`);
    }
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
        ...(args.voiceLock !== undefined ? { voiceLock: args.voiceLock } : {}),
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
