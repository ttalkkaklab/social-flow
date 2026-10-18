import { createRequire } from 'node:module';
const shared = () => createRequire(import.meta.url)('../../skills/_shared/tts-models.js');
// Keep broken-install diagnostics at tool-call time, not server startup.
export function getTtsModels() {
    return shared().TTS_MODELS;
}
export function resolveTtsModel(provider, model) {
    return shared().resolveTtsModel(provider, model);
}
