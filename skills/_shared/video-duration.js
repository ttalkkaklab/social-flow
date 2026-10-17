'use strict';

// Round upward only: a provider's duration grid must never truncate the shot.
function positive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error(name + ' must be finite positive seconds');
  return value;
}
function nonnegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(name + ' must be finite nonnegative seconds');
  return value;
}
function minimumDuration(requiredSeconds, limits) {
  positive(requiredSeconds, 'requiredSeconds');
  let durationSeconds, numFrames;
  if (limits.seconds) {
    durationSeconds = limits.seconds.find(seconds => seconds >= requiredSeconds);
  } else if (limits.frameRate !== undefined) {
    const fps = positive(limits.frameRate, 'frameRate');
    // Compute the first legal frame count, then compare in seconds to avoid rounding down.
    numFrames = Math.max(limits.min, 1 + limits.step * Math.ceil((requiredSeconds * fps - 1) / limits.step));
    if (numFrames / fps < requiredSeconds) numFrames += limits.step;
    if (numFrames <= limits.max) durationSeconds = numFrames / fps;
  } else {
    durationSeconds = Math.max(limits.min, Math.ceil(requiredSeconds));
    if (durationSeconds > limits.max) durationSeconds = undefined;
  }
  if (durationSeconds === undefined) throw new Error('Required ' + requiredSeconds + 's exceeds this route\'s duration limit; split or replan the shot. No truncation or automatic model switch.');
  return { requiredSeconds, requestedSeconds: durationSeconds, excessSeconds: durationSeconds - requiredSeconds,
    ...(numFrames === undefined ? { durationSeconds } : { numFrames, frameRate: limits.frameRate }) };
}

// scene.duration is the approved body length. Measured performance/audio may extend it;
// source trim and outgoing live transition handles are additional source coverage.
function shotTiming(scene, { performanceSeconds, audioSeconds, edit = {}, outputFps = 30 } = {}) {
  const plannedSeconds = positive(scene.duration, 'scene.duration');
  const measured = [performanceSeconds, audioSeconds].filter(value => value !== undefined && value !== null);
  for (const value of measured) nonnegative(value, 'measured duration');
  const pre = nonnegative(edit.pre ?? 0, 'edit.pre');
  const post = nonnegative(edit.post ?? 0, 'edit.post');
  const sourceIn = nonnegative(edit.in ?? scene.edit?.in ?? 0, 'edit.in');
  const handle = nonnegative(edit.handle ?? 0, 'outgoing handle');
  const fps = positive(outputFps, 'outputFps');
  const body = Math.max(plannedSeconds, measured.length ? Math.max(...measured) + pre + post : plannedSeconds);
  const bodySeconds = Math.ceil(body * fps) / fps;
  const handleSeconds = Math.ceil(handle * fps) / fps;
  return { plannedSeconds, bodySeconds, sourceIn, handleSeconds,
    requiredSeconds: sourceIn + bodySeconds + handleSeconds };
}

module.exports = { minimumDuration, shotTiming };
