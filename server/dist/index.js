#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { config, disabledToolPatterns, disabledToolsFile, listChannelDirs } from './config.js';
import { describeToolGate, resolveToolGate, warnUnknownPatterns } from './tool-gate.js';
import { SNS_PLATFORM_BY_TOOL, TOOLS } from './tools.js';
import { ROUTES } from './handlers.js';
import { enabledPlatforms } from './sns-client.js';
import { episodePathArg, isBillableTool, priceOf, recordUsage } from './usage-ledger.js';
// The server version carried in the initialize response — the plugin release, same value as
// package.json's version and the four plugin manifests (skill-lint.js checks that they agree).
// If the two drift, the version clients see stops matching the actual package, so bump this
// line together with package.json (the contract test checks that the two agree).
const server = new Server({ name: 'social-flow', version: '0.48.0' }, { capabilities: { tools: {} } });
// Per-platform publish tools are exposed only for platforms that have a credential file
// (default tokens ∪ channel directories) — this is evaluated per request, so adding a token
// file takes effect without a server restart. Every handler stays registered, so calling a
// hidden tool directly still returns an explicit "no token" error.
// On top of that, env (SOCIAL_FLOW_*) and <SNS_TOKEN_DIR>/disabled-tools.json turn
// individual tools off by name (trailing "*" covers a family) — also read per
// request, and CallTool refuses them too.
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const enabled = new Set(enabledPlatforms());
    const jsonPatterns = disabledToolPatterns();
    return {
        tools: TOOLS.filter((tool) => {
            if (!resolveToolGate(tool.name, { jsonPatterns, jsonFile: disabledToolsFile }).enabled)
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
        const gate = resolveToolGate(name, { jsonPatterns: disabledToolPatterns(), jsonFile: disabledToolsFile });
        if (!gate.enabled) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Tool "${name}" is turned off (${gate.reason}). ` +
                            'Clear the matching SOCIAL_FLOW_* env or remove its entry from disabled-tools.json to re-enable — no server restart needed for the JSON file.',
                    },
                ],
                isError: true,
            };
        }
        // Generation calls write themselves into the episode's ledger. The record is taken here,
        // at the one point every call passes through, so it does not depend on a skill remembering
        // to append a line after the fact (usage-ledger.ts explains where it lands and why).
        // A failed call is recorded too — a retry after a failure can still have been billed.
        if (isBillableTool(name)) {
            const callArgs = (args ?? {});
            const startedAt = Date.now();
            let ok = false;
            try {
                const result = await handler(callArgs);
                ok = !result?.isError;
                return result;
            }
            finally {
                const { key, quantity, note } = priceOf(name, callArgs);
                recordUsage(episodePathArg(callArgs), {
                    ts: new Date().toISOString(),
                    tool: name,
                    ok,
                    ms: Date.now() - startedAt,
                    key,
                    quantity,
                    ...(note ? { note } : {}),
                    detail: {
                        ...(typeof callArgs.model === 'string' ? { model: callArgs.model } : {}),
                        ...(typeof callArgs.resolution === 'string' ? { resolution: callArgs.resolution } : {}),
                        ...(typeof callArgs.durationSeconds === 'number'
                            ? { durationSeconds: callArgs.durationSeconds }
                            : {}),
                        ...(typeof callArgs.quality === 'string' ? { quality: callArgs.quality } : {}),
                        ...(typeof callArgs.filename === 'string' ? { filename: callArgs.filename } : {}),
                    },
                });
            }
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
    const jsonPatterns = disabledToolPatterns();
    const toolNames = TOOLS.map((tool) => tool.name);
    for (const warning of warnUnknownPatterns(toolNames)) {
        console.error(`[social-flow] ${warning}`);
    }
    console.error(`Credentials: serpapi key ${config.serpApiKey ? 'set' : 'MISSING (serp_* and sns_issue_scout tools will fail)'}, ` +
        `naver keys ${config.naverClientId && config.naverClientSecret ? 'set' : 'MISSING (naver_search will fail)'}, ` +
        `data.go.kr key ${config.dataGoKrApiKey ? 'set' : 'MISSING (datago_file_fetch/datago_api_call will fail — search/detail/download still work)'}, ` +
        `gemini key ${config.geminiApiKey ? 'set' : 'MISSING (veo_*/tts_generate/tts_multi_speaker/music_* will fail — tts_local_generate does not need it)'}, ` +
        `openai key ${config.openaiApiKey ? 'set' : 'MISSING (gpt_image_* image generation tools will fail — image_local_generate does not need it)'}, ` +
        `ark key ${config.arkApiKey ? 'set' : 'MISSING (seedance_* video generation tools will fail — veo_* does not need it)'}, ` +
        `suno key ${config.sunoApiKey ? 'set' : 'MISSING (suno_* will fail — music_*(Lyria) does not need it)'}, ` +
        `elevenlabs key ${config.elevenLabsApiKey ? 'set' : 'MISSING (tts_elevenlabs_* will fail — tts_generate/tts_local_generate do not need it)'}, ` +
        `local tts python ${process.env.SUPERTONIC_PYTHON ? process.env.SUPERTONIC_PYTHON : 'python3 (default — set SUPERTONIC_PYTHON for a virtualenv)'}, ` +
        `local image mflux ${process.env.MFLUX_ZIMAGE_BIN ? process.env.MFLUX_ZIMAGE_BIN : '~/.local/bin/mflux-generate-z-image-turbo (default — set MFLUX_ZIMAGE_BIN if elsewhere)'}, ` +
        `local stt mlx-qwen3-asr ${process.env.QWEN3_ASR_BIN ? process.env.QWEN3_ASR_BIN : '~/.local/bin/mlx-qwen3-asr (default — set QWEN3_ASR_BIN if elsewhere)'}, ` +
        `mlx-serve ${process.env.MLX_SERVE_URL ? process.env.MLX_SERVE_URL : 'http://127.0.0.1:11234 (default — MLX Core.app / mlx-serve; this plugin never launches the app)'}, ` +
        `youtube data key ${config.youtubeApiKey ? 'set' : 'MISSING (youtube_topic_scout falls back to OAuth youtube.readonly)'}, ` +
        `sns platforms ${snsEnabled.length > 0 ? snsEnabled.join(',') : 'none'} (credential files found — others hidden from ListTools), ` +
        `sns channels ${channelDirs.length > 0 ? channelDirs.map((d) => `${d.channel}[${d.platforms.join(',')}]`).join(' ') : 'none (flat/default tokens only)'}, ` +
        describeToolGate(toolNames, process.env, jsonPatterns));
}
main().catch((error) => {
    console.error('Failed to start social-flow MCP server:', error);
    process.exit(1);
});
