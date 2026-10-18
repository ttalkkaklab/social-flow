import { writeFileSync } from 'node:fs';
import { videoCatalog } from './dist/video-registry.js';
// Committed projection for CommonJS planners; adapter modules remain the only source.
writeFileSync(new URL('../skills/_shared/video-catalog.json', import.meta.url), JSON.stringify(videoCatalog(), null, 2) + '\n');
