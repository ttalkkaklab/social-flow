import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { z } from 'zod';
import { safeAttachmentTarget } from './portal-attachments.js';
import { decisionSchema } from './portal-review-tools.js';
/** Share the record tool's keys and provenance rules, including extension keys. */
export const decisionsSchema = z.array(decisionSchema).max(500).refine(items => new Set(items.map(item => item.key)).size === items.length, 'Duplicate decision keys');
/** Portal list rows use SQL null for absent options/reason; snapshots omit them. */
export const portalDecisionsSchema = z.preprocess(input => {
    if (!Array.isArray(input))
        return input;
    return input.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            return item;
        const decision = { ...item };
        if (decision.options === null)
            delete decision.options;
        if (decision.reason === null)
            delete decision.reason;
        return decision;
    });
}, decisionsSchema);
/** Missing sidecars omit the field; an existing empty array stays explicit. */
export function readDecisions(episodeDir) {
    const file = safeAttachmentTarget(episodeDir, 'storyboard/decisions.json');
    let fd;
    try {
        fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    }
    try {
        const limit = 10 * 1024 * 1024;
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > limit)
            throw new Error('decisions.json must be a regular file of at most 10 MiB.');
        const bytes = Buffer.alloc(limit + 1);
        let size = 0;
        let count = 0;
        while ((count = readSync(fd, bytes, size, bytes.length - size, null)) > 0) {
            size += count;
            if (size > limit)
                throw new Error('decisions.json exceeds 10 MiB.');
        }
        return decisionsSchema.parse(JSON.parse(bytes.subarray(0, size).toString('utf8')));
    }
    finally {
        closeSync(fd);
    }
}
