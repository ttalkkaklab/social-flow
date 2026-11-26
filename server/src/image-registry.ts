import { GENAI_H3_IMAGE_MODEL, isNativeH3Image, nativeImageSchema, nativeImageEditSchema, validateNativeImageArgs } from './astra-genai-native-image.js';
import { z } from 'zod';
import { genaiImageSchema, genaiImageEditSchema } from './astra-genai-image.js';
import { text2ImageSchema, img2ImgSchema } from './image-client.js';
import { mlxImageGenerateSchema, mlxImageEditSchema } from './mlx-serve-client.js';
import { zimageGenerateSchema } from './zimage-client.js';
import { GPT_IMAGE_MODELS, GPT_IMAGE_CONTRACTS, assertImageModelAvailable, validateMlxImageOperation } from './image-models.js';
import { validateImageBase64 } from './image-media.js';
import { adapterContracts } from './adapter-parameters.js';

interface ImageAdapter { engine: string; operation: 'text' | 'edit'; schema: z.ZodTypeAny }
export const IMAGE_ADAPTERS: Readonly<Record<string, ImageAdapter>> = Object.freeze({
  astra_genai_image_generate: { engine: 'astra-genai-native', operation: 'text', schema: nativeImageSchema },
  astra_genai_image_edit: { engine: 'astra-genai-native', operation: 'edit', schema: nativeImageEditSchema },
  astra_genai_text2img: { engine: 'astra-genai', operation: 'text', schema: genaiImageSchema },
  astra_genai_edit: { engine: 'astra-genai', operation: 'edit', schema: genaiImageEditSchema },
  gpt_image_text2img: { engine: 'gpt-image', operation: 'text', schema: text2ImageSchema },
  gpt_image_img2img: { engine: 'gpt-image', operation: 'edit', schema: img2ImgSchema },
  image_local_generate: { engine: 'zimage', operation: 'text', schema: zimageGenerateSchema },
  mlx_image_generate: { engine: 'mlx', operation: 'text', schema: mlxImageGenerateSchema },
  mlx_image_edit: { engine: 'mlx', operation: 'edit', schema: mlxImageEditSchema },
});
function fields(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodEffects) return fields(schema.innerType());
  return schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];
}
export function parseImageArgs(tool: string, input: Record<string, unknown>): Record<string, unknown> {
  const adapter = IMAGE_ADAPTERS[tool];
  if (!adapter) throw new Error('image_adapter_unsupported');
  for (const key of Object.keys(input)) if (!fields(adapter.schema).includes(key)) throw new Error('image_argument_unsupported: ' + key);
  const args = adapter.schema.parse(input) as Record<string, unknown>;
  if (adapter.engine === 'astra-genai-native') {
    const edit = adapter.operation === 'edit';
    validateNativeImageArgs(args, edit);
    if (!(edit && isNativeH3Image(args.model))) args.size ??= '1024x1024';
  }
  if (adapter.engine === 'gpt-image') {
    assertImageModelAvailable(String(args.model));
    const refs = (args.sourceImagesBase64 ?? []) as string[];
    for (const ref of refs) validateImageBase64(ref, String(args.sourceMimeType));
    if (typeof args.maskBase64 === 'string') {
      const mask = validateImageBase64(args.maskBase64, 'image/png');
      const source = validateImageBase64(refs[0]);
      if (mask.width !== source.width || mask.height !== source.height || mask.bytes >= 4 * 1024 * 1024)
        throw new Error('image_mask_invalid: dimensions must match first source; use a PNG below 4MB');
      const bytes = Buffer.from(args.maskBase64, 'base64');
      if (![4, 6].includes(bytes[25]) && !bytes.includes(Buffer.from('tRNS'))) throw new Error('image_mask_requires_alpha');
    }
  }
  if (adapter.engine === 'mlx' && args.model) validateMlxImageOperation(String(args.model),
    adapter.operation === 'edit' ? 'edit' : args.imagePath ? 'variation' : 'text', args);
  return args;
}
/** One engine's adapters, and one operation's when named, each with its parameters as JSON Schema: shared names apart from its own. */
export function imageAdapterContracts(engine: string, operation?: string) {
  return adapterContracts('image', imageCatalog().adapters.filter(row => row.engine === engine && (!operation || row.operation === operation)),
    IMAGE_ADAPTERS, { engine, operation });
}
export function imageCatalog() {
  return { version: 1, revision: '2026-10-18',
    adapters: Object.entries(IMAGE_ADAPTERS).map(([tool, entry]) => ({ tool, engine: entry.engine, operation: entry.operation, fields: fields(entry.schema) })),
    genai: { edits: ['img2img', 'inpaint'], sourceImages: 1, steps: [1, 12], promptExtend: 'Optional shared-LLM rewrite; failures use the original prompt. Keep false for precise reference instructions.', note: 'Use GPT Image 2 for readable text. No multi-image fusion.' },
    nativeH3Image: { engine: 'astra-genai-native', model: GENAI_H3_IMAGE_MODEL, profile: GENAI_H3_IMAGE_MODEL, protocol: 'common-generation',
      operations: ['text', 'edit'], referenceImages: 7, fixedSteps: 6, editSize: 'source',
      availability: 'Check astra_genai_catalog kind common for the image scene in the gateway catalog.' },
    gptModels: GPT_IMAGE_MODELS, gptContracts: GPT_IMAGE_CONTRACTS,
    mlx: { families: ['flux-klein', 'krea', 'mage', 'mage-edit', 'qwen-2.1', 'h3-image'],
      h3Image: { model: 'ddalcu/MiniMax-H3-Image-MLX-Serve-4bit', operations: ['text','edit'], referenceImages: 10, fixedSteps: 6, editSize: 'source' },
      note: 'Installed pack and backend determine availability. Unknown packs support basic text only until capabilities are registered; use image_plan.' },
    host: { execution: 'host_handoff', model: 'host-managed', note: 'External tools/allowance are not enforced by MCP. No API fallback.' },
    unimplemented: ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'bfl-api', 'krea-api', 'qwen-model-studio', 'xai-images-api'],
  };
}
export function isManagedImageCall(tool: string, args: unknown): boolean {
  return Object.hasOwn(IMAGE_ADAPTERS, tool) && !!args && typeof args === 'object' && 'imageContext' in args;
}
