/** Bundled, dependency-free runtime for the installed shot-preparation CLI. */
export { readBoard, serializeBoard } from './storyboard.js';
export { manageSpeech } from './speech.js';
export { astraAudio2VideoSchema, astraImg2VideoSchema, generateFromAudio, generateFromImage } from './astra-video-client.js';
export { resolveVideoDuration } from './video-duration.js';
export { priceOf } from './usage-ledger.js';
