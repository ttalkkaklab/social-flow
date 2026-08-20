/**
 * Per-tool on/off — environment variables layered on disabled-tools.json.
 *
 * Separate from credential checks (a missing key still fails at call time).
 * Use this when a key is present but you want the tool hidden for a session,
 * or when you want to re-enable one tool that the JSON file turned off.
 * The SNS token gate in index.ts still ANDs on top — a publish tool with no
 * token stays hidden even when this gate says on.
 *
 * Priority, highest first:
 *   1. SOCIAL_FLOW_TOOL_<NAME>          one tool (1/0 · on/off · true/false)
 *   2. SOCIAL_FLOW_TOOL_FLAGS           several tools as name=on|off
 *   3. SOCIAL_FLOW_TOOLS                if set, only the listed tools stay on
 *   4. SOCIAL_FLOW_DISABLE_TOOLS        denylist
 *   5. disabled-tools.json              persistent denylist (trailing * = family)
 *   6. default: on
 *
 * List values split on commas or whitespace. A trailing * is a prefix match
 * (`suno_*`); a bare `*` matches every tool. Names are the tool name
 * (`suno_generate`) or the same in uppercase.
 */
const ALLOW_VAR = 'SOCIAL_FLOW_TOOLS';
const DENY_VAR = 'SOCIAL_FLOW_DISABLE_TOOLS';
const FLAGS_VAR = 'SOCIAL_FLOW_TOOL_FLAGS';
const TOOL_VAR_PREFIX = 'SOCIAL_FLOW_TOOL_';
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes', 'enable', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'off', 'no', 'disable', 'disabled']);
function read(env, key) {
    if (Object.prototype.hasOwnProperty.call(env, key))
        return env[key];
    // Some Windows hosts uppercase every env name.
    const upper = key.toUpperCase();
    if (upper !== key && Object.prototype.hasOwnProperty.call(env, upper))
        return env[upper];
    return undefined;
}
/** Split on commas or whitespace. An empty string is the same as unset. */
export function parsePatternList(raw) {
    if (!raw)
        return [];
    return raw
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}
export function toolOverrideVar(name) {
    return `${TOOL_VAR_PREFIX}${name.toUpperCase()}`;
}
/**
 * Match one pattern against a tool name.
 *
 * `*` = everything, `suno_*` = prefix, anything else is a case-insensitive exact
 * match. A star in the middle is not a wildcard — prefix matching already covers
 * the families (suno_ · veo_ · music_).
 */
export function matchesPattern(name, pattern) {
    const needle = name.toLowerCase();
    const pat = pattern.trim().toLowerCase();
    if (!pat)
        return false;
    if (pat === '*')
        return true;
    if (pat.endsWith('*') && !pat.slice(0, -1).includes('*')) {
        return needle.startsWith(pat.slice(0, -1));
    }
    return needle === pat;
}
/** JSON-file matching stays case-sensitive, same as config.isToolDisabled. */
export function matchesJsonPattern(name, pattern) {
    return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}
function listMatches(name, patterns) {
    return patterns.some((pattern) => matchesPattern(name, pattern));
}
function parseFlag(raw, source) {
    const value = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(value))
        return true;
    if (FALSE_VALUES.has(value))
        return false;
    throw new Error(`Invalid ${source}="${raw}" — use 1/0, on/off, or true/false.`);
}
/** `suno_generate=0,veo_*=off` — a token without `=` is rejected. */
export function parseToolFlags(raw) {
    const out = new Map();
    if (!raw || !raw.trim())
        return out;
    for (const item of parsePatternList(raw)) {
        const eq = item.indexOf('=');
        if (eq <= 0 || eq === item.length - 1) {
            throw new Error(`Invalid ${FLAGS_VAR} entry "${item}" — use name=on|off (example: suno_generate=0,veo_*=off).`);
        }
        const key = item.slice(0, eq).trim();
        const value = item.slice(eq + 1).trim();
        out.set(key, value);
    }
    return out;
}
function flagFor(name, flags) {
    // Exact match beats a prefix — `veo_*=off` and `veo_img2video=on` can coexist.
    let prefixHit;
    for (const [pattern, raw] of flags) {
        if (!matchesPattern(name, pattern))
            continue;
        const exact = pattern.toLowerCase() === name.toLowerCase();
        if (exact)
            return { pattern, raw };
        if (!prefixHit)
            prefixHit = { pattern, raw };
    }
    return prefixHit;
}
/**
 * Env-only verdict. Tests pass an empty object so a developer shell leftover
 * SOCIAL_FLOW_* cannot shake the suite.
 */
export function isToolEnabled(name, env = process.env) {
    return resolveToolGate(name, { env, jsonPatterns: [] });
}
/**
 * Combined verdict: env first, then disabled-tools.json as a persistent denylist.
 *
 * A per-tool env override can turn a JSON-disabled tool back on for one session.
 */
export function resolveToolGate(name, opts = {}) {
    const env = opts.env ?? process.env;
    const jsonPatterns = opts.jsonPatterns ?? [];
    const jsonFile = opts.jsonFile;
    const overrideRaw = read(env, toolOverrideVar(name));
    if (overrideRaw !== undefined && overrideRaw.trim() !== '') {
        const enabled = parseFlag(overrideRaw, toolOverrideVar(name));
        return {
            enabled,
            reason: enabled
                ? `${toolOverrideVar(name)}=${overrideRaw.trim()}`
                : `${toolOverrideVar(name)}=${overrideRaw.trim()} (per-tool off)`,
        };
    }
    const flags = parseToolFlags(read(env, FLAGS_VAR));
    const flag = flagFor(name, flags);
    if (flag) {
        const enabled = parseFlag(flag.raw, `${FLAGS_VAR}:${flag.pattern}`);
        return {
            enabled,
            reason: `${FLAGS_VAR} ${flag.pattern}=${flag.raw.trim()}`,
        };
    }
    const allow = parsePatternList(read(env, ALLOW_VAR));
    const deny = parsePatternList(read(env, DENY_VAR));
    if (allow.length > 0 && !listMatches(name, allow)) {
        return { enabled: false, reason: `${ALLOW_VAR} allowlist does not include ${name}` };
    }
    if (deny.length > 0 && listMatches(name, deny)) {
        return { enabled: false, reason: `${DENY_VAR} matches ${name}` };
    }
    const jsonHit = jsonPatterns.find((pattern) => matchesJsonPattern(name, pattern));
    if (jsonHit !== undefined) {
        const where = jsonFile ? `${jsonFile}` : 'disabled-tools.json';
        return { enabled: false, reason: `${where} matches ${jsonHit}` };
    }
    if (allow.length > 0) {
        return { enabled: true, reason: `${ALLOW_VAR} allowlist` };
    }
    return { enabled: true, reason: 'default on' };
}
/** Unknown patterns go to stderr one line at a time — a typo does not kill the server. */
export function warnUnknownPatterns(knownNames, env = process.env) {
    const known = new Set(knownNames.map((n) => n.toLowerCase()));
    const warnings = [];
    const check = (varName) => {
        for (const pattern of parsePatternList(read(env, varName))) {
            if (pattern === '*')
                continue;
            const lower = pattern.toLowerCase();
            if (lower.endsWith('*') && !lower.slice(0, -1).includes('*')) {
                const prefix = lower.slice(0, -1);
                if (![...known].some((n) => n.startsWith(prefix))) {
                    warnings.push(`${varName}: no tool matches prefix "${pattern}"`);
                }
                continue;
            }
            if (!known.has(lower))
                warnings.push(`${varName}: unknown tool "${pattern}"`);
        }
    };
    check(ALLOW_VAR);
    check(DENY_VAR);
    return warnings;
}
/** Startup log line — short when everything is on, otherwise counts the off side. */
export function describeToolGate(knownNames, env = process.env, jsonPatterns = []) {
    const allow = parsePatternList(read(env, ALLOW_VAR));
    const deny = parsePatternList(read(env, DENY_VAR));
    const flags = parseToolFlags(read(env, FLAGS_VAR));
    const overrides = knownNames.filter((name) => {
        const raw = read(env, toolOverrideVar(name));
        return raw !== undefined && raw.trim() !== '';
    });
    if (allow.length === 0 &&
        deny.length === 0 &&
        flags.size === 0 &&
        overrides.length === 0 &&
        jsonPatterns.length === 0) {
        return `tool gate default on (${knownNames.length} tools)`;
    }
    const on = knownNames.filter((name) => resolveToolGate(name, { env, jsonPatterns }).enabled);
    const off = knownNames.length - on.length;
    const bits = [
        allow.length > 0 ? `${ALLOW_VAR}=${allow.join(',')}` : '',
        deny.length > 0 ? `${DENY_VAR}=${deny.join(',')}` : '',
        flags.size > 0 ? `${FLAGS_VAR} ${flags.size} flag(s)` : '',
        overrides.length > 0 ? `${overrides.length} per-tool override(s)` : '',
        jsonPatterns.length > 0 ? `json ${jsonPatterns.join(' ')}` : '',
    ].filter(Boolean);
    return `tool gate ${on.length} on / ${off} off (${bits.join('; ')})`;
}
export const TOOL_GATE_FLAGS_VAR = FLAGS_VAR;
export const TOOL_GATE_ALLOW_VAR = ALLOW_VAR;
export const TOOL_GATE_DENY_VAR = DENY_VAR;
