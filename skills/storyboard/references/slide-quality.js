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
    if (slide.object && !['mesh', 'blender'].includes(slide.object.renderer) && !keys.length) errors.push('slide.object needs keys — one state name per group plus the start state');
    for (let i = 1; i < keys.length; i++) {
      if (keys[i] === keys[i - 1]) errors.push(`object keys freeze in group ${i}`);
    }
  }
  if (slide.object && subject.kind !== 'object') errors.push('slide.object requires subject.kind object');
  if (slide.object?.renderer === 'mesh') {
    const ob = slide.object;
    if (!/^slides\/assets\/s\d+-[a-z0-9-]+\.json$/.test(ob.file || '')) errors.push('mesh object.file must be slides/assets/s<shot>-<slug>.json');
    if (!require('./mesh-contract.js').STYLES.includes(ob.style)) errors.push('mesh object.style must be illustration3d or photoreal3d');
    if (!String(ob.plan || '').trim()) errors.push('mesh object.plan must describe the subject motion');
  } else if (slide.object?.renderer === 'blender') {
    // A mesh recipe baked by Blender Cycles into a frame sheet (blender-objects.md). The
    // recipe rules are the mesh lane's; the sheet, engine, samples and fps make the bake reproducible.
    const ob = slide.object;
    if (!/^slides\/assets\/s\d+-[a-z0-9-]+\.json$/.test(ob.file || '')) errors.push('blender object.file must be the mesh recipe slides/assets/s<shot>-<slug>.json');
    if (!/^slides\/assets\/s\d+-[a-z0-9-]+\.png$/.test(ob.sheet || '')) errors.push('blender object.sheet must be the baked sheet slides/assets/s<shot>-<slug>.png');
    if (!require('./mesh-contract.js').STYLES.includes(ob.style)) errors.push('blender object.style must be illustration3d or photoreal3d');
    if (ob.engine !== 'cycles') errors.push('blender object.engine must be cycles (the shadow catcher needs it)');
    if (!Number.isInteger(ob.samples) || ob.samples < 8 || ob.samples > 1024) errors.push('blender object.samples must be an integer 8–1024');
    if (![15, 24, 30].includes(ob.fps)) errors.push('blender object.fps must be 15, 24 or 30');
    if (!String(ob.plan || '').trim()) errors.push('blender object.plan must describe the subject motion');
  } else if (slide.object?.renderer != null && slide.object.renderer !== 'sheet') errors.push('unknown object.renderer; choose mesh, blender or sheet');
  return errors;
}
module.exports = { VERSION, checkQuality };
