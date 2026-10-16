'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { framePlan } = require('./render-routing.js');

// Small decoded thumbnails find review candidates, not semantic equivalence or quality.
// No network input, generated assets, persistent cache, or mandatory approval gate.
function inspect(file, remote) {
  if (remote) return { status: 'unverified', reason: 'remote pixels are not fetched' };
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch { return { status: 'unverified', reason: 'local source is unreadable' }; }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (!/\.(png|jpe?g|webp|avif|bmp|tiff?)$/i.test(file)) {
    return { hash, status: 'unverified', reason: 'unsupported still-image format' };
  }
  const decoded = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-threads', '1',
    '-protocol_whitelist', 'file,pipe', '-i', file, '-filter_threads', '1',
    '-vf', 'scale=32:32', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
  { timeout: 3000, maxBuffer: 16384, windowsHide: true });
  if (decoded.status !== 0 || decoded.stdout?.length !== 3072) {
    return { hash, status: 'unverified', reason: 'pixel decoding failed or ffmpeg is unavailable' };
  }
  return { hash, status: 'decoded', pixels: decoded.stdout };
}
function distance(a, b) {
  let total = 0, edges = 0;
  const gray = (p, x, y) => { const i = (y * 32 + x) * 3; return p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114; };
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  for (let y = 0; y < 32; y += 4) for (let x = 0; x < 28; x += 4) {
    if ((gray(a, x, y) > gray(a, x + 4, y)) !== (gray(b, x, y) > gray(b, x + 4, y))) edges++;
  }
  return { meanRgbDifference: total / (a.length * 255), edgeDifference: edges };
}
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ')
  : Array.isArray(value) ? value.map(normalize)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .filter(key => !['reason', 'movement'].includes(key)).map(key => [key, normalize(value[key])])) : value;

function check(win, storyboard) {
  const images = new Map(), setups = new Map(), sources = new Map(), findings = [];
  const add = (groups, key, row) => { const rows = groups.get(key) || []; rows.push(row); groups.set(key, rows); };
  const report = (code, rows, what, extra = {}) => findings.push({
    level: 'warn', where: 'shot image review', code,
    shots: rows.map(row => row.shot), shotIds: rows.map(row => row.shotId),
    references: rows.map(row => ({ ...row })), ...extra,
    what: 'shots ' + rows.map(row => row.shotId ? `${row.shot} (${row.shotId})` : row.shot).join(', ') + ': ' + what,
  });
  for (const [index, scene] of (win.SCENES || []).entries()) {
    const v = scene.visual || {}, shot = scene.shot || {}, mode = shot.render?.mode;
    if (scene.type === 'outro' || v.reuse || ['stock', 'recording', 'screencast'].includes(v.source) ||
        shot.videoDesign?.look === 'archive' || mode === 'stock_video') continue;
    if (!['still_camera', 'generated_video'].includes(mode) &&
        !(mode === undefined && ['ai-video', 'video', 'image'].includes(v.picture))) continue;
    const row = { shot: index + 1, shotId: scene.id || null, image: framePlan(scene).start || null, resolvedImage: null, pixelStatus: 'unverified' };
    if (typeof row.image === 'string' && row.image.trim()) {
      const remote = /^[a-z][a-z0-9+.-]*:/i.test(row.image);
      const file = remote ? row.image : path.resolve(storyboard, row.image);
      if (!sources.has(file)) sources.set(file, { ...inspect(file, remote), rows: [] });
      const source = sources.get(file);
      row.resolvedImage = file; row.pixelStatus = source.status;
      source.rows.push(row);
      add(images, source.hash ? 'sha256:' + source.hash : file, row);
    } else report('unverified_source_image', [row], 'no opening source image is assigned; pixels unverified.');
    const framing = normalize(v.camera?.framing);
    const actor = Array.isArray(v.character) ? v.character.slice().sort() : v.character;
    if (actor && framing && shot.size && shot.angle) {
      // Compare all supplied spatial/state fields, not just center/left or depth mode.
      // A partial plan is explicitly partial evidence; never claim image equivalence.
      const key = JSON.stringify(normalize([actor, scene.scene, shot.videoDesign?.worldId,
        shot.size, shot.angle, v.camera, shot.composition, shot.depth,
        shot.videoDesign?.before, shot.videoDesign?.blocking, v.action]));
      add(setups, key, row);
    }
  }
  for (const [key, rows] of images) {
    if (rows.length < 2) continue;
    report('shared_source_image', rows,
      (key.startsWith('sha256:') ? 'identical source image bytes' : 'same source image reference (pixels unverified)') +
      ' used across cuts: ' + [...new Set(rows.map(row => row.image))].join(', ') +
      '. Compare each opening state and framing; retain intentional reuse with its shot-specific reason, otherwise author separate source frames. Renaming a copy does not create a new shot.');
  }
  const decoded = [...sources.values()].filter(source => source.status === 'decoded');
  for (let i = 0; i < decoded.length; i++) for (let j = i + 1; j < decoded.length; j++) {
    const a = decoded[i], b = decoded[j];
    if (a.hash === b.hash) continue;
    const metric = distance(a.pixels, b.pixels);
    if (metric.meanRgbDifference <= .10 && metric.edgeDifference <= 12) {
      report('similar_source_images', [...a.rows, ...b.rows].sort((a, b) => a.shot - b.shot),
        'decoded opening images look similar at thumbnail scale: ' +
        [...new Set([...a.rows, ...b.rows].map(row => row.image))].join(', ') +
        '. Inspect the full images together for meaningful framing, action and prop changes. This is a review candidate, not proof of duplication or a generation gate.',
        { comparison: { method: '32x32 RGB mean distance and 56 coarse luminance edges', ...metric } });
    }
  }
  for (const source of sources.values()) if (source.status === 'unverified') {
    report('unverified_source_image', source.rows, source.reason + '; pixels unverified. Inspect or supply the actual local image before claiming visual review.');
  }
  for (const rows of setups.values()) {
    if (rows.length < 2) continue;
    report('repeated_shot_setup', rows,
      'supplied actor, place, camera, composition, depth and opening-state fields recur; omitted fields remain unknown. Inspect actual images in playback order, including reverse shots between them. Intentional reverse shots are valid; matching plan fields do not establish identical pictures.');
  }
  return findings;
}

module.exports = { check };
