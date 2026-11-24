const authoring = {
    ltx: 'Write one present-tense scene. Establish blocking, then describe each change of view and the visible state at the cut.',
    msr: 'Place each cast member at their opening landmark. Pair their face and voice with the same cast ID. Keep every turn with its action and show what the listener does.',
    recorded: 'Use the supplied performance as the scene clock. Direct visible reactions and mouth movement against the recording and its pauses.',
    hostedH3: 'Identify the purpose of each supplied reference. Describe visual changes and attributed dialogue in chronological order. Place continuous ambience after the action.',
    fastH3: 'Assign picture, motion and voice references by role. Use the submitted slot map, including any audio carried by a video. Describe a new view at each cut.',
    veo: 'Open with the framing and subject. Use timed beats for a sequence, a speaker attribution for every line and a separate sound direction. Reuse the approved voice description when generated speech is allowed.',
    seedance: 'Give each numbered asset a role. Advance the scene in action beats and describe what changes at each transition. Use the reference labels of the selected model version.',
    heygen: 'Use a contained location and action. Anchor each speaking face and voice, describe restrained camera movement and place dialogue next to the speaker.',
};
export function sceneWritingGuide(profile) {
    return profile.writer ? authoring[profile.writer] : 'Establish the opening and describe the ordered action, dialogue, transitions and final state in one scene.';
}
const ordered = {
    cutTiming: 'cut_order',
    referenceLabels: 'indexed',
    allowsGeneratedVoice: false,
};
const holds = { ...ordered, cutTiming: 'approximate_holds' };
const veo = { ...ordered, writer: 'veo', cutTiming: 'time_ranges', allowsGeneratedVoice: true };
const seedance = { ...ordered, writer: 'seedance', cutTiming: 'action_beats' };
const pictureTags = { ...seedance, referenceLabels: 'picture_audio_tags' };
const operations = {
    veo_text2video: veo,
    veo_img2video: veo,
    veo_reference: veo,
    veo_extend: { ...veo, allowsGeneratedVoice: false },
    seedance_text2video: seedance,
    seedance_img2video: { ...seedance, allowsGeneratedVoice: true },
    seedance_reference: seedance,
    astra_genai_img2video: { ...holds, writer: 'ltx' },
    astra_genai_text2video: { ...ordered, writer: 'ltx' },
    astra_genai_audio2video: { ...ordered, writer: 'recorded' },
    astra_genai_desktop_audio2video: { ...ordered, writer: 'recorded' },
    astra_audio2video: { ...ordered, writer: 'recorded' },
    ltx_api_audio2video: { ...ordered, writer: 'recorded' },
    ltx_desktop_audio2video: { ...ordered, writer: 'recorded' },
    ltx_desktop_img2video: { ...ordered, writer: 'ltx' },
    ltx_desktop_text2video: { ...ordered, writer: 'ltx' },
    ltx_api_img2video: { ...ordered, writer: 'ltx' },
    minimax_img2video: { ...ordered, writer: 'hostedH3' },
    heygen_img2video: { ...ordered, writer: 'heygen' },
    ltx_video_generate: { ...ordered, writer: 'ltx' },
    astra_genai_msr: { ...holds, writer: 'msr' },
    minimax_reference: { ...ordered, writer: 'hostedH3', cutTiming: 'action_beats', referenceLabels: 'reference_indexed' },
    fasth3_omni_reference: { ...pictureTags, writer: 'fastH3' },
    heygen_reference: { ...pictureTags, writer: 'heygen' },
};
export function scenePromptProfile(tool, model) {
    const profile = operations[tool ?? ''] ?? ordered;
    // Seedance 2.5 added the @ prefix for multimodal reference inputs.
    if (tool === 'seedance_reference' && typeof model === 'string' && model.startsWith('dreamina-seedance-2-5-'))
        return { ...profile, referenceLabels: 'at_indexed' };
    return profile;
}
export function usesGeneratedVoice(tool, dialogueVoice) {
    return dialogueVoice === 'model_generated' && scenePromptProfile(tool).allowsGeneratedVoice;
}
export function referenceLabel(tool, kind, index, model) {
    return formatReferenceLabel(scenePromptProfile(tool, model).referenceLabels, kind, index);
}
export function formatReferenceLabel(style, kind, index) {
    const label = kind[0].toUpperCase() + kind.slice(1);
    if (style === 'picture_audio_tags')
        return '<' + (kind === 'image' ? 'Picture' : label) + ' ' + index + '>';
    if (style === 'reference_indexed')
        return 'reference ' + kind + ' ' + index;
    return (style === 'at_indexed' ? '@' : '') + label + ' ' + index;
}
