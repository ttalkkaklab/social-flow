/* Synthetic raster fixture for contract tests, never an episode asset. */
const zlib = require('node:zlib');
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeSheet(cell = [4, 4], cols = 3, n = 3, frozen = false, alpha = 255) {
  const width = cell[0] * cols, height = cell[1] * Math.ceil(n / cols);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const frame = Math.floor(y / cell[1]) * cols + Math.floor(x / cell[0]);
    const at = y * (width * 4 + 1) + 1 + x * 4;
    raw[at] = frozen === 'tail' ? 30 + Math.min(frame, 1) * 13 : frozen ? 90 : 30 + frame * 13; raw[at + 1] = 80;
    raw[at + 2] = 100; raw[at + 3] = alpha;
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length);
    out.write(type, 4); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { makeSheet };
