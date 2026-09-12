'use strict';
// TypeScript consumers use tts-speed-policy.d.ts; the bundled server and builders share this gate.
const fs = require('node:fs');
const path = require('node:path');

// The episode's explicit human request is the authority, never a channel default.
function authorizeSpeed(work, scope, factor) {
  if (!['generation', 'final'].includes(scope) || !Number.isFinite(factor) || factor < 0.5 || factor > 3) {
    throw new Error('Invalid TTS speed scope or factor');
  }
  if (factor === 1) return null;
  const file = path.resolve(work, 'speed-authorization.json');
  let record;
  try { record = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`TTS speed changes require an explicit user request: ${file}; use 1.0 otherwise`); }
  const approval = record?.version === 1 && Array.isArray(record.requests) && record.requests.find(a =>
    a?.source === 'explicit-user-request' && a.scope === scope && a.factor === factor &&
    typeof a.request === 'string' && a.request.trim().length >= 10 &&
    typeof a.requestedAt === 'string' && Number.isFinite(Date.parse(a.requestedAt)));
  if (!approval) throw new Error(`TTS speed changes require an explicit user request for ${scope} x${factor}; channel profiles and automatic pace corrections are not approval`);
  return { source: approval.source, scope, factor, request: approval.request, requestedAt: approval.requestedAt };
}
module.exports = { authorizeSpeed };
