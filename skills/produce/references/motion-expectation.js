'use strict';
const motion = require('./measure-motion.js');
const EXPLANATORY = new Set(['character_html', 'object_html', 'data_graph']);
const VIDEO = new Set(['generated_video', 'stock_video']);
const IMAGE = /\.(png|jpe?g|webp|avif|gif)(?:[?#].*)?$/i;

// An MP4 container proves neither animation nor a semantic explanation.
function classify(scene, cut = null) {
  const visual = scene.visual || {}, render = cut?.render || scene.shot?.render || {};
  const mode = render.mode, findings = [];
  const intent = cut?.motionIntent || (!cut ? visual.motionIntent || render.motionIntent : null);
  const intentionalStill = intent?.type === 'intentional_still' && typeof intent.reason === 'string' && intent.reason.trim();
  if (intent?.type === 'intentional_still' && !intentionalStill)
    findings.push('intentional still has no reason; motion expectation is unresolved');
  let kind;
  if (cut && !['graphic', 'motion', 'still', 'archive'].includes(cut.kind)) {
    kind = 'unknown';
    findings.push('unrecognized production cut kind: ' + String(cut.kind));
  }
  else if (cut?.kind === 'graphic') kind = 'explanatory';
  else if (cut?.kind === 'motion') kind = 'video';
  else if (cut?.kind === 'still' || cut?.kind === 'archive') kind = 'still_camera';
  else if (visual.slide?.kind === 'camera') kind = 'still_camera';
  else if (EXPLANATORY.has(mode) || visual.slide?.motion === true) kind = 'explanatory';
  else if (VIDEO.has(mode)) kind = 'video';
  else if (mode === 'still_camera') kind = 'still_camera';
  else if (visual.video || visual.reuse !== undefined || ['ai-video', 'recording'].includes(visual.picture)) kind = 'video';
  else if (visual.slide || mode === 'editorial_html') kind = 'explanatory';
  else if (visual.camera?.movement) kind = 'still_camera';
  else kind = 'unknown';
  if (intentionalStill) {
    if (EXPLANATORY.has(mode) || VIDEO.has(mode)) findings.push(`intentional still conflicts with planned ${mode}`);
    kind = 'intentional_still';
  }
  if (cut && VIDEO.has(mode) && ['graphic', 'still', 'archive'].includes(cut.kind))
    findings.push(`planned ${mode} differs from actual ${cut.kind} cut`);
  if (EXPLANATORY.has(mode) && kind !== 'explanatory' && kind !== 'intentional_still')
    findings.push(`planned ${mode} differs from actual ${kind}${cut ? ' cut' : ' handoff'}; camera or footage motion does not establish explanatory element motion`);
  if (!cut && VIDEO.has(mode) && kind === 'still_camera')
    findings.push(`planned ${mode} differs from actual camera handoff`);
  const source = cut?.path || visual.asset || visual.file || visual.src;
  if (kind === 'video' && typeof source === 'string' && IMAGE.test(source) && !visual.video && !visual.reuse)
    findings.push('planned video uses an image source; renderedFile alone does not prove subject motion');
  if (kind === 'explanatory' && typeof source === 'string' && IMAGE.test(source))
    findings.push('explanatory graphic uses an image source; verify that elements animate in the encoded cut');
  if (kind === 'unknown') findings.push('motion expectation is unknown; declare the render mode or an intentional still with its reason');
  return { kind, plannedMode: mode || null, source: source || null,
    intentionalStillReason: intentionalStill ? intent.reason.trim() : null, findings };
}

function windows(scene, seconds, { fps = 30 } = {}) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('motion frame rate must be positive and finite');
  const frameTolerance = 1 / fps + 1e-6;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('motion window needs a positive finite duration');
  const cuts = scene.productionPlan?.cuts;
  if (!Array.isArray(cuts) || !cuts.length) return [{ start: 0, seconds, ...classify(scene) }];
  let offset = 0;
  const out = [];
  for (const [index, cut] of cuts.entries()) {
    if (!Number.isFinite(cut.seconds) || cut.seconds <= 0) throw new Error(`cut ${index} needs positive finite seconds`);
    const end = offset + cut.seconds;
    // cut.start is a seek into the source asset, not a position in the assembled card.
    if (offset < seconds) {
      const row = { cut: index, start: offset, seconds: Math.min(end, seconds) - offset, ...classify(scene, cut) };
      if (end > seconds + frameTolerance) row.findings.push('cut timing extends beyond the encoded card; measured the available portion');
      out.push(row);
    } else out.at(-1).findings.push(`cut ${index} starts beyond the encoded card and cannot be measured`);
    offset = end;
  }
  // Encoder frame rounding is not an unplanned tail. Keep it in the last cut.
  if (offset < seconds && seconds - offset <= frameTolerance) out.at(-1).seconds += seconds - offset;
  else if (offset < seconds) out.push({ start: offset, seconds: seconds - offset, ...classify(scene),
    findings: ['encoded card has a tail outside productionPlan.cuts; inspect its content'] });
  return out;
}

// Reusable for one-shot previews and the final, clean master. Pixel differences cannot
// approve element order, arithmetic, narration alignment or subject action.
function assess(file, scene, { start = 0, seconds = scene.duration, policy, fps = 30, measure = motion.measure } = {}) {
  if (!Number.isFinite(start) || start < 0) throw new Error('motion start must be finite and nonnegative');
  const stillLimit = motion.plateStillLimit(policy);
  const parts = windows(scene, seconds, { fps }).map(window => {
    const measured = measure(file, { start: start + window.start, seconds: window.seconds });
    const findings = [...window.findings];
    if (!measured.samples) findings.push('no motion samples in this window; motion is not reviewed');
    else if (window.kind === 'video' || window.kind === 'explanatory' || window.kind === 'unknown')
      findings.push(...motion.findings(measured, window.kind === 'video' ? 'video' : 'card', { stillLimit }));
    else if (window.kind === 'still_camera' && measured.frozenShare >= .99)
      findings.push('camera motion is not visible in the proxy; inspect playback for the planned camera move');
    return { ...window, masterStart: start + window.start, measured, findings, semanticReview: 'not_reviewed' };
  });
  const warnings = parts.flatMap(part => part.findings.map(f => `at ${part.masterStart.toFixed(3)}s${part.cut === undefined ? '' : ` cut ${part.cut}`}: ${f}`));
  return { sampleFps: motion.SAMPLE_FPS, plateStillLimit: stillLimit, windows: parts, warnings,
    status: warnings.length ? 'needs-review' : 'no-proxy-findings', semanticReview: 'not_reviewed' };
}
module.exports = { classify, windows, assess };
