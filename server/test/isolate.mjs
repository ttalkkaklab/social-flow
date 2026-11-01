// npm test loads this before every test file (node --import): the developer's own provider keys and gateway URLs,
// and ~/.config/social-flow (its .env, disabled-tools.json and SNS tokens), must not change what a test sees.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROVIDER = /^(ARK|ASTRA|DATA_GO_KR|ELEVENLABS|FACEBOOK|GEMINI|GOOGLE|INSTAGRAM|MEDIA_UPLOAD|MELEON|MFLUX|MLX_SERVE|NAVER|OPENAI|PEXELS|PIXABAY|QWEN3|SERPAPI|SNS_TOKEN|SOCIAL_FLOW|SUNO|THREADS|YOUTUBE)_/;
for (const key of Object.keys(process.env)) if (PROVIDER.test(key)) delete process.env[key];
// Each test file runs in its own process on its own empty home, removed when that process ends.
const home = mkdtempSync(join(tmpdir(), 'social-flow-test-home-'));
process.on('exit', () => rmSync(home, { recursive: true, force: true }));
process.env.HOME = home;
