import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { CHANNEL_SLUG_RE } from './config.js';

const nonempty = z.string().trim().min(1);
const channelSchema = z.string().regex(CHANNEL_SLUG_RE);
const AXES = ['voice', 'purpose', 'flow'] as const;
type Axis = typeof AXES[number];
const whitespace = (s: string) => s.replace(/\s+/gu, ' ').trim();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const draftSchema = z.object({
  channel: channelSchema, body: nonempty, selfReply: nonempty.optional(),
  surface: z.enum(['post', 'reply']).default('post'), replyToId: nonempty.optional(),
  readerMessage: nonempty, purpose: z.enum(['fun', 'moved', 'info', 'empathy']),
  purposeEvidence: nonempty, flow: z.object({ hook: nonempty, turn: nonempty, residue: nonempty }),
  comicElements: z.array(nonempty).min(1),
  submitter: nonempty.optional(), submitterContext: nonempty.optional(),
});
export const reviewSchema = z.object({
  draftId: nonempty, bodyHash: hashSchema, axis: z.enum(AXES),
  score: z.number().finite().min(0).max(100), reasons: z.array(nonempty).min(1),
  improvements: z.array(nonempty).min(1), reviewer: nonempty, reviewerContext: nonempty,
  findings: z.array(z.object({ quote: nonempty, issue: nonempty, severity: z.enum(['pass', 'P0', 'P1', 'P2']) })).min(1),
});
type Review = z.infer<typeof reviewSchema> & { selfReview: boolean | null; sameContext: boolean | null };
type Draft = z.infer<typeof draftSchema> & {
  draftId: string; bodyHash: string; reviews: Partial<Record<Axis, Review>>;
};
const normalize = (s: string) => s.normalize('NFC').replace(/\r\n?/g, '\n').trim();
export function threadsBodyHash(body: string, selfReply = ''): string {
  return createHash('sha256').update(JSON.stringify([normalize(body), normalize(selfReply)])).digest('hex');
}
function directory(channel: string): string {
  return join(process.cwd(), 'data', channelSchema.parse(channel), 'growth', 'threads');
}
function draftLocation(id: string): { channel: string; file: string } {
  const match = /^([a-z0-9][a-z0-9-]*)\.([a-f0-9-]{36})$/.exec(id);
  if (!match || !z.string().uuid().safeParse(match[2]).success) throw new Error('Invalid draftId');
  return { channel: match[1], file: join(directory(match[1]), 'drafts', `${match[2]}.json`) };
}
function audit(channel: string, tool: string, result: string, details: Record<string, unknown> = {}): void {
  const dir = directory(channel);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'gate-log.jsonl'), JSON.stringify({ at: new Date().toISOString(), tool, result, ...details }) + '\n', { mode: 0o600 });
}
function save(draft: Draft): void {
  const { file } = draftLocation(draft.draftId);
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(draft), { mode: 0o600 });
  renameSync(temp, file);
}
// Review writes contain no await: each process reads and replaces its draft atomically.
function load(id: string): Draft {
  const value = JSON.parse(readFileSync(draftLocation(id).file, 'utf8')) as Draft;
  draftSchema.parse(value);
  if (value.draftId !== id || value.channel !== draftLocation(id).channel || threadsBodyHash(value.body, value.selfReply) !== value.bodyHash) {
    throw new Error('Draft body hash mismatch; create and review a new draft');
  }
  return value;
}
/** Audit invalid input too; unresolvable channels use data/unknown/growth/threads. */
export function gateCall<T>(tool: string, args: unknown, action: () => T): T {
  const raw = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  let channel = channelSchema.safeParse(raw.channel).success ? String(raw.channel) : 'unknown';
  if (typeof raw.draftId === 'string') {
    try { channel = draftLocation(raw.draftId).channel; } catch { /* audit invalid id in the fallback directory */ }
  }
  try {
    const result = action();
    audit(channel, tool, 'accepted', { draftId: raw.draftId, axis: raw.axis });
    return result;
  } catch (error) {
    audit(channel, tool, 'rejected', { draftId: raw.draftId, reason: error instanceof Error ? error.message : 'Gate failed' });
    throw error;
  }
}
export function createThreadsDraft(args: unknown): { draftId: string; bodyHash: string } {
  return gateCall('threads_draft_create', args, () => {
    const input = draftSchema.strict().parse(args);
    if ((input.surface === 'reply') !== Boolean(input.replyToId)) throw new Error('Reply drafts require replyToId; post drafts must omit it');
    if (!whitespace(input.body).includes(whitespace(input.purposeEvidence))) throw new Error('Purpose evidence quote not present in draft body');
    const draftId = `${input.channel}.${randomUUID()}`;
    const bodyHash = threadsBodyHash(input.body, input.selfReply);
    save({ ...input, draftId, bodyHash, reviews: {} });
    audit(input.channel, 'threads_draft_create', 'created', { draftId, bodyHash, submitter: input.submitter ?? null, submitterContext: input.submitterContext ?? null });
    return { draftId, bodyHash };
  });
}
export function submitThreadsReview(args: unknown): Review {
  return gateCall('threads_review_submit', args, () => {
    const input = reviewSchema.strict().parse(args);
    const draft = load(input.draftId);
    if (input.bodyHash !== draft.bodyHash) throw new Error('Review body hash mismatch');
    if (draft.surface === 'reply' && input.axis !== 'voice') throw new Error('Reply drafts use voice review only');
    const surfaces = (input.axis !== 'voice' ? [draft.body] : [draft.body, draft.selfReply ?? '']).map(whitespace);
    for (const finding of input.findings) {
      if (!surfaces.some((body) => body.includes(whitespace(finding.quote)))) throw new Error('Finding quote not present in draft');
    }
    const review = { ...input, selfReview: draft.submitter ? input.reviewer === draft.submitter : null,
      sameContext: draft.submitterContext ? input.reviewerContext === draft.submitterContext : null };
    draft.reviews[input.axis] = review;
    save(draft);
    audit(draft.channel, 'threads_review_submit', 'reviewed', review);
    return review;
  });
}
export function checkThreadsGate(input: { channel?: string; draftId?: string; caption: string; selfReply?: string; replyToId?: string }): { bodyHash: string } {
  return gateCall('threads_publish', input, () => {
    if (!input.draftId) throw new Error('Growth publishing requires draftId');
    const draft = load(input.draftId);
    if (input.channel !== draft.channel) throw new Error('Draft channel mismatch');
    if (input.replyToId !== draft.replyToId) throw new Error('Draft reply target mismatch');
    const bodyHash = threadsBodyHash(input.caption, input.selfReply);
    if (bodyHash !== draft.bodyHash) throw new Error('Publish body hash mismatch');
    let limits: Record<Axis, number>;
    try {
      limits = z.object({ voice: z.number().finite().min(0).max(100), purpose: z.number().finite().min(0).max(100), flow: z.number().finite().min(0).max(100) })
        .parse(JSON.parse(readFileSync(join(directory(draft.channel), 'gate.json'), 'utf8')));
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Gate thresholds not configured (기준점 미설정): gate.json required'); throw error; }
    const axes: readonly Axis[] = draft.surface === 'reply' ? ['voice'] : AXES;
    for (const axis of axes) {
      const review = draft.reviews[axis];
      if (!review) throw new Error(`Missing ${axis} review`);
      reviewSchema.parse(review);
      if (review.draftId !== draft.draftId || review.axis !== axis) throw new Error('Review identity mismatch');
      if (review.findings.some((finding) => finding.severity === 'P0')) throw new Error(`${axis} review has unresolved P0`);
      if (review.bodyHash !== bodyHash) throw new Error(`${axis} review hash mismatch`);
      if (review.score < limits[axis]) throw new Error(`${axis} score ${review.score} below ${limits[axis]}`);
    }
    const checker = resolve(dirname(fileURLToPath(import.meta.url)), '../../skills/platform-guide/references/check-style.py');
    for (const [body, surface] of [[input.caption, input.replyToId ? 'reply' : 'threads'], [input.selfReply, 'reply']]) {
      if (!body) continue;
      const run = spawnSync('python3', [checker, '--surface', surface!, '-'], { input: body, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
      if (run.error || (run.status !== 0 && run.status !== 1)) throw new Error(`Style check failed (${surface}, exit ${run.status}): ${run.error?.message ?? run.stdout}`);
      if (run.status === 1) console.warn(`Style check warning (${surface}, exit 1): ${run.stdout}`);
    }
    return { bodyHash };
  });
}

export function checkThreadsEpisode(input: {
  channel?: string; episodeRef?: string; caption: string; selfReply?: string;
  imageUrl?: string; videoUrl?: string; linkUrl?: string; replyToId?: string;
}): void {
  gateCall('threads_publish', input, () => {
    const channel = channelSchema.parse(input.channel);
    const topic = channelSchema.parse(input.episodeRef);
    const root = realpathSync(join(process.cwd(), 'data', channel, 'episodes'));
    const episode = realpathSync(join(root, topic));
    if (dirname(episode) !== root || !statSync(episode).isDirectory()) throw new Error('Invalid episode directory');
    const board = realpathSync(join(episode, 'storyboard', 'scenes.js'));
    if (!board.startsWith(episode + '/') || !statSync(board).isFile()) throw new Error('Missing episode storyboard');
    const approvalPath = realpathSync(join(episode, 'threads-publish-approval.json'));
    if (dirname(approvalPath) !== episode) throw new Error('Invalid episode approval path');
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
    if (approval.approved !== true) throw new Error('Episode publishing approval required');
    for (const key of ['caption', 'selfReply', 'imageUrl', 'videoUrl', 'linkUrl', 'replyToId'] as const) {
      if ((approval[key] ?? '') !== (input[key] ?? '')) throw new Error(`Episode approval mismatch: ${key}`);
    }
  });
}
