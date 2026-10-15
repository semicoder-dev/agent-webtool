import { expect, test } from "bun:test";
import { Client, InMemoryTransport, type Tool } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createMcpServer } from "../bin/mcp.ts";
import { fetchOutputSchema, searchOutputSchema } from "../bin/mcp-schemas.ts";
import { ENGINE_NAMES, collectedSources } from "../src/index.ts";
import { getPackageVersion } from "../src/version.ts";
import { legacyProtocols, McpPeer, modernProtocol } from "./mcp-peer.mjs";

const fixture = new URL("./helpers/mcp-fixture.ts", import.meta.url).pathname;
const start = (tools = "fetch,search") => new McpPeer(process.execPath, [fixture, tools]);
const search = (peer: McpPeer, query = "bun", engines: string[] = ["duckduckgo"]) =>
  peer.request("tools/call", { name: "web_search", arguments: { query, engines } });
const fetchPage = (peer: McpPeer, url = "https://example.com/page") =>
  peer.request("tools/call", { name: "web_fetch", arguments: { url } });

for (const version of [modernProtocol, ...legacyProtocols]) {
  test("MCP stdio discovery, schemas and results: " + version, async () => {
    const peer = start();
    try {
      const init = await peer.initialize(version);
      const modern = version === modernProtocol;
      if (modern) {
        expect(init.supportedVersions).toContain(modernProtocol);
        expect(init.resultType).toBe("complete");
        expect(init._meta["io.modelcontextprotocol/serverInfo"].version).toBe(getPackageVersion());
        expect(init.ttlMs).toBe(0);
        expect(init.cacheScope).toBe("private");
      } else {
        expect(init.protocolVersion).toBe(version);
        expect(init.serverInfo.version).toBe(getPackageVersion());
        expect(init.resultType).toBeUndefined();
      }
      expect(init.capabilities.tools.listChanged).toBe(false);
      const list = await peer.request("tools/list");
      expect(list.tools.map((tool: Tool) => tool.name)).toEqual(["web_fetch", "web_search"]);
      for (const tool of list.tools as Tool[]) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.outputSchema?.type).toBe("object");
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
      }
      expect(list.tools[0].inputSchema.required).toEqual(["url"]);
      expect(list.tools[0].inputSchema.properties.format.default).toBe("markdown");
      expect(list.tools[0].inputSchema.properties.url.description).toBe("The URL to fetch");
      expect(list.tools[1].inputSchema.required).toEqual(["query"]);
      expect(list.tools[1].inputSchema.properties.timeoutMs.default).toBe(3000);

      const page = await fetchPage(peer);
      const output = fetchOutputSchema.parse(page.structuredContent);
      expect(output.text).toContain("# Hello");
      expect(page.content).toEqual([{ type: "text", text: output.text }]);
      const result = await search(peer);
      const data = searchOutputSchema.parse(result.structuredContent);
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0]!.id).toBe(2); // fetch and search use the same source context
      expect(data.engines[0]).toMatchObject({ engine: "duckduckgo", status: "success" });
      expect(result.content).toEqual([{ type: "text", text: data.text }]);
      expect(result.resultType).toBe(modern ? "complete" : undefined);
      expect(peer.stderr).toContain('"timeoutMs":30000');
      expect(peer.stderr).toContain('"timeoutMs":3000');
    } finally {
      await peer.close();
    }
  });
}

for (const version of [modernProtocol, "2025-11-25"]) {
  test("MCP errors, filters and engine statuses: " + version, async () => {
    const peer = start();
    try {
      await peer.initialize(version);
      for (const [name, args] of [
        ["web_fetch", {}],
        ["web_fetch", { url: "https://example.com/", unknown: true }],
        ["web_fetch", { url: "https://example.com/", maxBytes: 0 }],
        ["web_search", { query: "" }],
        ["web_search", { query: "bun", engines: ["missing"] }],
        ["web_search", { query: "bun", unknown: true }],
      ] as const) {
        const error = await peer.request("tools/call", { name, arguments: args });
        expect(error.isError).toBe(true);
        expect(error.content[0].text).toContain("Input validation error");
        expect(error.structuredContent).toBeUndefined();
      }
      expect(peer.stderr).not.toContain("fetch:");
      await expect(
        peer.request("tools/call", { name: "unknown", arguments: {} }),
      ).rejects.toMatchObject({ code: -32602 });
      const failure = await fetchPage(peer, "https://example.com/fixture-fail");
      expect(failure.isError).toBe(true);
      expect(failure.content).toEqual([{ type: "text", text: "fixture network failure" }]);
      expect(failure.structuredContent).toBeUndefined();

      const defaults = await peer.request("tools/call", {
        name: "web_search",
        arguments: { query: "bun" },
      });
      expect(
        searchOutputSchema.parse(defaults.structuredContent).engines.map((entry) => entry.engine),
      ).toEqual([...ENGINE_NAMES]);
      for (const [query, status] of [
        ["fixture-empty", "no_results"],
        ["fixture-fail", "error"],
        ["zzzzunrelated", "invalid_results"],
      ] as const) {
        const result = await search(peer, query);
        const data = searchOutputSchema.parse(result.structuredContent);
        expect(result.isError).not.toBe(true);
        expect(data.results).toEqual([]);
        expect(data.engines[0]!.status).toBe(status);
        expect(data.text).toContain("No results.");
      }
      const partial = await search(peer, "bun fixture-partial", ["baidu", "duckduckgo"]);
      const data = searchOutputSchema.parse(partial.structuredContent);
      expect(partial.isError).not.toBe(true);
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.engines.map((entry) => entry.status)).toEqual(["error", "success"]);
    } finally {
      await peer.close();
    }

    for (const enabled of ["fetch", "search"]) {
      const filtered = start(enabled);
      try {
        await filtered.initialize(version);
        expect((await filtered.request("tools/list")).tools.map((tool: Tool) => tool.name)).toEqual(
          ["web_" + enabled],
        );
        await expect(
          filtered.request("tools/call", {
            name: enabled === "fetch" ? "web_search" : "web_fetch",
            arguments: {},
          }),
        ).rejects.toMatchObject({ code: -32602 });
      } finally {
        await filtered.close();
      }
    }
  });

  test("MCP concurrent calls keep per-connection source identities: " + version, async () => {
    const a = start(),
      b = start();
    try {
      await Promise.all([a.initialize(version), b.initialize(version)]);
      const results = await Promise.all([search(a, "alpha"), search(a, "beta")]);
      const [alpha, beta] = results.map((result) =>
        searchOutputSchema.parse(result.structuredContent),
      );
      expect(alpha!.results.map((row) => row.url)).toEqual(["https://example.com/alpha"]);
      expect(beta!.results.map((row) => row.url)).toEqual(["https://example.com/beta"]);
      expect(new Set([alpha!.results[0]!.id, beta!.results[0]!.id])).toEqual(new Set([1, 2]));
      await fetchPage(a, alpha!.results[0]!.url);
      const repeated = searchOutputSchema.parse((await search(a, "alpha")).structuredContent);
      expect(repeated.results[0]).toMatchObject({ id: alpha!.results[0]!.id, fetched: true });
      const other = searchOutputSchema.parse((await search(b, "alpha")).structuredContent);
      expect(other.results[0]).toMatchObject({ id: 1, fetched: false });
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });

  for (const tool of ["fetch", "search"]) {
    test("MCP cancels in-flight " + tool + ": " + version, async () => {
      const peer = start();
      try {
        await peer.initialize(version);
        const pending =
          tool === "fetch"
            ? fetchPage(peer, "https://example.com/fixture-wait")
            : search(peer, "fixture-wait");
        const stopped = pending.catch((error: Error) => error);
        const id = peer.lastId;
        await peer.waitForStderr("started:");
        peer.cancel(id);
        await peer.waitForStderr("aborted:");
        expect(await stopped).toBeInstanceOf(Error);
        const result = searchOutputSchema.parse((await search(peer, "alpha")).structuredContent);
        expect(result.results[0]!.id).toBe(1);
        expect(peer.messages.some((message: { id?: number }) => message.id === id)).toBe(false);
      } finally {
        await peer.close();
      }
    });
  }

  for (const shutdown of ["EOF", "SIGINT", "SIGTERM"] as const) {
    test("MCP " + shutdown + " aborts work and exits: " + version, async () => {
      const peer = start();
      try {
        await peer.initialize(version);
        const stopped = fetchPage(peer, "https://example.com/fixture-wait").catch(
          (error: Error) => error,
        );
        const id = peer.lastId;
        await peer.waitForStderr("started:");
        if (shutdown === "EOF") peer.child.stdin.end();
        else peer.child.kill(shutdown);
        await peer.waitForExit();
        expect(peer.stderr).toContain("aborted:");
        expect(await stopped).toBeInstanceOf(Error);
        expect(peer.messages.some((message: { id?: number }) => message.id === id)).toBe(false);
      } finally {
        await peer.close();
      }
    });
  }
}

test("a discovery probe can fall back to legacy without losing shutdown handlers", async () => {
  const peer = start();
  try {
    await peer.initialize(modernProtocol);
    const initialized = await peer.initialize("2025-11-25");
    expect(initialized.protocolVersion).toBe("2025-11-25");
    const stopped = fetchPage(peer, "https://example.com/fixture-wait").catch(
      (error: Error) => error,
    );
    const id = peer.lastId;
    await peer.waitForStderr("started:");
    peer.child.kill("SIGTERM");
    await peer.waitForExit();
    expect(peer.stderr).toContain("aborted:");
    expect(await stopped).toBeInstanceOf(Error);
    expect(peer.messages.some((message: { id?: number }) => message.id === id)).toBe(false);
  } finally {
    await peer.close();
  }
});

test("v2 client automatically negotiates modern stdio", async () => {
  const client = new Client(
    { name: "auto-client", version: "1" },
    {
      versionNegotiation: { mode: "auto", probe: { timeoutMs: 2000 } },
    },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixture],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    expect(client.getProtocolEra()).toBe("modern");
    expect((await client.listTools()).tools).toHaveLength(2);
    const result = await client.callTool({
      name: "web_search",
      arguments: { query: "alpha", engines: ["duckduckgo"] },
    });
    expect(searchOutputSchema.parse(result.structuredContent).results[0]!.id).toBe(1);
  } finally {
    await client.close();
  }
});

test("server factories isolate source state from other servers and SDK callers", async () => {
  const before = collectedSources();
  const peers = await Promise.all(
    [0, 1].map(async () => {
      const server = createMcpServer(
        { tools: ["fetch", "search"] },
        {
          fetch: async (url) => ({
            finalUrl: url,
            status: 200,
            contentType: "text/html",
            body: new TextEncoder().encode(
              '<title>Factory</title><div class="result"><a class="result__a" href="https://example.com/factory">alpha</a></div>',
            ).buffer,
          }),
        },
      );
      const client = new Client({ name: "factory-test", version: "1" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      return { client, server };
    }),
  );
  try {
    const [a] = peers;
    await a!.client.callTool({
      name: "web_fetch",
      arguments: { url: "https://example.com/factory-preload" },
    });
    const results = await Promise.all(
      peers.map(async ({ client }) => {
        const result = await client.callTool({
          name: "web_search",
          arguments: { query: "alpha", engines: ["duckduckgo"] },
        });
        return searchOutputSchema.parse(result.structuredContent).results[0]!;
      }),
    );
    expect(results.map((result) => result.id)).toEqual([2, 1]);
    expect(collectedSources()).toEqual(before);
  } finally {
    await Promise.all(
      peers.map(async ({ client, server }) => {
        await client.close();
        await server.close();
      }),
    );
  }
});
