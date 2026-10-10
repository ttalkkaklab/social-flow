#!/usr/bin/env node
'use strict';

// Refresh the shared review shell without changing the episode's editorial metadata.
const fs = require('node:fs');
const path = require('node:path');

const HELPERS = ['render-routing.js', 'production-mode.js', 'structure-contract.js', 'style-samples.js'];
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
  const files = [['storyboard.html', html], ...HELPERS.map(name => [name, fs.readFileSync(path.join(__dirname, name), 'utf8')])];
  const changed = files.filter(([name, content]) => {
    const file = path.join(dir, name);
    return !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content;
  });
  if (check) return changed.map(([name]) => name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of changed) fs.writeFileSync(path.join(dir, name), content);
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
    if (check && changed.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { storyboardHtml, refreshHtml };
