/**
 * capability_status — what this machine can actually do right now.
 *
 * ## The gap this closes
 *
 * Today a missing key surfaces one way only: you call the tool, it fails, and the error
 * message explains what to set. That message is well written — but it arrives **after** the
 * plan was made around a tool that was never going to run. A storyboard that plans two Veo
 * b-roll slots on a machine with no `GEMINI_API_KEY` has already spent the review rounds
 * before anyone finds out.
 *
 * The server knows the answer before any of that. It reads the same environment at startup to
 * print its credential line, and it already hides SNS tools whose credential file is missing.
 * This exposes that knowledge as a tool, grouped by capability rather than by tool name, so a
 * skill can open with "video 1 of 2 configured" instead of discovering it by failing.
 *
 * ## What it is not
 *
 * It reports **configuration**, not reachability. A key that is present but revoked reads as
 * configured here and fails at the call — checking for real would mean spending money on every
 * status call. Local engines report whether their binary resolves, which is as far as a
 * filesystem check goes.
 */

import { existsSync } from 'node:fs';
import { config, mfluxZImageBin, qwen3AsrBin, snsTokenDir } from './config.js';
import { enabledPlatforms } from './sns-client.js';

export interface ProviderStatus {
  provider: string;
  configured: boolean;
  /** What turns it on — an env var name, or a short phrase for local engines. */
  needs: string;
  note?: string;
}

export interface CapabilityStatus {
  capability: string;
  configured: number;
  total: number;
  providers: ProviderStatus[];
}

const has = (v: string | undefined): boolean => Boolean(v && v.length > 0);
const binOk = (p: string): boolean => { try { return existsSync(p); } catch { return false; } };

export function capabilityStatus(): {
  capabilities: CapabilityStatus[];
  setupOffers: Array<{ env: string; unlocks: string[] }>;
  sns: { platforms: string[]; tokenDir: string };
} {
  const gemini = has(config.geminiApiKey);

  const capabilities: CapabilityStatus[] = [
    {
      capability: 'video_generation',
      providers: [
        { provider: 'veo (Gemini)', configured: gemini, needs: 'GEMINI_API_KEY',
          note: 'veo_text2video · veo_img2video · veo_reference · veo_extension' },
        { provider: 'seedance (BytePlus ModelArk)', configured: has(config.arkApiKey), needs: 'ARK_API_KEY',
          note: 'seedance_text2video · seedance_img2video · seedance_reference' },
      ],
    },
    {
      capability: 'image_generation',
      providers: [
        { provider: 'z-image (local, mflux)', configured: binOk(mfluxZImageBin()), needs: 'mflux on this machine',
          note: 'image_local_generate — free, and the default for backgrounds with no text' },
        { provider: 'gpt-image (OpenAI)', configured: has(config.openaiApiKey), needs: 'OPENAI_API_KEY',
          note: 'gpt_image_text2img · gpt_image_img2img — the only lane that renders Korean text' },
      ],
    },
    {
      capability: 'tts',
      providers: [
        { provider: 'supertonic (local)', configured: true, needs: 'python3 on this machine',
          note: 'tts_local_generate — free, offline, the default narration voice' },
        { provider: 'gemini', configured: gemini, needs: 'GEMINI_API_KEY',
          note: 'tts_generate · tts_multi_speaker' },
        { provider: 'elevenlabs', configured: has(config.elevenLabsApiKey), needs: 'ELEVENLABS_API_KEY',
          note: 'tts_elevenlabs_generate · tts_elevenlabs_dialogue' },
      ],
    },
    {
      capability: 'music_generation',
      providers: [
        { provider: 'lyria (Gemini)', configured: gemini, needs: 'GEMINI_API_KEY',
          note: 'music_generate · music_generate_clip' },
        { provider: 'suno (sunoapi.org)', configured: has(config.sunoApiKey), needs: 'SUNO_API_KEY',
          note: 'suno_generate — third-party wrapper, not an official Suno API' },
      ],
    },
    {
      capability: 'speech_to_text',
      providers: [
        { provider: 'qwen3-asr (local)', configured: binOk(qwen3AsrBin()), needs: 'mlx-qwen3-asr on this machine',
          note: 'stt_local_transcribe — the ingest skill reads recordings with it' },
      ],
    },
    {
      capability: 'research',
      providers: [
        { provider: 'naver', configured: has(config.naverClientId) && has(config.naverClientSecret),
          needs: 'NAVER_CLIENT_ID + NAVER_CLIENT_SECRET', note: 'naver_search — 25,000/day' },
        { provider: 'serpapi', configured: has(config.serpApiKey), needs: 'SERPAPI_API_KEY',
          note: 'serp_* · sns_issue_scout — 250/month free, spend it on precision searches' },
        { provider: 'data.go.kr', configured: has(config.dataGoKrApiKey), needs: 'DATA_GO_KR_API_KEY',
          note: 'datago_file_fetch · datago_api_call — search/detail/download need no key' },
      ],
    },
  ].map((c) => ({
    ...c,
    configured: c.providers.filter((p) => p.configured).length,
    total: c.providers.length,
  }));

  // One env var can turn on several providers at once — group them so the offer reads as one
  // action rather than four.
  const offers = new Map<string, string[]>();
  capabilities.forEach((c) => {
    c.providers.forEach((p) => {
      if (p.configured) return;
      if (!/^[A-Z0-9_]+(\s\+\s[A-Z0-9_]+)*$/.test(p.needs)) return;   // env vars only — a local install is not a 1-minute fix
      const list = offers.get(p.needs) ?? [];
      list.push(`${c.capability}: ${p.provider}`);
      offers.set(p.needs, list);
    });
  });

  return {
    capabilities,
    setupOffers: Array.from(offers, ([env, unlocks]) => ({ env, unlocks })),
    sns: { platforms: enabledPlatforms(), tokenDir: snsTokenDir },
  };
}

/** The same picture as a menu a person reads — "N of M configured", then what one key unlocks. */
export function renderCapabilityStatus(): string {
  const { capabilities, setupOffers, sns } = capabilityStatus();
  const lines: string[] = ['What this machine can do right now', ''];
  capabilities.forEach((c) => {
    lines.push(`  ${c.capability.padEnd(18)} ${c.configured}/${c.total} configured`);
    c.providers.forEach((p) => {
      lines.push(`      ${p.configured ? '✓' : '·'} ${p.provider}${p.configured ? '' : `  — needs ${p.needs}`}`);
      if (p.note) lines.push(`          ${p.note}`);
    });
  });
  lines.push('');
  lines.push(`  publishing         ${sns.platforms.length ? sns.platforms.join(', ') : 'none'}` +
             `  (credential files under ${sns.tokenDir})`);
  if (setupOffers.length) {
    lines.push('');
    lines.push('  One env var away:');
    setupOffers.forEach((o) => {
      lines.push(`      ${o.env} → ${o.unlocks.join(', ')}`);
    });
  }
  lines.push('');
  lines.push('  Configuration only — a key that is present but revoked reads as configured here');
  lines.push('  and fails at the call. Local engines report whether their binary resolves.');
  return lines.join('\n');
}
