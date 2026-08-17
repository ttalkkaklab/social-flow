#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { config, listChannelDirs } from './config.js';
import { SNS_PLATFORM_BY_TOOL, TOOLS } from './tools.js';
import { ROUTES } from './handlers.js';
import { enabledPlatforms } from './sns-client.js';

// initialize 응답에 실리는 서버 버전 — package.json 의 version 과 같은 값을 쓴다.
// 둘이 갈라지면 클라이언트가 보는 버전이 실제 패키지와 달라지므로, package.json 을
// 올릴 때 이 줄도 함께 올린다(계약 테스트가 두 값의 일치를 검사한다).
const server = new Server(
  { name: 'social-flow', version: '0.9.0' },
  { capabilities: { tools: {} } },
);

// 플랫폼별 게시 툴은 자격증명 파일이 있는(기본 토큰 ∪ 채널 디렉토리) 플랫폼만
// 노출한다 — 요청 시점 평가라 토큰 파일 추가가 서버 재시작 없이 반영된다.
// 핸들러는 전부 유지되므로 숨은 툴을 직접 호출해도 명시적 토큰 부재 에러가 반환된다.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const enabled = new Set<string>(enabledPlatforms());
  return {
    tools: TOOLS.filter((tool) => {
      const platform = SNS_PLATFORM_BY_TOOL[tool.name];
      return platform === undefined || enabled.has(platform);
    }),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const handler = ROUTES[name];
    // 알 수 없는 툴은 실행 실패(isError)가 아니라 프로토콜 에러(-32602)다 —
    // MCP 2계층 에러 모델: 존재하는 툴의 실패만 툴 결과로 표현한다
    if (!handler) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    return await handler(args ?? {});
  } catch (error) {
    if (error instanceof McpError) throw error;
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
  const snsEnabled = enabledPlatforms();
  const channelDirs = listChannelDirs();
  console.error(
    `Credentials: serpapi key ${config.serpApiKey ? 'set' : 'MISSING (serp_* tools will fail)'}, ` +
      `naver keys ${config.naverClientId && config.naverClientSecret ? 'set' : 'MISSING (naver_search will fail)'}, ` +
      `data.go.kr key ${config.dataGoKrApiKey ? 'set' : 'MISSING (datago_file_fetch/datago_api_call will fail — search/detail/download still work)'}, ` +
      `gemini key ${config.geminiApiKey ? 'set' : 'MISSING (veo_*/tts_generate/tts_multi_speaker/music_* will fail — tts_local_generate does not need it)'}, ` +
      `openai key ${config.openaiApiKey ? 'set' : 'MISSING (gpt_image_* image generation tools will fail — image_local_generate does not need it)'}, ` +
      `local tts python ${process.env.SUPERTONIC_PYTHON ? process.env.SUPERTONIC_PYTHON : 'python3 (default — set SUPERTONIC_PYTHON for a virtualenv)'}, ` +
      `local image mflux ${process.env.MFLUX_ZIMAGE_BIN ? process.env.MFLUX_ZIMAGE_BIN : '~/.local/bin/mflux-generate-z-image-turbo (default — set MFLUX_ZIMAGE_BIN if elsewhere)'}, ` +
      `youtube data key ${config.youtubeApiKey ? 'set' : 'MISSING (youtube_topic_scout falls back to OAuth youtube.readonly)'}, ` +
      `sns platforms ${snsEnabled.length > 0 ? snsEnabled.join(',') : 'none'} (credential files found — others hidden from ListTools), ` +
      `sns channels ${channelDirs.length > 0 ? channelDirs.map((d) => `${d.channel}[${d.platforms.join(',')}]`).join(' ') : 'none (flat/default tokens only)'}`,
  );
}

main().catch((error) => {
  console.error('Failed to start social-flow MCP server:', error);
  process.exit(1);
});
