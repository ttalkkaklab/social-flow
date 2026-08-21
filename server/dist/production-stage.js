// Production stage gate — an episode advances one stage at a time, and only a human can move it.
//
// Why this lives in the MCP server and not in a Claude Code hook: each agent runs in its own
// workspace with its own `.claude/settings.json`, and agents on other runtimes never read that
// file at all. A hook binds one agent. This dispatch point binds every caller of every tool.
//
// Known hole, stated on purpose: Grok Imagine's `image_gen`/`image_edit` are runtime-native tools
// that never reach this server, so their calls cannot be refused here. What this module does
// instead is record the hashes of the stills approved at the still gate, and refuse the
// *downstream* steps (video generation, publishing) when a still changed without approval. An
// unapproved image can still be produced; it cannot be used.
//
// 2026-08-21 ttalkkakman directive — "단계를 기록하면서 내 지시가 있을때만 전단계 작업이 가능하게".
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
/** Only episodes under this path segment are gated — every other channel keeps working untouched. */
const GATED_PATH_MARK = `${sep}data${sep}pundago${sep}`;
const STATE_FILENAME = 'production-state.json';
/** Ordered stages. A tool declares the stage it belongs to; the episode must be standing there. */
export const STAGES = [
    'storyboard_draft',
    'storyboard_review',
    'image_draft',
    'still_gate',
    'human_review',
    'video_authorized',
    'video_generation',
    'render',
    'publish',
    'published',
];
/** Tools that may only run while the episode stands at one of these stages. */
const TOOL_STAGES = [
    {
        match: /^(image_local_generate|gpt_image_)/,
        allow: ['image_draft', 'still_gate'],
        label: '이미지 생성',
    },
    {
        match: /^(veo_|seedance_)/,
        allow: ['video_generation', 'render'],
        label: '영상 생성',
    },
    {
        match: /_publish$/,
        allow: ['publish'],
        label: '게시',
    },
];
const ALLOWED = { allowed: true };
/** Every string inside a tool's arguments, however deeply nested. */
function collectStrings(value, out = []) {
    if (typeof value === 'string')
        out.push(value);
    else if (Array.isArray(value))
        for (const item of value)
            collectStrings(item, out);
    else if (value && typeof value === 'object')
        for (const item of Object.values(value))
            collectStrings(item, out);
    return out;
}
/**
 * The episode directory a path belongs to — the deepest ancestor holding a state file.
 * Returns undefined for anything outside the gated channel.
 */
export function findEpisodeDir(path) {
    if (!path.includes(GATED_PATH_MARK))
        return undefined;
    let dir = path.endsWith(sep) ? path.slice(0, -1) : dirname(path);
    // Walk up until the state file turns up, stopping at the channel root.
    while (dir.includes(GATED_PATH_MARK)) {
        if (existsSync(join(dir, STATE_FILENAME)))
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
export function readState(episodeDir) {
    const file = join(episodeDir, STATE_FILENAME);
    if (!existsSync(file))
        return undefined;
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch {
        return undefined;
    }
}
export function writeState(episodeDir, state) {
    writeFileSync(join(episodeDir, STATE_FILENAME), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
export function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}
/** sha256 of every `scene-N.png` directly inside `<episodeDir>/storyboard/images`. */
export function hashStills(episodeDir) {
    const dir = join(episodeDir, 'storyboard', 'images');
    if (!existsSync(dir))
        return {};
    const hashes = {};
    for (const name of readdirSync(dir).sort()) {
        if (!/^scene-\d+\.png$/.test(name))
            continue;
        hashes[name] = sha256File(join(dir, name));
    }
    return hashes;
}
/** Stills that differ from the set approved at the still gate. */
export function changedStills(episodeDir, state) {
    const approved = state.approvedStills;
    if (!approved || Object.keys(approved).length === 0)
        return [];
    const current = hashStills(episodeDir);
    const names = new Set([...Object.keys(approved), ...Object.keys(current)]);
    return [...names].filter((name) => approved[name] !== current[name]).sort();
}
function stageRule(toolName) {
    return TOOL_STAGES.find((rule) => rule.match.test(toolName));
}
/**
 * The gate. Called once per tool invocation, before the handler runs.
 *
 * Allows by default — an episode with no state file, a tool with no stage requirement, and every
 * path outside the gated channel all pass straight through. The gate only ever refuses a call it
 * can point at a recorded stage for.
 */
export function checkStageGate(toolName, args) {
    const rule = stageRule(toolName);
    if (!rule)
        return ALLOWED;
    const episodeDirs = new Set();
    for (const value of collectStrings(args)) {
        const dir = findEpisodeDir(value);
        if (dir)
            episodeDirs.add(dir);
    }
    if (episodeDirs.size === 0)
        return ALLOWED;
    for (const episodeDir of episodeDirs) {
        const state = readState(episodeDir);
        if (!state)
            continue;
        if (!rule.allow.includes(state.stage)) {
            return {
                allowed: false,
                reason: `${rule.label}은 ${rule.allow.join(' 또는 ')} 단계에서만 됩니다. ` +
                    `지금 ${state.episode}의 단계는 ${state.stage}입니다.\n` +
                    `사람의 지시를 받은 뒤 production_stage_advance 로 단계를 옮기고 다시 부르세요 ` +
                    `(그 지시 메시지의 이벤트 ID가 있어야 합니다).`,
            };
        }
        const drifted = changedStills(episodeDir, state);
        if (drifted.length > 0) {
            return {
                allowed: false,
                reason: `${state.episode}의 스틸이 승인된 것과 다릅니다: ${drifted.join(', ')}.\n` +
                    `still_gate 에서 승인된 그림이 아닙니다. 사람의 재작업 승인을 받아 ` +
                    `production_stage_advance --to still_gate 로 되돌린 뒤 다시 검수하세요.`,
            };
        }
    }
    return ALLOWED;
}
