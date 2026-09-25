import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { describePortalError, portalClientFor, type FetchLike } from './portal-client.js';

export const REVIEW_TOOL_NAMES = ['portal_decision_list', 'portal_decision_record', 'portal_review_list', 'portal_review_record'] as const;
const reviewCommonInput = z.object({ channel: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(), episodeId: z.string().uuid() });
const decision = z.object({
  key: z.string().min(1).max(200), value: z.unknown().refine(v => v !== undefined && v !== null, 'Decision value is required'),
  options: z.unknown().optional(), chosenBy: z.enum(['user', 'standing', 'auto', 'imported']),
  source: z.string().trim().min(1).max(500), reason: z.string().max(4000).optional(),
  decidedAt: z.string().datetime({ offset: true }).optional(),
});
const review = z.object({
  kind: z.enum(['scenario', 'narration_content', 'narration_wording', 'board', 'content', 'other']),
  reviewer: z.string().trim().min(1).max(200), score: z.number().int().min(0).max(100),
  p0: z.array(z.string().trim().min(1).max(2000)).max(100),
  summary: z.string().trim().min(1).max(8000), source: z.string().trim().min(1).max(500),
});
export const reviewToolSchemas = {
  portal_decision_list: reviewCommonInput.extend({ history: z.boolean().optional() }).strict(),
  portal_decision_record: reviewCommonInput.extend({ decision, baseRevisionNo: z.number().int().min(0) }).strict(),
  portal_review_list: reviewCommonInput.strict(),
  portal_review_record: reviewCommonInput.extend({ review, baseRevisionNo: z.number().int().min(0) }).strict(),
};
const common = { channel: {type:'string',description:'Credential channel slug.'}, episodeId:{type:'string',format:'uuid',description:'Portal episode UUID.'} };
const revision = {type:'integer',minimum:0,description:'headRevisionNo from the last read; stale writes return head_moved.'};
const decisionProperties = {
  key:{type:'string',description:'Existing HITL key, including narration_approval, board_approval, publish_approval; per-shot keys use the stable shot id.'},
  value:{description:'Actual decision value as JSON. Never infer approval from reviewer scores.'},
  options:{description:'Options shown to the decision maker, as JSON.'},
  chosenBy:{type:'string',enum:['user','standing','auto','imported'],description:'Use user only for an explicit human answer, standing only for applicable standing authorization.'},
  source:{type:'string',minLength:1,maxLength:500,description:'Evidence reference, such as the human message id or standing authorization path.'},
  reason:{type:'string',maxLength:4000,description:'Reason stated with the decision.'},decidedAt:{type:'string',format:'date-time',description:'Time of the actual decision, with timezone.'},
};
const reviewProperties = {
  kind:{type:'string',description:'Review phase.',enum:['scenario','narration_content','narration_wording','board','content','other']},
  reviewer:{type:'string',minLength:1,maxLength:200,description:'Name of the reviewer who produced the observation; recorder attribution is assigned by the server.'},
  score:{type:'integer',minimum:0,maximum:100,description:'Actual reviewer score out of 100.'},
  p0:{type:'array',maxItems:100,items:{type:'string',minLength:1,maxLength:2000,description:'One reported P0 defect.'},description:'Actual P0 defects. Supply [] only when none were reported.'},
  summary:{type:'string',minLength:1,maxLength:8000,description:'Actual review conclusion and remaining changes.'},source:{type:'string',minLength:1,maxLength:500,description:'Reference to the actual review output.'},
};
export const REVIEW_TOOLS: Tool[] = REVIEW_TOOL_NAMES.map(name => {
  const record = name.endsWith('_record'), isDecision = name.startsWith('portal_decision_');
  const payload = isDecision ? 'decision' : 'review';
  return { name, title:name.slice(7).replaceAll('_',' '),
    description: isDecision
      ? `${record ? 'Record an evidenced HITL decision' : 'Read current HITL decisions or their history'} for a portal episode. Human approvals require the actual human answer and its source; imported comments and review scores never constitute authorization. Recording creates a checkpoint and returns revisionNo; it does not publish or spend money.`
      : `${record ? 'Append an actual reviewer score, P0 list and source' : 'Read persisted reviewer observations'} for a portal episode. Reviews are bound to the assessed revisionNo, survive later saves, and are separate from human approvals. Recording does not advance the episode revision or status.`,
    annotations:record?{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}:{readOnlyHint:true,openWorldHint:true},
    inputSchema:{type:'object', properties:{...common,
      ...(record ? {baseRevisionNo:revision,[payload]:{type:'object',description:isDecision?'Actual decision with its provenance.':'Actual reviewer observation for the assessed revision.',properties:isDecision?decisionProperties:reviewProperties,required:isDecision?['key','value','chosenBy','source']:['kind','reviewer','score','p0','summary','source'],additionalProperties:false}}
        : isDecision ? {history:{type:'boolean',description:'Include superseded decisions for every key.'}} : {}),
    } as Tool['inputSchema']['properties'], required:['episodeId',...(record?['baseRevisionNo',payload]:[])],additionalProperties:false},
  };
});
export async function runReviewTool(name: typeof REVIEW_TOOL_NAMES[number], args: unknown, fetchImpl?: FetchLike) {
  try {
    const parsed = reviewToolSchemas[name].parse(args);
    const client = await portalClientFor(parsed.channel, fetchImpl);
    if (!client) return { content:[{type:'text' as const,text:'Portal API key is not configured for this channel.'}],isError:true };
    const decisions = name.startsWith('portal_decision_');
    const endpoint = `/episodes/${parsed.episodeId}/${decisions?'decisions':'reviews'}`;
    const body = 'decision' in parsed && 'baseRevisionNo' in parsed ? { decision:parsed.decision,baseRevisionNo:parsed.baseRevisionNo,sourceHost:client.holder }
      : 'review' in parsed && 'baseRevisionNo' in parsed ? { review:parsed.review,baseRevisionNo:parsed.baseRevisionNo,sourceHost:client.holder } : undefined;
    const response = await client.request(body?'POST':'GET',endpoint+('history' in parsed && parsed.history?'?history=1':''),body);
    return {content:[{type:'text' as const,text:JSON.stringify(response.data,null,2)}]};
  } catch(error) {
    return {content:[{type:'text' as const,text:describePortalError(error)}],isError:true};
  }
}
export const REVIEW_ROUTES = Object.fromEntries(REVIEW_TOOL_NAMES.map(name => [name,(args:unknown)=>runReviewTool(name,args)]));
