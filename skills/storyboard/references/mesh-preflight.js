/* File checks are separate from the browser-safe recipe contract. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const {checkRecipe} = require('./mesh-contract.js');
function readGLB(file) {
  const b = fs.readFileSync(file);
  if (b.length < 20 || b.toString('ascii',0,4) !== 'glTF' || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length)
    throw new Error('invalid GLB header');
  const length = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a || length > b.length-20) throw new Error('invalid GLB JSON chunk');
  const json = JSON.parse(b.toString('utf8',20,20+length));
  if ([...(json.buffers || []), ...(json.images || [])].some(v => v.uri)) throw new Error('GLB must embed all buffers and textures');
  if ((json.extensionsRequired || []).some(x => ['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))
    throw new Error('compressed GLB needs offline decoders; export uncompressed embedded GLB');
  return json;
}
/* The recipe and its GLBs — shared by the browser mesh lane and the Blender bake (blender-objects.md). */
function checkRecipeFiles(dir, scene) {
  const errors = [], ob = scene.visual.slide.object;
  try {
    const filename = path.resolve(dir, ob.file);
    if (!filename.startsWith(path.resolve(dir, 'slides/assets') + path.sep)) throw new Error('mesh recipe outside slides/assets');
    const recipe = JSON.parse(fs.readFileSync(filename, 'utf8'));
    errors.push(...checkRecipe(recipe, (scene.narration || []).length));
    if (recipe.style !== ob.style) errors.push('mesh recipe style differs from scenes.js');
    if (!errors.length) for (const node of recipe.nodes) if (node.source) {
      const source = path.resolve(path.dirname(filename), node.source);
      if (!fs.realpathSync(source).startsWith(fs.realpathSync(path.dirname(filename)) + path.sep)) throw new Error('GLB symlink escapes assets');
      readGLB(source);
    }
    if (ob.renderer === 'blender' && recipe.states.some(s => s && s.clips && Object.keys(s.clips).length))
      errors.push('the Blender bake does not play GLB clips; pose the parts with bindings or use renderer mesh');
  } catch (e) { errors.push(`mesh preflight: ${e.message}`); }
  return errors;
}
function checkMesh(dir, scene, code) {
  const errors = checkRecipeFiles(dir, scene), ob = scene.visual.slide.object;
  try {
    const runtime = path.join(dir, 'slides/assets/mesh-runtime.js');
    const digest = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    if (digest(runtime) !== digest(path.join(__dirname,'mesh-runtime.js'))) errors.push('mesh-runtime.js differs from the plugin; copy the bundled runtime');
    if (!/<script\b[^>]*\bsrc=["']assets\/mesh-runtime\.js["']/.test(code)) errors.push('mesh slide must include assets/mesh-runtime.js before its main script');
    const id = path.basename(ob.file, '.json').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The bundled template derives the id from scenes.js instead of writing it out, so both shapes pass.
    if (!new RegExp('\\bh\\.object\\(\\s*\\d+\\s*,\\s*(?:["\']' + id + '["\']|S\\.visual\\.slide\\.object\\.file\\b)').test(code))
      errors.push('mesh recipe must be placed with h.object and its file id');
  } catch (e) { errors.push(`mesh preflight: ${e.message}`); }
  return errors;
}
module.exports = {checkMesh, checkRecipeFiles, readGLB};
