import { writeFileSync } from 'node:fs';
import { imageCatalog } from './dist/image-registry.js';
writeFileSync(new URL('../skills/_shared/image-catalog.json', import.meta.url), JSON.stringify(imageCatalog(), null, 2) + '\n');
