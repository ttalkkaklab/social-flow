import {execFileSync} from 'node:child_process';
import {percentileContrast} from './slide-legibility.mjs';

export function cameraGuard(meta, width, height) {
  // Keep 1.5 aligned with the source-size formula in render-routing.md and still-generation.md.
  if (!(meta.peakUpscale > 1.5)) return null;
  return `camera peak upscale ${meta.peakUpscale.toFixed(3)} exceeds 1.5; minimum source ${Math.ceil(width*meta.zoomPeak/1.5)}x${Math.ceil(height*meta.zoomPeak/1.5)}`;
}

export function readContrastFrame(file, width, height, decode=execFileSync) {
  try {
    const pixels=decode('ffmpeg',['-v','error','-i',file,'-vf','format=gray','-frames:v','1','-f','rawvideo','-'],{maxBuffer:width*height*4});
    if(pixels.length!==width*height)throw new Error(`expected ${width*height} grayscale bytes, received ${pixels.length}`);
    return {pixels,error:null};
  } catch(error) {
    return {pixels:null,error:String(error.message||error).split('\n')[0]};
  }
}

export function rowContrast(pixels, width, height, row) {
  const x=Math.max(0,Math.ceil(row.x)),y=Math.max(0,Math.ceil(row.y));
  const w=Math.min(width,Math.floor(row.x+row.w))-x,h=Math.min(height,Math.floor(row.y+row.h))-y;
  if(w<=0||h<=0)return null;
  const crop=new Uint8Array(w*h);
  for(let i=0;i<h;i++)crop.set(pixels.subarray((y+i)*width+x,(y+i)*width+x+w),i*w);
  return percentileContrast(crop);
}
