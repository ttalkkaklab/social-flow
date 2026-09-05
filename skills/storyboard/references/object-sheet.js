/* PNG sheet preflight for the RGBA/RGB, 8-bit, non-interlaced output of local bakers. */
const fs = require('node:fs');
const zlib = require('node:zlib');
function decodePNG(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    throw new Error('object sheet must be PNG');
  let width, height, channels, ended = false;
  const chunks = [];
  for (let pos = 8; pos + 12 <= buffer.length;) {
    const size = buffer.readUInt32BE(pos), type = buffer.toString('ascii', pos + 4, pos + 8);
    if (pos + size + 12 > buffer.length) throw new Error('truncated PNG chunk');
    const data = buffer.subarray(pos + 8, pos + 8 + size);
    if (type === 'IHDR') {
      if (size !== 13 || width !== undefined) throw new Error('invalid PNG header');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (data[8] !== 8 || !channels || data[10] || data[11] || data[12])
        throw new Error('bake sheet as 8-bit RGB/RGBA non-interlaced PNG');
      if (!width || !height || width * height > 100000000) throw new Error('invalid/oversized PNG');
    } else if (type === 'acTL') throw new Error('animated PNG is not a seekable sheet');
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') { ended = true; break; }
    pos += size + 12;
  }
  if (!ended || !width || !chunks.length) throw new Error('incomplete PNG');
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw new Error('wrong PNG data length');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= channels ? pixels[at - channels] : 0;
      const b = y ? pixels[at - stride] : 0;
      const c = y && x >= channels ? pixels[at - stride - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b
        : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      pixels[at] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function checkObjectSheet(meta, filename) {
  const { cell, cols, n, ranges } = meta;
  const positive = v => Number.isInteger(v) && v > 0;
  if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(positive) || !positive(cols) || !positive(n) || n < 2)
    throw new Error('invalid sheet cell/cols/n');
  const png = decodePNG(fs.readFileSync(filename));
  if (png.width !== cell[0] * cols || png.height !== cell[1] * Math.ceil(n / cols))
    throw new Error('sheet dimensions disagree with sidecar');
  if (!ranges || !Object.keys(ranges).length) throw new Error('sheet has no group ranges');
  const sample = index => {
    // Full cell, composited over ink. Invisible RGB does not count as a change.
    const out = Buffer.alloc(cell[0] * cell[1] * 3);
    for (let y = 0; y < cell[1]; y++) for (let x = 0; x < cell[0]; x++) {
      const at = ((Math.floor(index / cols) * cell[1] + y) * png.width + index % cols * cell[0] + x) * png.channels;
      const alpha = png.channels === 4 ? png.pixels[at + 3] / 255 : 1;
      for (let k = 0; k < 3; k++) out[(y * cell[0] + x) * 3 + k] =
        Math.round(png.pixels[at + k] * alpha + [19, 34, 56][k] * (1 - alpha));
    }
    return out;
  };
  let previous = 0;
  for (const [group, bounds] of Object.entries(ranges).sort((a, b) => +a[0] - +b[0])) {
    if (!positive(+group) || !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(Number.isInteger) ||
        bounds[0] !== previous || bounds[0] < 0 || bounds[0] >= bounds[1] || bounds[1] >= n)
      throw new Error(`group ${group}: invalid or discontinuous frame range`);
    let last = sample(bounds[0]);
    let changed = 0;
    for (let i = bounds[0] + 1; i <= bounds[1]; i++) {
      const next = sample(i);
      if (!last.equals(next)) changed++;
      last = next;
    }
    if (changed < Math.max(1, Math.ceil((bounds[1] - bounds[0]) * .5)))
      throw new Error(`group ${group}: frozen/repeated object frames (${changed} changed)`);
    previous = bounds[1];
  }
  if (previous !== n - 1) throw new Error('ranges do not cover complete sheet');
  return { groups: Object.keys(ranges).length, frames: n, pixelChange: 'pass', visualReview: 'required' };
}
module.exports = { decodePNG, checkObjectSheet };
