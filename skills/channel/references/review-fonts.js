'use strict';

// One asset contract for standalone boards and the channel library.
const manifest = require('./review-assets/fonts/manifest.json');
const FONT_ASSETS = [
  'typography-faces.css', 'review-typography.css', 'review-typography.js',
  'fonts/manifest.json',
  ...manifest.fonts.flatMap(font => ['fonts/' + font.file, 'fonts/' + font.license.file]),
];

module.exports = { FONT_ASSETS };
