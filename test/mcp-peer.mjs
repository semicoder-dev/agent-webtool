import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export const modernProtocol = "2026-07-28";
export const legacyProtocols = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
  "2024-10-07",
];

// A deliberately raw peer: SDK readers tolerate non-JSON stdout, so using one
// alone would miss a broken CLI bundle that prints banners into the wire.
export class McpPeer {
  lastId = 0;
  protocolVersion = "";
  messages = [];
  failures = [];
  pending = new Map();
  stderr = "";

  constructor(command, args) {
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stderr.on("data", (data) => {
      this.stderr += data;
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        assert.equal(message.jsonrpc, "2.0");
        assert("id" in message || typeof message.method === "string");
        this.messages.push(message);
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(Object.assign(new Error(message.error.message), message.error));
        else pending.resolve(message.result);
      } catch (error) {
        this.failures.push(error);
        this.rejectPending(error);
      }
    });
    this.child.on("error", (error) => {
      this.failures.push(error);
      this.rejectPending(error);
    });
    this.exited = new Promise((resolve) => {
      this.child.once("close", (code, signal) => {
        this.rejectPending(new Error("MCP closed: " + code + " " + signal + " " + this.stderr));
        resolve({ code, signal });
      });
    });
  }

  rejectPending(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  send(message) {
    if (this.protocolVersion === modernProtocol) {
      message.params = {
        ...message.params,
        _meta: {
          ...message.params?._meta,
          "io.modelcontextprotocol/protocolVersion": modernProtocol,
          "io.modelcontextprotocol/clientInfo": { name: "webtool-test", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      };
    }
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  }

  /** @returns {Promise<any>} */
  request(method, params = {}) {
    const id = ++this.lastId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("MCP request timed out: " + method + "\n" + this.stderr));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  async initialize(protocolVersion) {
    this.protocolVersion = protocolVersion;
    if (protocolVersion === modernProtocol) return this.request("server/discover");
    const result = await this.request("initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "webtool-test", version: "1.0.0" },
    });
    this.send({ method: "notifications/initialized" });
    return result;
  }

  cancel(id) {
    this.send({
      method: "notifications/cancelled",
      params: { requestId: id, reason: "test cancelled" },
    });
    const pending = this.pending.get(id);
    assert(pending, "request must still be pending");
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.reject(new Error("test cancelled"));
  }

  async waitForStderr(text) {
    if (this.stderr.includes(text)) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.child.stderr.off("data", onData);
      };
      const onData = () => {
        if (!this.stderr.includes(text)) return;
        cleanup();
        resolve(undefined);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Missing stderr marker: " + text + "\n" + this.stderr));
      }, 5000);
      this.child.stderr.on("data", onData);
    });
  }

  async waitForExit() {
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 3000);
    try {
      const result = await this.exited;
      assert.deepEqual(result, { code: 0, signal: null }, "MCP must exit cleanly: " + this.stderr);
      assert.deepEqual(this.failures, [], "stdout must contain only JSON-RPC");
    } finally {
      clearTimeout(timer);
      this.lines.close();
    }
  }

  async close() {
    this.child.stdin.end();
    await this.waitForExit();
  }
}
