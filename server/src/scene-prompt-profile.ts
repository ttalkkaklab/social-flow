// These choices describe prompt syntax. Wire capabilities and model pricing belong to the adapters.
export interface ScenePromptProfile {
  cutTiming: 'cut_order' | 'time_ranges' | 'action_beats' | 'approximate_holds';
  referenceLabels: 'indexed' | 'at_indexed' | 'picture_audio_tags' | 'reference_indexed';
  allowsGeneratedVoice: boolean;
}

const ordered: ScenePromptProfile = {
  cutTiming: 'cut_order',
  referenceLabels: 'indexed',
  allowsGeneratedVoice: false,
};
const holds = {...ordered, cutTiming: 'approximate_holds'} as const;
const veo = {...ordered, cutTiming: 'time_ranges', allowsGeneratedVoice: true} as const;
const seedance = {...ordered, cutTiming: 'action_beats'} as const;
const pictureTags = {...seedance, referenceLabels: 'picture_audio_tags'} as const;

const operations: Readonly<Partial<Record<string, ScenePromptProfile>>> = {
  veo_text2video: veo,
  veo_img2video: veo,
  veo_reference: veo,
  veo_extend: {...veo, allowsGeneratedVoice: false},
  seedance_text2video: seedance,
  seedance_img2video: {...seedance, allowsGeneratedVoice: true},
  seedance_reference: seedance,
  astra_genai_img2video: holds,
  astra_genai_msr: holds,
  minimax_reference: {...ordered, cutTiming: 'action_beats', referenceLabels: 'reference_indexed'},
  fasth3_omni_reference: pictureTags,
  heygen_reference: pictureTags,
};

export function scenePromptProfile(tool?: string, model?: unknown): Readonly<ScenePromptProfile> {
  const profile = operations[tool ?? ''] ?? ordered;
  // Seedance 2.5 added the @ prefix for multimodal reference inputs.
  if (tool === 'seedance_reference' && typeof model === 'string' && model.startsWith('dreamina-seedance-2-5-'))
    return {...profile, referenceLabels: 'at_indexed'};
  return profile;
}

export function referenceLabel(tool: string, kind: 'image' | 'audio', index: number, model?: unknown): string {
  return formatReferenceLabel(scenePromptProfile(tool, model).referenceLabels, kind, index);
}

export function formatReferenceLabel(style: ScenePromptProfile['referenceLabels'], kind: 'image' | 'audio', index: number): string {
  if (style === 'picture_audio_tags') return '<' + (kind === 'image' ? 'Picture' : 'Audio') + ' ' + index + '>';
  if (style === 'reference_indexed') return 'reference ' + kind + ' ' + index;
  return (style === 'at_indexed' ? '@' : '') + (kind === 'image' ? 'Image' : 'Audio') + ' ' + index;
}
