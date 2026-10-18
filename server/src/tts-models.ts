import { createRequire } from 'node:module';

export interface TtsModelContract {
  model: string;
  provider: 'gemini' | 'elevenlabs';
  direction: 'legacy' | 'metadata' | 'inline';
  single: string;
  dialogue: string;
  maxSpeakers: number;
  maxCharacters: number;
  recommendedDialogueCharacters: number | null;
  maxStyleCharacters: number | null;
  vocalEvents: boolean;
  customVoice: boolean;
  numericSpeed: boolean;
  timestamps: boolean;
  evidence: string;
}
const shared = () => createRequire(import.meta.url)('../../skills/_shared/tts-models.js') as {
  TTS_MODELS: readonly Readonly<TtsModelContract>[];
  resolveTtsModel(provider: string, model?: string): Readonly<TtsModelContract>;
};
// Keep broken-install diagnostics at tool-call time, not server startup.
export function getTtsModels(): readonly Readonly<TtsModelContract>[] {
  return shared().TTS_MODELS;
}
export function resolveTtsModel(provider: string, model?: string): Readonly<TtsModelContract> {
  return shared().resolveTtsModel(provider, model);
}
