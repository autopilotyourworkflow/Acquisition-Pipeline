/**
 * LinkedIn provider — Apify-backed.
 *
 * Default actor: harvestapi/linkedin-profile-search
 *   https://apify.com/harvestapi/linkedin-profile-search
 *   Pricing: $0.10 per search page (up to 25 profiles) in Short mode,
 *   plus $0.004/profile in Full mode. Override with env var
 *   APIFY_LINKEDIN_ACTOR_ID — but a different actor will likely need a
 *   different input shape; you'd also need to adapt the actorInput
 *   construction below.
 *
 * Input shape per harvestapi docs:
 *   - searchQuery: free-text (keywords + skill names go here)
 *   - currentJobTitles: array of title strings
 *   - locations: array of location strings
 *   - profileScraperMode: "Short" | "Full" | "Full + email search"
 *   - maxItems: cap on results
 *
 * Output shape (Short mode):
 *   { id, publicIdentifier, linkedinUrl, firstName, lastName, headline,
 *     location (object), experience[], education[], skills[] }
 *
 * Endpoint: POST /v2/acts/{actor}/run-sync-get-dataset-items
 *   Returns dataset items inline (no polling). One-time per-account
 *   approval required for harvestapi actors — see Apify console.
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

// harvestapi/linkedin-profile-search pricing in Short mode is $0.10
// per page of up to 25 profiles. Even N=5 still buys one page, so
// the realistic per-call floor is ~$0.10 regardless of N. We charge
// per item conservatively for the cost column ($0.01/profile is a
// safe over-estimate; the page itself is the dominant cost).
const APIFY_COST_PER_ITEM = 0.01;
const NORMALIZE_COST_USD = 0.01; // Haiku per-call cost (input mostly cached)

export type ApifyScraperMode = "Short" | "Full" | "Full + email search";

type LinkedInRunInput = {
  query: DeriveSourcingQueryInput;
  nTarget: number;
  /** Apify API token (passed by orchestrator after decrypting from user_settings). */
  apifyToken: string;
  /** Scraper mode — defaults to Short (cheapest). Full adds per-profile detail. */
  mode?: ApifyScraperMode;
};

/**
 * Apify dataset items shape — modeled on harvestapi/linkedin-profile-search
 * (Short mode) but the fallbacks accommodate other actors with similar
 * outputs. Location may be a parsed object on harvestapi:
 *   { city, country, countryCode, ... }
 */
type ApifyLocation = {
  city?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  fullText?: string;
};

type ApifySearchItem = {
  id?: string;
  publicIdentifier?: string;
  linkedinUrl?: string;
  profileUrl?: string;
  url?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name?: string;
  headline?: string;
  title?: string;
  jobTitle?: string;
  location?: string | ApifyLocation;
  about?: string;
  summary?: string;
  experience?: unknown;
  education?: unknown;
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

  // Compose the actor input. Lessons from real runs:
  //  - searchQuery is fuzzy, but joining 10 keywords with spaces narrows
  //    the result set to near zero. Cap at the top 4 keywords.
  //  - currentJobTitles is a STRICT current-title filter; with 4 titles
  //    AND'd we excluded everyone with "Senior X" or any variant.
  //    Instead fold title hints into searchQuery as soft signals.
  //  - locations is a well-supported typed filter; keep it strict.
  const topKeywords = input.query.keywords.slice(0, 4);
  const titleHints = input.query.titles.slice(0, 2);
  const searchQuery = [...topKeywords, ...titleHints].join(" ").trim();

  const actorInput: Record<string, unknown> = {
    searchQuery,
    profileScraperMode: input.mode ?? "Short",
    maxItems: input.nTarget,
  };
  if (input.query.location) {
    actorInput.locations = [input.query.location];
  }

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

  // harvestapi returns location as a parsed object; other actors return
  // a string. Handle both so we never crash with `[object Object]`.
  const locStr = formatLocation(item.location);
  if (locStr) lines.push(`Location: ${locStr}`);

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

function formatLocation(loc: ApifySearchItem["location"]): string | null {
  if (!loc) return null;
  if (typeof loc === "string") return loc;
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (loc.fullText) return loc.fullText;
  return null;
}
