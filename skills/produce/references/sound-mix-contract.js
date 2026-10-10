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

module.exports = { MIX_FIELDS, mixFindings, mixEnvironment };
