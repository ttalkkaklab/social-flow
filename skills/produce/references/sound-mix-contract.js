'use strict';

// Shared by the storyboard checker and sound manifest compiler. Bounds are inclusive.
const MIX_FIELDS = [
  ['targetLufs', 'FINAL_LUFS', -30, -5, -14],
  ['truePeakDbtp', 'FINAL_TP', -6, 0, -1],
  ['bedSeparationLu', 'BGM_SEP', 0, 30, 10],
  ['minimumSeparationLu', 'BGM_SEP_MIN', 0, 30, 4],
  ['ambienceSeparationLu', 'AMB_SEP', 0, 30, 15],
  ['cueCrossfadeSeconds', 'BGM_CUE_XF', 0, 10, 2],
  ['endingFadeSeconds', 'BGM_FADE_OUT', 0, 10, 2.2],
  ['silenceRampSeconds', 'BGM_GATE_R', 0, 3, 0.3],
  ['hook.attenuationLu', 'BGM_HOOK_LU', 0, 30, 6],
  ['hook.releaseSeconds', 'BGM_HOOK_R', 0, 10, 2],
  ['ducking.ratio', 'DUCK_RATIO', 1, 20, 8],
  ['ducking.attackMs', 'DUCK_ATTACK', 1, 1000, 20],
  ['ducking.releaseMs', 'DUCK_RELEASE', 10, 3000, 250],
  ['ducking.threshold', 'DUCK_THRESHOLD', 0.001, 1, 0.02],
  ['ducking.mix', 'DUCK_MIX', 0, 1, 1],
  ['ducking.lookaheadMs', 'DUCK_LOOKAHEAD', 0, 500, 0],
];
const valueAt = (mix, field) => field.split('.').reduce((value, key) => value?.[key], mix);
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

function mixFindings(mix) {
  if (mix === undefined) return [];
  if (!isRecord(mix)) return ['mix settings are an object'];
  const findings = [];
  for (const [key, shape] of [['hook', 'attenuationLu, releaseSeconds'], ['ducking', 'ratio, attackMs, releaseMs']]) {
    if (mix[key] !== undefined && !isRecord(mix[key])) findings.push(`${key} is { ${shape} }`);
  }
  for (const [field, , min, max] of MIX_FIELDS) {
    const value = valueAt(mix, field);
    if (value === undefined) continue;
    if ((typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) ||
        !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) {
      findings.push(`${field} ${JSON.stringify(value)} — expected ${min}–${max}`);
    } else if (field.endsWith('Seconds') && Number(Number(value).toFixed(3)) !== Number(value)) {
      findings.push(`${field} ${JSON.stringify(value)} — expected whole milliseconds (at most 3 decimal places)`);
    }
  }
  if (Number(mix.minimumSeparationLu) > Number(mix.bedSeparationLu))
    findings.push('minimumSeparationLu is wider than bedSeparationLu — the floor must not exceed the resting target');
  return findings;
}

function mixEnvironment(mix = {}) {
  const errors = mixFindings(mix);
  if (errors.length) throw new Error(errors.join('; '));
  return MIX_FIELDS.flatMap(([field, env]) => {
    const value = valueAt(mix, field);
    return value === undefined ? [] : [`: "\${${env}:=${Number(value)}}"`];
  });
}

// Authored gain is relative to the measured bed; it resets at each shot boundary.
function musicEnvelopeFindings(points, duration, type) {
  if (points === undefined) return [];
  if (!Array.isArray(points) || !points.length) return ['sound.musicGain must be a nonempty array of { atSeconds, gainDb }'];
  const findings = [];
  if (type === 'broll' || type === 'outro') findings.push('sound.musicGain requires a narrated card');
  let previous = -1;
  for (const point of points) {
    const t = point?.atSeconds, gain = point?.gainDb;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t <= previous ||
        (Number.isFinite(Number(duration)) && t > Number(duration)) || Number(t.toFixed(3)) !== t)
      findings.push('musicGain times must increase, use whole milliseconds and fit inside the shot');
    if (typeof gain !== 'number' || !Number.isFinite(gain) || gain < -60 || gain > 12)
      findings.push('musicGain gainDb must be between -60 and 12');
    previous = t;
  }
  if (points[0]?.atSeconds !== 0) findings.push('musicGain must start at 0 seconds');
  return findings;
}

function musicEnvelopeFilter(rows) {
  if (!rows.length) return '';
  const terms = rows.map(([start, end, points]) => {
    const errors = musicEnvelopeFindings(points, end - start);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || errors.length)
      throw new Error(errors.join('; ') || 'Invalid music envelope span');
    let db = String(points.at(-1).gainDb);
    for (let i = points.length - 2; i >= 0; i--) {
      const a = points[i], b = points[i + 1];
      db = `if(lt(t,${start + b.atSeconds}),${a.gainDb}+(${b.gainDb - a.gainDb})*(t-${start + a.atSeconds})/${b.atSeconds - a.atSeconds},${db})`;
    }
    return `if(gte(t,${start})*lt(t,${end}),${db},0)`;
  });
  return `volume=eval=frame:volume='pow(10,(${terms.join('+')})/20)',`;
}

module.exports = { MIX_FIELDS, mixFindings, mixEnvironment, musicEnvelopeFindings, musicEnvelopeFilter };
if (require.main === module) {
  const fs = require('fs');
  const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean)
    .map(line => { const [start, end, points] = line.split('\t'); return [Number(start), Number(end), JSON.parse(points)]; });
  process.stdout.write(musicEnvelopeFilter(rows));
}
