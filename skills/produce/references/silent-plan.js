'use strict';
const fs=require('node:fs');
const {evaluateWindowScript}=require('../../_shared/scenes-vm.js');
function active(value) {
  if (value === undefined || value === null || value === false || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}
function checkSilentPlan(win) {
  for (const [i,shot] of (win.SCENES || []).entries()) {
    if ((shot.narration || []).some(line=>typeof line.tts==='string' && line.tts.trim()))
      throw new Error(`SILENT=1 conflicts with spoken text in shot ${i+1}`);
    for (const key of ['cue','sfx','ambience','effects']) if (active(shot.sound?.[key]))
      throw new Error(`SILENT=1 conflicts with shot ${i+1} sound.${key}`);
  }
}
module.exports={checkSilentPlan};
if(require.main===module){try{checkSilentPlan(evaluateWindowScript(fs.readFileSync(process.argv[2],'utf8')));}catch(error){console.error(error.message);process.exitCode=1;}}
