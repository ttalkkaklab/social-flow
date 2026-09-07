/* Shared by the planner, approval page and production preflight. */
(function (root) {
  'use strict';
  const text = value => typeof value === 'string' && !!value.trim();
  const MODES = { hybrid: '혼합 제작', full_video: '전체 영상' };
  // The four slots every generated shot stores (scenes-schema §camera); spatial-prompts.js
  // assembles the motion prompt's camera span from them, so nothing else describes the camera.
  const CAMERA_SLOTS = ['movement', 'speed', 'framing', 'end'];
  const normalize = value => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  // A static camera has no speed to state (the span reads "static camera"), so that one slot may stay empty.
  const staticCamera = camera => /^(static|fixed|locked)/i.test(String(camera?.movement || '').trim());
  const missingCameraSlots = camera => CAMERA_SLOTS.filter(slot => !text(camera?.[slot]) && !(slot === 'speed' && staticCamera(camera)));
  // The final state is written once: the last motion beat on an acted shot, videoDesign.after otherwise.
  function finalState(design) {
    const beats = design?.motion?.kind === 'subject_action' ? design.motion.beats : null;
    return Array.isArray(beats) && beats.length ? beats[beats.length - 1]?.state : design?.after;
  }
  const STYLES = {
    'cinematic-miniature': { label: '시네마틱 미니어처 디오라마', looks: ['miniature', 'architectural'],
      prompt: 'Cinematic miniature diorama, tactile matte handcrafted surfaces, articulated miniature figures, coherent scale and soft contact shadows.' },
    'photoreal': { label: '완전 실사풍', looks: ['realistic'],
      prompt: 'Photoreal live-action cinematography: life-size human proportions, natural skin and fabric texture, real locations, physically plausible light and photographic lenses; every surface reads as a real material at real scale.' },
    'webtoon': { label: '웹툰풍', looks: ['webtoon'],
      prompt: 'Korean webtoon illustration: consistent expressive character linework, clean contour lines, controlled cel shading, illustrated backgrounds and a coherent drawn palette; skin and cloth are drawn, and the frame is one unbroken picture.' }
  };
  // Explicit imported inputs, never inferred from an existing generation output.
  function reused(scene) { return scene.visual?.reuse !== undefined; }
  function reuseErrors(scene) {
    if (!reused(scene)) return [];
    const v = scene.visual || {}, r = v.reuse, errors = [];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return ['visual.reuse must be an imported clip record'];
    const local = file => text(file) && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(file) && !/[\t\r\n|]/.test(file);
    if (!local(r.clip) || !/\.(mp4|mov|m4v|webm)$/i.test(r.clip)) errors.push('visual.reuse.clip must be a local, already trimmed file path');
    if (!/^[a-f0-9]{64}$/.test(r.sha256 || '')) errors.push('visual.reuse.sha256 must identify the imported file bytes');
    if (!text(r.sourceEpisode)) errors.push('visual.reuse.sourceEpisode must identify the original generated episode');
    const range = r.sourceRange;
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start ||
        !Number.isFinite(scene.duration) || scene.duration <= 0 || Math.abs(range.end - range.start - scene.duration) > .001)
      errors.push('visual.reuse.sourceRange must give original start/end seconds spanning exactly scene.duration');
    if (v.video !== undefined || v.clip !== undefined || v.source !== undefined || v.slide !== undefined || v.renderedFile !== undefined ||
        v.engine !== undefined || v.prompt !== undefined || v.bgPrompt !== undefined || v.bg !== undefined || ['broll', 'quote', 'outro'].includes(scene.type))
      errors.push('A reused clip cannot also declare a generation, recording, slide or alternate file handoff');
    if (v.picture !== 'ai-video' || v.overlay !== 'none') errors.push('Reused generated clips keep picture:ai-video and overlay:none');
    if (scene.title || scene.stat || (scene.bullets || []).length || scene.footnote)
      errors.push('Reused video allows subtitles only; clear title, stat, bullets and footnote');
    if (scene.shot?.render?.mode !== 'generated_video' || scene.shot?.render?.purpose !== 'live_action' ||
        scene.shot?.render?.motionEssential !== true || !text(scene.shot?.render?.whyNotStill) || !text(scene.shot?.render?.action) || !text(v.why))
      errors.push('Reused video needs essential live_action with action, whyNotStill and visual.why');
    errors.push(...motionErrors(scene));
    return errors;
  }
  // A supplied file — the user's recording, or a free stock clip (visual.source "stock" with a
  // clip path) — is never a generated shot; a stock photograph may still feed a generated cut.
  function eligible(scene) {
    const v = scene.visual || {};
    return scene.type !== 'outro' && !(!reused(scene) && !v.video &&
      (['recording', 'screencast'].includes(v.source) || v.picture === 'recording' ||
       (v.source === 'stock' && typeof v.clip === 'string')));
  }
  function full(production) { return production?.mode === 'full_video'; }
  // Outputs and approval metadata must not invalidate their own input signature.
  function signature(win) {
    const p = win.PRODUCTION || {};
    return JSON.stringify({ format: win.FORMAT, mode: p.mode, imageProvider: p.imageProvider, videoBudgetUsd: p.videoBudgetUsd,
      maxAttempts: p.maxAttempts, generationRevision: p.generationRevision, comparison: p.comparison, style: p.style,
      scenes: (win.SCENES || []).filter(eligible).map(s => {
        const v = s.visual || {}, video = { ...v.video };
        delete video.clip;
        return { type: s.type, duration: s.duration, narration: s.narration,
          ...(reused(s) ? { reuse: v.reuse } : {}),
          render: s.shot?.render, design: s.shot?.videoDesign,
          frames: v.frames, imagePair: v.imagePair, styleRole: v.styleRole, stylePack: v.stylePack,
          bg: v.bg, bgPrompt: v.bgPrompt, camera: v.camera, action: v.action, video, engine: v.engine,
          prompt: v.prompt, clip: typeof v.clip === 'object' ? v.clip : undefined,
          source: v.source, license: v.license, file: typeof v.clip === 'string' ? v.clip : undefined };
      }) });
  }
  function motionErrors(scene) {
    const d = scene.shot?.videoDesign || {}, m = d.motion, errors = [];
    if (!m || !['subject_action', 'spatial_reveal', 'archive_hold'].includes(m.kind))
      return ['videoDesign.motion.kind must be subject_action, spatial_reveal or archive_hold'];
    for (const key of ['subject', 'visibleChange'])
      if (!text(m[key])) errors.push('videoDesign.motion.' + key + ' is required');
    if (m.kind === 'archive_hold' && d.look !== 'archive') errors.push('archive_hold is only for archival evidence');
    if (m.kind !== 'subject_action' && !text(m.reason)) errors.push('Camera-only or archival shots need an explicit motion.reason');
    if (['character', 'interaction'].includes(scene.visual?.styleRole) && d.look !== 'archive' && m.kind !== 'subject_action')
      errors.push('Character and interaction shots require subject_action, not a camera-only reveal');
    if (m.kind === 'subject_action') {
      const beats = m.beats;
      if (!Array.isArray(beats) || beats.length < 2 || beats.some(b => !b || !Number.isFinite(b.at) || b.at < 0 || b.at > scene.duration || !text(b.state)) ||
          beats.some((b, i) => i && b.at <= beats[i - 1].at) || new Set(beats.map(b => b.state?.trim())).size < 2)
        errors.push('Subject action needs distinct, ordered motion.beats with seconds and visible states within the shot');
      else if (text(d.after) && normalize(d.after) !== normalize(beats[beats.length - 1].state))
        errors.push('videoDesign.after must be the last motion beat, written once; drop after or make the two identical');
      const directions = [d.action, d.continuity, scene.visual?.video?.prompt].join(' ');
      if (/keep (?:every|all) (?:person|people|characters?).{0,40}fixed|(?:people|women|characters?) (?:and door )?(?:stay|remain) fixed|only (?:very )?(?:small|subtle) (?:natural )?breathing|no new text, objects or actions/i.test(directions))
        errors.push('Subject action contradicts a global freeze or breathing-only instruction');
    }
    return errors;
  }
  function check(win, { requireSelection = false, requireApproval = false, draft = false } = {}) {
    const p = win.PRODUCTION, errors = Array.from(win.SCENES || []).flatMap((s, i) => reuseErrors(s).map(e => `shot ${i + 1}: ${e}`));
    if (!p) return requireSelection || (win.SCENES || []).some(reused)
      ? errors.concat(['Choose hybrid or full_video with a cost comparison before generation']) : errors;
    if (!MODES[p.mode]) errors.push('PRODUCTION.mode must be hybrid or full_video');
    if (!Number.isFinite(p.videoBudgetUsd) || p.videoBudgetUsd < 0)
      errors.push('PRODUCTION.videoBudgetUsd must be a finite nonnegative episode cap');
    if (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1 || p.maxAttempts > 5)
      errors.push('PRODUCTION.maxAttempts must be 1–5 total attempts per clip (including the first)');
    if (requireApproval && (!p.approval || !['user', 'standing'].includes(p.approval.kind) ||
        !text(p.approval.reference) || !Number.isFinite(Date.parse(p.approval.at)) || !text(p.approval.quoteFingerprint)))
      errors.push('PRODUCTION.approval needs kind, reference, at and the approved cost quoteFingerprint');
    const chosen = p.style?.preset;
    if (chosen && chosen !== 'spatial-explainer' && !STYLES[chosen]) errors.push('Unknown PRODUCTION.style.preset');
    if (STYLES[chosen] && (!['user', 'standing'].includes(p.style.selection?.kind) ||
        !text(p.style.selection?.reference))) errors.push('Record the actual style HITL choice in PRODUCTION.style.selection');
    if (['photoreal', 'webtoon'].includes(chosen) && p.style.referencePack)
      errors.push('Photoreal/webtoon must not inherit the miniature reference pack');
    if (draft) return errors; // Shot assets/designs are authored after the narration-only draft.
    if (!full(p)) {
      const count = (win.SCENES || []).filter(s => eligible(s) &&
        (s.visual?.video || s.type === 'broll' || (s.type === 'quote' && typeof s.visual?.clip === 'object'))).length;
      if (p.mode === 'hybrid' && ((count < 1 && !(win.SCENES || []).some(reused)) || count > 2)) errors.push('hybrid needs 1–2 generated clips or at least one reused clip with zero generation; revise conflicting channel constraints before production');
      return errors;
    }
    const style = p.style || {};
    if (style.preset !== 'spatial-explainer' && !STYLES[style.preset]) errors.push('Choose an episode visual style before full_video');
    for (const key of ['reference', 'world', 'materials', 'palette', 'lighting', 'camera'])
      if (!text(style[key])) errors.push('PRODUCTION.style.' + key + ' is required');
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s) || reused(s)) return;
      const v = s.visual || {}, design = s.shot?.videoDesign || {};
      const bad = message => errors.push('shot ' + (i + 1) + ': ' + message);
      if (s.shot?.render?.mode !== 'generated_video' || !v.video || v.slide || (v.source && v.source !== 'stock') || v.clip)
        bad('full_video needs a narrated visual.video handoff; no slide/still substitution or b-roll splice');
      if (['broll', 'quote'].includes(s.type)) bad('full_video generated cuts use ordinary narrated cards');
      // A stock photograph (visual.source "stock") is a supplied source image: a license record, no prompt.
      if (!text(v.bg) || (!text(v.bgPrompt) && v.source !== 'stock')) bad('keep a source image path and its generation prompt');
      if (!text(v.video?.prompt)) bad('store the motion prompt before generation');
      if (v.video?.resolution !== '1080p' || v.video?.generateAudio !== false)
        bad('reference quality uses explicit 1080p and generateAudio:false with separate narration');
      if (v.video?.engine !== 'seedance') bad('full_video uses the priced Seedance image-to-video route');
      for (const key of ['look', 'worldId', 'before', 'action', 'continuity', 'reject'])
        if (!text(design[key])) bad('videoDesign.' + key + ' is required');
      if (design.motion?.kind !== 'subject_action' && !text(design.after)) bad('videoDesign.after is required unless the last motion beat states the final result');
      if (design.camera !== undefined) bad('videoDesign.camera is retired; the camera lives in the four visual.camera slots');
      for (const slot of missingCameraSlots(v.camera))
        bad('visual.camera.' + slot + ' is required; the motion prompt is assembled from the four slots (speed may stay empty on a static camera)');
      if (!['miniature', 'architectural', 'realistic', 'webtoon', 'archive'].includes(design.look))
        bad('videoDesign.look must be miniature, architectural, realistic, webtoon or archive');
      if (STYLES[style.preset] && design.look !== 'archive' && !STYLES[style.preset].looks.includes(design.look))
        bad('videoDesign.look conflicts with the selected episode style');
      motionErrors(s).forEach(bad);
      if (!Array.isArray(s.narration) || !s.narration.length) bad('a generated cut needs its approved narration');
      if (s.title || s.stat || (s.bullets || []).length || s.footnote || !['none', undefined].includes(v.overlay))
        bad('only burned subtitles go over full-video footage; clear title, bullets, footnote and overlays');
    });
    // Three identical set-ups in a row read as one long take that keeps restarting. A change of
    // size, angle or move needs a reason, and the reason is the next sentence (full-video.md §Shot plan).
    const run = [];
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s)) return;
      const camera = s.visual?.camera || {}, key = normalize(camera.framing) + '|' + normalize(camera.movement);
      if (run.length && run[run.length - 1].key !== key) run.length = 0;
      run.push({ key, shot: i + 1 });
      if (run.length === 3) errors.push('shots ' + run.map(r => r.shot).join(', ') + ': the same framing and camera move three times in a row; change size, angle or move for a reason');
    });
    return errors;
  }
  function policy(base, production, scenes) {
    // The episode approval authorizes these two changes only. Keep channel motion floors,
    // voice, format, factual evidence and publishing gates intact.
    if (!production || !MODES[production.mode]) return base;
    return { ...base, videoBudgetUsd: production.videoBudgetUsd,
      generatedVideoMax: full(production) ? scenes.filter(eligible).length : Math.min(base.generatedVideoMax ?? 2, 2) };
  }
  const api = { STYLES, MODES, CAMERA_SLOTS, eligible, reused, reuseErrors, full, signature, check, policy, motionErrors, missingCameraSlots, finalState };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PRODUCTION_MODE = api;
})(typeof window === 'object' ? window : globalThis);
