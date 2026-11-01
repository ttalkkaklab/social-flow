/**
 * character_panel — makes one sheet panel (face close-up, headless front or back) of a shared
 * character from its identity.md: the sheet's body words (height, weight, scale, build,
 * proportions, outfit) or face words, the project style and the panel framing, so no panel
 * prompt is written by hand. Runs through the saved image model and records panels.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { z } from 'zod';
import { imageCall } from './storyboard.js';

const load = createRequire(import.meta.url);
const shared = (file: string) => load(`../../skills/${file}`);

export const characterPanelSchema = z.object({
  identityPath: z.string().min(1).describe('<channel>/assets/characters/<id>/identity.md'),
  view: z.enum(['face', 'front', 'back']),
  references: z.array(z.string().min(1)).max(4).optional()
    .describe('Pictures to edit from, in order; default: none for face, the face panel for front, the front then face panel for back'),
  reserveUsd: z.number().finite().nonnegative().optional(),
}).strict();
export type CharacterPanelInput = z.infer<typeof characterPanelSchema>;

// character-panels.md: 1:1 face with the head at 60-75 % of the height; 2:3 headless body panels at 80-90 %.
const FRAMING = {
  face: { size: [1024, 1024], text: 'Close head portrait of one character, front facing, neutral expression, the complete head and hair visible, the head filling 70 percent of the image height.' },
  front: { size: [1024, 1536], text: 'Headless front costume mannequin of this character: nothing above the neck, from the neck and shoulders down to the shoes, neutral stance, arms relaxed, the subject filling 85 percent of the image height.' },
  back: { size: [1024, 1536], text: 'Headless rear view of the same costume mannequin, turned 180 degrees away from the camera, from the neck and shoulders down to the heels, the subject filling 85 percent of the image height.' },
} as const;
// ponytail: only the GenAI gateway's 800-character prompt cap is known here; add others when an adapter declares one.
const PROMPT_LIMIT: Record<string, number> = { 'astra-genai': 800 };

/** Plan inputs for one panel: the assembled prompt, the edit sources and the adapter call. */
export function characterPanelRequest(raw: unknown) {
  const args = characterPanelSchema.parse(raw);
  const identityPath = path.resolve(args.identityPath), folder = path.dirname(identityPath), id = path.basename(folder);
  if (path.basename(identityPath) !== 'identity.md' || path.basename(path.dirname(folder)) !== 'characters' || path.basename(path.dirname(path.dirname(folder))) !== 'assets')
    throw new Error('character_path_invalid: identityPath must be <channel>/assets/characters/<id>/identity.md');
  const { identityCharacter, panelPrompt } = shared('_shared/character-identity.js') as {
    identityCharacter(source: string, o?: { ready?: boolean }): unknown;
    panelPrompt(character: unknown, view: string, o?: { compact?: boolean }): { text: string; skipped: string[] } };
  const character = identityCharacter(readFileSync(identityPath, 'utf8'), { ready: false });
  const panelsFile = path.join(folder, 'panels.json');
  const panels = (existsSync(panelsFile) ? JSON.parse(readFileSync(panelsFile, 'utf8')).panels : undefined) ?? {} as Record<string, { file?: string }>;
  const panelFile = (view: string) => {
    const file = panels[view]?.file;
    if (!file || !existsSync(path.join(folder, file))) throw new Error(`character_panel_missing: make ${id}'s ${view} panel first, or pass references`);
    return path.join(folder, file);
  };
  const references = (args.references ?? (args.view === 'face' ? [] : args.view === 'front' ? ['face'] : ['front', 'face']).map(panelFile))
    .map((file) => path.resolve(folder, file));
  for (const file of references) if (!existsSync(file)) throw new Error(`image_input_missing: ${file}`);

  const { findImageWorkspace, readImageContext } = shared('_shared/image-selection.js') as {
    findImageWorkspace(dir: string): string | null; readImageContext(dir: string, assetId: string): { selection: { engine: string } } };
  const workspace = findImageWorkspace(folder);
  if (!workspace) throw new Error('image_setup_required: no .social-flow/models.json above this character');
  const preset = (shared('_shared/model-settings.js') as { readSettings(dir: string): { config?: { style?: { preset?: string } } } }).readSettings(workspace).config?.style?.preset;
  const { STYLES } = shared('storyboard/references/production-mode.js') as { STYLES: Record<string, { prompt: string }> };
  const style = preset && STYLES[preset] ? STYLES[preset].prompt : '';
  const compose = (compact: boolean, withStyle: boolean) => {
    const words = panelPrompt(character, args.view, { compact });
    return { words, prompt: [references.length ? 'Keep this exact character from the reference images.' : '', FRAMING[args.view].text,
      `Character: ${words.text}.`, withStyle ? style : '', 'Soft even studio lighting, plain neutral grey background. One view only. No text, watermark, collage or border.'].filter(Boolean).join(' ') };
  };
  // A prompt over the adapter's cap drops the height convention note first, then the style sentence.
  const limit = PROMPT_LIMIT[readImageContext(workspace, `${id}-${args.view}`).selection.engine] ?? Infinity;
  const { words, prompt } = [compose(false, true), compose(true, true), compose(true, false)].find((p) => p.prompt.length <= limit) ?? compose(true, false);
  const [width, height] = FRAMING[args.view].size;
  const call = imageCall({ directory: workspace, assetId: `${id}-${args.view}`, inputs: references, prompt, width, height, outDir: folder, stem: `${id}-${args.view}`, what: 'this panel' });
  const warnings = [...words.skipped.map((field) => `${field} is not English and stays out of the prompt — write it in English on the sheet`),
    ...(prompt.length > limit ? [`the prompt is ${prompt.length} characters, over the image model's ${limit}; shorten the sheet's physical fields`] : [])];
  return { workspace, folder, id, view: args.view, panelsFile, prompt, warnings, ...call };
}

/** Record a generated panel in panels.json; the other slots stay. */
export function recordCharacterPanel(request: ReturnType<typeof characterPanelRequest>) {
  const doc = existsSync(request.panelsFile) ? JSON.parse(readFileSync(request.panelsFile, 'utf8')) : { schemaVersion: 1, panels: {} };
  doc.panels = { ...doc.panels, [request.view]: { file: path.basename(request.file), purpose: 'character_reference', view: request.view, framing: { status: 'not_reviewed' } } };
  writeFileSync(request.panelsFile, JSON.stringify(doc, null, 2) + '\n');
  try { (shared('channel/references/review-library.js') as { exportChannel(dir: string): unknown }).exportChannel(path.resolve(request.folder, '../../..')); }
  catch (error) { request.warnings.push(`sheet refresh failed: ${(error as Error).message}`); }
}
