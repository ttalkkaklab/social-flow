/* Scene decisions and audience cue coverage on the authored edit. */
(function (root) {
  'use strict';
  function cueStatus(shotId, effect, row) {
    const matches = row && row.shotId === shotId && row.id === effect.id && row.atSeconds === effect.atSeconds &&
      row.sfx === effect.sfx && row.trigger === effect.trigger && row.placedTimingBasis === effect.audience.timingBasis &&
      row.end?.shotId === effect.end?.shotId && row.end?.atSeconds === effect.end?.atSeconds;
    return matches ? row.status : effect.atSeconds == null ? 'planned' : 'timing_unchecked';
  }
  // Reads the editorial plan only. Supply verified rows from a detailed board read to report current timing.
  function spotting(board, rows = []) {
    const marked = board.STORY?.audienceSoundVersion === 1;
    const structure = board.STRUCTURE?.scenes;
    const scenes = (Array.isArray(structure) ? structure : []).filter(scene => scene && typeof scene === 'object').map(scene => ({
      no: scene.no, decision: scene.audienceSound?.decision ?? (marked ? 'undecided' : 'unrecorded'),
      ...(scene.audienceSound?.reason ? { reason: scene.audienceSound.reason } : {}), cues: [], needsCue: false,
    }));
    const byScene = new Map(scenes.map(scene => [scene.no, scene]));
    const shots = Array.isArray(board.SCENES) ? board.SCENES : [];
    const positions = new Map(shots.map((shot, i) => [shot?.id, i]));
    const checked = new Map(rows.map(row => [JSON.stringify([row.shotId, row.id]), row]));
    shots.forEach((shot, start) => {
      for (const effect of Array.isArray(shot?.sound?.effects) ? shot.sound.effects : []) {
        if (!effect?.audience) continue;
        const row = checked.get(JSON.stringify([shot.id, effect.id]));
        const status = cueStatus(shot.id, effect, row);
        const covered = new Set([shot.scene]);
        const end = positions.get(effect.end?.shotId) ?? start;
        for (let i = start + 1; i <= end; i++) {
          if (!shots[i] || ['broll', 'outro'].includes(shots[i].type) || (i === end && effect.end.atSeconds === 0)) break;
          covered.add(shots[i].scene);
        }
        for (const no of covered) byScene.get(no)?.cues.push({ shotId: shot.id, id: effect.id, status });
      }
    });
    const undecided = [], needsCue = [], conflicts = [];
    for (const scene of scenes) {
      scene.needsCue = scene.decision === 'use' && !scene.cues.length;
      if (scene.needsCue) needsCue.push(scene.no);
      if (scene.decision === 'undecided') undecided.push(scene.no);
      if (scene.decision === 'none' && scene.cues.length) conflicts.push(scene.no);
    }
    return { scenes, undecided, needsCue, conflicts };
  }
  function spottingDigest(board) {
    const { undecided, needsCue, conflicts } = spotting(board);
    const notes = [];
    if (undecided.length) notes.push('undecided in scenes ' + undecided.join(', '));
    if (needsCue.length) notes.push('chosen but no cue planned in scenes ' + needsCue.join(', '));
    if (conflicts.length) notes.push('marked none but contain a cue in scenes ' + conflicts.join(', '));
    return notes.length ? ['Audience sound: ' + notes.join(' / ') + '. See storyboard_read.audienceSpotting.'] : [];
  }
  const api = { cueStatus, spotting, spottingDigest };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AUDIENCE_SPOTTING = api;
})(typeof window === 'object' ? window : globalThis);
