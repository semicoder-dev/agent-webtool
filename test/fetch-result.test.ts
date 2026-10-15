import { beforeEach, expect, test } from "bun:test";
import { clearFetchCache, createSourceContext, webFetch, webFetchResult } from "../src/index";
import { fetchWithGuards, MAX_HTTP_CONTENT_LENGTH } from "../src/core/http";

beforeEach(clearFetchCache);
const page = (status = 200) => ({
  finalUrl: "https://example.com/final",
  status,
  contentType: "text/html; charset=utf-8",
  body: new TextEncoder().encode("<title>Page</title><p>Body</p>").buffer,
});

test("structured fetch preserves HTTP errors, final URL and cache metadata without shared mutation", async () => {
  let calls = 0;
  const deps = {
    fetch: async () => {
      calls++;
      return page(404);
    },
    sources: createSourceContext(),
  };
  const first = await webFetchResult({ url: "https://example.com/" }, deps);
  expect(first).toMatchObject({
    status: 404,
    finalUrl: "https://example.com/final",
    title: "Page",
    text: "Body",
    truncated: false,
  });
  first.title = "mutated";
  const sources = createSourceContext();
  expect(await webFetchResult({ url: "https://example.com/" }, { ...deps, sources })).toMatchObject(
    { title: "Page", status: 404 },
  );
  expect(sources.snapshot()[0]?.id).toBe(1);
  expect(await webFetch({ url: "https://example.com/" }, deps)).toBe("Body");
  expect(calls).toBe(1);
});

test("redirect and truncation are structured and cancelled cache reads do not register sources", async () => {
  const redirect = { from: "https://example.com/", to: "https://other.example/", status: 302 };
  const result = await webFetchResult(
    { url: redirect.from },
    { fetch: async () => ({ ...page(302), redirect }) },
  );
  expect(result.redirect).toEqual(redirect);
  expect(result.text).toContain("Call web_fetch again");
  expect(
    (
      await webFetchResult(
        { url: "https://example.com/large", maxBytes: 2 },
        { fetch: async () => page() },
      )
    ).truncated,
  ).toBe(true);
  const sources = createSourceContext();
  await expect(
    webFetchResult({ url: redirect.from }, { signal: AbortSignal.abort(), sources }),
  ).rejects.toThrow();
  expect(sources.snapshot()).toEqual([]);
});

test("body limit cancels chunked streams before reading the complete response", async () => {
  let reads = 0,
    cancelled = false;
  const response = new Response(
    new ReadableStream(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
  );
  await expect(
    fetchWithGuards(
      "https://example.com",
      {},
      { resolveHost: async () => {}, fetch: async () => response },
    ),
  ).rejects.toMatchObject({ code: "too_large" });
  expect(reads).toBe(MAX_HTTP_CONTENT_LENGTH / 1024 / 1024 + 1);
  expect(cancelled).toBe(true);
});

test("DNS cancellation and timeout return promptly without starting HTTP", async () => {
  let requests = 0;
  const deps = {
    resolveHost: () => new Promise<void>(() => {}),
    fetch: async () => {
      requests++;
      return new Response("unexpected");
    },
  };
  const ctrl = new AbortController();
  const pending = fetchWithGuards("https://example.com", { signal: ctrl.signal }, deps);
  ctrl.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    fetchWithGuards("https://example.com", { timeoutMs: 5 }, deps),
  ).rejects.toMatchObject({ code: "timeout" });
  expect(requests).toBe(0);
});

test("body timeout cancels stalled reads and redirect responses release their bodies", async () => {
  let cancelled = 0;
  const stall = new Response(
    new ReadableStream({
      cancel() {
        cancelled++;
      },
    }),
  );
  await expect(
    fetchWithGuards(
      "https://example.com",
      { timeoutMs: 5 },
      { resolveHost: async () => {}, fetch: async () => stall },
    ),
  ).rejects.toMatchObject({ code: "timeout" });
  const redirect = new Response(
    new ReadableStream({
      cancel() {
        cancelled++;
      },
    }),
    { status: 302, headers: { location: "https://other.example" } },
  );
  const result = await fetchWithGuards(
    "https://example.com",
    {},
    { resolveHost: async () => {}, fetch: async () => redirect },
  );
  expect(result.redirect?.to).toBe("https://other.example/");
  expect(cancelled).toBe(2);
});
