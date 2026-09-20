/**
 * Local episode directory ⇄ portal — the file side of the `portal_*` tools.
 *
 * Reads `data/<channel>/episodes/<topic>/storyboard/`. `scenes.js` is a browser script
 * (`window.SCENES = …`), so it is evaluated in an isolated `vm` context — an empty room
 * with one `window` object, no filesystem, no network — and JSON-round-tripped into plain
 * objects. Whatever that loses (functions, undefined) could not have travelled over HTTP anyway.
 *
 * `.portal.json` sits in the episode directory (not in storyboard/ — it has to exist at the
 * research stage, before there is a board) and records which portal row the copy is and the
 * last revision seen: `{ workspace, storyboardId, episodeId, headRevisionNo, holder, updatedAt }`.
 * The next checkpoint sends `headRevisionNo` as `baseRevisionNo`; when another machine saved
 * first the portal answers 409 `head_moved` and the skill pulls before saving again.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { CHANNEL_SLUG_RE } from './config.js';

export const EPISODE_STATUSES = ['draft', 'approved', 'produced', 'published'] as const;
export const EPISODE_STAGES = ['researched', 'candidates', 'scenario', 'narration', 'board', 'approved', 'produced', 'published'] as const;
export const SCENARIO_CANDIDATES = ['D1', 'D2', 'D3'] as const;
/** The documents a save carries next to the shots — the storyboard skill's standard set. */
export const DOCUMENT_FILES = ['storyboard.md', 'research.md', 'script.md', 'storyboard.html', 'scenes.js'] as const;
export const PORTAL_STATE_FILE = '.portal.json';

export interface PortalState {
  workspace?: string;
  storyboardId?: string;
  episodeId?: string;
  headRevisionNo?: number;
  holder?: string;
  updatedAt?: string;
}

/** `…/episodes/<topic>` or its `storyboard/` → the episode directory. */
export function episodeDirOf(dir: string): string {
  return path.basename(dir) === 'storyboard' ? path.dirname(dir) : dir;
}

/**
 * `…/data/<channel>/episodes/<topic>[/storyboard]` → `<channel>`, or undefined when the path
 * is not shaped like that. The channel picks the credential file, so a tool given an episode
 * directory needs no separate `channel` argument.
 */
export function channelOfEpisodeDir(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  const episodeDir = episodeDirOf(path.resolve(dir));
  const episodes = path.dirname(episodeDir);
  if (path.basename(episodes) !== 'episodes') return undefined;
  const channel = path.basename(path.dirname(episodes));
  return CHANNEL_SLUG_RE.test(channel) ? channel : undefined;
}

export function readPortalState(dir: string): PortalState | null {
  const file = path.join(episodeDirOf(dir), PORTAL_STATE_FILE);
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as PortalState) : null;
  } catch {
    return null;
  }
}

export function writePortalState(dir: string, patch: PortalState): PortalState {
  const file = path.join(episodeDirOf(dir), PORTAL_STATE_FILE);
  const next: PortalState = { ...(readPortalState(dir) ?? {}), ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export interface EvaluatedScenes {
  scenes: unknown[];
  meta: Record<string, unknown>;
  sbDoc: Record<string, unknown> | null;
}

/**
 * `scenes.js` source → `{ scenes, meta, sbDoc }`. Throws when there is no `window.SCENES` array.
 *
 * Nothing from the host crosses into the room. `window` is created *inside* the context, so
 * `window.constructor.constructor` is the room's own Function and cannot reach the host
 * `process` (review P1 — a board written by someone else is untrusted input). What comes
 * back out is one JSON string built inside the room, parsed here into plain objects.
 * vm is not a security boundary against a hostile engine, but the known escape through
 * host-object prototypes is closed, and the timeout bounds a runaway script.
 */
export function evaluateScenesJs(source: string): EvaluatedScenes {
  const context = vm.createContext(Object.create(null) as Record<string, unknown>);
  vm.runInContext('var window = {};', context);
  vm.runInContext(source, context, { timeout: 5000 });
  const json: unknown = vm.runInContext('JSON.stringify(window)', context, { timeout: 5000 });
  if (typeof json !== 'string') throw new Error('scenes.js did not leave a window object.');
  const plain = JSON.parse(json) as Record<string, unknown>;
  if (!Array.isArray(plain.SCENES)) throw new Error('scenes.js has no window.SCENES array.');
  const { SCENES, SB_DOC, ...meta } = plain;
  return {
    scenes: SCENES as unknown[],
    meta,
    sbDoc: SB_DOC && typeof SB_DOC === 'object' ? (SB_DOC as Record<string, unknown>) : null,
  };
}

export interface StoryboardMdHead {
  channel: string | null;
  topic: string | null;
  status: string | null;
  title: string | null;
}

/** `storyboard.md` frontmatter and heading. Empty values when absent — a save works without the file. */
export function readStoryboardMd(markdown: string): StoryboardMdHead {
  const fm = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? '';
  const pick = (key: string): string | undefined => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim();
  const heading = /^#\s+(.+?)\s*$/m.exec(markdown)?.[1];
  return {
    channel: pick('channel') ?? null,
    topic: pick('topic') ?? null,
    status: pick('status') ?? null,
    title: heading ? heading.replace(/\s+[—-]\s+Storyboard\s*$/i, '') : null,
  };
}

/** The title from scenes.js's first comment line (`// <slug> — <title>`) — the fallback when storyboard.md is missing. */
function titleFromHeader(source: string, slug: string): string | null {
  const first = source.split('\n').find((line) => line.startsWith('//'));
  if (!first) return null;
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^//\\s*${escaped}\\s*[—-]\\s*(.+)$`).exec(first);
  return m ? m[1].replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
}

export interface PortalCharacter {
  id: string;
  name?: string;
  role?: string;
  appearance?: string;
}

export interface ImportPayload {
  project: { name: string };
  storyboard?: { title: string };
  episode: {
    slug: string;
    title: string;
    format?: string;
    status?: string;
    meta: Record<string, unknown>;
    [key: string]: unknown;
  };
  scenes: unknown[];
  characters: PortalCharacter[];
  documents: Array<{ filename: string; content: string }>;
}

export interface ImportOptions {
  project?: string;
  storyboard?: string;
  title?: string;
}

/**
 * Directory → import payload. `episodeDir` is `…/episodes/<topic>` or its `storyboard/`.
 * Characters come from `SB_DOC.characters` and every shot's `visual.character`; when
 * `assets/characters/<id>/identity.md` exists its heading, role and look ride along.
 */
export function buildImportPayload(episodeDir: string, options: ImportOptions = {}): ImportPayload {
  const dir = episodeDirOf(episodeDir);
  const sb = path.join(dir, 'storyboard');
  const scenesPath = path.join(sb, 'scenes.js');
  if (!existsSync(scenesPath)) throw new Error(`scenes.js not found: ${scenesPath}`);
  const source = readFileSync(scenesPath, 'utf8');
  const { scenes, meta, sbDoc } = evaluateScenesJs(source);

  const mdPath = path.join(sb, 'storyboard.md');
  const md: Partial<StoryboardMdHead> = existsSync(mdPath) ? readStoryboardMd(readFileSync(mdPath, 'utf8')) : {};
  const slug = path.basename(dir);
  const channelDir = path.dirname(path.dirname(dir));
  const channel = options.project ?? md.channel ?? path.basename(channelDir);
  const title = options.title ?? md.title ?? titleFromHeader(source, slug) ?? slug;

  const documents = DOCUMENT_FILES.filter((f) => existsSync(path.join(sb, f))).map((f) => ({
    filename: f,
    content: readFileSync(path.join(sb, f), 'utf8'),
  }));

  const status = md.status ?? null;
  return {
    project: { name: channel },
    ...(options.storyboard ? { storyboard: { title: options.storyboard } } : {}),
    episode: {
      slug,
      title,
      ...(typeof meta.FORMAT === 'string' ? { format: meta.FORMAT } : {}),
      ...(status && (EPISODE_STATUSES as readonly string[]).includes(status) ? { status } : {}),
      meta: sbDoc ? { ...meta, SB_DOC: sbDoc } : meta,
    },
    scenes,
    characters: collectCharacters(scenes, sbDoc, channelDir),
    documents,
  };
}

/** Local documents → payload `documents[]` — only the ones that exist. */
export function readDocuments(dir: string, filenames: readonly string[]): Array<{ filename: string; content: string }> {
  return filenames
    .map((f) => path.join(dir, f))
    .filter((p) => existsSync(p))
    .map((p) => ({ filename: path.basename(p), content: readFileSync(p, 'utf8') }));
}

function characterIdsOf(shot: unknown): string[] {
  const raw = (shot as { visual?: { character?: unknown } } | null)?.visual?.character;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((c) => (typeof c === 'string' ? c : c && typeof (c as { id?: unknown }).id === 'string' ? (c as { id: string }).id : null))
    .filter((id): id is string => Boolean(id));
}

function collectCharacters(scenes: unknown[], sbDoc: Record<string, unknown> | null, channelDir: string): PortalCharacter[] {
  const ids = new Set(scenes.flatMap(characterIdsOf));
  const docCharacters = sbDoc?.characters;
  if (docCharacters && typeof docCharacters === 'object') {
    for (const id of Object.keys(docCharacters as Record<string, unknown>)) ids.add(id);
  }
  return [...ids].map((id) => {
    const identity = path.join(channelDir, 'assets', 'characters', id, 'identity.md');
    const detail: PortalCharacter = { id };
    if (existsSync(identity)) {
      const text = readFileSync(identity, 'utf8');
      const heading = /^#\s+(.+?)\s*(?:\(([^)]*)\))?\s*$/m.exec(text);
      if (heading?.[1]) detail.name = heading[1].trim();
      const role = /\*\*역할\*\*:\s*(.+)/.exec(text)?.[1];
      const look = /\*\*생김새\*\*:\s*(.+)/.exec(text)?.[1];
      if (role) detail.role = role.trim();
      if (look) detail.appearance = look.trim();
    }
    return detail;
  });
}
