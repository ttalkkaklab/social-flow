/* Shared planning contract. Reading old artifacts does not invoke this production gate. */
const VERSION = 'object-state-v1';
function checkQuality(slide, segments) {
  if (!slide) return [];
  if (slide.quality == null) return (slide.kind || 'diagram') === 'diagram' && slide.treatment === 'editorial'
    ? ['editorial slide requires quality: object-state-v1 and a subject change plan'] : [];
  const errors = [];
  if (slide.quality !== VERSION) return [`unknown slide.quality: ${slide.quality}`];
  const subject = slide.subject;
  if (!subject || !['object', 'data', 'type'].includes(subject.kind))
    return ['slide.subject.kind must be object, data or type'];
  const changes = subject.changes;
  if (!Array.isArray(changes) || changes.length !== segments)
    return ['slide.subject.changes needs one before/after change per narration segment'];
  const drivers = subject.kind === 'object' ? ['geometry', 'surface', 'articulation', 'spatial']
    : subject.kind === 'data' ? ['value', 'relation'] : ['type'];
  changes.forEach((change, i) => {
    if (!change || change.group !== i + 1) {
      errors.push(`subject change ${i + 1} must name group ${i + 1}`); return;
    }
    if (![change.before, change.after].every(v => typeof v === 'string' && v.trim()) ||
        change.before.trim() === change.after.trim())
      errors.push(`subject group ${i + 1} needs distinct nonempty before/after states`);
    if (!drivers.includes(change.driver))
      errors.push(`subject group ${i + 1} driver must be ${drivers.join(', ')}; camera/settle/labels are not subject changes`);
  });
  if (subject.kind === 'object') {
    if (!slide.object) errors.push('object subject needs slide.object with a baked state-changing render');
    const keys = String(slide.object?.keys || '').trim().split(/\s+/).filter(Boolean);
    if (slide.object && !keys.length) errors.push('slide.object needs keys — one state name per group plus the start state');
    for (let i = 1; i < keys.length; i++) {
      if (keys[i] === keys[i - 1]) errors.push(`object keys freeze in group ${i}`);
    }
  }
  if (slide.object && subject.kind !== 'object') errors.push('slide.object requires subject.kind object');
  return errors;
}
module.exports = { VERSION, checkQuality };
