import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { legacyProtocols, McpPeer, modernProtocol } from "./mcp-peer.mjs";

const require = createRequire(import.meta.url);
const pkg = require("agent-webtool/package.json");
const packageRoot = dirname(require.resolve("agent-webtool/package.json"));
const binary = resolve(packageRoot, pkg.bin.webtool);
for (const name of ["agent-webtool", "webtool"]) {
  const output = execFileSync(
    process.execPath,
    [resolve(packageRoot, pkg.bin[name]), "--version"],
    { encoding: "utf8", timeout: 10_000 },
  );
  assert.equal(output.trim(), pkg.version);
}

async function checkMcp(version, args, names) {
  const peer = new McpPeer(process.execPath, [binary, "mcp", ...args]);
  try {
    const modern = version === modernProtocol;
    const initialized = await peer.initialize(version);
    if (modern) {
      assert(initialized.supportedVersions.includes(version));
      assert.equal(initialized.resultType, "complete");
      assert.equal(initialized._meta["io.modelcontextprotocol/serverInfo"].version, pkg.version);
      assert.equal(initialized.ttlMs, 0);
      assert.equal(initialized.cacheScope, "private");
    } else {
      assert.equal(initialized.protocolVersion, version);
      assert.equal(initialized.serverInfo.version, pkg.version);
      assert.equal(initialized.resultType, undefined);
    }
    assert.equal(initialized.capabilities.tools.listChanged, false);
    const list = await peer.request("tools/list");
    assert.deepEqual(list.tools.map((tool) => tool.name).sort(), [...names].sort());
    for (const tool of list.tools) {
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.equal(tool.outputSchema.type, "object");
      assert.equal(tool.outputSchema.properties.text.type, "string");
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.openWorldHint, true);
      assert.equal(tool.annotations.idempotentHint, true);
      if (tool.name === "web_search") {
        assert.equal(tool.outputSchema.properties.results.type, "array");
        assert.equal(tool.outputSchema.properties.engines.type, "array");
      }
      const invalid = await peer.request("tools/call", {
        name: tool.name,
        arguments:
          tool.name === "web_fetch"
            ? { url: "file:///not-a-network-request", unknown: true }
            : { query: "offline", unknown: true },
      });
      assert.equal(invalid.isError, true);
      assert(invalid.content[0].text.includes("Input validation error"));
      assert.equal(invalid.structuredContent, undefined);
      assert.equal(invalid.resultType, modern ? "complete" : undefined);
    }
    if (names.includes("web_fetch")) {
      const invalid = await peer.request("tools/call", {
        name: "web_fetch",
        arguments: { url: "file:///not-a-network-request" },
      });
      assert.equal(invalid.isError, true);
      assert(invalid.content.some((item) => item.type === "text"));
      assert(!invalid.content[0].text.includes("Input validation error"));
    }
    const missing =
      names.length === 1 ? (names[0] === "web_fetch" ? "web_search" : "web_fetch") : "unknown";
    await assert.rejects(peer.request("tools/call", { name: missing, arguments: {} }), {
      code: -32602,
    });
    assert.equal(peer.stderr, "");
  } finally {
    await peer.close();
  }
}

for (const version of [modernProtocol, ...legacyProtocols]) {
  await checkMcp(version, [], ["web_fetch", "web_search"]);
}
for (const version of [modernProtocol, legacyProtocols[0]]) {
  await checkMcp(version, ["--tools", "fetch"], ["web_fetch"]);
  await checkMcp(version, ["--tools", "search"], ["web_search"]);
}
console.log(
  "Packaged CLI aliases and modern/legacy MCP discovery, schemas, filtering, errors and EOF passed",
);
