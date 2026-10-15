import { readFile } from "node:fs/promises";
import { runMcpServer } from "../../bin/mcp.ts";
import type { McpOptions } from "../../bin/mcp.ts";
import type { RawFetchResult } from "../../src/core/http.ts";

function response(url: string, html: string): RawFetchResult {
  return {
    finalUrl: url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: new TextEncoder().encode(html).buffer,
  };
}

runMcpServer(
  { tools: (process.argv[2] ?? "fetch,search").split(",") as McpOptions["tools"] },
  {
    fetch: async (url, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error("Missing MCP cancellation signal");
      signal.throwIfAborted();
      process.stderr.write(
        "fetch:" + JSON.stringify({ url, timeoutMs: options?.timeoutMs }) + "\n",
      );
      if (url.includes("fixture-wait")) {
        return new Promise((_, reject) => {
          // This timer intentionally keeps the child alive until cancellation;
          // EOF/signal tests would hang without propagation to the fetch layer.
          const keepAlive = setInterval(() => {}, 1000);
          signal.addEventListener(
            "abort",
            () => {
              clearInterval(keepAlive);
              process.stderr.write("aborted:" + url + "\n");
              reject(signal.reason);
            },
            { once: true },
          );
          process.stderr.write("started:" + url + "\n");
        });
      }
      if (url.includes("fixture-fail")) throw new Error("fixture network failure");
      if (url.includes("fixture-empty")) return response(url, "<html></html>");
      if (url.includes("fixture-partial") && url.includes("baidu.com")) {
        throw new Error("fixture engine failure");
      }
      const parsed = new URL(url);
      const query = parsed.searchParams.get("q");
      if (query === "alpha" || query === "beta") {
        return response(
          url,
          '<div class="result"><a class="result__a" href="https://example.com/' +
            query +
            '">' +
            query +
            '</a><span class="result__snippet">' +
            query +
            "</span></div>",
        );
      }
      for (const [host, name] of [
        ["baidu.com", "baidu"],
        ["wx.sogou.com", "wechat"],
        ["so.toutiao.com", "toutiao"],
        ["duckduckgo.com", "duckduckgo"],
      ]) {
        if (parsed.hostname.includes(host!)) {
          return response(
            url,
            await readFile(new URL("../fixtures/" + name + ".html", import.meta.url), "utf8"),
          );
        }
      }
      return response(
        url,
        "<title>Fixture page</title><main><h1>Hello</h1><p>Offline page</p></main>",
      );
    },
  },
);
