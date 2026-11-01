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
const shared = (file) => load(`../../skills/${file}`);
export const characterPanelSchema = z.object({
    identityPath: z.string().min(1).describe('<channel>/assets/characters/<id>/identity.md'),
    view: z.enum(['face', 'front', 'back']),
    references: z.array(z.string().min(1)).max(4).optional()
        .describe('Pictures to edit from, in order; default: none for face, the face panel for front, the front panel for back'),
    negativePrompt: z.string().trim().min(1).max(1000).optional()
        .describe('Extra things to keep out, added to the view\'s default negative prompt, e.g. beard'),
    reserveUsd: z.number().finite().nonnegative().optional(),
}).strict();
// character-panels.md: 1:1 face with the head at 60-75 % of the height; 2:3 headless body panels at 80-90 %.
const FRAMING = {
    face: { size: [1024, 1024], text: 'Close head portrait of one character, front facing, neutral expression, the complete head and hair visible, the head filling 70 percent of the image height.' },
    front: { size: [1024, 1536], text: 'Headless front costume mannequin of this character: nothing above the neck, from the neck and shoulders down to the shoes, neutral stance, arms relaxed, the subject filling 85 percent of the image height.' },
    back: { size: [1024, 1536], text: 'Turn this headless costume mannequin around 180 degrees so its back faces the camera, keeping the same costume. Show it from directly behind, from the neck down to the heels: the back of the garments, straps and belt and the heels of the footwear; anything worn on one side now sits on the other side of the image. Nothing above the neck. The subject fills 85 percent of the image height.' },
};
// The body panels are edited from the face panel, which pulls a head back in unless the head is ruled out.
// The back is edited from the front alone with a turn-around instruction: a face reference brings the head back,
// and "keep this character" keeps the front's pose, so its negative also rules out what only the front shows.
const BODY = 'head, face, hair, ears, tusks, helmet, text, watermark, collage, multiple views, border';
const NEGATIVE = { face: 'text, watermark, collage, multiple views, border', front: BODY,
    back: `front view, chest, belt buckle, palms facing camera, toes facing camera, ${BODY}` };
// ponytail: only the GenAI gateway's 800-character prompt cap is known here; add others when an adapter declares one.
const PROMPT_LIMIT = { 'astra-genai': 800 };
/** Plan inputs for one panel: the assembled prompt, the edit sources and the adapter call. */
export function characterPanelRequest(raw) {
    const args = characterPanelSchema.parse(raw);
    const identityPath = path.resolve(args.identityPath), folder = path.dirname(identityPath), id = path.basename(folder);
    if (path.basename(identityPath) !== 'identity.md' || path.basename(path.dirname(folder)) !== 'characters' || path.basename(path.dirname(path.dirname(folder))) !== 'assets')
        throw new Error('character_path_invalid: identityPath must be <channel>/assets/characters/<id>/identity.md');
    const { identityCharacter, panelPrompt } = shared('_shared/character-identity.js');
    const character = identityCharacter(readFileSync(identityPath, 'utf8'), { ready: false });
    const panelsFile = path.join(folder, 'panels.json');
    const panels = (existsSync(panelsFile) ? JSON.parse(readFileSync(panelsFile, 'utf8')).panels : undefined) ?? {};
    const panelFile = (view) => {
        const file = panels[view]?.file;
        if (!file || !existsSync(path.join(folder, file)))
            throw new Error(`character_panel_missing: make ${id}'s ${view} panel first, or pass references`);
        return path.join(folder, file);
    };
    const references = (args.references ?? (args.view === 'face' ? [] : args.view === 'front' ? ['face'] : ['front']).map(panelFile))
        .map((file) => path.resolve(folder, file));
    for (const file of references)
        if (!existsSync(file))
            throw new Error(`image_input_missing: ${file}`);
    const { findImageWorkspace, readImageContext } = shared('_shared/image-selection.js');
    const workspace = findImageWorkspace(folder);
    if (!workspace)
        throw new Error('image_setup_required: no .social-flow/models.json above this character');
    const preset = shared('_shared/model-settings.js').readSettings(workspace).config?.style?.preset;
    const { STYLES } = shared('storyboard/references/production-mode.js');
    const style = preset && STYLES[preset] ? STYLES[preset].prompt : '';
    const words = panelPrompt(character, args.view);
    const compose = (withStyle) => [references.length && args.view !== 'back' ? 'Keep this exact character from the reference images.' : '', FRAMING[args.view].text,
        `Character: ${words.text}.`, withStyle ? style : '', 'Soft even studio lighting, plain neutral grey background. One view only. No text, watermark, collage or border.'].filter(Boolean).join(' ');
    // A prompt over the adapter's cap drops the style sentence.
    const limit = PROMPT_LIMIT[readImageContext(workspace, `${id}-${args.view}`).selection.engine] ?? Infinity;
    const full = compose(true), prompt = full.length <= limit ? full : compose(false);
    const [width, height] = FRAMING[args.view].size;
    const negativePrompt = [NEGATIVE[args.view], args.negativePrompt].filter(Boolean).join(', ');
    const call = imageCall({ directory: workspace, assetId: `${id}-${args.view}`, inputs: references, prompt, negativePrompt, width, height, outDir: folder, stem: `${id}-${args.view}`, what: 'this panel' });
    const warnings = [...(call.negativeSent ? [] : ['the saved image model takes no negative prompt; only the prompt keeps the head out']), ...words.skipped.map((field) => `${field} is not English and stays out of the prompt — write it in English on the sheet`),
        ...(prompt.length > limit ? [`the prompt is ${prompt.length} characters, over the image model's ${limit}; shorten the sheet's physical fields`] : [])];
    return { workspace, folder, id, view: args.view, panelsFile, prompt, negativePrompt: call.negativeSent ? negativePrompt : undefined, warnings, ...call };
}
/** Record a generated panel in panels.json; the other slots stay. */
export function recordCharacterPanel(request) {
    const doc = existsSync(request.panelsFile) ? JSON.parse(readFileSync(request.panelsFile, 'utf8')) : { schemaVersion: 1, panels: {} };
    doc.panels = { ...doc.panels, [request.view]: { file: path.basename(request.file), purpose: 'character_reference', view: request.view, framing: { status: 'not_reviewed' } } };
    writeFileSync(request.panelsFile, JSON.stringify(doc, null, 2) + '\n');
    try {
        shared('channel/references/review-library.js').exportChannel(path.resolve(request.folder, '../../..'));
    }
    catch (error) {
        request.warnings.push(`sheet refresh failed: ${error.message}`);
    }
}
