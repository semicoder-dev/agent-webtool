import { z } from "zod";
import { ENGINE_NAMES } from "../src/core/types.ts";
import type { EngineStatus, SearchResponse, SearchResult } from "../src/core/types.ts";

export const fetchOutputSchema = z.object({ text: z.string() }).strict();

const searchResultSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    score: z.number(),
    engines: z.array(z.enum(ENGINE_NAMES)),
    meta: z.record(z.string(), z.string()),
    id: z.number().int().positive(),
    fetched: z.boolean(),
  })
  .strict() satisfies z.ZodType<SearchResult>;

const engineStatusSchema = z
  .object({
    engine: z.enum(ENGINE_NAMES),
    status: z.enum(["success", "no_results", "invalid_results", "error"]),
    ok: z.boolean(),
    count: z.number().int().nonnegative(),
    rawCount: z.number().int().nonnegative(),
    error: z.string().optional(),
  })
  .strict() satisfies z.ZodType<EngineStatus>;

export const searchOutputSchema = z
  .object({
    text: z.string(),
    results: z.array(searchResultSchema),
    engines: z.array(engineStatusSchema),
  })
  .strict() satisfies z.ZodType<SearchResponse>;
