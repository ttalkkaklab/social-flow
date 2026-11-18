import { copyFileSync } from 'node:fs';
copyFileSync(new URL('./src/video-upscale-worker.py', import.meta.url), new URL('./dist/video-upscale-worker.py', import.meta.url));
