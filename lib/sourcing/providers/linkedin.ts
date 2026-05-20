/**
 * LinkedIn provider — Apify-backed.
 *
 * We use Apify's marketplace actors instead of Proxycurl: free $5/month
 * credit, no payment-up-front friction, and same JSON-structured output.
 *
 * Actor: harvestapi~linkedin-profile-search (default)
 *   Override with env var APIFY_LINKEDIN_ACTOR_ID if you prefer a
 *   different actor — input shape `{ queries, maxItems }` is consistent
 *   across most LinkedIn search actors on Apify.
 *
 * Endpoint: POST /v2/acts/{actor}/run-sync-get-dataset-items
 *   Returns the dataset items inline (no polling). Apify charges only
 *   for the items actually returned.
 */

import { normalizeCandidate } from "@/lib/scrape/normalize";
import type {
  ProviderCandidate,
  ProviderResult,
  SourcingPlatform,
} from "@/lib/sourcing/types";
import type { DeriveSourcingQueryInput } from "@/lib/anthropic/tools/derive_sourcing_query";

const PLATFORM: SourcingPlatform = "linkedin";

const APIFY_ACTOR_ID =
  process.env.APIFY_LINKEDIN_ACTOR_ID || "harvestapi~linkedin-profile-search";

// Apify charges per item returned. The exact rate depends on the actor;
// $0.02–$0.04 per profile is typical for LinkedIn search actors. We
// record a conservative estimate so the sourcing_runs.cost_usd column
// reflects approximate real spend.
const APIFY_COST_PER_ITEM = 0.04;
const NORMALIZE_COST_USD = 0.01; // Haiku per-call cost (input mostly cached)

type LinkedInRunInput = {
  query: DeriveSourcingQueryInput;
  nTarget: number;
  /** Apify API token (passed by orchestrator after decrypting from user_settings). */
  apifyToken: string;
};

/**
 * Apify dataset items vary in shape across actors but most LinkedIn
 * search actors return at least these fields. We're defensive about
 * what we read and let Haiku do the heavy lifting of structuring it.
 */
type ApifySearchItem = {
  url?: string;
  linkedinUrl?: string;
  profileUrl?: string;
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  title?: string;
  jobTitle?: string;
  location?: string;
  about?: string;
  summary?: string;
  experience?: unknown;
  skills?: unknown;
  [key: string]: unknown;
};

export async function runLinkedInSourcing(input: LinkedInRunInput): Promise<ProviderResult> {
  if (!input.apifyToken) {
    return {
      platform: PLATFORM,
      candidates: [],
      cost_usd: 0,
      note: "no_apify_token",
    };
  }

  const candidates: ProviderCandidate[] = [];
  let costAccumulated = 0;

  // Compose the search query — Apify LinkedIn actors usually accept a
  // plain free-text `queries` array. Splice in titles + location if we
  // have them; the actor's own ranker handles the rest.
  const queryString = [
    ...input.query.keywords,
    ...(input.query.titles.length > 0 ? [`(${input.query.titles.join(" OR ")})`] : []),
    input.query.location ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  const actorInput = {
    queries: [queryString],
    keywords: queryString,
    maxItems: input.nTarget,
    maxResults: input.nTarget,
  };

  const apifyUrl =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(input.apifyToken)}`;

  let items: ApifySearchItem[] = [];
  try {
    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        platform: PLATFORM,
        candidates: [],
        cost_usd: 0,
        error: `Apify error ${res.status}: ${errText.slice(0, 200) || res.statusText}`,
      };
    }

    const data = (await res.json()) as unknown;
    if (Array.isArray(data)) {
      items = data as ApifySearchItem[];
    } else if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
      items = (data as { items: ApifySearchItem[] }).items;
    } else {
      items = [];
    }
  } catch (err) {
    return {
      platform: PLATFORM,
      candidates: [],
      cost_usd: 0,
      error: err instanceof Error ? err.message : "Apify request failed",
    };
  }

  costAccumulated += items.length * APIFY_COST_PER_ITEM;

  // Each item → normalize via Haiku → ProviderCandidate.
  for (const item of items.slice(0, input.nTarget)) {
    const profileUrl =
      item.linkedinUrl ?? item.profileUrl ?? item.url ?? null;
    const formattedText = formatApifyItem(item, profileUrl);

    try {
      const candidate = await normalizeCandidate({
        text: formattedText,
        model: "haiku",
      });
      // Carry the LinkedIn URL through even if the normalize pass missed it.
      candidate.linkedin_url = candidate.linkedin_url ?? profileUrl;
      candidate.source_url = candidate.source_url ?? profileUrl;
      costAccumulated += NORMALIZE_COST_USD;

      candidates.push({
        platform: PLATFORM,
        candidate,
        source_url: profileUrl,
        cost_usd: APIFY_COST_PER_ITEM + NORMALIZE_COST_USD,
        note: "apify_search",
      });
    } catch {
      // Skip individual normalize failures
      continue;
    }
  }

  return {
    platform: PLATFORM,
    candidates,
    cost_usd: costAccumulated,
    note: candidates.length === 0 ? "no_results" : "apify_search",
  };
}

function formatApifyItem(item: ApifySearchItem, profileUrl: string | null): string {
  const lines: string[] = [];
  lines.push("Source: LinkedIn (via Apify search)");
  if (profileUrl) lines.push(`Profile URL: ${profileUrl}`);

  const name =
    item.fullName ??
    item.name ??
    ([item.firstName, item.lastName].filter(Boolean).join(" ") || null);
  if (name) lines.push(`Full Name: ${name}`);

  const title = item.headline ?? item.title ?? item.jobTitle ?? null;
  if (title) lines.push(`Current Title: ${title}`);

  if (item.location) lines.push(`Location: ${item.location}`);

  const about = item.summary ?? item.about ?? null;
  if (about && typeof about === "string") {
    lines.push(`\nAbout:\n${about}`);
  }

  if (Array.isArray(item.experience)) {
    lines.push("\nExperience:");
    for (const exp of item.experience as Array<Record<string, unknown>>) {
      const company = exp.company ?? exp.companyName ?? "Unknown";
      const expTitle = exp.title ?? exp.position ?? "";
      lines.push(`- ${expTitle} at ${company}${exp.duration ? ` (${exp.duration})` : ""}`);
      if (exp.description) lines.push(`  ${exp.description}`);
    }
  }

  if (Array.isArray(item.skills)) {
    const skillNames = (item.skills as Array<unknown>)
      .map((s) => (typeof s === "string" ? s : (s as { name?: string })?.name))
      .filter(Boolean);
    if (skillNames.length > 0) {
      lines.push(`\nSkills: ${skillNames.join(", ")}`);
    }
  }

  // As a last resort, drop the full item JSON so Haiku can extract anything
  // the typed reads missed. Bounded to avoid massive payloads.
  const raw = JSON.stringify(item).slice(0, 2000);
  lines.push(`\nRaw item (truncated):\n${raw}`);

  return lines.join("\n");
}
