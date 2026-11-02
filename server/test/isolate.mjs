// npm test loads this before every test file (node --import): the developer's own provider keys and gateway URLs,
// and ~/.config/social-flow (its .env, disabled-tools.json and SNS tokens), must not change what a test sees.
// A new provider whose variables start with another prefix goes into PROVIDER.
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const PROVIDER = /^(ARK|ASTRA|DATA_GO_KR|ELEVENLABS|FACEBOOK|GEMINI|GOOGLE|INSTAGRAM|MEDIA_UPLOAD|MELEON|MFLUX|MLX_SERVE|NAVER|OPENAI|PEXELS|PIXABAY|QWEN3|SERPAPI|SNS_TOKEN|SOCIAL_FLOW|SUNO|THREADS|YOUTUBE)_/;
for (const key of Object.keys(process.env)) if (PROVIDER.test(key)) delete process.env[key];

// Real tools stay: a BLENDER or CHROME that is not a file (say the .app bundle) falls back to the default path,
// and an app installed only under ~/Applications is kept before the home changes.
const isFile = (file) => { try { return statSync(file).isFile(); } catch { return false; } };
const apps = { BLENDER: 'Blender.app/Contents/MacOS/Blender', CHROME: 'Google Chrome.app/Contents/MacOS/Google Chrome' };
for (const [key, app] of Object.entries(apps)) {
  if (process.env[key] && !isFile(process.env[key])) delete process.env[key];
  const own = join(homedir(), 'Applications', app);
  if (!process.env[key] && !isFile(join('/Applications', app)) && isFile(own)) process.env[key] = own;
}

// Each test file runs in its own process on its own empty home, removed when that process ends or is interrupted.
const home = mkdtempSync(join(tmpdir(), 'social-flow-test-home-'));
const clean = () => rmSync(home, { recursive: true, force: true });
process.on('exit', clean);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
  process.once(signal, () => { clean(); process.kill(process.pid, signal); });
process.env.HOME = home;
