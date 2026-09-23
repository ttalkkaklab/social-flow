/**
 * Local episode directory ⇄ portal — the file side of the `portal_*` tools.
 *
 * Reads `data/<channel>/episodes/<topic>/storyboard/`. `scenes.js` is a browser script
 * (`window.SCENES = …`), so it is evaluated in a `vm` room that holds nothing from the host
 * (scenes-vm.ts) and comes out as plain JSON objects. Whatever that loses (functions, undefined) could not have travelled over HTTP anyway.
 *
 * `.portal.json` sits in the episode directory (not in storyboard/ — it has to exist at the
 * research stage, before there is a board) and records which portal row the copy is and the
 * last revision seen: `{ workspace, storyboardId, episodeId, headRevisionNo, holder, updatedAt }`.
 * The next checkpoint sends `headRevisionNo` as `baseRevisionNo`; when another machine saved
 * first the portal answers 409 `head_moved` and the skill pulls before saving again.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateWindowScript } from './scenes-vm.js';
import { CHANNEL_SLUG_RE } from './config.js';
export const EPISODE_STATUSES = ['draft', 'approved', 'produced', 'published'];
export const EPISODE_STAGES = ['researched', 'candidates', 'scenario', 'narration', 'board', 'approved', 'produced', 'published'];
export const SCENARIO_CANDIDATES = ['D1', 'D2', 'D3'];
/** The documents a save carries next to the shots — the storyboard skill's standard set. */
export const DOCUMENT_FILES = ['storyboard.md', 'research.md', 'script.md', 'storyboard.html', 'scenes.js'];
export const PORTAL_STATE_FILE = '.portal.json';
/** `…/episodes/<topic>` or its `storyboard/` → the episode directory. */
export function episodeDirOf(dir) {
    return path.basename(dir) === 'storyboard' ? path.dirname(dir) : dir;
}
/**
 * `…/data/<channel>/episodes/<topic>[/storyboard]` → `<channel>`, or undefined when the path
 * is not shaped like that. The channel picks the credential file, so a tool given an episode
 * directory needs no separate `channel` argument.
 */
export function channelOfEpisodeDir(dir) {
    if (!dir)
        return undefined;
    const episodeDir = episodeDirOf(path.resolve(dir));
    const episodes = path.dirname(episodeDir);
    if (path.basename(episodes) !== 'episodes')
        return undefined;
    const channel = path.basename(path.dirname(episodes));
    return CHANNEL_SLUG_RE.test(channel) ? channel : undefined;
}
export function readPortalState(dir) {
    const file = path.join(episodeDirOf(dir), PORTAL_STATE_FILE);
    if (!existsSync(file))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
        return null;
    }
}
export function writePortalState(dir, patch) {
    const file = path.join(episodeDirOf(dir), PORTAL_STATE_FILE);
    const next = { ...(readPortalState(dir) ?? {}), ...patch, updatedAt: new Date().toISOString() };
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
}
/**
 * `scenes.js` source → `{ scenes, meta, sbDoc }`. Throws when there is no `window.SCENES` array.
 * The evaluation itself (nothing from the host in the room, JSON out) is scenes-vm.ts — the
 * same helper the local board tools use, so a pulled board meets one rule in both places.
 */
export function evaluateScenesJs(source) {
    const plain = evaluateWindowScript(source);
    if (!Array.isArray(plain.SCENES))
        throw new Error('scenes.js has no window.SCENES array.');
    const { SCENES, SB_DOC, ...meta } = plain;
    return {
        scenes: SCENES,
        meta,
        sbDoc: SB_DOC && typeof SB_DOC === 'object' ? SB_DOC : null,
    };
}
/** `storyboard.md` frontmatter and heading. Empty values when absent — a save works without the file. */
export function readStoryboardMd(markdown) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? '';
    const pick = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim();
    const heading = /^#\s+(.+?)\s*$/m.exec(markdown)?.[1];
    return {
        channel: pick('channel') ?? null,
        topic: pick('topic') ?? null,
        status: pick('status') ?? null,
        title: heading ? heading.replace(/\s+[—-]\s+Storyboard\s*$/i, '') : null,
    };
}
/** The title from scenes.js's first comment line (`// <slug> — <title>`) — the fallback when storyboard.md is missing. */
function titleFromHeader(source, slug) {
    const first = source.split('\n').find((line) => line.startsWith('//'));
    if (!first)
        return null;
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^//\\s*${escaped}\\s*[—-]\\s*(.+)$`).exec(first);
    return m ? m[1].replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
}
/**
 * Directory → import payload. `episodeDir` is `…/episodes/<topic>` or its `storyboard/`.
 * Characters come from `SB_DOC.characters` and every shot's `visual.character`; when
 * `assets/characters/<id>/identity.md` exists its heading, role and look ride along.
 */
export function buildImportPayload(episodeDir, options = {}) {
    const dir = episodeDirOf(episodeDir);
    const sb = path.join(dir, 'storyboard');
    const scenesPath = path.join(sb, 'scenes.js');
    if (!existsSync(scenesPath))
        throw new Error(`scenes.js not found: ${scenesPath}`);
    const source = readFileSync(scenesPath, 'utf8');
    const { scenes, meta, sbDoc } = evaluateScenesJs(source);
    const mdPath = path.join(sb, 'storyboard.md');
    const md = existsSync(mdPath) ? readStoryboardMd(readFileSync(mdPath, 'utf8')) : {};
    const slug = path.basename(dir);
    const channelDir = path.dirname(path.dirname(dir));
    const channel = options.project ?? md.channel ?? path.basename(channelDir);
    const title = options.title ?? md.title ?? titleFromHeader(source, slug) ?? slug;
    const documents = DOCUMENT_FILES.filter((f) => existsSync(path.join(sb, f))).map((f) => ({
        filename: f,
        content: readFileSync(path.join(sb, f), 'utf8'),
    }));
    const characters = collectCharacters(scenes, sbDoc, channelDir);
    const narratorCharacterId = typeof sbDoc?.narratorCharacterId === 'string' ? sbDoc.narratorCharacterId : '';
    if (!narratorCharacterId || !characters.some((character) => character.id === narratorCharacterId))
        throw new Error('SB_DOC.narratorCharacterId must match one SB_DOC.characters id.');
    const normalizedScenes = normalizeNarrationSpeakers(scenes, characters);
    const status = md.status ?? null;
    return {
        project: { name: channel },
        ...(options.storyboard ? { storyboard: { title: options.storyboard } } : {}),
        episode: {
            slug,
            title,
            ...(typeof meta.FORMAT === 'string' ? { format: meta.FORMAT } : {}),
            ...(status && EPISODE_STATUSES.includes(status) ? { status } : {}),
            meta: sbDoc ? { ...meta, SB_DOC: sbDoc } : meta,
        },
        scenes: normalizedScenes,
        characters,
        narratorCharacterId,
        documents,
    };
}
/** Local documents → payload `documents[]` — only the ones that exist. */
export function readDocuments(dir, filenames) {
    return filenames
        .map((f) => path.join(dir, f))
        .filter((p) => existsSync(p))
        .map((p) => ({ filename: path.basename(p), content: readFileSync(p, 'utf8') }));
}
function characterIdsOf(shot) {
    const raw = shot?.visual?.character;
    if (!raw)
        return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list
        .map((c) => (typeof c === 'string' ? c : c && typeof c.id === 'string' ? c.id : null))
        .filter((id) => Boolean(id));
}
function ttsOf(value) {
    if (!value || typeof value !== 'object')
        return null;
    const tts = value;
    if (!['gemini', 'supertonic', 'elevenlabs', 'mlx'].includes(String(tts.engine)) || typeof tts.voiceId !== 'string' || !tts.voiceId.trim())
        return null;
    return {
        engine: tts.engine, voiceId: tts.voiceId,
        ...(typeof tts.model === 'string' ? { model: tts.model } : {}),
        ...(typeof tts.speed === 'number' ? { speed: tts.speed } : {}),
        ...(typeof tts.language === 'string' ? { language: tts.language } : {}),
        ...(typeof tts.stylePrompt === 'string' ? { stylePrompt: tts.stylePrompt } : {}),
    };
}
function collectCharacters(scenes, sbDoc, channelDir) {
    const ids = new Set(scenes.flatMap(characterIdsOf));
    const docCharacters = sbDoc?.characters;
    const details = new Map();
    if (Array.isArray(docCharacters)) {
        for (const value of docCharacters) {
            if (!value || typeof value !== 'object' || typeof value.id !== 'string')
                continue;
            const detail = value;
            details.set(detail.id, detail);
            ids.add(detail.id);
        }
    }
    else if (docCharacters && typeof docCharacters === 'object') {
        for (const [id, value] of Object.entries(docCharacters)) {
            details.set(id, value && typeof value === 'object' ? value : {});
            ids.add(id);
        }
    }
    return [...ids].map((id) => {
        const fromDoc = details.get(id) ?? {};
        const tts = ttsOf(fromDoc.tts);
        if (!tts)
            throw new Error(`SB_DOC.characters.${id}.tts must define engine and voiceId.`);
        const identity = path.join(channelDir, 'assets', 'characters', id, 'identity.md');
        const detail = {
            id, tts,
            ...(typeof fromDoc.name === 'string' ? { name: fromDoc.name } : {}),
            ...(typeof fromDoc.role === 'string' ? { role: fromDoc.role } : {}),
            ...(typeof fromDoc.appearance === 'string' ? { appearance: fromDoc.appearance } : {}),
        };
        if (existsSync(identity)) {
            const text = readFileSync(identity, 'utf8');
            const heading = /^#\s+(.+?)\s*(?:\(([^)]*)\))?\s*$/m.exec(text);
            if (heading?.[1])
                detail.name = heading[1].trim();
            const role = /\*\*역할\*\*:\s*(.+)/.exec(text)?.[1];
            const look = /\*\*생김새\*\*:\s*(.+)/.exec(text)?.[1];
            if (role)
                detail.role = role.trim();
            if (look)
                detail.appearance = look.trim();
        }
        return detail;
    });
}
/** `speaker` is persisted as a stable character id. Names are accepted only at this save boundary. */
export function normalizeNarrationSpeakers(scenes, characters) {
    const byId = new Map(characters.map((character) => [character.id, character.id]));
    const names = new Map();
    for (const character of characters) {
        if (!character.name)
            continue;
        names.set(character.name, [...(names.get(character.name) ?? []), character.id]);
    }
    return scenes.map((scene) => {
        if (!scene || typeof scene !== 'object' || !Array.isArray(scene.narration))
            return scene;
        return {
            ...scene,
            narration: (scene.narration).map((segment) => {
                if (!segment || typeof segment !== 'object' || typeof segment.speaker !== 'string')
                    return segment;
                const speaker = segment.speaker;
                if (!speaker.trim()) {
                    const { speaker: _speaker, ...withoutSpeaker } = segment;
                    return withoutSpeaker;
                }
                const named = names.get(speaker);
                const id = byId.get(speaker) ?? (named?.length === 1 ? named[0] : undefined);
                if (!id)
                    throw new Error(`narration speaker "${speaker}" does not match a character id or name.`);
                return { ...segment, speaker: id };
            }),
        };
    });
}
