import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import contractJson from './portal-api-contract.json' with { type: 'json' };
import { describePortalError, portalClientFor, type FetchLike } from './portal-client.js';

type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

type ApiOperation = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  path: string;
  scope: 'global' | 'workspace';
  source: string;
  toolName?: string | null;
  exclusionReason?: string;
  bodyEncoding: 'none' | 'json' | 'raw';
  response: 'json' | 'text' | 'binary';
  inputSchema: JsonSchema;
};

type ApiContract = { version: number; validation: string; operations: ApiOperation[] };
export const PORTAL_API_CONTRACT = contractJson as unknown as ApiContract;
export const PORTAL_API_OPERATIONS = PORTAL_API_CONTRACT.operations.filter(
  (operation): operation is ApiOperation & { toolName: string } => Boolean(operation.toolName),
);

const apiToolName = (operation: ApiOperation & { toolName: string }): string => `portal_${operation.toolName}`;
export const PORTAL_API_TOOL_NAMES = PORTAL_API_OPERATIONS.map(apiToolName);
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function describeSchema(schema: JsonSchema, context: string): JsonSchema {
  const result: JsonSchema = { ...schema };
  if (!result.description) result.description = context;
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, describeSchema(value, `${key} for ${context}`)]),
    );
  }
  if (schema.items) result.items = describeSchema(schema.items, `one item in ${context}`);
  return result;
}

function toolSchema(operation: ApiOperation): Tool['inputSchema'] {
  const context = `${operation.method} ${operation.path}`;
  const source = describeSchema(operation.inputSchema, context);
  return {
    ...source,
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'social-flow credential channel slug. It selects <SNS_TOKEN_DIR>/<channel>/ttalkkakstory.json and is not sent to the portal.',
      },
      ...source.properties,
    },
    required: source.required ?? [],
    additionalProperties: false,
  } as Tool['inputSchema'];
}

export const PORTAL_API_TOOLS: Tool[] = PORTAL_API_OPERATIONS.map((operation) => {
  const readOnly = operation.method === 'GET' || operation.method === 'HEAD';
  const destructive = operation.method === 'DELETE';
  const name = apiToolName(operation);
  return {
    name,
    title: `${operation.method} ${operation.path}`.slice(0, 60),
    description:
      `Call the portal API operation ${operation.method} ${operation.path} with its exact API input fields. ` +
      `The contract comes from ${operation.source}; API authorization and cross-field validation remain authoritative.` +
      (destructive ? ' ⚠️ HITL: never call without user authorization to delete this resource.' : ''),
    annotations: readOnly
      ? { readOnlyHint: true, openWorldHint: true }
      : { readOnlyHint: false, destructiveHint: destructive, idempotentHint: operation.method === 'PUT' || operation.method === 'PATCH', openWorldHint: true },
    inputSchema: toolSchema(operation),
  };
});

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function assertTopLevel(operation: ApiOperation, args: Record<string, unknown>): void {
  const properties = new Set(['channel', ...Object.keys(operation.inputSchema.properties ?? {})]);
  const unknown = Object.keys(args).filter((key) => !properties.has(key));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  const missing = (operation.inputSchema.required ?? []).filter((key) => args[key] === undefined);
  if (missing.length) throw new Error(`Missing required argument(s): ${missing.join(', ')}`);
}

function encoded(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function requestPath(operation: ApiOperation, args: Record<string, unknown>, holder: string): string {
  const pathParameters = new Set<string>();
  const pathname = operation.path.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    pathParameters.add(key);
    const value = args[key];
    if (value === undefined || value === null || value === '') throw new Error(`Missing path argument: ${key}`);
    const text = String(value);
    if (text === '.' || text === '..' || /[\\/\x00-\x1f\x7f]/.test(text)) throw new Error(`Invalid path argument: ${key}`);
    return encodeURIComponent(text);
  });
  const queryInput = args.query;
  if (queryInput !== undefined && (typeof queryInput !== 'object' || queryInput === null || Array.isArray(queryInput))) {
    throw new Error('query must be an object.');
  }
  const query = { ...((queryInput as Record<string, unknown> | undefined) ?? {}) };
  const queryProperties = operation.inputSchema.properties?.query?.properties ?? {};
  if ('holder' in queryProperties && query.holder === undefined) query.holder = holder;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) search.append(key, encoded(item));
    else search.set(key, encoded(value));
  }
  const suffix = search.toString();
  return `${pathname}${suffix ? `?${suffix}` : ''}`;
}

export async function runPortalApiTool(name: string, input: unknown, fetchImpl?: FetchLike) {
  const operation = PORTAL_API_OPERATIONS.find((candidate) => apiToolName(candidate) === name);
  if (!operation) return fail(`Unknown portal API tool: ${name}`);
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Arguments must be an object.');
    const args = input as Record<string, unknown>;
    assertTopLevel(operation, args);
    requestPath(operation, args, 'validation');
    const headers: Record<string, string> = {};
    if (typeof args.range === 'string') headers.range = args.range;
    if (typeof args.ifRange === 'string') headers['if-range'] = args.ifRange;
    if (typeof args.ifNoneMatch === 'string') headers['if-none-match'] = args.ifNoneMatch;
    if (typeof args.sha256 === 'string') headers['x-sha-256'] = args.sha256;
    if (args.provenance !== undefined) headers['x-attachment-provenance'] = encodeURIComponent(JSON.stringify(args.provenance));
    const file = typeof args.file === 'string' ? args.file : undefined;
    if (file) {
      if (!path.isAbsolute(file)) throw new Error('file must be an absolute local path.');
      const fileStat = statSync(file);
      if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) {
        throw new Error('Upload must be a regular file of at most 100 MiB.');
      }
    }
    const body = operation.bodyEncoding === 'json'
      ? args.body
      : operation.bodyEncoding === 'raw'
        ? file ? readFileSync(file) : undefined
        : undefined;
    if (operation.bodyEncoding === 'raw' && !file) throw new Error('Raw upload requires file.');
    const targetFile = typeof args.targetFile === 'string' ? args.targetFile : undefined;
    if (targetFile && !path.isAbsolute(targetFile)) throw new Error('targetFile must be an absolute local path.');
    const channel = typeof args.channel === 'string' ? args.channel : undefined;
    const client = await portalClientFor(channel, fetchImpl);
    if (!client) return fail('Portal API key is not configured for this channel.');
    const response = await client.requestRaw({
      method: operation.method,
      path: requestPath(operation, args, client.holder),
      scope: operation.scope,
      response: operation.response,
      body,
      contentType: typeof args.contentType === 'string' ? args.contentType : undefined,
      headers,
      targetFile,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ status: response.status, data: response.data }, null, 2) }] };
  } catch (error) {
    return fail(describePortalError(error));
  }
}

export const PORTAL_API_ROUTES: Record<string, (args: unknown) => Promise<unknown>> = Object.fromEntries(
  PORTAL_API_TOOL_NAMES.map((name) => [name, (args: unknown) => runPortalApiTool(name, args)]),
);
