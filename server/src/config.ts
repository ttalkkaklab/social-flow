/**
 * Configuration loading.
 *
 * Credentials (SerpApi/Naver keys, SNS tokens) are **validated lazily at tool-call
 * time**, not at startup — the publish tools must work without a search key, and
 * vice versa.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const config = {
  /** SerpApi key (required by the serp_* research/fact-check tools) — https://serpapi.com/manage-api-key */
  serpApiKey: process.env.SERPAPI_API_KEY || '',
  /** Naver Open API credentials (required by the naver_search tool) — https://developers.naver.com/apps */
  naverClientId: process.env.NAVER_CLIENT_ID || '',
  naverClientSecret: process.env.NAVER_CLIENT_SECRET || '',
  /** data.go.kr auth key (required by datago_file_fetch/datago_api_call — search/detail/download need no auth) */
  dataGoKrApiKey: process.env.DATA_GO_KR_API_KEY || '',
  /** Gemini API key (shared requirement of the veo_* video, tts_* speech, and music_* music tools) — https://aistudio.google.com/apikey */
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  /** OpenAI API key (required by the gpt_image_* image generation tools) — https://platform.openai.com/api-keys */
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  /** BytePlus ModelArk API key (required by the seedance_* video generation tools) — https://ai.byteplus.com/ark/region:ap-southeast-1/apikey */
  arkApiKey: process.env.ARK_API_KEY || '',
  /**
   * Suno API key (required by the suno_* music tools) — https://sunoapi.org/api-key
   *
   * Not an official Suno Inc. key. sunoapi.org (Kie.ai family) is a third-party
   * REST wrapper. Lyria (`music_*`) keeps working on GEMINI_API_KEY without this.
   */
  sunoApiKey: process.env.SUNO_API_KEY || '',
  /**
   * ElevenLabs API key (required by the tts_elevenlabs_* speech tools) — https://elevenlabs.io/app/settings/api-keys
   *
   * The third speech lane next to Gemini (tts_generate) and on-device Supertonic
   * (tts_local_generate). Keys can be restricted per permission — synthesis needs
   * `text_to_speech`, the voice listing needs `voices_read`.
   */
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  /**
   * YouTube Data API key (youtube_topic_scout's preferred public-query path).
   * Unlike OAuth it doesn't spend your channel's quota. Without it, falls back to
   * channel OAuth (youtube.readonly).
   * https://console.cloud.google.com/apis/credentials
   */
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  requestTimeoutMs: 15_000,
};

/**
 * ModelArk region endpoint.
 *
 * The video models exist only in ap-southeast-1 (Singapore), so the default is the
 * only real choice. The env override exists for installs where regions multiply or
 * that use mainland-China Ark (volcengine); there is no auto-discovery — a silent
 * region move becomes a "the model that worked yesterday is gone today" failure.
 */
export function arkBaseUrl(): string {
  return (process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '');
}

/**
 * Python interpreter that runs the local TTS (Supertonic).
 *
 * Unlike the other credentials, **startup works without it** — it falls back to
 * `python3`, and if that's missing or the package isn't installed, the call fails
 * at invocation time with install instructions (supertonic-client).
 *
 * Not auto-discovering venv paths is deliberate. Scanning `./venv`/`./.venv` would
 * be convenient, but silently picking up a different virtualenv per repo creates
 * "yesterday's voice is a different voice today" failures. Which interpreter to use
 * is decided explicitly, never inferred.
 */
export function supertonicPython(): string {
  return process.env.SUPERTONIC_PYTHON || 'python3';
}

/**
 * mflux CLI executable that runs local image generation (Z-Image Turbo).
 *
 * Same principle as supertonicPython — startup works without it, and the call fails
 * at invocation time with install instructions (zimage-client). The default is uv
 * tool's deterministic install path. There is no PATH-scanning fallback — silent
 * auto-discovery turns into "what worked yesterday gives different results today".
 */
export function mfluxZImageBin(): string {
  return process.env.MFLUX_ZIMAGE_BIN || join(homedir(), '.local', 'bin', 'mflux-generate-z-image-turbo');
}

/**
 * The mlx-qwen3-asr CLI that runs local STT (Qwen3-ASR).
 *
 * Same principle as mfluxZImageBin — the server boots without it, and a call
 * fails at invocation time with an install hint (qwen3-asr-client). The
 * default is uv tool's deterministic install path.
 */
export function qwen3AsrBin(): string {
  return process.env.QWEN3_ASR_BIN || join(homedir(), '.local', 'bin', 'mlx-qwen3-asr');
}

/**
 * Credential paths for direct SNS publishing (per-platform publish tools).
 *
 * Terminology contract: **channel = an operated brand** (1:1 with data/<slug>),
 * **platform = an SNS service** (Threads/Instagram/Facebook/YouTube). Tokens
 * resolve in two layers:
 *
 *   <SNS_TOKEN_DIR>/<channel slug>/<conventional filename>   ← channel given (multi-channel operation)
 *   <SNS_TOKEN_DIR>/<conventional filename>                  ← no channel (single-channel, legacy)
 *
 * When a channel is given there is **no fallback** to the flat (default) files —
 * this closes off the accident where the default token belongs to another brand
 * and a post silently lands on the wrong account (user decision, 2026-07-29).
 * The per-platform *_TOKEN_FILE env overrides apply to the default (flat) paths only.
 *
 * Token **values** are not taken from env — Meta's 60-day refresh flow overwrites
 * the file, so renewal only works file-based, and this also keeps secrets out of
 * committed files (.mcp.json).
 *
 * The publishing account is determined automatically from the token's /me lookup,
 * not from configuration — accepting an account ID as config would open a
 * token/account mismatch (publishing to the wrong account), so it deliberately
 * doesn't exist.
 */
export const snsTokenDir = process.env.SNS_TOKEN_DIR || join(homedir(), '.config', 'social-flow');

export const SNS_PLATFORMS = ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'] as const;
export type SnsPlatform = (typeof SNS_PLATFORMS)[number];

/** Conventional filename per platform — the same names are used inside channel directories. */
const SNS_CREDENTIAL_FILENAMES: Record<SnsPlatform, string> = {
  THREADS: 'threads_token',
  INSTAGRAM: 'instagram_token',
  FACEBOOK: 'facebook_page_token',
  YOUTUBE: 'youtube-oauth-client.json',
};

/** Default (no-channel) credentials — flat files. The *_TOKEN_FILE envs apply to these paths only. */
const defaultSnsCredentialFiles: Record<SnsPlatform, string> = {
  THREADS: process.env.THREADS_TOKEN_FILE || join(snsTokenDir, 'threads_token'),
  INSTAGRAM: process.env.INSTAGRAM_TOKEN_FILE || join(snsTokenDir, 'instagram_token'),
  FACEBOOK: process.env.FACEBOOK_PAGE_TOKEN_FILE || join(snsTokenDir, 'facebook_page_token'),
  YOUTUBE: process.env.YOUTUBE_OAUTH_FILE || join(snsTokenDir, 'youtube-oauth-client.json'),
};

/** Channel slug convention — the same kebab-case as data/<slug>. Used in path assembly, so traversal is blocked at the source. */
export const CHANNEL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Channel + platform → credential file path. With a channel given, only the channel directory is consulted (no fallback). */
export function snsCredentialFile(platform: SnsPlatform, channel?: string): string {
  if (!channel) return defaultSnsCredentialFiles[platform];
  if (!CHANNEL_SLUG_RE.test(channel)) {
    throw new Error(`Invalid channel slug: "${channel}" — only kebab-case is allowed (same convention as data/<slug>).`);
  }
  return join(snsTokenDir, channel, SNS_CREDENTIAL_FILENAMES[platform]);
}

/** Lists channel directories under <SNS_TOKEN_DIR> holding at least one conventional file (empty array if none). */
export function listChannelDirs(): Array<{ channel: string; platforms: SnsPlatform[] }> {
  let entries: string[];
  try {
    entries = readdirSync(snsTokenDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && CHANNEL_SLUG_RE.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return []; // SNS_TOKEN_DIR itself is missing — credentials not configured
  }
  return entries
    .map((channel) => ({
      channel,
      platforms: SNS_PLATFORMS.filter((platform) => existsSync(snsCredentialFile(platform, channel))),
    }))
    .filter((dir) => dir.platforms.length > 0)
    .sort((a, b) => a.channel.localeCompare(b.channel));
}

/** Tool on/off file — a JSON array of tool-name patterns; a trailing "*" covers a family ("seedance_*"). */
export const disabledToolsFile = join(snsTokenDir, 'disabled-tools.json');

/**
 * Reads the disabled-tool patterns. Missing file = every tool stays on. Read per
 * request like the SNS credential gate, so edits apply without a server restart.
 * A malformed file turns nothing off — it is reported on stderr, not half-guessed.
 */
export function disabledToolPatterns(file: string = disabledToolsFile): string[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((entry): entry is string => typeof entry === 'string')) {
      throw new Error('expected a JSON array of strings');
    }
    return parsed;
  } catch (error) {
    console.error(
      `[social-flow] ${file} ignored (${error instanceof Error ? error.message : String(error)}) — ` +
        'write a JSON array of tool names, e.g. ["seedance_*"]',
    );
    return [];
  }
}

/** True when the tool name hits one of the patterns — an exact name, or a trailing-"*" prefix. */
export function isToolDisabled(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}

export function requireSerpApiKey(): string {
  if (!config.serpApiKey) {
    throw new Error(
      'SERPAPI_API_KEY is not set. serp_* research tools require a SerpApi key (https://serpapi.com/manage-api-key). ' +
        'Do NOT publish unverified time-sensitive facts — use built-in WebSearch or naver_search instead, or ask the user for a fact source.',
    );
  }
  return config.serpApiKey;
}

export function requireDataGoKrKey(): string {
  if (!config.dataGoKrApiKey) {
    throw new Error(
      'DATA_GO_KR_API_KEY is not set. datago_file_fetch/datago_api_call require a data.go.kr auth key ' +
        '(www.data.go.kr My Page > personal API auth key). Even with the key, each API needs a prior use application (auto-approved). ' +
        'datago_search/datago_detail/datago_file_download work without the key — use those for file-data collection.',
    );
  }
  return config.dataGoKrApiKey;
}

export function requireGeminiKey(): string {
  if (!config.geminiApiKey) {
    throw new Error(
      'GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. veo_* (video), tts_* (speech), and music_* (Lyria) ' +
        'generation tools all require a Gemini API key (https://aistudio.google.com/apikey). ' +
        'Video, speech, and music generation are unavailable until the key is set — search, publish, and image tools work fine without it.',
    );
  }
  return config.geminiApiKey;
}

export function requireOpenAiKey(): string {
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. gpt_image_* image generation tools require an OpenAI API key ' +
        '(https://platform.openai.com/api-keys). Image generation is unavailable until the key is set — ' +
        'search, publish, and video tools work fine without it.',
    );
  }
  return config.openaiApiKey;
}

/**
 * sunoapi.org REST base. Default is the public host. The env override is for a
 * same-spec self-host or regional mirror — other vendors (TTAPI, EvoLink) use
 * different auth headers and paths and must not be pointed here.
 */
export function sunoBaseUrl(): string {
  return (process.env.SUNO_BASE_URL || 'https://api.sunoapi.org').replace(/\/+$/, '');
}

export function requireSunoKey(): string {
  if (!config.sunoApiKey) {
    throw new Error(
      'SUNO_API_KEY is not set. suno_* music tools talk to sunoapi.org (https://sunoapi.org/api-key), ' +
        'a third-party REST wrapper — Suno Inc. has no public self-serve API as of 2026-08. ' +
        'music_*(Lyria) still works on GEMINI_API_KEY without this key. Set it only when you need ' +
        'a sung full song or a loopable Suno bed.',
    );
  }
  return config.sunoApiKey;
}

/**
 * ElevenLabs REST base. The env override is for a same-spec proxy or a regional
 * host — the EU residency endpoint (api.eu.residency.elevenlabs.io) is the only
 * official alternative; other vendors' "ElevenLabs-compatible" hosts are not.
 */
export function elevenLabsBaseUrl(): string {
  return (process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/+$/, '');
}

export function requireElevenLabsKey(): string {
  if (!config.elevenLabsApiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. tts_elevenlabs_* speech tools require an ElevenLabs API key ' +
        '(https://elevenlabs.io/app/settings/api-keys — a restricted key needs the text_to_speech permission, ' +
        'plus voices_read for tts_elevenlabs_voices). ' +
        'Without it, tts_generate/tts_multi_speaker (Gemini, GEMINI_API_KEY) and tts_local_generate (on-device, no key) still work.',
    );
  }
  return config.elevenLabsApiKey;
}

export function requireArkKey(): string {
  if (!config.arkApiKey) {
    throw new Error(
      'ARK_API_KEY is not set. seedance_* (video) generation tools require a BytePlus ModelArk API key ' +
        '(https://ai.byteplus.com/ark/region:ap-southeast-1/apikey). ' +
        'The key is the API Key the console issues separately (starts with ark-), not the signing AccessKeyId/SecretAccessKey. ' +
        "And the key alone isn't enough — each model must first be switched on under the console's Model activation, " +
        'or task creation fails with ModelNotOpen (seedance-1-5-pro included, measured 2026-08-15). First activation asks for ' +
        'TOS, VPC, and ML-platform cross-service authorization grants, which the account owner has to click. ' +
        'The Dreamina Seedance 2.5/2.0 family adds one more gate on top: an account balance above $30 or a resource-pack purchase ' +
        '(the seedance-1-5-pro/1-0-pro family only lacks the balance gate). ' +
        'Without this key, veo_* video generation still works via GEMINI_API_KEY — for which one to use, ' +
        'see skills/produce/references/video-model-selection.md.',
    );
  }
  return config.arkApiKey;
}

export function requireNaverKeys(): { id: string; secret: string } {
  if (!config.naverClientId || !config.naverClientSecret) {
    throw new Error(
      'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not set. naver_search requires Naver Open API credentials ' +
        '(https://developers.naver.com/apps — apply for the Search API). ' +
        'Use built-in WebSearch or serp_* tools instead until the keys are configured.',
    );
  }
  return { id: config.naverClientId, secret: config.naverClientSecret };
}
