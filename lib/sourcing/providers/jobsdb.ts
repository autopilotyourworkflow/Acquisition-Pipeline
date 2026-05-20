/**
 * JobsDB provider — SerpAPI Google-search backbone with a Jina Reader
 * fallback when the user hasn't configured SerpAPI.
 *
 * Two paths:
 *   1. SerpAPI: `q=site:jobsdb.com {keywords}` → list of URLs → Jina Reader
 *      fetches each URL's text → normalizeCandidate.
 *   2. No key: synthesize a JobsDB search URL → Jina Reader. Best-effort,
 *      often returns 0 because JobsDB's search results page is JS-rendered.
 *
 * Marked *experimental* in the UI for that reason. Either path may return
 * fewer than nTarget candidates without surfacing an error.
 */

import { normalizeCandidate } from "@/lib/scrape/normalize";
import type {
  ProviderCandidate,
  ProviderResult,
  SourcingPlatform,
} from "@/lib/sourcing/types";
import type { DeriveSourcingQueryInput } from "@/lib/anthropic/tools/derive_sourcing_query";

const PLATFORM: SourcingPlatform = "jobsdb";

const SERPAPI_COST_USD = 0.005;
const JINA_COST_USD = 0;
const NORMALIZE_COST_USD = 0.02; // approx Haiku per-call cost

type JobsDbRunInput = {
  query: DeriveSourcingQueryInput;
  nTarget: number;
  /** Decrypted SerpAPI key, or null/undefined to take the Jina-only path. */
  serpapiKey: string | null;
};

type SerpApiResult = {
  organic_results?: Array<{
    link?: string;
    title?: string;
  }>;
};

export async function runJobsDbSourcing(input: JobsDbRunInput): Promise<ProviderResult> {
  const candidates: ProviderCandidate[] = [];
  let costAccumulated = 0;
  let note: string | undefined;

  try {
    const profileUrls = input.serpapiKey
      ? await searchViaSerpApi(input)
      : await searchViaJinaFallback(input);

    if (input.serpapiKey) {
      costAccumulated += SERPAPI_COST_USD;
      note = "serpapi+jina";
    } else {
      note = profileUrls.length === 0 ? "no_serpapi_key" : "jina_only";
    }

    for (const url of profileUrls.slice(0, input.nTarget)) {
      try {
        const text = await fetchViaJina(url);
        costAccumulated += JINA_COST_USD;
        if (!text || text.trim().length < 100) continue;

        // Hint the normalizer this came from JobsDB so the model doesn't
        // confuse a job listing with a candidate profile.
        const hinted =
          `Source: JobsDB candidate / application page.\nURL: ${url}\n\n${text}`;
        const candidate = await normalizeCandidate({ text: hinted, model: "haiku" });
        candidate.source_url = candidate.source_url ?? url;
        costAccumulated += NORMALIZE_COST_USD;

        candidates.push({
          platform: PLATFORM,
          candidate,
          source_url: url,
          cost_usd: JINA_COST_USD + NORMALIZE_COST_USD,
          note: input.serpapiKey ? "serpapi+jina" : "jina_only",
        });
      } catch {
        continue;
      }
    }

    return {
      platform: PLATFORM,
      candidates,
      cost_usd: costAccumulated,
      note: candidates.length === 0 ? note ?? "no_results" : note,
    };
  } catch (err) {
    return {
      platform: PLATFORM,
      candidates,
      cost_usd: costAccumulated,
      error: err instanceof Error ? err.message : "Unknown JobsDB error",
    };
  }
}

async function searchViaSerpApi(input: JobsDbRunInput): Promise<string[]> {
  if (!input.serpapiKey) return [];
  // Bias to th.jobsdb.com (Thailand) since this is a Thai-market hire,
  // but also accept any jobsdb.com sub-domain so we don't miss results.
  const q = `site:th.jobsdb.com OR site:jobsdb.com ${input.query.keywords.join(" ")}${
    input.query.titles.length > 0 ? ` (${input.query.titles.join(" OR ")})` : ""
  }${input.query.location ? ` ${input.query.location}` : ""}`;
  const params = new URLSearchParams({
    engine: "google",
    q,
    num: String(Math.min(input.nTarget * 2, 20)),
    api_key: input.serpapiKey,
  });
  const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as SerpApiResult;
  return (data.organic_results ?? [])
    .map((r) => r.link)
    .filter((u): u is string => typeof u === "string" && u.includes("jobsdb"));
}

async function searchViaJinaFallback(input: JobsDbRunInput): Promise<string[]> {
  // No reliable JobsDB programmatic search without SerpAPI — we synthesize a
  // search URL and let Jina Reader try to parse it. JobsDB Thailand is the
  // assignment's market, but we try .com (the global router) so other
  // markets still work if HR is sourcing internationally.
  const query = encodeURIComponent(input.query.keywords.join(" "));
  const searchUrl = `https://th.jobsdb.com/jobs?keywords=${query}`;
  const text = await fetchViaJina(searchUrl);
  if (!text) return [];
  // Extract any jobsdb.com URLs we find in the rendered text.
  const urls = Array.from(
    text.matchAll(/https?:\/\/(?:[\w-]+\.)*jobsdb\.com\/[\w\-./?=&%]+/gi),
  ).map((m) => m[0]);
  return Array.from(new Set(urls)).slice(0, input.nTarget * 2);
}

async function fetchViaJina(url: string): Promise<string | null> {
  // Jina Reader: prefix r.jina.ai/ — returns clean text without an API key.
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (acquisition-pipeline) Resume Screener/Phase3d",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
