import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { nativeImageSchema, nativeImageEditSchema } from './astra-genai-native-image.js';
import { DESKTOP_SCHEMAS } from './astra-genai-desktop.js';
import { genaiSpeechSchema } from './astra-genai-speech.js';
const descriptions = {
    requestId: 'Stable local speech request ID, e.g. shot1-line1-v1; repeat unchanged to reuse the recorded result without another synthesis.',
    kind: 'Catalog to read, e.g. speech for registered voices; discovery never generates media.',
    model: 'Exact public model alias from astra_genai_catalog, e.g. qwen-image-fast or ltx-2.5-fast.',
    prompt: 'Requested subject/action or changes, e.g. A blue ball rolls across a table.',
    size: 'Image width x height, e.g. 1024x1024. Supported grid depends on the selected model.',
    seed: 'Optional reproducibility seed, e.g. 42; omit for provider handling.',
    steps: 'Optional sampling steps, e.g. 8 for Qwen Turbo. Omit to preserve model schedule.',
    guidanceScale: 'Optional model-supported guidance, e.g. 1.0; never infer support.',
    negativePrompt: 'Optional model-supported exclusion text, e.g. blurry; omitted by default.',
    transparent: 'Request transparency only on a supporting model, e.g. true.',
    loras: 'Ordered registered LoRA selections, e.g. [{id:"style-v1",scale:0.8}] for images or [{ref:"opaque-ref",scale:1}] for Desktop.',
    id: 'Registered image LoRA ID from image catalog, e.g. style-v1; never a path.',
    ref: 'Opaque Desktop LoRA ref returned by the loras catalog, never a path.',
    scale: 'Adapter scale, e.g. 0.8; zero is preserved, limits differ by image/video contract.',
    outputPath: 'Local output directory, e.g. /work/episode/.work/media; managed requests stay within their workspace.',
    filename: 'Bare output filename, e.g. frame.png, shot.mp4 or line.wav; extension must match media. Do not overwrite existing receipts.',
    imagePath: 'Local PNG/JPEG source or start frame, e.g. /work/frame.png; transferred as data/owned asset.',
    refImagePaths: 'Additional local PNG/JPEG references in order, e.g. ["/work/character.png"]; nine plus the source maximum.',
    mode: 'Operation-specific edit behavior. Select an enum value explicitly when changing the default.',
    strength: 'Reference/change strength, e.g. 0.8; image variation requires >0, keyframes permit zero.',
    refResolution: 'Optional reference image resolution, e.g. 512; gateway validates model support.',
    text: 'Clean single-speaker speech, e.g. Hello, welcome. No automatic splitting or inline acting tags.',
    voice: 'Registered public voice ID from speech catalog, e.g. narrator; omit only if the model supports a default.',
    instructions: 'Model-supported vocal direction, e.g. A calm, clear voice. Not spoken text.',
    speed: 'Playback/generation speed supported by selected model, e.g. 1. VoxCPM2 only accepts 1.',
    maxTokens: 'Optional generation token limit, e.g. 1200; supported by VoxCPM2, not generic OpenAI speech.',
    outputFormat: 'Speech output format. Model may permit WAV only; select from the live catalog.',
    resolution: 'New video resolution tier, e.g. 270p; verify installed model/fps/duration matrix.',
    fps: 'Output frames per second; verify the selected model combination.',
    cameraMotion: 'Optional camera prompt guidance; not a guaranteed geometric trajectory.',
    reserveUsd: 'Explicit total USD reservation, e.g. 0 only for a verified non-billed deployment; not a provider invoice cap.',
    duration: 'Requested seconds, e.g. 5. New generation supports discrete model matrix entries; edits have separate ranges.',
    aspectRatio: 'Output aspect ratio. auto derives from source where supported.',
    lastFramePath: 'Optional local final PNG/JPEG, e.g. /work/end.png; only I2V, not A2V.',
    audioPath: 'Local source audio, e.g. /work/speech.wav. A2V derives duration from its samples.',
    allowAudioTruncation: 'Explicit consent to A2V 8k+1 frame-grid audio loss, e.g. false. Does not bypass maximum duration.',
    sourceVideoPath: 'Local source video for extend/retake, e.g. /work/source.mp4.',
    targetResolution: 'Optional edit cap, e.g. {width:576,height:320}; source is never upscaled.',
    width: 'Positive target width in pixels, e.g. 576; backend snaps to supported geometry.',
    height: 'Positive target height in pixels, e.g. 320; backend snaps to supported geometry.',
    startTime: 'Retake start position in source seconds, e.g. 0; duration must fit the source.',
    audio: 'Generate audio on the direct keyframe pipeline, e.g. false; not an A2V input switch.',
    keyframes: 'One to ten temporal pins, e.g. [{imagePath:"/work/start.png",frameIndex:0,strength:1}].',
    frameIndex: 'Unique zero-based output frame index, e.g. 0; must lie within requested duration/fps.',
    receiptPath: 'Existing local .astra-genai.json receipt, e.g. /work/shot.mp4.astra-genai.json.',
    download: 'Download and verify completed output, e.g. true; never creates another generation.',
};
function describeProperties(value) {
    if (!value || typeof value !== 'object')
        return;
    if (Array.isArray(value)) {
        for (const item of value)
            describeProperties(item);
        return;
    }
    const node = value;
    if (node.properties && typeof node.properties === 'object') {
        for (const [key, property] of Object.entries(node.properties)) {
            if (!descriptions[key])
                throw new Error('Missing gateway tool field description: ' + key);
            property.description = descriptions[key];
        }
    }
    for (const child of Object.values(node))
        describeProperties(child);
}
function tool(name, description, schema, readOnly = false) {
    const inputSchema = zodToJsonSchema(schema, { $refStrategy: 'none' });
    describeProperties(inputSchema);
    return { name, title: name.replaceAll('_', ' '), description,
        inputSchema,
        annotations: readOnly ? { readOnlyHint: true, openWorldHint: true } : { readOnlyHint: false, destructiveHint: false, idempotentHint: name.endsWith('_status'), openWorldHint: true } };
}
export const NATIVE_GENAI_TOOLS = [
    tool('astra_genai_catalog', 'Read configured gateway image/speech/video models, registered voice IDs, LoRA refs or native schemas. Requires ASTRA_GENAI_API_KEY and optional ASTRA_GENAI_URL. Configuration discovery is not an inference health check. Select the returned model alias; never infer a runtime or fall back to a different engine.', z.object({ kind: z.enum(['image', 'speech', 'video', 'loras', 'contracts']) }).strict(), true),
    tool('astra_genai_image_generate', 'Generate one PNG with the configured gateway model alias. Use image_plan/image_execute with engine astra-genai-native and explicit reserveUsd. Optional registered LoRA IDs/scales; consult image catalog for model constraints. No reference images on text requests. Returns verified local output; retain the receipt after errors. Use GPT Image 2 for readable text.', nativeImageSchema),
    tool('astra_genai_image_edit', 'Edit or vary a source PNG/JPEG with a configured gateway alias; up to nine additional local references, ten total in order. Use image_plan operation edit and engine astra-genai-native. Model catalog determines edit/variation, guidance, transparency and registered LoRA support. No arbitrary LoRA paths, masks or silent reference dropping. Returns local PNG and durable receipt; no automatic generation retries.', nativeImageEditSchema),
    tool('tts_astra_genai', 'Synthesize one speaker through gateway /v1/audio/speech using an explicit model alias and optional registered voice. Use tts_route or supply a stable requestId for durable replay and use speech_manage plan_audio for character lines. Discover model voices/formats/speed/instructions first. VoxCPM2 allows WAV and speed 1; voice cloning uses operator-registered IDs, never client audio paths. Returns local audio and receipt; no automatic retries or listening score.', genaiSpeechSchema),
    ...Object.entries(DESKTOP_SCHEMAS).map(([feature, schema]) => tool('astra_genai_desktop_' + ({ 'text-to-video': 'text2video', 'image-to-video': 'img2video', 'audio-to-video': 'audio2video' }[feature] || feature), `Generate ${feature} using gateway-owned Desktop assets/jobs. Select engine astra-genai-desktop and use video_plan/video_execute with explicit reserveUsd. Discover installed model matrices and LoRA refs first. Local input files upload to the gateway; no upstream paths. I2V accepts start/end, A2V audio plus optional start; audio truncation defaults false. Text/keyframes accept registered LoRA refs. Keyframes require the active selected model. Edits cap resolution without upscaling. Returns local MP4 and receipt; recover the same job after timeout, never resubmit blindly.`, schema)),
    tool('astra_genai_desktop_status', 'Recover a gateway Desktop job from its local .astra-genai.json receipt without new generation. Same gateway and credentials required. Optional download authenticates only the private asset route and verifies MP4. For managed jobs use video_status action refresh to reconcile its reservation.', z.object({ receiptPath: z.string().min(1), download: z.boolean().default(false) }).strict()),
];
