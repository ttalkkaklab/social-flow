#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { config, disabledToolPatterns, disabledToolsFile, isToolDisabled, listChannelDirs } from './config.js';
import { SNS_PLATFORM_BY_TOOL, TOOLS } from './tools.js';
import { ROUTES } from './handlers.js';
import { enabledPlatforms } from './sns-client.js';
// The server version carried in the initialize response — same value as package.json's version.
// If the two drift, the version clients see stops matching the actual package, so bump this
// line together with package.json (the contract test checks that the two agree).
const server = new Server({ name: 'social-flow', version: '0.13.0' }, { capabilities: { tools: {} } });
// Per-platform publish tools are exposed only for platforms that have a credential file
// (default tokens ∪ channel directories) — this is evaluated per request, so adding a token
// file takes effect without a server restart. Every handler stays registered, so calling a
// hidden tool directly still returns an explicit "no token" error.
// On top of that, <SNS_TOKEN_DIR>/disabled-tools.json turns individual tools off by name
// (trailing "*" covers a family) — also read per request, and CallTool refuses them too.
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const enabled = new Set(enabledPlatforms());
    const disabled = disabledToolPatterns();
    return {
        tools: TOOLS.filter((tool) => {
            if (isToolDisabled(tool.name, disabled))
                return false;
            const platform = SNS_PLATFORM_BY_TOOL[tool.name];
            return platform === undefined || enabled.has(platform);
        }),
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const handler = ROUTES[name];
        // An unknown tool is a protocol error (-32602), not an execution failure (isError) —
        // the MCP two-layer error model: only failures of tools that exist become tool results
        if (!handler)
            throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
        // A tool the operator turned off is refused even when called directly with a
        // stale tool list — hiding it from ListTools alone would not block the call.
        if (isToolDisabled(name, disabledToolPatterns())) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Tool "${name}" is turned off by ${disabledToolsFile}. ` +
                            'Remove its entry (or the family pattern covering it) from that JSON array to re-enable — no server restart needed.',
                    },
                ],
                isError: true,
            };
        }
        return await handler(args ?? {});
    }
    catch (error) {
        if (error instanceof McpError)
            throw error;
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
    // stdout is reserved for the MCP protocol — logs go to stderr only
    console.error('social-flow MCP server started');
    const snsEnabled = enabledPlatforms();
    const channelDirs = listChannelDirs();
    const disabledPatterns = disabledToolPatterns();
    // The hidden count surfaces typos: a pattern matching 0 tools is doing nothing.
    const disabledCount = TOOLS.filter((tool) => isToolDisabled(tool.name, disabledPatterns)).length;
    console.error(`Credentials: serpapi key ${config.serpApiKey ? 'set' : 'MISSING (serp_* and sns_issue_scout tools will fail)'}, ` +
        `naver keys ${config.naverClientId && config.naverClientSecret ? 'set' : 'MISSING (naver_search will fail)'}, ` +
        `data.go.kr key ${config.dataGoKrApiKey ? 'set' : 'MISSING (datago_file_fetch/datago_api_call will fail — search/detail/download still work)'}, ` +
        `gemini key ${config.geminiApiKey ? 'set' : 'MISSING (veo_*/tts_generate/tts_multi_speaker/music_* will fail — tts_local_generate does not need it)'}, ` +
        `openai key ${config.openaiApiKey ? 'set' : 'MISSING (gpt_image_* image generation tools will fail — image_local_generate does not need it)'}, ` +
        `ark key ${config.arkApiKey ? 'set' : 'MISSING (seedance_* video generation tools will fail — veo_* does not need it)'}, ` +
        `local tts python ${process.env.SUPERTONIC_PYTHON ? process.env.SUPERTONIC_PYTHON : 'python3 (default — set SUPERTONIC_PYTHON for a virtualenv)'}, ` +
        `local image mflux ${process.env.MFLUX_ZIMAGE_BIN ? process.env.MFLUX_ZIMAGE_BIN : '~/.local/bin/mflux-generate-z-image-turbo (default — set MFLUX_ZIMAGE_BIN if elsewhere)'}, ` +
        `youtube data key ${config.youtubeApiKey ? 'set' : 'MISSING (youtube_topic_scout falls back to OAuth youtube.readonly)'}, ` +
        `sns platforms ${snsEnabled.length > 0 ? snsEnabled.join(',') : 'none'} (credential files found — others hidden from ListTools), ` +
        `sns channels ${channelDirs.length > 0 ? channelDirs.map((d) => `${d.channel}[${d.platforms.join(',')}]`).join(' ') : 'none (flat/default tokens only)'}, ` +
        `disabled tools ${disabledPatterns.length > 0 ? `${disabledPatterns.join(' ')} → ${disabledCount} hidden (${disabledToolsFile})` : 'none'}`);
}
main().catch((error) => {
    console.error('Failed to start social-flow MCP server:', error);
    process.exit(1);
});
