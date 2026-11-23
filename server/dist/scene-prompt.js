const transitions = {
    hard_cut: 'cut directly', dissolve: 'dissolve to the next view', fade: 'fade to the next view',
};
function shotHeading(shot, fps, options) {
    const transition = shot.transition.replaceAll('_', ' ');
    if (!options.modelFacing)
        return `${shot.shotId} [${shot.startFrame}–${shot.endFrame - 1}] ${transition}.`;
    const cut = transitions[shot.transition] ?? transition;
    if (!options.modelPacedCuts)
        return shot.transition === 'open' ? '' : `At ${Number((shot.startFrame / fps).toFixed(3))} seconds, ${cut}.`;
    const order = shot.transition === 'open' ? '' : `Then ${cut}.`;
    if (options.cutTiming !== 'time_ranges')
        return order;
    const seconds = (frame) => Number((frame / fps).toFixed(2));
    return [`[${seconds(shot.startFrame)}–${seconds(shot.endFrame)}s]`, order].filter(Boolean).join(' ');
}
function deliveryDirection(lines) {
    const physical = lines.filter(line => line.delivery !== 'voiceover');
    if (!physical.length)
        return 'No foreground dialogue.';
    if (physical.every(line => line.delivery === 'off_screen'))
        return 'The voice stays off screen. Visible mouths stay closed.';
    if (physical.some(line => line.delivery === 'off_screen'))
        return 'Only on-screen speakers mouth their own lines. Visible mouths stay still for off-screen voices.';
    return 'Only the named on-screen speaker mouths each line. Listeners stay quiet.';
}
/** Render the same ordered shots for the storyboard and the selected provider. Frame ends are exclusive. */
export function sceneTimelineWords(timeline, scene, options = {}) {
    const { boundTurns, describeDelivery, modelFacing } = options;
    const timing = (frame) => modelFacing ? `At ${Number((frame / timeline.fps).toFixed(3))} seconds` : `Frame ${frame}`;
    const wholeTake = new Set(timeline.shots.length === 1 ? [scene.camera, scene.action, scene.emotion] : []);
    const rows = [];
    if (!modelFacing)
        rows.push(`Scene at ${timeline.fps} fps. Frame numbers start at zero.`);
    let turnIndex = 0;
    for (const shot of timeline.shots) {
        const images = timeline.images.filter(image => image.shotId === shot.shotId);
        const cues = images.filter(image => image.cue).map(image => `${timing(image.frame)}: ${image.cue}`);
        const guides = images.flatMap(image => image.reference?.scope === 'shot_guide' ? [image.reference.purpose] : []);
        const lines = shot.dialogue ?? [];
        const spoken = [];
        for (const line of lines) {
            if (boundTurns)
                spoken.push(boundTurns[turnIndex++]);
            else if (options.includeDialogue !== false && line.delivery !== 'voiceover') {
                spoken.push([line.frame !== undefined && timing(line.frame) + ':', line.direction,
                    `${line.speaker} (${line.delivery}): "${line.text}"`].filter(Boolean).join(' '));
            }
        }
        const duration = Number(((shot.endFrame - shot.startFrame) / timeline.fps).toFixed(2));
        const hold = describeDelivery && options.cutTiming === 'approximate_holds' &&
            `Hold this view for about ${duration} ${duration === 1 ? 'second' : 'seconds'}.`;
        rows.push([
            shotHeading(shot, timeline.fps, options), hold,
            ...[shot.framing, shot.blocking, shot.action].filter(value => value && !wholeTake.has(value)),
            ...cues, ...guides, shot.sound && shot.sound !== scene.sound && 'Sound: ' + shot.sound,
            describeDelivery && deliveryDirection(lines), ...spoken,
            shot.closingState && 'End on ' + shot.closingState,
        ].filter(Boolean).join(' '));
    }
    if (timeline.audio) {
        rows.push(modelFacing ? 'Play one continuous soundtrack from the opening.' : 'Play one continuous scene track from frame 0.');
        for (const cue of timeline.audio.cues)
            rows.push(`${timing(cue.frame)}: ${cue.action}`);
    }
    return rows.filter(Boolean).join('\n');
}
