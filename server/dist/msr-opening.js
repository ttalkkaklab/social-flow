import { z } from 'zod';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
export const openingPositionsSchema = z.array(z.object({
    character: z.string().trim().min(1).describe('Cast ID, or an English character name for a standalone render.'),
    images: z.array(z.number().int().min(1).max(4)).describe('1-based subject image numbers for this person, including clothing panels. Use [] for a bystander without a reference.'),
    position: z.string().trim().min(1).refine(value => !nonEnglishOutsideQuotes(value), 'Describe the opening position in English')
        .describe('Where the viewer sees this person at the start: side, depth, posture or orientation, and a visible landmark. Describe an off-screen start explicitly.'),
}).strict(), { required_error: 'openingPositions required: inspect the opening image and describe each character and its reference images' }).describe('Required with MSR references. Identify every character in the opening scene, including silent listeners. Use [] only for a character-free scene.');
export function openingPrompt(prompt, positions = []) {
    if (!positions.length)
        return prompt;
    const header = positions.map(({ character, images, position }) => {
        const refs = images.map(index => 'Image ' + index).join(', ');
        return character + (refs ? ' (' + refs + ')' : '') + ': ' + position;
    });
    const prefix = 'Opening frame, from the viewer’s perspective:\n' + header.join('\n') + '\n\n';
    return prompt.startsWith(prefix) ? prompt : prefix + prompt;
}
export function validateOpening(prompt, positions, references, issue) {
    if (!positions) {
        issue('openingPositions required: match each character to the opening frame and their subject images');
        return;
    }
    const subjects = references.filter(ref => !ref.background);
    const mapped = new Set();
    const names = new Set();
    for (const { character, images } of positions) {
        if (names.has(character))
            issue('openingPositions: list each character once');
        names.add(character);
        for (const index of images) {
            if (!subjects[index - 1] || subjects[index - 1].nonCharacter || mapped.has(index))
                issue('openingPositions: invalid, non-character or repeated subject Image ' + index);
            mapped.add(index);
        }
    }
    subjects.forEach((ref, i) => {
        if (!mapped.has(i + 1) && (!ref.nonCharacter || ref.audioPath || ref.audioUri))
            issue('openingPositions: identify the character in Image ' + (i + 1) + ' or mark an object reference nonCharacter:true');
    });
    if (openingPrompt(prompt, positions).length > 2000)
        issue('The prompt including openingPositions exceeds 2000 characters; shorten the action or placement descriptions');
}
