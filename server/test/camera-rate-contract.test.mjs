import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function rates(source,name){
 const literal=source.match(new RegExp('const '+name+'\\s*=\\s*(\\{[^;\\n]+\\})'))?.[1];
 assert.ok(literal,`${name} declaration missing`);
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+literal+')')));
}
test('camera runtime and renderer diagnostic RATE tables agree in every row',()=>{
 const runtime=read('../../skills/storyboard/references/still-camera.js');
 const renderer=read('../../skills/produce/references/render-motion-slide.mjs');
 assert.deepEqual(rates(runtime,'RATE'),rates(renderer,'CAMERA_RATE'));
});
