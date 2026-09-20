/**
 * `portal_*` tool handlers — the ttalkkakstory portal called by workspace API key.
 *
 * One tool = one portal route, plus the file reads and writes around it. The tools take an
 * episode directory wherever they can and read the channel (and so the key) off its path —
 * `data/<channel>/episodes/<topic>`; the ones with no directory take an optional `channel`.
 * Every write travels with the holder (`<key prefix>@<host>`), so the portal can tell two
 * machines on one key apart when a lease is held.
 *
 * Nothing here is a gate: when no key is configured the handler answers one line
 * (`portalUnavailable`) and the skill carries on in local-file mode.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { portalCredentialFile, PORTAL_CREDENTIAL_FILENAME } from './config.js';
import { describePortalError, portalClientFor, SAFE_DOCUMENT_NAME } from './portal-client.js';
import { buildImportPayload, channelOfEpisodeDir, DOCUMENT_FILES, EPISODE_STAGES, EPISODE_STATUSES, episodeDirOf, readDocuments, readPortalState, SCENARIO_CANDIDATES, writePortalState, } from './portal-episode.js';
export const PORTAL_TOOL_NAMES = [
    'portal_workspace_check',
    'portal_storyboard_save',
    'portal_storyboard_list',
    'portal_storyboard_pull',
    'portal_episode_status',
    'portal_episode_create',
    'portal_episode_checkpoint',
    'portal_episode_revisions',
    'portal_episode_restore',
    'portal_episode_lease',
    'portal_scenario_save',
    'portal_scenario_pull',
    'portal_scenario_choose',
];
const channelArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'kebab-case channel slug').optional();
const uuid = z.string().uuid();
const stage = z.enum(EPISODE_STAGES);
const candidate = z.enum(SCENARIO_CANDIDATES);
export const workspaceCheckSchema = z.object({ channel: channelArg, episodeDir: z.string().optional() });
export const storyboardSaveSchema = z.object({
    episodeDir: z.string().min(1),
    project: z.string().min(1).optional(),
    storyboardTitle: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    stage: stage.optional(),
    baseRevisionNo: z.number().int().min(0).optional(),
    note: z.string().max(500).optional(),
});
export const storyboardListSchema = z.object({
    channel: channelArg,
    storyboardId: uuid.optional(),
    query: z.string().optional(),
    projectId: uuid.optional(),
    page: z.number().int().min(1).optional(),
});
export const storyboardPullSchema = z.object({
    episodeId: uuid,
    targetDir: z.string().min(1),
    includeDocuments: z.boolean().optional(),
    revision: z.number().int().min(1).optional(),
});
export const episodeStatusSchema = z.object({
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
    status: z.enum(EPISODE_STATUSES).optional(),
    stage: stage.optional(),
    title: z.string().min(1).max(200).optional(),
});
export const episodeCreateSchema = z.object({
    storyboardId: uuid,
    slug: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    format: z.enum(['shorts-9x16', 'youtube-long-16x9']).optional(),
    stage: stage.optional(),
    sourceChannelSlug: z.string().max(120).optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
});
export const episodeCheckpointSchema = z.object({
    stage,
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
    baseRevisionNo: z.number().int().min(0).optional(),
    note: z.string().max(500).optional(),
    documents: z.array(z.string()).optional(),
});
export const episodeRevisionsSchema = z.object({
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
    revisionNo: z.number().int().min(1).optional(),
});
export const episodeRestoreSchema = z.object({
    revisionNo: z.number().int().min(1),
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
    note: z.string().max(500).optional(),
});
export const episodeLeaseSchema = z.object({
    action: z.enum(['acquire', 'release', 'status']),
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
    ttlMinutes: z.number().int().min(1).max(1440).optional(),
    force: z.boolean().optional(),
});
export const scenarioSaveSchema = z.object({
    candidate,
    file: z.string().optional(),
    markdown: z.string().optional(),
    chosen: z.boolean().optional(),
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
});
export const scenarioPullSchema = z.object({
    targetDir: z.string().optional(),
    candidate: candidate.optional(),
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
});
export const scenarioChooseSchema = z.object({
    candidate,
    episodeId: uuid.optional(),
    episodeDir: z.string().optional(),
    channel: channelArg,
});
const ok = (payload) => ({ text: JSON.stringify(payload, null, 2), isError: false });
const failed = (error) => ({ text: describePortalError(error), isError: true });
/** The one line a skill reads to fall back to local-file mode — where a key would go, and how to get one. */
export function portalUnavailable(channel) {
    const where = channel ? `${portalCredentialFile(channel)} (or ${portalCredentialFile()})` : portalCredentialFile();
    return (`No ttalkkakstory portal key configured — the episode stays a local file. ` +
        `To mirror it, issue a workspace API key on the portal (/{workspace}/settings/api-keys) and save it as ${where} ` +
        `as { "apiUrl", "workspace", "apiKey" } (${PORTAL_CREDENTIAL_FILENAME}), or set TTALKKAKSTORY_API_URL · TTALKKAKSTORY_WORKSPACE · TTALKKAKSTORY_API_KEY.`);
}
/** Channel argument first, then the episode directory's path. */
function channelFor(explicit, ...dirs) {
    if (explicit)
        return explicit;
    for (const dir of dirs) {
        const channel = channelOfEpisodeDir(dir);
        if (channel)
            return channel;
    }
    return undefined;
}
function resolveClient(fetchImpl, explicit, ...dirs) {
    const channel = channelFor(explicit, ...dirs);
    let client;
    try {
        client = portalClientFor(channel, fetchImpl);
    }
    catch (error) {
        return { error: failed(error) };
    }
    if (!client)
        return { error: { text: portalUnavailable(channel), isError: true } };
    return { client, channel };
}
/**
 * The directory's `.portal.json` names the workspace it is a copy of. A write with a key for
 * another workspace would not fail — the portal would create a second, unrelated episode
 * there and the topic would fork silently (loop R1). So every tool that writes, or that
 * overwrites the directory, refuses when the two differ; a directory with no record passes.
 */
export function workspaceMismatch(client, dir) {
    if (!dir)
        return null;
    const recorded = readPortalState(dir)?.workspace;
    if (!recorded || recorded === client.workspace)
        return null;
    return (`Workspace mismatch — ${episodeDirOf(dir)}/.portal.json says this directory is a copy of workspace "${recorded}", ` +
        `but the key in use (${client.source}) opens workspace "${client.workspace}". Nothing was sent. ` +
        `Fix the key file for this channel, or — to start the topic over in "${client.workspace}" — delete .portal.json first.`);
}
function refuseMismatch(client, ...dirs) {
    for (const dir of dirs) {
        const message = workspaceMismatch(client, dir);
        if (message)
            return { text: message, isError: true };
    }
    return null;
}
/** Episode id — the argument, or `episodeDir/.portal.json`. */
function resolveEpisodeId(episodeId, episodeDir) {
    if (episodeId)
        return episodeId;
    const state = episodeDir ? readPortalState(episodeDir) : null;
    if (state?.episodeId)
        return state.episodeId;
    throw new Error('episodeId is missing — pass it, or pass an episodeDir that holds .portal.json (portal_storyboard_pull · portal_storyboard_save · portal_episode_create write it).');
}
/** The handlers, with fetch injectable so the tests never touch a network. */
export function portalHandlers(fetchImpl) {
    return {
        async workspaceCheck({ channel, episodeDir }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            try {
                const { data } = await r.client.me();
                const state = episodeDir ? readPortalState(episodeDir) : null;
                const mismatch = workspaceMismatch(r.client, episodeDir);
                return ok({
                    channel: r.channel ?? null,
                    workspace: r.client.workspace,
                    source: r.client.source,
                    holder: r.client.holder,
                    ...(episodeDir
                        ? {
                            episodeDir: episodeDirOf(episodeDir),
                            copyOf: state ? { workspace: state.workspace ?? null, episodeId: state.episodeId ?? null, headRevisionNo: state.headRevisionNo ?? null } : null,
                            workspaceMatches: !mismatch,
                            ...(mismatch ? { warning: mismatch } : {}),
                        }
                        : {}),
                    ...data,
                });
            }
            catch (error) {
                return failed(error);
            }
        },
        async storyboardSave({ episodeDir, project, storyboardTitle, title, stage: stageArg, baseRevisionNo, note }) {
            const r = resolveClient(fetchImpl, undefined, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const payload = buildImportPayload(episodeDir, { project, storyboard: storyboardTitle, title });
                const state = readPortalState(episodeDir);
                const base = baseRevisionNo ?? state?.headRevisionNo;
                payload.episode = {
                    ...payload.episode,
                    ...(state?.episodeId ? { id: state.episodeId } : {}),
                    ...(stageArg ? { stage: stageArg } : {}),
                    ...(base !== undefined ? { baseRevisionNo: base } : {}),
                    ...(note ? { note } : {}),
                    sourceHost: r.client.holder,
                };
                const { status, data } = await r.client.importStoryboard(payload);
                writePortalState(episodeDir, {
                    workspace: r.client.workspace,
                    storyboardId: data.storyboardId,
                    episodeId: data.episodeId,
                    headRevisionNo: data.revisionNo,
                });
                return ok({
                    result: status === 201 ? 'created' : 'updated',
                    ...data,
                    pageUrl: r.client.pageUrl(data.url),
                    uploaded: {
                        scenes: payload.scenes.length,
                        characters: payload.characters.map((c) => c.id),
                        documents: payload.documents.map((d) => d.filename),
                    },
                });
            }
            catch (error) {
                return failed(error);
            }
        },
        async storyboardList({ channel, storyboardId, query, projectId, page }) {
            const r = resolveClient(fetchImpl, channel);
            if ('error' in r)
                return r.error;
            try {
                if (storyboardId)
                    return ok((await r.client.listEpisodes(storyboardId)).data);
                return ok((await r.client.listStoryboards({ q: query, projectId, page })).data);
            }
            catch (error) {
                return failed(error);
            }
        },
        async storyboardPull({ episodeId, targetDir, includeDocuments = true, revision }) {
            const r = resolveClient(fetchImpl, undefined, targetDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, targetDir);
            if (refused)
                return refused;
            try {
                const c = r.client;
                const { data: episode } = await c.getEpisode(episodeId);
                const dir = episodeDirOf(targetDir);
                const sb = path.join(dir, 'storyboard');
                mkdirSync(sb, { recursive: true });
                const written = [];
                writeFileSync(path.join(sb, 'scenes.js'), await c.scenesJs(episodeId, revision));
                written.push('scenes.js');
                if (revision) {
                    // A named revision writes that revision's documents — mixing head's documents under old shots
                    // puts today's script on yesterday's board. A document the revision lacks is not fetched.
                    if (includeDocuments) {
                        const { data: rev } = await c.getRevision(episodeId, revision);
                        for (const [filename, content] of Object.entries(rev.documents ?? {})) {
                            if (filename === 'scenes.js' || !SAFE_DOCUMENT_NAME.test(filename))
                                continue;
                            writeFileSync(path.join(sb, filename), content);
                            written.push(filename);
                        }
                    }
                }
                else {
                    if (includeDocuments) {
                        for (const doc of episode.documents ?? []) {
                            if (doc.filename === 'scenes.js')
                                continue; // the rebuilt one is the source of truth
                            if (!SAFE_DOCUMENT_NAME.test(doc.filename))
                                continue;
                            writeFileSync(path.join(sb, doc.filename), await c.document(episodeId, doc.filename));
                            written.push(doc.filename);
                        }
                    }
                    // The chosen scenario rides along — the board checker reads scenario.md next to scenes.js.
                    const chosen = (episode.scenarios ?? []).find((s) => s.chosen);
                    if (chosen) {
                        writeFileSync(path.join(sb, 'scenario.md'), await c.scenarioMd(episodeId, chosen.candidate));
                        written.push('scenario.md');
                    }
                }
                writePortalState(dir, {
                    workspace: c.workspace,
                    storyboardId: episode.storyboardId,
                    episodeId,
                    headRevisionNo: revision ?? episode.headRevisionNo,
                });
                return ok({
                    episode: {
                        id: episode.id,
                        slug: episode.slug,
                        title: episode.title,
                        sceneCount: episode.sceneCount,
                        stage: episode.stage,
                        headRevisionNo: episode.headRevisionNo,
                        lease: episode.lease,
                    },
                    revision: revision ?? null,
                    dir: sb,
                    written,
                });
            }
            catch (error) {
                return failed(error);
            }
        },
        async episodeStatus({ episodeId, episodeDir, channel, status, stage: stageArg, title }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const patch = { ...(status ? { status } : {}), ...(stageArg ? { stage: stageArg } : {}), ...(title ? { title } : {}) };
                if (Object.keys(patch).length === 0)
                    throw new Error('one of status · stage · title is required.');
                const id = resolveEpisodeId(episodeId, episodeDir);
                return ok((await r.client.updateEpisode(id, patch)).data);
            }
            catch (error) {
                return failed(error);
            }
        },
        async episodeCreate({ storyboardId, episodeDir, channel, ...body }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const { data } = await r.client.createEpisode(storyboardId, body);
                if (episodeDir) {
                    mkdirSync(episodeDirOf(episodeDir), { recursive: true });
                    writePortalState(episodeDir, { workspace: r.client.workspace, storyboardId, episodeId: data.id, headRevisionNo: 0 });
                }
                return ok({ ...data, pageUrl: r.client.pageUrl(data.url) });
            }
            catch (error) {
                return failed(error);
            }
        },
        async episodeCheckpoint({ stage: stageArg, episodeId, episodeDir, channel, baseRevisionNo, note, documents }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir);
                const state = episodeDir ? readPortalState(episodeDir) : null;
                const body = {
                    stage: stageArg,
                    note,
                    sourceHost: r.client.holder,
                    baseRevisionNo: baseRevisionNo ?? state?.headRevisionNo,
                };
                let uploadedDocuments = [];
                let uploadedScenes = 0;
                if (episodeDir) {
                    const dir = episodeDirOf(episodeDir);
                    const sb = path.join(dir, 'storyboard');
                    if (existsSync(path.join(sb, 'scenes.js'))) {
                        const payload = buildImportPayload(dir);
                        body.scenes = payload.scenes;
                        body.meta = payload.episode.meta;
                        body.characters = payload.characters;
                        uploadedScenes = payload.scenes.length;
                    }
                    const docs = readDocuments(sb, documents ?? DOCUMENT_FILES);
                    body.documents = docs;
                    uploadedDocuments = docs.map((d) => d.filename);
                }
                const { status, data } = await r.client.checkpoint(id, body);
                if (episodeDir)
                    writePortalState(episodeDir, { episodeId: id, headRevisionNo: data.revisionNo });
                return ok({
                    result: status === 201 ? 'new revision' : 'unchanged (stage only)',
                    ...data,
                    uploaded: { scenes: uploadedScenes, documents: uploadedDocuments },
                });
            }
            catch (error) {
                return failed(error);
            }
        },
        async episodeRevisions({ episodeId, episodeDir, channel, revisionNo }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir);
                const { data } = revisionNo ? await r.client.getRevision(id, revisionNo) : await r.client.listRevisions(id);
                return ok(data);
            }
            catch (error) {
                return failed(error);
            }
        },
        async episodeRestore({ revisionNo, episodeId, episodeDir, channel, note }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir);
                const { data } = await r.client.restoreRevision(id, revisionNo, { note, sourceHost: r.client.holder });
                if (episodeDir)
                    writePortalState(episodeDir, { episodeId: id, headRevisionNo: data.revisionNo });
                return ok(data);
            }
            catch (error) {
                return failed(error);
            }
        },
        async episodeLease({ action, episodeId, episodeDir, channel, ttlMinutes, force }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir);
                const me = r.client.holder;
                if (action === 'status')
                    return ok({ holder: me, ...(await r.client.getLease(id)).data });
                if (action === 'acquire') {
                    const { data } = await r.client.acquireLease(id, { holder: me, ...(ttlMinutes ? { ttlMinutes } : {}) });
                    if (episodeDir)
                        writePortalState(episodeDir, { episodeId: id, holder: me });
                    return ok(data);
                }
                return ok((await r.client.releaseLease(id, { holder: me, ...(force ? { force } : {}) })).data);
            }
            catch (error) {
                return failed(error);
            }
        },
        async scenarioSave({ candidate: cand, file, markdown, chosen, episodeId, episodeDir, channel }) {
            // candidates/dN.md sits two levels under the episode directory; scenario.md one level (storyboard/).
            const dirFromFile = file ? (path.basename(path.dirname(file)) === 'candidates' ? path.dirname(path.dirname(file)) : path.dirname(file)) : undefined;
            const r = resolveClient(fetchImpl, channel, episodeDir, dirFromFile);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir, dirFromFile);
            if (refused)
                return refused;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir ?? dirFromFile);
                const source = markdown ?? (file ? readFileSync(file, 'utf8') : null);
                if (source === null)
                    throw new Error('one of file · markdown is required.');
                const { status, data } = await r.client.saveScenario(id, cand, {
                    markdown: source,
                    sourceHost: r.client.holder,
                    ...(chosen !== undefined ? { chosen } : {}),
                });
                return ok({
                    result: status === 201 ? 'created' : 'updated',
                    candidate: data.candidate,
                    chosen: data.chosen,
                    findings: data.findings,
                    updatedAt: data.updatedAt,
                });
            }
            catch (error) {
                return failed(error);
            }
        },
        async scenarioPull({ targetDir, candidate: cand, episodeId, episodeDir, channel }) {
            const r = resolveClient(fetchImpl, channel, episodeDir, targetDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir, targetDir);
            if (refused)
                return refused;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir ?? targetDir);
                if (cand && !targetDir)
                    return { text: await r.client.scenarioMd(id, cand), isError: false };
                const { data } = await r.client.listScenarios(id);
                const written = [];
                if (targetDir) {
                    const dir = episodeDirOf(targetDir);
                    const sb = path.join(dir, 'storyboard');
                    const candDir = path.join(sb, 'candidates');
                    mkdirSync(candDir, { recursive: true });
                    for (const s of data.scenarios) {
                        if (cand && s.candidate !== cand)
                            continue;
                        const file = path.join(candDir, `${s.candidate.toLowerCase()}.md`);
                        writeFileSync(file, s.markdown);
                        written.push(path.relative(dir, file));
                        if (s.chosen) {
                            writeFileSync(path.join(sb, 'scenario.md'), s.markdown);
                            written.push('storyboard/scenario.md');
                        }
                    }
                }
                return ok({
                    scenarios: data.scenarios.map((s) => ({
                        candidate: s.candidate,
                        chosen: s.chosen,
                        score: s.meta?.score ?? null,
                        p0: s.meta?.p0 ?? null,
                        findings: s.findings.length,
                    })),
                    written,
                });
            }
            catch (error) {
                return failed(error);
            }
        },
        async scenarioChoose({ candidate: cand, episodeId, episodeDir, channel }) {
            const r = resolveClient(fetchImpl, channel, episodeDir);
            if ('error' in r)
                return r.error;
            const refused = refuseMismatch(r.client, episodeDir);
            if (refused)
                return refused;
            try {
                const id = resolveEpisodeId(episodeId, episodeDir);
                const { data } = await r.client.chooseScenario(id, cand);
                return ok({ candidate: data.candidate, chosen: data.chosen, findings: data.findings });
            }
            catch (error) {
                return failed(error);
            }
        },
    };
}
