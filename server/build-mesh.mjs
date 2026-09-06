import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
// Preserve the complete license in the offline asset distributed to marketplace installs.
const license = readFileSync(new URL('./node_modules/three/LICENSE', import.meta.url), 'utf8');
await build({entryPoints:['slide-mesh-runtime.mjs'], bundle:true, format:'iife', globalName:'SLIDE_MESH',
  minify:true, legalComments:'eof', banner:{js:'/*\n' + license + '\n*/'},
  outfile:'../skills/storyboard/references/mesh-runtime.js'});

await build({entryPoints:['animation-review-runtime.mjs'], bundle:true, format:'iife', globalName:'ANIMATION_REVIEW',
  minify:true, legalComments:'eof', banner:{js:'/*\n' + license + '\n*/'},
  outfile:'../skills/produce/references/animation-review-runtime.js'});
