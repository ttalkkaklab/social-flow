#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const references = path.resolve(__dirname, '../../storyboard/references');
const routing = require(path.join(references, 'render-routing.js'));
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";

function checkTarget(file, directory = false) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))
    throw new Error('refusing a symlink or incompatible output: ' + file);
}

function prepare(board, shot, { templateRoot = references } = {}) {
  if (!Number.isSafeInteger(shot) || shot < 1) throw new Error('--shot must be a positive one-based integer');
  const root = fs.realpathSync(board), source = path.join(root, 'scenes.js');
  const win = evaluateWindowScript(fs.readFileSync(source, 'utf8'), { filename: source });
  const scene = win.SCENES?.[shot - 1];
  if (!scene || scene.shot?.render?.mode !== 'data_graph') throw new Error('selected shot must use data_graph');
  if (!Number.isFinite(scene.duration) || scene.duration <= 0) throw new Error('shot duration must be positive and finite');
  const advice = [];
  const errors = routing.checkScene(scene, { format: win.FORMAT, production: win.PRODUCTION, advice });
  if (errors.length) throw new Error('invalid data graph: ' + errors.join('; '));
  const registered = scene.visual?.slide?.file;
  // The unchanged shared template imports ../scenes.js and assets/*.js. A direct
  // child of slides preserves those imports without copying or rewriting the board.
  if (typeof registered !== 'string' || !/^slides\/[^/\\]+\.html$/.test(registered))
    throw new Error('visual.slide.file must be a direct HTML file under board/slides');
  const slides = path.join(root, 'slides'), assets = path.join(slides, 'assets');
  const file = path.resolve(root, registered);
  checkTarget(slides, true); checkTarget(assets, true);
  const template = fs.readFileSync(path.join(templateRoot, 'chart-slide-template.html'), 'utf8');
  if ((template.match(/const SLIDE_SHOT = 1;/g) || []).length !== 1)
    throw new Error('shared chart template must contain exactly one SLIDE_SHOT placeholder');
  const outputs = [
    [file, template.replace('const SLIDE_SHOT = 1;', `const SLIDE_SHOT = ${shot};`)],
    ...['chart-runtime.js', 'render-routing.js'].map(name => [path.join(assets, name), fs.readFileSync(path.join(templateRoot, name))]),
  ];
  // Validate and read everything before the first write; refresh tracked copies on
  // every call so a previous generated HTML file cannot hide a runtime fix.
  for (const [target] of outputs) checkTarget(target);
  fs.mkdirSync(assets, { recursive: true });
  for (const [target, bytes] of outputs) fs.writeFileSync(target, bytes);
  const out = path.join(root, '.work', `chart-shot-${shot}`);
  const renderArgs = [path.join(__dirname, 'render-motion-slide.mjs'), file, '--out', out, '--grain', '0'];
  return { shot, file, files: outputs.map(([target]) => target), advice,
    renderArgs: ['node', ...renderArgs], renderCommand: ['node', ...renderArgs.map(quote)].join(' ') };
}
module.exports = { prepare };
if (require.main === module) {
  try {
    const [board, flag, raw, ...rest] = process.argv.slice(2);
    if (!board || flag !== '--shot' || !raw || rest.length || !/^\d+$/.test(raw))
      throw new Error('usage: prepare-chart-slide.js <board> --shot N');
    console.log(JSON.stringify(prepare(board, Number(raw)), null, 2));
  } catch (error) { console.error('prepare-chart-slide: ' + error.message); process.exitCode = 1; }
}
