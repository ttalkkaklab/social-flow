import * as fs from 'node:fs';
import path from 'node:path';
import { atomicJson } from './routing-files.js';
export { atomicJson } from './routing-files.js';
import { fileURLToPath } from 'node:url';
/** Import old video spend exactly once. Unknown historical costs require explicit reconciliation. */
function historicalSpend(episode) {
    const events = path.join(episode, '.work/events.jsonl');
    const tally = path.join(episode, '.work/cost-tally.tsv');
    if (!fs.existsSync(events)) {
        if (fs.existsSync(tally) && fs.readFileSync(tally, 'utf8').trim())
            throw new Error('Historical cost tally needs reconciliation before routing migration');
        return 0;
    }
    const prices = new Map(fs.readFileSync(fileURLToPath(new URL('../../skills/autoproduce/references/prices.tsv', import.meta.url)), 'utf8')
        .split('\n').filter(line => line && !line.startsWith('#')).map(line => { const cells = line.split('\t'); return [cells[0], Number(cells[2])]; }));
    let total = 0;
    const quantities = new Map();
    for (const line of fs.readFileSync(events, 'utf8').split('\n').filter(Boolean)) {
        const event = JSON.parse(line);
        if (['astra_genai_text2img', 'astra_genai_edit'].includes(event.tool))
            continue;
        if (!/^(veo_|seedance_|omni_|mlx_video|ltx_video|fasth3_omni_|astra_)/.test(event.tool || ''))
            continue;
        const price = prices.get(event.key);
        if (typeof event.quantity !== 'number' || !Number.isFinite(event.quantity) || event.quantity < 0 || price === undefined || !Number.isFinite(price))
            throw new Error('Historical video spend is unknown; reconcile before new spending');
        total += price * event.quantity;
        quantities.set(event.key, (quantities.get(event.key) ?? 0) + event.quantity);
    }
    if (fs.existsSync(tally)) {
        const tallied = new Map();
        for (const line of fs.readFileSync(tally, 'utf8').split('\n')) {
            if (!line.trim() || line.trimStart().startsWith('#'))
                continue;
            const [key, quantity] = line.split('\t');
            if (!/^(veo\.|seedance\.|omni\.|video\.)/.test(key))
                continue;
            const amount = Number(quantity);
            if (!quantity?.trim() || !Number.isFinite(amount) || amount < 0)
                throw new Error('Invalid historical video tally');
            tallied.set(key, (tallied.get(key) ?? 0) + amount);
        }
        for (const [key, amount] of tallied) {
            if (amount > (quantities.get(key) ?? 0) + 1e-9)
                throw new Error('Historical tally has video spending absent from events; reconcile before migration');
        }
    }
    return total;
}
/** Short cross-process transaction. Never steal an existing lock or hold it during network I/O. */
export function videoTransaction(episode, update) {
    const directory = path.join(episode, '.work/video-routing');
    fs.mkdirSync(directory, { recursive: true });
    const lock = path.join(directory, 'state.lock');
    let fd;
    try {
        fd = fs.openSync(lock, 'wx', 0o600);
    }
    catch {
        throw new Error('video_state_busy: another transaction holds the lock; retry this local operation');
    }
    try {
        const file = path.join(directory, 'state.json');
        const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, openingSpendUsd: historicalSpend(episode), jobs: {} };
        if (state.version !== 1 || !state.jobs || typeof state.jobs !== 'object' || Array.isArray(state.jobs))
            throw new Error('Invalid video state; repair explicitly');
        if (!Number.isFinite(state.openingSpendUsd ?? 0) || (state.openingSpendUsd ?? 0) < 0)
            throw new Error('Invalid opening spend');
        for (const job of Object.values(state.jobs)) {
            if (!job || !Number.isFinite(job.reserveUsd) || job.reserveUsd < 0 ||
                (job.settledUsd !== undefined && (!Number.isFinite(job.settledUsd) || job.settledUsd < 0)) ||
                !['reserved', 'submitting', 'submitted', 'submission_unknown', 'completed'].includes(job.status))
                throw new Error('Invalid video job; cannot calculate remaining budget');
        }
        const result = update(state);
        atomicJson(file, state);
        return result;
    }
    finally {
        fs.closeSync(fd);
        fs.unlinkSync(lock);
    }
}
