#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { SNS_CHANNEL_BY_TOOL, TOOLS } from './tools.js';
import { ROUTES } from './handlers.js';
import { enabledChannels } from './sns-client.js';

const server = new Server(
  { name: 'social-flow', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

// 채널별 게시 툴은 자격증명 파일이 있는 채널만 노출한다 — 요청 시점 평가라
// 토큰 파일 추가가 서버 재시작 없이 반영된다. 핸들러는 전부 유지되므로 숨은
// 툴을 직접 호출해도 명시적 토큰 부재 에러가 반환된다.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const enabled = new Set<string>(enabledChannels());
  return {
    tools: TOOLS.filter((tool) => {
      const channel = SNS_CHANNEL_BY_TOOL[tool.name];
      return channel === undefined || enabled.has(channel);
    }),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const handler = ROUTES[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return await handler(args ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error executing tool "${name}": ${message}` }],
      isError: true,
    };
  }
});

server.onerror = (error) => {
  console.error('[social-flow MCP Error]', error);
};

const gracefulShutdown = async () => {
  console.error('Shutting down social-flow MCP server...');
  await server.close();
  process.exit(0);
};
process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout 은 MCP 프로토콜 전용 — 로그는 stderr 로만
  console.error('social-flow MCP server started');
  const snsEnabled = enabledChannels();
  console.error(
    `Credentials: serpapi key ${config.serpApiKey ? 'set' : 'MISSING (serp_* tools will fail)'}, ` +
      `naver keys ${config.naverClientId && config.naverClientSecret ? 'set' : 'MISSING (naver_search will fail)'}, ` +
      `data.go.kr key ${config.dataGoKrApiKey ? 'set' : 'MISSING (datago_file_fetch/datago_api_call will fail — search/detail/download still work)'}, ` +
      `gemini key ${config.geminiApiKey ? 'set' : 'MISSING (veo_* video generation tools will fail)'}, ` +
      `openai key ${config.openaiApiKey ? 'set' : 'MISSING (gpt_image_* image generation tools will fail)'}, ` +
      `sns channels ${snsEnabled.length > 0 ? snsEnabled.join(',') : 'none'} (credential files found — others hidden from ListTools)`,
  );
}

main().catch((error) => {
  console.error('Failed to start social-flow MCP server:', error);
  process.exit(1);
});
