'use strict';
// Audio is normalized to 48 kHz. Recover that integer clock from ffprobe's
// six-decimal duration before rounding up to video frames.
function durationFrames(seconds, fps) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isInteger(fps) || fps <= 0)
    throw new Error('Frame clock requires a finite nonnegative duration and positive integer fps');
  const samples = Math.round(seconds * 48000);
  if (!Number.isSafeInteger(samples)) throw new Error('Audio duration exceeds the safe sample clock');
  return Math.ceil(samples * fps / 48000);
}
module.exports = { durationFrames };
if (require.main === module) {
  try { process.stdout.write(String(durationFrames(Number(process.argv[2]), Number(process.argv[3])))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
