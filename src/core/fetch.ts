import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import TurndownService from "turndown";
import { LRUCache } from "./cache.ts";
import { decodeBody, decodeSogouLink } from "./decode.ts";
import { fetchWithGuards, WebtoolError } from "./http.ts";
import { type SourceContext, registerFetchedPage } from "./search.ts";
import type { FetchFormat, FetchInput, FetchResponse } from "./types.ts";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;
const CACHE_MAX_BYTES = 50 * 1024 * 1024;

const STRIP_SELECTORS = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "aside",
  "noscript",
  "form",
  ".nav",
  ".header",
  ".footer",
  ".sidebar",
];

const CONTENT_CANDIDATES = [
  "article",
  "main",
  '[role="main"]',
  "#main-content",
  ".post-content",
  ".entry-content",
  ".markdown-body",
  "#bodyContent",
  "#js_content", // WeChat article body
  ".rich_media_content",
];

const cache = new LRUCache<FetchResponse>({
  maxEntries: CACHE_MAX_ENTRIES,
  maxBytes: CACHE_MAX_BYTES,
  ttlMs: CACHE_TTL_MS,
});

let turndownInstance: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
  }
  return turndownInstance;
}

function looksBinary(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/") ||
    ct.startsWith("font/") ||
    ct.includes("application/pdf") ||
    ct.includes("application/zip") ||
    ct.includes("application/octet-stream")
  );
}

function truncate(s: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(s);
  if (encoded.byteLength <= maxBytes) return s;
  const cut = encoded.slice(0, maxBytes);
  return new TextDecoder("utf-8").decode(cut) + "\n\n[truncated]";
}

/** Pick the main-content node: first candidate with substantial text, else body. */
function extractHost($: CheerioAPI): Cheerio<AnyNode> {
  for (const sel of CONTENT_CANDIDATES) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) return el;
  }
  return $("body").first();
}

function prepareDocument(html: string): { $: CheerioAPI; host: Cheerio<AnyNode> } {
  const $ = cheerio.load(html);
  const host = extractHost($);
  for (const sel of STRIP_SELECTORS) {
    host.find(sel).remove();
  }
  return { $, host };
}

function htmlToText($: CheerioAPI, host: Cheerio<AnyNode>): string {
  const text = host.text() || $.root().text();
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToMarkdown(host: Cheerio<AnyNode>): string {
  return getTurndown().turndown(host.html() ?? "");
}

function extractTitle($: CheerioAPI): string {
  return (
    $("title").first().text().trim() || $("#activity-name, .rich_media_title").first().text().trim()
  );
}

export interface FetchDeps {
  fetch?: typeof fetchWithGuards;
  signal?: AbortSignal;
  /** Citation state for this session; omitted uses the process-wide default. */
  sources?: SourceContext;
}

/** Legacy text API, including the existing human-readable redirect message. */
export async function webFetch(raw: FetchInput, deps: FetchDeps = {}): Promise<string> {
  return (await webFetchResult(raw, deps)).text;
}

/** Fetch a page with metadata; each returned object is independent of the cache. */
export async function webFetchResult(
  raw: FetchInput,
  deps: FetchDeps = {},
): Promise<FetchResponse> {
  deps.signal?.throwIfAborted();
  const format: FetchFormat = raw.format ?? "markdown";
  const maxBytes = raw.maxBytes ?? 100_000;
  const timeoutMs = raw.timeoutMs ?? 30_000;
  const cacheKey = `${raw.url}::${format}::${maxBytes}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    if (!cached.redirect) registerFetchedPage(raw.url, cached.title, deps.sources);
    return structuredClone(cached);
  }

  const fetcher = deps.fetch ?? fetchWithGuards;
  let result = await fetcher(raw.url, { timeoutMs, redirect: "same-origin", signal: deps.signal });
  deps.signal?.throwIfAborted();
  // Sogou /link is a supported JS redirect stub, not a rendered browser page.
  if (!result.redirect) {
    const html = decodeBody(result);
    const real = decodeSogouLink(result.finalUrl, html) ?? decodeSogouLink(raw.url, html);
    if (real && real !== result.finalUrl) {
      result = await fetcher(real, { timeoutMs, redirect: "same-origin", signal: deps.signal });
      deps.signal?.throwIfAborted();
    }
  }

  let response: FetchResponse;
  if (result.redirect) {
    response = {
      url: raw.url,
      finalUrl: result.finalUrl,
      status: result.status,
      contentType: result.contentType,
      title: "",
      format,
      truncated: false,
      text:
        `[Redirected to a different host: ${result.redirect.to}]\n` +
        `[Call web_fetch again with the redirect URL to follow.]`,
      redirect: { ...result.redirect },
    };
  } else {
    if (looksBinary(result.contentType) && format !== "html") {
      throw new WebtoolError(
        "binary_content",
        `Binary content (${result.contentType}, ${result.body.byteLength}B) cannot be converted to ${format}. ` +
          `Use format="html" to fetch raw bytes if you need them.`,
      );
    }
    const isHtml = result.contentType.toLowerCase().includes("text/html");
    const html = decodeBody(result);
    let text: string;
    if (format === "html" || !isHtml) text = html;
    else {
      const { $, host } = prepareDocument(html);
      text = format === "text" ? htmlToText($, host) : htmlToMarkdown(host);
    }
    response = {
      url: raw.url,
      finalUrl: result.finalUrl,
      status: result.status,
      contentType: result.contentType,
      title: isHtml ? extractTitle(cheerio.load(html)) : "",
      format,
      truncated: new TextEncoder().encode(text).byteLength > maxBytes,
      text: truncate(text, maxBytes),
    };
  }
  deps.signal?.throwIfAborted();
  if (!response.redirect) registerFetchedPage(raw.url, response.title, deps.sources);
  cache.set(cacheKey, response, new TextEncoder().encode(JSON.stringify(response)).byteLength);
  return structuredClone(response);
}

export function clearFetchCache(): void {
  cache.clear();
}
