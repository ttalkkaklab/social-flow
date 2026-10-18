/** Location tools use the same installed contract as CLI planning and review. */
import * as nodeModule from 'node:module';
import { join } from 'node:path';
import { z } from 'zod';
import { requireWorkflow } from './production-workflow.js';
import { REFERENCES_DIR } from './storyboard.js';
const loader = nodeModule.createRequire(import.meta.url);
const actorPoseSchema = z.object({
  position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  rotationZDeg: z.number().finite(),
  gazeTarget: z.string().min(1).optional(),
  holds: z.array(z.string().min(1)).optional(),
}).strict();
const blockingSchema = z.object({
  actors: z.array(z.object({
    id: z.string().min(1), height: z.number().min(0.1).max(10),
    color: z.string().regex(/^#[a-f0-9]{6}$/i),
    start: actorPoseSchema, end: actorPoseSchema.optional(),
  }).strict()).max(32),
  axis: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
}).strict();
export const locationSchema = z.object({
  action: z.enum(['build', 'read', 'sheet', 'bind', 'render', 'previz', 'approve', 'references', 'camera', 'check', 'receipt', 'review']),
  verdict: z.enum(['pass','warning','fail']).optional(),
  provider: z.enum(['host','api','blender']).optional(), callId: z.string().optional(), referencePaths: z.array(z.string()).optional(),
  spec: z.union([z.string(), z.record(z.unknown())]).optional(),
  root: z.string().optional(), manifest: z.string().optional(), output: z.string().optional(),
  stateId: z.string().optional(), endStateId: z.string().optional(), cameraId: z.string().optional(),
  board: z.string().optional(), shotId: z.string().optional(),
  mustShow: z.array(z.string()).optional(), continuityGroup: z.string().optional(),
  blocking: blockingSchema.optional(), continuityBreak: z.string().trim().min(1).optional(),
  seconds: z.number().finite().positive().optional(), fps: z.number().int().min(24).max(60).optional(),
  reviewer: z.string().optional(), notes: z.string().optional(), ready: z.boolean().optional(),
  patch: z.union([z.string(), z.record(z.unknown())]).optional(),
}).strict();
export async function manageLocation(args: unknown): Promise<unknown> {
  const input = locationSchema.parse(args);
  if (input.action === 'render' && input.board) requireWorkflow(input.board, 'composition', input.shotId);
  const contract = loader(join(REFERENCES_DIR, 'location-assets.js')) as {run(args: unknown): Promise<unknown>};
  return contract.run(input);
}
