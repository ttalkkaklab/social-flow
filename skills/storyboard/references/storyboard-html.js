#!/usr/bin/env node
'use strict';

// Refresh the shared review shell without changing the episode's editorial metadata.
const fs = require('node:fs');
const path = require('node:path');

const HELPERS = ['source-context.js', 'render-routing.js', 'motion-graphics.js', 'production-mode.js', 'structure-contract.js', 'style-samples.js', 'film-techniques.js', 'shot-direction.js', 'review-layout.js', 'prop-continuity.js', 'prop-sheet.js', 'location-contract.js', 'location-review-runtime.js', 'location-review.css'];
const REVIEW_ASSETS = path.join(__dirname, '..', '..', 'channel', 'references', 'review-assets');
const { FONT_ASSETS } = require('../../channel/references/review-fonts.js');
const ASSETS = ['review.css', ...FONT_ASSETS];
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

function storyboardHtml(directory, check = false) {
  const dir = path.resolve(directory);
  const target = path.join(dir, 'storyboard.html');
  const template = fs.readFileSync(path.join(__dirname, 'storyboard-html-template.html'), 'utf8');
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const html = current === null ? template : refreshHtml(template, current);
  const available = ['storyboard.md', 'script.md', 'research.md', 'scenes.js'].filter(name => fs.existsSync(path.join(dir, name)));
  const win = fs.existsSync(path.join(dir, 'scenes.js')) ? require('../../autoproduce/references/cost-preview.js').readScenes(path.join(dir, 'scenes.js')) : null;
  const locationData = win ? require('./location-assets.js').preview(win, dir) : [];
  const portraits = {};
  const typeLabels = Object.fromEntries(require('../../_shared/video-types.json').types.map(type => [type.id, type.label]));
  const characters = win?.SB_DOC?.characters || [];
  const ids = Array.isArray(characters) ? characters.map(c => c?.id) : Object.keys(characters);
  for (const id of ids) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
    const face = '../../../assets/characters/' + id + '/face.png';
    if (fs.existsSync(path.resolve(dir, face))) portraits[id] = face;
  }
  const panelFindings = win ? require('../../channel/references/character-panels.js').boardPanelFindings(win, dir, path.resolve(dir, '../../..')) : [];
  const reviewData = 'window.REVIEW_PANEL_FINDINGS = ' + JSON.stringify(panelFindings).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_FILES = ' + JSON.stringify(available) + ';\n' +
    'window.REVIEW_CHARACTER_PORTRAITS = ' + JSON.stringify(portraits).replace(/</g, '\\u003c') + ';\n' +
    'window.REVIEW_VIDEO_TYPES = ' + JSON.stringify(typeLabels).replace(/</g, '\\u003c') + ';\n';
  const catalogue = require('./film-techniques.js');
  const files = [['film-techniques.json', JSON.stringify({version:catalogue.VERSION, entries:catalogue.entries}, null, 2) + '\n'], ['location-review-data.js', 'window.LOCATION_REVIEW = ' + JSON.stringify(locationData).replace(/</g, '\\u003c') + ';\n'], ['storyboard.html', html], ['review-files.js', reviewData], ...HELPERS.map(name => [name, fs.readFileSync(path.join(__dirname, name))]),
    ...ASSETS.map(name => [name, fs.readFileSync(path.join(REVIEW_ASSETS, name))])];
  const changed = files.filter(([name, content]) => {
    const file = path.join(dir, name);
    return !fs.existsSync(file) || !fs.readFileSync(file).equals(Buffer.from(content));
  });
  if (check) return changed.map(([name]) => name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of changed) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return changed.map(([name]) => name);
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
