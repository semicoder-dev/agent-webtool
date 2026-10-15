import { McpServer } from "@modelcontextprotocol/server";
import {
  serveStdio,
  StdioServerTransport,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";
import { createSourceContext, webFetch, webSearch, type FetchDeps } from "../src/index.ts";
import { fetchInputSchema, searchInputSchema } from "../src/schemas.ts";
import { getPackageVersion } from "../src/version.ts";
import { fetchOutputSchema, searchOutputSchema } from "./mcp-schemas.ts";

export interface McpOptions {
  tools: Array<"fetch" | "search">;
}

// Internal fixture seam; never exposed as a CLI option or an SDK package export.
type McpDeps = Pick<FetchDeps, "fetch">;

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export function createMcpServer(opts: McpOptions, deps: McpDeps = {}): McpServer {
  const sources = createSourceContext();
  const server = new McpServer(
    { name: "webtool", version: getPackageVersion() },
    {
      capabilities: { tools: { listChanged: false } },
      instructions:
        "Exposes web_fetch (fetch a URL → markdown/text/html) and web_search " +
        "(parallel multi-engine search with citation [n] ids stable within this connection). " +
        "Tools return readable text and matching structured results. " +
        "No API keys required.",
    },
  );

  if (opts.tools.includes("fetch")) {
    server.registerTool(
      "web_fetch",
      {
        title: "Fetch a web page",
        description:
          "Fetch a URL and return its content as text and structuredContent.text. Default format is markdown " +
          "(HTML is converted via turndown). HTTP is auto-upgraded to HTTPS. Same-origin " +
          "redirects are followed; cross-origin redirects are reported in the output. " +
          'Private IPs are rejected. Use format="html" for raw HTML, "text" for plain text.',
        inputSchema: fetchInputSchema,
        outputSchema: fetchOutputSchema,
        annotations,
      },
      async (args, ctx) => {
        const text = await webFetch(args, { ...deps, sources, signal: ctx.mcpReq.signal });
        return { content: [{ type: "text", text }], structuredContent: { text } };
      },
    );
  }

  if (opts.tools.includes("search")) {
    server.registerTool(
      "web_search",
      {
        title: "Search the web across multiple engines",
        description:
          "Run a search query concurrently across Baidu, WeChat (Sogou), Toutiao, and DuckDuckGo. " +
          "Results are relevance-checked, deduplicated by normalized URL, ranked via Reciprocal " +
          "Rank Fusion, and returned as citation lines ([n] title + URL + snippet) alongside " +
          "structured text, results, and per-engine status.",
        inputSchema: searchInputSchema,
        outputSchema: searchOutputSchema,
        annotations,
      },
      async (args, ctx) => {
        const result = await webSearch(args, { ...deps, sources, signal: ctx.mcpReq.signal });
        return { content: [{ type: "text", text: result.text }], structuredContent: result };
      },
    );
  }

  return server;
}

export function runMcpServer(opts: McpOptions, deps: McpDeps = {}): StdioServerHandle {
  const reportError = (error: unknown) => {
    process.stderr.write(`MCP: ${error instanceof Error ? error.message : String(error)}\n`);
  };
  const cleanup = () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
  const transport = new StdioServerTransport();
  const handle = serveStdio(() => createMcpServer(opts, deps), { transport, onerror: reportError });
  // A discover probe can be discarded before a legacy initialize. Only the
  // actual connection closing should remove the process shutdown handlers.
  const onclose = transport.onclose;
  transport.onclose = () => {
    cleanup();
    onclose?.();
  };
  const close = async () => {
    cleanup();
    await handle.close();
  };
  const shutdown = () => {
    void close().catch((error) => {
      reportError(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return { close };
}
