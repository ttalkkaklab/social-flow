import { localVideoStrategy } from './local-video-models.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { priceOf } from './usage-ledger.js';
import { SEEDANCE_MODEL_SPECS } from './seedance-client.js';
import { MINIMAX_MODELS } from './minimax-video.js';
const PRICE_FILE = fileURLToPath(new URL('../../skills/autoproduce/references/prices.tsv', import.meta.url));
const TOKEN_RATES = {
    'dreamina-seedance-2-5-260628': [10.7, 6.4, 11.7, 7, 4.7, 2.9],
    'dreamina-seedance-2-5-flash-261115': [7, 4.3],
    'dreamina-seedance-2-0-260128': [7, 4.3, 7.7, 4.7, 4, 2.4],
    'dreamina-seedance-2-0-fast-260128': [5.6, 3.3],
    'dreamina-seedance-2-0-mini-260615': [3.5, 2.1],
};
const roundUp = (n) => Math.ceil(n * 1e6) / 1e6;
export function quoteVideo(tool, args) {
    const prices = readFileSync(PRICE_FILE, 'utf8');
    const revision = createHash('sha256').update(prices + JSON.stringify(TOKEN_RATES)).digest('hex');
    if (tool.startsWith('astra_genai_')) {
        if (typeof args.reserveUsd !== 'number' || !Number.isFinite(args.reserveUsd) || args.reserveUsd < 0)
            throw new Error('genai_quote_required: supply an explicit reserveUsd; no published gateway price is assumed');
        return { reserveUsd: args.reserveUsd, estimatedUsd: args.reserveUsd, basis: 'Caller reservation; gateway pricing unverified, not a provider invoice cap', revision };
    }
    if (tool.startsWith('astra_') || localVideoStrategy(tool))
        return { reserveUsd: 0, estimatedUsd: 0, basis: 'Self-hosted: no API charge; infrastructure excluded', revision };
    if (tool.startsWith('seedance_')) {
        const model = String(args.model), resolution = String(args.resolution);
        const spec = SEEDANCE_MODEL_SPECS[model];
        const hasVideo = ['referenceVideoPaths', 'referenceVideoUrls', 'referenceVideoTaskIds'].some(k => Array.isArray(args[k]) && args[k].length);
        const rates = TOKEN_RATES[model];
        const index = resolution === '4k' ? 4 : resolution === '1080p' ? 2 : 0;
        const tokenRate = rates?.[index + (hasVideo ? 1 : 0)];
        if (!spec || !Number.isFinite(tokenRate))
            throw new Error('Price unavailable for selected Seedance deployment');
        const pixels = { '480p': 864 * 512, '720p': 1344 * 768, '1080p': 1984 * 1152, '4k': 3904 * 2240 }[resolution];
        const seconds = args.durationSeconds === -1 ? spec.duration[1] : Number(args.durationSeconds);
        // Reserve the entire permitted reference duration, including remote clips we cannot measure.
        // This is an estimate bound against the pinned rate sheet, not a vendor-enforced dollar cap.
        const inputSeconds = hasVideo ? spec.referenceVideos.totalSeconds : 0;
        const estimatedUsd = roundUp((seconds + inputSeconds) * pixels * 24 / 1024 * tokenRate / 1e6);
        return { estimatedUsd, reserveUsd: estimatedUsd, tokenRate, revision,
            basis: 'BytePlus token rates checked 2026-11-22; padded pixel estimate and maximum reference duration; settle completion_tokens' };
    }
    const price = priceOf(tool, args);
    const rate = (key) => {
        const row = prices.split('\n').find(line => line.startsWith(key + '\t'))?.split('\t');
        if (!row || !['official', 'derived', 'measured'].includes(row[3]) || !Number.isFinite(Number(row[2])))
            throw new Error('Price unverified; no automatic zero-cost fallback');
        return { usd: Number(row[2]), grade: row[3], note: row[4] };
    };
    if (price.quantity === null)
        throw new Error('Price unverified; no automatic zero-cost fallback');
    const row = rate(price.key);
    let estimatedUsd = row.usd * price.quantity, extra = '';
    // MiniMax bills input pictures past its free allowance (first/last frames and references alike).
    if (tool.startsWith('minimax_')) {
        const model = String(args.model ?? 'MiniMax-H3');
        const images = [args.sourceImagePath, args.lastImagePath].filter(Boolean).length + (Array.isArray(args.referenceImagePaths) ? args.referenceImagePaths.length : 0);
        const paid = Math.max(0, images - (MINIMAX_MODELS[model]?.freeImages ?? 0));
        if (paid) {
            estimatedUsd += paid * rate(`minimax.${model.toLowerCase()}.image`).usd;
            extra = `; ${paid} paid input image(s)`;
        }
    }
    // Float sums (5 × 0.08 + 2 × 0.04) land a hair above the cent; trim that before rounding up.
    estimatedUsd = roundUp(Math.round(estimatedUsd * 1e9) / 1e9);
    return { estimatedUsd, reserveUsd: estimatedUsd, revision, basis: `${price.key}; ${row.grade}; ${price.note || row.note}${extra}` };
}
