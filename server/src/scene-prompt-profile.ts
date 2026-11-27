// These choices describe prompt syntax. Wire capabilities and model pricing belong to the adapters.
export interface ScenePromptProfile {
  writer?: SceneWriter;
  cutTiming: 'cut_order' | 'time_ranges' | 'action_beats' | 'approximate_holds';
  referenceLabels: 'indexed' | 'at_indexed' | 'picture_audio_tags' | 'reference_indexed';
  allowsGeneratedVoice: boolean;
  wholeSecondShotRanges?: boolean;
}

type SceneWriter = 'ltx' | 'msr' | 'recorded' | 'hostedH3' | 'fastH3' | 'veo' | 'seedance' | 'heygen';

const authoring: Record<SceneWriter, string> = {
  ltx: 'Write one present-tense scene. Establish blocking, then describe each change of view and the visible state at the cut.',
  msr: 'Place each cast member at their opening landmark. Pair their face and voice with the same cast ID. Keep every turn with its action and show what the listener does.',
  recorded: 'Use the supplied performance as the scene clock. Direct visible reactions and mouth movement against the recording and its pauses.',
  hostedH3: 'Identify the purpose of each supplied reference. Describe visual changes and attributed dialogue in chronological order. Place continuous ambience after the action.',
  fastH3: 'Assign picture, motion and voice references by role. Use the submitted slot map, including any audio carried by a video. Describe a new view at each cut.',
  veo: 'Open with the framing and subject. Use timed beats for a sequence, a speaker attribution for every line and a separate sound direction. Reuse the approved voice description when generated speech is allowed.',
  seedance: 'Give each numbered asset a role. Advance the scene in action beats and describe what changes at each transition. Use the reference labels of the selected model version.',
  heygen: 'Use a contained location and action. Anchor each speaking face and voice, describe restrained camera movement and place dialogue next to the speaker.',
};

export function sceneWritingGuide(profile: Readonly<ScenePromptProfile>): string {
  return profile.writer ? authoring[profile.writer] : 'Establish the opening and describe the ordered action, dialogue, transitions and final state in one scene.';
}

/** What a vendor's guide recommends inside the limits its API enforces. The adapters refuse past a limit; these numbers only report. */
export interface RecommendedRanges {
  /** Reference people in one request. */
  people?: number;
  /** Reference files of every kind in one request. */
  assets?: number;
  /** Speakers bound to a voice sample in one request. */
  voices?: number;
  /** Seconds of one voice sample. */
  voiceSeconds?: readonly [number, number];
  /** Frames of one render. */
  frames?: number;
  source: string;
}
export interface PromptGuidance { guide: string; reference?: string; recommended?: RecommendedRanges }
export interface ReferenceCounts { people?: number; assets?: number; voices?: number; voiceSeconds?: readonly {speaker: string; seconds: number}[]; frames?: number }

const PAGES = 'skills/generate-cut-videos/references/';
const pages: Partial<Record<SceneWriter, string>> = {
  hostedH3: 'prompt-h3.md', fastH3: 'prompt-h3.md', msr: 'prompt-ltx-msr.md', seedance: 'prompt-seedance.md',
};
// Figures and their sources: docs/research/2026-11-25-reference-limits.
const seedance20: RecommendedRanges = {people: 4, assets: 5, source: 'Dreamina Seedance 2.0 series prompt guide'};
const seedance25: RecommendedRanges = {people: 8, voices: 5, voiceSeconds: [5, 10], source: 'Seedance 2.5 prompt guide'};
const fastH3: RecommendedRanges = {frames: 345, source: 'MiniMax-H3 reference pipeline, 5 to 15 seconds at 24 fps'};

function seedanceSeries(model: unknown): '2.0' | '2.5' | undefined {
  if (typeof model !== 'string') return undefined;
  return model.startsWith('dreamina-seedance-2-5-') ? '2.5' : model.startsWith('dreamina-seedance-2-0-') ? '2.0' : undefined;
}

/** The writing sentence, reference page and recommended ranges for one adapter and, where the guides differ, one model. */
export function promptGuidance(tool?: string, model?: unknown): PromptGuidance {
  const profile = scenePromptProfile(tool, model);
  // Distilled LTX takes MSR's subject references on its image route and in scene mode.
  const page = tool === 'astra_genai_img2video' || tool === 'astra_genai_scene' && model !== 'minimax-h3' ? pages.msr : profile.writer && pages[profile.writer];
  const series = profile.writer === 'seedance' ? seedanceSeries(model) : undefined;
  const note = series === '2.0' ? ' This series follows shot numbers and does not follow timestamps, so leave each shot\'s length to the model.'
    : series === '2.5' ? ' This series reads shot numbers and whole-second ranges.' : '';
  const recommended = series === '2.0' ? seedance20 : series === '2.5' ? seedance25 : tool === 'fasth3_omni_reference' ? fastH3 : undefined;
  return {guide: sceneWritingGuide(profile) + note, ...(page ? {reference: PAGES + page} : {}), ...(recommended ? {recommended} : {})};
}

/** One finding for each count outside the recommended range. An empty list says nothing about quality. */
export function referenceAdvice(recommended: RecommendedRanges | undefined, counts: ReferenceCounts): {code: string; detail: string}[] {
  if (!recommended) return [];
  const {people, assets, voices, voiceSeconds, frames, source} = recommended;
  const advice: {code: string; detail: string}[] = [];
  const over = (code: string, count: number | undefined, limit: number | undefined, unit: string, consequence: string) => {
    if (count !== undefined && limit !== undefined && count > limit)
      advice.push({code, detail: `${count} ${unit}; the ${source} recommends at most ${limit}. ${consequence}`});
  };
  over('reference_people_over_recommended', counts.people, people, 'reference people', 'Past it the guide reports a wrong number of people or a duplicated character.');
  over('reference_assets_over_recommended', counts.assets, assets, 'reference files', 'The guide advises against filling the limit: the model loses track of which reference matters.');
  over('voice_subjects_over_recommended', counts.voices, voices, 'voice subjects', 'Past it the guide reports less stable output.');
  over('frames_over_reference_pipeline', counts.frames, frames, 'frames', 'Whether the local build renders the longer take as asked is not verified.');
  if (voiceSeconds) for (const sample of counts.voiceSeconds ?? []) {
    if (sample.seconds >= voiceSeconds[0] && sample.seconds <= voiceSeconds[1]) continue;
    advice.push({code: 'voice_sample_length', detail: `${sample.speaker}: the voice sample runs ${sample.seconds.toFixed(1)} s; the ${source} recommends ${voiceSeconds[0]} to ${voiceSeconds[1]} s.`});
  }
  return advice;
}

const ordered: ScenePromptProfile = {
  cutTiming: 'cut_order',
  referenceLabels: 'indexed',
  allowsGeneratedVoice: false,
};
const holds = {...ordered, cutTiming: 'approximate_holds'} as const;
const veo = {...ordered, writer: 'veo', cutTiming: 'time_ranges', allowsGeneratedVoice: true} as const;
const seedance = {...ordered, writer: 'seedance', cutTiming: 'action_beats'} as const;
const pictureTags = {...seedance, referenceLabels: 'picture_audio_tags'} as const;

const operations: Readonly<Partial<Record<string, ScenePromptProfile>>> = {
  veo_text2video: veo,
  veo_img2video: veo,
  veo_reference: veo,
  veo_extend: {...veo, allowsGeneratedVoice: false},
  seedance_text2video: seedance,
  seedance_img2video: {...seedance, allowsGeneratedVoice: true},
  seedance_reference: seedance,
  astra_genai_img2video: {...holds, writer: 'ltx'},
  // A GenAI scene is composed as one LTX MSR render with an opening frame, as on the image lane.
  astra_genai_scene: {...holds, writer: 'ltx'},
  astra_genai_text2video: {...ordered, writer: 'ltx'},
  astra_genai_audio2video: {...ordered, writer: 'recorded'},
  astra_genai_desktop_audio2video: {...ordered, writer: 'recorded'},
  astra_audio2video: {...ordered, writer: 'recorded'},
  ltx_api_audio2video: {...ordered, writer: 'recorded'},
  ltx_desktop_audio2video: {...ordered, writer: 'recorded'},
  ltx_desktop_img2video: {...ordered, writer: 'ltx'},
  ltx_desktop_text2video: {...ordered, writer: 'ltx'},
  ltx_api_img2video: {...ordered, writer: 'ltx'},
  minimax_img2video: {...ordered, writer: 'hostedH3'},
  heygen_img2video: {...ordered, writer: 'heygen'},
  ltx_video_generate: {...ordered, writer: 'ltx'},
  astra_genai_msr: {...holds, writer: 'msr'},
  minimax_reference: {...ordered, writer: 'hostedH3', cutTiming: 'action_beats', referenceLabels: 'reference_indexed'},
  fasth3_omni_reference: {...pictureTags, writer: 'fastH3'},
  heygen_reference: {...pictureTags, writer: 'heygen'},
};

export function scenePromptProfile(tool?: string, model?: unknown): Readonly<ScenePromptProfile> {
  if (tool === 'astra_genai_scene' && model === 'minimax-h3') return {...pictureTags, writer:'fastH3'};
  const profile = operations[tool ?? ''] ?? ordered;
  // Seedance 2.5 added the @ prefix for multimodal reference inputs.
  if (profile.writer === 'seedance' && seedanceSeries(model) === '2.5')
    return {...profile, wholeSecondShotRanges:true, ...(tool === 'seedance_reference' ? {referenceLabels:'at_indexed' as const} : {})};
  return profile;
}

export function usesGeneratedVoice(tool: string | undefined, dialogueVoice: unknown): boolean {
  return dialogueVoice === 'model_generated' && scenePromptProfile(tool).allowsGeneratedVoice;
}

export function referenceLabel(tool: string, kind: 'image' | 'audio', index: number, model?: unknown): string {
  return formatReferenceLabel(scenePromptProfile(tool, model).referenceLabels, kind, index);
}

export function formatReferenceLabel(style: ScenePromptProfile['referenceLabels'], kind: 'image' | 'audio' | 'video', index: number): string {
  const label = kind[0].toUpperCase() + kind.slice(1);
  if (style === 'picture_audio_tags') return '<' + (kind === 'image' ? 'Picture' : label) + ' ' + index + '>';
  if (style === 'reference_indexed') return 'reference ' + kind + ' ' + index;
  return (style === 'at_indexed' ? '@' : '') + label + ' ' + index;
}
