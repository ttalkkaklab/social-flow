'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const preparer = path.join(__dirname, 'prepare-audience-texture.py');
const recipeFields = ['sourceStartSeconds', 'sourceDurationSeconds', 'grainSeconds', 'grainHopSamples',
  'grainRateRatios', 'seed', 'filter', 'durationSeconds'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function requireProof(condition, message) {
  if (!condition) throw new Error(message);
}
function regularFile(root, file) {
  const actual = fs.realpathSync(file);
  requireProof(actual.startsWith(root + path.sep) && fs.statSync(actual).isFile(), 'file outside its episode directory');
  return actual;
}
function readDerivation(episode, wav) {
  const receipt = wav.slice(0, -4) + '.source.json';
  if (!fs.lstatSync(receipt, { throwIfNoEntry: false })) return undefined;
  try {
    const root = fs.realpathSync(episode);
    const folder = path.join(root, '.work/music/audience');
    const out = regularFile(folder, wav);
    const sidecar = regularFile(folder, receipt);
    requireProof(sidecar === path.join(folder, path.basename(receipt)), 'receipt path must match the derivative');
    const record = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    const name = path.basename(wav);
    requireProof(path.dirname(out) === folder && path.basename(out) === name &&
      record.file === name && record.assetId === name.slice(0, -4), 'derivative filename mismatch');
    requireProof(record.recipeVersion === 1 && record.method === 'granular-time-stretch', 'unknown texture recipe');
    requireProof(record.scriptSha256 === sha256(fs.readFileSync(preparer)), 'packaged recipe hash mismatch');
    requireProof(typeof record.recipeJson === 'string' && record.recipeSha256 === sha256(record.recipeJson), 'recipe parameters hash mismatch');
    const declared = Object.fromEntries(recipeFields.map(key => [key, record[key]]));
    requireProof(recipeFields.every(key => Object.hasOwn(record, key)) &&
      isDeepStrictEqual(JSON.parse(record.recipeJson), declared), 'recipe parameters disagree');
    requireProof(record.sha256 === sha256(fs.readFileSync(out)), 'derivative WAV hash mismatch');
    requireProof(typeof record.source === 'string' && path.isAbsolute(record.source) &&
      !record.source.split(path.sep).includes('..'), 'invalid original path');
    const raw = regularFile(root, record.source);
    requireProof(raw !== out && path.extname(raw).toLowerCase() === '.wav', 'original must be a separate episode WAV');
    const stateFile = regularFile(path.join(root, '.work/music-routing'), path.join(episode, '.work/music-routing/state.json'));
    requireProof(stateFile === path.join(root, '.work/music-routing/state.json'), 'unexpected music state path');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    requireProof(!Object.values(state.jobs || {}).some(job => job?.outputFile === out), 'a generated output cannot also be a derivative');
    const job = Object.hasOwn(state.jobs || {}, record.musicRequestId) && state.jobs[record.musicRequestId];
    requireProof(job && job.status === 'completed' && job.requestId === record.musicRequestId &&
      typeof job.assetId === 'string' && typeof job.providerId === 'string' && job.providerId.length > 0 &&
      record.providerRequestId === job.providerId && job.result?.musicReceipt?.requestId === job.providerId,
    'original has no matching completed music request');
    const original = job.output, adapter = job.result.musicReceipt.output;
    requireProof(regularFile(root, job.outputFile) === raw && regularFile(root, original.audioPath) === raw &&
      regularFile(root, adapter.audioPath) === raw && adapter.sha256 === original.sha256 &&
      original.sha256 === record.sourceSha256 && sha256(fs.readFileSync(raw)) === record.sourceSha256,
    'original WAV or generation receipt mismatch');
    return { status: 'matched', method: record.method, receiptPath: receipt, sha256: record.sha256,
      sourceFile: raw, sourceSha256: record.sourceSha256, assetId: job.assetId, musicRequestId: job.requestId,
      providerRequestId: job.providerId, scriptSha256: record.scriptSha256, recipeSha256: record.recipeSha256 };
  } catch (error) {
    return { status: 'invalid', receiptPath: receipt, reason: error.message };
  }
}
module.exports = { readDerivation, preparer };
