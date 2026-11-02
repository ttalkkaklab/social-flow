import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraGuard} from '../../skills/produce/references/render-evidence.mjs';
const meta=(w,h)=>({zoomPeak:1.32,peakUpscale:Math.max(1080/w,1920/h)*1.32});
test('camera source guard rejects undersized 8-second push but accepts full canvas sources',()=>{
 assert.match(cameraGuard(meta(941,1672),1080,1920),/1.516 exceeds 1.5; minimum source 951x1690/);
 assert.equal(cameraGuard(meta(1088,1920),1080,1920),null);
 assert.equal(cameraGuard({zoomPeak:1.5,peakUpscale:1.5},1080,1920),null);
});
