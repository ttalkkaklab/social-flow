# MCP tool contracts

Skills describe the workflow. The bundled Model Context Protocol (MCP) server exposes the tools that perform individual operations. To discover the schemas available in a session, use the host's tool list. Credential files and tool flags can change which tools it returns. The repository README groups the tools by task. [Tool inventory](../README.md#mcp-tools)

## Behavior annotations

The shared presets in `server/src/tools.ts` describe what a call can change. Set the fields for the actual operation. A tool that combines several actions may describe its behavior separately.

| Preset | Use | Read only | Destructive | Idempotent | Open world |
| --- | --- | --- | --- | --- | --- |
| `read` | Look up external data | true | omitted | omitted | true |
| `local` | Read bundled choices or local state | true | omitted | omitted | false |
| `generate` | Generate or download an artifact through a provider | false | false | false | true |
| `generateLocal` | Generate a local artifact on device | false | false | false | false |
| `publish` | Create an external post or reply | false | true | false | true |
| `moderate` | Set external state, such as a moderation flag | false | true | true | true |

A repeated publishing call can create a second post. A metadata update sets a particular value on an existing post. Both affect an external account. The workflow obtains the user's authorization before calling the corresponding tool. [Definitions and presets](../server/src/tools.ts)

## Adding or changing a tool

Describe the inputs and output, the point in the workflow where the skill calls it, and any provider costs or external effects. Use the adapter's constants when defining model and operation choices. On success, return the structured fields declared by the output schema. Report a failed operation as an error and preserve its request ID or receipt where available.

Update the handler and the existing contract tests, rebuild the committed bundle, then run the repository checks. [Handlers](../server/src/handlers.ts) · [Contributing](../CONTRIBUTING.md)
