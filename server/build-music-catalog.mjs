import { writeFileSync } from 'node:fs';
import { musicCatalog } from './dist/music-registry.js';
writeFileSync(new URL('../skills/_shared/music-catalog.json', import.meta.url), JSON.stringify(musicCatalog(), null, 2) + '\n');
