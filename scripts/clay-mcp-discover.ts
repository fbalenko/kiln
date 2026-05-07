/**
 * Clay MCP discovery harness.
 *
 * Connects to Clay's MCP server as an outbound MCP client, lists every
 * tool the server advertises, and prints each tool's name + description
 * + input schema. No tool calls are made — pure listing.
 *
 * NOT RUN AS PART OF PHASE 1. The user has not yet clicked "Connect"
 * on Clay's MCP page to generate credentials. Once they have, run:
 *
 *   CLAY_MCP_URL=https://mcp.clay.com/...        \
 *   CLAY_MCP_TOKEN=...                            \
 *   npx tsx scripts/clay-mcp-discover.ts
 *
 * Expected output (one block per tool):
 *
 *   [n/N] tool_name
 *     description: ...
 *     input schema: { ...JSON Schema... }
 *
 * If `CLAY_MCP_URL` resolves to an OAuth-gated endpoint that requires a
 * browser dance (no static bearer token), the connection will fail; the
 * script surfaces that explicitly so we know to switch to a different
 * auth flow before implementation.
 *
 * Dependencies: `@modelcontextprotocol/sdk` is already a transitive
 * dep of `@anthropic-ai/claude-agent-sdk` (^1.29.0) — zero new deps.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const CLAY_MCP_URL = process.env.CLAY_MCP_URL;
const CLAY_MCP_TOKEN = process.env.CLAY_MCP_TOKEN;
// Optional override: "streamable-http" (current MCP transport) or "sse"
// (legacy). Default: streamable-http — Clay's docs reference modern MCP
// clients (Claude Desktop / ChatGPT / Cursor) which speak streamable-HTTP.
const CLAY_MCP_TRANSPORT =
  (process.env.CLAY_MCP_TRANSPORT as "streamable-http" | "sse") ??
  "streamable-http";

async function main() {
  if (!CLAY_MCP_URL) {
    console.error(
      "FATAL: CLAY_MCP_URL is required. Click 'Connect' on Clay's MCP\n" +
        "settings page (https://app.clay.com/settings/mcp) to generate\n" +
        "the workspace endpoint, then re-run with:\n\n" +
        "  CLAY_MCP_URL=<url> CLAY_MCP_TOKEN=<token> npx tsx scripts/clay-mcp-discover.ts",
    );
    process.exit(1);
  }

  const url = new URL(CLAY_MCP_URL);
  const requestInit: RequestInit | undefined = CLAY_MCP_TOKEN
    ? { headers: { Authorization: `Bearer ${CLAY_MCP_TOKEN}` } }
    : undefined;

  const transport =
    CLAY_MCP_TRANSPORT === "sse"
      ? new SSEClientTransport(url, { requestInit })
      : new StreamableHTTPClientTransport(url, { requestInit });

  const client = new Client(
    { name: "kiln-clay-discovery", version: "0.1.0" },
    { capabilities: {} },
  );

  console.log(`→ connecting to ${url.href} via ${CLAY_MCP_TRANSPORT}…`);
  try {
    await client.connect(transport);
  } catch (err) {
    console.error("FATAL: connect failed.");
    console.error("  reason:", err instanceof Error ? err.message : err);
    console.error(
      "\nIf Clay returns 401/403, the bearer-token shape may be wrong\n" +
        "(Clay's MCP could require OAuth 2.1 with a workspace-scoped\n" +
        "access token rather than a static bearer). Surface this in the\n" +
        "plan and try the SSE transport with CLAY_MCP_TRANSPORT=sse.",
    );
    process.exit(1);
  }

  console.log("→ connected. listing tools…\n");
  const { tools } = await client.listTools();

  if (tools.length === 0) {
    console.log("(no tools advertised — the server may require additional");
    console.log("capabilities negotiation or a different OAuth scope.)");
  }

  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    console.log(`[${i + 1}/${tools.length}] ${t.name}`);
    console.log(`  description: ${t.description ?? "(none)"}`);
    console.log(
      `  input schema: ${JSON.stringify(t.inputSchema ?? {}, null, 2)
        .split("\n")
        .map((l, idx) => (idx === 0 ? l : `    ${l}`))
        .join("\n")}`,
    );
    console.log();
  }

  await client.close();
  console.log(
    `\n✓ ${tools.length} tools listed. ` +
      "Paste this output into docs/13-clay-integration-plan.md §1 verbatim.",
  );
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
