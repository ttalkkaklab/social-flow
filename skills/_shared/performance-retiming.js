'use strict';
const { planScenePerformance } = require('./scene-acting.js');
function retime(scene, options, measure) {
  const next = structuredClone(scene);
  for (const event of next.performance || []) {
    if (options.speechBoundActions && event.kind === 'action' && event.withGroup !== undefined)
      delete event.durationSeconds;
  }
  for (const [index, seconds] of options.actions || []) {
    const event = next.performance?.[index];
    if (event?.kind !== 'action' || !Number.isFinite(seconds) || seconds <= 0)
      throw new Error('Select an action index and a finite positive duration');
    event.durationSeconds = seconds;
  }
  const plan = planScenePerformance(next, measure);
  if (!(plan.durationSeconds > 0)) throw new Error('Every action and speech source needs measurable timing');
  next.duration = plan.durationSeconds;
  // Provider frame rounding belongs to the request, never back into authored performance.
  return { scene: next, plan, previousSeconds: scene.duration };
}


function prefixCompatible(prior, next) {
  // The prose prompt omits source identity and can collapse distinct camera/design fields.
  // Legacy bindings lack this evidence and must not acquire it from the revised board.
  if (!prior.reuseContextRevision || prior.reuseContextRevision !== next.reuseContextRevision) return false;
  if (!Number.isFinite(prior.durationSeconds) || !Number.isFinite(next.durationSeconds) ||
      next.durationSeconds <= 0 || next.durationSeconds >= prior.durationSeconds) return false;
  const cleanPrompt = text => String(text || '').replace(/Action interval [0-9.]+–[0-9.]+ seconds\./g, 'Action interval.');
  if (!prior.videoPrompt || cleanPrompt(prior.videoPrompt) !== cleanPrompt(next.videoPrompt)) return false;
  const old = prior.performance, current = next.performance;
  if (!Array.isArray(old) || !Array.isArray(current) || old.length !== current.length) return false;
  const temporal = new Set(['durationSeconds', 'endSeconds']);
  const normalize = event => Object.fromEntries(Object.keys(event).sort().filter(k => !temporal.has(k)).map(k => [k,event[k]]));
  return current.every((event, i) => {
    const before = old[i];
    return Number.isFinite(event.startSeconds) && event.startSeconds === before.startSeconds &&
      Number.isFinite(event.endSeconds) && event.endSeconds >= event.startSeconds && event.endSeconds <= next.durationSeconds && event.endSeconds <= before.endSeconds &&
      JSON.stringify(normalize(event)) === JSON.stringify(normalize(before));
  });
}
module.exports = { retime, prefixCompatible };
