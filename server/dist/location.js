/** Location tools use the same installed contract as CLI planning and review. */
import * as nodeModule from 'node:module';
import { join } from 'node:path';
import { z } from 'zod';
import { REFERENCES_DIR } from './storyboard.js';
const loader = nodeModule.createRequire(import.meta.url);
export const locationSchema = z.object({
    action: z.enum(['build', 'read', 'sheet', 'bind', 'render', 'approve', 'references', 'camera', 'check', 'receipt', 'review']),
    verdict: z.enum(['pass', 'warning', 'fail']).optional(),
    provider: z.enum(['host', 'api', 'blender']).optional(), callId: z.string().optional(), referencePaths: z.array(z.string()).optional(),
    spec: z.union([z.string(), z.record(z.unknown())]).optional(),
    root: z.string().optional(), manifest: z.string().optional(), output: z.string().optional(),
    stateId: z.string().optional(), cameraId: z.string().optional(),
    board: z.string().optional(), shotId: z.string().optional(),
    mustShow: z.array(z.string()).optional(), continuityGroup: z.string().optional(),
    reviewer: z.string().optional(), notes: z.string().optional(), ready: z.boolean().optional(),
    patch: z.union([z.string(), z.record(z.unknown())]).optional(),
}).strict();
export async function manageLocation(args) {
    const input = locationSchema.parse(args);
    const contract = loader(join(REFERENCES_DIR, 'location-assets.js'));
    return contract.run(input);
}
