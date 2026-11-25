#!/usr/bin/env node
'use strict';

// Refresh the shared review shell without changing the episode's editorial metadata.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const HELPERS = ['video-production.js', 'source-context.js', 'render-routing.js', 'motion-graphics.js', 'production-mode.js', 'structure-contract.js', 'style-samples.js', 'film-techniques.js', 'shot-direction.js', 'scene-direction.js', 'review-layout.js', 'prop-continuity.js', 'prop-sheet.js', 'location-contract.js', 'location-review-runtime.js', 'location-review.css'];
const REVIEW_ASSETS = path.join(__dirname, '..', '..', 'channel', 'references', 'review-assets');
const { FONT_ASSETS } = require('../../channel/references/review-fonts.js');
const ASSETS = ['design-system.css', 'review.css', 'ttalkkak-story.svg', ...FONT_ASSETS];
HELPERS.push('review-localization.js', 'audience-spotting.js', 'score-player.js');
const TITLE = /<title>[^]*?<\/title>/g;
const METADATA = /\/\* ✎ SB_DOC BEGIN[^]*?\/\* ✎ SB_DOC END \*\//g;

function editable(html, pattern, label) {
  const markup = html.replace(/<!--[^]*?-->/g, comment => ' '.repeat(comment.length));
  const matches = Array.from(markup.matchAll(pattern));
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label}; existing HTML was not changed.`);
  const start = matches[0].index;
  const end = start + matches[0][0].length;
  return { start, end, text: html.slice(start, end) };
}

function replaceEditable(html, pattern, label, value) {
  const { start, end } = editable(html, pattern, label);
  return html.slice(0, start) + value + html.slice(end);
}

function refreshHtml(template, current) {
  const title = editable(current, TITLE, '<title>').text;
  const metadata = editable(current, METADATA, 'SB_DOC block').text;
  const titled = replaceEditable(template, TITLE, 'template <title>', title);
  return replaceEditable(titled, METADATA, 'template SB_DOC block', metadata);
}

// Each background sheet's own built set (SB_DOC.locations[].manifest), with its angle sheet, paths relative to the board.
function locationSheets(win, dir) {
  const L = require('./location-assets.js');
  const relative = file => path.relative(dir, file).split(path.sep).join('/');
  return (win.SB_DOC?.locations || []).filter(e => typeof e?.manifest === 'string' && /^[^/\\:]/.test(e.manifest) && fs.existsSync(path.resolve(dir, e.manifest)))
    .map(e => {
      const v = { ...L.sheetView(path.resolve(dir, e.manifest)), id: e.id, shotId: 'sheet-' + e.id };
      return v.error ? v : { ...v, glb: relative(v.glb), frames: Object.fromEntries(Object.entries(v.frames).map(([k, f]) => [k, { ...f, path: relative(f.path) }])) };
    });
}

function storyboardHtml(directory, check = false) {
  const dir = path.resolve(directory);
  const target = path.join(dir, 'storyboard.html');
  const template = fs.readFileSync(path.join(__dirname, 'storyboard-html-template.html'), 'utf8');
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const html = current === null ? template : refreshHtml(template, current);
  const available = ['storyboard.md', 'script.md', 'research.md', 'scenes.js'].filter(name => fs.existsSync(path.join(dir, name)));
  const win = fs.existsSync(path.join(dir, 'scenes.js')) ? require('../../autoproduce/references/cost-preview.js').readScenes(path.join(dir, 'scenes.js')) : null;
  let openingReview = {status: 'not_reviewed'};
  if (fs.existsSync(path.join(dir, 'opening-review.json'))) {
    const bundle = path.resolve(__dirname, '../../../server/dist/bundle.js');
    const summary = execFileSync(process.execPath, [bundle, '--opening-review-summary', dir], {encoding: 'utf8'});
    openingReview = JSON.parse(summary);
    if (win && ['pass', 'high', 'limit_reached'].includes(openingReview.status)) {
      // An offline reader may open an older export beside a newly edited scenes.js.
      const keys = ['STORY', 'FORMAT', 'STRUCTURE', 'SCENES', 'COMPREHENSION', 'PRODUCTION', 'THEME'];
      const digest = createHash('sha256').update(JSON.stringify(keys.map(key => win[key]))).digest('hex');
      openingReview.exportSource = {keys, digest};
    }
  }
  const locationData = win ? [...locationSheets(win, dir), ...require('./location-assets.js').preview(win, dir)] : [];
  // file:// pages cannot fetch a GLB, so the data file carries each set's bytes, keyed by the path an entry names.
  const glbs = {};
  for (const v of locationData) if (v.glb && !glbs[v.glb]) glbs[v.glb] = fs.readFileSync(path.resolve(dir, v.glb)).toString('base64');
  const locationLinks=Object.fromEntries((win?.SB_DOC?.locations||[]).map(e=>[e.id,'../../../assets/locations/details/'+require('./location-assets.js').detailFilename(path.basename(path.dirname(dir)),e.id)]));
  const portraits = {};
  const typeLabels = Object.fromEntries(require('../../_shared/video-types.json').types.map(type => [type.id, type.label]));
  const hookLabels = Object.fromEntries(require('./opening-hook-types.json').map(({id, en, ko}) => [id, {en, ko}]));
  const characters = win?.SB_DOC?.characters || [];
  const ids = Array.isArray(characters) ? characters.map(c => c?.id) : Object.keys(characters);
  for (const id of ids) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
    const face = '../../../assets/characters/' + id + '/face.png';
    if (fs.existsSync(path.resolve(dir, face))) portraits[id] = face;
  }
  // The episode's saved video selection, which video_plan resolves shots against; the review cannot read it from file://.
  let videoSnapshot = null;
  try { videoSnapshot = JSON.parse(fs.readFileSync(path.join(dir, '..', '.work', 'model-settings.json'), 'utf8')).config.models.video || null; } catch { /* none */ }
  const panelFindings = win ? require('../../channel/references/character-panels.js').boardPanelFindings(win, dir, path.resolve(dir, '../../..')) : [];
  const translationFile = path.join(dir, 'review-localization.json');
  const translations = fs.existsSync(translationFile)
    ? require('./review-localization.js').validate(JSON.parse(fs.readFileSync(translationFile, 'utf8'))) : null;
  const previews = require('./audience-review-data.js').exportData(win || {}, dir, check);
  const videoAdapters = require('../../_shared/video-catalog.json').adapters.map(({engine, tool, operation, modelConstraints}) => ({
    engine, tool, operation,
    ...(tool === 'seedance_reference' ? { referenceLimits: Object.fromEntries(Object.entries(modelConstraints).map(([id, spec]) => [id, spec.referenceImages[1]])) } : {}),
    ...(tool === 'seedance_img2video' ? { modelConstraints } : {}),
    ...(tool === 'veo_reference' ? { assetLimits: Object.fromEntries(Object.entries(modelConstraints).map(([model, spec]) => [model, spec.maxAssetImages])) } : {}),
  }));
  const reviewData = 'window.REVIEW_LOCALIZATION = ' + JSON.stringify(translations).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_HOOK_LABELS = ' + JSON.stringify(hookLabels).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_OPENING = ' + JSON.stringify(openingReview).replace(/</g, '\\u003c') + ';\n' +
    'window.LOCATION_DETAIL_LINKS = '+JSON.stringify(locationLinks).replace(/</g,'\\u003c')+';\n' +
    'window.REVIEW_PANEL_FINDINGS = ' + JSON.stringify(panelFindings).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_FILES = ' + JSON.stringify(available) + ';\n' +
    'window.REVIEW_VIDEO_ADAPTERS = ' + JSON.stringify(videoAdapters) + ';\n' +
    'window.REVIEW_VIDEO_SNAPSHOT = ' + JSON.stringify(videoSnapshot).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_CHARACTER_PORTRAITS = ' + JSON.stringify(portraits).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_VIDEO_TYPES = ' + JSON.stringify(typeLabels).replace(/</g, '\\u003c') + ';\n';
  const catalogue = require('./film-techniques.js');
  const production = require('./video-production.js').read(dir, win || {});
  const files = [['audience-review-data.js', previews.content], ['video-production-data.js', 'window.VIDEO_PRODUCTION = ' + JSON.stringify(production).replace(/</g, '\\u003c') + ';\n'], ['film-techniques.json', JSON.stringify({version:catalogue.VERSION, entries:catalogue.entries}, null, 2) + '\n'], ['location-review-data.js', 'window.LOCATION_REVIEW = ' + JSON.stringify(locationData).replace(/</g, '\\u003c') + ';\nwindow.LOCATION_GLB = ' + JSON.stringify(glbs) + ';\n'], ['storyboard.html', html], ['review-files.js', reviewData], ...HELPERS.map(name => [name, fs.readFileSync(path.join(__dirname, name))]),
    ...ASSETS.map(name => [name, fs.readFileSync(path.join(REVIEW_ASSETS, name))])];
  const changed = files.filter(([name, content]) => {
    const file = path.join(dir, name);
    return !fs.existsSync(file) || !fs.readFileSync(file).equals(Buffer.from(content));
  });
  if (check) return [...previews.changed, ...changed.map(([name]) => name)];
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of changed) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return [...previews.changed, ...changed.map(([name]) => name)];
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (!args[0] || args[0].startsWith('--') || args.length > 2 || (args[1] && args[1] !== '--check')) {
      throw new Error('Usage: storyboard-html.js <storyboard directory> [--check]');
    }
    const check = args[1] === '--check';
    const changed = storyboardHtml(args[0], check);
    console.log(check
      ? changed.length ? `FAIL — refresh shared design: ${changed.join(', ')}` : 'PASS — shared storyboard template and helpers match'
      : `Storyboard HTML ready${changed.length ? ` — updated ${changed.join(', ')}` : ' — already current'}`);
    // Canonical episode layout: refresh the offline library in the same operation.
    const directory = path.resolve(args[0]);
    if (path.basename(directory) === 'storyboard' && path.basename(path.dirname(path.dirname(directory))) === 'episodes') {
      const { exportChannel } = require('../../channel/references/review-library.js');
      const result = exportChannel(path.resolve(directory, '../../..'), { check });
      console.log(`Library: ${result.characters} characters, ${result.episodes} episodes, ${result.changed.length} changed files`);
      for (const warning of result.structuralWarnings) console.warn('Library structure: ' + warning);
      for (const warning of result.contentWarnings) console.warn('Content readiness [' + warning.domain + ']: ' + warning.message);
      if (result.contentWarnings.length) console.warn('Design check does not certify content readiness; identity/voice/image findings guide the next review without blocking authoring.');
      if (check && (result.changed.length || result.structuralWarnings.length)) process.exitCode = 1;
    }
    if (check && changed.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { storyboardHtml, refreshHtml };
