const ordered = {
    cutTiming: 'cut_order',
    referenceLabels: 'indexed',
    allowsGeneratedVoice: false,
};
const holds = { ...ordered, cutTiming: 'approximate_holds' };
const veo = { ...ordered, cutTiming: 'time_ranges', allowsGeneratedVoice: true };
const seedance = { ...ordered, cutTiming: 'action_beats' };
const pictureTags = { ...seedance, referenceLabels: 'picture_audio_tags' };
const operations = {
    veo_text2video: veo,
    veo_img2video: veo,
    veo_reference: veo,
    veo_extend: { ...veo, allowsGeneratedVoice: false },
    seedance_text2video: seedance,
    seedance_img2video: { ...seedance, allowsGeneratedVoice: true },
    seedance_reference: seedance,
    astra_genai_img2video: holds,
    astra_genai_msr: holds,
    minimax_reference: { ...ordered, cutTiming: 'action_beats', referenceLabels: 'reference_indexed' },
    fasth3_omni_reference: pictureTags,
    heygen_reference: pictureTags,
};
export function scenePromptProfile(tool, model) {
    const profile = operations[tool ?? ''] ?? ordered;
    // Seedance 2.5 added the @ prefix for multimodal reference inputs.
    if (tool === 'seedance_reference' && typeof model === 'string' && model.startsWith('dreamina-seedance-2-5-'))
        return { ...profile, referenceLabels: 'at_indexed' };
    return profile;
}
export function referenceLabel(tool, kind, index, model) {
    return formatReferenceLabel(scenePromptProfile(tool, model).referenceLabels, kind, index);
}
export function formatReferenceLabel(style, kind, index) {
    if (style === 'picture_audio_tags')
        return '<' + (kind === 'image' ? 'Picture' : 'Audio') + ' ' + index + '>';
    if (style === 'reference_indexed')
        return 'reference ' + kind + ' ' + index;
    return (style === 'at_indexed' ? '@' : '') + (kind === 'image' ? 'Image' : 'Audio') + ' ' + index;
}
