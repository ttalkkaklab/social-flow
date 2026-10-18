/** Model contracts verified 2026-10-18. Provider features and installed adapters are distinct. */
export const GPT_IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini',
    'gpt-image-2-2026-04-21', 'gpt-image-1.5-2025-12-16'];
export function gptImageFamily(model) {
    if (model === 'gpt-image-2-2026-04-21')
        return 'gpt-image-2';
    if (model === 'gpt-image-1.5-2025-12-16')
        return 'gpt-image-1.5';
    return model;
}
export const GPT_IMAGE_CONTRACTS = {
    'gpt-image-2': { shutdown: null, flexibleSize: true, transparency: 'preview', fidelity: [], rates: { text: 5, image: 8, output: 30 } },
    'gpt-image-1.5': { shutdown: '2026-12-01', flexibleSize: false, transparency: 'supported', fidelity: ['low', 'high'], rates: { text: 5, image: 8, output: 32 } },
    'gpt-image-1': { shutdown: '2026-10-23', flexibleSize: false, transparency: 'supported', fidelity: ['low', 'high'], rates: { text: 5, image: 10, output: 40 } },
    'gpt-image-1-mini': { shutdown: '2026-12-01', flexibleSize: false, transparency: 'supported', fidelity: ['low'], rates: { text: 2, image: 2.5, output: 8 } },
};
export function gptImageContract(model) {
    return GPT_IMAGE_CONTRACTS[gptImageFamily(model)];
}
export function assertImageModelAvailable(model, now = new Date()) {
    const contract = gptImageContract(model);
    if (!contract)
        throw new Error('image_model_unsupported: ' + model);
    if (contract.shutdown && now.toISOString().slice(0, 10) >= contract.shutdown)
        throw new Error('image_model_retired: ' + model + '; select a replacement explicitly');
}
export function mlxImageFamily(model = '') {
    if (/qwen.*image.*2[.-]1/i.test(model))
        return 'qwen-2.1';
    if (/mage[-_]?flow/i.test(model))
        return /edit/i.test(model) ? 'mage-edit' : 'mage';
    if (/krea[-_]?2/i.test(model))
        return 'krea';
    if (/flux[.-]?2[-_]?klein/i.test(model))
        return 'flux-klein';
    return 'unknown';
}
/** Unknown packs keep basic text generation, but advanced capabilities must be registered. */
export function validateMlxImageOperation(model, operation, args) {
    const family = mlxImageFamily(model);
    if (operation === 'edit' && !['flux-klein', 'mage-edit', 'qwen-2.1'].includes(family))
        throw new Error('image_operation_unsupported: select an identified editing pack');
    if (operation === 'variation' && !['flux-klein', 'krea'].includes(family))
        throw new Error('image_operation_unsupported: this pack has no verified strength-based variation');
    if (args.transparent === true && family !== 'qwen-2.1')
        throw new Error('image_transparency_unsupported: transparent requires Qwen-Image-2.1');
    const refs = Array.isArray(args.refImagePaths) ? args.refImagePaths.length : 0;
    if (refs > (family === 'qwen-2.1' ? 9 : 3))
        throw new Error('image_reference_limit');
    if (family === 'qwen-2.1' && /turbo/i.test(model || '') && args.steps !== undefined && args.steps !== 8)
        throw new Error('image_schedule_fixed: Qwen Turbo uses its saved 8-step schedule');
}
