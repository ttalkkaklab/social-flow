import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { z } from 'zod';
import { portalClientFor, describePortalError } from './portal-client.js';
import { evaluateWindowScript } from './scenes-vm.js';
import { checkStoryboard, applyPatch } from './storyboard.js';
import { editUnit, unitEditSchema, object } from './portal-unit-edit.js';
import { UNIT_NAMES, UNIT_TOOL_NAMES } from './portal-unit-tools.js';
const apiArgs = z.object({
    channel: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(), episodeId: z.string().uuid().optional(), storyboardId: z.string().uuid().optional(),
    id: z.string().uuid().optional(), value: z.record(z.unknown()).optional(), query: z.string().min(1).optional(),
    candidate: z.enum(['D1', 'D2', 'D3']).optional(), file: z.string().optional(), kind: z.enum(['music', 'sfx']).optional(),
    baseRevisionNo: z.number().int().nonnegative().optional(),
}).strict();
function required(value, field) { if (value === undefined)
    throw new Error(`${field} is required`); return value; }
export async function runPortalUnit(name, raw, fetchImpl) {
    try {
        const args = UNIT_NAMES.includes(name) ? unitEditSchema.parse(raw) : apiArgs.parse(raw);
        const client = await portalClientFor(args.channel, fetchImpl);
        if (!client)
            throw new Error('No portal workspace key is configured.');
        const value = UNIT_NAMES.includes(name) ? await boardOperation(client, name, unitEditSchema.parse(raw)) : await apiOperation(client, name, apiArgs.parse(raw));
        return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError: typeof value === 'object' && value !== null && 'saved' in value && value.saved === false };
    }
    catch (error) {
        return { content: [{ type: 'text', text: describePortalError(error) }], isError: true };
    }
}
/**
 * 교차 제약이 걸린 `$mix` 키 묶음 — **한 덩이로** 채운다. 회차가 묶음 안의 한 칸이라도 적었으면
 * 나머지는 프로젝트에서 안 가져온다. 키 단위로 채우면 양쪽 다 혼자서는 유효한 값인데
 * 합쳐진 `$mix` 가 모순되어 보드 쓰기가 통째로 막힌다 — 프로젝트 `{bed:10,min:8}` + 회차
 * `{bed:4}` 는 `min 8 > bed 4` 가 되고, 쓰는 사람은 그 회차에 적지도 않은 값 때문에 막힌다.
 * 포털 `SOUND_MIX_RANGES` 13칸 중 교차 규칙이 걸린 자리는 이 쌍 하나뿐이다
 * (`check-scenes.js` 의 `minimumSeparationLu > bedSeparationLu` 검사).
 */
const COUPLED_MIX_KEYS = [['bedSeparationLu', 'minimumSeparationLu']];
/**
 * 채널 음향 기본값을 회차 보드의 `$mix` 빈 칸에만 채운다 — 우선순위는
 * 샷 > 회차 `$mix` > 프로젝트 `sound` > `build-reel.sh` 기본값이고, 해석은 보드 한 곳이다.
 * 빌드는 지금처럼 보드만 읽으므로 이 함수가 도는 자리(스토리보드 단계의 음악 쓰기)가
 * 프로젝트 값이 보드에 서는 유일한 길이다.
 *
 * **키 단위로 빈 칸만 채운다.** 회차에 이미 있는 값은 덮지 않고, `hook`·`ducking` 안쪽도
 * 같은 규칙이다. 그래서 프로젝트가 `hook.attenuationLu` 를 주고 회차가
 * `hook.releaseSeconds` 를 주면 둘이 합쳐진다.
 *
 * **단 `COUPLED_MIX_KEYS` 의 묶음은 한 덩이다** — 그 쌍은 포털도 검사기도 「함께」 보므로
 * 반쪽만 채우면 모순된 `$mix` 가 된다. 자세한 까닭은 그 상수의 주석에 적어 두었다.
 *
 * **스냅숏이다.** 한 번 채운 뒤 프로젝트 값을 바꿔도 이미 채워진 회차에는 번지지 않는다 —
 * 빌드를 다시 돌려도 같은 결과가 나오게 하려고 고른 모양이다.
 *
 * 프로젝트에 값이 없으면(빈 `mix`) 아무것도 하지 않는다. **404 는 삼키지 않는다** — 그 코드는
 * 「기본값 없음」이 아니라 「그 프로젝트가 없다」는 뜻이고, 조용히 넘기면 빌드가 기본값으로
 * 돌아 「코드는 맞는데 측정이 떨어지는」 꼴이 된다(포털 `/sound` 는 값이 없는 프로젝트에도
 * 200 + 빈 `mix` 를 준다).
 *
 * 라우트 밖으로 내보낸 까닭: 쓰기 경로 전체를 거치면 보드가 검사기를 통과해야 checkpoint 에
 * 닿으므로, 채우기 규칙(빈 칸만·중첩 병합·404 는 던진다)이 검사기 실패에 묻힌다. 여기서
 * 직접 불러 그 규칙만 잰다.
 */
export async function fillMixFromProject(client, storyboardId, board) {
    const { data: storyboard } = await client.request('GET', `/storyboards/${storyboardId}`);
    const projectId = object(storyboard).projectId;
    if (typeof projectId !== 'string' || !projectId)
        throw new Error('storyboard has no projectId — cannot resolve the channel sound defaults');
    const { data: sound } = await client.request('GET', `/projects/${projectId}/sound`);
    const defaults = object(object(object(sound).value ?? {}).mix ?? {});
    const music = object(board.MUSIC ?? {});
    const mix = object(music.$mix ?? {});
    const filled = [];
    const next = { ...mix };
    // 교차 제약 묶음은 회차가 한 칸이라도 적었으면 그 묶음 전체를 건드리지 않는다.
    const coupledSkip = new Set();
    for (const group of COUPLED_MIX_KEYS)
        if (group.some(key => mix[key] !== undefined))
            for (const key of group)
                coupledSkip.add(key);
    for (const [key, value] of Object.entries(defaults)) {
        if (coupledSkip.has(key))
            continue;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const current = object(mix[key] ?? {}), merged = { ...current };
            for (const [inner, innerValue] of Object.entries(object(value))) {
                if (current[inner] === undefined) {
                    merged[inner] = innerValue;
                    filled.push(`${key}.${inner}`);
                }
            }
            if (Object.keys(merged).length)
                next[key] = merged;
        }
        else if (mix[key] === undefined) {
            next[key] = value;
            filled.push(key);
        }
    }
    if (filled.length)
        board.MUSIC = { ...music, $mix: next };
    return { filled };
}
async function boardOperation(client, name, args) {
    const suffix = name.slice(7), split = suffix.lastIndexOf('_'), area = suffix.slice(0, split), action = suffix.slice(split + 1);
    const { data: episode } = await client.getEpisode(args.episodeId);
    const head = episode.headRevisionNo ?? 0;
    const read = ['get', 'list'].includes(action);
    if (!read && args.baseRevisionNo !== head)
        throw new Error(`head_moved: expected ${args.baseRevisionNo}, current ${head}. Read and reconcile before retrying.`);
    // One detail response contains the head and its raw meta/shots; do not mix separate head reads.
    const detail = episode;
    const meta = object(detail.meta ?? {});
    const board = { ...meta, SB_DOC: { ...object(meta.SB_DOC ?? {}), backgrounds: detail.backgrounds, props: detail.props, characters: detail.characters, narratorCharacterId: detail.narratorCharacterId }, SCENES: detail.scenes.map(s => s.extra) };
    // Legacy boards without ids receive deterministic ids at this observed head.
    // A later write persists them under the same optimistic revision guard.
    const identified = (board.SCENES ?? []).some(shot => !shot.id)
        ? applyPatch(board, { path: '', dryRun: false, draft: args.draft }).win : board;
    // 음악 쓰기 전에 채널 기본값으로 빈 `$mix` 칸을 채운다 — 이 자리가 프로젝트 값이 보드에
    // 서는 유일한 길이다(위 `fillMixFromProject`). 읽기에는 걸지 않는다: 읽기가 포털 상태를
    // 바꾸면 GET 이 멱등하지 않게 되고, 채우기는 쓰기와 같은 revision 가드 안에 있어야 한다.
    let filledFromProject = [];
    if (area === 'episode_music' && !read)
        filledFromProject = (await fillMixFromProject(client, episode.storyboardId, identified)).filled;
    const result = editUnit(identified, area, action, args);
    if (read)
        return { headRevisionNo: head, value: result.value };
    // 채우기가 넣은 키는 성공뿐 아니라 **실패에도** 실어야 한다 — 검사기가 떨어뜨렸을 때
    // 「프로젝트 기본값이 끼어들어 깨졌다」를 응답만 보고 알 수 있어야 한다.
    const filledNote = filledFromProject.length ? { filledFromProjectSound: filledFromProject } : {};
    const filledSuffix = filledFromProject.length ? ` (filledFromProjectSound: ${JSON.stringify(filledFromProject)})` : '';
    const normalized = applyPatch(result.board, { path: '', dryRun: false, draft: args.draft });
    if (normalized.findings.some(f => f.level === 'bad'))
        throw new Error(`Board not saved: ${JSON.stringify(normalized.findings)}${filledSuffix}`);
    const source = Object.entries(normalized.win).map(([key, value]) => `window[${JSON.stringify(key)}] = ${JSON.stringify(value)};`).join('\n');
    const checked = evaluateWindowScript(source);
    const dir = mkdtempSync(join(tmpdir(), 'portal-unit-'));
    try {
        const file = join(dir, 'scenes.js');
        writeFileSync(file, source);
        // Companion source documents are needed by the same checker used for local boards.
        for (const doc of episode.documents ?? [])
            if (['scenario.md', 'script.md'].includes(doc.filename))
                writeFileSync(join(dir, doc.filename), await client.document(args.episodeId, doc.filename));
        const chosen = episode.scenarios?.find(s => s.chosen);
        if (chosen)
            writeFileSync(join(dir, 'scenario.md'), await client.scenarioMd(args.episodeId, chosen.candidate));
        const check = checkStoryboard({ path: file, draft: args.draft });
        if (check.violations)
            return { saved: false, headRevisionNo: head, check, ...filledNote };
        const { SCENES, SB_DOC, ...nextMeta } = checked;
        // SB_DOC is metadata too; keep extensions such as imported registries.
        const { data } = await client.checkpoint(args.episodeId, { stage: episode.stage ?? 'board', baseRevisionNo: head, sourceHost: client.holder, note: args.note ?? name, scenes: SCENES, backgrounds: object(SB_DOC).backgrounds, props: object(SB_DOC).props, meta: { ...nextMeta, SB_DOC }, characters: object(SB_DOC).characters, narratorCharacterId: object(SB_DOC).narratorCharacterId });
        return { saved: true, ...data, check, localCopy: { unchanged: true, syncRequired: true }, ...filledNote };
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
async function apiOperation(c, name, a) {
    const suffix = name.slice(7), at = suffix.lastIndexOf('_'), area = suffix.slice(0, at), action = suffix.slice(at + 1);
    const body = () => required(a.value, 'value');
    const ep = () => required(a.episodeId, 'episodeId');
    const sb = () => required(a.storyboardId, 'storyboardId');
    const id = () => required(a.id, 'id');
    if (area === 'storyboard')
        return (await c.request(action === 'get' ? 'GET' : action === 'create' ? 'POST' : action === 'update' ? 'PATCH' : 'DELETE', `/storyboards${action === 'create' ? '' : `/${sb()}`}`, ['create', 'update'].includes(action) ? body() : undefined)).data;
    if (area === 'episode') {
        if (action === 'list')
            return (await c.listEpisodes(sb())).data;
        if (action === 'get')
            return (await c.getEpisode(ep())).data;
        return (await c.request(action === 'update' ? 'PATCH' : 'DELETE', `/episodes/${ep()}`, action === 'update' ? body() : undefined)).data;
    }
    if (area === 'scene' && action === 'search')
        return (await c.request('GET', `/scenes/search?q=${encodeURIComponent(required(a.query, 'query'))}`)).data;
    if (area === 'scenario')
        return (await c.request('DELETE', `/episodes/${ep()}/scenarios/${required(a.candidate, 'candidate')}`)).data;
    if (area === 'render_allocation')
        return (await c.request('POST', `/episodes/${ep()}/render-allocation`, { ...body(), baseRevisionNo: required(a.baseRevisionNo, 'baseRevisionNo'), sourceHost: c.holder })).data;
    if (area === 'episode_audio') {
        const file = required(a.file, 'file'), kind = required(a.kind, 'kind');
        const mime = extname(file).toLowerCase() === '.wav' ? 'audio/wav' : extname(file).toLowerCase() === '.mp3' ? 'audio/mpeg' : null;
        if (!mime)
            throw new Error('Audio must be a WAV or MP3 file');
        const bytes = readFileSync(file);
        if (!bytes.length || bytes.length > 10 * 1024 * 1024)
            throw new Error('Audio must be 1 byte..10 MiB');
        return (await c.uploadMedia(ep(), kind, bytes, mime)).data;
    }
    if (area === 'background' || area === 'prop') {
        const plural = area === 'background' ? 'backgrounds' : 'props';
        const registry = object((await c.request('GET', `/storyboards/${sb()}/registry`)).data);
        if (action === 'register' || action === 'unregister')
            return (await c.request(action === 'register' ? 'POST' : 'DELETE', `/storyboards/${sb()}/registry`, { kind: area, entityId: id() })).data;
        const entries = registry[plural];
        if (action === 'list')
            return entries;
        if (action === 'get') {
            const response = (await c.request('GET', `/projects/${registry.projectId}/${plural}`)).data;
            const rows = Array.isArray(response) ? response : object(response)[plural];
            return required(rows.find((row) => row.id === id() && entries.some(e => e.entityId === row.id)), area);
        }
        if (action === 'create') {
            return (await c.request('POST', `/storyboards/${sb()}/registry`, { kind: area, value: body() })).data;
        }
        if (!entries.some(e => e.entityId === id()))
            throw new Error('Entity is not registered on this storyboard');
        return (await c.request(action === 'update' ? 'PATCH' : 'DELETE', `/${plural}/${id()}`, action === 'update' ? body() : undefined)).data;
    }
    throw new Error('Unknown portal tool');
}
export const UNIT_ROUTES = Object.fromEntries(UNIT_TOOL_NAMES.map(name => [name, (args) => runPortalUnit(name, args)]));
