#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkPath } = require('./check-scenario.js');
const { validate } = require('./review-localization.js');
const { version } = require('../../../.claude-plugin/plugin.json');

const documents = new Set(['scenario.md', 'storyboard.md', 'script.md', 'review-localization.json']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function readDocument(file) {
  const info = fs.lstatSync(file, {throwIfNoEntry:false});
  if (!info) return {sha256:null, mode:0o644};
  if (!info.isFile()) throw Error('Expected a regular file: ' + file);
  return {sha256:digest(fs.readFileSync(file)), mode:info.mode & 0o777};
}

function prepare(directory, request) {
  if (!request || !validHash(request.expectedStoryboardSha256) || !Array.isArray(request.documents) || !request.documents.length)
    throw Error('Supply expectedStoryboardSha256 and at least one document');
  const boardSha256 = readDocument(path.join(directory, 'scenes.js')).sha256;
  if (boardSha256 !== request.expectedStoryboardSha256) throw Error('head_moved: reread the storyboard');
  const seen = new Set(), warnings = [];
  const rows = request.documents.map(doc => {
    if (!doc || !documents.has(doc.name) || seen.has(doc.name)) throw Error('Unknown or duplicate document name');
    seen.add(doc.name);
    if ((!validHash(doc.expectedSha256) && doc.expectedSha256 !== null) || typeof doc.content !== 'string' || !doc.content.trim() || doc.content.includes('\0'))
      throw Error(doc.name + ' needs nonempty text and expectedSha256 (null for a new file)');
    const file = path.join(directory, doc.name), before = readDocument(file), afterSha256 = digest(doc.content);
    if (before.sha256 !== afterSha256 && before.sha256 !== doc.expectedSha256)
      throw Error('head_moved: reread ' + doc.name);
    if (doc.name === 'scenario.md') {
      const checked = checkPath(file, {authoring:true, source:doc.content});
      if (checked.violations) throw Error(checked.findings.filter(f => f.level === 'bad').map(f => f.what).join('\n'));
      warnings.push(...checked.findings);
    }
    if (doc.name === 'review-localization.json') validate(JSON.parse(doc.content));
    return {name:doc.name, file, beforeSha256:before.sha256, afterSha256, mode:before.mode, content:doc.content};
  });
  return {boardSha256, warnings, rows};
}

function writeChanges(directory, changed) {
  const staging = fs.mkdtempSync(path.join(directory, '.story-documents-'));
  const committed = [];
  try {
    for (const row of changed) {
      const staged = path.join(staging, row.name);
      if (row.beforeSha256 !== null) fs.copyFileSync(row.file, staged + '.before', fs.constants.COPYFILE_FICLONE);
      fs.writeFileSync(staged, row.content, {mode:row.mode});
      if (row.beforeSha256 !== null) fs.chmodSync(staged, row.mode);
    }
    for (const row of changed) {
      fs.renameSync(path.join(staging, row.name), row.file);
      committed.push(row);
    }
  } catch (error) {
    for (const row of committed.reverse()) {
      if (row.beforeSha256 === null) fs.unlinkSync(row.file);
      else fs.renameSync(path.join(staging, row.name + '.before'), row.file);
    }
    throw error;
  } finally {
    fs.rmSync(staging, {recursive:true, force:true});
  }
}

function runLocked(directory, dryRun) {
  try {
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    const {boardSha256, warnings, rows} = prepare(directory, request);
    const changed = rows.filter(row => row.beforeSha256 !== row.afterSha256);
    if (!dryRun && changed.length) writeChanges(directory, changed);
    const files = rows.map(({file, beforeSha256, afterSha256}) => ({
      path:file, beforeSha256, afterSha256,
      status:beforeSha256 === afterSha256 ? 'current' : dryRun ? 'wouldWrite' : 'written',
    }));
    process.stdout.write(JSON.stringify({pluginVersion:version, boardSha256, dryRun, files, warnings}) + '\n');
  } catch (error) {
    fail(error);
  }
}

function fail(error) {
  process.stderr.write(JSON.stringify({error:error.message}) + '\n');
  process.exitCode = 1;
}

if (require.main === module) {
  try {
    const [board, input, option, ...extra] = process.argv.slice(2);
    if (!board || !input || (option !== undefined && option !== '--dry-run') || extra.length)
      throw Error('Usage: revise-story-documents.js <storyboard directory> <request.json|-> [--dry-run]');
    const directory = fs.realpathSync(board);
    if (path.basename(directory) !== 'storyboard' || !fs.statSync(directory).isDirectory())
      throw Error('Supply the canonical episode storyboard directory');
    const bytes = fs.readFileSync(input === '-' ? 0 : input);
    // Hold the same directory flock as storyboard_apply throughout validation and rename.
    // The inherited descriptor closes automatically if the process is interrupted.
    const lock = [
      'import fcntl, os, sys',
      'directory = os.open(sys.argv[1], os.O_RDONLY)',
      'fcntl.flock(directory, fcntl.LOCK_EX)',
      'os.set_inheritable(directory, True)',
      'os.execv(sys.argv[2], sys.argv[2:])',
    ].join('\n');
    const entry = 'require(process.argv[1]).runLocked(process.argv[2], process.argv[3] === "preview")';
    const child = spawnSync('python3', ['-c',lock,directory,process.execPath,'-e',entry,__filename,directory,option ? 'preview' : 'write'],
      {input:bytes, stdio:['pipe','inherit','inherit']});
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  } catch (error) {
    fail(error);
  }
}
module.exports = {prepare, runLocked};
